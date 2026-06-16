import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, ActivityIndicator, Modal, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao, type Ciclo, type MonitoramentoPraga } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { uploadFoto } from '../../lib/storage';
import { C } from '../../constants/colors';

// ── Catálogos ────────────────────────────────────────────────────────────────

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
  { n: 1, label: 'Baixo',   emoji: '🟢', cor: '#166534', bg: C.greenBg,  sub: 'Abaixo do NE' },
  { n: 2, label: 'Médio',   emoji: '🟡', cor: '#92400E', bg: C.yellowBg, sub: 'Próx. ao NE'  },
  { n: 3, label: 'Alto',    emoji: '🟠', cor: '#9A3412', bg: C.orangeBg, sub: 'Acima do NE'  },
  { n: 4, label: 'Crítico', emoji: '🔴', cor: '#DC2626', bg: C.redBg,    sub: 'Emergencial'  },
];

const TIPOS = [
  { k: 'praga',         label: 'Praga',          icon: '🐛' },
  { k: 'doenca',        label: 'Doença',          icon: '🦠' },
  { k: 'planta_daninha',label: 'Planta daninha',  icon: '🌿' },
];

// ── Componente principal ─────────────────────────────────────────────────────

type Tela = 'lista' | 'form';

export default function MonitoramentoScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]           = useState<Tela>('lista');
  const [registros, setRegistros] = useState<MonitoramentoPraga[]>([]);
  const [talhoes, setTalhoes]     = useState<Talhao[]>([]);
  const [ciclos, setCiclos]       = useState<Ciclo[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Form
  const [tipo, setTipo]     = useState<'praga'|'doenca'|'planta_daninha'>('praga');
  const [nome, setNome]     = useState('');
  const [nivel, setNivel]   = useState(1);
  const [talhaoId, setTalhaoId] = useState('');
  const [cicloId, setCicloId]   = useState('');
  const [data, setData]     = useState(() => new Date().toISOString().split('T')[0]);
  const [pct, setPct]       = useState('');
  const [estagio, setEstagio] = useState('');
  const [acao, setAcao]     = useState('');
  const [obs, setObs]       = useState('');
  const [lat, setLat]       = useState<number|null>(null);
  const [lng, setLng]       = useState<number|null>(null);
  const [gpsAcc, setGpsAcc] = useState<number|null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [fotos, setFotos]   = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Pickers modais
  const [pickerNome, setPickerNome]   = useState(false);
  const [pickerTalhao, setPickerTalhao] = useState(false);
  const [pickerCiclo, setPickerCiclo] = useState(false);

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
    setData(new Date().toISOString().split('T')[0]);
    setPct(''); setEstagio(''); setAcao(''); setObs('');
    setLat(null); setLng(null); setGpsAcc(null);
    setFotos([]);
  }

  // GPS nativo de alta precisão
  async function capturarGps() {
    setGpsBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Ative a localização nas configurações do dispositivo.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      setGpsAcc(loc.coords.accuracy ?? null);
    } catch {
      Alert.alert('Erro GPS', 'Não foi possível obter a localização. Verifique se o GPS está ativo.');
    } finally {
      setGpsBusy(false);
    }
  }

  // Câmera nativa
  async function tirarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Ative a câmera nas configurações do dispositivo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setFotos(prev => [...prev, result.assets[0].uri]);
    }
  }

  async function salvar() {
    if (!talhaoId) { Alert.alert('Campo obrigatório', 'Selecione o talhão.'); return; }
    if (!nome)     { Alert.alert('Campo obrigatório', 'Selecione a ocorrência.'); return; }
    if (!fazendaId) return;

    setSalvando(true);

    // Upload de fotos primeiro
    const urlsFotos: string[] = [];
    for (const uri of fotos) {
      const url = await uploadFoto(uri, 'monitoramento');
      if (url) urlsFotos.push(url);
    }

    const payload = {
      fazenda_id: fazendaId,
      talhao_id: talhaoId,
      ciclo_id: cicloId || null,
      data_monitoramento: data,
      tipo,
      nome,
      nivel,
      percentual_infestacao: pct ? Number(pct) : null,
      estagio: estagio || null,
      acao_recomendada: acao || null,
      obs: obs || null,
      lat,
      lng,
      fotos: urlsFotos.length ? urlsFotos : null,
    };

    const { offline, error } = await saveOrQueue('monitoramento_pragas', payload as Record<string, unknown>);
    setSalvando(false);

    if (error) {
      Alert.alert('Erro', error);
      return;
    }

    Alert.alert(
      offline ? '📶 Salvo offline' : '✅ Registrado',
      offline ? 'Será enviado quando houver conexão.' : 'Ocorrência registrada com sucesso.',
      [{ text: 'OK', onPress: () => { resetForm(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.topTitulo}>Monitoramento</Text>
        </View>

        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} size="large" />
        ) : (
          <FlatList
            data={registros}
            keyExtractor={r => r.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.vazio}>Nenhuma ocorrência registrada.</Text>}
            renderItem={({ item }) => {
              const nv = NIVEIS.find(n => n.n === item.nivel) ?? NIVEIS[0];
              const tal = talhoes.find(t => t.id === item.talhao_id);
              return (
                <View style={[s.card, { borderLeftColor: nv.cor, borderLeftWidth: 4 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: C.text, flex: 1 }}>{item.nome}</Text>
                    <View style={[s.badge, { backgroundColor: nv.bg }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: nv.cor }}>{nv.emoji} {nv.label}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>📍 {tal?.nome ?? '—'} · {item.data_monitoramento}</Text>
                  {item.acao_recomendada ? <Text style={s.cardAcao}>Ação: {item.acao_recomendada}</Text> : null}
                  {item.fotos?.length ? <Text style={{ fontSize: 11, color: C.textWeak, marginTop: 4 }}>📷 {item.fotos.length} foto(s)</Text> : null}
                </View>
              );
            }}
          />
        )}

        {/* FAB */}
        <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 80 }]} onPress={() => { resetForm(); setTela('form'); }} activeOpacity={0.85}>
          <Text style={{ color: C.white, fontSize: 28, lineHeight: 32 }}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulário ─────────────────────────────────────────────────────────────

  const nomeExibido = talhoes.find(t => t.id === talhaoId)?.nome ?? '';
  const cicloExibido = ciclos.find(c => c.id === cicloId)?.descricao ?? '';
  const nivelInfo = NIVEIS.find(n => n.n === nivel)!;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setTela('lista')} style={{ paddingRight: 12 }}>
          <Text style={{ color: C.white, fontSize: 20 }}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitulo}>Nova Ocorrência</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* Tipo */}
        <Text style={s.label}>Tipo</Text>
        <View style={s.tiposRow}>
          {TIPOS.map(t => (
            <TouchableOpacity key={t.k} style={[s.tipoPill, tipo === t.k && s.tipoPillAtivo]} onPress={() => { setTipo(t.k as typeof tipo); setNome(''); }}>
              <Text style={{ fontSize: 16 }}>{t.icon}</Text>
              <Text style={[s.tipoPillTxt, tipo === t.k && { color: C.primary }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ocorrência */}
        <Text style={s.label}>Ocorrência *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setPickerNome(true)}>
          <Text style={{ color: nome ? C.text : C.textWeak, fontSize: 15 }}>{nome || 'Selecione…'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        {/* Nível */}
        <Text style={s.label}>Nível de infestação</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {NIVEIS.map(n => (
            <TouchableOpacity key={n.n} style={[s.nivelBtn, nivel === n.n && { backgroundColor: n.bg, borderColor: n.cor }]} onPress={() => setNivel(n.n)}>
              <Text style={{ fontSize: 18 }}>{n.emoji}</Text>
              <Text style={[s.nivelTxt, nivel === n.n && { color: n.cor, fontWeight: '700' }]}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Talhão */}
        <Text style={s.label}>Talhão *</Text>
        <TouchableOpacity style={s.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: nomeExibido ? C.text : C.textWeak, fontSize: 15 }}>{nomeExibido || 'Selecione…'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        {/* Ciclo */}
        <Text style={s.label}>Ciclo (opcional)</Text>
        <TouchableOpacity style={s.picker} onPress={() => setPickerCiclo(true)}>
          <Text style={{ color: cicloExibido ? C.text : C.textWeak, fontSize: 15 }}>{cicloExibido || 'Nenhum'}</Text>
          <Text style={{ color: C.textWeak }}>▾</Text>
        </TouchableOpacity>

        {/* Data */}
        <Text style={s.label}>Data</Text>
        <TextInput style={s.input} value={data} onChangeText={setData} placeholder="AAAA-MM-DD" placeholderTextColor={C.textWeak} />

        {/* % infestação */}
        <Text style={s.label}>% de infestação</Text>
        <TextInput style={s.input} value={pct} onChangeText={setPct} keyboardType="decimal-pad" placeholder="0-100" placeholderTextColor={C.textWeak} />

        {/* Estágio */}
        <Text style={s.label}>Estágio da cultura</Text>
        <TextInput style={s.input} value={estagio} onChangeText={setEstagio} placeholder="ex: V4, R1, R3…" placeholderTextColor={C.textWeak} />

        {/* Ação recomendada */}
        <Text style={s.label}>Ação recomendada</Text>
        <TextInput style={[s.input, { minHeight: 70 }]} value={acao} onChangeText={setAcao} multiline placeholder="Descreva a ação de controle…" placeholderTextColor={C.textWeak} />

        {/* Observações */}
        <Text style={s.label}>Observações</Text>
        <TextInput style={[s.input, { minHeight: 60 }]} value={obs} onChangeText={setObs} multiline placeholder="Informações adicionais…" placeholderTextColor={C.textWeak} />

        {/* GPS */}
        <Text style={s.label}>Localização GPS</Text>
        <TouchableOpacity style={[s.gpsBtn, lat !== null && { backgroundColor: C.primaryLight, borderColor: C.primary }]} onPress={capturarGps} disabled={gpsBusy} activeOpacity={0.8}>
          {gpsBusy ? <ActivityIndicator color={C.primary} /> : <Text style={{ fontSize: 20 }}>📍</Text>}
          <Text style={[s.gpsTxt, lat !== null && { color: C.primary }]}>
            {gpsBusy ? 'Obtendo GPS…' : lat !== null ? `${lat.toFixed(5)}, ${lng?.toFixed(5)} (±${gpsAcc?.toFixed(0)}m)` : 'Capturar localização'}
          </Text>
        </TouchableOpacity>

        {/* Fotos */}
        <Text style={s.label}>Fotos de campo</Text>
        <TouchableOpacity style={s.fotoBtn} onPress={tirarFoto} activeOpacity={0.8}>
          <Text style={{ fontSize: 22 }}>📷</Text>
          <Text style={s.fotoTxt}>Tirar foto</Text>
        </TouchableOpacity>
        {fotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {fotos.map((uri, i) => (
              <View key={i} style={{ marginRight: 8 }}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                <TouchableOpacity onPress={() => setFotos(prev => prev.filter((_, j) => j !== i))} style={s.fotoRemove}>
                  <Text style={{ color: C.white, fontSize: 12, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Salvar */}
        <TouchableOpacity style={[s.salvarBtn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
          {salvando ? <ActivityIndicator color={C.white} /> : <Text style={s.salvarTxt}>Registrar Ocorrência</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal: nome da ocorrência */}
      <ListPickerModal
        visible={pickerNome}
        titulo="Selecione a ocorrência"
        itens={CATALOGO[tipo]}
        onSelect={v => { setNome(v); setPickerNome(false); }}
        onClose={() => setPickerNome(false)}
      />

      {/* Modal: talhão */}
      <ListPickerModal
        visible={pickerTalhao}
        titulo="Selecione o talhão"
        itens={talhoes.map(t => `${t.nome} (${t.area_ha} ha)`)}
        onSelect={(_, i) => { setTalhaoId(talhoes[i].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)}
      />

      {/* Modal: ciclo */}
      <ListPickerModal
        visible={pickerCiclo}
        titulo="Selecione o ciclo"
        itens={['— Nenhum —', ...ciclos.map(c => c.descricao)]}
        onSelect={(_, i) => { setCicloId(i === 0 ? '' : ciclos[i - 1].id); setPickerCiclo(false); }}
        onClose={() => setPickerCiclo(false)}
      />
    </View>
  );
}

// ── Modal de seleção genérico ─────────────────────────────────────────────────

function ListPickerModal({
  visible, titulo, itens, onSelect, onClose,
}: {
  visible: boolean;
  titulo: string;
  itens: string[];
  onSelect: (valor: string, index: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={s.modalSheet}>
        <View style={s.modalHandle} />
        <Text style={s.modalTitulo}>{titulo}</Text>
        <FlatList
          data={itens}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={s.modalItem} onPress={() => onSelect(item, index)}>
              <Text style={{ fontSize: 15, color: C.text }}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  topBar:   { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  topTitulo:{ color: C.white, fontSize: 18, fontWeight: '700' },

  vazio: { textAlign: 'center', color: C.textWeak, marginTop: 40, fontSize: 14 },

  card:    { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: C.border },
  badge:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardSub: { fontSize: 12, color: C.textWeak, marginTop: 2 },
  cardAcao:{ fontSize: 12, color: C.textSub, marginTop: 4 },

  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },

  label:  { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 4 },
  input:  { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.text, marginBottom: 14 },
  picker: { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },

  tiposRow:    { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tipoPill:    { flex: 1, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 10, alignItems: 'center', gap: 4, backgroundColor: C.white },
  tipoPillAtivo:{ borderColor: C.primary, backgroundColor: C.primaryLight },
  tipoPillTxt: { fontSize: 11, color: C.textSub, fontWeight: '600', textAlign: 'center' },

  nivelBtn:  { flex: 1, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 8, alignItems: 'center', gap: 2, backgroundColor: C.white },
  nivelTxt:  { fontSize: 10, color: C.textSub },

  gpsBtn:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 14 },
  gpsTxt:  { fontSize: 13, color: C.textSub, flex: 1 },

  fotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 12 },
  fotoTxt: { fontSize: 14, color: C.textSub },
  fotoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },

  salvarBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  salvarTxt: { color: C.white, fontSize: 16, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:   { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHandle:  { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  modalTitulo:  { fontSize: 16, fontWeight: '700', color: C.text, paddingHorizontal: 16, marginBottom: 8 },
  modalItem:    { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.border },
});
