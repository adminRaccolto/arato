import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/theme';

type Talhao = {
  id: string;
  nome: string;
  area_ha: number;
  latitude: number | null;
  longitude: number | null;
  kml_url: string | null;
};

type CamadaKml = { id: string; nome: string; url: string; ativa: boolean; cor: string };

const CORES_TALHAO = ['#1A4870', '#C9921B', '#16A34A', '#DC2626', '#7C3AED', '#0891B2', '#D97706'];

function buildMapHTML(talhoes: Talhao[], camadasKml: CamadaKml[]): string {
  const pontos = talhoes
    .filter(t => t.latitude && t.longitude)
    .map(t => `{ lat: ${t.latitude}, lng: ${t.longitude}, nome: ${JSON.stringify(t.nome)}, area: ${t.area_ha} }`);

  const kmlCarregamentos = camadasKml
    .filter(c => c.ativa)
    .map((c, i) => {
      const cor = c.cor;
      return `
        omnivore.kml(${JSON.stringify(c.url)}, { useJsonP: false })
          .on('ready', function() {
            this.eachLayer(function(layer) {
              if (layer.setStyle) {
                layer.setStyle({ color: '${cor}', fillColor: '${cor}', fillOpacity: 0.15, weight: 2 });
              }
              if (layer.bindPopup) {
                var props = layer.feature && layer.feature.properties;
                var nome = (props && (props.name || props.Name)) || ${JSON.stringify(c.nome)};
                layer.bindPopup('<b>' + nome + '</b>');
              }
            });
            this.addTo(map);
            bounds.extend(this.getBounds());
            if (++kmlCarregados === totalKmls) fitBounds();
          })
          .on('error', function(e) { console.warn('KML error ${i}:', e); kmlCarregados++; });
      `;
    }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .leaflet-popup-content { font-family: -apple-system, sans-serif; font-size: 13px; }
    .leaflet-popup-content b { color: #1A4870; }
    .leaflet-popup-content small { color: #6B7280; display: block; margin-top: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-omnivore@0.3.4/leaflet-omnivore.min.js"></script>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, detectRetina: true
    }).addTo(map);

    var satelite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, detectRetina: true }
    );

    var isSatelite = false;
    window.toggleSatelite = function() {
      if (isSatelite) {
        map.eachLayer(function(l) { if (l._url && l._url.includes('arcgis')) map.removeLayer(l); });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        isSatelite = false;
      } else {
        map.eachLayer(function(l) { if (l._url && l._url.includes('openstreetmap')) map.removeLayer(l); });
        satelite.addTo(map);
        isSatelite = true;
      }
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'satelite', value: isSatelite }));
    };

    window.irParaPosicao = function(lat, lng) {
      map.setView([lat, lng], 16);
      L.circleMarker([lat, lng], { radius: 8, color: '#1A4870', fillColor: '#1A4870', fillOpacity: 0.9 })
        .addTo(map).bindPopup('Você está aqui').openPopup();
    };

    var bounds = L.latLngBounds([]);
    var pontos = [${pontos.join(',')}];
    var cores = ${JSON.stringify(CORES_TALHAO)};

    pontos.forEach(function(p, i) {
      var cor = cores[i % cores.length];
      var marker = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: cor, fillColor: cor, fillOpacity: 0.85, weight: 2
      }).addTo(map);
      marker.bindPopup(
        '<b>' + p.nome + '</b>' +
        '<small>' + (p.area ? p.area.toFixed(1) + ' ha' : '') + '</small>'
      );
      bounds.extend([p.lat, p.lng]);
    });

    var totalKmls = ${camadasKml.filter(c => c.ativa).length};
    var kmlCarregados = 0;

    function fitBounds() {
      try { if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] }); }
      catch(e) {}
    }

    ${kmlCarregamentos}

    if (totalKmls === 0) {
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView([-13.5, -55.0], 5);
      }
    }

    map.on('click', function(e) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'click', lat: e.latlng.lat, lng: e.latlng.lng })
      );
    });
  </script>
</body>
</html>`;
}

export default function MapaScreen() {
  const { fazendaId, nomeFazenda } = useAuth();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const [talhoes, setTalhoes]         = useState<Talhao[]>([]);
  const [camadas, setCamadas]         = useState<CamadaKml[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [isSatelite, setIsSatelite]   = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const { data } = await supabase
      .from('talhoes')
      .select('id, nome, area_ha, latitude, longitude, kml_url')
      .eq('fazenda_id', fazendaId)
      .order('nome');

    const lista = (data ?? []) as Talhao[];
    setTalhoes(lista);

    const kmls: CamadaKml[] = lista
      .filter(t => t.kml_url)
      .map((t, i) => ({
        id: t.id, nome: t.nome, url: t.kml_url!,
        ativa: true, cor: CORES_TALHAO[i % CORES_TALHAO.length],
      }));
    setCamadas(kmls);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function irParaLocalizacao() {
    setLocalizando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Permita o acesso à localização nas configurações.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webRef.current?.injectJavaScript(`window.irParaPosicao(${latitude}, ${longitude}); true;`);
    } catch {
      Alert.alert('Erro', 'Não foi possível obter a localização.');
    } finally {
      setLocalizando(false);
    }
  }

  function toggleSatelite() {
    webRef.current?.injectJavaScript(`window.toggleSatelite(); true;`);
  }

  function toggleCamada(id: string) {
    setCamadas(prev => prev.map(c => c.id === id ? { ...c, ativa: !c.ativa } : c));
  }

  const html = buildMapHTML(talhoes, camadas);
  const semGps = talhoes.filter(t => !t.latitude).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* Cabeçalho */}
      <View style={[s.bar, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.barTitulo}>Mapa de Talhões</Text>
          {nomeFazenda ? <Text style={s.barSub}>{nomeFazenda}</Text> : null}
        </View>
        <TouchableOpacity style={s.barBtn} onPress={() => setPainelAberto(v => !v)}>
          <Ionicons name="layers-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Painel de camadas KML */}
      {painelAberto && camadas.length > 0 && (
        <View style={[s.painel, { top: insets.top + 56 }]}>
          <Text style={s.painelTitulo}>Camadas KML</Text>
          {camadas.map(c => (
            <TouchableOpacity key={c.id} style={s.painelItem} onPress={() => toggleCamada(c.id)}>
              <View style={[s.painelDot, { backgroundColor: c.ativa ? c.cor : C.textWeak }]} />
              <Text style={[s.painelNome, !c.ativa && { color: C.textWeak }]} numberOfLines={1}>{c.nome}</Text>
              <Ionicons name={c.ativa ? 'eye-outline' : 'eye-off-outline'} size={15} color={c.ativa ? C.primary : C.textWeak} />
            </TouchableOpacity>
          ))}
          {semGps > 0 && (
            <Text style={s.painelAviso}>{semGps} talhão(ões) sem coordenadas GPS cadastradas.</Text>
          )}
        </View>
      )}

      {/* Mapa */}
      {carregando
        ? <View style={s.loading}><ActivityIndicator color={C.primary} size="large" /><Text style={s.loadingTxt}>Carregando mapa…</Text></View>
        : (
          <WebView
            ref={webRef}
            style={{ flex: 1 }}
            source={{ html, baseUrl: Platform.OS === 'android' ? 'file:///android_asset/' : '' }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mixedContentMode="always"
            onMessage={e => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'satelite') setIsSatelite(msg.value);
              } catch { /* ignore */ }
            }}
            onError={() => Alert.alert('Erro', 'Não foi possível carregar o mapa. Verifique a conexão.')}
          />
        )}

      {/* Botões flutuantes */}
      <View style={[s.controles, { bottom: insets.bottom + 72 }]}>
        <TouchableOpacity style={[s.ctrlBtn, isSatelite && s.ctrlBtnAtivo]} onPress={toggleSatelite}>
          <Ionicons name="globe-outline" size={20} color={isSatelite ? '#fff' : C.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={irParaLocalizacao} disabled={localizando}>
          {localizando
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Ionicons name="locate-outline" size={20} color={C.primary} />
          }
        </TouchableOpacity>
      </View>

      {/* Legenda talhões sem KML (com ponto GPS) */}
      {talhoes.some(t => t.latitude && !t.kml_url) && !painelAberto && (
        <View style={[s.legenda, { bottom: insets.bottom + 120 }]}>
          {talhoes.filter(t => t.latitude && !t.kml_url).slice(0, 5).map((t, i) => (
            <View key={t.id} style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: CORES_TALHAO[i % CORES_TALHAO.length] }]} />
              <Text style={s.legendaNome} numberOfLines={1}>{t.nome}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', zIndex: 10,
  },
  barTitulo: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  barSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  barBtn:    { padding: 6, marginLeft: 12 },

  painel: {
    position: 'absolute', right: 12, zIndex: 20,
    backgroundColor: C.surface, borderRadius: 12, padding: 14, minWidth: 220,
    shadowColor: '#0B2D50', shadowOpacity: 0.15, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
    borderWidth: 0.5, borderColor: C.border,
  },
  painelTitulo: { fontSize: 11, fontWeight: '700', color: C.textWeak, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  painelItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  painelDot:    { width: 10, height: 10, borderRadius: 5 },
  painelNome:   { flex: 1, fontSize: 13, color: C.text, fontWeight: '500' },
  painelAviso:  { fontSize: 11, color: C.orange, marginTop: 8, lineHeight: 16 },

  loading:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loadingTxt: { color: C.textSub, marginTop: 12, fontSize: 13 },

  controles: {
    position: 'absolute', right: 14,
    gap: 8,
  },
  ctrlBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0B2D50', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
    borderWidth: 0.5, borderColor: C.border,
  },
  ctrlBtnAtivo: { backgroundColor: C.primary },

  legenda: {
    position: 'absolute', left: 12,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: 10,
    gap: 6, borderWidth: 0.5, borderColor: C.border,
  },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaDot:  { width: 8, height: 8, borderRadius: 4 },
  legendaNome: { fontSize: 11, color: C.text, fontWeight: '500', maxWidth: 120 },
});
