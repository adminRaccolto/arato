"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import InputNumerico from "../../components/InputNumerico";
import { supabase } from "../../lib/supabase";
import { type ContaContabil, planoContasPadrao, LCDPR_OPCOES } from "../../lib/planoContas";
import { listarProdutores, listarPlanoContas, salvarContaContabil, excluirContaContabil } from "../../lib/db";
import type { Produtor } from "../../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────
type Aba = "hub" | "plano_contas" | "certificado";
// "hub" = Acesso Raccolto + Cotação/Basis (conteúdo único desta página)

interface CertInfo {
  modulo: string;
  arquivo_nome: string;
  storage_path: string;
  produtor_id?: string | null;
  produtor_nome: string;
  cpf_cnpj: string;
  data_vencimento?: string | null;
}

interface BasisConfig { soja: number; milho: number; algodao: number; praca: string }
const BASIS_DEFAULT: BasisConfig = { soja: 0, milho: 0, algodao: 0, praca: "" };

// ── Helpers ───────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

const corTipoConta = (t: ContaContabil["tipo"]) => ({
  ativo:   { bg: "#EAF3DE", color: "#1A5C38", label: "ATIVO"   },
  passivo: { bg: "#FCEBEB", color: "#791F1F", label: "PASSIVO" },
  pl:      { bg: "#F0EAF8", color: "#4B1A8A", label: "PL"      },
  receita: { bg: "#D5E8F5", color: "#0B2D50", label: "RECEITA" },
  custo:   { bg: "#FAEEDA", color: "#633806", label: "CUSTO"   },
  despesa: { bg: "#FBF3E0", color: "#8B5E14", label: "DESPESA" },
}[t]);

const contaVazia: ContaContabil = { codigo: "", nome: "", tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: null };

const calcDias = (d?: string | null): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

// ── Componente principal ──────────────────────────────────────
function ConfiguracoesInner() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();

  const tabParaAba = (t: string | null): Aba => {
    if (t === "plano_contas") return "plano_contas";
    if (t === "certificado")  return "certificado";
    return "hub";
  };
  const [aba, setAba] = useState<Aba>(() => tabParaAba(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null
  ));

  // Sincroniza aba com URL ao navegar client-side (ex: TopNav → Configurações → Certificado A1)
  useEffect(() => {
    setAba(tabParaAba(searchParams.get("tab")));
  }, [searchParams]);

  // Raccolto LGPD
  const [raccoltoAcesso,   setRaccoltoAcesso]   = useState(false);
  const [salvandoRaccolto, setSalvandoRaccolto] = useState(false);

  // Certificados
  const [produtores,     setProdutores]     = useState<Produtor[]>([]);
  const [certProdutorId, setCertProdutorId] = useState("");
  const [certFile,       setCertFile]       = useState<File | null>(null);
  const [certSenha,      setCertSenha]      = useState("");
  const [certDataVenc,   setCertDataVenc]   = useState("");
  const [certArrastando, setCertArrastando] = useState(false);
  const [certCarregando, setCertCarregando] = useState(false);
  const [certSucesso,    setCertSucesso]    = useState(false);
  const [certs,          setCerts]          = useState<CertInfo[]>([]);
  const [modalCert,      setModalCert]      = useState(false);
  const certInputRef = useRef<HTMLInputElement>(null);

  // Plano de contas
  const [contas,        setContas]        = useState<ContaContabil[]>([]);
  const [filtroContas,  setFiltroContas]  = useState<"todos" | ContaContabil["tipo"]>("todos");
  const [modalConta,    setModalConta]    = useState(false);
  const [contaEditCod,  setContaEditCod]  = useState<string | null>(null);
  const [formConta,     setFormConta]     = useState<ContaContabil>(contaVazia);
  const [erroConta,     setErroConta]     = useState<string | null>(null);
  const [salvConta,     setSalvConta]     = useState(false);

  // Basis
  const [basis, setBasis] = useState<BasisConfig>(() => {
    try { const b = typeof window !== "undefined" && localStorage.getItem("ractech_basis"); return b ? JSON.parse(b) : BASIS_DEFAULT; } catch { return BASIS_DEFAULT; }
  });
  const [basisSalvo, setBasisSalvo] = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("raccolto_acesso").eq("id", fazendaId).single()
      .then(({ data }) => { if (data) setRaccoltoAcesso(!!(data as { raccolto_acesso?: boolean }).raccolto_acesso); });
    listarProdutores(fazendaId).then(data => {
      setProdutores(data);
      if (data.length === 1) setCertProdutorId(data[0].id);
    }).catch(() => {});
    void fetch(`/api/cert-meta?fazenda_id=${fazendaId}`)
      .then(r => r.json())
      .then((d: { certs?: CertInfo[] }) => { if (d.certs) setCerts(d.certs); })
      .catch(() => {});
    listarPlanoContas(fazendaId).then(data => {
      setContas(data.length > 0 ? data : planoContasPadrao);
    }).catch(() => {});
  }, [fazendaId]);

  async function toggleRaccolto() {
    if (!fazendaId) return;
    setSalvandoRaccolto(true);
    const novo = !raccoltoAcesso;
    const { error } = await supabase.from("fazendas").update({ raccolto_acesso: novo }).eq("id", fazendaId);
    if (!error) setRaccoltoAcesso(novo);
    setSalvandoRaccolto(false);
  }

  function fecharModalCert() {
    setModalCert(false); setCertFile(null); setCertSenha(""); setCertDataVenc("");
    setCertArrastando(false); setCertCarregando(false); setCertSucesso(false);
  }

  async function carregarCertificado() {
    if (!certFile || !certSenha.trim()) return;
    if (produtores.length > 1 && !certProdutorId) { alert("Selecione o produtor titular do certificado."); return; }
    setCertCarregando(true);
    try {
      const produtor = produtores.find(p => p.id === certProdutorId) ?? produtores[0];
      const formData = new FormData();
      formData.append("file", certFile);
      formData.append("senha", certSenha);
      formData.append("fazenda_id", fazendaId ?? "");
      formData.append("produtor_id", produtor?.id ?? "");
      formData.append("produtor_nome", produtor?.nome ?? "");
      formData.append("cpf_cnpj", produtor?.cpf_cnpj ?? "");
      formData.append("modulo", `certificado_a1_${produtor?.id ?? "geral"}`);
      if (certDataVenc) formData.append("data_vencimento", certDataVenc);
      const r = await fetch("/api/cert-upload", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      setCertSucesso(true);
      const meta = await fetch(`/api/cert-meta?fazenda_id=${fazendaId}`).then(r2 => r2.json());
      if (meta.certs) setCerts(meta.certs);
    } catch (e: unknown) {
      alert("Erro ao salvar certificado: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCertCarregando(false);
    }
  }

  function abrirNovaConta() { setContaEditCod(null); setFormConta({ ...contaVazia }); setModalConta(true); }
  function abrirEditarConta(codigo: string) {
    const c = contas.find(x => x.codigo === codigo);
    if (!c) return;
    setContaEditCod(codigo); setFormConta({ ...c }); setModalConta(true);
  }

  async function salvarConta() {
    if (!formConta.codigo.trim() || !formConta.nome.trim() || !fazendaId) return;
    const dados: ContaContabil = { ...formConta, lcdpr: formConta.lcdpr || null };
    if (contaEditCod === null && contas.some(c => c.codigo === dados.codigo)) { setErroConta("Já existe uma conta com este código."); return; }
    setErroConta(null); setSalvConta(true);
    try {
      await salvarContaContabil(fazendaId, dados);
      if (contaEditCod !== null) setContas(prev => prev.map(c => c.codigo === contaEditCod ? dados : c));
      else setContas(prev => [...prev, dados]);
      setModalConta(false);
    } catch (e: unknown) { setErroConta((e as Error).message ?? "Erro ao salvar"); }
    finally { setSalvConta(false); }
  }

  async function excluirConta(codigo: string) {
    if (!confirm("Excluir esta conta do plano?") || !fazendaId) return;
    try { await excluirContaContabil(fazendaId, codigo); setContas(prev => prev.filter(c => c.codigo !== codigo)); }
    catch (e: unknown) { alert((e as Error).message ?? "Erro ao excluir"); }
  }

  function salvarBasis() {
    try { localStorage.setItem("ractech_basis", JSON.stringify(basis)); setBasisSalvo(true); setTimeout(() => setBasisSalvo(false), 2000); } catch { /* ignore */ }
  }

  const contasFiltradas = contas.filter(c => filtroContas === "todos" ? true : c.tipo === filtroContas);

  const diasCertMin: number | null = (() => {
    const dias = certs.map(c => calcDias(c.data_vencimento)).filter((d): d is number => d !== null);
    return dias.length > 0 ? Math.min(...dias) : null;
  })();

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Cabeçalho */}
        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>
                {aba === "plano_contas" ? "Plano de Contas" : aba === "certificado" ? "Certificado A1" : "Configurações"}
              </h1>
              {aba === "hub" && <p style={{ margin: 0, fontSize: 11, color: "#666" }}>Acesso de suporte e cotações</p>}
            </div>
          </div>
          {diasCertMin !== null && diasCertMin <= 30 && (
            <button
              onClick={() => { setAba("certificado"); window.history.replaceState({}, "", "/configuracoes?tab=certificado"); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, fontSize: 12, color: "#791F1F", cursor: "pointer", fontWeight: 600 }}
            >
              Certificado A1 vence em {diasCertMin}d — Renovar
            </button>
          )}
        </header>

        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto" }}>

          {/* ── HUB: Acesso Raccolto + Cotação/Basis ── */}
          {aba === "hub" && (
            <>
              {/* Acesso Raccolto */}
              <div style={{ background: "var(--bg-card)", border: `1px solid ${raccoltoAcesso ? "#1A4870" : "var(--border-table)"}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Acesso de Suporte Raccolto</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: raccoltoAcesso ? "#1A4870" : "var(--border-row)", color: raccoltoAcesso ? "#fff" : "#666" }}>
                      {raccoltoAcesso ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                    {raccoltoAcesso
                      ? "A Raccolto possui acesso de visualização para consultoria e suporte. Você pode revogar a qualquer momento."
                      : "Ative para permitir que a equipe Raccolto visualize os dados desta fazenda. Somente leitura, conforme LGPD."}
                  </p>
                  <p style={{ margin: "5px 0 0", fontSize: 10, color: "var(--text-muted)" }}>LGPD Art. 7º, I — consentimento do titular · Art. 18 — direito de revogação</p>
                </div>
                <button
                  onClick={toggleRaccolto}
                  disabled={salvandoRaccolto}
                  style={{ flexShrink: 0, padding: "8px 18px", borderRadius: 8, border: `1px solid ${raccoltoAcesso ? "#E24B4A" : "#1A4870"}`, background: raccoltoAcesso ? "#FCEBEB" : "#1A4870", color: raccoltoAcesso ? "#791F1F" : "#fff", fontWeight: 700, fontSize: 13, cursor: salvandoRaccolto ? "wait" : "pointer", whiteSpace: "nowrap" }}
                >
                  {salvandoRaccolto ? "Salvando…" : raccoltoAcesso ? "Desativar" : "Ativar Acesso Raccolto"}
                </button>
              </div>

              {/* Cotação e Basis */}
              <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "16px 20px", marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", paddingBottom: 6, borderBottom: "0.5px solid var(--border)", marginBottom: 14 }}>
                  Cotação e Basis
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 14 }}>
                  O basis é a diferença entre o preço local e a referência de mercado (CBOT/B3). Negativo = preço local menor. Ex: Soja CBOT R$ 129/sc + Basis −3,50 = preço local R$ 125,50/sc.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Praça de referência</label>
                    <input value={basis.praca} onChange={e => setBasis(b => ({ ...b, praca: e.target.value }))} placeholder="Ex: Nova Mutum - MT" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Basis Soja (R$/sc)</label>
                    <InputNumerico value={basis.soja} onChange={v => setBasis(b => ({ ...b, soja: parseFloat(v) || 0 }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Basis Milho (R$/sc)</label>
                    <InputNumerico value={basis.milho} onChange={v => setBasis(b => ({ ...b, milho: parseFloat(v) || 0 }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Basis Algodão (R$/@)</label>
                    <InputNumerico value={basis.algodao} onChange={v => setBasis(b => ({ ...b, algodao: parseFloat(v) || 0 }))} style={inp} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={salvarBasis} style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    Salvar
                  </button>
                  {basisSalvo && <span style={{ fontSize: 12, color: "#1A5C38", fontWeight: 600 }}>Salvo — dashboard atualizado</span>}
                  <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>Configuração salva localmente neste navegador</span>
                </div>
              </div>
            </>
          )}

          {/* ── PLANO DE CONTAS ── */}
          {aba === "plano_contas" && (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-row)", display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { key: "todos",   label: "Todos",    count: contas.length },
                    { key: "ativo",   label: "Ativo",    count: contas.filter(c => c.tipo === "ativo").length },
                    { key: "passivo", label: "Passivo",  count: contas.filter(c => c.tipo === "passivo").length },
                    { key: "pl",      label: "PL",       count: contas.filter(c => c.tipo === "pl").length },
                    { key: "receita", label: "Receitas", count: contas.filter(c => c.tipo === "receita").length },
                    { key: "custo",   label: "Custos",   count: contas.filter(c => c.tipo === "custo").length },
                    { key: "despesa", label: "Despesas", count: contas.filter(c => c.tipo === "despesa").length },
                  ] as { key: typeof filtroContas; label: string; count: number }[]).map(f => (
                    <button key={f.key} onClick={() => setFiltroContas(f.key)} style={{
                      padding: "5px 12px", borderRadius: 20, border: "0.5px solid",
                      borderColor: filtroContas === f.key ? "#1A4870" : "var(--border-table)",
                      background: filtroContas === f.key ? "#D5E8F5" : "transparent",
                      color: filtroContas === f.key ? "#0B2D50" : "#666",
                      fontWeight: filtroContas === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                    }}>
                      {f.label} <span style={{ fontSize: 10, marginLeft: 3, background: filtroContas === f.key ? "#1A4870" : "var(--border-row)", color: filtroContas === f.key ? "#fff" : "var(--text-2)", padding: "1px 5px", borderRadius: 6 }}>{f.count}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>
                    <span style={{ background: "#EAF3DE", color: "#1A5C38", padding: "1px 6px", borderRadius: 5, fontWeight: 600, marginRight: 4 }}>{contas.filter(c => c.lcdpr).length}</span>
                    vinculadas ao LCDPR
                  </span>
                  <button
                    onClick={() => {
                      const linhas = contasFiltradas.map(c => {
                        const ct = corTipoConta(c.tipo);
                        const depth = c.codigo ? c.codigo.split('.').length - 1 : 0;
                        const isGrupo = depth === 0;
                        const pad = "&nbsp;".repeat(depth * 4);
                        return `<tr style="border-bottom:0.5px solid var(--bg-tag);background:${isGrupo?"var(--bg-card)":"#fff"}">
                          <td style="padding:6px 12px;font-family:monospace;font-size:11px;color:#1a1a1a">${c.codigo}</td>
                          <td style="padding:6px 12px;font-size:${isGrupo?12:11}px;font-weight:${isGrupo?700:400}">${pad}${c.nome}${c.transitoria?' <span style="font-size:9px;background:#FBF3E0;color:#8B5E14;padding:1px 4px;border-radius:3px">TRANS.</span>':""}</td>
                          <td style="padding:6px 12px;text-align:center"><span style="font-size:10px;background:${ct.bg};color:${ct.color};padding:2px 7px;border-radius:6px;font-weight:700">${ct.label}</span></td>
                          <td style="padding:6px 12px;text-align:center;font-size:11px;color:#555">${c.natureza ?? "—"}</td>
                          <td style="padding:6px 12px;text-align:center;font-size:11px;color:${c.operacional?"#1A5C38":"#999"}">${c.operacional?"Sim":"Não"}</td>
                          <td style="padding:6px 12px;text-align:center;font-size:10px;color:${c.lcdpr?"#1A5C38":"#ccc"}">${c.lcdpr||"—"}</td>
                        </tr>`;
                      }).join("");
                      const w = window.open("", "_blank", "width=900,height=700");
                      if (!w) return;
                      w.document.write(`<!DOCTYPE html><html><head><title>Plano de Contas</title>
                        <style>body{font-family:Arial,sans-serif;margin:20px}h2{color:#1A4870;margin-bottom:4px}
                        p{color:#888;font-size:11px;margin:0 0 14px}table{width:100%;border-collapse:collapse}
                        th{background:#1A4870;color:#fff;padding:7px 12px;text-align:left;font-size:11px}
                        @media print{@page{size:A4;margin:15mm}}</style></head>
                        <body><h2>Plano de Contas Contábil</h2>
                        <p>Emitido em ${new Date().toLocaleDateString("pt-BR")} · ${contasFiltradas.length} contas</p>
                        <table><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Natureza</th><th>Operac.</th><th>LCDPR</th></tr></thead>
                        <tbody>${linhas}</tbody></table>
                        <script>window.onload=function(){window.print();}<\/script></body></html>`);
                      w.document.close();
                    }}
                    className="no-print"
                    style={{ fontSize: 11, padding: "5px 12px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer" }}
                  >Imprimir</button>
                  <button onClick={abrirNovaConta} style={{ fontSize: 11, padding: "5px 12px", border: "0.5px solid #1A5C38", borderRadius: 8, background: "#EAF3DE", color: "#1A5C38", cursor: "pointer", fontWeight: 600 }}>
                    + Nova conta
                  </button>
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {["Código", "Nome da conta", "Tipo", "Natureza", "Operacional", "LCDPR", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 16px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contasFiltradas.map((c, ci) => {
                    const ct = corTipoConta(c.tipo);
                    const depth = c.codigo ? c.codigo.split('.').length - 1 : 0;
                    const isGrupo = depth === 0;
                    return (
                      <tr key={ci} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: isGrupo ? "var(--bg-card)" : "transparent" }}>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-1)", width: 90 }}>{c.codigo}</td>
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ paddingLeft: depth * 14, fontSize: isGrupo ? 13 : 12, fontWeight: isGrupo ? 700 : 400, color: "var(--text-1)" }}>{c.nome}</span>
                            {c.transitoria && <span style={{ fontSize: 9, background: "#FBF3E0", color: "#8B5E14", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>TRANSITÓRIA</span>}
                          </div>
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: ct.bg, color: ct.color, padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>{ct.label}</span>
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center", fontSize: 11, color: "var(--text-2)" }}>{c.natureza ?? "—"}</td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          <span style={{ fontSize: 11, color: c.operacional ? "#1A5C38" : "#999" }}>{c.operacional ? "Sim" : "Não"}</span>
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          {c.lcdpr
                            ? <span style={{ fontSize: 10, background: "#EAF3DE", color: "#1A5C38", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>{c.lcdpr}</span>
                            : <span style={{ fontSize: 10, color: "#ccc" }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <button onClick={() => abrirEditarConta(c.codigo)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", color: "var(--text-2)", cursor: "pointer", marginRight: 4 }}>
                            Editar
                          </button>
                          {!isGrupo && (
                            <button onClick={() => excluirConta(c.codigo)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #E24B4A30", borderRadius: 6, background: "transparent", color: "#E24B4A", cursor: "pointer" }}>
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── CERTIFICADO A1 ── */}
          {aba === "certificado" && (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "20px", maxWidth: 720 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)", marginBottom: 2 }}>Certificados A1</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                    {certs.length === 0 ? "Nenhum certificado configurado" : `${certs.length} certificado${certs.length > 1 ? "s" : ""} — um por produtor/titular`}
                  </div>
                </div>
                <button
                  onClick={() => { setCertProdutorId(produtores.length === 1 ? produtores[0].id : ""); setModalCert(true); }}
                  style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  + Adicionar certificado
                </button>
              </div>

              {certs.length === 0 ? (
                <div style={{ border: "0.5px dashed #1A4870", borderRadius: 10, padding: "36px", textAlign: "center", background: "#F5F9FF", marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 4 }}>Nenhum certificado configurado</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>Carregue um arquivo .pfx ou .p12 para assinar NF-e automaticamente</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                  {certs.map(cert => {
                    const dias = calcDias(cert.data_vencimento);
                    const corDias = dias !== null && dias <= 7 ? "#E24B4A" : dias !== null && dias <= 15 ? "#EF9F27" : "#1A5C38";
                    return (
                      <div key={cert.modulo} style={{ border: `0.5px solid ${dias !== null && dias <= 7 ? "#E24B4A" : dias !== null && dias <= 15 ? "#EF9F27" : "var(--border-table)"}`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{cert.produtor_nome || "Titular não informado"}</span>
                            {cert.cpf_cnpj && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{cert.cpf_cnpj}</span>}
                            <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 5 }}>A1 · .pfx</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{cert.arquivo_nome}</div>
                          {cert.data_vencimento ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: corDias }}>
                                Vence {cert.data_vencimento.split("-").reverse().join("/")}
                              </span>
                              <span style={{ fontSize: 10, background: dias !== null && dias <= 7 ? "#FCEBEB" : dias !== null && dias <= 15 ? "#FFF3CD" : "#EAF3DE", color: corDias, padding: "1px 7px", borderRadius: 6, fontWeight: 600 }}>
                                {dias !== null ? `${dias} dias` : "—"}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#EF9F27" }}>Vencimento não informado</span>
                          )}
                        </div>
                        <button onClick={() => { setCertProdutorId(cert.produtor_id ?? ""); setModalCert(true); }} style={{ padding: "7px 16px", border: "0.5px solid #1A4870", borderRadius: 8, background: "transparent", color: "#1A4870", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          Atualizar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487030", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#0B2D50" }}>
                O sistema verifica automaticamente a validade e envia alertas 30, 15, 7 e 1 dia antes do vencimento.
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ── Modal Conta Contábil ── */}
      {modalConta && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalConta(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 26, width: 480, maxWidth: "92vw", border: "0.5px solid var(--border)", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)", marginBottom: 20 }}>
              {contaEditCod ? "Editar conta" : "Nova conta"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Código *</label>
                <input style={inp} placeholder="Ex: 4.2.3" value={formConta.codigo}
                  onChange={e => setFormConta(p => ({ ...p, codigo: e.target.value }))} disabled={contaEditCod !== null} />
              </div>
              <div>
                <label style={lbl}>Nome da conta *</label>
                <input style={inp} placeholder="Ex: Calcário dolomítico" value={formConta.nome}
                  onChange={e => setFormConta(p => ({ ...p, nome: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Tipo *</label>
                <select style={inp} value={formConta.tipo} onChange={e => setFormConta(p => ({ ...p, tipo: e.target.value as ContaContabil["tipo"] }))}>
                  <option value="ativo">Ativo</option>
                  <option value="passivo">Passivo</option>
                  <option value="pl">Patrimônio Líquido</option>
                  <option value="receita">Receita</option>
                  <option value="custo">Custo de produção</option>
                  <option value="despesa">Despesa operacional</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Nível *</label>
                <select style={inp} value={formConta.nivel} onChange={e => setFormConta(p => ({ ...p, nivel: Number(e.target.value) }))}>
                  <option value={0}>0 — Grupo</option>
                  <option value={1}>1 — Subgrupo</option>
                  <option value={2}>2 — Detalhe</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Conta pai</label>
                <input style={inp} placeholder="Ex: 4.2" value={formConta.pai ?? ""}
                  onChange={e => setFormConta(p => ({ ...p, pai: e.target.value || undefined }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Natureza do saldo</label>
                <select style={inp} value={formConta.natureza ?? "devedora"}
                  onChange={e => setFormConta(p => ({ ...p, natureza: e.target.value as "devedora" | "credora" }))}>
                  <option value="devedora">Devedora (Ativo / Custo / Despesa)</option>
                  <option value="credora">Credora (Passivo / PL / Receita)</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
                  <input type="checkbox" checked={!!formConta.operacional} onChange={e => setFormConta(p => ({ ...p, operacional: e.target.checked }))} style={{ width: 14, height: 14 }} />
                  Disponível para operadores
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
                  <input type="checkbox" checked={!!formConta.transitoria} onChange={e => setFormConta(p => ({ ...p, transitoria: e.target.checked }))} style={{ width: 14, height: 14 }} />
                  Conta transitória
                </label>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Código LCDPR</label>
              <select style={inp} value={formConta.lcdpr ?? ""} onChange={e => setFormConta(p => ({ ...p, lcdpr: e.target.value || null }))}>
                {LCDPR_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {erroConta && (
              <div style={{ marginBottom: 10, padding: "8px 12px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, color: "#791F1F", fontSize: 12 }}>
                {erroConta}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setModalConta(false); setErroConta(null); }} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarConta} disabled={!formConta.codigo.trim() || !formConta.nome.trim() || salvConta}
                style={{ padding: "8px 20px", background: formConta.codigo.trim() && formConta.nome.trim() ? "#1A5C38" : "#999", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvConta ? "Salvando…" : contaEditCod ? "Salvar alterações" : "Criar conta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Certificado ── */}
      {modalCert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModalCert(); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 26, width: 460, maxWidth: "92vw", border: "0.5px solid var(--border)", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>Carregar certificado A1</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 20 }}>Arquivo .pfx ou .p12 do e-CNPJ ou e-CPF</div>

            <div style={{ display: "grid", gap: 14 }}>
              {produtores.length > 1 && (
                <div>
                  <label style={lbl}>Produtor / Titular *</label>
                  <select value={certProdutorId} onChange={e => setCertProdutorId(e.target.value)} style={inp}>
                    <option value="">Selecione o produtor...</option>
                    {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.tipo === "pf" ? "CPF" : "CNPJ"}: {p.cpf_cnpj ?? "—"}</option>)}
                  </select>
                </div>
              )}
              {produtores.length === 1 && (
                <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>Titular: </span>
                  <strong>{produtores[0].nome}</strong>
                  <span style={{ color: "var(--text-3)", marginLeft: 8, fontSize: 12 }}>{produtores[0].tipo === "pf" ? "CPF" : "CNPJ"}: {produtores[0].cpf_cnpj ?? "—"}</span>
                </div>
              )}

              <div>
                <label style={lbl}>Arquivo do certificado (.pfx / .p12) *</label>
                <input ref={certInputRef} type="file" accept=".pfx,.p12" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setCertFile(f); e.target.value = ""; }} />
                {certFile ? (
                  <div style={{ border: "0.5px solid #16A34A", borderRadius: 8, padding: "12px 14px", background: "#F0FDF4", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{certFile.name}</div>
                      <div style={{ fontSize: 11, color: "#166534" }}>{(certFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onClick={() => setCertFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534", fontSize: 18, padding: "0 4px" }}>×</button>
                  </div>
                ) : (
                  <div
                    onClick={() => certInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setCertArrastando(true); }}
                    onDragLeave={() => setCertArrastando(false)}
                    onDrop={e => {
                      e.preventDefault(); setCertArrastando(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f && (f.name.endsWith(".pfx") || f.name.endsWith(".p12"))) setCertFile(f);
                      else if (f) alert("Selecione um arquivo .pfx ou .p12");
                    }}
                    style={{ border: `0.5px dashed ${certArrastando ? "#1A4870" : "#aab"}`, borderRadius: 8, padding: "28px 20px", textAlign: "center", background: certArrastando ? "#EEF4FF" : "#F7FDFA", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>{certArrastando ? "Solte o arquivo aqui" : "Clique para selecionar"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>ou arraste o arquivo .pfx / .p12 aqui</div>
                  </div>
                )}
              </div>

              <div>
                <label style={lbl}>Senha do certificado *</label>
                <input style={inp} type="password" placeholder="Senha do arquivo .pfx" value={certSenha}
                  onChange={e => setCertSenha(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && certFile && certSenha.trim()) carregarCertificado(); }} />
              </div>
            </div>

            {certSucesso && (
              <div style={{ marginTop: 14, background: "#F0FDF4", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", fontWeight: 600, border: "0.5px solid #16A34A30" }}>
                Certificado carregado com sucesso!
              </div>
            )}
            {!certSucesso && (
              <div style={{ marginTop: 14, background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
                O certificado é armazenado de forma segura e usado apenas para assinar NF-e automaticamente.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={fecharModalCert} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={carregarCertificado} disabled={!certFile || !certSenha.trim() || certCarregando || certSucesso}
                style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: (!certFile || !certSenha.trim() || certCarregando) ? "not-allowed" : "pointer", fontSize: 13, opacity: (!certFile || !certSenha.trim() || certCarregando) ? 0.5 : 1 }}>
                {certCarregando ? "Carregando..." : "Carregar certificado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Configuracoes() {
  return (
    <Suspense>
      <ConfiguracoesInner />
    </Suspense>
  );
}
