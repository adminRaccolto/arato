import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { syncQueue, queueCount } from '../../lib/offline';
import { C } from '../../constants/colors';

type Resumo = { talhoes: number; cicloAtivo: string; criticos: number };

const ACOES = [
  { href: '/monitoramento' as const, label: 'Monitoramento', sub: 'Pragas, doenças e invasoras', icon: '🐛', cor: '#7C2D12', bg: '#FEF2F2' },
  { href: '/plantio'       as const, label: 'Plantio',       sub: 'Registrar operação de plantio', icon: '🌱', cor: '#14532D', bg: '#F0FDF4' },
  { href: '/pulverizacao'  as const, label: 'Pulverização',  sub: 'Defensivos e foliares',         icon: '💧', cor: '#1E3A5F', bg: '#EFF6FF' },
  { href: '/colheita'      as const, label: 'Colheita',      sub: 'Romaneio e produtividade',      icon: '🌾', cor: '#7D4A00', bg: '#FFFBEB' },
];

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const { fazendaId, nomeFazenda, emailUsuario, fazendas, setFazendaAtiva, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [resumo, setResumo]       = useState<Resumo>({ talhoes: 0, cicloAtivo: '—', criticos: 0 });
  const [hora, setHora]           = useState('');
  const [pendentes, setPendentes] = useState(0);
  const [syncing, setSyncing]     = useState(false);

  // Relógio
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Dados e fila offline
  useEffect(() => {
    queueCount().then(setPendentes);
    if (!fazendaId) return;

    async function load() {
      const [{ count: tal }, { data: ciclos }, { data: pragas }] = await Promise.all([
        supabase.from('talhoes').select('id', { count: 'exact', head: true }).eq('fazenda_id', fazendaId!),
        supabase.from('ciclos').select('cultura, anos_safra(ano)').eq('fazenda_id', fazendaId!).order('created_at', { ascending: false }).limit(1),
        supabase.from('monitoramento_pragas').select('id').eq('fazenda_id', fazendaId!).eq('nivel', 4),
      ]);
      const ciclo = ciclos?.[0];
      setResumo({
        talhoes: tal ?? 0,
        cicloAtivo: ciclo ? `${ciclo.cultura} ${(ciclo.anos_safra as unknown as { ano: string } | null)?.ano ?? ''}` : '—',
        criticos: pragas?.length ?? 0,
      });
    }
    load();
  }, [fazendaId]);

  async function handleSync() {
    setSyncing(true);
    const { synced, failed } = await syncQueue();
    setSyncing(false);
    setPendentes(failed);
    Alert.alert('Sincronização', synced > 0 ? `${synced} registro(s) enviado(s) com sucesso.` : 'Nada para sincronizar.');
  }

  function trocarFazenda() {
    if (fazendas.length <= 1) return;
    Alert.alert(
      'Trocar fazenda',
      'Escolha a fazenda ativa:',
      fazendas.map(f => ({ text: f.nome, onPress: () => setFazendaAtiva(f.id, f.nome) })),
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.hora}>{hora} · {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          <Text style={s.saud}>{saudacao()}, {emailUsuario?.split('@')[0] ?? 'operador'}!</Text>
          <TouchableOpacity onPress={trocarFazenda} activeOpacity={fazendas.length > 1 ? 0.7 : 1}>
            <Text style={s.fazenda}>📍 {nomeFazenda ?? 'Fazenda'}{fazendas.length > 1 ? ' ▾' : ''}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Sair', 'Deseja encerrar a sessão?', [{ text: 'Cancelar' }, { text: 'Sair', style: 'destructive', onPress: signOut }])} style={s.logoutBtn}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Alerta crítico */}
        {resumo.criticos > 0 && (
          <TouchableOpacity style={s.alertaCard} onPress={() => router.push('/(tabs)/monitoramento')} activeOpacity={0.8}>
            <Text style={{ fontSize: 26 }}>🚨</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.alertaTitulo}>{resumo.criticos} ocorrência{resumo.criticos > 1 ? 's' : ''} crítica{resumo.criticos > 1 ? 's' : ''}</Text>
              <Text style={s.alertaSub}>Toque para registrar ação</Text>
            </View>
            <Text style={{ color: '#991B1B', fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Fila offline */}
        {pendentes > 0 && (
          <TouchableOpacity style={s.offlineCard} onPress={handleSync} disabled={syncing} activeOpacity={0.8}>
            {syncing ? <ActivityIndicator color={C.accent} /> : <Text style={{ fontSize: 20 }}>📡</Text>}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>{pendentes} registro{pendentes > 1 ? 's' : ''} offline</Text>
              <Text style={{ fontSize: 12, color: '#B45309', marginTop: 1 }}>Toque para sincronizar</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statVal}>{resumo.talhoes}</Text>
            <Text style={s.statLbl}>Talhões</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statVal, { fontSize: 14 }]}>{resumo.cicloAtivo}</Text>
            <Text style={s.statLbl}>Ciclo ativo</Text>
          </View>
          <View style={[s.statCard, resumo.criticos > 0 && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
            <Text style={[s.statVal, resumo.criticos > 0 && { color: C.red }]}>{resumo.criticos}</Text>
            <Text style={s.statLbl}>Críticos</Text>
          </View>
        </View>

        {/* Ações rápidas */}
        <Text style={s.secTitulo}>Lançamentos</Text>
        {ACOES.map(a => (
          <TouchableOpacity key={a.href} style={[s.acaoCard, { backgroundColor: a.bg }]} onPress={() => router.push(`/(tabs)${a.href}`)} activeOpacity={0.8}>
            <Text style={{ fontSize: 30 }}>{a.icon}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[s.acaoTitulo, { color: a.cor }]}>{a.label}</Text>
              <Text style={s.acaoSub}>{a.sub}</Text>
            </View>
            <Text style={{ color: a.cor, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start' },
  hora:   { fontSize: 12, color: '#B0C8E0' },
  saud:   { fontSize: 20, fontWeight: '700', color: C.white, marginTop: 4 },
  fazenda:{ fontSize: 13, color: '#B0C8E0', marginTop: 4 },
  logoutBtn: { padding: 6, marginTop: 4 },

  alertaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 0.5, borderColor: '#FCA5A5', borderRadius: 12, padding: 14, marginBottom: 12 },
  alertaTitulo: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  alertaSub:    { fontSize: 12, color: '#B91C1C', marginTop: 2 },

  offlineCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accentLight, borderWidth: 0.5, borderColor: '#FDE68A', borderRadius: 12, padding: 14, marginBottom: 12 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  statVal:  { fontSize: 22, fontWeight: '800', color: C.primary },
  statLbl:  { fontSize: 11, color: C.textWeak, marginTop: 2, textAlign: 'center' },

  secTitulo: { fontSize: 13, fontWeight: '700', color: C.textSub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  acaoCard:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 10 },
  acaoTitulo:{ fontSize: 16, fontWeight: '700' },
  acaoSub:   { fontSize: 13, color: C.textTert, marginTop: 2 },
});
