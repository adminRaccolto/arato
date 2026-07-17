"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TopNav from "../components/TopNav";
import OnboardingPanel from "../components/OnboardingPanel";
import { supabase } from "../lib/supabase";
import { useAuth } from "../components/AuthProvider";
import type { PrecosData } from "./api/precos/route";

// ─── Helpers ─────────────────────────────────────────────────
const fmtMoeda = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBrl   = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd   = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBrl4  = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtPct   = (v: number) => `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// ─── Status de mercado ────────────────────────────────────────
// CBOT (CME): eletrônico dom 19h – sex 13h20 CT (UTC-5 inverno / UTC-6 verão)
// B3 Futuros: seg-sex 9h-17h45 BRT (UTC-3)
type MercadoStatus = { aberto: boolean; label: string; cor: string };

function statusMercado(): { cbot: MercadoStatus; b3: MercadoStatus } {
  const now   = new Date();
  const utcH  = now.getUTCHours();
  const utcM  = now.getUTCMinutes();
  const dow   = now.getUTCDay(); // 0=dom, 6=sab
  const utcMin = utcH * 60 + utcM;

  // CBOT eletrônico: dom 00h – sex 18h20 UTC (com pausa 18h20-19h dom-qui)
  // Simplificado: seg-sex 00:00–18:20 UTC + dom 00:00-18:20 UTC
  const cbotAberto = dow >= 0 && dow <= 5
    ? (dow === 0 ? utcMin >= 0 : utcMin < 18 * 60 + 20)  // dom abre às 0h UTC; sex fecha 18h20 UTC
    : false;

  // B3: seg-sex 12h00–20h45 UTC
  const b3Aberto = dow >= 1 && dow <= 5 && utcMin >= 12 * 60 && utcMin < 20 * 60 + 45;

  return {
    cbot: cbotAberto
      ? { aberto: true,  label: "CBOT aberto",   cor: "#16A34A" }
      : { aberto: false, label: "CBOT fechado",  cor: "var(--text-muted)"    },
    b3:   b3Aberto
      ? { aberto: true,  label: "B3 aberta",     cor: "#16A34A" }
      : { aberto: false, label: "B3 fechada",    cor: "var(--text-muted)"    },
  };
}

// ─── Direção de preço ────────────────────────────────────────
type Direcao = "up" | "down" | "same";
function direcao(atual: number, anterior: number | undefined): Direcao {
  if (anterior === undefined || atual === anterior) return "same";
  return atual > anterior ? "up" : "down";
}
const DIR_COLOR = { up: "#16A34A", down: "#E24B4A", same: "var(--text-1)" };
const DIR_ARROW = { up: " ▲", down: " ▼", same: "" };

function diasAte(dataStr: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  // Constrói a data alvo como meia-noite local (não UTC) para evitar offset de fuso horário
  const [y, m, d] = dataStr.split("-").map(Number);
  const alvo = new Date(y, m - 1, d);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function labelDias(d: number): string {
  if (d < 0)  return `${Math.abs(d)} dia${Math.abs(d) !== 1 ? "s" : ""} em atraso`;
  if (d === 0) return "vence hoje";
  if (d === 1) return "vence amanhã";
  return `vence em ${d} dias`;
}

type Urgencia = "critico" | "alto" | "medio" | "info";
const COR: Record<Urgencia, { bg: string; border: string; text: string; badge: string }> = {
  critico: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", badge: "#E24B4A" },
  alto:    { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", badge: "#EF9F27" },
  medio:   { bg: "#EFF6FF", border: "#BFDBFE", text: "#1e40af", badge: "#378ADD" },
  info:    { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534", badge: "#16A34A" },
};

function urgDias(d: number): Urgencia {
  if (d <= 0) return "critico";
  if (d <= 3) return "alto";
  return "medio";
}

// ─── Tipos ────────────────────────────────────────────────────
type ResultadoBusca = {
  id: string;
  categoria: string;
  titulo: string;
  subtitulo?: string;
  link: string;
  cor: string;
};

type Alerta = {
  id: string;
  tipo: "cp" | "cr" | "arrendamento" | "cert_a1" | "contrato" | "estoque" | "seguro" | "fiscal";
  desc: string;
  valor?: number;
  dias?: number;
  urgencia: Urgencia;
  link: string;
  linkLabel: string;
};

// ─── Saudação por hora ───────────────────────────────────────
function saudar(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ─── Counter animation hook ───────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (target === 0) { setDisplay(0); return; }
    let start = 0;
    function step(ts: number) {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3); // cubic ease-out
      setDisplay(target * ease);
      if (pct < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return display;
}

// ─── Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const { fazendaId, fazendaIds, onboardingAtivo, nomeUsuario } = useAuth();

  const [alertas,    setAlertas]    = useState<Alerta[]>([]);
  const [loadAl,     setLoadAl]     = useState(true);
  const [precos,     setPrecos]     = useState<PrecosData | null>(null);
  const [loadPr,     setLoadPr]     = useState(true);
  const [mercado,    setMercado]    = useState(statusMercado());
  const [flash,      setFlash]      = useState<Record<string, Direcao>>({});
  const prevPrecos   = useRef<PrecosData | null>(null);

  // Resumo financeiro
  const [cpAberto,   setCpAberto]   = useState(0);
  const [crAberto,   setCrAberto]   = useState(0);
  const [cpSemana,   setCpSemana]   = useState(0);
  const [crSemana,   setCrSemana]   = useState(0);

  // Stats lavoura
  const [ciclosAtivos,    setCiclosAtivos]    = useState(0);
  const [contratosAtivos, setContratosAtivos] = useState(0);
  const [vencidosCp,      setVencidosCp]      = useState(0);

  // Inconsistências de conciliação bancária
  interface ConciliPendencia {
    id: string; conta_nome?: string; data: string; descricao: string;
    valor: number; tipo: "credito" | "debito"; fitid: string; conta_id?: string;
  }
  const [conciliPend, setConciliPend] = useState<ConciliPendencia[]>([]);
  const [resolvendo, setResolvendo]   = useState<string | null>(null);

  // Busca global
  const [buscaGlobal,      setBuscaGlobal]      = useState("");
  const [resultadosBusca,  setResultadosBusca]  = useState<ResultadoBusca[]>([]);
  const [buscandoGlobal,   setBuscandoGlobal]   = useState(false);
  const [buscaAberta,      setBuscaAberta]      = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);

  // ── Busca global ──
  useEffect(() => {
    if (!fazendaId || buscaGlobal.trim().length < 2) {
      setResultadosBusca([]);
      setBuscandoGlobal(false);
      return;
    }
    setBuscandoGlobal(true);
    const timer = setTimeout(async () => {
      const q = buscaGlobal.trim();
      try {
        const [cpRes, contratoRes, cicloRes, insumoRes, pessoaRes] = await Promise.all([
          supabase.from("lancamentos").select("id, descricao, valor, tipo").eq("fazenda_id", fazendaId).ilike("descricao", `%${q}%`).in("status", ["em_aberto", "vencido", "vencendo"]).limit(3),
          supabase.from("contratos").select("id, numero_contrato, cliente").eq("fazenda_id", fazendaId).or(`numero_contrato.ilike.%${q}%,cliente.ilike.%${q}%`).limit(3),
          supabase.from("ciclos").select("id, nome, cultura").eq("fazenda_id", fazendaId).ilike("nome", `%${q}%`).limit(3),
          supabase.from("insumos").select("id, nome, categoria").eq("fazenda_id", fazendaId).ilike("nome", `%${q}%`).limit(3),
          supabase.from("pessoas").select("id, nome, cpf_cnpj").eq("fazenda_id", fazendaId).ilike("nome", `%${q}%`).limit(3),
        ]);
        const res: ResultadoBusca[] = [];
        for (const r of cpRes.data ?? []) {
          res.push({ id: `lan-${r.id}`, categoria: r.tipo === "pagar" ? "A Pagar" : "A Receber", titulo: r.descricao, subtitulo: r.valor ? fmtMoeda(r.valor) : undefined, link: r.tipo === "pagar" ? "/financeiro/pagar" : "/financeiro/receber", cor: r.tipo === "pagar" ? "#E24B4A" : "#16A34A" });
        }
        for (const r of contratoRes.data ?? []) {
          res.push({ id: `cnt-${r.id}`, categoria: "Contrato", titulo: r.numero_contrato || r.cliente || "Contrato", subtitulo: r.cliente, link: "/contratos", cor: "#C9921B" });
        }
        for (const r of cicloRes.data ?? []) {
          res.push({ id: `cic-${r.id}`, categoria: "Ciclo", titulo: r.nome, subtitulo: r.cultura, link: "/lavoura", cor: "#16A34A" });
        }
        for (const r of insumoRes.data ?? []) {
          res.push({ id: `ins-${r.id}`, categoria: "Insumo", titulo: r.nome, subtitulo: r.categoria, link: "/estoque", cor: "#1A4870" });
        }
        for (const r of pessoaRes.data ?? []) {
          res.push({ id: `pes-${r.id}`, categoria: "Pessoa", titulo: r.nome, subtitulo: r.cpf_cnpj, link: "/cadastros?tab=pessoas", cor: "var(--text-2)" });
        }
        setResultadosBusca(res.slice(0, 12));
      } catch (_e) { /* ignore */ }
      setBuscandoGlobal(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [buscaGlobal, fazendaId]);

  // ── Fecha busca ao clicar fora ──
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setBuscaAberta(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Busca de preços (usada no polling) ──
  const buscarPrecos = useCallback(() => {
    fetch("/api/precos")
      .then(r => r.json())
      .then((novo: PrecosData) => {
        const prev = prevPrecos.current;
        if (prev) {
          // Detecta quais preços mudaram → flash
          const novoFlash: Record<string, Direcao> = {
            soja:    direcao(novo.soja.cbot,    prev.soja.cbot),
            milho:   direcao(novo.milho.brl,    prev.milho.brl),
            algodao: direcao(novo.algodao.cbot, prev.algodao.cbot),
            usd:     direcao(novo.usdBrl,       prev.usdBrl),
          };
          setFlash(novoFlash);
          // Apaga o flash após 1,5s
          setTimeout(() => setFlash({}), 1500);
        }
        prevPrecos.current = novo;
        setPrecos(novo);
        setLoadPr(false);
        setMercado(statusMercado());
      })
      .catch(() => setLoadPr(false));
  }, []);

  // ── Polling 5 min (preços de commodities não mudam por segundo) ──
  useEffect(() => {
    buscarPrecos();
    const id = setInterval(buscarPrecos, 5 * 60_000);
    return () => clearInterval(id);
  }, [buscarPrecos]);

  // ── Relógio do status de mercado (atualiza a cada minuto) ──
  useEffect(() => {
    const id = setInterval(() => setMercado(statusMercado()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Alertas e dados do dashboard ──
  useEffect(() => {
    if (!fazendaId) return;

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const em7  = new Date(hoje); em7.setDate(hoje.getDate() + 7);
    const em15 = new Date(hoje); em15.setDate(hoje.getDate() + 15);
    const floor180 = new Date(hoje); floor180.setDate(hoje.getDate() - 180);
    const isoHoje  = hoje.toISOString().split("T")[0];
    const isoEm7   = em7.toISOString().split("T")[0];
    const isoEm15  = em15.toISOString().split("T")[0];
    const isoFloor = floor180.toISOString().split("T")[0];

    const statusAberto = ["em_aberto", "vencido", "vencendo"];
    Promise.all([
      // CP a vencer nos próximos 7 dias + vencidos (piso 180 dias atrás)
      supabase.from("lancamentos")
        .select("id, descricao, valor, data_vencimento, status")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "pagar")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto)
        .gte("data_vencimento", isoFloor)
        .lte("data_vencimento", isoEm7)
        .order("data_vencimento"),

      // CR a vencer nos próximos 7 dias + vencidos (piso 180 dias atrás)
      supabase.from("lancamentos")
        .select("id, descricao, valor, data_vencimento, status")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "receber")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto)
        .gte("data_vencimento", isoFloor)
        .lte("data_vencimento", isoEm7)
        .order("data_vencimento"),

      // Arrendamentos vencendo em 15 dias
      supabase.from("arrendamento_pagamentos")
        .select("id, data_vencimento, valor_previsto, sacas_previstas, commodity, arrendamentos(descricao)")
        .eq("fazenda_id", fazendaId)
        .eq("status", "pendente")
        .lte("data_vencimento", isoEm15)
        .order("data_vencimento"),

      // Certificado A1
      supabase.from("configuracoes")
        .select("cert_a1_vencimento")
        .eq("fazenda_id", fazendaId)
        .maybeSingle(),

      // CP total em aberto
      supabase.from("lancamentos")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "pagar")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto),

      // CR total em aberto
      supabase.from("lancamentos")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "receber")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto),

      // CP vencendo esta semana (hoje a 7 dias)
      supabase.from("lancamentos")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "pagar")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto)
        .gte("data_vencimento", isoHoje)
        .lte("data_vencimento", isoEm7),

      // CR vencendo esta semana (hoje a 7 dias)
      supabase.from("lancamentos")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "receber")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto)
        .gte("data_vencimento", isoHoje)
        .lte("data_vencimento", isoEm7),

      // Ciclos ativos
      supabase.from("ciclos")
        .select("id", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId)
        .eq("status", "ativo"),

      // Contratos confirmados não encerrados
      supabase.from("contratos")
        .select("id", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId)
        .eq("confirmado", true)
        .neq("status", "encerrado"),

      // CP vencidos (piso 180 dias atrás — exclui artefatos da migração)
      supabase.from("lancamentos")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "pagar")
        .neq("moeda", "barter")
        .or("natureza.is.null,natureza.neq.previsao")
        .in("status", statusAberto)
        .gte("data_vencimento", isoFloor)
        .lt("data_vencimento", isoHoje),

      // Seguros de máquinas vencendo em 30 dias
      supabase.from("maquinas")
        .select("id, nome, seguro_vencimento_apolice, seguro_seguradora")
        .eq("fazenda_id", fazendaId)
        .eq("ativa", true)
        .not("seguro_vencimento_apolice", "is", null)
        .lte("seguro_vencimento_apolice", new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]),

      // Pendências fiscais aguardando NF
      supabase.from("pendencias_fiscais")
        .select("id", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId)
        .eq("status", "aguardando"),

      // Insumos com estoque negativo
      supabase.from("insumos")
        .select("id, nome, estoque, unidade")
        .eq("fazenda_id", fazendaId)
        .lt("estoque", 0),

      // Solicitações de transferência — via API route (service_role_key, sem RLS)
      fetch("/api/campo/transferencias-pendentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_ids: fazendaIds && fazendaIds.length > 0 ? fazendaIds : [fazendaId] }),
      }).then(r => r.json()).catch(() => ({ ok: false, data: [], count: 0 })),
    ]).then(([
      cpRes, crRes, arrRes, certRes,
      cpTotalRes, crTotalRes, cpSemRes, crSemRes,
      ciclosRes, contratosRes, cpVencRes, segurosRes,
      pendFiscalRes, insNegRes, transfSolRes,
    ]) => {
      const novosAlertas: Alerta[] = [];

      // ── CP vencidos e a vencer ──
      const cpRows = cpRes.data ?? [];
      const cpVenc = cpRows.filter(r => diasAte(r.data_vencimento) < 0);
      const cpProx = cpRows.filter(r => diasAte(r.data_vencimento) >= 0);

      if (cpVenc.length > 0) {
        const total = cpVenc.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({
          id: "cp-vencidos",
          tipo: "cp",
          desc: `${cpVenc.length} conta${cpVenc.length > 1 ? "s" : ""} a pagar VENCIDA${cpVenc.length > 1 ? "S" : ""} · ${fmtMoeda(total)}`,
          valor: total,
          dias: -1,
          urgencia: "critico",
          link: "/financeiro/pagar",
          linkLabel: "Regularizar",
        });
      }

      // CP agrupados por urgência
      const cp1 = cpProx.filter(r => diasAte(r.data_vencimento) <= 1);
      const cp3 = cpProx.filter(r => diasAte(r.data_vencimento) > 1 && diasAte(r.data_vencimento) <= 3);
      const cp7 = cpProx.filter(r => diasAte(r.data_vencimento) > 3);

      if (cp1.length > 0) {
        const cp1Hoje = cp1.filter(r => diasAte(r.data_vencimento) === 0);
        const cp1Amanha = cp1.filter(r => diasAte(r.data_vencimento) === 1);
        if (cp1Hoje.length > 0) {
          const t = cp1Hoje.reduce((s, r) => s + (r.valor ?? 0), 0);
          novosAlertas.push({ id: "cp-hoje", tipo: "cp", desc: `${cp1Hoje.length} CP ${labelDias(0)} · ${fmtMoeda(t)}`, valor: t, dias: 0, urgencia: "alto", link: `/financeiro/pagar?vencDe=${isoHoje}&vencAte=${isoHoje}`, linkLabel: "Pagar" });
        }
        if (cp1Amanha.length > 0) {
          const isoAmanha = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0];
          const t = cp1Amanha.reduce((s, r) => s + (r.valor ?? 0), 0);
          novosAlertas.push({ id: "cp-amanha", tipo: "cp", desc: `${cp1Amanha.length} CP ${labelDias(1)} · ${fmtMoeda(t)}`, valor: t, dias: 1, urgencia: "alto", link: `/financeiro/pagar?vencDe=${isoAmanha}&vencAte=${isoAmanha}`, linkLabel: "Pagar" });
        }
      }
      if (cp3.length > 0) {
        const total = cp3.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({ id: "cp-3dias", tipo: "cp", desc: `${cp3.length} CP vencem em 2–3 dias · ${fmtMoeda(total)}`, valor: total, dias: 3, urgencia: "alto", link: "/financeiro/pagar", linkLabel: "Ver CP" });
      }
      if (cp7.length > 0) {
        const total = cp7.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({ id: "cp-7dias", tipo: "cp", desc: `${cp7.length} CP vencem esta semana · ${fmtMoeda(total)}`, valor: total, dias: 7, urgencia: "medio", link: "/financeiro/pagar", linkLabel: "Ver CP" });
      }

      // ── CR vencidos e a vencer ──
      const crRows = crRes.data ?? [];
      const crVenc = crRows.filter(r => diasAte(r.data_vencimento) < 0);
      const crProx = crRows.filter(r => diasAte(r.data_vencimento) >= 0);

      if (crVenc.length > 0) {
        const total = crVenc.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({
          id: "cr-vencidos",
          tipo: "cr",
          desc: `${crVenc.length} conta${crVenc.length > 1 ? "s" : ""} a receber VENCIDA${crVenc.length > 1 ? "S" : ""} · ${fmtMoeda(total)}`,
          valor: total,
          dias: -1,
          urgencia: "critico",
          link: "/financeiro/receber",
          linkLabel: "Cobrar",
        });
      }
      if (crProx.length > 0) {
        const total = crProx.reduce((s, r) => s + (r.valor ?? 0), 0);
        const minD = Math.min(...crProx.map(r => diasAte(r.data_vencimento)));
        novosAlertas.push({ id: "cr-prox", tipo: "cr", desc: `${crProx.length} CR a receber · ${fmtMoeda(total)} · ${labelDias(minD)}`, valor: total, dias: minD, urgencia: urgDias(minD), link: "/financeiro/receber", linkLabel: "Ver CR" });
      }

      // ── Arrendamentos ──
      for (const arr of arrRes.data ?? []) {
        const dias = diasAte(arr.data_vencimento);
        const arrObj = arr.arrendamentos as { descricao?: string } | null;
        const descArr = arrObj?.descricao ?? "Arrendamento";
        const valorArr = arr.valor_previsto
          ? fmtMoeda(arr.valor_previsto)
          : arr.sacas_previstas
          ? `${arr.sacas_previstas} sc ${arr.commodity ?? ""}`
          : "—";
        novosAlertas.push({
          id: `arr-${arr.id}`,
          tipo: "arrendamento",
          desc: `Arrendamento "${descArr}" · ${valorArr} · ${labelDias(dias)}`,
          valor: arr.valor_previsto ?? undefined,
          dias,
          urgencia: dias <= 0 ? "critico" : dias <= 3 ? "alto" : "medio",
          link: "/contratos/arrendamento",
          linkLabel: "Ver",
        });
      }

      // ── Certificado A1 ──
      const certVenc = (certRes.data as { cert_a1_vencimento?: string } | null)?.cert_a1_vencimento;
      if (certVenc) {
        const dias = diasAte(certVenc);
        if (dias <= 30) {
          novosAlertas.push({
            id: "cert-a1",
            tipo: "cert_a1",
            desc: `Certificado A1 vence ${labelDias(dias)} — renove para não interromper NF-e`,
            dias,
            urgencia: dias <= 7 ? (dias <= 1 ? "critico" : "alto") : "medio",
            link: "/configuracoes?tab=certificado",
            linkLabel: "Renovar",
          });
        }
      }

      // ── Seguros de máquinas / veículos ──
      for (const maq of (segurosRes.data ?? [])) {
        const dias = diasAte(maq.seguro_vencimento_apolice);
        if (dias === null) continue;
        const desc = dias < 0
          ? `Seguro "${maq.nome}" VENCIDO há ${Math.abs(dias)} dias — ${maq.seguro_seguradora ?? "seguradora não informada"}`
          : `Seguro "${maq.nome}" vence ${labelDias(dias)} — ${maq.seguro_seguradora ?? ""}`;
        novosAlertas.push({
          id: `seguro-${maq.id}`,
          tipo: "seguro",
          desc,
          dias,
          urgencia: dias < 0 ? "critico" : dias <= 7 ? "alto" : "medio",
          link: "/cadastros?tab=maquinas",
          linkLabel: "Renovar",
        });
      }

      // ── Pendências fiscais ──
      const qtdFiscal = pendFiscalRes.count ?? 0;
      if (qtdFiscal > 0) {
        novosAlertas.push({
          id: "pendencias-fiscais",
          tipo: "fiscal",
          desc: `${qtdFiscal} pendência${qtdFiscal > 1 ? "s" : ""} fiscal${qtdFiscal > 1 ? "is" : ""} aguardando NF`,
          urgencia: "medio",
          link: "/fiscal/pendencias",
          linkLabel: "Ver",
        });
      }

      // ── Estoque negativo ──
      const insNeg = (insNegRes.data ?? []) as { id: string; nome: string; estoque: number; unidade: string }[];
      if (insNeg.length > 0) {
        const lista = insNeg.slice(0, 3).map(i => `${i.nome} (${i.estoque.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${i.unidade})`).join(", ");
        const sufixo = insNeg.length > 3 ? ` e mais ${insNeg.length - 3}` : "";
        novosAlertas.push({
          id: "estoque-negativo",
          tipo: "estoque",
          desc: `${insNeg.length} insumo${insNeg.length > 1 ? "s" : ""} com estoque negativo: ${lista}${sufixo}`,
          urgencia: "alto",
          link: "/cadastros?tab=insumos",
          linkLabel: "Ver Insumos",
        });
      }

      // ── Solicitações de transferência via app campo ──
      const qtdTransf = transfSolRes.count ?? 0;
      if (qtdTransf > 0) {
        const urgentes = (transfSolRes.data ?? []).filter((t: { urgencia: string }) => t.urgencia === "urgente").length;
        novosAlertas.push({
          id: "transferencias-pendentes",
          tipo: "estoque",
          desc: `${qtdTransf} solicitação${qtdTransf > 1 ? "s" : ""} de transferência pendente${qtdTransf > 1 ? "s" : ""} do app campo${urgentes > 0 ? ` (${urgentes} urgente${urgentes > 1 ? "s" : ""})` : ""}`,
          urgencia: urgentes > 0 ? "alto" : "medio",
          link: "/estoque/transferencias",
          linkLabel: "Emitir NF",
        });
      }

      // Ordenar: crítico → alto → médio
      const ordem: Record<Urgencia, number> = { critico: 0, alto: 1, medio: 2, info: 3 };
      novosAlertas.sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia]);

      setAlertas(novosAlertas);

      // Resumo financeiro
      const cpT = (cpTotalRes.data ?? []).reduce((s, r) => s + ((r as { valor: number }).valor ?? 0), 0);
      const crT = (crTotalRes.data ?? []).reduce((s, r) => s + ((r as { valor: number }).valor ?? 0), 0);
      const cpS = (cpSemRes.data ?? []).reduce((s, r) => s + ((r as { valor: number }).valor ?? 0), 0);
      const crS = (crSemRes.data ?? []).reduce((s, r) => s + ((r as { valor: number }).valor ?? 0), 0);
      const cpV = (cpVencRes.data ?? []).reduce((s, r) => s + ((r as { valor: number }).valor ?? 0), 0);
      setCpAberto(cpT);
      setCrAberto(crT);
      setCpSemana(cpS);
      setCrSemana(crS);
      setVencidosCp(cpV);
      setCiclosAtivos(ciclosRes.count ?? 0);
      setContratosAtivos(contratosRes.count ?? 0);

      setLoadAl(false);
    }).catch(() => setLoadAl(false));

    // Carrega pendências de conciliação independentemente
    supabase.from("conciliacao_pendencias")
      .select("id,conta_nome,conta_id,data,descricao,valor,tipo,fitid")
      .eq("fazenda_id", fazendaId)
      .eq("status", "pendente")
      .order("data", { ascending: false })
      .then(({ data }) => { if (data) setConciliPend(data as ConciliPendencia[]); });
  }, [fazendaId]);

  // ── Resolve inconsistência de conciliação ────────────────────
  async function resolverInconsistencia(p: ConciliPendencia, categoria: string) {
    if (!fazendaId || resolvendo) return;
    setResolvendo(p.id);
    try {
      const isoHoje = new Date().toISOString().slice(0, 10);
      const tipo = p.tipo === "debito" ? "pagar" : "receber";
      // Cria lançamento (já baixado)
      const { data: lanc } = await supabase.from("lancamentos").insert({
        fazenda_id: fazendaId,
        tipo,
        descricao: p.descricao,
        categoria,
        moeda: "BRL",
        valor: p.valor,
        valor_pago: p.valor,
        data_lancamento: p.data,
        data_vencimento: p.data,
        data_baixa: isoHoje,
        status: "baixado",
        conta_bancaria: p.conta_id ?? null,
        auto: false,
        observacao: `Lançado automaticamente via inconsistência de conciliação (FITID: ${p.fitid})`,
      }).select("id").single();

      // Marca a inconsistência como resolvida
      await supabase.from("conciliacao_pendencias").update({
        status: "resolvido",
        lancamento_id: lanc?.id ?? null,
      }).eq("id", p.id);

      setConciliPend(prev => prev.filter(x => x.id !== p.id));
    } finally {
      setResolvendo(null);
    }
  }

  async function ignorarInconsistencia(id: string) {
    await supabase.from("conciliacao_pendencias").update({ status: "ignorado" }).eq("id", id);
    setConciliPend(prev => prev.filter(x => x.id !== id));
  }

  const saldoSemana = crSemana - cpSemana;

  const TIPO_LABEL: Record<string, string> = {
    cp: "A Pagar", cr: "A Receber", arrendamento: "Arrendamento",
    cert_a1: "Certificado", contrato: "Contrato", estoque: "Estoque", fiscal: "Fiscal",
  };

  const ATALHOS = [
    { label: "Contas a Pagar",   link: "/financeiro/pagar",    cor: "#E24B4A", sigla: "CP" },
    { label: "Contas a Receber", link: "/financeiro/receber",  cor: "#16A34A", sigla: "CR" },
    { label: "Pedido de Compra", link: "/compras",             cor: "#1A4870", sigla: "PC" },
    { label: "NF Entrada",       link: "/compras/nf",          cor: "#1A4870", sigla: "NF" },
    { label: "Contratos Grãos",  link: "/contratos",           cor: "#C9921B", sigla: "CG" },
    { label: "Estoque",          link: "/estoque",             cor: "var(--text-2)", sigla: "ES" },
    { label: "Lavoura",          link: "/lavoura",             cor: "#16A34A", sigla: "LV" },
    { label: "Relatórios",       link: "/relatorios",          cor: "#378ADD", sigla: "RL" },
  ];

  // ── Counter animations (disparadas quando dados chegam do banco) ──
  const saldoAnim  = useCountUp(!loadAl ? saldoSemana : 0);
  const cpAnim     = useCountUp(!loadAl ? cpAberto    : 0);
  const crAnim     = useCountUp(!loadAl ? crAberto    : 0);

  const CSS = `
    @keyframes fadeUp   { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
    @keyframes pulso    { 0%,100% { opacity:1 } 50% { opacity:.3 } }
    @keyframes ticker   { from { transform:translateX(0) } to { transform:translateX(-50%) } }
    .al-row:hover  { background: rgba(255,255,255,0.04) !important }
    .atalho-dark   { transition: background .15s, border-color .15s, transform .15s }
    .atalho-dark:hover { background: var(--border) !important; transform: translateY(-1px) }
    .mkt-flash-up  { background: rgba(34,197,94,0.12) !important }
    .mkt-flash-dn  { background: rgba(239,68,68,0.12) !important }
  `;

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg-page)", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <TopNav />
      {onboardingAtivo && <OnboardingPanel />}

      <main style={{ flex:1, maxWidth:1440, margin:"0 auto", width:"100%", padding:"0 0 60px" }}>

        {/* ═══ HERO ═══ */}
        <div style={{
          padding:"36px 32px 32px",
          background:"linear-gradient(160deg,#0A1628 0%,#0D1F38 60%,#091422 100%)",
          borderBottom:"0.5px solid var(--border)",
          animation:"fadeUp .5s ease both",
        }}>
          {/* Saudação */}
          <div style={{ fontSize:12,color:"var(--text-3)",fontWeight:500,marginBottom:20,letterSpacing:".02em" }}>
            {saudar()}, {(nomeUsuario ?? "").split(" ")[0] || "…"} &nbsp;·&nbsp;
            {new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
            {ciclosAtivos > 0 && <span style={{ color:"#22C55E" }}> · {ciclosAtivos} ciclo{ciclosAtivos>1?"s":""} ativo{ciclosAtivos>1?"s":""}</span>}
          </div>

          {/* Número principal */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:40, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:10,fontWeight:700,color:"var(--text-muted)",letterSpacing:".14em",textTransform:"uppercase",marginBottom:8 }}>
                SALDO PROJETADO — 7 DIAS
              </div>
              <div style={{ fontSize:64,fontWeight:800,lineHeight:1,letterSpacing:"-2px",fontVariantNumeric:"tabular-nums",
                color: loadAl ? "#1E3A5F" : saldoSemana >= 0 ? "#22C55E" : "#EF4444" }}>
                {loadAl ? "—" : <>{saldoSemana >= 0 ? "+" : ""}{fmtMoeda(saldoAnim)}</>}
              </div>
              <div style={{ display:"flex",gap:20,marginTop:12 }}>
                <span style={{ fontSize:12,color:"var(--text-3)" }}>
                  Entradas <strong style={{ color:"#22C55E",fontVariantNumeric:"tabular-nums" }}>+{fmtMoeda(crSemana)}</strong>
                </span>
                <span style={{ fontSize:12,color:"var(--text-3)" }}>
                  Saídas <strong style={{ color:"#EF4444",fontVariantNumeric:"tabular-nums" }}>−{fmtMoeda(cpSemana)}</strong>
                </span>
                {vencidosCp > 0 && (
                  <span style={{ fontSize:12,fontWeight:700,color:"#EF4444" }}>⚠ {fmtMoeda(vencidosCp)} vencidos</span>
                )}
              </div>
            </div>

            {/* KPI Strip */}
            <div style={{ display:"flex",gap:2,flexWrap:"wrap",marginLeft:"auto" }}>
              {([
                { label:"A PAGAR",    v:loadAl?"—":fmtMoeda(cpAnim),       c:"#EF4444", bg:"rgba(239,68,68,0.1)",   b:"rgba(239,68,68,0.2)"   },
                { label:"A RECEBER",  v:loadAl?"—":fmtMoeda(crAnim),       c:"#22C55E", bg:"rgba(34,197,94,0.08)",  b:"rgba(34,197,94,0.2)"   },
                { label:"CICLOS",     v:loadAl?"—":String(ciclosAtivos),    c:"#60A5FA", bg:"rgba(96,165,250,0.08)", b:"rgba(96,165,250,0.2)"  },
                { label:"CONTRATOS",  v:loadAl?"—":String(contratosAtivos), c:"#FBBF24", bg:"rgba(251,191,36,0.08)", b:"rgba(251,191,36,0.2)"  },
              ] as const).map((s,i) => (
                <div key={i} style={{ padding:"14px 20px",background:s.bg,border:`0.5px solid ${s.b}`,borderRadius:10,minWidth:130,textAlign:"center" }}>
                  <div style={{ fontSize:9,fontWeight:700,color:"var(--text-muted)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontSize:20,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",lineHeight:1 }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Status bolsas */}
          <div style={{ display:"flex",gap:10,marginTop:20,flexWrap:"wrap",alignItems:"center" }}>
            {[mercado.cbot,mercado.b3].map((m,i) => (
              <span key={i} style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,
                color:m.aberto?"#22C55E":"var(--text-3)",padding:"4px 12px",borderRadius:20,
                background:m.aberto?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
                border:`0.5px solid ${m.aberto?"rgba(34,197,94,0.3)":"var(--border)"}` }}>
                <span style={{ width:6,height:6,borderRadius:"50%",background:m.aberto?"#22C55E":"var(--text-muted)",display:"inline-block",animation:m.aberto?"pulso 2s ease infinite":"none" }} />
                {m.label}
              </span>
            ))}
            {alertas.some(a => a.urgencia==="critico") && (
              <span style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,
                color:"#EF4444",padding:"4px 12px",borderRadius:20,
                background:"rgba(239,68,68,0.1)",border:"0.5px solid rgba(239,68,68,0.3)" }}>
                <span style={{ width:6,height:6,borderRadius:"50%",background:"#EF4444",display:"inline-block",animation:"pulso 1s ease infinite" }} />
                {alertas.filter(a=>a.urgencia==="critico").length} crítico{alertas.filter(a=>a.urgencia==="critico").length>1?"s":""}
              </span>
            )}

            {/* Busca global */}
            <div ref={buscaRef} style={{ marginLeft:"auto",position:"relative",width:340 }}>
              <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--text-muted)",pointerEvents:"none" }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar lançamentos, contratos, insumos…"
                value={buscaGlobal}
                onChange={e => { setBuscaGlobal(e.target.value); setBuscaAberta(true); }}
                onFocus={() => setBuscaAberta(true)}
                style={{ width:"100%",boxSizing:"border-box",padding:"8px 12px 8px 34px",
                  border:"0.5px solid var(--border)",borderRadius:10,fontSize:13,
                  background:"var(--bg-input)",outline:"none",color:"var(--text-1)",
                  boxShadow:"none" }}
              />
              {buscaGlobal && !buscandoGlobal && (
                <button onClick={() => { setBuscaGlobal(""); setResultadosBusca([]); }} style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:"var(--text-3)",padding:0,lineHeight:1 }}>×</button>
              )}
              {buscaAberta && buscaGlobal.trim().length >= 2 && (
                <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#112236",border:"0.5px solid var(--border)",borderRadius:10,boxShadow:"0 12px 40px rgba(0,0,0,0.5)",zIndex:200,overflow:"hidden",maxHeight:320,overflowY:"auto" }}>
                  {resultadosBusca.length === 0 && !buscandoGlobal && (
                    <div style={{ padding:"14px",fontSize:12,color:"var(--text-3)",textAlign:"center" }}>Nenhum resultado para "{buscaGlobal}"</div>
                  )}
                  {resultadosBusca.map(r => (
                    <a key={r.id} href={r.link} onClick={() => setBuscaAberta(false)}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"0.5px solid var(--border-table)",textDecoration:"none",background:"transparent" }}
                      onMouseEnter={e=>(e.currentTarget.style.background="var(--bg-input)")}
                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5,background:r.cor+"22",color:r.cor,flexShrink:0 }}>{r.categoria}</span>
                      <span style={{ flex:1,fontSize:13,color:"var(--text-1)",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.titulo}</span>
                      {r.subtitulo && <span style={{ fontSize:11,color:"var(--text-3)",flexShrink:0 }}>{r.subtitulo}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ TICKER DE PREÇOS ═══ */}
        {!loadPr && precos && (
          <div style={{ background:"var(--bg-nav)",borderBottom:"0.5px solid var(--border-table)",padding:"10px 0",overflow:"hidden" }}>
            <div style={{ display:"flex",alignItems:"center",padding:"0 20px",flexWrap:"wrap",gap:32 }}>
              {[
                { nome:"SOJA CBOT",   v:`${fmtUsd(precos.soja.cbot)}¢/bu`,     brl:`R$ ${fmtBrl(precos.soja.brl)}/sc`,    d:precos.soja.variacao    },
                { nome:"MILHO",       v:`R$ ${fmtBrl(precos.milho.brl)}/sc`,    brl:"",                                    d:precos.milho.variacao   },
                { nome:"ALGODÃO",     v:`${fmtUsd(precos.algodao.cbot)}¢/lb`,   brl:`R$ ${fmtBrl(precos.algodao.brl)}/@`,  d:precos.algodao.variacao },
                { nome:"USD SPOT",    v:`R$ ${fmtBrl(precos.usdBrl)}`,          brl:"",                                    d:0                       },
                { nome:"PTAX",        v:precos.usdPtax?`R$ ${fmtBrl4(precos.usdPtax)}`:"—", brl:"", d:0                  },
              ].map((m,i) => (
                <div key={i} style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
                  <span style={{ fontSize:10,fontWeight:700,color:"var(--text-muted)",letterSpacing:".06em" }}>{m.nome}</span>
                  <span style={{ fontSize:14,fontWeight:700,color:"var(--text-1)",fontVariantNumeric:"tabular-nums" }}>{m.v}</span>
                  {m.brl && <span style={{ fontSize:11,color:"var(--text-3)" }}>{m.brl}</span>}
                  {m.d !== 0 && <span style={{ fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4,
                    background:m.d>0?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",
                    color:m.d>0?"#22C55E":"#EF4444" }}>{fmtPct(m.d)}</span>}
                  {i < 4 && <div style={{ width:1,height:14,background:"var(--border)",marginLeft:12 }} />}
                </div>
              ))}
              <span style={{ fontSize:10,color:"#1E3A5F",marginLeft:"auto" }}>
                {precos.erro ? "⚠ dados aproximados" : new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
              </span>
            </div>
          </div>
        )}

        {/* ═══ GRID PRINCIPAL ═══ */}
        <div style={{ padding:"24px 28px",display:"grid",gridTemplateColumns:"1fr 300px",gap:20,alignItems:"start" }}>

          {/* ── COLUNA ESQUERDA ── */}
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

            {/* ALERTAS */}
            <div style={{ background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:12,overflow:"hidden" }}>
              <div style={{ padding:"14px 20px",borderBottom:"0.5px solid var(--border-table)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ fontWeight:700,fontSize:14,color:"var(--text-1)" }}>Alertas &amp; Pendências</span>
                {loadAl
                  ? <span style={{ fontSize:11,color:"#1E3A5F" }}>verificando…</span>
                  : <span style={{ fontSize:11,color:"var(--text-3)",background:"var(--bg-input)",padding:"2px 9px",borderRadius:10,fontWeight:600 }}>{alertas.length} {alertas.length===1?"item":"itens"}</span>
                }
              </div>

              {loadAl ? (
                <div style={{ padding:"32px 20px",textAlign:"center",fontSize:12,color:"#1E3A5F" }}>Verificando pendências…</div>
              ) : alertas.length === 0 ? (
                <div style={{ padding:"44px 20px",textAlign:"center" }}>
                  <div style={{ width:48,height:48,borderRadius:"50%",background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#22C55E" }}>✓</div>
                  <div style={{ fontSize:14,fontWeight:700,color:"#22C55E",marginBottom:5 }}>Tudo em dia</div>
                  <div style={{ fontSize:12,color:"var(--text-muted)" }}>Nenhuma pendência nos próximos 7 dias</div>
                </div>
              ) : alertas.map((a, idx) => {
                const cor = COR[a.urgencia];
                return (
                  <div key={a.id} className="al-row" style={{
                    display:"flex",alignItems:"center",gap:12,padding:"12px 20px",
                    borderBottom: idx < alertas.length-1 ? "0.5px solid rgba(255,255,255,0.04)" : "none",
                    background:"transparent",
                    borderLeft:`3px solid ${cor.badge}`,
                  }}>
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,flexShrink:0,background:cor.badge+"18",color:cor.badge,letterSpacing:".04em",textTransform:"uppercase" }}>
                      {TIPO_LABEL[a.tipo] ?? a.tipo}
                    </span>
                    <span style={{ flex:1,fontSize:13,color:"var(--text-2)",lineHeight:1.45 }}>{a.desc}</span>
                    <a href={a.link}
                      style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:"var(--border-table)",border:"0.5px solid var(--border)",color:"var(--text-2)",fontWeight:600,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0 }}>
                      {a.linkLabel} →
                    </a>
                  </div>
                );
              })}
            </div>

            {/* CONCILIAÇÃO */}
            {conciliPend.length > 0 && (
              <div style={{ background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:12,overflow:"hidden" }}>
                <div style={{ padding:"12px 20px",borderBottom:"0.5px solid var(--border-table)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                  <span style={{ fontWeight:700,fontSize:14,color:"var(--text-1)" }}>Inconsistências de Conciliação</span>
                  <span style={{ fontSize:11,fontWeight:700,color:"#FBBF24",background:"rgba(251,191,36,0.1)",padding:"2px 8px",borderRadius:10,border:"0.5px solid rgba(251,191,36,0.3)" }}>
                    {conciliPend.length} sem lançamento
                  </span>
                </div>
                {conciliPend.slice(0,5).map(p => (
                  <div key={p.id} style={{ padding:"11px 20px",borderBottom:"0.5px solid rgba(255,255,255,0.04)",display:"flex",alignItems:"center",gap:12 }}>
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,background:p.tipo==="debito"?"rgba(239,68,68,0.12)":"rgba(34,197,94,0.12)",color:p.tipo==="debito"?"#EF4444":"#22C55E",flexShrink:0 }}>
                      {p.tipo==="debito"?"DÉBITO":"CRÉDITO"}
                    </span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:12,fontWeight:600,color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{p.descricao}</div>
                      <div style={{ fontSize:11,color:"var(--text-3)" }}>{p.data.split("-").reverse().join("/")} · {p.conta_nome ?? "—"}</div>
                    </div>
                    <span style={{ fontSize:13,fontWeight:700,color:p.tipo==="debito"?"#EF4444":"#22C55E",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums" }}>
                      {p.tipo==="debito"?"−":"+"}R$ {p.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}
                    </span>
                    <button disabled={resolvendo===p.id} onClick={() => { const cat=prompt(`Categoria (${p.descricao}):`,p.tipo==="debito"?"Taxas Bancárias":"Outros Créditos"); if(cat!==null) resolverInconsistencia(p,cat||(p.tipo==="debito"?"Taxas Bancárias":"Outros Créditos")); }}
                      style={{ padding:"4px 10px",background:"rgba(59,130,246,0.15)",color:"#60A5FA",border:"0.5px solid rgba(59,130,246,0.3)",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",opacity:resolvendo===p.id?.6:1,flexShrink:0 }}>
                      {resolvendo===p.id?"Lançando…":"Lançar"}
                    </button>
                    <button onClick={() => ignorarInconsistencia(p.id)} style={{ padding:"4px 9px",background:"rgba(255,255,255,0.04)",color:"var(--text-3)",border:"0.5px solid var(--border)",borderRadius:6,fontSize:11,cursor:"pointer",flexShrink:0 }}>
                      Ignorar
                    </button>
                  </div>
                ))}
                {conciliPend.length > 5 && (
                  <div style={{ padding:"10px 20px",textAlign:"center" }}>
                    <a href="/financeiro/conciliacao" style={{ fontSize:12,color:"#60A5FA",fontWeight:600,textDecoration:"none" }}>Ver todas ({conciliPend.length}) →</a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── COLUNA DIREITA: Atalhos ── */}
          <div>
            <div style={{ background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:12,padding:"16px" }}>
              <div style={{ fontSize:10,fontWeight:700,color:"var(--text-muted)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:14 }}>Acesso Rápido</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                {ATALHOS.map(a => (
                  <a key={a.link} href={a.link} className="atalho-dark"
                    style={{ display:"flex",alignItems:"center",gap:10,padding:"12px",borderRadius:8,
                      border:"0.5px solid var(--border)",textDecoration:"none",
                      background:"var(--bg-stripe)" }}>
                    <span style={{ width:32,height:32,borderRadius:8,background:a.cor+"1A",color:a.cor,fontWeight:800,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{a.sigla}</span>
                    <span style={{ fontSize:12,color:"var(--text-2)",fontWeight:500,lineHeight:1.25 }}>{a.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

