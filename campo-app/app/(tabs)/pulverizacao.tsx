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

type Produto = { nome: string; dose: string; unidade: string };
type Tela = 'lista' | 'form';

const UNIDADES = ['L/ha', 'mL/ha', 'kg/ha', 'g/ha', 'L/100L'];

export default function PulverizacaoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [pulverizacoes, setPulverizacoes] = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]       = useState<Talhao[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Form
  const [talhaoId, setTalhaoId]     = useState('');
  const [cicloId, setCicloId]       = useState('');
  const [data, setData]             = useState(() => new Date().toISOString().split('T')[0]);
  const [areaHa, setAreaHa]         = useState('');
  const [volumeCaldaHa, setVolumeCaldaHa] = useState('');
  const [operador, setOperador]     = useState('');
  const [maquina, setMaquina]       = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [umidade, setUmidade]       = useState('');
  const [ventoKmh, setVentoKmh]     = useState('');
  const [obs, setObs]               = useState('');
  const [produtos, setProdutos]     = useState<Produto[]>([{ nome: '', dose: '', unidade: 'L/ha' }]);
  const [salvando, setSalvando]     = useState(false);

  // Pickers
  const [pickerTalhao, setPickerTalhao] = useState(false);
  const [pickerCiclo, setPickerCiclo]   = useState(false);
  const [pickerUnidade, setPickerUnidade] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: pulvs }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from('pulverizacoes').select('*, talhoes(nome), ciclos(descricao)').eq('fazenda_id', fazendaId).order('data_pulverizacao', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
    ]);
    setPulverizacoes((pulvs ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function resetForm() {
    setTalhaoId(''); setCicloId(''); setData(new Date().toISOString().split('T')[0]);
    setAreaHa(''); setVolumeCaldaHa(''); setOperador(''); setMaquina('');
    setTemperatura(''); setUmidade(''); setVentoKmh(''); setObs('');
    setProdutos([{ nome: '', dose: '', unidade: 'L/ha' }]);
  }

  function addProduto() { setProdutos(p => [...p, { nome: '', dose: '', unidade: 'L/ha' }]); }
  function removeProduto(i: number) { setProdutos(p => p.filter((_, j) => j !== i)); }
  function updateProduto(i: number, field: keyof Produto, val: string) {
    setProdutos(p => p.map((pr, j) => j === i ? { ...pr, [field]: val } : pr));
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('Campo obrigatório', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('Campo obrigatório', 'Selecione o ciclo.'); return; }
    const produtosValidos = produtos.filter(p => p.nome.trim());
    if (!produtosValidos.length) { Alert.alert('Campo obrigatório', 'Informe ao menos um produto.'); return; }
    if (!fazendaId) return;

    setSalvando(true);
    const { offline, error } = await saveOrQueue('pulverizacoes', {
      fazenda_id: fazendaId,
      talhao_id: talhaoId,
      ciclo_id: cicloId,
      data_pulverizacao: data,
      area_ha: areaHa ? Number(areaHa) : null,
      volume_calda_ha: volumeCaldaHa ? Number(volumeCaldaHa) : null,
      operador: operador || null,
      maquina: maquina || null,
      temperatura: temperatura ? Number(temperatura) : null,
      umidade: umidade ? Number(umidade) : null,
      velocidade_vento: ventoKmh ? Number(ventoKmh) : null,
      produtos: produtosValidos,
      obs: obs || null,
    });
    setSalvando(false);

    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(
      offline ? '📶 Salvo offline' : '✅ Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Pulverização registrada com sucesso.',
      [{ text: 'OK', onPress: () => { resetForm(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.topTitulo}>Pulverizações</Text>
        </View>
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} size="large" />
        ) : (
          <FlatList
            data={pulverizacoes}
            keyExtractor={r => String(r.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.vazio}>Nenhuma pulverização registrada.</Text>}
            renderItem={({ item }) => (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.cardTitulo}>💧 {(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                  <Text style={s.cardData}>{String(item.data_pulverizacao)}</Text>
                </View>
                <Text style={s.cardSub}>{(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}</Text>
                {Array.isArray(item.produtos) && item.produtos.length > 0 && (
                  <Text style={s.cardDetalhe}>{(item.produtos as Produto[]).map(p => p.nome).join(' · ')}</Text>
                )}
                {item.area_ha ? <Text style={s.cardDetalhe}>Área: {String(item.area_ha)} ha · {String(item.volume_calda_ha ?? '—')} L/ha</Text> : null}
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
        <Text style={s.topTitulo}>Nova Pulverização</Text>
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

        <Text style={s.label}>Data</Text>
        <TextInput style={s.input} value={data} onChangeText={setData} placeholder="AAAA-MM-DD" placeholderTextColor={C.textWeak} />

        {/* Produtos */}
        <Text style={s.label}>Produtos *</Text>
        {produtos.map((pr, i) => (
          <View key={i} style={s.produtoRow}>
            <View style={{ flex: 2 }}>
              <TextInput
                style={[s.input, { marginBottom: 0 }]}
                value={pr.nome}
                onChangeText={v => updateProduto(i, 'nome', v)}
                placeholder="Nome do produto"
                placeholderTextColor={C.textWeak}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[s.input, { marginBottom: 0 }]}
                value={pr.dose}
                onChangeText={v => updateProduto(i, 'dose', v)}
                keyboardType="decimal-pad"
                placeholder="Dose"
                placeholderTextColor={C.textWeak}
              />
            </View>
            <TouchableOpacity style={s.unidadeBtn} onPress={() => setPickerUnidade(i)}>
              <Text style={{ fontSize: 11, color: C.primary, fontWeight: '700' }}>{pr.unidade}</Text>
            </TouchableOpacity>
            {produtos.length > 1 && (
              <TouchableOpacity onPress={() => removeProduto(i)} style={s.removeBtn}>
                <Text style={{ color: C.red, fontWeight: '700', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={s.addProdBtn} onPress={addProduto}>
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>+ Adicionar produto</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Área (ha)</Text>
            <TextInput style={s.input} value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="ha" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Volume calda (L/ha)</Text>
            <TextInput style={s.input} value={volumeCaldaHa} onChangeText={setVolumeCaldaHa} keyboardType="decimal-pad" placeholder="L/ha" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <Text style={s.label}>Operador</Text>
        <TextInput style={s.input} value={operador} onChangeText={setOperador} placeholder="Nome do operador" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Máquina</Text>
        <TextInput style={s.input} value={maquina} onChangeText={setMaquina} placeholder="ex: Pulverizador Jacto 3000" placeholderTextColor={C.textWeak} />

        {/* Condições climáticas */}
        <View style={s.secaoTitulo}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSub }}>🌤 Condições climáticas</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Temperatura (°C)</Text>
            <TextInput style={s.input} value={temperatura} onChangeText={setTemperatura} keyboardType="decimal-pad" placeholder="°C" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Umidade (%)</Text>
            <TextInput style={s.input} value={umidade} onChangeText={setUmidade} keyboardType="decimal-pad" placeholder="%" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Vento (km/h)</Text>
            <TextInput style={s.input} value={ventoKmh} onChangeText={setVentoKmh} keyboardType="decimal-pad" placeholder="km/h" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <Text style={s.label}>Observações</Text>
        <TextInput style={[s.input, { minHeight: 70 }]} value={obs} onChangeText={setObs} multiline placeholder="Estágio da cultura, condições gerais…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[s.salvarBtn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color={C.white} /> : <Text style={s.salvarTxt}>Registrar Pulverização</Text>}
        </TouchableOpacity>
      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Selecione o talhão"
        itens={talhoes.map(t => `${t.nome} (${t.area_ha} ha)`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)} />

      <ListPickerModal visible={pickerCiclo} titulo="Selecione o ciclo"
        itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); }}
        onClose={() => setPickerCiclo(false)} />

      <ListPickerModal visible={pickerUnidade !== null} titulo="Unidade de medida"
        itens={UNIDADES}
        onSelect={v => { if (pickerUnidade !== null) updateProduto(pickerUnidade, 'unidade', v); setPickerUnidade(null); }}
        onClose={() => setPickerUnidade(null)} />
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
  fab:       { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  label:     { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 4 },
  input:     { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.text, marginBottom: 14 },
  picker:    { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  produtoRow:{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 10 },
  unidadeBtn:{ backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 10, minWidth: 50, alignItems: 'center' },
  removeBtn: { padding: 8 },
  addProdBtn:{ borderWidth: 0.5, borderColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16, borderStyle: 'dashed' },
  secaoTitulo:{ backgroundColor: C.primaryLight, borderRadius: 8, padding: 10, marginBottom: 10 },
  salvarBtn: { backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  salvarTxt: { color: C.white, fontSize: 16, fontWeight: '700' },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:  { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: C.text, paddingHorizontal: 16, marginBottom: 8 },
  modalItem:   { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.border },
});
