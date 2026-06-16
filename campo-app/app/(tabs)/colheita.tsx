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

type Tela = 'lista' | 'form';

const UMIDADE_PADRAO = { soja: 14, milho: 13, algodao: 8 };
const IMPUREZA_PADRAO = { soja: 1, milho: 1, algodao: 2 };

export default function ColheitaScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]           = useState<Tela>('lista');
  const [romaneios, setRomaneios] = useState<Record<string, unknown>[]>([]);
  const [talhoes, setTalhoes]     = useState<Talhao[]>([]);
  const [ciclos, setCiclos]       = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Form
  const [talhaoId, setTalhaoId]   = useState('');
  const [cicloId, setCicloId]     = useState('');
  const [data, setData]           = useState(() => new Date().toISOString().split('T')[0]);
  const [motorista, setMotorista] = useState('');
  const [placa, setPlaca]         = useState('');
  const [destino, setDestino]     = useState('');
  const [pesoBruto, setPesoBruto] = useState('');
  const [tara, setTara]           = useState('');
  const [umidade, setUmidade]     = useState('');
  const [impureza, setImpureza]   = useState('');
  const [avariados, setAvariados] = useState('');
  const [salvando, setSalvando]   = useState(false);

  // Pickers
  const [pickerTalhao, setPickerTalhao] = useState(false);
  const [pickerCiclo, setPickerCiclo]   = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: roms }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from('romaneios').select('*, talhoes(nome), ciclos(descricao, cultura)').eq('fazenda_id', fazendaId).order('data_colheita', { ascending: false }).limit(30),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
    ]);
    setRomaneios((roms ?? []) as Record<string, unknown>[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function resetForm() {
    setTalhaoId(''); setCicloId(''); setData(new Date().toISOString().split('T')[0]);
    setMotorista(''); setPlaca(''); setDestino('');
    setPesoBruto(''); setTara(''); setUmidade(''); setImpureza(''); setAvariados('');
  }

  // Cálculos derivados
  const pesoLiquido = pesoBruto && tara ? Number(pesoBruto) - Number(tara) : null;

  function calcDescontoUmidade() {
    if (!pesoLiquido || !umidade) return 0;
    const ciclo = ciclos.find(c => c.id === cicloId);
    const padrao = (UMIDADE_PADRAO as Record<string, number>)[ciclo?.cultura?.toLowerCase() ?? ''] ?? 14;
    const u = Number(umidade);
    if (u <= padrao) return 0;
    return ((u - padrao) / (100 - padrao)) * pesoLiquido;
  }

  function calcDescontoImpureza() {
    if (!pesoLiquido || !impureza) return 0;
    const ciclo = ciclos.find(c => c.id === cicloId);
    const padrao = (IMPUREZA_PADRAO as Record<string, number>)[ciclo?.cultura?.toLowerCase() ?? ''] ?? 1;
    const imp = Number(impureza);
    if (imp <= padrao) return 0;
    return ((imp - padrao) / 100) * pesoLiquido;
  }

  const descUmid = calcDescontoUmidade();
  const descImp  = calcDescontoImpureza();
  const descAvar = pesoLiquido && avariados ? (Number(avariados) / 100) * pesoLiquido : 0;
  const pesoFinal = pesoLiquido ? Math.max(0, pesoLiquido - descUmid - descImp - descAvar) : null;
  const sacas = pesoFinal ? pesoFinal / 60 : null;

  const talhaoSelecionado = talhoes.find(t => t.id === talhaoId);
  const produtividadeSacaHa = sacas && talhaoSelecionado?.area_ha
    ? sacas / talhaoSelecionado.area_ha
    : null;

  async function salvar() {
    if (!talhaoId) { Alert.alert('Campo obrigatório', 'Selecione o talhão.'); return; }
    if (!cicloId)  { Alert.alert('Campo obrigatório', 'Selecione o ciclo.'); return; }
    if (!pesoBruto || !tara) { Alert.alert('Campo obrigatório', 'Informe peso bruto e tara.'); return; }
    if (!fazendaId) return;

    setSalvando(true);
    const { offline, error } = await saveOrQueue('romaneios', {
      fazenda_id: fazendaId,
      talhao_id: talhaoId,
      ciclo_id: cicloId,
      data_colheita: data,
      motorista: motorista || null,
      placa: placa || null,
      destino: destino || null,
      peso_bruto_kg: Number(pesoBruto),
      tara_kg: Number(tara),
      peso_liquido_kg: pesoLiquido,
      umidade_pct: umidade ? Number(umidade) : null,
      impureza_pct: impureza ? Number(impureza) : null,
      avariados_pct: avariados ? Number(avariados) : null,
      desconto_umidade_pct: descUmid > 0 ? (descUmid / (pesoLiquido ?? 1)) * 100 : 0,
      desconto_impureza_pct: descImp > 0 ? (descImp / (pesoLiquido ?? 1)) * 100 : 0,
      peso_final_kg: pesoFinal,
      sacas,
    });
    setSalvando(false);

    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(
      offline ? '📶 Salvo offline' : '✅ Registrado',
      offline
        ? 'Será enviado quando houver conexão.'
        : `Romaneio registrado!\n${sacas?.toFixed(1)} sacas${produtividadeSacaHa ? ` · ${produtividadeSacaHa.toFixed(1)} sc/ha` : ''}`,
      [{ text: 'OK', onPress: () => { resetForm(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.topTitulo}>Colheita / Romaneio</Text>
        </View>
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} size="large" />
        ) : (
          <FlatList
            data={romaneios}
            keyExtractor={r => String(r.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.vazio}>Nenhum romaneio registrado.</Text>}
            renderItem={({ item }) => {
              const sc = item.sacas ? Number(item.sacas).toFixed(0) : '—';
              return (
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={s.cardTitulo}>🌾 {(item.talhoes as Record<string,string>|null)?.nome ?? '—'}</Text>
                    <View style={s.scBadge}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: C.green }}>{sc} sc</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>{(item.ciclos as Record<string,string>|null)?.descricao ?? '—'} · {String(item.data_colheita)}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    {item.peso_final_kg ? <Text style={s.cardStat}>⚖ {(Number(item.peso_final_kg) / 1000).toFixed(2)}t</Text> : null}
                    {item.umidade_pct   ? <Text style={s.cardStat}>💧 {String(item.umidade_pct)}% umid.</Text> : null}
                    {item.motorista     ? <Text style={s.cardStat}>🚛 {String(item.motorista)}</Text> : null}
                  </View>
                </View>
              );
            }}
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
        <Text style={s.topTitulo}>Novo Romaneio</Text>
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

        <Text style={s.label}>Data da colheita</Text>
        <TextInput style={s.input} value={data} onChangeText={setData} placeholder="AAAA-MM-DD" placeholderTextColor={C.textWeak} />

        <Text style={s.label}>Motorista</Text>
        <TextInput style={s.input} value={motorista} onChangeText={setMotorista} placeholder="Nome do motorista" placeholderTextColor={C.textWeak} />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Placa</Text>
            <TextInput style={s.input} value={placa} onChangeText={setPlaca} placeholder="ABC-1234" placeholderTextColor={C.textWeak} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Destino</Text>
            <TextInput style={s.input} value={destino} onChangeText={setDestino} placeholder="Armazém / Tradings" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        {/* Pesagem */}
        <View style={s.secaoTitulo}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSub }}>⚖ Pesagem</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Peso bruto (kg) *</Text>
            <TextInput style={s.input} value={pesoBruto} onChangeText={setPesoBruto} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Tara (kg) *</Text>
            <TextInput style={s.input} value={tara} onChangeText={setTara} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.textWeak} />
          </View>
        </View>
        {pesoLiquido !== null && (
          <View style={s.resultadoRow}>
            <Text style={s.resultadoLabel}>Peso líquido</Text>
            <Text style={s.resultadoVal}>{pesoLiquido.toLocaleString('pt-BR')} kg</Text>
          </View>
        )}

        {/* Classificação */}
        <View style={s.secaoTitulo}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSub }}>🔬 Classificação</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Umidade (%)</Text>
            <TextInput style={s.input} value={umidade} onChangeText={setUmidade} keyboardType="decimal-pad" placeholder="%" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Impureza (%)</Text>
            <TextInput style={s.input} value={impureza} onChangeText={setImpureza} keyboardType="decimal-pad" placeholder="%" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Avariados (%)</Text>
            <TextInput style={s.input} value={avariados} onChangeText={setAvariados} keyboardType="decimal-pad" placeholder="%" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        {/* Resultado calculado */}
        {pesoFinal !== null && (
          <View style={s.resultadoCard}>
            <Text style={s.resultadoTitulo}>Resultado calculado</Text>
            <View style={s.resultadoRow}>
              <Text style={s.resultadoLabel}>Peso final</Text>
              <Text style={s.resultadoVal}>{pesoFinal.toLocaleString('pt-BR')} kg</Text>
            </View>
            <View style={[s.resultadoRow, { borderTopWidth: 0 }]}>
              <Text style={s.resultadoLabel}>Sacas (60 kg)</Text>
              <Text style={[s.resultadoVal, { color: C.green, fontSize: 20, fontWeight: '800' }]}>{sacas?.toFixed(1)} sc</Text>
            </View>
            {produtividadeSacaHa && (
              <View style={[s.resultadoRow, { borderTopWidth: 0 }]}>
                <Text style={s.resultadoLabel}>Produtividade</Text>
                <Text style={[s.resultadoVal, { color: C.primary }]}>{produtividadeSacaHa.toFixed(1)} sc/ha</Text>
              </View>
            )}
            {descUmid > 0 && <Text style={s.descontoTxt}>− {descUmid.toFixed(0)} kg umidade · − {descImp.toFixed(0)} kg impureza</Text>}
          </View>
        )}

        <TouchableOpacity style={[s.salvarBtn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color={C.white} /> : <Text style={s.salvarTxt}>Registrar Romaneio</Text>}
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
  cardSub:   { fontSize: 13, color: C.textSub, marginTop: 2 },
  cardStat:  { fontSize: 12, color: C.textTert },
  scBadge:   { backgroundColor: C.greenBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  fab:       { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#7D4A00', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  label:     { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 4 },
  input:     { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.text, marginBottom: 14 },
  picker:    { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  secaoTitulo:{ backgroundColor: C.primaryLight, borderRadius: 8, padding: 10, marginBottom: 10 },
  resultadoCard:{ backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: C.border },
  resultadoTitulo:{ fontSize: 13, fontWeight: '700', color: C.textSub, marginBottom: 10 },
  resultadoRow:{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: C.border },
  resultadoLabel:{ fontSize: 13, color: C.textSub },
  resultadoVal:  { fontSize: 15, fontWeight: '700', color: C.text },
  descontoTxt:   { fontSize: 11, color: C.orange, marginTop: 4 },
  salvarBtn: { backgroundColor: '#7D4A00', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  salvarTxt: { color: C.white, fontSize: 16, fontWeight: '700' },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:  { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: C.text, paddingHorizontal: 16, marginBottom: 8 },
  modalItem:   { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.border },
});
