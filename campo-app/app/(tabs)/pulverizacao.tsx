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

type Produto = { nome: string; dose: string; unidade: string };
type Tela = 'lista' | 'form';
const UNIDADES = ['L/ha', 'mL/ha', 'kg/ha', 'g/ha'];

// ── Semáforo de condições ideais de pulverização ───────────────────────────

type Status = 'ok' | 'atencao' | 'ruim' | 'vazio';

function avaliarClima(tempStr: string, umidStr: string, ventoStr: string): {
  status: Status; mensagem: string;
  itens: { label: string; valor: string; status: Status; dica: string }[];
} {
  const t = Number(tempStr);
  const u = Number(umidStr);
  const v = Number(ventoStr);
  const itens = [];
  let pontos = 0;
  let total  = 0;

  if (tempStr) {
    total++;
    const st: Status = t >= 15 && t <= 30 ? 'ok' : t > 30 && t <= 35 ? 'atencao' : 'ruim';
    if (st === 'ok') pontos += 2; else if (st === 'atencao') pontos += 1;
    itens.push({ label: 'Temperatura', valor: `${t}°C`, status: st, dica: st === 'ok' ? 'Ideal (15–30°C)' : t > 30 ? 'Alta — risco de volatilização' : 'Baixa — eficiência reduzida' });
  }
  if (umidStr) {
    total++;
    const st: Status = u >= 55 ? 'ok' : u >= 40 ? 'atencao' : 'ruim';
    if (st === 'ok') pontos += 2; else if (st === 'atencao') pontos += 1;
    itens.push({ label: 'Umidade', valor: `${u}%`, status: st, dica: st === 'ok' ? 'Boa — baixo risco de deriva' : u < 40 ? 'Muito baixa — deriva e evaporação' : 'Atenção — monitorar deriva' });
  }
  if (ventoStr) {
    total++;
    const st: Status = v <= 10 ? 'ok' : v <= 15 ? 'atencao' : 'ruim';
    if (st === 'ok') pontos += 2; else if (st === 'atencao') pontos += 1;
    itens.push({ label: 'Vento', valor: `${v} km/h`, status: st, dica: st === 'ok' ? 'Ideal (≤ 10 km/h)' : v <= 15 ? 'Atenção — pode haver deriva' : 'Suspender — risco alto de deriva' });
  }

  if (total === 0) return { status: 'vazio', mensagem: '', itens: [] };
  const ratio = pontos / (total * 2);
  const status: Status = ratio >= 0.8 ? 'ok' : ratio >= 0.5 ? 'atencao' : 'ruim';
  const mensagem = status === 'ok' ? 'Condições favoráveis para aplicação' : status === 'atencao' ? 'Condições aceitáveis — atenção redobrada' : 'Condições desfavoráveis — não recomendado';
  return { status, mensagem, itens };
}

const STATUS_COR: Record<Status, string> = { ok: '#16A34A', atencao: '#D97706', ruim: '#DC2626', vazio: '#9CA3AF' };
const STATUS_BG:  Record<Status, string> = { ok: '#F0FDF4', atencao: '#FFFBEB', ruim: '#FEF2F2', vazio: '#F9FAFB' };
const STATUS_ICON: Record<Status, React.ComponentProps<typeof Ionicons>['name']> = {
  ok: 'checkmark-circle', atencao: 'warning', ruim: 'close-circle', vazio: 'ellipse-outline',
};

function ClimaCheck({ temp, umid, vento }: { temp: string; umid: string; vento: string }) {
  const { status, mensagem, itens } = avaliarClima(temp, umid, vento);
  if (status === 'vazio') return null;
  const cor = STATUS_COR[status];
  const bg  = STATUS_BG[status];
  return (
    <View style={[cc.card, { backgroundColor: bg, borderColor: cor + '40' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name={STATUS_ICON[status]} size={18} color={cor} />
        <Text style={[cc.titulo, { color: cor }]}>{mensagem}</Text>
      </View>
      {itens.map(item => (
        <View key={item.label} style={cc.itemRow}>
          <View style={[cc.dot, { backgroundColor: STATUS_COR[item.status] }]} />
          <Text style={cc.itemLabel}>{item.label}</Text>
          <Text style={[cc.itemValor, { color: STATUS_COR[item.status] }]}>{item.valor}</Text>
          <Text style={cc.itemDica} numberOfLines={1}>{item.dica}</Text>
        </View>
      ))}
    </View>
  );
}

const cc = StyleSheet.create({
  card:      { borderRadius: 10, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  titulo:    { fontSize: 13, fontWeight: '700', flex: 1 },
  itemRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  dot:       { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  itemLabel: { fontSize: 12, color: '#374151', width: 84, fontWeight: '500' },
  itemValor: { fontSize: 12, fontWeight: '700', width: 60 },
  itemDica:  { flex: 1, fontSize: 11, color: '#6B7280' },
});

export default function PulverizacaoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]               = useState<Tela>('lista');
  const [registros, setRegistros]     = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]         = useState<Talhao[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [carregando, setCarregando]   = useState(true);

  const [talhaoId, setTalhaoId]       = useState('');
  const [cicloId, setCicloId]         = useState('');
  const [data, setData]               = useState(() => new Date().toISOString().split('T')[0]);
  const [areaHa, setAreaHa]           = useState('');
  const [volume, setVolume]           = useState('');
  const [operador, setOperador]       = useState('');
  const [maquina, setMaquina]         = useState('');
  const [temp, setTemp]               = useState('');
  const [umid, setUmid]               = useState('');
  const [vento, setVento]             = useState('');
  const [obs, setObs]                 = useState('');
  const [produtos, setProdutos]       = useState<Produto[]>([{ nome: '', dose: '', unidade: 'L/ha' }]);
  const [salvando, setSalvando]       = useState(false);

  const [pickerTalhao, setPickerTalhao]     = useState(false);
  const [pickerCiclo, setPickerCiclo]       = useState(false);
  const [pickerUnidade, setPickerUnidade]   = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: regs }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from('pulverizacoes').select('*, talhoes(nome), ciclos(descricao)').eq('fazenda_id', fazendaId).order('data_pulverizacao', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
    ]);
    setRegistros((regs ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTalhaoId(''); setCicloId(''); setData(new Date().toISOString().split('T')[0]);
    setAreaHa(''); setVolume(''); setOperador(''); setMaquina('');
    setTemp(''); setUmid(''); setVento(''); setObs('');
    setProdutos([{ nome: '', dose: '', unidade: 'L/ha' }]);
  }

  function updProd(i: number, f: keyof Produto, v: string) {
    setProdutos(p => p.map((x, j) => j === i ? { ...x, [f]: v } : x));
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('', 'Selecione o ciclo.'); return; }
    const prods = produtos.filter(p => p.nome.trim());
    if (!prods.length) { Alert.alert('', 'Informe ao menos um produto.'); return; }
    if (!fazendaId) return;
    setSalvando(true);
    const { offline, error } = await saveOrQueue('pulverizacoes', {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId,
      data_pulverizacao: data,
      area_ha: areaHa ? Number(areaHa) : null,
      volume_calda_ha: volume ? Number(volume) : null,
      operador: operador || null, maquina: maquina || null,
      temperatura: temp ? Number(temp) : null,
      umidade: umid ? Number(umid) : null,
      velocidade_vento: vento ? Number(vento) : null,
      produtos: prods, obs: obs || null,
    });
    setSalvando(false);
    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(offline ? 'Salvo offline' : 'Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Pulverização registrada.',
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }]);
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Pulverizações</Text>
        </View>
        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={registros}
              keyExtractor={r => String(r.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={s.vazio}>Nenhuma pulverização registrada.</Text>}
              renderItem={({ item }) => (
                <View style={T.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={T.h3}>{(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                    <Text style={T.caption}>{String(item.data_pulverizacao)}</Text>
                  </View>
                  <Text style={[T.bodySub, { marginTop: 4 }]}>{(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}</Text>
                  {Array.isArray(item.produtos) && item.produtos.length > 0
                    ? <Text style={[T.caption, { marginTop: 4 }]}>{(item.produtos as Produto[]).map(p => p.nome).join(' · ')}</Text>
                    : null}
                  {item.area_ha ? <Text style={T.caption}>{String(item.area_ha)} ha · {String(item.volume_calda_ha ?? '—')} L/ha</Text> : null}
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
        <Text style={s.barTitulo}>Nova Pulverização</Text>
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

        <Text style={T.secLabel}>Produtos</Text>
        {produtos.map((pr, i) => (
          <View key={i} style={s.prodRow}>
            <TextInput
              style={[T.input, { flex: 2, marginBottom: 0 }]}
              value={pr.nome} onChangeText={v => updProd(i, 'nome', v)}
              placeholder="Produto" placeholderTextColor={C.textWeak}
            />
            <TextInput
              style={[T.input, { flex: 1, marginBottom: 0, marginLeft: 8 }]}
              value={pr.dose} onChangeText={v => updProd(i, 'dose', v)}
              keyboardType="decimal-pad" placeholder="Dose" placeholderTextColor={C.textWeak}
            />
            <TouchableOpacity style={s.unidBtn} onPress={() => setPickerUnidade(i)}>
              <Text style={{ fontSize: 11, color: C.primary, fontWeight: '600' }}>{pr.unidade}</Text>
            </TouchableOpacity>
            {produtos.length > 1 && (
              <TouchableOpacity onPress={() => setProdutos(p => p.filter((_, j) => j !== i))} style={{ padding: 8 }}>
                <Ionicons name="close-circle-outline" size={20} color={C.textWeak} />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={s.addBtn} onPress={() => setProdutos(p => [...p, { nome: '', dose: '', unidade: 'L/ha' }])}>
          <Ionicons name="add" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>Adicionar produto</Text>
        </TouchableOpacity>

        <Text style={T.secLabel}>Área e volume</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="Área (ha)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={volume} onChangeText={setVolume} keyboardType="decimal-pad" placeholder="Volume (L/ha)" placeholderTextColor={C.textWeak} />
        </View>

        <Text style={T.secLabel}>Equipe e maquinário</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador} placeholder="Operador" placeholderTextColor={C.textWeak} />
        <TextInput style={T.input} value={maquina} onChangeText={setMaquina} placeholder="Máquina" placeholderTextColor={C.textWeak} />

        <Text style={T.secLabel}>Condições climáticas</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={temp} onChangeText={setTemp} keyboardType="decimal-pad" placeholder="Temp (°C)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={umid} onChangeText={setUmid} keyboardType="decimal-pad" placeholder="Umid (%)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={vento} onChangeText={setVento} keyboardType="decimal-pad" placeholder="Vento (km/h)" placeholderTextColor={C.textWeak} />
        </View>

        <ClimaCheck temp={temp} umid={umid} vento={vento} />

        <TextInput style={[T.input, { minHeight: 72 }]} value={obs} onChangeText={setObs} multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar pulverização</Text>}
        </TouchableOpacity>

      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Talhão" itens={talhoes.map(t => `${t.nome} · ${t.area_ha} ha`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }} onClose={() => setPickerTalhao(false)} />
      <ListPickerModal visible={pickerCiclo} titulo="Ciclo" itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); }} onClose={() => setPickerCiclo(false)} />
      <ListPickerModal visible={pickerUnidade !== null} titulo="Unidade" itens={UNIDADES}
        onSelect={v => { if (pickerUnidade !== null) updProd(pickerUnidade, 'unidade', v); setPickerUnidade(null); }}
        onClose={() => setPickerUnidade(null)} />
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
  prodRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  unidBtn: { backgroundColor: C.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 10, marginLeft: 6, minWidth: 48, alignItems: 'center' },
  addBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: C.primary, borderRadius: 8, padding: 12, marginBottom: 16, justifyContent: 'center' },
});
