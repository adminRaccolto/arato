import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao, type Ciclo } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { C, T } from '../../constants/theme';
import { ListPickerModal } from './monitoramento';
import { todayBR, formatDateInput, toISO, toBR } from '../../lib/date';

const VARIEDADES: Record<string, string[]> = {
  soja:    ['TMG 7062 IPRO','M 6410 IPRO','NS 7709 IPRO','DM 65i62 RSF IPRO','SYN 1365i','Outra'],
  milho:   ['DKB 390 PRO3','P3431H','SX 7331H','AG 8088 PRO3','P3340H','Outra'],
  algodao: ['TMG 47 B2RF','FM 985 GLTP','IMA CV 690 B2RF','Outra'],
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

  const [talhaoId, setTalhaoId]     = useState('');
  const [cicloId, setCicloId]       = useState('');
  const [data, setData]             = useState(todayBR);
  const [variedade, setVariedade]   = useState('');
  const [densidade, setDensidade]   = useState('');
  const [espacamento, setEspacamento] = useState('');
  const [areaHa, setAreaHa]         = useState('');
  const [operador, setOperador]     = useState('');
  const [maquina, setMaquina]       = useState('');
  const [obs, setObs]               = useState('');
  const [salvando, setSalvando]     = useState(false);

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

  function reset() {
    setTalhaoId(''); setCicloId(''); setData(todayBR());
    setVariedade(''); setDensidade(''); setEspacamento('');
    setAreaHa(''); setOperador(''); setMaquina(''); setObs('');
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('', 'Selecione o ciclo.'); return; }
    if (!fazendaId) return;
    setSalvando(true);
    const { offline, error } = await saveOrQueue('plantios', {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId,
      data_plantio: toISO(data), variedade: variedade || null,
      densidade_sementes_ha: densidade ? Number(densidade) : null,
      espacamento_cm: espacamento ? Number(espacamento) : null,
      area_plantada_ha: areaHa ? Number(areaHa) : null,
      operador: operador || null, maquina: maquina || null, obs: obs || null,
    });
    setSalvando(false);
    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(offline ? 'Salvo offline' : 'Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Plantio registrado.',
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }]);
  }

  const cicloAtivo = ciclos.find(c => c.id === cicloId);
  const variedadesLista = VARIEDADES[cicloAtivo?.cultura?.toLowerCase() ?? ''] ?? ['Outra variedade'];

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Plantios</Text>
        </View>
        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={plantios}
              keyExtractor={r => String(r.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={s.vazio}>Nenhum plantio registrado.</Text>}
              renderItem={({ item }) => (
                <View style={T.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={T.h3}>{(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                    <Text style={T.caption}>{toBR(String(item.data_plantio))}</Text>
                  </View>
                  <Text style={[T.bodySub, { marginTop: 4 }]}>{(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}</Text>
                  {item.variedade ? <Text style={[T.caption, { marginTop: 4 }]}>Variedade: {String(item.variedade)}</Text> : null}
                  {item.area_plantada_ha ? <Text style={T.caption}>Área: {String(item.area_plantada_ha)} ha</Text> : null}
                </View>
              )}
            />
          )}
        <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 72 }]} onPress={() => { reset(); setTela('form'); }}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.barTitulo}>Novo Plantio</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={T.secLabel}>Localização</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: talhaoId ? C.text : C.textWeak, fontSize: 14 }}>{talhoes.find(t => t.id === talhaoId)?.nome ?? 'Talhão…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <TouchableOpacity style={T.picker} onPress={() => setPickerCiclo(true)}>
          <Text style={{ color: cicloId ? C.text : C.textWeak, fontSize: 14 }}>{ciclos.find(c => c.id === cicloId)?.descricao ?? 'Ciclo…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        <Text style={T.secLabel}>Operação</Text>
        <TextInput style={T.input} value={data} onChangeText={v => setData(formatDateInput(v))} placeholder="DD/MM/AAAA" placeholderTextColor={C.textWeak} keyboardType="numeric" maxLength={10} />
        <TouchableOpacity style={T.picker} onPress={() => variedadesLista.length ? setPickerVariedade(true) : Alert.alert('', 'Selecione o ciclo primeiro.')}>
          <Text style={{ color: variedade ? C.text : C.textWeak, fontSize: 14 }}>{variedade || 'Variedade…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextInput style={T.input} value={densidade} onChangeText={setDensidade} keyboardType="decimal-pad" placeholder="Densidade (sem./m²)" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput style={T.input} value={espacamento} onChangeText={setEspacamento} keyboardType="decimal-pad" placeholder="Espaçamento (cm)" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <TextInput style={T.input} value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="Área plantada (ha)" placeholderTextColor={C.textWeak} />

        <Text style={T.secLabel}>Equipe e maquinário</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador} placeholder="Operador" placeholderTextColor={C.textWeak} />
        <TextInput style={T.input} value={maquina} onChangeText={setMaquina} placeholder="Máquina" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 72 }]} value={obs} onChangeText={setObs} multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar plantio</Text>}
        </TouchableOpacity>

      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Talhão" itens={talhoes.map(t => `${t.nome} · ${t.area_ha} ha`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }} onClose={() => setPickerTalhao(false)} />
      <ListPickerModal visible={pickerCiclo} titulo="Ciclo" itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); setVariedade(''); }} onClose={() => setPickerCiclo(false)} />
      <ListPickerModal visible={pickerVariedade} titulo="Variedade" itens={variedadesLista}
        onSelect={v => { setVariedade(v); setPickerVariedade(false); }} onClose={() => setPickerVariedade(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  bar:       { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  barTitulo: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  vazio:     { textAlign: 'center', color: C.textWeak, marginTop: 48, fontSize: 14 },
  fab: {
    position: 'absolute', right: 20, width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
});
