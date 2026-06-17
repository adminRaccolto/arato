import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { syncQueue, queueCount } from '../../lib/offline';
import { C, T } from '../../constants/theme';

type Resumo = { talhoes: number; cicloAtivo: string; criticos: number };
type WidgetChuva = { mm24h: number; mm7d: number; ultimoMm: number; ultimoPonto: string; ultimaData: string };

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const GRUPOS_ACOES = [
  {
    titulo: 'Lavoura',
    itens: [
      { route: '/(tabs)/monitoramento', label: 'Monitoramento',   desc: 'Pragas, doenças e invasoras', icon: 'leaf-outline'       as const },
      { route: '/(tabs)/plantio',       label: 'Plantio',         desc: 'Registrar operação de plantio', icon: 'layers-outline'   as const },
      { route: '/(tabs)/pulverizacao',  label: 'Pulverização',    desc: 'Defensivos e foliares',       icon: 'water-outline'      as const },
      { route: '/(tabs)/colheita',      label: 'Colheita',        desc: 'Romaneio e produtividade',    icon: 'basket-outline'     as const },
    ],
  },
  {
    titulo: 'Clima e Campo',
    itens: [
      { route: '/(tabs)/pluviometria',  label: 'Pluviometria',    desc: 'Registro de chuvas por ponto', icon: 'rainy-outline'    as const },
      { route: '/(tabs)/abastecimento', label: 'Abastecimento',   desc: 'Combustível e horímetro',     icon: 'speedometer-outline' as const },
      { route: '/(tabs)/mapa',          label: 'Mapa de Talhões', desc: 'KML e localização GPS',       icon: 'map-outline'        as const },
    ],
  },
];

export default function HomeScreen() {
  const { fazendaId, nomeFazenda, emailUsuario, fazendas, setFazendaAtiva, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [resumo, setResumo]           = useState<Resumo>({ talhoes: 0, cicloAtivo: '—', criticos: 0 });
  const [widgetChuva, setWidgetChuva] = useState<WidgetChuva | null>(null);
  const [hora, setHora]               = useState('');
  const [pendentes, setPendentes]     = useState(0);
  const [syncing, setSyncing]         = useState(false);

  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    queueCount().then(setPendentes);
    if (!fazendaId) return;
    async function load() {
      const corte7d  = new Date(); corte7d.setDate(corte7d.getDate() - 7);
      const cutoff7d = corte7d.toISOString().split('T')[0];
      const hoje     = new Date().toISOString().split('T')[0];

      const [{ count: tal }, { data: ciclos }, { data: pragas }, { data: chuvas }] = await Promise.all([
        supabase.from('talhoes').select('id', { count: 'exact', head: true }).eq('fazenda_id', fazendaId!),
        supabase.from('ciclos').select('cultura, anos_safra(ano)').eq('fazenda_id', fazendaId!).order('created_at', { ascending: false }).limit(1),
        supabase.from('monitoramento_pragas').select('id').eq('fazenda_id', fazendaId!).eq('nivel', 4),
        supabase.from('leituras_pluviometricas').select('chuva_mm, data, ponto_nome').eq('fazenda_id', fazendaId!).gte('data', cutoff7d).order('data', { ascending: false }).order('hora', { ascending: false }),
      ]);
      const ciclo = ciclos?.[0];
      setResumo({
        talhoes: tal ?? 0,
        cicloAtivo: ciclo ? `${ciclo.cultura} ${(ciclo.anos_safra as unknown as { ano: string } | null)?.ano ?? ''}` : '—',
        criticos: pragas?.length ?? 0,
      });
      if (chuvas && chuvas.length > 0) {
        const mm7d  = chuvas.reduce((s: number, r: Record<string, unknown>) => s + Number(r.chuva_mm), 0);
        const mm24h = chuvas.filter((r: Record<string, unknown>) => String(r.data) >= hoje).reduce((s: number, r: Record<string, unknown>) => s + Number(r.chuva_mm), 0);
        const ultimo = chuvas[0] as Record<string, unknown>;
        setWidgetChuva({ mm24h, mm7d, ultimoMm: Number(ultimo.chuva_mm), ultimoPonto: String(ultimo.ponto_nome ?? '—'), ultimaData: String(ultimo.data) });
      }
    }
    load();
  }, [fazendaId]);

  async function handleSync() {
    setSyncing(true);
    const { synced, failed } = await syncQueue();
    setSyncing(false);
    setPendentes(failed);
    Alert.alert('Sincronização', synced > 0 ? `${synced} registro(s) enviado(s).` : 'Nada para sincronizar.');
  }

  function trocarFazenda() {
    if (fazendas.length <= 1) return;
    Alert.alert('Trocar fazenda', 'Escolha a fazenda ativa:',
      fazendas.map(f => ({ text: f.nome, onPress: () => setFazendaAtiva(f.id, f.nome) })),
    );
  }

  const nomeUsuario = emailUsuario?.split('@')[0] ?? 'operador';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerHora}>{hora} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
          <Text style={s.headerSaud}>{saudacao()}, {nomeUsuario}</Text>
          <TouchableOpacity onPress={trocarFazenda} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }} activeOpacity={fazendas.length > 1 ? 0.6 : 1}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.6)" />
            <Text style={s.headerFazenda}>{nomeFazenda ?? '—'}{fazendas.length > 1 ? '  ▾' : ''}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => Alert.alert('Encerrar sessão', 'Deseja sair?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: signOut }])}
          style={s.logoutBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>

        {/* Alerta crítico */}
        {resumo.criticos > 0 && (
          <TouchableOpacity style={s.alertCard} onPress={() => router.push('/(tabs)/monitoramento')} activeOpacity={0.85}>
            <View style={s.alertDot} />
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitulo}>{resumo.criticos} ocorrência{resumo.criticos > 1 ? 's' : ''} em nível crítico</Text>
              <Text style={s.alertSub}>Acesse Monitoramento para registrar ação</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.red} />
          </TouchableOpacity>
        )}

        {/* Fila offline */}
        {pendentes > 0 && (
          <TouchableOpacity style={s.offlineCard} onPress={handleSync} disabled={syncing} activeOpacity={0.85}>
            {syncing
              ? <ActivityIndicator color={C.accent} size="small" />
              : <Ionicons name="cloud-upload-outline" size={18} color={C.accent} />
            }
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.offlineTitulo}>{pendentes} registro{pendentes > 1 ? 's' : ''} aguardando sincronização</Text>
              <Text style={s.offlineSub}>Toque para enviar agora</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* KPIs */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiVal}>{resumo.talhoes}</Text>
            <Text style={s.kpiLbl}>Talhões</Text>
          </View>
          <View style={[s.kpiCard, { flex: 2 }]}>
            <Text style={[s.kpiVal, { fontSize: 13 }]} numberOfLines={1}>{resumo.cicloAtivo}</Text>
            <Text style={s.kpiLbl}>Ciclo ativo</Text>
          </View>
          <View style={[s.kpiCard, resumo.criticos > 0 && s.kpiCardAlert]}>
            <Text style={[s.kpiVal, resumo.criticos > 0 && { color: C.red }]}>{resumo.criticos}</Text>
            <Text style={s.kpiLbl}>Críticos</Text>
          </View>
        </View>

        {/* Widget pluviometria */}
        <TouchableOpacity
          style={s.chuvaCard}
          onPress={() => router.push('/(tabs)/pluviometria')}
          activeOpacity={0.85}
        >
          <View style={s.chuvaIconBox}>
            <Ionicons name="rainy-outline" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.chuvaTitulo}>Pluviometria</Text>
            {widgetChuva ? (
              <>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  <View>
                    <Text style={s.chuvaVal}>{widgetChuva.mm24h.toFixed(1)}</Text>
                    <Text style={s.chuvaLbl}>mm hoje</Text>
                  </View>
                  <View style={s.chuvaDivider} />
                  <View>
                    <Text style={s.chuvaVal}>{widgetChuva.mm7d.toFixed(1)}</Text>
                    <Text style={s.chuvaLbl}>mm / 7 dias</Text>
                  </View>
                </View>
                <Text style={s.chuvaUltimo} numberOfLines={1}>
                  Última: {widgetChuva.ultimoMm} mm em {widgetChuva.ultimoPonto} · {widgetChuva.ultimaData}
                </Text>
              </>
            ) : (
              <Text style={s.chuvaSemDados}>Nenhuma leitura registrada</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={15} color={C.textWeak} />
        </TouchableOpacity>

        {/* Ações agrupadas */}
        {GRUPOS_ACOES.map(grupo => (
          <View key={grupo.titulo} style={{ marginBottom: 8 }}>
            <Text style={[T.label, { marginBottom: 10 }]}>{grupo.titulo}</Text>
            <View style={{ gap: 1 }}>
              {grupo.itens.map((a, i) => (
                <TouchableOpacity
                  key={a.route}
                  style={[
                    s.acaoRow,
                    i === 0 && s.acaoRowFirst,
                    i === grupo.itens.length - 1 && s.acaoRowLast,
                  ]}
                  onPress={() => router.push(a.route as Parameters<typeof router.push>[0])}
                  activeOpacity={0.75}
                >
                  <View style={s.acaoIconBox}>
                    <Ionicons name={a.icon} size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.acaoLabel}>{a.label}</Text>
                    <Text style={s.acaoDesc}>{a.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={C.textWeak} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerHora:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.2 },
  headerSaud:    { fontSize: 19, fontWeight: '700', color: '#fff', marginTop: 3, letterSpacing: -0.3 },
  headerFazenda: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  logoutBtn:     { padding: 4, marginTop: 4 },

  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.redBg, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: C.red,
    padding: 14, marginBottom: 10,
  },
  alertDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red, marginRight: 12 },
  alertTitulo:{ fontSize: 13, fontWeight: '600', color: C.red, flex: 1 },
  alertSub:   { fontSize: 11, color: '#B91C1C', marginTop: 1 },

  offlineCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.accentLight, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: C.accent,
    padding: 14, marginBottom: 10,
  },
  offlineTitulo: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  offlineSub:    { fontSize: 11, color: '#B45309', marginTop: 1 },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10, padding: 14,
    shadowColor: '#0B2D50', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  kpiCardAlert: { borderWidth: 0.5, borderColor: '#FECACA' },
  kpiVal:  { fontSize: 22, fontWeight: '700', color: C.primary, letterSpacing: -0.5 },
  kpiLbl:  { fontSize: 10, color: C.textWeak, marginTop: 2, fontWeight: '500' },

  acaoRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, padding: 14, paddingHorizontal: 16,
    borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
  },
  acaoRowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  acaoRowLast:  { borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderBottomWidth: 0 },
  acaoIconBox: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  acaoLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  acaoDesc:  { fontSize: 12, color: C.textWeak, marginTop: 1 },

  chuvaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10, padding: 14,
    marginBottom: 20, gap: 12,
    shadowColor: '#0B2D50', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    borderWidth: 0.5, borderColor: C.border,
  },
  chuvaIconBox: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  chuvaTitulo:  { fontSize: 11, fontWeight: '700', color: C.textWeak, textTransform: 'uppercase', letterSpacing: 0.6 },
  chuvaVal:     { fontSize: 20, fontWeight: '800', color: C.primary, letterSpacing: -0.5 },
  chuvaLbl:     { fontSize: 9, color: C.textWeak, fontWeight: '500', marginTop: 1 },
  chuvaDivider: { width: 0.5, backgroundColor: C.border, alignSelf: 'stretch', marginVertical: 2 },
  chuvaUltimo:  { fontSize: 10, color: C.textWeak, marginTop: 6 },
  chuvaSemDados:{ fontSize: 12, color: C.textWeak, marginTop: 4 },
});
