import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { supabase, type Talhao } from '../../lib/supabase';
import { saveOrQueue } from '../../lib/offline';
import { C, T } from '../../constants/theme';
import { ListPickerModal } from './monitoramento';

type Tela = 'lista' | 'form';
// Nomes de colunas espelham a tabela leituras_pluviometricas do Supabase
type Leitura = {
  id: string;
  ponto_nome: string | null;
  data: string;
  hora: string | null;
  chuva_mm: number;
  talhoes?: { nome: string } | null;
};

const horaAtual = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function acumuladoDias(leituras: Leitura[], dias: number): number {
  const corte = new Date();
  corte.setDate(corte.getDate() - dias);
  const cutoff = corte.toISOString().split('T')[0];
  return leituras.filter(l => l.data >= cutoff).reduce((s, l) => s + Number(l.chuva_mm), 0);
}

export default function PluviometriaScreen() {
  const { fazendaId } = useAuth();
  const insets = useSafeAreaInsets();

  const [tela, setTela]             = useState<Tela>('lista');
  const [leituras, setLeituras]     = useState<Leitura[]>([]);
  const [talhoes, setTalhoes]       = useState<Talhao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [talhaoId, setTalhaoId] = useState('');
  const [ponto, setPonto]       = useState('');
  const [dataStr, setDataStr]   = useState(() => new Date().toISOString().split('T')[0]);
  const [horaStr, setHoraStr]   = useState(horaAtual);
  const [mm, setMm]             = useState('');
  const [operador, setOperador] = useState('');
  const [obs, setObs]           = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pickerTalhao, setPickerTalhao] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const [{ data: leit }, { data: tal }] = await Promise.all([
      supabase.from('leituras_pluviometricas')
        .select('id, ponto_nome, data, hora, chuva_mm, talhoes(nome)')
        .eq('fazenda_id', fazendaId)
        .order('data', { ascending: false })
        .order('hora', { ascending: false })
        .limit(60),
      supabase.from('talhoes').select('id, nome, area_ha').eq('fazenda_id', fazendaId).order('nome'),
    ]);
    setLeituras((leit ?? []) as Leitura[]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTalhaoId(''); setPonto('');
    setDataStr(new Date().toISOString().split('T')[0]);
    setHoraStr(horaAtual()); setMm(''); setOperador(''); setObs('');
  }

  async function salvar() {
    const nomePonto = ponto.trim() || talhoes.find(t => t.id === talhaoId)?.nome;
    if (!nomePonto) { Alert.alert('', 'Informe o nome do ponto ou selecione um talhão.'); return; }
    if (!mm || Number(mm) < 0) { Alert.alert('', 'Informe a quantidade de chuva em mm.'); return; }
    if (!fazendaId) return;
    setSalvando(true);
    const { offline, error } = await saveOrQueue('leituras_pluviometricas', {
      fazenda_id: fazendaId,
      talhao_id: talhaoId || null,
      ponto_nome: nomePonto,
      data: dataStr,
      hora: horaStr || null,
      chuva_mm: Number(mm),
      operador: operador || null,
      observacao: obs || null,
    });
    setSalvando(false);
    if (error) { Alert.alert('Erro', error); return; }
    Alert.alert(
      offline ? 'Salvo offline' : 'Leitura registrada',
      `${mm} mm em ${nomePonto}${offline ? '\nSerá enviado quando houver conexão.' : ''}`,
      [{ text: 'OK', onPress: () => { reset(); setTela('lista'); carregar(); } }],
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  if (tela === 'lista') {
    const mm24h = acumuladoDias(leituras, 1);
    const mm7d  = acumuladoDias(leituras, 7);
    const mm30d = acumuladoDias(leituras, 30);

    const porDia: Record<string, number> = {};
    leituras.forEach(l => { porDia[l.data] = (porDia[l.data] ?? 0) + Number(l.chuva_mm); });
    const diasOrdenados = Object.keys(porDia).sort().reverse().slice(0, 10);

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
          <Text style={s.barTitulo}>Pluviometria</Text>
        </View>

        {carregando
          ? <ActivityIndicator style={{ marginTop: 48 }} color={C.primary} />
          : (
            <FlatList
              data={leituras}
              keyExtractor={r => r.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListHeaderComponent={() => (
                <>
                  <View style={s.kpiRow}>
                    <View style={s.kpiCard}>
                      <Text style={s.kpiMm}>{mm24h.toFixed(1)}</Text>
                      <Text style={s.kpiLbl}>mm / 24h</Text>
                    </View>
                    <View style={s.kpiCard}>
                      <Text style={s.kpiMm}>{mm7d.toFixed(1)}</Text>
                      <Text style={s.kpiLbl}>mm / 7 dias</Text>
                    </View>
                    <View style={s.kpiCard}>
                      <Text style={s.kpiMm}>{mm30d.toFixed(1)}</Text>
                      <Text style={s.kpiLbl}>mm / 30 dias</Text>
                    </View>
                  </View>

                  {diasOrdenados.length > 0 && (
                    <View style={[T.card, { marginBottom: 16 }]}>
                      <Text style={[T.secLabel, { marginTop: 0 }]}>Histórico (mm/dia)</Text>
                      {diasOrdenados.map(dia => {
                        const val = porDia[dia];
                        const maxVal = Math.max(...Object.values(porDia));
                        const pct = maxVal > 0 ? val / maxVal : 0;
                        const d = new Date(dia + 'T12:00:00');
                        const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        return (
                          <View key={dia} style={s.barraRow}>
                            <Text style={s.barraDia}>{label}</Text>
                            <View style={s.barraTrack}>
                              <View style={[s.barraFill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
                            </View>
                            <Text style={s.barraMm}>{val.toFixed(1)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <Text style={T.secLabel}>Registros individuais</Text>
                </>
              )}
              ListEmptyComponent={<Text style={s.vazio}>Nenhum registro. Toque + para adicionar.</Text>}
              renderItem={({ item }) => (
                <View style={T.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={T.h3}>{item.ponto_nome ?? '—'}</Text>
                    <View style={s.mmBadge}>
                      <Text style={s.mmBadgeTxt}>{Number(item.chuva_mm).toFixed(1)} mm</Text>
                    </View>
                  </View>
                  <Text style={[T.caption, { marginTop: 4 }]}>
                    {item.data}{item.hora ? ` às ${String(item.hora).slice(0, 5)}` : ''}
                    {(item.talhoes as unknown as { nome: string } | null)?.nome
                      ? ` · ${(item.talhoes as unknown as { nome: string }).nome}`
                      : ''}
                  </Text>
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
        <Text style={s.barTitulo}>Nova Leitura</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={T.secLabel}>Ponto de medição</Text>
        <TextInput
          style={T.input} value={ponto} onChangeText={setPonto}
          placeholder="Nome do ponto (ex: Estação Central, Pivô 3…)"
          placeholderTextColor={C.textWeak}
        />
        <TouchableOpacity style={T.picker} onPress={() => setPickerTalhao(true)}>
          <Text style={{ color: talhaoId ? C.text : C.textWeak, fontSize: 14 }}>
            {talhoes.find(t => t.id === talhaoId)?.nome ?? 'Vincular ao talhão (opcional)…'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textWeak} />
        </TouchableOpacity>

        <Text style={T.secLabel}>Leitura</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 2 }}>
            <TextInput style={T.input} value={dataStr} onChangeText={setDataStr} placeholder="Data (AAAA-MM-DD)" placeholderTextColor={C.textWeak} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput style={T.input} value={horaStr} onChangeText={setHoraStr} placeholder="HH:MM" placeholderTextColor={C.textWeak} />
          </View>
        </View>

        <View style={s.mmInputRow}>
          <TextInput
            style={[T.input, s.mmInput]}
            value={mm} onChangeText={setMm}
            keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textWeak}
          />
          <View style={s.mmUnidade}>
            <Ionicons name="rainy-outline" size={18} color={C.primary} />
            <Text style={s.mmUnidadeTxt}>mm</Text>
          </View>
        </View>

        {Number(mm) > 0 && (
          <View style={s.mmPreview}>
            <Ionicons
              name={Number(mm) >= 30 ? 'thunderstorm-outline' : Number(mm) >= 10 ? 'rainy-outline' : 'water-outline'}
              size={20} color={C.primary}
            />
            <Text style={s.mmPreviewTxt}>
              {Number(mm) < 5 ? 'Chuva fraca' : Number(mm) < 15 ? 'Chuva moderada' : Number(mm) < 30 ? 'Chuva forte' : 'Chuva muito forte'}
            </Text>
          </View>
        )}

        <Text style={T.secLabel}>Operador</Text>
        <TextInput style={T.input} value={operador} onChangeText={setOperador} placeholder="Quem fez a leitura" placeholderTextColor={C.textWeak} />
        <TextInput style={[T.input, { minHeight: 60 }]} value={obs} onChangeText={setObs} multiline placeholder="Observações…" placeholderTextColor={C.textWeak} />

        <TouchableOpacity style={[T.btn, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={T.btnTxt}>Registrar leitura</Text>}
        </TouchableOpacity>
      </ScrollView>

      <ListPickerModal
        visible={pickerTalhao} titulo="Talhão (opcional)"
        itens={['Nenhum', ...talhoes.map(t => t.nome)]}
        onSelect={(_, i) => { setTalhaoId(i === 0 ? '' : talhoes[i - 1].id); setPickerTalhao(false); }}
        onClose={() => setPickerTalhao(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bar:       { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  barTitulo: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  vazio:     { textAlign: 'center', color: C.textWeak, marginTop: 24, fontSize: 14 },
  fab: {
    position: 'absolute', right: 20, width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10, padding: 14, alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  kpiMm:  { fontSize: 20, fontWeight: '800', color: C.primary, letterSpacing: -0.5 },
  kpiLbl: { fontSize: 10, color: C.textWeak, marginTop: 2, fontWeight: '500' },

  barraRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barraDia:   { width: 36, fontSize: 11, color: C.textWeak },
  barraTrack: { flex: 1, height: 8, backgroundColor: C.borderLight, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  barraFill:  { height: 8, backgroundColor: C.primary, borderRadius: 4, minWidth: 4 },
  barraMm:    { width: 36, fontSize: 11, color: C.textSub, textAlign: 'right', fontWeight: '600' },

  mmBadge:    { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  mmBadgeTxt: { color: C.primary, fontSize: 12, fontWeight: '700' },

  mmInputRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  mmInput:      { flex: 1, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 0 },
  mmUnidade:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.primaryLight, borderRadius: 8 },
  mmUnidadeTxt: { fontSize: 16, fontWeight: '700', color: C.primary },

  mmPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primaryLight, borderRadius: 8, padding: 12, marginBottom: 14,
  },
  mmPreviewTxt: { fontSize: 14, color: C.primary, fontWeight: '600' },
});
