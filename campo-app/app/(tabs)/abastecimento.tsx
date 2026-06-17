import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { enqueue } from '../../lib/offline';
import { C, T } from '../../constants/theme';
import { ListPickerModal } from './monitoramento';
import { todayBR, formatDateInput, toISO, toBR } from '../../lib/date';

type Tela = 'lista' | 'form';
type Maquina    = { id: string; descricao: string; tipo?: string };
type AnoSafra   = { id: string; descricao: string };
type CicloOpt   = { id: string; descricao: string; cultura: string; ano_safra_id: string | null };
type InsumoOpt  = { id: string; nome: string; categoria: string; unidade: string; estoque: number; custo_medio: number };
type Registro   = {
  id: string;
  maquina_descricao: string | null;
  data: string;
  tipo_combustivel: string | null;
  quantidade_l: number;
  horimetro: number | null;
  km: number | null;
  operador: string | null;
  insumos?: { nome: string } | null;
  ciclos?: { descricao: string } | null;
};

const COMBUSTIVEL_COR: Record<string, string> = {
  diesel: '#1A4870', arla32: '#2563EB', gasolina: '#D97706', etanol: '#16A34A',
};
const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: 'Diesel', arla32: 'Arla 32', gasolina: 'Gasolina', etanol: 'Etanol',
};

function detectarTipo(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes('arla')) return 'arla32';
  if (n.includes('diesel')) return 'diesel';
  if (n.includes('gasolina')) return 'gasolina';
  if (n.includes('etanol') || n.includes('álcool') || n.includes('alcool')) return 'etanol';
  return null;
}

export default function AbastecimentoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [registros, setRegistros]   = useState<Registro[]>([]);
  const [maquinas, setMaquinas]     = useState<Maquina[]>([]);
  const [anos, setAnos]             = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]         = useState<CicloOpt[]>([]);
  const [insumos, setInsumos]       = useState<InsumoOpt[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Form state
  const [anoSafraId, setAnoSafraId] = useState('');
  const [cicloId, setCicloId]       = useState('');
  const [maquinaId, setMaquinaId]   = useState('');
  const [maquinaDesc, setMaquinaDesc] = useState('');
  const [insumoId, setInsumoId]     = useState('');
  const [data, setData]             = useState(todayBR);
  const [litros, setLitros]         = useState('');
  const [horimetro, setHorimetro]   = useState('');
  const [km, setKm]                 = useState('');
  const [operador, setOperador]     = useState('');
  const [obs, setObs]               = useState('');
  const [salvando, setSalvando]     = useState(false);

  const [pickerAnos, setPickerAnos]       = useState(false);
  const [pickerCiclos, setPickerCiclos]   = useState(false);
  const [pickerMaq, setPickerMaq]         = useState(false);
  const [pickerInsumo, setPickerInsumo]   = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: regs }, { data: maq }, { data: an }, { data: cic }, { data: ins }] = await Promise.all([
      supabase.from('abastecimentos')
        .select('id, maquina_descricao, data, tipo_combustivel, quantidade_l, horimetro, km, operador, insumos(nome), ciclos(descricao)')
        .eq('fazenda_id', fazendaId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('maquinas').select('id, descricao, tipo').eq('fazenda_id', fazendaId).order('descricao'),
      supabase.from('anos_safra').select('id, descricao').order('descricao', { ascending: false }),
      supabase.from('ciclos').select('id, descricao, cultura, ano_safra_id').eq('fazenda_id', fazendaId).order('descricao'),
      supabase.from('insumos').select('id, nome, categoria, unidade, estoque, custo_medio').eq('fazenda_id', fazendaId).order('nome'),
    ]);
    setRegistros((regs ?? []) as Registro[]);
    setMaquinas((maq ?? []) as Maquina[]);
    setAnos((an ?? []) as AnoSafra[]);
    setCiclos((cic ?? []) as CicloOpt[]);
    setInsumos((ins ?? []) as InsumoOpt[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setAnoSafraId(''); setCicloId(''); setMaquinaId(''); setMaquinaDesc('');
    setInsumoId(''); setData(todayBR()); setLitros('');
    setHorimetro(''); setKm(''); setOperador(''); setObs('');
  }

  // ── Derivados do formulário ───────────────────────────────────────────────
  const ciclosFiltrados = anoSafraId
    ? ciclos.filter(c => c.ano_safra_id === anoSafraId)
    : ciclos;
  const insumoSel   = insumos.find(i => i.id === insumoId);
  const cicloSel    = ciclos.find(c => c.id === cicloId);
  const anoSel      = anos.find(a => a.id === anoSafraId);
  const maquinaSel  = maquinas.find(m => m.id === maquinaId);
  const qtd         = Number(litros) || 0;
  const valorUnit   = insumoSel?.custo_medio ?? 0;
  const valorTotal  = qtd * valorUnit;
  const tipoCombu   = detectarTipo(insumoSel?.nome ?? '');
  const estoqueApos = (insumoSel?.estoque ?? 0) - qtd;

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!cicloId)  { Alert.alert('Campo obrigatório', 'Selecione o ciclo para imputar o custo.'); return; }
    if (!insumoId) { Alert.alert('Campo obrigatório', 'Selecione o insumo (combustível) do estoque.'); return; }
    const desc = maquinaDesc.trim() || maquinaSel?.descricao;
    if (!desc)     { Alert.alert('Campo obrigatório', 'Selecione ou informe a máquina.'); return; }
    if (qtd <= 0)  { Alert.alert('Campo obrigatório', 'Informe a quantidade em litros.'); return; }
    if (!fazendaId) return;

    const dataISO = toISO(data);
    if (!dataISO || dataISO.length < 10) { Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA.'); return; }

    setSalvando(true);
    const payload = {
      fazenda_id: fazendaId,
      maquina_id: maquinaId || null,
      maquina_descricao: desc,
      data: dataISO,
      insumo_id: insumoId,
      tipo_combustivel: tipoCombu,
      quantidade_l: qtd,
      valor_unitario: valorUnit,
      valor_total: valorTotal,
      ciclo_id: cicloId,
      horimetro: horimetro ? Number(horimetro) : null,
      km: km ? Number(km) : null,
      operador: operador || null,
      observacao: obs || null,
    };

    const net = await NetInfo.fetch();

    if (!net.isConnected) {
      await enqueue('abastecimentos', payload);
      setSalvando(false);
      Alert.alert(
        'Salvo offline',
        `${litros} L de ${insumoSel?.nome} — ${desc}\nBaixa de estoque será processada ao sincronizar.`,
        [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
      );
      return;
    }

    // Online: insere abastecimento
    const { error: errAb } = await supabase.from('abastecimentos').insert(payload);
    if (errAb) { setSalvando(false); Alert.alert('Erro', errAb.message); return; }

    // Online: baixa de estoque — trigger do banco atualiza insumos.estoque
    await supabase.from('movimentacoes_estoque').insert({
      fazenda_id: fazendaId,
      insumo_id: insumoId,
      tipo: 'saida',
      motivo: 'abastecimento',
      quantidade: qtd,
      data: dataISO,
      ciclo_id: cicloId,
      observacao: `Abastecimento - ${desc}`,
      auto: true,
      valor_unitario: valorUnit,
    });

    setSalvando(false);
    Alert.alert(
      'Abastecimento registrado',
      `${qtd} L de ${insumoSel?.nome} — ${desc}\nCusto: R$ ${valorTotal.toFixed(2)} → Ciclo: ${cicloSel?.descricao}`,
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Totais do dia ─────────────────────────────────────────────────────────
  const hoje = new Date().toISOString().split('T')[0];
  const totalHoje = registros.filter(r => r.data === hoje).reduce((s, r) => s + Number(r.quantidade_l), 0);

  // ── LISTA ─────────────────────────────────────────────────────────────────
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
                const tipo = item.tipo_combustivel ?? detectarTipo((item.insumos as { nome: string } | null)?.nome ?? '');
                const cor  = COMBUSTIVEL_COR[tipo ?? ''] ?? C.primary;
                const nomeInsumo = (item.insumos as { nome: string } | null)?.nome ?? item.tipo_combustivel ?? '—';
                const nomeCiclo  = (item.ciclos  as { descricao: string } | null)?.descricao;
                return (
                  <View style={T.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={T.h3} numberOfLines={1}>{item.maquina_descricao ?? '—'}</Text>
                      <View style={[s.litrosBadge, { backgroundColor: cor + '18' }]}>
                        <Text style={[s.litrosBadgeTxt, { color: cor }]}>{Number(item.quantidade_l).toFixed(0)} L</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <View style={[s.tag, { backgroundColor: cor }]}>
                        <Text style={s.tagTxt}>{nomeInsumo}</Text>
                      </View>
                      {nomeCiclo && (
                        <View style={[s.tag, { backgroundColor: '#16A34A' }]}>
                          <Text style={s.tagTxt}>{nomeCiclo}</Text>
                        </View>
                      )}
                      <Text style={T.caption}>{toBR(item.data)}</Text>
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

  // ── FORMULÁRIO ────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.barTitulo}>Novo Abastecimento</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        {/* ── Ciclo (obrigatório para custo) ── */}
        <View style={s.secaoObrig}>
          <Ionicons name="leaf-outline" size={14} color={C.primary} />
          <Text style={s.secaoObrigTxt}>Ciclo / Safra — obrigatório para imputação de custo</Text>
        </View>

        <Text style={T.secLabel}>Ano Safra</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerAnos(true)}>
          <Text style={{ color: anoSafraId ? C.text : C.textWeak, fontSize: 14 }}>
            {anoSel?.descricao ?? 'Filtrar por ano safra (opcional)…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        <Text style={T.secLabel}>Ciclo <Text style={{ color: '#E24B4A' }}>*</Text></Text>
        <TouchableOpacity
          style={[T.picker, !cicloId && { borderColor: '#E24B4A33' }]}
          onPress={() => setPickerCiclos(true)}
        >
          <Text style={{ color: cicloId ? C.text : C.textWeak, fontSize: 14 }}>
            {cicloSel ? `${cicloSel.descricao} · ${cicloSel.cultura}` : 'Selecionar ciclo…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        {/* ── Máquina ── */}
        <Text style={[T.secLabel, { marginTop: 8 }]}>Máquina</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerMaq(true)}>
          <Text style={{ color: maquinaId ? C.text : C.textWeak, fontSize: 14 }}>
            {maquinaSel?.descricao ?? 'Selecionar máquina…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        {!maquinaId && (
          <TextInput
            style={T.input} value={maquinaDesc} onChangeText={setMaquinaDesc}
            placeholder="Ou digitar nome da máquina…" placeholderTextColor={C.textWeak}
          />
        )}

        {/* ── Insumo (combustível do estoque) ── */}
        <Text style={[T.secLabel, { marginTop: 8 }]}>
          Insumo / Combustível <Text style={{ color: '#E24B4A' }}>*</Text>
        </Text>
        <TouchableOpacity
          style={[T.picker, !insumoId && { borderColor: '#E24B4A33' }]}
          onPress={() => setPickerInsumo(true)}
        >
          <Text style={{ color: insumoId ? C.text : C.textWeak, fontSize: 14 }}>
            {insumoSel
              ? `${insumoSel.nome}  ·  Estoque: ${insumoSel.estoque.toFixed(1)} ${insumoSel.unidade}`
              : 'Selecionar insumo do estoque…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        {/* Preview custo quando insumo e qtd preenchidos */}
        {insumoSel && qtd > 0 && (
          <View style={s.custoPreview}>
            <View style={s.custoRow}>
              <Text style={s.custoLbl}>Custo unitário</Text>
              <Text style={s.custoVal}>R$ {valorUnit.toFixed(4)}/{insumoSel.unidade}</Text>
            </View>
            <View style={s.custoRow}>
              <Text style={s.custoLbl}>Custo total</Text>
              <Text style={[s.custoVal, { color: C.primary, fontWeight: '700' }]}>R$ {valorTotal.toFixed(2)}</Text>
            </View>
            <View style={s.custoRow}>
              <Text style={s.custoLbl}>Estoque após</Text>
              <Text style={[s.custoVal, { color: estoqueApos < 0 ? '#E24B4A' : '#16A34A' }]}>
                {estoqueApos.toFixed(1)} {insumoSel.unidade}
                {estoqueApos < 0 ? '  ⚠ insuficiente' : ''}
              </Text>
            </View>
          </View>
        )}

        {/* ── Quantidade e Data ── */}
        <Text style={[T.secLabel, { marginTop: 8 }]}>Quantidade e data</Text>
        <View style={s.litrosRow}>
          <TextInput
            style={[T.input, s.litrosInput]}
            value={litros} onChangeText={setLitros}
            keyboardType="decimal-pad" placeholder="0"
            placeholderTextColor={C.textWeak}
          />
          <View style={s.litrosUnidade}>
            <Ionicons name="water-outline" size={18} color={C.primary} />
            <Text style={s.litrosUnidadeTxt}>{insumoSel?.unidade ?? 'L'}</Text>
          </View>
        </View>
        <TextInput
          style={T.input}
          value={data}
          onChangeText={v => setData(formatDateInput(v))}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={C.textWeak}
          keyboardType="numeric"
          maxLength={10}
        />

        {/* ── Horímetro / Odômetro ── */}
        <Text style={[T.secLabel, { marginTop: 8 }]}>Horímetro / Odômetro</Text>
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

      {/* Pickers */}
      <ListPickerModal
        visible={pickerAnos} titulo="Ano Safra"
        itens={['Todos os anos', ...anos.map(a => a.descricao)]}
        onSelect={(_, i) => { setAnoSafraId(i === 0 ? '' : anos[i - 1].id); setCicloId(''); setPickerAnos(false); }}
        onClose={() => setPickerAnos(false)}
      />
      <ListPickerModal
        visible={pickerCiclos} titulo="Ciclo"
        itens={ciclosFiltrados.map(c => `${c.descricao} · ${c.cultura}`)}
        onSelect={(_, i) => { setCicloId(ciclosFiltrados[i].id); setPickerCiclos(false); }}
        onClose={() => setPickerCiclos(false)}
      />
      <ListPickerModal
        visible={pickerMaq} titulo="Máquina"
        itens={maquinas.map(m => `${m.descricao}${m.tipo ? ` · ${m.tipo}` : ''}`)}
        onSelect={(_, i) => { setMaquinaId(maquinas[i].id); setMaquinaDesc(''); setPickerMaq(false); }}
        onClose={() => setPickerMaq(false)}
      />
      <ListPickerModal
        visible={pickerInsumo} titulo="Insumo / Combustível"
        itens={insumos.map(i => `${i.nome}  (${i.estoque.toFixed(1)} ${i.unidade} · R$ ${i.custo_medio.toFixed(2)}/${i.unidade})`)}
        onSelect={(_, i) => { setInsumoId(insumos[i].id); setPickerInsumo(false); }}
        onClose={() => setPickerInsumo(false)}
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
  litrosBadgeTxt: { fontSize: 13, fontWeight: '700' },
  tag:    { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },

  secaoObrig:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, backgroundColor: C.primaryLight, borderRadius: 8, padding: 10 },
  secaoObrigTxt: { fontSize: 12, color: C.primary, fontWeight: '600', flex: 1 },

  litrosRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  litrosInput:     { flex: 1, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 0 },
  litrosUnidade:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.primaryLight, borderRadius: 8 },
  litrosUnidadeTxt: { fontSize: 14, fontWeight: '700', color: C.primary },

  custoPreview: { backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: C.border },
  custoRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  custoLbl:     { fontSize: 12, color: C.textSub },
  custoVal:     { fontSize: 12, fontWeight: '600', color: C.text },
});
