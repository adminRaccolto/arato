"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarPessoasDaConta } from "../../../lib/db";
import PlanoGate from "../../../components/PlanoGate";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const divider: React.CSSProperties = { gridColumn: "1 / -1", borderTop: "0.5px solid var(--bg-tag)", paddingTop: 12, marginTop: 4, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#E8E8E8", color = "#0D0D0D") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>;
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type StatusCte = "rascunho" | "autorizado" | "cancelado";
type TomadorTipo = "remetente" | "destinatario" | "expedidor" | "recebedor";

interface Cte {
  id: string;
  fazenda_id: string;
  numero_cte: string;
  serie: string;
  chave_acesso?: string | null;
  data_emissao: string;
  cfop: string;
  natureza_operacao: string;
  tomador_tipo: TomadorTipo;
  remetente_id?: string | null;
  remetente_nome: string;
  remetente_cnpj?: string | null;
  destinatario_id?: string | null;
  destinatario_nome: string;
  destinatario_cnpj?: string | null;
  municipio_origem: string;
  uf_origem: string;
  municipio_destino: string;
  uf_destino: string;
  produto_descricao: string;
  ncm?: string | null;
  quantidade: number;
  unidade: string;
  peso_bruto_kg: number;
  peso_liquido_kg: number;
  valor_mercadoria: number;
  valor_frete: number;
  base_calc_icms: number;
  aliquota_icms: number;
  valor_icms: number;
  emitente_id?: string | null;
  emitente_razao_social?: string | null;
  emitente_cnpj?: string | null;
  veiculo_id?: string | null;
  veiculo_placa: string;
  veiculo_tipo?: string | null;
  motorista_id?: string | null;
  motorista_nome: string;
  motorista_cpf?: string | null;
  nfe_chave?: string | null;
  carregamento_id?: string | null;
  xml_url?: string | null;
  status: StatusCte;
  observacao?: string | null;
  created_at?: string;
}

interface VeiculoMin { id: string; placa: string; tipo?: string; cap_kg?: number; }
interface MotoristaMin { id: string; nome: string; cpf?: string; cnh?: string; }
interface PessoaMin {
  id: string; nome: string; cpf_cnpj?: string;
  inscricao_est?: string;
  logradouro?: string; numero?: string; bairro?: string; complemento?: string;
  municipio?: string; municipio_ibge?: string; estado?: string; cep?: string;
  telefone?: string;
}
interface EmpresaTransp { id: string; razao_social?: string | null; nome?: string | null; cpf_cnpj?: string | null; rntrc?: string | null; }

const STATUS_META: Record<StatusCte, { label: string; bg: string; cl: string }> = {
  rascunho:   { label: "Rascunho",  bg: "#FBF3E0", cl: "#7B4A00" },
  autorizado: { label: "Autorizado",bg: "#E8F5E9", cl: "#1A6B3C" },
  cancelado:  { label: "Cancelado", bg: "#FCEBEB", cl: "#791F1F" },
};

const CFOPS_CTE = [
  { cfop: "6353", desc: "Transporte a estabelecimento comercial" },
  { cfop: "5353", desc: "Transporte a estab. industrial (intraestadual)" },
  { cfop: "6354", desc: "Prestação de transporte a produtor rural" },
  { cfop: "5354", desc: "Transporte a produtor rural (intraestadual)" },
  { cfop: "6932", desc: "Prestação de serviço de transporte — operações de exportação" },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// ─────────────────────────────────────────────────────────────
// DACTE — Documento Auxiliar do CT-e Modelo 57
// ─────────────────────────────────────────────────────────────
function imprimirDacte(c: Cte, logoUrl?: string | null) {
  const chave44   = (c.chave_acesso ?? "").replace(/\D/g, "");
  const chaveBlocks = chave44
    ? chave44.replace(/(.{4})/g, "$1 ").trim()
    : "— aguardando autorização SEFAZ —";
  const dataFmt   = c.data_emissao ? new Date(c.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const valorFmt  = c.valor_frete.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const numFmt    = c.numero_cte.padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");
  const icmsFmt   = c.valor_icms.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const emitNome  = c.emitente_razao_social ?? "—";
  const emitCnpj  = c.emitente_cnpj ?? "—";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>DACTE CT-e ${numFmt} — Série ${c.serie}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#000;background:#fff}
.page{width:210mm;margin:0 auto;padding:4mm;border:0.3mm solid #000}
.box{border:0.3mm solid #000;padding:2mm}
.row{display:flex;gap:0}
.row .box{flex:1}
.lbl{font-size:6pt;color:#333;display:block;margin-bottom:1mm}
.val{font-size:8pt;font-weight:700}
.title{font-size:9pt;font-weight:700;text-align:center;border:0.3mm solid #000;padding:1mm;background:#eee}
.section{border:0.5mm solid #000;margin-bottom:1.5mm}
.section-header{background:#ddd;font-size:7pt;font-weight:700;padding:1mm 2mm;border-bottom:0.3mm solid #000}
table{width:100%;border-collapse:collapse;font-size:7pt}
th{background:#eee;border:0.3mm solid #000;padding:1mm;text-align:left;font-size:6.5pt}
td{border:0.3mm solid #000;padding:1mm}
.barcode-area{text-align:center;padding:3mm;border-top:0.3mm solid #000;margin-top:2mm}
@page{size:A4;margin:5mm}
@media print{body{margin:0}}
</style></head><body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="row" style="margin-bottom:1.5mm;align-items:stretch">
    <div class="box" style="flex:0 0 45mm;display:flex;align-items:center;justify-content:center;padding:2mm">
      ${logoUrl ? `<img src="${logoUrl}" style="max-width:40mm;max-height:18mm;object-fit:contain" />` : `<span style="font-size:9pt;font-weight:700;color:#111111">DACTE</span>`}
    </div>
    <div class="box" style="flex:1;text-align:center">
      <div style="font-size:11pt;font-weight:700">DACTE</div>
      <div style="font-size:8pt">DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE ELETRÔNICO</div>
      <div style="margin-top:1mm;font-size:7pt">MODELO <strong>57</strong> · SÉRIE <strong>${c.serie}</strong> · Nº <strong>${numFmt}</strong></div>
      <div style="font-size:7pt">Emissão: <strong>${dataFmt}</strong> · CFOP: <strong>${c.cfop}</strong></div>
    </div>
    <div class="box" style="flex:0 0 50mm;font-size:7pt;padding:2mm">
      <div class="lbl">NATUREZA DA PRESTAÇÃO</div>
      <div class="val" style="font-size:7pt">${c.natureza_operacao}</div>
      <div class="lbl" style="margin-top:2mm">TOMADOR DO SERVIÇO</div>
      <div class="val" style="font-size:7pt">${{ remetente:"Remetente (0)", expedidor:"Expedidor (1)", recebedor:"Recebedor (2)", destinatario:"Destinatário (3)" }[c.tomador_tipo] ?? c.tomador_tipo}</div>
    </div>
  </div>

  <!-- EMITENTE -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">EMITENTE (TRANSPORTADORA)</div>
    <div class="row">
      <div class="box" style="flex:3">
        <span class="lbl">RAZÃO SOCIAL</span>
        <span class="val">${emitNome}</span>
      </div>
      <div class="box" style="flex:1">
        <span class="lbl">CNPJ</span>
        <span class="val">${emitCnpj}</span>
      </div>
    </div>
  </div>

  <!-- REMETENTE / DESTINATÁRIO -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">REMETENTE E DESTINATÁRIO</div>
    <div class="row">
      <div class="box" style="flex:2">
        <span class="lbl">REMETENTE (Quem envia)</span>
        <span class="val">${c.remetente_nome}</span>
        ${c.remetente_cnpj ? `<div style="font-size:6pt;color:#555">CNPJ/CPF: ${c.remetente_cnpj}</div>` : ""}
        <div style="font-size:6.5pt;color:#444">${c.municipio_origem} — ${c.uf_origem}</div>
      </div>
      <div class="box" style="flex:2">
        <span class="lbl">DESTINATÁRIO (Quem recebe)</span>
        <span class="val">${c.destinatario_nome}</span>
        ${c.destinatario_cnpj ? `<div style="font-size:6pt;color:#555">CNPJ/CPF: ${c.destinatario_cnpj}</div>` : ""}
        <div style="font-size:6.5pt;color:#444">${c.municipio_destino} — ${c.uf_destino}</div>
      </div>
      <div class="box" style="flex:1">
        <span class="lbl">PERCURSO</span>
        <span class="val" style="font-size:7pt">${c.municipio_origem}/${c.uf_origem}</span>
        <div style="font-size:9pt;text-align:center;color:#555">→</div>
        <span class="val" style="font-size:7pt">${c.municipio_destino}/${c.uf_destino}</span>
      </div>
    </div>
  </div>

  <!-- VALORES DA PRESTAÇÃO -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">VALORES DA PRESTAÇÃO DO SERVIÇO</div>
    <div class="row">
      <div class="box"><span class="lbl">VALOR TOTAL DA PRESTAÇÃO</span><span class="val">R$ ${valorFmt}</span></div>
      <div class="box"><span class="lbl">BASE DE CÁLCULO ICMS</span><span class="val">R$ ${valorFmt}</span></div>
      <div class="box"><span class="lbl">ALÍQUOTA ICMS</span><span class="val">${c.aliquota_icms.toFixed(2)}%</span></div>
      <div class="box"><span class="lbl">VALOR ICMS</span><span class="val">R$ ${icmsFmt}</span></div>
      <div class="box"><span class="lbl">VALOR MERCADORIA</span><span class="val">R$ ${c.valor_mercadoria.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span></div>
    </div>
  </div>

  <!-- CARGA -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">INFORMAÇÕES DA CARGA</div>
    <div class="row">
      <div class="box" style="flex:2"><span class="lbl">PRODUTO PREDOMINANTE</span><span class="val">${c.produto_descricao}</span></div>
      <div class="box"><span class="lbl">QUANTIDADE</span><span class="val">${c.quantidade.toLocaleString("pt-BR")} ${c.unidade}</span></div>
      <div class="box"><span class="lbl">PESO BRUTO (kg)</span><span class="val">${c.peso_bruto_kg.toLocaleString("pt-BR")}</span></div>
      <div class="box"><span class="lbl">PESO LÍQUIDO (kg)</span><span class="val">${c.peso_liquido_kg.toLocaleString("pt-BR")}</span></div>
    </div>
  </div>

  <!-- MODAL RODOVIÁRIO -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">MODAL RODOVIÁRIO</div>
    <div class="row">
      <div class="box" style="flex:2"><span class="lbl">MOTORISTA</span><span class="val">${c.motorista_nome}</span>${c.motorista_cpf ? `<div style="font-size:6pt">CPF: ${c.motorista_cpf}</div>` : ""}</div>
      <div class="box"><span class="lbl">PLACA DO VEÍCULO</span><span class="val" style="font-size:10pt;letter-spacing:1px">${c.veiculo_placa}</span></div>
      <div class="box"><span class="lbl">TIPO DO VEÍCULO</span><span class="val">${c.veiculo_tipo ?? "—"}</span></div>
    </div>
  </div>

  ${c.nfe_chave ? `<!-- NF-e DOCUMENTADA -->
  <div class="section" style="margin-bottom:1.5mm">
    <div class="section-header">DOCUMENTOS ORIGINÁRIOS</div>
    <div class="box"><span class="lbl">CHAVE DA NF-e</span><span style="font-size:7pt;font-family:monospace">${c.nfe_chave}</span></div>
  </div>` : ""}

  ${c.observacao ? `<div class="section" style="margin-bottom:1.5mm"><div class="section-header">INFORMAÇÕES COMPLEMENTARES</div><div class="box" style="font-size:7.5pt">${c.observacao}</div></div>` : ""}

  <!-- CÓDIGO DE BARRAS -->
  <div class="barcode-area">
    <div style="font-size:6pt;color:#555;margin-bottom:2mm">CHAVE DE ACESSO</div>
    <svg id="barcode"></svg>
    <div style="font-size:7pt;font-family:monospace;letter-spacing:1px;margin-top:1mm">${chaveBlocks}</div>
    ${chave44.length === 44 ? "" : `<div style="font-size:7pt;color:#E24B4A;font-weight:700;margin-top:2mm">⚠ CT-e ainda não autorizado pela SEFAZ — aguardando transmissão</div>`}
  </div>
</div>

<script>
window.onload = function() {
  ${chave44.length === 44 ? `try { JsBarcode("#barcode","${chave44}",{format:"CODE128",width:1.2,height:35,displayValue:false,margin:0}); } catch(e){}` : ""}
  setTimeout(function(){ window.print(); }, 400);
};
<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
function CtePageInner() {
  const { fazendaId, contaId, fazendaIds, logoCliente, podeAcessarPlano } = useAuth();
  const searchParams = useSearchParams();
  const prefillApplied = useRef(false);

  const [ctes,           setCtes]           = useState<Cte[]>([]);
  const [veiculos,       setVeiculos]       = useState<VeiculoMin[]>([]);
  const [motoristas,     setMotoristas]     = useState<MotoristaMin[]>([]);
  const [pessoas,        setPessoas]        = useState<PessoaMin[]>([]);
  const [empresasTransp, setEmpresasTransp] = useState<EmpresaTransp[]>([]);

  // ── Aba ─────────────────────────────────────────────────────
  const [aba, setAba] = useState<"emitidos" | "recebidos">("emitidos");

  // ── CT-e Recebidos ──────────────────────────────────────────
  interface CteRecebido {
    id: string; nsu: string; schema_sefaz?: string;
    chave_acesso?: string; numero_cte?: number; serie?: number;
    data_emissao?: string;
    emitente_cnpj?: string; emitente_nome?: string;
    remetente_cnpj?: string; remetente_nome?: string;
    destinatario_cnpj?: string; destinatario_nome?: string;
    municipio_origem?: string; uf_origem?: string;
    municipio_destino?: string; uf_destino?: string;
    valor_frete?: number; produto_descricao?: string;
    lido?: boolean; ambiente?: string; created_at?: string;
  }
  const [recebidos,     setRecebidos]     = useState<CteRecebido[]>([]);
  const [syncando,      setSyncando]      = useState(false);
  const [syncMsg,       setSyncMsg]       = useState("");
  const [buscaRec,      setBuscaRec]      = useState("");

  async function carregarRecebidos() {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("cte_recebidos")
      .select("id,nsu,schema_sefaz,chave_acesso,numero_cte,serie,data_emissao,emitente_cnpj,emitente_nome,remetente_cnpj,remetente_nome,destinatario_cnpj,destinatario_nome,municipio_origem,uf_origem,municipio_destino,uf_destino,valor_frete,produto_descricao,lido,ambiente,created_at")
      .eq("fazenda_id", fazendaId)
      .order("nsu", { ascending: false })
      .limit(200);
    setRecebidos(data ?? []);
  }

  async function sincronizarRecebidos(forcarZero = false) {
    if (!fazendaId || syncando) return;
    setSyncando(true);
    setSyncMsg("Consultando SEFAZ...");
    try {
      const r = await fetch("/api/cte/distribuicao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, forcar_zero: forcarZero }),
      });
      const j = await r.json() as { ok?: boolean; totalDocs?: number; ultNSU?: string; aviso?: string; erro?: string; ambiente?: string };
      if (j.erro) { setSyncMsg(`Erro: ${j.erro}`); return; }
      if (j.aviso) { setSyncMsg(j.aviso); return; }
      setSyncMsg(`${j.totalDocs ?? 0} CT-e recebido(s) · NSU ${j.ultNSU ?? "—"} · ${j.ambiente ?? ""}`);
      await carregarRecebidos();
    } catch (e: unknown) {
      setSyncMsg(`Falha: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncando(false);
    }
  }

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  // Modal
  const [modal, setModal]     = useState(false);
  const [cteEdit, setCteEdit] = useState<Cte | null>(null);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  // Contadores para nr. automático
  const [proximoNr, setProximoNr] = useState("1");

  const FORM_VAZIO = () => ({
    emitente_id: "", emitente_razao_social: "", emitente_cnpj: "",
    numero_cte: proximoNr, serie: "1", data_emissao: hoje(),
    cfop: "6353",
    natureza_operacao: "Prestação de Serviço de Transporte",
    tomador_tipo: "remetente" as TomadorTipo,
    remetente_id: "", remetente_nome: "", remetente_cnpj: "",
    destinatario_id: "", destinatario_nome: "", destinatario_cnpj: "",
    municipio_origem: "", uf_origem: "MT", ibge_origem: "",
    municipio_destino: "", uf_destino: "MT", ibge_destino: "",
    produto_descricao: "Soja em Grão", ncm: "12010090",
    quantidade: 0, unidade: "TON",
    peso_bruto_kg: 0, peso_liquido_kg: 0,
    valor_mercadoria: 0, valor_frete: 0,
    aliquota_icms: "12",
    veiculo_id: "", motorista_id: "",
    nfe_chave: "", observacao: "",
  });
  const [form, setForm] = useState(FORM_VAZIO());

  // Calculados
  const baseCalcIcms   = form.valor_frete || 0;
  const valorIcms      = +(baseCalcIcms * (parseFloat(form.aliquota_icms) / 100)).toFixed(2);

  // ── Carregar ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const ids = fazendaIds && fazendaIds.length > 0 ? fazendaIds : [fazendaId];
    const [{ data: cd }, { data: vd }, { data: md }, todasPessoas, { data: ed }] = await Promise.all([
      supabase.from("ctes").select("*").in("fazenda_id", ids).order("data_emissao", { ascending: false }),
      supabase.from("veiculos").select("id, placa, tipo, cap_kg").in("fazenda_id", ids).eq("ativo", true),
      supabase.from("motoristas").select("id, nome, cpf, cnh").in("fazenda_id", ids).eq("ativo", true),
      listarPessoasDaConta(fazendaId),  // paginado — retorna todas as pessoas sem limite de 1000
      supabase.from("empresas").select("id, razao_social, nome, cpf_cnpj, rntrc").in("fazenda_id", ids).contains("finalidades", ["transportadora"]),
    ]);
    setCtes(cd ?? []);
    setVeiculos(vd ?? []);
    setMotoristas(md ?? []);
    setPessoas(todasPessoas);  // já vem ordenado por localeCompare pt-BR
    setEmpresasTransp((ed ?? []).sort((a, b) => (a.razao_social ?? a.nome ?? "").localeCompare(b.razao_social ?? b.nome ?? "")));
    // Próximo número
    if (cd && cd.length > 0) {
      const maxNr = Math.max(...(cd as Cte[]).map(c => parseInt(c.numero_cte) || 0));
      setProximoNr(String(maxNr + 1));
    }
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (aba === "recebidos") carregarRecebidos(); }, [aba, fazendaId]);

  // ── Prefill a partir de NF-e (botão "CT-e / MDF-e" na página Fiscal) ────────
  useEffect(() => {
    if (prefillApplied.current) return;
    if (!searchParams.get("from_nfe")) return;
    const rawStr = sessionStorage.getItem("cte_prefill_nfe");
    if (!rawStr) return;
    prefillApplied.current = true;
    sessionStorage.removeItem("cte_prefill_nfe");
    try {
      const p = JSON.parse(rawStr) as {
        remetente_nome: string; remetente_cnpj: string;
        destinatario_nome: string; destinatario_cnpj: string;
        municipio_origem: string; uf_origem: string;
        municipio_destino: string; uf_destino: string;
        valor_mercadoria: number; nfe_chave: string;
        produto_descricao: string; ncm: string;
        quantidade: number; unidade: string;
      };
      setCteEdit(null);
      setForm(f => ({
        ...f,
        numero_cte:        proximoNr,
        remetente_nome:    p.remetente_nome    || f.remetente_nome,
        remetente_cnpj:    p.remetente_cnpj    || f.remetente_cnpj,
        destinatario_nome: p.destinatario_nome || f.destinatario_nome,
        destinatario_cnpj: p.destinatario_cnpj || f.destinatario_cnpj,
        municipio_origem:  p.municipio_origem  || f.municipio_origem,
        uf_origem:         p.uf_origem         || f.uf_origem,
        municipio_destino: p.municipio_destino || f.municipio_destino,
        uf_destino:        p.uf_destino        || f.uf_destino,
        valor_mercadoria:  p.valor_mercadoria  || f.valor_mercadoria,
        nfe_chave:         p.nfe_chave         || f.nfe_chave,
        produto_descricao: p.produto_descricao || f.produto_descricao,
        ncm:               p.ncm               || f.ncm,
        quantidade:        p.quantidade        || f.quantidade,
        unidade:           p.unidade           || f.unidade,
      }));
      setErr("");
      setModal(true);
    } catch { /* JSON inválido — ignora */ }
  }, [ctes, searchParams, proximoNr]); // dispara após ctes carregar

  // ── Abrir modal ──────────────────────────────────────────
  function abrirNovo() {
    setCteEdit(null);
    setForm({ ...FORM_VAZIO(), numero_cte: proximoNr });
    setErr("");
    setModal(true);
  }

  function abrirEditar(c: Cte) {
    setCteEdit(c);
    setForm({
      emitente_id: c.emitente_id ?? "", emitente_razao_social: c.emitente_razao_social ?? "", emitente_cnpj: c.emitente_cnpj ?? "",
      numero_cte: c.numero_cte, serie: c.serie, data_emissao: c.data_emissao,
      cfop: c.cfop, natureza_operacao: c.natureza_operacao,
      tomador_tipo: c.tomador_tipo,
      remetente_id: c.remetente_id ?? "", remetente_nome: c.remetente_nome, remetente_cnpj: c.remetente_cnpj ?? "",
      destinatario_id: c.destinatario_id ?? "", destinatario_nome: c.destinatario_nome, destinatario_cnpj: c.destinatario_cnpj ?? "",
      municipio_origem: c.municipio_origem, uf_origem: c.uf_origem, ibge_origem: (c as Cte & { ibge_origem?: string }).ibge_origem ?? "",
      municipio_destino: c.municipio_destino, uf_destino: c.uf_destino, ibge_destino: (c as Cte & { ibge_destino?: string }).ibge_destino ?? "",
      produto_descricao: c.produto_descricao, ncm: c.ncm ?? "",
      quantidade: c.quantidade ?? 0, unidade: c.unidade,
      peso_bruto_kg: c.peso_bruto_kg ?? 0, peso_liquido_kg: c.peso_liquido_kg ?? 0,
      valor_mercadoria: c.valor_mercadoria ?? 0, valor_frete: c.valor_frete ?? 0,
      aliquota_icms: String(c.aliquota_icms),
      veiculo_id: c.veiculo_id ?? "", motorista_id: c.motorista_id ?? "",
      nfe_chave: c.nfe_chave ?? "", observacao: c.observacao ?? "",
    });
    setErr("");
    setModal(true);
  }

  // ── Auto-fill remetente ──────────────────────────────────
  function selecionarRemetente(id: string) {
    const p = pessoas.find(p => p.id === id);
    setForm(f => ({
      ...f,
      remetente_id: id,
      remetente_nome: p?.nome ?? "",
      remetente_cnpj: p?.cpf_cnpj ?? "",
      municipio_origem: p?.municipio ?? f.municipio_origem,
      uf_origem: p?.estado ?? f.uf_origem,
      ibge_origem: p?.municipio_ibge ?? f.ibge_origem,
    }));
  }

  function selecionarDestinatario(id: string) {
    const p = pessoas.find(p => p.id === id);
    setForm(f => ({
      ...f,
      destinatario_id: id,
      destinatario_nome: p?.nome ?? "",
      destinatario_cnpj: p?.cpf_cnpj ?? "",
      municipio_destino: p?.municipio ?? f.municipio_destino,
      uf_destino: p?.estado ?? f.uf_destino,
      ibge_destino: p?.municipio_ibge ?? f.ibge_destino,
    }));
  }

  function selecionarVeiculo(id: string) {
    const v = veiculos.find(v => v.id === id);
    setForm(f => ({ ...f, veiculo_id: id, _placa: v?.placa ?? "" } as typeof f & { _placa: string }));
  }

  // ── Salvar ───────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    if (!form.remetente_nome.trim())   { setErr("Informe o remetente."); return; }
    if (!form.destinatario_nome.trim()){ setErr("Informe o destinatário."); return; }
    setSaving(true); setErr("");
    try {
      const veiculo = veiculos.find(v => v.id === form.veiculo_id);
      const motorista = motoristas.find(m => m.id === form.motorista_id);
      const emitente = empresasTransp.find(e => e.id === form.emitente_id);
      const payload = {
        fazenda_id: fazendaId,
        emitente_id: form.emitente_id || null,
        emitente_razao_social: (emitente?.razao_social ?? emitente?.nome ?? form.emitente_razao_social) || null,
        emitente_cnpj: (emitente?.cpf_cnpj ?? form.emitente_cnpj) || null,
        numero_cte: form.numero_cte,
        serie: form.serie,
        chave_acesso: cteEdit?.chave_acesso ?? null,
        data_emissao: form.data_emissao,
        cfop: form.cfop,
        natureza_operacao: form.natureza_operacao,
        tomador_tipo: form.tomador_tipo,
        remetente_id: form.remetente_id || null,
        remetente_nome: form.remetente_nome,
        remetente_cnpj: form.remetente_cnpj || null,
        destinatario_id: form.destinatario_id || null,
        destinatario_nome: form.destinatario_nome,
        destinatario_cnpj: form.destinatario_cnpj || null,
        municipio_origem: form.municipio_origem,
        uf_origem: form.uf_origem,
        ibge_origem: form.ibge_origem || null,
        municipio_destino: form.municipio_destino,
        uf_destino: form.uf_destino,
        ibge_destino: form.ibge_destino || null,
        produto_descricao: form.produto_descricao,
        ncm: form.ncm || null,
        quantidade: form.quantidade || 0,
        unidade: form.unidade,
        peso_bruto_kg: form.peso_bruto_kg || 0,
        peso_liquido_kg: form.peso_liquido_kg || 0,
        valor_mercadoria: form.valor_mercadoria || 0,
        valor_frete: form.valor_frete || 0,
        base_calc_icms: baseCalcIcms,
        aliquota_icms: parseFloat(form.aliquota_icms) || 0,
        valor_icms: valorIcms,
        veiculo_id: form.veiculo_id || null,
        veiculo_placa: veiculo?.placa ?? "",
        veiculo_tipo: veiculo?.tipo ?? null,
        motorista_id: form.motorista_id || null,
        motorista_nome: motorista?.nome ?? "",
        motorista_cpf: motorista?.cpf ?? null,
        nfe_chave: form.nfe_chave || null,
        status: cteEdit ? cteEdit.status : "rascunho" as StatusCte,
        observacao: form.observacao || null,
      };

      // Usa API route com service_role_key para contornar JWT expirado (RLS 42501)
      const res = await fetch("/api/transporte/cte-salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: fazendaId,
          cte_id: cteEdit?.id ?? undefined,
          payload,
        }),
      });
      const json = await res.json() as { sucesso?: boolean; erro?: string };
      if (!res.ok || !json.sucesso) {
        setErr(json.erro ?? "Erro ao salvar CT-e.");
        return;
      }

      await carregar();
      setModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Busca IBGE de um município via ViaCEP ─────────────────
  async function buscarIbge(cidade: string, uf: string): Promise<string> {
    // Lookup estático para cidades mais comuns do MT agro — evita round-trip desnecessário
    const IBGE_MT: Record<string, string> = {
      "nova mutum": "5106224", "lucas do rio verde": "5105259", "sorriso": "5107925",
      "sinop": "5107909", "cuiabá": "5103403", "campo verde": "5102637",
      "rondonópolis": "5107602", "primavera do leste": "5106208", "tapurah": "5108006",
      "ipiranga do norte": "5104526", "campo novo do parecis": "5102637",
      "diamantino": "5103502", "tangará da serra": "5107958", "alta floresta": "5100250",
      "colíder": "5103205", "matupá": "5105606", "guarantã do norte": "5104104",
      "juara": "5105101", "juína": "5105150", "vila rica": "5108600",
    };
    const chave = cidade.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const ibgeMt = Object.entries(IBGE_MT).find(([k]) =>
      k.normalize("NFD").replace(/[̀-ͯ]/g, "") === chave
    );
    if (ibgeMt) return ibgeMt[1];

    // Fallback: ViaCEP por nome de cidade
    try {
      const enc = encodeURIComponent(cidade.trim());
      const r = await fetch(`https://viacep.com.br/ws/${uf}/${enc}/json/`);
      if (r.ok) {
        const arr = await r.json() as Array<{ ibge?: string }>;
        if (Array.isArray(arr) && arr[0]?.ibge) return arr[0].ibge;
      }
    } catch { /* ignora falha de rede */ }

    return "0000000"; // último recurso — SEFAZ irá rejeitar; usuário precisa corrigir cidade
  }

  // ── Autorizar — transmissão real SEFAZ ──────────────────
  async function autorizar(c: Cte) {
    if (!fazendaId) return;
    if (!confirm(`Transmitir CT-e ${c.numero_cte} para a SEFAZ?\nAmbiente configurado em Parâmetros → CT-e.`)) return;

    // Usa IBGE salvo no cadastro; fallback por nome de cidade via ViaCEP
    const cExt = c as Cte & { ibge_origem?: string; ibge_destino?: string };
    const [ibgeIni, ibgeFim] = await Promise.all([
      cExt.ibge_origem ? Promise.resolve(cExt.ibge_origem) : buscarIbge(c.municipio_origem, c.uf_origem),
      cExt.ibge_destino ? Promise.resolve(cExt.ibge_destino) : buscarIbge(c.municipio_destino, c.uf_destino),
    ]);

    const payload = {
      fazenda_id:         fazendaId,
      cte_id:             c.id,
      emitente_id:        c.emitente_id ?? undefined,
      emitente_cnpj:      c.emitente_cnpj ?? undefined,
      emitente_razao_social: c.emitente_razao_social ?? undefined,
      remetente: (() => {
        const rem = pessoas.find(p => p.id === c.remetente_id);
        // IBGE: tenta pessoa → CT-e salvo → busca já feita em ibgeIni
        const ibgeRem = rem?.municipio_ibge || cExt.ibge_origem || ibgeIni;
        return {
          nome:           c.remetente_nome,
          cpf_cnpj:       c.remetente_cnpj    ?? undefined,
          ie:             rem?.inscricao_est   ?? undefined,
          logradouro:     rem?.logradouro      || "ZONA RURAL",
          numero:         rem?.numero          || "S/N",
          bairro:         rem?.bairro          || "ZONA RURAL",
          municipio_ibge: ibgeRem             || undefined,
          municipio_nome: rem?.municipio       ?? c.municipio_origem,
          uf:             rem?.estado          ?? c.uf_origem,
          cep:            rem?.cep             ?? undefined,
          fone:           rem?.telefone        ?? undefined,
        };
      })(),
      destinatario: (() => {
        const dest = pessoas.find(p => p.id === c.destinatario_id);
        const ibgeDest = dest?.municipio_ibge || cExt.ibge_destino || ibgeFim;
        return {
          nome:           c.destinatario_nome,
          cpf_cnpj:       c.destinatario_cnpj ?? undefined,
          ie:             dest?.inscricao_est  ?? undefined,
          logradouro:     dest?.logradouro     || "ZONA RURAL",
          numero:         dest?.numero         || "S/N",
          bairro:         dest?.bairro         || "ZONA RURAL",
          municipio_ibge: ibgeDest            || undefined,
          municipio_nome: dest?.municipio      ?? c.municipio_destino,
          uf:             dest?.estado         ?? c.uf_destino,
          cep:            dest?.cep            ?? undefined,
          fone:           dest?.telefone       ?? undefined,
        };
      })(),
      municipio_ini_ibge: ibgeIni,
      municipio_ini_nome: c.municipio_origem,
      uf_ini:             c.uf_origem,
      municipio_fim_ibge: ibgeFim,
      municipio_fim_nome: c.municipio_destino,
      uf_fim:             c.uf_destino,
      cfop:               c.cfop,
      natureza:           c.natureza_operacao,
      valor_prestacao:    c.valor_frete,
      valor_receber:      c.valor_frete,
      componentes:        [{ nome: "Frete Peso", valor: c.valor_frete }],
      produto_descricao:  c.produto_descricao,
      ncm:                c.ncm ?? undefined,
      peso_bruto_kg:      c.peso_bruto_kg,
      peso_liquido_kg:    c.peso_liquido_kg,
      valor_mercadoria:   c.valor_mercadoria,
      aliquota_icms:      c.aliquota_icms,
      veiculo_placa:      c.veiculo_placa,
      motorista_nome:     c.motorista_nome,
      motorista_cpf:      c.motorista_cpf ?? "",
      nfe_chave:          c.nfe_chave   ?? undefined,
      tomador_tipo:       "3" as const,
      observacao:         c.observacao  ?? undefined,
    };

    // Validação local: campos críticos para o XML do CT-e
    const camposCriticos: Record<string, string | undefined> = {
      municipio_ibge: payload.remetente?.municipio_ibge,
      municipio_nome: payload.remetente?.municipio_nome,
      uf:             payload.remetente?.uf,
    };
    const faltantes = Object.entries(camposCriticos)
      .filter(([, valor]) => !String(valor ?? "").trim() || valor === "0000000")
      .map(([campo]) => campo);
    if (faltantes.length) {
      alert(`Não foi possível determinar o município do remetente.\n\nCampos ausentes: ${faltantes.join(", ")}\n\nPreencha o campo "Cód. IBGE Origem" diretamente neste CT-e ou cadastre o município correto no cadastro do remetente.`);
      return;
    }

    try {
      const res  = await fetch("/api/fiscal/emitir-cte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat: string; xMotivo: string; xmlUrl?: string };

      // Atualização otimista — o alert() bloqueia o browser antes do React re-renderizar,
      // então atualizamos o estado local imediatamente para o DACTE abrir com a chave correta.
      // O update no banco já foi feito server-side com service_role_key (imune a JWT expirado).
      if (data.sucesso) {
        setCtes(prev => prev.map(x => x.id === c.id ? {
          ...x,
          status:       "autorizado" as StatusCte,
          chave_acesso: data.chave   ?? null,
          xml_url:      data.xmlUrl  ?? null,
          numero_cte:   data.numero  ?? c.numero_cte,
        } : x));
      }

      if (data.sucesso) {
        alert(`✓ CT-e autorizado!\nNúmero: ${data.numero}\nProtocolo: ${data.protocolo ?? "—"}\nChave: ${data.chave ?? "—"}`);
        await carregar(); // re-sync com o banco
      } else {
        // cStats internos (5xx) = falha de comunicação antes de a SEFAZ responder.
        // cStats fiscais reais da SEFAZ são 3 dígitos começando com 1-4 (ex: 100, 539, 225).
        const cStatNum = parseInt(data.cStat ?? "0");
        const ehFalhaComunicacao =
          isNaN(cStatNum) ||
          cStatNum >= 500 ||
          cStatNum === 0 ||
          data.xMotivo?.includes("SEFAZ_TRANSPORT") ||
          data.xMotivo?.includes("Edge Function") ||
          data.xMotivo?.includes("connection error") ||
          data.xMotivo?.includes("timeout");

        if (ehFalhaComunicacao) {
          alert(
            `⚠ Falha de comunicação com a SEFAZ\n` +
            `A SEFAZ não chegou a processar o documento — a conexão foi interrompida antes.\n\n` +
            `Detalhe: ${data.xMotivo}\n\n` +
            `Use o botão "Testar Conexão SEFAZ" em Parâmetros → CT-e para diagnosticar.`
          );
        } else {
          alert(`⚠ CT-e rejeitado pela SEFAZ\ncStat ${data.cStat}: ${data.xMotivo}`);
        }
      }
    } catch (e) {
      alert("Erro ao transmitir: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function cancelar(c: Cte) {
    if (!confirm("Cancelar este CT-e?")) return;
    await supabase.from("ctes").update({ status: "cancelado" }).eq("id", c.id);
    await carregar();
  }

  // ── Filtrar ──────────────────────────────────────────────
  const ctesFiltrados = ctes.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!c.numero_cte.includes(q) && !c.remetente_nome.toLowerCase().includes(q) &&
          !c.destinatario_nome.toLowerCase().includes(q) && !c.veiculo_placa.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── KPIs ─────────────────────────────────────────────────
  const autorizados = ctes.filter(c => c.status === "autorizado");
  const totalFretes = autorizados.reduce((s, c) => s + c.valor_frete, 0);

  if (!podeAcessarPlano("transporte")) return <PlanoGate modulo="transporte" />;
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>CT-e — Conhecimento de Transporte Eletrônico</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Frota própria · Modal rodoviário · Motoristas CLT
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Emitidos (total)",    value: ctes.length.toString(),        sub: "todos os status",       color: "#111111" },
            { label: "Autorizados",         value: autorizados.length.toString(), sub: "transmitidos SEFAZ",    color: "#1A6B3C" },
            { label: "Rascunho",            value: ctes.filter(c => c.status === "rascunho").length.toString(), sub: "aguardando autorização", color: "#C9921B" },
            { label: "Valor Total Fretes",  value: fmtBRL(totalFretes),           sub: "autorizados",           color: "#111111" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "0.5px solid var(--bg-tag)" }}>
          {([["emitidos", "CT-e Emitidos"], ["recebidos", "CT-e Recebidos da SEFAZ"]] as const).map(([id, lbl]) => (
            <button key={id} onClick={() => setAba(id)} style={{ padding: "8px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: aba === id ? 700 : 400, color: aba === id ? "#1A4870" : "var(--text-2)", borderBottom: aba === id ? "2px solid #1A4870" : "2px solid transparent", marginBottom: -1, borderRadius: 0 }}>
              {lbl}
              {id === "recebidos" && recebidos.length > 0 && <span style={{ marginLeft: 6, background: "#1A4870", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px" }}>{recebidos.length}</span>}
            </button>
          ))}
        </div>

        {/* ── ABA: CT-e Recebidos ─────────────────────────────── */}
        {aba === "recebidos" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <input value={buscaRec} onChange={e => setBuscaRec(e.target.value)} placeholder="Buscar por emitente, remetente, destinatário, chave…" style={{ ...inp, flex: 1, minWidth: 200 }} />
              <button onClick={() => sincronizarRecebidos(false)} disabled={syncando} style={{ ...btnV, background: syncando ? "#888" : "#1A4870" }}>
                {syncando ? "Consultando SEFAZ…" : "↻ Sincronizar"}
              </button>
              <button onClick={() => sincronizarRecebidos(true)} disabled={syncando} title="Reconsultar do NSU zero" style={{ ...btnR, fontSize: 12 }}>
                ↺ Desde o início
              </button>
            </div>
            {syncMsg && (
              <div style={{ background: syncMsg.startsWith("Erro") || syncMsg.startsWith("Falha") ? "#FCEBEB" : "#E8F5E9", border: `0.5px solid ${syncMsg.startsWith("Erro") || syncMsg.startsWith("Falha") ? "#F5C6C6" : "#B2DFDB"}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: syncMsg.startsWith("Erro") || syncMsg.startsWith("Falha") ? "#791F1F" : "#1A6B3C", marginBottom: 12 }}>
                {syncMsg}
              </div>
            )}
            {recebidos.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nenhum CT-e recebido. Clique em <strong>↻ Sincronizar</strong> para consultar a SEFAZ.
              </div>
            ) : (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-card)" }}>
                      {["NSU","Data","Emitente","Remetente → Destinatário","Percurso","Valor Frete","Tipo"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: h === "Valor Frete" ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recebidos.filter(r => {
                      if (!buscaRec) return true;
                      const q = buscaRec.toLowerCase();
                      return (r.emitente_nome ?? "").toLowerCase().includes(q)
                        || (r.remetente_nome ?? "").toLowerCase().includes(q)
                        || (r.destinatario_nome ?? "").toLowerCase().includes(q)
                        || (r.chave_acesso ?? "").includes(q)
                        || (r.nsu ?? "").includes(q);
                    }).map(r => (
                      <tr key={r.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", opacity: r.lido ? 0.7 : 1 }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111", fontVariantNumeric: "tabular-nums" }}>
                          {r.nsu?.replace(/^0+/, "")}
                          <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>
                            {r.numero_cte ? `Nº ${r.numero_cte}/${r.serie ?? 1}` : "—"}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>{fmtData(r.data_emissao)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 12 }}>{r.emitente_nome ?? "—"}</div>
                          <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.emitente_cnpj ?? ""}</div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 12 }}>{r.remetente_nome ?? "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>→ {r.destinatario_nome ?? "—"}</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>
                          <div>{r.municipio_origem ?? "—"}/{r.uf_origem ?? ""}</div>
                          <div style={{ color: "var(--text-3)" }}>→ {r.municipio_destino ?? "—"}/{r.uf_destino ?? ""}</div>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                          {r.valor_frete != null ? fmtBRL(r.valor_frete) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {badge(
                            (r.schema_sefaz ?? "").startsWith("procCTe") || (r.schema_sefaz ?? "").startsWith("cteProc") ? "CT-e" :
                            (r.schema_sefaz ?? "").startsWith("procEventoCTe") ? "Evento" : (r.schema_sefaz ?? "—").split("_")[0],
                            "#D5E8F5", "#0B2D50"
                          )}
                          {r.ambiente === "homologacao" && (
                            <span style={{ marginLeft: 4, fontSize: 10, color: "#C9921B", fontWeight: 600 }}>HML</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── ABA: CT-e Emitidos ──────────────────────────────── */}
        {aba === "emitidos" && <>

        {/* Filtros + botão */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 150px" }}>
            <label style={lbl}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Buscar</label>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nº CT-e, remetente, destinatário, placa…" style={inp} />
          </div>
          <button onClick={abrirNovo} style={btnV}>+ Emitir CT-e</button>
        </div>

        {/* Tabela */}
        {ctesFiltrados.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            {ctes.length === 0 ? "Nenhum CT-e emitido." : "Nenhum CT-e encontrado para o filtro aplicado."}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  {["Nº/Série","Data","Remetente → Destinatário","Percurso","Veículo","Motorista","Valor Frete","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Valor Frete" ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ctesFiltrados.map(c => {
                  const sm = STATUS_META[c.status];
                  return (
                    <tr key={c.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111111" }}>
                        {c.numero_cte}/{c.serie}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>{c.cfop}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{fmtData(c.data_emissao)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 12 }}>{c.remetente_nome}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>→ {c.destinatario_nome}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div>{c.municipio_origem}/{c.uf_origem}</div>
                        <div style={{ color: "var(--text-3)" }}>→ {c.municipio_destino}/{c.uf_destino}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
                        {c.veiculo_placa || "—"}
                        {c.veiculo_tipo && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.veiculo_tipo}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>{c.motorista_nome || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(c.valor_frete)}</td>
                      <td style={{ padding: "10px 12px" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          {c.status === "rascunho" && (
                            <button onClick={() => autorizar(c)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Autorizar SEFAZ
                            </button>
                          )}
                          <button onClick={() => imprimirDacte(c, logoCliente)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#111111", fontWeight: 600 }}>
                            DACTE
                          </button>
                          {c.status !== "cancelado" && (
                            <button onClick={() => abrirEditar(c)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>
                              Editar
                            </button>
                          )}
                          {c.status === "autorizado" && (
                            <button onClick={() => cancelar(c)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
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
          </div>
        )}
        </>}

      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL EMISSÃO CT-e
      ══════════════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 1060, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* Cabeçalho modal */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{cteEdit ? `CT-e ${cteEdit.numero_cte}/${cteEdit.serie}` : "Emitir CT-e"}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Conhecimento de Transporte Eletrônico — Modal Rodoviário</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {err && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{err}</div>}

              {/* ── Emitente (Transportadora) ── */}
              <div style={divider}>Emitente — Empresa Transportadora</div>
              <div style={{ gridColumn: "1 / -1" }}>
                {empresasTransp.length === 0 ? (
                  <div style={{ background: "#FBF3E0", border: "0.5px solid #E9C97B", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7B4A00" }}>
                    Nenhuma empresa com finalidade <strong>Transportadora</strong> cadastrada.
                    Acesse <strong>Cadastros → Empresas → editar empresa → marque "Transportadora"</strong>.
                  </div>
                ) : (
                  <div>
                    <label style={lbl}>Selecionar Transportadora Emitente</label>
                    <select
                      value={form.emitente_id}
                      onChange={e => {
                        const emp = empresasTransp.find(x => x.id === e.target.value);
                        setForm(f => ({
                          ...f,
                          emitente_id: e.target.value,
                          emitente_razao_social: emp?.razao_social ?? emp?.nome ?? "",
                          emitente_cnpj: emp?.cpf_cnpj ?? "",
                        }));
                      }}
                      style={{ ...inp, borderColor: !form.emitente_id ? "#E9C97B" : undefined }}
                    >
                      <option value="">— Selecionar emitente —</option>
                      {empresasTransp.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.razao_social ?? e.nome} {e.cpf_cnpj ? `· ${e.cpf_cnpj}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* ── Identificação ── */}
              <div style={divider}>Identificação</div>
              {/* Linha 1: Nº CT-e | Série | Data | Tomador */}
              <div>
                <label style={lbl}>Nº CT-e</label>
                <input value={form.numero_cte} onChange={e => setForm(f => ({ ...f, numero_cte: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Série</label>
                <input value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data de Emissão</label>
                <input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Tomador do Serviço</label>
                <select value={form.tomador_tipo} onChange={e => setForm(f => ({ ...f, tomador_tipo: e.target.value as TomadorTipo }))} style={inp}>
                  <option value="remetente">Remetente (quem envia)</option>
                  <option value="destinatario">Destinatário (quem recebe)</option>
                  <option value="expedidor">Expedidor</option>
                  <option value="recebedor">Recebedor</option>
                </select>
              </div>
              {/* Linha 2: CFOP (3 cols) + Natureza (1 col) */}
              <div style={{ gridColumn: "1 / 4" }}>
                <label style={lbl}>CFOP</label>
                <select value={form.cfop} onChange={e => {
                  const desc = CFOPS_CTE.find(c => c.cfop === e.target.value)?.desc ?? form.natureza_operacao;
                  setForm(f => ({ ...f, cfop: e.target.value, natureza_operacao: desc }));
                }} style={inp}>
                  {CFOPS_CTE.map(c => <option key={c.cfop} value={c.cfop}>{c.cfop} — {c.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Natureza da Operação</label>
                <input value={form.natureza_operacao} maxLength={60} onChange={e => setForm(f => ({ ...f, natureza_operacao: e.target.value }))} style={inp} />
              </div>

              {/* ── Remetente ── */}
              <div style={divider}>Remetente</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Selecionar Remetente (Pessoas cadastradas)</label>
                <select value={form.remetente_id} onChange={e => selecionarRemetente(e.target.value)} style={inp}>
                  <option value="">— Selecionar —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cpf_cnpj ? `· ${p.cpf_cnpj}` : ""}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / 4" }}>
                <label style={lbl}>Razão Social / Nome</label>
                <input value={form.remetente_nome} onChange={e => setForm(f => ({ ...f, remetente_nome: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>CNPJ/CPF</label>
                <input value={form.remetente_cnpj} onChange={e => setForm(f => ({ ...f, remetente_cnpj: e.target.value }))} style={inp} />
              </div>

              {/* ── Destinatário ── */}
              <div style={divider}>Destinatário</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Selecionar Destinatário (Pessoas cadastradas)</label>
                <select value={form.destinatario_id} onChange={e => selecionarDestinatario(e.target.value)} style={inp}>
                  <option value="">— Selecionar —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cpf_cnpj ? `· ${p.cpf_cnpj}` : ""}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / 4" }}>
                <label style={lbl}>Razão Social / Nome</label>
                <input value={form.destinatario_nome} onChange={e => setForm(f => ({ ...f, destinatario_nome: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>CNPJ/CPF</label>
                <input value={form.destinatario_cnpj} onChange={e => setForm(f => ({ ...f, destinatario_cnpj: e.target.value }))} style={inp} />
              </div>

              {/* ── Percurso: Origem e Destino na mesma linha ── */}
              <div style={divider}>Percurso</div>
              <div>
                <label style={lbl}>Município de Origem</label>
                <input value={form.municipio_origem} onChange={e => setForm(f => ({ ...f, municipio_origem: e.target.value }))} style={inp} placeholder="Nova Mutum" />
              </div>
              <div>
                <label style={lbl}>UF Origem</label>
                <select value={form.uf_origem} onChange={e => setForm(f => ({ ...f, uf_origem: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Cód. IBGE Origem {form.ibge_origem ? <span style={{ color: "#16A34A", fontWeight: 600 }}>✓</span> : <span style={{ color: "#E24B4A" }}>*</span>}</label>
                <input value={form.ibge_origem} onChange={e => setForm(f => ({ ...f, ibge_origem: e.target.value.replace(/\D/g, "") }))} style={{ ...inp, fontFamily: "monospace" }} placeholder="5106224" maxLength={7} />
              </div>
              <div style={{ gridColumn: "4 / 5" }} />
              <div>
                <label style={lbl}>Município de Destino</label>
                <input value={form.municipio_destino} onChange={e => setForm(f => ({ ...f, municipio_destino: e.target.value }))} style={inp} placeholder="Rondonópolis" />
              </div>
              <div>
                <label style={lbl}>UF Destino</label>
                <select value={form.uf_destino} onChange={e => setForm(f => ({ ...f, uf_destino: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Cód. IBGE Destino {form.ibge_destino ? <span style={{ color: "#16A34A", fontWeight: 600 }}>✓</span> : <span style={{ color: "#E24B4A" }}>*</span>}</label>
                <input value={form.ibge_destino} onChange={e => setForm(f => ({ ...f, ibge_destino: e.target.value.replace(/\D/g, "") }))} style={{ ...inp, fontFamily: "monospace" }} placeholder="5107602" maxLength={7} />
              </div>
              <div style={{ gridColumn: "4 / 5" }} />

              {/* ── Mercadoria: Produto+NCM+Qtd numa linha, Unidade+Valor+PesoBruto+PesoLíq noutra ── */}
              <div style={divider}>Mercadoria Transportada</div>
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={lbl}>Produto</label>
                <input value={form.produto_descricao} onChange={e => setForm(f => ({ ...f, produto_descricao: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>NCM</label>
                <input value={form.ncm} onChange={e => setForm(f => ({ ...f, ncm: e.target.value }))} style={inp} placeholder="12010090" />
              </div>
              <div>
                <label style={lbl}>Quantidade</label>
                <InputMonetario value={form.quantidade} onChange={v => setForm(f => ({ ...f, quantidade: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Unidade</label>
                <select value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} style={inp}>
                  {["TON","KG","SC","UN","M3","L"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Valor da Mercadoria (R$)</label>
                <InputMonetario value={form.valor_mercadoria} onChange={v => setForm(f => ({ ...f, valor_mercadoria: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Peso Bruto (kg)</label>
                <InputMonetario value={form.peso_bruto_kg} onChange={v => setForm(f => ({ ...f, peso_bruto_kg: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Peso Líquido (kg)</label>
                <InputMonetario value={form.peso_liquido_kg} onChange={v => setForm(f => ({ ...f, peso_liquido_kg: v }))} style={inp} />
              </div>

              {/* ── Veículo & Motorista ── */}
              <div style={divider}>Veículo & Motorista (frota própria — CLT)</div>
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={lbl}>Veículo</label>
                <select value={form.veiculo_id} onChange={e => selecionarVeiculo(e.target.value)} style={inp}>
                  <option value="">— Selecionar —</option>
                  {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo ?? "caminhão"}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "3 / 5" }}>
                <label style={lbl}>Motorista</label>
                <select value={form.motorista_id} onChange={e => setForm(f => ({ ...f, motorista_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome} {m.cpf ? `· ${m.cpf}` : ""}</option>)}
                </select>
              </div>

              {/* ── Valores & ICMS ── */}
              <div style={divider}>Valores & ICMS</div>
              <div>
                <label style={lbl}>Valor do Frete (R$)</label>
                <InputMonetario value={form.valor_frete} onChange={v => setForm(f => ({ ...f, valor_frete: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Alíquota ICMS (%)</label>
                <select value={form.aliquota_icms} onChange={e => setForm(f => ({ ...f, aliquota_icms: e.target.value }))} style={inp}>
                  {["7","12","17","0"].map(a => <option key={a} value={a}>{a}%</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Valor ICMS (calculado)</label>
                <div style={{ ...inp, background: "var(--bg-card)", color: "#111111", fontWeight: 600 }}>{fmtBRL(valorIcms)}</div>
              </div>
              <div />

              {/* ── Vínculo NF-e ── */}
              <div style={divider}>Vínculo</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Chave de Acesso da NF-e Referenciada (opcional)</label>
                <input value={form.nfe_chave} onChange={e => setForm(f => ({ ...f, nfe_chave: e.target.value }))} style={inp} placeholder="44 dígitos da chave da NF-e (espaços são ignorados)" maxLength={60} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>

            {/* Rodapé modal */}
            <div style={{ padding: "14px 24px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Transmissão à SEFAZ via integração com biblioteca NF-e · Fluxo simulado por enquanto
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ ...btnV, background: saving ? "var(--text-muted)" : "#111111", cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Salvando…" : (cteEdit ? "Salvar alterações" : "Salvar CT-e")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Suspense } from "react";
export default function CtePage() {
  return (
    <Suspense fallback={null}>
      <CtePageInner />
    </Suspense>
  );
}
