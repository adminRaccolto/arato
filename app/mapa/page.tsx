"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";
import TopNav from "../../components/TopNav";
import dynamic from "next/dynamic";

// Leaflet só roda no browser — import dinâmico
const MapaLeaflet = dynamic(() => import("../../components/MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF3F8" }}>
      <div style={{ textAlign: "center", color: "var(--text-3)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 13 }}>Carregando mapa…</div>
      </div>
    </div>
  ),
});

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Talhao {
  id: string;
  nome: string;
  area_ha: number;
  tipo_solo?: string;
  lat?: number;
  lng?: number;
  kml_url?: string;
}

interface PlantioAtivo {
  id: string;
  talhao_id: string;
  cultura: string;
  variedade?: string;
  data_plantio: string;
  data_colheita_prevista?: string;
  area_ha?: number;
  ciclo?: { descricao: string };
}

export interface TalhaoComPlantio extends Talhao {
  plantio?: PlantioAtivo;
}

export default function MapaPage() {
  const { fazendaId } = useAuth();
  const [talhoes, setTalhoes]       = useState<TalhaoComPlantio[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selecionado, setSelecionado] = useState<TalhaoComPlantio | null>(null);
  const [uploadId, setUploadId]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [msg, setMsg]               = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = sb();

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);

    const [{ data: ts }, { data: ps }] = await Promise.all([
      supabase.from("talhoes").select("id,nome,area_ha,tipo_solo,lat,lng,kml_url").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("plantios")
        .select("id,talhao_id,cultura,variedade,data_plantio,data_colheita_prevista,area_ha,ciclo_id")
        .eq("fazenda_id", fazendaId)
        .eq("status", "em_andamento")
        .order("data_plantio", { ascending: false }),
    ]);

    // Para cada talhão, pega o plantio ativo mais recente
    const plantioMap: Record<string, PlantioAtivo> = {};
    for (const p of ps ?? []) {
      if (!plantioMap[p.talhao_id]) plantioMap[p.talhao_id] = p as PlantioAtivo;
    }

    setTalhoes((ts ?? []).map(t => ({ ...t, plantio: plantioMap[t.id] })));
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function uploadKml(talhaoId: string, file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const path = `kml/${fazendaId}/${talhaoId}.kml`;
      const { error: upErr } = await supabase.storage.from("arquivos").upload(path, file, { upsert: true, contentType: "application/vnd.google-earth.kml+xml" });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("arquivos").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("talhoes").update({ kml_url: publicUrl }).eq("id", talhaoId);
      if (dbErr) throw dbErr;

      setMsg("KML enviado com sucesso!");
      await carregar();
    } catch (e: unknown) {
      setMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      setUploadId(null);
    }
  }

  const fmtData = (iso?: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const CULTURA_COR: Record<string, string> = {
    soja:    "#16A34A",
    milho:   "#EF9F27",
    algodao: "#9B59B6",
    algodão: "#9B59B6",
    sorgo:   "#E24B4A",
    trigo:   "#C9921B",
  };

  function corCultura(cultura?: string): string {
    if (!cultura) return "#378ADD";
    const key = cultura.toLowerCase().replace(/\s+/g, "").replace("1ª", "").replace("2ª", "");
    for (const [k, v] of Object.entries(CULTURA_COR)) {
      if (key.includes(k)) return v;
    }
    return "#378ADD";
  }

  const semKml  = talhoes.filter(t => !t.kml_url);
  const comKml  = talhoes.filter(t => !!t.kml_url);
  const comPlantio = talhoes.filter(t => !!t.plantio);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* ── PAINEL LATERAL ── */}
      <div style={{
        width: 300, background: "var(--bg-card)", borderRight: "0.5px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* Cabeçalho */}
        <div style={{ padding: "16px 18px 12px", borderBottom: "0.5px solid var(--bg-tag)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Mapa de Talhões</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {talhoes.length} talhão(ões) · {comPlantio.length} com plantio ativo · {comKml.length} com KML
          </div>
        </div>

        {/* Mensagem de feedback */}
        {msg && (
          <div style={{
            margin: "10px 14px 0",
            padding: "8px 12px", borderRadius: 8,
            background: msg.startsWith("Erro") ? "#FEF2F2" : "#F0FDF4",
            border: `0.5px solid ${msg.startsWith("Erro") ? "#FCA5A5" : "#86EFAC"}`,
            fontSize: 12, color: msg.startsWith("Erro") ? "#B91C1C" : "#15803D",
          }}>
            {msg}
            <button onClick={() => setMsg(null)} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14 }}>×</button>
          </div>
        )}

        {/* Input de KML oculto */}
        <input
          ref={fileRef}
          type="file"
          accept=".kml,.kmz"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file && uploadId) uploadKml(uploadId, file);
            e.target.value = "";
          }}
        />

        {/* Lista de talhões */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>Carregando…</div>
          ) : talhoes.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>Nenhum talhão cadastrado</div>
          ) : (
            talhoes.map(t => {
              const cor = corCultura(t.plantio?.cultura);
              const ativo = selecionado?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelecionado(ativo ? null : t)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "0.5px solid #F0F2F6",
                    cursor: "pointer",
                    background: ativo ? "#EBF3FC" : "transparent",
                    borderLeft: ativo ? "3px solid #1A4870" : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {/* Bolinha de cultura */}
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.plantio ? cor : "var(--border)", flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{t.nome}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{t.area_ha?.toFixed(1)} ha</span>
                  </div>

                  {t.plantio ? (
                    <div style={{ fontSize: 11, color: cor, fontWeight: 600, paddingLeft: 18 }}>
                      {t.plantio.cultura}{t.plantio.variedade ? ` · ${t.plantio.variedade}` : ""}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 18 }}>Sem plantio ativo</div>
                  )}

                  {/* Badge KML + botão upload */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, paddingLeft: 18 }}>
                    {t.kml_url ? (
                      <span style={{ fontSize: 10, background: "#ECFDF5", color: "#15803D", border: "0.5px solid #86EFAC", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>
                        ✓ KML
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, background: "var(--bg-page)", color: "var(--text-muted)", border: "0.5px solid var(--border)", borderRadius: 5, padding: "2px 7px" }}>
                        sem KML
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setUploadId(t.id); fileRef.current?.click(); }}
                      disabled={uploading}
                      style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 5, border: "0.5px solid var(--border)",
                        background: "var(--bg-card)", color: "var(--text-2)", cursor: "pointer",
                      }}
                    >
                      {uploading && uploadId === t.id ? "Enviando…" : t.kml_url ? "↻ KML" : "+ KML"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Legenda de culturas */}
        {comPlantio.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--bg-tag)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Legenda</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {Object.entries(CULTURA_COR).filter(([k]) => talhoes.some(t => t.plantio?.cultura?.toLowerCase().includes(k))).map(([k, c]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
                  <span style={{ textTransform: "capitalize" }}>{k}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border)", display: "inline-block" }} />
                Sem plantio
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MAPA ── */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Painel de info do talhão selecionado */}
        {selecionado && (
          <div style={{
            position: "absolute", top: 16, right: 16, zIndex: 1000,
            background: "var(--bg-card)", borderRadius: 12, boxShadow: "0 4px 12px rgba(11,45,80,0.08)",
            border: "0.5px solid var(--border)", padding: "16px 20px", minWidth: 240, maxWidth: 300,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{selecionado.nome}</div>
              <button onClick={() => setSelecionado(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { l: "Área",      v: `${selecionado.area_ha?.toFixed(2)} ha` },
                { l: "Solo",      v: selecionado.tipo_solo ?? "—" },
                { l: "Cultura",   v: selecionado.plantio?.cultura ?? "Sem plantio ativo" },
                { l: "Variedade", v: selecionado.plantio?.variedade ?? "—" },
                { l: "Plantio",   v: fmtData(selecionado.plantio?.data_plantio) },
                { l: "Colheita prevista", v: fmtData(selecionado.plantio?.data_colheita_prevista) },
              ].map(({ l, v }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
                  <span style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{l}</span>
                  <span style={{
                    color: l === "Cultura" && selecionado.plantio ? corCultura(selecionado.plantio.cultura) : "var(--text-1)",
                    fontWeight: l === "Cultura" ? 600 : 400,
                    textAlign: "right",
                  }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aviso quando não há coordenadas nem KML */}
        {!loading && talhoes.every(t => !t.kml_url && !t.lat && !t.lng) && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 1000, background: "var(--bg-card)", borderRadius: 12, padding: "24px 32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)", textAlign: "center", maxWidth: 340,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>Sem dados de localização</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
              Adicione coordenadas (lat/lng) nos talhões em <strong>Cadastros → Fazendas</strong>, ou faça upload de arquivos KML pelo painel lateral.
            </div>
          </div>
        )}

        <MapaLeaflet
          talhoes={talhoes}
          selecionado={selecionado}
          onSelect={setSelecionado}
          corCultura={corCultura}
        />
      </div>
    </div>
    </div>
  );
}
