"use client";
import React, { useState, useEffect, useRef } from "react";
import TopNav from "../../components/TopNav";
import BalancaSerial from "../../components/BalancaSerial";
import {
  listarContratos, listarContratosDaConta, criarContrato, atualizarContrato, excluirContrato, encerrarContratosPorSafras,
  listarRomaneios, criarRomaneio, atualizarRomaneio, excluirRomaneio,
  listarItensContrato, salvarItensContrato,
  listarCessaoDebitos, salvarCessaoDebitos,
  listarPessoasDaConta, listarProdutoresDaConta, listarAnosSafra, listarCiclos, listarDepositos, listarFazendas,
  encerrarAnoSafra, reabrirAnoSafra,
  baixarLancamento,
  listarIEsDoProdutor,
} from "../../lib/db";
import { supabase } from "../../lib/supabase";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import ProdutorCombo from "../../components/ProdutorCombo";
import type { Contrato, ContratoItem, Romaneio, Pessoa, Produtor, ProdutorIE, AnoSafra, Ciclo, Deposito, Fazenda, AdiantamentoCliente, Cultura as CulturaContrato, Insumo } from "../../lib/supabase";
import InputMonetario from "../../components/InputMonetario";
import PlanoGate from "../../components/PlanoGate";
import AnexoDocumentos from "../../components/AnexoDocumentos";

const sbErr = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    return String(o.message ?? o.details ?? JSON.stringify(e));
  }
  return String(e);
};

// ── Tabela fiscal de naturezas de operação ────────────────────────────────────
// Cada entrada tem um único cfop (intra ou inter já diferenciado como opção separada).
// Grupos: "Vendas" | "Exportação" | "Remessas"
const NATUREZAS_OPERACAO = [
  // === Vendas — Mercado Interno ===
  {
    codigo: "VPE-PF", grupo: "Vendas",
    descricao: "Venda de Produção — Interestadual / Produtor Rural PF",
    cfop: "6101", cst_icms: "090",
    obs: "ICMS Diferido (Dec. MT 4.540/04). Venda para comprador fora do MT. Funrural aplicável.",
  },
  {
    codigo: "VPE-PF-INTRA", grupo: "Vendas",
    descricao: "Venda de Produção — Intraestadual / Produtor Rural PF",
    cfop: "5101", cst_icms: "090",
    obs: "ICMS Diferido. Venda para comprador dentro do MT (mesma UF). Funrural aplicável.",
  },
  {
    codigo: "VPE-PJ", grupo: "Vendas",
    descricao: "Venda de Produção — Interestadual / Produtor Rural PJ",
    cfop: "6101", cst_icms: "090",
    obs: "ICMS Diferido. Produtor rural com CNPJ para compradores fora do MT.",
  },
  {
    codigo: "VPE-PJ-INTRA", grupo: "Vendas",
    descricao: "Venda de Produção — Intraestadual / Produtor Rural PJ",
    cfop: "5101", cst_icms: "090",
    obs: "ICMS Diferido. Produtor rural com CNPJ para compradores dentro do MT.",
  },
  {
    codigo: "VMT", grupo: "Vendas",
    descricao: "Venda de Mercadoria Adquirida ou Recebida de Terceiros — Interestadual",
    cfop: "6102", cst_icms: "090",
    obs: "Revenda de grão adquirido de terceiros para compradores fora do MT. ICMS Diferido.",
  },
  {
    codigo: "VMT-INTRA", grupo: "Vendas",
    descricao: "Venda de Mercadoria Adquirida ou Recebida de Terceiros — Intraestadual",
    cfop: "5102", cst_icms: "090",
    obs: "Revenda de grão adquirido de terceiros para compradores dentro do MT. ICMS Diferido.",
  },
  // === Exportação ===
  {
    codigo: "VFE-PF", grupo: "Exportação",
    descricao: "Venda com Fim Específico de Exportação — Interestadual / Produtor Rural PF",
    cfop: "6501", cst_icms: "090",
    obs: "OPERAÇÃO MAIS COMUM EM MT: produtor vende para trading (Bunge, Cargill, ADM, Amaggi…) que exportará. ICMS suspenso/imune. PIS/COFINS imunes. Funrural incide normalmente. Não exige RE/DU-E do produtor.",
  },
  {
    codigo: "VFE-PF-INTRA", grupo: "Exportação",
    descricao: "Venda com Fim Específico de Exportação — Intraestadual / Produtor Rural PF",
    cfop: "5501", cst_icms: "090",
    obs: "VFE para trading exportadora dentro do MT. ICMS suspenso. PIS/COFINS imunes. Funrural incide.",
  },
  {
    codigo: "VFE-PJ", grupo: "Exportação",
    descricao: "Venda com Fim Específico de Exportação — Interestadual / Produtor Rural PJ",
    cfop: "6501", cst_icms: "090",
    obs: "Mesmo que VFE-PF, mas para produtor com CNPJ. ICMS suspenso. PIS/COFINS imunes. Funrural incide.",
  },
  {
    codigo: "VFE-TER", grupo: "Exportação",
    descricao: "Venda com Fim Específico de Exportação — Mercadoria de Terceiros",
    cfop: "6502", cst_icms: "090",
    obs: "Venda de grão adquirido de terceiros (não produção própria) para trading exportadora. ICMS suspenso.",
  },
  {
    codigo: "EXP", grupo: "Exportação",
    descricao: "Exportação Direta pelo Próprio Produtor",
    cfop: "7101", cst_icms: "090",
    obs: "Produtor exporta diretamente. Imune de ICMS, PIS, COFINS e Funrural (Art. 149-A CF). Exige RE e DU-E no SISCOMEX.",
  },
  {
    codigo: "EXP-TER", grupo: "Exportação",
    descricao: "Exportação Direta — Mercadoria de Terceiros",
    cfop: "7102", cst_icms: "090",
    obs: "Exportação direta de mercadoria de terceiros. Imune de ICMS, PIS, COFINS. Exige RE e DU-E.",
  },
  // === Venda à Ordem ===
  {
    codigo: "VO-INTER", grupo: "Venda à Ordem",
    descricao: "Venda à Ordem — Produção Própria / Interestadual",
    cfop: "6118", cst_icms: "090",
    obs: "Operação triangular: produtor emite NF de venda ao comprador final (CFOP 6.118); o armazém/depositário emite NF de remessa simbólica (CFOP 6.119) diretamente ao comprador final, por conta e ordem do produtor. ICMS Diferido MT. Funrural e Fundeinfra incidem normalmente.",
  },
  {
    codigo: "VO-INTRA", grupo: "Venda à Ordem",
    descricao: "Venda à Ordem — Produção Própria / Intraestadual",
    cfop: "5118", cst_icms: "090",
    obs: "Operação triangular dentro do MT: produtor emite NF de venda ao comprador final (CFOP 5.118); o armazém/depositário emite NF de remessa simbólica (CFOP 5.119) ao comprador final. ICMS Diferido. Funrural incide.",
  },
  {
    codigo: "VO-TER-INTER", grupo: "Venda à Ordem",
    descricao: "Venda à Ordem — Mercadoria de Terceiros / Interestadual",
    cfop: "6118", cst_icms: "090",
    obs: "Venda de grão adquirido de terceiros (não produção própria), entregue ao comprador final por conta e ordem. CFOP 6.118 na NF de venda; CFOP 6.119 na NF de remessa do depositário.",
  },
  // === Remessas ===
  {
    codigo: "REF", grupo: "Remessas",
    descricao: "Remessa Simbólica — Entrega Futura",
    cfop: "6117", cst_icms: "090",
    obs: "Faturamento antecipado. NF simbólica sem movimentação física. Entrega real ocorre depois.",
  },
  {
    codigo: "RVO", grupo: "Remessas",
    descricao: "Remessa para Venda à Ordem",
    cfop: "6119", cst_icms: "090",
    obs: "Operação triangular: produto sai do armazém diretamente ao comprador final. NF emitida pelo titular do estoque.",
  },
  {
    codigo: "RAG", grupo: "Remessas",
    descricao: "Remessa para Armazém Geral — Interestadual",
    cfop: "6905", cst_icms: "090",
    obs: "Depósito em armazém fora do MT. Não é venda. Não gera receita nem Funrural.",
  },
  {
    codigo: "RAG-INTRA", grupo: "Remessas",
    descricao: "Remessa para Armazém Geral — Intraestadual",
    cfop: "5905", cst_icms: "090",
    obs: "Depósito em armazém dentro do MT. Não é venda. Não gera receita nem Funrural.",
  },
  {
    codigo: "TAG", grupo: "Remessas",
    descricao: "Retorno de Armazém Geral — Interestadual",
    cfop: "6906", cst_icms: "090",
    obs: "Retorno de mercadoria depositada em armazém geral fora do MT.",
  },
  {
    codigo: "TAG-INTRA", grupo: "Remessas",
    descricao: "Retorno de Armazém Geral — Intraestadual",
    cfop: "5906", cst_icms: "090",
    obs: "Retorno de mercadoria depositada em armazém geral dentro do MT.",
  },
  {
    codigo: "TRF", grupo: "Remessas",
    descricao: "Transferência entre Estabelecimentos do Produtor",
    cfop: "6151", cst_icms: "090",
    obs: "Transferência entre fazendas/filiais do mesmo CNPJ ou grupo. Não é venda.",
  },
] as const;

// ── Auto-sugestão de natureza de operação ────────────────────────────────────
// Regras para MT: soja/milho exportados via trading → VFE (CFOP 6.501).
// Demais commodities → venda produção própria (CFOP 6.101).
const COMMODITIES_VFE = ["Soja", "Milho 1ª", "Milho 2ª (Safrinha)", "Sorgo", "Feijão"];
function sugerirNatureza(produto: string, tipoPessoa: "pf" | "pj", commoditiesVfe?: string[]): string {
  const isVfe = (commoditiesVfe ?? COMMODITIES_VFE).includes(produto);
  if (isVfe) return tipoPessoa === "pf" ? "VFE-PF" : "VFE-PJ";
  return tipoPessoa === "pf" ? "VPE-PF" : "VPE-PJ";
}
function tipoProdutorDeCpfCnpj(cpfCnpj?: string | null): "pf" | "pj" {
  return (cpfCnpj ?? "").replace(/\D/g, "").length <= 11 ? "pf" : "pj";
}

// ── Tabelas de classificação por commodity ────────────────────────────────────
// Padrões ABIOVE/ANEC/MAPA para descontos no romaneio de expedição.
// Fórmula umidade: PL × (U − Upad) / (100 − Upad)   [ABIOVE — correta para soja e milho]
// Fórmula impureza: PL × (I − Ipad) / 100
// Fórmula avariados: PL × (A − Apad) / 100
type CommodityClass = { umidade_padrao: number; impureza_padrao: number; avariados_padrao: number; kg_saca: number };
const CLASSE_COMMODITY: Record<string, CommodityClass> = {
  "Soja":                 { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 8.0, kg_saca: 60 },
  "Milho 1ª":             { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Milho 2ª (Safrinha)":  { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Algodão":              { umidade_padrao: 12.0, impureza_padrao: 1.5, avariados_padrao: 0.0, kg_saca: 15 },
  "Sorgo":                { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Trigo":                { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 2.0, kg_saca: 60 },
  "Feijão":               { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 0.5, kg_saca: 60 },
};
const classeCommodity = (produto: string): CommodityClass =>
  CLASSE_COMMODITY[produto] ?? { umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, kg_saca: 60 };
const calcDescUmidade = (pl: number, u: number, uPad: number) => u > uPad ? +(pl * (u - uPad) / (100 - uPad)).toFixed(2) : 0;
const calcDescImpureza = (pl: number, i: number, iPad: number) => i > iPad ? +(pl * (i - iPad) / 100).toFixed(2) : 0;
const calcDescAvariados = (pl: number, a: number, aPad: number) => a > aPad ? +(pl * (a - aPad) / 100).toFixed(2) : 0;

// ── VMs ──────────────────────────────────────────────────────────
interface ContratoVM extends Contrato { romaneios: Romaneio[]; itens: ContratoItem[] }

// ── helpers ──────────────────────────────────────────────────────
const fmtData  = (iso?: string | null) => { if (!iso) return "—"; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtR$    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPeso  = (kg: number) => `${kg.toLocaleString("pt-BR")} kg`;
const TODAY    = new Date().toISOString().split("T")[0];

const PRODUTOS  = ["Soja", "Milho 1ª", "Milho 2ª (Safrinha)", "Algodão", "Sorgo", "Trigo", "Feijão"];
const UNIDADES  = ["sc", "kg", "ton", "@"] as const;
const FRETES    = ["destinatario","remetente","cif","fob","sem_frete"] as const;
const FRETE_LBL: Record<string,string> = { destinatario:"Destinatário", remetente:"Remetente", cif:"CIF", fob:"FOB", sem_frete:"Sem frete" };

const corStatus = (s: string) => ({
  aberto:    { bg: "#E6F1FB", color: "#0C447C", label: "Em aberto"  },
  parcial:   { bg: "#FAEEDA", color: "#633806", label: "Parcial"    },
  encerrado: { bg: "#E8E8E8", color: "#0D0D0D", label: "Encerrado"  },
  cancelado: { bg: "#FCEBEB", color: "#791F1F", label: "Cancelado"  },
}[s] ?? { bg: "#F1EFE8", color: "var(--text-2)", label: s });

const corProduto = (p: string) => {
  if (p === "Soja")          return { bg: "#E8E8E8", color: "#0D0D0D" };
  if (p.startsWith("Milho")) return { bg: "#FAEEDA", color: "#633806" };
  if (p === "Algodão")       return { bg: "#E6F1FB", color: "#0C447C" };
  return { bg: "#F1EFE8", color: "var(--text-2)" };
};

// ── estilos base ─────────────────────────────────────────────────
const inp: React.CSSProperties = { width:"100%", padding:"7px 9px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", boxSizing:"border-box", outline:"none" };
const lbl: React.CSSProperties = { fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" };
const btnV: React.CSSProperties = { padding:"8px 18px", background:"#2A2A2A", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 };
const btnR: React.CSSProperties = { padding:"8px 18px", border:"0.5px solid var(--border-table)", borderRadius:8, background:"transparent", cursor:"pointer", fontSize:13, color:"var(--text-1)" };
const btnX: React.CSSProperties = { padding:"3px 8px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" };
const badge = (t: string, bg="#E8E8E8", c="#0D0D0D") => <span style={{ fontSize:10, background:bg, color:c, padding:"2px 7px", borderRadius:8, fontWeight:600 }}>{t}</span>;

// ── Seletor de Pessoa com busca por digitação ─────────────────────
function SelectPessoa({ value, onChange, pessoas, borderColor }: {
  value: string; onChange: (id: string) => void; pessoas: Pessoa[]; borderColor?: string;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selecionada = pessoas.find(p => p.id === value);
  const filtradas = busca.trim()
    ? pessoas.filter(p =>
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        (p.cpf_cnpj ?? "").replace(/\D/g, "").includes(busca.replace(/\D/g, ""))
      )
    : pessoas;
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setAberto(false); setBusca(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        style={{ ...inp, display:"flex", alignItems:"center", padding:0, borderColor: borderColor ?? undefined, cursor:"pointer" }}
        onClick={() => setAberto(v => !v)}
      >
        {aberto ? (
          <input autoFocus
            style={{ flex:1, border:"none", background:"transparent", outline:"none", fontSize:12, padding:"7px 9px", color:"var(--text-1)" }}
            placeholder="Digite para buscar..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Escape") { setAberto(false); setBusca(""); }
              if (e.key === "Enter" && filtradas.length === 1) { onChange(filtradas[0].id); setAberto(false); setBusca(""); }
            }}
          />
        ) : (
          <span style={{ flex:1, padding:"7px 9px", fontSize:12, color: selecionada ? "var(--text-1)" : "var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {selecionada ? `${selecionada.cpf_cnpj ? selecionada.cpf_cnpj + " — " : ""}${selecionada.nome}` : "— selecione —"}
          </span>
        )}
        <span style={{ padding:"0 8px", color:"var(--text-3)", fontSize:9, flexShrink:0 }}>▾</span>
      </div>
      {aberto && (
        <div style={{ position:"absolute", top:"calc(100% + 2px)", left:0, right:0, zIndex:9999, background:"var(--bg-card,#fff)", border:"0.5px solid var(--border)", borderRadius:8, boxShadow:"0 4px 20px rgba(0,0,0,0.18)", maxHeight:260, overflowY:"auto" }}>
          <div onMouseDown={() => { onChange(""); setAberto(false); setBusca(""); }}
            style={{ padding:"7px 12px", cursor:"pointer", fontSize:12, color:"var(--text-3)", borderBottom:"0.5px solid var(--border)" }}>
            — selecione —
          </div>
          {filtradas.length === 0
            ? <div style={{ padding:"8px 12px", fontSize:12, color:"var(--text-3)" }}>Nenhum resultado</div>
            : filtradas.map(p => (
              <div key={p.id}
                onMouseDown={() => { onChange(p.id); setAberto(false); setBusca(""); }}
                style={{ padding:"7px 12px", cursor:"pointer", fontSize:12, color: p.id === value ? "#1A5CB8" : "var(--text-1)", background: p.id === value ? "#EEF4FC" : "transparent", borderBottom:"0.5px solid var(--border-table)", display:"flex", alignItems:"center", gap:8 }}
                onMouseEnter={e => { if (p.id !== value) (e.currentTarget as HTMLElement).style.background = "var(--bg-nav,#F4F6FA)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = p.id === value ? "#EEF4FC" : "transparent"; }}
              >
                {p.cpf_cnpj && <span style={{ fontSize:10, fontFamily:"monospace", color:"var(--text-3)", flexShrink:0 }}>{p.cpf_cnpj}</span>}
                <span>{p.nome}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}


// ── item vazio ───────────────────────────────────────────────────
// unidade padrão = "kg" — storage sempre em kg; display em sc nos grids
const itemVazio = (): Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id"> => ({
  tipo: "Produto", produto: "Soja", unidade: "kg", quantidade: 0, valor_unitario: 0, valor_total: 0, moeda: "BRL", classificacao: "",
});

type AbaForm = "principal" | "adicionais";
type AbaLista = "contratos" | "expedicao" | "posicao";

// ═══════════════════════════════════════════════════════════════════
// ── normaliza produto da IA para os nomes do sistema ─────────────────────────
function normalizarProdutoIA(prod?: string): string {
  if (!prod || typeof prod !== "string") return "Soja";
  const p = prod.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (p.includes("soja")) return "Soja";
  if (p.includes("milho") && (p.includes("2") || p.includes("safrinha"))) return "Milho 2ª (Safrinha)";
  if (p.includes("milho")) return "Milho 1ª";
  if (p.includes("algodao") || p.includes("algodão")) return "Algodão";
  if (p.includes("trigo")) return "Trigo";
  if (p.includes("sorgo")) return "Sorgo";
  if (p.includes("feijao") || p.includes("feijão")) return "Feijão";
  return "Soja";
}
// ── normaliza frete da IA → opções do formulário ──────────────────────────────
function normalizarFreteIA(frete?: string): string {
  if (!frete || typeof frete !== "string") return "destinatario";
  const f = frete.toUpperCase();
  if (f === "FOB") return "fob";
  if (f === "CIF") return "cif";
  return "destinatario";
}

export default function Contratos() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano, contaModulosOverrides } = useAuth();

  // ── dados ────────────────────────────────────────────────────
  const [contratos, setContratos]     = useState<ContratoVM[]>([]);
  const [pessoas, setPessoas]         = useState<Pessoa[]>([]);
  const [produtores, setProdutores]   = useState<Produtor[]>([]);
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [fazendas, setFazendas]       = useState<Fazenda[]>([]);
  const [culturasCont, setCulturasCont] = useState<CulturaContrato[]>([]);
  const [prodAgricolas, setProdAgricolas] = useState<Insumo[]>([]);

  // ── UI ───────────────────────────────────────────────────────
  const [abaLista, setAbaLista]       = useState<AbaLista>("contratos");
  const [expandido, setExpandido]     = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState<string|null>(null);
  const [salvando, setSalvando]       = useState(false);
  const [errosContrato, setErrosContrato] = useState<string[]>([]);

  // ── filtros da lista de contratos ────────────────────────────
  const [filtroAno,     setFiltroAno]     = useState("");
  const [filtroCiclo,   setFiltroCiclo]   = useState("");
  const [ciclosFiltro,  setCiclosFiltro]  = useState<Ciclo[]>([]);
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroStatus,  setFiltroStatus]  = useState("");
  const [filtroComprador, setFiltroComprador] = useState("");
  const [filtroBusca,   setFiltroBusca]   = useState("");
  const [filtroFazenda, setFiltroFazenda] = useState("");

  // ── PTAX dinâmico para contratos em USD ─────────────────────
  const [ptaxAtual, setPtaxAtual] = useState<number>(5.90);
  useEffect(() => {
    fetch("/api/precos").then(r => r.json()).then((d: { usdPtax?: number; usdBrl?: number }) => {
      const rate = d.usdPtax ?? d.usdBrl ?? 5.90;
      if (rate > 0) setPtaxAtual(rate);
    }).catch(() => {});
  }, []);

  // ── modal encerramento em lote ───────────────────────────────
  const [modalLote, setModalLote]         = useState(false);
  const [loteOp, setLoteOp]               = useState<"contratos"|"safra">("contratos");
  const [loteSafras, setLoteSafras]       = useState<Set<string>>(new Set());
  const [loteSalvando, setLoteSalvando]   = useState(false);
  const [loteResultado, setLoteResultado] = useState<string|null>(null);

  const abrirModalLote = () => {
    setLoteOp("contratos");
    setLoteSafras(new Set());
    setLoteResultado(null);
    setModalLote(true);
  };

  const safraStats = (anoId: string) => {
    const cs = contratos.filter(c => c.ano_safra_id === anoId || (!c.ano_safra_id && c.safra === (anosSafra.find(a => a.id === anoId)?.descricao ?? "")));
    return {
      total:    cs.length,
      abertos:  cs.filter(c => c.status === "aberto" || c.status === "parcial").length,
      encerrados: cs.filter(c => c.status === "encerrado").length,
    };
  };

  const executarLote = async () => {
    if (loteSafras.size === 0) return;
    setLoteSalvando(true);
    setLoteResultado(null);
    try {
      const ids = [...loteSafras];
      if (loteOp === "safra") {
        // Encerra a safra completa (status + contratos)
        let totalContratos = 0;
        for (const id of ids) {
          const n = await encerrarAnoSafra(id, fazendaId!);
          totalContratos += n;
        }
        setAnosSafra(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: "encerrada" as const } : a));
        setLoteResultado(`✓ ${ids.length} safra(s) encerrada(s) + ${totalContratos} contrato(s) fechados.`);
      } else {
        // Encerra apenas os contratos, mantém safra ativa
        const n = await encerrarContratosPorSafras(fazendaId!, ids);
        setLoteResultado(`✓ ${n} contrato(s) encerrado(s).`);
      }
      await carregarTudo();
    } catch (e) { setLoteResultado("✕ Erro: " + sbErr(e)); }
    finally { setLoteSalvando(false); }
  };

  // ── modal contrato ───────────────────────────────────────────
  const [modalContrato, setModalContrato] = useState(false);
  const [editContrato, setEditContrato]   = useState<ContratoVM|null>(null);
  const [viewOnly, setViewOnly]           = useState(false); // true = apenas visualizar
  const [abaForm, setAbaForm]             = useState<AbaForm>("principal");
  const [itens, setItens]                 = useState<Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id">[]>([itemVazio()]);

  const fContratoVazio = () => ({
    fazenda_id: fazendaId ?? "",
    // principal
    ano_safra_id: anosSafra[0]?.id ?? "",
    safra: anosSafra[0]?.descricao ?? "25/26",
    tipo: "venda" as Contrato["tipo"],
    autorizacao: "autorizada" as Contrato["autorizacao"],
    confirmado: false,
    a_fixar: false,
    venda_a_ordem: false,
    data_contrato: TODAY,
    pessoa_id: "",
    produtor_id: "",
    ie_id: "" as string | undefined,
    nr_contrato_cliente: "",
    contato_broker: "",
    grupo_vendedor: "",
    vendedor: "",
    // produto/preço (item 0)
    produto: "Soja",
    modalidade: "fixo" as Contrato["modalidade"],
    moeda: "BRL" as Contrato["moeda"],
    preco: 0,
    quantidade_sc: 0,
    data_entrega: "",
    data_pagamento: undefined as string | undefined,
    // logística / fiscal
    saldo_tipo: "peso_saida" as Contrato["saldo_tipo"],
    frete: "destinatario" as Contrato["frete"],
    valor_frete: 0,
    natureza_codigo: "",   // código da NATUREZAS_OPERACAO selecionada
    natureza_operacao: "", // descricao gravada para histórico
    cfop: "",
    // adicionais
    propriedade: "",
    ciclo_id: "",          // FK ciclos — Empreendimento
    seguradora: "",
    corretora: "",
    cte_numero: "",
    pdf_url: undefined as string | undefined,
    pdf_nome: undefined as string | undefined,
    terceiro: "",
    deposito_carregamento: "",
    deposito_fiscal: false,
    observacao_interna: "",
    observacao: "",
    // cessão
    dado_em_cessao: false,
    cessao_beneficiarios: [] as CessaoBenef[],
    // triangulação cooperativa
    is_triangulacao: false,
    comprador_final_id: "",
    // local de entrega
    local_entrega_pessoa_id: "",
    local_entrega_nome: "",
    local_entrega_cnpj: "",
    local_entrega_logradouro: "",
    local_entrega_municipio: "",
    local_entrega_uf: "",
    local_entrega_cep: "",
  });

  const [fC, setFC] = useState(fContratoVazio());
  const [iesProdutor, setIesProdutor] = useState<ProdutorIE[]>([]);

  // carrega IEs do produtor quando ele muda
  useEffect(() => {
    if (!fC.produtor_id) { setIesProdutor([]); return; }
    listarIEsDoProdutor(fC.produtor_id).then(list => {
      setIesProdutor(list);
      // auto-seleciona se só há uma IE
      if (list.length === 1) setFC(p => ({ ...p, ie_id: list[0].id }));
      else if (list.length === 0) setFC(p => ({ ...p, ie_id: "" }));
    }).catch(() => setIesProdutor([]));
  }, [fC.produtor_id]);

  // ── sugestão automática de natureza ──────────────────────────
  const [naturezaSugerida, setNaturezaSugerida] = useState<string>("");

  useEffect(() => {
    if (!modalContrato) return;
    if (naturezaSugerida === "__manual__") return; // contrato existente — não sobrescrever

    // Produto principal = primeiro item da grade
    const produtoPrincipal = itens[0]?.produto ?? fC.produto;
    const prod = produtores.find(p => p.id === fC.produtor_id);
    const tipo = tipoProdutorDeCpfCnpj(prod?.cpf_cnpj);

    let sugestao: string;
    if (fC.venda_a_ordem) {
      // Venda à Ordem: usar CFOP 5.118 (intra) ou 6.118 (inter)
      // Por padrão sugere interestadual; usuário pode trocar para intra no select
      sugestao = "VO-INTER";
    } else {
      sugestao = sugerirNatureza(produtoPrincipal, tipo, COMMODITIES_VFE_DIN);
    }

    if (!fC.natureza_codigo || fC.natureza_codigo === naturezaSugerida) {
      const nat = NATUREZAS_OPERACAO.find(n => n.codigo === sugestao);
      setFC(p => ({ ...p, natureza_codigo: sugestao, natureza_operacao: nat?.descricao ?? "", cfop: nat?.cfop ?? p.cfop }));
    }
    setNaturezaSugerida(sugestao);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens[0]?.produto, fC.produtor_id, fC.venda_a_ordem, modalContrato]);

  // ── modal cessão ─────────────────────────────────────────────
  type CessaoBenef = { key: string; fornecedor_id: string; fornecedor_nome: string; data: string; obs: string; };
  type LancItem = { id: string; descricao: string; data_vencimento: string; valor: number; status: string; pedido_compra_id?: string; pc_numero?: string; };
  const [modalCessao,      setModalCessao]      = useState(false);
  const [cessaoLancs,      setCessaoLancs]      = useState<LancItem[]>([]);
  // lancamento_id → { valor, fornId }
  const [cessaoSelecionados, setCessaoSelecionados] = useState<Record<string, {valor:number; fornId:string}>>({});
  const [cessaoBenefAtivo,   setCessaoBenefAtivo]   = useState<string>(""); // fornecedor_id sendo vinculado no modal

  // ── IA — Extração de Contrato de Venda (Add-on ia_contrato_venda) ──────────
  const [iaVendaExtraindo, setIaVendaExtraindo] = useState(false);
  const [iaVendaPdfNome,   setIaVendaPdfNome]   = useState<string|null>(null);
  const [iaVendaConf,      setIaVendaConf]      = useState<"alta"|"media"|"baixa"|null>(null);
  const [iaVendaErro,      setIaVendaErro]      = useState<string|null>(null);
  const [iaVendaResultado, setIaVendaResultado] = useState<Record<string,unknown>|null>(null);
  const [iaVendaRawText,   setIaVendaRawText]   = useState<string|null>(null);
  const [iaVendaMostrarDebug, setIaVendaMostrarDebug] = useState(false);

  async function handlePdfContratoVenda(file: File) {
    setIaVendaExtraindo(true);
    setIaVendaConf(null);
    setIaVendaErro(null);
    setIaVendaResultado(null);
    setIaVendaRawText(null);
    setIaVendaMostrarDebug(false);
    setIaVendaPdfNome(file.name);
    try {
      const form = new FormData();
      form.append("pdf", file);
      const res = await fetch("/api/ai/extrair-contrato-venda", { method: "POST", body: form });
      const json = await res.json() as { extraido?: Record<string, unknown>; rawText?: string; error?: string };
      if (!res.ok || json.error) { setIaVendaErro(json.error ?? "Erro ao processar PDF."); return; }
      const e = json.extraido as Record<string, unknown>;
      setIaVendaResultado(e);
      setIaVendaRawText(json.rawText ?? null);
      console.log("[IA Contrato Venda] extraído:", e);
      console.log("[IA Contrato Venda] raw:", json.rawText?.slice(0, 500));
      // Salva o PDF no Storage ao mesmo tempo (bucket arquivos / contratos-venda)
      if (fazendaId) {
        const path = `contratos-venda/${fazendaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        supabase.storage.from("arquivos").upload(path, file, { upsert: true, contentType: "application/pdf" })
          .then(({ data, error }) => {
            if (!error && data) {
              const { data: pub } = supabase.storage.from("arquivos").getPublicUrl(data.path);
              setFC(prev => ({ ...prev, pdf_url: pub.publicUrl, pdf_nome: file.name }));
            }
          }).catch(() => {/* falha silenciosa — o usuário pode anexar em Adicionais */});
      }

      // ── calcular confiança ─────────────────────────────────────
      const temComprador = !!(e.comprador_cnpj || e.comprador_nome);
      const temVendedor  = !!(e.vendedor_cpf_cnpj || e.vendedor_nome);
      const temPreco     = !!(e.preco_por_saca);
      const temVolume    = !!(e.volume_sacas);
      const score = [temComprador, temVendedor, temPreco, temVolume].filter(Boolean).length;
      setIaVendaConf(score === 4 ? "alta" : score >= 2 ? "media" : "baixa");

      // ── pré-preencher campos ────────────────────────────────────
      // Comprador
      let pessoaId = "";
      const cnpjComprador = String(e.comprador_cnpj ?? "").replace(/\D/g, "");
      if (cnpjComprador.length >= 14) {
        const match = pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === cnpjComprador);
        if (match) pessoaId = match.id;
      }
      if (!pessoaId && e.comprador_nome) {
        const nomeLc = String(e.comprador_nome).toLowerCase();
        const match = pessoas.find(p => p.nome.toLowerCase().includes(nomeLc.slice(0, 10)));
        if (match) pessoaId = match.id;
      }

      // Produtor / Vendedor
      let produtorId = "";
      const cpfCnpjVend = String(e.vendedor_cpf_cnpj ?? "").replace(/\D/g, "");
      if (cpfCnpjVend.length >= 11) {
        const match = produtores.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === cpfCnpjVend);
        if (match) produtorId = match.id;
      }

      // Produto e Safra — faz match contra os produtos cadastrados (ex: "Algodão" → "Algodão em Caroço")
      const produtoNorm = normalizarProdutoIA(e.produto as string | undefined);
      const normStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const listaProd = prodAgricolas.length > 0 ? prodAgricolas.map(p => p.nome)
                      : culturasCont.length  > 0 ? culturasCont.map(c => c.nome)
                      : PRODUTOS;
      const prodNormLC = normStr(produtoNorm);
      const produtoFinal = listaProd.find(p => {
        const pLC = normStr(p);
        return pLC.includes(prodNormLC) || prodNormLC.includes(pLC.split(" ")[0]);
      }) ?? produtoNorm;
      let anoSafraId = "";
      if (e.safra) {
        const safraStr = String(e.safra);
        const match = anosSafra.find(a => a.descricao?.includes(safraStr.slice(0, 4)) || a.descricao === safraStr);
        if (match) anoSafraId = match.id;
      }

      // Preço, volume, datas
      const precoPorSaca = Number(e.preco_por_saca ?? 0);
      const volumeSacas  = Number(e.volume_sacas ?? 0);
      const moedaIA      = (e.moeda === "USD" ? "USD" : "BRL") as "BRL" | "USD";
      const dataEntrega  = String(e.data_entrega_fim ?? e.data_entrega_inicio ?? "");
      const dataPagamento = String(e.data_pagamento ?? "");
      const freteNorm    = normalizarFreteIA(e.frete as string | undefined);
      const nrContrato   = String(e.numero_contrato ?? "");

      // Destino → natureza de operação
      const produtorMtch  = produtores.find(p => p.id === produtorId);
      const tipoPessoa    = tipoProdutorDeCpfCnpj(produtorMtch?.cpf_cnpj);
      const destino       = e.destino as string | undefined;
      let naturezaCod = "";
      let naturezaDesc = "";
      let cfopIA = "";
      if (destino === "exportacao") {
        naturezaCod  = tipoPessoa === "pf" ? "VFE-PF" : "VFE-PJ";
        const natObj = NATUREZAS_OPERACAO.find(n => n.codigo === naturezaCod);
        naturezaDesc = natObj?.descricao ?? "";
        cfopIA       = natObj?.cfop ?? "6501";
      }

      // Aplica tudo no formulário
      setFC(prev => ({
        ...prev,
        ...(pessoaId                && { pessoa_id: pessoaId }),
        ...(produtorId              && { produtor_id: produtorId }),
        ...(anoSafraId              && { ano_safra_id: anoSafraId, safra: anosSafra.find(a=>a.id===anoSafraId)?.descricao ?? prev.safra }),
        ...(moedaIA                 && { moeda: moedaIA }),
        ...(precoPorSaca > 0        && { preco: precoPorSaca }),
        ...(volumeSacas > 0         && { quantidade_sc: volumeSacas }),
        ...(dataEntrega             && { data_entrega: dataEntrega }),
        ...(dataPagamento           && { data_pagamento: dataPagamento }),
        ...(nrContrato              && { nr_contrato_cliente: nrContrato }),
        ...(freteNorm               && { frete: freteNorm as Contrato["frete"] }),
        ...(naturezaCod             && { natureza_codigo: naturezaCod, natureza_operacao: naturezaDesc, cfop: cfopIA }),
      }));
      // Atualiza item principal
      setItens(prev => prev.map((it, idx) => idx === 0
        ? { ...it,
            produto: produtoFinal,
            moeda: moedaIA,
            ...(precoPorSaca > 0 && { valor_unitario: precoPorSaca }),
            ...(volumeSacas > 0  && { quantidade: volumeSacas * 60 }),
          }
        : it
      ));
    } catch (err) {
      setIaVendaErro(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setIaVendaExtraindo(false);
    }
  }

  // ── upload de PDF do contrato (Adicionais) ──────────────────────────────────
  const [anexandoPdf, setAnexandoPdf] = useState(false);

  async function handleAnexarPdf(file: File) {
    if (!file) return;
    setAnexandoPdf(true);
    try {
      const fd2 = new FormData();
      fd2.append("file",          file);
      fd2.append("entidade_tipo", "contrato_venda_pdf");
      fd2.append("entidade_id",   editContrato?.id ?? `novo_${Date.now()}`);
      fd2.append("fazenda_id",    fazendaId ?? "");
      const resp = await fetch("/api/storage/upload", { method: "POST", body: fd2 });
      const rj   = await resp.json();
      if (!resp.ok) throw new Error(rj.erro ?? "Erro no upload");
      // Obtém URL pública a partir do path retornado
      const { data: pub } = supabase.storage.from("arquivos").getPublicUrl(rj.path);
      const pdfUrl  = pub.publicUrl;
      const pdfNome = file.name;
      setFC(prev => ({ ...prev, pdf_url: pdfUrl, pdf_nome: pdfNome }));
      // Auto-salva no banco para contrato já existente — evita perda ao fechar sem clicar Salvar
      if (editContrato) {
        await atualizarContrato(editContrato.id, { pdf_url: pdfUrl, pdf_nome: pdfNome });
        setContratos(prev => prev.map(c => c.id === editContrato.id ? { ...c, pdf_url: pdfUrl, pdf_nome: pdfNome } : c));
      }
    } catch (e) {
      alert("Erro ao fazer upload: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAnexandoPdf(false);
    }
  }

  // ── modal romaneio ───────────────────────────────────────────
  const [modalRomaneio, setModalRomaneio] = useState(false);
  const [editRomaneio, setEditRomaneio] = useState<Romaneio | null>(null);
  const ROM_VAZIO = () => ({
    contratoId:"", placa:"", pesoBruto:"", tara:"",
    // Peso estimado — CIF: caminhão do comprador pesa no destino
    pesoEstimado: false, pesoEstimadoKg: "",
    umidade:"", impureza:"", ph:"",
    ardidos:"", mofados:"", fermentados:"", germinados:"",
    esverdeados:"", quebrados:"", carunchados:"", outros_avariados:"",
    peso_destino:"", sacas_faturadas:"", obs_divergencia:"",
    // adiantamento
    aplicarAdiant: false,
    adiantValor: "",
  });
  const [fRom, setFRom] = useState(ROM_VAZIO());

  // ── adiantamentos de cliente ─────────────────────────────────
  const [adiantamentos, setAdiantamentos] = useState<Record<string, AdiantamentoCliente[]>>({});
  const [modalAdiant, setModalAdiant]     = useState(false);
  const [adiantContratoId, setAdiantContratoId] = useState("");
  const [fAdiant, setFAdiant] = useState({ data: TODAY, valor: "", descricao: "" });
  const [salvandoAdiant, setSalvandoAdiant] = useState(false);

  // ── ciclos: carrega quando safra muda (formulário) ───────────
  useEffect(() => {
    if (!fC.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(fC.ano_safra_id, fazendaId).then(setCiclos).catch(() => setCiclos([]));
  }, [fC.ano_safra_id, fazendaId]);

  // ── ciclos: carrega quando filtro de ano muda ────────────────
  useEffect(() => {
    if (!filtroAno) { setCiclosFiltro([]); setFiltroCiclo(""); return; }
    listarCiclos(filtroAno, fazendaId).then(setCiclosFiltro).catch(() => setCiclosFiltro([]));
  }, [filtroAno, fazendaId]);

  // ── carga ────────────────────────────────────────────────────
  useEffect(() => { if (fazendaId) carregarTudo(); }, [fazendaId, contaId]);

  async function carregarTudo() {
    try {
      setLoading(true); setErro(null);
      const hintIds = fazendaIds && fazendaIds.length > 0 ? fazendaIds : (fazendaId ? [fazendaId] : []);
      const [cList, rList, pList, prodList, aList, dList, fList, cultRes, prodAgriRes, adiantRes] = await Promise.all([
        listarContratosDaConta(contaId, fazendaId, hintIds),
        listarRomaneios(fazendaId!),
        listarPessoasDaConta(fazendaId!),
        listarProdutoresDaConta(contaId ?? "", fazendaId ?? undefined),
        listarAnosSafra(fazendaId!),
        listarDepositos(fazendaId!),
        listarFazendas(fazendaId ?? undefined),
        supabase.from("culturas").select("*").eq("fazenda_id", fazendaId!).eq("ativa", true).order("ordem").order("nome"),
        supabase.from("insumos").select("*").eq("fazenda_id", fazendaId!).eq("categoria", "produto_agricola").order("nome"),
        supabase.from("adiantamentos_cliente").select("*").eq("fazenda_id", fazendaId!).order("data"),
      ]);
      const rMap: Record<string,Romaneio[]> = {};
      for (const r of rList) rMap[r.contrato_id] = [...(rMap[r.contrato_id]??[]), r];
      const vms: ContratoVM[] = cList.map(c => ({ ...c, romaneios: rMap[c.id]??[], itens:[] }));
      setContratos(vms);
      setPessoas(pList);
      setProdutores(prodList);
      setAnosSafra(aList);
      setDepositos(dList);
      setFazendas(fList);
      if (cultRes.data && cultRes.data.length > 0) setCulturasCont(cultRes.data as CulturaContrato[]);
      if (prodAgriRes.data && prodAgriRes.data.length > 0) setProdAgricolas(prodAgriRes.data as Insumo[]);
      const adiantMap: Record<string, AdiantamentoCliente[]> = {};
      for (const a of (adiantRes.data ?? [])) {
        adiantMap[a.contrato_id] = [...(adiantMap[a.contrato_id] ?? []), a as AdiantamentoCliente];
      }
      setAdiantamentos(adiantMap);
    } catch(e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
    finally { setLoading(false); }
  }

  // ── helper: saldo de adiantamento disponível de um contrato ──
  const adiantSaldo = (contratoId: string) => {
    const adts = adiantamentos[contratoId] ?? [];
    return adts.reduce((s, a) => s + a.valor - a.valor_aplicado, 0);
  };

  const toggleExpand = (id: string) =>
    setExpandido(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // ── abrir modal ───────────────────────────────────────────────
  const abrirNovo = () => {
    setEditContrato(null);
    setViewOnly(false);
    const vazio = fContratoVazio();
    if (anosSafra[0]) vazio.safra = anosSafra[0].descricao;
    setFC(vazio);
    setItens([itemVazio()]);
    setNaturezaSugerida(""); // sugestão será calculada pelo useEffect ao abrir
    setAbaForm("principal");
    setModalContrato(true);
  };

  const abrirEditar = async (c: ContratoVM, modoEdicao = false) => {
    setViewOnly(!modoEdicao);
    setEditContrato(c);
    setFC({
      fazenda_id: c.fazenda_id ?? "",
      safra: c.safra ?? "", tipo: c.tipo ?? "venda",
      autorizacao: c.autorizacao ?? "autorizada",
      confirmado: c.confirmado ?? false,
      a_fixar: c.a_fixar ?? false,
      venda_a_ordem: c.venda_a_ordem ?? false,
      data_contrato: c.data_contrato ?? "", pessoa_id: c.pessoa_id ?? "",
      produtor_id: c.produtor_id ?? "",
      ie_id: c.ie_id ?? "",
      nr_contrato_cliente: c.nr_contrato_cliente ?? "",
      contato_broker: c.contato_broker ?? "",
      grupo_vendedor: c.grupo_vendedor ?? "",
      vendedor: c.vendedor ?? "",
      produto: c.produto, modalidade: c.modalidade,
      moeda: c.moeda, preco: c.preco, quantidade_sc: c.quantidade_sc,
      data_entrega: c.data_entrega,
      data_pagamento: c.data_pagamento ?? undefined,
      saldo_tipo: c.saldo_tipo ?? "peso_saida",
      frete: c.frete ?? "destinatario",
      valor_frete: c.valor_frete ?? 0,
      natureza_operacao: c.natureza_operacao ?? "",
      natureza_codigo: "",  // será mantido só no estado, não vem do banco
      cfop: c.cfop ?? "",
      propriedade: c.propriedade ?? "",
      ano_safra_id: c.ano_safra_id ?? "",
      ciclo_id: c.ciclo_id ?? "",
      seguradora: c.seguradora ?? "",
      corretora: c.corretora ?? "",
      cte_numero: c.cte_numero ?? "",
      terceiro: c.terceiro ?? "",
      deposito_carregamento: c.deposito_carregamento ?? "",
      deposito_fiscal: c.deposito_fiscal ?? false,
      observacao_interna: c.observacao_interna ?? "",
      observacao: c.observacao ?? "",
      // cessão — converte legado (campo único) para o novo formato (lista)
      dado_em_cessao: c.dado_em_cessao ?? false,
      cessao_beneficiarios: (() => {
        if (Array.isArray(c.cessao_beneficiarios) && c.cessao_beneficiarios.length > 0) {
          return (c.cessao_beneficiarios as Array<{fornecedor_id:string;fornecedor_nome:string;data?:string;obs?:string}>).map((b, i) => ({
            key: `k${i}${b.fornecedor_id}`, fornecedor_id: b.fornecedor_id, fornecedor_nome: b.fornecedor_nome, data: b.data ?? "", obs: b.obs ?? ""
          })) as CessaoBenef[];
        }
        if (c.cessao_fornecedor_id) {
          return [{ key: "k0", fornecedor_id: c.cessao_fornecedor_id, fornecedor_nome: c.cessao_fornecedor_nome ?? "", data: c.cessao_data ?? "", obs: c.cessao_obs ?? "" }] as CessaoBenef[];
        }
        return [] as CessaoBenef[];
      })(),
      pdf_url: c.pdf_url ?? undefined,
      pdf_nome: c.pdf_nome ?? undefined,
      // triangulação
      is_triangulacao: c.is_triangulacao ?? false,
      comprador_final_id: c.comprador_final_id ?? "",
      // local de entrega
      local_entrega_pessoa_id: c.local_entrega_pessoa_id ?? "",
      local_entrega_nome: c.local_entrega_nome ?? "",
      local_entrega_cnpj: c.local_entrega_cnpj ?? "",
      local_entrega_logradouro: c.local_entrega_logradouro ?? "",
      local_entrega_municipio: c.local_entrega_municipio ?? "",
      local_entrega_uf: c.local_entrega_uf ?? "",
      local_entrega_cep: c.local_entrega_cep ?? "",
    });
    try {
      const its = await listarItensContrato(c.id);
      setItens(its.length > 0 ? its.map(i => ({ tipo:i.tipo, produto:i.produto, unidade:i.unidade, quantidade:i.quantidade, valor_unitario:i.valor_unitario, valor_total:i.valor_total, moeda:i.moeda, classificacao:i.classificacao })) : [itemVazio()]);
    } catch { setItens([itemVazio()]); }
    // carrega débitos vinculados
    try {
      const debs = await listarCessaoDebitos(c.id);
      const sel: Record<string, {valor:number; fornId:string}> = {};
      for (const d of debs) sel[d.lancamento_id] = { valor: d.valor_cessao, fornId: (d as Record<string,unknown>).fornecedor_id as string ?? "" };
      setCessaoSelecionados(sel);
    } catch { setCessaoSelecionados({}); }
    // contrato existente: natureza já salva — marca como "manual" para o useEffect não sobrescrever
    setNaturezaSugerida("__manual__");
    setAbaForm("principal");
    setModalContrato(true);
  };

  // Mapeamento subgrupo do produto agrícola → chave em CLASSE_COMMODITY
  const SUBGRUPO_CLASSE: Record<string, string> = {
    soja: "Soja", milho: "Milho 1ª", milho_pipoca: "Milho 1ª",
    algodao: "Algodão", algodão: "Algodão",
    sorgo: "Sorgo", trigo: "Trigo", feijao: "Feijão", feijão: "Feijão",
  };

  // ── listas dinâmicas — prioridade: produtos agrícolas > culturas > hardcoded ──
  const PRODUTOS_DIN: string[] =
    prodAgricolas.length > 0 ? prodAgricolas.map(p => p.nome) :
    culturasCont.length  > 0 ? culturasCont.map(c => c.nome)  :
    PRODUTOS;
  const COMMODITIES_VFE_DIN: string[] = culturasCont.length > 0
    ? culturasCont.filter(c => c.categoria === "graos").map(c => c.nome)
    : COMMODITIES_VFE;
  const classeCommodityDin = (produto: string): CommodityClass => {
    // Tenta match direto no CLASSE_COMMODITY
    if (CLASSE_COMMODITY[produto]) {
      const cult = culturasCont.find(c => c.nome === produto);
      return { ...CLASSE_COMMODITY[produto], kg_saca: cult?.fator_conversao_kg ?? CLASSE_COMMODITY[produto].kg_saca };
    }
    // Tenta via produto agrícola → subgrupo → CLASSE_COMMODITY
    const prodAgr = prodAgricolas.find(p => p.nome === produto);
    if (prodAgr?.subgrupo) {
      const classeKey = SUBGRUPO_CLASSE[prodAgr.subgrupo] ?? null;
      const base = classeKey ? CLASSE_COMMODITY[classeKey] : null;
      if (base) return { ...base, kg_saca: prodAgr.unidade === "sc" ? 60 : base.kg_saca };
    }
    // Tenta via culturasCont
    const cult = culturasCont.find(c => c.nome === produto);
    const base: CommodityClass = CLASSE_COMMODITY[produto] ?? { umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, kg_saca: 60 };
    return { ...base, kg_saca: cult?.fator_conversao_kg ?? base.kg_saca };
  };

  // ── calcular totais dos itens ─────────────────────────────────
  // _qKg = kg, _qSc = sc — ambos derivados conforme unidade do item
  type ItemCalc = typeof itens[0] & { _qKg: number; _qSc: number; valor_total: number };
  const itensCalc: ItemCalc[] = itens.map(i => {
    const kgSaca = classeCommodityDin(i.produto).kg_saca;
    const _qKg = i.unidade === "kg" ? (i.quantidade||0) : (i.quantidade||0) * kgSaca;
    const _qSc = i.unidade === "kg" ? (i.quantidade||0) / kgSaca : (i.quantidade||0);
    return { ...i, _qKg, _qSc, valor_total: _qSc * (i.valor_unitario||0) };
  });
  const valorFinanceiro = itensCalc.reduce((a,i) => a + (i.valor_total??0), 0);
  const valorTotal = valorFinanceiro + (fC.valor_frete||0);

  const atualizarItem = (idx: number, campo: string, valor: string|number) => {
    setItens(prev => prev.map((it,i) => {
      if (i !== idx) return it;
      const num = (v: string|number) => typeof v === "string" ? parseFloat(v)||0 : v;
      if (campo === "quantidade_kg") {
        // usuário digitou em kg — armazena kg, unidade = "kg"
        return { ...it, quantidade: num(valor), unidade: "kg" as const };
      }
      if (campo === "quantidade_sc") {
        // usuário digitou em sc → converte para kg antes de salvar
        return { ...it, quantidade: num(valor) * classeCommodityDin(it.produto).kg_saca, unidade: "kg" as const };
      }
      if (campo === "produto") {
        // ao trocar produto, mantém unidade atual (já é kg para novos itens)
        return { ...it, produto: valor as string };
      }
      return { ...it, [campo]: ["quantidade","valor_unitario"].includes(campo) ? num(valor) : valor };
    }));
  };

  // ── salvar contrato ───────────────────────────────────────────
  const salvarContrato = async () => {
    // Coleta todos os erros antes de mostrar — nunca um alert pontual
    const erros: string[] = [];
    if (!fC.data_entrega) erros.push("Prazo de Entrega");
    if (itens.every(i => !i.produto || i.quantidade <= 0)) erros.push("pelo menos um Item com produto e quantidade");
    if (iesProdutor.length > 1 && !fC.ie_id) erros.push("Inscrição Estadual (IE) do Produtor");
    if (erros.length > 0) {
      setErrosContrato(erros);
      return;
    }
    setErrosContrato([]);
    // Bloqueia criação de contrato em safra encerrada
    if (!editContrato) {
      const safraEnc = anosSafra.find(a => a.id === fC.ano_safra_id && a.status === "encerrada");
      if (safraEnc) return alert(`A safra "${safraEnc.descricao}" está encerrada e não aceita novos contratos.\n\nPara permitir novos lançamentos, reabra a safra em Cadastros > Safras.`);
    }
    setSalvando(true);
    try {
      // produto/quantidade principal = primeiro item
      const primeiroItem = itensCalc[0];
      const fidContrato = fC.fazenda_id || fazendaId!;
      const payload: Omit<Contrato,"id"|"created_at"|"entregue_sc"> = {
        fazenda_id: fidContrato,
        numero: editContrato?.numero ?? `CTR-${new Date().getFullYear()}/${String(contratos.length+1).padStart(3,"0")}`,
        safra: fC.safra,
        tipo: fC.tipo,
        autorizacao: fC.autorizacao,
        confirmado: fC.confirmado,
        a_fixar: fC.a_fixar,
        venda_a_ordem: fC.venda_a_ordem,
        data_contrato: fC.data_contrato,
        data_entrega: fC.data_entrega,
        data_pagamento: fC.data_pagamento || undefined,
        pessoa_id: fC.pessoa_id || undefined,
        produtor_id: fC.produtor_id || undefined,
        ie_id: fC.ie_id || undefined,
        comprador: pessoas.find(p=>p.id===fC.pessoa_id)?.nome ?? fC.pessoa_id ?? "",
        nr_contrato_cliente: fC.nr_contrato_cliente || undefined,
        contato_broker: fC.contato_broker || undefined,
        grupo_vendedor: fC.grupo_vendedor || undefined,
        vendedor: fC.vendedor || undefined,
        produto: primeiroItem?.produto ?? fC.produto,
        produto_agricola_id: prodAgricolas.find(p => p.nome === (primeiroItem?.produto ?? fC.produto))?.id ?? undefined,
        modalidade: fC.modalidade,
        moeda: fC.moeda,
        preco: primeiroItem?.valor_unitario ?? fC.preco,
        quantidade_sc: primeiroItem?._qSc ?? fC.quantidade_sc,
        saldo_tipo: fC.saldo_tipo,
        frete: fC.frete,
        valor_frete: fC.valor_frete || undefined,
        natureza_operacao: fC.natureza_operacao || undefined,
        cfop: fC.cfop || undefined,
        propriedade: fC.propriedade || undefined,
        ano_safra_id: fC.ano_safra_id || undefined,
        ciclo_id: fC.ciclo_id || undefined,
        seguradora: fC.seguradora || undefined,
        corretora: fC.corretora || undefined,
        cte_numero: fC.cte_numero || undefined,
        terceiro: fC.terceiro || undefined,
        deposito_carregamento: fC.deposito_carregamento || undefined,
        deposito_fiscal: fC.deposito_fiscal,
        observacao_interna: fC.observacao_interna || undefined,
        observacao: fC.observacao || undefined,
        status: editContrato?.status ?? "aberto",
        // PDF do contrato físico
        ...(fC.pdf_url ? { pdf_url: fC.pdf_url, pdf_nome: fC.pdf_nome } : {}),
        // cessão — múltiplos beneficiários (Migration 213)
        dado_em_cessao: fC.dado_em_cessao && fC.cessao_beneficiarios.length > 0,
        ...(fC.dado_em_cessao && fC.cessao_beneficiarios.length > 0 ? {
          cessao_beneficiarios: fC.cessao_beneficiarios.map(b => ({ fornecedor_id: b.fornecedor_id, fornecedor_nome: b.fornecedor_nome, data: b.data || undefined, obs: b.obs || undefined })),
          // mantém campo legado com o primeiro beneficiário para compatibilidade
          cessao_fornecedor_id: fC.cessao_beneficiarios[0]?.fornecedor_id || undefined,
          cessao_fornecedor_nome: fC.cessao_beneficiarios[0]?.fornecedor_nome || undefined,
          cessao_data: fC.cessao_beneficiarios[0]?.data || undefined,
          cessao_obs: fC.cessao_beneficiarios[0]?.obs || undefined,
        } : { cessao_beneficiarios: [] }),
        // triangulação cooperativa
        ...(fC.is_triangulacao ? {
          is_triangulacao: true,
          comprador_final_id: fC.comprador_final_id || undefined,
          comprador_final_nome: pessoas.find(p=>p.id===fC.comprador_final_id)?.nome || undefined,
        } : { is_triangulacao: false, comprador_final_id: undefined, comprador_final_nome: undefined }),
        // local de entrega — só inclui se diferente do comprador
        ...(fC.local_entrega_nome ? {
          local_entrega_pessoa_id: fC.local_entrega_pessoa_id || undefined,
          local_entrega_nome: fC.local_entrega_nome,
          local_entrega_cnpj: fC.local_entrega_cnpj || undefined,
          local_entrega_logradouro: fC.local_entrega_logradouro || undefined,
          local_entrega_municipio: fC.local_entrega_municipio || undefined,
          local_entrega_uf: fC.local_entrega_uf || undefined,
          local_entrega_cep: fC.local_entrega_cep || undefined,
        } : {
          local_entrega_pessoa_id: undefined,
          local_entrega_nome: undefined,
          local_entrega_cnpj: undefined,
          local_entrega_logradouro: undefined,
          local_entrega_municipio: undefined,
          local_entrega_uf: undefined,
          local_entrega_cep: undefined,
        }),
      };
      let salvo: Contrato;
      if (editContrato) {
        await atualizarContrato(editContrato.id, payload);
        salvo = { ...editContrato, ...payload, entregue_sc: editContrato.entregue_sc };
      } else {
        salvo = await criarContrato({ ...payload, entregue_sc: 0 });
      }
      await salvarItensContrato(salvo.id, fidContrato, itensCalc.filter(i=>i._qKg>0).map(i=>({
        tipo: i.tipo, produto: i.produto, unidade: "kg",
        quantidade: i._qKg, valor_unitario: i.valor_unitario,
        valor_total: i.valor_total, moeda: fC.moeda, classificacao: i.classificacao,
        contrato_id: salvo.id, fazenda_id: fidContrato,
      })));
      // salva débitos de cessão se houver
      if (fC.dado_em_cessao && Object.keys(cessaoSelecionados).length > 0) {
        await salvarCessaoDebitos(salvo.id, fidContrato, Object.entries(cessaoSelecionados).map(([lancamento_id, { valor, fornId }]) => ({ lancamento_id, valor_cessao: valor, fornecedor_id: fornId || undefined })));
      }
      // num_lancamento + CR via API route (service_role_key bypassa RLS / JWT expirado)
      // valorTotal: preferência itensCalc; fallback para preco×quantidade_sc do cabeçalho
      const valorItens = itensCalc.reduce((s, i) => s + i.valor_total, 0);
      const qScHeader  = itensCalc[0]?._qSc ?? fC.quantidade_sc ?? 0;
      const valorTotal = valorItens > 0 ? valorItens : (fC.preco > 0 ? fC.preco * qScHeader : 0);
      if (fC.confirmado) {
        const compradorNome = pessoas.find(p=>p.id===fC.pessoa_id)?.nome ?? payload.comprador ?? "";
        const resp = await fetch("/api/contratos/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrato_id: salvo.id,
            fazenda_id: fazendaId,
            valor_total: valorTotal,
            moeda: fC.moeda,
            pessoa_id: fC.pessoa_id || undefined,
            comprador: compradorNome,
            numero: salvo.numero,
            ciclo_id: fC.ciclo_id || undefined,
            ano_safra_id: fC.ano_safra_id || undefined,
            data_pagamento: fC.data_pagamento || undefined,
            data_entrega: fC.data_entrega || undefined,
            lancamento_cr_id: salvo.lancamento_cr_id || undefined,
          }),
        });
        const json = await resp.json();
        if (json.num_lancamento) salvo = { ...salvo, num_lancamento: json.num_lancamento };
        if (json.lancamento_cr_id) salvo = { ...salvo, lancamento_cr_id: json.lancamento_cr_id };
        if (json.error) alert(`⚠️ CR não gerado: ${json.error}\n\nO contrato foi salvo. Verifique o erro e salve novamente para criar o CR.`);
      }
      if (editContrato) {
        setContratos(prev => prev.map(c => c.id === salvo.id ? { ...c, ...salvo, itens: itensCalc.filter(i=>i._qKg>0) as unknown as ContratoItem[] } : c));
      } else {
        setContratos(prev => [...prev, { ...salvo, romaneios:[], itens:[] }]);
      }
      setModalContrato(false);
    } catch(e: unknown) { alert("Erro ao salvar: " + sbErr(e)); }
    finally { setSalvando(false); }
  };

  // ── cessão: abre modal de débitos para um beneficiário específico ────────────
  const abrirModalCessao = async (fornId: string) => {
    if (!fornId || !fazendaId) return;
    setCessaoBenefAtivo(fornId);
    try {
      const { data } = await supabase
        .from("lancamentos")
        .select("id, descricao, data_vencimento, valor, status, pedido_compra_id, pedidos_compra(numero, nr_pedido)")
        .in("fazenda_id", fazendaIds)
        .eq("tipo", "pagar")
        .eq("pessoa_id", fornId)
        .in("status", ["em_aberto", "parcial"])
        .order("data_vencimento", { ascending: true });
      const lancs: LancItem[] = (data ?? []).map((r: Record<string, unknown>) => {
        const pc = r.pedidos_compra as Record<string, unknown> | null;
        return {
          id: r.id as string, descricao: r.descricao as string ?? "",
          data_vencimento: r.data_vencimento as string ?? "",
          valor: Number(r.valor ?? 0), status: r.status as string ?? "",
          pedido_compra_id: r.pedido_compra_id as string ?? undefined,
          pc_numero: pc ? String(pc.numero ?? pc.nr_pedido ?? "") : undefined,
        };
      });
      setCessaoLancs(lancs);
    } catch {
      setCessaoLancs([]);
    }
    setModalCessao(true);
  };

  // ── romaneio — cálculos em tempo real ─────────────────────────
  const contratoSel   = contratos.find(c => c.id === fRom.contratoId);
  const produto_rom   = contratoSel?.produto ?? "Soja";
  const clsComm       = classeCommodityDin(produto_rom);
  const isSoja        = produto_rom.toLowerCase().startsWith("soja");
  const isMilho       = produto_rom.toLowerCase().startsWith("milho");

  const plCalc        = fRom.pesoEstimado
    ? (Number(fRom.pesoEstimadoKg) || 0)
    : (fRom.pesoBruto && fRom.tara ? Number(fRom.pesoBruto) - Number(fRom.tara) : 0);
  const romUmidade    = parseFloat(fRom.umidade)   || 0;
  const romImpureza   = parseFloat(fRom.impureza)  || 0;

  // Avariados totais = soma dos sub-parâmetros (se algum preenchido); senão campo livre
  const pArd  = parseFloat(fRom.ardidos)          || 0;
  const pMof  = parseFloat(fRom.mofados)          || 0;
  const pFer  = parseFloat(fRom.fermentados)      || 0;
  const pGer  = parseFloat(fRom.germinados)       || 0;
  const pEsv  = parseFloat(fRom.esverdeados)      || 0;
  const pQue  = parseFloat(fRom.quebrados)        || 0;
  const pCar  = parseFloat(fRom.carunchados)      || 0;
  const pOut  = parseFloat(fRom.outros_avariados) || 0;
  const romAvariados  = +(pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut).toFixed(2);

  const descUmid  = plCalc > 0 ? calcDescUmidade (plCalc, romUmidade,  clsComm.umidade_padrao)  : 0;
  const descImpur = plCalc > 0 ? calcDescImpureza(plCalc, romImpureza, clsComm.impureza_padrao) : 0;
  const descAvar  = plCalc > 0 ? calcDescAvariados(plCalc, romAvariados, clsComm.avariados_padrao) : 0;
  const pesoClass = plCalc > 0 ? Math.max(0, +(plCalc - descUmid - descImpur - descAvar).toFixed(2)) : 0;
  const sacasCalc = pesoClass > 0 ? +(pesoClass / clsComm.kg_saca).toFixed(3) : 0;
  const temClassif = romUmidade > 0 || romImpureza > 0 || romAvariados > 0;

  // Peso recebido pelo comprador
  const pesoDest   = parseFloat(fRom.peso_destino)    || 0;
  const sacasFat   = parseFloat(fRom.sacas_faturadas) || 0;
  const difKg      = pesoDest > 0 && pesoClass > 0 ? +(pesoClass - pesoDest).toFixed(2) : 0;
  const difPct     = pesoClass > 0 && difKg !== 0 ? +(difKg / pesoClass * 100).toFixed(3) : 0;

  const gerarRomaneio = async () => {
    if (!contratoSel || !fRom.placa || plCalc <= 0) return;
    if (!fRom.pesoEstimado && (!fRom.pesoBruto || !fRom.tara)) { alert("Informe Peso Bruto e Tara."); return; }
    setSalvando(true);
    try {
      // ── EDIÇÃO de romaneio existente ──────────────────────────
      if (editRomaneio) {
        await atualizarRomaneio(editRomaneio.id, {
          placa:                 fRom.placa.toUpperCase(),
          peso_bruto_kg:         fRom.pesoEstimado ? plCalc : Number(fRom.pesoBruto),
          tara_kg:               fRom.pesoEstimado ? 0 : Number(fRom.tara),
          is_peso_estimado:      fRom.pesoEstimado || undefined,
          umidade_pct:           romUmidade   || undefined,
          umidade_padrao_pct:    temClassif ? clsComm.umidade_padrao  : undefined,
          desconto_umidade_kg:   descUmid     || undefined,
          impureza_pct:          romImpureza  || undefined,
          impureza_padrao_pct:   temClassif ? clsComm.impureza_padrao : undefined,
          desconto_impureza_kg:  descImpur    || undefined,
          avariados_pct:         romAvariados || undefined,
          avariados_padrao_pct:  temClassif ? clsComm.avariados_padrao : undefined,
          desconto_avariados_kg: descAvar     || undefined,
          peso_classificado_kg:  temClassif ? pesoClass : plCalc,
          data:                  editRomaneio.data,
          ph_hl:               parseFloat(fRom.ph)               || undefined,
          ardidos_pct:         pArd  || undefined,
          mofados_pct:         pMof  || undefined,
          fermentados_pct:     pFer  || undefined,
          germinados_pct:      pGer  || undefined,
          esverdeados_pct:     pEsv  || undefined,
          quebrados_pct:       pQue  || undefined,
          carunchados_pct:     pCar  || undefined,
          outros_avariados_pct: pOut || undefined,
          peso_liquido_destino: pesoDest  || undefined,
          sacas_faturadas:      parseFloat(fRom.sacas_faturadas) || undefined,
          diferenca_kg:         pesoDest > 0 && pesoClass > 0 ? difKg : undefined,
          obs_divergencia:      fRom.obs_divergencia || undefined,
        });
        const [{ data: cAtual }, { data: romAtual }] = await Promise.all([
          supabase.from("contratos").select("entregue_sc, status").eq("id", contratoSel.id).single(),
          supabase.from("romaneios").select("*").eq("id", editRomaneio.id).single(),
        ]);
        setContratos(prev => prev.map(c => {
          if (c.id !== contratoSel.id) return c;
          return {
            ...c,
            entregue_sc: cAtual?.entregue_sc ?? c.entregue_sc,
            status: cAtual?.status ?? c.status,
            romaneios: c.romaneios.map(r => r.id === editRomaneio.id ? (romAtual ?? r) : r),
          };
        }));
        setEditRomaneio(null);
        setFRom(ROM_VAZIO());
        setModalRomaneio(false);
        return;
      }
      // ── CRIAÇÃO de romaneio novo ───────────────────────────────
      const todosRomaneios = contratos.flatMap(c => c.romaneios);
      const criado = await criarRomaneio({
        contrato_id:           contratoSel.id,
        fazenda_id:            fazendaId!,
        numero:                `ROM-${String(todosRomaneios.length+1).padStart(4,"0")}`,
        placa:                 fRom.placa.toUpperCase(),
        peso_bruto_kg:         fRom.pesoEstimado ? plCalc : Number(fRom.pesoBruto),
        tara_kg:               fRom.pesoEstimado ? 0 : Number(fRom.tara),
        is_peso_estimado:      fRom.pesoEstimado || undefined,
        // peso_liquido_kg é GENERATED ALWAYS no banco (peso_bruto - tara)
        // classificação — comuns
        umidade_pct:           romUmidade   || undefined,
        umidade_padrao_pct:    temClassif ? clsComm.umidade_padrao  : undefined,
        desconto_umidade_kg:   descUmid     || undefined,
        impureza_pct:          romImpureza  || undefined,
        impureza_padrao_pct:   temClassif ? clsComm.impureza_padrao : undefined,
        desconto_impureza_kg:  descImpur    || undefined,
        avariados_pct:         romAvariados || undefined,
        avariados_padrao_pct:  temClassif ? clsComm.avariados_padrao : undefined,
        desconto_avariados_kg: descAvar     || undefined,
        peso_classificado_kg:  temClassif ? pesoClass : plCalc,
        // sacas é GENERATED ALWAYS no banco (peso_classificado_kg / kg_saca)
        data:                  TODAY,
        // classificação — detalhada
        ph_hl:               parseFloat(fRom.ph)               || undefined,
        ardidos_pct:         pArd  || undefined,
        mofados_pct:         pMof  || undefined,
        fermentados_pct:     pFer  || undefined,
        germinados_pct:      pGer  || undefined,
        esverdeados_pct:     pEsv  || undefined,
        quebrados_pct:       pQue  || undefined,
        carunchados_pct:     pCar  || undefined,
        outros_avariados_pct: pOut || undefined,
        // peso recebido
        peso_liquido_destino: pesoDest  || undefined,
        sacas_faturadas:      parseFloat(fRom.sacas_faturadas) || undefined,
        diferenca_kg:         pesoDest > 0 && pesoClass > 0 ? difKg : undefined,
        obs_divergencia:      fRom.obs_divergencia || undefined,
      });
      // Busca saldo real do banco após o trigger atualizar entregue_sc e status
      const { data: cAtual } = await supabase
        .from("contratos")
        .select("entregue_sc, status, lancamento_cr_id, quantidade_sc, preco, moeda, pessoa_id, numero, ciclo_id, ano_safra_id")
        .eq("id", contratoSel.id)
        .single();
      setContratos(prev => prev.map(c => {
        if (c.id !== contratoSel.id) return c;
        const novoEnt = cAtual?.entregue_sc ?? ((c.entregue_sc ?? 0) + sacasCalc);
        const novoSt  = cAtual?.status ?? (novoEnt >= (c.quantidade_sc ?? 0) ? "encerrado" : "parcial");
        return { ...c, entregue_sc: novoEnt, status: novoSt, romaneios: [...c.romaneios, criado] };
      }));
      // ── CR de entrega (romaneio faturado) ────────────────────
      // Cria CR "em_aberto" pelo valor desta entrega e reduz o CR "previsto" do contrato
      if (!fRom.aplicarAdiant) {
        const precoSel  = contratoSel.preco ?? cAtual?.preco ?? 0;
        const moedaSel  = contratoSel.moeda ?? cAtual?.moeda ?? "BRL";
        const scsFat    = sacasFat > 0 ? sacasFat : sacasCalc;
        const valorEnt  = +(scsFat * precoSel).toFixed(2);
        if (valorEnt > 0 && fazendaId) {
          const compradorNome = pessoas.find(p=>p.id===(contratoSel.pessoa_id ?? cAtual?.pessoa_id))?.nome
            ?? contratoSel.comprador.split(" ").slice(0,3).join(" ");
          // 1. CR real para esta entrega
          await supabase.from("lancamentos").insert({
            fazenda_id: fazendaId,
            tipo: "receber",
            descricao: `Receita Grãos — ${compradorNome} (${criado.numero})`,
            categoria: "Receita Grãos",
            data_lancamento: TODAY,
            data_vencimento: contratoSel.data_pagamento ?? TODAY,
            valor: valorEnt,
            moeda: moedaSel,
            status: "em_aberto",
            safra_id: cAtual?.ciclo_id ?? contratoSel.ciclo_id ?? null,
            ano_safra_id: cAtual?.ano_safra_id ?? contratoSel.ano_safra_id ?? null,
            contrato_id: contratoSel.id,
            romaneio_id: criado.id,
            pessoa_id: contratoSel.pessoa_id ?? null,
            observacao: `Faturamento de romaneio ${criado.numero} · ${scsFat.toFixed(3)} sc`,
            auto: true,
          });
          // 2. Reduz o CR "previsto" do contrato pelo mesmo valor
          const crPrevId = contratoSel.lancamento_cr_id ?? cAtual?.lancamento_cr_id;
          if (crPrevId) {
            const { data: crPrev } = await supabase
              .from("lancamentos")
              .select("valor, status")
              .eq("id", crPrevId)
              .maybeSingle();
            if (crPrev && crPrev.status === "previsto") {
              const novoValor = Math.max(0, +(crPrev.valor - valorEnt).toFixed(2));
              await supabase.from("lancamentos")
                .update({ valor: novoValor, status: novoValor <= 0 ? "cancelado" : "previsto" })
                .eq("id", crPrevId);
            }
          }
        }
      }
      // ── aplicar adiantamento se selecionado ──────────────────
      if (fRom.aplicarAdiant && fRom.adiantValor) {
        const valorEntrega  = sacasCalc * (contratoSel.preco ?? 0);
        const saldoDisp     = adiantSaldo(contratoSel.id);
        const valorAplicar  = Math.min(
          Math.max(0, parseFloat(fRom.adiantValor.replace(",", "."))),
          valorEntrega,
          saldoDisp,
        );
        if (valorAplicar > 0) {
          const valorCR = Math.max(0, valorEntrega - valorAplicar);
          // CR líquido para esta entrega
          let crId: string | null = null;
          if (valorCR > 0) {
            const { data: crRow } = await supabase.from("lancamentos").insert({
              fazenda_id: fazendaId,
              tipo: "receber",
              descricao: `Venda — ${contratoSel.comprador.split(" ").slice(0,3).join(" ")} (${criado.numero})`,
              categoria: "Receita Grãos",
              data_lancamento: TODAY, data_vencimento: TODAY,
              valor: Math.round(valorCR * 100) / 100,
              moeda: contratoSel.moeda,
              status: "em_aberto",
              auto: true,
              observacao: `Adiantamento abatido: ${fmtR$(valorAplicar)} · Valor bruto: ${fmtR$(valorEntrega)}`,
            }).select("id").maybeSingle();
            crId = crRow?.id ?? null;
          }
          // FIFO: aplica o abatimento nos adiantamentos mais antigos primeiro
          let restante = valorAplicar;
          const adiantsPendentes = (adiantamentos[contratoSel.id] ?? [])
            .filter(a => a.status !== "quitado")
            .sort((a, b) => a.data.localeCompare(b.data));
          const adiantUpdates: Record<string, AdiantamentoCliente> = {};
          for (const adiant of adiantsPendentes) {
            if (restante <= 0) break;
            const saldoA  = adiant.valor - adiant.valor_aplicado;
            const aplicar = Math.min(restante, saldoA);
            const novoApl = adiant.valor_aplicado + aplicar;
            const novoSt: AdiantamentoCliente["status"] = novoApl >= adiant.valor ? "quitado" : "parcial";
            await supabase.from("adiantamentos_cliente")
              .update({ valor_aplicado: Math.round(novoApl * 100) / 100, status: novoSt })
              .eq("id", adiant.id);
            await supabase.from("aplicacoes_adiantamento").insert({
              fazenda_id: fazendaId, adiantamento_id: adiant.id,
              lancamento_id: crId, romaneio_id: criado.id,
              data_aplicacao: TODAY, valor_aplicado: Math.round(aplicar * 100) / 100,
              observacao: `Romaneio ${criado.numero}`,
            });
            adiantUpdates[adiant.id] = { ...adiant, valor_aplicado: novoApl, status: novoSt };
            restante -= aplicar;
          }
          // Atualiza contrato
          const novoContrApl = (contratoSel.adiantamento_aplicado ?? 0) + valorAplicar;
          await supabase.from("contratos")
            .update({ adiantamento_aplicado: Math.round(novoContrApl * 100) / 100 })
            .eq("id", contratoSel.id);
          // Atualiza estado local
          setAdiantamentos(prev => ({
            ...prev,
            [contratoSel.id]: (prev[contratoSel.id] ?? []).map(a => adiantUpdates[a.id] ?? a),
          }));
          setContratos(prev => prev.map(c =>
            c.id === contratoSel.id ? { ...c, adiantamento_aplicado: novoContrApl } : c,
          ));
        }
      }
      setEditRomaneio(null);
      setFRom(ROM_VAZIO());
      setModalRomaneio(false);
      setAbaLista("expedicao");
    } catch(e: unknown) { alert("Erro ao salvar romaneio: " + sbErr(e)); }
    finally { setSalvando(false); }
  };

  // ── abrir edição de romaneio ──────────────────────────────────
  const abrirEditarRomaneio = (r: Romaneio) => {
    setEditRomaneio(r);
    setFRom({
      contratoId:       r.contrato_id,
      placa:            r.placa,
      pesoBruto:        String(r.peso_bruto_kg ?? ""),
      tara:             String(r.tara_kg ?? ""),
      pesoEstimado:     r.is_peso_estimado ?? false,
      pesoEstimadoKg:   r.is_peso_estimado ? String(r.peso_bruto_kg ?? "") : "",
      umidade:          String(r.umidade_pct ?? ""),
      impureza:         String(r.impureza_pct ?? ""),
      ph:               String(r.ph_hl ?? ""),
      ardidos:          String(r.ardidos_pct ?? ""),
      mofados:          String(r.mofados_pct ?? ""),
      fermentados:      String(r.fermentados_pct ?? ""),
      germinados:       String(r.germinados_pct ?? ""),
      esverdeados:      String(r.esverdeados_pct ?? ""),
      quebrados:        String(r.quebrados_pct ?? ""),
      carunchados:      String(r.carunchados_pct ?? ""),
      outros_avariados: String(r.outros_avariados_pct ?? ""),
      peso_destino:     String(r.peso_liquido_destino ?? ""),
      sacas_faturadas:  String(r.sacas_faturadas ?? ""),
      obs_divergencia:  r.obs_divergencia ?? "",
      aplicarAdiant:    false,
      adiantValor:      "",
    });
    setModalRomaneio(true);
  };

  // ── excluir romaneio ──────────────────────────────────────────
  const deletarRomaneio = async (r: Romaneio & { contratoNumero?: string }) => {
    if (!confirm(`Excluir romaneio ${r.numero}? As sacas serão estornadas do contrato.`)) return;
    try {
      // API route usa service_role_key — ignora RLS e já recalcula entregue_sc no banco
      const resultado = await excluirRomaneio(r.id);
      setContratos(prev => prev.map(c => {
        if (c.id !== r.contrato_id) return c;
        return {
          ...c,
          entregue_sc: resultado.entregue_sc,
          status:      resultado.status as ContratoVM["status"],
          romaneios:   c.romaneios.filter(rm => rm.id !== r.id),
        };
      }));
    } catch(e: unknown) { alert("Erro ao excluir romaneio: " + sbErr(e)); }
  };

  // ── registrar novo adiantamento ───────────────────────────────
  const registrarAdiantamento = async () => {
    if (!fazendaId || !adiantContratoId || !fAdiant.valor) return;
    setSalvandoAdiant(true);
    try {
      const valor    = Math.round(parseFloat(fAdiant.valor.replace(",", ".")) * 100) / 100;
      const contrato = contratos.find(c => c.id === adiantContratoId);
      if (!contrato || valor <= 0) return;
      // 1. CR liquidado
      const { data: crRow } = await supabase.from("lancamentos").insert({
        fazenda_id: fazendaId,
        tipo: "receber",
        descricao: `Adiantamento — ${contrato.comprador.split(" ").slice(0,3).join(" ")} (Contrato ${contrato.numero ?? ""})`,
        categoria: "Adiantamento Cliente",
        data_lancamento: fAdiant.data, data_vencimento: fAdiant.data,
        valor, moeda: contrato.moeda,
        status: "liquidado", auto: true,
        observacao: fAdiant.descricao || null,
      }).select("id").maybeSingle();
      // 2. Registro de adiantamento
      const { data: adiant } = await supabase.from("adiantamentos_cliente").insert({
        fazenda_id: fazendaId, contrato_id: adiantContratoId,
        data: fAdiant.data, valor,
        descricao: fAdiant.descricao || null,
        lancamento_id: crRow?.id ?? null,
        valor_aplicado: 0, status: "pendente",
      }).select("*").maybeSingle();
      // 3. Atualiza adiantamento_recebido no contrato
      const novoRec = (contrato.adiantamento_recebido ?? 0) + valor;
      await supabase.from("contratos")
        .update({ adiantamento_recebido: Math.round(novoRec * 100) / 100 })
        .eq("id", adiantContratoId);
      // 4. Estado local
      if (adiant) {
        setAdiantamentos(prev => ({
          ...prev,
          [adiantContratoId]: [...(prev[adiantContratoId] ?? []), adiant as AdiantamentoCliente],
        }));
      }
      setContratos(prev => prev.map(c =>
        c.id === adiantContratoId ? { ...c, adiantamento_recebido: novoRec } : c,
      ));
      setModalAdiant(false);
      setFAdiant({ data: TODAY, valor: "", descricao: "" });
    } catch(e: unknown) { alert("Erro ao registrar adiantamento: " + sbErr(e)); }
    finally { setSalvandoAdiant(false); }
  };

  // ── filtro da lista ───────────────────────────────────────────
  const safraDescFiltro = filtroAno ? (anosSafra.find(a => a.id === filtroAno)?.descricao ?? "") : "";
  const contratosFiltrados = contratos.filter(c => {
    if (filtroFazenda && c.fazenda_id !== filtroFazenda) return false;
    if (filtroAno) {
      const porId   = c.ano_safra_id === filtroAno;
      const porText = !c.ano_safra_id && safraDescFiltro && c.safra === safraDescFiltro;
      if (!porId && !porText) return false;
    }
    if (filtroCiclo    && c.ciclo_id !== filtroCiclo) return false;
    if (filtroProduto  && c.produto  !== filtroProduto) return false;
    if (filtroStatus   && c.status   !== filtroStatus)  return false;
    if (filtroComprador && c.comprador !== filtroComprador) return false;
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase();
      const haystack = [c.numero, c.comprador, c.produto, c.safra].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const compradores = [...new Set(contratos.map(c => c.comprador).filter(Boolean))].sort() as string[];
  const hasAnyFilter = !!(filtroFazenda || filtroAno || filtroCiclo || filtroProduto || filtroStatus || filtroComprador || filtroBusca);
  const limparFiltros = () => { setFiltroFazenda(""); setFiltroAno(""); setFiltroCiclo(""); setFiltroProduto(""); setFiltroStatus(""); setFiltroComprador(""); setFiltroBusca(""); };

  // ── métricas (baseadas nos contratos filtrados) ───────────────
  const contratosAtivos = contratosFiltrados.filter(c => c.status !== "encerrado" && c.status !== "cancelado").length;
  const todosRomaneios  = contratos.flatMap(c => c.romaneios.map(r => ({ ...r, contratoNumero: c.numero, comprador: c.comprador, produto: c.produto })));

  const posicao = PRODUTOS_DIN.map(produto => {
    const csProd = contratos.filter(c => c.produto === produto);
    const contratado = csProd.reduce((a,c) => a + (c.quantidade_sc??0), 0);
    const entregue   = csProd.reduce((a,c) => a + (c.entregue_sc??0), 0);
    return { produto, contratado, entregue, saldo: contratado-entregue, pct: contratado>0 ? Math.round(entregue/contratado*100) : 0 };
  }).filter(p => p.contratado > 0);

  async function encerrarSafrasAnteriores() {
    // Safras com data_inicio <= 2025-12-31 cobre até 2025/2026
    const safrasAlvo = anosSafra.filter(a => a.data_inicio <= "2025-12-31");
    if (safrasAlvo.length === 0) { alert("Nenhuma safra de 2025/2026 ou anterior encontrada."); return; }
    const candidatos = contratos.filter(c =>
      (c.status === "aberto" || c.status === "parcial") &&
      safrasAlvo.some(a => a.id === c.ano_safra_id)
    );
    if (candidatos.length === 0) { alert("Nenhum contrato aberto encontrado nessas safras."); return; }
    const confirmado = confirm(
      `Encerrar ${candidatos.length} contrato(s) de venda abertos das safras:\n` +
      safrasAlvo.map(a => `• ${a.descricao}`).join("\n") +
      `\n\nEsta ação marcará todos como "Encerrado" e não pode ser desfeita. Confirmar?`
    );
    if (!confirmado) return;
    try {
      const n = await encerrarContratosPorSafras(fazendaId!, safrasAlvo.map(a => a.id));
      alert(`${n} contrato(s) encerrado(s) com sucesso.`);
      await carregarTudo();
    } catch (e) { setErro(sbErr(e)); }
  }

  // ── render ────────────────────────────────────────────────────
  if (!podeAcessarPlano("contratos")) return <PlanoGate modulo="contratos" />;
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg-page)", fontFamily:"system-ui, sans-serif", fontSize:13 }}>
      <TopNav />
      <main style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        <header style={{ background:"var(--bg-card)", borderBottom:"0.5px solid var(--border-table)", padding:"10px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:600, color:"var(--text-1)" }}>Comercialização de Grãos</h1>
            <p style={{ margin:0, fontSize:11, color:"#444" }}>Contratos de venda, fixações, expedição e posição de estoque</p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={abrirModalLote}
              title="Encerrar contratos ou safras em lote por ano safra"
              style={{ background:"var(--bg-card)", color:"var(--text-2)", border:"0.5px solid #CCC", borderRadius:8, padding:"8px 12px", fontSize:12, cursor:"pointer" }}>
              ⊘ Encerramento em Lote
            </button>
            <button onClick={() => { setFRom(ROM_VAZIO()); setModalRomaneio(true); }}
              style={{ background:"#2A2A2A", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              + Romaneio
            </button>
            <button onClick={abrirNovo}
              style={{ background:"#C9921B", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              + Novo Contrato
            </button>
          </div>
        </header>

        <div style={{ padding:"16px 22px", flex:1, overflowY:"auto" }}>
          {erro && (
            <div style={{ background:"#FDECEA", border:"0.5px solid #E24B4A60", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#8B1A1A", display:"flex", gap:8 }}>
              <span>✕ {erro}</span>
              <button onClick={carregarTudo} style={{ marginLeft:"auto", fontSize:11, color:"#8B1A1A", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Tentar novamente</button>
            </div>
          )}
          {loading && <div style={{ textAlign:"center", padding:40, color:"#444" }}>Carregando…</div>}

          {!loading && !erro && (
            <>
              {/* ── KPI único: contratos ativos filtrados ── */}
              <div style={{ background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderRadius:12, padding:"12px 18px", marginBottom:14, display:"inline-flex", alignItems:"center", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, color:"var(--text-2)" }}>Contratos ativos{hasAnyFilter ? " (filtrado)" : ""}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#C9921B", lineHeight:1.2 }}>{contratosAtivos}</div>
                </div>
                <div style={{ width:"0.5px", height:36, background:"var(--border-table)" }} />
                <div style={{ fontSize:12, color:"var(--text-3)" }}>
                  de <span style={{ color:"var(--text-1)", fontWeight:600 }}>{contratosFiltrados.length}</span> exibido{contratosFiltrados.length !== 1 ? "s" : ""}
                  {hasAnyFilter && <span style={{ color:"var(--text-3)" }}> · <span style={{ color:"var(--text-1)", fontWeight:600 }}>{contratos.length}</span> total</span>}
                </div>
              </div>

              {/* ── Abas ── */}
              <div style={{ display:"flex", background:"var(--bg-card)", borderRadius:"12px 12px 0 0", border:"0.5px solid var(--border-table)" }}>
                {([
                  { key:"contratos", label:"Contratos",              count: contratos.length },
                  { key:"expedicao", label:"Expedição / Romaneios",  count: todosRomaneios.length },
                  { key:"posicao",   label:"Posição de Estoque",     count: null },
                ] as { key: AbaLista; label: string; count: number|null }[]).map(a => (
                  <button key={a.key} onClick={() => setAbaLista(a.key)} style={{
                    padding:"11px 20px", border:"none", background:"transparent", cursor:"pointer",
                    fontWeight: abaLista===a.key ? 600 : 400, fontSize:13,
                    color: abaLista===a.key ? "var(--text-1)" : "var(--text-2)",
                    borderBottom: abaLista===a.key ? "2px solid #111111" : "2px solid transparent",
                    display:"flex", alignItems:"center", gap:8,
                  }}>
                    {a.label}
                    {a.count !== null && <span style={{ fontSize:10, background: abaLista===a.key?"#E8E8E8":"var(--border-row)", color: abaLista===a.key?"#0D0D0D":"var(--text-2)", padding:"1px 6px", borderRadius:8 }}>{a.count}</span>}
                  </button>
                ))}
              </div>

              {/* ── ABA CONTRATOS ── */}
              {abaLista === "contratos" && (
                <div style={{ background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  {/* barra de filtros */}
                  <div style={{ padding:"10px 14px", borderBottom:"0.5px solid var(--bg-tag)", background:"#FAFBFD", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    {/* busca livre */}
                    <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="🔍 Buscar contrato, comprador…"
                      style={{ padding:"5px 10px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none", minWidth:190 }} />
                    {/* fazenda */}
                    {fazendas.length > 1 && (
                      <select value={filtroFazenda} onChange={e => setFiltroFazenda(e.target.value)}
                        style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none" }}>
                        <option value="">Todas as fazendas</option>
                        {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    )}
                    {/* safra */}
                    <select value={filtroAno} onChange={e => { setFiltroAno(e.target.value); setFiltroCiclo(""); }}
                      style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none" }}>
                      <option value="">Todos os anos safra</option>
                      {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                    </select>
                    {/* ciclo */}
                    <select value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)}
                      disabled={!filtroAno || ciclosFiltro.length === 0}
                      style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none", opacity: !filtroAno ? 0.5 : 1 }}>
                      <option value="">Todos os ciclos</option>
                      {ciclosFiltro.map(c => <option key={c.id} value={c.id}>{c.cultura}{c.descricao ? ` — ${c.descricao}` : ""}</option>)}
                    </select>
                    {/* produto */}
                    <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none" }}>
                      <option value="">Todos os produtos</option>
                      {PRODUTOS_DIN.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {/* comprador */}
                    <select value={filtroComprador} onChange={e => setFiltroComprador(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none", maxWidth:160 }}>
                      <option value="">Todos os compradores</option>
                      {compradores.map(cp => <option key={cp} value={cp}>{cp}</option>)}
                    </select>
                    {/* status */}
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, color:"var(--text-1)", background:"var(--bg-input)", outline:"none" }}>
                      <option value="">Todos os status</option>
                      <option value="aberto">Aberto</option>
                      <option value="parcial">Parcial</option>
                      <option value="encerrado">Encerrado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                    {hasAnyFilter && (
                      <button onClick={limparFiltros}
                        style={{ padding:"5px 10px", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:11, color:"var(--text-2)", background:"var(--bg-card)", cursor:"pointer" }}>
                        ✕ Limpar
                      </button>
                    )}
                    <span style={{ marginLeft:"auto", fontSize:11, color:"var(--text-3)" }}>
                      {contratosFiltrados.length}{hasAnyFilter ? ` de ${contratos.length}` : ""} contrato{contratosFiltrados.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {contratosFiltrados.length === 0 ? (
                    <div style={{ padding:32, textAlign:"center", color:"#444", fontSize:12 }}>
                      {contratos.length === 0 ? "Nenhum contrato. Clique em + Novo Contrato para começar." : "Nenhum contrato encontrado para os filtros selecionados."}
                    </div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"var(--bg-page)" }}>
                          {["Contrato","Produtor / Cliente","Produto","Volume","Entregue","Saldo","Preço","Prazo","Status",""].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign: i>=3&&i<=7?"center":"left", fontSize:11, fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--border-table)", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {contratosFiltrados.map(c => {
                          const cs = corStatus(c.status);
                          const cp = corProduto(c.produto);
                          const pct = (c.quantidade_sc??0)>0 ? Math.round((c.entregue_sc??0)/(c.quantidade_sc??1)*100) : 0;
                          const exp = expandido.has(c.id);
                          return (
                            <React.Fragment key={c.id}>
                              <tr style={{ borderBottom:"0.5px solid var(--border-row)", cursor:"pointer" }} onClick={() => toggleExpand(c.id)}>
                                <td style={{ padding:"10px 12px" }}>
                                  <div style={{ fontWeight:600, fontSize:12, color:"var(--text-1)", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                    {c.nr_contrato_cliente || c.numero}
                                    {(c as {is_arrendamento?:boolean}).is_arrendamento && (
                                      <span style={{ fontSize:9, background:"#FBF3E0", color:"#7A5A12", padding:"1px 6px", borderRadius:4, fontWeight:600, letterSpacing:"0.3px" }}>ARRENDAMENTO</span>
                                    )}
                                    {(c as {dado_em_cessao?:boolean}).dado_em_cessao && (
                                      <span style={{ fontSize:9, background:"#EDE9FE", color:"#5B21B6", padding:"1px 6px", borderRadius:4, fontWeight:600, letterSpacing:"0.3px" }}>CESSÃO</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize:10, color:"#444" }}>{c.tipo?.toUpperCase() ?? "VENDA"} · {c.numero} · Safra {c.safra}</div>
                                </td>
                                <td style={{ padding:"10px 12px", fontSize:12, color:"var(--text-1)", maxWidth:200 }}>
                                  <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.comprador || "—"}</div>
                                  {c.is_triangulacao && c.comprador_final_nome && (
                                    <div style={{ fontSize:9, color:"#C9921B", fontWeight:600 }}>
                                      ⇒ {c.comprador_final_nome.split(" ").slice(0,2).join(" ")}
                                    </div>
                                  )}
                                  {c.is_triangulacao && !c.comprador_final_nome && (
                                    <div style={{ fontSize:9, background:"#FBF3E0", color:"#C9921B", padding:"1px 5px", borderRadius:4, display:"inline-block", marginTop:2 }}>Triangulação</div>
                                  )}
                                  {c.local_entrega_nome && (
                                    <div style={{ fontSize:9, color:"#444444", marginTop:2 }} title={[c.local_entrega_nome, c.local_entrega_municipio, c.local_entrega_uf].filter(Boolean).join(", ")}>
                                      📍 {c.local_entrega_municipio || c.local_entrega_nome.split(" ").slice(0,2).join(" ")}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding:"10px 12px" }}>
                                  <span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 8px", borderRadius:8 }}>{c.produto}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color:"var(--text-1)" }}>{(c.quantidade_sc??0).toLocaleString("pt-BR")} sc</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <div style={{ fontWeight:600, color:"#111111" }}>{(c.entregue_sc??0).toLocaleString("pt-BR")} sc</div>
                                  <div style={{ height:3, background:"var(--border-row)", borderRadius:2, marginTop:3, width:56, margin:"3px auto 0" }}>
                                    <div style={{ height:"100%", width:`${pct}%`, background: pct===100?"#111111":"#EF9F27", borderRadius:2 }} />
                                  </div>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color: ((c.quantidade_sc??0)-(c.entregue_sc??0))>0?"#EF9F27":"#111111" }}>
                                  {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:12, whiteSpace:"nowrap", color:"var(--text-1)" }}>
                                  {c.modalidade==="fixo" && c.moeda==="USD" && (
                                    <div>
                                      <div style={{ fontWeight:600 }}>US$ {(c.preco??0).toLocaleString("pt-BR",{minimumFractionDigits:2})}/sc</div>
                                      <div style={{ fontSize:10, color:"#444444", marginTop:1 }}>≈ {fmtR$(Math.round((c.preco??0)*ptaxAtual*100)/100)}/sc</div>
                                    </div>
                                  )}
                                  {c.modalidade==="fixo" && c.moeda!=="USD" && <span style={{ fontWeight:600 }}>{fmtR$(c.preco??0)}/sc</span>}
                                  {c.modalidade==="a_fixar" && <span style={{ color:"#444444", fontWeight:600 }}>A fixar</span>}
                                  {c.modalidade==="barter"  && <span style={{ color:"#8B5E14", fontWeight:600 }}>Barter</span>}
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:11, color: c.data_entrega&&new Date(c.data_entrega)<new Date(TODAY)&&c.status!=="encerrado"?"#E24B4A":"#666", whiteSpace:"nowrap" }}>{fmtData(c.data_entrega)}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <span style={{ fontSize:10, background:cs.bg, color:cs.color, padding:"2px 8px", borderRadius:8 }}>{cs.label}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"right" }}>
                                  <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }} onClick={e => e.stopPropagation()}>
                                    <button style={{ padding:"3px 9px", border:"0.5px solid var(--border-table)", borderRadius:5, background:"transparent", cursor:"pointer", fontSize:11, color:"#666" }} onClick={() => abrirEditar(c, false)}>Abrir</button>
                                    {c.status !== "encerrado" && c.status !== "cancelado" && (
                                      <button style={{ padding:"3px 9px", border:"0.5px solid #C9921B50", borderRadius:5, background:"#FBF3E0", cursor:"pointer", fontSize:11, color:"#7A5200" }}
                                        onClick={async () => {
                                          // Se for cessão, avisa sobre a liquidação automática dos CPs
                                          const debs = (c as {dado_em_cessao?:boolean}).dado_em_cessao
                                            ? await listarCessaoDebitos(c.id) : [];
                                          const msg = debs.length > 0
                                            ? `Encerrar contrato ${c.numero}?\n\nIsso também vai liquidar automaticamente ${debs.length} CP(s) vinculado(s) à cessão de crédito (total: R$ ${debs.reduce((s,d)=>s+d.valor_cessao,0).toLocaleString("pt-BR",{minimumFractionDigits:2})}).`
                                            : `Encerrar contrato ${c.numero}?`;
                                          if (!confirm(msg)) return;
                                          await atualizarContrato(c.id, { status: "encerrado" });
                                          // Baixa automática dos CPs vinculados à cessão
                                          for (const d of debs) {
                                            try {
                                              await baixarLancamento(d.lancamento_id, d.valor_cessao, TODAY, "cessao", {
                                                observacao: `Baixa automática por cessão de crédito — Contrato ${c.numero}`,
                                              });
                                            } catch { /* não bloqueia o encerramento se uma baixa falhar */ }
                                          }
                                          await carregarTudo();
                                        }}>
                                        Encerrar
                                      </button>
                                    )}
                                    <button style={{ padding:"3px 9px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" }}
                                      onClick={async () => { if (confirm(`Excluir contrato ${c.numero} permanentemente? Esta ação não pode ser desfeita.`)) { await excluirContrato(c.id); await carregarTudo(); } }}>
                                      Excluir
                                    </button>
                                    <span style={{ color:"#444", fontSize:10, display:"inline-block", transform: exp?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.15s", cursor:"pointer", padding:"4px" }} onClick={() => toggleExpand(c.id)}>▶</span>
                                  </div>
                                </td>
                              </tr>
                              {exp && (
                                <tr key={`${c.id}-exp`}>
                                  <td colSpan={10} style={{ background:"var(--bg-card)", padding:0, borderBottom:"0.5px solid var(--border-row)" }}>
                                    <div style={{ padding:"12px 16px" }}>
                                      {/* Itens do contrato */}
                                      {c.itens && c.itens.length > 0 && (
                                        <div style={{ marginBottom:12 }}>
                                          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-2)", marginBottom:6 }}>Itens do Contrato</div>
                                          <table style={{ width:"100%", borderCollapse:"collapse", background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderRadius:8, overflow:"hidden" }}>
                                            <thead>
                                              <tr style={{ background:"var(--bg-page)" }}>
                                                {["Tipo","Produto","Qtd","Unid","Vlr Unit.","Vlr Total","Classificação"].map((h,i) => (
                                                  <th key={i} style={{ padding:"6px 10px", textAlign: i>=2?"center":"left", fontSize:10, fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--border-table)" }}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {c.itens.map((it,ii) => (
                                                <tr key={ii} style={{ borderBottom: ii<c.itens.length-1?"0.5px solid #eee":"none" }}>
                                                  <td style={{ padding:"6px 10px", fontSize:11, color:"var(--text-2)" }}>{it.tipo}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:11, fontWeight:600, color:"var(--text-1)" }}>{it.produto}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{(it.quantidade??0).toLocaleString("pt-BR")}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{it.unidade}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtR$(it.valor_unitario??0)}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#111111" }}>{fmtR$(it.valor_total??0)}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:10, color:"#666" }}>{it.classificacao || "—"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                      {/* Romaneios */}
                                      <div style={{ fontSize:11, fontWeight:600, color:"var(--text-2)", marginBottom:6 }}>Expedição / Romaneios</div>
                                      {c.romaneios.length === 0 ? (
                                        <div style={{ fontSize:11, color:"var(--text-3)", padding:"8px 0" }}>Nenhum romaneio lançado.</div>
                                      ) : (
                                        <table style={{ width:"100%", borderCollapse:"collapse", background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderRadius:8, overflow:"hidden" }}>
                                          <thead>
                                            <tr style={{ background:"#FBF0D8" }}>
                                              {["Romaneio","Data","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e",""].map((h,i) => (
                                                <th key={i} style={{ padding:"6px 10px", textAlign: i>=3&&i<8?"center":"left", fontSize:10, fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--border-table)" }}>{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {c.romaneios.map((r,ri) => (
                                              <tr key={ri} style={{ borderBottom: ri<c.romaneios.length-1?"0.5px solid #eee":"none" }}>
                                                <td style={{ padding:"6px 10px", fontWeight:600, fontSize:11 }}>{r.numero}</td>
                                                <td style={{ padding:"6px 10px", fontSize:11 }}>{fmtData(r.data)}</td>
                                                <td style={{ padding:"6px 10px", fontSize:11, fontFamily:"monospace" }}>{r.placa}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.peso_bruto_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.tara_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600 }}>{fmtPeso(r.peso_liquido_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#111111" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center" }}>
                                                  {r.nfe_numero ? badge(`✓ ${r.nfe_numero}`) : <span style={{ fontSize:10, background:"#FAEEDA", color:"#633806", padding:"2px 6px", borderRadius:6 }}>⟳ Gerando…</span>}
                                                </td>
                                                <td style={{ padding:"6px 10px", whiteSpace:"nowrap" }}>
                                                  <button onClick={e=>{e.stopPropagation();abrirEditarRomaneio(r);}} style={{ fontSize:10, padding:"2px 7px", border:"0.5px solid #1A4870", borderRadius:5, background:"transparent", color:"#1A4870", cursor:"pointer", marginRight:4 }}>✏ Editar</button>
                                                  <button onClick={e=>{e.stopPropagation();deletarRomaneio(r);}} style={{ fontSize:10, padding:"2px 7px", border:"0.5px solid #E24B4A", borderRadius:5, background:"transparent", color:"#E24B4A", cursor:"pointer" }}>🗑</button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                        <span style={{ fontSize:11, color:"var(--text-2)" }}>{c.romaneios.length} romaneio(s) · {(c.entregue_sc??0).toLocaleString("pt-BR")} sc expedidas · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</span>
                                        <button onClick={e => { e.stopPropagation(); setFRom({ ...ROM_VAZIO(), contratoId: c.id }); setModalRomaneio(true); }}
                                          style={{ fontSize:11, padding:"5px 12px", border:"0.5px solid #111111", borderRadius:6, background:"#E8E8E8", color:"#0D0D0D", cursor:"pointer", fontWeight:600 }}>
                                          + Lançar Romaneio
                                        </button>
                                      </div>

                                      {/* ── Adiantamentos ── */}
                                      {(() => {
                                        const adts        = adiantamentos[c.id] ?? [];
                                        const totalRec    = adts.reduce((s, a) => s + a.valor, 0);
                                        const totalApl    = adts.reduce((s, a) => s + a.valor_aplicado, 0);
                                        const saldo       = totalRec - totalApl;
                                        const statusCor   = (st: string) => st === "quitado" ? "#16A34A" : st === "parcial" ? "#C9921B" : "#111111";
                                        const statusLabel = (st: string) => st === "quitado" ? "Quitado" : st === "parcial" ? "Parcial" : "Disponível";
                                        return (
                                          <div style={{ marginTop:16, borderTop:"0.5px solid var(--bg-tag)", paddingTop:12 }}>
                                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                                <span style={{ fontSize:11, fontWeight:600, color:"var(--text-2)" }}>💰 Adiantamentos</span>
                                                {saldo > 0 && (
                                                  <span style={{ background:"#E8E8E8", color:"#111111", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>
                                                    Saldo disponível: {fmtR$(saldo)}
                                                  </span>
                                                )}
                                                {adts.length > 0 && saldo <= 0 && (
                                                  <span style={{ background:"#DCFCE7", color:"#15803D", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>✓ Totalmente aplicado</span>
                                                )}
                                              </div>
                                              <button onClick={e => { e.stopPropagation(); setAdiantContratoId(c.id); setFAdiant({ data:TODAY, valor:"", descricao:"" }); setModalAdiant(true); }}
                                                style={{ fontSize:11, padding:"4px 10px", border:"0.5px solid #C9921B", borderRadius:6, background:"#FBF3E0", color:"#7A5A12", cursor:"pointer", fontWeight:600 }}>
                                                + Registrar Adiantamento
                                              </button>
                                            </div>
                                            {adts.length === 0 ? (
                                              <div style={{ fontSize:11, color:"var(--text-muted)", fontStyle:"italic" }}>Nenhum adiantamento registrado para este contrato.</div>
                                            ) : (
                                              <>
                                                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, background:"#FAFBFD", border:"0.5px solid var(--bg-tag)", borderRadius:8, overflow:"hidden" }}>
                                                  <thead>
                                                    <tr style={{ background:"#FBF3E0" }}>
                                                      {["Data","Valor recebido","Aplicado","Saldo","Status"].map((h,i) => (
                                                        <th key={i} style={{ padding:"5px 10px", textAlign:i===0?"left":"center", fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--bg-tag)" }}>{h}</th>
                                                      ))}
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {adts.map((a, ai) => (
                                                      <tr key={a.id} style={{ borderBottom: ai<adts.length-1?"0.5px solid var(--bg-tag)":"none" }}>
                                                        <td style={{ padding:"6px 10px" }}>{fmtData(a.data)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600 }}>{fmtR$(a.valor)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", color:"var(--text-3)" }}>{a.valor_aplicado > 0 ? fmtR$(a.valor_aplicado) : "—"}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600, color: a.valor-a.valor_aplicado>0?"#111111":"var(--text-3)" }}>{fmtR$(a.valor - a.valor_aplicado)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center" }}>
                                                          <span style={{ background: statusCor(a.status)+"22", color: statusCor(a.status), fontWeight:600, padding:"2px 7px", borderRadius:8, fontSize:10 }}>{statusLabel(a.status)}</span>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                                <div style={{ display:"flex", gap:20, padding:"6px 10px", fontSize:11, color:"var(--text-2)" }}>
                                                  <span>Total recebido: <strong>{fmtR$(totalRec)}</strong></span>
                                                  <span>Aplicado em entregas: <strong>{fmtR$(totalApl)}</strong></span>
                                                  <span style={{ fontWeight:700, color: saldo>0?"#111111":"var(--text-3)" }}>Saldo: {fmtR$(saldo)}</span>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── ABA EXPEDIÇÃO ── */}
              {abaLista === "expedicao" && (
                <div style={{ background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"0.5px solid var(--border-row)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"var(--text-2)" }}>{todosRomaneios.length} romaneios · {todosRomaneios.reduce((a,r)=>a+(r.sacas??0),0).toLocaleString("pt-BR")} sc expedidas</span>
                    <button onClick={() => setModalRomaneio(true)} style={{ fontSize:12, padding:"5px 14px", border:"0.5px solid #111111", borderRadius:6, background:"#E8E8E8", color:"#0D0D0D", cursor:"pointer", fontWeight:600 }}>+ Novo Romaneio</button>
                  </div>
                  {todosRomaneios.length === 0 ? (
                    <div style={{ padding:24, textAlign:"center", color:"#444", fontSize:12 }}>Nenhum romaneio registrado.</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"var(--bg-page)" }}>
                          {["Romaneio","Data","Contrato","Comprador","Produto","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e",""].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign:i>=6&&i<11?"center":"left", fontSize:11, fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--border-table)", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...todosRomaneios].sort((a,b) => (b.data??"").localeCompare(a.data??"")).map((r,ri,arr) => {
                          const cp = corProduto(r.produto);
                          return (
                            <tr key={ri} style={{ borderBottom: ri<arr.length-1?"0.5px solid var(--border-row)":"none" }}>
                              <td style={{ padding:"9px 12px", fontWeight:600, fontSize:12 }}>{r.numero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, whiteSpace:"nowrap" }}>{fmtData(r.data)}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontWeight:600, color:"#C9921B" }}>{r.contratoNumero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.comprador}</td>
                              <td style={{ padding:"9px 12px" }}><span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 7px", borderRadius:8 }}>{r.produto}</span></td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontFamily:"monospace" }}>{r.placa}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>
                                {r.is_peso_estimado
                                  ? <span style={{ fontSize:9, background:"#F97316", color:"#fff", padding:"1px 5px", borderRadius:4, fontWeight:700 }}>EST.</span>
                                  : fmtPeso(r.peso_bruto_kg??0)}
                              </td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>{r.is_peso_estimado ? "—" : fmtPeso(r.tara_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11, fontWeight:600, color: r.is_peso_estimado ? "#C9921B" : "inherit" }}>{fmtPeso(r.peso_liquido_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontWeight:600, color:"#111111" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center" }}>
                                {r.nfe_numero
                                  ? badge(`✓ ${r.nfe_numero}`)
                                  : (
                                    <a
                                      href={`/comercial/faturamento?romaneio_id=${r.id}&contrato_id=${r.contrato_id}`}
                                      style={{ fontSize:11, padding:"3px 10px", borderRadius:6, background:"#C9921B", color:"#fff", fontWeight:600, textDecoration:"none", whiteSpace:"nowrap", display:"inline-block" }}
                                    >
                                      Faturar →
                                    </a>
                                  )
                                }
                              </td>
                              <td style={{ padding:"9px 12px", whiteSpace:"nowrap" }}>
                                <button onClick={()=>abrirEditarRomaneio(r)} style={{ fontSize:10, padding:"3px 8px", border:"0.5px solid #1A4870", borderRadius:5, background:"transparent", color:"#1A4870", cursor:"pointer", marginRight:4 }}>✏ Editar</button>
                                <button onClick={()=>deletarRomaneio(r)} style={{ fontSize:10, padding:"3px 8px", border:"0.5px solid #E24B4A", borderRadius:5, background:"transparent", color:"#E24B4A", cursor:"pointer" }}>🗑</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── ABA POSIÇÃO DE ESTOQUE ── */}
              {abaLista === "posicao" && (
                <div style={{ background:"var(--bg-page)", border:"0.5px solid var(--border-table)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:20 }}>
                  {posicao.length === 0 ? (
                    <div style={{ textAlign:"center", padding:48, color:"var(--text-3)", fontSize:13 }}>Nenhum contrato ativo com saldo.</div>
                  ) : (
                    <div style={{ background:"var(--bg-card)", border:"0.5px solid var(--border-table)", borderRadius:10, overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                        <thead>
                          <tr style={{ background:"var(--bg-card)", borderBottom:"0.5px solid var(--border-table)" }}>
                            <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>Cultura</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>Contratado (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>Entregue (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>Saldo (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>Progresso</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"var(--text-2)" }}>% Entregue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posicao.map((p, i) => (
                            <tr key={p.produto} style={{ borderBottom:"0.5px solid var(--bg-tag)", background:i%2===0?"var(--bg-card)":"#FAFBFD" }}>
                              <td style={{ padding:"10px 16px", fontWeight:600, color:"var(--text-1)" }}>{p.produto}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:"var(--text-1)" }}>{p.contratado.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:"#16A34A", fontWeight:600 }}>{p.entregue.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:p.saldo>0?"#E24B4A":"#16A34A", fontWeight:600 }}>{p.saldo.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", minWidth:140 }}>
                                <div style={{ height:8, background:"var(--bg-tag)", borderRadius:4, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:p.pct+"%", background:p.pct===100?"#16A34A":"#111111", borderRadius:4 }} />
                                </div>
                              </td>
                              <td style={{ padding:"10px 16px", textAlign:"right", fontWeight:700, color:p.pct===100?"#16A34A":"#111111" }}>{p.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}            </>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MODAL CONTRATO — Principal / Adicionais / Itens
      ═══════════════════════════════════════════════════════════ */}
      {modalContrato && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}
          onClick={e => { if (e.target===e.currentTarget) setModalContrato(false); }}>
          <div style={{ background:"var(--bg-card)", borderRadius:14, width:1280, maxWidth:"98vw", maxHeight:"95vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Cabeçalho do modal */}
            <div style={{ padding:"14px 20px", borderBottom:"0.5px solid var(--border-table)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontWeight:600, fontSize:15, color:"var(--text-1)" }}>
                  {editContrato ? (viewOnly ? `Contrato ${editContrato.numero}` : `Editando ${editContrato.numero}`) : "Novo Contrato"}
                </div>
                {viewOnly && editContrato && (
                  <span style={{ fontSize:10, background:"#FBF3E0", color:"#7A5200", padding:"2px 8px", borderRadius:6, fontWeight:600 }}>Visualização</span>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {/* Autorização */}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, color:"var(--text-2)" }}>Autorização:</span>
                  <select disabled={viewOnly} style={{ ...inp, width:"auto", padding:"5px 8px" }} value={fC.autorizacao} onChange={e => setFC(p=>({...p,autorizacao:e.target.value as Contrato["autorizacao"]}))}>
                    <option value="pendente">Pendente</option>
                    <option value="autorizada">Autorizada</option>
                    <option value="recusada">Recusada</option>
                  </select>
                </div>
                {viewOnly && editContrato && (
                  <button onClick={() => setViewOnly(false)}
                    style={{ padding:"5px 14px", border:"none", borderRadius:6, background:"#C9921B", color:"white", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                    ✏ Editar
                  </button>
                )}
                <button onClick={() => setModalContrato(false)} style={{ padding:"5px 10px", border:"0.5px solid var(--border-table)", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:12 }}>✕ Fechar</button>
              </div>
            </div>

            {/* Abas Principal / Adicionais */}
            <div style={{ display:"flex", borderBottom:"0.5px solid var(--border-table)", background:"var(--bg-card)" }}>
              {(["principal","adicionais"] as AbaForm[]).map(a => (
                <button key={a} onClick={() => setAbaForm(a)} style={{
                  padding:"9px 20px", border:"none", background:"transparent", cursor:"pointer",
                  fontWeight: abaForm===a?600:400, fontSize:13,
                  color: abaForm===a?"var(--text-1)":"var(--text-2)",
                  borderBottom: abaForm===a?"2px solid #111111":"2px solid transparent",
                }}>
                  {a==="principal" ? "Principal" : "Adicionais"}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
              {/* Fazenda — seletor explícito */}
              {fazendas.length > 1 && (
                <div style={{ background:"#F2F2F2", border:"0.5px solid #B8D4F0", borderRadius:10, padding:"10px 16px", marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#111111", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Este contrato pertence a</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:10 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:"#111111", textTransform:"uppercase" as const, letterSpacing:"0.05em", display:"block", marginBottom:4 }}>Fazenda <span style={{ color:"#E24B4A" }}>*</span></label>
                      <select style={inp} value={fC.fazenda_id ?? fazendaId ?? ""} onChange={e => setFC(p => ({ ...p, fazenda_id: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {abaForm === "principal" && (
                <>
                  {/* ── Banner IA — upload de contrato PDF (Add-on ia_contrato_venda) ── */}
                  {!editContrato && contaModulosOverrides["ia_contrato_venda"] === true && (
                    <div style={{ marginBottom: 18, border: "0.5px solid #C9921B", borderRadius: 10, background: "#FBF3E0", padding: "12px 16px" }}>
                      {/* Linha principal */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#7A4300", marginBottom: 3 }}>
                            📄 Deixe que o Arato lança pra você. Anexe o PDF do contrato aqui.
                          </div>
                          <div style={{ fontSize: 11, color: "#7A4300" }}>
                            Envie o PDF — o sistema extrai comprador, vendedor, produto, volume, preço e retenções. Você só revisa e salva.
                          </div>
                          {iaVendaErro && (
                            <div style={{ marginTop: 6, fontSize: 11, color: "#791F1F", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 6, padding: "4px 8px" }}>
                              ✕ {iaVendaErro}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          {iaVendaExtraindo && (
                            <span style={{ fontSize: 11, color: "#7A4300" }}>Lendo contrato…</span>
                          )}
                          {iaVendaConf && !iaVendaExtraindo && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                              background: iaVendaConf === "alta" ? "#DCFCE7" : iaVendaConf === "media" ? "#FBF3E0" : "#FCEBEB",
                              color:      iaVendaConf === "alta" ? "#166534" : iaVendaConf === "media" ? "#7A4300" : "#791F1F",
                              border: `0.5px solid ${iaVendaConf === "alta" ? "#16A34A" : iaVendaConf === "media" ? "#C9921B" : "#E24B4A"}`,
                            }}>
                              {iaVendaConf === "alta" ? "✓ Alta confiança — revise e salve" : iaVendaConf === "media" ? "⚠ Confira os campos" : "⚠ Baixa — verifique tudo"}
                            </span>
                          )}
                          {iaVendaResultado && !iaVendaExtraindo && (
                            <button onClick={() => setIaVendaMostrarDebug(v => !v)}
                              style={{ padding: "4px 10px", background: "transparent", border: "0.5px solid #C9921B", borderRadius: 6, fontSize: 11, color: "#7A4300", cursor: "pointer" }}>
                              {iaVendaMostrarDebug ? "Ocultar" : "Ver extraído"}
                            </button>
                          )}
                          {iaVendaPdfNome && !iaVendaExtraindo && (
                            <span style={{ fontSize: 11, color: "#7A4300", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {iaVendaPdfNome}</span>
                          )}
                          <label style={{ padding: "6px 14px", background: iaVendaExtraindo ? "#ddd" : "#C9921B", color: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: iaVendaExtraindo ? "default" : "pointer", whiteSpace: "nowrap" }}>
                            {iaVendaExtraindo ? "Processando…" : iaVendaPdfNome ? "Trocar PDF" : "Selecionar PDF"}
                            <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={iaVendaExtraindo}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfContratoVenda(f); e.target.value = ""; }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Painel de debug — o que foi extraído */}
                      {iaVendaMostrarDebug && iaVendaResultado && (
                        <div style={{ marginTop: 12, borderTop: "0.5px solid #C9921B40", paddingTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7A4300", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Campos extraídos do PDF
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
                            {[
                              ["Nº Contrato",      iaVendaResultado.numero_contrato],
                              ["Data Contrato",    iaVendaResultado.data_contrato],
                              ["Comprador",        iaVendaResultado.comprador_nome],
                              ["CNPJ Comprador",   iaVendaResultado.comprador_cnpj],
                              ["IE Comprador",     iaVendaResultado.comprador_ie],
                              ["Vendedor",         iaVendaResultado.vendedor_nome],
                              ["CPF/CNPJ Vendedor",iaVendaResultado.vendedor_cpf_cnpj],
                              ["IE Vendedor",      iaVendaResultado.vendedor_ie],
                              ["Produto",          iaVendaResultado.produto],
                              ["Safra",            iaVendaResultado.safra],
                              ["Moeda",            iaVendaResultado.moeda],
                              ["Preço/sc",         iaVendaResultado.preco_por_saca ? `${iaVendaResultado.moeda} ${iaVendaResultado.preco_por_saca}` : undefined],
                              ["Volume original",  iaVendaResultado.volume_original],
                              ["Volume (sc)",      iaVendaResultado.volume_sacas],
                              ["Volume (ton)",     iaVendaResultado.volume_toneladas],
                              ["Data Entrega",     iaVendaResultado.data_entrega_fim ?? iaVendaResultado.data_entrega_inicio],
                              ["Data Pagamento",   iaVendaResultado.data_pagamento],
                              ["Destino",          iaVendaResultado.destino],
                              ["Frete",            iaVendaResultado.frete],
                              ["Modalidade",       iaVendaResultado.modalidade],
                              ["Local Entrega",    iaVendaResultado.local_entrega],
                            ].map(([label, val]) => (
                              <div key={String(label)} style={{ fontSize: 11 }}>
                                <span style={{ color: "#9a6b20", display: "block", fontSize: 10 }}>{String(label)}</span>
                                <span style={{ color: val ? "#3a2000" : "#c9921b80", fontWeight: val ? 600 : 400 }}>
                                  {val !== undefined && val !== null && val !== "" ? String(val) : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                          {Array.isArray(iaVendaResultado.retencoes) && (iaVendaResultado.retencoes as unknown[]).length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: "#9a6b20", marginBottom: 4 }}>RETENÇÕES</div>
                              {(iaVendaResultado.retencoes as Array<{descricao:string;percentual?:number;valor_fixo?:number}>).map((r, i) => (
                                <span key={i} style={{ fontSize: 11, background: "#f5e6c8", color: "#3a2000", padding: "2px 7px", borderRadius: 5, marginRight: 6, display: "inline-block", marginBottom: 3 }}>
                                  {r.descricao}{r.percentual ? ` ${r.percentual}%` : ""}{r.valor_fixo ? ` R$${r.valor_fixo}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {typeof iaVendaResultado.observacoes === "string" && iaVendaResultado.observacoes !== "" && (
                            <div style={{ marginTop: 8, fontSize: 11, color: "#3a2000", background: "#f5e6c840", padding: "6px 10px", borderRadius: 6 }}>
                              <strong>Obs.:</strong> {iaVendaResultado.observacoes as string}
                            </div>
                          )}
                          {/* Texto bruto retornado pela IA */}
                          {iaVendaRawText && (
                            <div style={{ marginTop: 10, borderTop: "0.5px solid #C9921B30", paddingTop: 8 }}>
                              <div style={{ fontSize: 10, color: "#9a6b20", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Resposta bruta da IA (debug)
                              </div>
                              <pre style={{ fontSize: 10, color: "#3a2000", background: "#fff8ee", border: "0.5px solid #C9921B30", borderRadius: 6, padding: "8px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflowY: "auto", margin: 0 }}>
                                {iaVendaRawText.slice(0, 2000)}{iaVendaRawText.length > 2000 ? "\n[truncado...]" : ""}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linha 1: Nº Lançamento | Nº Contrato | Safra | Tipo Contrato */}
                  <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Nº Lançamento</label>
                      <input style={{ ...inp, background:"var(--bg-page)", color:"var(--text-3)" }} value={editContrato?.num_lancamento ?? "—"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Nº Contrato</label>
                      <input style={{ ...inp, background:"var(--bg-page)", color:"var(--text-3)" }} value={editContrato?.numero ?? "(gerado ao salvar)"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Safra</label>
                      <select style={{ ...inp, color: fC.ano_safra_id ? "var(--text-1)" : "var(--text-3)" }}
                        value={fC.ano_safra_id}
                        onChange={e => {
                          const sel = anosSafra.find(a => a.id === e.target.value);
                          setFC(p=>({...p, ano_safra_id: e.target.value, safra: sel?.descricao ?? "", ciclo_id: "" }));
                        }}>
                        {anosSafra.length === 0
                          ? <option value="">Cadastre safras em Cadastros → Safras & Ciclos</option>
                          : <>
                              <option value="">— selecione —</option>
                              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                            </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Tipo de Contrato</label>
                      <select style={inp} value={fC.tipo} onChange={e => setFC(p=>({...p,tipo:e.target.value as Contrato["tipo"]}))}>
                        <option value="venda">Venda</option>
                        <option value="compra">Compra</option>
                        <option value="barter">Barter</option>
                        <option value="troca">Troca</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Data do Contrato</label>
                      <input style={inp} type="date" value={fC.data_contrato} onChange={e => setFC(p=>({...p,data_contrato:e.target.value}))} />
                    </div>
                  </div>

                  {/* Flags */}
                  <div style={{ display:"flex", gap:20, marginBottom:14, padding:"8px 12px", background:"var(--bg-page)", borderRadius:8 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                      <input type="checkbox" checked={fC.confirmado} onChange={e => setFC(p=>({...p,confirmado:e.target.checked}))} /> Confirmado
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.a_fixar} onChange={e => setFC(p=>({...p,a_fixar:e.target.checked}))} /> Contrato à fixar
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.venda_a_ordem} onChange={e => {
                        setFC(p=>({...p, venda_a_ordem: e.target.checked}));
                        setNaturezaSugerida(""); // força reavaliação da natureza
                      }} /> Venda a Ordem
                    </label>
                  </div>

                  {/* Linha 2: Produtor | Cliente | Nr Contrato Cliente | Contato Broker */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Produtor</label>
                      <ProdutorCombo
                        produtores={produtores}
                        value={fC.produtor_id}
                        onChange={id => setFC(p => ({ ...p, produtor_id: id, ie_id: "" }))}
                        placeholder="— selecione —"
                      />
                      {fC.produtor_id && (
                        <div style={{ marginTop: 6 }}>
                          <label style={{ ...lbl, color: "#C9921B" }}>
                            Inscrição Estadual (IE)
                            {iesProdutor.length > 1 && <span style={{ fontWeight: 400, color: "#888" }}> — {iesProdutor.length} registradas</span>}
                          </label>
                          {iesProdutor.length > 1 ? (
                            <select
                              style={{ ...inp, borderColor: !fC.ie_id ? "#E24B4A" : undefined }}
                              value={fC.ie_id ?? ""}
                              onChange={e => setFC(p => ({ ...p, ie_id: e.target.value || undefined }))}
                            >
                              <option value="">— selecione a IE —</option>
                              {iesProdutor.map(ie => (
                                <option key={ie.id} value={ie.id}>
                                  {ie.inscricao_estadual}{ie.municipio ? ` — ${ie.municipio}/${ie.estado}` : ` — ${ie.estado}`}
                                  {ie.ativa ? "" : " (inativa)"}
                                </option>
                              ))}
                            </select>
                          ) : iesProdutor.length === 1 ? (
                            <input
                              style={{ ...inp, background: "#F8F8F8", color: "#555", cursor: "default" }}
                              value={`${iesProdutor[0].inscricao_estadual} — ${iesProdutor[0].municipio ?? ""}/${iesProdutor[0].estado}`}
                              readOnly
                            />
                          ) : (
                            <input
                              style={{ ...inp, borderColor: "#DDE2EE" }}
                              placeholder="Não cadastrada — informe manualmente"
                              value={fC.ie_id ?? ""}
                              onChange={e => setFC(p => ({ ...p, ie_id: e.target.value || undefined }))}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ ...lbl, display:"flex", alignItems:"center", gap:8 }}>
                        {fC.is_triangulacao ? "Comprador Fiscal (Cooperativa / Intermediário)" : "Cliente / Comprador"}
                        <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, fontWeight:400, fontSize:10, color:"#C9921B", cursor:"pointer" }}
                          onClick={() => setFC(p => ({ ...p, is_triangulacao: !p.is_triangulacao, comprador_final_id:"" }))}>
                          <input type="checkbox" checked={fC.is_triangulacao} readOnly style={{ cursor:"pointer" }} /> Triangulação
                        </span>
                      </label>
                      <SelectPessoa value={fC.pessoa_id} onChange={id => setFC(p=>({...p,pessoa_id:id}))} pessoas={pessoas} />
                      {fC.pessoa_id && (() => { const cnpj = pessoas.find(p => p.id === fC.pessoa_id)?.cpf_cnpj; return cnpj ? (
                        <div style={{ marginTop:4, padding:"4px 8px", background:"var(--bg-page)", border:"0.5px solid var(--border-table)", borderRadius:6, fontSize:11, fontFamily:"monospace", color:"var(--text-2)", letterSpacing:"0.03em" }}>
                          {cnpj}
                        </div>
                      ) : null; })()}
                    </div>
                    {fC.is_triangulacao && (
                      <div>
                        <label style={lbl}>Comprador Final (Trading / Destino do Grão)</label>
                        <SelectPessoa value={fC.comprador_final_id} onChange={id => setFC(p=>({...p,comprador_final_id:id}))} pessoas={pessoas} borderColor="#C9921B" />
                        {fC.comprador_final_id && (() => { const cnpj = pessoas.find(p => p.id === fC.comprador_final_id)?.cpf_cnpj; return cnpj ? (
                          <div style={{ marginTop:4, padding:"4px 8px", background:"var(--bg-page)", border:"0.5px solid var(--border-table)", borderRadius:6, fontSize:11, fontFamily:"monospace", color:"var(--text-2)", letterSpacing:"0.03em" }}>
                            {cnpj}
                          </div>
                        ) : null; })()}
                      </div>
                    )}
                    <div>
                      <label style={lbl}>Nr. Contrato Cliente</label>
                      <input style={inp} value={fC.nr_contrato_cliente} onChange={e => setFC(p=>({...p,nr_contrato_cliente:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Contato Broker</label>
                      <input style={inp} value={fC.contato_broker} onChange={e => setFC(p=>({...p,contato_broker:e.target.value}))} />
                    </div>
                  </div>

                  {/* Linha 3: Grupo Vendedor | Vendedor | Prazo Entrega | Data Pagamento */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Grupo Vendedor</label>
                      <input style={inp} value={fC.grupo_vendedor} onChange={e => setFC(p=>({...p,grupo_vendedor:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Vendedor</label>
                      <input style={inp} value={fC.vendedor} onChange={e => setFC(p=>({...p,vendedor:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Prazo de Entrega *</label>
                      <input style={inp} type="date" value={fC.data_entrega} onChange={e => { setFC(p=>({...p,data_entrega:e.target.value})); setErrosContrato([]); }} />
                    </div>
                    <div>
                      <label style={lbl}>Data de Pagamento</label>
                      <input style={inp} type="date" value={fC.data_pagamento ?? ""} onChange={e => setFC(p=>({...p,data_pagamento:e.target.value||undefined}))} />
                      <span style={{ fontSize:10, color:"var(--text-3)", marginTop:2, display:"block" }}>Gera CR ao confirmar</span>
                    </div>
                  </div>

                  {/* Linha 3b: Modalidade + Moeda */}
                  <div style={{ display:"grid", gridTemplateColumns:"160px 110px 1fr", gap:12, marginBottom:12, alignItems:"end" }}>
                    <div>
                      <label style={lbl}>Modalidade de Preço</label>
                      <select style={inp} value={fC.modalidade} onChange={e => setFC(p=>({...p,modalidade:e.target.value as Contrato["modalidade"]}))}>
                        <option value="fixo">Fixo (R$/sc)</option>
                        <option value="a_fixar">A fixar / Basis</option>
                        <option value="barter">Barter</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Moeda</label>
                      <select style={inp} value={fC.moeda} onChange={e => setFC(p=>({...p,moeda:e.target.value as Contrato["moeda"]}))}>
                        <option value="BRL">R$ — Real</option>
                        <option value="USD">US$ — Dólar</option>
                      </select>
                    </div>
                    {fC.moeda === "USD" && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#FAEEDA", border:"0.5px solid #E8C97A", borderRadius:7, fontSize:12 }}>
                        <span style={{ color:"#633806" }}>PTAX D-1: <strong>R$ {ptaxAtual.toFixed(4)}</strong></span>
                        <span style={{ color:"var(--text-3)", fontSize:10 }}>· atualizado automaticamente</span>
                      </div>
                    )}
                  </div>

                  {/* Linha 4: Natureza de Operação | CFOP | Saldo Contrato | Frete | Valor Frete */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 160px 160px 120px", gap:12, marginBottom:4 }}>
                    <div>
                      <label style={{ ...lbl, display:"flex", alignItems:"center", gap:6 }}>
                        Natureza de Operação das Notas Fiscais
                        {fC.natureza_codigo && fC.natureza_codigo === naturezaSugerida && (
                          <span style={{ fontSize:9, background:"#D5F0E4", color:"#16703A", padding:"1px 6px", borderRadius:6, fontWeight:600 }}>
                            ✦ sugerida automaticamente
                          </span>
                        )}
                      </label>
                      <select style={inp} value={fC.natureza_codigo}
                        onChange={e => {
                          const nat = NATUREZAS_OPERACAO.find(n => n.codigo === e.target.value);
                          setNaturezaSugerida(""); // usuário editou manualmente — cancela sugestão
                          setFC(p=>({
                            ...p,
                            natureza_codigo:   e.target.value,
                            natureza_operacao: nat?.descricao ?? "",
                            cfop:              nat?.cfop ?? p.cfop,
                          }));
                        }}>
                        <option value="">— selecione a natureza —</option>
                        {(["Vendas", "Exportação", "Venda à Ordem", "Remessas"] as const).map(grupo => (
                          <optgroup key={grupo} label={grupo}>
                            {NATUREZAS_OPERACAO.filter(n => n.grupo === grupo).map(n => (
                              <option key={n.codigo} value={n.codigo}>{n.descricao} (CFOP {n.cfop})</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>CFOP <span style={{ color:"var(--text-3)", fontWeight:400 }}>(auto)</span></label>
                      <input style={inp} value={fC.cfop} onChange={e => setFC(p=>({...p,cfop:e.target.value}))} placeholder="6101" />
                    </div>
                    <div>
                      <label style={lbl}>Saldo do Contrato</label>
                      <select style={inp} value={fC.saldo_tipo} onChange={e => setFC(p=>({...p,saldo_tipo:e.target.value as Contrato["saldo_tipo"]}))}>
                        <option value="peso_saida">Peso Saída</option>
                        <option value="peso_entrada">Peso Entrada</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Frete</label>
                      <select style={inp} value={fC.frete} onChange={e => setFC(p=>({...p,frete:e.target.value as Contrato["frete"]}))}>
                        {FRETES.map(f => <option key={f} value={f}>{FRETE_LBL[f]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Valor Frete (R$)</label>
                      <InputMonetario style={inp} value={fC.valor_frete||""} onChange={v => setFC(p=>({...p,valor_frete:v}))} placeholder="0,00" />
                    </div>
                  </div>

                  {/* Box de informação fiscal — aparece quando natureza selecionada */}
                  {fC.natureza_codigo && (() => {
                    const nat = NATUREZAS_OPERACAO.find(n => n.codigo === fC.natureza_codigo);
                    if (!nat) return null;
                    return (
                      <div style={{ background:"#EBF4FB", border:"0.5px solid #93C5E8", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:11 }}>
                        <div style={{ fontWeight:600, color:"#0D0D0D", marginBottom:4 }}>Informação Fiscal — {nat.descricao}</div>
                        <div style={{ display:"flex", gap:24, flexWrap:"wrap", color:"#111111" }}>
                          <span>CFOP: <strong>{nat.cfop}</strong></span>
                          <span>CST ICMS: <strong>{nat.cst_icms}</strong></span>
                        </div>
                        <div style={{ color:"var(--text-2)", marginTop:4 }}>{nat.obs}</div>
                      </div>
                    );
                  })()}

                  {/* ── GRID DE ITENS ── */}
                  <div style={{ border:"0.5px solid var(--border-table)", borderRadius:10, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ padding:"8px 14px", background:"var(--bg-page)", borderBottom:"0.5px solid var(--border-table)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"var(--text-2)" }}>Itens do Contrato</span>
                      <button style={{ fontSize:11, padding:"3px 10px", border:"0.5px solid #2A2A2A", borderRadius:5, background:"#E6F1FB", color:"#2A2A2A", cursor:"pointer" }}
                        onClick={() => { setItens(p => [...p, itemVazio()]); setErrosContrato([]); }}>+ Item</button>
                    </div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"var(--bg-card)" }}>
                          {["Tipo","Item / Produto","Peso (kg)","Equiv. (sc)", fC.moeda === "USD" ? "Valor (US$/sc)" : "Valor (R$/sc)","Valor Total",""].map((h,i) => (
                            <th key={i} style={{ padding:"6px 10px", textAlign: i>=2&&i<=5?"center":"left", fontSize:10, fontWeight:600, color:"var(--text-2)", borderBottom:"0.5px solid var(--border-table)", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {itensCalc.map((it,idx) => (
                          <tr key={idx} style={{ borderBottom:"0.5px solid #eee" }}>
                            <td style={{ padding:"6px 8px", width:90 }}>
                              <select style={{ ...inp, fontSize:11 }} value={it.tipo} onChange={e => atualizarItem(idx,"tipo",e.target.value)}>
                                <option>Produto</option>
                                <option>Serviço</option>
                              </select>
                            </td>
                            <td style={{ padding:"6px 8px", minWidth:130 }}>
                              <select style={{ ...inp, fontSize:11 }} value={it.produto} onChange={e => atualizarItem(idx,"produto",e.target.value)}>
                                {PRODUTOS_DIN.map(pr => <option key={pr}>{pr}</option>)}
                              </select>
                            </td>
                            {/* Peso em kg — campo primário */}
                            <td style={{ padding:"6px 8px", width:120 }}>
                              <InputNumerico style={{ ...inp, textAlign:"right", fontSize:12 }} decimais={0} min="0"
                                value={it._qKg > 0 ? it._qKg : ""}
                                onChange={v => atualizarItem(idx,"quantidade_kg",v)}
                                placeholder="0 kg" />
                              <span style={{ fontSize:9, color:"var(--text-3)", display:"block", textAlign:"right", marginTop:1 }}>kg</span>
                            </td>
                            {/* Sacas equivalentes — campo secundário */}
                            <td style={{ padding:"6px 8px", width:110 }}>
                              <InputNumerico style={{ ...inp, textAlign:"right", fontSize:12, background:"#F8FAFF", borderColor:"#C4D0E8" }} decimais={3} min="0"
                                value={it._qSc > 0 ? +it._qSc.toFixed(3) : ""}
                                onChange={v => atualizarItem(idx,"quantidade_sc",v)}
                                placeholder="0 sc" />
                              <span style={{ fontSize:9, color:"var(--text-3)", display:"block", textAlign:"right", marginTop:1 }}>sc ({classeCommodityDin(it.produto).kg_saca} kg/sc)</span>
                            </td>
                            <td style={{ padding:"6px 8px", width:120 }}>
                              <InputMonetario style={{ ...inp, textAlign:"right", fontSize:12 }} decimais={4} min="0" value={it.valor_unitario||""} onChange={v => atualizarItem(idx,"valor_unitario",v)} placeholder="0,0000" />
                            </td>
                            <td style={{ padding:"6px 8px", width:130 }}>
                              <input style={{ ...inp, background:"var(--bg-page)", textAlign:"right", fontSize:12, fontWeight:600, color:"#111111" }}
                                value={(it.valor_total??0).toLocaleString("pt-BR",{style:"currency",currency: fC.moeda === "USD" ? "USD" : "BRL"})} readOnly />
                            </td>
                            <td style={{ padding:"6px 8px", width:34 }}>
                              {itens.length > 1 && <button style={btnX} onClick={() => setItens(p => p.filter((_,i)=>i!==idx))}>✕</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Rodapé de totais */}
                    {(() => {
                      const fmtValor = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency: fC.moeda === "USD" ? "USD" : "BRL" });
                      return (
                        <div style={{ padding:"8px 14px", background:"var(--bg-page)", borderTop:"0.5px solid var(--border-table)", display:"flex", justifyContent:"flex-end", gap:32 }}>
                          <span style={{ fontSize:12, color:"var(--text-2)" }}>Valor Financeiro: <strong style={{ color:"var(--text-1)" }}>{fmtValor(valorFinanceiro)}</strong></span>
                          <span style={{ fontSize:12, color:"var(--text-2)" }}>Frete: <strong style={{ color:"var(--text-1)" }}>{fmtR$(fC.valor_frete||0)}</strong></span>
                          <span style={{ fontSize:13, fontWeight:600, color:"#111111" }}>Valor Total: {fmtValor(valorTotal)}</span>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {abaForm === "adicionais" && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div>
                      <label style={lbl}>Propriedade <span style={{ color:"var(--text-3)", fontWeight:400 }}>(fazenda)</span></label>
                      <select style={{ ...inp, color: fC.propriedade ? "var(--text-1)" : "var(--text-3)" }}
                        value={fC.propriedade} onChange={e => setFC(p=>({...p,propriedade:e.target.value}))}>
                        {fazendas.length === 0
                          ? <option value="">Nenhuma fazenda cadastrada</option>
                          : <>
                              <option value="">— selecione a propriedade —</option>
                              {fazendas.map(f => <option key={f.id} value={f.nome}>{f.nome}{f.municipio ? ` — ${f.municipio}/${f.estado}` : ""}</option>)}
                            </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Empreendimento / Ciclo <span style={{ color:"var(--text-3)", fontWeight:400 }}>(vinculado à safra selecionada)</span></label>
                      <select style={{ ...inp, color: fC.ciclo_id ? "var(--text-1)" : "var(--text-3)" }}
                        value={fC.ciclo_id} onChange={e => setFC(p=>({...p,ciclo_id:e.target.value}))}>
                        {!fC.ano_safra_id
                          ? <option value="">Selecione a Safra na aba Principal primeiro</option>
                          : ciclos.length === 0
                            ? <option value="">Nenhum ciclo cadastrado para esta safra</option>
                            : <>
                                <option value="">— selecione o ciclo —</option>
                                {ciclos.map(ci => <option key={ci.id} value={ci.id}>{ci.descricao} — {ci.cultura}</option>)}
                              </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Seguradora</label>
                      <input style={inp} value={fC.seguradora} onChange={e => setFC(p=>({...p,seguradora:e.target.value}))} placeholder="Nome da seguradora" />
                    </div>
                    <div>
                      <label style={lbl}>Corretora</label>
                      <input style={inp} value={fC.corretora} onChange={e => setFC(p=>({...p,corretora:e.target.value}))} placeholder="Nome da corretora" />
                    </div>
                    <div>
                      <label style={lbl}>Conhecimento de Transporte Eletrônico (CT-e)</label>
                      <input style={inp} value={fC.cte_numero} onChange={e => setFC(p=>({...p,cte_numero:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Terceiro</label>
                      <select style={{ ...inp, color: fC.terceiro ? "var(--text-1)" : "var(--text-3)" }}
                        value={fC.terceiro} onChange={e => setFC(p=>({...p,terceiro:e.target.value}))}>
                        <option value="">— selecione (opcional) —</option>
                        {pessoas.map(p => <option key={p.id} value={p.nome}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Depósito de Carregamento</label>
                      <select style={{ ...inp, color: fC.deposito_carregamento ? "var(--text-1)" : "var(--text-3)" }}
                        value={fC.deposito_carregamento}
                        onChange={e => setFC(p=>({...p, deposito_carregamento: e.target.value}))}>
                        {depositos.length === 0
                          ? <option value="">Cadastre depósitos em Cadastros → Depósitos</option>
                          : <>
                              <option value="">— selecione o depósito —</option>
                              {depositos.map(d => (
                                <option key={d.id} value={d.nome}>
                                  {d.nome}{d.tipo ? ` (${d.tipo})` : ""}
                                </option>
                              ))}
                            </>
                        }
                      </select>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:18 }}>
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                        <input type="checkbox" checked={fC.deposito_fiscal} onChange={e => setFC(p=>({...p,deposito_fiscal:e.target.checked}))} /> Depósito Fiscal
                      </label>
                    </div>

                    {/* ── Local de Entrega ──────────────────────────── */}
                    <div style={{ gridColumn:"1/-1", borderTop:"0.5px solid var(--border-table)", paddingTop:12, marginTop:4 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
                        Local de Entrega <span style={{ fontSize:10, fontWeight:400, color:"var(--text-3)", textTransform:"none" }}>— preencha apenas se diferente do endereço do comprador</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                        <div style={{ gridColumn:"1/-1" }}>
                          <label style={lbl}>Armazém / Destino cadastrado</label>
                          <select style={{ ...inp, color: fC.local_entrega_pessoa_id ? "var(--text-1)" : "var(--text-3)" }}
                            value={fC.local_entrega_pessoa_id}
                            onChange={e => {
                              const p = pessoas.find(x => x.id === e.target.value);
                              setFC(prev => ({
                                ...prev,
                                local_entrega_pessoa_id: e.target.value,
                                local_entrega_nome: p?.nome ?? prev.local_entrega_nome,
                                local_entrega_cnpj: p?.cpf_cnpj ?? prev.local_entrega_cnpj,
                              }));
                            }}>
                            <option value="">— selecione um cadastro (opcional) —</option>
                            {pessoas.map(p => (
                              <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Razão Social / Nome</label>
                          <input style={inp} value={fC.local_entrega_nome}
                            onChange={e => setFC(p=>({...p, local_entrega_nome: e.target.value}))}
                            placeholder="Ex: Terminal Graneleiro Sorriso" />
                        </div>
                        <div>
                          <label style={lbl}>CNPJ</label>
                          <input style={inp} value={fC.local_entrega_cnpj}
                            onChange={e => setFC(p=>({...p, local_entrega_cnpj: e.target.value}))}
                            placeholder="00.000.000/0000-00" />
                        </div>
                        <div>
                          <label style={lbl}>Logradouro / Endereço</label>
                          <input style={inp} value={fC.local_entrega_logradouro}
                            onChange={e => setFC(p=>({...p, local_entrega_logradouro: e.target.value}))}
                            placeholder="Ex: Rodovia BR-163, km 742" />
                        </div>
                        <div>
                          <label style={lbl}>Município</label>
                          <input style={inp} value={fC.local_entrega_municipio}
                            onChange={e => setFC(p=>({...p, local_entrega_municipio: e.target.value}))}
                            placeholder="Ex: Sorriso" />
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:8 }}>
                          <div>
                            <label style={lbl}>UF</label>
                            <input style={inp} value={fC.local_entrega_uf} maxLength={2}
                              onChange={e => setFC(p=>({...p, local_entrega_uf: e.target.value.toUpperCase()}))}
                              placeholder="MT" />
                          </div>
                          <div>
                            <label style={lbl}>CEP</label>
                            <input style={inp} value={fC.local_entrega_cep}
                              onChange={e => setFC(p=>({...p, local_entrega_cep: e.target.value}))}
                              placeholder="00000-000" />
                          </div>
                        </div>
                        {fC.local_entrega_nome && (
                          <div style={{ gridColumn:"1/-1" }}>
                            <button type="button"
                              onClick={() => setFC(p=>({...p, local_entrega_pessoa_id:"", local_entrega_nome:"", local_entrega_cnpj:"", local_entrega_logradouro:"", local_entrega_municipio:"", local_entrega_uf:"", local_entrega_cep:""}))}
                              style={{ fontSize:11, color:"#E24B4A", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                              ✕ Limpar local de entrega (usar endereço do comprador)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs.</label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao} onChange={e => setFC(p=>({...p,observacao:e.target.value}))} />
                    </div>
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs. Contrato <span style={{ color:"var(--text-3)" }}>(não constam nas notas fiscais)</span></label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao_interna} onChange={e => setFC(p=>({...p,observacao_interna:e.target.value}))} />
                    </div>
                  </div>

                  {/* ── Documento / Anexo ─────────────────────────── */}
                  <div style={{ borderTop:"0.5px solid var(--border-table)", paddingTop:14, marginTop:4, marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Documento / Anexo</div>
                    {fC.pdf_url ? (
                      <div style={{ display:"flex", alignItems:"center", gap:10, background:"#E8F3FB", border:"0.5px solid #11111140", borderRadius:8, padding:"8px 14px" }}>
                        <span style={{ fontSize:12, color:"#0D0D0D" }}>📎 <strong>{fC.pdf_nome ?? "contrato.pdf"}</strong></span>
                        <a href={fC.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#111111", fontWeight:600, textDecoration:"none" }}>Abrir ↗</a>
                        <label style={{ marginLeft:"auto", padding:"4px 12px", background:"#111111", color:"#fff", borderRadius:6, fontSize:11, fontWeight:600, cursor: anexandoPdf ? "default" : "pointer" }}>
                          {anexandoPdf ? "Enviando…" : "Trocar PDF"}
                          <input type="file" accept="application/pdf" style={{ display:"none" }} disabled={anexandoPdf}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleAnexarPdf(f); e.target.value=""; }} />
                        </label>
                      </div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <label style={{ padding:"7px 16px", background: anexandoPdf ? "#ddd" : "transparent", border:"0.5px solid var(--border-table)", borderRadius:7, fontSize:12, fontWeight:600, cursor: anexandoPdf ? "default" : "pointer", color:"var(--text-1)" }}>
                          {anexandoPdf ? "Enviando…" : "📎 Anexar PDF do contrato"}
                          <input type="file" accept="application/pdf" style={{ display:"none" }} disabled={anexandoPdf}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleAnexarPdf(f); e.target.value=""; }} />
                        </label>
                        <span style={{ fontSize:11, color:"var(--text-3)" }}>PDF assinado, digitalização ou arquivo original da trading</span>
                      </div>
                    )}
                  </div>

                  {/* ── Documentos adicionais ─────────────────────── */}
                  {editContrato && fazendaId && (
                    <div style={{ borderTop:"0.5px solid var(--border-table)", paddingTop:14, marginTop:4, marginBottom:14 }}>
                      <AnexoDocumentos
                        entidade_tipo="contrato_venda"
                        entidade_id={editContrato.id}
                        fazenda_id={fazendaId}
                        label="Outros Documentos"
                      />
                    </div>
                  )}

                  {/* ── Cessão ─────────────────────────────────────── */}
                  <div style={{ borderTop:"0.5px solid var(--border-table)", paddingTop:14, marginTop:4 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Cessão de Recebível</div>
                    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:fC.dado_em_cessao?14:0 }}>
                      <input
                        type="checkbox"
                        checked={fC.dado_em_cessao}
                        onChange={e => setFC(p=>({...p, dado_em_cessao:e.target.checked, cessao_beneficiarios: e.target.checked ? p.cessao_beneficiarios : []}))}
                      />
                      <span style={{ fontSize:13, fontWeight:600, color: fC.dado_em_cessao ? "#111111" : "#444" }}>Dado em Cessão</span>
                      <span style={{ fontSize:11, color:"var(--text-3)", fontWeight:400 }}>— o recebível será cedido a um ou mais fornecedores</span>
                    </label>

                    {fC.dado_em_cessao && (
                      <div>
                        {/* Lista de beneficiários */}
                        {fC.cessao_beneficiarios.map((benef, bi) => {
                          const debsBenef = Object.entries(cessaoSelecionados).filter(([, v]) => v.fornId === benef.fornecedor_id);
                          const totalBenef = debsBenef.reduce((s, [, v]) => s + v.valor, 0);
                          return (
                            <div key={benef.key} style={{ border:"0.5px solid var(--border-table)", borderRadius:8, padding:"10px 12px", marginBottom:10, background:"var(--bg-page)" }}>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 160px auto", gap:8, alignItems:"end" }}>
                                <div>
                                  <label style={lbl}>Fornecedor beneficiário {fC.cessao_beneficiarios.length > 1 ? `(${bi+1})` : ""} *</label>
                                  <select
                                    style={{ ...inp, color: benef.fornecedor_id ? "var(--text-1)" : "var(--text-3)" }}
                                    value={benef.fornecedor_id}
                                    onChange={e => {
                                      const nome = pessoas.find(p=>p.id===e.target.value)?.nome ?? "";
                                      setFC(p => ({ ...p, cessao_beneficiarios: p.cessao_beneficiarios.map((b, i) => i===bi ? { ...b, fornecedor_id:e.target.value, fornecedor_nome:nome } : b) }));
                                    }}
                                  >
                                    <option value="">— selecione o fornecedor —</option>
                                    {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={lbl}>Data da Cessão</label>
                                  <input type="date" style={inp} value={benef.data} onChange={e => setFC(p => ({ ...p, cessao_beneficiarios: p.cessao_beneficiarios.map((b, i) => i===bi ? { ...b, data:e.target.value } : b) }))} />
                                </div>
                                <button type="button" onClick={() => {
                                  setFC(p => ({ ...p, cessao_beneficiarios: p.cessao_beneficiarios.filter((_, i) => i !== bi) }));
                                  setCessaoSelecionados(prev => { const n={...prev}; Object.keys(n).filter(k => n[k].fornId === benef.fornecedor_id).forEach(k => delete n[k]); return n; });
                                }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#E24B4A", padding:"0 4px", alignSelf:"flex-end", marginBottom:2 }}>×</button>
                              </div>
                              <div style={{ marginTop:8 }}>
                                <label style={lbl}>Observação</label>
                                <input style={inp} value={benef.obs} onChange={e => setFC(p => ({ ...p, cessao_beneficiarios: p.cessao_beneficiarios.map((b, i) => i===bi ? { ...b, obs:e.target.value } : b) }))} placeholder="Ex: quitação barter safra 25/26..." />
                              </div>
                              <div style={{ marginTop:8, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <span style={{ fontSize:11, color:"var(--text-2)" }}>
                                  Débitos vinculados: <strong>{debsBenef.length}</strong>
                                  {debsBenef.length > 0 && <span style={{ marginLeft:6, color:"#111" }}>— Total: R$ {totalBenef.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>}
                                </span>
                                <button type="button" disabled={!benef.fornecedor_id}
                                  onClick={() => abrirModalCessao(benef.fornecedor_id)}
                                  style={{ padding:"5px 12px", border:"0.5px solid #111", borderRadius:6, background: benef.fornecedor_id ? "#EEEEEE" : "var(--bg-page)", color: benef.fornecedor_id ? "#111" : "var(--text-muted)", fontSize:11, fontWeight:600, cursor: benef.fornecedor_id ? "pointer" : "not-allowed" }}>
                                  Vincular Débitos CP / PC →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <button type="button"
                          onClick={() => setFC(p => ({ ...p, cessao_beneficiarios: [...p.cessao_beneficiarios, { key:`k${Date.now()}`, fornecedor_id:"", fornecedor_nome:"", data:"", obs:"" }] }))}
                          style={{ padding:"6px 14px", border:"0.5px dashed var(--border-table)", borderRadius:7, background:"transparent", color:"#1A4870", fontSize:12, fontWeight:600, cursor:"pointer", width:"100%" }}>
                          + Adicionar fornecedor beneficiário
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rodapé do modal */}
            <div style={{ padding:"12px 20px", borderTop:"0.5px solid var(--border-table)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--bg-card)" }}>
              <div style={{ fontSize:11, color:"var(--text-2)" }}>
                {(() => {
                  const fv = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency: fC.moeda === "USD" ? "USD" : "BRL" });
                  return <>Valor Financeiro: <strong>{fv(valorFinanceiro)}</strong><span style={{ marginLeft:20 }}>Valor Total: <strong style={{ color:"#111111" }}>{fv(valorTotal)}</strong></span></>;
                })()}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {!viewOnly && errosContrato.length > 0 && (
                  <div style={{ fontSize:12, color:"#E24B4A", maxWidth:360, lineHeight:1.4 }}>
                    Preencha antes de salvar: <strong>{errosContrato.join(", ")}</strong>
                  </div>
                )}
                <button style={btnR} onClick={() => { setModalContrato(false); setErrosContrato([]); }}>{viewOnly ? "Fechar" : "Cancelar"}</button>
                {!viewOnly && (
                  <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarContrato}>
                    {salvando ? "Salvando…" : editContrato ? "Salvar Alterações" : "Salvar Contrato"}
                  </button>
                )}
                {viewOnly && editContrato && (
                  <button onClick={() => setViewOnly(false)}
                    style={{ padding:"8px 20px", border:"none", borderRadius:8, background:"#C9921B", color:"white", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    ✏ Editar este Contrato
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ROMANEIO ══════════════════════════════════════ */}
      {modalRomaneio && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}
          onClick={e => { if (e.target===e.currentTarget) { setModalRomaneio(false); setEditRomaneio(null); setFRom(ROM_VAZIO()); } }}>
          <div style={{ background:"var(--bg-card)", borderRadius:14, padding:26, width:780, maxWidth:"97vw", maxHeight:"95vh", overflowY:"auto" }}>
            <div style={{ fontWeight:600, fontSize:15, color:"var(--text-1)", marginBottom:2 }}>{editRomaneio ? `Editar Romaneio ${editRomaneio.numero}` : "Novo Romaneio de Expedição"}</div>
            <div style={{ fontSize:12, color:"var(--text-2)", marginBottom:16 }}>{editRomaneio ? "Corrija os dados e salve. Lançamentos financeiros existentes não são alterados." : "Pesagem + Classificação do grão. NF-e gerada automaticamente."}</div>

            {/* Contrato */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Contrato *</label>
              <select style={{ ...inp, fontSize:13, opacity: editRomaneio ? 0.7 : 1 }} value={fRom.contratoId} onChange={e => setFRom(p=>({...p,contratoId:e.target.value}))} disabled={!!editRomaneio}>
                <option value="">— selecione —</option>
                {contratos.filter(c=>c.status!=="encerrado"&&c.status!=="cancelado").map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {(c.comprador||"").split(" ")[0]} · {c.produto} · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</option>
                ))}
              </select>
            </div>
            {contratoSel && (
              <div style={{ background:"#E8E8E8", borderRadius:8, padding:"8px 14px", fontSize:11, display:"flex", gap:20, flexWrap:"wrap", marginBottom:14 }}>
                <span>Comprador: <strong>{contratoSel.comprador.split(" ").slice(0,2).join(" ")}</strong></span>
                <span>Produto: <strong>{produto_rom}</strong></span>
                {contratoSel.modalidade==="fixo" && <span>Preço: <strong>{fmtR$(contratoSel.preco??0)}/sc</strong></span>}
                <span>Saldo: <strong>{((contratoSel.quantidade_sc??0)-(contratoSel.entregue_sc??0)).toLocaleString("pt-BR")} sc</strong></span>
              </div>
            )}

            {/* Pesagem */}
            {/* Toggle: Balança própria vs CIF peso estimado */}
            <div style={{ display:"flex", gap:8, marginBottom:10, background:"#F4F6FA", borderRadius:8, padding:"6px 10px", border:"0.5px solid var(--border-table)", alignItems:"center" }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                <input type="checkbox" checked={fRom.pesoEstimado}
                  onChange={e => setFRom(p => ({ ...p, pesoEstimado: e.target.checked, pesoBruto:"", tara:"", pesoEstimadoKg:"" }))} />
                <strong>Peso Estimado (CIF)</strong>
              </label>
              <span style={{ fontSize:11, color:"var(--text-3)" }}>
                {fRom.pesoEstimado
                  ? "Caminhão do comprador — produtor declara o peso estimado; NF emitida com reserva de ajuste"
                  : "Balança própria: informe Peso Bruto e Tara para calcular o Peso Líquido"}
              </span>
            </div>
            {!fRom.pesoEstimado && (
              <BalancaSerial
                onCapturarBruto={kg => setFRom(p => ({ ...p, pesoBruto: String(Math.round(kg)) }))}
                onCapturarTara={kg  => setFRom(p => ({ ...p, tara:      String(Math.round(kg)) }))}
              />
            )}
            <div style={{ display:"grid", gridTemplateColumns: fRom.pesoEstimado ? "1fr 1fr" : "1fr 1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Placa do caminhão *</label>
                <input style={{ ...inp, textTransform:"uppercase" }} placeholder="ABC-1D23" value={fRom.placa} onChange={e => setFRom(p=>({...p,placa:e.target.value}))} />
              </div>
              {fRom.pesoEstimado ? (
                <div>
                  <label style={lbl}>Peso Estimado (kg) *</label>
                  <InputNumerico style={{ ...inp, borderColor:"#C9921B" }} decimais={0} placeholder="26500" value={fRom.pesoEstimadoKg} onChange={v => setFRom(p=>({...p,pesoEstimadoKg:v}))} />
                  <div style={{ fontSize:10, marginTop:2, color:"#C9921B" }}>≈ {plCalc > 0 ? (plCalc/60).toFixed(0) : "—"} sc estimadas</div>
                </div>
              ) : (
                <>
                  <div>
                    <label style={lbl}>Peso bruto (kg) *</label>
                    <InputNumerico style={inp} decimais={0} placeholder="43800" value={fRom.pesoBruto} onChange={v => setFRom(p=>({...p,pesoBruto:v}))} />
                  </div>
                  <div>
                    <label style={lbl}>Tara — caminhão vazio (kg) *</label>
                    <InputNumerico style={inp} decimais={0} placeholder="17200" value={fRom.tara} onChange={v => setFRom(p=>({...p,tara:v}))} />
                  </div>
                </>
              )}
            </div>

            {/* Classificação */}
            {plCalc > 0 && (
              <>
                {/* ── Cabeçalho da seção de classificação ── */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"0.5px solid var(--border-table)", paddingBottom:6, marginBottom:12 }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:600, color:"var(--text-2)" }}>Classificação do Grão</span>
                    <span style={{ marginLeft:10, fontSize:10, fontWeight:400, color:"var(--text-3)" }}>
                      Padrão {produto_rom}: Umidade {clsComm.umidade_padrao}% · Impureza {clsComm.impureza_padrao}% · Avariados {clsComm.avariados_padrao}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFRom(p => ({
                      ...p,
                      umidade:          String(clsComm.umidade_padrao),
                      impureza:         String(clsComm.impureza_padrao),
                      ardidos:          "0",
                      mofados:          "0",
                      fermentados:      "0",
                      germinados:       "0",
                      esverdeados:      "0",
                      quebrados:        "0",
                      carunchados:      "0",
                      outros_avariados: "0",
                    }))}
                    style={{ fontSize:11, fontWeight:600, color:"#111111", background:"#E8E8E8", border:"0.5px solid #A8C8E8", borderRadius:6, padding:"4px 10px", cursor:"pointer", whiteSpace:"nowrap" }}
                  >
                    ✦ Class. Padrão
                  </button>
                </div>

                {/* ── Umidade + Impureza + PH ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <label style={lbl}>Umidade (%)</label>
                    <InputNumerico style={inp} min="0" max="40" placeholder={String(clsComm.umidade_padrao)}
                      value={fRom.umidade} onChange={v => setFRom(p=>({...p,umidade:v}))} />
                    {descUmid > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descUmid)}</div>}
                    {romUmidade > 0 && romUmidade <= clsComm.umidade_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>Impureza / Matérias Estranhas (%)</label>
                    <InputNumerico style={inp} min="0" max="20" placeholder={String(clsComm.impureza_padrao)}
                      value={fRom.impureza} onChange={v => setFRom(p=>({...p,impureza:v}))} />
                    {descImpur > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descImpur)}</div>}
                    {romImpureza > 0 && romImpureza <= clsComm.impureza_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>PH — Peso Hectolítrico (kg/hl)</label>
                    <InputNumerico style={inp} min="50" max="100" placeholder={isSoja ? "78" : isMilho ? "74" : "—"}
                      value={fRom.ph} onChange={v => setFRom(p=>({...p,ph:v}))} />
                    {fRom.ph && <div style={{ fontSize:10, color: parseFloat(fRom.ph) >= (isSoja?78:74) ? "#16A34A" : "#E24B4A", marginTop:2 }}>
                      {parseFloat(fRom.ph) >= (isSoja?78:74) ? "Dentro do padrão ✓" : "Abaixo do mínimo ↓"}
                    </div>}
                  </div>
                </div>

                {/* ── Avariados — detalhamento por commodity ── */}
                <div style={{ background:"#F8F9FC", border:"0.5px solid var(--border)", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--text-2)", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>Avariados — detalhamento{isSoja ? " (ABIOVE / IN MAPA 11/2007)" : isMilho ? " (IN MAPA 60/2011)" : ""}</span>
                    {romAvariados > 0 && (
                      <span style={{ fontSize:11, fontWeight:700, color: romAvariados > clsComm.avariados_padrao ? "#E24B4A" : "#16A34A" }}>
                        Total: {romAvariados.toFixed(2)}%
                        {romAvariados > clsComm.avariados_padrao ? ` (desc: ${fmtPeso(descAvar)})` : " ✓"}
                      </span>
                    )}
                  </div>
                  {(isSoja || !isMilho) ? (
                    /* Soja — 7 sub-parâmetros */
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                      {([
                        { key:"ardidos",         label:"Ardidos / Queimados (%)" },
                        { key:"mofados",         label:"Mofados (%)" },
                        { key:"fermentados",     label:"Fermentados (%)" },
                        { key:"germinados",      label:"Germinados (%)" },
                        { key:"esverdeados",     label:"Esverdeados / Imaturos (%)" },
                        { key:"quebrados",       label:"Quebrados / Amassados (%)" },
                        { key:"outros_avariados",label:"Outros Avariados (%)" },
                      ] as {key: keyof typeof fRom; label: string}[]).map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" }}>{label}</label>
                          <InputNumerico style={{ ...inp, fontSize:12, padding:"5px 8px" }} min="0" max="100"
                            value={fRom[key] as string} onChange={v => setFRom(p=>({...p,[key]:v}))} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Milho — 6 sub-parâmetros */
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                      {([
                        { key:"ardidos",          label:"Ardidos e Brotados (%)" },
                        { key:"mofados",          label:"Mofados (%)" },
                        { key:"fermentados",      label:"Fermentados (%)" },
                        { key:"carunchados",      label:"Carunchados / Atacados por Insetos (%)" },
                        { key:"quebrados",        label:"Quebrados e Abaulados (%)" },
                        { key:"outros_avariados", label:"Outros Avariados (%)" },
                      ] as {key: keyof typeof fRom; label: string}[]).map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" }}>{label}</label>
                          <InputNumerico style={{ ...inp, fontSize:12, padding:"5px 8px" }} min="0" max="100"
                            value={fRom[key] as string} onChange={v => setFRom(p=>({...p,[key]:v}))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Apuração ── */}
                <div style={{ background: temClassif&&(descUmid+descImpur+descAvar)>0 ? "#FFF3E0" : "#E8E8E8", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#0D0D0D", marginBottom:8 }}>Apuração — Balança de Saída (Fazenda)</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"var(--text-2)" }}>Peso Líquido</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-1)" }}>{fmtPeso(plCalc)}</div>
                    </div>
                    {temClassif && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"var(--text-2)" }}>Descontos (U+I+A)</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#E24B4A" }}>−{fmtPeso(descUmid+descImpur+descAvar)}</div>
                      </div>
                    )}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"var(--text-2)" }}>Peso Classificado</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#0D0D0D" }}>{fmtPeso(temClassif?pesoClass:plCalc)}</div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"var(--text-2)" }}>Sacas ({clsComm.kg_saca} kg)</div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#111111" }}>{sacasCalc.toLocaleString("pt-BR")} sc</div>
                      {contratoSel?.modalidade==="fixo" && (
                        <div style={{ fontSize:10, color:"var(--text-2)" }}>{fmtR$(sacasCalc*(contratoSel.preco??0))}</div>
                      )}
                    </div>
                  </div>
                  {!temClassif && <div style={{ fontSize:10, color:"var(--text-3)", marginTop:6 }}>Preencha a classificação para calcular descontos e peso líquido faturável.</div>}
                  {/* AUTO-NF desativado — faturamento manual via botão "Faturar" na aba Expedição */}
                </div>

                {/* ── Peso Recebido / Faturado pelo Comprador ── */}
                <div style={{ background: fRom.pesoEstimado ? "#FFF7ED" : "#FBF3E0", border:`0.5px solid ${fRom.pesoEstimado ? "#F97316" : "#F6C87A"}`, borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7A5A12", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                    {fRom.pesoEstimado
                      ? <span style={{ background:"#F97316", color:"#fff", padding:"1px 7px", borderRadius:5, fontSize:10 }}>PESO ESTIMADO</span>
                      : null}
                    Peso Recebido pelo Comprador
                    <span style={{ fontSize:10, fontWeight:400, color:"var(--text-3)" }}>
                      {fRom.pesoEstimado
                        ? "— NF será emitida com peso estimado. Preencha o peso real do comprador para verificar se é necessária NF Complementar."
                        : "Preencher após receber o ticket de pesagem do destino"}
                    </span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                    <div>
                      <label style={{ fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" }}>Peso Classificado Destino (kg)</label>
                      <InputNumerico style={{ ...inp, fontSize:12 }} decimais={0} placeholder="Ex: 26480"
                        value={fRom.peso_destino} onChange={v => setFRom(p=>({...p,peso_destino:v}))} />
                      {pesoDest > 0 && pesoClass > 0 && (
                        <div style={{ fontSize:10, marginTop:2, color: Math.abs(difKg)/pesoClass > 0.005 ? "#E24B4A" : "#16A34A" }}>
                          {difKg > 0 ? `Diferença: −${fmtPeso(difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` :
                           difKg < 0 ? `Acréscimo: +${fmtPeso(-difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` : "Sem divergência ✓"}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" }}>Sacas Faturadas na NF Comprador</label>
                      <InputNumerico style={{ ...inp, fontSize:12 }} decimais={3} placeholder={String(sacasCalc)}
                        value={fRom.sacas_faturadas} onChange={v => setFRom(p=>({...p,sacas_faturadas:v}))} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"var(--text-2)", marginBottom:3, display:"block" }}>Obs. Divergência</label>
                      <input style={{ ...inp, fontSize:12 }} placeholder="Ex: rejeição por ardidos"
                        value={fRom.obs_divergencia} onChange={e => setFRom(p=>({...p,obs_divergencia:e.target.value}))} />
                    </div>
                  </div>
                  {/* Alerta NF Complementar para peso estimado com diferença > 0.5% */}
                  {fRom.pesoEstimado && pesoDest > 0 && Math.abs(difKg) / plCalc > 0.005 && (
                    <div style={{ marginTop:10, background:"#FEF2F2", border:"0.5px solid #FCA5A5", borderRadius:7, padding:"8px 12px", fontSize:11, color:"#991B1B", display:"flex", alignItems:"center", gap:8 }}>
                      <span>⚠️</span>
                      <div>
                        <strong>NF Complementar necessária</strong> — diferença de {fmtPeso(Math.abs(difKg))} ({(Math.abs(difKg)/plCalc*100).toFixed(2)}%) entre o peso estimado e o peso real do comprador.
                        Após salvar, emita uma NF Complementar em <strong>Fiscal → Emitir Complementar</strong> para ajustar a quantidade.
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Adiantamento disponível ── */}
            {contratoSel && sacasCalc > 0 && adiantSaldo(contratoSel.id) > 0 && (
              <div style={{ background:"#E8E8E8", border:"0.5px solid #111111", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: fRom.aplicarAdiant ? 10 : 0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#0D0D0D" }}>
                    💰 Adiantamento disponível: <strong>{fmtR$(adiantSaldo(contratoSel.id))}</strong>
                  </div>
                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <input type="checkbox" checked={fRom.aplicarAdiant}
                      onChange={e => {
                        const on = e.target.checked;
                        const sugestao = on ? String(Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0)).toFixed(2)) : "";
                        setFRom(p => ({ ...p, aplicarAdiant: on, adiantValor: sugestao }));
                      }} />
                    <span style={{ fontSize:12, color:"#0D0D0D", fontWeight:600 }}>Aplicar nesta entrega</span>
                  </label>
                </div>
                {fRom.aplicarAdiant && (
                  <div>
                    <label style={{ ...lbl, color:"#0D0D0D" }}>Valor a abater (R$) — máx. {fmtR$(Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0)))}</label>
                    <InputNumerico style={{ ...inp, borderColor:"#111111" }} min="0"
                      max={Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0))}
                      value={fRom.adiantValor}
                      onChange={v => setFRom(p => ({ ...p, adiantValor: v }))} />
                    {fRom.adiantValor && (() => {
                      const vBruto = sacasCalc * (contratoSel.preco ?? 0);
                      const vAbate = Math.min(parseFloat(fRom.adiantValor||"0"), vBruto, adiantSaldo(contratoSel.id));
                      const vCR    = Math.max(0, vBruto - vAbate);
                      return (
                        <div style={{ marginTop:6, fontSize:11, color:"#0D0D0D", display:"flex", gap:16, flexWrap:"wrap" }}>
                          <span>Valor bruto: <strong>{fmtR$(vBruto)}</strong></span>
                          <span>Abate: <strong style={{ color:"#E24B4A" }}>−{fmtR$(vAbate)}</strong></span>
                          <span>CR a lançar: <strong style={{ color:"#16A34A" }}>{fmtR$(vCR)}</strong></span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button style={btnR} onClick={() => { setModalRomaneio(false); setEditRomaneio(null); setFRom(ROM_VAZIO()); }}>Cancelar</button>
              <button onClick={gerarRomaneio}
                disabled={salvando||!contratoSel||!fRom.placa||plCalc<=0}
                title={
                  !contratoSel ? "Selecione o contrato" :
                  !fRom.placa  ? "Informe a placa do caminhão" :
                  plCalc<=0    ? (fRom.pesoEstimado ? "Informe o peso estimado (kg)" : "Informe o Peso Bruto e a Tara — o Peso Líquido deve ser maior que zero") :
                  undefined
                }
                style={{ ...btnV, opacity: salvando||!contratoSel||!fRom.placa||plCalc<=0?0.5:1, background: fRom.pesoEstimado ? "#C9921B" : "#1A5CB8" }}>
                {salvando ? "Salvando…" : editRomaneio ? "Salvar Alterações" : "Confirmar Pesagem"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal Cessão: Vincular Débitos CP / Pedido de Compra ── */}
      {modalCessao && (() => {
        const fornNome = fC.cessao_beneficiarios.find(b => b.fornecedor_id === cessaoBenefAtivo)?.fornecedor_nome ?? cessaoBenefAtivo;
        // Separa: com PC e sem PC
        const comPC = cessaoLancs.filter(l => l.pedido_compra_id);
        const semPC = cessaoLancs.filter(l => !l.pedido_compra_id);
        // Agrupa CPs por PC
        const porPC = comPC.reduce<Record<string, {pcNumero:string; lancs:LancItem[]}>>((acc, l) => {
          const pcId = l.pedido_compra_id!;
          if (!acc[pcId]) acc[pcId] = { pcNumero: l.pc_numero ?? pcId.slice(0,8), lancs: [] };
          acc[pcId].lancs.push(l);
          return acc;
        }, {});
        const totalBenef = Object.entries(cessaoSelecionados).filter(([,v])=>v.fornId===cessaoBenefAtivo).reduce((s,[,v])=>s+v.valor,0);

        const renderRow = (l: LancItem) => {
          const sel = l.id in cessaoSelecionados && cessaoSelecionados[l.id].fornId === cessaoBenefAtivo;
          const valCessao = sel ? cessaoSelecionados[l.id].valor : l.valor;
          return (
            <tr key={l.id} style={{ borderBottom:"0.5px solid var(--bg-tag)", background: sel ? "#EDF4FB" : "transparent" }}>
              <td style={{ padding:"7px 8px" }}>
                <input type="checkbox" checked={sel}
                  onChange={e => {
                    if (e.target.checked) setCessaoSelecionados(p => ({ ...p, [l.id]: { valor: l.valor, fornId: cessaoBenefAtivo } }));
                    else setCessaoSelecionados(p => { const n={...p}; delete n[l.id]; return n; });
                  }} />
              </td>
              <td style={{ padding:"7px 8px", color:"var(--text-1)", fontSize:12 }}>{l.descricao}</td>
              <td style={{ padding:"7px 8px", textAlign:"right", color:"#666", fontSize:12 }}>
                {l.data_vencimento ? l.data_vencimento.split("T")[0].split("-").reverse().join("/") : "—"}
              </td>
              <td style={{ padding:"7px 8px", textAlign:"right", fontWeight:600, color:"var(--text-1)", fontSize:12 }}>
                R$ {l.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}
              </td>
              <td style={{ padding:"7px 8px" }}>
                {sel ? (
                  <InputMonetario min="0" max={l.valor} value={valCessao}
                    onChange={v => setCessaoSelecionados(p => ({ ...p, [l.id]: { valor: v, fornId: cessaoBenefAtivo } }))}
                    style={{ ...inp, textAlign:"right", width:100, padding:"3px 6px", fontSize:12 }} />
                ) : <span style={{ color:"#ccc", fontSize:12 }}>—</span>}
              </td>
            </tr>
          );
        };

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(11,45,80,0.32)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:14, width:"100%", maxWidth:700, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(11,45,80,0.10)" }}>
              {/* cabeçalho */}
              <div style={{ padding:"18px 24px 14px", borderBottom:"0.5px solid var(--border-table)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>Vincular Débitos à Cessão</h2>
                    <p style={{ margin:"4px 0 0", fontSize:12, color:"#666" }}>
                      Fornecedor: <strong>{fornNome}</strong> — selecione as CPs ou Pedidos de Compra que serão quitados.
                    </p>
                  </div>
                  <button onClick={() => setModalCessao(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-3)" }}>×</button>
                </div>
                <div style={{ display:"flex", gap:16, marginTop:10, fontSize:12 }}>
                  <span>Valor do Contrato: <strong style={{ color:"#111" }}>R$ {valorFinanceiro.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></span>
                  <span>Cedido (este fornecedor): <strong style={{ color: totalBenef > valorFinanceiro ? "#E24B4A" : "#16A34A" }}>R$ {totalBenef.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></span>
                </div>
              </div>

              {/* corpo */}
              <div style={{ flex:1, overflowY:"auto", padding:"0 24px" }}>
                {cessaoLancs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"var(--text-3)", fontSize:13 }}>
                    Nenhuma CP em aberto encontrada para este fornecedor.<br />
                    <span style={{ fontSize:11 }}>Verifique se o fornecedor está vinculado a lançamentos em CP.</span>
                  </div>
                ) : (
                  <>
                    {/* ── Pedidos de Compra ── */}
                    {Object.keys(porPC).length > 0 && (
                      <div style={{ marginTop:16, marginBottom:8 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Pedidos de Compra</div>
                        {Object.entries(porPC).map(([pcId, { pcNumero, lancs }]) => {
                          const todosSelPc = lancs.every(l => cessaoSelecionados[l.id]?.fornId === cessaoBenefAtivo);
                          const totalPc = lancs.reduce((s,l)=>s+l.valor,0);
                          return (
                            <div key={pcId} style={{ border:"0.5px solid #B0CEEA", borderRadius:8, marginBottom:10, overflow:"hidden" }}>
                              {/* header do PC */}
                              <div style={{ background:"#EDF4FB", padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontWeight:600, fontSize:13 }}>
                                  <input type="checkbox" checked={todosSelPc}
                                    onChange={e => {
                                      if (e.target.checked) setCessaoSelecionados(p => { const n={...p}; lancs.forEach(l => { n[l.id] = { valor:l.valor, fornId:cessaoBenefAtivo }; }); return n; });
                                      else setCessaoSelecionados(p => { const n={...p}; lancs.forEach(l => delete n[l.id]); return n; });
                                    }} />
                                  Pedido de Compra #{pcNumero}
                                </label>
                                <span style={{ fontSize:12, color:"#1A4870" }}>Total: R$ {totalPc.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
                              </div>
                              {/* CPs do pedido */}
                              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                                <thead>
                                  <tr style={{ borderBottom:"0.5px solid var(--border-table)", color:"#666", textAlign:"left" }}>
                                    <th style={{ padding:"6px 8px", width:28 }}>✓</th>
                                    <th style={{ padding:"6px 8px" }}>Descrição</th>
                                    <th style={{ padding:"6px 8px", textAlign:"right" }}>Vencimento</th>
                                    <th style={{ padding:"6px 8px", textAlign:"right" }}>Valor</th>
                                    <th style={{ padding:"6px 8px", textAlign:"right" }}>Cessão</th>
                                  </tr>
                                </thead>
                                <tbody>{lancs.map(renderRow)}</tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── CPs avulsas (sem PC) ── */}
                    {semPC.length > 0 && (
                      <div style={{ marginTop:16 }}>
                        {Object.keys(porPC).length > 0 && (
                          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>CPs avulsas (sem Pedido de Compra)</div>
                        )}
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead>
                            <tr style={{ borderBottom:"0.5px solid var(--border-table)", color:"#666", textAlign:"left" }}>
                              <th style={{ padding:"8px", width:28 }}>✓</th>
                              <th style={{ padding:"8px" }}>Descrição</th>
                              <th style={{ padding:"8px", textAlign:"right" }}>Vencimento</th>
                              <th style={{ padding:"8px", textAlign:"right" }}>Valor Total</th>
                              <th style={{ padding:"8px", textAlign:"right" }}>Valor Cessão</th>
                            </tr>
                          </thead>
                          <tbody>{semPC.map(renderRow)}</tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ padding:"14px 24px", borderTop:"0.5px solid var(--border-table)", display:"flex", justifyContent:"flex-end", gap:10 }}>
                <button style={btnR} onClick={() => setModalCessao(false)}>Fechar</button>
                <button style={btnV} onClick={() => setModalCessao(false)}>Confirmar Vínculos</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal Encerramento em Lote ─────────────────────────────────────── */}
      {modalLote && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--bg-card)", borderRadius:14, width:680, maxWidth:"96vw", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* cabeçalho */}
            <div style={{ padding:"18px 24px 14px", borderBottom:"0.5px solid var(--border-table)", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16, color:"var(--text-1)" }}>⊘ Encerramento em Lote</div>
                <div style={{ fontSize:12, color:"var(--text-2)", marginTop:3 }}>Selecione as safras e a ação a realizar</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"var(--text-3)", lineHeight:1 }}>✕</button>
            </div>

            {/* tipo de ação */}
            <div style={{ padding:"14px 24px 0" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"var(--text-2)", marginBottom:8 }}>AÇÃO</div>
              <div style={{ display:"flex", gap:10 }}>
                {([
                  { id:"contratos" as const, label:"Encerrar contratos", sub:"Marca os contratos abertos como Encerrado. A safra permanece ativa." },
                  { id:"safra"     as const, label:"Encerrar safra completa", sub:"Encerra a safra e bloqueia novos lançamentos. Inclui todos os contratos abertos." },
                ] as { id:"contratos"|"safra"; label:string; sub:string }[]).map(op => (
                  <button key={op.id} onClick={() => setLoteOp(op.id)}
                    style={{ flex:1, textAlign:"left", padding:"12px 14px", borderRadius:10, border: loteOp===op.id ? "2px solid #2A2A2A" : "1.5px solid var(--border-table)", background: loteOp===op.id ? "#E8E8E8" : "var(--bg-card)", cursor:"pointer" }}>
                    <div style={{ fontWeight:600, fontSize:13, color: loteOp===op.id ? "#0D0D0D" : "var(--text-1)" }}>{op.label}</div>
                    <div style={{ fontSize:11, color:"var(--text-2)", marginTop:3 }}>{op.sub}</div>
                    {op.id === "safra" && loteOp === "safra" && (
                      <div style={{ marginTop:6, fontSize:11, background:"#FFF3CD", color:"#7A5A12", borderRadius:6, padding:"4px 8px", border:"0.5px solid #F0D080" }}>
                        ⚠ Safras encerradas não aceitam novos contratos, romaneios ou operações de lavoura.
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* lista de safras */}
            <div style={{ padding:"14px 24px", flex:1, overflowY:"auto" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"var(--text-2)", marginBottom:8 }}>SAFRAS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {anosSafra.length === 0 && <div style={{ fontSize:12, color:"var(--text-3)", padding:10 }}>Nenhuma safra cadastrada.</div>}
                {anosSafra.map(a => {
                  const st = safraStats(a.id);
                  const isEnc = a.status === "encerrada";
                  const sel = loteSafras.has(a.id);
                  return (
                    <div key={a.id}
                      onClick={() => {
                        if (isEnc && loteOp === "safra") return; // já encerrada, skip
                        setLoteSafras(prev => { const s = new Set(prev); sel ? s.delete(a.id) : s.add(a.id); return s; });
                      }}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderRadius:10, border: sel ? "1.5px solid #2A2A2A" : "0.5px solid var(--border-table)", background: sel ? "#EEF5FF" : isEnc ? "#F8F8F8" : "var(--bg-card)", cursor: isEnc && loteOp==="safra" ? "default" : "pointer", opacity: isEnc && loteOp==="safra" ? 0.65 : 1 }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor:"#2A2A2A", width:16, height:16, flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontWeight:600, fontSize:13, color:"var(--text-1)" }}>{a.descricao}</span>
                          {isEnc
                            ? <span style={{ fontSize:10, background:"#EEE", color:"var(--text-2)", borderRadius:5, padding:"2px 7px", fontWeight:700 }}>ENCERRADA</span>
                            : <span style={{ fontSize:10, background:"#D5F5E3", color:"#14532D", borderRadius:5, padding:"2px 7px", fontWeight:700 }}>ATIVA</span>
                          }
                        </div>
                        <div style={{ fontSize:11, color:"var(--text-2)", marginTop:2 }}>
                          {a.data_inicio} → {a.data_fim} &nbsp;·&nbsp;
                          <span style={{ color: st.abertos > 0 ? "#C9921B" : "#16A34A", fontWeight:600 }}>{st.abertos} aberto(s)</span>
                          &nbsp;·&nbsp; {st.encerrados} encerrado(s) &nbsp;·&nbsp; {st.total} total
                        </div>
                      </div>
                      {isEnc && loteOp === "contratos" && (
                        <button onClick={async e => { e.stopPropagation(); if (!confirm(`Reabrir a safra "${a.descricao}"?`)) return; await reabrirAnoSafra(a.id); setAnosSafra(prev => prev.map(x => x.id === a.id ? { ...x, status: "ativa" as const } : x)); }}
                          style={{ fontSize:11, background:"var(--bg-card)", color:"#111111", border:"0.5px solid #111111", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
                          ↩ Reabrir
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* resultado */}
            {loteResultado && (
              <div style={{ margin:"0 24px 0", padding:"10px 14px", borderRadius:8, background: loteResultado.startsWith("✓") ? "#D5F5E3" : "#FDECEA", color: loteResultado.startsWith("✓") ? "#14532D" : "#8B1A1A", fontSize:13, fontWeight:600, border: `0.5px solid ${loteResultado.startsWith("✓") ? "#A7F0C2" : "#E24B4A60"}` }}>
                {loteResultado}
              </div>
            )}

            {/* footer */}
            <div style={{ padding:"14px 24px", borderTop:"0.5px solid var(--border-table)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:12, color:"var(--text-2)" }}>
                {loteSafras.size > 0
                  ? `${loteSafras.size} safra(s) selecionada(s) · ${[...loteSafras].reduce((s,id) => s + safraStats(id).abertos, 0)} contratos abertos`
                  : "Nenhuma safra selecionada"}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setModalLote(false)}
                  style={{ background:"var(--bg-card)", color:"var(--text-2)", border:"0.5px solid #CCC", borderRadius:8, padding:"9px 16px", fontSize:13, cursor:"pointer" }}>
                  Fechar
                </button>
                <button onClick={executarLote} disabled={loteSafras.size === 0 || loteSalvando}
                  style={{ background: loteSalvando||loteSafras.size===0 ? "#ccc" : loteOp==="safra" ? "#E24B4A" : "#2A2A2A", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor: loteSafras.size===0||loteSalvando ? "default" : "pointer" }}>
                  {loteSalvando ? "Processando…" : loteOp==="safra" ? "⊘ Encerrar Safras Selecionadas" : "⊘ Encerrar Contratos Selecionados"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* ── Modal: Registrar Adiantamento ── */}
      {modalAdiant && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}
          onClick={e => { if (e.target===e.currentTarget) setModalAdiant(false); }}>
          <div style={{ background:"var(--bg-card)", borderRadius:14, padding:28, width:500, maxWidth:"96vw" }}>
            <div style={{ fontWeight:700, fontSize:15, color:"var(--text-1)", marginBottom:4 }}>Registrar Adiantamento de Cliente</div>
            <div style={{ fontSize:12, color:"#666", marginBottom:18 }}>
              Um CR com status <strong>Liquidado</strong> é gerado automaticamente — o dinheiro já foi recebido.
              O saldo fica disponível para abater no próximo romaneio.
            </div>

            {/* Contrato */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Contrato *</label>
              <select style={inp} value={adiantContratoId} onChange={e => setAdiantContratoId(e.target.value)}>
                <option value="">— selecione —</option>
                {contratos.filter(c=>c.status!=="encerrado"&&c.status!=="cancelado").map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.comprador.split(" ").slice(0,3).join(" ")} · {c.produto}</option>
                ))}
              </select>
            </div>

            {/* Data + Valor */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label style={lbl}>Data do recebimento *</label>
                <input style={inp} type="date" value={fAdiant.data} onChange={e => setFAdiant(p=>({...p,data:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Valor recebido (R$) *</label>
                <InputNumerico style={inp} min="0" placeholder="0,00"
                  value={fAdiant.valor} onChange={v => setFAdiant(p=>({...p,valor:v}))} />
              </div>
            </div>

            {/* Descrição */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Observação</label>
              <input style={inp} placeholder="Ex: 30% antecipado via TED, conforme contrato"
                value={fAdiant.descricao} onChange={e => setFAdiant(p=>({...p,descricao:e.target.value}))} />
            </div>

            {/* Preview */}
            {fAdiant.valor && parseFloat(fAdiant.valor) > 0 && (
              <div style={{ background:"#E8E8E8", border:"0.5px solid #111111", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#0D0D0D" }}>
                💡 Será gerado CR de <strong>{fmtR$(parseFloat(fAdiant.valor))}</strong> como <strong>Liquidado</strong> em Contas a Receber.
                O saldo ficará disponível para abatimento no próximo romaneio de expedição deste contrato.
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnR} onClick={() => setModalAdiant(false)}>Cancelar</button>
              <button onClick={registrarAdiantamento}
                disabled={salvandoAdiant || !adiantContratoId || !fAdiant.valor || parseFloat(fAdiant.valor||"0") <= 0}
                style={{ ...btnV, opacity: salvandoAdiant||!adiantContratoId||!fAdiant.valor||parseFloat(fAdiant.valor||"0")<=0?0.5:1 }}>
                {salvandoAdiant ? "Salvando…" : "Registrar Adiantamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
