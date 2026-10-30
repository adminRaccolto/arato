"use client";
import Link from "next/link";
// Remessas — tela própria para a remessa de mercadoria a armazém geral, depósito ou condomínio logístico (ex.: LUFT).
// Diretriz do dono 27/10/2026: compra, remessa e retorno em telas separadas, cada uma com as suas variáveis.
// Aqui: emitir a NF-e de remessa pelo Arato OU registrar a remessa emitida em outro sistema; os itens vêm da NF de
// entrada de origem ou do cadastro; o estoque é TRANSFERIDO do depósito próprio para o depósito do armazém (continua
// sendo do cliente). O retorno (NF recebida do armazém, emitida pelo Arato ou fora) fica na tela Retornos.
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalHeading } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import SelectBusca from "../../../components/SelectBusca";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { supabase } from "../../../lib/supabase";
import type { Deposito, Insumo, NfRemessaLogistica, Pessoa } from "../../../lib/supabase";
import { listarNfRemessasLogisticas, listarPessoasDaConta, listarInsumosParaConta, listarDepositosMulti, listarNfEntradaItens, insumoAtivo } from "../../../lib/db";
import { CFOP_RETORNO, lerXmlNfe } from "../../../lib/fiscal/nfe-xml";
import { cstExibicaoPorCfop } from "../../../lib/nfe/cst-por-cfop";
import { ratearDescontoNf } from "../../../lib/nfe/remessa";
import { BlocoTransporte, SeletorIE, TRANSP_VAZIO, ieSugerida, montarTransporte, resolverEmitente, useDadosEmissao, type Transp } from "../../../components/fiscal/EmissaoNfe";
import RemessasMaquinas from "../../../components/fiscal/RemessasMaquinas";

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const numBR = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;
// Número vindo do banco/XML para o campo digitável (formato brasileiro): "2.08" lido por numBR virava 208 — achado
// real 28/10/2026, remessa com XML externo mostrava os totais ×100.
const paraCampo = (n: number | null | undefined) => n == null || !Number.isFinite(Number(n)) ? "" : String(n).replace(".", ",");
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600 };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 12, borderBottom: "0.5px solid var(--border-row)", verticalAlign: "top" };
// Natureza da operação sugerida pelo CFOP da remessa
const NATUREZA_REMESSA: Record<string, string> = {
  "5905": "Remessa para depósito em armazém geral", "6905": "Remessa para depósito em armazém geral",
  "5934": "Remessa simbólica para armazém geral", "6934": "Remessa simbólica para armazém geral",
  "5901": "Remessa para industrialização por encomenda", "6901": "Remessa para industrialização por encomenda",
  "5924": "Remessa para industrialização por conta e ordem do adquirente", "6924": "Remessa para industrialização por conta e ordem do adquirente",
  "5915": "Remessa para conserto ou reparo", "6915": "Remessa para conserto ou reparo",
};
const ehDepTerceiro = (d: Deposito) => ["terceiro", "armazem_terceiro"].includes(d.tipo);

const STATUS_BADGE: Record<string, { bg: string; cl: string; label: string }> = {
  emitida:   { bg: "#D5E8F5", cl: "#0B2D50", label: "Aguardando retorno" },
  retornada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Retornada" },
  cancelada: { bg: "#FDECEA", cl: "#B91C1C", label: "Cancelada" },
};

// Valor remetido: soma dos itens (o cabeçalho de remessas antigas pode estar errado); sem itens, o total
const valorRemetido = (r: NfRemessaLogistica) => {
  const its = Array.isArray(r.itens_json) ? (r.itens_json as { valor_total?: number }[]) : [];
  const soma = its.reduce((s, i) => s + Number(i.valor_total ?? 0), 0);
  return soma > 0 ? soma : Number(r.valor_total ?? 0);
};

type ItemRem = { key: string; insumo_id: string; descricao: string; ncm: string; unidade: string; quantidade: string; valor_unitario: string; unidade_xml?: string };
type NfOrigem = { id: string; numero: string; emitente_nome: string | null; data_emissao: string | null; valor_total: number | null; produtor_id: string | null; fazenda_id: string };
// Volume da remessa por unidade: remetido, já voltou e falta voltar. O retorno guarda só o valor; a quantidade que
// voltou é proporcional ao valor (mesma regra do estoque no registro do retorno: quantidade × valor retornado ÷ remetido).
type ItemVol = { quantidade?: number; unidade?: string; unidade_nf?: string };
function fracaoRetornada(r: NfRemessaLogistica) {
  const rem = valorRemetido(r);
  if (r.status === "retornada") return 1;
  return rem > 0 ? Math.min(1, Number(r.valor_retornado ?? 0) / rem) : 0;
}
function volumes(r: NfRemessaLogistica) {
  const its = (Array.isArray(r.itens_json) ? r.itens_json : []) as ItemVol[];
  const f = fracaoRetornada(r);
  const por = new Map<string, number>();
  for (const it of its) { const u = String(it.unidade ?? it.unidade_nf ?? "").toUpperCase() || "UN"; por.set(u, (por.get(u) ?? 0) + Number(it.quantidade ?? 0)); }
  const fmt = (q: number, u: string) => `${q.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${u}`;
  const lista = [...por.entries()];
  return {
    remetido: lista.map(([u, q]) => fmt(q, u)).join(" + "),
    voltou: lista.map(([u, q]) => fmt(Math.round(q * f * 1000) / 1000, u)).join(" + "),
    falta: lista.map(([u, q]) => fmt(Math.round(q * (1 - f) * 1000) / 1000, u)).join(" + "),
  };
}
const novoItem = (): ItemRem => ({ key: crypto.randomUUID(), insumo_id: "", descricao: "", ncm: "", unidade: "", quantidade: "", valor_unitario: "" });

function RemessasConteudo() {
  const { contaId, fazendaId, fazendaIds } = useAuth();
  const params = useSearchParams();
  const [aba, setAba] = useState<"mercadorias" | "maquinas">(params.get("aba") === "maquinas" ? "maquinas" : "mercadorias");
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const dados = useDadosEmissao(ids, contaId);

  const [remessas, setRemessas] = useState<NfRemessaLogistica[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [ufFazenda, setUfFazenda] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroSt, setFiltroSt] = useState("");
  const [msg, setMsg] = useState("");
  // Remessas abertas (seta) e as NF de compra de origem já buscadas para elas
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [nfOrigemInfo, setNfOrigemInfo] = useState<Record<string, { numero: string | null; emitente_nome: string | null; data_emissao: string | null; valor_total: number | null } | null>>({});
  function alternarRemessa(r: NfRemessaLogistica) {
    setExpandidas(p => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
    if (r.nf_entrada_id && !(r.nf_entrada_id in nfOrigemInfo)) {
      supabase.from("nf_entradas").select("numero, emitente_nome, data_emissao, valor_total").eq("id", r.nf_entrada_id).maybeSingle()
        .then(({ data }) => setNfOrigemInfo(p => ({ ...p, [r.nf_entrada_id!]: data as { numero: string | null; emitente_nome: string | null; data_emissao: string | null; valor_total: number | null } | null })));
    }
  }

  // Excluir remessa sem retorno (emitida fora ou pelo Arato): o estoque volta para o depósito de origem
  async function excluirRemessa(r: NfRemessaLogistica) {
    if (!(await confirmarAcao({ titulo: `Excluir a remessa NF ${r.nf_remessa_numero ?? ""}?`, perigo: true, textoConfirmar: "Excluir remessa",
      mensagem: `A transferência de estoque é desfeita (os itens voltam ao depósito de origem)${r.emissao === "externa" ? " e a NF sai do Monitor de NF-e" : ""}. NF-e emitida pelo Arato e autorizada precisa ser cancelada antes no Monitor de NF-e.` }))) return;
    const resp = await fetch("/api/fiscal/remessas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "excluir", fazenda_id: r.fazenda_id, remessa_id: r.id }) });
    const j = await resp.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!j.ok) { alert(j.error ?? `Erro HTTP ${resp.status}`); return; }
    await carregar();
  }

  async function carregar() {
    if (!contaId || !ids.length) return;
    setLoading(true);
    const [r, p, ins, dep, { data: fz }] = await Promise.all([
      listarNfRemessasLogisticas(contaId), listarPessoasDaConta(fazendaId ?? ids[0]),
      listarInsumosParaConta(contaId, fazendaId ?? undefined), listarDepositosMulti(ids),
      supabase.from("fazendas").select("id, estado").in("id", ids),
    ]);
    setRemessas(r); setPessoas(p); setInsumos(ins.filter(insumoAtivo)); setDepositos(dep);
    setUfFazenda(new Map(((fz ?? []) as { id: string; estado: string | null }[]).map(f => [f.id, f.estado ?? ""])));
    setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contaId, ids.join(",")]);

  // ── Nova remessa ─────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [modo, setModo] = useState<"arato" | "externa">("arato");
  const [nfOrigem, setNfOrigem] = useState<NfOrigem | null>(null);
  const [buscaNf, setBuscaNf] = useState("");
  const [nfsOrigem, setNfsOrigem] = useState<NfOrigem[]>([]);
  const [itens, setItens] = useState<ItemRem[]>([novoItem()]);
  const [armazemId, setArmazemId] = useState("");
  const [depOrigem, setDepOrigem] = useState("");
  const [depTerceiro, setDepTerceiro] = useState("");
  const [cfop, setCfop] = useState("5905");
  const [cstRem, setCstRem] = useState("");   // CST do ICMS escolhido à mão ("" = automático pelo CFOP)
  const [natureza, setNatureza] = useState("Remessa para depósito em armazém geral");
  const [dataRem, setDataRem] = useState(hojeLocal());
  const [obs, setObs] = useState("");
  const [emitenteSel, setEmitenteSel] = useState("");
  const [ieSel, setIeSel] = useState("");   // IE (estabelecimento) emitente; sugerida pela fazenda do depósito de origem
  const [tr, setTr] = useState<Transp>(TRANSP_VAZIO);
  const [ext, setExt] = useState({ numero: "", serie: "", chave: "", xml: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const insumoPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);
  const armazem = pessoas.find(p => p.id === armazemId);
  const fazendaRem = nfOrigem?.fazenda_id ?? depositos.find(d => d.id === depOrigem)?.fazenda_id ?? fazendaId ?? ids[0];
  // IEs do emitente escolhido (ou de todos, no automático) e a sugerida pela fazenda da remessa
  const cpfEmitenteSel = dados.emitentes.find(e => `${e.modulo}|${e.fazenda_id}` === emitenteSel)?.cpf ?? "";
  const iesRemessa = dados.inscricoes.filter(i => !cpfEmitenteSel || i.cpf === cpfEmitenteSel.replace(/\D/g, ""));
  useEffect(() => {
    if (ieSel && iesRemessa.some(i => i.id === ieSel)) return;
    setIeSel(ieSugerida(iesRemessa, fazendaRem, cpfEmitenteSel)?.id ?? "");
  }, [fazendaRem, cpfEmitenteSel, dados.inscricoes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirNova() {
    setModo("arato"); setNfOrigem(null); setBuscaNf(""); setNfsOrigem([]); setItens([novoItem()]); setArmazemId("");
    setDepOrigem(""); setDepTerceiro(""); setCfop("5905"); setCstRem(""); setNatureza("Remessa para depósito em armazém geral");
    setDataRem(hojeLocal()); setObs(""); setEmitenteSel(""); setTr(TRANSP_VAZIO); setExt({ numero: "", serie: "", chave: "", xml: "" });
    setErro(""); setModal(true);
  }

  async function buscarNfsOrigem(t: string) {
    setBuscaNf(t);
    if (t.trim().length < 2) { setNfsOrigem([]); return; }
    let q = supabase.from("nf_entradas").select("id, numero, emitente_nome, data_emissao, valor_total, produtor_id, fazenda_id").in("fazenda_id", ids).eq("status", "processada");
    q = /^\d+$/.test(t.trim()) ? q.ilike("numero", `%${t.trim().replace(/^0+/, "")}%`) : q.ilike("emitente_nome", `%${t.trim()}%`);
    const { data } = await q.order("data_emissao", { ascending: false }).limit(30);
    setNfsOrigem((data ?? []) as NfOrigem[]);
  }

  async function escolherNfOrigem(nf: NfOrigem) {
    setNfOrigem(nf); setNfsOrigem([]);
    const [its, { data: cabNf }] = await Promise.all([
      listarNfEntradaItens(nf.id),
      supabase.from("nf_entradas").select("valor_desconto, valor_produtos").eq("id", nf.id).maybeSingle(),
    ]);
    // Desconto da NF de compra (só no cabeçalho) rateado pelos itens, proporcional ao valor de cada um: a remessa sai
    // com o valor líquido da compra (mesma regra da remessa feita pelas Notas de Venda). Antes saía com o valor cheio.
    const descontos = ratearDescontoNf(Number(cabNf?.valor_desconto ?? 0), Number(cabNf?.valor_produtos ?? 0), its.map(i => Number(i.valor_total ?? 0)));
    const liquido = (i: (typeof its)[number]) => Number(i.valor_total ?? 0) - (descontos[its.indexOf(i)] ?? 0);
    const doEstoque = its.filter(i => i.insumo_id);
    setItens(doEstoque.length ? doEstoque.map(i => ({
      key: crypto.randomUUID(), insumo_id: i.insumo_id!, descricao: insumoPorId.get(i.insumo_id!)?.nome ?? i.descricao_produto,
      ncm: i.ncm ?? insumoPorId.get(i.insumo_id!)?.ncm ?? "", unidade: insumoPorId.get(i.insumo_id!)?.unidade ?? i.unidade,
      quantidade: paraCampo(i.quantidade), valor_unitario: i.quantidade ? paraCampo(Math.round((liquido(i) / Number(i.quantidade)) * 1e6) / 1e6) : "",
    })) : [novoItem()]);
    const dep = its.find(i => i.deposito_id)?.deposito_id;
    if (dep) setDepOrigem(dep);
  }

  function escolherArmazem(id: string) {
    setArmazemId(id);
    const p = pessoas.find(x => x.id === id);
    const dep = depositos.find(d => ehDepTerceiro(d) && d.pessoa_id === id);
    setDepTerceiro(dep?.id ?? "");
    const ufOrig = ufFazenda.get(fazendaRem ?? "") ?? "";
    if (p?.estado && ufOrig) setCfop(p.estado === ufOrig ? "5905" : "6905");
  }

  async function criarDepositoArmazem() {
    if (!armazem || !fazendaRem) return;
    const { data, error } = await supabase.from("depositos").insert({ fazenda_id: fazendaRem, nome: `Armazém ${armazem.nome}`.slice(0, 80), tipo: "armazem_terceiro", pessoa_id: armazem.id, ativo: true }).select("*").single();
    if (error) { setErro(`Não foi possível criar o depósito do armazém: ${error.message}`); return; }
    setDepositos(p => [...p, data as Deposito]); setDepTerceiro((data as Deposito).id);
  }

  function setItem(key: string, patch: Partial<ItemRem>) { setItens(p => p.map(i => i.key === key ? { ...i, ...patch } : i)); }
  function escolherInsumo(key: string, id: string) {
    const ins = insumoPorId.get(id);
    // Valor que veio da NF/XML fica; o custo médio só preenche o que está vazio
    setItens(p => p.map(i => i.key !== key ? i : { ...i, insumo_id: id, descricao: ins?.nome ?? "", ncm: ins?.ncm || i.ncm, unidade: ins?.unidade ?? "",
      valor_unitario: i.valor_unitario || (ins?.custo_medio ? paraCampo(Math.round(ins.custo_medio * 10000) / 10000) : "") }));
  }
  const totalItens = itens.reduce((s, i) => s + numBR(i.quantidade) * numBR(i.valor_unitario), 0);

  function lerXmlExterno(xml: string) {
    const x = lerXmlNfe(xml);
    setExt({ numero: x.numero, serie: x.serie, chave: x.chave, xml });
    if (x.data_emissao) setDataRem(x.data_emissao);
    if (x.natureza) setNatureza(x.natureza);
    const c = x.itens[0]?.cfop; if (c) setCfop(c);
    const doc = x.cnpj_destinatario.replace(/\D/g, "");
    const p = pessoas.find(pp => (pp.cpf_cnpj ?? "").replace(/\D/g, "") === doc);
    if (p) escolherArmazem(p.id);
    if (!itens.some(i => i.insumo_id) && x.itens.length) vincularItensXml(x.itens).then(setItens);
  }

  // Liga cada item do XML externo ao produto do cadastro, para entrar no estoque na unidade dele (o XML de outro
  // sistema pode vir em outra unidade — achado real 28/10/2026: remessa em "L" de inoculante comprado em doses).
  // 1) NF de origem escolhida: o item dela com a mesma quantidade e valor unitário (ou a mesma descrição);
  // 2) senão, a mesma descrição de produto já processada numa NF de entrada da conta, ligada a um único produto.
  async function vincularItensXml(xmlItens: ReturnType<typeof lerXmlNfe>["itens"]): Promise<ItemRem[]> {
    const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
    const origem = nfOrigem ? (await listarNfEntradaItens(nfOrigem.id)).filter(i => i.insumo_id) : [];
    const usados = new Set<number>();
    const porDescricao = new Map<string, Set<string>>();
    if (!origem.length && ids.length) {
      const descs = [...new Set(xmlItens.map(i => i.descricao).filter(Boolean))];
      if (descs.length) {
        const { data } = await supabase.from("nf_entrada_itens").select("descricao_nf, insumo_id, nf_entradas!inner(fazenda_id, status)")
          .in("descricao_nf", descs).not("insumo_id", "is", null).in("nf_entradas.fazenda_id", ids).eq("nf_entradas.status", "processada").limit(1000);
        for (const h of (data ?? []) as { descricao_nf: string; insumo_id: string }[]) {
          const k = norm(h.descricao_nf); (porDescricao.get(k) ?? porDescricao.set(k, new Set()).get(k)!).add(h.insumo_id);
        }
      }
    }
    return xmlItens.map(i => {
      let insumoId = "";
      if (origem.length) {
        const achar = (cond: (o: (typeof origem)[number]) => boolean) => origem.findIndex((o, k) => !usados.has(k) && cond(o));
        let k = achar(o => Math.abs(Number(o.qtd_nf ?? o.quantidade) - i.quantidade) < 0.001 && Math.abs(Number(o.valor_unitario ?? 0) - i.valor_unitario) < 0.01);
        if (k < 0) k = achar(o => norm(o.descricao_nf) === norm(i.descricao));
        if (k >= 0) { usados.add(k); insumoId = origem[k].insumo_id!; }
      } else {
        const cand = porDescricao.get(norm(i.descricao));
        if (cand?.size === 1) insumoId = [...cand][0];
      }
      const ins = insumoId ? insumoPorId.get(insumoId) : undefined;
      return { key: crypto.randomUUID(), insumo_id: insumoId, descricao: ins?.nome ?? i.descricao, ncm: i.ncm || ins?.ncm || "",
        unidade: insumoId ? (ins?.unidade ?? i.unidade) : i.unidade, unidade_xml: i.unidade,
        quantidade: paraCampo(i.quantidade), valor_unitario: paraCampo(i.valor_unitario) };
    });
  }

  async function salvar() {
    const cf = cfop.replace(/\D/g, "");
    if (!armazem) { setErro("Escolha o armazém (destinatário)."); return; }
    if (!depOrigem || !depTerceiro) { setErro("Escolha o depósito de origem e o depósito do armazém."); return; }
    if (itens.some(i => !i.insumo_id || !(numBR(i.quantidade) > 0))) { setErro("Todo item precisa estar ligado a um produto do cadastro e ter quantidade."); return; }
    if (!/^\d{4}$/.test(cf)) { setErro("Informe o CFOP da remessa (ex.: 5905)."); return; }
    if (modo === "externa" && !ext.numero.trim()) { setErro("Informe o número da NF emitida."); return; }
    if (!(await confirmarAcao({ titulo: modo === "arato" ? "Emitir NF-e de remessa?" : "Registrar remessa?", perigo: false,
      mensagem: `${itens.length} item(ns), ${fmtBRL(totalItens)}, para ${armazem.nome}. O estoque passa de "${depositos.find(d => d.id === depOrigem)?.nome}" para "${depositos.find(d => d.id === depTerceiro)?.nome}". Não gera CP/CR.` }))) return;
    setSalvando(true); setErro("");
    try {
      const itensReg = itens.map(i => ({ insumo_id: i.insumo_id, descricao: i.descricao || insumoPorId.get(i.insumo_id)?.nome || "", ncm: i.ncm, unidade: (i.unidade || "UN").toUpperCase(), quantidade: numBR(i.quantidade), valor_unitario: numBR(i.valor_unitario), valor_total: Math.round(numBR(i.quantidade) * numBR(i.valor_unitario) * 100) / 100 }));
      let nf: { numero: string; serie?: string; chave?: string | null; protocolo?: string | null; xml?: string | null; xml_url?: string | null; emit?: Record<string, string | undefined> };
      let fazEmissao = fazendaRem;
      if (modo === "arato") {
        let cpfHint: string | undefined;
        if (nfOrigem?.produtor_id) { const { data: pr } = await supabase.from("produtores").select("cpf_cnpj").eq("id", nfOrigem.produtor_id).maybeSingle(); cpfHint = pr?.cpf_cnpj ?? undefined; }
        // A IE escolhida define o titular (CPF/CNPJ) do emitente; sem IE, cai na regra antiga (dono da NF de origem)
        const ie = dados.inscricoes.find(i => i.id === ieSel);
        if (ie && !ie.serie) { setErro(`A IE ${ie.ie} não tem série NF-e configurada. Configure em Parâmetros → Fiscal → Inscrições Estaduais ou escolha outra IE.`); setSalvando(false); return; }
        const em = resolverEmitente(dados.emitentes, emitenteSel, ie?.cpf ?? cpfHint);
        if ("erro" in em) { setErro(em.erro); setSalvando(false); return; }
        fazEmissao = em.fazenda_id;
        const { transporte, motorista } = montarTransporte(dados, tr);
        const resp = await fetch("/api/fiscal/emitir-nfe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fazenda_id: em.fazenda_id, modulo_key: em.modulo, cpf_cnpj_hint: em.cpf, emit_ie_override: ie?.ie || undefined,
            destinatario: {
              nome: armazem.nome, cpf_cnpj: (armazem.cpf_cnpj ?? "").replace(/\D/g, "") || undefined, ie: armazem.inscricao_est || undefined,
              logradouro: armazem.logradouro || undefined, numero: armazem.numero || undefined, bairro: armazem.bairro || undefined,
              municipio_ibge: armazem.municipio_ibge || undefined, municipio_nome: armazem.municipio || undefined, uf: armazem.estado || undefined,
              cep: (armazem.cep ?? "").replace(/\D/g, "") || undefined,
            },
            itens: itensReg.map(i => ({ descricao: i.descricao, ncm: i.ncm || "00000000", cfop: cf, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, cst_icms: cstRem || undefined })),
            natureza, inf_cpl: [obs, nfOrigem ? `Ref. NF de compra ${nfOrigem.numero} — ${nfOrigem.emitente_nome ?? ""}` : "", motorista].filter(Boolean).join(" | ") || undefined,
            frete: tr.frete, transporte, tipo: "1",
          }),
        });
        const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; serie?: string; protocolo?: string; xmlUrl?: string; cStat?: string; xMotivo?: string } & Record<string, string | undefined>;
        if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);
        nf = { numero: res.numero ?? "", serie: res.serie, chave: res.chave, protocolo: res.protocolo, xml_url: res.xmlUrl,
          emit: { emit_razao: res.emit_razao, emit_cnpj: res.emit_cnpj, emit_ie: res.emit_ie, emit_endereco: res.emit_endereco, emit_numero: res.emit_numero, emit_bairro: res.emit_bairro, emit_municipio: res.emit_municipio, emit_uf: res.emit_uf, emit_cep: res.emit_cep, emit_fone: res.emit_fone } };
      } else {
        const x = ext.xml ? lerXmlNfe(ext.xml) : null;
        nf = { numero: ext.numero.trim(), serie: ext.serie.trim() || undefined, chave: ext.chave.replace(/\D/g, "") || null, protocolo: x?.protocolo || null, xml: ext.xml || null, emit: x?.emit_dados };
      }
      const r = await fetch("/api/fiscal/remessas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "registrar", fazenda_id: fazEmissao, nf_entrada_id: nfOrigem?.id ?? null, emissao: modo, cfop: cf, cfop_retorno: CFOP_RETORNO[cf] ?? cf, natureza,
          destinatario: { pessoa_id: armazem.id, nome: armazem.nome, uf: armazem.estado ?? null },
          deposito_origem_id: depOrigem, deposito_terceiro_id: depTerceiro, data: dataRem, observacao: obs || undefined, nf, itens: itensReg,
        }),
      });
      const j = await r.json() as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(modo === "arato" ? `A NF-e ${nf.numero} foi autorizada, mas o registro da remessa falhou: ${j.error}. Avise o suporte antes de emitir de novo.` : j.error);
      setMsg(`✓ Remessa NF ${nf.numero} ${modo === "arato" ? "emitida" : "registrada"}: estoque transferido para ${depositos.find(d => d.id === depTerceiro)?.nome}.`);
      setModal(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a remessa.");
    } finally {
      setSalvando(false);
    }
  }

  // Botão "Emitir NF Remessa" da NF de entrada: abre já com a NF de origem
  useEffect(() => {
    const id = params.get("nf_entrada_id");
    if (!id || loading || modal) return;
    (async () => {
      const { data } = await supabase.from("nf_entradas").select("id, numero, emitente_nome, data_emissao, valor_total, produtor_id, fazenda_id").eq("id", id).maybeSingle();
      abrirNova();
      if (data) await escolherNfOrigem(data as NfOrigem);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const filtradas = remessas.filter(r => {
    if (filtroSt && r.status !== filtroSt) return false;
    // Busca: armazém, nº/chave da remessa, nº das NFs de retorno, produto e CFOP
    const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(busca.trim());
    if (!q) return true;
    const retornos = (r.retornos ?? []) as { numero?: string; chave?: string }[];
    const itensR = (r.itens_json ?? []) as { descricao?: string; nome?: string }[];
    return [r.destinatario_nome, r.nf_remessa_numero, r.nf_remessa_chave, r.nf_retorno_numero, r.cfop_remessa, r.natureza_remessa,
      ...retornos.flatMap(x => [x.numero, x.chave]), ...itensR.map(i => i.descricao ?? i.nome)].some(c => norm(c).includes(q));
  });
  const depsProprios = depositos.filter(d => !ehDepTerceiro(d));
  const depsTerceiros = depositos.filter(ehDepTerceiro);

  return (
    <>
      <TopNav />
      <main style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Remessas</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Mercadoria ou máquina que sai e depois volta: armazém geral, depósito, conserto, comodato. O retorno fica em Retornos.</div>
          </div>
          {aba === "mercadorias" && <OperationalButton data-arato-button="primary" onClick={abrirNova} style={btnV}>+ Nova Remessa</OperationalButton>}
        </OperationalHeading>

        <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid var(--border-table)", marginBottom: 16 }}>
          {([["mercadorias", "Mercadorias (armazém / depósito)"], ["maquinas", "Máquinas e equipamentos"]] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setAba(k)} style={{ background: "none", border: "none", borderBottom: aba === k ? "2px solid #1A4870" : "2px solid transparent", color: aba === k ? "#1A4870" : "var(--text-2)", fontWeight: aba === k ? 700 : 500, fontSize: 13, padding: "8px 14px", cursor: "pointer" }}>{t}</button>
          ))}
        </div>

        {aba === "maquinas" ? <RemessasMaquinas retornoId={params.get("retorno_maquina")} /> : <>

        {msg && <div style={{ marginBottom: 12, padding: 10, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 13 }}>{msg}</div>}

        <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por armazém, nº, chave, produto ou NF de retorno…" style={{ ...inp, maxWidth: 320 }} />
          <SelectField value={filtroSt} onChange={e => setFiltroSt(e.target.value)} style={{ ...inp, maxWidth: 200 }}>
            <option value="">Todos os status</option>
            <option value="emitida">Aguardando retorno</option>
            <option value="retornada">Retornada</option>
            <option value="cancelada">Cancelada</option>
          </SelectField>
        </OperationalFilters>

        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead><tr>{["NF remessa", "Data", "Armazém", "CFOP", "Emissão", "Remetido", "Já voltou", "Falta voltar", "Status", ""].map(h => <th key={h} style={{ ...th, textAlign: ["Remetido", "Já voltou", "Falta voltar"].includes(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ ...td, textAlign: "center", padding: 20, color: "var(--text-3)" }}>Carregando…</td></tr>}
              {!loading && filtradas.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: "center", padding: 20, color: "var(--text-3)" }}>Nenhuma remessa.</td></tr>}
              {filtradas.map(r => {
                const sb = STATUS_BADGE[r.status] ?? STATUS_BADGE.emitida;
                const falta = Math.max(0, valorRemetido(r) - Number(r.valor_retornado ?? 0));
                const aberta = expandidas.has(r.id);
                const itensR = (Array.isArray(r.itens_json) ? r.itens_json : []) as { descricao?: string; descricao_produto?: string; nome?: string; quantidade?: number; unidade?: string; unidade_nf?: string; valor_total?: number }[];
                const nfo = r.nf_entrada_id ? nfOrigemInfo[r.nf_entrada_id] : null;
                const vol = volumes(r);
                const fRet = fracaoRetornada(r);
                const subVol: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", fontWeight: 400 };
                return (
                  <Fragment key={r.id}>
                  <tr style={{ background: aberta ? "#F4F6FA" : undefined }}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => alternarRemessa(r)} title={aberta ? "Fechar" : "Ver as NFs ligadas a esta remessa"} aria-expanded={aberta}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#1A4870", fontSize: 11, padding: "0 6px 0 0" }}>{aberta ? "▼" : "▶"}</button>
                      {r.nf_remessa_numero ?? "—"}
                    </td>
                    <td style={td}>{fmtData(r.nf_remessa_data)}</td>
                    <td style={td}>{r.destinatario_nome}</td>
                    <td style={td}>{r.cfop_remessa}</td>
                    <td style={td}>{r.emissao === "externa" ? "Fora do Arato" : r.emissao === "arato" ? "Arato" : "—"}{r.estoque_transferido ? "" : <div style={{ fontSize: 10, color: "var(--text-3)" }}>estoque baixado (antiga)</div>}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(valorRemetido(r))}{vol.remetido && <div style={subVol}>{vol.remetido}</div>}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(r.status === "retornada" && !r.valor_retornado ? valorRemetido(r) : r.valor_retornado ?? 0)}{vol.voltou && <div style={subVol}>{vol.voltou}</div>}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.status === "retornada" ? fmtBRL(0) : fmtBRL(falta)}{vol.falta && <div style={subVol}>{vol.falta}</div>}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: sb.bg, color: sb.cl }}>{sb.label}</span></td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.nf_remessa_chave && <a href={`/api/fiscal/danfe?chave=${r.nf_remessa_chave}&fazenda_id=${r.fazenda_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1A4870", fontWeight: 600, marginRight: 10 }}>🖨 DANFE</a>}
                      {r.status === "emitida" && <Link href="/fiscal/retornos" style={{ fontSize: 11, color: "#1A6B3C", fontWeight: 600 }}>Retorno →</Link>}
                      {r.status === "emitida" && !Number(r.valor_retornado ?? 0) && !(r.retornos ?? []).length && (
                        <button type="button" onClick={e => { e.stopPropagation(); excluirRemessa(r); }}
                          style={{ marginLeft: 10, fontSize: 11, color: "#791F1F", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Excluir</button>
                      )}
                    </td>
                  </tr>
                  {aberta && (
                    <tr>
                      <td colSpan={10} style={{ padding: "10px 16px 14px 34px", background: "#F4F6FA", borderBottom: "0.5px solid var(--border-table)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0B2D50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>NF de compra de origem</div>
                            {r.nf_entrada_id
                              ? (nfo === undefined ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>Carregando…</div>
                                : nfo ? <div style={{ fontSize: 12 }}>NF {nfo.numero} · {nfo.emitente_nome} · {fmtData(nfo.data_emissao)} · {fmtBRL(nfo.valor_total)}</div>
                                : <div style={{ fontSize: 12, color: "var(--text-3)" }}>NF de origem não encontrada.</div>)
                              : <div style={{ fontSize: 12, color: "var(--text-3)" }}>{r.nf_compra_chave ? `Chave ${r.nf_compra_chave}` : "Sem NF de compra ligada."}</div>}
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0B2D50", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 6px" }}>Itens remetidos</div>
                            {itensR.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>Sem itens registrados.</div> : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead><tr>{["Produto", "Remetido", "Já voltou", "Falta voltar", "Valor"].map((h, k) => <th key={h} style={{ padding: "2px 0 4px", paddingRight: k && k < 4 ? 8 : 0, textAlign: k ? "right" : "left", fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                                <tbody>
                                  {itensR.map((it, k) => {
                                    const q = Number(it.quantidade ?? 0), u = it.unidade ?? it.unidade_nf ?? "";
                                    const fq = (n: number) => `${(Math.round(n * 1000) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${u}`;
                                    return (
                                    <tr key={k}>
                                      <td style={{ padding: "3px 0", color: "var(--text-1)" }}>{it.descricao ?? it.descricao_produto ?? it.nome ?? "—"}</td>
                                      <td style={{ padding: "3px 8px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fq(q)}</td>
                                      <td style={{ padding: "3px 8px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fq(q * fRet)}</td>
                                      <td style={{ padding: "3px 8px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fq(q * (1 - fRet))}</td>
                                      <td style={{ padding: "3px 0", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.valor_total)}</td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0B2D50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>NFs de retorno ligadas ({(r.retornos ?? []).length})</div>
                            {(r.retornos ?? []).length === 0
                              ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>{r.status === "retornada" && r.nf_retorno_numero ? `NF ${r.nf_retorno_numero} (${fmtData(r.nf_retorno_data)})` : "Nenhum retorno ainda."}</div>
                              : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead><tr>{["NF", "Data", "Emitente", "Valor"].map(h => <th key={h} style={{ textAlign: h === "Valor" ? "right" : "left", fontSize: 10, color: "var(--text-3)", fontWeight: 600, padding: "2px 0" }}>{h}</th>)}</tr></thead>
                                <tbody>
                                  {(r.retornos ?? []).map((x, k) => (
                                    <tr key={k}>
                                      <td style={{ padding: "3px 0", fontWeight: 600 }}>
                                        {x.chave ? <a href={`/api/fiscal/danfe?chave=${x.chave}&fazenda_id=${r.fazenda_id}`} target="_blank" rel="noreferrer" style={{ color: "#1A4870" }} title="Abrir DANFE">{x.numero}</a> : x.numero}
                                      </td>
                                      <td style={{ padding: "3px 6px" }}>{fmtData(x.data)}</td>
                                      <td style={{ padding: "3px 6px", color: "var(--text-2)" }}>{x.emitente ?? "—"}</td>
                                      <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(x.valor)}</td>
                                    </tr>
                                  ))}
                                  <tr><td colSpan={3} style={{ padding: "4px 0", fontWeight: 600, borderTop: "0.5px solid var(--border-table)" }}>Total retornado</td>
                                    <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, borderTop: "0.5px solid var(--border-table)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL((r.retornos ?? []).reduce((t, x) => t + Number(x.valor ?? 0), 0))}</td></tr>
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>}
      </main>

      {modal && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div data-arato-dialog="form" style={{ background: "var(--bg-card)", borderRadius: 14, width: "min(96vw, 980px)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Nova Remessa</div>
              <OperationalButton data-arato-button="icon" onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</OperationalButton>
            </div>
            <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {([["arato", "Emitir NF-e de remessa pelo Arato"], ["externa", "NF de remessa já emitida em outro sistema"]] as const).map(([m, t]) => (
                  <button key={m} type="button" onClick={() => setModo(m)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: modo === m ? 700 : 500,
                    border: modo === m ? "1.5px solid #1A4870" : "0.5px solid var(--border)", background: modo === m ? "#D5E8F5" : "var(--bg-card)", color: modo === m ? "#0B2D50" : "var(--text-2)" }}>{t}</button>
                ))}
              </div>

              {modo === "externa" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 2fr 1fr", gap: 10, alignItems: "end" }}>
                  <div><label style={lbl}>Número *</label><input value={ext.numero} onChange={e => setExt(p => ({ ...p, numero: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Série</label><input value={ext.serie} onChange={e => setExt(p => ({ ...p, serie: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Chave de acesso</label><input value={ext.chave} onChange={e => setExt(p => ({ ...p, chave: e.target.value }))} style={inp} /></div>
                  <div>
                    <label style={lbl}>XML (opcional)</label>
                    <input type="file" accept=".xml" onChange={async e => { const f = e.target.files?.[0]; if (f) lerXmlExterno(await f.text()); }} style={{ fontSize: 11 }} />
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>NF de entrada de origem (opcional — traz os itens)</label>
                  {nfOrigem ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", border: "0.5px solid #1A4870", borderRadius: 8, background: "#D5E8F5", fontSize: 12 }}>
                      <span><strong>NF {nfOrigem.numero}</strong> · {nfOrigem.emitente_nome ?? "—"} · {fmtData(nfOrigem.data_emissao)} · {fmtBRL(nfOrigem.valor_total)}</span>
                      <button type="button" onClick={() => setNfOrigem(null)} style={{ background: "none", border: "none", color: "#1A4870", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>trocar</button>
                    </div>
                  ) : (
                    <>
                      <input value={buscaNf} onChange={e => buscarNfsOrigem(e.target.value)} style={inp} placeholder="Nº da NF ou fornecedor" />
                      {nfsOrigem.length > 0 && (
                        <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
                          {nfsOrigem.map(n => (
                            <button key={n.id} type="button" onClick={() => escolherNfOrigem(n)} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "6px 10px", background: "none", border: "none", borderBottom: "0.5px solid var(--border-table)", cursor: "pointer", fontSize: 12, color: "var(--text-1)", textAlign: "left" }}>
                              <span>NF {n.numero} · {n.emitente_nome ?? "—"} · {fmtData(n.data_emissao)}</span><span>{fmtBRL(n.valor_total)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div><label style={lbl}>Data da remessa</label><input type="date" value={dataRem} onChange={e => setDataRem(e.target.value)} style={inp} /></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Armazém (destinatário) *</label>
                  <SelectBusca value={armazemId} onChange={escolherArmazem} placeholder="— selecionar —" options={pessoas.map(p => ({ value: p.id, label: `${p.nome}${p.cpf_cnpj ? " · " + p.cpf_cnpj : ""}` }))} />
                </div>
                <div>
                  <label style={lbl}>Depósito de origem *</label>
                  <select value={depOrigem} onChange={e => setDepOrigem(e.target.value)} style={inp}>
                    <option value="">Selecionar…</option>
                    {depsProprios.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Depósito do armazém *</label>
                  <select value={depTerceiro} onChange={e => setDepTerceiro(e.target.value)} style={inp}>
                    <option value="">Selecionar…</option>
                    {depsTerceiros.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                  {armazem && !depTerceiro && <button type="button" onClick={criarDepositoArmazem} style={{ marginTop: 4, background: "none", border: "none", color: "#1A4870", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>+ criar depósito &quot;Armazém {armazem.nome}&quot;</button>}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "110px 2fr 2fr", gap: 12 }}>
                <div><label style={lbl}>CFOP *</label><input value={cfop} onChange={e => {
                  const c = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCfop(c);
                  // Natureza sugerida pelo CFOP (só troca o texto padrão; o que o usuário digitou fica)
                  const nat = NATUREZA_REMESSA[c];
                  if (nat && (!natureza || Object.values(NATUREZA_REMESSA).includes(natureza))) setNatureza(nat);
                }} style={inp} /></div>
                <div><label style={lbl}>Natureza da operação</label><input value={natureza} onChange={e => setNatureza(e.target.value)} style={inp} /></div>
                {modo === "arato" ? (
                  <div>
                    <label style={lbl}>Emitente da NF</label>
                    <select value={emitenteSel} onChange={e => setEmitenteSel(e.target.value)} style={inp}>
                      <option value="">{dados.emitentes.length === 1 ? dados.emitentes[0].nome : "Automático (dono da NF de origem)"}</option>
                      {dados.emitentes.length > 1 && dados.emitentes.map(e => <option key={`${e.modulo}|${e.fazenda_id}`} value={`${e.modulo}|${e.fazenda_id}`}>{e.nome} — {e.cpf}{e.ie ? ` · IE ${e.ie}` : ""}</option>)}
                    </select>
                  </div>
                ) : <div />}
              </div>
              {modo === "arato" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <SeletorIE ies={iesRemessa} value={ieSel} onChange={setIeSel} inp={inp} lbl={lbl} />
                  <div>
                    <label style={lbl}>CST do ICMS</label>
                    <select value={cstRem} onChange={e => setCstRem(e.target.value)} style={inp}>
                      <option value="">Automático pelo CFOP — {cstExibicaoPorCfop(cfop)}</option>
                      <option value="40">040 — Isenta</option>
                      <option value="41">041 — Não tributada</option>
                      <option value="50">050 — Suspensão (industrialização, conserto…)</option>
                      <option value="51">051 — Diferimento</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label style={lbl}>Itens (no cadastro e na unidade do estoque)</label>
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead><tr>{["Produto do cadastro", "NCM", "Un.", "Quantidade", "Valor unit.", "Total", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {itens.map(i => (
                        <tr key={i.key}>
                          <td style={{ ...td, minWidth: 260 }}>
                            <SelectBusca value={i.insumo_id} onChange={v => escolherInsumo(i.key, v)} placeholder={i.descricao || "Produto…"} options={insumos.map(s => ({ value: s.id, label: `${s.nome} (${s.unidade})` }))} />
                          </td>
                          <td style={td}><input value={i.ncm} onChange={e => setItem(i.key, { ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })} style={{ ...inp, width: 100 }} /></td>
                          <td style={td}>{i.unidade || "—"}{i.insumo_id && i.unidade_xml && i.unidade_xml.toLowerCase() !== i.unidade.toLowerCase() && <div style={{ fontSize: 10, color: "var(--text-3)" }} title="Unidade escrita no XML da remessa. A quantidade entra no estoque na unidade do cadastro — confira se precisa converter.">XML: {i.unidade_xml}</div>}</td>
                          <td style={td}><input value={i.quantidade} onChange={e => setItem(i.key, { quantidade: e.target.value })} style={{ ...inp, width: 110 }} /></td>
                          <td style={td}><input value={i.valor_unitario} onChange={e => setItem(i.key, { valor_unitario: e.target.value })} style={{ ...inp, width: 110 }} /></td>
                          <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(numBR(i.quantidade) * numBR(i.valor_unitario))}</td>
                          <td style={td}>{itens.length > 1 && <button type="button" onClick={() => setItens(p => p.filter(x => x.key !== i.key))} style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer" }}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                  <button type="button" onClick={() => setItens(p => [...p, novoItem()])} style={{ background: "none", border: "none", color: "#1A4870", cursor: "pointer", fontSize: 12, padding: 0 }}>+ item</button>
                  <strong>Total {fmtBRL(totalItens)}</strong>
                </div>
              </div>

              {modo === "arato" && <BlocoTransporte d={dados} t={tr} set={setTr} inp={inp} lbl={lbl} />}
              <div><label style={lbl}>Observação / informações complementares</label><input value={obs} onChange={e => setObs(e.target.value)} style={inp} /></div>
              {erro && <div style={{ padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{erro}</div>}
            </div>
            <div style={{ padding: "12px 22px", borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <OperationalButton data-arato-button="secondary" onClick={() => setModal(false)} style={btnR}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={salvar} disabled={salvando} style={{ ...btnV, opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvando…" : modo === "arato" ? "Emitir NF-e de remessa" : "Registrar remessa"}</OperationalButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function RemessasPage() {
  return <Suspense fallback={null}><RemessasConteudo /></Suspense>;
}
