import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao, type Ciclo, type MonitoramentoPraga } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { uploadFoto } from '../../lib/storage';
import { C, T } from '../../constants/theme';
import { todayBR, formatDateInput, toISO, toBR } from '../../lib/date';

const CATALOGO: Record<string, string[]> = {
  praga: [
    'Lagarta-da-soja','Lagarta-falsa-medideira','Helicoverpa armigera',
    'Percevejo-marrom','Percevejo-verde','Percevejo-pequeno',
    'Mosca-branca','Pulgão','Trips','Ácaro-rajado','Ácaro-branco',
    'Lagarta-do-cartucho','Outra praga',
  ],
  doenca: [
    'Ferrugem-asiática','Mofo-branco','Mancha-alvo','Antracnose','Oídio',
    'Mancha-parda','Podridão-radicular','Mosaico','Nematoide-de-cisto',
    'Nematoide-de-galha','Enfezamento (milho)','Outra doença',
  ],
  planta_daninha: [
    'Buva resistente','Capim-amargoso resistente','Corda-de-viola','Picão-preto',
    'Trapoeraba','Leiteiro','Capim-colchão','Brachiaria','Caruru','Outra invasora',
  ],
};

const NIVEIS = [
  { n: 1, label: 'Baixo',   cor: C.green,  bg: C.greenBg  },
  { n: 2, label: 'Médio',   cor: '#D97706', bg: '#FFFBEB'  },
  { n: 3, label: 'Alto',    cor: '#EA580C', bg: '#FFF7ED'  },
  { n: 4, label: 'Crítico', cor: C.red,    bg: C.redBg    },
];

const TIPOS = [
  { k: 'praga',          label: 'Praga'         },
  { k: 'doenca',         label: 'Doença'        },
  { k: 'planta_daninha', label: 'Planta daninha'},
] as const;

type Tela = 'lista' | 'form';

export default function MonitoramentoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [registros, setRegistros]   = useState<MonitoramentoPraga[]>([]);
  const [talhoes, setTalhoes]       = useState<Talhao[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [tipo, setTipo]       = useState<'praga'|'doenca'|'planta_daninha'>('praga');
  const [nome, setNome]       = useState('');
  const [nivel, setNivel]     = useState(1);
  const [talhaoId, setTalhaoId] = useState('');
  const [cicloId, setCicloId]   = useState('');
  const [data, setData]       = useState(todayBR);
  const [pct, setPct]         = useState('');
  const [estagio, setEstagio] = useState('');
  const [acao, setAcao]       = useState('');
  const [obs, setObs]         = useState('');
  const [lat, setLat]         = useState<number|null>(null);
  const [lng, setLng]         = useState<number|null>(null);
  const [gpsAcc, setGpsAcc]   = useState<number|null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [fotos, setFotos]     = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [pickerNome, setPickerNome]     = useState(false);
  const [pickerTalhao, setPickerTalhao] = useState(false);
  const [pickerCiclo, setPickerCiclo]   = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: regs }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from('monitoramento_pragas').select('*').eq('fazenda_id', fazendaId).order('data_monitoramento', { ascending: false }).limit(50),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
      supabase.from('ciclos').select('id, cultura, descricao').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }),
    ]);
    setRegistros((regs ?? []) as MonitoramentoPraga[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function resetForm() {
    setTipo('praga'); setNome(''); setNivel(1);
    setTalhaoId(''); setCicloId('');
    setData(todayBR());
    setPct(''); setEstagio(''); setAcao(''); setObs('');
    setLat(null); setLng(null); setGpsAcc(null); setFotos([]);
  }

  async function capturarGps() {
    setGpsBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a localização nas configurações.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setLat(loc.coords.latitude); setLng(loc.coords.longitude); setGpsAcc(loc.coords.accuracy ?? null);
    } catch { Alert.alert('Erro GPS', 'Verifique se o GPS está ativo.'); }
    finally { setGpsBusy(false); }
  }

  async function tirarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a câmera nas configurações.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 });
    if (!result.canceled && result.assets[0]) setFotos(prev => [...prev, result.assets[0].uri]);
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('', 'Selecione o talhão.'); return; }
    if (!nome)     { Alert.alert('', 'Selecione a ocorrência.'); return; }
    if (!fazendaId) return;
    setSalvando(true);
    const urlsFotos: string[] = [];
    for (const uri of fotos) { const url = await uploadFoto(uri, 'monitoramento'); if (url) urlsFotos.push(url); }
    const { offline, error } = await saveOrQueue('monitoramento_pragas', {
      fazenda_id: fazendaId, talhao_id: talhaoId, ciclo_id: cicloId || null,
      data_monitoramento: toISO(data), tipo, nome, nivel,
      percentual_infestacao: pct ? Number(pct) : null,
      estagio: estagio || null, acao_recomendada: acao || null, obs: obs || null,
      lat, lng, fotos: urlsFotos.length ? urlsFotos : null,
    });
    setSalvando(false);
    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(offline ? 'Salvo offline' : 'Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Ocorrência registrada.',
      [{ text: 'OK', onPress: () => { resetForm(); setTela('lista'); carregar(); } }]);
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Monitoramento</Text>
        </View>

        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={registros}
              keyExtractor={r => r.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListEmptyComponent={<Text style={s.vazio}>Nenhuma ocorrência registrada.</Text>}
              renderItem={({ item }) => {
                const nv = NIVEIS.find(n => n.n === item.nivel) ?? NIVEIS[0];
                const tal = talhoes.find(t => t.id === item.talhao_id);
                return (
                  <View style={[T.card, { borderLeftWidth: 3, borderLeftColor: nv.cor }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[T.h3, { flex: 1, marginRight: 8 }]}>{item.nome}</Text>
                      <View style={[s.badge, { backgroundColor: nv.bg }]}>
                        <Text style={[s.badgeTxt, { color: nv.cor }]}>{nv.label}</Text>
                      </View>
                    </View>
                    <Text style={[T.caption, { marginTop: 5 }]}>{tal?.nome ?? '—'} · {toBR(item.data_monitoramento)}</Text>
                    {item.acao_recomendada
                      ? <Text style={[T.bodySub, { marginTop: 6, fontSize: 12 }]}>Ação: {item.acao_recomendada}</Text>
                      : null}
                    {item.fotos?.length
                      ? <Text style={[T.caption, { marginTop: 4 }]}>{item.fotos.length} foto(s) anexada(s)</Text>
                      : null}
                  </View>
                );
              }}
            />
          )}

        <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 72 }]} onPress={() => { resetForm(); setTela('form'); }}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  const nivelInfo = NIVEIS.find(n => n.n === nivel)!;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.barTitulo}>Nova Ocorrência</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        {/* Tipo */}
        <Text style={T.secLabel}>Tipo</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {TIPOS.map(t => (
            <TouchableOpacity key={t.k}
              style={[s.tipoBtn, tipo === t.k && s.tipoBtnOn]}
              onPress={() => { setTipo(t.k); setNome(''); }}>
              <Text style={[s.tipoTxt, tipo === t.k && { color: C.primary, fontWeight: '600' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ocorrência */}
        <Text style={T.secLabel}>Ocorrência</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerNome(true)}>
          <Text style={{ color: nome ? C.text : C.textWeak, fontSize: 14 }}>{nome || 'Selecione…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        {/* Nível */}
        <Text style={T.secLabel}>Nível</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {NIVEIS.map(n => (
            <TouchableOpacity key={n.n}
              style={[s.nivelBtn, nivel === n.n && { backgroundColor: n.bg, borderColor: n.cor }]}
              onPress={() => setNivel(n.n)}>
              <View style={[s.nivelDot, { backgroundColor: n.cor }]} />
              <Text style={[s.nivelTxt, nivel === n.n && { color: n.cor, fontWeight: '600' }]}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Talhão / Ciclo */}
        <Text style={T.secLabel}>Localização agrícola</Text>
        <TouchableOpacity style={T.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: talhaoId ? C.text : C.textWeak, fontSize: 14 }}>{talhoes.find(t => t.id === talhaoId)?.nome ?? 'Talhão…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>
        <TouchableOpacity style={T.picker} onPress={() => setPickerCiclo(true)}>
          <Text style={{ color: cicloId ? C.text : C.textWeak, fontSize: 14 }}>{ciclos.find(c => c.id === cicloId)?.descricao ?? 'Ciclo (opcional)…'}</Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        {/* Data / % / Estágio */}
        <Text style={T.secLabel}>Detalhes</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextInput style={T.input} value={data} onChangeText={v => setData(formatDateInput(v))} placeholder="DD/MM/AAAA" placeholderTextColor={C.textWeak} keyboardType="numeric" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput style={T.input} value={pct} onChangeText={setPct} keyboardType="decimal-pad" placeholder="% infest." placeholderTextColor={C.textWeak} />
          </View>
        </View>
        <TextInput style={T.input} value={estagio} onChangeText={setEstagio} placeholder="Estágio (ex: V4, R1…)" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 72 }]} value={acao} onChangeText={setAcao} multiline placeholder="Ação recomendada…" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 56 }]} value={obs} onChangeText={setObs} multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        {/* GPS */}
        <Text style={T.secLabel}>Localização GPS</Text>
        <TouchableOpacity style={[s.gpsBtn, lat !== null && { borderColor: C.primary, backgroundColor: C.primaryLight }]} onPress={capturarGps} disabled={gpsBusy}>
          {gpsBusy
            ? <ActivityIndicator color={C.primary} size="small" />
            : <Ionicons name="location-outline" size={18} color={lat !== null ? C.primary : C.textWeak} />}
          <Text style={[s.gpsTxt, lat !== null && { color: C.primary }]}>
            {gpsBusy ? 'Aguarde…' : lat !== null ? `${lat.toFixed(5)}, ${lng?.toFixed(5)}  ±${gpsAcc?.toFixed(0)}m` : 'Capturar localização'}
          </Text>
        </TouchableOpacity>

        {/* Fotos */}
        <Text style={T.secLabel}>Fotos</Text>
        <TouchableOpacity style={s.fotoBtn} onPress={tirarFoto}>
          <Ionicons name="camera-outline" size={18} color={C.textSub} />
          <Text style={s.fotoBtnTxt}>Tirar foto</Text>
        </TouchableOpacity>
        {fotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {fotos.map((uri, i) => (
              <View key={i} style={{ marginRight: 8, position: 'relative' }}>
                <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
                <TouchableOpacity onPress={() => setFotos(prev => prev.filter((_, j) => j !== i))} style={s.removeBtn}>
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Salvar */}
        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar ocorrência</Text>}
        </TouchableOpacity>

      </ScrollView>

      <ListPickerModal visible={pickerNome} titulo="Ocorrência" itens={CATALOGO[tipo]}
        onSelect={v => { setNome(v); setPickerNome(false); }} onClose={() => setPickerNome(false)} />
      <ListPickerModal visible={pickerTalhao} titulo="Talhão"
        itens={talhoes.map(t => `${t.nome} · ${t.area_ha} ha`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }} onClose={() => setPickerTalhao(false)} />
      <ListPickerModal visible={pickerCiclo} titulo="Ciclo"
        itens={['— Nenhum —', ...ciclos.map(c => c.descricao)]}
        onSelect={(_, i) => { setCicloId(i === 0 ? '' : ciclos[i - 1].id); setPickerCiclo(false); }} onClose={() => setPickerCiclo(false)} />
    </View>
  );
}

// ── Picker modal compartilhado ────────────────────────────────────────────────

export function ListPickerModal({ visible, titulo, itens, onSelect, onClose }: {
  visible: boolean; titulo: string; itens: string[];
  onSelect: (v: string, i: number) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitulo}>{titulo}</Text>
        <FlatList data={itens} keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={s.sheetItem} onPress={() => onSelect(item, index)}>
              <Text style={{ fontSize: 14, color: C.text }}>{item}</Text>
            </TouchableOpacity>
          )} />
      </View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  bar:       { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  barTitulo: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },

  vazio: { textAlign: 'center', color: C.textWeak, marginTop: 48, fontSize: 14 },

  badge:    { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute', right: 20, width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },

  tipoBtn:  { flex: 1, borderWidth: 0.5, borderColor: C.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: C.surface },
  tipoBtnOn:{ borderColor: C.primary, backgroundColor: C.primaryLight },
  tipoTxt:  { fontSize: 12, color: C.textSub },

  nivelBtn: { flex: 1, borderWidth: 0.5, borderColor: C.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', gap: 4, backgroundColor: C.surface },
  nivelDot: { width: 8, height: 8, borderRadius: 4 },
  nivelTxt: { fontSize: 11, color: C.textSub },

  gpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: 8, padding: 13, marginBottom: 14 },
  gpsTxt: { fontSize: 13, color: C.textSub, flex: 1 },

  fotoBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: 8, padding: 13, marginBottom: 12 },
  fotoBtnTxt: { fontSize: 14, color: C.textSub },
  removeBtn:  { position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet:   { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '72%', paddingBottom: 32 },
  sheetHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  sheetTitulo: { fontSize: 14, fontWeight: '700', color: C.text, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight },
  sheetItem:   { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.borderLight },
});
