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

type ProdutoItem = {
  insumo_id: string;
  nome: string;
  unidade: string;
  estoque: number;
  custo_medio: number;
  quantidade: string;
};
type InsumoOpt = { id: string; nome: string; categoria: string; unidade: string; estoque: number; custo_medio: number };
type Tela = 'lista' | 'form';

function emptyProduto(): ProdutoItem {
  return { insumo_id: '', nome: '', unidade: 'L', estoque: 0, custo_medio: 0, quantidade: '' };
}

// ── Semáforo de condições ideais de pulverização ───────────────────────────

type Status = 'ok' | 'atencao' | 'ruim' | 'vazio';

function avaliarClima(tempStr: string, umidStr: string, ventoStr: string): {
  status: Status; mensagem: string;
  itens: { label: string; valor: string; status: Status; dica: string }[];
} {
  const t = Number(tempStr), u = Number(umidStr), v = Number(ventoStr);
  const itens = [];
  let pontos = 0, total = 0;
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

const STATUS_COR:  Record<Status, string> = { ok: '#16A34A', atencao: '#D97706', ruim: '#DC2626', vazio: '#9CA3AF' };
const STATUS_BG:   Record<Status, string> = { ok: '#F0FDF4', atencao: '#FFFBEB', ruim: '#FEF2F2', vazio: '#F9FAFB' };
const STATUS_ICON: Record<Status, React.ComponentProps<typeof Ionicons>['name']> = {
  ok: 'checkmark-circle', atencao: 'warning', ruim: 'close-circle', vazio: 'ellipse-outline',
};

function ClimaCheck({ temp, umid, vento }: { temp: string; umid: string; vento: string }) {
  const { status, mensagem, itens } = avaliarClima(temp, umid, vento);
  if (status === 'vazio') return null;
  const cor = STATUS_COR[status], bg = STATUS_BG[status];
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

// ── Tela principal ─────────────────────────────────────────────────────────

export default function PulverizacaoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [registros, setRegistros]   = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]       = useState<Talhao[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [insumos, setInsumos]       = useState<InsumoOpt[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [talhaoId, setTalhaoId]   = useState('');
  const [cicloId, setCicloId]     = useState('');
  const [data, setData]           = useState(todayBR);
  const [areaHa, setAreaHa]       = useState('');
  const [volume, setVolume]       = useState('');
  const [operador, setOperador]   = useState('');
  const [maquina, setMaquina]     = useState('');
  const [temp, setTemp]           = useState('');
  const [umid, setUmid]           = useState('');
  const [vento, setVento]         = useState('');
  const [obs, setObs]             = useState('');
  const [produtos, setProdutos]   = useState<ProdutoItem[]>([emptyProduto()]);
  const [salvando, setSalvando]   = useState(false);

  const [pickerTalhao, setPickerTalhao]         = useState(false);
  const [pickerCiclo, setPickerCiclo]           = useState(false);
  const [pickerInsumoIdx, setPickerInsumoIdx]   = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: regs }, { data: tal }, { data: cic }, { data: ins }] = await Promise.all([
      supabase.from('pulverizacoes')
        .select('*, talhoes(nome), ciclos(descricao)')
        .eq('fazenda_id', fazendaId)
        .order('data_pulverizacao', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
      supabase.from('insumos').select('id, nome, categoria, unidade, estoque, custo_medio').eq('fazenda_id', fazendaId).order('nome'),
    ]);
    setRegistros((regs ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setInsumos((ins ?? []) as InsumoOpt[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTalhaoId(''); setCicloId(''); setData(todayBR());
    setAreaHa(''); setVolume(''); setOperador(''); setMaquina('');
    setTemp(''); setUmid(''); setVento(''); setObs('');
    setProdutos([emptyProduto()]);
  }

  function updQtd(i: number, v: string) {
    setProdutos(p => p.map((x, j) => j === i ? { ...x, quantidade: v } : x));
  }

  function selecionarInsumo(idx: number, ins: InsumoOpt) {
    setProdutos(p => p.map((x, j) => j === idx ? {
      insumo_id: ins.id, nome: ins.nome, unidade: ins.unidade,
      estoque: ins.estoque, custo_medio: ins.custo_medio, quantidade: x.quantidade,
    } : x));
    setPickerInsumoIdx(null);
  }

  const produtosValidos  = produtos.filter(p => p.insumo_id && Number(p.quantidade) > 0);
  const custoTotalGeral  = produtosValidos.reduce((s, p) => s + Number(p.quantidade) * p.custo_medio, 0);
  const temSemEstoque    = produtosValidos.some(p => Number(p.quantidade) > p.estoque);

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('', 'Selecione o ciclo.'); return; }
    if (!produtosValidos.length) { Alert.alert('', 'Selecione ao menos um produto com quantidade informada.'); return; }
    if (!fazendaId) return;
    setSalvando(true);

    const dataISO = toISO(data);
    const payload = {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId,
      data_pulverizacao: dataISO,
      area_ha: areaHa ? Number(areaHa) : null,
      volume_calda_ha: volume ? Number(volume) : null,
      operador: operador || null, maquina: maquina || null,
      temperatura: temp ? Number(temp) : null,
      umidade: umid ? Number(umid) : null,
      velocidade_vento: vento ? Number(vento) : null,
      produtos: produtosValidos.map(p => ({
        insumo_id: p.insumo_id, nome: p.nome,
        quantidade: Number(p.quantidade), unidade: p.unidade,
        custo_unitario: p.custo_medio,
        custo_total: Number(p.quantidade) * p.custo_medio,
      })),
      obs: obs || null,
    };

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      await enqueue('pulverizacoes', payload);
      setSalvando(false);
      Alert.alert('Salvo offline',
        'Será enviado quando houver conexão. Baixas de estoque serão processadas ao sincronizar.',
        [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }]);
      return;
    }

    const { data: pulv, error: errPulv } = await supabase
      .from('pulverizacoes').insert(payload).select('id').single();
    if (errPulv) { setSalvando(false); Alert.alert('Erro', errPulv.message); return; }

    // Baixa de estoque de cada produto aplicado
    for (const p of produtosValidos) {
      await supabase.from('movimentacoes_estoque').insert({
        fazenda_id: fazendaId,
        insumo_id: p.insumo_id,
        tipo: 'saida',
        motivo: 'pulverizacao',
        quantidade: Number(p.quantidade),
        data: dataISO,
        ciclo_id: cicloId,
        observacao: `Pulverização — ${p.nome}`,
        auto: true,
        valor_unitario: p.custo_medio,
      });
    }

    setSalvando(false);
    Alert.alert(
      'Pulverização registrada',
      [
        `${produtosValidos.length} produto(s) aplicado(s)`,
        `Custo total: R$ ${custoTotalGeral.toFixed(2)}`,
        `Ciclo: ${ciclos.find(c => c.id === cicloId)?.descricao ?? ''}`,
      ].join('\n'),
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
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
              renderItem={({ item }) => {
                type ProdRow = { nome: string; quantidade: number; unidade: string; custo_total?: number };
                const prods = (Array.isArray(item.produtos) ? item.produtos : []) as ProdRow[];
                const custoCard = prods.reduce((sum, p) => sum + (p.custo_total ?? 0), 0);
                return (
                  <View style={T.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={T.h3}>{(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                      <Text style={T.caption}>{toBR(String(item.data_pulverizacao))}</Text>
                    </View>
                    <Text style={[T.bodySub, { marginTop: 4 }]}>
                      {(item.ciclos as Record<string,string>|null)?.descricao ?? '—'}
                    </Text>
                    {prods.length > 0 && (
                      <Text style={[T.caption, { marginTop: 4 }]}>
                        {prods.map(p => `${p.nome} ${p.quantidade} ${p.unidade}`).join(' · ')}
                      </Text>
                    )}
                    {custoCard > 0 && (
                      <Text style={[T.caption, { color: C.primary, fontWeight: '600', marginTop: 2 }]}>
                        Custo: R$ {custoCard.toFixed(2)}
                      </Text>
                    )}
                    {item.area_ha ? (
                      <Text style={T.caption}>{String(item.area_ha)} ha · {String(item.volume_calda_ha ?? '—')} L/ha</Text>
                    ) : null}
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
        <Text style={s.barTitulo}>Nova Pulverização</Text>
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

        <Text style={T.secLabel}>Data</Text>
        <TextInput style={T.input} value={data} onChangeText={v => setData(formatDateInput(v))}
          placeholder="DD/MM/AAAA" placeholderTextColor={C.textWeak} keyboardType="numeric" maxLength={10} />

        <Text style={T.secLabel}>Produtos — Baixa de Estoque</Text>
        {produtos.map((pr, i) => (
          <View key={i} style={s.prodBloco}>
            {/* Seletor de insumo */}
            <TouchableOpacity style={[T.picker, { marginBottom: 8 }]} onPress={() => setPickerInsumoIdx(i)}>
              <Text style={{ color: pr.insumo_id ? C.text : C.textWeak, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {pr.insumo_id
                  ? `${pr.nome} · ${pr.estoque.toFixed(1)} ${pr.unidade} disponível`
                  : 'Selecionar produto do estoque…'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.textWeak} />
            </TouchableOpacity>

            {/* Quantidade + remover */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[T.input, { flex: 1, marginBottom: 0 }]}
                value={pr.quantidade} onChangeText={v => updQtd(i, v)}
                keyboardType="decimal-pad"
                placeholder={pr.insumo_id ? `Qtd aplicada (${pr.unidade})` : 'Quantidade'}
                placeholderTextColor={C.textWeak}
              />
              {produtos.length > 1 && (
                <TouchableOpacity onPress={() => setProdutos(p => p.filter((_, j) => j !== i))}>
                  <Ionicons name="close-circle-outline" size={22} color={C.textWeak} />
                </TouchableOpacity>
              )}
            </View>

            {/* Preview custo por produto */}
            {pr.insumo_id && Number(pr.quantidade) > 0 && (
              <View style={s.prodCusto}>
                <Text style={s.prodCustoTxt}>
                  R$ {pr.custo_medio.toFixed(4)}/{pr.unidade} × {pr.quantidade} = R$ {(Number(pr.quantidade) * pr.custo_medio).toFixed(2)}
                </Text>
                {Number(pr.quantidade) > pr.estoque && (
                  <Text style={{ color: C.red, fontSize: 11 }}>
                    ⚠ Superior ao estoque ({pr.estoque.toFixed(1)} {pr.unidade})
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={s.addBtn}
          onPress={() => setProdutos(p => [...p, emptyProduto()])}>
          <Ionicons name="add" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>Adicionar produto</Text>
        </TouchableOpacity>

        {/* Resumo de custo total */}
        {custoTotalGeral > 0 && (
          <View style={s.resumo}>
            <Text style={s.resumoLabel}>Custo total da aplicação</Text>
            <Text style={[s.resumoVal, temSemEstoque && { color: C.red }]}>
              R$ {custoTotalGeral.toFixed(2)}
            </Text>
          </View>
        )}

        <Text style={T.secLabel}>Área e volume</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={areaHa} onChangeText={setAreaHa}
            keyboardType="decimal-pad" placeholder="Área (ha)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={volume} onChangeText={setVolume}
            keyboardType="decimal-pad" placeholder="Volume (L/ha)" placeholderTextColor={C.textWeak} />
        </View>

        <Text style={T.secLabel}>Equipe e maquinário</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador}
          placeholder="Operador" placeholderTextColor={C.textWeak} />
        <TextInput style={T.input} value={maquina} onChangeText={setMaquina}
          placeholder="Máquina" placeholderTextColor={C.textWeak} />

        <Text style={T.secLabel}>Condições climáticas</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={temp} onChangeText={setTemp}
            keyboardType="decimal-pad" placeholder="Temp (°C)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={umid} onChangeText={setUmid}
            keyboardType="decimal-pad" placeholder="Umid (%)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={vento} onChangeText={setVento}
            keyboardType="decimal-pad" placeholder="Vento (km/h)" placeholderTextColor={C.textWeak} />
        </View>

        <ClimaCheck temp={temp} umid={umid} vento={vento} />

        <TextInput style={[T.input, { minHeight: 72 }]} value={obs} onChangeText={setObs}
          multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar pulverização</Text>}
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
        visible={pickerInsumoIdx !== null}
        titulo="Produto — Estoque"
        itens={insumos.map(i =>
          `${i.nome} · ${i.estoque.toFixed(1)} ${i.unidade} · R$ ${i.custo_medio.toFixed(2)}/${i.unidade}`
        )}
        onSelect={(_, i) => { if (pickerInsumoIdx !== null) selecionarInsumo(pickerInsumoIdx, insumos[i]); }}
        onClose={() => setPickerInsumoIdx(null)}
      />
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
  prodBloco: {
    backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: 0.5, borderColor: C.borderLight,
  },
  prodCusto: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight },
  prodCustoTxt: { fontSize: 11, color: C.textSub, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 0.5, borderColor: C.primary, borderRadius: 8,
    padding: 12, marginBottom: 12, justifyContent: 'center',
  },
  resumo: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.primaryLight, borderRadius: 10, padding: 14, marginBottom: 16,
    borderWidth: 0.5, borderColor: C.border,
  },
  resumoLabel: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  resumoVal:   { fontSize: 18, fontWeight: '800', color: C.primary, letterSpacing: -0.3 },
});
