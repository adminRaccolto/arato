import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { C, T } from '../../constants/theme';
import { ListPickerModal } from './monitoramento';

type Tela = 'lista' | 'form';
type Maquina = { id: string; descricao: string; tipo?: string };
type Registro = {
  id: string;
  maquina_descricao: string | null;
  data: string;
  tipo_combustivel: string | null;
  quantidade_l: number;
  horimetro: number | null;
  km: number | null;
  operador: string | null;
};

const COMBUSTIVEIS = ['diesel', 'arla32', 'gasolina', 'etanol'];
const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: 'Diesel', arla32: 'Arla 32', gasolina: 'Gasolina', etanol: 'Etanol',
};
const COMBUSTIVEL_COR: Record<string, string> = {
  diesel: '#1A4870', arla32: '#2563EB', gasolina: '#D97706', etanol: '#16A34A',
};

export default function AbastecimentoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [registros, setRegistros]   = useState<Registro[]>([]);
  const [maquinas, setMaquinas]     = useState<Maquina[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [maquinaId, setMaquinaId]       = useState('');
  const [maquinaDesc, setMaquinaDesc]   = useState('');
  const [data, setData]                 = useState(() => new Date().toISOString().split('T')[0]);
  const [combustivel, setCombustivel]   = useState<string>('diesel');
  const [litros, setLitros]             = useState('');
  const [horimetro, setHorimetro]       = useState('');
  const [km, setKm]                     = useState('');
  const [operador, setOperador]         = useState('');
  const [obs, setObs]                   = useState('');
  const [salvando, setSalvando]         = useState(false);

  const [pickerMaquina, setPickerMaquina]     = useState(false);
  const [pickerCombustivel, setPickerCombustivel] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: regs }, { data: maq }] = await Promise.all([
      supabase.from('abastecimentos')
        .select('id, maquina_descricao, data, tipo_combustivel, quantidade_l, horimetro, km, operador')
        .eq('fazenda_id', fazendaId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('maquinas')
        .select('id, descricao, tipo')
        .eq('fazenda_id', fazendaId)
        .order('descricao'),
    ]);
    setRegistros((regs ?? []) as Registro[]);
    setMaquinas((maq ?? []) as Maquina[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setMaquinaId(''); setMaquinaDesc('');
    setData(new Date().toISOString().split('T')[0]);
    setCombustivel('diesel'); setLitros(''); setHorimetro(''); setKm('');
    setOperador(''); setObs('');
  }

  async function salvar() {
    const desc = maquinaDesc.trim() || maquinas.find(m => m.id === maquinaId)?.descricao;
    if (!desc) { Alert.alert('', 'Selecione ou informe a máquina.'); return; }
    if (!litros || Number(litros) <= 0) { Alert.alert('', 'Informe a quantidade de litros.'); return; }
    if (!fazendaId) return;
    setSalvando(true);
    const { offline, error } = await saveOrQueue('abastecimentos', {
      fazenda_id: fazendaId,
      maquina_id: maquinaId || null,
      maquina_descricao: desc,
      data,
      tipo_combustivel: combustivel,
      quantidade_l: Number(litros),
      horimetro: horimetro ? Number(horimetro) : null,
      km: km ? Number(km) : null,
      operador: operador || null,
      observacao: obs || null,
    });
    setSalvando(false);
    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(
      offline ? 'Salvo offline' : 'Abastecimento registrado',
      `${litros} L de ${COMBUSTIVEL_LABEL[combustivel]} — ${desc}${offline ? '\nSerá enviado quando houver conexão.' : ''}`,
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Totais do dia ──────────────────────────────────────────────────────────

  const hoje = new Date().toISOString().split('T')[0];
  const totalHoje = registros.filter(r => r.data === hoje).reduce((s, r) => s + Number(r.quantidade_l), 0);

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Abastecimentos</Text>
          {totalHoje > 0 && (
            <View style={s.barBadge}>
              <Text style={s.barBadgeTxt}>{totalHoje.toFixed(0)} L hoje</Text>
            </View>
          )}
        </View>

        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={registros}
              keyExtractor={r => r.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={s.vazio}>Nenhum abastecimento registrado.</Text>}
              renderItem={({ item }) => {
                const cor = COMBUSTIVEL_COR[item.tipo_combustivel] ?? C.primary;
                return (
                  <View style={T.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={T.h3} numberOfLines={1}>{item.maquina_descricao}</Text>
                      <View style={[s.litrosBadge, { backgroundColor: cor + '18' }]}>
                        <Text style={[s.litrosBadgeTxt, { color: cor }]}>{Number(item.quantidade_l).toFixed(0)} L</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                      <View style={[s.combTag, { backgroundColor: cor }]}>
                        <Text style={s.combTagTxt}>{COMBUSTIVEL_LABEL[item.tipo_combustivel ?? ''] ?? item.tipo_combustivel ?? '—'}</Text>
                      </View>
                      <Text style={T.caption}>{item.data}</Text>
                      {item.horimetro ? <Text style={T.caption}>H: {item.horimetro}h</Text> : null}
                      {item.km ? <Text style={T.caption}>km: {item.km}</Text> : null}
                    </View>
                    {item.operador ? <Text style={[T.caption, { marginTop: 4 }]}>{item.operador}</Text> : null}
                  </View>
                );
              }}
            />
          )}

        <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 72 }]} onPress={() => { reset(); setTela('form'); }}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  const maquinaAtual = maquinas.find(m => m.id === maquinaId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.barTitulo}>Novo Abastecimento</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={T.secLabel}>Máquina</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerMaquina(true)}>
          <Text style={{ color: maquinaId ? C.text : C.textWeak, fontSize: 14 }}>
            {maquinaAtual?.descricao ?? 'Selecionar máquina…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        {!maquinaId && (
          <TextInput
            style={T.input} value={maquinaDesc} onChangeText={setMaquinaDesc}
            placeholder="Ou digitar nome da máquina…"
            placeholderTextColor={C.textWeak}
          />
        )}

        <Text style={T.secLabel}>Combustível</Text>
        <View style={s.combRow}>
          {COMBUSTIVEIS.map(c => {
            const ativo = combustivel === c;
            const cor = COMBUSTIVEL_COR[c];
            return (
              <TouchableOpacity
                key={c}
                style={[s.combBtn, ativo && { backgroundColor: cor, borderColor: cor }]}
                onPress={() => setCombustivel(c)}
              >
                <Text style={[s.combBtnTxt, ativo && { color: '#fff' }]}>{COMBUSTIVEL_LABEL[c]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={T.secLabel}>Quantidade e data</Text>
        <View style={s.litrosRow}>
          <TextInput
            style={[T.input, s.litrosInput]}
            value={litros} onChangeText={setLitros}
            keyboardType="decimal-pad" placeholder="0"
            placeholderTextColor={C.textWeak}
          />
          <View style={s.litrosUnidade}>
            <Ionicons name="water-outline" size={18} color={C.primary} />
            <Text style={s.litrosUnidadeTxt}>litros</Text>
          </View>
        </View>
        <TextInput style={T.input} value={data} onChangeText={setData} placeholder="Data (AAAA-MM-DD)" placeholderTextColor={C.textWeak} />

        <Text style={T.secLabel}>Horímetro / Odômetro</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={horimetro} onChangeText={setHorimetro} keyboardType="decimal-pad" placeholder="Horímetro (h)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={km} onChangeText={setKm} keyboardType="decimal-pad" placeholder="Odômetro (km)" placeholderTextColor={C.textWeak} />
        </View>

        <Text style={T.secLabel}>Operador</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador} placeholder="Quem abasteceu" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 60 }]} value={obs} onChangeText={setObs} multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar abastecimento</Text>}
        </TouchableOpacity>
      </ScrollView>

      <ListPickerModal
        visible={pickerMaquina} titulo="Máquina"
        itens={maquinas.map(m => `${m.descricao}${m.tipo ? ` · ${m.tipo}` : ''}`)}
        onSelect={(_, i) => { setMaquinaId(maquinas[i].id); setMaquinaDesc(''); setPickerMaquina(false); }}
        onClose={() => setPickerMaquina(false)}
      />
      <ListPickerModal
        visible={pickerCombustivel} titulo="Combustível"
        itens={COMBUSTIVEIS.map(c => COMBUSTIVEL_LABEL[c])}
        onSelect={(_, i) => { setCombustivel(COMBUSTIVEIS[i]); setPickerCombustivel(false); }}
        onClose={() => setPickerCombustivel(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bar:         { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  barTitulo:   { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  barBadge:    { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  barBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  vazio:       { textAlign: 'center', color: C.textWeak, marginTop: 48, fontSize: 14 },
  fab: {
    position: 'absolute', right: 20, width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  litrosBadge:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  litrosBadgeTxt: { fontSize: 12, fontWeight: '700' },
  combTag:    { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  combTagTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },

  combRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  combBtn: {
    borderWidth: 0.5, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.surface,
  },
  combBtnTxt: { fontSize: 13, fontWeight: '600', color: C.textSub },

  litrosRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  litrosInput:    { flex: 1, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 0 },
  litrosUnidade:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.primaryLight, borderRadius: 8 },
  litrosUnidadeTxt: { fontSize: 14, fontWeight: '700', color: C.primary },
});
