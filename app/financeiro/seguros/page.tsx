"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import {
  listarMaquinas, listarProdutoresDaConta, listarFuncionarios, listarFazendas,
} from "../../../lib/db";
import type { Maquina, Produtor, Funcionario, Fazenda } from "../../../lib/supabase";
import InputMonetario from "../../../components/InputMonetario";
import PlanoGate from "../../../components/PlanoGate";

// ── Estilos base ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const sep: React.CSSProperties = { gridColumn: "1/-1", fontSize: 11, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: 6, borderBottom: "0.5px solid var(--border-table)", marginTop: 8 };

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje    = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#E8E8E8", color = "#0D0D0D") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{texto}</span>;
}

function diasAteVencer(dataVenc: string): number {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const [y, m, v] = dataVenc.split("-").map(Number);
  return Math.ceil((new Date(y, m - 1, v).getTime() - d.getTime()) / 86_400_000);
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
type RamoSeguro = "rural" | "vida" | "patrimonial" | "automovel" | "responsabilidade_civil" | "maquinas" | "outro";
type StatusApolice = "vigente" | "vencida" | "cancelada" | "em_renovacao";
type StatusSinistro = "aberto" | "em_analise" | "pago" | "negado";
type BemTipo = "fazenda" | "maquina" | "produtor" | "funcionario" | "imovel" | "outro";
type ModalidadeSeguro = "proagro" | "proagro_mais" | "app_privada";
type FormaPagamento = "unica" | "semestral" | "trimestral" | "mensal";

interface CoerturaVida { tipo: string; capital: number }

interface Apolice {
  id: string;
  fazenda_id: string;
  conta_id?: string;
  numero_apolice: string;
  seguradora: string;
  ramo: RamoSeguro;
  objeto_segurado: string;
  importancia_segurada: number;
  premio_anual: number;
  forma_pagamento_premio: FormaPagamento;
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
  status: StatusApolice;
  corretora?: string;
  corretor_contato?: string;
  arquivo_url?: string;
  observacao?: string;
  // bem vinculado
  bem_tipo?: BemTipo;
  bem_id?: string;
  // rural
  area_ha?: number;
  cultura?: string;
  modalidade_seguro?: ModalidadeSeguro;
  produtividade_garantida_pct?: number;
  valor_referencia_sc?: number;
  // vida
  coberturas_vida?: CoerturaVida[];
  created_at?: string;
}

interface PagamentoPremio {
  id: string;
  apolice_id: string;
  fazenda_id?: string;
  data_vencimento: string;
  data_pagamento?: string | null;
  valor: number;
  pago: boolean;
  lancamento_id?: string | null;
  observacao?: string;
}

interface Sinistro {
  id: string;
  apolice_id: string;
  data_ocorrencia: string;
  data_comunicacao?: string | null;
  descricao: string;
  valor_reclamado: number;
  valor_indenizado: number;
  status: StatusSinistro;
  numero_protocolo?: string;
  observacao?: string;
}

// ── Metadados de ramo ─────────────────────────────────────────────────────────
const RAMO_META: Record<RamoSeguro, { label: string; bg: string; cl: string; og: string }> = {
  rural:                  { label: "Rural / Agrícola",  bg: "#E8F5E9", cl: "#1A6B3C", og: "2.03.03.004" },
  vida:                   { label: "Vida",              bg: "#F3E8FF", cl: "#6B21A8", og: "2.01.01.10.020" },
  patrimonial:            { label: "Patrimonial",       bg: "#FBF3E0", cl: "#7B4A00", og: "2.03.03.002" },
  automovel:              { label: "Automóvel",         bg: "#E6F1FB", cl: "#0C447C", og: "2.03.03.003" },
  responsabilidade_civil: { label: "Resp. Civil",       bg: "#FFF3E0", cl: "#7B4A00", og: "2.03.03.001" },
  maquinas:               { label: "Máquinas/Equip.",   bg: "#E6F1FB", cl: "#0C447C", og: "2.03.03.001" },
  outro:                  { label: "Outro",             bg: "var(--bg-page)", cl: "var(--text-2)", og: "2.03.03.001" },
};

const STATUS_APOLICE_META: Record<StatusApolice, { label: string; bg: string; cl: string }> = {
  vigente:      { label: "Vigente",      bg: "#E8F5E9", cl: "#1A6B3C" },
  vencida:      { label: "Vencida",      bg: "#FCEBEB", cl: "#791F1F" },
  cancelada:    { label: "Cancelada",    bg: "var(--bg-page)", cl: "var(--text-2)" },
  em_renovacao: { label: "Em Renovação", bg: "#FBF3E0", cl: "#7B4A00" },
};

const STATUS_SINISTRO_META: Record<StatusSinistro, { label: string; bg: string; cl: string }> = {
  aberto:     { label: "Aberto",     bg: "#FBF3E0", cl: "#7B4A00" },
  em_analise: { label: "Em Análise", bg: "#E8E8E8", cl: "#0D0D0D" },
  pago:       { label: "Pago",       bg: "#E8F5E9", cl: "#1A6B3C" },
  negado:     { label: "Negado",     bg: "#FCEBEB", cl: "#791F1F" },
};

const MODALIDADE_LABEL: Record<ModalidadeSeguro, string> = {
  proagro: "PROAGRO",
  proagro_mais: "PROAGRO Mais",
  app_privada: "Apólice Privada",
};

const FORMA_PAG_LABEL: Record<FormaPagamento, string> = {
  unica: "Única (à vista)",
  semestral: "Semestral (2x/ano)",
  trimestral: "Trimestral (4x/ano)",
  mensal: "Mensal (12x/ano)",
};

// ── Gerador de parcelas de prêmio ─────────────────────────────────────────────
function gerarParcelasPremio(
  inicio: string,
  premioAnual: number,
  forma: FormaPagamento,
): Array<{ data_vencimento: string; valor: number }> {
  const base = new Date(inicio + "T12:00:00");
  const add = (d: Date, m: number) => { const n = new Date(d); n.setMonth(n.getMonth() + m); return n.toISOString().slice(0, 10); };
  switch (forma) {
    case "unica":      return [{ data_vencimento: inicio, valor: premioAnual }];
    case "semestral":  return [0, 6].map(m => ({ data_vencimento: add(base, m), valor: premioAnual / 2 }));
    case "trimestral": return [0, 3, 6, 9].map(m => ({ data_vencimento: add(base, m), valor: premioAnual / 4 }));
    case "mensal":     return Array.from({ length: 12 }, (_, m) => ({ data_vencimento: add(base, m), valor: premioAnual / 12 }));
  }
}

// ── Label do bem vinculado ────────────────────────────────────────────────────
function labelBem(a: Apolice, maquinas: Maquina[], produtores: Produtor[], funcionarios: Funcionario[], fazendas: Fazenda[]): string {
  if (!a.bem_id || !a.bem_tipo) return a.objeto_segurado || "—";
  if (a.bem_tipo === "maquina")    return maquinas.find(m => m.id === a.bem_id)?.nome ?? a.objeto_segurado;
  if (a.bem_tipo === "produtor")   return produtores.find(p => p.id === a.bem_id)?.nome ?? a.objeto_segurado;
  if (a.bem_tipo === "funcionario") return funcionarios.find(f => f.id === a.bem_id)?.nome ?? a.objeto_segurado;
  if (a.bem_tipo === "fazenda")    return fazendas.find(f => f.id === a.bem_id)?.nome ?? a.objeto_segurado;
  return a.objeto_segurado || "—";
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SegurosPage() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano } = useAuth();
  const [aba, setAba] = useState<"apolices" | "vencimentos" | "sinistros">("apolices");

  // Dados
  const [apolices,   setApolices]   = useState<Apolice[]>([]);
  const [premios,    setPremios]    = useState<PagamentoPremio[]>([]);
  const [sinistros,  setSinistros]  = useState<Sinistro[]>([]);
  const [expandido,  setExpandido]  = useState<string | null>(null);

  // Catálogos
  const [maquinas,      setMaquinas]      = useState<Maquina[]>([]);
  const [produtores,    setProdutores]    = useState<Produtor[]>([]);
  const [funcionarios,  setFuncionarios]  = useState<Funcionario[]>([]);
  const [fazendas,      setFazendas]      = useState<Fazenda[]>([]);

  // ── Modal apólice ──────────────────────────────────────────────────────────
  const [modalApolice, setModalApolice] = useState(false);
  const [apoliceEdit,  setApoliceEdit]  = useState<Apolice | null>(null);
  const [tabModal,     setTabModal]     = useState<"dados" | "cobertura" | "financeiro" | "anexo">("dados");
  const FORM_VAZIO = (): Omit<Apolice, "id" | "fazenda_id" | "conta_id" | "created_at"> => ({
    numero_apolice: "", seguradora: "", ramo: "maquinas",
    objeto_segurado: "", importancia_segurada: 0, premio_anual: 0,
    forma_pagamento_premio: "unica", data_inicio_vigencia: hoje(),
    data_fim_vigencia: "", status: "vigente",
    corretora: "", corretor_contato: "", observacao: "",
    bem_tipo: undefined, bem_id: undefined,
    area_ha: undefined, cultura: "", modalidade_seguro: undefined,
    produtividade_garantida_pct: undefined, valor_referencia_sc: undefined,
    coberturas_vida: [],
  });
  const [aForm,   setAForm]   = useState(FORM_VAZIO());
  const [aSaving, setASaving] = useState(false);
  const [aErr,    setAErr]    = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // Cobertura vida inline
  const [novaCobertura, setNovaCobertura] = useState({ tipo: "morte", capital: 0 });

  // ── Modal sinistro ─────────────────────────────────────────────────────────
  const [modalSinistro,  setModalSinistro]  = useState<Apolice | null>(null);
  const [sinistroEdit,   setSinistroEdit]   = useState<Sinistro | null>(null);
  const SIN_VAZIO = () => ({ data_ocorrencia: hoje(), data_comunicacao: "", descricao: "", valor_reclamado: 0, valor_indenizado: 0, status: "aberto" as StatusSinistro, numero_protocolo: "", observacao: "" });
  const [sForm,   setSForm]   = useState(SIN_VAZIO());
  const [sSaving, setSSaving] = useState(false);
  const [sErr,    setSErr]    = useState("");

  // ── Modal pagar prêmio ─────────────────────────────────────────────────────
  const [modalPremio,   setModalPremio]   = useState<PagamentoPremio | null>(null);
  const [premioData,    setPremioData]    = useState(hoje());
  const [premioSaving,  setPremioSaving]  = useState(false);

  // ── Carregar dados ─────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: ap }, { data: pr }, { data: si }] = await Promise.all([
      supabase.from("apolices_seguro").select("*").in("fazenda_id", fazendaIds).order("data_fim_vigencia"),
      supabase.from("pagamentos_premio_seguro").select("*").order("data_vencimento"),
      supabase.from("sinistros_seguro").select("*").order("data_ocorrencia", { ascending: false }),
    ]);
    setApolices(ap ?? []);
    setPremios(pr ?? []);
    setSinistros(si ?? []);
  }, [fazendaId, JSON.stringify(fazendaIds)]);

  const carregarCatalogos = useCallback(async () => {
    if (!fazendaId || !contaId) return;
    const [maq, prod, func, faz] = await Promise.all([
      listarMaquinas(fazendaId),
      listarProdutoresDaConta(contaId),
      listarFuncionarios(fazendaId),
      listarFazendas(contaId),
    ]);
    setMaquinas(maq);
    setProdutores(prod);
    setFuncionarios(func);
    setFazendas(faz);
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); carregarCatalogos(); }, [carregar, carregarCatalogos]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const vigentes       = apolices.filter(a => a.status === "vigente");
  const totalIS        = vigentes.reduce((s, a) => s + (a.importancia_segurada ?? 0), 0);
  const totalAnual     = vigentes.reduce((s, a) => s + (a.premio_anual ?? 0), 0);
  const vencendoEm30   = apolices.filter(a => { if (a.status !== "vigente") return false; const d = diasAteVencer(a.data_fim_vigencia); return d >= 0 && d <= 30; });
  const premiosVencidos = premios.filter(p => !p.pago && new Date(p.data_vencimento) < new Date());

  // ── CRUD Apólice ──────────────────────────────────────────────────────────
  function abrirApolice(a?: Apolice) {
    if (a) {
      setApoliceEdit(a);
      setAForm({
        numero_apolice: a.numero_apolice, seguradora: a.seguradora,
        ramo: a.ramo, objeto_segurado: a.objeto_segurado,
        importancia_segurada: a.importancia_segurada ?? 0,
        premio_anual: a.premio_anual ?? 0,
        forma_pagamento_premio: (a.forma_pagamento_premio as FormaPagamento) || "unica",
        data_inicio_vigencia: a.data_inicio_vigencia,
        data_fim_vigencia: a.data_fim_vigencia,
        status: a.status, corretora: a.corretora ?? "",
        corretor_contato: a.corretor_contato ?? "", observacao: a.observacao ?? "",
        bem_tipo: a.bem_tipo, bem_id: a.bem_id,
        area_ha: a.area_ha, cultura: a.cultura ?? "",
        modalidade_seguro: a.modalidade_seguro,
        produtividade_garantida_pct: a.produtividade_garantida_pct,
        valor_referencia_sc: a.valor_referencia_sc,
        coberturas_vida: a.coberturas_vida ?? [],
        arquivo_url: a.arquivo_url,
      });
      setUploadedUrl(a.arquivo_url ?? null);
    } else {
      setApoliceEdit(null);
      setAForm(FORM_VAZIO());
      setUploadedUrl(null);
    }
    setAErr(""); setTabModal("dados"); setModalApolice(true);
  }

  // Busca UUID da OG para o ramo da apólice na fazenda correta
  async function buscarOgSeguro(fazendaIdArg: string, ramo: RamoSeguro): Promise<string | null> {
    const classificacao = RAMO_META[ramo].og;
    const { data } = await supabase.from("operacoes_gerenciais").select("id").eq("fazenda_id", fazendaIdArg).eq("classificacao", classificacao).maybeSingle();
    return data?.id ?? null;
  }

  async function salvarApolice() {
    if (!fazendaId) return;
    if (!aForm.numero_apolice.trim()) { setAErr("Informe o número da apólice."); return; }
    if (!aForm.seguradora.trim())     { setAErr("Informe a seguradora."); return; }
    if (!aForm.data_fim_vigencia)     { setAErr("Informe a data de fim de vigência."); return; }
    if (aForm.premio_anual <= 0)      { setAErr("Informe o prêmio anual."); return; }
    setASaving(true); setAErr("");
    try {
      const objeto = aForm.objeto_segurado.trim() || derivarObjeto();
      const payload = {
        fazenda_id: fazendaId, conta_id: contaId,
        numero_apolice: aForm.numero_apolice.trim(),
        seguradora: aForm.seguradora.trim(),
        ramo: aForm.ramo, objeto_segurado: objeto,
        importancia_segurada: aForm.importancia_segurada || 0,
        premio_anual: aForm.premio_anual,
        forma_pagamento_premio: aForm.forma_pagamento_premio,
        data_inicio_vigencia: aForm.data_inicio_vigencia,
        data_fim_vigencia: aForm.data_fim_vigencia,
        status: aForm.status,
        corretora: aForm.corretora || null,
        corretor_contato: aForm.corretor_contato || null,
        arquivo_url: uploadedUrl || aForm.arquivo_url || null,
        observacao: aForm.observacao || null,
        bem_tipo: aForm.bem_tipo || null,
        bem_id: aForm.bem_id || null,
        area_ha: aForm.area_ha || null,
        cultura: aForm.cultura || null,
        modalidade_seguro: aForm.modalidade_seguro || null,
        produtividade_garantida_pct: aForm.produtividade_garantida_pct || null,
        valor_referencia_sc: aForm.valor_referencia_sc || null,
        coberturas_vida: aForm.coberturas_vida?.length ? aForm.coberturas_vida : null,
      };

      const res = await fetch("/api/financeiro/seguros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(apoliceEdit ? { apolice_id: apoliceEdit.id } : {}),
          payload,
          gerar_parcelas: !apoliceEdit,
          ramo_label: RAMO_META[aForm.ramo].label,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Erro ao salvar.");

      await carregar();
      setModalApolice(false);
    } catch (e: unknown) {
      setAErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setASaving(false);
    }
  }

  // Deriva texto do objeto segurado a partir do bem vinculado
  function derivarObjeto(): string {
    if (!aForm.bem_id || !aForm.bem_tipo) return "";
    if (aForm.bem_tipo === "maquina") {
      const m = maquinas.find(x => x.id === aForm.bem_id);
      return m ? `${m.nome}${m.chassi ? ` — Chassi ${m.chassi}` : ""}` : "";
    }
    if (aForm.bem_tipo === "produtor") return produtores.find(x => x.id === aForm.bem_id)?.nome ?? "";
    if (aForm.bem_tipo === "funcionario") return funcionarios.find(x => x.id === aForm.bem_id)?.nome ?? "";
    if (aForm.bem_tipo === "fazenda") {
      const f = fazendas.find(x => x.id === aForm.bem_id);
      return f ? `${f.nome}${aForm.area_ha ? ` — ${aForm.area_ha} ha` : ""}${aForm.cultura ? ` — ${aForm.cultura}` : ""}` : "";
    }
    return aForm.objeto_segurado;
  }

  // Upload de PDF da apólice
  async function handleUpload(file: File) {
    if (!fazendaId) return;
    setUploading(true);
    try {
      const path = `apolices/${fazendaId}/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const { error } = await supabase.storage.from("arquivos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("arquivos").getPublicUrl(path);
      setUploadedUrl(publicUrl);
    } catch (e) {
      console.error("[upload apólice]", e);
    } finally {
      setUploading(false);
    }
  }

  // ── CRUD Sinistro ─────────────────────────────────────────────────────────
  function abrirSinistro(apolice: Apolice, s?: Sinistro) {
    setModalSinistro(apolice);
    setSinistroEdit(s ?? null);
    setSForm(s ? { data_ocorrencia: s.data_ocorrencia, data_comunicacao: s.data_comunicacao ?? "", descricao: s.descricao, valor_reclamado: s.valor_reclamado ?? 0, valor_indenizado: s.valor_indenizado ?? 0, status: s.status, numero_protocolo: s.numero_protocolo ?? "", observacao: s.observacao ?? "" } : SIN_VAZIO());
    setSErr("");
  }

  async function salvarSinistro() {
    if (!modalSinistro) return;
    if (!sForm.descricao.trim()) { setSErr("Informe a descrição do sinistro."); return; }
    setSSaving(true); setSErr("");
    try {
      const payload = { apolice_id: modalSinistro.id, data_ocorrencia: sForm.data_ocorrencia, data_comunicacao: sForm.data_comunicacao || null, descricao: sForm.descricao.trim(), valor_reclamado: sForm.valor_reclamado || 0, valor_indenizado: sForm.valor_indenizado || 0, status: sForm.status, numero_protocolo: sForm.numero_protocolo || null, observacao: sForm.observacao || null };
      let saveError;
      if (sinistroEdit) { ({ error: saveError } = await supabase.from("sinistros_seguro").update(payload).eq("id", sinistroEdit.id)); }
      else              { ({ error: saveError } = await supabase.from("sinistros_seguro").insert(payload)); }
      if (saveError) throw new Error(saveError.message);
      await carregar();
      setModalSinistro(null);
    } catch (e: unknown) {
      setSErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSSaving(false);
    }
  }

  // ── Pagar prêmio — cria lançamento CP + baixa ─────────────────────────────
  async function pagarPremio() {
    if (!modalPremio || !fazendaId) return;
    setPremioSaving(true);
    try {
      const apolice = apolices.find(a => a.id === modalPremio.apolice_id);
      if (!apolice) throw new Error("Apólice não encontrada.");

      if (modalPremio.lancamento_id) {
        // Baixa o lançamento já existente
        await supabase.from("lancamentos").update({ status: "baixado", data_baixa: premioData }).eq("id", modalPremio.lancamento_id);
      } else {
        // Lançamento CP não existia — cria agora
        const ogId = await buscarOgSeguro(fazendaId, apolice.ramo);
        const { data: lanc } = await supabase.from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: "pagar",
          descricao: `Prêmio Seguro ${apolice.seguradora} — ${RAMO_META[apolice.ramo].label}`,
          categoria: `Prêmio de Seguro (${RAMO_META[apolice.ramo].label})`,
          operacao_gerencial_id: ogId,
          data_lancamento: premioData,
          data_vencimento: modalPremio.data_vencimento,
          valor: modalPremio.valor,
          status: "baixado", data_baixa: premioData,
          auto: false, origem_lancamento: "seguro",
          numero_documento: apolice.numero_apolice,
        }).select("id").single();
        if (lanc) {
          await supabase.from("pagamentos_premio_seguro").update({ lancamento_id: lanc.id }).eq("id", modalPremio.id);
        }
      }
      await supabase.from("pagamentos_premio_seguro").update({ pago: true, data_pagamento: premioData }).eq("id", modalPremio.id);
      await carregar();
      setModalPremio(null);
    } catch (e) {
      console.error("[pagarPremio]", e);
    } finally {
      setPremioSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const premiosVisiveis = premios.filter(p => aba === "vencimentos" ? !p.pago : (expandido ? p.apolice_id === expandido : false));
  const sinistrosVisiveis = sinistros.filter(s => aba === "sinistros" || (expandido && s.apolice_id === expandido));

  // Bem vinculado — label da lista dinâmica
  const bemOptions = (() => {
    const ramo = aForm.ramo;
    if (ramo === "maquinas" || ramo === "automovel") return maquinas.map(m => ({ id: m.id, label: `${m.nome}${m.marca ? ` — ${m.marca}` : ""}${m.modelo ? ` ${m.modelo}` : ""}` }));
    if (ramo === "rural")    return fazendas.map(f => ({ id: f.id, label: `${f.nome}${f.municipio ? ` — ${f.municipio}` : ""}` }));
    if (ramo === "vida")     return [
      ...produtores.map(p => ({ id: `p:${p.id}`, label: `Produtor — ${p.nome}` })),
      ...funcionarios.map(f => ({ id: `f:${f.id}`, label: `Funcionário — ${f.nome}` })),
    ];
    return [];
  })();

  if (!podeAcessarPlano("fin_seguros")) return <PlanoGate modulo="fin_seguros" />;
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Controle de Seguros</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>Apólices, prêmios e sinistros — máquinas, agrícola, patrimonial, vida</p>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Apólices Vigentes",    v: vigentes.length.toString(),     sub: "ativas",           cor: "#1A6B3C" },
            { label: "Importância Segurada", v: fmtBRL(totalIS),                sub: "total segurado",   cor: "#111" },
            { label: "Prêmio Anual Total",   v: fmtBRL(totalAnual),             sub: "custo do seguro",  cor: "#C9921B" },
            { label: "Vencendo em 30 dias",  v: vencendoEm30.length.toString(), sub: `+ ${premiosVencidos.length} prêmios atrasados`, cor: vencendoEm30.length > 0 ? "#E24B4A" : "var(--text-2)" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.v}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Alerta vencimento */}
        {vencendoEm30.length > 0 && (
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7B4A00", marginBottom: 6 }}>Apólices vencendo em breve</div>
            {vencendoEm30.map(a => { const d = diasAteVencer(a.data_fim_vigencia); return (
              <div key={a.id} style={{ fontSize: 12, color: "#7B4A00" }}>
                <strong>{a.numero_apolice}</strong> — {a.seguradora} ({labelBem(a, maquinas, produtores, funcionarios, fazendas)}) — vence {d === 0 ? "hoje" : `em ${d} dias`} ({fmtData(a.data_fim_vigencia)})
              </div>
            ); })}
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid var(--border-table)" }}>
          {([
            { id: "apolices",    label: "Apólices" },
            { id: "vencimentos", label: "Prêmios Pendentes" },
            { id: "sinistros",   label: "Sinistros" },
          ] as { id: typeof aba; label: string }[]).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{ padding: "9px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: aba === a.id ? 700 : 400, color: aba === a.id ? "#111" : "#666", borderBottom: aba === a.id ? "2.5px solid #111" : "2.5px solid transparent", marginBottom: -1 }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA APÓLICES ─────────────────────────────────────────────────── */}
        {aba === "apolices" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => abrirApolice()} style={btnV}>+ Nova Apólice</button>
            </div>
            {apolices.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhuma apólice cadastrada.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {apolices.map(a => {
                  const rm  = RAMO_META[a.ramo];
                  const sm  = STATUS_APOLICE_META[a.status];
                  const dias = diasAteVencer(a.data_fim_vigencia);
                  const urgente = a.status === "vigente" && dias >= 0 && dias <= 30;
                  const apolSinistros = sinistros.filter(s => s.apolice_id === a.id);
                  const exp = expandido === a.id;
                  return (
                    <div key={a.id} style={{ background: "var(--bg-card)", borderRadius: 12, border: `0.5px solid ${urgente ? "#C9921B60" : "var(--border-table)"}`, overflow: "hidden" }}>
                      <div onClick={() => setExpandido(exp ? null : a.id)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 140px 130px 150px 180px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{a.numero_apolice}</span>
                            {badge(rm.label, rm.bg, rm.cl)}
                            {urgente && badge(`${dias}d`, "#FBF3E0", "#7B4A00")}
                          </div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                            {a.seguradora}{a.corretora ? ` · ${a.corretora}` : ""} · {labelBem(a, maquinas, produtores, funcionarios, fazendas)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Import. Segurada</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(a.importancia_segurada)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Prêmio Anual</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(a.premio_anual)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Vigência</div>
                          <div style={{ fontSize: 12 }}>{fmtData(a.data_inicio_vigencia)} → {fmtData(a.data_fim_vigencia)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {badge(sm.label, sm.bg, sm.cl)}
                          {a.arquivo_url && (
                            <a href={a.arquivo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ padding: "4px 10px", border: "0.5px solid #1A4870", borderRadius: 6, background: "#D5E8F5", color: "#1A4870", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>PDF</a>
                          )}
                          <button onClick={e => { e.stopPropagation(); abrirSinistro(a); }} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F", fontWeight: 600 }}>Sinistro</button>
                          <button onClick={e => { e.stopPropagation(); abrirApolice(a); }} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>Editar</button>
                        </div>
                      </div>
                      {exp && (
                        <div style={{ borderTop: "0.5px solid var(--bg-tag)", padding: "12px 18px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Sinistros ({apolSinistros.length})</div>
                          {apolSinistros.length === 0 ? (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum sinistro registrado.</div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead><tr style={{ background: "var(--bg-tag)" }}>{["Ocorrência","Protocolo","Descrição","Reclamado","Indenizado","Status",""].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: ["Reclamado","Indenizado"].includes(h) ? "right" : "left", color: "var(--text-2)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {apolSinistros.map(s => { const sm2 = STATUS_SINISTRO_META[s.status]; return (
                                  <tr key={s.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                                    <td style={{ padding: "6px 10px" }}>{fmtData(s.data_ocorrencia)}</td>
                                    <td style={{ padding: "6px 10px", color: "#666" }}>{s.numero_protocolo ?? "—"}</td>
                                    <td style={{ padding: "6px 10px" }}>{s.descricao}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(s.valor_reclamado)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: s.valor_indenizado > 0 ? "#16A34A" : "var(--text-muted)" }}>{s.valor_indenizado > 0 ? fmtBRL(s.valor_indenizado) : "—"}</td>
                                    <td style={{ padding: "6px 10px" }}>{badge(sm2.label, sm2.bg, sm2.cl)}</td>
                                    <td style={{ padding: "6px 10px" }}><button onClick={() => abrirSinistro(a, s)} style={{ padding: "3px 8px", border: "0.5px solid var(--border-table)", borderRadius: 5, background: "transparent", cursor: "pointer", fontSize: 11 }}>Abrir</button></td>
                                  </tr>
                                ); })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA PRÊMIOS PENDENTES ─────────────────────────────────────────── */}
        {aba === "vencimentos" && (
          <div>
            {premiosVisiveis.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhum prêmio pendente.</div>
            ) : (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--bg-card)" }}>{["Vencimento","Apólice","Seguradora","Bem Segurado","Valor","Status",""].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: h === "Valor" ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {premiosVisiveis.map(p => {
                      const ap = apolices.find(a => a.id === p.apolice_id);
                      const vencido = new Date(p.data_vencimento) < new Date();
                      return (
                        <tr key={p.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: vencido ? "#FFFCF5" : "var(--bg-card)" }}>
                          <td style={{ padding: "10px 14px", color: vencido ? "#E24B4A" : "var(--text-1)", fontWeight: vencido ? 600 : 400 }}>{fmtData(p.data_vencimento)}</td>
                          <td style={{ padding: "10px 14px" }}>{ap?.numero_apolice ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{ap?.seguradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{ap ? labelBem(ap, maquinas, produtores, funcionarios, fazendas) : "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>{p.pago ? badge("Pago","#E8F5E9","#1A6B3C") : vencido ? badge("Atrasado","#FCEBEB","#791F1F") : badge("Pendente","#FBF3E0","#7B4A00")}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {!p.pago && <button onClick={() => { setModalPremio(p); setPremioData(hoje()); }} style={{ padding: "4px 10px", border: "0.5px solid #11111150", borderRadius: 6, background: "#E8E8E8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Pagar</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA SINISTROS ─────────────────────────────────────────────────── */}
        {aba === "sinistros" && (
          <div>
            {sinistrosVisiveis.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhum sinistro registrado.</div>
            ) : (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--bg-card)" }}>{["Ocorrência","Apólice","Seguradora","Descrição","Reclamado","Indenizado","Status",""].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: ["Reclamado","Indenizado"].includes(h) ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sinistrosVisiveis.map(s => {
                      const ap = apolices.find(a => a.id === s.apolice_id);
                      const sm2 = STATUS_SINISTRO_META[s.status];
                      return (
                        <tr key={s.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                          <td style={{ padding: "10px 14px" }}>{fmtData(s.data_ocorrencia)}</td>
                          <td style={{ padding: "10px 14px" }}>{ap?.numero_apolice ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{ap?.seguradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{s.descricao}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtBRL(s.valor_reclamado)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: s.valor_indenizado > 0 ? "#16A34A" : "var(--text-muted)" }}>{s.valor_indenizado > 0 ? fmtBRL(s.valor_indenizado) : "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{badge(sm2.label, sm2.bg, sm2.cl)}</td>
                          <td style={{ padding: "10px 14px" }}>{ap && <button onClick={() => abrirSinistro(ap, s)} style={{ padding: "3px 8px", border: "0.5px solid var(--border-table)", borderRadius: 5, background: "transparent", cursor: "pointer", fontSize: 11 }}>Abrir</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL APÓLICE
      ══════════════════════════════════════════════════════════════════════ */}
      {modalApolice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 700, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.12)" }}>
            {/* Header */}
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{apoliceEdit ? "Editar Apólice" : "Nova Apólice"}</div>
              <button onClick={() => setModalApolice(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            {/* Abas internas */}
            <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--bg-tag)", padding: "0 22px" }}>
              {(["dados","cobertura","financeiro","anexo"] as const).map(t => (
                <button key={t} onClick={() => setTabModal(t)} style={{ padding: "9px 18px", border: "none", borderBottom: tabModal === t ? "2.5px solid #111" : "2.5px solid transparent", background: "none", cursor: "pointer", fontSize: 12, fontWeight: tabModal === t ? 700 : 400, color: tabModal === t ? "#111" : "#666", marginBottom: -1 }}>
                  {t === "dados" ? "Dados" : t === "cobertura" ? "Cobertura / Bem" : t === "financeiro" ? "Financeiro" : "Anexo"}
                </button>
              ))}
            </div>

            <div style={{ padding: "20px 22px" }}>

              {/* ── ABA DADOS ─────────────────────────────────────────────── */}
              {tabModal === "dados" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div><label style={lbl}>Nº da Apólice *</label><input value={aForm.numero_apolice} onChange={e => setAForm(f => ({ ...f, numero_apolice: e.target.value }))} style={inp} placeholder="000.000.000-0" /></div>
                  <div><label style={lbl}>Seguradora *</label><input value={aForm.seguradora} onChange={e => setAForm(f => ({ ...f, seguradora: e.target.value }))} style={inp} /></div>
                  <div>
                    <label style={lbl}>Ramo *</label>
                    <select value={aForm.ramo} onChange={e => setAForm(f => ({ ...f, ramo: e.target.value as RamoSeguro, bem_id: undefined, bem_tipo: undefined }))} style={inp}>
                      {Object.entries(RAMO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Corretora</label><input value={aForm.corretora} onChange={e => setAForm(f => ({ ...f, corretora: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Contato do Corretor</label><input value={aForm.corretor_contato} onChange={e => setAForm(f => ({ ...f, corretor_contato: e.target.value }))} style={inp} placeholder="(66) 9 9999-9999" /></div>
                  <div>
                    <label style={lbl}>Status</label>
                    <select value={aForm.status} onChange={e => setAForm(f => ({ ...f, status: e.target.value as StatusApolice }))} style={inp}>
                      {Object.entries(STATUS_APOLICE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Início Vigência *</label><input type="date" value={aForm.data_inicio_vigencia} onChange={e => setAForm(f => ({ ...f, data_inicio_vigencia: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Fim Vigência *</label><input type="date" value={aForm.data_fim_vigencia} onChange={e => setAForm(f => ({ ...f, data_fim_vigencia: e.target.value }))} style={inp} /></div>
                  <div></div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={lbl}>Objeto Segurado (descrição livre)</label>
                    <input value={aForm.objeto_segurado} onChange={e => setAForm(f => ({ ...f, objeto_segurado: e.target.value }))} style={inp} placeholder="Deixe em branco para preencher automaticamente pelo bem vinculado" />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={lbl}>Observação</label>
                    <textarea value={aForm.observacao} onChange={e => setAForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                  </div>
                </div>
              )}

              {/* ── ABA COBERTURA / BEM ────────────────────────────────────── */}
              {tabModal === "cobertura" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={sep}>Bem Vinculado</div>

                  {/* Máquinas / Automóvel */}
                  {(aForm.ramo === "maquinas" || aForm.ramo === "automovel") && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Máquina / Veículo</label>
                      <select value={aForm.bem_id ?? ""} onChange={e => setAForm(f => ({ ...f, bem_id: e.target.value || undefined, bem_tipo: e.target.value ? "maquina" : undefined }))} style={inp}>
                        <option value="">— selecione —</option>
                        {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}{m.marca ? ` — ${m.marca}` : ""}{m.modelo ? ` ${m.modelo}` : ""}{m.ano ? ` (${m.ano})` : ""}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Rural / Agrícola */}
                  {aForm.ramo === "rural" && (<>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Fazenda</label>
                      <select value={aForm.bem_id ?? ""} onChange={e => setAForm(f => ({ ...f, bem_id: e.target.value || undefined, bem_tipo: e.target.value ? "fazenda" : undefined }))} style={inp}>
                        <option value="">— selecione —</option>
                        {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}{fz.municipio ? ` — ${fz.municipio}` : ""}</option>)}
                      </select>
                    </div>
                    <div style={sep}>Dados do Seguro Agrícola</div>
                    <div><label style={lbl}>Área Segurada (ha)</label><input type="number" step="0.01" value={aForm.area_ha ?? ""} onChange={e => setAForm(f => ({ ...f, area_ha: parseFloat(e.target.value) || undefined }))} style={inp} placeholder="0,00" /></div>
                    <div>
                      <label style={lbl}>Cultura</label>
                      <select value={aForm.cultura ?? ""} onChange={e => setAForm(f => ({ ...f, cultura: e.target.value }))} style={inp}>
                        <option value="">— selecione —</option>
                        {["Soja","Milho 1ª","Milho 2ª (Safrinha)","Algodão","Sorgo","Trigo","Arroz","Feijão","Girassol","Outra"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Modalidade</label>
                      <select value={aForm.modalidade_seguro ?? ""} onChange={e => setAForm(f => ({ ...f, modalidade_seguro: e.target.value as ModalidadeSeguro || undefined }))} style={inp}>
                        <option value="">— selecione —</option>
                        <option value="proagro">PROAGRO</option>
                        <option value="proagro_mais">PROAGRO Mais</option>
                        <option value="app_privada">Apólice Privada</option>
                      </select>
                    </div>
                    <div><label style={lbl}>Produtividade Garantida (%)</label><input type="number" step="0.1" min="0" max="100" value={aForm.produtividade_garantida_pct ?? ""} onChange={e => setAForm(f => ({ ...f, produtividade_garantida_pct: parseFloat(e.target.value) || undefined }))} style={inp} placeholder="80" /></div>
                    <div><label style={lbl}>Valor de Referência (R$/sc)</label><InputMonetario style={inp} value={aForm.valor_referencia_sc ?? 0} onChange={v => setAForm(f => ({ ...f, valor_referencia_sc: v || undefined }))} /></div>
                  </>)}

                  {/* Vida */}
                  {aForm.ramo === "vida" && (<>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Segurado</label>
                      <select
                        value={aForm.bem_id ? (aForm.bem_tipo === "produtor" ? `p:${aForm.bem_id}` : `f:${aForm.bem_id}`) : ""}
                        onChange={e => {
                          const v = e.target.value;
                          if (!v) { setAForm(f => ({ ...f, bem_id: undefined, bem_tipo: undefined })); return; }
                          const [tipo, id] = v.split(":");
                          setAForm(f => ({ ...f, bem_id: id, bem_tipo: tipo === "p" ? "produtor" : "funcionario" }));
                        }} style={inp}>
                        <option value="">— selecione —</option>
                        <optgroup label="Produtores">{produtores.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}</optgroup>
                        <optgroup label="Funcionários">{funcionarios.map(f => <option key={f.id} value={`f:${f.id}`}>{f.nome}</option>)}</optgroup>
                      </select>
                    </div>
                    <div style={sep}>Coberturas</div>
                    {/* Coberturas listadas */}
                    {(aForm.coberturas_vida ?? []).map((c, i) => (
                      <div key={i} style={{ gridColumn: "1/-1", display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)" }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{c.tipo}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtBRL(c.capital)}</span>
                        <button onClick={() => setAForm(f => ({ ...f, coberturas_vida: (f.coberturas_vida ?? []).filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                    {/* Adicionar cobertura */}
                    <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 180px auto", gap: 8, alignItems: "flex-end" }}>
                      <div>
                        <label style={lbl}>Tipo de Cobertura</label>
                        <select value={novaCobertura.tipo} onChange={e => setNovaCobertura(c => ({ ...c, tipo: e.target.value }))} style={inp}>
                          {["Morte","Invalidez Total e Permanente","Invalidez Parcial","Diária por Incapacidade (DIT)","Doenças Graves","Doenças Profissionais","Assistência Funeral"].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Capital Segurado (R$)</label>
                        <InputMonetario style={inp} value={novaCobertura.capital} onChange={v => setNovaCobertura(c => ({ ...c, capital: v }))} />
                      </div>
                      <button onClick={() => { if (novaCobertura.capital > 0) { setAForm(f => ({ ...f, coberturas_vida: [...(f.coberturas_vida ?? []), { tipo: novaCobertura.tipo, capital: novaCobertura.capital }] })); setNovaCobertura({ tipo: "Morte", capital: 0 }); } }} style={{ ...btnV, padding: "8px 14px", alignSelf: "flex-end" }}>+ Add</button>
                    </div>
                  </>)}

                  {/* Patrimonial */}
                  {aForm.ramo === "patrimonial" && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Descrição do Imóvel / Benfeitoria</label>
                      <input value={aForm.objeto_segurado} onChange={e => setAForm(f => ({ ...f, objeto_segurado: e.target.value }))} style={inp} placeholder="Ex.: Sede da Fazenda — 450 m², galpão principal — 1.200 m²" />
                    </div>
                  )}

                  {/* Outros */}
                  {(aForm.ramo === "responsabilidade_civil" || aForm.ramo === "outro") && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Descrição / Atividade Coberta</label>
                      <input value={aForm.objeto_segurado} onChange={e => setAForm(f => ({ ...f, objeto_segurado: e.target.value }))} style={inp} placeholder="Descreva o objeto ou atividade coberta" />
                    </div>
                  )}

                  <div style={sep}>Valores</div>
                  <div><label style={lbl}>Importância Segurada (R$)</label><InputMonetario style={inp} value={aForm.importancia_segurada} onChange={v => setAForm(f => ({ ...f, importancia_segurada: v }))} /></div>
                </div>
              )}

              {/* ── ABA FINANCEIRO ─────────────────────────────────────────── */}
              {tabModal === "financeiro" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={sep}>Prêmio</div>
                  <div><label style={lbl}>Prêmio Anual (R$) *</label><InputMonetario style={inp} value={aForm.premio_anual} onChange={v => setAForm(f => ({ ...f, premio_anual: v }))} /></div>
                  <div>
                    <label style={lbl}>Forma de Pagamento</label>
                    <select value={aForm.forma_pagamento_premio} onChange={e => setAForm(f => ({ ...f, forma_pagamento_premio: e.target.value as FormaPagamento }))} style={inp}>
                      {Object.entries(FORMA_PAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {/* Preview de parcelas */}
                  {aForm.premio_anual > 0 && aForm.data_inicio_vigencia && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={sep}>Parcelas que serão geradas</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {gerarParcelasPremio(aForm.data_inicio_vigencia, aForm.premio_anual, aForm.forma_pagamento_premio).map((p, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "var(--bg-page)", borderRadius: 6, fontSize: 12 }}>
                            <span style={{ color: "var(--text-2)" }}>Parcela {i + 1} — {fmtData(p.data_vencimento)}</span>
                            <span style={{ fontWeight: 600 }}>{fmtBRL(p.valor)}</span>
                          </div>
                        ))}
                      </div>
                      {apoliceEdit && (
                        <div style={{ fontSize: 11, color: "#C9921B", marginTop: 8, padding: "8px 12px", background: "#FBF3E0", borderRadius: 6 }}>
                          ⚠ Parcelas existentes não são recriadas ao editar uma apólice. Para alterar o cronograma de prêmios, use a aba Prêmios Pendentes.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── ABA ANEXO ─────────────────────────────────────────────── */}
              {tabModal === "anexo" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={sep}>Arquivo da Apólice (PDF)</div>
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  {uploadedUrl || aForm.arquivo_url ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", background: "#E8F5E9", border: "0.5px solid #BBF7D0", borderRadius: 10 }}>
                      <span style={{ fontSize: 22 }}>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A6B3C" }}>Apólice anexada</div>
                        <a href={uploadedUrl ?? aForm.arquivo_url!} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1A4870", textDecoration: "underline" }}>Abrir PDF</a>
                      </div>
                      <button onClick={() => { setUploadedUrl(null); setAForm(f => ({ ...f, arquivo_url: undefined })); if (fileRef.current) fileRef.current.value = ""; }} style={{ background: "none", border: "0.5px solid #E24B4A", borderRadius: 6, color: "#E24B4A", cursor: "pointer", padding: "4px 10px", fontSize: 12 }}>Remover</button>
                    </div>
                  ) : (
                    <div onClick={() => fileRef.current?.click()}
                      style={{ border: "2px dashed var(--border-table)", borderRadius: 10, padding: "32px 20px", textAlign: "center", cursor: uploading ? "default" : "pointer", color: "var(--text-3)", fontSize: 13 }}>
                      {uploading ? "Enviando…" : (<><span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>📎</span>Clique para selecionar o PDF da apólice<br /><span style={{ fontSize: 11 }}>(Somente arquivos .pdf)</span></>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)" }}>
              {aErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{aErr}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnR} onClick={() => setModalApolice(false)}>Cancelar</button>
                <button onClick={salvarApolice} disabled={aSaving} style={{ ...btnV, opacity: aSaving ? 0.6 : 1, cursor: aSaving ? "default" : "pointer" }}>
                  {aSaving ? "Salvando…" : "Salvar Apólice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL SINISTRO
      ══════════════════════════════════════════════════════════════════════ */}
      {modalSinistro && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 560, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{sinistroEdit ? "Editar Sinistro" : "Registrar Sinistro"}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Apólice {modalSinistro.numero_apolice} — {modalSinistro.seguradora}</div>
              </div>
              <button onClick={() => setModalSinistro(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              {sErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{sErr}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Data da Ocorrência</label><input type="date" value={sForm.data_ocorrencia} onChange={e => setSForm(f => ({ ...f, data_ocorrencia: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Data de Comunicação</label><input type="date" value={sForm.data_comunicacao ?? ""} onChange={e => setSForm(f => ({ ...f, data_comunicacao: e.target.value }))} style={inp} /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição</label><textarea value={sForm.descricao} onChange={e => setSForm(f => ({ ...f, descricao: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></div>
                <div><label style={lbl}>Valor Reclamado (R$)</label><InputMonetario style={inp} value={sForm.valor_reclamado} onChange={v => setSForm(f => ({ ...f, valor_reclamado: v }))} /></div>
                <div><label style={lbl}>Valor Indenizado (R$)</label><InputMonetario style={inp} value={sForm.valor_indenizado} onChange={v => setSForm(f => ({ ...f, valor_indenizado: v }))} /></div>
                <div><label style={lbl}>Nº Protocolo</label><input value={sForm.numero_protocolo} onChange={e => setSForm(f => ({ ...f, numero_protocolo: e.target.value }))} style={inp} /></div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={sForm.status} onChange={e => setSForm(f => ({ ...f, status: e.target.value as StatusSinistro }))} style={inp}>
                    {Object.entries(STATUS_SINISTRO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Observação</label><input value={sForm.observacao} onChange={e => setSForm(f => ({ ...f, observacao: e.target.value }))} style={inp} /></div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalSinistro(null)}>Cancelar</button>
              <button onClick={salvarSinistro} disabled={sSaving} style={{ ...btnV, background: sSaving ? "var(--text-muted)" : "#E24B4A", opacity: sSaving ? 0.6 : 1 }}>
                {sSaving ? "Registrando…" : "Salvar Sinistro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL PAGAR PRÊMIO
      ══════════════════════════════════════════════════════════════════════ */}
      {modalPremio && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 360, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Confirmar Pagamento</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Venc. {fmtData(modalPremio.data_vencimento)} — {fmtBRL(modalPremio.valor)}</div>
              </div>
              <button onClick={() => setModalPremio(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <label style={lbl}>Data do Pagamento</label>
              <input type="date" value={premioData} onChange={e => setPremioData(e.target.value)} style={inp} />
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 8, padding: "10px 12px" }}>
                O pagamento será registrado em Contas a Pagar e o lançamento será baixado automaticamente.
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalPremio(null)}>Cancelar</button>
              <button onClick={pagarPremio} disabled={premioSaving} style={{ ...btnV, opacity: premioSaving ? 0.6 : 1 }}>
                {premioSaving ? "Salvando…" : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
