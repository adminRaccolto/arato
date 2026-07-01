"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import InputNumerico from "../../../components/InputNumerico";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo  = { id: string; cultura: string; ano_safra?: { ano: string } };
type Rec    = { id: string; tipo: string; data_recomendacao: string };

const CATALOGO: Record<string, string[]> = {
  praga: [
    "Lagarta-da-soja","Lagarta-falsa-medideira","Helicoverpa armigera",
    "Percevejo-marrom","Percevejo-verde","Percevejo-pequeno",
    "Mosca-branca","Pulgão","Trips","Ácaro-rajado","Ácaro-branco",
    "Lagarta-do-cartucho","Outra praga",
  ],
  doenca: [
    "Ferrugem-asiática","Mofo-branco","Mancha-alvo","Antracnose","Oídio",
    "Mancha-parda","Podridão-radicular","Mosaico","Nematoide-de-cisto",
    "Nematoide-de-galha","Enfezamento (milho)","Outra doença",
  ],
  planta_daninha: [
    "Buva resistente","Capim-amargoso resistente","Corda-de-viola","Picão-preto",
    "Trapoeraba","Leiteiro","Capim-colchão","Brachiaria","Caruru","Outra invasora",
  ],
};

const NIVEL = [
  { n: 1, label: "Baixo",   icon: "🟢", cor: "#166534", bg: "#DCFCE7", sub: "Abaixo do NE" },
  { n: 2, label: "Médio",   icon: "🟡", cor: "#92400E", bg: "#FEF3C7", sub: "Próx. ao NE" },
  { n: 3, label: "Alto",    icon: "🟠", cor: "#9A3412", bg: "#FFEDD5", sub: "Acima do NE" },
  { n: 4, label: "Crítico", icon: "🔴", cor: "#DC2626", bg: "#FEE2E2", sub: "Emergencial" },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", border: "0.5px solid #D4DCE8",
  borderRadius: 10, fontSize: 15, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", WebkitAppearance: "none",
};

export default function CampoMonitoramentoPage() {
  const { fazendaId } = useAuth();
  const [etapa, setEtapa] = useState<"form"|"gps"|"foto"|"ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [ciclos,  setCiclos]  = useState<Ciclo[]>([]);
  const [recs,    setRecs]    = useState<Rec[]>([]);

  // Campos
  const [fTalhao, setFTalhao] = useState("");
  const [fCiclo,  setFCiclo]  = useState("");
  const [fData,   setFData]   = useState(() => new Date().toISOString().split("T")[0]);
  const [fTipo,   setFTipo]   = useState<"praga"|"doenca"|"planta_daninha">("praga");
  const [fNome,   setFNome]   = useState("");
  const [fNomeC,  setFNomeC]  = useState("");
  const [fNivel,  setFNivel]  = useState(1);
  const [fPct,    setFPct]    = useState("");
  const [fEstagio,setFEstagio]= useState("");
  const [fAcao,   setFAcao]   = useState("");
  const [fObs,    setFObs]    = useState("");
  const [fRecId,  setFRecId]  = useState("");

  // GPS
  const [gpsLat,  setGpsLat]  = useState<number|null>(null);
  const [gpsLng,  setGpsLng]  = useState<number|null>(null);
  const [gpsAcc,  setGpsAcc]  = useState<number|null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg,  setGpsMsg]  = useState("");

  // Fotos
  const [fotos,   setFotos]   = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: tal }, { data: cic }, { data: recsData }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("recomendacoes").select("id, tipo, data_recomendacao").eq("fazenda_id", fazendaId).order("data_recomendacao", { ascending: false }).limit(20),
    ]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setRecs((recsData ?? []) as Rec[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // GPS automático ao entrar na etapa gps
  useEffect(() => {
    if (etapa !== "gps") return;
    if (gpsLat !== null) return;
    capturarGPS();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  function capturarGPS() {
    if (!navigator.geolocation) { setGpsMsg("GPS não disponível neste dispositivo."); return; }
    setGpsBusy(true); setGpsMsg("Obtendo localização...");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsAcc(pos.coords.accuracy);
        setGpsMsg(`✓ ±${Math.round(pos.coords.accuracy)}m de precisão`); setGpsBusy(false);
      },
      err => { setGpsMsg(`Erro: ${err.message}`); setGpsBusy(false); },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  async function uploadFoto(file: File) {
    if (fotos.length >= 3 || !fazendaId) return;
    setUploading(true);
    const ext  = file.name.split(".").pop() ?? "jpg";
    const path = `monitoramento/${fazendaId}/${Date.now()}.${ext}`;
    try {
      const { data: up, error: upErr } = await supabase.storage.from("arquivos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("arquivos").getPublicUrl(up.path);
      setFotos(prev => [...prev, publicUrl]);
    } catch (e) { setErro(`Foto: ${(e as Error).message}`); }
    setUploading(false);
  }

  async function salvar() {
    if (!fazendaId) return;
    setErro(""); setSalvando(true);
    const nomeFinal = (fNome.startsWith("Outra") || fNome.startsWith("Outro")) ? fNomeC.trim() : fNome;
    if (!fTalhao || !nomeFinal) { setErro("Preencha talhão e ocorrência."); setSalvando(false); return; }
    try {
      const { error } = await supabase.from("monitoramento_pragas").insert({
        fazenda_id:          fazendaId,
        ciclo_id:            fCiclo || null,
        talhao_id:           fTalhao,
        data:                fData,
        data_monitoramento:  fData,
        tipo:                fTipo,
        nome:                nomeFinal,
        nivel:               fNivel,
        percentual_plantas:  fPct ? parseFloat(fPct) : null,
        estagio:             fEstagio || null,
        estagio_cultura:     fEstagio || null,
        acao_recomendada:    fAcao  || null,
        observacoes:         fObs   || null,
        gps_lat:             gpsLat,
        gps_lng:             gpsLng,
        gps_accuracy_m:      gpsAcc,
        foto_url:            fotos[0] ?? null,
        foto_url_2:          fotos[1] ?? null,
        foto_url_3:          fotos[2] ?? null,
        recomendacao_id:     fRecId || null,
        usuario_id:          null,
      });
      if (error) throw new Error(error.message);
      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFTalhao(""); setFCiclo(""); setFData(new Date().toISOString().split("T")[0]);
    setFTipo("praga"); setFNome(""); setFNomeC(""); setFNivel(1); setFPct("");
    setFEstagio(""); setFAcao(""); setFObs(""); setFRecId("");
    setGpsLat(null); setGpsLng(null); setGpsAcc(null); setGpsMsg(""); setFotos([]);
    setErro(""); setSalvando(false); setEtapa("form");
  }

  // ── Sucesso ──
  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Registro salvo com sucesso!</div>
      {gpsLat && <div style={{ fontSize: 13, color: "#555", textAlign: "center" }}>📍 {gpsLat.toFixed(6)}, {gpsLng?.toFixed(6)}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Novo Registro
        </button>
        <a href="/lavoura/pragas" style={{ padding: "14px", background: "#fff", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver todos os registros
        </a>
      </div>
    </div>
  );

  // ── Etapa GPS ──
  if (etapa === "gps") return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>📍 Capturar Localização</div>
      <div style={{ fontSize: 13, color: "#555" }}>A localização GPS georreferencia o ponto de incidência no talhão.</div>

      <div style={{ background: gpsLat ? "#F0FDF4" : "#F4F6FA", border: `0.5px solid ${gpsLat ? "#86EFAC" : "#DDE2EE"}`, borderRadius: 14, padding: 20, textAlign: "center" }}>
        {gpsBusy ? (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
            <div style={{ fontSize: 14, color: "#555" }}>Obtendo localização...</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Aguarde até 20 segundos</div>
          </div>
        ) : gpsLat ? (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>Localização capturada</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 6, fontFamily: "monospace" }}>
              {gpsLat.toFixed(7)}<br />{gpsLng?.toFixed(7)}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{gpsMsg}</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 14, color: "#555" }}>GPS não capturado</div>
            {gpsMsg && <div style={{ fontSize: 12, color: "#E24B4A", marginTop: 4 }}>{gpsMsg}</div>}
          </div>
        )}
      </div>

      {!gpsBusy && (
        <button onClick={capturarGPS} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {gpsLat ? "Recapturar GPS" : "Capturar GPS"}
        </button>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setEtapa("form")} style={{ flex: 1, padding: "12px", background: "#fff", color: "#555", border: "0.5px solid #D4DCE8", borderRadius: 12, fontSize: 14, cursor: "pointer" }}>
          ← Voltar
        </button>
        <button onClick={() => setEtapa("foto")} style={{ flex: 2, padding: "12px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {gpsLat ? "Próximo: Foto →" : "Pular GPS →"}
        </button>
      </div>
    </div>
  );

  // ── Etapa FOTO ──
  if (etapa === "foto") return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>📷 Foto da Ocorrência</div>
      <div style={{ fontSize: 13, color: "#555" }}>Tire até 3 fotos da ocorrência para documentar.</div>

      {fotos.length === 0 ? (
        <div style={{ background: "#F4F6FA", border: "2px dashed #D4DCE8", borderRadius: 14, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <div style={{ fontSize: 14, color: "#888" }}>Nenhuma foto ainda</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {fotos.map((url, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={url} alt={`foto ${i+1}`} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
              <button onClick={() => setFotos(p => p.filter((_,j) => j !== i))}
                style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, background: "#E24B4A", color: "#fff", border: "none", borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {fotos.length < 3 && (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: "16px", background: "#fff", color: "#1A4870", border: "1.5px solid #1A4870", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span>{uploading ? "Enviando..." : "📷 Tirar / Selecionar Foto"}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFoto(f); e.target.value = ""; }} />
        </>
      )}

      {erro && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>{erro}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setEtapa("gps")} style={{ flex: 1, padding: "12px", background: "#fff", color: "#555", border: "0.5px solid #D4DCE8", borderRadius: 12, fontSize: 14, cursor: "pointer" }}>
          ← GPS
        </button>
        <button onClick={salvar} disabled={salvando}
          style={{ flex: 2, padding: "12px", background: salvando ? "#aaa" : "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
          {salvando ? "Salvando..." : "✓ Salvar Registro"}
        </button>
      </div>
    </div>
  );

  // ── Etapa FORM (principal) ──
  const nomeEhCustom = fNome.startsWith("Outra") || fNome.startsWith("Outro");
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>🐛 Monitoramento de Campo</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Pragas · Doenças · Plantas Daninhas</div>
      </div>

      {/* Talhão */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Talhão *</label>
        <select value={fTalhao} onChange={e => setFTalhao(e.target.value)} style={inp}>
          <option value="">Selecione o talhão...</option>
          {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}{t.area_ha ? ` (${t.area_ha} ha)` : ""}</option>)}
        </select>
      </div>

      {/* Ciclo + Data */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Ciclo</label>
          <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
            <option value="">Nenhum</option>
            {ciclos.map(c => (
              <option key={c.id} value={c.id}>
                {c.cultura} {(c.ano_safra as unknown as { ano: string } | null)?.ano ?? ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Data</label>
          <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Tipo */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Tipo *</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { v: "praga", label: "Praga", icon: "🐛" },
            { v: "doenca", label: "Doença", icon: "🍂" },
            { v: "planta_daninha", label: "Invasora", icon: "🌿" },
          ].map(t => (
            <button key={t.v} type="button" onClick={() => { setFTipo(t.v as typeof fTipo); setFNome(""); setFNomeC(""); }}
              style={{ padding: "12px 8px", borderRadius: 10, border: `2px solid ${fTipo === t.v ? "#1A4870" : "#DDE2EE"}`, background: fTipo === t.v ? "#EFF4FA" : "#fff", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 22 }}>{t.icon}</div>
              <div style={{ fontSize: 11, fontWeight: fTipo === t.v ? 700 : 400, color: fTipo === t.v ? "#1A4870" : "#555", marginTop: 4 }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ocorrência */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Ocorrência *</label>
        <select value={fNome} onChange={e => setFNome(e.target.value)} style={inp}>
          <option value="">Selecione...</option>
          {CATALOGO[fTipo].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {nomeEhCustom && (
          <input style={{ ...inp, marginTop: 8 }} placeholder="Descreva a ocorrência..." value={fNomeC} onChange={e => setFNomeC(e.target.value)} />
        )}
      </div>

      {/* Nível */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Nível de Infestação *</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {NIVEL.map(n => (
            <button key={n.n} type="button" onClick={() => setFNivel(n.n)}
              style={{ padding: "12px", borderRadius: 12, border: `2px solid ${fNivel === n.n ? n.cor : "#DDE2EE"}`, background: fNivel === n.n ? n.bg : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>{n.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: n.cor }}>{n.label}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{n.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* % + Estágio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>% Plantas Afetadas</label>
          <InputNumerico min="0" max="100" placeholder="Ex: 15" value={fPct} onChange={v => setFPct(v)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Estágio</label>
          <input placeholder="Ex: R3, V5..." value={fEstagio} onChange={e => setFEstagio(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Ação recomendada */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Ação Recomendada</label>
        <textarea rows={2} placeholder="Ex: Aplicar inseticida..." value={fAcao} onChange={e => setFAcao(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {/* Recomendação vinculada */}
      {recs.length > 0 && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Vincular Recomendação</label>
          <select value={fRecId} onChange={e => setFRecId(e.target.value)} style={inp}>
            <option value="">Sem vínculo</option>
            {recs.map(r => (
              <option key={r.id} value={r.id}>
                {new Date(r.data_recomendacao+"T12:00").toLocaleDateString("pt-BR")} — {r.tipo}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Observações */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Observações</label>
        <textarea rows={2} placeholder="Localização no talhão, condições climáticas..." value={fObs} onChange={e => setFObs(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {erro && <div style={{ padding: "12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>{erro}</div>}

      {/* Botão próximo */}
      <button onClick={() => {
        const nomeFinal = nomeEhCustom ? fNomeC.trim() : fNome;
        if (!fTalhao || !nomeFinal) { setErro("Preencha talhão e ocorrência."); return; }
        setErro(""); setEtapa("gps");
      }} style={{ padding: "16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
        Próximo: GPS e Foto →
      </button>

    </div>
  );
}
