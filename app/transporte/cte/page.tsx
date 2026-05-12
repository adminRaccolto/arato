"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const divider: React.CSSProperties = { gridColumn: "1 / -1", borderTop: "0.5px solid #EEF1F6", paddingTop: 12, marginTop: 4, fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
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
interface PessoaMin { id: string; nome: string; cpf_cnpj?: string; municipio?: string; estado?: string; }

const STATUS_META: Record<StatusCte, { label: string; bg: string; cl: string }> = {
  rascunho:   { label: "Rascunho",  bg: "#FBF3E0", cl: "#7B4A00" },
  autorizado: { label: "Autorizado",bg: "#E8F5E9", cl: "#1A6B3C" },
  cancelado:  { label: "Cancelado", bg: "#FCEBEB", cl: "#791F1F" },
};

const CFOPS_CTE = [
  { cfop: "6353", desc: "Prestação de serviço de transporte a estabelecimento comercial" },
  { cfop: "5353", desc: "Prestação de serviço de transporte a estabelecimento industrial (intraestadual)" },
  { cfop: "6354", desc: "Prestação de serviço de transporte a estabelecimento de produtor rural" },
  { cfop: "5354", desc: "Prestação de serviço de transporte a produtor rural (intraestadual)" },
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
      ${logoUrl ? `<img src="${logoUrl}" style="max-width:40mm;max-height:18mm;object-fit:contain" />` : `<span style="font-size:9pt;font-weight:700;color:#1A4870">DACTE</span>`}
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
export default function CtePage() {
  const { fazendaId, logoCliente } = useAuth();

  const [ctes,      setCtes]      = useState<Cte[]>([]);
  const [veiculos,  setVeiculos]  = useState<VeiculoMin[]>([]);
  const [motoristas,setMotoristas]= useState<MotoristaMin[]>([]);
  const [pessoas,   setPessoas]   = useState<PessoaMin[]>([]);

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
    numero_cte: proximoNr, serie: "1", data_emissao: hoje(),
    cfop: "6353",
    natureza_operacao: "Prestação de Serviço de Transporte",
    tomador_tipo: "remetente" as TomadorTipo,
    remetente_id: "", remetente_nome: "", remetente_cnpj: "",
    destinatario_id: "", destinatario_nome: "", destinatario_cnpj: "",
    municipio_origem: "", uf_origem: "MT",
    municipio_destino: "", uf_destino: "MT",
    produto_descricao: "Soja em Grão", ncm: "12010090",
    quantidade: "", unidade: "TON",
    peso_bruto_kg: "", peso_liquido_kg: "",
    valor_mercadoria: "", valor_frete: "",
    aliquota_icms: "12",
    veiculo_id: "", motorista_id: "",
    nfe_chave: "", observacao: "",
  });
  const [form, setForm] = useState(FORM_VAZIO());

  // Calculados
  const baseCalcIcms   = parseFloat(form.valor_frete) || 0;
  const valorIcms      = +(baseCalcIcms * (parseFloat(form.aliquota_icms) / 100)).toFixed(2);

  // ── Carregar ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: cd }, { data: vd }, { data: md }, { data: pd }] = await Promise.all([
      supabase.from("ctes").select("*").eq("fazenda_id", fazendaId).order("data_emissao", { ascending: false }),
      supabase.from("veiculos").select("id, placa, tipo, cap_kg").eq("fazenda_id", fazendaId).eq("ativo", true),
      supabase.from("motoristas").select("id, nome, cpf, cnh").eq("fazenda_id", fazendaId).eq("ativo", true),
      supabase.from("pessoas").select("id, nome, cpf_cnpj, municipio, estado").eq("fazenda_id", fazendaId),
    ]);
    setCtes(cd ?? []);
    setVeiculos(vd ?? []);
    setMotoristas(md ?? []);
    setPessoas(pd ?? []);
    // Próximo número
    if (cd && cd.length > 0) {
      const maxNr = Math.max(...(cd as Cte[]).map(c => parseInt(c.numero_cte) || 0));
      setProximoNr(String(maxNr + 1));
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

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
      numero_cte: c.numero_cte, serie: c.serie, data_emissao: c.data_emissao,
      cfop: c.cfop, natureza_operacao: c.natureza_operacao,
      tomador_tipo: c.tomador_tipo,
      remetente_id: c.remetente_id ?? "", remetente_nome: c.remetente_nome, remetente_cnpj: c.remetente_cnpj ?? "",
      destinatario_id: c.destinatario_id ?? "", destinatario_nome: c.destinatario_nome, destinatario_cnpj: c.destinatario_cnpj ?? "",
      municipio_origem: c.municipio_origem, uf_origem: c.uf_origem,
      municipio_destino: c.municipio_destino, uf_destino: c.uf_destino,
      produto_descricao: c.produto_descricao, ncm: c.ncm ?? "",
      quantidade: String(c.quantidade), unidade: c.unidade,
      peso_bruto_kg: String(c.peso_bruto_kg), peso_liquido_kg: String(c.peso_liquido_kg),
      valor_mercadoria: String(c.valor_mercadoria), valor_frete: String(c.valor_frete),
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
    if (!form.veiculo_id && !veiculos.length) { /* ok */ }
    setSaving(true); setErr("");
    try {
      const veiculo = veiculos.find(v => v.id === form.veiculo_id);
      const motorista = motoristas.find(m => m.id === form.motorista_id);
      const payload = {
        fazenda_id: fazendaId,
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
        municipio_destino: form.municipio_destino,
        uf_destino: form.uf_destino,
        produto_descricao: form.produto_descricao,
        ncm: form.ncm || null,
        quantidade: parseFloat(form.quantidade) || 0,
        unidade: form.unidade,
        peso_bruto_kg: parseFloat(form.peso_bruto_kg as string) || 0,
        peso_liquido_kg: parseFloat(form.peso_liquido_kg as string) || 0,
        valor_mercadoria: parseFloat(form.valor_mercadoria as string) || 0,
        valor_frete: parseFloat(form.valor_frete as string) || 0,
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
      if (cteEdit) {
        await supabase.from("ctes").update(payload).eq("id", cteEdit.id);
      } else {
        await supabase.from("ctes").insert(payload);
      }
      await carregar();
      setModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Autorizar — transmissão real SEFAZ ──────────────────
  async function autorizar(c: Cte) {
    if (!fazendaId) return;
    if (!confirm(`Transmitir CT-e ${c.numero_cte} para a SEFAZ?\nAmbiente configurado em Parâmetros → CT-e.`)) return;

    // Monta ibge do município se disponível
    const payload = {
      fazenda_id:         fazendaId,
      remetente:          { nome: c.remetente_nome,    cpf_cnpj: c.remetente_cnpj    ?? undefined },
      destinatario:       { nome: c.destinatario_nome, cpf_cnpj: c.destinatario_cnpj ?? undefined },
      municipio_ini_ibge: "0000000",
      municipio_ini_nome: c.municipio_origem,
      uf_ini:             c.uf_origem,
      municipio_fim_ibge: "0000000",
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

    try {
      const res  = await fetch("/api/fiscal/emitir-cte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat: string; xMotivo: string; xmlUrl?: string };

      await supabase.from("ctes").update({
        status:       data.sucesso ? "autorizado" : "rascunho",
        chave_acesso: data.chave   ?? null,
        xml_url:      data.xmlUrl  ?? null,
        numero_cte:   data.numero  ?? c.numero_cte,
      }).eq("id", c.id);

      await carregar();

      if (data.sucesso) {
        alert(`✓ CT-e autorizado!\nNúmero: ${data.numero}\nProtocolo: ${data.protocolo ?? "—"}\nChave: ${data.chave ?? "—"}`);
      } else {
        alert(`⚠ CT-e rejeitado pela SEFAZ\ncStat ${data.cStat}: ${data.xMotivo}`);
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

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>CT-e — Conhecimento de Transporte Eletrônico</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Frota própria · Modal rodoviário · Motoristas CLT
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Emitidos (total)",    value: ctes.length.toString(),        sub: "todos os status",       color: "#1A4870" },
            { label: "Autorizados",         value: autorizados.length.toString(), sub: "transmitidos SEFAZ",    color: "#1A6B3C" },
            { label: "Rascunho",            value: ctes.filter(c => c.status === "rascunho").length.toString(), sub: "aguardando autorização", color: "#C9921B" },
            { label: "Valor Total Fretes",  value: fmtBRL(totalFretes),           sub: "autorizados",           color: "#1A4870" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

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
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
            {ctes.length === 0 ? "Nenhum CT-e emitido." : "Nenhum CT-e encontrado para o filtro aplicado."}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFB" }}>
                  {["Nº/Série","Data","Remetente → Destinatário","Percurso","Veículo","Motorista","Valor Frete","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Valor Frete" ? "right" : "left", color: "#555", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid #EEF1F6", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ctesFiltrados.map(c => {
                  const sm = STATUS_META[c.status];
                  return (
                    <tr key={c.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1A4870" }}>
                        {c.numero_cte}/{c.serie}
                        <div style={{ fontSize: 10, color: "#aaa", fontWeight: 400 }}>{c.cfop}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{fmtData(c.data_emissao)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 12 }}>{c.remetente_nome}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>→ {c.destinatario_nome}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div>{c.municipio_origem}/{c.uf_origem}</div>
                        <div style={{ color: "#888" }}>→ {c.municipio_destino}/{c.uf_destino}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>
                        {c.veiculo_placa || "—"}
                        {c.veiculo_tipo && <div style={{ fontSize: 10, color: "#aaa" }}>{c.veiculo_tipo}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>{c.motorista_nome || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(c.valor_frete)}</td>
                      <td style={{ padding: "10px 12px" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          {c.status === "rascunho" && (
                            <button onClick={() => autorizar(c)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Autorizar SEFAZ
                            </button>
                          )}
                          <button onClick={() => imprimirDacte(c, logoCliente)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#1A4870", fontWeight: 600 }}>
                            DACTE
                          </button>
                          {c.status !== "cancelado" && (
                            <button onClick={() => abrirEditar(c)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>
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
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL EMISSÃO CT-e
      ══════════════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 800, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            {/* Cabeçalho modal */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{cteEdit ? `CT-e ${cteEdit.numero_cte}/${cteEdit.serie}` : "Emitir CT-e"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Conhecimento de Transporte Eletrônico — Modal Rodoviário</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {err && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{err}</div>}

              {/* ── Identificação ── */}
              <div style={divider}>Identificação</div>
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
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>CFOP</label>
                <select value={form.cfop} onChange={e => {
                  const desc = CFOPS_CTE.find(c => c.cfop === e.target.value)?.desc ?? form.natureza_operacao;
                  setForm(f => ({ ...f, cfop: e.target.value, natureza_operacao: desc }));
                }} style={inp}>
                  {CFOPS_CTE.map(c => <option key={c.cfop} value={c.cfop}>{c.cfop} — {c.desc}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Natureza da Operação</label>
                <input value={form.natureza_operacao} onChange={e => setForm(f => ({ ...f, natureza_operacao: e.target.value }))} style={inp} />
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

              {/* ── Remetente ── */}
              <div style={divider}>Remetente</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Selecionar Remetente (Pessoas cadastradas)</label>
                <select value={form.remetente_id} onChange={e => selecionarRemetente(e.target.value)} style={inp}>
                  <option value="">— Selecionar —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} {p.cpf_cnpj ? `· ${p.cpf_cnpj}` : ""}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / 3" }}>
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
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={lbl}>Razão Social / Nome</label>
                <input value={form.destinatario_nome} onChange={e => setForm(f => ({ ...f, destinatario_nome: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>CNPJ/CPF</label>
                <input value={form.destinatario_cnpj} onChange={e => setForm(f => ({ ...f, destinatario_cnpj: e.target.value }))} style={inp} />
              </div>

              {/* ── Percurso ── */}
              <div style={divider}>Percurso</div>
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={lbl}>Município de Origem</label>
                <input value={form.municipio_origem} onChange={e => setForm(f => ({ ...f, municipio_origem: e.target.value }))} style={inp} placeholder="Nova Mutum" />
              </div>
              <div>
                <label style={lbl}>UF Origem</label>
                <select value={form.uf_origem} onChange={e => setForm(f => ({ ...f, uf_origem: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={lbl}>Município de Destino</label>
                <input value={form.municipio_destino} onChange={e => setForm(f => ({ ...f, municipio_destino: e.target.value }))} style={inp} placeholder="Rondonópolis" />
              </div>
              <div>
                <label style={lbl}>UF Destino</label>
                <select value={form.uf_destino} onChange={e => setForm(f => ({ ...f, uf_destino: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* ── Mercadoria ── */}
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
                <input type="number" step="0.01" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Unidade</label>
                <select value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} style={inp}>
                  {["TON","KG","SC","UN","M3","L"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Valor da Mercadoria (R$)</label>
                <input type="number" step="0.01" value={form.valor_mercadoria} onChange={e => setForm(f => ({ ...f, valor_mercadoria: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Peso Bruto (kg)</label>
                <input type="number" step="0.01" value={form.peso_bruto_kg} onChange={e => setForm(f => ({ ...f, peso_bruto_kg: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Peso Líquido (kg)</label>
                <input type="number" step="0.01" value={form.peso_liquido_kg} onChange={e => setForm(f => ({ ...f, peso_liquido_kg: e.target.value }))} style={inp} />
              </div>

              {/* ── Veículo & Motorista ── */}
              <div style={divider}>Veículo & Motorista (frota própria — CLT)</div>
              <div>
                <label style={lbl}>Veículo</label>
                <select value={form.veiculo_id} onChange={e => selecionarVeiculo(e.target.value)} style={inp}>
                  <option value="">— Selecionar —</option>
                  {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo ?? "caminhão"}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Motorista</label>
                <select value={form.motorista_id} onChange={e => setForm(f => ({ ...f, motorista_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome} {m.cpf ? `· ${m.cpf}` : ""}</option>)}
                </select>
              </div>
              <div />

              {/* ── Valores & ICMS ── */}
              <div style={divider}>Valores & ICMS</div>
              <div>
                <label style={lbl}>Valor do Frete (prestação) (R$)</label>
                <input type="number" step="0.01" value={form.valor_frete} onChange={e => setForm(f => ({ ...f, valor_frete: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Alíquota ICMS (%)</label>
                <select value={form.aliquota_icms} onChange={e => setForm(f => ({ ...f, aliquota_icms: e.target.value }))} style={inp}>
                  {["7","12","17","0"].map(a => <option key={a} value={a}>{a}%</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Valor ICMS (calculado)</label>
                <div style={{ ...inp, background: "#F8FAFB", color: "#1A4870", fontWeight: 600 }}>{fmtBRL(valorIcms)}</div>
              </div>

              {/* ── Vínculo NF-e ── */}
              <div style={divider}>Vínculo</div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Chave de Acesso da NF-e Referenciada (opcional)</label>
                <input value={form.nfe_chave} onChange={e => setForm(f => ({ ...f, nfe_chave: e.target.value }))} style={inp} placeholder="44 dígitos da chave da NF-e" maxLength={44} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>

            {/* Rodapé modal */}
            <div style={{ padding: "14px 24px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#888" }}>
                Transmissão à SEFAZ via integração com biblioteca NF-e · Fluxo simulado por enquanto
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ ...btnV, background: saving ? "#aaa" : "#1A4870", cursor: saving ? "default" : "pointer" }}>
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
