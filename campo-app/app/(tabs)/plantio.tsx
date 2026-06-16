import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao, type Ciclo } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { C } from '../../constants/colors';

const CULTURAS_VARIEDADE: Record<string, string[]> = {
  soja:   ['TMG 7062 IPRO','M 6410 IPRO','NS 7709 IPRO','DM 65i62 RSF IPRO','SYN 1365i','Outra'],
  milho:  ['DKB 390 PRO3','P3431H','SX 7331H','AG 8088 PRO3','P3340H','Outra'],
  algodao:['TMG 47 B2RF','FM 985 GLTP','IMA CV 690 B2RF','Outra'],
  outros: ['Outra variedade'],
};

type Tela = 'lista' | 'form';

export default function PlantioScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]         = useState<Tela>('lista');
  const [plantios, setPlantios] = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]   = useState<Talhao[]>([]);
  const [ciclos, setCiclos]     = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Form
  const [talhaoId, setTalhaoId] = useState('');
  const [cicloId, setCicloId]   = useState('');
  const [data, setData]         = useState(() => new Date().toISOString().split('T')[0]);
  const [variedade, setVariedade] = useState('');
  const [densidade, setDensidade] = useState('');
  const [espacamento, setEspacamento] = useState('');
  const [areaHa, setAreaHa]     = useState('');
  const [operador, setOperador] = useState('');
  const [maquina, setMaquina]   = useState('');
  const [obs, setObs]           = useState('');
  const [salvando, setSalvando] = useState(false);

  // Pickers
  const [pickerTalhao, setPickerTalhao]     = useState(false);
  const [pickerCiclo, setPickerCiclo]       = useState(false);
  const [pickerVariedade, setPickerVariedade] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: pl }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from('plantios').select('*, talhoes(nome), ciclos(descricao)').eq('fazenda_id', fazendaId).order('data_plantio', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
    ]);
    setPlantios((pl ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function resetForm() {
    setTalhaoId(''); setCicloId(''); setData(new Date().toISOString().split('T')[0]);
    setVariedade(''); setDensidade(''); setEspacamento('');
    setAreaHa(''); setOperador(''); setMaquina(''); setObs('');
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('Campo obrigatório', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('Campo obrigatório', 'Selecione o ciclo.'); return; }
    if (!fazendaId) return;

    setSalvando(true);
    const { offline, error } = await saveOrQueue('plantios', {
      fazenda_id: fazendaId,
      talhao_id: talhaoId,
      ciclo_id: cicloId,
      data_plantio: data,
      variedade: variedade || null,
      densidade_sementes_ha: densidade ? Number(densidade) : null,
      espacamento_cm: espacamento ? Number(espacamento) : null,
      area_plantada_ha: areaHa ? Number(areaHa) : null,
      operador: operador || null,
      maquina: maquina || null,
      obs: obs || null,
    });
    setSalvando(false);

    if (error) { Alert.alert('Erro', error); return; }

    Alert.alert(
      offline ? '📶 Salvo offline' : '✅ Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Plantio registrado com sucesso.',
      [{ text: 'OK', onPress: () => { resetForm(); setTela('lista'); carregar(); } }],
    );
  }

  const cicloSelecionado = ciclos.find(c => c.id === cicloId);
  const variedadesDisponiveis = cicloSelecionado
    ? (CULTURAS_VARIEDADE[cicloSelecionado.cultura.toLowerCase()] ?? CULTURAS_VARIEDADE.outros)
    : [];

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.topTitulo}>Plantios</Text>
        </View>
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} size="large" />
        ) : (
          <FlatList
            data={plantios}
            keyExtractor={r => String(r.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.vazio}>Nenhum plantio registrado.</Text>}
            renderItem={({ item }) => (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.cardTitulo}>🌱 {(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                  <Text style={s.cardData}>{String(item.data_plantio)}</Text>
                </View>
                <Text style={s.cardSub}>{(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}</Text>
                {item.variedade ? <Text style={s.cardDetalhe}>Variedade: {String(item.variedade)}</Text> : null}
                {item.area_plantada_ha ? <Text style={s.cardDetalhe}>Área: {String(item.area_plantada_ha)} ha</Text> : null}
                {item.operador ? <Text style={s.cardDetalhe}>Operador: {String(item.operador)}</Text> : null}
              </View>
            )}
          />
        )}
        <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 80 }]} onPress={() => { resetForm(); setTela('form'); }}>
          <Text style={{ color: C.white, fontSize: 28, lineHeight: 32 }}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ paddingRight: 12 }}>
          <Text style={{ color: C.white, fontSize: 20 }}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitulo}>Novo Plantio</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <Text style={s.label}>Talhão *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: talhaoId ? C.text : C.textWeak, fontSize: 15 }}>{talhoes.find(t => t.id === talhaoId)?.nome ?? 'Selecione…'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        <Text style={s.label}>Ciclo *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setPickerCiclo(true)}>
          <Text style={{ color: cicloId ? C.text : C.textWeak, fontSize: 15 }}>{ciclos.find(c => c.id === cicloId)?.descricao ?? 'Selecione…'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        <Text style={s.label}>Data do plantio</Text>
        <TextInput style={s.input} value={data} onChangeText={setData} placeholder="AAAA-MM-DD" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Variedade</Text>
        <TouchableOpacity style={s.picker} onPress={() => variedadesDisponiveis.length ? setPickerVariedade(true) : Alert.alert('', 'Selecione o ciclo primeiro.')}
          disabled={!variedadesDisponiveis.length}>
          <Text style={{ color: variedade ? C.text : C.textWeak, fontSize: 15 }}>{variedade || 'Selecione…'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Densidade (sem./m²)</Text>
            <TextInput style={s.input} value={densidade} onChangeText={setDensidade} keyboardType="decimal-pad" placeholder="ex: 12" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Espaçamento (cm)</Text>
            <TextInput style={s.input} value={espacamento} onChangeText={setEspacamento} keyboardType="decimal-pad" placeholder="ex: 45" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <Text style={s.label}>Área plantada (ha)</Text>
        <TextInput style={s.input} value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="ex: 120.5" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Operador</Text>
        <TextInput style={s.input} value={operador} onChangeText={setOperador} placeholder="Nome do operador" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Máquina</Text>
        <TextInput style={s.input} value={maquina} onChangeText={setMaquina} placeholder="ex: Plantadeira John Deere 1113" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Observações</Text>
        <TextInput style={[s.input, { minHeight: 70 }]} value={obs} onChangeText={setObs} multiline placeholder="Condições do solo, velocidade, pressão…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[s.salvarBtn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color={C.white} /> : <Text style={s.salvarTxt}>Registrar Plantio</Text>}
        </TouchableOpacity>
      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Selecione o talhão"
        itens={talhoes.map(t => `${t.nome} (${t.area_ha} ha)`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)} />

      <ListPickerModal visible={pickerCiclo} titulo="Selecione o ciclo"
        itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); setVariedade(''); }}
        onClose={() => setPickerCiclo(false)} />

      <ListPickerModal visible={pickerVariedade} titulo="Selecione a variedade"
        itens={variedadesDisponiveis}
        onSelect={v => { setVariedade(v); setPickerVariedade(false); }}
        onClose={() => setPickerVariedade(false)} />
    </View>
  );
}

function ListPickerModal({ visible, titulo, itens, onSelect, onClose }: {
  visible: boolean; titulo: string; itens: string[];
  onSelect: (v: string, i: number) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={s.modalSheet}>
        <View style={s.modalHandle} />
        <Text style={s.modalTitulo}>{titulo}</Text>
        <FlatList data={itens} keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={s.modalItem} onPress={() => onSelect(item, index)}>
              <Text style={{ fontSize: 15, color: C.text }}>{item}</Text>
            </TouchableOpacity>
          )} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  topBar:    { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  topTitulo: { color: C.white, fontSize: 18, fontWeight: '700' },
  vazio:     { textAlign: 'center', color: C.textWeak, marginTop: 40, fontSize: 14 },
  card:      { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: C.border },
  cardTitulo:{ fontSize: 15, fontWeight: '700', color: C.text },
  cardData:  { fontSize: 12, color: C.textWeak },
  cardSub:   { fontSize: 13, color: C.textSub, marginTop: 2 },
  cardDetalhe:{ fontSize: 12, color: C.textTert, marginTop: 3 },
  fab:       { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  label:     { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 4 },
  input:     { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.text, marginBottom: 14 },
  picker:    { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  salvarBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  salvarTxt: { color: C.white, fontSize: 16, fontWeight: '700' },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:  { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: C.text, paddingHorizontal: 16, marginBottom: 8 },
  modalItem:   { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.border },
});
