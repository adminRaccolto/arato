"use client";
export const dynamic = "force-dynamic";
import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ContaBancaria { id: string; nome: string; banco: string; agencia?: string; conta?: string }

interface LinhaOFX {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  conciliado: boolean;
  lancamento_id?: string;
  lancamento_ids?: string[];
  lancamento_desc?: string;
  lancamento_valor?: number;
}

interface Lancamento {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  valor_pago?: number;
  data_vencimento: string;
  data_baixa?: string;
  status: string;
  categoria?: string;
}

interface Extrato {
  id: string;
  conta_id: string;
  conta_nome: string;
  data_importacao: string;
  data_inicio: string;
  data_fim: string;
  total_linhas: number;
  conciliados: number;
  pendentes: number;
  linhas: LinhaOFX[];
}

interface HistoricoConciliacao {
  id: string;
  fazenda_id: string;
  extrato_id: string;
  fitid: string;
  conta_nome: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  tipo: string;
  acao: "conciliado" | "desvinculado";
  lancamento_ids: string[];
  lancamento_desc: string;
  created_at: string;
  periodo_inicio?: string;
  periodo_fim?: string;
}

interface FormTesouraria {
  descricao: string;
  tipo: "pagar" | "receber";
  valor: number;
  data: string;
  tipo_op: string;  // id da operação de tesouraria (padrão ou custom)
  og_id: string;    // operacao_gerencial_id para vínculo fiscal
}

interface OpTesouraria {
  id: string;
  nome: string;
  tipo: "entrada" | "saida" | "ambos" | "transferencia" | "ajuste";
  descricao?: string;
  operacao_gerencial_id?: string | null;
}

interface OgMin { id: string; classificacao: string; descricao: string; tipo: string; }

// Operações padrão idênticas às de app/financeiro/tesouraria/operacoes/page.tsx
const OPS_TESOURARIA_PADRAO: OpTesouraria[] = [
  { id: "__taxa__",          nome: "Taxa Bancária",             tipo: "saida",        descricao: "TED, DOC, boletos, tarifas de manutenção, IOF" },
  { id: "__resgate__",       nome: "Resgate de Aplicação",      tipo: "entrada",      descricao: "Resgate de investimentos financeiros" },
  { id: "__aplicacao__",     nome: "Aplicação Financeira",      tipo: "saida",        descricao: "Investimento em CDB, LCA, tesouro direto, etc." },
  { id: "__transferencia__", nome: "Transferência entre Contas",tipo: "transferencia",descricao: "Movimentação entre contas bancárias próprias" },
  { id: "__ajuste__",        nome: "Ajuste de Saldo",           tipo: "ajuste",       descricao: "Correção de divergência entre saldo real e sistema" },
  { id: "__mutuo__",         nome: "Mútuo entre Empresas",      tipo: "ambos",        descricao: "Empréstimos entre empresas do grupo" },
  { id: "__seguro__",        nome: "Seguros",                   tipo: "saida",        descricao: "Prêmios e parcelas de apólices de seguro" },
  { id: "__consorcio__",     nome: "Consórcio",                 tipo: "saida",        descricao: "Parcelas mensais de consórcio" },
  { id: "__outros__",        nome: "Outros",                    tipo: "ambos",        descricao: "Operações financeiras diversas não classificadas" },
];

// ─── Parse OFX ────────────────────────────────────────────────────────────────
function parseOFX(texto: string): LinhaOFX[] {
  const linhas: LinhaOFX[] = [];
  const transacoes = texto.split(/<STMTTRN>/i).slice(1);
  for (const t of transacoes) {
    const get = (tag: string) => {
      const m = t.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const fitid  = get("FITID");
    const dtPost = get("DTPOSTED");
    const trnAmt = parseFloat(get("TRNAMT").replace(",", "."));
    const memo   = get("MEMO") || get("NAME") || "(sem descrição)";
    if (!fitid || isNaN(trnAmt)) continue;
    const data = dtPost.length >= 8
      ? `${dtPost.slice(0, 4)}-${dtPost.slice(4, 6)}-${dtPost.slice(6, 8)}`
      : "";
    linhas.push({ id: fitid, data, descricao: memo, valor: Math.abs(trnAmt), tipo: trnAmt > 0 ? "credito" : "debito", conciliado: false });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

// ─── Auto-match ───────────────────────────────────────────────────────────────
function autoMatch(linhas: LinhaOFX[], lancamentos: Lancamento[]): LinhaOFX[] {
  return linhas.map(linha => {
    if (linha.conciliado) return linha;
    const dl = new Date(linha.data + "T00:00:00");
    const candidatos = lancamentos.filter(l => {
      const vl = l.valor_pago ?? l.valor;
      if (Math.abs(vl - linha.valor) > 0.02) return false;
      if (linha.tipo === "credito" && l.tipo !== "receber") return false;
      if (linha.tipo === "debito"  && l.tipo !== "pagar")   return false;
      const dr = new Date(((l.data_baixa ?? l.data_vencimento) + "T00:00:00"));
      return Math.abs((dl.getTime() - dr.getTime()) / 86400000) <= 7;
    });
    if (candidatos.length === 0) return linha;
    // Score: proximidade de data (dias × 10) + penalidade de status (0=baixado, 1=outros)
    const scored = candidatos
      .map(c => {
        const dr = new Date(((c.data_baixa ?? c.data_vencimento) + "T00:00:00"));
        const diffDays = Math.abs((dl.getTime() - dr.getTime()) / 86400000);
        return { c, diffDays, score: diffDays * 10 + (c.status === "baixado" ? 0 : 1) };
      })
      .sort((a, b) => a.score - b.score);
    const best = scored[0];
    // Concilia automaticamente: único candidato OU melhor candidato dentro de 2 dias
    if (candidatos.length === 1 || best.diffDays <= 2) {
      const c = best.c;
      return { ...linha, conciliado: true, lancamento_id: c.id, lancamento_ids: [c.id], lancamento_desc: c.descricao, lancamento_valor: c.valor_pago ?? c.valor };
    }
    return linha;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt  = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const hoje   = () => new Date().toISOString().slice(0, 10);

const ehParcial = (l: Lancamento) =>
  l.valor_pago !== undefined && l.valor_pago !== null && l.valor_pago > 0 && l.valor_pago < l.valor;

const statusMeta = (l: Lancamento): { label: string; bg: string; color: string } => {
  if (ehParcial(l)) return { label: "parcial", bg: "#FEF9C3", color: "#A16207" };
  if (l.status === "baixado") return { label: "baixado", bg: "#DCFCE7", color: "#16A34A" };
  if (l.status === "vencido") return { label: "vencido", bg: "#FEE2E2", color: "#DC2626" };
  return { label: "aberto", bg: "#FEF3C7", color: "#92400E" };
};

const COL_INIT = [80, 320, 110, 90, 260, 135];


// ─── Componente ───────────────────────────────────────────────────────────────
export default function Conciliacao() {
  return <Suspense><ConciliacaoInner /></Suspense>;
}

function ConciliacaoInner() {
  const { fazendaId, fazendaIds, contaId } = useAuth();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [contas, setContas]           = useState<ContaBancaria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [extratos, setExtratos]       = useState<Extrato[]>([]);
  const [extrato, setExtrato]         = useState<Extrato | null>(null);
  const [loading, setLoading]         = useState(false);
  const [abaAtiva, setAbaAtiva]       = useState<"extrato"|"historico">("extrato");
  const [historico, setHistorico]     = useState<HistoricoConciliacao[]>([]);

  const [contaSel, setContaSel]     = useState<string>("");
  const [filtroPend, setFiltroPend] = useState(() => searchParams.get("pendentes") === "true");
  const [busca, setBusca]           = useState("");

  // Painel esquerdo — filtros
  const [buscaLanc, setBuscaLanc]           = useState("");
  const [filtroLancTipo, setFiltroLancTipo] = useState<"todos"|"pagar"|"receber">("todos");
  const [filtroLancStatus, setFiltroLancStatus] = useState<"todos"|"aberto"|"baixado"|"parcial">("todos");
  const [filtroLancDe, setFiltroLancDe]     = useState<string>("");
  const [filtroLancAte, setFiltroLancAte]   = useState<string>("");

  // Período de fetch dos lançamentos (header — antes de importar OFX)
  const [periodoFetchDe, setPeriodoFetchDe] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodoFetchAte, setPeriodoFetchAte] = useState<string>(() => {
    const d = new Date();
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return ultimo.toISOString().slice(0, 10);
  });

  // Vinculação (bordero)
  const [linhaAtiva, setLinhaAtiva] = useState<LinhaOFX | null>(null);
  const [lancsSel, setLancsSel]     = useState<Set<string>>(new Set());
  const [salvando, setSalvando]     = useState(false);

  // Tesouraria inline
  const [modalTes, setModalTes]   = useState<LinhaOFX | null>(null);
  const [fTes, setFTes]           = useState<FormTesouraria>({ descricao: "", tipo: "pagar", valor: 0, data: "", tipo_op: "__taxa__", og_id: "" });
  const [savingTes, setSavingTes] = useState(false);
  const [opsCustom, setOpsCustom] = useState<OpTesouraria[]>([]);
  const [ogsDisponiveis, setOgsDisponiveis] = useState<OgMin[]>([]);

  // Colunas redimensionáveis
  const [colWidths, setColWidths] = useState<number[]>([...COL_INIT]);

  // ── Carregar dados ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [cR, lR, exR, hR, ogR, gsR] = await Promise.all([
      supabase.from("contas_bancarias").select("id,nome,banco,agencia,conta").in("fazenda_id", fazendaIds).order("nome"),
      supabase.from("lancamentos")
        .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
        .in("fazenda_id", fazendaIds)
        .not("status", "eq", "cancelado")
        .order("data_vencimento", { ascending: false })
        .limit(600),
      supabase.from("extratos_bancarios").select("*").in("fazenda_id", fazendaIds).order("data_importacao", { ascending: false }),
      supabase.from("historico_conciliacao").select("*").in("fazenda_id", fazendaIds).order("created_at", { ascending: false }).limit(200),
      supabase.from("operacoes_tesouraria")
        .select("id,nome,tipo,operacao_gerencial_id")
        .in("fazenda_id", fazendaIds)
        .eq("ativo", true)
        .order("nome"),
      supabase.from("operacoes_gerenciais")
        .select("id,classificacao,descricao,tipo")
        .or(`conta_id.eq.${contaId},and(fazenda_id.is.null,conta_id.is.null)`)
        .neq("inativo", true)
        .order("classificacao"),
    ]);
    if (cR.data) setContas(cR.data as ContaBancaria[]);
    if (lR.data) setLancamentos(lR.data as Lancamento[]);
    if (hR.data) setHistorico(hR.data as HistoricoConciliacao[]);
    if (ogR.data) setOpsCustom(ogR.data as OpTesouraria[]);
    if (gsR.data) setOgsDisponiveis(gsR.data as OgMin[]);

    if (exR.data) {
      const lista = exR.data as unknown as Extrato[];
      setExtratos(lista);
      if (searchParams.get("pendentes") === "true") {
        const primeiroPend = lista.find(e => e.pendentes > 0);
        if (primeiroPend) { setExtrato(primeiroPend); setFiltroPend(true); }
      }
    }
  }, [fazendaId, fazendaIds, contaId, searchParams]);

  useEffect(() => { carregar(); }, [carregar]);

  // Pré-preenche o filtro de período ao carregar um extrato (±15 dias de folga)
  useEffect(() => {
    if (!extrato) { setFiltroLancDe(""); setFiltroLancAte(""); return; }
    const dIni = new Date(extrato.data_inicio + "T00:00:00");
    dIni.setDate(dIni.getDate() - 15);
    const dFim = new Date(extrato.data_fim + "T00:00:00");
    dFim.setDate(dFim.getDate() + 15);
    setFiltroLancDe(dIni.toISOString().slice(0, 10));
    setFiltroLancAte(dFim.toISOString().slice(0, 10));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrato?.id]);

  const [lancRefresh, setLancRefresh] = useState(false);
  async function recarregarLancamentos() {
    if (!fazendaId || lancRefresh) return;
    setLancRefresh(true);
    try {
      const { data } = await supabase.from("lancamentos")
        .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
        .in("fazenda_id", fazendaIds)
        .not("status", "eq", "cancelado")
        .order("data_vencimento", { ascending: false })
        .limit(600);
      if (data) setLancamentos(data as Lancamento[]);
    } finally { setLancRefresh(false); }
  }

  async function recarregarParaPeriodo(de?: string, ate?: string) {
    const dFrom = de ?? periodoFetchDe;
    const dTo   = ate ?? periodoFetchAte;
    if (!fazendaId || !dFrom || !dTo || lancRefresh) return;
    setLancRefresh(true);
    try {
      const { data } = await supabase.from("lancamentos")
        .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
        .in("fazenda_id", fazendaIds)
        .not("status", "eq", "cancelado")
        .gte("data_vencimento", dFrom)
        .lte("data_vencimento", dTo)
        .order("data_vencimento", { ascending: false });
      if (data) {
        setLancamentos(prev => {
          const mapa = new Map(prev.map(l => [l.id, l]));
          for (const l of data as Lancamento[]) mapa.set(l.id, l);
          return Array.from(mapa.values()).sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));
        });
      }
    } finally { setLancRefresh(false); }
  }

  // ── Upload OFX ─────────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fazendaId) return;
    setLoading(true);
    const texto = await file.text();
    let linhas = parseOFX(texto);
    if (linhas.length === 0) {
      alert("Nenhuma transação encontrada no arquivo OFX.");
      setLoading(false);
      return;
    }
    // Fetch fresco para o período do OFX (±15 dias) — garante lançamentos atualizados
    const dIniMatch = new Date((linhas[0]?.data ?? hoje()) + "T00:00:00");
    dIniMatch.setDate(dIniMatch.getDate() - 15);
    const dFimMatch = new Date((linhas[linhas.length - 1]?.data ?? hoje()) + "T00:00:00");
    dFimMatch.setDate(dFimMatch.getDate() + 15);
    const { data: lancFresh } = await supabase.from("lancamentos")
      .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
      .in("fazenda_id", fazendaIds)
      .not("status", "eq", "cancelado")
      .gte("data_vencimento", dIniMatch.toISOString().slice(0, 10))
      .lte("data_vencimento", dFimMatch.toISOString().slice(0, 10));
    let lancParaMatch = lancamentos;
    if (lancFresh && lancFresh.length > 0) {
      const mapa = new Map(lancamentos.map(l => [l.id, l]));
      for (const l of lancFresh as Lancamento[]) mapa.set(l.id, l);
      lancParaMatch = Array.from(mapa.values()).sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));
      setLancamentos(lancParaMatch);
    }
    linhas = autoMatch(linhas, lancParaMatch);
    const dataInicio  = linhas[0]?.data ?? hoje();
    const dataFim     = linhas[linhas.length - 1]?.data ?? hoje();
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    const contaObj    = contas.find(c => c.id === contaSel);

    const novoExtrato: Extrato = {
      id: `ext-${Date.now()}`,
      conta_id: contaSel,
      conta_nome: contaObj?.nome ?? contaSel,
      data_importacao: hoje(),
      data_inicio: dataInicio,
      data_fim: dataFim,
      total_linhas: linhas.length,
      conciliados: conciliadoN,
      pendentes: linhas.length - conciliadoN,
      linhas,
    };

    await supabase.from("extratos_bancarios").insert({
      id: novoExtrato.id, fazenda_id: fazendaId,
      conta_id: contaSel || null, conta_nome: novoExtrato.conta_nome,
      data_importacao: novoExtrato.data_importacao,
      data_inicio: dataInicio, data_fim: dataFim,
      total_linhas: linhas.length, conciliados: conciliadoN,
      pendentes: linhas.length - conciliadoN, linhas,
    });

    const naoConc = linhas.filter(l => !l.conciliado);
    if (naoConc.length > 0) {
      await supabase.from("conciliacao_pendencias").upsert(
        naoConc.map(l => ({
          fazenda_id: fazendaId, conta_id: contaSel || null,
          conta_nome: contaObj?.nome ?? null, fitid: l.id,
          data: l.data, descricao: l.descricao, valor: l.valor,
          tipo: l.tipo, status: "pendente",
        })),
        { onConflict: "fazenda_id,fitid", ignoreDuplicates: true }
      );
    }

    setExtrato(novoExtrato);
    setExtratos(prev => [novoExtrato, ...prev]);
    setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── Persistir extrato atualizado ───────────────────────────────────────────
  // Usa API route com service_role_key para ser imune a JWT expirado.
  // O estado local é atualizado imediatamente (optimistic); a persistência é async.
  function persistExtrato(
    upd: Extrato,
    opts?: { conciliarIds?: string[]; desconciliarIds?: string[] },
  ) {
    setExtrato(upd);
    setExtratos(prev => prev.map(e => e.id === upd.id ? upd : e));
    fetch("/api/financeiro/persistir-extrato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: upd.id,
        linhas: upd.linhas,
        conciliados: upd.conciliados,
        pendentes: upd.pendentes,
        lancamento_ids_conciliados: opts?.conciliarIds,
        lancamento_ids_desconciliados: opts?.desconciliarIds,
      }),
    }).catch(e => console.error("[persistExtrato]", e));
  }

  // ── Registrar no histórico ─────────────────────────────────────────────────
  async function registrarHistorico(linha: LinhaOFX, acao: "conciliado" | "desvinculado", lancsIds: string[], lancDesc: string) {
    if (!fazendaId || !extrato) return;
    const row = {
      fazenda_id: fazendaId, extrato_id: extrato.id, fitid: linha.id,
      conta_nome: extrato.conta_nome, data_transacao: linha.data,
      descricao: linha.descricao, valor: linha.valor, tipo: linha.tipo,
      acao, lancamento_ids: lancsIds, lancamento_desc: lancDesc,
      // Período que estava filtrado no momento da conciliação
      periodo_inicio: filtroLancDe || extrato.data_inicio,
      periodo_fim:    filtroLancAte || extrato.data_fim,
    };
    const { data } = await supabase.from("historico_conciliacao").insert(row).select().single();
    if (data) setHistorico(prev => [data as HistoricoConciliacao, ...prev]);
  }

  // ── Confirmar vínculo — Baixar + Conciliar em um passo ────────────────────
  // linhaParam: usado quando chamado direto do botão OFX (estado ainda não atualizou)
  async function confirmarVinculo(linhaParam?: LinhaOFX) {
    const linha = linhaParam ?? linhaAtiva;
    if (!linha || lancsSel.size === 0 || !extrato || !fazendaId) return;
    setSalvando(true);
    const ids = Array.from(lancsSel);

    // Baixar lançamentos ainda não baixados
    const paraBaixar = ids
      .map(id => lancamentos.find(x => x.id === id))
      .filter(l => l && l.status !== "baixado") as Lancamento[];

    if (paraBaixar.length > 0) {
      await Promise.all(
        paraBaixar.map(l =>
          supabase.from("lancamentos").update({
            status: "baixado",
            data_baixa: linha.data,
            valor_pago: l.valor_pago ?? l.valor,
          }).eq("id", l.id)
        )
      );
      // Atualizar estado local imediatamente
      setLancamentos(prev => prev.map(l => {
        if (!ids.includes(l.id) || l.status === "baixado") return l;
        return { ...l, status: "baixado", data_baixa: linha.data, valor_pago: l.valor_pago ?? l.valor };
      }));
    }

    // Vincular à linha OFX
    const primeiro = lancamentos.find(l => l.id === ids[0]);
    const descVinc = ids.length === 1 && primeiro ? primeiro.descricao : `${ids.length} lançamentos (bordero)`;
    const valorVinc = ids.reduce((s, id) => {
      const l = lancamentos.find(x => x.id === id);
      return s + (l ? (l.valor_pago ?? l.valor) : 0);
    }, 0);

    const novasLinhas = extrato.linhas.map(l =>
      l.id === linha.id
        ? { ...l, conciliado: true, lancamento_id: ids[0], lancamento_ids: ids, lancamento_desc: descVinc, lancamento_valor: valorVinc }
        : l
    );
    const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
    // Também atualiza conciliado=true em todos os lançamentos vinculados (para badge em CP/CR)
    persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      { conciliarIds: ids },
    );

    if (fazendaId) {
      supabase.from("conciliacao_pendencias")
        .update({ status: "resolvido", lancamento_id: ids[0] })
        .eq("fazenda_id", fazendaId).eq("fitid", linha.id);
      registrarHistorico(linha, "conciliado", ids, descVinc);
    }

    setLinhaAtiva(null);
    setLancsSel(new Set());
    setSalvando(false);
  }

  // ── Salvar lançamento de tesouraria e conciliar ───────────────────────────
  async function salvarTesouraria() {
    if (!modalTes || !fazendaId || !extrato) return;
    setSavingTes(true);

    const todasOps: OpTesouraria[] = [...OPS_TESOURARIA_PADRAO, ...opsCustom];
    const opSel = todasOps.find(o => o.id === fTes.tipo_op);
    // Vínculo fiscal: preferência ao og_id selecionado manualmente; fallback ao da operação custom
    const ogId = fTes.og_id || opSel?.operacao_gerencial_id || null;
    const { data: novoLanc, error } = await supabase
      .from("lancamentos")
      .insert({
        fazenda_id: fazendaId,
        tipo: fTes.tipo,
        descricao: fTes.descricao || modalTes.descricao,
        valor: fTes.valor || modalTes.valor,
        valor_pago: fTes.valor || modalTes.valor,
        data_lancamento: fTes.data || modalTes.data,
        data_vencimento: fTes.data || modalTes.data,
        data_baixa: modalTes.data,
        status: "baixado",
        categoria: opSel?.nome ?? "Tesouraria",
        operacao_gerencial_id: ogId,
      })
      .select()
      .single();

    if (error || !novoLanc) {
      alert("Erro ao salvar lançamento: " + (error?.message ?? "erro desconhecido"));
      setSavingTes(false);
      return;
    }

    // Atualizar estado local
    setLancamentos(prev => [novoLanc as Lancamento, ...prev]);

    // Vincular linha OFX
    const ids = [novoLanc.id];
    const desc = fTes.descricao || modalTes.descricao;
    const novasLinhas = extrato.linhas.map(l =>
      l.id === modalTes.id
        ? { ...l, conciliado: true, lancamento_id: novoLanc.id, lancamento_ids: ids, lancamento_desc: desc, lancamento_valor: fTes.valor || modalTes.valor }
        : l
    );
    const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
    persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      { conciliarIds: ids },
    );

    if (fazendaId) {
      supabase.from("conciliacao_pendencias")
        .update({ status: "resolvido", lancamento_id: novoLanc.id })
        .eq("fazenda_id", fazendaId).eq("fitid", modalTes.id);
      registrarHistorico(modalTes, "conciliado", ids, desc);
    }

    setModalTes(null);
    setSavingTes(false);
  }

  // ── Desvincular ────────────────────────────────────────────────────────────
  function desvincular(linhaId: string) {
    if (!extrato) return;
    const linhaOriginal = extrato.linhas.find(l => l.id === linhaId);
    const idsDesconciliados = linhaOriginal?.lancamento_ids ?? (linhaOriginal?.lancamento_id ? [linhaOriginal.lancamento_id] : []);
    const linhas = extrato.linhas.map(l =>
      l.id === linhaId ? { ...l, conciliado: false, lancamento_id: undefined, lancamento_ids: undefined, lancamento_desc: undefined, lancamento_valor: undefined } : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    // Desconcilia os lançamentos (conciliado=false) para remover badge em CP/CR
    persistExtrato(
      { ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN },
      { desconciliarIds: idsDesconciliados.length ? idsDesconciliados : undefined },
    );
    if (fazendaId && linhaOriginal) {
      registrarHistorico(linhaOriginal, "desvinculado", linhaOriginal.lancamento_ids ?? [], linhaOriginal.lancamento_desc ?? "");
    }
  }

  // ── Abrir modal tesouraria ─────────────────────────────────────────────────
  function abrirTesouraria(linha: LinhaOFX) {
    setModalTes(linha);
    // Pré-selecionar operação mais provável pelo tipo OFX
    const opPadrao = linha.tipo === "credito" ? "__resgate__" : "__taxa__";
    setFTes({
      descricao: linha.descricao,
      tipo: linha.tipo === "debito" ? "pagar" : "receber",
      valor: linha.valor,
      data: linha.data,
      tipo_op: opPadrao,
      og_id: "",
    });
  }

  // ── Resize colunas ─────────────────────────────────────────────────────────
  function onResizeStart(colIdx: number, startX: number, startW: number) {
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setColWidths(prev => {
        const next = [...prev];
        next[colIdx] = Math.max(50, startW + delta);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const linhasFiltradas = (extrato?.linhas ?? []).filter(l => {
    if (filtroPend && l.conciliado) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const lancFiltrados = lancamentos.filter(l => {
    // Filtro de status
    if (filtroLancStatus === "aberto" && !["aberto", "vencido", "em_aberto"].includes(l.status)) return false;
    if (filtroLancStatus === "baixado" && l.status !== "baixado") return false;
    if (filtroLancStatus === "parcial" && !ehParcial(l)) return false;

    // Filtro de tipo
    if (filtroLancTipo !== "todos" && l.tipo !== filtroLancTipo) return false;

    // Auto-filtro por tipo do OFX quando linha ativa
    if (linhaAtiva) {
      if (linhaAtiva.tipo === "credito" && l.tipo !== "receber") return false;
      if (linhaAtiva.tipo === "debito"  && l.tipo !== "pagar")   return false;
    }

    // Filtro de período: usa data_baixa quando disponível, senão data_vencimento
    if (filtroLancDe || filtroLancAte) {
      const dataRef = l.data_baixa ?? l.data_vencimento;
      if (filtroLancDe && dataRef < filtroLancDe) return false;
      if (filtroLancAte && dataRef > filtroLancAte) return false;
    }

    // Busca
    if (buscaLanc) {
      const q = buscaLanc.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.categoria?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Contagens para badges do filtro de status
  const cntAberto  = lancamentos.filter(l => ["aberto","vencido","em_aberto"].includes(l.status)).length;
  const cntBaixado = lancamentos.filter(l => l.status === "baixado").length;
  const cntParcial = lancamentos.filter(ehParcial).length;

  // Rótulo do botão confirmar
  const todosJaBaixados = Array.from(lancsSel).every(id => {
    const l = lancamentos.find(x => x.id === id);
    return l?.status === "baixado";
  });
  const btnConfirmarLabel = salvando ? "Salvando..." : todosJaBaixados ? "✓ Vincular" : "✓ Baixar e Conciliar";

  const totalCreditos = (extrato?.linhas ?? []).filter(l => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
  const totalDebitos  = (extrato?.linhas ?? []).filter(l => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
  const saldo         = totalCreditos - totalDebitos;
  const pct           = extrato ? Math.round((extrato.conciliados / extrato.total_linhas) * 100) : 0;

  const extratosPend  = extratos.filter(e => e.pendentes > 0);

  // ─── Estilos compartilhados ────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11,
    color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap",
    position: "relative", userSelect: "none", background: "var(--bg-page)",
  };
  const resizer: React.CSSProperties = {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 5,
    cursor: "col-resize", zIndex: 1,
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      {/* ── Modal Tesouraria ──────────────────────────────────────────────── */}
      {modalTes && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Lançamento de Tesouraria</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Criar lançamento e conciliar em um passo</div>
              </div>
              <button onClick={() => setModalTes(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            {/* Linha OFX de referência */}
            <div style={{ margin: "14px 20px 0", padding: "10px 14px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Transação no extrato</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{modalTes.descricao}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{fmtDt(modalTes.data)} · FITID: {modalTes.id}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: modalTes.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                  {modalTes.tipo === "credito" ? "+" : "−"}{fmtBRL(modalTes.valor)}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tipo</label>
                  <select value={fTes.tipo} onChange={e => setFTes(f => ({ ...f, tipo: e.target.value as "pagar"|"receber" }))}
                    style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                    <option value="pagar">Conta a Pagar (saída)</option>
                    <option value="receber">Conta a Receber (entrada)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Valor</label>
                  <input type="number" step="0.01" value={fTes.valor} onChange={e => setFTes(f => ({ ...f, valor: parseFloat(e.target.value) || 0 }))}
                    style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Descrição</label>
                <input value={fTes.descricao} onChange={e => setFTes(f => ({ ...f, descricao: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Operação de Tesouraria</label>
                <select
                  value={fTes.tipo_op}
                  onChange={e => {
                    const op = [...OPS_TESOURARIA_PADRAO, ...opsCustom].find(o => o.id === e.target.value);
                    setFTes(f => ({
                      ...f,
                      tipo_op: e.target.value,
                      tipo: op?.tipo === "entrada" ? "receber" : op?.tipo === "saida" ? "pagar" : f.tipo,
                      // Auto-preenche OG se a op custom tiver vínculo
                      og_id: op?.operacao_gerencial_id ?? f.og_id,
                    }));
                  }}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                  <optgroup label="Operações Padrão">
                    {OPS_TESOURARIA_PADRAO.map(o => (
                      <option key={o.id} value={o.id}>{o.nome}</option>
                    ))}
                  </optgroup>
                  {opsCustom.length > 0 && (
                    <optgroup label="Operações da Fazenda">
                      {opsCustom.map(o => (
                        <option key={o.id} value={o.id}>{o.nome}{o.operacao_gerencial_id ? " ✓" : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Vínculo Fiscal — Plano de Contas</label>
                <select
                  value={fTes.og_id}
                  onChange={e => setFTes(f => ({ ...f, og_id: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: `0.5px solid ${fTes.og_id ? "#16A34A" : "var(--border)"}`, borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                  <option value="">— Sem vínculo (não impacta DRE/LCDPR)</option>
                  <optgroup label="Receitas">
                    {ogsDisponiveis.filter(g => g.tipo === "receita").map(g => (
                      <option key={g.id} value={g.id}>{g.classificacao} — {g.descricao}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Despesas">
                    {ogsDisponiveis.filter(g => g.tipo === "despesa").map(g => (
                      <option key={g.id} value={g.id}>{g.classificacao} — {g.descricao}</option>
                    ))}
                  </optgroup>
                </select>
                {fTes.og_id && (
                  <div style={{ marginTop: 3, fontSize: 10, color: "#16A34A" }}>✓ Lançamento impactará DRE, LCDPR e SPED ECD</div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Data</label>
                <input type="date" value={fTes.data} onChange={e => setFTes(f => ({ ...f, data: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setModalTes(null)} disabled={savingTes}
                  style={{ flex: 1, padding: "9px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={salvarTesouraria} disabled={savingTes || !fTes.descricao || fTes.valor <= 0}
                  style={{ flex: 2, padding: "9px", border: "none", borderRadius: 8, background: savingTes ? "#999" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: savingTes ? "default" : "pointer" }}>
                  {savingTes ? "Salvando..." : "✓ Salvar e Conciliar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1700, margin: "0 auto", padding: "18px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Financeiro</div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "var(--text-1)" }}>Conciliação Bancária</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#666" }}>
              Importe o OFX · o sistema concilia automaticamente · histórico salvo na nuvem
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={contaSel} onChange={e => setContaSel(e.target.value)}
                style={{ padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                <option value="">— Conta bancária —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.banco}</option>)}
              </select>
              <button onClick={() => inputRef.current?.click()} disabled={loading}
                style={{ padding: "7px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {loading ? "Processando..." : "Importar OFX"}
              </button>
              <input ref={inputRef} type="file" accept=".ofx,.OFX" onChange={handleOFX} style={{ display: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Suporta OFX de qualquer banco brasileiro</div>
          </div>
        </div>

        {/* Seletor de período — controla quais lançamentos são carregados */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap", background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "10px 14px" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Período dos lançamentos</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)" }}>De</label>
            <input type="date" value={periodoFetchDe} onChange={e => setPeriodoFetchDe(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", background: "var(--bg-card)" }} />
            <label style={{ fontSize: 11, color: "var(--text-3)" }}>até</label>
            <input type="date" value={periodoFetchAte} onChange={e => setPeriodoFetchAte(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", background: "var(--bg-card)" }} />
          </div>
          {/* Atalhos rápidos de mês */}
          {[
            { label: "Mês atual", fn: () => {
              const d = new Date();
              const de = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
              const ate = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10);
              setPeriodoFetchDe(de); setPeriodoFetchAte(ate); recarregarParaPeriodo(de, ate);
            }},
            { label: "Mês anterior", fn: () => {
              const d = new Date();
              const mes = d.getMonth() === 0 ? 12 : d.getMonth();
              const ano = d.getMonth() === 0 ? d.getFullYear()-1 : d.getFullYear();
              const de = `${ano}-${String(mes).padStart(2,"0")}-01`;
              const ate = new Date(ano, mes, 0).toISOString().slice(0,10);
              setPeriodoFetchDe(de); setPeriodoFetchAte(ate); recarregarParaPeriodo(de, ate);
            }},
            { label: "Últimos 3 meses", fn: () => {
              const ate = new Date().toISOString().slice(0,10);
              const d3 = new Date(); d3.setMonth(d3.getMonth()-3); d3.setDate(1);
              const de = d3.toISOString().slice(0,10);
              setPeriodoFetchDe(de); setPeriodoFetchAte(ate); recarregarParaPeriodo(de, ate);
            }},
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
          <button onClick={() => recarregarParaPeriodo()} disabled={lancRefresh}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "none", background: "#1A4870", color: "#fff", cursor: lancRefresh ? "default" : "pointer", fontWeight: 600, opacity: lancRefresh ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {lancRefresh ? "Carregando…" : "↻ Atualizar"}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {lancamentos.length} lançamento{lancamentos.length !== 1 ? "s" : ""} carregado{lancamentos.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Abas: Extratos / Histórico */}
        {!extrato && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {([["extrato", "Extratos OFX"], ["historico", "Histórico de Conciliação"]] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setAbaAtiva(k)}
                style={{ padding: "6px 16px", borderRadius: 8, border: `0.5px solid ${abaAtiva === k ? "#1A5CB8" : "var(--border)"}`, background: abaAtiva === k ? "#1A5CB8" : "var(--bg-card)", color: abaAtiva === k ? "#fff" : "var(--text-2)", fontSize: 13, fontWeight: abaAtiva === k ? 700 : 400, cursor: "pointer" }}>
                {lbl}{k === "historico" && historico.length > 0 ? ` (${historico.length})` : ""}
              </button>
            ))}
          </div>
        )}

        {/* Banner: extratos pendentes */}
        {!extrato && abaAtiva === "extrato" && extratosPend.length > 0 && (
          <div style={{ background: "#FEF3C7", border: "0.5px solid #F59E0B", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 20 }}>⏳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {extratosPend.length === 1
                  ? `Conciliação em andamento — ${extratosPend[0].conta_nome} (${extratosPend[0].pendentes} pendentes)`
                  : `${extratosPend.length} extratos com conciliação pendente`}
              </div>
              <div style={{ fontSize: 12, color: "#78350F", marginTop: 2 }}>Clique no extrato abaixo para continuar de onde parou</div>
            </div>
            {extratosPend.length === 1 && (
              <button onClick={() => setExtrato(extratosPend[0])}
                style={{ padding: "7px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Continuar →
              </button>
            )}
          </div>
        )}

        {/* Lista de extratos */}
        {!extrato && abaAtiva === "extrato" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
            {extratos.length === 0 ? (
              <div style={{ gridColumn: "1/-1", background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏦</div>
                <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum extrato importado</div>
                <div style={{ fontSize: 12 }}>Selecione uma conta e importe o OFX do seu banco.</div>
              </div>
            ) : extratos.map(e => (
              <div key={e.id} onClick={() => setExtrato(e)}
                style={{ background: "var(--bg-card)", borderRadius: 10, border: `0.5px solid ${e.pendentes > 0 ? "#F59E0B" : "var(--border)"}`, padding: "14px 16px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={el => (el.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                onMouseLeave={el => (el.currentTarget.style.boxShadow = "none")}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)", marginBottom: 2 }}>{e.conta_nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>{fmtDt(e.data_inicio)} a {fmtDt(e.data_fim)} · {fmtDt(e.data_importacao)}</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 11, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>{e.conciliados} ✓</span>
                  {e.pendentes > 0 && <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 11, background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>{e.pendentes} pend.</span>}
                </div>
                <div style={{ height: 5, background: "var(--bg-tag)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(e.conciliados / e.total_linhas * 100)}%`, height: "100%", background: "#16A34A", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ ABA HISTÓRICO ═══ */}
        {!extrato && abaAtiva === "historico" && (() => {
          // Resumo por extrato_id (períodos conciliados)
          const periodoMap = new Map<string, {
            extrato_id: string; conta_nome: string;
            periodo_inicio?: string; periodo_fim?: string;
            conciliados: number; desvinculados: number;
          }>();
          for (const h of historico) {
            if (!periodoMap.has(h.extrato_id)) {
              periodoMap.set(h.extrato_id, {
                extrato_id: h.extrato_id, conta_nome: h.conta_nome,
                periodo_inicio: h.periodo_inicio, periodo_fim: h.periodo_fim,
                conciliados: 0, desvinculados: 0,
              });
            }
            const e = periodoMap.get(h.extrato_id)!;
            if (h.acao === "conciliado") e.conciliados++; else e.desvinculados++;
            // Pega o período mais amplo registrado neste extrato
            if (h.periodo_inicio && (!e.periodo_inicio || h.periodo_inicio < e.periodo_inicio)) e.periodo_inicio = h.periodo_inicio;
            if (h.periodo_fim    && (!e.periodo_fim    || h.periodo_fim    > e.periodo_fim))    e.periodo_fim    = h.periodo_fim;
          }
          const periodos = Array.from(periodoMap.values()).sort((a, b) => (b.periodo_fim ?? "").localeCompare(a.periodo_fim ?? ""));

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Resumo de Períodos */}
              {periodos.length > 0 && (
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>Períodos Conciliados</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Um registro por extrato OFX importado — período filtrado durante a conciliação</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Conta Bancária", "Período Conciliado", "Conciliadas", "Desvinculadas"].map(h => (
                          <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodos.map((p, i) => (
                        <tr key={p.extrato_id} style={{ borderBottom: i < periodos.length - 1 ? "0.5px solid var(--bg-tag)" : "none" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>{p.conta_nome}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.periodo_inicio || p.periodo_fim ? (
                              <span style={{ fontSize: 13, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                                {fmtDt(p.periodo_inicio)} a {fmtDt(p.periodo_fim)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>— (extrato antigo)</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#DCFCE7", color: "#16A34A" }}>
                              {p.conciliados} ✓
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.desvinculados > 0 ? (
                              <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "rgba(239,68,68,0.08)", color: "#E24B4A" }}>
                                {p.desvinculados} ✗
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Detalhe de movimentações */}
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>Movimentações</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Histórico individual de cada conciliação e desvinculação</div>
                </div>
                {historico.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum histórico registrado</div>
                    <div style={{ fontSize: 12 }}>O histórico é registrado automaticamente ao conciliar ou desvincular transações.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Data/Hora", "Conta", "Período Filtrado", "Transação OFX", "Valor", "Lançamento Vinculado", "Ação"].map(h => (
                            <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map((h, i) => (
                          <tr key={h.id} style={{ borderBottom: i < historico.length - 1 ? "0.5px solid var(--bg-tag)" : "none", background: h.acao === "desvinculado" ? "rgba(239,68,68,0.03)" : "transparent" }}>
                            <td style={{ padding: "9px 12px", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>
                              {new Date(h.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>{h.conta_nome}</td>
                            <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                              {h.periodo_inicio ? `${fmtDt(h.periodo_inicio)} a ${fmtDt(h.periodo_fim)}` : "—"}
                            </td>
                            <td style={{ padding: "9px 12px", overflow: "hidden", maxWidth: 240 }}>
                              <div style={{ fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.descricao}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>{fmtDt(h.data_transacao)} · {h.fitid}</div>
                            </td>
                            <td style={{ padding: "9px 12px", whiteSpace: "nowrap", fontWeight: 700, color: h.tipo === "credito" ? "#16A34A" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>
                              {h.tipo === "credito" ? "+" : "−"}{fmtBRL(h.valor)}
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{h.lancamento_desc || "—"}</td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: h.acao === "conciliado" ? "#DCFCE7" : "rgba(239,68,68,0.1)", color: h.acao === "conciliado" ? "#16A34A" : "#E24B4A", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                {h.acao === "conciliado" ? "✓ Conciliado" : "✗ Desvinculado"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ═══ EXTRATO ATIVO — layout lado a lado ═══ */}
        {extrato && (
          <>
            {/* Cabeçalho do extrato */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "14px 18px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => { setExtrato(null); setLinhaAtiva(null); setLancsSel(new Set()); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>{extrato.conta_nome}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{fmtDt(extrato.data_inicio)} até {fmtDt(extrato.data_fim)} · {extrato.total_linhas} transações</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "#DCFCE7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#16A34A", fontSize: 14 }}>{extrato.conciliados}</div>
                    <div style={{ fontSize: 10, color: "#16A34A" }}>conciliados</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "#FEF3C7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#92400E", fontSize: 14 }}>{extrato.pendentes}</div>
                    <div style={{ fontSize: 10, color: "#92400E" }}>pendentes</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "var(--bg-page)", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "var(--text-1)", fontSize: 14 }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>conciliado</div>
                  </div>
                </div>
              </div>
              <div style={{ height: 6, background: "var(--bg-tag)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#16A34A" : "#1A4870", borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Total Créditos",  valor: totalCreditos, cor: "#16A34A" },
                  { label: "Total Débitos",    valor: totalDebitos,  cor: "#E24B4A" },
                  { label: "Saldo do Período", valor: saldo,         cor: saldo >= 0 ? "#111" : "#E24B4A" },
                ].map(k => (
                  <div key={k.label} style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: k.cor }}>{fmtBRL(k.valor)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ DOIS PAINÉIS ═══ */}
            <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", gap: 12, alignItems: "start" }}>

              {/* ─── PAINEL ESQUERDO: Lançamentos CP/CR ─────────────────── */}
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: `1.5px solid ${linhaAtiva ? "#C9921B" : "var(--border)"}`, overflow: "hidden", position: "sticky", top: 20 }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border)", background: linhaAtiva ? "#FBF3E0" : lancsSel.size > 0 ? "#EBF4FF" : "var(--bg-page)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: linhaAtiva ? "#7A5A12" : lancsSel.size > 0 ? "#0B2D50" : "var(--text-1)" }}>
                      {linhaAtiva
                        ? `Vinculando ao extrato: ${linhaAtiva.tipo === "debito" ? "−" : "+"}${fmtBRL(linhaAtiva.valor)}`
                        : lancsSel.size > 0
                          ? `${lancsSel.size} selecionado${lancsSel.size > 1 ? "s" : ""} — clique "Vincular CP/CR" no extrato`
                          : "Lançamentos CP / CR"}
                    </div>
                    <button onClick={recarregarLancamentos} title="Atualizar lançamentos" disabled={lancRefresh}
                      style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, cursor: lancRefresh ? "default" : "pointer", fontSize: 13, color: "var(--text-2)", padding: "2px 7px", lineHeight: 1, opacity: lancRefresh ? 0.5 : 1 }}>
                      {lancRefresh ? "…" : "↻"}
                    </button>
                  </div>
                  {linhaAtiva && (
                    <div style={{ fontSize: 11, color: "#7A5A12", marginBottom: 6, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {linhaAtiva.descricao} · {fmtDt(linhaAtiva.data)}
                    </div>
                  )}
                  {lancsSel.size > 0 && !linhaAtiva && (
                    <div style={{ fontSize: 11, color: "#1A4870", marginBottom: 4 }}>
                      Selecione uma transação no painel do extrato →
                    </div>
                  )}

                  {/* Filtro Período */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 2 }}>DE</label>
                      <input type="date" value={filtroLancDe} onChange={e => setFiltroLancDe(e.target.value)}
                        style={{ width: "100%", padding: "4px 7px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 2 }}>ATÉ</label>
                      <input type="date" value={filtroLancAte} onChange={e => setFiltroLancAte(e.target.value)}
                        style={{ width: "100%", padding: "4px 7px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>

                  {/* Filtro Tipo */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    {(["todos","pagar","receber"] as const).map(t => (
                      <button key={t} onClick={() => setFiltroLancTipo(t)}
                        style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: filtroLancTipo === t ? "#111" : "var(--bg-card)", color: filtroLancTipo === t ? "#fff" : "var(--text-2)", cursor: "pointer", fontWeight: 600 }}>
                        {t === "todos" ? "Todos" : t === "pagar" ? "CP" : "CR"}
                      </button>
                    ))}
                  </div>

                  {/* Filtro Status */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    {([
                      ["todos",   "Todos",    null],
                      ["aberto",  "Em Aberto", cntAberto],
                      ["baixado", "Baixados",  cntBaixado],
                      ["parcial", "Parciais",  cntParcial],
                    ] as const).map(([k, lbl, cnt]) => (
                      <button key={k} onClick={() => setFiltroLancStatus(k)}
                        style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, border: `0.5px solid ${filtroLancStatus === k ? "#1A4870" : "var(--border)"}`, background: filtroLancStatus === k ? "#D5E8F5" : "var(--bg-card)", color: filtroLancStatus === k ? "#0B2D50" : "var(--text-3)", cursor: "pointer", fontWeight: filtroLancStatus === k ? 700 : 400, whiteSpace: "nowrap" }}>
                        {lbl}{cnt !== null && cnt > 0 ? ` (${cnt})` : ""}
                      </button>
                    ))}
                  </div>

                  <input placeholder="Buscar lançamento..." value={buscaLanc} onChange={e => setBuscaLanc(e.target.value)}
                    style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>

                {/* Barra de confirmação */}
                {linhaAtiva && lancsSel.size > 0 && (
                  <div style={{ padding: "8px 14px", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                      {lancsSel.size} selecionado{lancsSel.size > 1 ? "s" : ""}{lancsSel.size > 1 ? " (bordero)" : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setLancsSel(new Set())}
                        style={{ fontSize: 11, padding: "3px 8px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 6, cursor: "pointer" }}>
                        Limpar
                      </button>
                      <button onClick={() => confirmarVinculo()} disabled={salvando}
                        style={{ fontSize: 11, padding: "3px 12px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 6, cursor: salvando ? "default" : "pointer", fontWeight: 700 }}>
                        {btnConfirmarLabel}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de lançamentos */}
                <div style={{ maxHeight: 520, overflowY: "auto" }}>
                  {lancFiltrados.slice(0, 100).map((l, i, arr) => {
                    const isSel = lancsSel.has(l.id);
                    const sm    = statusMeta(l);
                    const saldo = ehParcial(l) ? l.valor - (l.valor_pago ?? 0) : null;
                    return (
                      <div key={l.id}
                        onClick={() => {
                          setLancsSel(prev => {
                            const next = new Set(prev);
                            if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                            return next;
                          });
                        }}
                        style={{
                          padding: "9px 14px",
                          borderBottom: i < arr.length - 1 ? "0.5px solid var(--bg-tag)" : "none",
                          background: isSel ? "#EBF4FF" : "transparent",
                          borderLeft: isSel ? "3px solid #1A4870" : "3px solid transparent",
                          cursor: "pointer",
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                        <input type="checkbox" checked={isSel} readOnly
                          style={{ marginTop: 2, flexShrink: 0, accentColor: "#1A4870", cursor: "pointer" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                            {l.tipo === "pagar" ? "CP" : "CR"} · {fmtDt(l.data_vencimento)}
                            {l.data_baixa ? ` · baixado ${fmtDt(l.data_baixa)}` : ""}
                            {l.categoria ? ` · ${l.categoria}` : ""}
                          </div>
                          {saldo !== null && (
                            <div style={{ fontSize: 10, color: "#A16207", marginTop: 2, fontWeight: 600 }}>
                              Saldo pendente: {fmtBRL(saldo)}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>
                            {fmtBRL(l.valor_pago ?? l.valor)}
                          </div>
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 6, background: sm.bg, color: sm.color, display: "inline-block", marginTop: 2, fontWeight: 600 }}>
                            {sm.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {lancFiltrados.length === 0 && (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>Nenhum lançamento encontrado</div>
                  )}
                  {lancFiltrados.length > 100 && (
                    <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: "var(--text-3)", borderTop: "0.5px solid var(--bg-tag)" }}>
                      +{lancFiltrados.length - 100} ocultos — use a busca para refinar
                    </div>
                  )}
                </div>

                {(linhaAtiva || lancsSel.size > 0) && (
                  <div style={{ padding: "10px 14px", borderTop: "0.5px solid var(--border)", background: "var(--bg-page)", display: "flex", gap: 6 }}>
                    <button onClick={() => setLancsSel(new Set())}
                      style={{ flex: 1, padding: "6px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
                      Limpar seleção
                    </button>
                    {linhaAtiva && (
                      <button onClick={() => { setLinhaAtiva(null); setLancsSel(new Set()); }}
                        style={{ flex: 1, padding: "6px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 11, color: "var(--text-2)", cursor: "pointer" }}>
                        Cancelar vinculação
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ─── PAINEL DIREITO: Extrato OFX ───────────────────────── */}
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                {/* Filtros OFX */}
                <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)", display: "flex", gap: 10, alignItems: "center" }}>
                  <input placeholder="Buscar por descrição ou FITID..." value={busca} onChange={e => setBusca(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 12, width: 260, outline: "none" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={filtroPend} onChange={e => setFiltroPend(e.target.checked)} />
                    Apenas pendentes
                  </label>
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                    {linhasFiltradas.length} de {extrato.total_linhas} transações
                  </div>
                  <button onClick={() => setColWidths([...COL_INIT])} title="Resetar colunas"
                    style={{ padding: "4px 8px", border: "0.5px solid var(--border)", borderRadius: 6, background: "var(--bg-card)", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
                    ⟳ Colunas
                  </button>
                </div>

                {/* Tabela OFX */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0), borderCollapse: "collapse", fontSize: 13 }}>
                    <colgroup>
                      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        {["Data", "Descrição no Extrato", "Valor", "Situação", "Lançamento Vinculado", "Ação"].map((h, i) => (
                          <th key={h} style={thStyle}>
                            {h}
                            <div style={resizer}
                              onMouseDown={e => { e.preventDefault(); onResizeStart(i, e.clientX, colWidths[i]); }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9921B"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhasFiltradas.map((l, i) => {
                        const isAtiva = linhaAtiva?.id === l.id;
                        return (
                          <tr key={l.id} style={{
                            borderBottom: i < linhasFiltradas.length - 1 ? "0.5px solid var(--bg-tag)" : "none",
                            background: isAtiva ? "#FBF3E0" : l.conciliado ? "transparent" : "#FFFEF8",
                          }}>
                            <td style={{ padding: "9px 10px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDt(l.data)}</td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.id}</div>
                            </td>
                            <td style={{ padding: "9px 10px", whiteSpace: "nowrap", overflow: "hidden" }}>
                              <span style={{ fontWeight: 700, color: l.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                                {l.tipo === "credito" ? "+" : "−"}{fmtBRL(l.valor)}
                              </span>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{l.tipo === "credito" ? "Crédito" : "Débito"}</div>
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado
                                ? <span style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#16A34A", whiteSpace: "nowrap" }}>✓ Conciliado</span>
                                : <span style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FEF3C7", color: "#92400E", whiteSpace: "nowrap" }}>Pendente</span>}
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado && l.lancamento_desc ? (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.lancamento_desc}</div>
                                  {l.lancamento_valor != null && (
                                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtBRL(l.lancamento_valor)}</div>
                                  )}
                                  {(l.lancamento_ids?.length ?? 0) > 1 && (
                                    <div style={{ fontSize: 10, color: "#1A4870", marginTop: 1 }}>
                                      Bordero: {l.lancamento_ids!.length} lançamentos
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado ? (
                                <button onClick={() => { desvincular(l.id); if (isAtiva) { setLinhaAtiva(null); setLancsSel(new Set()); } }}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  Desvincular
                                </button>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <button
                                    disabled={salvando}
                                    onClick={() => {
                                      if (isAtiva) {
                                        // Cancelar vinculação ativa
                                        setLinhaAtiva(null);
                                      } else if (lancsSel.size > 0) {
                                        // Já tem seleções → conciliar imediatamente
                                        setLinhaAtiva(l);
                                        confirmarVinculo(l);
                                      } else {
                                        // Ativar modo vinculação
                                        setLinhaAtiva(l);
                                        setFiltroLancTipo(l.tipo === "credito" ? "receber" : "pagar");
                                      }
                                    }}
                                    style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid #C9921B`, background: isAtiva ? "#C9921B" : lancsSel.size > 0 ? "#1A4870" : "#FBF3E0", color: isAtiva || lancsSel.size > 0 ? "#fff" : "#C9921B", fontSize: 11, fontWeight: 600, cursor: salvando ? "default" : "pointer", whiteSpace: "nowrap" }}>
                                    {isAtiva && salvando ? "Salvando..." : isAtiva ? "Cancelar" : lancsSel.size > 0 ? `↗ Vincular (${lancsSel.size})` : "Vincular CP/CR"}
                                  </button>
                                  {!isAtiva && (
                                    <button onClick={() => abrirTesouraria(l)}
                                      style={{ padding: "3px 9px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                                      + Tesouraria
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {linhasFiltradas.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: "28px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhuma transação encontrada.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Avisos finais */}
            {extrato.pendentes > 0 && (
              <div style={{ marginTop: 14, background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#7A5A12" }}>
                <strong>{extrato.pendentes} transações pendentes.</strong> Clique "Vincular CP/CR" em uma linha do extrato e selecione os lançamentos no painel esquerdo. Para bordero, selecione múltiplos. Para tarifas e IOF sem CP/CR, use "+ Tesouraria".
              </div>
            )}
            {pct === 100 && (
              <div style={{ marginTop: 14, background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>✔</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#14532D" }}>Extrato 100% conciliado</div>
                  <div style={{ fontSize: 12, color: "#166534" }}>Todas as transações foram associadas.</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
