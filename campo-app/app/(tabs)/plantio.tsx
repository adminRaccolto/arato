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

const VARIEDADES: Record<string, string[]> = {
  soja:    ['TMG 7062 IPRO','M 6410 IPRO','NS 7709 IPRO','DM 65i62 RSF IPRO','SYN 1365i','Outra'],
  milho:   ['DKB 390 PRO3','P3431H','SX 7331H','AG 8088 PRO3','P3340H','Outra'],
  algodao: ['TMG 47 B2RF','FM 985 GLTP','IMA CV 690 B2RF','Outra'],
};

type InsumoOpt = { id: string; nome: string; categoria: string; unidade: string; estoque: number; custo_medio: number };
type Tela = 'lista' | 'form';

export default function PlantioScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]         = useState<Tela>('lista');
  const [plantios, setPlantios] = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]   = useState<Talhao[]>([]);
  const [ciclos, setCiclos]     = useState<Ciclo[]>([]);
  const [insumos, setInsumos]   = useState<InsumoOpt[]>([]);
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
  const [insumoSel, setInsumoSel]   = useState<InsumoOpt | null>(null);
  const [qtdSemente, setQtdSemente] = useState('');
  const [salvando, setSalvando]     = useState(false);

  const [pickerTalhao, setPickerTalhao]       = useState(false);
  const [pickerCiclo, setPickerCiclo]         = useState(false);
  const [pickerVariedade, setPickerVariedade] = useState(false);
  const [pickerInsumo, setPickerInsumo]       = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: pl }, { data: tal }, { data: cic }, { data: ins }] = await Promise.all([
      supabase.from('plantios')
        .select('*, talhoes(nome), ciclos(descricao)')
        .eq('fazenda_id', fazendaId)
        .order('data_plantio', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
      supabase.from('insumos').select('id, nome, categoria, unidade, estoque, custo_medio').eq('fazenda_id', fazendaId).order('nome'),
    ]);
    setPlantios((pl ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setInsumos((ins ?? []) as InsumoOpt[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTalhaoId(''); setCicloId(''); setData(todayBR());
    setVariedade(''); setDensidade(''); setEspacamento('');
    setAreaHa(''); setOperador(''); setMaquina(''); setObs('');
    setInsumoSel(null); setQtdSemente('');
  }

  const cicloAtivo       = ciclos.find(c => c.id === cicloId);
  const variedadesLista  = VARIEDADES[cicloAtivo?.cultura?.toLowerCase() ?? ''] ?? ['Outra variedade'];
  const custoTotal       = insumoSel && qtdSemente ? Number(qtdSemente) * insumoSel.custo_medio : 0;
  const semEstoque       = insumoSel && qtdSemente ? Number(qtdSemente) > insumoSel.estoque : false;

  // Prefere categoria semente; mostra todos se não houver
  const insumosLista = (() => {
    const sementes = insumos.filter(i => i.categoria?.toLowerCase().includes('sement'));
    return sementes.length > 0 ? sementes : insumos;
  })();

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('', 'Selecione o ciclo.'); return; }
    if (!fazendaId) return;
    setSalvando(true);

    const dataISO = toISO(data);
    const payload = {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId,
      data_plantio: dataISO, variedade: variedade || null,
      densidade_sementes_ha: densidade ? Number(densidade) : null,
      espacamento_cm: espacamento ? Number(espacamento) : null,
      area_plantada_ha: areaHa ? Number(areaHa) : null,
      operador: operador || null, maquina: maquina || null, obs: obs || null,
      insumo_id: insumoSel?.id ?? null,
      quantidade_semente_kg: qtdSemente ? Number(qtdSemente) : null,
      custo_semente_total: custoTotal > 0 ? custoTotal : null,
    };

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      await enqueue('plantios', payload);
      setSalvando(false);
      Alert.alert('Salvo offline',
        'Será enviado quando houver conexão. Baixa de estoque de semente será processada ao sincronizar.',
        [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }]);
      return;
    }

    const { data: plant, error: errPlant } = await supabase
      .from('plantios').insert(payload).select('id').single();
    if (errPlant) { setSalvando(false); Alert.alert('Erro', errPlant.message); return; }

    if (insumoSel && qtdSemente && Number(qtdSemente) > 0) {
      await supabase.from('movimentacoes_estoque').insert({
        fazenda_id: fazendaId,
        insumo_id: insumoSel.id,
        tipo: 'saida',
        motivo: 'plantio',
        quantidade: Number(qtdSemente),
        data: dataISO,
        ciclo_id: cicloId,
        observacao: `Plantio — ${insumoSel.nome}${variedade ? ` (${variedade})` : ''}`,
        auto: true,
        valor_unitario: insumoSel.custo_medio,
      });
    }

    setSalvando(false);
    Alert.alert(
      'Plantio registrado',
      [
        areaHa ? `Área: ${areaHa} ha` : null,
        insumoSel && qtdSemente ? `Semente: ${qtdSemente} ${insumoSel.unidade} de ${insumoSel.nome}` : null,
        custoTotal > 0 ? `Custo semente: R$ ${custoTotal.toFixed(2)}` : null,
      ].filter(Boolean).join('\n') || 'Plantio registrado com sucesso.',
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
  }

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
                  {item.quantidade_semente_kg ? (
                    <Text style={[T.caption, { color: C.primary, fontWeight: '600', marginTop: 2 }]}>
                      ↓ Semente: {String(item.quantidade_semente_kg)} kg
                      {item.custo_semente_total ? ` · R$ ${Number(item.custo_semente_total).toFixed(2)}` : ''}
                    </Text>
                  ) : null}
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

        <Text style={T.secLabel}>Operação</Text>
        <TextInput style={T.input} value={data} onChangeText={v => setData(formatDateInput(v))}
          placeholder="DD/MM/AAAA" placeholderTextColor={C.textWeak} keyboardType="numeric" maxLength={10} />
        <TouchableOpacity style={T.picker} onPress={() => variedadesLista.length ? setPickerVariedade(true) : Alert.alert('', 'Selecione o ciclo primeiro.')}>
          <Text style={{ color: variedade ? C.text : C.textWeak, fontSize: 14 }}>{variedade || 'Variedade…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[T.input, { flex: 1 }]} value={densidade} onChangeText={setDensidade}
            keyboardType="decimal-pad" placeholder="Densidade (sem./m²)" placeholderTextColor={C.textWeak} />
          <TextInput style={[T.input, { flex: 1 }]} value={espacamento} onChangeText={setEspacamento}
            keyboardType="decimal-pad" placeholder="Espaçamento (cm)" placeholderTextColor={C.textWeak} />
        </View>
        <TextInput style={T.input} value={areaHa} onChangeText={setAreaHa}
          keyboardType="decimal-pad" placeholder="Área plantada (ha)" placeholderTextColor={C.textWeak} />

        <Text style={T.secLabel}>Semente — Baixa de Estoque</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerInsumo(true)}>
          <Text style={{ color: insumoSel ? C.text : C.textWeak, fontSize: 14 }} numberOfLines={1}>
            {insumoSel
              ? `${insumoSel.nome} · Estoque: ${insumoSel.estoque.toFixed(1)} ${insumoSel.unidade}`
              : 'Selecionar semente do estoque…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        {insumoSel && (
          <TextInput style={T.input} value={qtdSemente} onChangeText={setQtdSemente}
            keyboardType="decimal-pad"
            placeholder={`Quantidade (${insumoSel.unidade})`}
            placeholderTextColor={C.textWeak} />
        )}
        {custoTotal > 0 && (
          <View style={s.preview}>
            <View style={s.previewRow}>
              <Text style={s.previewLabel}>Custo unitário</Text>
              <Text style={s.previewVal}>R$ {insumoSel!.custo_medio.toFixed(4)}/{insumoSel!.unidade}</Text>
            </View>
            <View style={[s.previewRow, { borderTopWidth: 0.5, borderTopColor: C.border, marginTop: 4, paddingTop: 8 }]}>
              <Text style={[s.previewLabel, { fontWeight: '700' }]}>Custo total semente</Text>
              <Text style={[s.previewVal, { color: C.primary, fontWeight: '700', fontSize: 15 }]}>
                R$ {custoTotal.toFixed(2)}
              </Text>
            </View>
            {semEstoque && (
              <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
                ⚠ Quantidade superior ao estoque disponível ({insumoSel!.estoque.toFixed(1)} {insumoSel!.unidade})
              </Text>
            )}
          </View>
        )}

        <Text style={T.secLabel}>Equipe e maquinário</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador}
          placeholder="Operador" placeholderTextColor={C.textWeak} />
        <TextInput style={T.input} value={maquina} onChangeText={setMaquina}
          placeholder="Máquina" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 72 }]} value={obs} onChangeText={setObs}
          multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar plantio</Text>}
        </TouchableOpacity>

      </ScrollView>

      <ListPickerModal visible={pickerTalhao} titulo="Talhão"
        itens={talhoes.map(t => `${t.nome} · ${t.area_ha} ha`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)} />
      <ListPickerModal visible={pickerCiclo} titulo="Ciclo"
        itens={ciclos.map(c => c.descricao)}
        onSelect={(_, i) => { setCicloId(ciclos[i].id); setPickerCiclo(false); setVariedade(''); }}
        onClose={() => setPickerCiclo(false)} />
      <ListPickerModal visible={pickerVariedade} titulo="Variedade" itens={variedadesLista}
        onSelect={v => { setVariedade(v); setPickerVariedade(false); }}
        onClose={() => setPickerVariedade(false)} />
      <ListPickerModal
        visible={pickerInsumo} titulo="Semente — Estoque"
        itens={insumosLista.map(i =>
          `${i.nome} · ${i.estoque.toFixed(1)} ${i.unidade} disponível · R$ ${i.custo_medio.toFixed(2)}/${i.unidade}`
        )}
        onSelect={(_, i) => { setInsumoSel(insumosLista[i]); setPickerInsumo(false); }}
        onClose={() => setPickerInsumo(false)}
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
  preview: {
    backgroundColor: C.primaryLight, borderRadius: 10, padding: 14, marginBottom: 14,
    borderWidth: 0.5, borderColor: C.border,
  },
  previewRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontSize: 12, color: C.textSub },
  previewVal:   { fontSize: 13, color: C.text, fontWeight: '600' },
});
