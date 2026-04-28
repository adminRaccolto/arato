"use client";
import React, { useState, useEffect } from "react";
import TopNav from "../../components/TopNav";
import {
  listarContratos, criarContrato, atualizarContrato,
  listarRomaneios, criarRomaneio,
  listarItensContrato, salvarItensContrato,
  listarPessoas, listarProdutores, listarAnosSafra, listarCiclos, listarDepositos, listarFazendas,
} from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import type { Contrato, ContratoItem, Romaneio, Pessoa, Produtor, AnoSafra, Ciclo, Deposito, Fazenda } from "../../lib/supabase";

// ── Tabela fiscal de naturezas de operação ────────────────────────────────────
// Cada natureza carrega: descrição, CFOP intra (5xxx) e inter (6xxx), CST ICMS
// e uma nota fiscal/legal para orientar o usuário.
// O CFOP é auto-preenchido como inter-estadual (padrão MT → outros estados).
// O usuário pode substituir manualmente para intra-estadual quando necessário.
const NATUREZAS_OPERACAO = [
  {
    codigo: "VPE-PF",
    descricao: "Venda de Produção do Estabelecimento — Produtor Rural PF",
    cfop_intra: "5110", cfop_inter: "6101", cst_icms: "090",
    obs: "ICMS Diferido (Dec. MT 4.540/04). Operação padrão do produtor rural pessoa física. Funrural aplicável.",
  },
  {
    codigo: "VPE-PJ",
    descricao: "Venda de Produção do Estabelecimento — Produtor Rural PJ",
    cfop_intra: "5101", cfop_inter: "6101", cst_icms: "090",
    obs: "ICMS Diferido. Produtor rural com CNPJ/PJ. Aplicável a Lucro Presumido ou Produtor Rural PJ.",
  },
  {
    codigo: "VMT",
    descricao: "Venda de Mercadoria Adquirida ou Recebida de Terceiros",
    cfop_intra: "5102", cfop_inter: "6102", cst_icms: "090",
    obs: "Revenda de grão adquirido de outro produtor ou trading. ICMS Diferido.",
  },
  {
    codigo: "RVO",
    descricao: "Remessa para Venda à Ordem",
    cfop_intra: "5119", cfop_inter: "6119", cst_icms: "090",
    obs: "Operação triangular: produto sai do armazém diretamente ao comprador final. NF emitida pelo titular do estoque.",
  },
  {
    codigo: "REF",
    descricao: "Remessa Simbólica — Entrega Futura",
    cfop_intra: "5117", cfop_inter: "6117", cst_icms: "090",
    obs: "Faturamento antecipado. NF simbólica sem movimentação física. Entrega real ocorre depois.",
  },
  {
    codigo: "RAG",
    descricao: "Remessa para Armazém Geral (Depósito)",
    cfop_intra: "5905", cfop_inter: "6905", cst_icms: "090",
    obs: "Depósito em armazém de terceiros (cerealista). Não é venda. Não gera receita nem Funrural.",
  },
  {
    codigo: "TAG",
    descricao: "Retorno de Armazém Geral",
    cfop_intra: "5906", cfop_inter: "6906", cst_icms: "090",
    obs: "Retorno de mercadoria depositada em armazém geral. Natureza espelho da remessa.",
  },
  {
    codigo: "TRF",
    descricao: "Transferência entre Estabelecimentos do Produtor",
    cfop_intra: "5151", cfop_inter: "6151", cst_icms: "090",
    obs: "Transferência entre fazendas/filiais do mesmo CNPJ ou grupo. Não é venda.",
  },
  {
    codigo: "VFE-PF",
    descricao: "Venda com Fim Específico de Exportação — Produtor Rural PF",
    cfop_intra: "5501", cfop_inter: "6501", cst_icms: "090",
    obs: "OPERAÇÃO MAIS COMUM EM MT: produtor vende para trading (Bunge, Cargill, ADM, Amaggi…) que exportará. ICMS suspenso/imune. PIS/COFINS imunes. Funrural incide normalmente. Não exige RE/DU-E do produtor.",
  },
  {
    codigo: "VFE-PJ",
    descricao: "Venda com Fim Específico de Exportação — Produtor Rural PJ",
    cfop_intra: "5501", cfop_inter: "6501", cst_icms: "090",
    obs: "Mesmo que VFE-PF, mas para produtor com CNPJ. ICMS suspenso. PIS/COFINS imunes. Funrural incide. Documento de exportação é responsabilidade da trading compradora.",
  },
  {
    codigo: "VFE-TER",
    descricao: "Venda com Fim Específico de Exportação — Mercadoria de Terceiros",
    cfop_intra: "5502", cfop_inter: "6502", cst_icms: "090",
    obs: "Venda de grão adquirido de terceiros (não produção própria) para trading exportadora. ICMS suspenso.",
  },
  {
    codigo: "EXP",
    descricao: "Exportação Direta pelo Próprio Produtor",
    cfop_intra: "7101", cfop_inter: "7101", cst_icms: "090",
    obs: "Produtor exporta diretamente sem intermediário. Imune de ICMS, PIS, COFINS e Funrural (Art. 149-A CF). Exige Registro de Exportação (RE) e DU-E no SISCOMEX. Caso raro para produtor rural.",
  },
  {
    codigo: "EXP-TER",
    descricao: "Exportação Direta — Mercadoria de Terceiros",
    cfop_intra: "7102", cfop_inter: "7102", cst_icms: "090",
    obs: "Exportação direta de mercadoria adquirida de terceiros. Imune de ICMS, PIS, COFINS. Exige RE e DU-E.",
  },
] as const;

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
  encerrado: { bg: "#D5E8F5", color: "#0B2D50", label: "Encerrado"  },
  cancelado: { bg: "#FCEBEB", color: "#791F1F", label: "Cancelado"  },
}[s] ?? { bg: "#F1EFE8", color: "#555", label: s });

const corProduto = (p: string) => {
  if (p === "Soja")          return { bg: "#D5E8F5", color: "#0B2D50" };
  if (p.startsWith("Milho")) return { bg: "#FAEEDA", color: "#633806" };
  if (p === "Algodão")       return { bg: "#E6F1FB", color: "#0C447C" };
  return { bg: "#F1EFE8", color: "#555" };
};

// ── estilos base ─────────────────────────────────────────────────
const inp: React.CSSProperties = { width:"100%", padding:"7px 9px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", boxSizing:"border-box", outline:"none" };
const lbl: React.CSSProperties = { fontSize:10, color:"#555", marginBottom:3, display:"block" };
const btnV: React.CSSProperties = { padding:"8px 18px", background:"#1A5CB8", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 };
const btnR: React.CSSProperties = { padding:"8px 18px", border:"0.5px solid #D4DCE8", borderRadius:8, background:"transparent", cursor:"pointer", fontSize:13, color:"#1a1a1a" };
const btnX: React.CSSProperties = { padding:"3px 8px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" };
const badge = (t: string, bg="#D5E8F5", c="#0B2D50") => <span style={{ fontSize:10, background:bg, color:c, padding:"2px 7px", borderRadius:8, fontWeight:600 }}>{t}</span>;

// ── item vazio ───────────────────────────────────────────────────
const itemVazio = (): Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id"> => ({
  tipo: "Produto", produto: "Soja", unidade: "sc", quantidade: 0, valor_unitario: 0, valor_total: 0, moeda: "BRL", classificacao: "",
});

type AbaForm = "principal" | "adicionais";
type AbaLista = "contratos" | "expedicao" | "posicao";

// ═══════════════════════════════════════════════════════════════════
export default function Contratos() {
  const { fazendaId } = useAuth();

  // ── dados ────────────────────────────────────────────────────
  const [contratos, setContratos]     = useState<ContratoVM[]>([]);
  const [pessoas, setPessoas]         = useState<Pessoa[]>([]);
  const [produtores, setProdutores]   = useState<Produtor[]>([]);
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [fazendas, setFazendas]       = useState<Fazenda[]>([]);

  // ── UI ───────────────────────────────────────────────────────
  const [abaLista, setAbaLista]       = useState<AbaLista>("contratos");
  const [expandido, setExpandido]     = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState<string|null>(null);
  const [salvando, setSalvando]       = useState(false);

  // ── filtros da lista de contratos ────────────────────────────
  const [filtroAno,    setFiltroAno]    = useState("");
  const [filtroCiclo,  setFiltroCiclo]  = useState("");
  const [ciclosFiltro, setCiclosFiltro] = useState<Ciclo[]>([]);

  // ── modal contrato ───────────────────────────────────────────
  const [modalContrato, setModalContrato] = useState(false);
  const [editContrato, setEditContrato]   = useState<ContratoVM|null>(null);
  const [abaForm, setAbaForm]             = useState<AbaForm>("principal");
  const [itens, setItens]                 = useState<Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id">[]>([itemVazio()]);

  const fContratoVazio = () => ({
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
    terceiro: "",
    deposito_carregamento: "",
    deposito_fiscal: false,
    observacao_interna: "",
    observacao: "",
  });

  const [fC, setFC] = useState(fContratoVazio());

  // ── modal romaneio ───────────────────────────────────────────
  const [modalRomaneio, setModalRomaneio] = useState(false);
  const ROM_VAZIO = () => ({
    contratoId:"", placa:"", pesoBruto:"", tara:"",
    // classificação — campos comuns
    umidade:"", impureza:"", ph:"",
    // avariados — detalhados (somados para gerar avariados_pct)
    ardidos:"", mofados:"", fermentados:"", germinados:"",
    esverdeados:"", quebrados:"", carunchados:"", outros_avariados:"",
    // peso recebido pelo comprador (preenchido após entrega)
    peso_destino:"", sacas_faturadas:"", obs_divergencia:"",
  });
  const [fRom, setFRom] = useState(ROM_VAZIO());

  // ── ciclos: carrega quando safra muda (formulário) ───────────
  useEffect(() => {
    if (!fC.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(fC.ano_safra_id).then(setCiclos).catch(() => setCiclos([]));
  }, [fC.ano_safra_id]);

  // ── ciclos: carrega quando filtro de ano muda ────────────────
  useEffect(() => {
    if (!filtroAno) { setCiclosFiltro([]); setFiltroCiclo(""); return; }
    listarCiclos(filtroAno).then(setCiclosFiltro).catch(() => setCiclosFiltro([]));
  }, [filtroAno]);

  // ── carga ────────────────────────────────────────────────────
  useEffect(() => { if (fazendaId) carregarTudo(); }, [fazendaId]);

  async function carregarTudo() {
    try {
      setLoading(true); setErro(null);
      const [cList, rList, pList, prodList, aList, dList, fList] = await Promise.all([
        listarContratos(fazendaId!),
        listarRomaneios(fazendaId!),
        listarPessoas(fazendaId!),
        listarProdutores(fazendaId!),
        listarAnosSafra(fazendaId!),
        listarDepositos(fazendaId!),
        listarFazendas(fazendaId ?? undefined),
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
    } catch(e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
    finally { setLoading(false); }
  }

  const toggleExpand = (id: string) =>
    setExpandido(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // ── abrir modal ───────────────────────────────────────────────
  const abrirNovo = () => {
    setEditContrato(null);
    const vazio = fContratoVazio();
    if (anosSafra[0]) vazio.safra = anosSafra[0].descricao;
    setFC(vazio);
    setItens([itemVazio()]);
    setAbaForm("principal");
    setModalContrato(true);
  };

  const abrirEditar = async (c: ContratoVM) => {
    setEditContrato(c);
    setFC({
      safra: c.safra ?? "", tipo: c.tipo ?? "venda",
      autorizacao: c.autorizacao ?? "autorizada",
      confirmado: c.confirmado ?? false,
      a_fixar: c.a_fixar ?? false,
      venda_a_ordem: c.venda_a_ordem ?? false,
      data_contrato: c.data_contrato, pessoa_id: c.pessoa_id ?? "",
      produtor_id: c.produtor_id ?? "",
      nr_contrato_cliente: c.nr_contrato_cliente ?? "",
      contato_broker: c.contato_broker ?? "",
      grupo_vendedor: c.grupo_vendedor ?? "",
      vendedor: c.vendedor ?? "",
      produto: c.produto, modalidade: c.modalidade,
      moeda: c.moeda, preco: c.preco, quantidade_sc: c.quantidade_sc,
      data_entrega: c.data_entrega,
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
    });
    try {
      const its = await listarItensContrato(c.id);
      setItens(its.length > 0 ? its.map(i => ({ tipo:i.tipo, produto:i.produto, unidade:i.unidade, quantidade:i.quantidade, valor_unitario:i.valor_unitario, valor_total:i.valor_total, moeda:i.moeda, classificacao:i.classificacao })) : [itemVazio()]);
    } catch { setItens([itemVazio()]); }
    setAbaForm("principal");
    setModalContrato(true);
  };

  // ── calcular totais dos itens ─────────────────────────────────
  const itensCalc = itens.map(i => ({ ...i, valor_total: (i.quantidade||0)*(i.valor_unitario||0) }));
  const valorFinanceiro = itensCalc.reduce((a,i) => a + (i.valor_total??0), 0);
  const valorTotal = valorFinanceiro + (fC.valor_frete||0);

  const atualizarItem = (idx: number, campo: string, valor: string|number) => {
    setItens(prev => prev.map((it,i) => {
      if (i !== idx) return it;
      const upd = { ...it, [campo]: typeof valor === "string" && ["quantidade","valor_unitario"].includes(campo) ? parseFloat(valor)||0 : valor };
      return { ...upd, valor_total: (upd.quantidade||0)*(upd.valor_unitario||0) };
    }));
  };

  // ── salvar contrato ───────────────────────────────────────────
  const salvarContrato = async () => {
    if (!fC.data_entrega) return alert("Informe o prazo de entrega.");
    if (itens.every(i => !i.produto || i.quantidade <= 0)) return alert("Adicione pelo menos um item com quantidade.");
    setSalvando(true);
    try {
      // produto/quantidade principal = primeiro item
      const primeiroItem = itensCalc[0];
      const payload: Omit<Contrato,"id"|"created_at"|"entregue_sc"> = {
        fazenda_id: fazendaId!,
        numero: editContrato?.numero ?? `CTR-${new Date().getFullYear()}/${String(contratos.length+1).padStart(3,"0")}`,
        safra: fC.safra,
        tipo: fC.tipo,
        autorizacao: fC.autorizacao,
        confirmado: fC.confirmado,
        a_fixar: fC.a_fixar,
        venda_a_ordem: fC.venda_a_ordem,
        data_contrato: fC.data_contrato,
        data_entrega: fC.data_entrega,
        pessoa_id: fC.pessoa_id || undefined,
        produtor_id: fC.produtor_id || undefined,
        comprador: pessoas.find(p=>p.id===fC.pessoa_id)?.nome ?? fC.pessoa_id ?? "",
        nr_contrato_cliente: fC.nr_contrato_cliente || undefined,
        contato_broker: fC.contato_broker || undefined,
        grupo_vendedor: fC.grupo_vendedor || undefined,
        vendedor: fC.vendedor || undefined,
        produto: primeiroItem?.produto ?? fC.produto,
        modalidade: fC.modalidade,
        moeda: fC.moeda,
        preco: primeiroItem?.valor_unitario ?? fC.preco,
        quantidade_sc: primeiroItem?.quantidade ?? fC.quantidade_sc,
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
      };
      let salvo: Contrato;
      if (editContrato) {
        await atualizarContrato(editContrato.id, payload);
        salvo = { ...editContrato, ...payload, entregue_sc: editContrato.entregue_sc };
      } else {
        salvo = await criarContrato({ ...payload, entregue_sc: 0 });
      }
      await salvarItensContrato(salvo.id, fazendaId!, itensCalc.filter(i=>i.quantidade>0).map(i=>({
        tipo: i.tipo, produto: i.produto, unidade: i.unidade,
        quantidade: i.quantidade, valor_unitario: i.valor_unitario,
        valor_total: i.valor_total, moeda: i.moeda, classificacao: i.classificacao,
        contrato_id: salvo.id, fazenda_id: fazendaId!,
      })));
      if (editContrato) {
        setContratos(prev => prev.map(c => c.id === salvo.id ? { ...c, ...salvo, itens: itensCalc.filter(i=>i.quantidade>0) as ContratoItem[] } : c));
      } else {
        setContratos(prev => [...prev, { ...salvo, romaneios:[], itens:[] }]);
      }
      setModalContrato(false);
    } catch(e: unknown) { alert("Erro: " + (e instanceof Error ? e.message : e)); }
    finally { setSalvando(false); }
  };

  // ── romaneio — cálculos em tempo real ─────────────────────────
  const contratoSel   = contratos.find(c => c.id === fRom.contratoId);
  const produto_rom   = contratoSel?.produto ?? "Soja";
  const clsComm       = classeCommodity(produto_rom);
  const isSoja        = produto_rom.toLowerCase().startsWith("soja");
  const isMilho       = produto_rom.toLowerCase().startsWith("milho");

  const plCalc        = fRom.pesoBruto && fRom.tara ? Number(fRom.pesoBruto) - Number(fRom.tara) : 0;
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
  const pesoClass = plCalc > 0 ? +(plCalc - descUmid - descImpur - descAvar).toFixed(2) : 0;
  const sacasCalc = pesoClass > 0 ? +(pesoClass / clsComm.kg_saca).toFixed(3) : 0;
  const temClassif = romUmidade > 0 || romImpureza > 0 || romAvariados > 0;

  // Peso recebido pelo comprador
  const pesoDest   = parseFloat(fRom.peso_destino)    || 0;
  const sacasFat   = parseFloat(fRom.sacas_faturadas) || 0;
  const difKg      = pesoDest > 0 && pesoClass > 0 ? +(pesoClass - pesoDest).toFixed(2) : 0;
  const difPct     = pesoClass > 0 && difKg !== 0 ? +(difKg / pesoClass * 100).toFixed(3) : 0;

  const gerarRomaneio = async () => {
    if (!contratoSel || !fRom.placa || plCalc <= 0) return;
    const todosRomaneios = contratos.flatMap(c => c.romaneios);
    setSalvando(true);
    try {
      const criado = await criarRomaneio({
        contrato_id:           contratoSel.id,
        fazenda_id:            fazendaId!,
        numero:                `ROM-${String(todosRomaneios.length+1).padStart(4,"0")}`,
        placa:                 fRom.placa.toUpperCase(),
        peso_bruto_kg:         Number(fRom.pesoBruto),
        tara_kg:               Number(fRom.tara),
        peso_liquido_kg:       plCalc,
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
        sacas:                 sacasCalc,
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
      setContratos(prev => prev.map(c => {
        if (c.id !== contratoSel.id) return c;
        const novoEnt = (c.entregue_sc??0) + sacasCalc;
        const novoSt  = novoEnt >= (c.quantidade_sc??0) ? "encerrado" : "parcial";
        return { ...c, entregue_sc: novoEnt, status: novoSt, romaneios: [...c.romaneios, criado] };
      }));
      setFRom(ROM_VAZIO());
      setModalRomaneio(false);
      setAbaLista("expedicao");
    } catch(e: unknown) { alert("Erro: " + (e instanceof Error ? e.message : e)); }
    finally { setSalvando(false); }
  };

  // ── filtro da lista ───────────────────────────────────────────
  const contratosFiltrados = contratos.filter(c => {
    if (filtroAno    && c.ano_safra_id !== filtroAno)    return false;
    if (filtroCiclo  && c.ciclo_id     !== filtroCiclo)  return false;
    return true;
  });

  // ── métricas ──────────────────────────────────────────────────
  const contratosAtivos = contratos.filter(c => c.status !== "encerrado" && c.status !== "cancelado").length;
  const sojaContratos   = contratos.filter(c => c.produto === "Soja");
  const totalContratado = sojaContratos.reduce((a,c) => a + (c.quantidade_sc??0), 0);
  const totalEntregue   = sojaContratos.reduce((a,c) => a + (c.entregue_sc??0), 0);
  const todosRomaneios  = contratos.flatMap(c => c.romaneios.map(r => ({ ...r, contratoNumero: c.numero, comprador: c.comprador, produto: c.produto })));

  const posicao = PRODUTOS.slice(0,3).map(produto => {
    const csProd = contratos.filter(c => c.produto === produto);
    const contratado = csProd.reduce((a,c) => a + (c.quantidade_sc??0), 0);
    const entregue   = csProd.reduce((a,c) => a + (c.entregue_sc??0), 0);
    return { produto, contratado, entregue, saldo: contratado-entregue, pct: contratado>0 ? Math.round(entregue/contratado*100) : 0 };
  }).filter(p => p.contratado > 0);

  // ── render ────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#F3F6F9", fontFamily:"system-ui, sans-serif", fontSize:13 }}>
      <TopNav />
      <main style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        <header style={{ background:"#fff", borderBottom:"0.5px solid #D4DCE8", padding:"10px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:600, color:"#1a1a1a" }}>Comercialização de Grãos</h1>
            <p style={{ margin:0, fontSize:11, color:"#444" }}>Contratos de venda, fixações, expedição e posição de estoque</p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => { setFRom(ROM_VAZIO()); setModalRomaneio(true); }}
              style={{ background:"#1A5CB8", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
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
              {/* ── Stats ── */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>
                {[
                  { label:"Contratos ativos",          valor: String(contratosAtivos),                         cor:"#C9921B", sub:`de ${contratos.length} contratos totais` },
                  { label:"Soja contratada",            valor: totalContratado>0?`${(totalContratado/1000).toFixed(0)} mil sc`:"—", cor:"#1A4870", sub: totalContratado>0?fmtR$(totalContratado*128.40):"Sem contratos" },
                  { label:"Soja entregue",              valor: totalEntregue>0?`${(totalEntregue/1000).toFixed(0)} mil sc`:"—",   cor:"#1A4870", sub: totalContratado>0?`${Math.round(totalEntregue/(totalContratado||1)*100)}% do contratado`:"" },
                  { label:"Saldo a entregar",           valor: (totalContratado-totalEntregue)>0?`${((totalContratado-totalEntregue)/1000).toFixed(1)} mil sc`:"—", cor: (totalContratado-totalEntregue)>0?"#EF9F27":"#1A4870", sub:"Aguardando expedição" },
                ].map((s,i) => (
                  <div key={i} style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, color:"#555", marginBottom:6 }}>{s.label}</div>
                    <div style={{ fontSize:19, fontWeight:600, color:s.cor, marginBottom:4 }}>{s.valor}</div>
                    <div style={{ fontSize:10, color:"#444" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── Abas ── */}
              <div style={{ display:"flex", background:"#fff", borderRadius:"12px 12px 0 0", border:"0.5px solid #D4DCE8" }}>
                {([
                  { key:"contratos", label:"Contratos",              count: contratos.length },
                  { key:"expedicao", label:"Expedição / Romaneios",  count: todosRomaneios.length },
                  { key:"posicao",   label:"Posição de Estoque",     count: null },
                ] as { key: AbaLista; label: string; count: number|null }[]).map(a => (
                  <button key={a.key} onClick={() => setAbaLista(a.key)} style={{
                    padding:"11px 20px", border:"none", background:"transparent", cursor:"pointer",
                    fontWeight: abaLista===a.key ? 600 : 400, fontSize:13,
                    color: abaLista===a.key ? "#1a1a1a" : "#555",
                    borderBottom: abaLista===a.key ? "2px solid #1A4870" : "2px solid transparent",
                    display:"flex", alignItems:"center", gap:8,
                  }}>
                    {a.label}
                    {a.count !== null && <span style={{ fontSize:10, background: abaLista===a.key?"#D5E8F5":"#DEE5EE", color: abaLista===a.key?"#0B2D50":"#555", padding:"1px 6px", borderRadius:8 }}>{a.count}</span>}
                  </button>
                ))}
              </div>

              {/* ── ABA CONTRATOS ── */}
              {abaLista === "contratos" && (
                <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  {/* barra de filtros */}
                  <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #EEF1F6", background:"#FAFBFD", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <select value={filtroAno} onChange={e => { setFiltroAno(e.target.value); setFiltroCiclo(""); }}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none" }}>
                      <option value="">Todos os anos safra</option>
                      {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                    </select>
                    <select value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)}
                      disabled={!filtroAno || ciclosFiltro.length === 0}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none", opacity: !filtroAno ? 0.5 : 1 }}>
                      <option value="">Todos os ciclos</option>
                      {ciclosFiltro.map(c => <option key={c.id} value={c.id}>{c.cultura}{c.descricao ? ` — ${c.descricao}` : ""}</option>)}
                    </select>
                    {(filtroAno || filtroCiclo) && (
                      <button onClick={() => { setFiltroAno(""); setFiltroCiclo(""); }}
                        style={{ padding:"5px 10px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:11, color:"#555", background:"#fff", cursor:"pointer" }}>
                        Limpar filtros
                      </button>
                    )}
                    <span style={{ marginLeft:"auto", fontSize:11, color:"#888" }}>
                      {contratosFiltrados.length}{filtroAno || filtroCiclo ? ` de ${contratos.length}` : ""} contrato{contratosFiltrados.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {contratosFiltrados.length === 0 ? (
                    <div style={{ padding:32, textAlign:"center", color:"#444", fontSize:12 }}>
                      {contratos.length === 0 ? "Nenhum contrato. Clique em + Novo Contrato para começar." : "Nenhum contrato encontrado para os filtros selecionados."}
                    </div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F3F6F9" }}>
                          {["Contrato","Produtor / Cliente","Produto","Volume","Entregue","Saldo","Preço","Prazo","Status",""].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign: i>=3&&i<=7?"center":"left", fontSize:11, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
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
                              <tr style={{ borderBottom:"0.5px solid #DEE5EE", cursor:"pointer" }} onClick={() => toggleExpand(c.id)}>
                                <td style={{ padding:"10px 12px" }}>
                                  <div style={{ fontWeight:600, fontSize:12, color:"#1a1a1a", display:"flex", alignItems:"center", gap:6 }}>
                                    {c.numero}
                                    {(c as {is_arrendamento?:boolean}).is_arrendamento && (
                                      <span style={{ fontSize:9, background:"#FBF3E0", color:"#7A5A12", padding:"1px 6px", borderRadius:4, fontWeight:600, letterSpacing:"0.3px" }}>ARRENDAMENTO</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize:10, color:"#444" }}>{c.tipo?.toUpperCase() ?? "VENDA"} · Safra {c.safra}</div>
                                </td>
                                <td style={{ padding:"10px 12px", fontSize:12, color:"#1a1a1a", maxWidth:200 }}>
                                  <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.comprador || "—"}</div>
                                </td>
                                <td style={{ padding:"10px 12px" }}>
                                  <span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 8px", borderRadius:8 }}>{c.produto}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color:"#1a1a1a" }}>{(c.quantidade_sc??0).toLocaleString("pt-BR")} sc</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <div style={{ fontWeight:600, color:"#1A4870" }}>{(c.entregue_sc??0).toLocaleString("pt-BR")} sc</div>
                                  <div style={{ height:3, background:"#DEE5EE", borderRadius:2, marginTop:3, width:56, margin:"3px auto 0" }}>
                                    <div style={{ height:"100%", width:`${pct}%`, background: pct===100?"#1A4870":"#EF9F27", borderRadius:2 }} />
                                  </div>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color: ((c.quantidade_sc??0)-(c.entregue_sc??0))>0?"#EF9F27":"#1A4870" }}>
                                  {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:12, whiteSpace:"nowrap", color:"#1a1a1a" }}>
                                  {c.modalidade==="fixo"    && <span style={{ fontWeight:600 }}>{fmtR$(c.preco??0)}/sc</span>}
                                  {c.modalidade==="a_fixar" && <span style={{ color:"#378ADD", fontWeight:600 }}>A fixar</span>}
                                  {c.modalidade==="barter"  && <span style={{ color:"#8B5E14", fontWeight:600 }}>Barter</span>}
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:11, color: c.data_entrega&&new Date(c.data_entrega)<new Date(TODAY)&&c.status!=="encerrado"?"#E24B4A":"#666", whiteSpace:"nowrap" }}>{fmtData(c.data_entrega)}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <span style={{ fontSize:10, background:cs.bg, color:cs.color, padding:"2px 8px", borderRadius:8 }}>{cs.label}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"right" }}>
                                  <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }} onClick={e => e.stopPropagation()}>
                                    <button style={{ padding:"3px 9px", border:"0.5px solid #D4DCE8", borderRadius:5, background:"transparent", cursor:"pointer", fontSize:11, color:"#666" }} onClick={() => abrirEditar(c)}>Editar</button>
                                    <span style={{ color:"#444", fontSize:10, display:"inline-block", transform: exp?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.15s", cursor:"pointer", padding:"4px" }} onClick={() => toggleExpand(c.id)}>▶</span>
                                  </div>
                                </td>
                              </tr>
                              {exp && (
                                <tr key={`${c.id}-exp`}>
                                  <td colSpan={10} style={{ background:"#F8FAFD", padding:0, borderBottom:"0.5px solid #DEE5EE" }}>
                                    <div style={{ padding:"12px 16px" }}>
                                      {/* Itens do contrato */}
                                      {c.itens && c.itens.length > 0 && (
                                        <div style={{ marginBottom:12 }}>
                                          <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:6 }}>Itens do Contrato</div>
                                          <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:8, overflow:"hidden" }}>
                                            <thead>
                                              <tr style={{ background:"#F3F6F9" }}>
                                                {["Tipo","Produto","Qtd","Unid","Vlr Unit.","Vlr Total","Classificação"].map((h,i) => (
                                                  <th key={i} style={{ padding:"6px 10px", textAlign: i>=2?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8" }}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {c.itens.map((it,ii) => (
                                                <tr key={ii} style={{ borderBottom: ii<c.itens.length-1?"0.5px solid #eee":"none" }}>
                                                  <td style={{ padding:"6px 10px", fontSize:11, color:"#555" }}>{it.tipo}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:11, fontWeight:600, color:"#1a1a1a" }}>{it.produto}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{(it.quantidade??0).toLocaleString("pt-BR")}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{it.unidade}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtR$(it.valor_unitario??0)}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#1A4870" }}>{fmtR$(it.valor_total??0)}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:10, color:"#666" }}>{it.classificacao || "—"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                      {/* Romaneios */}
                                      <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:6 }}>Expedição / Romaneios</div>
                                      {c.romaneios.length === 0 ? (
                                        <div style={{ fontSize:11, color:"#888", padding:"8px 0" }}>Nenhum romaneio lançado.</div>
                                      ) : (
                                        <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:8, overflow:"hidden" }}>
                                          <thead>
                                            <tr style={{ background:"#FBF0D8" }}>
                                              {["Romaneio","Data","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e"].map((h,i) => (
                                                <th key={i} style={{ padding:"6px 10px", textAlign: i>=3?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8" }}>{h}</th>
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
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#1A4870" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center" }}>
                                                  {r.nfe_numero ? badge(`✓ ${r.nfe_numero}`) : <span style={{ fontSize:10, background:"#FAEEDA", color:"#633806", padding:"2px 6px", borderRadius:6 }}>⟳ Gerando…</span>}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                        <span style={{ fontSize:11, color:"#555" }}>{c.romaneios.length} romaneio(s) · {(c.entregue_sc??0).toLocaleString("pt-BR")} sc expedidas · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</span>
                                        <button onClick={e => { e.stopPropagation(); setFRom(p=>({...p,contratoId:c.id})); setModalRomaneio(true); }}
                                          style={{ fontSize:11, padding:"5px 12px", border:"0.5px solid #1A4870", borderRadius:6, background:"#D5E8F5", color:"#0B2D50", cursor:"pointer", fontWeight:600 }}>
                                          + Lançar Romaneio
                                        </button>
                                      </div>
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
                <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"0.5px solid #DEE5EE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"#555" }}>{todosRomaneios.length} romaneios · {todosRomaneios.reduce((a,r)=>a+(r.sacas??0),0).toLocaleString("pt-BR")} sc expedidas</span>
                    <button onClick={() => setModalRomaneio(true)} style={{ fontSize:12, padding:"5px 14px", border:"0.5px solid #1A4870", borderRadius:6, background:"#D5E8F5", color:"#0B2D50", cursor:"pointer", fontWeight:600 }}>+ Novo Romaneio</button>
                  </div>
                  {todosRomaneios.length === 0 ? (
                    <div style={{ padding:24, textAlign:"center", color:"#444", fontSize:12 }}>Nenhum romaneio registrado.</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F3F6F9" }}>
                          {["Romaneio","Data","Contrato","Comprador","Produto","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e"].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign:i>=6?"center":"left", fontSize:11, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...todosRomaneios].sort((a,b) => (b.data??"").localeCompare(a.data??"")).map((r,ri,arr) => {
                          const cp = corProduto(r.produto);
                          return (
                            <tr key={ri} style={{ borderBottom: ri<arr.length-1?"0.5px solid #DEE5EE":"none" }}>
                              <td style={{ padding:"9px 12px", fontWeight:600, fontSize:12 }}>{r.numero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, whiteSpace:"nowrap" }}>{fmtData(r.data)}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontWeight:600, color:"#C9921B" }}>{r.contratoNumero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.comprador}</td>
                              <td style={{ padding:"9px 12px" }}><span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 7px", borderRadius:8 }}>{r.produto}</span></td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontFamily:"monospace" }}>{r.placa}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.peso_bruto_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.tara_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11, fontWeight:600 }}>{fmtPeso(r.peso_liquido_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontWeight:600, color:"#1A4870" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center" }}>
                                {r.nfe_numero ? badge(`✓ ${r.nfe_numero}`) : <span style={{ fontSize:10, background:"#FAEEDA", color:"#633806", padding:"2px 6px", borderRadius:6 }}>⟳ Gerando…</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── ABA POSIÇÃO ── */}
              {abaLista === "posicao" && (
                <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", padding:20 }}>
                  {posicao.length === 0 ? (
                    <div style={{ textAlign:"center", color:"#444", fontSize:12, padding:24 }}>Sem contratos para exibir posição.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      {posicao.map((p,pi) => {
                        const cp = corProduto(p.produto);
                        return (
                          <div key={pi} style={{ border:"0.5px solid #D4DCE8", borderRadius:12, overflow:"hidden" }}>
                            <div style={{ padding:"12px 16px", background:cp.bg, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <span style={{ fontWeight:600, fontSize:14, color:cp.color }}>{p.produto}</span>
                              <span style={{ fontWeight:600, fontSize:13, color:cp.color }}>{p.pct}% entregue</span>
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
                              {[
                                { label:"Contratado", valor:p.contratado },
                                { label:"Entregue",   valor:p.entregue },
                                { label:"Saldo",      valor:p.saldo },
                              ].map((col,ci) => (
                                <div key={ci} style={{ padding:"14px 16px", borderRight: ci<2?"0.5px solid #DEE5EE":"none" }}>
                                  <div style={{ fontSize:10, color:"#555", marginBottom:4 }}>{col.label}</div>
                                  <div style={{ fontSize:17, fontWeight:600, color:"#1a1a1a" }}>{col.valor.toLocaleString("pt-BR")}</div>
                                  <div style={{ fontSize:10, color:"#888" }}>sacas</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ padding:"8px 16px", background:"#F3F6F9", borderTop:"0.5px solid #DEE5EE" }}>
                              <div style={{ height:6, background:"#DEE5EE", borderRadius:4, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${p.pct}%`, background: p.pct>80?"#1A4870":p.pct>50?"#EF9F27":"#E24B4A", borderRadius:4 }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MODAL CONTRATO — Principal / Adicionais / Itens
      ═══════════════════════════════════════════════════════════ */}
      {modalContrato && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={e => { if (e.target===e.currentTarget) setModalContrato(false); }}>
          <div style={{ background:"#fff", borderRadius:14, width:980, maxWidth:"97vw", maxHeight:"95vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Cabeçalho do modal */}
            <div style={{ padding:"14px 20px", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:600, fontSize:15, color:"#1a1a1a" }}>{editContrato ? `Editando ${editContrato.numero}` : "Novo Contrato"}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {/* Autorização */}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, color:"#555" }}>Autorização:</span>
                  <select style={{ ...inp, width:"auto", padding:"5px 8px" }} value={fC.autorizacao} onChange={e => setFC(p=>({...p,autorizacao:e.target.value as Contrato["autorizacao"]}))}>
                    <option value="pendente">Pendente</option>
                    <option value="autorizada">Autorizada</option>
                    <option value="recusada">Recusada</option>
                  </select>
                </div>
                <button onClick={() => setModalContrato(false)} style={{ padding:"5px 10px", border:"0.5px solid #D4DCE8", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:12 }}>✕ Fechar</button>
              </div>
            </div>

            {/* Abas Principal / Adicionais */}
            <div style={{ display:"flex", borderBottom:"0.5px solid #D4DCE8", background:"#F8FAFD" }}>
              {(["principal","adicionais"] as AbaForm[]).map(a => (
                <button key={a} onClick={() => setAbaForm(a)} style={{
                  padding:"9px 20px", border:"none", background:"transparent", cursor:"pointer",
                  fontWeight: abaForm===a?600:400, fontSize:13,
                  color: abaForm===a?"#1a1a1a":"#555",
                  borderBottom: abaForm===a?"2px solid #1A4870":"2px solid transparent",
                }}>
                  {a==="principal" ? "Principal" : "Adicionais"}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
              {abaForm === "principal" && (
                <>
                  {/* Linha 1: Nº Lançamento | Nº Contrato | Safra | Tipo Contrato */}
                  <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Nº Lançamento</label>
                      <input style={{ ...inp, background:"#F4F6FA", color:"#888" }} value={editContrato?.num_lancamento ?? "—"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Nº Contrato</label>
                      <input style={{ ...inp, background:"#F4F6FA", color:"#888" }} value={editContrato?.numero ?? "(gerado ao salvar)"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Safra</label>
                      <select style={{ ...inp, color: fC.ano_safra_id ? "#1a1a1a" : "#888" }}
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
                  <div style={{ display:"flex", gap:20, marginBottom:14, padding:"8px 12px", background:"#F4F6FA", borderRadius:8 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                      <input type="checkbox" checked={fC.confirmado} onChange={e => setFC(p=>({...p,confirmado:e.target.checked}))} /> Confirmado
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.a_fixar} onChange={e => setFC(p=>({...p,a_fixar:e.target.checked}))} /> Contrato à fixar
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.venda_a_ordem} onChange={e => setFC(p=>({...p,venda_a_ordem:e.target.checked}))} /> Venda a Ordem
                    </label>
                  </div>

                  {/* Linha 2: Produtor | Cliente | Nr Contrato Cliente | Contato Broker */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Produtor</label>
                      <select style={inp} value={fC.produtor_id} onChange={e => setFC(p=>({...p,produtor_id:e.target.value}))}>
                        <option value="">— selecione —</option>
                        {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Cliente / Comprador</label>
                      <select style={inp} value={fC.pessoa_id} onChange={e => setFC(p=>({...p,pessoa_id:e.target.value}))}>
                        <option value="">— selecione —</option>
                        {pessoas.filter(p => p.cliente).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nr. Contrato Cliente</label>
                      <input style={inp} value={fC.nr_contrato_cliente} onChange={e => setFC(p=>({...p,nr_contrato_cliente:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Contato Broker</label>
                      <input style={inp} value={fC.contato_broker} onChange={e => setFC(p=>({...p,contato_broker:e.target.value}))} />
                    </div>
                  </div>

                  {/* Linha 3: Grupo Vendedor | Vendedor | Prazo Entrega */}
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
                      <input style={inp} type="date" value={fC.data_entrega} onChange={e => setFC(p=>({...p,data_entrega:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Modalidade de Preço</label>
                      <select style={inp} value={fC.modalidade} onChange={e => setFC(p=>({...p,modalidade:e.target.value as Contrato["modalidade"]}))}>
                        <option value="fixo">Fixo (R$/sc)</option>
                        <option value="a_fixar">A fixar / Basis</option>
                        <option value="barter">Barter</option>
                      </select>
                    </div>
                  </div>

                  {/* Linha 4: Natureza de Operação | CFOP | Saldo Contrato | Frete | Valor Frete */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 160px 160px 120px", gap:12, marginBottom:4 }}>
                    <div>
                      <label style={lbl}>Natureza de Operação das Notas Fiscais</label>
                      <select style={inp} value={fC.natureza_codigo}
                        onChange={e => {
                          const nat = NATUREZAS_OPERACAO.find(n => n.codigo === e.target.value);
                          setFC(p=>({
                            ...p,
                            natureza_codigo:   e.target.value,
                            natureza_operacao: nat?.descricao ?? "",
                            cfop:              nat?.cfop_inter ?? p.cfop,
                          }));
                        }}>
                        <option value="">— selecione a natureza —</option>
                        {NATUREZAS_OPERACAO.map(n => (
                          <option key={n.codigo} value={n.codigo}>{n.descricao}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>CFOP <span style={{ color:"#888", fontWeight:400 }}>(auto)</span></label>
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
                      <input style={inp} type="number" step="0.01" value={fC.valor_frete||""} onChange={e => setFC(p=>({...p,valor_frete:parseFloat(e.target.value)||0}))} placeholder="0,00" />
                    </div>
                  </div>

                  {/* Box de informação fiscal — aparece quando natureza selecionada */}
                  {fC.natureza_codigo && (() => {
                    const nat = NATUREZAS_OPERACAO.find(n => n.codigo === fC.natureza_codigo);
                    if (!nat) return null;
                    return (
                      <div style={{ background:"#EBF4FB", border:"0.5px solid #93C5E8", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:11 }}>
                        <div style={{ fontWeight:600, color:"#0B2D50", marginBottom:4 }}>Informação Fiscal — {nat.descricao}</div>
                        <div style={{ display:"flex", gap:24, flexWrap:"wrap", color:"#1A4870" }}>
                          <span>CFOP Inter-Estadual: <strong>{nat.cfop_inter}</strong></span>
                          <span>CFOP Intra-Estadual: <strong>{nat.cfop_intra}</strong></span>
                          <span>CST ICMS: <strong>{nat.cst_icms}</strong></span>
                        </div>
                        <div style={{ color:"#555", marginTop:4 }}>{nat.obs}</div>
                      </div>
                    );
                  })()}

                  {/* ── GRID DE ITENS ── */}
                  <div style={{ border:"0.5px solid #D4DCE8", borderRadius:10, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ padding:"8px 14px", background:"#F3F6F9", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#555" }}>Itens do Contrato</span>
                      <button style={{ fontSize:11, padding:"3px 10px", border:"0.5px solid #1A5CB8", borderRadius:5, background:"#E6F1FB", color:"#1A5CB8", cursor:"pointer" }}
                        onClick={() => setItens(p => [...p, itemVazio()])}>+ Item</button>
                    </div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F8FAFD" }}>
                          {["Tipo","Item / Produto","Quantidade","Unidade","Valor Unitário","Valor Total",""].map((h,i) => (
                            <th key={i} style={{ padding:"6px 10px", textAlign: i>=2&&i<=5?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
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
                                {PRODUTOS.map(pr => <option key={pr}>{pr}</option>)}
                              </select>
                            </td>
                            <td style={{ padding:"6px 8px", width:110 }}>
                              <input style={{ ...inp, textAlign:"right", fontSize:12 }} type="number" min="0" step="1" value={it.quantidade||""} onChange={e => atualizarItem(idx,"quantidade",e.target.value)} placeholder="0" />
                            </td>
                            <td style={{ padding:"6px 8px", width:80 }}>
                              <select style={{ ...inp, fontSize:11 }} value={it.unidade} onChange={e => atualizarItem(idx,"unidade",e.target.value)}>
                                {UNIDADES.map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td style={{ padding:"6px 8px", width:120 }}>
                              <input style={{ ...inp, textAlign:"right", fontSize:12 }} type="number" min="0" step="0.01" value={it.valor_unitario||""} onChange={e => atualizarItem(idx,"valor_unitario",e.target.value)} placeholder="0,00" />
                            </td>
                            <td style={{ padding:"6px 8px", width:130 }}>
                              <input style={{ ...inp, background:"#F4F6FA", textAlign:"right", fontSize:12, fontWeight:600, color:"#1A4870" }} value={(it.valor_total??0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} readOnly />
                            </td>
                            <td style={{ padding:"6px 8px", width:34 }}>
                              {itens.length > 1 && <button style={btnX} onClick={() => setItens(p => p.filter((_,i)=>i!==idx))}>✕</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Rodapé de totais */}
                    <div style={{ padding:"8px 14px", background:"#F3F6F9", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"flex-end", gap:32 }}>
                      <span style={{ fontSize:12, color:"#555" }}>Valor Financeiro: <strong style={{ color:"#1a1a1a" }}>{fmtR$(valorFinanceiro)}</strong></span>
                      <span style={{ fontSize:12, color:"#555" }}>Frete: <strong style={{ color:"#1a1a1a" }}>{fmtR$(fC.valor_frete||0)}</strong></span>
                      <span style={{ fontSize:13, fontWeight:600, color:"#1A4870" }}>Valor Total: {fmtR$(valorTotal)}</span>
                    </div>
                  </div>
                </>
              )}

              {abaForm === "adicionais" && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div>
                      <label style={lbl}>Propriedade <span style={{ color:"#888", fontWeight:400 }}>(fazenda)</span></label>
                      <select style={{ ...inp, color: fC.propriedade ? "#1a1a1a" : "#888" }}
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
                      <label style={lbl}>Empreendimento / Ciclo <span style={{ color:"#888", fontWeight:400 }}>(vinculado à safra selecionada)</span></label>
                      <select style={{ ...inp, color: fC.ciclo_id ? "#1a1a1a" : "#888" }}
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
                      <select style={{ ...inp, color: fC.terceiro ? "#1a1a1a" : "#888" }}
                        value={fC.terceiro} onChange={e => setFC(p=>({...p,terceiro:e.target.value}))}>
                        <option value="">— selecione (opcional) —</option>
                        {pessoas.map(p => <option key={p.id} value={p.nome}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Depósito de Carregamento</label>
                      <select style={{ ...inp, color: fC.deposito_carregamento ? "#1a1a1a" : "#888" }}
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
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs.</label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao} onChange={e => setFC(p=>({...p,observacao:e.target.value}))} />
                    </div>
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs. Contrato <span style={{ color:"#888" }}>(não constam nas notas fiscais)</span></label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao_interna} onChange={e => setFC(p=>({...p,observacao_interna:e.target.value}))} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Rodapé do modal */}
            <div style={{ padding:"12px 20px", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#F8FAFD" }}>
              <div style={{ fontSize:11, color:"#555" }}>
                Valor Financeiro: <strong>{fmtR$(valorFinanceiro)}</strong>
                <span style={{ marginLeft:20 }}>Valor Total: <strong style={{ color:"#1A4870" }}>{fmtR$(valorTotal)}</strong></span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={btnR} onClick={() => setModalContrato(false)}>Cancelar</button>
                <button style={{ ...btnV, opacity: salvando||!fC.data_entrega?0.5:1 }} disabled={salvando||!fC.data_entrega} onClick={salvarContrato}>
                  {salvando ? "Salvando…" : editContrato ? "Salvar Alterações" : "Salvar Contrato"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ROMANEIO ══════════════════════════════════════ */}
      {modalRomaneio && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={e => { if (e.target===e.currentTarget) setModalRomaneio(false); }}>
          <div style={{ background:"#fff", borderRadius:14, padding:26, width:780, maxWidth:"97vw", maxHeight:"95vh", overflowY:"auto" }}>
            <div style={{ fontWeight:600, fontSize:15, color:"#1a1a1a", marginBottom:2 }}>Novo Romaneio de Expedição</div>
            <div style={{ fontSize:12, color:"#555", marginBottom:16 }}>Pesagem + Classificação do grão. NF-e gerada automaticamente.</div>

            {/* Contrato */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Contrato *</label>
              <select style={{ ...inp, fontSize:13 }} value={fRom.contratoId} onChange={e => setFRom(p=>({...p,contratoId:e.target.value}))}>
                <option value="">— selecione —</option>
                {contratos.filter(c=>c.status!=="encerrado"&&c.status!=="cancelado").map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {(c.comprador||"").split(" ")[0]} · {c.produto} · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</option>
                ))}
              </select>
            </div>
            {contratoSel && (
              <div style={{ background:"#D5E8F5", borderRadius:8, padding:"8px 14px", fontSize:11, display:"flex", gap:20, flexWrap:"wrap", marginBottom:14 }}>
                <span>Comprador: <strong>{contratoSel.comprador.split(" ").slice(0,2).join(" ")}</strong></span>
                <span>Produto: <strong>{produto_rom}</strong></span>
                {contratoSel.modalidade==="fixo" && <span>Preço: <strong>{fmtR$(contratoSel.preco??0)}/sc</strong></span>}
                <span>Saldo: <strong>{((contratoSel.quantidade_sc??0)-(contratoSel.entregue_sc??0)).toLocaleString("pt-BR")} sc</strong></span>
              </div>
            )}

            {/* Pesagem */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Placa do caminhão *</label>
                <input style={{ ...inp, textTransform:"uppercase" }} placeholder="ABC-1D23" value={fRom.placa} onChange={e => setFRom(p=>({...p,placa:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Peso bruto (kg) *</label>
                <input style={inp} type="number" placeholder="43800" value={fRom.pesoBruto} onChange={e => setFRom(p=>({...p,pesoBruto:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Tara — caminhão vazio (kg) *</label>
                <input style={inp} type="number" placeholder="17200" value={fRom.tara} onChange={e => setFRom(p=>({...p,tara:e.target.value}))} />
              </div>
            </div>

            {/* Classificação */}
            {plCalc > 0 && (
              <>
                {/* ── Cabeçalho da seção de classificação ── */}
                <div style={{ fontSize:12, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", paddingBottom:6, marginBottom:12 }}>
                  Classificação do Grão
                  <span style={{ marginLeft:10, fontSize:10, fontWeight:400, color:"#888" }}>
                    Padrão {produto_rom}: Umidade {clsComm.umidade_padrao}% · Impureza {clsComm.impureza_padrao}% · Avariados {clsComm.avariados_padrao}%
                  </span>
                </div>

                {/* ── Umidade + Impureza + PH ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <label style={lbl}>Umidade (%)</label>
                    <input style={inp} type="number" step="0.1" min="0" max="40" placeholder={String(clsComm.umidade_padrao)}
                      value={fRom.umidade} onChange={e => setFRom(p=>({...p,umidade:e.target.value}))} />
                    {descUmid > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descUmid)}</div>}
                    {romUmidade > 0 && romUmidade <= clsComm.umidade_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>Impureza / Matérias Estranhas (%)</label>
                    <input style={inp} type="number" step="0.1" min="0" max="20" placeholder={String(clsComm.impureza_padrao)}
                      value={fRom.impureza} onChange={e => setFRom(p=>({...p,impureza:e.target.value}))} />
                    {descImpur > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descImpur)}</div>}
                    {romImpureza > 0 && romImpureza <= clsComm.impureza_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>PH — Peso Hectolítrico (kg/hl)</label>
                    <input style={inp} type="number" step="0.1" min="50" max="100" placeholder={isSoja ? "78" : isMilho ? "74" : "—"}
                      value={fRom.ph} onChange={e => setFRom(p=>({...p,ph:e.target.value}))} />
                    {fRom.ph && <div style={{ fontSize:10, color: parseFloat(fRom.ph) >= (isSoja?78:74) ? "#16A34A" : "#E24B4A", marginTop:2 }}>
                      {parseFloat(fRom.ph) >= (isSoja?78:74) ? "Dentro do padrão ✓" : "Abaixo do mínimo ↓"}
                    </div>}
                  </div>
                </div>

                {/* ── Avariados — detalhamento por commodity ── */}
                <div style={{ background:"#F8F9FC", border:"0.5px solid #DDE2EE", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
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
                          <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>{label}</label>
                          <input style={{ ...inp, fontSize:12, padding:"5px 8px" }} type="number" step="0.1" min="0" max="100"
                            value={fRom[key] as string} onChange={e => setFRom(p=>({...p,[key]:e.target.value}))} />
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
                          <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>{label}</label>
                          <input style={{ ...inp, fontSize:12, padding:"5px 8px" }} type="number" step="0.1" min="0" max="100"
                            value={fRom[key] as string} onChange={e => setFRom(p=>({...p,[key]:e.target.value}))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Apuração ── */}
                <div style={{ background: temClassif&&(descUmid+descImpur+descAvar)>0 ? "#FFF3E0" : "#D5E8F5", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#0B2D50", marginBottom:8 }}>Apuração — Balança de Saída (Fazenda)</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Peso Líquido</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1a1a1a" }}>{fmtPeso(plCalc)}</div>
                    </div>
                    {temClassif && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#555" }}>Descontos (U+I+A)</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#E24B4A" }}>−{fmtPeso(descUmid+descImpur+descAvar)}</div>
                      </div>
                    )}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Peso Classificado</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#0B2D50" }}>{fmtPeso(temClassif?pesoClass:plCalc)}</div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Sacas ({clsComm.kg_saca} kg)</div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#1A4870" }}>{sacasCalc.toLocaleString("pt-BR")} sc</div>
                      {contratoSel?.modalidade==="fixo" && (
                        <div style={{ fontSize:10, color:"#555" }}>{fmtR$(sacasCalc*(contratoSel.preco??0))}</div>
                      )}
                    </div>
                  </div>
                  {!temClassif && <div style={{ fontSize:10, color:"#888", marginTop:6 }}>Preencha a classificação para calcular descontos e peso líquido faturável.</div>}
                  <div style={{ marginTop:6, fontSize:10, color:"#1A4870" }}>NF-e gerada automaticamente após confirmação</div>
                </div>

                {/* ── Peso Recebido / Faturado pelo Comprador ── */}
                <div style={{ background:"#FBF3E0", border:"0.5px solid #F6C87A", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7A5A12", marginBottom:8 }}>
                    Peso Recebido pelo Comprador
                    <span style={{ fontSize:10, fontWeight:400, marginLeft:8, color:"#888" }}>Preencher após receber o ticket de pesagem do destino</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Peso Classificado Destino (kg)</label>
                      <input style={{ ...inp, fontSize:12 }} type="number" step="1" placeholder="Ex: 26480"
                        value={fRom.peso_destino} onChange={e => setFRom(p=>({...p,peso_destino:e.target.value}))} />
                      {pesoDest > 0 && pesoClass > 0 && (
                        <div style={{ fontSize:10, marginTop:2, color: Math.abs(difKg)/pesoClass > 0.005 ? "#E24B4A" : "#16A34A" }}>
                          {difKg > 0 ? `Diferença: −${fmtPeso(difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` :
                           difKg < 0 ? `Acréscimo: +${fmtPeso(-difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` : "Sem divergência ✓"}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Sacas Faturadas na NF Comprador</label>
                      <input style={{ ...inp, fontSize:12 }} type="number" step="0.001" placeholder={String(sacasCalc)}
                        value={fRom.sacas_faturadas} onChange={e => setFRom(p=>({...p,sacas_faturadas:e.target.value}))} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Obs. Divergência</label>
                      <input style={{ ...inp, fontSize:12 }} placeholder="Ex: rejeição por ardidos"
                        value={fRom.obs_divergencia} onChange={e => setFRom(p=>({...p,obs_divergencia:e.target.value}))} />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button style={btnR} onClick={() => { setModalRomaneio(false); setFRom(ROM_VAZIO()); }}>Cancelar</button>
              <button onClick={gerarRomaneio} disabled={salvando||!contratoSel||!fRom.placa||plCalc<=0}
                style={{ ...btnV, opacity: salvando||!contratoSel||!fRom.placa||plCalc<=0?0.5:1 }}>
                {salvando ? "Salvando…" : "Confirmar Pesagem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
