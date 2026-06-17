import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao, type Ciclo } from '../../lib/supabase';
import { enqueue } from '../../lib/offline';
import { C, T } from '../../constants/theme';
import { ListPickerModal } from './monitoramento';
import { todayBR, formatDateInput, toISO, toBR } from '../../lib/date';

type Tela = 'lista' | 'form';
type InsumoOpt   = { id: string; nome: string; categoria: string; unidade: string; estoque: number; custo_medio: number };
type DepositoOpt = { id: string; nome: string; tipo: string; capacidade_sc?: number };

function calcSacas(pesoLiqKg: number, umidPct: number, impPct: number): { sacas: number; descontoKg: number } {
  const fatorUmid = Math.max(0, umidPct - 14) / 100;
  const descontoKg = pesoLiqKg * (fatorUmid + impPct / 100);
  return { sacas: (pesoLiqKg - descontoKg) / 60, descontoKg };
}

export default function ColheitaScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [romaneios, setRomaneios]   = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]       = useState<Talhao[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [insumos, setInsumos]       = useState<InsumoOpt[]>([]);
  const [depositos, setDepositos]   = useState<DepositoOpt[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [talhaoId, setTalhaoId]       = useState('');
  const [cicloId, setCicloId]         = useState('');
  const [data, setData]               = useState(todayBR);
  const [motorista, setMotorista]     = useState('');
  const [placa, setPlaca]             = useState('');
  const [pesoBruto, setPesoBruto]     = useState('');
  const [tara, setTara]               = useState('');
  const [umid, setUmid]               = useState('14');
  const [imp, setImp]                 = useState('1');
  const [avariados, setAvariados]     = useState('0');
  const [obs, setObs]                 = useState('');
  const [insumoGraoId, setInsumoGraoId] = useState('');
  const [depositoId, setDepositoId]     = useState('');
  const [salvando, setSalvando]       = useState(false);

  const [pickerTalhao, setPickerTalhao]     = useState(false);
  const [pickerCiclo, setPickerCiclo]       = useState(false);
  const [pickerInsumo, setPickerInsumo]     = useState(false);
  const [pickerDeposito, setPickerDeposito] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: rom }, { data: tal }, { data: cic }, { data: ins }, { data: dep }] = await Promise.all([
      supabase.from('romaneios')
        .select('*, talhoes(nome), ciclos(descricao, cultura)')
        .eq('fazenda_id', fazendaId)
        .order('data_colheita', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
      supabase.from('insumos').select('id, nome, categoria, unidade, estoque, custo_medio').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('depositos').select('id, nome, tipo, capacidade_sc').eq('fazenda_id', fazendaId).order('nome'),
    ]);
    setRomaneios((rom ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setInsumos((ins ?? []) as InsumoOpt[]);
    setDepositos((dep ?? []) as DepositoOpt[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTalhaoId(''); setCicloId(''); setData(todayBR());
    setMotorista(''); setPlaca(''); setPesoBruto(''); setTara('');
    setUmid('14'); setImp('1'); setAvariados('0'); setObs('');
    setInsumoGraoId(''); setDepositoId('');
  }

  const pesoLiq   = Number(pesoBruto) - Number(tara);
  const { sacas, descontoKg } = pesoLiq > 0
    ? calcSacas(pesoLiq, Number(umid), Number(imp))
    : { sacas: 0, descontoKg: 0 };
  const talhaoAtivo    = talhoes.find(t => t.id === talhaoId);
  const prodHa         = talhaoAtivo && sacas > 0 ? sacas / Number(talhaoAtivo.area_ha) : 0;
  const insumoGraoSel  = insumos.find(i => i.id === insumoGraoId);
  const depositoSel    = depositos.find(d => d.id === depositoId);

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('', 'Selecione o ciclo.'); return; }
    if (!pesoBruto || !tara) { Alert.alert('', 'Informe peso bruto e tara.'); return; }
    if (pesoLiq <= 0) { Alert.alert('', 'Peso líquido inválido.'); return; }
    if (!insumoGraoId) { Alert.alert('', 'Selecione o produto colhido para registrar a entrada em estoque.'); return; }
    if (!fazendaId) return;
    setSalvando(true);

    const dataISO = toISO(data);
    const payload = {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId,
      data_colheita: dataISO, motorista: motorista || null, placa: placa || null,
      peso_bruto_kg: Number(pesoBruto), tara_kg: Number(tara),
      peso_liquido_kg: pesoLiq,
      umidade_pct: Number(umid), impureza_pct: Number(imp),
      avariados_pct: Number(avariados),
      desconto_kg: descontoKg,
      quantidade_sacas: sacas,
      obs: obs || null,
      insumo_id: insumoGraoId || null,
      deposito_id: depositoId || null,
    };

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      await enqueue('romaneios', payload);
      setSalvando(false);
      Alert.alert('Salvo offline',
        'Será enviado quando houver conexão. Entrada em estoque será processada ao sincronizar.',
        [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }]);
      return;
    }

    const { data: rom, error: errRom } = await supabase
      .from('romaneios').insert(payload).select('id').single();
    if (errRom) { setSalvando(false); Alert.alert('Erro', errRom.message); return; }

    // Entrada em estoque: colheita aumenta o saldo do grão
    await supabase.from('movimentacoes_estoque').insert({
      fazenda_id: fazendaId,
      insumo_id: insumoGraoId,
      tipo: 'entrada',
      motivo: 'colheita',
      quantidade: sacas,
      data: dataISO,
      ciclo_id: cicloId,
      deposito_id: depositoId || null,
      observacao: `Colheita — ${insumoGraoSel?.nome ?? ''} · ${talhaoAtivo?.nome ?? ''}`,
      auto: true,
      valor_unitario: 0,
    });

    setSalvando(false);
    Alert.alert(
      'Romaneio registrado',
      [
        `${sacas.toFixed(1)} sc${prodHa > 0 ? ` · ${prodHa.toFixed(1)} sc/ha` : ''}`,
        `Produto: ${insumoGraoSel?.nome ?? ''}`,
        depositoSel ? `Destino: ${depositoSel.nome}` : null,
      ].filter(Boolean).join('\n'),
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    const totalSacas = romaneios.reduce((s, r) => s + Number(r.quantidade_sacas ?? 0), 0);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Colheita</Text>
          {totalSacas > 0 && (
            <View style={s.barBadge}>
              <Text style={s.barBadgeTxt}>{totalSacas.toFixed(0)} sc total</Text>
            </View>
          )}
        </View>
        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={romaneios}
              keyExtractor={r => String(r.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={s.vazio}>Nenhum romaneio registrado.</Text>}
              renderItem={({ item }) => {
                const sc = Number(item.quantidade_sacas ?? 0);
                return (
                  <View style={T.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={T.h3}>{(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                      <View style={s.scBadge}>
                        <Text style={s.scBadgeTxt}>{sc.toFixed(1)} sc</Text>
                      </View>
                    </View>
                    <Text style={[T.bodySub, { marginTop: 4 }]}>
                      {(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                      <Text style={T.caption}>U: {String(item.umidade_pct ?? '—')}%</Text>
                      <Text style={T.caption}>Imp: {String(item.impureza_pct ?? '—')}%</Text>
                      <Text style={T.caption}>Liq: {(Number(item.peso_liquido_kg ?? 0) / 1000).toFixed(2)} t</Text>
                      <Text style={T.caption}>{toBR(String(item.data_colheita))}</Text>
                    </View>
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.barTitulo}>Novo Romaneio</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={T.secLabel}>Localização</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: talhaoId ? C.text : C.textWeak, fontSize: 14 }}>
            {talhoes.find(t => t.id === talhaoId)?.nome ?? 'Talhão…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <TouchableOpacity style={T.picker} onPress={() => setPickerCiclo(true)}>
          <Text style={{ color: cicloId ? C.text : C.textWeak, fontSize: 14 }}>
            {ciclos.find(c => c.id === cicloId)?.descricao ?? 'Ciclo…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <TextInput style={T.input} value={data} onChangeText={v => setData(formatDateInput(v))}
          placeholder="DD/MM/AAAA" placeholderTextColor={C.textWeak} keyboardType="numeric" maxLength={10} />

        <Text style={T.secLabel}>Caminhão</Text>
        <TextInput style={T.input} value={motorista} onChangeText={setMotorista}
          placeholder="Motorista" placeholderTextColor={C.textWeak} />
        <TextInput style={T.input} value={placa} onChangeText={setPlaca}
          placeholder="Placa" placeholderTextColor={C.textWeak} autoCapitalize="characters" />

        <Text style={T.secLabel}>Pesagem (kg)</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Peso bruto</Text>
            <TextInput style={T.input} value={pesoBruto} onChangeText={setPesoBruto}
              keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Tara</Text>
            <TextInput style={T.input} value={tara} onChangeText={setTara}
              keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <Text style={T.secLabel}>Classificação</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Umidade %</Text>
            <TextInput style={T.input} value={umid} onChangeText={setUmid}
              keyboardType="decimal-pad" placeholder="14" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Impureza %</Text>
            <TextInput style={T.input} value={imp} onChangeText={setImp}
              keyboardType="decimal-pad" placeholder="1" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Avariados %</Text>
            <TextInput style={T.input} value={avariados} onChangeText={setAvariados}
              keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        {pesoLiq > 0 && (
          <View style={s.calc}>
            <View style={s.calcRow}>
              <Text style={s.calcLabel}>Peso líquido</Text>
              <Text style={s.calcVal}>{pesoLiq.toLocaleString('pt-BR')} kg</Text>
            </View>
            <View style={s.calcRow}>
              <Text style={s.calcLabel}>Desconto classif.</Text>
              <Text style={[s.calcVal, { color: C.red }]}>−{descontoKg.toFixed(0)} kg</Text>
            </View>
            <View style={[s.calcRow, s.calcRowTotal]}>
              <Text style={s.calcLabelBold}>Sacas de 60 kg</Text>
              <Text style={s.calcSacas}>{sacas.toFixed(1)} sc</Text>
            </View>
            {prodHa > 0 && (
              <View style={s.calcRow}>
                <Text style={s.calcLabel}>Produtividade</Text>
                <Text style={[s.calcVal, { color: '#16A34A', fontWeight: '700' }]}>{prodHa.toFixed(1)} sc/ha</Text>
              </View>
            )}
          </View>
        )}

        <Text style={T.secLabel}>Destino — Entrada em Estoque</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerInsumo(true)}>
          <Text style={{ color: insumoGraoId ? C.text : C.textWeak, fontSize: 14 }} numberOfLines={1}>
            {insumoGraoSel
              ? `${insumoGraoSel.nome} · Estoque atual: ${insumoGraoSel.estoque.toFixed(1)} ${insumoGraoSel.unidade}`
              : 'Produto colhido (soja, milho…) *'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <TouchableOpacity style={T.picker} onPress={() => setPickerDeposito(true)}>
          <Text style={{ color: depositoId ? C.text : C.textWeak, fontSize: 14 }} numberOfLines={1}>
            {depositoSel
              ? `${depositoSel.nome} · ${depositoSel.tipo}${depositoSel.capacidade_sc ? ` · ${depositoSel.capacidade_sc} sc` : ''}`
              : 'Depósito / Armazém destino (opcional)…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        {insumoGraoId && sacas > 0 && (
          <View style={[s.calc, { backgroundColor: '#F0FDF4', borderColor: '#16A34A30' }]}>
            <View style={s.calcRow}>
              <Text style={s.calcLabel}>Entrada em estoque</Text>
              <Text style={[s.calcVal, { color: '#16A34A', fontWeight: '700' }]}>+{sacas.toFixed(1)} sc</Text>
            </View>
            {insumoGraoSel && (
              <View style={s.calcRow}>
                <Text style={s.calcLabel}>Saldo após entrada</Text>
                <Text style={[s.calcVal, { color: '#16A34A' }]}>
                  {(insumoGraoSel.estoque + sacas).toFixed(1)} sc
                </Text>
              </View>
            )}
            {depositoSel && (
              <View style={s.calcRow}>
                <Text style={s.calcLabel}>Destino</Text>
                <Text style={s.calcVal}>{depositoSel.nome}</Text>
              </View>
            )}
          </View>
        )}

        <TextInput style={[T.input, { minHeight: 60 }]} value={obs} onChangeText={setObs}
          multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar romaneio</Text>}
        </TouchableOpacity>

      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Talhão"
        itens={talhoes.map(t => `${t.nome} · ${t.area_ha} ha`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)} />
      <ListPickerModal visible={pickerCiclo} titulo="Ciclo"
        itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); }}
        onClose={() => setPickerCiclo(false)} />
      <ListPickerModal
        visible={pickerInsumo} titulo="Produto colhido"
        itens={insumos.map(i => `${i.nome} · ${i.estoque.toFixed(1)} ${i.unidade} em estoque`)}
        onSelect={(_, i) => { setInsumoGraoId(insumos[i].id); setPickerInsumo(false); }}
        onClose={() => setPickerInsumo(false)}
      />
      <ListPickerModal
        visible={pickerDeposito} titulo="Depósito destino"
        itens={['Nenhum', ...depositos.map(d =>
          `${d.nome} · ${d.tipo}${d.capacidade_sc ? ` · ${d.capacidade_sc} sc` : ''}`)]}
        onSelect={(_, i) => { setDepositoId(i === 0 ? '' : depositos[i - 1].id); setPickerDeposito(false); }}
        onClose={() => setPickerDeposito(false)}
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
  scBadge:    { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  scBadgeTxt: { color: '#16A34A', fontSize: 12, fontWeight: '700' },
  fieldLabel: { fontSize: 10, color: C.textWeak, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  calc: {
    backgroundColor: C.primaryLight, borderRadius: 10, padding: 14, marginBottom: 16,
    borderWidth: 0.5, borderColor: C.border,
  },
  calcRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  calcRowTotal:  { borderTopWidth: 0.5, borderTopColor: C.border, marginTop: 6, paddingTop: 10 },
  calcLabel:     { fontSize: 13, color: C.textSub },
  calcLabelBold: { fontSize: 14, fontWeight: '700', color: C.text },
  calcVal:       { fontSize: 13, fontWeight: '600', color: C.text },
  calcSacas:     { fontSize: 22, fontWeight: '800', color: C.primary, letterSpacing: -0.5 },
});
