"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { Pessoa, CentroCusto, AnoSafra } from "../../../lib/supabase";
import { listarPessoas, listarCentrosCustoGeral, listarAnosSafra } from "../../../lib/db";

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "18px 20px", marginBottom: 16 };
const toggle: React.CSSProperties = { width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" };

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const fmtComp = (s?: string) => {
  if (!s) return "—";
  const [y, m] = s.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m)-1]}/${y}`;
};

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>;
}

const STATUS_META: Record<string, { bg: string; cl: string; label: string }> = {
  digitando:  { bg: "#FFF3E0", cl: "#7B4A00", label: "Digitando"  },
  pendente:   { bg: "#FBF3E0", cl: "#C9921B", label: "Pendente"   },
  processada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Processada" },
  cancelada:  { bg: "#FCEBEB", cl: "#791F1F", label: "Cancelada"  },
};

// ─────────────────────────────────────────────────────────────
// Códigos LC 116/2003 — mais comuns no agronegócio
// ─────────────────────────────────────────────────────────────
const LC116: { codigo: string; descricao: string }[] = [
  { codigo: "7.01",  descricao: "7.01 — Engenharia, agronomia, agrimensura e consultoria técnica" },
  { codigo: "7.16",  descricao: "7.16 — Florestamento, reflorestamento, semeadura, adubação e reparação de solo" },
  { codigo: "7.17",  descricao: "7.17 — Escoramento, contenção de encostas e serviços congêneres" },
  { codigo: "14.01", descricao: "14.01 — Lubrificação, manutenção e reparação de máquinas e equipamentos" },
  { codigo: "14.02", descricao: "14.02 — Assistência técnica" },
  { codigo: "14.06", descricao: "14.06 — Instalação e montagem de aparelhos, máquinas e equipamentos" },
  { codigo: "16.01", descricao: "16.01 — Serviços de transporte de natureza municipal" },
  { codigo: "17.01", descricao: "17.01 — Assessoria ou consultoria de qualquer natureza" },
  { codigo: "17.06", descricao: "17.06 — Suporte técnico em informática" },
  { codigo: "17.09", descricao: "17.09 — Planejamento, organização e administração" },
  { codigo: "20.01", descricao: "20.01 — Serviços de armazenamento, guarda e conservação de mercadorias" },
  { codigo: "22.01", descricao: "22.01 — Serviços de fisioterapia (saúde trabalhadores)" },
  { codigo: "31.01", descricao: "31.01 — Serviços técnicos em edificações, eletrônica, mecânica e telecomunicações" },
  { codigo: "outros", descricao: "Outro código (informar manualmente)" },
];

// ─────────────────────────────────────────────────────────────
// Tipo local
// ─────────────────────────────────────────────────────────────
interface NfServico {
  id: string;
  fazenda_id: string;
  numero_nf: string;
  serie: string;
  chave_nfse?: string;
  prestador_id?: string;
  prestador_nome: string;
  prestador_cnpj?: string;
  municipio_prestacao?: string;
  data_prestacao: string;
  competencia?: string;
  codigo_servico?: string;
  cnae?: string;
  discriminacao?: string;
  valor_servico: number;
  valor_deducoes: number;
  valor_base_iss: number;
  aliquota_iss: number;
  valor_iss: number;
  iss_retido: boolean;
  valor_inss: number;
  valor_ir: number;
  valor_outras_retencoes: number;
  valor_liquido: number;
  operacao_gerencial_id?: string;
  centro_custo_id?: string;
  ano_safra_id?: string;
  pedido_compra_id?: string;
  data_vencimento_cp?: string;
  status: "digitando" | "pendente" | "processada" | "cancelada";
  origem: "manual" | "xml" | "api";
  observacao?: string;
  created_at?: string;
}

interface OpGerencial { id: string; classificacao: string; descricao: string; }
interface PedidoMin   { id: string; nr_pedido?: string; status: string; }

type Etapa = "prestador" | "servico" | "tributacao";

const CAB_VAZIO = () => ({
  numero_nf: "", serie: "1", chave_nfse: "",
  prestador_id: "", prestador_nome: "", prestador_cnpj: "",
  municipio_prestacao: "",
  data_prestacao: new Date().toISOString().split("T")[0],
  competencia: new Date().toISOString().substring(0, 7),
  codigo_servico: "", cnae: "", discriminacao: "",
  valor_servico: "", valor_deducoes: "0",
  aliquota_iss: "3", iss_retido: false,
  valor_inss: "0", valor_ir: "0", valor_outras_retencoes: "0",
  operacao_gerencial_id: "", centro_custo_id: "",
  ano_safra_id: "", pedido_compra_id: "",
  data_vencimento_cp: "", observacao: "",
});

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function NfServicoPage() {
  const { fazendaId } = useAuth();

  const [nfs,      setNfs]      = useState<NfServico[]>([]);
  const [pessoas,  setPessoas]  = useState<Pessoa[]>([]);
  const [centros,  setCentros]  = useState<CentroCusto[]>([]);
  const [opsGer,   setOpsGer]   = useState<OpGerencial[]>([]);
  const [anos,     setAnos]     = useState<AnoSafra[]>([]);
  const [pedidos,  setPedidos]  = useState<PedidoMin[]>([]);

  const [busca,        setBusca]        = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const [wizard,  setWizard]  = useState(false);
  const [etapa,   setEtapa]   = useState<Etapa>("prestador");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  const [nfEdit,  setNfEdit]  = useState<NfServico | null>(null);

  const [cab, setCab] = useState(CAB_VAZIO());
  // código LC 116 livre (quando selecionado "outros")
  const [codigoLivre, setCodigoLivre] = useState("");

  // ── Cálculos derivados ──────────────────────────────────────
  const vServico  = parseFloat(String(cab.valor_servico))  || 0;
  const vDed      = parseFloat(String(cab.valor_deducoes)) || 0;
  const vBase     = Math.max(0, vServico - vDed);
  const aliq      = parseFloat(String(cab.aliquota_iss))   || 0;
  const vISS      = Math.round(vBase * aliq / 100 * 100) / 100;
  const vINSS     = parseFloat(String(cab.valor_inss))               || 0;
  const vIR       = parseFloat(String(cab.valor_ir))                 || 0;
  const vOutras   = parseFloat(String(cab.valor_outras_retencoes))   || 0;
  const vRetencoes = vINSS + vIR + vOutras + (cab.iss_retido ? vISS : 0);
  const vLiquido   = Math.max(0, vServico - vRetencoes);

  // ── Carregar dados ──────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;

    // NF de Serviço
    try {
      const { data } = await supabase
        .from("nf_servicos")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .order("data_prestacao", { ascending: false });
      setNfs((data ?? []) as NfServico[]);
    } catch {}

    // Pessoas
    const pes = await listarPessoas(fazendaId).catch(() => []);
    setPessoas(pes);

    // Centros de custo
    const cc = await listarCentrosCustoGeral(fazendaId).catch(() => []);
    setCentros(cc);

    // Anos safra
    const as = await listarAnosSafra(fazendaId).catch(() => []);
    setAnos(as);

    // Operações gerenciais (despesas que permitem NF)
    try {
      const { data } = await supabase
        .from("operacoes_gerenciais")
        .select("id, classificacao, descricao")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "despesa")
        .eq("inativo", false)
        .eq("permite_notas_fiscais", true)
        .order("classificacao");
      setOpsGer((data ?? []) as OpGerencial[]);
    } catch {}

    // Pedidos de compra
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, nr_pedido, status")
        .eq("fazenda_id", fazendaId)
        .in("status", ["rascunho", "aprovado"])
        .order("created_at", { ascending: false });
      setPedidos((data ?? []) as PedidoMin[]);
    } catch {}
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Auto-fill prestador ─────────────────────────────────────
  function onPrestadorChange(id: string) {
    const p = pessoas.find(x => x.id === id);
    if (p) {
      setCab(prev => ({
        ...prev,
        prestador_id:   id,
        prestador_nome: p.nome ?? prev.prestador_nome,
        prestador_cnpj: p.cpf_cnpj ?? prev.prestador_cnpj,
      }));
    } else {
      setCab(prev => ({ ...prev, prestador_id: id }));
    }
  }

  // ── Abrir wizard ────────────────────────────────────────────
  function abrirNovo() {
    setNfEdit(null);
    setEtapa("prestador");
    setCab(CAB_VAZIO());
    setCodigoLivre("");
    setErr("");
    setWizard(true);
  }

  function abrirEditar(nf: NfServico) {
    setNfEdit(nf);
    setEtapa("prestador");
    setCab({
      numero_nf:            nf.numero_nf,
      serie:                nf.serie,
      chave_nfse:           nf.chave_nfse ?? "",
      prestador_id:         nf.prestador_id ?? "",
      prestador_nome:       nf.prestador_nome,
      prestador_cnpj:       nf.prestador_cnpj ?? "",
      municipio_prestacao:  nf.municipio_prestacao ?? "",
      data_prestacao:       nf.data_prestacao,
      competencia:          nf.competencia ?? nf.data_prestacao.substring(0, 7),
      codigo_servico:       nf.codigo_servico ?? "",
      cnae:                 nf.cnae ?? "",
      discriminacao:        nf.discriminacao ?? "",
      valor_servico:        String(nf.valor_servico),
      valor_deducoes:       String(nf.valor_deducoes),
      aliquota_iss:         String(nf.aliquota_iss),
      iss_retido:           nf.iss_retido,
      valor_inss:           String(nf.valor_inss),
      valor_ir:             String(nf.valor_ir),
      valor_outras_retencoes: String(nf.valor_outras_retencoes),
      operacao_gerencial_id:  nf.operacao_gerencial_id ?? "",
      centro_custo_id:        nf.centro_custo_id ?? "",
      ano_safra_id:           nf.ano_safra_id ?? "",
      pedido_compra_id:       nf.pedido_compra_id ?? "",
      data_vencimento_cp:     nf.data_vencimento_cp ?? "",
      observacao:             nf.observacao ?? "",
    });
    const isLivre = !LC116.find(c => c.codigo === nf.codigo_servico);
    if (isLivre && nf.codigo_servico) {
      setCab(prev => ({ ...prev, codigo_servico: "outros" }));
      setCodigoLivre(nf.codigo_servico ?? "");
    }
    setErr("");
    setWizard(true);
  }

  // ── Salvar NF ───────────────────────────────────────────────
  async function salvar(status: "digitando" | "pendente" | "processada") {
    if (!fazendaId) return;
    setErr("");
    if (!cab.numero_nf.trim()) { setErr("Informe o número da NF."); return; }
    if (!cab.prestador_nome.trim()) { setErr("Informe o prestador."); return; }
    if (!cab.data_prestacao) { setErr("Informe a data da prestação."); return; }
    if (status === "processada" && vServico <= 0) { setErr("Valor do serviço deve ser maior que zero para processar."); return; }
    if (status === "processada" && !cab.operacao_gerencial_id) { setErr("Selecione a Operação Gerencial para processar."); return; }

    const codigoFinal = cab.codigo_servico === "outros" ? codigoLivre : cab.codigo_servico;

    const payload = {
      fazenda_id:            fazendaId,
      numero_nf:             cab.numero_nf,
      serie:                 cab.serie,
      chave_nfse:            cab.chave_nfse || undefined,
      prestador_id:          cab.prestador_id   || undefined,
      prestador_nome:        cab.prestador_nome,
      prestador_cnpj:        cab.prestador_cnpj || undefined,
      municipio_prestacao:   cab.municipio_prestacao || undefined,
      data_prestacao:        cab.data_prestacao,
      competencia:           cab.competencia || cab.data_prestacao.substring(0, 7),
      codigo_servico:        codigoFinal    || undefined,
      cnae:                  cab.cnae       || undefined,
      discriminacao:         cab.discriminacao || undefined,
      valor_servico:         vServico,
      valor_deducoes:        vDed,
      valor_base_iss:        vBase,
      aliquota_iss:          aliq,
      valor_iss:             vISS,
      iss_retido:            cab.iss_retido,
      valor_inss:            vINSS,
      valor_ir:              vIR,
      valor_outras_retencoes: vOutras,
      valor_liquido:         vLiquido,
      operacao_gerencial_id: cab.operacao_gerencial_id || undefined,
      centro_custo_id:       cab.centro_custo_id       || undefined,
      ano_safra_id:          cab.ano_safra_id           || undefined,
      pedido_compra_id:      cab.pedido_compra_id       || undefined,
      data_vencimento_cp:    cab.data_vencimento_cp     || undefined,
      status,
      origem:                "manual" as const,
      observacao:            cab.observacao || undefined,
    };

    setSaving(true);
    try {
      if (nfEdit) {
        await supabase.from("nf_servicos").update(payload).eq("id", nfEdit.id);
      } else {
        await supabase.from("nf_servicos").insert(payload);
      }
      await carregar();
      setWizard(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ── Cancelar NF ─────────────────────────────────────────────
  async function cancelarNf(nf: NfServico) {
    if (!confirm(`Cancelar NF de Serviço ${nf.numero_nf}?`)) return;
    await supabase.from("nf_servicos").update({ status: "cancelada" }).eq("id", nf.id);
    await carregar();
  }

  // ── Lista filtrada ───────────────────────────────────────────
  const nfsFilt = nfs.filter(nf => {
    if (filtroStatus && nf.status !== filtroStatus) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!nf.numero_nf.includes(busca) && !nf.prestador_nome.toLowerCase().includes(b)) return false;
    }
    return true;
  });

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ flex: 1, padding: "24px 28px", maxWidth: 1300, margin: "0 auto", width: "100%" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>NF de Serviço</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
              Notas Fiscais de Serviços (NFS-e) · {nfs.length} nota{nfs.length !== 1 ? "s" : ""} · {nfs.filter(n => n.status === "pendente").length} pendente{nfs.filter(n => n.status === "pendente").length !== 1 ? "s" : ""}
            </div>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Nova NF de Serviço</button>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total no mês",   value: fmtBRL(nfs.filter(n => n.data_prestacao?.startsWith(new Date().toISOString().substring(0,7)) && n.status !== "cancelada").reduce((s,n)=>s+n.valor_servico,0)), bg: "#fff" },
            { label: "ISS total",      value: fmtBRL(nfs.filter(n => n.status === "processada").reduce((s,n)=>s+n.valor_iss,0)), bg: "#EBF8FF" },
            { label: "Processadas",    value: String(nfs.filter(n=>n.status==="processada").length), bg: "#E8F5E9" },
            { label: "Pendentes",      value: String(nfs.filter(n=>n.status==="pendente").length),   bg: "#FBF3E0" },
          ].map(({ label, value, bg }) => (
            <div key={label} style={{ background: bg, border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por nº ou prestador…"
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width: 260 }}
          />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{nfsFilt.length} resultado{nfsFilt.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Tabela */}
        <div style={card}>
          {nfsFilt.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#888", fontSize: 13 }}>
              Nenhuma NF de Serviço. Clique em &ldquo;+ Nova NF de Serviço&rdquo; para começar.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F3F6F9" }}>
                  {["Nº", "Prestador", "Competência", "Serviço (LC 116)", "Valor Serv.", "ISS", "Líquido", "Status", "Ações"].map((c, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 4 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nfsFilt.map(nf => {
                  const sm = STATUS_META[nf.status] ?? STATUS_META["pendente"];
                  return (
                    <tr key={nf.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                        {nf.numero_nf}<span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>/{nf.serie}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nf.prestador_nome}
                        {nf.prestador_cnpj && <div style={{ fontSize: 11, color: "#888" }}>{nf.prestador_cnpj}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>
                        {fmtComp(nf.competencia)}
                        <div style={{ fontSize: 11, color: "#aaa" }}>{fmtData(nf.data_prestacao)}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nf.codigo_servico && <span style={{ fontWeight: 600 }}>{nf.codigo_servico} </span>}
                        {nf.discriminacao ? nf.discriminacao.substring(0, 60) + (nf.discriminacao.length > 60 ? "…" : "") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{fmtBRL(nf.valor_servico)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>
                        {fmtBRL(nf.valor_iss)}
                        {nf.iss_retido && badge(" Retido", "#FCEBEB", "#791F1F")}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, textAlign: "right", color: "#1A4870" }}>{fmtBRL(nf.valor_liquido)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {nf.status !== "processada" && nf.status !== "cancelada" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#1A4870", fontWeight: 600 }}>
                              Editar
                            </button>
                          )}
                          {nf.status === "pendente" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A4870", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Processar
                            </button>
                          )}
                          {nf.status !== "cancelada" && nf.status !== "processada" && (
                            <button onClick={() => cancelarNf(nf)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════
          WIZARD MODAL
      ══════════════════════════════════════════════════════ */}
      {wizard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 860, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            {/* Header modal */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                  {nfEdit ? `NF Serviço ${nfEdit.numero_nf}` : "Nova NF de Serviço"}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {etapa === "prestador" ? "Passo 1 — Prestador & Data" : etapa === "servico" ? "Passo 2 — Serviço & Discriminação" : "Passo 3 — Tributação & Lançamento"}
                </div>
              </div>
              {/* Stepper */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(["prestador", "servico", "tributacao"] as Etapa[]).map((e, i) => {
                  const ordem = ["prestador", "servico", "tributacao"];
                  const ativo = etapa === e;
                  const passado = ordem.indexOf(etapa) > i;
                  return (
                    <div key={e} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: ativo ? "#1A4870" : passado ? "#D5E8F5" : "#F3F6F9", color: ativo ? "#fff" : passado ? "#1A4870" : "#aaa" }}>
                        {i + 1}
                      </div>
                      {i < 2 && <div style={{ width: 20, height: 1, background: "#D4DCE8" }} />}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setWizard(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{err}</div>}

              {/* ─── PASSO 1: PRESTADOR & DATA ─────────────── */}
              {etapa === "prestador" && (
                <div>
                  {/* Prestador */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prestador do Serviço</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Prestador — do cadastro</label>
                      <select value={cab.prestador_id} onChange={e => onPrestadorChange(e.target.value)} style={inp}>
                        <option value="">Selecionar do cadastro…</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nome do Prestador *</label>
                      <input value={cab.prestador_nome} onChange={e => setCab(p=>({...p,prestador_nome:e.target.value}))} style={inp} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>CNPJ / CPF do Prestador</label>
                      <input value={cab.prestador_cnpj} onChange={e => setCab(p=>({...p,prestador_cnpj:e.target.value}))} placeholder="00.000.000/0001-00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Município de Prestação</label>
                      <input value={cab.municipio_prestacao} onChange={e => setCab(p=>({...p,municipio_prestacao:e.target.value}))} placeholder="Ex: Nova Mutum - MT" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Chave NFS-e (opcional)</label>
                      <input value={cab.chave_nfse} onChange={e => setCab(p=>({...p,chave_nfse:e.target.value.replace(/\D/g,"")}))} maxLength={44} placeholder="44 dígitos" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                    </div>
                  </div>

                  <div style={{ height: 1, background: "#EEF1F6", margin: "18px 0" }} />

                  {/* Identificação da NF */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Identificação da Nota</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Número NF / RPS *</label>
                      <input value={cab.numero_nf} onChange={e => setCab(p=>({...p,numero_nf:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Série</label>
                      <input value={cab.serie} onChange={e => setCab(p=>({...p,serie:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Data da Prestação *</label>
                      <input type="date" value={cab.data_prestacao} onChange={e => {
                        const dt = e.target.value;
                        setCab(p => ({ ...p, data_prestacao: dt, competencia: dt.substring(0, 7) }));
                      }} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Competência (mês)</label>
                      <input type="month" value={cab.competencia} onChange={e => setCab(p=>({...p,competencia:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                    <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                    <button style={btnV} onClick={() => {
                      if (!cab.numero_nf.trim()) { setErr("Informe o número da NF."); return; }
                      if (!cab.prestador_nome.trim()) { setErr("Informe o nome do prestador."); return; }
                      setErr(""); setEtapa("servico");
                    }}>Próximo →</button>
                  </div>
                </div>
              )}

              {/* ─── PASSO 2: SERVIÇO ──────────────────────── */}
              {etapa === "servico" && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Classificação do Serviço</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Código de Serviço — Lei Complementar 116/2003</label>
                      <select value={cab.codigo_servico} onChange={e => setCab(p=>({...p,codigo_servico:e.target.value}))} style={inp}>
                        <option value="">Selecionar código…</option>
                        {LC116.map(c => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                      </select>
                    </div>
                    <div>
                      {cab.codigo_servico === "outros" ? (
                        <>
                          <label style={lbl}>Código de Serviço (manual)</label>
                          <input value={codigoLivre} onChange={e => setCodigoLivre(e.target.value)} placeholder="Ex: 7.05" style={inp} />
                        </>
                      ) : (
                        <>
                          <label style={lbl}>Código CNAE (opcional)</label>
                          <input value={cab.cnae} onChange={e => setCab(p=>({...p,cnae:e.target.value}))} placeholder="Ex: 0111-3/01" style={inp} />
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Discriminação do Serviço *</label>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                      Descreva detalhadamente o serviço prestado. Esse texto irá para a NFS-e e serve como prova fiscal.
                    </div>
                    <textarea
                      value={cab.discriminacao}
                      onChange={e => setCab(p=>({...p,discriminacao:e.target.value}))}
                      rows={8}
                      placeholder="Ex: Prestação de serviços de consultoria agronômica para manejo da lavoura de soja, incluindo visitas técnicas, análise de solo, recomendação de adubação e acompanhamento de aplicações. Safra 2025/2026 — Fazenda Santa Maria, Nova Mutum/MT."
                      style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
                    />
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 4, textAlign: "right" }}>
                      {cab.discriminacao.length} caracteres
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => { setErr(""); setEtapa("prestador"); }}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                      <button style={btnV} onClick={() => { setErr(""); setEtapa("tributacao"); }}>Próximo →</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── PASSO 3: TRIBUTAÇÃO & LANÇAMENTO ────────── */}
              {etapa === "tributacao" && (
                <div>
                  {/* Valores */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Valores e ISS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Valor do Serviço (R$) *</label>
                      <input type="number" step="0.01" value={cab.valor_servico} onChange={e => setCab(p=>({...p,valor_servico:e.target.value}))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Deduções — materiais/subempreitadas (R$)</label>
                      <input type="number" step="0.01" value={cab.valor_deducoes} onChange={e => setCab(p=>({...p,valor_deducoes:e.target.value}))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Base de Cálculo ISS (R$)</label>
                      <input value={fmtBRL(vBase)} readOnly style={{ ...inp, background: "#F4F6FA", color: "#888" }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Alíquota ISS (%)</label>
                      <input type="number" step="0.01" min="0" max="5" value={cab.aliquota_iss} onChange={e => setCab(p=>({...p,aliquota_iss:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Valor do ISS (R$)</label>
                      <input value={fmtBRL(vISS)} readOnly style={{ ...inp, background: "#F4F6FA", color: "#888" }} />
                    </div>
                    <div>
                      <label style={lbl}>ISS Retido pelo Tomador?</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                        <button
                          onClick={() => setCab(p=>({...p, iss_retido: !p.iss_retido}))}
                          style={{ ...toggle, background: cab.iss_retido ? "#E24B4A" : "#D4DCE8" }}
                        >
                          <div style={{ position: "absolute", top: 2, left: cab.iss_retido ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                        </button>
                        <span style={{ fontSize: 13, color: cab.iss_retido ? "#791F1F" : "#555", fontWeight: cab.iss_retido ? 600 : 400 }}>
                          {cab.iss_retido ? "Retido (desconta do líquido)" : "Não retido (prestador recolhe)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Retenções federais */}
                  <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>Retenções Federais (se houver)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>INSS Retido (R$)</label>
                        <input type="number" step="0.01" value={cab.valor_inss} onChange={e => setCab(p=>({...p,valor_inss:e.target.value}))} placeholder="0,00" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>IR Retido (R$)</label>
                        <input type="number" step="0.01" value={cab.valor_ir} onChange={e => setCab(p=>({...p,valor_ir:e.target.value}))} placeholder="0,00" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Outras Retenções — CSLL/PIS/COFINS (R$)</label>
                        <input type="number" step="0.01" value={cab.valor_outras_retencoes} onChange={e => setCab(p=>({...p,valor_outras_retencoes:e.target.value}))} placeholder="0,00" style={inp} />
                      </div>
                    </div>
                  </div>

                  {/* Resumo financeiro */}
                  <div style={{ background: "#E8F0FB", border: "0.5px solid #93BAF0", borderRadius: 10, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Valor do Serviço",   value: fmtBRL(vServico) },
                      { label: "Total de Retenções",  value: fmtBRL(vRetencoes), vermelho: vRetencoes > 0 },
                      { label: "ISS a Recolher",      value: cab.iss_retido ? "—" : fmtBRL(vISS) },
                      { label: "Valor Líquido",       value: fmtBRL(vLiquido), destaque: true },
                    ].map(({ label, value, vermelho, destaque }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: destaque ? "#1A4870" : vermelho ? "#E24B4A" : "#1a1a1a" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ height: 1, background: "#EEF1F6", margin: "18px 0" }} />

                  {/* Classificação gerencial */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Classificação Gerencial</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Operação Gerencial *</label>
                      <select value={cab.operacao_gerencial_id} onChange={e => setCab(p=>({...p,operacao_gerencial_id:e.target.value}))} style={inp}>
                        <option value="">Selecionar operação…</option>
                        {opsGer.map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Centro de Custo</label>
                      <select value={cab.centro_custo_id} onChange={e => setCab(p=>({...p,centro_custo_id:e.target.value}))} style={inp}>
                        <option value="">Sem centro de custo</option>
                        {centros.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Ano Safra (para rateio)</label>
                      <select value={cab.ano_safra_id} onChange={e => setCab(p=>({...p,ano_safra_id:e.target.value}))} style={inp}>
                        <option value="">Opcional</option>
                        {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Pedido de Compra vinculado</label>
                      <select value={cab.pedido_compra_id} onChange={e => setCab(p=>({...p,pedido_compra_id:e.target.value}))} style={inp}>
                        <option value="">Sem pedido</option>
                        {pedidos.map(p => <option key={p.id} value={p.id}>{p.nr_pedido ?? p.id.substring(0,8)} — {p.status}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Vencimento da CP</label>
                      <input type="date" value={cab.data_vencimento_cp} onChange={e => setCab(p=>({...p,data_vencimento_cp:e.target.value}))} style={inp} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Observações</label>
                    <textarea value={cab.observacao} onChange={e => setCab(p=>({...p,observacao:e.target.value}))} rows={2} style={{ ...inp, resize: "vertical" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => { setErr(""); setEtapa("servico"); }}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                      <button style={btnR} onClick={() => salvar("pendente")} disabled={saving}>
                        {saving ? "Salvando…" : "Salvar como Pendente"}
                      </button>
                      <button style={{ ...btnV, background: saving ? "#ccc" : "#1A4870" }} onClick={() => salvar("processada")} disabled={saving}>
                        {saving ? "Processando…" : "✓ Processar NF"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
