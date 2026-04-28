"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface CfgModulo { [key: string]: string | number | boolean }

interface EmpresaMin { id: string; razao_social?: string; nome?: string; cnpj?: string; }
interface ProdutorMin { id: string; nome: string; cpf_cnpj?: string; }
interface EmitterEntry { type: "empresa" | "produtor"; id: string; nome: string; cpf_cnpj?: string; moduloKey: string; }

interface NcmTributacao {
  id: string;
  ncm: string;
  descricao: string;
  icms_cst_interno: string;
  icms_cst_externo: string;
  icms_aliq: number;
  icms_base_reduzida_pct: number;
  pis_cst: string;
  pis_aliq: number;
  cofins_cst: string;
  cofins_aliq: number;
  cfop_dentro: string;
  cfop_fora: string;
  ibs_estadual_aliq: number;
  ibs_municipal_aliq: number;
  cbs_aliq: number;
  ibs_cbs_reducao_pct: number;
  inf_cpl: string;
}

interface Transportadora {
  id: string; cnpj: string; razao_social: string;
  nome_fantasia?: string; rntrc?: string; uf?: string; ativa: boolean;
}
interface Veiculo {
  id: string; placa: string; tipo: string; tara_kg?: number;
  cap_kg?: number; rntrc?: string; ativo: boolean;
}
interface Motorista {
  id: string; nome: string; cpf: string; cnh?: string;
  cnh_validade?: string; ativo: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const campo = (label: string, children: React.ReactNode, required?: boolean) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}{required && <span style={{ color: "#E24B4A", marginLeft: 2 }}>*</span>}
    </label>
    {children}
  </div>
);

const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", ...props.style }} />
);

const sel = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 13, background: "#fff", outline: "none", width: "100%", ...props.style }} />
);

const txta = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 12, fontFamily: "system-ui, sans-serif", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5, ...props.style }} />
);

const secHeader = (label: string) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6, marginBottom: 14 }}>
    {label}
  </div>
);

// ─── Abas ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "fiscal",      label: "Fiscal — NF-e" },
  { id: "tributacao",  label: "Tributação NCM" },
  { id: "operacoes",   label: "Operações Fiscais" },
  { id: "mdfe",        label: "MDF-e" },
  { id: "transportes", label: "Transportes" },
  { id: "integracoes", label: "Integrações" },
  { id: "expedicao",   label: "Expedição" },
];

// ─── Campos por módulo ────────────────────────────────────────────────────────
type FieldDef = { key: string; label: string; type: string; placeholder?: string; options?: string[]; labels?: string[] };

const FISCAL_IDENT: FieldDef[] = [
  { key: "ambiente",         label: "Ambiente",              type: "select",   options: ["producao","homologacao"],     labels: ["Produção","Homologação"] },
  { key: "serie_nfe",        label: "Série NF-e",            type: "text",     placeholder: "001" },
  { key: "numero_inicial",   label: "Próx. Número NF-e",     type: "number",   placeholder: "1" },
  { key: "cpf_cnpj_emitente",label: "CPF / CNPJ Emitente",  type: "text",     placeholder: "000.000.000-00 ou 00.000.000/0001-00" },
  { key: "razao_social",     label: "Razão Social / Nome",   type: "text",     placeholder: "" },
  { key: "ie_emitente",      label: "Inscrição Estadual",    type: "text",     placeholder: "" },
  { key: "im_emitente",      label: "Inscrição Municipal",   type: "text",     placeholder: "" },
  { key: "crt",              label: "CRT (Regime Tributário)",type: "select",  options: ["1","2","3","4"], labels: ["1 – Simples Nacional","2 – SN – Excesso de sublimite","3 – Regime Normal","4 – MEI"] },
];

const FISCAL_CFOP: FieldDef[] = [
  { key: "cfop_venda_dentro", label: "CFOP Venda (mesmo Estado)",   type: "text", placeholder: "5101" },
  { key: "cfop_venda_fora",   label: "CFOP Venda (outro Estado)",   type: "text", placeholder: "6101" },
  { key: "cfop_remessa",      label: "CFOP Remessa Depósito",       type: "text", placeholder: "5905" },
];

const FISCAL_CERT: FieldDef[] = [
  { key: "cert_a1_path",   label: "Certificado A1 — Caminho (Supabase Storage)", type: "text",     placeholder: "certificados/meu-certificado.pfx" },
  { key: "cert_a1_senha",  label: "Senha do Certificado A1",                     type: "password", placeholder: "••••••" },
  { key: "ibs_cbs_ativo",  label: "Destacar IBS/CBS na NF-e",                    type: "select",   options: ["nao","sim"], labels: ["Não (padrão atual)","Sim — fase de transição"] },
];

const MDFE_FIELDS: FieldDef[] = [
  { key: "ambiente",       label: "Ambiente MDF-e",         type: "select", options: ["producao","homologacao"], labels: ["Produção","Homologação"] },
  { key: "serie_mdfe",     label: "Série MDF-e",            type: "text",   placeholder: "001" },
  { key: "numero_inicial", label: "Próx. Número MDF-e",     type: "number", placeholder: "1" },
  { key: "rntrc",          label: "RNTRC (Emitente)",       type: "text",   placeholder: "12345678" },
  { key: "tpEmit",         label: "Tipo Emitente",          type: "select", options: ["1","2","3"], labels: ["1 – Transp. Autônomo","2 – ETC","3 – CTC"] },
  { key: "uf_ini",         label: "UF Início padrão",       type: "text",   placeholder: "MT" },
  { key: "uf_fim",         label: "UF Fim padrão",          type: "text",   placeholder: "PR" },
];

const INTEG_FIELDS: FieldDef[] = [
  { key: "resend_api_key",    label: "Resend API Key",           type: "password", placeholder: "re_..." },
  { key: "resend_from",       label: "E-mail Remetente",         type: "text",     placeholder: "noreply@fazenda.com.br" },
  { key: "whatsapp_api_url",  label: "WhatsApp API URL",         type: "text",     placeholder: "https://..." },
  { key: "whatsapp_token",    label: "WhatsApp Token",           type: "password", placeholder: "" },
  { key: "whatsapp_instance", label: "Instância (Evolution/Z)",  type: "text",     placeholder: "" },
];

const EXPEDICAO_FIELDS: FieldDef[] = [
  { key: "peso_aproximado_pct",            label: "Peso Aprox. padrão (%)",                   type: "number", placeholder: "95" },
  { key: "tolerancia_divergencia_pct",     label: "Tolerância divergência peso (%)",           type: "number", placeholder: "1" },
  { key: "gerar_nf_remessa_auto",          label: "Gerar NF Remessa automaticamente",          type: "select", options: ["sim","nao"], labels: ["Sim","Não"] },
  { key: "bucket_xmls",                    label: "Bucket Supabase (XMLs NF-e/MDF-e)",         type: "text",   placeholder: "arquivos" },
];

// ─── Presets NCM — Mato Grosso ────────────────────────────────────────────────
// ICMS: diferido (CST 051) nas operações internas; base reduzida 61,11% (CST 020) nas interestaduais
// Fundamento: RICMS/MT + Convênio ICMS 100/97
// PIS/COFINS: CST 06 (alíquota zero) — Lei 10.925/2004 para grãos
// IBS/CBS: redução de 60% para produtos agropecuários — LC 214/2025 / Reforma Tributária
type NcmPreset = Omit<NcmTributacao, "id">;

const NCM_PRESETS_MT: NcmPreset[] = [
  {
    ncm: "12019000", descricao: "Soja em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT (Dec. 2.993/2010). Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Art. 1º, I da Lei 10.925/2004.",
  },
  {
    ncm: "10059010", descricao: "Milho em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT (Dec. 2.993/2010). Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Art. 1º, I da Lei 10.925/2004.",
  },
  {
    ncm: "52010020", descricao: "Algodão em pluma",
    icms_cst_interno: "041", icms_cst_externo: "041",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "Operação não tributada pelo ICMS conforme RICMS/MT. PIS/COFINS: alíquota zero — Lei 10.925/2004.",
  },
  {
    ncm: "12072900", descricao: "Algodão em caroço",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Base de cálculo reduzida a 61,11% nas interestaduais — Conv. ICMS 100/97. PIS/COFINS: alíquota zero.",
  },
  {
    ncm: "10079000", descricao: "Sorgo em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Base de cálculo reduzida a 61,11% nas interestaduais — Conv. ICMS 100/97. PIS/COFINS: alíquota zero.",
  },
  {
    ncm: "10019900", descricao: "Trigo em grão",
    icms_cst_interno: "041", icms_cst_externo: "041",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "Operação não tributada pelo ICMS. PIS/COFINS: alíquota zero.",
  },
  {
    ncm: "10011900", descricao: "Trigo para semeadura",
    icms_cst_interno: "041", icms_cst_externo: "041",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 9.0, ibs_municipal_aliq: 1.0, cbs_aliq: 9.1,
    ibs_cbs_reducao_pct: 60,
    inf_cpl: "Operação não tributada pelo ICMS. PIS/COFINS: alíquota zero.",
  },
];

// ─── Operações Fiscais ────────────────────────────────────────────────────────
interface OperacaoFiscal {
  id: string;
  nome: string;
  descricao?: string;
  cfop_interno: string;
  cfop_externo: string;
  icms_cst_interno: string;
  icms_cst_externo: string;
  icms_aliq: number;
  icms_base_reduzida_pct: number;
  pis_cst: string;
  pis_aliq: number;
  cofins_cst: string;
  cofins_aliq: number;
  ibs_cbs_imune: boolean;
  ibs_cbs_reducao_pct: number;
  inf_cpl_template: string;
  ativa: boolean;
}

type OpPreset = Omit<OperacaoFiscal, "id">;

const OPERACOES_PRESETS: OpPreset[] = [
  {
    nome: "Venda para Industrialização",
    descricao: "Venda de produção ao estabelecimento industrial — esmagamento de soja, algodoeira, moagem de milho. Operação padrão MT.",
    cfop_interno: "5101", cfop_externo: "6101",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0, cofins_cst: "06", cofins_aliq: 0,
    ibs_cbs_imune: false, ibs_cbs_reducao_pct: 60,
    inf_cpl_template: "ICMS diferido nas operações internas — RICMS/MT (Dec. 2.993/2010). Nas saídas interestaduais, base de cálculo reduzida a 61,11% (carga efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Lei 10.925/2004.",
    ativa: true,
  },
  {
    nome: "Remessa para Exportação — Indireta",
    descricao: "Remessa à trading/exportadora que realizará o embarque. CFOP 5501 (mesmo estado) ou 6501 (interestadual — ex.: produtor MT → trading SP/SC/PR).",
    cfop_interno: "5501", cfop_externo: "6501",
    icms_cst_interno: "040", icms_cst_externo: "040",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0, cofins_cst: "06", cofins_aliq: 0,
    ibs_cbs_imune: true, ibs_cbs_reducao_pct: 100,
    inf_cpl_template: "Remessa com fim específico de exportação. ICMS isento — Art. 3º, II da LC 87/1996 (Lei Kandir). PIS/COFINS: alíquota zero. IBS/CBS: imunidade constitucional — Art. 149-B da CF/1988. Número do Registro de Exportação: [RE_NUMERO].",
    ativa: true,
  },
  {
    nome: "Exportação Direta",
    descricao: "Venda direta ao exterior via porto, sem intermediário nacional. CFOP 7101.",
    cfop_interno: "7101", cfop_externo: "7101",
    icms_cst_interno: "040", icms_cst_externo: "040",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0, cofins_cst: "06", cofins_aliq: 0,
    ibs_cbs_imune: true, ibs_cbs_reducao_pct: 100,
    inf_cpl_template: "Exportação direta. ICMS imune — LC 87/1996. PIS/COFINS: alíquota zero. IBS/CBS: imunidade constitucional — Art. 149-B da CF/1988. DU-E: [DUE_NUMERO]. Conhecimento de embarque: [CONHECIMENTO].",
    ativa: true,
  },
  {
    nome: "Remessa para Armazém / Depósito",
    descricao: "Transferência física para armazém geral ou de terceiros. Não é venda — não gera receita. CFOP 5905/6905.",
    cfop_interno: "5905", cfop_externo: "6905",
    icms_cst_interno: "051", icms_cst_externo: "051",
    icms_aliq: 12, icms_base_reduzida_pct: 100,
    pis_cst: "08", pis_aliq: 0, cofins_cst: "08", cofins_aliq: 0,
    ibs_cbs_imune: false, ibs_cbs_reducao_pct: 100,
    inf_cpl_template: "Remessa para depósito em armazém geral. Não constitui fato gerador de receita. ICMS diferido — RICMS/MT.",
    ativa: true,
  },
  {
    nome: "Retorno de Armazém / Depósito",
    descricao: "Retorno físico do armazém ao estabelecimento do produtor. CFOP 5906/6906.",
    cfop_interno: "5906", cfop_externo: "6906",
    icms_cst_interno: "051", icms_cst_externo: "051",
    icms_aliq: 12, icms_base_reduzida_pct: 100,
    pis_cst: "08", pis_aliq: 0, cofins_cst: "08", cofins_aliq: 0,
    ibs_cbs_imune: false, ibs_cbs_reducao_pct: 100,
    inf_cpl_template: "Retorno de depósito em armazém geral ao estabelecimento de origem.",
    ativa: true,
  },
  {
    nome: "Venda com Fixação — Mercado a Termo",
    descricao: "Venda com preço a fixar (barter, VFE, fixação de contrato). Mesmo tratamento fiscal da venda normal — destaque contratual no infCpl.",
    cfop_interno: "5101", cfop_externo: "6101",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0, cofins_cst: "06", cofins_aliq: 0,
    ibs_cbs_imune: false, ibs_cbs_reducao_pct: 60,
    inf_cpl_template: "Venda a fixar — preço a ser definido conforme Contrato nº [CONTRATO]. ICMS diferido / base reduzida conforme RICMS/MT e Conv. ICMS 100/97. PIS/COFINS: alíquota zero.",
    ativa: true,
  },
];

const OP_MODAL_VAZIO: OpPreset = {
  nome: "", descricao: "",
  cfop_interno: "", cfop_externo: "",
  icms_cst_interno: "051", icms_cst_externo: "020",
  icms_aliq: 12, icms_base_reduzida_pct: 100,
  pis_cst: "06", pis_aliq: 0, cofins_cst: "06", cofins_aliq: 0,
  ibs_cbs_imune: false, ibs_cbs_reducao_pct: 0,
  inf_cpl_template: "", ativa: true,
};

const NCM_MODAL_VAZIO: Omit<NcmTributacao, "id"> = {
  ncm: "", descricao: "",
  icms_cst_interno: "051", icms_cst_externo: "020",
  icms_aliq: 12, icms_base_reduzida_pct: 100,
  pis_cst: "06", pis_aliq: 0,
  cofins_cst: "06", cofins_aliq: 0,
  cfop_dentro: "", cfop_fora: "",
  ibs_estadual_aliq: 0, ibs_municipal_aliq: 0, cbs_aliq: 0,
  ibs_cbs_reducao_pct: 0,
  inf_cpl: "",
};

// ─── Componente principal ─────────────────────────────────────────────────────
function ParametrosSistemaContent() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();
  const [aba, setAba] = useState(() => searchParams.get("aba") ?? "fiscal");

  useEffect(() => {
    const abaParam = searchParams.get("aba");
    if (abaParam) setAba(abaParam);
  }, [searchParams]);
  const [cfgs, setCfgs] = useState<{ [modulo: string]: CfgModulo }>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // ── Emitentes fiscais
  const [empresas, setEmpresas] = useState<EmpresaMin[]>([]);
  const [produtores, setProdutores] = useState<ProdutorMin[]>([]);
  const [expandedEmitter, setExpandedEmitter] = useState<string | null>(null);

  // ── Tributação NCM
  const [ncms, setNcms] = useState<NcmTributacao[]>([]);
  const [modalNcm, setModalNcm] = useState<(Partial<NcmTributacao> & { id?: string }) | null>(null);
  const [carregandoPresets, setCarregandoPresets] = useState(false);

  // ── Operações Fiscais
  const [operacoes, setOperacoes] = useState<OperacaoFiscal[]>([]);
  const [modalOp, setModalOp] = useState<(Partial<OperacaoFiscal> & { id?: string }) | null>(null);
  const [carregandoOps, setCarregandoOps] = useState(false);

  // ── Transportes
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [modalT, setModalT] = useState<Partial<Transportadora> | null>(null);
  const [modalV, setModalV] = useState<Partial<Veiculo> | null>(null);
  const [modalM, setModalM] = useState<Partial<Motorista> | null>(null);
  const [subAba, setSubAba] = useState<"transportadoras" | "veiculos" | "motoristas">("transportadoras");

  // ── Carregar tudo
  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("configuracoes_modulo").select("modulo, config").eq("fazenda_id", fazendaId)
      .then(({ data }) => {
        if (!data) return;
        const map: { [mod: string]: CfgModulo } = {};
        data.forEach(r => { if (r.config) map[r.modulo] = r.config as CfgModulo; });
        setCfgs(map);
      });
    supabase.from("empresas").select("id, razao_social, nome, cnpj").eq("fazenda_id", fazendaId)
      .then(({ data }) => data && setEmpresas(data));
    supabase.from("produtores").select("id, nome, cpf_cnpj").eq("fazenda_id", fazendaId)
      .then(({ data }) => data && setProdutores(data));
    supabase.from("ncm_tributacoes").select("*").eq("fazenda_id", fazendaId).order("ncm")
      .then(({ data }) => data && setNcms(data as NcmTributacao[]));
    supabase.from("operacoes_fiscais").select("*").eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => data && setOperacoes(data as OperacaoFiscal[]));
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("transportadoras").select("*").eq("fazenda_id", fazendaId).then(({ data }) => data && setTransportadoras(data));
    supabase.from("veiculos").select("*").eq("fazenda_id", fazendaId).then(({ data }) => data && setVeiculos(data));
    supabase.from("motoristas").select("*").eq("fazenda_id", fazendaId).then(({ data }) => data && setMotoristas(data));
  }, [fazendaId]);

  // ── Mutations
  const setCfg = (modulo: string, key: string, value: string | number | boolean) => {
    setCfgs(prev => ({ ...prev, [modulo]: { ...(prev[modulo] ?? {}), [key]: value } }));
  };

  const salvar = async (modulo: string) => {
    if (!fazendaId) return;
    setSalvando(modulo);
    await supabase.from("configuracoes_modulo").upsert(
      { fazenda_id: fazendaId, modulo, config: cfgs[modulo] ?? {}, updated_at: new Date().toISOString() },
      { onConflict: "fazenda_id,modulo" }
    );
    setSalvando(null); setOk(modulo);
    setTimeout(() => setOk(null), 2500);
  };

  const buscarCep = async (cep: string, moduloKey: string) => {
    const cleaned = cep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setCfgs(prev => ({
        ...prev,
        [moduloKey]: {
          ...(prev[moduloKey] ?? {}),
          logradouro: data.logradouro ?? "",
          bairro: data.bairro ?? "",
          municipio: data.localidade ?? "",
          municipio_ibge: data.ibge ?? "",
          uf_emitente: data.uf ?? "",
          cep: data.cep ?? cep,
        },
      }));
    } catch { /* ignore */ }
  };

  const salvarNcm = async () => {
    if (!modalNcm || !fazendaId) return;
    const payload = { ...NCM_MODAL_VAZIO, ...modalNcm, fazenda_id: fazendaId };
    if (modalNcm.id) {
      await supabase.from("ncm_tributacoes").update(payload).eq("id", modalNcm.id);
    } else {
      await supabase.from("ncm_tributacoes").insert(payload);
    }
    const { data } = await supabase.from("ncm_tributacoes").select("*").eq("fazenda_id", fazendaId).order("ncm");
    if (data) setNcms(data as NcmTributacao[]);
    setModalNcm(null);
  };

  const excluirNcm = async (id: string) => {
    if (!confirm("Excluir esta configuração de NCM?")) return;
    await supabase.from("ncm_tributacoes").delete().eq("id", id);
    setNcms(prev => prev.filter(n => n.id !== id));
  };

  const carregarPresetsMT = async () => {
    if (!fazendaId) return;
    setCarregandoPresets(true);
    for (const preset of NCM_PRESETS_MT) {
      const exists = ncms.find(n => n.ncm === preset.ncm);
      if (!exists) {
        await supabase.from("ncm_tributacoes").insert({ ...preset, fazenda_id: fazendaId });
      }
    }
    const { data } = await supabase.from("ncm_tributacoes").select("*").eq("fazenda_id", fazendaId).order("ncm");
    if (data) setNcms(data as NcmTributacao[]);
    setCarregandoPresets(false);
  };

  const salvarOp = async () => {
    if (!modalOp || !fazendaId) return;
    const payload = { ...OP_MODAL_VAZIO, ...modalOp, fazenda_id: fazendaId };
    if (modalOp.id) await supabase.from("operacoes_fiscais").update(payload).eq("id", modalOp.id);
    else await supabase.from("operacoes_fiscais").insert(payload);
    const { data } = await supabase.from("operacoes_fiscais").select("*").eq("fazenda_id", fazendaId).order("nome");
    if (data) setOperacoes(data as OperacaoFiscal[]);
    setModalOp(null);
  };

  const excluirOp = async (id: string) => {
    if (!confirm("Excluir esta operação fiscal?")) return;
    await supabase.from("operacoes_fiscais").delete().eq("id", id);
    setOperacoes(prev => prev.filter(o => o.id !== id));
  };

  const carregarOperacoesPresets = async () => {
    if (!fazendaId) return;
    setCarregandoOps(true);
    for (const preset of OPERACOES_PRESETS) {
      const exists = operacoes.find(o => o.cfop_interno === preset.cfop_interno && o.nome === preset.nome);
      if (!exists) await supabase.from("operacoes_fiscais").insert({ ...preset, fazenda_id: fazendaId });
    }
    const { data } = await supabase.from("operacoes_fiscais").select("*").eq("fazenda_id", fazendaId).order("nome");
    if (data) setOperacoes(data as OperacaoFiscal[]);
    setCarregandoOps(false);
  };

  // ── Aba Operações Fiscais ──────────────────────────────────────────────────
  const renderOperacoesTab = () => {
    const cstBadge = (cst: string) => {
      const map: { [k: string]: { label: string; bg: string; color: string } } = {
        "051": { label: "Diferido",      bg: "#DCFCE7", color: "#16A34A" },
        "020": { label: "Base Red.",     bg: "#FEF3C7", color: "#B45309" },
        "040": { label: "Isenta",        bg: "#EFF6FF", color: "#1A5CB8" },
        "041": { label: "Não Trib.",     bg: "#EFF6FF", color: "#1A5CB8" },
        "000": { label: "Tributada",     bg: "#FEE2E2", color: "#E24B4A" },
        "08":  { label: "Sem Incid.",    bg: "#F4F6FA", color: "#555"    },
        "06":  { label: "Alíq. Zero",   bg: "#F0FDF4", color: "#16A34A" },
      };
      const s = map[cst] ?? { label: cst, bg: "#F4F6FA", color: "#555" };
      return <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>;
    };

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Operações Fiscais</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
            Define o perfil fiscal de cada tipo de saída — CFOP, ICMS, PIS/COFINS e IBS/CBS.
            Ao emitir uma NF-e o usuário escolhe a operação; o sistema aplica automaticamente o tratamento correto.
          </p>
        </div>

        <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#166534", lineHeight: 1.7 }}>
          <strong>Diferença chave:</strong>{" "}
          <strong>Industrialização</strong>: CFOP 5101/6101 · ICMS diferido (interno) ou base reduzida 61,11% / 7,33% efetivo (interestadual) · IBS/CBS com redução 60%.{" "}
          <strong>Exportação indireta</strong>: CFOP 5501/6501 · ICMS isento Lei Kandir · IBS/CBS = 0% (imunidade constitucional).{" "}
          <strong>Exportação direta</strong>: CFOP 7101 · mesma imunidade.{" "}
          <strong>Armazém</strong>: CFOP 5905/6905 · não é venda · PIS/COFINS CST 08 (sem incidência).
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={carregarOperacoesPresets} disabled={carregandoOps}
            style={{ padding: "7px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {carregandoOps ? "Carregando..." : "Carregar Operações Padrão (MT)"}
          </button>
          <button onClick={() => setModalOp({ ...OP_MODAL_VAZIO })}
            style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Nova Operação
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F4F6FA" }}>
                {["Operação","CFOP int.","CFOP ext.","ICMS interno","ICMS externo","Alíq%","B.Red%","PIS","COFINS","IBS/CBS","Status",""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operacoes.map(op => {
                const efetiva = op.icms_aliq * op.icms_base_reduzida_pct / 100;
                const ibsCbsTotal = 19.1; // standard combined IBS+CBS
                return (
                  <tr key={op.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{op.nome}</div>
                      {op.descricao && <div style={{ color: "#888", fontSize: 11, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={op.descricao}>{op.descricao}</div>}
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1A4870" }}>{op.cfop_interno}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: "#555" }}>{op.cfop_externo !== op.cfop_interno ? op.cfop_externo : "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{cstBadge(op.icms_cst_interno)}</td>
                    <td style={{ padding: "8px 10px" }}>{cstBadge(op.icms_cst_externo)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{op.icms_aliq.toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: op.icms_base_reduzida_pct < 100 ? "#B45309" : "#888" }}>
                      {op.icms_base_reduzida_pct < 100 ? `${op.icms_base_reduzida_pct}% → ${efetiva.toFixed(2)}%` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>{cstBadge(op.pis_cst)}</td>
                    <td style={{ padding: "8px 10px" }}>{cstBadge(op.cofins_cst)}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {op.ibs_cbs_imune
                        ? <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1A5CB8" }}>0% — Imune</span>
                        : <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FEF3C7", color: "#B45309" }}>
                            {op.ibs_cbs_reducao_pct > 0 ? `−${op.ibs_cbs_reducao_pct}% red.` : "Padrão"}
                          </span>
                      }
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: op.ativa ? "#DCFCE7" : "#FEE2E2", color: op.ativa ? "#16A34A" : "#E24B4A" }}>
                        {op.ativa ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setModalOp(op)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Editar</button>
                        <button onClick={() => excluirOp(op.id)} style={{ background: "none", border: "0.5px solid #FCA5A5", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "#E24B4A" }}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {operacoes.length === 0 && (
                <tr><td colSpan={12} style={{ padding: "28px", textAlign: "center", color: "#888" }}>
                  Nenhuma operação configurada. Clique em "Carregar Operações Padrão (MT)" para começar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderFieldsGrid = (modulo: string, fields: FieldDef[]) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
      {fields.map(f => (
        <div key={f.key}>
          {campo(f.label,
            f.type === "select" ? (
              sel({
                value: String(cfgs[modulo]?.[f.key] ?? ""),
                onChange: e => setCfg(modulo, f.key, e.target.value),
                children: [
                  <option key="" value="">— selecione —</option>,
                  ...(f.options ?? []).map((o, i) => <option key={o} value={o}>{f.labels?.[i] ?? o}</option>),
                ] as React.ReactNode,
              })
            ) : (
              inp({
                type: f.type === "password" ? "password" : f.type === "number" ? "number" : "text",
                placeholder: f.placeholder,
                value: String(cfgs[modulo]?.[f.key] ?? ""),
                onChange: e => setCfg(modulo, f.key, e.target.value),
              })
            )
          )}
        </div>
      ))}
    </div>
  );

  const renderFields = (modulo: string, fields: FieldDef[]) => (
    <div>
      {renderFieldsGrid(modulo, fields)}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => salvar(modulo)}
          disabled={salvando === modulo}
          style={{ padding: "9px 22px", background: ok === modulo ? "#16A34A" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {salvando === modulo ? "Salvando..." : ok === modulo ? "Salvo!" : "Salvar Parâmetros"}
        </button>
      </div>
    </div>
  );

  // ── Aba Fiscal — por emitente ─────────────────────────────────────────────
  const renderFiscalTab = () => {
    const emitters: EmitterEntry[] = [
      ...empresas.map(e => ({ type: "empresa" as const, id: e.id, nome: e.razao_social ?? e.nome ?? "Empresa", cpf_cnpj: e.cnpj, moduloKey: `fiscal_emp_${e.id}` })),
      ...produtores.map(p => ({ type: "produtor" as const, id: p.id, nome: p.nome, cpf_cnpj: p.cpf_cnpj, moduloKey: `fiscal_pf_${p.id}` })),
    ];

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Parâmetros Fiscais — NF-e por Emitente</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
            Cada empresa (PJ) ou produtor (PF) que emite NF-e tem configuração independente — série, numeração, endereço e certificado próprios.
            A tributação por produto é configurada na aba <strong>Tributação NCM</strong>.
          </p>
        </div>

        <div style={{ background: "#EFF6FF", border: "0.5px solid #378ADD", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#1A4870", lineHeight: 1.6 }}>
          <strong>Certificado digital:</strong> faça upload do arquivo <code>.pfx</code> (e-CNPJ ou e-CPF) em{" "}
          <strong>Supabase → Storage → Bucket: <code>certificados</code></strong> (privado). Informe o caminho relativo e a senha.
          O sistema baixa e assina automaticamente cada NF-e.
        </div>

        {emitters.length === 0 ? (
          <div style={{ background: "#fff", border: "0.5px dashed #DDE2EE", borderRadius: 10, padding: "40px 24px", textAlign: "center", color: "#888" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: "#555" }}>Nenhum emitente cadastrado</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              Cadastre uma <strong>Empresa</strong> (PJ) ou <strong>Produtor</strong> (PF) em Cadastros primeiro.
            </div>
            <a href="/cadastros" style={{ display: "inline-block", padding: "8px 20px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Ir para Cadastros
            </a>
          </div>
        ) : (
          emitters.map(emitter => {
            const isOpen = expandedEmitter === emitter.moduloKey;
            const c = cfgs[emitter.moduloKey] ?? {};
            const isConfigured = !!(c.cpf_cnpj_emitente);
            const hasCert = !!(c.cert_a1_path);

            return (
              <div key={emitter.moduloKey} style={{ border: `0.5px solid ${isOpen ? "#1A4870" : "#DDE2EE"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden", boxShadow: isOpen ? "0 2px 8px rgba(26,72,112,0.08)" : "none" }}>

                {/* Header */}
                <div onClick={() => setExpandedEmitter(isOpen ? null : emitter.moduloKey)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: isOpen ? "#F0F5FF" : "#fff", cursor: "pointer", userSelect: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: emitter.type === "empresa" ? "#EFF6FF" : "#F0FDF4", color: emitter.type === "empresa" ? "#1A5CB8" : "#16A34A", border: `0.5px solid ${emitter.type === "empresa" ? "#BFDBFE" : "#BBF7D0"}` }}>
                      {emitter.type === "empresa" ? "PJ — e-CNPJ" : "PF — e-CPF"}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{emitter.nome}</span>
                    {emitter.cpf_cnpj && <span style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{emitter.cpf_cnpj}</span>}
                    <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 10, fontWeight: 600, background: isConfigured ? "#DCFCE7" : "#FEF3C7", color: isConfigured ? "#16A34A" : "#B45309" }}>
                      {isConfigured ? "Configurado" : "Pendente"}
                    </span>
                    {isConfigured && (
                      <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 10, fontWeight: 600, background: hasCert ? "#DCFCE7" : "#FEE2E2", color: hasCert ? "#16A34A" : "#E24B4A" }}>
                        {hasCert ? "Certificado vinculado" : "Sem certificado"}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: "#888" }}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Body */}
                {isOpen && (
                  <div style={{ padding: "22px 18px", borderTop: "0.5px solid #DDE2EE" }}>

                    {/* Identificação */}
                    <div style={{ marginBottom: 24 }}>
                      {secHeader("Identificação do Emitente")}
                      {renderFieldsGrid(emitter.moduloKey, FISCAL_IDENT)}
                    </div>

                    {/* Endereço */}
                    <div style={{ marginBottom: 24 }}>
                      {secHeader("Endereço")}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
                        <div>
                          {campo("CEP",
                            inp({
                              value: String(c.cep ?? ""),
                              placeholder: "78000-000",
                              onChange: e => setCfg(emitter.moduloKey, "cep", e.target.value),
                              onBlur: e => buscarCep(e.target.value, emitter.moduloKey),
                            })
                          )}
                        </div>
                        <div style={{ gridColumn: "2 / 4" }}>
                          {campo("Logradouro", inp({ value: String(c.logradouro ?? ""), placeholder: "Rua, Rodovia, Fazenda...", onChange: e => setCfg(emitter.moduloKey, "logradouro", e.target.value) }))}
                        </div>
                        <div>
                          {campo("Número", inp({ value: String(c.numero ?? ""), placeholder: "S/N", onChange: e => setCfg(emitter.moduloKey, "numero", e.target.value) }))}
                        </div>
                        <div>
                          {campo("Complemento", inp({ value: String(c.complemento ?? ""), onChange: e => setCfg(emitter.moduloKey, "complemento", e.target.value) }))}
                        </div>
                        <div>
                          {campo("Bairro / Distrito", inp({ value: String(c.bairro ?? ""), onChange: e => setCfg(emitter.moduloKey, "bairro", e.target.value) }))}
                        </div>
                        <div>
                          {campo("Município", inp({ value: String(c.municipio ?? ""), onChange: e => setCfg(emitter.moduloKey, "municipio", e.target.value) }))}
                        </div>
                        <div>
                          {campo("Código IBGE", inp({ value: String(c.municipio_ibge ?? ""), placeholder: "5106455", onChange: e => setCfg(emitter.moduloKey, "municipio_ibge", e.target.value) }))}
                        </div>
                        <div>
                          {campo("UF", inp({ value: String(c.uf_emitente ?? ""), placeholder: "MT", maxLength: 2, onChange: e => setCfg(emitter.moduloKey, "uf_emitente", e.target.value.toUpperCase()) }))}
                        </div>
                        <div>
                          {campo("Telefone", inp({ value: String(c.fone ?? ""), placeholder: "(65) 99999-9999", onChange: e => setCfg(emitter.moduloKey, "fone", e.target.value) }))}
                        </div>
                      </div>
                    </div>

                    {/* CFOPs padrão */}
                    <div style={{ marginBottom: 24 }}>
                      {secHeader("CFOPs Padrão")}
                      {renderFieldsGrid(emitter.moduloKey, FISCAL_CFOP)}
                    </div>

                    {/* Certificado e Reforma */}
                    <div style={{ marginBottom: 24 }}>
                      {secHeader("Certificado Digital e Reforma Tributária")}
                      {renderFieldsGrid(emitter.moduloKey, FISCAL_CERT)}
                    </div>

                    {/* Textos legais */}
                    <div style={{ marginBottom: 24 }}>
                      {secHeader("Textos Legais — infCpl")}
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          {campo("Texto padrão — aparece em todas as NF-e deste emitente",
                            txta({
                              rows: 3,
                              value: String(c.inf_cpl_padrao ?? ""),
                              placeholder: "Ex: Produtor Rural. CPF: 000.000.000-00. Isento de Inscrição Estadual conforme Art. 4º do RICMS/MT. Funrural retido na fonte pela adquirente conforme Lei 8.870/1994...",
                              onChange: e => setCfg(emitter.moduloKey, "inf_cpl_padrao", e.target.value),
                            })
                          )}
                        </div>
                        <div>
                          {campo("Texto ICMS diferido — usado em operações internas (CFOP 5101/5125)",
                            txta({
                              rows: 3,
                              value: String(c.inf_cpl_icms_diferido ?? ""),
                              placeholder: "Ex: ICMS DIFERIDO nos termos do RICMS/MT — Decreto nº 2.993/2010. O imposto fica diferido para a etapa seguinte de circulação da mercadoria...",
                              onChange: e => setCfg(emitter.moduloKey, "inf_cpl_icms_diferido", e.target.value),
                            })
                          )}
                        </div>
                        <div>
                          {campo("Texto base reduzida — usado em operações interestaduais (CFOP 6101)",
                            txta({
                              rows: 3,
                              value: String(c.inf_cpl_base_reduzida ?? ""),
                              placeholder: "Ex: Base de cálculo do ICMS reduzida a 61,11% conforme Convênio ICMS 100/97 — alíquota efetiva: 7,33%...",
                              onChange: e => setCfg(emitter.moduloKey, "inf_cpl_base_reduzida", e.target.value),
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Salvar */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => salvar(emitter.moduloKey)}
                        disabled={salvando === emitter.moduloKey}
                        style={{ padding: "9px 28px", background: ok === emitter.moduloKey ? "#16A34A" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        {salvando === emitter.moduloKey ? "Salvando..." : ok === emitter.moduloKey ? "Salvo!" : "Salvar Configuração"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  // ── Aba Tributação NCM ────────────────────────────────────────────────────
  const renderTributacaoTab = () => {
    const cstLabel = (cst: string) => {
      const map: { [k: string]: string } = {
        "000": "Tributada", "020": "Base Reduzida", "040": "Isenta",
        "041": "Não Tributada", "051": "Diferido", "090": "Outras",
      };
      return map[cst] ?? cst;
    };
    const cstColor = (cst: string) => {
      if (cst === "051") return { bg: "#DCFCE7", color: "#16A34A" };
      if (cst === "020") return { bg: "#FEF3C7", color: "#B45309" };
      if (["040","041"].includes(cst)) return { bg: "#EFF6FF", color: "#1A5CB8" };
      return { bg: "#F4F6FA", color: "#555" };
    };

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Tributação por NCM</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
            Define ICMS, PIS, COFINS, IBS e CBS para cada NCM. O sistema busca automaticamente essa tabela ao gerar uma NF-e.
          </p>
        </div>

        <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
          <strong>ICMS/MT:</strong> CST 051 = diferido (operações internas) · CST 020 = base reduzida 61,11% / efetiva 7,33% (interestaduais) — Conv. ICMS 100/97.
          {" "}<strong>PIS/COFINS:</strong> CST 06 = alíquota zero para grãos — Lei 10.925/2004.
          {" "}<strong>IBS/CBS:</strong> redução de 60% para produtos agropecuários — LC 214/2025 (Reforma Tributária). IBS/CBS = 0 para exportações (CFOP 7xxx).
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={carregarPresetsMT}
            disabled={carregandoPresets}
            style={{ padding: "7px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {carregandoPresets ? "Carregando..." : "Carregar Padrões MT (soja, milho, algodão, sorgo, trigo)"}
          </button>
          <button
            onClick={() => setModalNcm({ ...NCM_MODAL_VAZIO })}
            style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            + Adicionar NCM
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F4F6FA" }}>
                {["NCM","Descrição","ICMS Interno","ICMS Externo","Alíq%","B.Red%","Efetiva","PIS","COFINS","IBS+CBS (c/red.)","infCpl",""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ncms.map(n => {
                const efetiva = (n.icms_aliq * n.icms_base_reduzida_pct / 100);
                const ibsCbsTotal = n.ibs_estadual_aliq + n.ibs_municipal_aliq + n.cbs_aliq;
                const ibsCbsEfetivo = ibsCbsTotal * (1 - n.ibs_cbs_reducao_pct / 100);
                const interno = cstColor(n.icms_cst_interno);
                const externo = cstColor(n.icms_cst_externo);
                return (
                  <tr key={n.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700 }}>{n.ncm}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, maxWidth: 180 }}>{n.descricao}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: interno.bg, color: interno.color }}>{cstLabel(n.icms_cst_interno)}</span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: externo.bg, color: externo.color }}>{cstLabel(n.icms_cst_externo)}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{n.icms_aliq.toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: n.icms_base_reduzida_pct < 100 ? "#B45309" : "#888" }}>
                      {n.icms_base_reduzida_pct < 100 ? `${n.icms_base_reduzida_pct}%` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{efetiva.toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: n.pis_aliq === 0 ? "#16A34A" : "#1a1a1a" }}>
                      {n.pis_cst} / {n.pis_aliq.toFixed(2)}%
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: n.cofins_aliq === 0 ? "#16A34A" : "#1a1a1a" }}>
                      {n.cofins_cst} / {n.cofins_aliq.toFixed(2)}%
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 11, color: "#888" }}>Padrão: {ibsCbsTotal.toFixed(1)}%</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: n.ibs_cbs_reducao_pct > 0 ? "#C9921B" : "#555" }}>
                          {n.ibs_cbs_reducao_pct > 0 ? `−${n.ibs_cbs_reducao_pct}% → ` : ""}{ibsCbsEfetivo.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 120, color: "#888", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={n.inf_cpl}>
                      {n.inf_cpl ? "✓" : "—"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setModalNcm(n)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Editar</button>
                        <button onClick={() => excluirNcm(n.id)} style={{ background: "none", border: "0.5px solid #FCA5A5", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "#E24B4A" }}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {ncms.length === 0 && (
                <tr><td colSpan={12} style={{ padding: "28px", textAlign: "center", color: "#888" }}>
                  Nenhum NCM configurado. Clique em "Carregar Padrões MT" para começar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Aba Transportes ───────────────────────────────────────────────────────
  const renderTransportes = () => (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {(["transportadoras", "veiculos", "motoristas"] as const).map(s => (
          <button key={s} onClick={() => setSubAba(s)} style={{
            padding: "6px 16px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 13,
            fontWeight: subAba === s ? 700 : 400, background: subAba === s ? "#1A4870" : "#fff",
            color: subAba === s ? "#fff" : "#333", cursor: "pointer",
          }}>
            {s === "transportadoras" ? "Transportadoras" : s === "veiculos" ? "Veículos" : "Motoristas"}
          </button>
        ))}
      </div>

      {subAba === "transportadoras" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setModalT({})} style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Nova Transportadora</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F4F6FA" }}>
              {["CNPJ","Razão Social","RNTRC","UF","Status",""].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {transportadoras.map(t => (
                <tr key={t.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{t.cnpj}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{t.razao_social}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{t.rntrc || "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{t.uf || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: t.ativa ? "#DCFCE7" : "#FEE2E2", color: t.ativa ? "#16A34A" : "#E24B4A" }}>
                      {t.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}><button onClick={() => setModalT(t)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Editar</button></td>
                </tr>
              ))}
              {transportadoras.length === 0 && <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#888" }}>Nenhuma transportadora cadastrada</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {subAba === "veiculos" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setModalV({})} style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Novo Veículo</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F4F6FA" }}>
              {["Placa","Tipo","Tara (kg)","Cap. (kg)","RNTRC","Status",""].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {veiculos.map(v => (
                <tr key={v.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, fontFamily: "monospace" }}>{v.placa}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{v.tipo}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{v.tara_kg?.toLocaleString("pt-BR") || "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{v.cap_kg?.toLocaleString("pt-BR") || "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{v.rntrc || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: v.ativo ? "#DCFCE7" : "#FEE2E2", color: v.ativo ? "#16A34A" : "#E24B4A" }}>
                      {v.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}><button onClick={() => setModalV(v)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Editar</button></td>
                </tr>
              ))}
              {veiculos.length === 0 && <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#888" }}>Nenhum veículo cadastrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {subAba === "motoristas" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setModalM({})} style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Novo Motorista</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F4F6FA" }}>
              {["Nome","CPF","CNH","Validade CNH","Status",""].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {motoristas.map(m => {
                const venc = m.cnh_validade ? new Date(m.cnh_validade) : null;
                const cnhVencida = venc && venc < new Date();
                return (
                  <tr key={m.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{m.nome}</td>
                    <td style={{ padding: "8px 12px", color: "#555", fontFamily: "monospace" }}>{m.cpf}</td>
                    <td style={{ padding: "8px 12px", color: "#555" }}>{m.cnh || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {venc ? <span style={{ color: cnhVencida ? "#E24B4A" : "#16A34A", fontWeight: cnhVencida ? 700 : 400 }}>{venc.toLocaleDateString("pt-BR")}{cnhVencida ? " ⚠" : ""}</span> : "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: m.ativo ? "#DCFCE7" : "#FEE2E2", color: m.ativo ? "#16A34A" : "#E24B4A" }}>
                        {m.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px" }}><button onClick={() => setModalM(m)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Editar</button></td>
                  </tr>
                );
              })}
              {motoristas.length === 0 && <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#888" }}>Nenhum motorista cadastrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const salvarTransportadora = async () => {
    if (!modalT || !fazendaId) return;
    if (modalT.id) await supabase.from("transportadoras").update({ ...modalT }).eq("id", modalT.id);
    else await supabase.from("transportadoras").insert({ ...modalT, fazenda_id: fazendaId, ativa: true });
    const { data } = await supabase.from("transportadoras").select("*").eq("fazenda_id", fazendaId);
    if (data) setTransportadoras(data);
    setModalT(null);
  };
  const salvarVeiculo = async () => {
    if (!modalV || !fazendaId) return;
    if (modalV.id) await supabase.from("veiculos").update({ ...modalV }).eq("id", modalV.id);
    else await supabase.from("veiculos").insert({ ...modalV, fazenda_id: fazendaId, ativo: true });
    const { data } = await supabase.from("veiculos").select("*").eq("fazenda_id", fazendaId);
    if (data) setVeiculos(data);
    setModalV(null);
  };
  const salvarMotorista = async () => {
    if (!modalM || !fazendaId) return;
    if (modalM.id) await supabase.from("motoristas").update({ ...modalM }).eq("id", modalM.id);
    else await supabase.from("motoristas").insert({ ...modalM, fazenda_id: fazendaId, ativo: true });
    const { data } = await supabase.from("motoristas").select("*").eq("fazenda_id", fazendaId);
    if (data) setMotoristas(data);
    setModalM(null);
  };

  const modalStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const boxStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, padding: 28, width: 640, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Configurações</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>Parâmetros do Sistema</h1>
            <span style={{ fontSize: 12, background: "#FBF3E0", color: "#C9921B", padding: "2px 10px", borderRadius: 12, fontWeight: 600, border: "0.5px solid #C9921B" }}>Configurações externas — sem código</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>Todos os parâmetros que variam por cliente. Configure uma vez — o sistema usa automaticamente.</p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1.5px solid #DDE2EE" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setAba(t.id)} style={{
              padding: "8px 18px", border: "none", borderRadius: "8px 8px 0 0",
              fontWeight: aba === t.id ? 700 : 400, fontSize: 13,
              background: aba === t.id ? "#fff" : "transparent",
              color: aba === t.id ? "#1A4870" : "#666",
              borderBottom: aba === t.id ? "2px solid #1A4870" : "2px solid transparent",
              cursor: "pointer", marginBottom: -1.5,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 28, border: "0.5px solid #DDE2EE" }}>

          {aba === "fiscal" && renderFiscalTab()}

          {aba === "tributacao" && renderTributacaoTab()}

          {aba === "operacoes" && renderOperacoesTab()}

          {aba === "mdfe" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Parâmetros MDF-e</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Manifesto Eletrônico de Documentos Fiscais — obrigatório no transporte interestadual de grãos.</p>
              </div>
              {renderFields("mdfe", MDFE_FIELDS)}
            </div>
          )}

          {aba === "transportes" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Transportes</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Transportadoras, frota própria e motoristas. Usados na expedição e MDF-e.</p>
              </div>
              {renderTransportes()}
            </div>
          )}

          {aba === "integracoes" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Integrações Externas</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Credenciais de serviços externos. Armazenadas com segurança no banco — RLS por fazenda.</p>
              </div>
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#7A5A12" }}>
                Armazenadas na tabela <code>configuracoes_modulo</code> com RLS de fazenda. Não expostas ao frontend de clientes.
              </div>
              {renderFields("integracoes", INTEG_FIELDS)}
            </div>
          )}

          {aba === "expedicao" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Parâmetros de Expedição</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Configurações do módulo de expedição de grãos — pesos, tolerâncias e comportamento automático.</p>
              </div>
              {renderFields("expedicao", EXPEDICAO_FIELDS)}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Operação Fiscal ── */}
      {modalOp !== null && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalOp(null); }}>
          <div style={{ ...boxStyle, width: 780 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modalOp.id ? "Editar Operação Fiscal" : "Nova Operação Fiscal"}</h3>
              <button onClick={() => setModalOp(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            {/* Identificação */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                {campo("Nome da Operação *", inp({ value: modalOp.nome ?? "", placeholder: "Ex: Venda para Industrialização", onChange: e => setModalOp(p => ({ ...p!, nome: e.target.value })) }))}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                {campo("Descrição / Uso", inp({ value: modalOp.descricao ?? "", placeholder: "Quando usar esta operação...", onChange: e => setModalOp(p => ({ ...p!, descricao: e.target.value })) }))}
              </div>
              {campo("CFOP — Mesmo Estado *", inp({ value: modalOp.cfop_interno ?? "", placeholder: "5101", maxLength: 4, onChange: e => setModalOp(p => ({ ...p!, cfop_interno: e.target.value })) }))}
              {campo("CFOP — Outro Estado / Exterior", inp({ value: modalOp.cfop_externo ?? "", placeholder: "6101 ou 7101", maxLength: 4, onChange: e => setModalOp(p => ({ ...p!, cfop_externo: e.target.value })) }))}
            </div>

            <div style={{ marginBottom: 14 }}>{secHeader("ICMS")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("CST Interno", sel({ value: modalOp.icms_cst_interno ?? "051", onChange: e => setModalOp(p => ({ ...p!, icms_cst_interno: e.target.value })), children: [["000","Tributada (000)"],["020","Base Reduzida (020)"],["040","Isenta (040)"],["041","Não Tributada (041)"],["051","Diferido (051)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("CST Interestadual", sel({ value: modalOp.icms_cst_externo ?? "020", onChange: e => setModalOp(p => ({ ...p!, icms_cst_externo: e.target.value })), children: [["000","Tributada (000)"],["020","Base Reduzida (020)"],["040","Isenta (040)"],["041","Não Tributada (041)"],["051","Diferido (051)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("Alíquota %", inp({ type: "number", step: "0.01", value: modalOp.icms_aliq ?? 12, onChange: e => setModalOp(p => ({ ...p!, icms_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("Base Reduzida %", inp({ type: "number", step: "0.01", value: modalOp.icms_base_reduzida_pct ?? 100, placeholder: "61.11", onChange: e => setModalOp(p => ({ ...p!, icms_base_reduzida_pct: parseFloat(e.target.value) || 100 })) }))}
              {campo("Efetiva (calc.)", <div style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: "#F4F6FA", fontSize: 13, fontWeight: 700, color: "#1A4870" }}>{((modalOp.icms_aliq ?? 0) * (modalOp.icms_base_reduzida_pct ?? 100) / 100).toFixed(2)}%</div>)}
            </div>

            <div style={{ marginBottom: 14 }}>{secHeader("PIS / COFINS")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("PIS CST", sel({ value: modalOp.pis_cst ?? "06", onChange: e => setModalOp(p => ({ ...p!, pis_cst: e.target.value })), children: [["01","Tributada (01)"],["06","Alíq. Zero (06)"],["07","Isenta (07)"],["08","Sem Incidência (08)"],["09","Suspensão (09)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("PIS Alíquota %", inp({ type: "number", step: "0.01", value: modalOp.pis_aliq ?? 0, onChange: e => setModalOp(p => ({ ...p!, pis_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("COFINS CST", sel({ value: modalOp.cofins_cst ?? "06", onChange: e => setModalOp(p => ({ ...p!, cofins_cst: e.target.value })), children: [["01","Tributada (01)"],["06","Alíq. Zero (06)"],["07","Isenta (07)"],["08","Sem Incidência (08)"],["09","Suspensão (09)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("COFINS Alíquota %", inp({ type: "number", step: "0.01", value: modalOp.cofins_aliq ?? 0, onChange: e => setModalOp(p => ({ ...p!, cofins_aliq: parseFloat(e.target.value) || 0 })) }))}
            </div>

            <div style={{ marginBottom: 14 }}>{secHeader("IBS / CBS — Reforma Tributária")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("Imunidade (exportação)", sel({ value: modalOp.ibs_cbs_imune ? "sim" : "nao", onChange: e => setModalOp(p => ({ ...p!, ibs_cbs_imune: e.target.value === "sim", ibs_cbs_reducao_pct: e.target.value === "sim" ? 100 : (p?.ibs_cbs_reducao_pct ?? 0) })), children: [<option key="nao" value="nao">Não</option>, <option key="sim" value="sim">Sim — Art. 149-B CF (exportação)</option>] as React.ReactNode }))}
              {campo("Redução %", sel({ value: String(modalOp.ibs_cbs_reducao_pct ?? 0), onChange: e => setModalOp(p => ({ ...p!, ibs_cbs_reducao_pct: parseFloat(e.target.value) })), children: [["0","0% — sem redução"],["60","60% — produção rural"],["100","100% — imune/zero"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("Status", sel({ value: modalOp.ativa === false ? "inativa" : "ativa", onChange: e => setModalOp(p => ({ ...p!, ativa: e.target.value === "ativa" })), children: [<option key="ativa" value="ativa">Ativa</option>, <option key="inativa" value="inativa">Inativa</option>] as React.ReactNode }))}
            </div>

            <div style={{ marginBottom: 14 }}>{secHeader("Texto Complementar (infCpl) — template")}</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                Use <code>[CONTRATO]</code>, <code>[RE_NUMERO]</code>, <code>[DUE_NUMERO]</code> como variáveis — o sistema substitui ao emitir a NF-e.
              </div>
              {campo("Template infCpl",
                txta({ rows: 4, value: modalOp.inf_cpl_template ?? "", onChange: e => setModalOp(p => ({ ...p!, inf_cpl_template: e.target.value })), placeholder: "Texto legal que aparece em todas as NF-e com esta operação..." })
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalOp(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarOp} style={{ padding: "8px 24px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal NCM ── */}
      {modalNcm !== null && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalNcm(null); }}>
          <div style={{ ...boxStyle, width: 820 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modalNcm.id ? "Editar Tributação NCM" : "Nova Tributação NCM"}</h3>
              <button onClick={() => setModalNcm(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("NCM (8 dígitos) *", inp({ value: modalNcm.ncm ?? "", maxLength: 8, placeholder: "12019000", onChange: e => setModalNcm(p => ({ ...p!, ncm: e.target.value.replace(/\D/g,"") })) }))}
              <div style={{ gridColumn: "2 / 4" }}>
                {campo("Descrição *", inp({ value: modalNcm.descricao ?? "", placeholder: "Soja em grão", onChange: e => setModalNcm(p => ({ ...p!, descricao: e.target.value })) }))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>{secHeader("ICMS")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("CST Interno", sel({ value: modalNcm.icms_cst_interno ?? "051", onChange: e => setModalNcm(p => ({ ...p!, icms_cst_interno: e.target.value })), children: [["000","Tributada (000)"],["020","Base Reduzida (020)"],["040","Isenta (040)"],["041","Não Tributada (041)"],["051","Diferido (051)"],["090","Outras (090)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("CST Interestadual", sel({ value: modalNcm.icms_cst_externo ?? "020", onChange: e => setModalNcm(p => ({ ...p!, icms_cst_externo: e.target.value })), children: [["000","Tributada (000)"],["020","Base Reduzida (020)"],["040","Isenta (040)"],["041","Não Tributada (041)"],["051","Diferido (051)"],["090","Outras (090)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("Alíquota %", inp({ type: "number", step: "0.01", value: modalNcm.icms_aliq ?? 12, onChange: e => setModalNcm(p => ({ ...p!, icms_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("Base Reduzida %", inp({ type: "number", step: "0.01", value: modalNcm.icms_base_reduzida_pct ?? 100, placeholder: "61.11", onChange: e => setModalNcm(p => ({ ...p!, icms_base_reduzida_pct: parseFloat(e.target.value) || 100 })) }))}
              {campo("Efetiva (calculada)", <div style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: "#F4F6FA", fontSize: 13, fontWeight: 700, color: "#1A4870" }}>{((modalNcm.icms_aliq ?? 0) * (modalNcm.icms_base_reduzida_pct ?? 100) / 100).toFixed(2)}%</div>)}
            </div>

            <div style={{ marginBottom: 16 }}>{secHeader("PIS / COFINS")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("PIS CST", sel({ value: modalNcm.pis_cst ?? "06", onChange: e => setModalNcm(p => ({ ...p!, pis_cst: e.target.value })), children: [["01","Tributada (01)"],["06","Alíq. Zero (06)"],["07","Isenta (07)"],["08","Sem Incidência (08)"],["09","Suspensão (09)"],["49","Outras Saídas (49)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("PIS Alíquota %", inp({ type: "number", step: "0.01", value: modalNcm.pis_aliq ?? 0, onChange: e => setModalNcm(p => ({ ...p!, pis_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("COFINS CST", sel({ value: modalNcm.cofins_cst ?? "06", onChange: e => setModalNcm(p => ({ ...p!, cofins_cst: e.target.value })), children: [["01","Tributada (01)"],["06","Alíq. Zero (06)"],["07","Isenta (07)"],["08","Sem Incidência (08)"],["09","Suspensão (09)"],["49","Outras Saídas (49)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("COFINS Alíquota %", inp({ type: "number", step: "0.01", value: modalNcm.cofins_aliq ?? 0, onChange: e => setModalNcm(p => ({ ...p!, cofins_aliq: parseFloat(e.target.value) || 0 })) }))}
            </div>

            <div style={{ marginBottom: 16 }}>{secHeader("IBS / CBS — Reforma Tributária (LC 214/2025)")}</div>
            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#7A5A12" }}>
              Taxas finais (vigência plena a partir de 2033). Em 2026 são aplicadas taxas-teste menores. Produtos agropecuários têm redução de 60%.
              IBS/CBS = 0% para exportações (CFOP 7xxx) — imunidade constitucional.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("IBS Estadual %", inp({ type: "number", step: "0.01", value: modalNcm.ibs_estadual_aliq ?? 0, onChange: e => setModalNcm(p => ({ ...p!, ibs_estadual_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("IBS Municipal %", inp({ type: "number", step: "0.01", value: modalNcm.ibs_municipal_aliq ?? 0, onChange: e => setModalNcm(p => ({ ...p!, ibs_municipal_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("CBS %", inp({ type: "number", step: "0.01", value: modalNcm.cbs_aliq ?? 0, onChange: e => setModalNcm(p => ({ ...p!, cbs_aliq: parseFloat(e.target.value) || 0 })) }))}
              {campo("Redução %", sel({ value: String(modalNcm.ibs_cbs_reducao_pct ?? 0), onChange: e => setModalNcm(p => ({ ...p!, ibs_cbs_reducao_pct: parseFloat(e.target.value) })), children: [["0","0% — sem redução"],["60","60% — produção rural (agro)"],["100","100% — zero (exportação/cesta básica)"]].map(([v,l]) => <option key={v} value={v}>{l}</option>) as React.ReactNode }))}
              {campo("Efetiva IBS+CBS", <div style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: "#F4F6FA", fontSize: 13, fontWeight: 700, color: "#C9921B" }}>
                {(((modalNcm.ibs_estadual_aliq ?? 0) + (modalNcm.ibs_municipal_aliq ?? 0) + (modalNcm.cbs_aliq ?? 0)) * (1 - (modalNcm.ibs_cbs_reducao_pct ?? 0) / 100)).toFixed(2)}%
              </div>)}
            </div>

            <div style={{ marginBottom: 16 }}>{secHeader("CFOPs e Texto Complementar")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 16 }}>
              {campo("CFOP dentro do Estado (override)", inp({ value: modalNcm.cfop_dentro ?? "", placeholder: "Deixar vazio = usa o do emitente", onChange: e => setModalNcm(p => ({ ...p!, cfop_dentro: e.target.value })) }))}
              {campo("CFOP outro Estado (override)", inp({ value: modalNcm.cfop_fora ?? "", placeholder: "Deixar vazio = usa o do emitente", onChange: e => setModalNcm(p => ({ ...p!, cfop_fora: e.target.value })) }))}
            </div>
            <div style={{ marginBottom: 20 }}>
              {campo("Texto complementar (infCpl) — específico para este NCM",
                txta({ rows: 4, value: modalNcm.inf_cpl ?? "", placeholder: "Texto legal que aparece apenas em NF-e com este NCM...", onChange: e => setModalNcm(p => ({ ...p!, inf_cpl: e.target.value })) })
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalNcm(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarNcm} style={{ padding: "8px 24px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Transportadora ── */}
      {modalT !== null && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalT(null); }}>
          <div style={boxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modalT.id ? "Editar Transportadora" : "Nova Transportadora"}</h3>
              <button onClick={() => setModalT(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("CNPJ *", inp({ value: modalT.cnpj ?? "", onChange: e => setModalT(p => ({ ...p!, cnpj: e.target.value })), placeholder: "00.000.000/0001-00" }))}
              {campo("Razão Social *", inp({ value: modalT.razao_social ?? "", onChange: e => setModalT(p => ({ ...p!, razao_social: e.target.value })) }))}
              {campo("Nome Fantasia", inp({ value: modalT.nome_fantasia ?? "", onChange: e => setModalT(p => ({ ...p!, nome_fantasia: e.target.value })) }))}
              {campo("RNTRC", inp({ value: modalT.rntrc ?? "", onChange: e => setModalT(p => ({ ...p!, rntrc: e.target.value })) }))}
              {campo("UF", inp({ value: modalT.uf ?? "", onChange: e => setModalT(p => ({ ...p!, uf: e.target.value })), maxLength: 2 }))}
              {campo("Status", sel({ value: modalT.ativa === false ? "inativo" : "ativo", onChange: e => setModalT(p => ({ ...p!, ativa: e.target.value === "ativo" })), children: [<option key="ativo" value="ativo">Ativa</option>, <option key="inativo" value="inativo">Inativa</option>] as React.ReactNode }))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalT(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarTransportadora} style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Veículo ── */}
      {modalV !== null && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalV(null); }}>
          <div style={boxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modalV.id ? "Editar Veículo" : "Novo Veículo"}</h3>
              <button onClick={() => setModalV(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("Placa *", inp({ value: modalV.placa ?? "", onChange: e => setModalV(p => ({ ...p!, placa: e.target.value.toUpperCase() })), placeholder: "AAA-0000" }))}
              {campo("Tipo *", sel({ value: modalV.tipo ?? "", onChange: e => setModalV(p => ({ ...p!, tipo: e.target.value })), children: [<option key="" value="">— selecione —</option>, <option key="toco" value="Toco">Toco</option>, <option key="truck" value="Truck">Truck</option>, <option key="bitruck" value="Bi-Truck">Bi-Truck</option>, <option key="ls" value="LS / Cavalo">LS / Cavalo</option>, <option key="carreta" value="Carreta">Carreta</option>, <option key="bitrem" value="Bitrem">Bitrem</option>] as React.ReactNode }))}
              {campo("Tara (kg)", inp({ type: "number", value: modalV.tara_kg ?? "", onChange: e => setModalV(p => ({ ...p!, tara_kg: Number(e.target.value) })) }))}
              {campo("Capacidade (kg)", inp({ type: "number", value: modalV.cap_kg ?? "", onChange: e => setModalV(p => ({ ...p!, cap_kg: Number(e.target.value) })) }))}
              {campo("RNTRC", inp({ value: modalV.rntrc ?? "", onChange: e => setModalV(p => ({ ...p!, rntrc: e.target.value })) }))}
              {campo("Status", sel({ value: modalV.ativo === false ? "inativo" : "ativo", onChange: e => setModalV(p => ({ ...p!, ativo: e.target.value === "ativo" })), children: [<option key="ativo" value="ativo">Ativo</option>, <option key="inativo" value="inativo">Inativo</option>] as React.ReactNode }))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalV(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarVeiculo} style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Motorista ── */}
      {modalM !== null && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalM(null); }}>
          <div style={boxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modalM.id ? "Editar Motorista" : "Novo Motorista"}</h3>
              <button onClick={() => setModalM(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              {campo("Nome *", inp({ value: modalM.nome ?? "", onChange: e => setModalM(p => ({ ...p!, nome: e.target.value })) }))}
              {campo("CPF *", inp({ value: modalM.cpf ?? "", onChange: e => setModalM(p => ({ ...p!, cpf: e.target.value })), placeholder: "000.000.000-00" }))}
              {campo("CNH", inp({ value: modalM.cnh ?? "", onChange: e => setModalM(p => ({ ...p!, cnh: e.target.value })) }))}
              {campo("Validade CNH", inp({ type: "date", value: modalM.cnh_validade ?? "", onChange: e => setModalM(p => ({ ...p!, cnh_validade: e.target.value })) }))}
              {campo("Status", sel({ value: modalM.ativo === false ? "inativo" : "ativo", onChange: e => setModalM(p => ({ ...p!, ativo: e.target.value === "ativo" })), children: [<option key="ativo" value="ativo">Ativo</option>, <option key="inativo" value="inativo">Inativo</option>] as React.ReactNode }))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalM(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarMotorista} style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function ParametrosSistema() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando...</div>}>
      <ParametrosSistemaContent />
    </Suspense>
  );
}
