"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { Pessoa, Produtor } from "../../../lib/supabase";
import InputNumerico from "../../../components/InputNumerico";
import ProdutorCombo from "../../../components/ProdutorCombo";

// ── Tipos ────────────────────────────────────────────────────────────────────

type TipoTriang = "venda_a_ordem" | "barter" | "pagamento_terceiro" | "entrega_terceiro";
type StatusTriang = "rascunho" | "em_andamento" | "concluido" | "cancelado";

type NfGerada = {
  numero?: string;
  cfop: string;
  descricao: string;
  emitente: string;
  destinatario: string;
  valor?: number;
  status: "pendente" | "gerada" | "autorizada" | "cancelada";
  chave?: string;
};

type Triangulacao = {
  id: string;
  fazenda_id: string;
  tipo: TipoTriang;
  contrato_ref?: string;
  safra?: string;
  produto?: string;
  quantidade_kg?: number;
  preco_unitario?: number;
  moeda?: string;
  produtor_id?: string;
  comprador_a_id?: string;
  comprador_b_id?: string;
  fornecedor_id?: string;
  beneficiario_id?: string;
  nf_entrada_ref?: string;
  valor_insumos?: number;
  valor_terceiro?: number;
  local_entrega_nome?: string;
  local_entrega_endereco?: string;
  local_entrega_cnpj?: string;
  nfs_geradas?: NfGerada[];
  status: StatusTriang;
  observacao?: string;
  created_at?: string;
};

// ── Constantes ───────────────────────────────────────────────────────────────

const TIPO_META: Record<TipoTriang, { label: string; cor: string; bg: string; icon: string; desc: string }> = {
  venda_a_ordem:      { label: "Venda a Ordem",         cor: "#1A4870", bg: "#D5E8F5", icon: "🔄", desc: "3 NF-es: 6101 + 6108 + 6923" },
  barter:             { label: "Barter",                 cor: "#7A3F00", bg: "#FDE9BB", icon: "🌾", desc: "Insumos × Grãos — NF entrada + saída" },
  pagamento_terceiro: { label: "Pagamento a Terceiro",   cor: "#1A4870", bg: "#EDE9FE", icon: "🏦", desc: "NF normal + CP ao beneficiário" },
  entrega_terceiro:   { label: "Entrega em Terceiro",    cor: "#14532D", bg: "#DCF5E8", icon: "📦", desc: "NF para A com infCpl local de entrega B" },
};

const STATUS_META: Record<StatusTriang, { label: string; cor: string; bg: string }> = {
  rascunho:    { label: "Rascunho",    cor: "var(--text-2)",    bg: "var(--bg-page)" },
  em_andamento:{ label: "Em andamento",cor: "#7A5A12", bg: "#FBF3E0" },
  concluido:   { label: "Concluído",   cor: "#14532D", bg: "#DCF5E8" },
  cancelado:   { label: "Cancelado",   cor: "#791F1F", bg: "#FCEBEB" },
};

const PRODUTOS = ["Soja", "Milho 1ª", "Milho 2ª (Safrinha)", "Algodão", "Sorgo", "Trigo"];
const MOEDAS   = ["BRL", "USD"];

const CFOP_LABEL: Record<string, string> = {
  "6101": "6101 — Venda de produção do estabelecimento (interestadual)",
  "5101": "5101 — Venda de produção do estabelecimento (intraestadual)",
  "6108": "6108 — Venda de mercadoria adquirida ou recebida de terceiros — Venda a Ordem",
  "5108": "5108 — Venda de mercadoria adquirida de terceiros — Venda a Ordem (intraestadual)",
  "6923": "6923 — Remessa de mercadoria por conta e ordem de terceiros — entrega física",
  "5923": "5923 — Remessa de mercadoria por conta e ordem — entrega física (intraestadual)",
  "6949": "6949 — Outra saída de mercadoria ou prestação de serviço não especificado",
};

// ── Helpers de estilo ────────────────────────────────────────────────────────

const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)",
  padding: "18px 20px", ...extra,
});
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 7,
  border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box",
  fontFamily: "inherit",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, fontWeight: 600 };
const btnV: React.CSSProperties = {
  background: "#1A4870", color: "#fff", border: "none", borderRadius: 7,
  padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};
const btnO: React.CSSProperties = {
  background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 7,
  padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

function Badge({ tipo }: { tipo: TipoTriang }) {
  const m = TIPO_META[tipo];
  return (
    <span style={{ background: m.bg, color: m.cor, fontSize: 11, fontWeight: 700,
      padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>
      {m.icon} {m.label}
    </span>
  );
}
function StatusBadge({ status }: { status: StatusTriang }) {
  const m = STATUS_META[status];
  return (
    <span style={{ background: m.bg, color: m.cor, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 5 }}>
      {m.label}
    </span>
  );
}

function fmtKg(v?: number) {
  if (!v) return "—";
  return v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t` :
    `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
}
function fmtSc(v?: number) {
  if (!v) return "—";
  return `${(v / 60).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} sc`;
}
function fmtMoeda(v?: number, moeda = "BRL") {
  if (!v) return "—";
  if (moeda === "USD") return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function TriangulacaoPage() {
  const { fazendaId } = useAuth();

  const [lista, setLista]       = useState<Triangulacao[]>([]);
  const [pessoas, setPessoas]   = useState<Pessoa[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [loading, setLoading]   = useState(true);

  // Filtros
  const [filtroTipo,   setFiltroTipo]   = useState<TipoTriang | "">("");
  const [filtroStatus, setFiltroStatus] = useState<StatusTriang | "">("");
  const [filtroBusca,  setFiltroBusca]  = useState("");

  // Modal
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState<Triangulacao | null>(null);
  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [salvando, setSalvando] = useState(false);

  // Expander
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Form state
  const fVazio = (): Omit<Triangulacao, "id" | "fazenda_id" | "created_at"> => ({
    tipo: "venda_a_ordem", status: "rascunho",
    produto: "Soja", moeda: "BRL",
    contrato_ref: "", safra: "",
    quantidade_kg: undefined, preco_unitario: undefined,
    produtor_id: "", comprador_a_id: "", comprador_b_id: "",
    fornecedor_id: "", beneficiario_id: "",
    nf_entrada_ref: "", valor_insumos: undefined, valor_terceiro: undefined,
    local_entrega_nome: "", local_entrega_endereco: "", local_entrega_cnpj: "",
    observacao: "", nfs_geradas: [],
  });
  const [f, setF] = useState(fVazio());
  const sf = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));

  // ── Carregamento ──────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const [{ data: tri }, { data: pes }, { data: prod }] = await Promise.all([
      supabase.from("triangulacoes").select("*").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("pessoas").select("id,nome,tipo,cpf_cnpj,municipio,estado,logradouro").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("produtores").select("id,nome,tipo,cpf_cnpj,inscricao_est,municipio,estado").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    setLista((tri ?? []) as Triangulacao[]);
    setPessoas((pes ?? []) as Pessoa[]);
    setProdutores((prod ?? []) as Produtor[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Abertura do modal ─────────────────────────────────────────────────────

  const abrir = (item?: Triangulacao) => {
    setEditItem(item ?? null);
    setF(item ? {
      tipo:               item.tipo,
      status:             item.status,
      produto:            item.produto ?? "Soja",
      moeda:              item.moeda ?? "BRL",
      contrato_ref:       item.contrato_ref ?? "",
      safra:              item.safra ?? "",
      quantidade_kg:      item.quantidade_kg,
      preco_unitario:     item.preco_unitario,
      produtor_id:        item.produtor_id ?? "",
      comprador_a_id:     item.comprador_a_id ?? "",
      comprador_b_id:     item.comprador_b_id ?? "",
      fornecedor_id:      item.fornecedor_id ?? "",
      beneficiario_id:    item.beneficiario_id ?? "",
      nf_entrada_ref:     item.nf_entrada_ref ?? "",
      valor_insumos:      item.valor_insumos,
      valor_terceiro:     item.valor_terceiro,
      local_entrega_nome: item.local_entrega_nome ?? "",
      local_entrega_endereco: item.local_entrega_endereco ?? "",
      local_entrega_cnpj: item.local_entrega_cnpj ?? "",
      observacao:         item.observacao ?? "",
      nfs_geradas:        item.nfs_geradas ?? [],
    } : fVazio());
    setStep(item ? 2 : 1);
    setModal(true);
  };

  // ── Geração das NF-es conforme tipo ──────────────────────────────────────

  const gerarNfs = (): NfGerada[] => {
    const prodNome  = produtores.find(p => p.id === f.produtor_id)?.nome ?? "Produtor";
    const pessoaA   = pessoas.find(p => p.id === f.comprador_a_id);
    const pessoaB   = pessoas.find(p => p.id === f.comprador_b_id);
    const fornec    = pessoas.find(p => p.id === f.fornecedor_id);
    const benef     = pessoas.find(p => p.id === f.beneficiario_id);
    const uf        = pessoaA?.estado ?? "MT";
    const inter     = uf !== "MT";
    const valor     = (f.quantidade_kg ?? 0) * (f.preco_unitario ?? 0) / 60;

    if (f.tipo === "venda_a_ordem") {
      const cfopVenda   = inter ? "6101" : "5101";
      const cfopOrdem   = inter ? "6108" : "5108";
      const cfopRemessa = inter ? "6923" : "5923";
      return [
        { cfop: cfopVenda,   descricao: `NF Venda Simbólica — ${prodNome} → ${pessoaA?.nome ?? "Trading A"}`,   emitente: prodNome,          destinatario: pessoaA?.nome ?? "Trading A",  valor, status: "pendente" },
        { cfop: cfopOrdem,   descricao: `NF Venda a Ordem — ${pessoaA?.nome ?? "Trading A"} → ${pessoaB?.nome ?? "Trading B"}`, emitente: pessoaA?.nome ?? "Trading A", destinatario: pessoaB?.nome ?? "Trading B", valor, status: "pendente" },
        { cfop: cfopRemessa, descricao: `NF Remessa Física — ${prodNome} → ${pessoaB?.nome ?? "Trading B"}`,    emitente: prodNome,          destinatario: pessoaB?.nome ?? "Trading B", valor: 0, status: "pendente" },
      ];
    }
    if (f.tipo === "barter") {
      return [
        { cfop: "1101", descricao: `NF Entrada Insumos — ${fornec?.nome ?? "Fornecedor"} → ${prodNome}`,         emitente: fornec?.nome ?? "Fornecedor",     destinatario: prodNome,                          valor: f.valor_insumos, status: "pendente" },
        { cfop: inter ? "6101" : "5101", descricao: `NF Saída Grão (quitação) — ${prodNome} → ${pessoaA?.nome ?? "Trading"}`, emitente: prodNome, destinatario: pessoaA?.nome ?? "Trading", valor, status: "pendente" },
      ];
    }
    if (f.tipo === "pagamento_terceiro") {
      return [
        { cfop: inter ? "6101" : "5101", descricao: `NF Venda Grão — ${prodNome} → ${pessoaA?.nome ?? "Trading"}`, emitente: prodNome, destinatario: pessoaA?.nome ?? "Trading", valor, status: "pendente" },
        { cfop: "—", descricao: `CP ao Beneficiário — ${benef?.nome ?? "Terceiro"} — lançar em Contas a Pagar`, emitente: "Sistema", destinatario: benef?.nome ?? "Terceiro", valor: f.valor_terceiro, status: "pendente" },
      ];
    }
    if (f.tipo === "entrega_terceiro") {
      return [
        { cfop: inter ? "6101" : "5101", descricao: `NF para ${pessoaA?.nome ?? "Trading A"} — entrega física em ${f.local_entrega_nome || pessoaB?.nome || "Trading B"}`, emitente: prodNome, destinatario: pessoaA?.nome ?? "Trading A", valor, status: "pendente" },
      ];
    }
    return [];
  };

  // ── infCpl automático para entrega em terceiro ────────────────────────────

  const gerarInfoCpl = () => {
    if (f.tipo !== "entrega_terceiro") return "";
    const pessoaB = pessoas.find(p => p.id === f.comprador_b_id);
    const nome    = f.local_entrega_nome  || pessoaB?.nome     || "";
    const cnpj    = f.local_entrega_cnpj  || pessoaB?.cpf_cnpj || "";
    const end     = f.local_entrega_endereco || (pessoaB ? `${pessoaB.logradouro ?? ""}, ${pessoaB.municipio ?? ""} - ${pessoaB.estado ?? ""}`.trim() : "");
    if (!nome) return "";
    return `LOCAL DE ENTREGA: ${nome}${cnpj ? ` - CNPJ: ${cnpj}` : ""}${end ? ` - Endereço: ${end}` : ""}.`;
  };

  // ── Salvar ────────────────────────────────────────────────────────────────

  const salvar = async () => {
    if (!fazendaId) return;
    setSalvando(true);
    try {
      const nfs = step === 3 ? gerarNfs() : (f.nfs_geradas ?? []);
      const payload = {
        fazenda_id:         fazendaId,
        tipo:               f.tipo,
        status:             step === 3 ? "em_andamento" : f.status,
        produto:            f.produto || undefined,
        moeda:              f.moeda,
        contrato_ref:       f.contrato_ref  || undefined,
        safra:              f.safra         || undefined,
        quantidade_kg:      f.quantidade_kg || undefined,
        preco_unitario:     f.preco_unitario || undefined,
        produtor_id:        f.produtor_id   || undefined,
        comprador_a_id:     f.comprador_a_id || undefined,
        comprador_b_id:     f.comprador_b_id || undefined,
        fornecedor_id:      f.fornecedor_id  || undefined,
        beneficiario_id:    f.beneficiario_id || undefined,
        nf_entrada_ref:     f.nf_entrada_ref  || undefined,
        valor_insumos:      f.valor_insumos   || undefined,
        valor_terceiro:     f.valor_terceiro  || undefined,
        local_entrega_nome: f.local_entrega_nome || undefined,
        local_entrega_endereco: f.local_entrega_endereco || undefined,
        local_entrega_cnpj: f.local_entrega_cnpj || undefined,
        observacao:         f.observacao     || undefined,
        nfs_geradas:        nfs,
      };
      if (editItem) {
        await supabase.from("triangulacoes").update(payload).eq("id", editItem.id);
        setLista(p => p.map(x => x.id === editItem.id ? { ...x, ...payload, nfs_geradas: nfs } as Triangulacao : x));
      } else {
        const { data } = await supabase.from("triangulacoes").insert(payload).select().single();
        if (data) setLista(p => [data as Triangulacao, ...p]);
      }
      setModal(false);
    } finally { setSalvando(false); }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta operação de triangulação?")) return;
    await supabase.from("triangulacoes").delete().eq("id", id);
    setLista(p => p.filter(x => x.id !== id));
  };

  const marcarConcluido = async (item: Triangulacao) => {
    await supabase.from("triangulacoes").update({ status: "concluido" }).eq("id", item.id);
    setLista(p => p.map(x => x.id === item.id ? { ...x, status: "concluido" } : x));
  };

  // ── Filtros ───────────────────────────────────────────────────────────────

  const listFiltrada = lista.filter(x => {
    if (filtroTipo   && x.tipo   !== filtroTipo)   return false;
    if (filtroStatus && x.status !== filtroStatus) return false;
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase();
      const pA  = pessoas.find(p => p.id === x.comprador_a_id)?.nome?.toLowerCase() ?? "";
      const pB  = pessoas.find(p => p.id === x.comprador_b_id)?.nome?.toLowerCase() ?? "";
      const pR  = produtores.find(p => p.id === x.produtor_id)?.nome?.toLowerCase() ?? "";
      if (!pA.includes(q) && !pB.includes(q) && !pR.includes(q) &&
          !(x.contrato_ref ?? "").toLowerCase().includes(q) &&
          !(x.produto ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const contarTipo = (t: TipoTriang) => lista.filter(x => x.tipo === t).length;

  // ── Render ────────────────────────────────────────────────────────────────

  const nomePessoa = (id?: string) => pessoas.find(p => p.id === id)?.nome ?? "—";
  const nomeProdutor = (id?: string) => produtores.find(p => p.id === id)?.nome ?? "—";

  if (!fazendaId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Selecione uma fazenda.</div>;

  return (
    <div style={{ padding: "24px 32px", fontFamily: "Inter, sans-serif", maxWidth: 1300, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Triangulação de NF</h1>
          <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
            Gestão de operações com múltiplos destinatários — Venda a Ordem, Barter, Pagamento a Terceiro e Entrega em Terceiro
          </p>
        </div>
        <button style={btnV} onClick={() => abrir()}>+ Nova Triangulação</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {(Object.keys(TIPO_META) as TipoTriang[]).map(tipo => {
          const m = TIPO_META[tipo];
          const n = contarTipo(tipo);
          const emAnd = lista.filter(x => x.tipo === tipo && x.status === "em_andamento").length;
          return (
            <div key={tipo} style={card({ cursor: "pointer", borderLeft: `3px solid ${m.cor}` })}
              onClick={() => setFiltroTipo(filtroTipo === tipo ? "" : tipo)}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{m.desc}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: m.cor }}>{n}</span>
                {emAnd > 0 && <span style={{ background: "#FBF3E0", color: "#7A5A12", fontSize: 11, padding: "2px 6px", borderRadius: 4, alignSelf: "center" }}>
                  {emAnd} em andamento
                </span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input style={{ ...inp, width: 220 }} placeholder="Buscar produtor, trading, contrato…" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} />
        <select style={{ ...inp, width: 200 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoTriang | "")}>
          <option value="">Todos os tipos</option>
          {(Object.keys(TIPO_META) as TipoTriang[]).map(t => <option key={t} value={t}>{TIPO_META[t].icon} {TIPO_META[t].label}</option>)}
        </select>
        <select style={{ ...inp, width: 170 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusTriang | "")}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_META) as StatusTriang[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        {(filtroTipo || filtroStatus || filtroBusca) && (
          <button style={btnO} onClick={() => { setFiltroTipo(""); setFiltroStatus(""); setFiltroBusca(""); }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>Carregando…</div>
      ) : listFiltrada.length === 0 ? (
        <div style={card({ textAlign: "center", padding: 60 })}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Nenhuma triangulação cadastrada</div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>Clique em "+ Nova Triangulação" para registrar uma operação com múltiplos destinatários.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {listFiltrada.map(item => {
            const exp = expandido.has(item.id);
            const nfs = item.nfs_geradas ?? [];
            const prodNome = nomeProdutor(item.produtor_id);
            const pANome   = nomePessoa(item.comprador_a_id);
            const pBNome   = nomePessoa(item.comprador_b_id);
            const valorTotal = ((item.quantidade_kg ?? 0) / 60) * (item.preco_unitario ?? 0);

            return (
              <div key={item.id} style={card()}>
                {/* Cabeçalho do card */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: exp ? 16 : 0 }}>
                  <Badge tipo={item.tipo} />
                  <StatusBadge status={item.status} />
                  {item.contrato_ref && (
                    <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Contrato: {item.contrato_ref}</span>
                  )}
                  {item.produto && (
                    <span style={{ fontSize: 12, color: "var(--text-1)" }}>{item.produto}</span>
                  )}
                  {item.quantidade_kg && (
                    <span style={{ fontSize: 12, color: "var(--text-1)" }}>
                      {fmtSc(item.quantidade_kg)} ({fmtKg(item.quantidade_kg)})
                    </span>
                  )}
                  {valorTotal > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1A4870" }}>{fmtMoeda(valorTotal, item.moeda)}</span>
                  )}
                  <div style={{ flex: 1 }} />
                  {/* Pipeline de partes */}
                  <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                    {prodNome !== "—" && <><span style={{ fontWeight: 600, color: "var(--text-1)" }}>{prodNome}</span><span>→</span></>}
                    {pANome !== "—"   && <><span style={{ fontWeight: 600, color: "#1A4870" }}>{pANome}</span></>}
                    {pBNome !== "—"   && <><span>→</span><span style={{ fontWeight: 600, color: "#14532D" }}>{pBNome}</span></>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...btnO, padding: "5px 12px", fontSize: 12 }} onClick={() => {
                      setExpandido(p => { const s = new Set(p); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; });
                    }}>
                      {exp ? "▲ Fechar" : "▼ Documentos"}
                    </button>
                    <button style={{ ...btnO, padding: "5px 12px", fontSize: 12 }} onClick={() => abrir(item)}>Editar</button>
                    {item.status === "em_andamento" && (
                      <button style={{ ...btnV, padding: "5px 12px", fontSize: 12, background: "#16A34A" }} onClick={() => marcarConcluido(item)}>
                        ✓ Concluir
                      </button>
                    )}
                    <button style={{ ...btnO, padding: "5px 12px", fontSize: 12, color: "#E24B4A", borderColor: "#E24B4A" }} onClick={() => excluir(item.id)}>
                      Excluir
                    </button>
                  </div>
                </div>

                {/* Detalhe expandido */}
                {exp && (
                  <div>
                    <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 16 }}>
                      {/* Chain de documentos */}
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Cadeia de Documentos Fiscais
                      </div>
                      {nfs.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>Documentos não gerados ainda. Edite para gerar.</div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {nfs.map((nf, i) => (
                            <div key={i} style={{
                              border: `0.5px solid ${nf.status === "autorizada" ? "#86EFAC" : nf.status === "cancelada" ? "#FCA5A5" : "var(--border)"}`,
                              borderRadius: 10, padding: "12px 16px", minWidth: 220, maxWidth: 320, flex: "1 1 220px",
                              background: nf.status === "autorizada" ? "#F0FDF4" : nf.status === "cancelada" ? "#FEF2F2" : "#FAFBFC",
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: "#1A4870" }}>CFOP {nf.cfop}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: nf.status === "autorizada" ? "#16A34A" : nf.status === "cancelada" ? "#E24B4A" : "var(--text-3)",
                                  background: nf.status === "autorizada" ? "#DCF5E8" : nf.status === "cancelada" ? "#FCEBEB" : "var(--bg-page)",
                                  padding: "1px 6px", borderRadius: 4 }}>
                                  {nf.status === "pendente" ? "PENDENTE" : nf.status === "gerada" ? "GERADA" : nf.status === "autorizada" ? "AUTORIZADA" : "CANCELADA"}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-1)", marginBottom: 4 }}>{nf.descricao}</div>
                              <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                                <div>Emitente: <strong>{nf.emitente}</strong></div>
                                <div>Destinatário: <strong>{nf.destinatario}</strong></div>
                                {nf.valor != null && nf.valor > 0 && <div>Valor: <strong>{fmtMoeda(nf.valor, item.moeda)}</strong></div>}
                                {nf.numero && <div>Nº: <strong>{nf.numero}</strong></div>}
                                {nf.chave && <div style={{ fontSize: 10, color: "var(--text-3)", wordBreak: "break-all" }}>Chave: {nf.chave}</div>}
                              </div>
                              {CFOP_LABEL[nf.cfop] && (
                                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, borderTop: "0.5px solid var(--border)", paddingTop: 6 }}>
                                  {CFOP_LABEL[nf.cfop]}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* infCpl entrega terceiro */}
                      {item.tipo === "entrega_terceiro" && (
                        <div style={{ marginTop: 14, padding: 12, background: "#DCF5E8", border: "0.5px solid #86EFAC", borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#14532D", marginBottom: 4 }}>
                            Informações Adicionais (infCpl) — inserido automaticamente na NF:
                          </div>
                          <div style={{ fontSize: 12, color: "#14532D", fontFamily: "monospace" }}>
                            {item.local_entrega_nome
                              ? `LOCAL DE ENTREGA: ${item.local_entrega_nome}${item.local_entrega_cnpj ? ` - CNPJ: ${item.local_entrega_cnpj}` : ""}${item.local_entrega_endereco ? ` - Endereço: ${item.local_entrega_endereco}` : ""}.`
                              : nomePessoa(item.comprador_b_id) !== "—"
                              ? `LOCAL DE ENTREGA: ${nomePessoa(item.comprador_b_id)}.`
                              : "Preencha o local de entrega"}
                          </div>
                        </div>
                      )}

                      {/* Barter: link NF entrada */}
                      {item.tipo === "barter" && item.nf_entrada_ref && (
                        <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-2)" }}>
                          NF de Entrada de Insumos ref.: <strong style={{ color: "#1A4870" }}>{item.nf_entrada_ref}</strong>
                          {item.valor_insumos && <> — Valor: <strong>{fmtMoeda(item.valor_insumos)}</strong></>}
                        </div>
                      )}

                      {/* Pagamento terceiro: aviso CP */}
                      {item.tipo === "pagamento_terceiro" && item.valor_terceiro && (
                        <div style={{ marginTop: 14, padding: 12, background: "#EDE9FE", border: "0.5px solid #C4B5FD", borderRadius: 8, fontSize: 12 }}>
                          <strong>Atenção:</strong> Lançar CP de {fmtMoeda(item.valor_terceiro)} em Contas a Pagar para{" "}
                          <strong>{nomePessoa(item.beneficiario_id)}</strong> — vinculado à NF desta operação.
                        </div>
                      )}

                      {item.observacao && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "#666", fontStyle: "italic" }}>Obs.: {item.observacao}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ MODAL ══════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 780, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
                  {editItem ? "Editar Triangulação" : "Nova Triangulação de NF"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {step === 1 ? "Passo 1 — Selecionar tipo" : step === 2 ? "Passo 2 — Dados da operação" : "Passo 3 — Revisar e gerar documentos"}
                </div>
              </div>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }} onClick={() => setModal(false)}>✕</button>
            </div>

            {/* Progress */}
            <div style={{ display: "flex", gap: 0, padding: "0 24px", background: "var(--bg-page)", borderBottom: "0.5px solid var(--border)" }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ padding: "10px 16px", fontSize: 12, fontWeight: step >= s ? 700 : 400, color: step >= s ? "#1A4870" : "var(--text-3)",
                  borderBottom: step === s ? "2px solid #1A4870" : "2px solid transparent", cursor: step < s ? "default" : "pointer" }}
                  onClick={() => { if (s < step) setStep(s as 1|2|3); }}>
                  {s}. {s === 1 ? "Tipo" : s === 2 ? "Dados" : "Gerar Docs"}
                </div>
              ))}
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>

              {/* ── PASSO 1: TIPO ─────────────────────────────────────── */}
              {step === 1 && (
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
                    Selecione o tipo de operação triangular:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {(Object.keys(TIPO_META) as TipoTriang[]).map(tipo => {
                      const m = TIPO_META[tipo];
                      const sel = f.tipo === tipo;
                      return (
                        <div key={tipo} onClick={() => sf("tipo", tipo)} style={{
                          border: `2px solid ${sel ? m.cor : "var(--border)"}`,
                          borderRadius: 10, padding: "16px 18px", cursor: "pointer",
                          background: sel ? m.bg : "var(--bg-card)",
                          transition: "all 0.15s",
                        }}>
                          <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: sel ? m.cor : "var(--text-1)", marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>{m.desc}</div>
                          {tipo === "venda_a_ordem" && (
                            <div style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px" }}>
                              Produtor → Trading A → Trading B<br />
                              Entrega física: Produtor → Trading B
                            </div>
                          )}
                          {tipo === "barter" && (
                            <div style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px" }}>
                              Fornecedor entrega insumos ao Produtor<br />
                              Trading paga fornecedor + recebe grão
                            </div>
                          )}
                          {tipo === "pagamento_terceiro" && (
                            <div style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px" }}>
                              NF de grão normal para Trading<br />
                              Trading liquida dívida do Produtor com Banco/Terceiro
                            </div>
                          )}
                          {tipo === "entrega_terceiro" && (
                            <div style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 6, padding: "6px 8px" }}>
                              NF emitida para Trading A<br />
                              Local de entrega física = Trading B (destacado no infCpl)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── PASSO 2: DADOS ────────────────────────────────────── */}
              {step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Seção: Dados Gerais */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, paddingBottom: 6, borderBottom: "0.5px solid var(--border)" }}>
                      Dados Gerais
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Nº Contrato (ref.)</label>
                        <input style={inp} value={f.contrato_ref ?? ""} onChange={e => sf("contrato_ref", e.target.value)} placeholder="Ex: 001/2026" />
                      </div>
                      <div>
                        <label style={lbl}>Safra</label>
                        <input style={inp} value={f.safra ?? ""} onChange={e => sf("safra", e.target.value)} placeholder="Ex: 2025/2026" />
                      </div>
                      <div>
                        <label style={lbl}>Status</label>
                        <select style={inp} value={f.status} onChange={e => sf("status", e.target.value as StatusTriang)}>
                          {(Object.keys(STATUS_META) as StatusTriang[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Seção: Produto */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, paddingBottom: 6, borderBottom: "0.5px solid var(--border)" }}>
                      Produto
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Commodity</label>
                        <select style={inp} value={f.produto ?? "Soja"} onChange={e => sf("produto", e.target.value)}>
                          {PRODUTOS.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Quantidade (sacas)</label>
                        <InputNumerico style={inp} decimais={0} min="0"
                          value={f.quantidade_kg ? Math.round(f.quantidade_kg / 60) : ""}
                          onChange={v => sf("quantidade_kg", Number(v) * 60)}
                          placeholder="0" />
                      </div>
                      <div>
                        <label style={lbl}>Preço ({f.moeda}/sc)</label>
                        <InputNumerico style={inp} min="0"
                          value={f.preco_unitario ?? ""}
                          onChange={v => sf("preco_unitario", Number(v))}
                          placeholder="0,00" />
                      </div>
                      <div>
                        <label style={lbl}>Moeda</label>
                        <select style={inp} value={f.moeda ?? "BRL"} onChange={e => sf("moeda", e.target.value)}>
                          {MOEDAS.map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    {(f.quantidade_kg ?? 0) > 0 && (f.preco_unitario ?? 0) > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>
                        Total estimado:{" "}
                        <strong style={{ color: "#1A4870" }}>
                          {fmtMoeda(((f.quantidade_kg ?? 0) / 60) * (f.preco_unitario ?? 0), f.moeda)}
                        </strong>
                        {" · "}{fmtKg(f.quantidade_kg)}
                      </div>
                    )}
                  </div>

                  {/* Seção: Partes — varia por tipo */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, paddingBottom: 6, borderBottom: "0.5px solid var(--border)" }}>
                      Partes Envolvidas
                    </div>

                    {/* VENDA A ORDEM */}
                    {f.tipo === "venda_a_ordem" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={lbl}>Produtor (emitente das NFs)</label>
                          <ProdutorCombo
                            produtores={produtores}
                            value={f.produtor_id ?? ""}
                            onChange={id => sf("produtor_id", id)}
                            placeholder="— Selecionar —"
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Trading A — Comprador (NF 6101 + 6108)</label>
                            <select style={inp} value={f.comprador_a_id ?? ""} onChange={e => sf("comprador_a_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Recebe NF 6101 do Produtor</div>
                          </div>
                          <div>
                            <label style={lbl}>Trading B — Destinatário Final (NF 6108 + 6923)</label>
                            <select style={inp} value={f.comprador_b_id ?? ""} onChange={e => sf("comprador_b_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Recebe entrega física + NF 6923</div>
                          </div>
                        </div>
                        <div style={{ padding: 12, background: "#D5E8F5", borderRadius: 8, fontSize: 11, color: "#0B2D50" }}>
                          <strong>Fluxo de documentos:</strong><br />
                          1. NF {pessoas.find(p => p.id === f.comprador_a_id)?.estado !== "MT" ? "6101" : "5101"} — Produtor → Trading A (venda simbólica, sem trânsito físico)<br />
                          2. NF {pessoas.find(p => p.id === f.comprador_a_id)?.estado !== "MT" ? "6108" : "5108"} — Trading A → Trading B (venda a ordem)<br />
                          3. NF {pessoas.find(p => p.id === f.comprador_b_id)?.estado !== "MT" ? "6923" : "5923"} — Produtor → Trading B (remessa física — sem valor fiscal)
                        </div>
                      </div>
                    )}

                    {/* BARTER */}
                    {f.tipo === "barter" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={lbl}>Produtor</label>
                          <ProdutorCombo
                            produtores={produtores}
                            value={f.produtor_id ?? ""}
                            onChange={id => sf("produtor_id", id)}
                            placeholder="— Selecionar —"
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Fornecedor de Insumos</label>
                            <select style={inp} value={f.fornecedor_id ?? ""} onChange={e => sf("fornecedor_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Quem entrega os insumos ao produtor</div>
                          </div>
                          <div>
                            <label style={lbl}>Trading (comprador do grão)</label>
                            <select style={inp} value={f.comprador_a_id ?? ""} onChange={e => sf("comprador_a_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Paga o fornecedor e recebe o grão</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Nº NF Entrada de Insumos (ref.)</label>
                            <input style={inp} value={f.nf_entrada_ref ?? ""} onChange={e => sf("nf_entrada_ref", e.target.value)} placeholder="Ex: 12345" />
                          </div>
                          <div>
                            <label style={lbl}>Valor Total dos Insumos (R$)</label>
                            <InputNumerico style={inp} min="0" value={f.valor_insumos ?? ""} onChange={v => sf("valor_insumos", Number(v))} placeholder="0,00" />
                          </div>
                        </div>
                        <div style={{ padding: 12, background: "#FDE9BB", borderRadius: 8, fontSize: 11, color: "#7A3F00" }}>
                          <strong>Fluxo barter:</strong><br />
                          1. NF Entrada — {pessoas.find(p => p.id === f.fornecedor_id)?.nome ?? "Fornecedor"} → Produtor (insumos entregues)<br />
                          2. NF Saída — Produtor → {pessoas.find(p => p.id === f.comprador_a_id)?.nome ?? "Trading"} (grão equivalente ao valor dos insumos)<br />
                          3. Trading liquida o fornecedor diretamente
                        </div>
                      </div>
                    )}

                    {/* PAGAMENTO A TERCEIRO */}
                    {f.tipo === "pagamento_terceiro" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={lbl}>Produtor</label>
                          <ProdutorCombo
                            produtores={produtores}
                            value={f.produtor_id ?? ""}
                            onChange={id => sf("produtor_id", id)}
                            placeholder="— Selecionar —"
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Trading (comprador do grão)</label>
                            <select style={inp} value={f.comprador_a_id ?? ""} onChange={e => sf("comprador_a_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Beneficiário do Pagamento (banco / credor)</label>
                            <select style={inp} value={f.beneficiario_id ?? ""} onChange={e => sf("beneficiario_id", e.target.value)}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={lbl}>Valor a pagar ao terceiro (R$)</label>
                          <InputNumerico style={{ ...inp, maxWidth: 200 }} min="0" value={f.valor_terceiro ?? ""} onChange={v => sf("valor_terceiro", Number(v))} placeholder="0,00" />
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Parte do valor do grão que a trading transfere diretamente ao beneficiário</div>
                        </div>
                        <div style={{ padding: 12, background: "#EDE9FE", borderRadius: 8, fontSize: 11, color: "#4C1D95" }}>
                          <strong>Fluxo:</strong><br />
                          1. NF normal de venda de grão — Produtor → Trading<br />
                          2. Trading liquida {fmtMoeda(f.valor_terceiro)} diretamente para {pessoas.find(p => p.id === f.beneficiario_id)?.nome ?? "Beneficiário"}<br />
                          3. Lançar CP no sistema vinculado à NF desta operação
                        </div>
                      </div>
                    )}

                    {/* ENTREGA EM TERCEIRO */}
                    {f.tipo === "entrega_terceiro" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={lbl}>Produtor (emitente da NF)</label>
                          <ProdutorCombo
                            produtores={produtores}
                            value={f.produtor_id ?? ""}
                            onChange={id => sf("produtor_id", id)}
                            placeholder="— Selecionar —"
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Trading A — Destinatário da NF</label>
                            <select style={inp} value={f.comprador_a_id ?? ""} onChange={e => {
                              sf("comprador_a_id", e.target.value);
                            }}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>A NF é emitida para este CNPJ</div>
                          </div>
                          <div>
                            <label style={lbl}>Trading B — Local Físico de Entrega</label>
                            <select style={inp} value={f.comprador_b_id ?? ""} onChange={e => {
                              const p = pessoas.find(x => x.id === e.target.value);
                              sf("comprador_b_id", e.target.value);
                              if (p) {
                                if (!f.local_entrega_nome) sf("local_entrega_nome", p.nome);
                                if (!f.local_entrega_cnpj) sf("local_entrega_cnpj", p.cpf_cnpj ?? "");
                                if (!f.local_entrega_endereco) sf("local_entrega_endereco", [p.logradouro, p.municipio, p.estado].filter(Boolean).join(", "));
                              }
                            }}>
                              <option value="">— Selecionar —</option>
                              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Onde o grão é entregue fisicamente</div>
                          </div>
                        </div>

                        <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#14532D", marginBottom: 10 }}>
                            Detalhes do Local de Entrega (para infCpl da NF)
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={lbl}>Nome / Razão Social</label>
                              <input style={inp} value={f.local_entrega_nome ?? ""} onChange={e => sf("local_entrega_nome", e.target.value)} placeholder="Ex: Amaggi Rondonópolis" />
                            </div>
                            <div>
                              <label style={lbl}>CNPJ</label>
                              <input style={inp} value={f.local_entrega_cnpj ?? ""} onChange={e => sf("local_entrega_cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                            </div>
                            <div>
                              <label style={lbl}>Endereço</label>
                              <input style={inp} value={f.local_entrega_endereco ?? ""} onChange={e => sf("local_entrega_endereco", e.target.value)} placeholder="Rua, nº — Município/UF" />
                            </div>
                          </div>
                        </div>

                        {/* Preview do infCpl */}
                        {(f.local_entrega_nome || f.comprador_b_id) && (
                          <div style={{ padding: 12, background: "#DCF5E8", border: "0.5px solid #86EFAC", borderRadius: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#14532D", marginBottom: 4 }}>
                              Preview das Informações Adicionais (infCpl) que serão inseridas na NF:
                            </div>
                            <div style={{ fontSize: 12, color: "#14532D", fontFamily: "monospace", wordBreak: "break-word" }}>
                              {gerarInfoCpl() || "Preencha os dados acima para visualizar o texto"}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>Observações</label>
                      <textarea style={{ ...inp, height: 64, resize: "vertical" }} value={f.observacao ?? ""} onChange={e => sf("observacao", e.target.value)} placeholder="Condições especiais, instruções de entrega, etc." />
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASSO 3: REVIEW ───────────────────────────────────── */}
              {step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ padding: 14, background: "var(--bg-page)", borderRadius: 10, fontSize: 13 }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span><Badge tipo={f.tipo} /></span>
                      <span>{f.produto} · {fmtSc(f.quantidade_kg)} · {fmtMoeda(((f.quantidade_kg ?? 0) / 60) * (f.preco_unitario ?? 0), f.moeda)}</span>
                      <span style={{ color: "var(--text-2)" }}>Contrato: <strong>{f.contrato_ref || "—"}</strong></span>
                      <span style={{ color: "var(--text-2)" }}>Safra: <strong>{f.safra || "—"}</strong></span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 12 }}>
                      Documentos que serão gerados para esta operação:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {gerarNfs().map((nf, i) => (
                        <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "12px 16px", background: "#FAFBFC", display: "flex", alignItems: "flex-start", gap: 14 }}>
                          <div style={{ background: "#D5E8F5", color: "#1A4870", fontWeight: 800, fontSize: 14, padding: "6px 12px", borderRadius: 7, whiteSpace: "nowrap" }}>
                            CFOP {nf.cfop}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{nf.descricao}</div>
                            <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 16 }}>
                              <span>Emitente: <strong>{nf.emitente}</strong></span>
                              <span>Destinatário: <strong>{nf.destinatario}</strong></span>
                              {nf.valor != null && nf.valor > 0 && <span>Valor: <strong>{fmtMoeda(nf.valor, f.moeda)}</strong></span>}
                            </div>
                            {CFOP_LABEL[nf.cfop] && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{CFOP_LABEL[nf.cfop]}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {f.tipo === "entrega_terceiro" && gerarInfoCpl() && (
                    <div style={{ padding: 14, background: "#DCF5E8", border: "0.5px solid #86EFAC", borderRadius: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#14532D", marginBottom: 6 }}>
                        infCpl que será inserido na NF automaticamente:
                      </div>
                      <div style={{ fontSize: 13, color: "#14532D", fontFamily: "monospace" }}>{gerarInfoCpl()}</div>
                    </div>
                  )}

                  {f.tipo === "pagamento_terceiro" && f.valor_terceiro && (
                    <div style={{ padding: 14, background: "#EDE9FE", border: "0.5px solid #C4B5FD", borderRadius: 10, fontSize: 13 }}>
                      <strong>Ação manual necessária:</strong> Após salvar, lançar uma CP de{" "}
                      <strong>{fmtMoeda(f.valor_terceiro)}</strong> em Contas a Pagar para{" "}
                      <strong>{pessoas.find(p => p.id === f.beneficiario_id)?.nome ?? "Beneficiário"}</strong>{" "}
                      vinculado a esta operação.
                    </div>
                  )}

                  <div style={{ padding: 12, background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, fontSize: 12, color: "#7A5A12" }}>
                    <strong>Atenção:</strong> Os documentos ficam com status "Pendente". A emissão real das NF-es no SEFAZ deve ser feita pelo módulo NF-e
                    com os CFOPs indicados acima. Este registro serve como guia e controle da cadeia de documentos.
                  </div>
                </div>
              )}
            </div>

            {/* Footer do modal */}
            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 10, position: "sticky", bottom: 0, background: "var(--bg-card)" }}>
              <button style={btnO} onClick={() => step === 1 ? setModal(false) : setStep(s => (s - 1) as 1|2|3)}>
                {step === 1 ? "Cancelar" : "← Voltar"}
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                {step < 3 && (
                  <button style={btnO} onClick={async () => { await salvar(); }}>
                    Salvar rascunho
                  </button>
                )}
                <button
                  style={{ ...btnV, opacity: salvando ? 0.6 : 1 }}
                  disabled={salvando}
                  onClick={() => {
                    if (step < 3) setStep(s => (s + 1) as 1|2|3);
                    else salvar();
                  }}
                >
                  {salvando ? "Salvando…" : step === 3 ? "✓ Salvar e gerar documentos" : "Próximo →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
