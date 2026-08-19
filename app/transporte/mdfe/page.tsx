"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
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
// DAMDFE — Documento Auxiliar do MDF-e
// ─────────────────────────────────────────────────────────────
function imprimirDamdfe(m: Mdfe, emitenteCnpj: string, emitentNome: string) {
  const chave44 = (m.chave_acesso ?? "").replace(/\D/g, "");
  const chaveBlocks = chave44 ? chave44.replace(/(.{4})/g, "$1 ").trim() : "— aguardando autorização SEFAZ —";
  const numFmt = m.numero_mdfe.padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");
  const dataFmt = m.data_emissao ? new Date(m.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const percurso = [m.uf_inicio, ...(m.percurso_ufs ?? []), m.uf_fim].join(" → ");
  const pesoTon = ((m.peso_total_kg ?? 0) / 1000).toFixed(3).replace(".", ",");
  const statusLabel = m.status === "autorizado" ? "AUTORIZADO" : m.status === "encerrado" ? "ENCERRADO" : m.status.toUpperCase();
  const docs = Array.isArray(m.documentos) ? m.documentos : [];

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>DAMDFE MDF-e ${numFmt} — Série ${m.serie}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; }
  @page { size: A4 portrait; margin: 8mm; }
  @media print { body { margin: 0; } }
  .page { width: 100%; }
  .box { border: 0.5pt solid #000; padding: 4px 6px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0; }
  .section { border: 0.5pt solid #000; margin-bottom: 0; }
  .section + .section { border-top: none; }
  .section-title { background: #e0e0e0; font-weight: bold; font-size: 7pt; padding: 2px 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .field { padding: 3px 4px; border-right: 0.5pt solid #000; }
  .field:last-child { border-right: none; }
  .label { font-size: 6.5pt; color: #555; display: block; }
  .value { font-size: 8.5pt; font-weight: 700; }
  .chave { font-family: monospace; font-size: 8pt; letter-spacing: 0.08em; text-align: center; padding: 4px; }
  .header-title { text-align: center; font-size: 12pt; font-weight: 900; }
  .header-sub { text-align: center; font-size: 7pt; }
  .status-badge { display: inline-block; padding: 2px 10px; border: 1.5pt solid #000; font-size: 9pt; font-weight: 900; }
  .doc-row { display: grid; grid-template-columns: 40px 1fr 100px; border-top: 0.5pt solid #ccc; padding: 2px 4px; }
  .doc-header { display: grid; grid-template-columns: 40px 1fr 100px; padding: 2px 4px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; background: #f0f0f0; }
  .warn { color: #cc0000; font-size: 7pt; font-weight: 700; text-align: center; margin-top: 4px; }
  .barcode-area { text-align: center; padding: 6px 4px 2px; }
  svg#barcode { display: block; margin: 0 auto; }
</style>
</head>
<body>
<div class="page">

  <!-- Cabeçalho -->
  <div style="display:grid;grid-template-columns:1fr auto 180px;border:0.5pt solid #000;margin-bottom:0">
    <div style="padding:6px 8px;border-right:0.5pt solid #000">
      <div style="font-size:7pt;color:#555">EMITENTE</div>
      <div style="font-size:10pt;font-weight:900;line-height:1.2">${emitentNome || "—"}</div>
      <div style="font-size:7pt;margin-top:2px">CNPJ: ${emitenteCnpj || "—"}</div>
    </div>
    <div style="padding:6px 12px;text-align:center;border-right:0.5pt solid #000">
      <div class="header-title">DAMDFE</div>
      <div class="header-sub">DOCUMENTO AUXILIAR DO</div>
      <div class="header-sub">MANIFESTO ELETRÔNICO DE</div>
      <div class="header-sub">DOCUMENTOS FISCAIS</div>
      <div style="margin-top:4px;font-size:8pt">MODELO <b>58</b> · SÉRIE <b>${m.serie}</b> · Nº <b>${numFmt}</b></div>
      <div style="font-size:7pt">Emissão: ${dataFmt}</div>
    </div>
    <div style="padding:6px 8px;text-align:center">
      <div style="font-size:7pt;color:#555;margin-bottom:4px">STATUS</div>
      <div class="status-badge">${statusLabel}</div>
    </div>
  </div>

  <!-- Chave de acesso -->
  <div class="section">
    <div class="section-title">CHAVE DE ACESSO</div>
    <div class="chave">${chaveBlocks}</div>
    ${!chave44 ? `<div class="warn">⚠ MDF-e ainda não autorizado pela SEFAZ</div>` : ""}
    <div class="barcode-area">
      <svg id="barcode"></svg>
    </div>
  </div>

  <!-- Percurso -->
  <div class="section" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-top:none">
    <div class="field">
      <span class="label">UF INÍCIO</span>
      <span class="value">${m.uf_inicio}</span>
    </div>
    <div class="field">
      <span class="label">MUNICÍPIO INÍCIO</span>
      <span class="value">${m.municipio_inicio || "—"}</span>
    </div>
    <div class="field">
      <span class="label">UF FIM</span>
      <span class="value">${m.uf_fim}</span>
    </div>
    <div class="field" style="border-right:none">
      <span class="label">PERCURSO</span>
      <span class="value">${percurso}</span>
    </div>
  </div>

  <!-- Veículo e Motorista -->
  <div class="section" style="display:grid;grid-template-columns:120px 1fr 180px 180px;border-top:none">
    <div class="field">
      <span class="label">PLACA DO VEÍCULO</span>
      <span class="value">${m.veiculo_placa || "—"}</span>
    </div>
    <div class="field">
      <span class="label">TIPO DO VEÍCULO</span>
      <span class="value">${m.veiculo_tipo || "—"}</span>
    </div>
    <div class="field">
      <span class="label">MOTORISTA</span>
      <span class="value">${m.motorista_nome || "—"}</span>
    </div>
    <div class="field" style="border-right:none">
      <span class="label">CPF DO MOTORISTA</span>
      <span class="value">${m.motorista_cpf || "—"}</span>
    </div>
  </div>

  <!-- Carga -->
  <div class="section" style="display:grid;grid-template-columns:1fr 1fr 1fr;border-top:none">
    <div class="field">
      <span class="label">PESO TOTAL DA CARGA (t)</span>
      <span class="value">${pesoTon}</span>
    </div>
    <div class="field">
      <span class="label">VALOR TOTAL DA CARGA</span>
      <span class="value">${m.valor_total_carga ? fmtBRL(m.valor_total_carga) : "—"}</span>
    </div>
    <div class="field" style="border-right:none">
      <span class="label">TOTAL DE DOCUMENTOS</span>
      <span class="value">${docs.length}</span>
    </div>
  </div>

  <!-- Documentos -->
  <div class="section" style="border-top:none">
    <div class="section-title">DOCUMENTOS FISCAIS VINCULADOS</div>
    <div class="doc-header">
      <span>TIPO</span>
      <span>CHAVE DE ACESSO</span>
      <span>Nº</span>
    </div>
    ${docs.map(d => `
    <div class="doc-row">
      <span style="font-weight:700">${(d.tipo ?? "").toUpperCase()}</span>
      <span style="font-family:monospace;font-size:7pt">${(d.chave ?? "").replace(/(.{4})/g, "$1 ").trim()}</span>
      <span>${d.numero ?? "—"}</span>
    </div>`).join("")}
    ${docs.length === 0 ? `<div style="padding:6px;text-align:center;color:#888;font-size:7pt">Nenhum documento vinculado</div>` : ""}
  </div>

  ${m.ciot ? `
  <div class="section" style="border-top:none">
    <div class="section-title">CIOT — Código Identificador da Operação de Transporte</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
      <div class="field"><span class="label">CÓDIGO CIOT</span><span class="value" style="font-size:11pt;letter-spacing:0.1em">${m.ciot}</span></div>
      <div class="field"><span class="label">CÓDIGO VERIFICADOR</span><span class="value">${m.ciot_codigo_verificador ?? "—"}</span></div>
      <div class="field" style="border-right:none"><span class="label">PROTOCOLO ANTT</span><span class="value">${m.ciot_protocolo ?? "—"}</span></div>
    </div>
  </div>` : ""}

  ${m.observacao ? `
  <div class="section" style="border-top:none">
    <div class="section-title">OBSERVAÇÕES</div>
    <div style="padding:4px 6px;font-size:7.5pt">${m.observacao}</div>
  </div>` : ""}

  ${m.status === "encerrado" && m.data_encerramento ? `
  <div class="section" style="border-top:none">
    <div class="section-title">ENCERRAMENTO</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
      <div class="field"><span class="label">DATA</span><span class="value">${fmtData(m.data_encerramento)}</span></div>
      <div class="field"><span class="label">MUNICÍPIO</span><span class="value">${m.municipio_encerramento ?? "—"}</span></div>
      <div class="field" style="border-right:none"><span class="label">UF</span><span class="value">${m.uf_encerramento ?? "—"}</span></div>
    </div>
  </div>` : ""}

</div>

<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<script>
  if ("${chave44}".length === 44) {
    try { JsBarcode("#barcode","${chave44}",{format:"CODE128",width:1.2,height:35,displayValue:false,margin:0}); } catch(e){}
  }
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type StatusMdfe = "rascunho" | "autorizado" | "encerrado" | "cancelado";

interface DocVinculado {
  tipo: "cte" | "nfe";
  chave: string;
  numero?: string;
  emitente?: string;
}

interface Mdfe {
  id: string;
  fazenda_id: string;
  numero_mdfe: string;
  serie: string;
  chave_acesso?: string | null;
  data_emissao: string;
  uf_inicio: string;
  municipio_inicio: string;
  uf_fim: string;
  percurso_ufs?: string[] | null;    // UFs intermediárias
  veiculo_id?: string | null;
  veiculo_placa: string;
  veiculo_tipo?: string | null;
  motorista_id?: string | null;
  motorista_nome: string;
  motorista_cpf?: string | null;
  documentos: DocVinculado[];
  peso_total_kg?: number | null;
  valor_total_carga?: number | null;
  status: StatusMdfe;
  data_encerramento?: string | null;
  municipio_encerramento?: string | null;
  uf_encerramento?: string | null;
  observacao?: string | null;
  ciot?: string | null;
  ciot_codigo_verificador?: string | null;
  ciot_protocolo?: string | null;
  created_at?: string;
}

interface CteMin { id: string; numero_cte: string; serie: string; chave_acesso?: string | null; remetente_nome: string; destinatario_nome: string; valor_frete: number; status: string; }
interface VeiculoMin { id: string; placa: string; tipo?: string; rntrc?: string; num_eixos?: number; }
interface MotoristaMin { id: string; nome: string; cpf?: string; tipo?: string; rntrc?: string; }

const STATUS_META: Record<StatusMdfe, { label: string; bg: string; cl: string }> = {
  rascunho:   { label: "Rascunho",   bg: "#FBF3E0", cl: "#7B4A00" },
  autorizado: { label: "Autorizado", bg: "#E8E8E8", cl: "#0D0D0D" },
  encerrado:  { label: "Encerrado",  bg: "#E8F5E9", cl: "#1A6B3C" },
  cancelado:  { label: "Cancelado",  bg: "#FCEBEB", cl: "#791F1F" },
};

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function MdfePage() {
  const { fazendaId, fazendaIds, podeAcessarPlano } = useAuth();

  const [mdfes,     setMdfes]     = useState<Mdfe[]>([]);
  const [ctes,      setCtes]      = useState<CteMin[]>([]);
  const [veiculos,  setVeiculos]  = useState<VeiculoMin[]>([]);
  const [motoristas,setMotoristas]= useState<MotoristaMin[]>([]);
  const [empresaCpfCnpj, setEmpresaCpfCnpj] = useState("");
  const [empresaNome,    setEmpresaNome]    = useState("");

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState("");

  // Modal emissão
  const [modal, setModal]       = useState(false);
  const [mdfeEdit, setMdfeEdit] = useState<Mdfe | null>(null);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");
  const [proximoNr, setProximoNr] = useState("1");

  const FORM_VAZIO = () => ({
    numero_mdfe: proximoNr, serie: "1", data_emissao: hoje(),
    uf_inicio: "MT", municipio_inicio: "",
    uf_fim: "MT",
    percurso_ufs: [] as string[],
    veiculo_id: "", motorista_id: "",
    peso_total_kg: 0, valor_total_carga: 0,
    observacao: "",
    // Documentos vinculados
    cte_ids: [] as string[],
    nfe_chaves: [""],   // lista de chaves manuais
  });
  const [form, setForm] = useState(FORM_VAZIO());

  // CIOT
  const [ciotForm, setCiotForm] = useState({
    valor_frete: "", data_fim: "", cep_origem: "", cep_destino: "",
    ibge_origem: "", ibge_destino: "", distancia_km: "",
    peso_ton: "", natureza: "2101", tipo_pagamento: "6", chave_pix: "",
  });
  const [ciotGerado,   setCiotGerado]   = useState<{ id: string; cv: string; protocolo: string } | null>(null);
  const [gerandoCiot,  setGerandoCiot]  = useState(false);
  const [ciotErro,     setCiotErro]     = useState("");

  // Modal encerramento
  const [modalEnc, setModalEnc] = useState<Mdfe | null>(null);
  const [encForm, setEncForm]   = useState({ data_encerramento: hoje(), municipio_encerramento: "", uf_encerramento: "MT" });
  const [encSaving, setEncSaving] = useState(false);

  // ── Carregar ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: md }, { data: cd }, { data: vd }, { data: mot }] = await Promise.all([
      supabase.from("mdfes").select("*").in("fazenda_id", fazendaIds).order("data_emissao", { ascending: false }),
      supabase.from("ctes").select("id, numero_cte, serie, chave_acesso, remetente_nome, destinatario_nome, valor_frete, status").in("fazenda_id", fazendaIds).eq("status", "autorizado"),
      supabase.from("veiculos").select("id, placa, tipo, rntrc, num_eixos").in("fazenda_id", fazendaIds).eq("ativo", true),
      supabase.from("motoristas").select("id, nome, cpf, tipo, rntrc").in("fazenda_id", fazendaIds).eq("ativo", true),
    ]);
    const raw = md ?? [];
    // documentos pode vir como JSON string do banco
    const parsed = raw.map((m: Mdfe & { documentos: unknown }) => ({
      ...m,
      documentos: typeof m.documentos === "string" ? JSON.parse(m.documentos) : (m.documentos ?? []),
    }));
    setMdfes(parsed);
    setCtes(cd ?? []);
    setVeiculos(vd ?? []);
    setMotoristas(mot ?? []);
    // cpf_cnpj do contratante (primeira empresa ativa da fazenda)
    supabase.from("empresas").select("cpf_cnpj, razao_social, nome").in("fazenda_id", fazendaIds).limit(1).single()
      .then(({ data }) => {
        if (data?.cpf_cnpj) setEmpresaCpfCnpj(data.cpf_cnpj);
        if (data) setEmpresaNome(data.razao_social ?? data.nome ?? "");
      });
    if (raw.length > 0) {
      const maxNr = Math.max(...raw.map((m: Mdfe) => parseInt(m.numero_mdfe) || 0));
      setProximoNr(String(maxNr + 1));
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Abrir modal ──────────────────────────────────────────
  function resetCiot() {
    setCiotForm({ valor_frete: "", data_fim: "", cep_origem: "", cep_destino: "", ibge_origem: "", ibge_destino: "", distancia_km: "", peso_ton: "", natureza: "2101", tipo_pagamento: "6", chave_pix: "" });
    setCiotGerado(null); setCiotErro("");
  }

  function abrirNovo() {
    setMdfeEdit(null);
    setForm({ ...FORM_VAZIO(), numero_mdfe: proximoNr });
    setErr(""); resetCiot();
    setModal(true);
  }

  function abrirEditar(m: Mdfe) {
    setMdfeEdit(m);
    const cteIds = m.documentos.filter(d => d.tipo === "cte").map(d => {
      const c = ctes.find(c => c.chave_acesso === d.chave);
      return c?.id ?? "";
    }).filter(Boolean);
    const nfeChaves = m.documentos.filter(d => d.tipo === "nfe").map(d => d.chave);
    setForm({
      numero_mdfe: m.numero_mdfe, serie: m.serie, data_emissao: m.data_emissao,
      uf_inicio: m.uf_inicio, municipio_inicio: m.municipio_inicio,
      uf_fim: m.uf_fim,
      percurso_ufs: m.percurso_ufs ?? [],
      veiculo_id: m.veiculo_id ?? "", motorista_id: m.motorista_id ?? "",
      peso_total_kg: m.peso_total_kg ?? 0,
      valor_total_carga: m.valor_total_carga ?? 0,
      observacao: m.observacao ?? "",
      cte_ids: cteIds,
      nfe_chaves: nfeChaves.length > 0 ? nfeChaves : [""],
    });
    setErr(""); resetCiot();
    if (m.ciot) setCiotGerado({ id: m.ciot, cv: m.ciot_codigo_verificador ?? "", protocolo: m.ciot_protocolo ?? "" });
    setModal(true);
  }

  // ── Gerar CIOT via ANTT ──────────────────────────────────
  async function gerarCiot() {
    const motorista = motoristas.find(m => m.id === form.motorista_id);
    const veiculo   = veiculos.find(v => v.id === form.veiculo_id);
    if (!motorista?.cpf) { setCiotErro("Motorista sem CPF cadastrado."); return; }
    if (!veiculo?.placa) { setCiotErro("Selecione um veículo."); return; }
    if (!ciotForm.valor_frete || !ciotForm.data_fim || !ciotForm.cep_origem || !ciotForm.cep_destino || !ciotForm.distancia_km) {
      setCiotErro("Preencha todos os campos obrigatórios do CIOT."); return;
    }
    setGerandoCiot(true); setCiotErro("");
    try {
      const res = await fetch("/api/antt/ciot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "declarar",
          cnpjContratante: empresaCpfCnpj,
          ambiente: "homologacao",
          dados: {
            CpfCnpjContratado:  motorista.cpf.replace(/\D/g, ""),
            RNTRCContratado:    motorista.rntrc ?? veiculo.rntrc ?? "",
            CpfCnpjContratante: empresaCpfCnpj.replace(/\D/g, ""),
            ValorFrete:         parseFloat(ciotForm.valor_frete.replace(",", ".")).toFixed(2),
            DataInicioViagem:   form.data_emissao,
            DataFimViagem:      ciotForm.data_fim,
            Veiculos: [{ Placa: veiculo.placa, RNTRC: veiculo.rntrc ?? motorista.rntrc ?? "", NumeroEixos: String(veiculo.num_eixos ?? 3) }],
            OrigemDestino: [{
              Origem:  { CodigoMunicipioOrigem:  ciotForm.ibge_origem,  CepOrigem:   ciotForm.cep_origem.replace(/\D/g,"")  },
              Destino: { CodigoMunicipioDestino: ciotForm.ibge_destino, CepDestino:  ciotForm.cep_destino.replace(/\D/g,"") },
              DistanciaPercorrida: ciotForm.distancia_km,
              QtdViagens: "1",
            }],
            DadosCarga: { CodigoNaturezaCarga: ciotForm.natureza, PesoCarga: ciotForm.peso_ton || "0", CodigoTipoCarga: "5" },
            InfPagamento: [{
              TipoPagamento: ciotForm.tipo_pagamento,
              CpfCnpjCreditado: motorista.cpf.replace(/\D/g,""),
              ...(ciotForm.tipo_pagamento === "6" ? { ChavePix: ciotForm.chave_pix || motorista.cpf.replace(/\D/g,""), IndPagamento: "0" } : { IndPagamento: "0" }),
            }],
          },
        }),
      });
      const data = await res.json();
      if (data.Sucesso && data.Dados?.IdOperacaoTransporte) {
        const gerado = { id: data.Dados.IdOperacaoTransporte, cv: data.Dados.CodigoVerificador, protocolo: data.Dados.Protocolo ?? "" };
        setCiotGerado(gerado);
        // Persiste CIOT imediatamente via API route (service_role_key — imune a JWT expirado)
        if (mdfeEdit?.id) {
          fetch("/api/mdfe/salvar-ciot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mdfe_id: mdfeEdit.id,
              ciot: gerado.id,
              ciot_codigo_verificador: gerado.cv,
              ciot_protocolo: gerado.protocolo,
            }),
          }).then(() => carregar()).catch(() => {/* best-effort */});
        }
      } else {
        setCiotErro(data.Mensagem || data.Erros?.join(", ") || "Erro ao gerar CIOT.");
      }
    } catch (e) {
      setCiotErro(e instanceof Error ? e.message : "Erro de conexão com a ANTT.");
    } finally {
      setGerandoCiot(false);
    }
  }

  // ── Toggle CT-e vinculado ────────────────────────────────
  function toggleCte(id: string) {
    setForm(f => ({
      ...f,
      cte_ids: f.cte_ids.includes(id) ? f.cte_ids.filter(c => c !== id) : [...f.cte_ids, id],
    }));
  }

  // ── Salvar ───────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    if (!form.municipio_inicio.trim()) { setErr("Informe o município de início."); return; }
    setSaving(true); setErr("");
    try {
      const veiculo   = veiculos.find(v => v.id === form.veiculo_id);
      const motorista = motoristas.find(m => m.id === form.motorista_id);

      // Montar array de documentos
      const documentos: DocVinculado[] = [];
      for (const cteId of form.cte_ids) {
        const c = ctes.find(c => c.id === cteId);
        if (c) documentos.push({ tipo: "cte", chave: c.chave_acesso ?? "", numero: c.numero_cte, emitente: c.remetente_nome });
      }
      for (const chave of form.nfe_chaves) {
        if (chave.trim()) documentos.push({ tipo: "nfe", chave: chave.trim() });
      }

      const payload = {
        fazenda_id: fazendaId,
        numero_mdfe: form.numero_mdfe,
        serie: form.serie,
        chave_acesso: mdfeEdit?.chave_acesso ?? null,
        data_emissao: form.data_emissao,
        uf_inicio: form.uf_inicio,
        municipio_inicio: form.municipio_inicio,
        uf_fim: form.uf_fim,
        percurso_ufs: form.percurso_ufs.length > 0 ? form.percurso_ufs : null,
        veiculo_id: form.veiculo_id || null,
        veiculo_placa: veiculo?.placa ?? "",
        veiculo_tipo: veiculo?.tipo ?? null,
        motorista_id: form.motorista_id || null,
        motorista_nome: motorista?.nome ?? "",
        motorista_cpf: motorista?.cpf ?? null,
        documentos,
        peso_total_kg: form.peso_total_kg || null,
        valor_total_carga: form.valor_total_carga || null,
        status: mdfeEdit ? mdfeEdit.status : "rascunho" as StatusMdfe,
        observacao: form.observacao || null,
        ciot: ciotGerado?.id ?? mdfeEdit?.ciot ?? null,
        ciot_codigo_verificador: ciotGerado?.cv ?? mdfeEdit?.ciot_codigo_verificador ?? null,
        ciot_protocolo: ciotGerado?.protocolo ?? mdfeEdit?.ciot_protocolo ?? null,
      };
      if (mdfeEdit) {
        await supabase.from("mdfes").update(payload).eq("id", mdfeEdit.id);
      } else {
        await supabase.from("mdfes").insert(payload);
      }
      await carregar();
      setModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Autorizar (simulado) ─────────────────────────────────
  async function autorizar(m: Mdfe) {
    const chave = `35${m.data_emissao.replace(/-/g,"").slice(2,6)}00000000000000000000000${m.numero_mdfe.padStart(9,"0")}58`;
    await supabase.from("mdfes").update({ status: "autorizado", chave_acesso: chave }).eq("id", m.id);
    await carregar();
  }

  // ── Encerrar ─────────────────────────────────────────────
  async function encerrar() {
    if (!modalEnc) return;
    if (!encForm.municipio_encerramento.trim()) { alert("Informe o município de encerramento."); return; }
    setEncSaving(true);
    try {
      await supabase.from("mdfes").update({
        status: "encerrado",
        data_encerramento: encForm.data_encerramento,
        municipio_encerramento: encForm.municipio_encerramento,
        uf_encerramento: encForm.uf_encerramento,
      }).eq("id", modalEnc.id);
      await carregar();
      setModalEnc(null);
    } finally {
      setEncSaving(false);
    }
  }

  async function cancelar(m: Mdfe) {
    if (!confirm("Cancelar este MDF-e?")) return;
    await supabase.from("mdfes").update({ status: "cancelado" }).eq("id", m.id);
    await carregar();
  }

  // ── Filtrar ──────────────────────────────────────────────
  const mdfesFiltrados = mdfes.filter(m => !filtroStatus || m.status === filtroStatus);

  // ── KPIs ─────────────────────────────────────────────────
  const emTransito   = mdfes.filter(m => m.status === "autorizado");
  const encerrados   = mdfes.filter(m => m.status === "encerrado");
  const pesoTransito = emTransito.reduce((s, m) => s + (m.peso_total_kg ?? 0), 0);

  if (!podeAcessarPlano("transporte")) return <PlanoGate modulo="transporte" />;
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>MDF-e — Manifesto de Documentos Fiscais Eletrônico</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Vincula CT-e e NF-e por viagem · Frota própria · Motoristas CLT
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Em Trânsito",          value: emTransito.length.toString(),  sub: "manifestos autorizados",  color: "#111111" },
            { label: "Encerrados",            value: encerrados.length.toString(),  sub: "viagens concluídas",      color: "#1A6B3C" },
            { label: "Carga em Trânsito",     value: pesoTransito > 0 ? `${(pesoTransito/1000).toFixed(0)} ton` : "—", sub: "peso total", color: "#C9921B" },
            { label: "Cancelados",            value: mdfes.filter(m => m.status === "cancelado").length.toString(), sub: "total", color: "var(--text-2)" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtro + botão */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 160px" }}>
            <label style={lbl}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={abrirNovo} style={btnV}>+ Emitir MDF-e</button>
        </div>

        {/* Tabela */}
        {mdfesFiltrados.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            {mdfes.length === 0 ? "Nenhum MDF-e emitido." : "Nenhum MDF-e encontrado para o filtro aplicado."}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  {["Nº/Série","Data","Percurso","Veículo","Motorista","Documentos","Peso","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Peso" ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mdfesFiltrados.map(m => {
                  const sm = STATUS_META[m.status];
                  const nCtes = m.documentos.filter(d => d.tipo === "cte").length;
                  const nNfes = m.documentos.filter(d => d.tipo === "nfe").length;
                  return (
                    <tr key={m.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111111" }}>
                        {m.numero_mdfe}/{m.serie}
                        {m.chave_acesso && <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 400, fontFamily: "monospace" }}>{m.chave_acesso.slice(0, 12)}…</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{fmtData(m.data_emissao)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div>{m.municipio_inicio}/{m.uf_inicio}</div>
                        <div style={{ color: "var(--text-3)" }}>→ {m.uf_fim}</div>
                        {m.status === "encerrado" && m.municipio_encerramento && (
                          <div style={{ fontSize: 10, color: "#1A6B3C" }}>Enc.: {m.municipio_encerramento}/{m.uf_encerramento}</div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
                        {m.veiculo_placa || "—"}
                        {m.veiculo_tipo && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.veiculo_tipo}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>{m.motorista_nome || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {nCtes > 0 && badge(`${nCtes} CT-e`, "#E6F1FB", "#0C447C")}
                          {nNfes > 0 && badge(`${nNfes} NF-e`, "#E8F5E9", "#1A6B3C")}
                          {nCtes === 0 && nNfes === 0 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sem docs.</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>
                        {m.peso_total_kg ? `${(m.peso_total_kg / 1000).toFixed(1)} ton` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          {m.status === "rascunho" && (
                            <button onClick={() => autorizar(m)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Autorizar
                            </button>
                          )}
                          {m.status === "autorizado" && (
                            <button onClick={() => { setModalEnc(m); setEncForm({ data_encerramento: hoje(), municipio_encerramento: m.municipio_inicio, uf_encerramento: m.uf_fim }); }} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#111111", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Encerrar
                            </button>
                          )}
                          {(m.status === "autorizado" || m.status === "encerrado") && (
                            <button onClick={() => imprimirDamdfe(m, empresaCpfCnpj, empresaNome)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#111111", fontWeight: 600 }}>
                              DAMDFE
                            </button>
                          )}
                          {m.status === "rascunho" && (
                            <button onClick={() => abrirEditar(m)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>
                              Editar
                            </button>
                          )}
                          {m.status === "autorizado" && (
                            <button onClick={() => cancelar(m)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
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

        {/* Nota sobre DAEE */}
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#E8E8E8", borderRadius: 8, fontSize: 12, color: "#0D0D0D" }}>
          <strong>MDF-e obrigatório</strong> para transporte interestadual de cargas e sempre que houver múltiplos documentos fiscais por veículo.
          Motoristas <strong>TAC</strong>: CIOT gerado automaticamente via API ANTT. Motoristas <strong>CLT</strong> (frota própria): isento de CIOT.
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL EMISSÃO MDF-e
      ══════════════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 780, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{mdfeEdit ? `MDF-e ${mdfeEdit.numero_mdfe}/${mdfeEdit.serie}` : "Emitir MDF-e"}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Manifesto de Documentos Fiscais Eletrônico</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {err && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{err}</div>}

              {/* ── Identificação ── */}
              <div style={divider}>Identificação</div>
              <div>
                <label style={lbl}>Nº MDF-e</label>
                <input value={form.numero_mdfe} onChange={e => setForm(f => ({ ...f, numero_mdfe: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Série</label>
                <input value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data de Emissão</label>
                <input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} style={inp} />
              </div>

              {/* ── Percurso ── */}
              <div style={divider}>Percurso</div>
              <div>
                <label style={lbl}>UF de Início</label>
                <select value={form.uf_inicio} onChange={e => setForm(f => ({ ...f, uf_inicio: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "2 / -1" }}>
                <label style={lbl}>Município de Início (carregamento)</label>
                <input value={form.municipio_inicio} onChange={e => setForm(f => ({ ...f, municipio_inicio: e.target.value }))} style={inp} placeholder="Nova Mutum — MT" />
              </div>
              <div>
                <label style={lbl}>UF de Destino (fim)</label>
                <select value={form.uf_fim} onChange={e => setForm(f => ({ ...f, uf_fim: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "2 / -1" }}>
                <label style={lbl}>UFs do Percurso Intermediário (opcional)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {UFS.filter(u => u !== form.uf_inicio && u !== form.uf_fim).map(u => {
                    const sel = form.percurso_ufs.includes(u);
                    return (
                      <button key={u} type="button"
                        onClick={() => setForm(f => ({ ...f, percurso_ufs: sel ? f.percurso_ufs.filter(x => x !== u) : [...f.percurso_ufs, u] }))}
                        style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, border: `1px solid ${sel ? "#111111" : "var(--border-table)"}`, background: sel ? "#E8E8E8" : "var(--bg-card)", cursor: "pointer", color: sel ? "#0D0D0D" : "var(--text-2)", fontWeight: sel ? 600 : 400 }}>
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Veículo & Motorista ── */}
              <div style={divider}>Veículo & Motorista</div>
              <div>
                <label style={lbl}>Veículo</label>
                <select value={form.veiculo_id} onChange={e => setForm(f => ({ ...f, veiculo_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo ?? "caminhão"}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Motorista</label>
                <select value={form.motorista_id} onChange={e => setForm(f => ({ ...f, motorista_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div />

              {/* ── CIOT (TAC) ── */}
              {(() => {
                const mot = motoristas.find(m => m.id === form.motorista_id);
                if (!mot || mot.tipo !== "tac") return null;
                const NATUREZAS = [["2101","Soja"],["2102","Milho"],["2103","Algodão"],["2202","Granel vegetal"],["2201","Fertilizantes"],["4101","Carga geral"]];
                const PGTOS    = [["6","PIX"],["1","Dinheiro"],["3","TED"]];
                return <>
                  <div style={{ ...divider, color: ciotGerado ? "#16A34A" : "#C9921B", borderTopColor: ciotGerado ? "#16A34A40" : "#C9921B40" }}>
                    CIOT — {ciotGerado ? `✓ Gerado: ${ciotGerado.id}` : "Motorista TAC — CIOT obrigatório (Lei 11.442/2007)"}
                  </div>
                  {ciotGerado ? (
                    <div style={{ gridColumn:"1/-1", background:"#F0FDF4", border:"0.5px solid #16A34A50", borderRadius:8, padding:"12px 16px", display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
                      <div>
                        <div style={{ fontSize:10, color:"#16A34A", fontWeight:700 }}>CIOT</div>
                        <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", letterSpacing:2 }}>{ciotGerado.id}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:"var(--text-2)" }}>Cód. Verificador</div>
                        <div style={{ fontSize:15, fontFamily:"monospace" }}>{ciotGerado.cv}</div>
                      </div>
                      {ciotGerado.protocolo && <div>
                        <div style={{ fontSize:10, color:"var(--text-2)" }}>Protocolo</div>
                        <div style={{ fontSize:12, fontFamily:"monospace", color:"var(--text-2)" }}>{ciotGerado.protocolo}</div>
                      </div>}
                      <button type="button" onClick={resetCiot} style={{ marginLeft:"auto", padding:"6px 14px", border:"0.5px solid #C9921B50", borderRadius:8, background:"#FBF3E0", color:"#7A5400", fontSize:12, cursor:"pointer" }}>
                        Gerar novo
                      </button>
                    </div>
                  ) : (
                    <>
                      {ciotErro && <div style={{ gridColumn:"1/-1", background:"#FCEBEB", border:"0.5px solid #F5C6C6", borderRadius:8, padding:"8px 14px", fontSize:12, color:"#791F1F" }}>{ciotErro}</div>}
                      <div>
                        <label style={lbl}>Valor do Frete (R$) *</label>
                        <input style={inp} placeholder="4500.00" value={ciotForm.valor_frete} onChange={e => setCiotForm(f => ({ ...f, valor_frete: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Data Fim da Viagem *</label>
                        <input type="date" style={inp} value={ciotForm.data_fim} onChange={e => setCiotForm(f => ({ ...f, data_fim: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Distância (km) *</label>
                        <input style={inp} placeholder="850" value={ciotForm.distancia_km} onChange={e => setCiotForm(f => ({ ...f, distancia_km: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>CEP Origem *</label>
                        <input style={{ ...inp, fontFamily:"monospace" }} placeholder="78450-000" value={ciotForm.cep_origem} onChange={e => setCiotForm(f => ({ ...f, cep_origem: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Cód. IBGE Município Origem *</label>
                        <input style={{ ...inp, fontFamily:"monospace" }} placeholder="5106224" maxLength={7} value={ciotForm.ibge_origem} onChange={e => setCiotForm(f => ({ ...f, ibge_origem: e.target.value.replace(/\D/g,"") }))} />
                      </div>
                      <div>
                        <label style={lbl}>CEP Destino *</label>
                        <input style={{ ...inp, fontFamily:"monospace" }} placeholder="11015-000" value={ciotForm.cep_destino} onChange={e => setCiotForm(f => ({ ...f, cep_destino: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Cód. IBGE Município Destino *</label>
                        <input style={{ ...inp, fontFamily:"monospace" }} placeholder="3548708" maxLength={7} value={ciotForm.ibge_destino} onChange={e => setCiotForm(f => ({ ...f, ibge_destino: e.target.value.replace(/\D/g,"") }))} />
                      </div>
                      <div>
                        <label style={lbl}>Natureza da Carga</label>
                        <select style={inp} value={ciotForm.natureza} onChange={e => setCiotForm(f => ({ ...f, natureza: e.target.value }))}>
                          {NATUREZAS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Peso (toneladas)</label>
                        <input style={inp} placeholder="28.5" value={ciotForm.peso_ton} onChange={e => setCiotForm(f => ({ ...f, peso_ton: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Forma de Pagamento</label>
                        <select style={inp} value={ciotForm.tipo_pagamento} onChange={e => setCiotForm(f => ({ ...f, tipo_pagamento: e.target.value }))}>
                          {PGTOS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      {ciotForm.tipo_pagamento === "6" && (
                        <div style={{ gridColumn:"2/-1" }}>
                          <label style={lbl}>Chave PIX do Motorista</label>
                          <input style={{ ...inp, fontFamily:"monospace" }} placeholder={mot.cpf ?? "CPF do motorista"} value={ciotForm.chave_pix} onChange={e => setCiotForm(f => ({ ...f, chave_pix: e.target.value }))} />
                          <div style={{ fontSize:10, color:"var(--text-3)", marginTop:3 }}>Deixe em branco para usar o CPF do motorista como chave PIX</div>
                        </div>
                      )}
                      <div style={{ gridColumn:"1/-1", display:"flex", justifyContent:"flex-end" }}>
                        <button type="button" onClick={gerarCiot} disabled={gerandoCiot} style={{ padding:"8px 24px", background: gerandoCiot ? "var(--text-muted)" : "#C9921B", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor: gerandoCiot ? "default":"pointer" }}>
                          {gerandoCiot ? "Gerando CIOT…" : "🔗 Gerar CIOT via ANTT"}
                        </button>
                      </div>
                    </>
                  )}
                </>;
              })()}

              {/* ── CT-e vinculados ── */}
              <div style={divider}>CT-e Vinculados</div>
              <div style={{ gridColumn: "1 / -1" }}>
                {ctes.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Nenhum CT-e autorizado disponível. Emita e autorize CT-e antes de emitir o MDF-e.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: 10 }}>
                    {ctes.map(c => {
                      const sel = form.cte_ids.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 8px", borderRadius: 6, background: sel ? "#E8E8E8" : "var(--bg-card)", border: `0.5px solid ${sel ? "#11111150" : "transparent"}` }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleCte(c.id)} style={{ width: 14, height: 14 }} />
                          <span style={{ fontSize: 12, flex: 1 }}>
                            <strong>CT-e {c.numero_cte}/{c.serie}</strong> — {c.remetente_nome} → {c.destinatario_nome}
                            <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{fmtBRL(c.valor_frete)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── NF-e avulsas ── */}
              <div style={divider}>NF-e Avulsas (por chave de acesso)</div>
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
                {form.nfe_chaves.map((chave, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6 }}>
                    <input value={chave} onChange={e => {
                      const arr = [...form.nfe_chaves];
                      arr[idx] = e.target.value;
                      setForm(f => ({ ...f, nfe_chaves: arr }));
                    }} placeholder={`Chave de acesso ${idx + 1} (44 dígitos)`} maxLength={44} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                    {form.nfe_chaves.length > 1 && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, nfe_chaves: f.nfe_chaves.filter((_, i) => i !== idx) }))} style={{ padding: "0 10px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", color: "#791F1F", fontSize: 14 }}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, nfe_chaves: [...f.nfe_chaves, ""] }))} style={{ ...btnR, fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}>+ Adicionar NF-e</button>
              </div>

              {/* ── Carga ── */}
              <div style={divider}>Dados da Carga (opcional)</div>
              <div>
                <label style={lbl}>Peso Total (kg)</label>
                <InputMonetario value={form.peso_total_kg} onChange={v => setForm(f => ({ ...f, peso_total_kg: v }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Valor Total da Carga (R$)</label>
                <InputMonetario value={form.valor_total_carga} onChange={v => setForm(f => ({ ...f, valor_total_carga: v }))} style={inp} />
              </div>
              <div />
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ padding: "14px 24px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                TAC: CIOT gerado via API ANTT · CLT: isento · Transmissão MDF-e via SEFAZ
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ ...btnV, background: saving ? "var(--text-muted)" : "#111111", cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Salvando…" : (mdfeEdit ? "Salvar alterações" : "Salvar MDF-e")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL ENCERRAMENTO
      ══════════════════════════════════════════════════════ */}
      {modalEnc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 420, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Encerrar MDF-e</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>MDF-e {modalEnc.numero_mdfe}/{modalEnc.serie} — {modalEnc.veiculo_placa}</div>
              </div>
              <button onClick={() => setModalEnc(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={lbl}>Data de Encerramento</label>
                <input type="date" value={encForm.data_encerramento} onChange={e => setEncForm(f => ({ ...f, data_encerramento: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>UF de Encerramento</label>
                <select value={encForm.uf_encerramento} onChange={e => setEncForm(f => ({ ...f, uf_encerramento: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Município de Encerramento (destino)</label>
                <input value={encForm.municipio_encerramento} onChange={e => setEncForm(f => ({ ...f, municipio_encerramento: e.target.value }))} style={inp} placeholder="Cidade onde a carga foi entregue" />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalEnc(null)}>Cancelar</button>
              <button onClick={encerrar} disabled={encSaving} style={{ ...btnV, background: encSaving ? "var(--text-muted)" : "#1A6B3C", cursor: encSaving ? "default" : "pointer" }}>
                {encSaving ? "Encerrando…" : "Confirmar Encerramento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
