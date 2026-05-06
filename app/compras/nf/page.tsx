"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarNfEntradas, criarNfEntrada, atualizarNfEntrada,
  listarNfEntradaItens, criarNfEntradaItem,
  processarNfEntrada,
  processarDevolucaoCompra,
  listarInsumos,
  criarInsumo,
  listarDepositos,
  listarPessoas,
  listarCentrosCustoGeral,
  listarRegrasClassificacao,
  aplicarRegraClassificacao,
  listarOperacoesGerenciais,
  verificarExclusaoNf,
  excluirNfEntrada,
} from "../../../lib/db";
import type { ItemDevolucao } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import type { NfEntrada, NfEntradaItem, Insumo, Deposito, Pessoa, CentroCusto, RegraClassificacao, OperacaoGerencial } from "../../../lib/supabase";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "18px 20px", marginBottom: 16 };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>;
}

const STATUS_META: Record<string, { bg: string; cl: string; label: string }> = {
  digitando:  { bg: "#FFF3E0", cl: "#7B4A00", label: "Digitando"  },
  pendente:   { bg: "#FBF3E0", cl: "#C9921B", label: "Pendente"   },
  processada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Processada" },
  cancelada:  { bg: "#FCEBEB", cl: "#791F1F", label: "Cancelada"  },
};
const TIPO_META: Record<string, { bg: string; cl: string; label: string }> = {
  consumo:          { bg: "#F3E8FF", cl: "#6B21A8", label: "Consumo"      },
  insumos:          { bg: "#D5E8F5", cl: "#0B2D50", label: "Insumos"      },
  vef:              { bg: "#FAEEDA", cl: "#633806", label: "VEF"           },
  remessa:          { bg: "#E6F1FB", cl: "#0C447C", label: "Remessa"       },
  devolucao_compra: { bg: "#FCEBEB", cl: "#791F1F", label: "Devolução"     },
};
const ORIGEM_META: Record<string, { label: string }> = {
  manual: { label: "Manual"  },
  xml:    { label: "XML"     },
  sieg:   { label: "Sieg"    },
};

// ─────────────────────────────────────────────────────────────
// Tipos locais
// ─────────────────────────────────────────────────────────────
interface ItemRascunho {
  key: string;
  descricao_nf: string;          // como veio na NF
  ncm: string;
  cfop: string;
  unidade_nf: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  // Associação ao catálogo
  insumo_id: string;             // UUID do insumo associado
  fator_conversao: number;       // quantidade_nf × fator = quantidade_catálogo
  // Apropriação
  tipo_apropiacao: NfEntradaItem["tipo_apropiacao"];
  deposito_id: string;
  maquina_id: string;
  centro_custo_id: string;
}

interface PedidoMin { id: string; nr_pedido?: string; fornecedor_id?: string; status: string; }

const ITEM_VAZIO = (): ItemRascunho => ({
  key: crypto.randomUUID(),
  descricao_nf: "", ncm: "", cfop: "", unidade_nf: "UN",
  quantidade: 0, valor_unitario: 0, valor_total: 0,
  insumo_id: "", fator_conversao: 1,
  tipo_apropiacao: "estoque",
  deposito_id: "", maquina_id: "", centro_custo_id: "",
});

type Etapa = "origem" | "cabecalho" | "itens";
type OrigEscolha = "manual" | "xml" | "sieg";
type TipoEntrada = "insumos" | "vef" | "remessa";

const TIPO_LABELS: Record<TipoEntrada, { label: string; desc: string; cor: string }> = {
  insumos:  { label: "Insumos / Estoque",    desc: "Compra que gera entrada no estoque. Associe cada item da NF ao catálogo.",      cor: "#D5E8F5" },
  vef:      { label: "Entrega Futura (VEF)", desc: "Pago agora, produto entregue depois. Gera depósito em nome do fornecedor.",     cor: "#FAEEDA" },
  remessa:  { label: "Remessa / Entrega",    desc: "Entrega de VEF anterior. Debita estoque do fornecedor e credita operacional.",  cor: "#E6F1FB" },
};

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function NfCompraPage() {
  const { fazendaId } = useAuth();

  // Dados mestre
  const [nfs, setNfs]             = useState<NfEntrada[]>([]);
  const [insumos, setInsumos]     = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [pessoas, setPessoas]     = useState<Pessoa[]>([]);
  const [centros, setCentros]     = useState<CentroCusto[]>([]);
  const [pedidos, setPedidos]     = useState<PedidoMin[]>([]);
  const [regrasClass, setRegrasClass] = useState<RegraClassificacao[]>([]);
  const [sugestaoNome, setSugestaoNome] = useState<string | null>(null); // nome da regra aplicada

  // Filtros lista
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [busca,        setBusca]        = useState("");

  // Wizard
  const [wizard,  setWizard]  = useState(false);
  const [etapa,   setEtapa]   = useState<Etapa>("origem");
  const [orig,    setOrig]    = useState<OrigEscolha>("manual");
  const [tipo,    setTipo]    = useState<TipoEntrada>("insumos");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  // Wizard — visão de NF (edição)
  const [nfEdit, setNfEdit] = useState<NfEntrada | null>(null);

  // Modal de Reclassificação (pós-processamento)
  const [modalReclass,    setModalReclass]    = useState<NfEntrada | null>(null);
  const [reclassOps,      setReclassOps]      = useState<OperacaoGerencial[]>([]);
  const [reclassOpId,     setReclassOpId]     = useState("");
  const [reclassCC,       setReclassCC]       = useState("");
  const [reclassSaving,   setReclassSaving]   = useState(false);
  const [reclassErr,      setReclassErr]      = useState("");

  // Modal de Devolução
  interface DevItem extends ItemDevolucao { key: string; qtdOriginal: number; }
  const [devModal,   setDevModal]   = useState(false);
  const [devNfOrig,  setDevNfOrig]  = useState<NfEntrada | null>(null);
  const [devItens,   setDevItens]   = useState<DevItem[]>([]);
  const [devCfop,    setDevCfop]    = useState("5201");
  const [devData,    setDevData]    = useState(new Date().toISOString().split("T")[0]);
  const [devVenc,    setDevVenc]    = useState("");
  const [devObs,     setDevObs]     = useState("");
  const [devSaving,  setDevSaving]  = useState(false);
  const [devErr,     setDevErr]     = useState("");

  // Cabeçalho da NF
  const [cab, setCab] = useState({
    numero: "", serie: "1", chave_acesso: "",
    emitente_nome: "", emitente_cnpj: "",
    pessoa_id: "", cfop: "",
    data_emissao: "", data_entrada: new Date().toISOString().split("T")[0],
    valor_total: "", natureza: "",
    pedido_compra_id: "",
    operacao_gerencial_id: "",  // consumo
    centro_custo_id: "",        // consumo
    data_vencimento_cp: "",
    deposito_destino_id: "",    // remessa
    observacao: "",
    // Contabilidade / LCDPR
    vinculo_atividade: "rural" as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
    entidade_contabil: "pf" as "pf" | "pj",
  });

  // Itens
  const [itens, setItens] = useState<ItemRascunho[]>([ITEM_VAZIO()]);

  // Sieg
  const [siegChave, setSiegChave] = useState("");
  const [siegLoading, setSiegLoading] = useState(false);

  // Modal: exclusão de NF com reversão
  const [modalExcluir, setModalExcluir] = useState<{
    nf: NfEntrada;
    lancamento: { id: string; status: string; lote_id: string | null; conta_bancaria: string | null } | null;
    verificando: boolean;
    excluindo: boolean;
    bloqueado: boolean;  // conciliação feita — não pode excluir
  } | null>(null);

  // Modal: cadastro rápido de insumo dentro do wizard
  const [modalNovoInsumo, setModalNovoInsumo] = useState<{ itemKey: string; nome: string } | null>(null);
  const [formNovoInsumo, setFormNovoInsumo] = useState<{
    nome: string; categoria: Insumo["categoria"]; unidade: Insumo["unidade"];
  }>({ nome: "", categoria: "outros", unidade: "un" });
  const [novoInsumoSaving, setNovoInsumoSaving] = useState(false);
  const [novoInsumoErr,    setNovoInsumoErr]    = useState("");

  // XML ref
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar ────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [nfsData, insData, depData, pesData] = await Promise.all([
      listarNfEntradas(fazendaId),
      listarInsumos(fazendaId),
      listarDepositos(fazendaId),
      listarPessoas(fazendaId),
    ]);
    setNfs(nfsData);
    setInsumos(insData);
    setDepositos(depData);
    setPessoas(pesData);

    // Centros de custo
    try {
      const cc = await listarCentrosCustoGeral(fazendaId);
      setCentros(cc);
    } catch {}

    // Regras de classificação automática
    try {
      const rc = await listarRegrasClassificacao(fazendaId);
      setRegrasClass(rc);
    } catch {}

    // Operações gerenciais (para modal de reclassificação)
    try {
      const ops = await listarOperacoesGerenciais(fazendaId);
      setReclassOps(ops);
    } catch {}

    // Pedidos de compra (rascunho/aprovado)
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, nr_pedido, fornecedor_id, status")
        .eq("fazenda_id", fazendaId)
        .in("status", ["rascunho", "aprovado", "entregue"])
        .order("created_at", { ascending: false });
      setPedidos((data ?? []) as PedidoMin[]);
    } catch {}

  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Helpers ─────────────────────────────────────────────────
  const nomeDeposito = (id: string) => depositos.find(d => d.id === id)?.nome ?? "—";
  const nomeInsumo   = (id: string) => insumos.find(i => i.id === id)?.nome ?? "—";

  // ── Abrir wizard novo ──────────────────────────────────────
  function abrirNovo() {
    setNfEdit(null);
    setEtapa("origem");
    setOrig("manual");
    setTipo("insumos");
    setCab({
      numero: "", serie: "1", chave_acesso: "",
      emitente_nome: "", emitente_cnpj: "",
      pessoa_id: "", cfop: "",
      data_emissao: new Date().toISOString().split("T")[0],
      data_entrada: new Date().toISOString().split("T")[0],
      valor_total: "", natureza: "",
      pedido_compra_id: "",
      operacao_gerencial_id: "",
      centro_custo_id: "",
      data_vencimento_cp: "",
      deposito_destino_id: "",
      observacao: "",
      vinculo_atividade: "rural",
      entidade_contabil: "pf",
    });
    setItens([ITEM_VAZIO()]);
    setErr("");
    setSiegChave("");
    setWizard(true);
  }

  // ── Abrir edição ──────────────────────────────────────────
  async function abrirEditar(nf: NfEntrada) {
    setNfEdit(nf);
    setOrig((nf.origem ?? "manual") as OrigEscolha);
    setTipo((nf.tipo_entrada ?? "insumos") as TipoEntrada);
    setCab({
      numero: nf.numero,
      serie: nf.serie,
      chave_acesso: nf.chave_acesso ?? "",
      emitente_nome: nf.emitente_nome,
      emitente_cnpj: nf.emitente_cnpj ?? "",
      pessoa_id: nf.pessoa_id ?? "",
      cfop: nf.cfop ?? "",
      data_emissao: nf.data_emissao,
      data_entrada: nf.data_entrada ?? new Date().toISOString().split("T")[0],
      valor_total: String(nf.valor_total),
      natureza: nf.natureza ?? "",
      pedido_compra_id: nf.pedido_compra_id ?? "",
      operacao_gerencial_id: nf.operacao_gerencial_id ?? "",
      centro_custo_id: nf.centro_custo_id ?? "",
      data_vencimento_cp: nf.data_vencimento_cp ?? "",
      deposito_destino_id: nf.deposito_destino_id ?? "",
      observacao: nf.observacao ?? "",
      vinculo_atividade: (nf.vinculo_atividade ?? "rural") as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
      entidade_contabil: (nf.entidade_contabil ?? "pf") as "pf" | "pj",
    });
    // Carregar itens existentes
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      if (itensDB.length > 0) {
        setItens(itensDB.map(i => ({
          key: i.id,
          descricao_nf: i.descricao_nf ?? i.descricao_produto,
          ncm: i.ncm ?? "",
          cfop: i.cfop ?? "",
          unidade_nf: i.unidade_nf ?? i.unidade,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          insumo_id: i.insumo_id ?? "",
          fator_conversao: i.fator_conversao ?? 1,
          tipo_apropiacao: i.tipo_apropiacao,
          deposito_id: i.deposito_id ?? "",
          maquina_id: i.maquina_id ?? "",
          centro_custo_id: i.centro_custo_id ?? "",
        })));
      }
    } catch {}
    setEtapa("cabecalho");
    setErr("");
    setWizard(true);
  }

  // ── Parse XML ─────────────────────────────────────────────
  function parsearXml(xmlText: string) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const emit = doc.querySelector("emit");
      const ide  = doc.querySelector("ide");
      const total = doc.querySelector("total ICMSTot, ICMSTot");

      const xNome   = emit?.querySelector("xNome")?.textContent ?? "";
      const cnpj    = emit?.querySelector("CNPJ")?.textContent ?? "";
      const nNF     = ide?.querySelector("nNF")?.textContent   ?? "";
      const serie   = ide?.querySelector("serie")?.textContent ?? "1";
      const dhEmi   = ide?.querySelector("dhEmi")?.textContent ?? "";
      const natOp   = ide?.querySelector("natOp")?.textContent ?? "";
      const vNF     = total?.querySelector("vNF")?.textContent ?? "0";
      const chNFe   = doc.querySelector("chNFe, infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") ?? "";

      // Tenta classificação automática com o CNPJ/nome do emitente
      const regraHeader = aplicarRegraClassificacao(regrasClass, cnpj, xNome, "", "", "");
      setSugestaoNome(regraHeader?.nome ?? null);

      setCab(p => ({
        ...p,
        numero: nNF,
        serie,
        chave_acesso: chNFe,
        emitente_nome: xNome,
        emitente_cnpj: cnpj,
        data_emissao: dhEmi ? dhEmi.substring(0, 10) : p.data_emissao,
        valor_total: vNF,
        natureza: natOp,
        // aplica sugestão apenas se o campo ainda não foi preenchido
        operacao_gerencial_id: regraHeader?.operacao_gerencial_id ?? p.operacao_gerencial_id,
        centro_custo_id:       regraHeader?.centro_custo_id       ?? p.centro_custo_id,
      }));

      // Itens — aplica regra por item (NCM + CFOP + descrição)
      const dets = Array.from(doc.querySelectorAll("det"));
      if (dets.length > 0) {
        setItens(dets.map(det => {
          const prod = det.querySelector("prod");
          const xProd  = prod?.querySelector("xProd")?.textContent  ?? "";
          const NCM    = prod?.querySelector("NCM")?.textContent    ?? "";
          const CFOP   = prod?.querySelector("CFOP")?.textContent   ?? "";
          const uCom   = prod?.querySelector("uCom")?.textContent   ?? "UN";
          const qCom   = parseFloat(prod?.querySelector("qCom")?.textContent  ?? "0");
          const vUnCom = parseFloat(prod?.querySelector("vUnCom")?.textContent ?? "0");
          const vProd  = parseFloat(prod?.querySelector("vProd")?.textContent  ?? "0");
          // tenta regra específica de item; fallback para regra do header
          const regraItem = aplicarRegraClassificacao(regrasClass, cnpj, xNome, NCM, CFOP, xProd) ?? regraHeader;
          return {
            key: crypto.randomUUID(),
            descricao_nf: xProd, ncm: NCM, cfop: CFOP,
            unidade_nf: uCom,
            quantidade: qCom,
            valor_unitario: vUnCom,
            valor_total: vProd,
            insumo_id: "", fator_conversao: 1,
            tipo_apropiacao: "estoque" as NfEntradaItem["tipo_apropiacao"],
            deposito_id: "", maquina_id: "",
            centro_custo_id: regraItem?.centro_custo_id ?? "",
          };
        }));
      }
    } catch (e) {
      setErr("Erro ao processar XML. Verifique o arquivo.");
    }
  }

  // ── Busca Sieg ────────────────────────────────────────────
  async function buscarSieg() {
    if (!siegChave.trim()) return;
    setSiegLoading(true);
    setErr("");
    try {
      // Sieg requer chave de acesso de 44 dígitos
      // Na integração real: POST /api/sieg com a chave
      // Aqui simulamos com a estrutura esperada
      const res = await fetch(`/api/sieg?chave=${siegChave.trim()}`);
      if (!res.ok) throw new Error("NF não encontrada no Sieg");
      const xml = await res.text();
      parsearXml(xml);
      setOrig("sieg");
      setEtapa("cabecalho");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro na consulta Sieg");
    } finally {
      setSiegLoading(false);
    }
  }

  // ── Salvar rascunho (etapa cabeçalho → itens) ────────────
  async function salvarRascunho(): Promise<NfEntrada | null> {
    if (!fazendaId) return null;
    setErr("");
    if (!cab.numero || !cab.emitente_nome || !cab.data_emissao) {
      setErr("Preencha Número, Emitente e Data de Emissão.");
      return null;
    }
    const payload: Omit<NfEntrada, "id" | "created_at"> = {
      fazenda_id:            fazendaId,
      numero:                cab.numero,
      serie:                 cab.serie,
      chave_acesso:          cab.chave_acesso || undefined,
      emitente_nome:         cab.emitente_nome,
      emitente_cnpj:         cab.emitente_cnpj || undefined,
      pessoa_id:             cab.pessoa_id    || undefined,
      cfop:                  cab.cfop         || undefined,
      data_emissao:          cab.data_emissao,
      data_entrada:          cab.data_entrada || undefined,
      valor_total:           parseFloat(cab.valor_total) || 0,
      natureza:              cab.natureza     || undefined,
      status:                "pendente",
      origem:                orig,
      tipo_entrada:          tipo,
      pedido_compra_id:      cab.pedido_compra_id    || undefined,
      operacao_gerencial_id: cab.operacao_gerencial_id || undefined,
      centro_custo_id:       cab.centro_custo_id     || undefined,
      data_vencimento_cp:    cab.data_vencimento_cp  || undefined,
      deposito_destino_id:   cab.deposito_destino_id || undefined,
      observacao:            cab.observacao           || undefined,
      vinculo_atividade:     cab.vinculo_atividade,
      entidade_contabil:     cab.entidade_contabil,
    };
    try {
      let nf: NfEntrada;
      if (nfEdit) {
        await atualizarNfEntrada(nfEdit.id, payload);
        nf = { ...nfEdit, ...payload };
      } else {
        nf = await criarNfEntrada(payload);
      }
      setNfEdit(nf);
      return nf;
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const msg = [err.message, err.details, err.hint].filter(Boolean).join(" | ");
      setErr(msg || JSON.stringify(e));
      return null;
    }
  }

  // ── Processar NF (finalizar) ──────────────────────────────
  async function processarNF() {
    if (!fazendaId || !nfEdit) return;
    setSaving(true);
    setErr("");
    try {
      // 1. Salvar / atualizar itens
      for (const it of itens) {
        if (!it.descricao_nf.trim()) continue;
        const tipoAprp: NfEntradaItem["tipo_apropiacao"] =
          tipo === "vef"     ? "vef"     :
          tipo === "remessa" ? "remessa" : "estoque";

        const itemPayload: Omit<NfEntradaItem, "id" | "created_at"> = {
          nf_entrada_id:    nfEdit.id,
          fazenda_id:       fazendaId,
          insumo_id:        it.insumo_id    || undefined,
          deposito_id:      it.deposito_id  || undefined,
          maquina_id:       it.maquina_id   || undefined,
          descricao_produto: it.insumo_id   ? nomeInsumo(it.insumo_id) : it.descricao_nf,
          descricao_nf:     it.descricao_nf,
          ncm:              it.ncm          || undefined,
          cfop:             it.cfop         || undefined,
          unidade:          it.insumo_id ? (insumos.find(i => i.id === it.insumo_id)?.unidade ?? it.unidade_nf) : it.unidade_nf,
          unidade_nf:       it.unidade_nf,
          fator_conversao:  it.fator_conversao ?? 1,
          quantidade:       it.quantidade * (it.fator_conversao ?? 1),
          valor_unitario:   it.valor_unitario,
          valor_total:      it.valor_total,
          tipo_apropiacao:  tipoAprp,
          centro_custo_id:  it.centro_custo_id || undefined,
          alerta_preco:     false,
        };
        await criarNfEntradaItem(itemPayload);
      }

      // 2. Processar: movimentações de estoque, CP, VEF etc.
      const itensDB = await listarNfEntradaItens(nfEdit.id);
      await processarNfEntrada(
        nfEdit.id,
        fazendaId,
        itensDB,
        nfEdit.valor_total,
        nfEdit.emitente_nome,
        nfEdit.data_entrada ?? nfEdit.data_emissao,
        nfEdit.emitente_cnpj,
      );

      // 3. Marcar como processada
      await atualizarNfEntrada(nfEdit.id, { status: "processada" });

      await carregar();
      setWizard(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao processar NF");
    } finally {
      setSaving(false);
    }
  }

  // ── Excluir NF com reversão ───────────────────────────────
  async function iniciarExclusaoNf(nf: NfEntrada) {
    if (nf.status !== "processada") {
      // NF não processada: exclusão simples, sem reversões
      if (!confirm(`Excluir NF ${nf.numero}? Esta NF ainda não foi processada — nenhuma movimentação será revertida.`)) return;
      try {
        await excluirNfEntrada(nf.id, fazendaId!);
        await carregar();
      } catch (e: unknown) { alert(e instanceof Error ? e.message : "Erro ao excluir"); }
      return;
    }
    // NF processada: verificar lancamento
    setModalExcluir({ nf, lancamento: null, verificando: true, excluindo: false, bloqueado: false });
    try {
      const { lancamento } = await verificarExclusaoNf(nf.id);
      const bloqueado = !!(lancamento?.lote_id);
      setModalExcluir({ nf, lancamento, verificando: false, excluindo: false, bloqueado });
    } catch {
      setModalExcluir(null);
    }
  }

  async function confirmarExclusao() {
    if (!modalExcluir || !fazendaId) return;
    setModalExcluir(p => p ? { ...p, excluindo: true } : null);
    try {
      await excluirNfEntrada(modalExcluir.nf.id, fazendaId);
      setModalExcluir(null);
      await carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir NF");
      setModalExcluir(p => p ? { ...p, excluindo: false } : null);
    }
  }

  // ── Reclassificar NF pós-processamento ───────────────────
  function abrirReclassificar(nf: NfEntrada) {
    setModalReclass(nf);
    setReclassOpId(nf.operacao_gerencial_id ?? "");
    setReclassCC(nf.centro_custo_id ?? "");
    setReclassErr("");
  }

  async function salvarReclassificacao() {
    if (!modalReclass) return;
    setReclassSaving(true);
    setReclassErr("");
    try {
      await atualizarNfEntrada(modalReclass.id, {
        operacao_gerencial_id: reclassOpId || undefined,
        centro_custo_id:       reclassCC   || undefined,
      });
      await carregar();
      setModalReclass(null);
    } catch (e: unknown) {
      setReclassErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setReclassSaving(false);
    }
  }

  // ── Cadastro rápido de insumo dentro do wizard ───────────
  function abrirNovoInsumo(itemKey: string, descricaoNf: string) {
    setFormNovoInsumo({ nome: descricaoNf, categoria: "outros", unidade: "un" });
    setNovoInsumoErr("");
    setModalNovoInsumo({ itemKey, nome: descricaoNf });
  }

  async function salvarNovoInsumo() {
    if (!fazendaId || !formNovoInsumo.nome.trim()) return;
    setNovoInsumoSaving(true);
    setNovoInsumoErr("");
    try {
      const criado = await criarInsumo({
        fazenda_id:      fazendaId,
        tipo:            "produto",
        nome:            formNovoInsumo.nome.trim(),
        categoria:       formNovoInsumo.categoria,
        unidade:         formNovoInsumo.unidade,
        estoque:         0,
        estoque_minimo:  0,
        valor_unitario:  0,
      });
      setInsumos(prev => [...prev, criado]);
      if (modalNovoInsumo) {
        setItem(modalNovoInsumo.itemKey, { insumo_id: criado.id });
      }
      setModalNovoInsumo(null);
    } catch (e: unknown) {
      setNovoInsumoErr(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setNovoInsumoSaving(false);
    }
  }

  // ── Abrir modal de devolução ──────────────────────────────
  async function abrirDevolucao(nf: NfEntrada) {
    setDevNfOrig(nf);
    setDevErr("");
    setDevObs("");
    setDevData(new Date().toISOString().split("T")[0]);
    setDevVenc("");
    // CFOP padrão: 5201 (intraestadual) — ajustável pelo usuário
    setDevCfop("5201");
    // Carrega os itens da NF original
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      const devs: DevItem[] = itensDB
        .filter(i => i.insumo_id && i.tipo_apropiacao === "estoque")
        .map(i => ({
          key:                 i.id,
          insumo_id:           i.insumo_id!,
          descricao_produto:   i.descricao_produto,
          unidade:             i.unidade,
          deposito_id:         i.deposito_id,
          qtdOriginal:         i.quantidade,
          quantidade_devolver: 0,
          valor_unitario:      i.valor_unitario,
          valor_total:         0,
        }));
      setDevItens(devs);
    } catch {
      setDevItens([]);
    }
    setDevModal(true);
  }

  // ── Confirmar devolução ───────────────────────────────────
  async function confirmarDevolucao() {
    if (!fazendaId || !devNfOrig) return;
    const itensParaDevolver = devItens.filter(i => i.quantidade_devolver > 0);
    if (itensParaDevolver.length === 0) {
      setDevErr("Informe a quantidade a devolver em ao menos um item.");
      return;
    }
    for (const i of itensParaDevolver) {
      if (i.quantidade_devolver > i.qtdOriginal) {
        setDevErr(`Quantidade de "${i.descricao_produto}" excede o original (${i.qtdOriginal} ${i.unidade}).`);
        return;
      }
    }
    setDevSaving(true);
    setDevErr("");
    try {
      const numeroNovo = `DEV-${devNfOrig.numero}`;
      await processarDevolucaoCompra(
        fazendaId,
        devNfOrig.id,
        numeroNovo,
        devNfOrig.serie,
        devCfop,
        devNfOrig.emitente_nome,
        devNfOrig.emitente_cnpj,
        devNfOrig.pessoa_id,
        devData,
        devVenc || undefined,
        itensParaDevolver,
      );
      await carregar();
      setDevModal(false);
    } catch (e: unknown) {
      setDevErr(e instanceof Error ? e.message : "Erro ao processar devolução");
    } finally {
      setDevSaving(false);
    }
  }

  // ── Auto-fill emitente quando pessoa selecionada ─────────
  function onPessoaChange(id: string) {
    const p = pessoas.find(x => x.id === id);
    if (p) {
      setCab(prev => ({
        ...prev,
        pessoa_id:     id,
        emitente_nome: p.nome ?? prev.emitente_nome,
        emitente_cnpj: p.cpf_cnpj     ?? prev.emitente_cnpj,
      }));
    } else {
      setCab(prev => ({ ...prev, pessoa_id: id }));
    }
  }

  // ── Atualizar item ─────────────────────────────────────────
  const setItem = (key: string, patch: Partial<ItemRascunho>) => {
    setItens(prev => prev.map(it => {
      if (it.key !== key) return it;
      const updated = { ...it, ...patch };
      if (patch.quantidade !== undefined || patch.valor_unitario !== undefined) {
        updated.valor_total = updated.quantidade * updated.valor_unitario;
      }
      return updated;
    }));
  };

  // ── Auto-fill tipo_apropiacao por tipo de entrada ─────────
  const tipoAprpDefault = (t: TipoEntrada): NfEntradaItem["tipo_apropiacao"] =>
    t === "vef" ? "vef" : t === "remessa" ? "remessa" : "estoque";

  // ── Totais ─────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.valor_total, 0);

  // ── Lista filtrada ────────────────────────────────────────
  const nfsFiltradas = nfs.filter(nf => {
    if (filtroStatus && nf.status !== filtroStatus) return false;
    if (filtroTipo   && nf.tipo_entrada !== filtroTipo) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!nf.numero.includes(busca) && !nf.emitente_nome.toLowerCase().includes(b)) return false;
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ flex: 1, padding: "24px 28px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>NF de Compra</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
              Entradas fiscais — {nfs.length} nota{nfs.length !== 1 ? "s" : ""} · {nfs.filter(n => n.status === "pendente").length} pendente{nfs.filter(n => n.status === "pendente").length !== 1 ? "s" : ""}
            </div>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Nova NF de Compra</button>
        </div>

        {/* ── Cards de resumo ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total no mês",   value: fmtBRL(nfs.filter(n => n.data_emissao?.startsWith(new Date().toISOString().substring(0,7)) && n.status !== "cancelada").reduce((s,n)=>s+n.valor_total,0)), bg: "#fff" },
            { label: "Pendentes",      value: String(nfs.filter(n=>n.status==="pendente").length),   bg: "#FBF3E0" },
            { label: "Processadas",    value: String(nfs.filter(n=>n.status==="processada").length), bg: "#E8F5E9" },
            { label: "Canceladas",     value: String(nfs.filter(n=>n.status==="cancelada").length),  bg: "#FCEBEB" },
          ].map(({ label, value, bg }) => (
            <div key={label} style={{ background: bg, border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Filtros ── */}
        <div style={{ ...card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por nº ou emitente…"
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width: 240 }}
          />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 180 }}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{nfsFiltradas.length} resultado{nfsFiltradas.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Tabela ── */}
        <div style={card}>
          {nfsFiltradas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#888", fontSize: 13 }}>
              Nenhuma NF encontrada. Clique em &ldquo;+ Nova NF de Compra&rdquo; para começar.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F3F6F9" }}>
                  {["Nº / Série", "Emitente", "Emissão", "Entrada", "Tipo", "Origem", "Valor Total", "Status", "Ações"].map((c, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 6 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nfsFiltradas.map(nf => {
                  const sm = STATUS_META[nf.status] ?? STATUS_META["pendente"];
                  const tm = nf.tipo_entrada ? TIPO_META[nf.tipo_entrada] : null;
                  const om = nf.origem ? ORIGEM_META[nf.origem] : null;
                  return (
                    <tr key={nf.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                        {nf.numero}<span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>/{nf.serie}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nf.emitente_nome}
                        {nf.emitente_cnpj && <div style={{ fontSize: 11, color: "#888" }}>{nf.emitente_cnpj}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>{fmtData(nf.data_emissao)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>{fmtData(nf.data_entrada)}</td>
                      <td style={{ padding: "10px 12px" }}>{tm ? badge(tm.label, tm.bg, "#333") : <span style={{ color: "#aaa", fontSize: 12 }}>—</span>}</td>
                      <td style={{ padding: "10px 12px" }}>{om ? badge(om.label) : <span style={{ color: "#aaa", fontSize: 12 }}>—</span>}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{fmtBRL(nf.valor_total)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {nf.status !== "processada" && nf.status !== "cancelada" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#1A5C38", fontWeight: 600 }}>
                              Editar
                            </button>
                          )}
                          {nf.status === "pendente" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A5C38", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Processar
                            </button>
                          )}
                          {nf.status === "processada" && nf.tipo_entrada === "insumos" && (
                            <button onClick={() => abrirDevolucao(nf)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F", fontWeight: 600 }}>
                              Devolver
                            </button>
                          )}
                          {nf.status === "processada" && (
                            <button onClick={() => abrirReclassificar(nf)} style={{ padding: "4px 10px", border: "0.5px solid #C9921B50", borderRadius: 6, background: "#FBF3E0", cursor: "pointer", fontSize: 11, color: "#7B4A00", fontWeight: 600 }}>
                              Reclassificar
                            </button>
                          )}
                          {nf.status !== "cancelada" && (
                            <button onClick={() => iniciarExclusaoNf(nf)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
                              Excluir
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
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 900, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            {/* Cabeçalho modal */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                  {nfEdit ? `NF ${nfEdit.numero}/${nfEdit.serie}` : "Nova NF de Compra"}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {etapa === "origem" ? "Passo 1 — Origem" : etapa === "cabecalho" ? "Passo 2 — Cabeçalho" : "Passo 3 — Itens & Processamento"}
                </div>
              </div>
              {/* Stepper */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(["origem", "cabecalho", "itens"] as Etapa[]).map((e, i) => (
                  <div key={e} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: etapa === e ? "#1A5C38" : etapa > e ? "#D5E8F5" : "#F3F6F9", color: etapa === e ? "#fff" : etapa > e ? "#1A4870" : "#aaa" }}>
                      {i + 1}
                    </div>
                    {i < 2 && <div style={{ width: 20, height: 1, background: "#D4DCE8" }} />}
                  </div>
                ))}
              </div>
              <button onClick={() => setWizard(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "24px" }}>
              {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{err}</div>}

              {/* ─── ETAPA 1: ORIGEM ─────────────────────────── */}
              {etapa === "origem" && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>Como deseja lançar a nota fiscal?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
                    {([
                      { v: "manual", icon: "✏️", title: "Manual",      desc: "Digite os dados diretamente" },
                      { v: "xml",    icon: "📄", title: "XML",         desc: "Importe o arquivo XML da NF-e" },
                      { v: "sieg",   icon: "🔗", title: "Sieg / API",  desc: "Consulte pelo número de chave" },
                    ] as { v: OrigEscolha; icon: string; title: string; desc: string }[]).map(({ v, icon, title, desc }) => (
                      <button
                        key={v}
                        onClick={() => setOrig(v)}
                        style={{ padding: "20px 16px", border: `2px solid ${orig === v ? "#1A5C38" : "#D4DCE8"}`, borderRadius: 12, background: orig === v ? "#E8F5E9" : "#fff", cursor: "pointer", textAlign: "center" }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Upload XML */}
                  {orig === "xml" && (
                    <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <label style={lbl}>Arquivo XML da NF-e</label>
                      <input
                        ref={xmlInputRef} type="file" accept=".xml"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = ev => parsearXml(ev.target?.result as string);
                          reader.readAsText(f);
                        }}
                        style={{ display: "block", fontSize: 13 }}
                      />
                    </div>
                  )}

                  {/* Sieg */}
                  {orig === "sieg" && (
                    <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <label style={lbl}>Chave de Acesso (44 dígitos)</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input
                          value={siegChave} onChange={e => setSiegChave(e.target.value.replace(/\D/g, ""))}
                          placeholder="00000000000000000000000000000000000000000000"
                          maxLength={44} style={{ ...inp, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                        />
                        <button onClick={buscarSieg} disabled={siegLoading} style={{ ...btnV, whiteSpace: "nowrap" }}>
                          {siegLoading ? "Buscando…" : "Consultar"}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                        Integração com Sieg, Arquivei ou qualquer gestor fiscal via API /api/sieg
                      </div>
                    </div>
                  )}

                  {/* Tipo de entrada */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Tipo de entrada</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {(Object.entries(TIPO_LABELS) as [TipoEntrada, typeof TIPO_LABELS[TipoEntrada]][]).map(([v, meta]) => (
                        <button
                          key={v}
                          onClick={() => setTipo(v)}
                          style={{ padding: "14px 16px", border: `2px solid ${tipo === v ? "#1A4870" : "#D4DCE8"}`, borderRadius: 10, background: tipo === v ? meta.cor : "#fff", cursor: "pointer", textAlign: "left" }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{meta.label}</div>
                          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{meta.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                    <button style={btnV} onClick={() => setEtapa("cabecalho")}>Próximo →</button>
                  </div>
                </div>
              )}

              {/* ─── ETAPA 2: CABEÇALHO ──────────────────────── */}
              {etapa === "cabecalho" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Número da NF *</label>
                      <input value={cab.numero} onChange={e => setCab(p=>({...p,numero:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Série</label>
                      <input value={cab.serie} onChange={e => setCab(p=>({...p,serie:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>CFOP</label>
                      <input value={cab.cfop} onChange={e => setCab(p=>({...p,cfop:e.target.value}))} placeholder="1101, 2101…" style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Emitente (Fornecedor) *</label>
                      <select value={cab.pessoa_id} onChange={e => onPessoaChange(e.target.value)} style={inp}>
                        <option value="">Selecionar do cadastro…</option>
                        {pessoas.map(p => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nome do emitente *</label>
                      <input value={cab.emitente_nome} onChange={e => setCab(p=>({...p,emitente_nome:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>CNPJ do Emitente</label>
                      <input
                        value={cab.emitente_cnpj}
                        onChange={e => setCab(p => ({ ...p, emitente_cnpj: e.target.value }))}
                        onBlur={e => {
                          // Classificação automática ao sair do campo CNPJ (entrada manual)
                          const cnpj = e.target.value;
                          const regra = aplicarRegraClassificacao(regrasClass, cnpj, cab.emitente_nome, "", "", "");
                          if (regra) {
                            setSugestaoNome(regra.nome);
                            setCab(p => ({
                              ...p,
                              operacao_gerencial_id: regra.operacao_gerencial_id ?? p.operacao_gerencial_id,
                              centro_custo_id:       regra.centro_custo_id       ?? p.centro_custo_id,
                            }));
                          }
                        }}
                        placeholder="00.000.000/0001-00"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Data de Emissão *</label>
                      <input type="date" value={cab.data_emissao} onChange={e => setCab(p=>({...p,data_emissao:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Data de Entrada</label>
                      <input type="date" value={cab.data_entrada} onChange={e => setCab(p=>({...p,data_entrada:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Valor Total (R$)</label>
                      <input value={cab.valor_total} onChange={e => setCab(p=>({...p,valor_total:e.target.value}))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Natureza da Operação</label>
                      <input value={cab.natureza} onChange={e => setCab(p=>({...p,natureza:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Vinculações e Vencimento</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Pedido de Compra vinculado</label>
                        <select value={cab.pedido_compra_id} onChange={e => setCab(p=>({...p,pedido_compra_id:e.target.value}))} style={inp}>
                          <option value="">Sem pedido vinculado</option>
                          {pedidos.map(p => (
                            <option key={p.id} value={p.id}>{p.nr_pedido ?? p.id.substring(0,8)} — {p.status}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Vencimento da CP</label>
                        <input type="date" value={cab.data_vencimento_cp} onChange={e => setCab(p=>({...p,data_vencimento_cp:e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <label style={{ ...lbl, marginBottom: 0 }}>Centro de Custo (NF)</label>
                          {sugestaoNome && (
                            <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>
                              ✦ Regra: {sugestaoNome}
                            </span>
                          )}
                        </div>
                        <select value={cab.centro_custo_id} onChange={e => { setSugestaoNome(null); setCab(p=>({...p,centro_custo_id:e.target.value})); }} style={inp}>
                          <option value="">Sem centro de custo</option>
                          {centros.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Campos específicos por tipo */}
                  {tipo === "remessa" && (
                    <div style={{ background: "#E6F1FB30", border: "0.5px solid #93C5FD", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0C447C", marginBottom: 10 }}>Remessa — Depósito Operacional de Destino</div>
                      <div>
                        <label style={lbl}>Depósito de destino (onde o insumo será armazenado)</label>
                        <select value={cab.deposito_destino_id} onChange={e => setCab(p=>({...p,deposito_destino_id:e.target.value}))} style={inp}>
                          <option value="">Selecionar depósito…</option>
                          {depositos.filter(d => d.tipo !== "terceiro").map(d => (
                            <option key={d.id} value={d.id}>{d.nome} — {d.tipo}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {tipo === "vef" && (
                    <div style={{ background: "#FAEEDA50", border: "0.5px solid #F6C87A", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#633806", marginBottom: 6 }}>VEF — Entrega Futura</div>
                      <div style={{ fontSize: 12, color: "#7A5A12" }}>
                        Um depósito de terceiro será criado automaticamente em nome do emitente ({cab.emitente_nome || "fornecedor"}).
                        Os itens ficarão com saldo em terceiro até a NF de Remessa/Entrega ser lançada.
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Chave de Acesso NF-e (44 dígitos)</label>
                    <input value={cab.chave_acesso} onChange={e => setCab(p=>({...p,chave_acesso:e.target.value.replace(/\D/g,"")}))} maxLength={44} placeholder="Opcional — para rastreabilidade" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                  </div>

                  {/* ── Classificação Contábil / LCDPR ── */}
                  <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Classificação Contábil / LCDPR
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                      <div>
                        <label style={lbl}>Vínculo de Atividade</label>
                        <select style={inp} value={cab.vinculo_atividade} onChange={e => setCab(p => ({ ...p, vinculo_atividade: e.target.value as typeof cab.vinculo_atividade }))}>
                          <option value="rural">🌱 Atividade Rural (LCDPR)</option>
                          <option value="pessoa_fisica">👤 Pessoa Física (não rural)</option>
                          <option value="investimento">🏗 Investimento / Imobilizado</option>
                          <option value="nao_tributavel">— Não Tributável</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Entidade Contábil</label>
                        <select style={inp} value={cab.entidade_contabil} onChange={e => setCab(p => ({ ...p, entidade_contabil: e.target.value as "pf" | "pj" }))}>
                          <option value="pf">PF — Produtor Rural (CPF)</option>
                          <option value="pj">PJ — Pessoa Jurídica (CNPJ)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Observações</label>
                    <textarea value={cab.observacao} onChange={e => setCab(p=>({...p,observacao:e.target.value}))} rows={2} style={{ ...inp, resize: "vertical" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => setEtapa("origem")}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                      <button style={btnV} onClick={async () => {
                        const nf = await salvarRascunho();
                        if (nf) setEtapa("itens");
                      }}>
                        Próximo: Itens →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── ETAPA 3: ITENS ──────────────────────────── */}
              {etapa === "itens" && (
                <div>
                  {/* Cabeçalho da etapa */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                        {tipo === "insumos" ? "Associação de produtos" :
                         tipo === "vef"     ? "Itens da VEF"           : "Itens da remessa"}
                      </span>
                      {tipo === "insumos" && (
                        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                          Associe cada item da NF ao insumo correspondente no catálogo. Defina o fator de conversão se a unidade diferir.
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setItens(p => [...p, { ...ITEM_VAZIO(), tipo_apropiacao: tipoAprpDefault(tipo) }])}
                      style={{ padding: "6px 14px", border: "0.5px solid #1A5C38", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 12, color: "#1A5C38", fontWeight: 600 }}
                    >
                      + Item
                    </button>
                  </div>

                  {/* Grid de itens */}
                  <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    {/* Cabeçalho */}
                    <div style={{ display: "grid", gridTemplateColumns: tipo === "insumos" ? "2fr 1.5fr 80px 90px 100px 110px 90px 32px" : "2fr 80px 90px 100px 110px 1.5fr 90px 32px", gap: 0, background: "#F3F6F9", borderBottom: "0.5px solid #D4DCE8" }}>
                      {(tipo === "insumos"
                        ? ["Descrição NF", "Insumo Catálogo", "Un. NF", "Qtd NF", "Vl. Unit.", "Vl. Total", "Fator Conv.", ""]
                        : ["Descrição", "Unidade", "Quantidade", "Vl. Unit.", "Vl. Total", "Centro Custo", "Apropriação", ""]
                      ).map((h, i) => (
                        <div key={i} style={{ padding: "7px 10px", fontSize: 10, fontWeight: 600, color: "#555" }}>{h}</div>
                      ))}
                    </div>

                    {/* Linhas */}
                    {itens.map((it) => (
                      <div key={it.key} style={{ display: "grid", gridTemplateColumns: tipo === "insumos" ? "2fr 1.5fr 80px 90px 100px 110px 90px 32px" : "2fr 80px 90px 100px 110px 1.5fr 90px 32px", gap: 0, borderBottom: "0.5px solid #F0F2F7", alignItems: "center" }}>
                        {tipo === "insumos" ? (
                          <>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.descricao_nf} onChange={e => setItem(it.key, { descricao_nf: e.target.value })} placeholder="Descrição na NF" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", display: "flex", gap: 4, alignItems: "center" }}>
                              <select value={it.insumo_id} onChange={e => setItem(it.key, { insumo_id: e.target.value })} style={{ ...inp, fontSize: 12, padding: "5px 8px", flex: 1 }}>
                                <option value="">— não associado —</option>
                                {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                              </select>
                              <button
                                onClick={() => abrirNovoInsumo(it.key, it.descricao_nf)}
                                title="Cadastrar novo produto no catálogo"
                                style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0, fontWeight: 700 }}
                              >+</button>
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.unidade_nf} onChange={e => setItem(it.key, { unidade_nf: e.target.value })} placeholder="UN" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input type="number" value={it.quantidade || ""} onChange={e => setItem(it.key, { quantidade: parseFloat(e.target.value)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input type="number" value={it.valor_unitario || ""} onChange={e => setItem(it.key, { valor_unitario: parseFloat(e.target.value)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                              {fmtBRL(it.valor_total)}
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input
                                type="number" step="0.001"
                                value={it.fator_conversao || 1}
                                onChange={e => setItem(it.key, { fator_conversao: parseFloat(e.target.value)||1 })}
                                title="Fator de conversão: qtd NF × fator = qtd no catálogo"
                                style={{ ...inp, fontSize: 12, padding: "5px 8px" }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.descricao_nf} onChange={e => setItem(it.key, { descricao_nf: e.target.value })} placeholder="Descrição" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.unidade_nf} onChange={e => setItem(it.key, { unidade_nf: e.target.value })} placeholder="UN" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input type="number" value={it.quantidade || ""} onChange={e => setItem(it.key, { quantidade: parseFloat(e.target.value)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input type="number" value={it.valor_unitario || ""} onChange={e => setItem(it.key, { valor_unitario: parseFloat(e.target.value)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                              {fmtBRL(it.valor_total)}
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <select value={it.centro_custo_id} onChange={e => setItem(it.key, { centro_custo_id: e.target.value })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }}>
                                <option value="">—</option>
                                {centros.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>)}
                              </select>
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <select value={it.tipo_apropiacao} onChange={e => setItem(it.key, { tipo_apropiacao: e.target.value as NfEntradaItem["tipo_apropiacao"] })} style={{ ...inp, fontSize: 11, padding: "5px 6px" }}>
                                <option value="direto">Direto</option>
                                <option value="estoque">Estoque</option>
                                <option value="maquinario">Maquinário</option>
                                <option value="terceiro">Terceiro</option>
                                <option value="vef">VEF</option>
                                <option value="remessa">Remessa</option>
                              </select>
                            </div>
                          </>
                        )}
                        <div style={{ padding: "6px 8px", textAlign: "center" }}>
                          {itens.length > 1 && (
                            <button onClick={() => setItens(p => p.filter(x => x.key !== it.key))} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Rodapé totais */}
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px", background: "#F8FAFB", borderTop: "0.5px solid #D4DCE8", gap: 24 }}>
                      <span style={{ fontSize: 12, color: "#555" }}>Cabeçalho NF: <strong>{fmtBRL(parseFloat(cab.valor_total)||0)}</strong></span>
                      <span style={{ fontSize: 12, color: "#555" }}>Total itens: <strong style={{ color: Math.abs(totalItens - (parseFloat(cab.valor_total)||0)) > 0.01 ? "#E24B4A" : "#1A5C38" }}>{fmtBRL(totalItens)}</strong></span>
                    </div>
                  </div>

                  {/* Aviso para depósito/insumo não associado */}
                  {tipo === "insumos" && itens.some(it => !it.insumo_id) && (
                    <div style={{ background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12", marginBottom: 14 }}>
                      ⚠️ Itens sem insumo associado não serão lançados no estoque. Associe ou remova-os antes de processar.
                    </div>
                  )}

                  {/* Resumo do processamento */}
                  <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Resumo do processamento</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      {[
                        { label: "Tipo",              value: TIPO_LABELS[tipo]?.label },
                        { label: "Emitente",          value: cab.emitente_nome || "—" },
                        { label: "Vencimento CP",     value: cab.data_vencimento_cp ? fmtData(cab.data_vencimento_cp) : "Não informado" },
                        { label: "Pedido vinculado",  value: cab.pedido_compra_id ? (pedidos.find(p=>p.id===cab.pedido_compra_id)?.nr_pedido ?? "Sim") : "Não" },
                        { label: "Itens",             value: `${itens.filter(i=>i.descricao_nf.trim()).length} item(s)` },
                        { label: "Valor total",       value: fmtBRL(parseFloat(cab.valor_total)||0) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {tipo === "insumos" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #D4DCE8" }}>
                        <div style={{ fontSize: 11, color: "#555" }}>
                          {itens.filter(i=>i.insumo_id).length} item(s) serão lançados no estoque ·{" "}
                          {itens.filter(i=>!i.insumo_id && i.descricao_nf.trim()).length} item(s) sem associação (ignorados)
                          {depositos.length > 0 && " · Depósito padrão: " + (nomeDeposito(itens.find(i=>i.deposito_id)?.deposito_id ?? "") || "não definido")}
                        </div>
                      </div>
                    )}
                    {tipo === "vef" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #D4DCE8", fontSize: 11, color: "#7A5A12" }}>
                        Um depósito de terceiro será criado automaticamente para {cab.emitente_nome || "o fornecedor"}.
                        Use uma NF de Remessa quando o produto for entregue fisicamente.
                      </div>
                    )}
                    {tipo === "remessa" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #D4DCE8", fontSize: 11, color: "#0C447C" }}>
                        O saldo de terceiro (VEF anterior) será debitado e creditado em: {cab.deposito_destino_id ? nomeDeposito(cab.deposito_destino_id) : "depósito não selecionado"}.
                      </div>
                    )}
                  </div>

                  {/* Depósito padrão para itens sem depósito (insumos) */}
                  {tipo === "insumos" && (
                    <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Depósito padrão para itens sem depósito individual</div>
                      <select
                        onChange={e => {
                          const dep = e.target.value;
                          setItens(p => p.map(it => it.deposito_id ? it : { ...it, deposito_id: dep }));
                        }}
                        style={{ ...inp, maxWidth: 320 }}
                      >
                        <option value="">Não definir padrão</option>
                        {depositos.filter(d => d.tipo !== "terceiro").map(d => (
                          <option key={d.id} value={d.id}>{d.nome} — {d.tipo}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => setEtapa("cabecalho")}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={async () => {
                        // Salvar como pendente sem processar
                        if (nfEdit) {
                          await atualizarNfEntrada(nfEdit.id, { status: "pendente" });
                          await carregar();
                          setWizard(false);
                        }
                      }}>
                        Salvar como Pendente
                      </button>
                      <button
                        style={{ ...btnV, background: saving ? "#ccc" : "#1A5C38" }}
                        onClick={processarNF}
                        disabled={saving}
                      >
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

      {/* ══════════════════════════════════════════════════════
          MODAL DE DEVOLUÇÃO
      ══════════════════════════════════════════════════════ */}
      {devModal && devNfOrig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 780, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            {/* Cabeçalho */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Emitir NF de Devolução de Compra</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  NF de origem: <strong>{devNfOrig.numero}/{devNfOrig.serie}</strong> · {devNfOrig.emitente_nome} · {fmtBRL(devNfOrig.valor_total)}
                </div>
              </div>
              <button onClick={() => setDevModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1, marginLeft: 16 }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {devErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{devErr}</div>
              )}

              {/* Cabeçalho da devolução */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Data de Emissão</label>
                  <input type="date" value={devData} onChange={e => setDevData(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Vencimento da CR</label>
                  <input type="date" value={devVenc} onChange={e => setDevVenc(e.target.value)} placeholder="Opcional" style={inp} />
                </div>
                <div>
                  <label style={lbl}>CFOP</label>
                  <select value={devCfop} onChange={e => setDevCfop(e.target.value)} style={inp}>
                    <option value="5201">5201 — Dev. compra intraestadual</option>
                    <option value="6201">6201 — Dev. compra interestadual</option>
                    <option value="5202">5202 — Dev. compra c/ substituição</option>
                    <option value="6202">6202 — Dev. compra c/ substituição interestadual</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Observações</label>
                  <input value={devObs} onChange={e => setDevObs(e.target.value)} placeholder="Opcional" style={inp} />
                </div>
              </div>

              {/* Info */}
              <div style={{ background: "#FCEBEB20", border: "0.5px solid #FCBCBC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#791F1F", marginBottom: 16 }}>
                Informe a <strong>quantidade a devolver</strong> por item. Apenas itens com quantidade &gt; 0 serão incluídos.
                A devolução irá: <strong>debitar o estoque</strong> + criar uma <strong>Conta a Receber</strong> (fornecedor deve restituir o valor).
              </div>

              {/* Grid de itens */}
              {devItens.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 20px", color: "#888", fontSize: 13 }}>
                  Nenhum item de estoque encontrado na NF de origem.
                </div>
              ) : (
                <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 110px", background: "#F3F6F9", borderBottom: "0.5px solid #D4DCE8" }}>
                    {["Produto", "Unidade", "Qtd Original", "Qtd Devolver", "Valor Devolução"].map((h, i) => (
                      <div key={i} style={{ padding: "7px 12px", fontSize: 10, fontWeight: 600, color: "#555" }}>{h}</div>
                    ))}
                  </div>
                  {devItens.map(it => (
                    <div key={it.key} style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 110px", borderBottom: "0.5px solid #F0F2F7", alignItems: "center" }}>
                      <div style={{ padding: "8px 12px", fontSize: 13, color: "#1a1a1a" }}>{it.descricao_produto}</div>
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "#555" }}>{it.unidade}</div>
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "#888", textAlign: "center" }}>
                        {it.qtdOriginal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <input
                          type="number"
                          min={0}
                          max={it.qtdOriginal}
                          step="0.001"
                          value={it.quantidade_devolver || ""}
                          onChange={e => {
                            const qtd = Math.min(parseFloat(e.target.value) || 0, it.qtdOriginal);
                            setDevItens(prev => prev.map(x =>
                              x.key === it.key
                                ? { ...x, quantidade_devolver: qtd, valor_total: qtd * x.valor_unitario }
                                : x
                            ));
                          }}
                          style={{ ...inp, padding: "5px 8px", fontSize: 12, border: it.quantidade_devolver > 0 ? "0.5px solid #E24B4A" : "0.5px solid #D4DCE8" }}
                        />
                      </div>
                      <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: it.quantidade_devolver > 0 ? "#E24B4A" : "#aaa", textAlign: "right" }}>
                        {it.quantidade_devolver > 0 ? fmtBRL(it.valor_total) : "—"}
                      </div>
                    </div>
                  ))}
                  {/* Rodapé total */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, padding: "10px 16px", background: "#F8FAFB", borderTop: "0.5px solid #D4DCE8" }}>
                    <span style={{ fontSize: 12, color: "#555" }}>
                      Itens selecionados: <strong>{devItens.filter(i => i.quantidade_devolver > 0).length}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: "#555" }}>
                      Total da devolução: <strong style={{ color: "#E24B4A" }}>
                        {fmtBRL(devItens.reduce((s, i) => s + i.valor_total, 0))}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Ações */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnR} onClick={() => setDevModal(false)}>Cancelar</button>
                <button
                  onClick={confirmarDevolucao}
                  disabled={devSaving || devItens.filter(i => i.quantidade_devolver > 0).length === 0}
                  style={{ ...btnV, background: devSaving ? "#ccc" : "#E24B4A", cursor: devSaving ? "default" : "pointer" }}
                >
                  {devSaving ? "Processando…" : "↩ Emitir Devolução"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL RECLASSIFICAÇÃO
      ══════════════════════════════════════════════════════ */}
      {modalReclass && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            {/* Cabeçalho */}
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Reclassificar NF</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  NF {modalReclass.numero}/{modalReclass.serie} — {modalReclass.emitente_nome}
                </div>
                <div style={{ fontSize: 11, color: "#C9921B", marginTop: 4, background: "#FBF3E0", display: "inline-block", padding: "2px 8px", borderRadius: 6 }}>
                  Altera apenas a classificação. Os lançamentos financeiros gerados não são afetados.
                </div>
              </div>
              <button onClick={() => setModalReclass(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1, marginLeft: 12 }}>×</button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              {reclassErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>
                  {reclassErr}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Operação Gerencial */}
                <div>
                  <label style={lbl}>Operação Gerencial</label>
                  <select
                    value={reclassOpId}
                    onChange={e => setReclassOpId(e.target.value)}
                    style={inp}
                  >
                    <option value="">— sem operação —</option>
                    {reclassOps.map(op => (
                      <option key={op.id} value={op.id}>{op.descricao}</option>
                    ))}
                  </select>
                </div>

                {/* Centro de Custo */}
                <div>
                  <label style={lbl}>Centro de Custo</label>
                  <select
                    value={reclassCC}
                    onChange={e => setReclassCC(e.target.value)}
                    style={inp}
                  >
                    <option value="">— sem centro de custo —</option>
                    {centros.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalReclass(null)}>Cancelar</button>
              <button
                onClick={salvarReclassificacao}
                disabled={reclassSaving}
                style={{ ...btnV, background: reclassSaving ? "#aaa" : "#C9921B", cursor: reclassSaving ? "default" : "pointer" }}
              >
                {reclassSaving ? "Salvando…" : "Salvar Reclassificação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Modal: Exclusão de NF ——— */}
      {modalExcluir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget && !modalExcluir.excluindo) setModalExcluir(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>

            {modalExcluir.verificando ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#555", fontSize: 13 }}>
                Verificando conciliações…
              </div>
            ) : modalExcluir.bloqueado ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#791F1F", marginBottom: 8 }}>⛔ Exclusão bloqueada</div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 20, lineHeight: 1.6 }}>
                  A NF <strong>{modalExcluir.nf.numero}</strong> possui um lançamento financeiro que foi incluído em um lote de pagamento (conciliação bancária). Não é possível excluir — desfaça a conciliação primeiro.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Excluir NF de Entrada</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>NF {modalExcluir.nf.numero} — {modalExcluir.nf.emitente_nome}</div>

                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#791F1F", marginBottom: 8 }}>Esta ação irá reverter:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "#555", lineHeight: 1.8 }}>
                    <li>Movimentações de estoque geradas por esta NF</li>
                    <li>Histórico de manutenção de máquinas (se houver)</li>
                    <li>Registros de estoque de terceiros (VEF/remessa)</li>
                    {modalExcluir.lancamento && (
                      <li>
                        Lançamento financeiro (CP) de {modalExcluir.nf.emitente_nome}
                        {modalExcluir.lancamento.status === "baixado" && (
                          <span style={{ marginLeft: 6, background: "#FBF3E0", color: "#7A5200", padding: "1px 7px", borderRadius: 5, fontWeight: 600 }}>
                            ⚠ já baixado — reverterá o pagamento
                          </span>
                        )}
                      </li>
                    )}
                  </ul>
                </div>

                {modalExcluir.lancamento?.status === "baixado" && (
                  <div style={{ background: "#FFF3CD", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5200", marginBottom: 16 }}>
                    ⚠ O lançamento financeiro desta NF já foi marcado como <strong>baixado</strong> (pago). A exclusão irá remover o registro de pagamento e reverter o saldo da conta bancária <strong>{modalExcluir.lancamento.conta_bancaria || "informada"}</strong>.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)} disabled={modalExcluir.excluindo}>Cancelar</button>
                  <button
                    onClick={confirmarExclusao}
                    disabled={modalExcluir.excluindo}
                    style={{ padding: "8px 18px", background: modalExcluir.excluindo ? "#aaa" : "#E24B4A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: modalExcluir.excluindo ? "default" : "pointer", fontSize: 13 }}
                  >
                    {modalExcluir.excluindo ? "Excluindo…" : "Confirmar Exclusão"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ——— Modal: Cadastro Rápido de Insumo ——— */}
      {modalNovoInsumo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setModalNovoInsumo(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Cadastrar produto no catálogo</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
              O produto será criado no catálogo de insumos e já vinculado ao item da NF.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={lbl}>Nome do produto *</label>
                <input
                  style={inp}
                  value={formNovoInsumo.nome}
                  onChange={e => setFormNovoInsumo(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome conforme catálogo interno"
                  autoFocus
                />
                {formNovoInsumo.nome !== modalNovoInsumo.nome && (
                  <button
                    onClick={() => setFormNovoInsumo(p => ({ ...p, nome: modalNovoInsumo.nome }))}
                    style={{ marginTop: 4, fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    ↩ Usar descrição da NF: &quot;{modalNovoInsumo.nome}&quot;
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Categoria *</label>
                  <select style={inp} value={formNovoInsumo.categoria}
                    onChange={e => setFormNovoInsumo(p => ({ ...p, categoria: e.target.value as Insumo["categoria"] }))}>
                    <optgroup label="Insumos agrícolas">
                      <option value="semente">Semente</option>
                      <option value="fertilizante">Fertilizante</option>
                      <option value="defensivo">Defensivo</option>
                      <option value="inoculante">Inoculante</option>
                      <option value="combustivel">Combustível</option>
                      <option value="produto_agricola">Produto agrícola</option>
                    </optgroup>
                    <optgroup label="Produtos gerais">
                      <option value="peca">Peça</option>
                      <option value="material">Material</option>
                      <option value="uso_consumo">Uso e consumo</option>
                      <option value="escritorio">Escritório</option>
                      <option value="outros">Outros</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Unidade de medida *</label>
                  <select style={inp} value={formNovoInsumo.unidade}
                    onChange={e => setFormNovoInsumo(p => ({ ...p, unidade: e.target.value as Insumo["unidade"] }))}>
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="L">Litro (L)</option>
                    <option value="mL">Mililitro (mL)</option>
                    <option value="sc">Saca (sc)</option>
                    <option value="t">Tonelada (t)</option>
                    <option value="m">Metro (m)</option>
                    <option value="m2">Metro² (m²)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="pc">Peça (pc)</option>
                    <option value="par">Par</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
              </div>
            </div>

            {novoInsumoErr && (
              <div style={{ marginTop: 12, background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#791F1F" }}>
                {novoInsumoErr}
              </div>
            )}

            <div style={{ marginTop: 14, background: "#FBF0D8", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ Estoque, estoque mínimo e custo médio podem ser ajustados depois em Cadastros → Insumos.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnR} onClick={() => setModalNovoInsumo(null)}>Cancelar</button>
              <button
                onClick={salvarNovoInsumo}
                disabled={!formNovoInsumo.nome.trim() || novoInsumoSaving}
                style={{ ...btnV, background: !formNovoInsumo.nome.trim() || novoInsumoSaving ? "#aaa" : "#C9921B", cursor: !formNovoInsumo.nome.trim() || novoInsumoSaving ? "default" : "pointer" }}
              >
                {novoInsumoSaving ? "Salvando…" : "◈ Cadastrar e vincular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
