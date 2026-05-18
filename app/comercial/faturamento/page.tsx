"use client";
import React, { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarNotasFiscais, criarNotaFiscal, atualizarStatusNFe,
  listarProdutores, listarPessoas, listarContratos,
} from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { NotaFiscal, Produtor, Pessoa, Contrato, Romaneio } from "../../../lib/supabase";

// ── Naturezas de Operação ──────────────────────────────────────────────────────
const NATUREZAS_VENDA = [
  { codigo: "6.501",    descricao: "Venda com Fim Específico de Exportação — PF (CFOP 6.501)",       obs: "Venda com fim específico de exportação. ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88. Funrural retido pelo adquirente nos termos do art. 25 da Lei 8.212/1991." },
  { codigo: "6.501.PJ", descricao: "Venda com Fim Específico de Exportação — PJ (CFOP 6.501)",       obs: "Venda com fim específico de exportação. ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88." },
  { codigo: "6.101",    descricao: "Venda de Produção — Produtor Rural PF (CFOP 6.101)",              obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação isenta de PIS/COFINS conforme art. 10, inciso VI da Lei 10.925/2004. Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991." },
  { codigo: "6.101.PJ", descricao: "Venda de Produção — Produtor Rural PJ (CFOP 6.101)",             obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação isenta de PIS/COFINS conforme art. 10, inciso VI da Lei 10.925/2004." },
  { codigo: "5.101",    descricao: "Venda de Produção — Operação Interna MT (CFOP 5.101)",            obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação interna no Estado de Mato Grosso. Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991." },
  { codigo: "5.501",    descricao: "Venda com Fim Específico de Exportação — Interna (CFOP 5.501)",   obs: "Venda com fim específico de exportação. Operação interna — ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88." },
  { codigo: "7.101",    descricao: "Exportação Direta pelo Produtor (CFOP 7.101)",                    obs: "Exportação direta. Operação imune de ICMS, PIS, COFINS e Funrural conforme art. 149-A da CF/88 e art. 14 da Lei 11.945/2009." },
  { codigo: "6.905",    descricao: "Remessa para Armazém Geral / Depósito (CFOP 6.905)",              obs: "Remessa para depósito em armazém geral de terceiros. Operação não configura venda. Não incide ICMS, PIS, COFINS nem Funrural." },
  { codigo: "5.905",    descricao: "Remessa para Armazém Geral — Interna (CFOP 5.905)",               obs: "Remessa para depósito em armazém geral no mesmo estado. Operação não configura venda. Não incide ICMS, PIS, COFINS nem Funrural." },
  { codigo: "6.906",    descricao: "Retorno de Armazém Geral (CFOP 6.906)",                           obs: "Retorno de mercadoria depositada em armazém geral. Natureza espelho da remessa. Não incide tributo." },
  { codigo: "5.906",    descricao: "Retorno de Armazém Geral — Interna (CFOP 5.906)",                 obs: "Retorno de mercadoria depositada em armazém geral no mesmo estado." },
  { codigo: "6.117",    descricao: "Remessa Simbólica — Entrega Futura (CFOP 6.117)",                 obs: "Faturamento antecipado. NF simbólica sem movimentação física de mercadoria. ICMS diferido nos termos do Decreto MT nº 4.540/2004." },
  { codigo: "6.119",    descricao: "Remessa para Venda à Ordem (CFOP 6.119)",                         obs: "Venda à ordem — operação triangular. ICMS diferido conforme Decreto MT nº 4.540/2004." },
];
const NATUREZAS_DEVOLUCAO = [
  { codigo: "2.201", descricao: "Devolução de venda de produção — interestadual (CFOP 2.201)", obs: "Devolução de mercadoria originada em venda interestadual. ICMS diferido estornado conforme emissão original. Funrural não incide sobre devolução." },
  { codigo: "1.201", descricao: "Devolução de venda de produção — intraestadual (CFOP 1.201)", obs: "Devolução de mercadoria originada em venda intraestadual. ICMS diferido estornado conforme emissão original." },
  { codigo: "2.202", descricao: "Devolução de mercadoria adquirida — interestadual (CFOP 2.202)", obs: "Devolução de mercadoria adquirida para comercialização. Operação interestadual." },
  { codigo: "1.202", descricao: "Devolução de mercadoria adquirida — intraestadual (CFOP 1.202)", obs: "Devolução de mercadoria adquirida para comercialização. Operação intraestadual." },
];
const NCM_PRODUTO: Record<string, string> = {
  "Soja": "1201.10.00", "Milho 1ª": "1005.10.90", "Milho 2ª (Safrinha)": "1005.10.90",
  "Algodão": "5201.00.20", "Trigo": "1001.99.00", "Sorgo": "1007.90.10", "Feijão": "0713.39.90",
};
// kg por saca de referência para conversão de preço R$/sc → R$/kg
const KG_SACA: Record<string, number> = {
  "Soja": 60, "Milho 1ª": 60, "Milho 2ª (Safrinha)": 60,
  "Sorgo": 60, "Trigo": 60, "Feijão": 60, "Algodão": 15,
};
const kgSaca = (produto: string) => KG_SACA[produto] ?? 60;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type NFeItem = {
  id: string; tipo_item: string; item: string; ncm: string;
  quantidade: string; unidade: string; valor_unitario: string;
  valor_total: number; valor_financeiro: number; cclass_trib: string;
};
type TabNFe = "produtor" | "destinatario" | "operacoes" | "transportador" | "retirada" | "fiscal" | "obs" | "pontualidade";
type Passo  = "origem" | "contrato" | "romaneio" | "form";
type TipoAvulsa = "venda" | "remessa" | "devolucao" | "retorno" | "";

// ── Estado inicial do formulário ───────────────────────────────────────────────
const FVENDA_INICIAL = {
  tipo_nota: "propria" as "propria" | "terceiros", produtor_id: "", safra_id: "",
  destinatario: "", cnpj: "",
  dest_endereco: "", dest_numero: "", dest_cidade: "", dest_uf: "",
  dest_tipo_pessoa: "juridica" as "fisica" | "juridica", dest_ie: "", dest_deposito: false,
  cfop: "6.501", natureza_texto: "", uso_imediato: false, modelo_nf: "55", serie: "1",
  data_emissao: "", data_saida: "", hora_saida: "", dep_op: "",
  nota_livre: false, impressa: false, fiscal: true, enviar_dt_saida: true,
  transp_cadastrada: false, transportadora: "", frete_conta: "1",
  transp_endereco: "", transp_numero: "", transp_cidade: "",
  transp_tipo_pessoa: "juridica" as "fisica" | "juridica", transp_cpf_cnpj: "", transp_ie: "",
  placa: "", uf_placa: "", peso_bruto: "0,00", peso_liquido: "0,00",
  especie: "", marca: "", nr_volume: "", qt_volumes: "0,00",
  local_retirada: "", local_entrega: "",
  nr_guia_icms: "", num_nfp: "", serie_nfp: "", data_nfp: "",
  situacao: "", nota_substituida: "", nota_substituta: "",
  grupo_vendedor: "", comprador: "", data_lancamento: "", propriedade: "",
  empreendimento: "", criterio_rateio: "", obs_manual: "", obs_legal: "",
  observacao: NATUREZAS_VENDA[0].obs,
  ncm: "1201.10.00", unidade: "sc", quantidade: "", valorUnitario: "",
  contrato_numero: "", // referência ao contrato faturado
  romaneio_id:     "", // id do romaneio faturado
  romaneio_numero: "", // nº do romaneio para obs da NF
};

const FRETES = [
  { v: "0", l: "Por conta do Emitente (CIF)" }, { v: "1", l: "Por conta do Destinatário (FOB)" },
  { v: "2", l: "Por conta de Terceiros" },       { v: "9", l: "Sem frete" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtData  = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtR$    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const aplicarMascara = (raw: string) => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

const corStatus = (s: string) => (({
  autorizada:   { bg: "#D5E8F5", color: "#0B2D50", label: "Autorizada",   icone: "✓" },
  rejeitada:    { bg: "#FCEBEB", color: "#791F1F", label: "Rejeitada",    icone: "✗" },
  em_digitacao: { bg: "#FAEEDA", color: "#633806", label: "Processando…", icone: "⟳" },
  cancelada:    { bg: "#F1EFE8", color: "#666",    label: "Cancelada",    icone: "○" },
  denegada:     { bg: "#FCEBEB", color: "#791F1F", label: "Denegada",     icone: "✗" },
} as Record<string, {bg:string;color:string;label:string;icone:string}>)[s] ?? { bg:"#F1EFE8", color:"#666", label:s, icone:"·" });

// ── Estilos base ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width:"100%", padding:"7px 9px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", boxSizing:"border-box", outline:"none" };
const lbl: React.CSSProperties = { fontSize:10, color:"#555", marginBottom:3, display:"block" };
const btnV: React.CSSProperties = { padding:"8px 18px", background:"#1A5CB8", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 };
const btnR: React.CSSProperties = { padding:"8px 18px", border:"0.5px solid #D4DCE8", borderRadius:8, background:"transparent", cursor:"pointer", fontSize:13 };

// ═══════════════════════════════════════════════════════════════════════════════
export default function Faturamento() {
  const { fazendaId } = useAuth();

  const [notas,     setNotas]     = useState<NotaFiscal[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [produtores,setProdutores]= useState<Produtor[]>([]);
  const [pessoas,   setPessoas]   = useState<Pessoa[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filtroAba, setFiltroAba] = useState<"todas"|"processando"|"autorizadas"|"rejeitadas"|"canceladas">("todas");
  const [buscaNota, setBuscaNota] = useState("");

  // ── Modal de emissão ─────────────────────────────────────────────────────
  const [modalAberto,         setModalAberto]         = useState(false);
  const [passo,                setPasso]               = useState<Passo>("origem");
  const [tipoAvulsa,           setTipoAvulsa]          = useState<TipoAvulsa>("");
  const [buscaContrato,        setBuscaContrato]       = useState("");
  const [contratoSelecionado,  setContratoSelecionado] = useState<Contrato | null>(null);
  const [romaneios,            setRomaneios]           = useState<Romaneio[]>([]);
  const [tabNFe,       setTabNFe]      = useState<TabNFe>("produtor");
  const [fVenda,       setFVenda]      = useState(() => ({
    ...FVENDA_INICIAL,
    data_emissao: new Date().toISOString().slice(0, 10),
    data_saida:   new Date().toISOString().slice(0, 10),
    hora_saida:   new Date().toTimeString().slice(0, 8),
  }));
  const fv = (k: Partial<typeof FVENDA_INICIAL>) => setFVenda(p => ({ ...p, ...k }));
  const [nfeItens,    setNfeItens]    = useState<NFeItem[]>([]);
  const [emitindo,    setEmitindo]    = useState(false);
  const [erroForm,    setErroForm]    = useState<string|null>(null);
  const [notaVer,     setNotaVer]     = useState<NotaFiscal | null>(null);
  const [anosSafra,   setAnosSafra]   = useState<{id:string;descricao:string}[]>([]);

  // totais em tempo real
  const totalItens     = nfeItens.reduce((s, i) => s + i.valor_total, 0);
  const totalFinanceiro= nfeItens.reduce((s, i) => s + i.valor_financeiro, 0);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      listarNotasFiscais(fazendaId),
      listarProdutores(fazendaId),
      listarPessoas(fazendaId),
      listarContratos(fazendaId),
      supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", fazendaId).order("descricao", { ascending: false }),
    ]).then(([n, p, pe, c, as_]) => {
      setNotas(n);
      setProdutores(p);
      setPessoas(pe);
      setContratos(c.filter(c => c.tipo === "venda" || !c.tipo));
      setAnosSafra(as_.data ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [fazendaId]);

  // ── Abrir modal ───────────────────────────────────────────────────────────
  function abrirModal() {
    const hoje  = new Date().toISOString().slice(0, 10);
    const agora = new Date().toTimeString().slice(0, 8);
    setFVenda({ ...FVENDA_INICIAL, data_emissao: hoje, data_saida: hoje, hora_saida: agora });
    setNfeItens([]);
    setTabNFe("produtor");
    setPasso("origem");
    setTipoAvulsa("");
    setBuscaContrato("");
    setContratoSelecionado(null);
    setRomaneios([]);
    setErroForm(null);
    setModalAberto(true);
  }

  // ── Selecionar contrato → carrega romaneios e vai ao passo romaneio ─────────
  async function selecionarContrato(contrato: Contrato) {
    setContratoSelecionado(contrato);
    // Carrega romaneios deste contrato
    const { data } = await supabase
      .from("romaneios")
      .select("*")
      .eq("contrato_id", contrato.id)
      .order("data", { ascending: false });
    setRomaneios(data ?? []);
    setPasso("romaneio");
  }

  // ── Pré-preencher de contrato + romaneio (em kg) ──────────────────────────
  function preencherDeRomaneio(romaneio: Romaneio) {
    const contrato = contratoSelecionado!;
    const comprador = pessoas.find(p => p.id === contrato.pessoa_id);
    const cfopRaw  = contrato.cfop ?? "6.501";
    const cfopNorm = cfopRaw.includes(".") ? cfopRaw : cfopRaw.replace(/^(\d)(\d{3})$/, "$1.$2");
    const nat = NATUREZAS_VENDA.find(n => n.codigo.replace(/\./g,"").slice(0,4) === cfopNorm.replace(/\./g,"").slice(0,4));

    // Peso classificado (após descontos) é o peso a faturar em kg
    const pesoKg     = romaneio.peso_classificado_kg ?? romaneio.peso_liquido_kg ?? 0;
    // Preço do contrato já está em R$/kg — usar diretamente
    const precoKg    = contrato.preco ?? 0;
    const valorTotal = +(pesoKg * precoKg).toFixed(2);

    const hoje  = new Date().toISOString().slice(0, 10);
    const agora = new Date().toTimeString().slice(0, 8);

    setFVenda({
      ...FVENDA_INICIAL,
      tipo_nota:       "propria",
      produtor_id:     contrato.produtor_id ?? "",
      safra_id:        contrato.ano_safra_id ?? "",
      destinatario:    comprador?.nome ?? contrato.comprador ?? "",
      cnpj:            comprador?.cpf_cnpj ?? "",
      dest_tipo_pessoa: comprador?.tipo === "pf" ? "fisica" : "juridica",
      dest_ie:         comprador?.inscricao_est ?? "",
      dest_endereco:   comprador?.logradouro ?? "",
      dest_numero:     comprador?.numero ?? "",
      dest_cidade:     comprador?.municipio ?? "",
      dest_uf:         comprador?.estado ?? "",
      cfop:            cfopNorm,
      natureza_texto:  contrato.natureza_operacao ?? nat?.descricao ?? "",
      observacao:      nat?.obs ?? contrato.observacao ?? "",
      grupo_vendedor:  contrato.grupo_vendedor ?? "",
      comprador:       comprador?.nome ?? contrato.comprador ?? "",
      propriedade:     contrato.propriedade ?? "",
      // Transportador — vem do romaneio
      placa:           romaneio.placa ?? "",
      peso_bruto:      aplicarMascara(String(Math.round((romaneio.peso_bruto_kg ?? 0) * 100))),
      peso_liquido:    aplicarMascara(String(Math.round(pesoKg * 100))),
      especie:         "Granel",
      data_emissao:    hoje,
      data_saida:      hoje,
      hora_saida:      agora,
      contrato_numero: contrato.numero ?? "",
      romaneio_id:     romaneio.id,
      romaneio_numero: romaneio.numero ?? "",
    });

    // Item único em kg — peso classificado após descontos
    // precoKg pode ter 3-4 casas decimais (ex: R$0,013/kg para milho R$0,78/sc÷60kg)
    // não usar aplicarMascara (trunca para 2 casas) — formatar diretamente com 4 casas
    const precoKgFmt = precoKg.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    setNfeItens([{
      id: crypto.randomUUID(),
      tipo_item: "Produto",
      item:      contrato.produto,
      ncm:       NCM_PRODUTO[contrato.produto] ?? "1201.10.00",
      quantidade: String(pesoKg),
      unidade:   "kg",
      valor_unitario: precoKgFmt,
      valor_total: valorTotal,
      valor_financeiro: valorTotal,
      cclass_trib: "",
    }]);

    setPasso("form");
  }

  // ── Pré-preencher avulsa ──────────────────────────────────────────────────
  function preencherAvulsa(tipo: TipoAvulsa, cfop: string) {
    const nat = [...NATUREZAS_VENDA, ...NATUREZAS_DEVOLUCAO].find(n => n.codigo === cfop);
    const hoje  = new Date().toISOString().slice(0, 10);
    const agora = new Date().toTimeString().slice(0, 8);
    setFVenda(p => ({
      ...p,
      cfop,
      natureza_texto: nat?.descricao ?? "",
      observacao:     nat?.obs ?? "",
      data_emissao:   hoje,
      data_saida:     hoje,
      hora_saida:     agora,
    }));
    setNfeItens([]);
    setPasso("form");
  }

  // ── Atualizar item ────────────────────────────────────────────────────────
  const atualizarItem = (idx: number, campo: string, val: string) => {
    setNfeItens(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd: NFeItem = { ...it, [campo]: val };
      if (campo === "quantidade" || campo === "valor_unitario") {
        const q = campo === "quantidade" ? parseFloat(val) || 0 : parseFloat(it.quantidade) || 0;
        const v = campo === "valor_unitario" ? desmascarar(val) : desmascarar(it.valor_unitario);
        upd.valor_total = +(q * v).toFixed(2);
        upd.valor_financeiro = upd.valor_total;
      }
      return upd;
    }));
  };

  const addItem = () => setNfeItens(p => [...p, {
    id: crypto.randomUUID(), tipo_item: "Produto", item: "Soja",
    ncm: "1201.10.00", quantidade: "", unidade: "sc", valor_unitario: "",
    valor_total: 0, valor_financeiro: 0, cclass_trib: "",
  }]);

  // ── Emitir nota ───────────────────────────────────────────────────────────
  async function emitirNota() {
    if (!fazendaId) return;
    if (!fVenda.produtor_id) { setErroForm("Selecione o produtor."); return; }
    if (!fVenda.destinatario) { setErroForm("Informe o destinatário."); return; }
    if (nfeItens.length === 0) { setErroForm("Adicione pelo menos um item."); return; }
    setEmitindo(true); setErroForm(null);
    try {
      const produtor = produtores.find(p => p.id === fVenda.produtor_id);
      const qtdTotal = nfeItens.reduce((s, i) => s + (parseFloat(i.quantidade) || 0), 0);
      const valorTotal = nfeItens.reduce((s, i) => s + i.valor_total, 0);

      const payload: Omit<NotaFiscal, "id" | "created_at"> = {
        fazenda_id:        fazendaId,
        tipo:              "saida",
        status:            "em_digitacao",
        numero:            String(notas.filter(n => n.tipo === "saida").length + 1).padStart(6, "0"),
        serie:             fVenda.serie || "1",
        data_emissao:      fVenda.data_emissao,
        destinatario:      fVenda.destinatario,
        cnpj_destinatario: fVenda.cnpj || undefined,
        cfop:              fVenda.cfop,
        natureza:          fVenda.natureza_texto,
        valor_total:       valorTotal,
        observacao:        [fVenda.observacao, fVenda.obs_manual].filter(Boolean).join("\n\n") || undefined,
        auto:              false,
      };

      const nova = await criarNotaFiscal(payload);

      // Se tem API de SEFAZ configurada, tenta transmitir
      const { data: config } = await supabase
        .from("configuracoes_modulo")
        .select("configuracoes")
        .eq("fazenda_id", fazendaId)
        .eq("modulo", "fiscal")
        .maybeSingle();

      if (config?.configuracoes?.api_url && config?.configuracoes?.token) {
        try {
          const resp = await fetch("/api/fiscal/emitir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nota_id: nova.id,
              emitente: config.configuracoes,
              destinatario: { nome: fVenda.destinatario, cpf_cnpj: fVenda.cnpj, ie: fVenda.dest_ie, endereco: { logradouro: fVenda.dest_endereco, numero: fVenda.dest_numero, municipio: fVenda.dest_cidade, uf: fVenda.dest_uf } },
              transporte: { transportadora: fVenda.transportadora, frete_conta: fVenda.frete_conta, placa: fVenda.placa, uf_placa: fVenda.uf_placa, peso_bruto: desmascarar(fVenda.peso_bruto), peso_liquido: desmascarar(fVenda.peso_liquido) },
              itens: nfeItens.map(i => ({ descricao: i.item, ncm: i.ncm, cfop: fVenda.cfop, unidade: i.unidade.toUpperCase(), quantidade: parseFloat(i.quantidade)||0, valor_unitario: desmascarar(i.valor_unitario) })),
            }),
          });
          if (resp.ok) {
            const res = await resp.json();
            if (res.status === "autorizada") {
              await atualizarStatusNFe(nova.id, "autorizada", res.chave_acesso);
              nova.status = "autorizada";
              nova.chave_acesso = res.chave_acesso;
            }
          }
        } catch { /* SEFAZ unavailable — nota salva em rascunho */ }
      }

      setNotas(p => [nova, ...p]);
      setModalAberto(false);
    } catch (e: unknown) {
      setErroForm((e as { message?: string })?.message ?? "Erro ao emitir nota.");
    } finally {
      setEmitindo(false);
    }
  }

  // ── Filtrar notas ─────────────────────────────────────────────────────────
  const notasFiltradas = notas
    .filter(n => n.tipo === "saida")
    .filter(n => {
      if (filtroAba === "processando") return n.status === "em_digitacao";
      if (filtroAba === "autorizadas") return n.status === "autorizada";
      if (filtroAba === "rejeitadas")  return n.status === "rejeitada";
      if (filtroAba === "canceladas")  return n.status === "cancelada";
      return true;
    })
    .filter(n => !buscaNota || n.numero.includes(buscaNota) || (n.destinatario ?? "").toLowerCase().includes(buscaNota.toLowerCase()));

  // ── Contrato picker filter ────────────────────────────────────────────────
  const contratosFiltrados = contratos.filter(c =>
    !buscaContrato ||
    (c.numero ?? "").toLowerCase().includes(buscaContrato.toLowerCase()) ||
    (c.comprador ?? "").toLowerCase().includes(buscaContrato.toLowerCase()) ||
    (c.produto ?? "").toLowerCase().includes(buscaContrato.toLowerCase())
  );

  const ABAS_NOTA: { id: TabNFe; label: string }[] = [
    { id: "produtor",      label: "Produtor"        },
    { id: "destinatario",  label: "Destinatário"    },
    { id: "operacoes",     label: "Operações/CFOP"  },
    { id: "transportador", label: "Transportador"   },
    { id: "retirada",      label: "Retirada/Entrega"},
    { id: "fiscal",        label: "Fiscal"          },
    { id: "obs",           label: "Obs./Adic."      },
    { id: "pontualidade",  label: "Pontualidade"    },
  ];

  // ── Conteúdo por aba ──────────────────────────────────────────────────────
  function renderAba() {
    switch (tabNFe) {
      case "produtor": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <label style={lbl}>Tipo de Nota</label>
            <select style={inp} value={fVenda.tipo_nota} onChange={e => fv({ tipo_nota: e.target.value as "propria"|"terceiros" })}>
              <option value="propria">Produção Própria</option>
              <option value="terceiros">Mercadoria de Terceiros</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Produtor *</label>
            <select style={inp} value={fVenda.produtor_id} onChange={e => fv({ produtor_id: e.target.value })}>
              <option value="">— selecione —</option>
              {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Safra / Ano</label>
            <select style={inp} value={fVenda.safra_id} onChange={e => fv({ safra_id: e.target.value })}>
              <option value="">— selecione —</option>
              {anosSafra.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
            </select>
          </div>
          {fVenda.contrato_numero && (
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ background:"#EBF4FB", border:"0.5px solid #93C5E8", borderRadius:8, padding:"8px 14px", fontSize:11, color:"#0B2D50" }}>
                <strong>Referência:</strong> Contrato {fVenda.contrato_numero} — dados pré-preenchidos automaticamente
              </div>
            </div>
          )}
        </div>
      );

      case "destinatario": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div style={{ gridColumn:"1/3" }}>
            <label style={lbl}>Destinatário (Razão Social / Nome) *</label>
            <input style={inp} value={fVenda.destinatario} onChange={e => fv({ destinatario: e.target.value })} placeholder="Nome ou razão social" />
          </div>
          <div>
            <label style={lbl}>Tipo de Pessoa</label>
            <select style={inp} value={fVenda.dest_tipo_pessoa} onChange={e => fv({ dest_tipo_pessoa: e.target.value as "fisica"|"juridica" })}>
              <option value="juridica">Pessoa Jurídica</option>
              <option value="fisica">Pessoa Física</option>
            </select>
          </div>
          <div>
            <label style={lbl}>{fVenda.dest_tipo_pessoa === "juridica" ? "CNPJ" : "CPF"}</label>
            <input style={inp} value={fVenda.cnpj} onChange={e => fv({ cnpj: e.target.value })} placeholder={fVenda.dest_tipo_pessoa === "juridica" ? "00.000.000/0001-00" : "000.000.000-00"} />
          </div>
          <div>
            <label style={lbl}>Inscrição Estadual</label>
            <input style={inp} value={fVenda.dest_ie} onChange={e => fv({ dest_ie: e.target.value })} placeholder="IE ou ISENTO" />
          </div>
          <div style={{ gridColumn:"1/3" }}>
            <label style={lbl}>Logradouro</label>
            <input style={inp} value={fVenda.dest_endereco} onChange={e => fv({ dest_endereco: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Número</label>
            <input style={inp} value={fVenda.dest_numero} onChange={e => fv({ dest_numero: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Cidade</label>
            <input style={inp} value={fVenda.dest_cidade} onChange={e => fv({ dest_cidade: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>UF</label>
            <input style={inp} value={fVenda.dest_uf} onChange={e => fv({ dest_uf: e.target.value })} maxLength={2} placeholder="MT" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={{ ...lbl, display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
              <input type="checkbox" checked={fVenda.dest_deposito} onChange={e => fv({ dest_deposito: e.target.checked })} />
              Destinatário é depósito / armazém de terceiros
            </label>
          </div>
        </div>
      );

      case "operacoes": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 80px 80px 120px 120px", gap:12 }}>
          <div style={{ gridColumn:"1/3" }}>
            <label style={lbl}>Natureza da Operação</label>
            <select style={inp} value={fVenda.cfop}
              onChange={e => {
                const nat = [...NATUREZAS_VENDA, ...NATUREZAS_DEVOLUCAO].find(n => n.codigo === e.target.value);
                fv({ cfop: e.target.value, natureza_texto: nat?.descricao ?? "", observacao: nat?.obs ?? "" });
              }}>
              <optgroup label="Vendas">
                {NATUREZAS_VENDA.filter(n => n.codigo.startsWith("6") || n.codigo.startsWith("5.1") || n.codigo.startsWith("5.5") || n.codigo.startsWith("7")).map(n => (
                  <option key={n.codigo} value={n.codigo}>{n.descricao}</option>
                ))}
              </optgroup>
              <optgroup label="Remessas">
                {NATUREZAS_VENDA.filter(n => ["6.905","5.905","6.906","5.906","6.117","6.119"].includes(n.codigo)).map(n => (
                  <option key={n.codigo} value={n.codigo}>{n.descricao}</option>
                ))}
              </optgroup>
              <optgroup label="Devoluções">
                {NATUREZAS_DEVOLUCAO.map(n => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label style={lbl}>CFOP</label>
            <input style={{ ...inp, fontWeight:600, color:"#1A4870", background:"#F4F6FA" }} value={fVenda.cfop} readOnly />
          </div>
          <div>
            <label style={lbl}>Modelo</label>
            <select style={inp} value={fVenda.modelo_nf} onChange={e => fv({ modelo_nf: e.target.value })}>
              <option value="55">55 — NF-e</option>
              <option value="65">65 — NFC-e</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Série</label>
            <input style={inp} value={fVenda.serie} onChange={e => fv({ serie: e.target.value })} maxLength={3} />
          </div>
          <div>
            <label style={lbl}>Data Emissão</label>
            <input style={inp} type="date" value={fVenda.data_emissao} onChange={e => fv({ data_emissao: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Data Saída</label>
            <input style={inp} type="date" value={fVenda.data_saida} onChange={e => fv({ data_saida: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Hora Saída</label>
            <input style={inp} type="time" step="1" value={fVenda.hora_saida} onChange={e => fv({ hora_saida: e.target.value })} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={{ ...lbl, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={fVenda.uso_imediato} onChange={e => fv({ uso_imediato: e.target.checked })} />
              Uso / Consumo Imediato
              <input type="checkbox" checked={fVenda.nota_livre} onChange={e => fv({ nota_livre: e.target.checked })} style={{ marginLeft:20 }} />
              Nota Livre (sem restrição fiscal)
              <input type="checkbox" checked={fVenda.fiscal} onChange={e => fv({ fiscal: e.target.checked })} style={{ marginLeft:20 }} />
              Nota com validade fiscal
            </label>
          </div>
          {/* Informação fiscal da natureza */}
          {(() => {
            const nat = [...NATUREZAS_VENDA, ...NATUREZAS_DEVOLUCAO].find(n => n.codigo === fVenda.cfop);
            if (!nat) return null;
            return (
              <div style={{ gridColumn:"1/-1", background:"#EBF4FB", border:"0.5px solid #93C5E8", borderRadius:8, padding:"10px 14px", fontSize:11, color:"#1A4870" }}>
                <strong>{nat.descricao}</strong>
                <div style={{ color:"#555", marginTop:4 }}>{nat.obs}</div>
              </div>
            );
          })()}
        </div>
      );

      case "transportador": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 100px 1fr 80px", gap:12 }}>
          <div style={{ gridColumn:"1/3" }}>
            <label style={lbl}>Transportadora</label>
            <input style={inp} value={fVenda.transportadora} onChange={e => fv({ transportadora: e.target.value })} placeholder="Razão social da transportadora" />
          </div>
          <div>
            <label style={lbl}>Frete por conta</label>
            <select style={inp} value={fVenda.frete_conta} onChange={e => fv({ frete_conta: e.target.value })}>
              {FRETES.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>CNPJ/CPF Transp.</label>
            <input style={inp} value={fVenda.transp_cpf_cnpj} onChange={e => fv({ transp_cpf_cnpj: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>IE Transp.</label>
            <input style={inp} value={fVenda.transp_ie} onChange={e => fv({ transp_ie: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Placa do Veículo</label>
            <input style={inp} value={fVenda.placa} onChange={e => fv({ placa: e.target.value.toUpperCase() })} placeholder="ABC1234" maxLength={8} />
          </div>
          <div>
            <label style={lbl}>UF da Placa</label>
            <input style={inp} value={fVenda.uf_placa} onChange={e => fv({ uf_placa: e.target.value.toUpperCase() })} maxLength={2} placeholder="MT" />
          </div>
          <div>
            <label style={lbl}>Espécie</label>
            <input style={inp} value={fVenda.especie} onChange={e => fv({ especie: e.target.value })} placeholder="Granel / Saco" />
          </div>
          <div>
            <label style={lbl}>Peso Bruto (kg)</label>
            <input style={inp} value={fVenda.peso_bruto} onChange={e => fv({ peso_bruto: aplicarMascara(e.target.value) })} placeholder="0,00" />
          </div>
          <div>
            <label style={lbl}>Peso Líquido (kg)</label>
            <input style={inp} value={fVenda.peso_liquido} onChange={e => fv({ peso_liquido: aplicarMascara(e.target.value) })} placeholder="0,00" />
          </div>
          <div>
            <label style={lbl}>Qtd. Volumes</label>
            <input style={inp} value={fVenda.qt_volumes} onChange={e => fv({ qt_volumes: e.target.value })} placeholder="0" />
          </div>
        </div>
      );

      case "retirada": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <label style={lbl}>Local de Retirada (quando diferente do emitente)</label>
            <textarea style={{ ...inp, height:80, resize:"vertical" }} value={fVenda.local_retirada} onChange={e => fv({ local_retirada: e.target.value })} placeholder="Endereço do local onde a mercadoria será retirada..." />
          </div>
          <div>
            <label style={lbl}>Local de Entrega (quando diferente do destinatário)</label>
            <textarea style={{ ...inp, height:80, resize:"vertical" }} value={fVenda.local_entrega} onChange={e => fv({ local_entrega: e.target.value })} placeholder="Endereço do local onde a mercadoria será entregue..." />
          </div>
        </div>
      );

      case "fiscal": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <label style={lbl}>Nº Guia ICMS</label>
            <input style={inp} value={fVenda.nr_guia_icms} onChange={e => fv({ nr_guia_icms: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>NF do Produtor — Número</label>
            <input style={inp} value={fVenda.num_nfp} onChange={e => fv({ num_nfp: e.target.value })} placeholder="Nº da nota física do produtor" />
          </div>
          <div>
            <label style={lbl}>Série NF Produtor</label>
            <input style={inp} value={fVenda.serie_nfp} onChange={e => fv({ serie_nfp: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Data NF Produtor</label>
            <input style={inp} type="date" value={fVenda.data_nfp} onChange={e => fv({ data_nfp: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Nota Substituída</label>
            <input style={inp} value={fVenda.nota_substituida} onChange={e => fv({ nota_substituida: e.target.value })} placeholder="Chave da NF-e substituída" />
          </div>
          <div>
            <label style={lbl}>Nota Substituta</label>
            <input style={inp} value={fVenda.nota_substituta} onChange={e => fv({ nota_substituta: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Situação Fiscal</label>
            <input style={inp} value={fVenda.situacao} onChange={e => fv({ situacao: e.target.value })} placeholder="Normal / Devolução / Complementar…" />
          </div>
        </div>
      );

      case "obs": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <label style={lbl}>Grupo Vendedor</label>
            <input style={inp} value={fVenda.grupo_vendedor} onChange={e => fv({ grupo_vendedor: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Comprador / Contato</label>
            <input style={inp} value={fVenda.comprador} onChange={e => fv({ comprador: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Propriedade</label>
            <input style={inp} value={fVenda.propriedade} onChange={e => fv({ propriedade: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Empreendimento / Ciclo</label>
            <input style={inp} value={fVenda.empreendimento} onChange={e => fv({ empreendimento: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Critério de Rateio</label>
            <input style={inp} value={fVenda.criterio_rateio} onChange={e => fv({ criterio_rateio: e.target.value })} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Observação Legal (rodapé da NF) — preenchida automaticamente pela natureza</label>
            <textarea style={{ ...inp, height:72, resize:"vertical", fontSize:11 }} value={fVenda.observacao} onChange={e => fv({ observacao: e.target.value })} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Observação Manual (complementar)</label>
            <textarea style={{ ...inp, height:56, resize:"vertical", fontSize:11 }} value={fVenda.obs_manual} onChange={e => fv({ obs_manual: e.target.value })} placeholder="Informações adicionais que aparecerão na nota…" />
          </div>
        </div>
      );

      case "pontualidade": return (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <label style={lbl}>Data do Lançamento</label>
            <input style={inp} type="date" value={fVenda.data_lancamento} onChange={e => fv({ data_lancamento: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Referência de Contrato</label>
            <input style={inp} value={fVenda.contrato_numero} onChange={e => fv({ contrato_numero: e.target.value })} placeholder="Nº do contrato de venda" />
          </div>
          <div style={{ gridColumn:"1/-1", background:"#F8FAFD", border:"0.5px solid #D4DCE8", borderRadius:8, padding:"10px 14px", fontSize:11, color:"#555" }}>
            Esta aba registra informações de pontualidade e antecipação de pagamento. Campos adicionais de desconto financeiro e condições especiais podem ser configurados nos Parâmetros do Sistema.
          </div>
        </div>
      );

      default: return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background:"#F4F6FA", minHeight:"100vh", fontFamily:"system-ui,sans-serif" }}>
      <TopNav />

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"24px 24px" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, color:"#1a1a1a", margin:0 }}>Faturamento — NF-e de Saída</h1>
            <p style={{ fontSize:13, color:"#666", margin:"4px 0 0" }}>Emita notas por contrato de venda ou avulsa (remessa, devolução, retorno)</p>
          </div>
          <button style={btnV} onClick={abrirModal}>+ Nova NF-e</button>
        </div>

        {/* Filtros */}
        <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:10, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          {(["todas","processando","autorizadas","rejeitadas","canceladas"] as const).map(a => (
            <button key={a} onClick={() => setFiltroAba(a)}
              style={{ padding:"5px 14px", borderRadius:20, border:"0.5px solid", fontSize:12, cursor:"pointer", fontWeight: filtroAba===a ? 600 : 400,
                background: filtroAba===a ? "#1A4870" : "#F4F6FA", color: filtroAba===a ? "#fff" : "#555", borderColor: filtroAba===a ? "#1A4870" : "#D4DCE8" }}>
              {a === "todas" ? "Todas" : a === "processando" ? "Processando" : a === "autorizadas" ? "Autorizadas" : a === "rejeitadas" ? "Rejeitadas" : "Canceladas"}
            </button>
          ))}
          <input style={{ ...inp, width:220, marginLeft:"auto" }} placeholder="Buscar por nº ou destinatário…" value={buscaNota} onChange={e => setBuscaNota(e.target.value)} />
        </div>

        {/* Tabela */}
        <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#F8FAFD" }}>
                {["Nº / Série","Data Emissão","Destinatário","CFOP","Valor Total","Status","Ações"].map((h, i) => (
                  <th key={i} style={{ padding:"10px 14px", textAlign: i >= 4 && i <= 5 ? "center" : "left", fontSize:11, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding:32, textAlign:"center", color:"#888", fontSize:13 }}>Carregando…</td></tr>
              ) : notasFiltradas.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:"center", color:"#999", fontSize:13 }}>
                  Nenhuma NF-e de saída encontrada.<br />
                  <button style={{ ...btnV, marginTop:12, fontSize:12 }} onClick={abrirModal}>Emitir a primeira nota</button>
                </td></tr>
              ) : notasFiltradas.map(nota => {
                const st = corStatus(nota.status);
                return (
                  <tr key={nota.id} style={{ borderBottom:"0.5px solid #F0F2F6" }}>
                    <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, color:"#1A4870" }}>
                      {nota.numero} <span style={{ fontSize:11, color:"#888", fontWeight:400 }}>Série {nota.serie}</span>
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:12 }}>{fmtData(nota.data_emissao)}</td>
                    <td style={{ padding:"10px 14px", fontSize:13 }}>{nota.destinatario ?? "—"}</td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#1A4870", fontWeight:600 }}>{nota.cfop ?? "—"}</td>
                    <td style={{ padding:"10px 14px", fontSize:13, textAlign:"center", fontWeight:600 }}>{fmtR$(nota.valor_total)}</td>
                    <td style={{ padding:"10px 14px", textAlign:"center" }}>
                      <span style={{ fontSize:11, background:st.bg, color:st.color, padding:"3px 10px", borderRadius:10, fontWeight:600, whiteSpace:"nowrap" }}>
                        {st.icone} {st.label}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button
                          style={{ padding:"4px 10px", fontSize:11, background:"#F4F6FA", color:"#1A4870", border:"0.5px solid #D4DCE8", borderRadius:6, cursor:"pointer" }}
                          onClick={() => setNotaVer(nota)}>
                          Visualizar
                        </button>
                        {nota.status === "em_digitacao" && (
                          <button
                            style={{ padding:"4px 10px", fontSize:11, background:"#1A5CB8", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}
                            onClick={async () => {
                              if (!window.confirm("Transmitir para a SEFAZ?")) return;
                              await atualizarStatusNFe(nota.id, "em_digitacao");
                              setNotas(p => p.map(n => n.id === nota.id ? { ...n, status: "em_digitacao" } : n));
                            }}>
                            Transmitir
                          </button>
                        )}
                        {nota.status === "autorizada" && (
                          <button
                            style={{ padding:"4px 10px", fontSize:11, background:"#0B2D50", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}
                            onClick={() => window.open(`/fiscal/danfe/${nota.id}`, "_blank")}>
                            DANFE
                          </button>
                        )}
                        {["autorizada","em_digitacao"].includes(nota.status) && (
                          <button
                            style={{ padding:"4px 10px", fontSize:11, background:"#FCEBEB", color:"#791F1F", border:"0.5px solid #E24B4A50", borderRadius:6, cursor:"pointer" }}
                            onClick={async () => {
                              const motivo = window.prompt("Motivo do cancelamento (min. 15 caracteres):");
                              if (!motivo || motivo.length < 15) return;
                              await atualizarStatusNFe(nota.id, "cancelada");
                              setNotas(p => p.map(n => n.id === nota.id ? { ...n, status: "cancelada" } : n));
                            }}>
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

          {notasFiltradas.length > 0 && (
            <div style={{ padding:"10px 16px", background:"#F8FAFD", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"flex-end", gap:24 }}>
              <span style={{ fontSize:12, color:"#555" }}>Total de notas: <strong>{notasFiltradas.length}</strong></span>
              <span style={{ fontSize:12, color:"#555" }}>Valor total: <strong style={{ color:"#1A4870" }}>{fmtR$(notasFiltradas.reduce((s, n) => s + n.valor_total, 0))}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL DE EMISSÃO                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {modalAberto && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" }}>

          {/* ── PASSO 1: Origem ── */}
          {passo === "origem" && (
            <div style={{ background:"#fff", borderRadius:14, padding:32, width:560, boxShadow:"0 16px 48px rgba(0,0,0,0.22)" }}>
              <div style={{ fontSize:17, fontWeight:700, color:"#1a1a1a", marginBottom:6 }}>Nova Nota Fiscal de Saída</div>
              <div style={{ fontSize:13, color:"#666", marginBottom:24 }}>Como deseja iniciar a emissão?</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:28 }}>
                <button
                  onClick={() => setPasso("contrato")}
                  style={{ padding:"20px 16px", border:"1.5px solid #1A5CB8", borderRadius:12, background:"#EBF4FB", cursor:"pointer", textAlign:"left", transition:"background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#D5E8F5")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#EBF4FB")}>
                  <div style={{ fontSize:22, marginBottom:8 }}>📋</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0B2D50", marginBottom:4 }}>Por Contrato</div>
                  <div style={{ fontSize:12, color:"#555" }}>Selecione um contrato de venda. Destinatário, CFOP, itens e observações legais são preenchidos automaticamente.</div>
                </button>
                <button
                  onClick={() => { setTipoAvulsa("venda"); preencherAvulsa("venda", "6.501"); }}
                  style={{ padding:"20px 16px", border:"1.5px solid #D4DCE8", borderRadius:12, background:"#F8FAFD", cursor:"pointer", textAlign:"left", transition:"background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F0F2F6")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F8FAFD")}>
                  <div style={{ fontSize:22, marginBottom:8 }}>📝</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>Avulsa — Venda</div>
                  <div style={{ fontSize:12, color:"#555" }}>Nota de venda sem vínculo de contrato. Você preenche todos os dados.</div>
                </button>
                <button
                  onClick={() => { setTipoAvulsa("remessa"); preencherAvulsa("remessa", "6.905"); }}
                  style={{ padding:"20px 16px", border:"1.5px solid #D4DCE8", borderRadius:12, background:"#F8FAFD", cursor:"pointer", textAlign:"left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F0F2F6")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F8FAFD")}>
                  <div style={{ fontSize:22, marginBottom:8 }}>🏭</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>Remessa</div>
                  <div style={{ fontSize:12, color:"#555" }}>Depósito em armazém (6.905), entrega futura (6.117) ou venda à ordem (6.119).</div>
                </button>
                <button
                  onClick={() => { setTipoAvulsa("devolucao"); preencherAvulsa("devolucao", "2.201"); }}
                  style={{ padding:"20px 16px", border:"1.5px solid #D4DCE8", borderRadius:12, background:"#F8FAFD", cursor:"pointer", textAlign:"left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F0F2F6")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F8FAFD")}>
                  <div style={{ fontSize:22, marginBottom:8 }}>↩️</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>Devolução / Retorno</div>
                  <div style={{ fontSize:12, color:"#555" }}>Devolução de mercadoria vendida ou retorno de armazém geral.</div>
                </button>
              </div>
              <button style={btnR} onClick={() => setModalAberto(false)}>Cancelar</button>
            </div>
          )}

          {/* ── PASSO 2: Selecionar Contrato ── */}
          {passo === "contrato" && (
            <div style={{ background:"#fff", borderRadius:14, width:720, maxHeight:"85vh", display:"flex", flexDirection:"column", boxShadow:"0 16px 48px rgba(0,0,0,0.22)", overflow:"hidden" }}>
              <div style={{ padding:"18px 24px 14px", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", gap:14 }}>
                <button style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#666", padding:"0 4px" }} onClick={() => setPasso("origem")}>←</button>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a" }}>Selecionar Contrato de Venda</div>
                  <div style={{ fontSize:12, color:"#666", marginTop:2 }}>Clique no contrato para pré-preencher a nota</div>
                </div>
                <input
                  style={{ ...inp, width:220, marginLeft:"auto" }}
                  placeholder="Buscar contrato, comprador, produto…"
                  value={buscaContrato}
                  onChange={e => setBuscaContrato(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ overflowY:"auto", flex:1 }}>
                {contratosFiltrados.length === 0 ? (
                  <div style={{ padding:40, textAlign:"center", color:"#999", fontSize:13 }}>Nenhum contrato de venda encontrado.</div>
                ) : contratosFiltrados.map(c => {
                  const saldo = (c.quantidade_sc ?? 0) - (c.entregue_sc ?? 0);
                  return (
                    <div
                      key={c.id}
                      onClick={() => selecionarContrato(c)}
                      style={{ padding:"14px 24px", borderBottom:"0.5px solid #F0F2F6", cursor:"pointer", display:"flex", alignItems:"center", gap:16, transition:"background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F4F8FF")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ flex:"0 0 100px" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#1A4870" }}>{c.numero}</div>
                        <div style={{ fontSize:11, color:"#888" }}>{c.data_contrato ? fmtData(c.data_contrato) : "—"}</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1a1a1a" }}>{c.comprador}</div>
                        <div style={{ fontSize:11, color:"#666" }}>{c.produto} · {c.cfop ?? "—"} · {c.natureza_operacao ?? "—"}</div>
                      </div>
                      <div style={{ textAlign:"right", flex:"0 0 160px" }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1a1a1a" }}>{(c.quantidade_sc ?? 0).toLocaleString("pt-BR")} sc</div>
                        <div style={{ fontSize:11, color: saldo > 0 ? "#16A34A" : "#888" }}>Saldo: {saldo.toLocaleString("pt-BR")} sc</div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1A4870", flex:"0 0 120px", textAlign:"right" }}>
                        {fmtR$(c.preco ?? 0)}/sc
                      </div>
                      <span style={{ fontSize:11, background: c.confirmado ? "#D5F0E4" : "#FAEEDA", color: c.confirmado ? "#16703A" : "#633806", padding:"3px 8px", borderRadius:8, fontWeight:600 }}>
                        {c.confirmado ? "Confirmado" : "Em aberto"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"12px 24px", borderTop:"0.5px solid #D4DCE8", display:"flex", gap:10 }}>
                <button style={btnR} onClick={() => setModalAberto(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* ── PASSO 2b: Selecionar Romaneio ── */}
          {passo === "romaneio" && contratoSelecionado && (
            <div style={{ background:"#fff", borderRadius:14, width:780, maxHeight:"85vh", display:"flex", flexDirection:"column", boxShadow:"0 16px 48px rgba(0,0,0,0.22)", overflow:"hidden" }}>
              <div style={{ padding:"18px 24px 14px", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", gap:14 }}>
                <button style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#666", padding:"0 4px" }} onClick={() => setPasso("contrato")}>←</button>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a" }}>Selecionar Carga (Romaneio)</div>
                  <div style={{ fontSize:12, color:"#666", marginTop:2 }}>
                    Contrato <strong>{contratoSelecionado.numero}</strong> · {contratoSelecionado.comprador} · {contratoSelecionado.produto}
                    &nbsp;· R$ {(contratoSelecionado.preco ?? 0).toLocaleString("pt-BR", { minimumFractionDigits:2 })}/sc
                    &nbsp;= R$ {((contratoSelecionado.preco ?? 0) / kgSaca(contratoSelecionado.produto)).toLocaleString("pt-BR", { minimumFractionDigits:4 })}/kg
                  </div>
                </div>
              </div>

              <div style={{ overflowY:"auto", flex:1 }}>
                {romaneios.length === 0 ? (
                  <div style={{ padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>🚛</div>
                    <div style={{ fontSize:14, color:"#555", fontWeight:600, marginBottom:8 }}>Nenhum romaneio registrado para este contrato</div>
                    <div style={{ fontSize:12, color:"#888" }}>Registre as cargas em Comercial → Contratos de Grãos antes de emitir a NF-e.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ padding:"8px 24px", background:"#F8FAFD", borderBottom:"0.5px solid #D4DCE8", display:"flex", gap:32, fontSize:11, color:"#555" }}>
                      <span>Total de cargas: <strong>{romaneios.length}</strong></span>
                      <span>Já faturadas: <strong>{romaneios.filter(r => r.nfe_status === "autorizada").length}</strong></span>
                      <span>Pendentes: <strong style={{ color:"#C9921B" }}>{romaneios.filter(r => r.nfe_status !== "autorizada").length}</strong></span>
                    </div>
                    {romaneios.map(rom => {
                      const pesoKg   = rom.peso_classificado_kg ?? rom.peso_liquido_kg ?? 0;
                      const jaFatQry = rom.nfe_status === "autorizada";
                      return (
                        <div
                          key={rom.id}
                          onClick={() => !jaFatQry && preencherDeRomaneio(rom)}
                          style={{
                            padding:"14px 24px", borderBottom:"0.5px solid #F0F2F6",
                            cursor: jaFatQry ? "default" : "pointer",
                            opacity: jaFatQry ? 0.55 : 1,
                            display:"flex", alignItems:"center", gap:16,
                            background: jaFatQry ? "#F8FAFD" : "transparent",
                            transition:"background 0.1s",
                          }}
                          onMouseEnter={e => { if (!jaFatQry) e.currentTarget.style.background = "#F4F8FF"; }}
                          onMouseLeave={e => { if (!jaFatQry) e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ flex:"0 0 110px" }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#1A4870" }}>Rom. {rom.numero}</div>
                            <div style={{ fontSize:11, color:"#888" }}>{rom.data ? fmtData(rom.data) : "—"}</div>
                          </div>
                          <div style={{ flex:"0 0 100px" }}>
                            <div style={{ fontSize:11, color:"#555" }}>Placa</div>
                            <div style={{ fontSize:13, fontWeight:600 }}>{rom.placa ?? "—"}</div>
                          </div>
                          <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
                            <div>
                              <div style={{ fontSize:10, color:"#888" }}>Peso Bruto</div>
                              <div style={{ fontSize:12, fontWeight:600 }}>{(rom.peso_bruto_kg ?? 0).toLocaleString("pt-BR")} kg</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"#888" }}>Tara</div>
                              <div style={{ fontSize:12 }}>{(rom.tara_kg ?? 0).toLocaleString("pt-BR")} kg</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"#888" }}>Peso Líquido</div>
                              <div style={{ fontSize:12 }}>{(rom.peso_liquido_kg ?? 0).toLocaleString("pt-BR")} kg</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"#555", fontWeight:600 }}>Peso Classificado</div>
                              <div style={{ fontSize:13, fontWeight:700, color:"#1A4870" }}>{pesoKg.toLocaleString("pt-BR")} kg</div>
                            </div>
                          </div>
                          <div style={{ flex:"0 0 130px", textAlign:"right" }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a" }}>
                              {((contratoSelecionado.preco ?? 0) / kgSaca(contratoSelecionado.produto) * pesoKg).toLocaleString("pt-BR", { style:"currency", currency:"BRL" })}
                            </div>
                            <div style={{ fontSize:10, color:"#888" }}>valor da carga</div>
                          </div>
                          <div style={{ flex:"0 0 100px", textAlign:"right" }}>
                            {jaFatQry ? (
                              <span style={{ fontSize:11, background:"#D5E8F5", color:"#0B2D50", padding:"3px 8px", borderRadius:8, fontWeight:600 }}>✓ Faturada</span>
                            ) : (
                              <span style={{ fontSize:11, background:"#FBF3E0", color:"#7A5A12", padding:"3px 8px", borderRadius:8, fontWeight:600 }}>Faturar →</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              <div style={{ padding:"12px 24px", borderTop:"0.5px solid #D4DCE8", display:"flex", gap:10 }}>
                <button style={btnR} onClick={() => setModalAberto(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* ── PASSO 3: Formulário 8 abas ── */}
          {passo === "form" && (
            <div style={{ background:"#fff", borderRadius:14, width:"94vw", maxWidth:1100, height:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 16px 48px rgba(0,0,0,0.22)", overflow:"hidden" }}>

              {/* Barra de título */}
              <div style={{ background:"#1A4870", color:"#fff", padding:"14px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
                <button style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", fontSize:16, cursor:"pointer", padding:"0 4px" }} onClick={() => setPasso(tipoAvulsa ? "origem" : "romaneio")}>←</button>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>
                    {fVenda.contrato_numero ? `NF-e por Contrato — ${fVenda.contrato_numero}` : `NF-e Avulsa — ${tipoAvulsa === "remessa" ? "Remessa" : tipoAvulsa === "devolucao" ? "Devolução/Retorno" : "Venda"}`}
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2 }}>
                    {fVenda.destinatario ? `Destinatário: ${fVenda.destinatario}` : "Preencha os dados da nota"}
                    {fVenda.contrato_numero && " · dados pré-carregados do contrato"}
                  </div>
                </div>
                <button style={{ background:"none", border:"0.5px solid rgba(255,255,255,0.3)", color:"rgba(255,255,255,0.7)", borderRadius:6, padding:"4px 12px", fontSize:12, cursor:"pointer" }} onClick={() => setModalAberto(false)}>✕ Fechar</button>
              </div>

              {/* Abas */}
              <div style={{ display:"flex", borderBottom:"0.5px solid #D4DCE8", background:"#F8FAFD", flexShrink:0, overflowX:"auto" }}>
                {ABAS_NOTA.map(a => (
                  <button key={a.id} onClick={() => setTabNFe(a.id)}
                    style={{ padding:"10px 16px", fontSize:12, border:"none", borderBottom: tabNFe === a.id ? "2.5px solid #1A5CB8" : "2.5px solid transparent", background:"transparent",
                      color: tabNFe === a.id ? "#1A5CB8" : "#555", fontWeight: tabNFe === a.id ? 700 : 400, cursor:"pointer", whiteSpace:"nowrap" }}>
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Conteúdo da aba */}
              <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
                {renderAba()}
              </div>

              {/* Grid de itens */}
              <div style={{ borderTop:"0.5px solid #D4DCE8", background:"#F8FAFD", flexShrink:0 }}>
                <div style={{ padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"#555" }}>Itens da Nota</span>
                  <button style={{ fontSize:11, padding:"3px 10px", border:"0.5px solid #1A5CB8", borderRadius:5, background:"#E6F1FB", color:"#1A5CB8", cursor:"pointer" }} onClick={addItem}>+ Item</button>
                </div>
                <div style={{ overflowX:"auto", maxHeight:160 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:"#F0F4F8" }}>
                        {["Tipo","Item / Produto","NCM","Qtd","Unid","Valor Unit.","Valor Total",""].map((h, i) => (
                          <th key={i} style={{ padding:"5px 10px", fontSize:10, fontWeight:600, color:"#555", textAlign: i>=3&&i<=6?"center":"left", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfeItens.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding:"12px 14px", textAlign:"center", fontSize:11, color:"#aaa" }}>Nenhum item. Clique em "+ Item" para adicionar.</td></tr>
                      ) : nfeItens.map((it, idx) => (
                        <tr key={it.id} style={{ borderBottom:"0.5px solid #eee" }}>
                          <td style={{ padding:"5px 8px", width:80 }}>
                            <select style={{ ...inp, fontSize:11 }} value={it.tipo_item} onChange={e => atualizarItem(idx, "tipo_item", e.target.value)}>
                              <option>Produto</option><option>Serviço</option>
                            </select>
                          </td>
                          <td style={{ padding:"5px 8px", minWidth:120 }}>
                            <input style={{ ...inp, fontSize:12 }} value={it.item} onChange={e => atualizarItem(idx, "item", e.target.value)} />
                          </td>
                          <td style={{ padding:"5px 8px", width:110 }}>
                            <input style={{ ...inp, fontSize:11 }} value={it.ncm} onChange={e => atualizarItem(idx, "ncm", e.target.value)} placeholder="0000.00.00" />
                          </td>
                          <td style={{ padding:"5px 8px", width:90 }}>
                            <input style={{ ...inp, textAlign:"right", fontSize:12 }} value={it.quantidade} onChange={e => atualizarItem(idx, "quantidade", e.target.value)} placeholder="0" />
                          </td>
                          <td style={{ padding:"5px 8px", width:60 }}>
                            <select style={{ ...inp, fontSize:11 }} value={it.unidade} onChange={e => atualizarItem(idx, "unidade", e.target.value)}>
                              {["sc","kg","ton","@","cx","un"].map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ padding:"5px 8px", width:110 }}>
                            <input style={{ ...inp, textAlign:"right", fontSize:12 }} value={it.valor_unitario}
                              onChange={e => atualizarItem(idx, "valor_unitario", aplicarMascara(e.target.value.replace(/\D/g,"")))} placeholder="0,00" />
                          </td>
                          <td style={{ padding:"5px 8px", width:120 }}>
                            <input style={{ ...inp, background:"#F4F6FA", textAlign:"right", fontSize:12, fontWeight:600, color:"#1A4870" }} value={fmtR$(it.valor_total)} readOnly />
                          </td>
                          <td style={{ padding:"5px 8px", width:30 }}>
                            <button style={{ padding:"2px 7px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" }}
                              onClick={() => setNfeItens(p => p.filter((_, i) => i !== idx))}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding:"8px 16px", display:"flex", justifyContent:"flex-end", gap:24, borderTop:"0.5px solid #D4DCE8" }}>
                  <span style={{ fontSize:12, color:"#555" }}>Financeiro: <strong>{fmtR$(totalFinanceiro)}</strong></span>
                  <span style={{ fontSize:13, fontWeight:700, color:"#1A4870" }}>Total: {fmtR$(totalItens)}</span>
                </div>
              </div>

              {/* Rodapé do modal */}
              <div style={{ padding:"12px 20px", borderTop:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", gap:12, flexShrink:0, background:"#fff" }}>
                {erroForm && (
                  <div style={{ flex:1, background:"#FCEBEB", border:"0.5px solid #E24B4A50", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#791F1F" }}>
                    ⚠ {erroForm}
                  </div>
                )}
                <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
                  <button style={btnR} onClick={() => setModalAberto(false)}>Cancelar</button>
                  <button
                    style={{ ...btnR, borderColor:"#1A5CB8", color:"#1A5CB8" }}
                    onClick={() => {
                      const tabs: TabNFe[] = ["produtor","destinatario","operacoes","transportador","retirada","fiscal","obs","pontualidade"];
                      const idx = tabs.indexOf(tabNFe);
                      if (idx < tabs.length - 1) setTabNFe(tabs[idx + 1]);
                    }}>
                    Próxima aba →
                  </button>
                  <button style={{ ...btnV, background: emitindo ? "#888" : "#1A5CB8" }} onClick={emitirNota} disabled={emitindo}>
                    {emitindo ? "Emitindo…" : "Emitir NF-e"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Visualizar NF ─────────────────────────────────────── */}
      {notaVer && (() => {
        const st = corStatus(notaVer.status);
        const fmtVal = (v?: number) => v != null ? v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }) : "—";
        const campo = (label: string, valor: React.ReactNode) => (
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            <div style={{ fontSize:10, color:"#888", textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
            <div style={{ fontSize:13, color:"#1a1a1a", fontWeight:500, wordBreak:"break-all" }}>{valor || "—"}</div>
          </div>
        );
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}
               onClick={e => { if (e.target === e.currentTarget) setNotaVer(null); }}>
            <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:640, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.25)" }}>

              {/* Cabeçalho */}
              <div style={{ padding:"18px 24px", borderBottom:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#1a1a1a" }}>
                    NF-e Nº {notaVer.numero} — Série {notaVer.serie}
                  </div>
                  <div style={{ marginTop:4 }}>
                    <span style={{ fontSize:11, background:st.bg, color:st.color, padding:"2px 10px", borderRadius:10, fontWeight:600 }}>
                      {st.icone} {st.label}
                    </span>
                  </div>
                </div>
                <button onClick={() => setNotaVer(null)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#555" }}>×</button>
              </div>

              {/* Corpo */}
              <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>

                {/* Bloco Identificação */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"0.5px solid #DDE2EE", paddingBottom:6, marginBottom:12 }}>
                    Identificação
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                    {campo("Data de Emissão", fmtData(notaVer.data_emissao))}
                    {campo("CFOP", <span style={{ color:"#1A4870", fontWeight:700 }}>{notaVer.cfop}</span>)}
                    {campo("Valor Total", <span style={{ color:"#1A4870", fontWeight:700, fontSize:15 }}>{fmtVal(notaVer.valor_total)}</span>)}
                  </div>
                </div>

                {/* Bloco Natureza */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"0.5px solid #DDE2EE", paddingBottom:6, marginBottom:12 }}>
                    Natureza da Operação
                  </div>
                  {campo("Descrição", notaVer.natureza)}
                </div>

                {/* Bloco Destinatário */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"0.5px solid #DDE2EE", paddingBottom:6, marginBottom:12 }}>
                    Destinatário
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                    {campo("Nome / Razão Social", notaVer.destinatario)}
                    {campo("CPF / CNPJ", notaVer.cnpj_destinatario)}
                  </div>
                </div>

                {/* Bloco Infos Complementares */}
                {notaVer.observacao && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"0.5px solid #DDE2EE", paddingBottom:6, marginBottom:12 }}>
                      Informações Complementares (infCpl)
                    </div>
                    <div style={{ fontSize:12, color:"#333", background:"#F8FAFD", borderRadius:8, padding:"10px 14px", whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                      {notaVer.observacao}
                    </div>
                  </div>
                )}

                {/* Bloco Chave / XML */}
                {(notaVer.chave_acesso || notaVer.xml_url) && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"0.5px solid #DDE2EE", paddingBottom:6, marginBottom:12 }}>
                      Documentos Fiscais
                    </div>
                    {campo("Chave de Acesso", notaVer.chave_acesso && (
                      <span style={{ fontFamily:"monospace", fontSize:11, letterSpacing:"0.05em" }}>{notaVer.chave_acesso}</span>
                    ))}
                    {notaVer.xml_url && (
                      <div style={{ marginTop:8 }}>
                        <a href={notaVer.xml_url} target="_blank" rel="noreferrer"
                           style={{ fontSize:12, color:"#1A5CB8", textDecoration:"underline" }}>
                          Baixar XML
                        </a>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Rodapé */}
              <div style={{ padding:"14px 24px", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                {notaVer.status === "em_digitacao" && (
                  <button
                    style={{ padding:"7px 16px", fontSize:12, background:"#1A5CB8", color:"#fff", border:"none", borderRadius:7, cursor:"pointer", fontWeight:600 }}
                    onClick={async () => {
                      if (!window.confirm("Transmitir para a SEFAZ?")) return;
                      await atualizarStatusNFe(notaVer.id, "em_digitacao");
                      setNotas(p => p.map(n => n.id === notaVer.id ? { ...n, status: "em_digitacao" } : n));
                      setNotaVer(null);
                    }}>
                    Transmitir para SEFAZ
                  </button>
                )}
                {notaVer.status === "autorizada" && (
                  <button
                    style={{ padding:"7px 16px", fontSize:12, background:"#0B2D50", color:"#fff", border:"none", borderRadius:7, cursor:"pointer", fontWeight:600 }}
                    onClick={() => window.open(`/fiscal/danfe/${notaVer.id}`, "_blank")}>
                    Abrir DANFE
                  </button>
                )}
                {!["em_digitacao","autorizada"].includes(notaVer.status) && <div />}
                <button onClick={() => setNotaVer(null)} style={{ padding:"7px 16px", fontSize:12, border:"0.5px solid #D4DCE8", borderRadius:7, background:"transparent", cursor:"pointer" }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
