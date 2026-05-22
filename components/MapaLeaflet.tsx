"use client";
import { useEffect, useRef } from "react";
import type { TalhaoComPlantio } from "../app/mapa/page";

// CSS do Leaflet
import "leaflet/dist/leaflet.css";

interface Props {
  talhoes: TalhaoComPlantio[];
  selecionado: TalhaoComPlantio | null;
  onSelect: (t: TalhaoComPlantio | null) => void;
  corCultura: (c?: string) => string;
}

export default function MapaLeaflet({ talhoes, selecionado, onSelect, corCultura }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const layersRef    = useRef<import("leaflet").Layer[]>([]);

  const fmtData = (iso?: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Lazy-load Leaflet (browser-only)
    import("leaflet").then(L => {
      // Corrige ícones padrão quebrados no Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      // Centro padrão: Nova Mutum-MT
      const map = L.map(containerRef.current!, {
        center: [-13.83, -56.08],
        zoom: 11,
        zoomControl: true,
      });

      // Tile satelite (ESRI) — sem API key
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© ESRI", maxZoom: 19 }
      ).addTo(map);

      // Tile de labels sobre o satélite
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "", maxZoom: 19, opacity: 0.7 }
      ).addTo(map);

      mapRef.current = map;

      // Renderiza os talhões
      renderTalhoes(L, map);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-renderiza quando os talhões mudam
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then(L => renderTalhoes(L, mapRef.current!));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talhoes, selecionado]);

  function renderTalhoes(L: typeof import("leaflet"), map: import("leaflet").Map) {
    // Remove layers anteriores
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    const bounds: [number, number][] = [];

    talhoes.forEach(t => {
      const cor = corCultura(t.plantio?.cultura);
      const selecionadoAqui = selecionado?.id === t.id;

      const popupHtml = `
        <div style="font-family:system-ui,sans-serif;min-width:200px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:6px;">${t.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Área</td><td style="font-weight:600;">${t.area_ha?.toFixed(2)} ha</td></tr>
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Solo</td><td>${t.tipo_solo ?? "—"}</td></tr>
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Cultura</td><td style="font-weight:600;color:${t.plantio ? cor : "#aaa"}">${t.plantio?.cultura ?? "Sem plantio"}</td></tr>
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Variedade</td><td>${t.plantio?.variedade ?? "—"}</td></tr>
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Plantio</td><td>${fmtData(t.plantio?.data_plantio)}</td></tr>
            <tr><td style="color:#888;padding:3px 0;padding-right:12px;">Colheita prev.</td><td>${fmtData(t.plantio?.data_colheita_prevista)}</td></tr>
          </table>
        </div>`;

      if (t.kml_url) {
        // Carrega KML via togeojson
        fetch(t.kml_url)
          .then(r => r.text())
          .then(kmlText => {
            import("@tmcw/togeojson").then(({ kml }) => {
              const parser = new DOMParser();
              const kmlDoc = parser.parseFromString(kmlText, "text/xml");
              const geojson = kml(kmlDoc);

              const layer = L.geoJSON(geojson, {
                style: () => ({
                  color:       selecionadoAqui ? "#1A4870" : cor,
                  fillColor:   cor,
                  fillOpacity: selecionadoAqui ? 0.55 : 0.30,
                  weight:      selecionadoAqui ? 3 : 1.5,
                }),
                onEachFeature: (_, featureLayer) => {
                  featureLayer.bindPopup(popupHtml, { maxWidth: 280 });
                  featureLayer.on("mouseover", function(this: import("leaflet").Layer & { openPopup?: () => void }) {
                    this.openPopup?.();
                  });
                  featureLayer.on("click", () => onSelect(t));
                },
              }).addTo(map);

              layersRef.current.push(layer);

              // Centraliza no polígono
              try {
                const b = layer.getBounds();
                if (b.isValid()) {
                  bounds.push(b.getCenter() as unknown as [number, number]);
                  if (talhoes.filter(x => x.kml_url).length === 1) map.fitBounds(b, { padding: [40, 40] });
                }
              } catch {}
            });
          })
          .catch(() => {
            // fallback para marcador se KML falhar
            adicionarMarcador(L, map, t, cor, popupHtml, selecionadoAqui, bounds);
          });
      } else if (t.lat && t.lng) {
        adicionarMarcador(L, map, t, cor, popupHtml, selecionadoAqui, bounds);
      }
    });

    // Ajusta o mapa para cobrir todos os marcadores
    setTimeout(() => {
      if (bounds.length > 1 && mapRef.current) {
        try {
          const lbounds = L.latLngBounds(bounds.map(b => L.latLng(b[0], b[1])));
          if (lbounds.isValid()) mapRef.current.fitBounds(lbounds, { padding: [40, 40] });
        } catch {}
      }
    }, 800);
  }

  function adicionarMarcador(
    L: typeof import("leaflet"),
    map: import("leaflet").Map,
    t: TalhaoComPlantio,
    cor: string,
    popupHtml: string,
    selecionado: boolean,
    bounds: [number, number][]
  ) {
    if (!t.lat || !t.lng) return;
    bounds.push([t.lat, t.lng]);

    const circle = L.circleMarker([t.lat, t.lng], {
      radius:      selecionado ? 14 : 10,
      fillColor:   cor,
      color:       selecionado ? "#1A4870" : "#fff",
      weight:      selecionado ? 3 : 1.5,
      fillOpacity: 0.75,
    });

    circle.bindPopup(popupHtml, { maxWidth: 280 });
    circle.on("mouseover", function(this: import("leaflet").CircleMarker) { this.openPopup(); });
    circle.on("click", () => onSelect(t));

    const label = L.divIcon({
      className: "",
      html: `<div style="background:rgba(255,255,255,0.9);border:1px solid ${cor};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;color:#1a1a1a;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15)">${t.nome}</div>`,
      iconAnchor: [0, 24],
    });

    const labelMarker = L.marker([t.lat, t.lng], { icon: label, interactive: false });

    circle.addTo(map);
    labelMarker.addTo(map);
    layersRef.current.push(circle, labelMarker);
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#EEF3F8" }}
    />
  );
}
