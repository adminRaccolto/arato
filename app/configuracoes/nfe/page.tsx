"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
interface TextoCfop { cfop: string; texto: string; }

interface ConfigNfe {
  id?: string;
  fazenda_id: string;

  // ── Perfil do emitente ────────────────────────────────────
  tipo_emitente: "pf" | "pj";   // define TODA a base tributária

  // ── Emissão ───────────────────────────────────────────────
  ambiente: "producao" | "homologacao";
  modelo: "55" | "65";
  serie: string;
  proximo_numero: number;
  forma_emissao: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "9";

  // ── Regime tributário (PJ) ────────────────────────────────
  regime_tributario: "1" | "2" | "3";
  // 1 = Simples Nacional, 2 = Simples Nacional excesso, 3 = Regime Normal

  // ── Funrural ──────────────────────────────────────────────
  // PF: incide sobre receita bruta da comercialização
  // PJ: incide sobre folha de pagamento (diferente)
  funrural_ativo: boolean;
  funrural_responsavel: "emitente" | "adquirente";
  // PF: alíquota total = 1,5% (1,2% GILRAT + 0,1% SENAR + 0,2% RAT)
  // PJ via folha: 2,1% (1,7% INSS + 0,2% SENAR + 0,2% RAT)
  funrural_aliquota_inss: number;   // PF: 1.2 | PJ: 1.7
  funrural_aliquota_senar: number;  // PF: 0.1 | PJ: 0.2
  funrural_aliquota_rat: number;    // PF: 0.2 | PJ: 0.2
  funrural_texto: string;

  // ── ICMS ──────────────────────────────────────────────────
  icms_diferido: boolean;
  pct_icms_diferido: number;        // % do diferimento, normalmente 100% em MT
  aliquota_icms_intraestadual: number;
  aliquota_icms_interestadual_sul_sudeste: number;   // 12%
  aliquota_icms_interestadual_demais: number;        // 7%
  texto_icms_diferido: string;

  // ── PIS / COFINS (apenas PJ) ─────────────────────────────
  pis_cofins_ativo: boolean;
  cst_pis_cofins: string;           // 70 = isenção, 07 = operação isenta, 04 = monofásico, 99 = outras
  aliquota_pis: number;
  aliquota_cofins: number;

  // ── CFOPs padrão ─────────────────────────────────────────
  cfop_venda_intra: string;
  cfop_venda_inter: string;
  cfop_remessa_armazem: string;
  cfop_retorno_armazem: string;
  cfop_devolucao_compra: string;

  // ── Textos legais ─────────────────────────────────────────
  texto_complementar: string;
  texto_produtor_rural: string;
  textos_por_cfop: TextoCfop[];

  // ── IBS / CBS (Reforma Tributária 2027) ───────────────────
  destaque_ibs_cbs: boolean;
  aliquota_ibs: number;
  aliquota_cbs: number;
  texto_ibs_cbs: string;

  // ── Automação ─────────────────────────────────────────────
  emissao_automatica: boolean;
  gerar_danfe_auto: boolean;
  armazenar_xml_storage: boolean;
  enviar_xml_email: boolean;
  email_copia_xml: string;
}

const PADRAO = (fid: string): ConfigNfe => ({
  fazenda_id: fid,
  tipo_emitente: "pf",
  ambiente: "homologacao",
  modelo: "55",
  serie: "1",
  proximo_numero: 1,
  forma_emissao: "1",
  regime_tributario: "3",
  funrural_ativo: true,
  funrural_responsavel: "adquirente",
  funrural_aliquota_inss: 1.2,
  funrural_aliquota_senar: 0.1,
  funrural_aliquota_rat: 0.2,
  funrural_texto: "O adquirente é responsável pela retenção e recolhimento do Funrural (GILRAT 1,2% + SENAR 0,1% + RAT 0,2%) conforme Lei 10.256/2001.",
  icms_diferido: true,
  pct_icms_diferido: 100,
  aliquota_icms_intraestadual: 0,
  aliquota_icms_interestadual_sul_sudeste: 12,
  aliquota_icms_interestadual_demais: 7,
  texto_icms_diferido: "ICMS diferido integralmente (100%) por força do art. 18 do Anexo VII do RICMS/MT (Dec. 2.212/2014). O recolhimento fica atribuído ao destinatário.",
  pis_cofins_ativo: false,
  cst_pis_cofins: "07",
  aliquota_pis: 0,
  aliquota_cofins: 0,
  cfop_venda_intra: "6101",
  cfop_venda_inter: "6101",
  cfop_remessa_armazem: "1905",
  cfop_retorno_armazem: "5905",
  cfop_devolucao_compra: "5201",
  texto_complementar: "",
  texto_produtor_rural: "Produtor Rural Pessoa Física. Inscrição Estadual de Produtor Rural. NF emitida conforme IN 006/2017-SEFAZ/MT.",
  textos_por_cfop: [],
  destaque_ibs_cbs: false,
  aliquota_ibs: 0,
  aliquota_cbs: 0,
  texto_ibs_cbs: "Valores estimados de IBS e CBS destacados conforme LC 214/2024.",
  emissao_automatica: false,
  gerar_danfe_auto: true,
  armazenar_xml_storage: true,
  enviar_xml_email: false,
  email_copia_xml: "",
});

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 500 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "20px 24px", marginBottom: 16 };
const sH: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1A4870", marginBottom: 14, paddingBottom: 8, borderBottom: "0.5px solid #EEF1F6" };
const hint: React.CSSProperties = { fontSize: 11, color: "#888", marginTop: 5 };
const alerta: React.CSSProperties = { background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12", marginBottom: 14 };

type Aba = "perfil" | "emissao" | "tributacao" | "textos" | "ibs_cbs" | "automacao";
const ABAS: { id: Aba; label: string }[] = [
  { id: "perfil",     label: "Perfil"          },
  { id: "emissao",    label: "Emissão"         },
  { id: "tributacao", label: "Tributação"      },
  { id: "textos",     label: "Textos Legais"   },
  { id: "ibs_cbs",    label: "IBS / CBS 2027"  },
  { id: "automacao",  label: "Automação"       },
];

function Toggle({ on, onChange, label, desc, disabled = false }: {
  on: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "0.5px solid #F0F2F7" }}>
      <div style={{ opacity: disabled ? 0.5 : 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "#888", marginTop: 2, maxWidth: 600, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <button type="button" onClick={() => !disabled && onChange(!on)} disabled={disabled}
        style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: disabled ? "default" : "pointer",
          background: on && !disabled ? "#1A5C38" : "#D4DCE8", position: "relative", transition: "background 0.2s",
          flexShrink: 0, marginLeft: 20, opacity: disabled ? 0.5 : 1 }}
      >
        <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18,
          borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

function NumInput({ value, onChange, label, hint: h, suffix, min = 0, max = 100, step = 0.01, disabled = false }: {
  value: number; onChange: (v: number) => void; label: string; hint?: string;
  suffix?: string; min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ ...lbl, opacity: disabled ? 0.5 : 1 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          disabled={disabled}
          style={{ ...inp, maxWidth: 120, opacity: disabled ? 0.5 : 1 }}
        />
        {suffix && <span style={{ fontSize: 12, color: "#555" }}>{suffix}</span>}
      </div>
      {h && <p style={{ ...hint, opacity: disabled ? 0.5 : 1 }}>{h}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function ConfigNfePage() {
  const { fazendaId } = useAuth();
  const [aba, setAba]       = useState<Aba>("perfil");
  const [cfg, setCfg]       = useState<ConfigNfe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("configuracoes_nfe").select("*").eq("fazenda_id", fazendaId).single();
    setCfg(data
      ? { ...PADRAO(fazendaId), ...data, textos_por_cfop: (data.textos_por_cfop ?? []) as TextoCfop[] }
      : PADRAO(fazendaId));
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (!cfg || !fazendaId) return;
    setSaving(true); setErr(""); setSaved(false);
    try {
      const payload = { ...cfg, updated_at: new Date().toISOString() };
      if (cfg.id) {
        const { error } = await supabase.from("configuracoes_nfe").update(payload).eq("id", cfg.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("configuracoes_nfe").insert(payload).select().single();
        if (error) throw error;
        setCfg(p => p ? { ...p, id: data.id } : p);
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  const set = <K extends keyof ConfigNfe>(k: K, v: ConfigNfe[K]) =>
    setCfg(p => p ? { ...p, [k]: v } : p);

  // Quando muda PF ↔ PJ, ajusta defaults tributários
  function mudarTipoEmitente(tipo: "pf" | "pj") {
    setCfg(p => {
      if (!p) return p;
      if (tipo === "pf") return {
        ...p, tipo_emitente: "pf",
        regime_tributario: "3",
        funrural_aliquota_inss: 1.2,
        funrural_aliquota_senar: 0.1,
        funrural_aliquota_rat: 0.2,
        pis_cofins_ativo: false,
        funrural_texto: "O adquirente é responsável pela retenção e recolhimento do Funrural (GILRAT 1,2% + SENAR 0,1% + RAT 0,2%) conforme Lei 10.256/2001.",
        texto_produtor_rural: "Produtor Rural Pessoa Física. Inscrição Estadual de Produtor Rural. NF emitida conforme IN 006/2017-SEFAZ/MT.",
      };
      return {
        ...p, tipo_emitente: "pj",
        funrural_aliquota_inss: 1.7,
        funrural_aliquota_senar: 0.2,
        funrural_aliquota_rat: 0.2,
        funrural_responsavel: "emitente",
        funrural_texto: "Funrural recolhido pelo emitente sobre a folha de pagamento (INSS 1,7% + SENAR 0,2% + RAT 0,2%) conforme Lei 8.212/1991.",
        texto_produtor_rural: "Produtor Rural Pessoa Jurídica. CNPJ regularmente inscrito junto à SEFAZ/MT.",
      };
    });
  }

  const totalFunrural = cfg
    ? cfg.funrural_aliquota_inss + cfg.funrural_aliquota_senar + cfg.funrural_aliquota_rat
    : 0;

  if (!cfg) return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>
        Carregando…
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ flex: 1, padding: "24px 28px", maxWidth: 980, margin: "0 auto", width: "100%" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Configurações de NF-e</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
              Perfil tributário, regras fiscais, textos legais e automação
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Badge PF/PJ sempre visível */}
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
              background: cfg.tipo_emitente === "pf" ? "#D5E8F5" : "#FAEEDA",
              color: cfg.tipo_emitente === "pf" ? "#0B2D50" : "#633806" }}>
              {cfg.tipo_emitente === "pf" ? "Produtor Rural PF" : "Produtor Rural PJ"}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
              background: cfg.ambiente === "producao" ? "#E8F5E9" : "#FBF3E0",
              color: cfg.ambiente === "producao" ? "#1A5C38" : "#C9921B" }}>
              {cfg.ambiente === "producao" ? "🟢 Produção" : "🟡 Homologação"}
            </span>
            {saved && <span style={{ fontSize: 12, color: "#1A5C38", fontWeight: 600 }}>✓ Salvo</span>}
            {err   && <span style={{ fontSize: 12, color: "#E24B4A" }}>{err}</span>}
            <button onClick={salvar} disabled={saving}
              style={{ padding: "8px 22px", background: saving ? "#ccc" : "#1A5C38", color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 600, cursor: saving ? "default" : "pointer", fontSize: 13 }}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#fff", borderRadius: 10,
          border: "0.5px solid #D4DCE8", padding: 4 }}>
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              style={{ flex: 1, padding: "8px 10px", border: "none", borderRadius: 8, cursor: "pointer",
                background: aba === a.id ? "#1A4870" : "transparent",
                color: aba === a.id ? "#fff" : "#555",
                fontWeight: aba === a.id ? 600 : 400, fontSize: 13, transition: "all 0.15s" }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════
            ABA — PERFIL DO EMITENTE
        ═══════════════════════════════════════════════════ */}
        {aba === "perfil" && (
          <div>
            {/* PF / PJ */}
            <div style={card}>
              <div style={sH}>Tipo do Emitente</div>
              <div style={alerta}>
                Esta configuração define toda a base tributária da fazenda: Funrural, ICMS, PIS/COFINS, textos legais e o
                conteúdo do campo <strong>emitente</strong> no XML da NF-e (CPF vs CNPJ).
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                  {
                    v: "pf", titulo: "Pessoa Física — CPF",
                    itens: ["Emissão com CPF no XML", "Funrural: 1,5% sobre receita bruta (GILRAT 1,2% + SENAR 0,1% + RAT 0,2%)", "Não apura PIS/COFINS", "ICMS diferido em MT — operações internas com grãos", "CRT = 3 (Regime Normal)"],
                  },
                  {
                    v: "pj", titulo: "Pessoa Jurídica — CNPJ",
                    itens: ["Emissão com CNPJ no XML", "Funrural: 2,1% sobre folha (INSS 1,7% + SENAR 0,2% + RAT 0,2%)", "Apura PIS/COFINS conforme regime", "ICMS diferido em MT — mesmas regras", "CRT conforme regime (1, 2 ou 3)"],
                  },
                ] as { v: "pf"|"pj"; titulo: string; itens: string[] }[]).map(({ v, titulo, itens }) => (
                  <button key={v} type="button" onClick={() => mudarTipoEmitente(v)}
                    style={{ padding: "18px 20px", border: `2px solid ${cfg.tipo_emitente === v ? "#1A4870" : "#D4DCE8"}`,
                      borderRadius: 12, background: cfg.tipo_emitente === v ? "#D5E8F5" : "#fff", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>
                      {cfg.tipo_emitente === v ? "● " : "○ "}{titulo}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {itens.map((it, i) => (
                        <li key={i} style={{ fontSize: 12, color: "#444", marginBottom: 4, lineHeight: 1.5 }}>{it}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo tributário do perfil */}
            <div style={card}>
              <div style={sH}>Resumo do Perfil Tributário Atual</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Tipo",           value: cfg.tipo_emitente === "pf" ? "Pessoa Física (CPF)" : "Pessoa Jurídica (CNPJ)" },
                  { label: "Regime",         value: cfg.tipo_emitente === "pf" ? "Regime Normal (CRT 3) — obrigatório PF" : ["Simples Nacional","Simples Nacional excesso","Regime Normal"][parseInt(cfg.regime_tributario)-1] },
                  { label: "Funrural",       value: cfg.funrural_ativo ? `${totalFunrural.toFixed(1)}% — resp. ${cfg.funrural_responsavel === "adquirente" ? "adquirente retém" : "emitente recolhe"}` : "Não incide" },
                  { label: "ICMS Diferido",  value: cfg.icms_diferido ? `${cfg.pct_icms_diferido}% — MT grãos (art. 18 Anexo VII RICMS)` : "Não utiliza diferimento" },
                  { label: "PIS/COFINS",     value: cfg.tipo_emitente === "pf" ? "Não incide (PF imune)" : cfg.pis_cofins_ativo ? `CST ${cfg.cst_pis_cofins} — PIS ${cfg.aliquota_pis}% / COFINS ${cfg.aliquota_cofins}%` : "Isento / não destacado" },
                  { label: "IBS/CBS 2027",   value: cfg.destaque_ibs_cbs ? `IBS ${cfg.aliquota_ibs}% + CBS ${cfg.aliquota_cbs}%` : "Não configurado" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600, lineHeight: 1.5 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            ABA — EMISSÃO
        ═══════════════════════════════════════════════════ */}
        {aba === "emissao" && (
          <div>
            <div style={card}>
              <div style={sH}>Ambiente de Emissão</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                  { v: "homologacao", label: "🟡 Homologação", desc: "Ambiente de testes. NF-e sem validade fiscal.", bg: "#FBF3E0", border: "#C9921B" },
                  { v: "producao",    label: "🟢 Produção",    desc: "NF-e com validade fiscal real junto à SEFAZ.", bg: "#E8F5E9", border: "#1A5C38" },
                ] as {v:"producao"|"homologacao"; label:string; desc:string; bg:string; border:string}[]).map(({ v, label, desc, bg, border }) => (
                  <button key={v} type="button" onClick={() => set("ambiente", v)}
                    style={{ padding: "16px 20px", border: `2px solid ${cfg.ambiente === v ? border : "#D4DCE8"}`,
                      borderRadius: 10, background: cfg.ambiente === v ? bg : "#fff", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={card}>
              <div style={sH}>Modelo, Série e Numeração</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Modelo</label>
                  <select value={cfg.modelo} onChange={e => set("modelo", e.target.value as "55"|"65")} style={inp}>
                    <option value="55">55 — NF-e (padrão agrícola)</option>
                    <option value="65">65 — NFC-e (consumidor final)</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Série</label>
                  <input value={cfg.serie} onChange={e => set("serie", e.target.value)} placeholder="1" style={inp} />
                  <p style={hint}>Padrão: 1. Máximo 999. Produtores rurais PF normalmente usam série 1.</p>
                </div>
                <div>
                  <label style={lbl}>Próximo número</label>
                  <input type="number" min={1} value={cfg.proximo_numero}
                    onChange={e => set("proximo_numero", parseInt(e.target.value)||1)} style={inp} />
                  <p style={hint}>A próxima NF emitida receberá este número.</p>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={sH}>Forma de Emissão (tpEmis)</div>
              <select value={cfg.forma_emissao} onChange={e => set("forma_emissao", e.target.value as ConfigNfe["forma_emissao"])} style={{ ...inp, maxWidth: 420 }}>
                <option value="1">1 — Emissão normal (usar em condições normais)</option>
                <option value="6">6 — Contingência SVC-AN (SEFAZ Virtual Ambiente Nacional)</option>
                <option value="7">7 — Contingência SVC-RS (SEFAZ Virtual Rio Grande do Sul)</option>
                <option value="5">5 — Contingência FS-DA (Formulário de Segurança para Impressão)</option>
              </select>
              <p style={hint}>Altere para contingência apenas quando a SEFAZ estiver indisponível. Retorne para "1 — Normal" assim que possível.</p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            ABA — TRIBUTAÇÃO
        ═══════════════════════════════════════════════════ */}
        {aba === "tributacao" && (
          <div>

            {/* Regime Tributário — só PJ */}
            {cfg.tipo_emitente === "pj" && (
              <div style={card}>
                <div style={sH}>Regime Tributário (CRT) — Pessoa Jurídica</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {([
                    { v: "1", crt: "CRT 1", label: "Simples Nacional",           desc: "ME/EPP optante. Receita anual até R$ 4,8M." },
                    { v: "2", crt: "CRT 2", label: "Simples Nacional — excesso",  desc: "Receita acima do sublimite. ICMS e ISS pelo Regime Normal." },
                    { v: "3", crt: "CRT 3", label: "Regime Normal",               desc: "Lucro Presumido, Lucro Real ou Produtor Rural PJ." },
                  ] as {v:"1"|"2"|"3";crt:string;label:string;desc:string}[]).map(({ v, crt, label, desc }) => (
                    <button key={v} type="button" onClick={() => set("regime_tributario", v)}
                      style={{ padding: "14px 16px", border: `2px solid ${cfg.regime_tributario === v ? "#1A4870" : "#D4DCE8"}`,
                        borderRadius: 10, background: cfg.regime_tributario === v ? "#D5E8F5" : "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#1A4870", marginBottom: 2, textTransform: "uppercase" }}>{crt}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cfg.tipo_emitente === "pf" && (
              <div style={{ ...alerta, background: "#D5E8F5", border: "0.5px solid #93C5FD", color: "#0B2D50" }}>
                <strong>Produtor Rural PF:</strong> Regime Tributário é sempre <strong>CRT 3 — Regime Normal</strong>, independente do faturamento.
                Produtores rurais PF são obrigados a usar CRT 3 conforme NT 2016/002 da NF-e.
              </div>
            )}

            {/* Funrural */}
            <div style={card}>
              <div style={sH}>Funrural</div>
              <div style={{ ...alerta, margin: "0 0 14px 0" }}>
                {cfg.tipo_emitente === "pf"
                  ? "Base: receita bruta da comercialização rural (NF-e de venda). Alíquotas fixadas pela Lei 10.256/2001 e IN RFB 971/2009."
                  : "Base: folha de pagamento (PJ não recolhe Funrural sobre receita bruta). Contribuição patronal ao INSS rural."}
              </div>
              <Toggle on={cfg.funrural_ativo} onChange={v => set("funrural_ativo", v)}
                label="Incidência do Funrural nesta fazenda"
                desc="Desative apenas se houver decisão judicial transitada em julgado afastando a contribuição." />

              {cfg.funrural_ativo && (
                <>
                  <div style={{ marginTop: 14 }}>
                    <label style={lbl}>Responsável pelo recolhimento</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {([
                        { v: "adquirente", label: "Adquirente retém na fonte",  desc: "Mais comum. O comprador desconta e recolhe." },
                        { v: "emitente",   label: "Emitente recolhe diretamente", desc: "Produtor recolhe via GPS/DARF." },
                      ] as {v:"emitente"|"adquirente";label:string;desc:string}[]).map(({ v, label, desc }) => (
                        <button key={v} type="button" onClick={() => set("funrural_responsavel", v)}
                          style={{ flex: 1, padding: "12px 14px", border: `2px solid ${cfg.funrural_responsavel === v ? "#1A4870" : "#D4DCE8"}`,
                            borderRadius: 10, background: cfg.funrural_responsavel === v ? "#D5E8F5" : "#fff", cursor: "pointer", textAlign: "left" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
                    <NumInput value={cfg.funrural_aliquota_inss}  onChange={v => set("funrural_aliquota_inss", v)}
                      label={cfg.tipo_emitente === "pf" ? "GILRAT (INSS) %" : "INSS Patronal %"}
                      hint={cfg.tipo_emitente === "pf" ? "Padrão PF: 1,2%" : "Padrão PJ: 1,7%"} suffix="%" />
                    <NumInput value={cfg.funrural_aliquota_senar} onChange={v => set("funrural_aliquota_senar", v)}
                      label="SENAR %" hint={cfg.tipo_emitente === "pf" ? "Padrão PF: 0,1%" : "Padrão PJ: 0,2%"} suffix="%" />
                    <NumInput value={cfg.funrural_aliquota_rat}   onChange={v => set("funrural_aliquota_rat", v)}
                      label="RAT %" hint="Padrão: 0,2%" suffix="%" />
                    <div>
                      <label style={lbl}>Total Funrural</label>
                      <div style={{ padding: "8px 10px", borderRadius: 8, background: "#F3F6F9", border: "0.5px solid #D4DCE8",
                        fontSize: 16, fontWeight: 700, color: "#1A4870" }}>
                        {totalFunrural.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={lbl}>Texto legal Funrural para o infCpl</label>
                    <textarea value={cfg.funrural_texto} onChange={e => set("funrural_texto", e.target.value)}
                      rows={3} style={{ ...inp, resize: "vertical" }} />
                  </div>
                </>
              )}
            </div>

            {/* ICMS */}
            <div style={card}>
              <div style={sH}>ICMS — Regras para Grãos em Mato Grosso</div>
              <Toggle on={cfg.icms_diferido} onChange={v => set("icms_diferido", v)}
                label="ICMS Diferido nas saídas internas com grãos"
                desc="Art. 18 do Anexo VII do RICMS/MT (Dec. 2.212/2014). Aplica-se a soja, milho, algodão e outros grãos em operações internas. O recolhimento é atribuído ao destinatário/adquirente." />

              {cfg.icms_diferido && (
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <NumInput value={cfg.pct_icms_diferido} onChange={v => set("pct_icms_diferido", v)}
                    label="Percentual do diferimento" hint="Normalmente 100% para grãos em MT." suffix="%" />
                  <div style={{ paddingTop: 18, fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                    ICMS diferido significa que o imposto <strong>não é destacado na NF-e</strong>. O campo CST será{" "}
                    <strong>051 (diferimento)</strong> e o valor do ICMS será zero na NF.
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
                <NumInput value={cfg.aliquota_icms_intraestadual} onChange={v => set("aliquota_icms_intraestadual", v)}
                  label="Alíquota intraestadual (MT→MT)" hint="Grãos em MT: 0% (diferido). Outras mercadorias: 17%." suffix="%" />
                <NumInput value={cfg.aliquota_icms_interestadual_sul_sudeste} onChange={v => set("aliquota_icms_interestadual_sul_sudeste", v)}
                  label="Interestadual Sul/Sudeste" hint="MT → SP, PR, RS, SC, RJ, MG, ES: 12%" suffix="%" />
                <NumInput value={cfg.aliquota_icms_interestadual_demais} onChange={v => set("aliquota_icms_interestadual_demais", v)}
                  label="Interestadual demais regiões" hint="MT → Norte, Nordeste, CO: 7%" suffix="%" />
              </div>
            </div>

            {/* PIS/COFINS — apenas PJ */}
            <div style={card}>
              <div style={sH}>PIS / COFINS</div>
              {cfg.tipo_emitente === "pf" ? (
                <div style={{ ...alerta, background: "#D5E8F5", border: "0.5px solid #93C5FD", color: "#0B2D50" }}>
                  <strong>Produtor Rural Pessoa Física não apura PIS/COFINS.</strong> A atividade rural de PF é imune/não incidente.
                  CST padrão = 70 (Saída isenta de contribuição). Não é necessário configurar alíquotas.
                </div>
              ) : (
                <>
                  <Toggle on={cfg.pis_cofins_ativo} onChange={v => set("pis_cofins_ativo", v)}
                    label="Destacar PIS/COFINS nas NF-e"
                    desc="Ative para regimes que apuram PIS/COFINS (Lucro Presumido, Lucro Real). No Simples Nacional, normalmente não se destaca." />
                  {cfg.pis_cofins_ativo && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
                      <div>
                        <label style={lbl}>CST PIS/COFINS</label>
                        <select value={cfg.cst_pis_cofins} onChange={e => set("cst_pis_cofins", e.target.value)} style={inp}>
                          <option value="01">01 — Tributável à alíquota básica</option>
                          <option value="02">02 — Tributável à alíquota diferenciada</option>
                          <option value="04">04 — Operação tributável monofásica</option>
                          <option value="06">06 — Operação tributável a zero</option>
                          <option value="07">07 — Operação isenta</option>
                          <option value="08">08 — Operação sem incidência</option>
                          <option value="09">09 — Operação com suspensão</option>
                          <option value="49">49 — Outras operações de saída</option>
                          <option value="70">70 — Operação de aquisição isenta</option>
                          <option value="99">99 — Outras operações</option>
                        </select>
                      </div>
                      <NumInput value={cfg.aliquota_pis} onChange={v => set("aliquota_pis", v)}
                        label="Alíquota PIS (%)" hint="Cumulativo: 0,65% | Não-cumulativo: 1,65%" suffix="%" />
                      <NumInput value={cfg.aliquota_cofins} onChange={v => set("aliquota_cofins", v)}
                        label="Alíquota COFINS (%)" hint="Cumulativo: 3% | Não-cumulativo: 7,6%" suffix="%" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* CFOPs padrão */}
            <div style={card}>
              <div style={sH}>CFOPs Padrão por Operação</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                  { key: "cfop_venda_intra",       label: "Venda intraestadual (dentro de MT)",     hint: "6101 — Venda de produção própria" },
                  { key: "cfop_venda_inter",        label: "Venda interestadual (fora de MT)",       hint: "6101 — Venda de produção própria interestadual" },
                  { key: "cfop_remessa_armazem",    label: "Remessa para armazém / silo",            hint: "1905 — Remessa para depósito por conta e ordem" },
                  { key: "cfop_retorno_armazem",    label: "Retorno de armazém",                     hint: "5905 — Retorno de remessa para depósito" },
                  { key: "cfop_devolucao_compra",   label: "Devolução de compra",                    hint: "5201 (intraestadual) / 6201 (interestadual)" },
                ] as {key:keyof ConfigNfe;label:string;hint:string}[]).map(({ key, label, hint: h }) => (
                  <div key={key as string}>
                    <label style={lbl}>{label}</label>
                    <input value={cfg[key] as string} onChange={e => set(key, e.target.value)} style={inp} />
                    <p style={hint}>{h}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            ABA — TEXTOS LEGAIS
        ═══════════════════════════════════════════════════ */}
        {aba === "textos" && (
          <div>
            <div style={card}>
              <div style={sH}>Texto Complementar Padrão (infCpl)</div>
              <textarea value={cfg.texto_complementar} onChange={e => set("texto_complementar", e.target.value)}
                rows={4} placeholder="Texto adicional que aparece em todas as NF-e..." style={{ ...inp, resize: "vertical" }} />
              <p style={hint}>Aparece no campo infCpl do XML e no rodapé do DANFE. Pode ser sobrescrito por NF individualmente.</p>
            </div>

            <div style={card}>
              <div style={sH}>Textos Obrigatórios por Enquadramento</div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Texto — Produtor Rural ({cfg.tipo_emitente === "pf" ? "PF" : "PJ"})</label>
                <textarea value={cfg.texto_produtor_rural} onChange={e => set("texto_produtor_rural", e.target.value)}
                  rows={2} style={{ ...inp, resize: "vertical" }} />
                <p style={hint}>Inserido automaticamente em toda NF-e do produtor rural.</p>
              </div>
              {cfg.icms_diferido && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Texto — ICMS Diferido (MT)</label>
                  <textarea value={cfg.texto_icms_diferido} onChange={e => set("texto_icms_diferido", e.target.value)}
                    rows={3} style={{ ...inp, resize: "vertical" }} />
                  <p style={hint}>Inserido quando a NF usa ICMS diferido. Referência legal: art. 18, Anexo VII, RICMS/MT.</p>
                </div>
              )}
            </div>

            {/* Textos por CFOP */}
            <div style={card}>
              <div style={{ ...sH, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Textos por CFOP</span>
                <button type="button" onClick={() => set("textos_por_cfop", [...cfg.textos_por_cfop, { cfop: "", texto: "" }])}
                  style={{ padding: "4px 12px", border: "0.5px solid #1A4870", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "#1A4870", fontWeight: 600 }}>
                  + Adicionar
                </button>
              </div>
              {cfg.textos_por_cfop.length === 0 ? (
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: "20px 0" }}>
                  Nenhum texto por CFOP. Use para textos exigidos por operação específica (ex: retorno de armazém, remessa de demonstração).
                </div>
              ) : cfg.textos_por_cfop.map((t, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "110px 1fr 32px", gap: 10, marginBottom: 10, alignItems: "start" }}>
                  <div>
                    <label style={lbl}>CFOP</label>
                    <input value={t.cfop} onChange={e => { const a = [...cfg.textos_por_cfop]; a[idx]={...a[idx],cfop:e.target.value}; set("textos_por_cfop",a); }} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Texto legal</label>
                    <textarea value={t.texto} onChange={e => { const a=[...cfg.textos_por_cfop]; a[idx]={...a[idx],texto:e.target.value}; set("textos_por_cfop",a); }}
                      rows={2} style={{ ...inp, resize: "vertical" }} />
                  </div>
                  <div style={{ paddingTop: 18 }}>
                    <button type="button" onClick={() => set("textos_por_cfop", cfg.textos_por_cfop.filter((_,i)=>i!==idx))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 18, lineHeight: 1, padding: "8px 0" }}>×</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={card}>
              <div style={sH}>Prévia do infCpl gerado automaticamente</div>
              <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 12, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {[
                  cfg.texto_produtor_rural,
                  cfg.funrural_ativo ? cfg.funrural_texto : "",
                  cfg.icms_diferido  ? cfg.texto_icms_diferido : "",
                  cfg.texto_complementar,
                  cfg.destaque_ibs_cbs ? cfg.texto_ibs_cbs : "",
                ].filter(Boolean).join(" ")}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            ABA — IBS / CBS 2027
        ═══════════════════════════════════════════════════ */}
        {aba === "ibs_cbs" && (
          <div>
            <div style={card}>
              <div style={sH}>IBS e CBS — Reforma Tributária (LC 214/2024)</div>
              <div style={alerta}>
                O IBS (substituirá ICMS + ISS) e o CBS (substituirá PIS + COFINS) entram em vigor em <strong>2027</strong>.
                Configure com antecedência para que o sistema já inclua o destaque assim que a legislação exigir.
                As alíquotas definitivas serão publicadas pelo Comitê Gestor do IBS.
              </div>
              <Toggle on={cfg.destaque_ibs_cbs} onChange={v => set("destaque_ibs_cbs", v)}
                label="Destacar IBS e CBS no rodapé da NF-e (infCpl)"
                desc="Quando ativo, o valor estimado de IBS e CBS é calculado por item e inserido no campo de informações complementares." />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                <NumInput value={cfg.aliquota_ibs} onChange={v => set("aliquota_ibs", v)}
                  label="Alíquota IBS (%)" hint="Substitui ICMS (estadual) + ISS (municipal). Alíquota estadual MT + alíquota municipal."
                  suffix="%" disabled={!cfg.destaque_ibs_cbs} />
                <NumInput value={cfg.aliquota_cbs} onChange={v => set("aliquota_cbs", v)}
                  label="Alíquota CBS (%)" hint="Substitui PIS + COFINS. Alíquota federal."
                  suffix="%" disabled={!cfg.destaque_ibs_cbs} />
              </div>
              {cfg.destaque_ibs_cbs && (
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Texto de destaque no infCpl</label>
                  <textarea value={cfg.texto_ibs_cbs} onChange={e => set("texto_ibs_cbs", e.target.value)}
                    rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              )}
            </div>

            {cfg.destaque_ibs_cbs && (
              <div style={card}>
                <div style={sH}>Prévia do destaque no DANFE</div>
                <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 12, color: "#333" }}>
                  {cfg.texto_ibs_cbs} IBS: {cfg.aliquota_ibs}% | CBS: {cfg.aliquota_cbs}%.
                  Valores estimados calculados por item.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            ABA — AUTOMAÇÃO
        ═══════════════════════════════════════════════════ */}
        {aba === "automacao" && (
          <div>
            <div style={card}>
              <div style={sH}>Emissão e Processamento</div>
              <Toggle on={cfg.emissao_automatica} onChange={v => set("emissao_automatica", v)}
                label="Emitir NF-e automaticamente ao confirmar romaneio"
                desc="Ao fechar um romaneio de venda ou confirmar contrato, o sistema gera, assina e transmite a NF-e ao SEFAZ sem intervenção manual. Requer certificado A1 configurado." />
              <Toggle on={cfg.gerar_danfe_auto} onChange={v => set("gerar_danfe_auto", v)}
                label="Gerar DANFE automaticamente após autorização"
                desc="Após autorização SEFAZ, o PDF do DANFE é gerado e armazenado automaticamente." />
              <Toggle on={cfg.armazenar_xml_storage} onChange={v => set("armazenar_xml_storage", v)}
                label="Armazenar XMLs no Storage"
                desc="XMLs autorizados salvos no bucket 'arquivos'. Obrigatório por lei — guarda por 5 anos." />
            </div>
            <div style={card}>
              <div style={sH}>Envio por E-mail</div>
              <Toggle on={cfg.enviar_xml_email} onChange={v => set("enviar_xml_email", v)}
                label="Enviar XML por e-mail após autorização"
                desc="O XML da NF-e autorizada é enviado automaticamente para o destinatário e para a cópia configurada abaixo (via Resend)." />
              {cfg.enviar_xml_email && (
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>E-mail para cópia (contabilidade, arquivo etc.)</label>
                  <input type="email" value={cfg.email_copia_xml}
                    onChange={e => set("email_copia_xml", e.target.value)}
                    placeholder="contabilidade@empresa.com.br" style={{ ...inp, maxWidth: 380 }} />
                </div>
              )}
            </div>

            {/* Resumo status */}
            <div style={{ ...card, background: "#F4F6FA" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Status das automações</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Emissão automática",    on: cfg.emissao_automatica    },
                  { label: "DANFE automático",       on: cfg.gerar_danfe_auto      },
                  { label: "Armazenamento XML",      on: cfg.armazenar_xml_storage },
                  { label: "Envio XML por e-mail",   on: cfg.enviar_xml_email      },
                ].map(({ label, on }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                    background: "#fff", borderRadius: 8, border: "0.5px solid #D4DCE8" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#1A5C38" : "#D4DCE8", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: on ? "#1a1a1a" : "#888" }}>{label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: on ? "#1A5C38" : "#aaa", fontWeight: 600 }}>{on ? "Ativo" : "Inativo"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Salvar rodapé */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 8, paddingBottom: 24 }}>
          {saved && <span style={{ fontSize: 12, color: "#1A5C38", fontWeight: 600, alignSelf: "center" }}>✓ Configurações salvas</span>}
          <button onClick={salvar} disabled={saving}
            style={{ padding: "10px 28px", background: saving ? "#ccc" : "#1A5C38", color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 600, cursor: saving ? "default" : "pointer", fontSize: 14 }}>
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </main>
    </div>
  );
}
