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
      : { aberto: false, label: "CBOT fechado",  cor: "#aaa"    },
    b3:   b3Aberto
      ? { aberto: true,  label: "B3 aberta",     cor: "#16A34A" }
      : { aberto: false, label: "B3 fechada",    cor: "#aaa"    },
  };
}

// ─── Direção de preço ────────────────────────────────────────
type Direcao = "up" | "down" | "same";
function direcao(atual: number, anterior: number | undefined): Direcao {
  if (anterior === undefined || atual === anterior) return "same";
  return atual > anterior ? "up" : "down";
}
const DIR_COLOR = { up: "#16A34A", down: "#E24B4A", same: "#1a1a1a" };
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
  const { fazendaId, onboardingAtivo } = useAuth();

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
          res.push({ id: `pes-${r.id}`, categoria: "Pessoa", titulo: r.nome, subtitulo: r.cpf_cnpj, link: "/cadastros?tab=pessoas", cor: "#555" });
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
    ]).then(([
      cpRes, crRes, arrRes, certRes,
      cpTotalRes, crTotalRes, cpSemRes, crSemRes,
      ciclosRes, contratosRes, cpVencRes, segurosRes,
      pendFiscalRes, insNegRes,
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
    { label: "Estoque",          link: "/estoque",             cor: "#555555", sigla: "ES" },
    { label: "Lavoura",          link: "/lavoura",             cor: "#16A34A", sigla: "LV" },
    { label: "Relatórios",       link: "/relatorios",          cor: "#378ADD", sigla: "RL" },
  ];

  // ── Counter animations (disparadas quando dados chegam do banco) ──
  const saldoAnim  = useCountUp(!loadAl ? saldoSemana : 0);
  const cpAnim     = useCountUp(!loadAl ? cpAberto    : 0);
  const crAnim     = useCountUp(!loadAl ? crAberto    : 0);

  // ── CSS keyframes (injetados uma vez no DOM) ──
  const CSS = `
    @keyframes heroIn  { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
    @keyframes slideIn { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:translateX(0) } }
    @keyframes pulso   { 0%,100% { opacity:1 } 50% { opacity:.35 } }
    .al-row  { transition: background .12s }
    .al-row:hover { background: #FAFBFD !important }
    .al-btn  { transition: background .12s, color .12s }
    .al-btn:hover { background: #1A4870 !important; color: #fff !important }
    .mkt-row { transition: background .7s ease }
    .atalho  { transition: all .15s }
    .atalho:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(26,72,112,.13) !important }
  `;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <TopNav />

      {onboardingAtivo && <OnboardingPanel />}

      <main style={{ flex: 1, maxWidth: 1440, margin: "0 auto", width: "100%", paddingBottom: 48 }}>

        {/* ════════ HERO BAND ════════ */}
        <div style={{
          background: "linear-gradient(130deg,#0B2D50 0%,#1A4870 55%,#1A5CB8 100%)",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          marginBottom: 0,
        }}>
          {/* Círculos decorativos */}
          <div style={{ position:"absolute",right:-70,top:-70,width:280,height:280,borderRadius:"50%",background:"rgba(255,255,255,.03)",pointerEvents:"none" }} />
          <div style={{ position:"absolute",right:100,bottom:-90,width:220,height:220,borderRadius:"50%",background:"rgba(201,146,27,.07)",pointerEvents:"none" }} />
          <div style={{ position:"absolute",left:"28%",top:-20,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,.02)",pointerEvents:"none" }} />

          {/* Número herói */}
          <div style={{ flex:1, animation:"heroIn .65s cubic-bezier(.22,1,.36,1) both" }}>
            <div style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,.38)",letterSpacing:".12em",textTransform:"uppercase",marginBottom:10 }}>
              SALDO PROJETADO — PRÓXIMOS 7 DIAS
            </div>
            <div style={{ fontSize:52,fontWeight:800,color:"#fff",letterSpacing:"-1.5px",fontVariantNumeric:"tabular-nums",lineHeight:1,textShadow:"0 2px 20px rgba(0,0,0,.15)" }}>
              {loadAl
                ? <span style={{ color:"rgba(255,255,255,.2)" }}>—</span>
                : <>{saldoSemana >= 0 ? "+" : ""}{fmtMoeda(saldoAnim)}</>
              }
            </div>
            <div style={{ display:"flex",gap:22,marginTop:13,flexWrap:"wrap" }}>
              <span style={{ fontSize:12,color:"rgba(255,255,255,.5)" }}>
                Entradas: <strong style={{ color:"#86EFAC",fontVariantNumeric:"tabular-nums" }}>+{fmtMoeda(crSemana)}</strong>
              </span>
              <span style={{ fontSize:12,color:"rgba(255,255,255,.5)" }}>
                Saídas: <strong style={{ color:"#FCA5A5",fontVariantNumeric:"tabular-nums" }}>−{fmtMoeda(cpSemana)}</strong>
              </span>
              {vencidosCp > 0 && (
                <span style={{ fontSize:12,fontWeight:700,color:"#FCA5A5" }}>⚠ {fmtMoeda(vencidosCp)} vencidos</span>
              )}
            </div>
          </div>

          {/* Divisor */}
          <div style={{ width:1,height:68,background:"rgba(255,255,255,.1)",margin:"0 36px",flexShrink:0 }} />

          {/* 4 mini KPIs */}
          <div style={{ display:"flex",gap:30,flexShrink:0 }}>
            {([
              { label:"A PAGAR",    value: loadAl ? "—" : fmtMoeda(cpAnim),       color:"#FCA5A5", big:false },
              { label:"A RECEBER",  value: loadAl ? "—" : fmtMoeda(crAnim),       color:"#86EFAC", big:false },
              { label:"CICLOS",     value: loadAl ? "—" : String(ciclosAtivos),    color:"#93C5FD", big:true  },
              { label:"CONTRATOS",  value: loadAl ? "—" : String(contratosAtivos), color:"#FCD34D", big:true  },
            ] as const).map((s,i) => (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:9,fontWeight:700,color:"rgba(255,255,255,.32)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:6 }}>{s.label}</div>
                <div style={{ fontSize:s.big?32:18,fontWeight:800,color:s.color,fontVariantNumeric:"tabular-nums",lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ════════ SUBHEADER ════════ */}
        <div style={{ padding:"14px 32px 14px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",background:"#fff",borderBottom:"0.5px solid #E8ECF4",marginBottom:20 }}>
          <div style={{ fontSize:13,color:"#555",fontWeight:500 }}>
            {saudar()} &nbsp;·&nbsp; {new Date().toLocaleDateString("pt-BR",{ weekday:"long",day:"numeric",month:"long",year:"numeric" })}
            {ciclosAtivos > 0 && <span style={{ color:"#888" }}> · {ciclosAtivos} ciclo{ciclosAtivos>1?"s":""} ativo{ciclosAtivos>1?"s":""}</span>}
          </div>

          {/* Dots CBOT / B3 */}
          {[mercado.cbot, mercado.b3].map((m,i) => (
            <span key={i} style={{ display:"flex",alignItems:"center",gap:5,fontSize:11,color:m.cor,fontWeight:600,padding:"3px 10px",borderRadius:20,background:m.aberto?"#F0FDF4":"#F3F6F9",border:`0.5px solid ${m.aberto?"#86EFAC60":"#DDE2EE"}` }}>
              <span style={{ width:6,height:6,borderRadius:"50%",background:m.cor,display:"inline-block",animation:m.aberto?"pulso 2s ease infinite":"none" }} />
              {m.label}
            </span>
          ))}

          {/* Badge críticos */}
          {alertas.some(a => a.urgencia === "critico") && (
            <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:"#991B1B",background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:20,padding:"3px 10px" }}>
              <span style={{ width:6,height:6,borderRadius:"50%",background:"#E24B4A",display:"inline-block",animation:"pulso 1.2s ease infinite" }} />
              {alertas.filter(a => a.urgencia === "critico").length} crítico{alertas.filter(a=>a.urgencia==="critico").length>1?"s":""}
            </span>
          )}

          {/* Busca global */}
          <div ref={buscaRef} style={{ marginLeft:"auto",position:"relative",width:380 }}>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#bbb",pointerEvents:"none" }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar lançamentos, contratos, insumos…"
                value={buscaGlobal}
                onChange={e => { setBuscaGlobal(e.target.value); setBuscaAberta(true); }}
                onFocus={() => setBuscaAberta(true)}
                style={{ width:"100%",boxSizing:"border-box",padding:"8px 12px 8px 34px",border:"0.5px solid #DDE2EE",borderRadius:10,fontSize:13,background:"#F8FAFB",outline:"none",color:"#1a1a1a",boxShadow:"0 1px 3px rgba(26,72,112,.04)" }}
              />
              {buscandoGlobal && <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#ccc" }}>…</span>}
              {buscaGlobal && !buscandoGlobal && (
                <button onClick={() => { setBuscaGlobal(""); setResultadosBusca([]); }} style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#aaa",padding:0,lineHeight:1 }}>×</button>
              )}
            </div>
            {buscaAberta && buscaGlobal.trim().length >= 2 && (
              <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"0.5px solid #DDE2EE",borderRadius:10,boxShadow:"0 6px 24px rgba(0,0,0,.09)",zIndex:200,overflow:"hidden",maxHeight:360,overflowY:"auto" }}>
                {resultadosBusca.length === 0 && !buscandoGlobal && (
                  <div style={{ padding:"14px",fontSize:12,color:"#888",textAlign:"center" }}>Nenhum resultado para "{buscaGlobal}"</div>
                )}
                {resultadosBusca.map(r => (
                  <a key={r.id} href={r.link} onClick={() => setBuscaAberta(false)} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderBottom:"0.5px solid #F3F5F9",textDecoration:"none",background:"#fff" }}
                    onMouseEnter={e => (e.currentTarget.style.background="#F4F6FA")}
                    onMouseLeave={e => (e.currentTarget.style.background="#fff")}>
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:6,background:r.cor+"18",color:r.cor,flexShrink:0 }}>{r.categoria}</span>
                    <span style={{ flex:1,fontSize:13,color:"#1a1a1a",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.titulo}</span>
                    {r.subtitulo && <span style={{ fontSize:11,color:"#888",flexShrink:0 }}>{r.subtitulo}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ════════ GRID PRINCIPAL ════════ */}
        <div style={{ padding:"0 28px",display:"grid",gridTemplateColumns:"1fr 330px",gap:16,alignItems:"start" }}>

          {/* ── COLUNA ESQUERDA: Alertas + Conciliação ── */}
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

            {/* Card Alertas */}
            <div style={{ background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(26,72,112,.07),0 1px 2px rgba(0,0,0,.03)",overflow:"hidden" }}>
              <div style={{ padding:"14px 20px",borderBottom:"0.5px solid #EFF2F8",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>Alertas &amp; Pendências</span>
                {loadAl
                  ? <span style={{ fontSize:11,color:"#ccc" }}>verificando…</span>
                  : <span style={{ fontSize:11,color:"#888",background:"#F4F6FA",padding:"2px 9px",borderRadius:10,fontWeight:600 }}>{alertas.length} {alertas.length===1?"item":"itens"}</span>
                }
              </div>

              {loadAl ? (
                <div style={{ padding:"32px 20px",textAlign:"center",fontSize:12,color:"#ccc" }}>Verificando pendências…</div>
              ) : alertas.length === 0 ? (
                <div style={{ padding:"44px 20px",textAlign:"center" }}>
                  <div style={{ width:52,height:52,borderRadius:"50%",background:"#F0FDF4",border:"1.5px solid #BBF7D0",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#16A34A" }}>✓</div>
                  <div style={{ fontSize:15,fontWeight:700,color:"#16A34A",marginBottom:5 }}>Tudo em dia</div>
                  <div style={{ fontSize:12,color:"#aaa" }}>Nenhuma pendência nos próximos 7 dias</div>
                </div>
              ) : alertas.map((a, idx) => {
                const cor = COR[a.urgencia];
                const strip = a.urgencia==="critico"?"4px":a.urgencia==="alto"?"3px":"2px";
                return (
                  <div key={a.id} className="al-row" style={{
                    display:"flex",alignItems:"center",gap:12,padding:"13px 20px",
                    borderBottom: idx < alertas.length-1 ? "0.5px solid #F3F5FB" : "none",
                    background:"#fff",
                    borderLeft:`${strip} solid ${cor.badge}`,
                    animation:`slideIn .35s ease ${Math.min(idx*.06,.3)}s both`,
                  }}>
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,flexShrink:0,background:cor.badge+"14",color:cor.badge,letterSpacing:".04em",textTransform:"uppercase" }}>
                      {TIPO_LABEL[a.tipo] ?? a.tipo}
                    </span>
                    <span style={{ flex:1,fontSize:13,color:"#1a1a1a",lineHeight:1.45 }}>{a.desc}</span>
                    <a href={a.link} className="al-btn"
                      style={{ fontSize:11,padding:"5px 12px",borderRadius:7,background:"#F4F6FA",border:"0.5px solid #DDE2EE",color:"#1A4870",fontWeight:600,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0 }}>
                      {a.linkLabel} →
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Card Conciliação */}
            {conciliPend.length > 0 && (
              <div style={{ background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(26,72,112,.07)",overflow:"hidden" }}>
                <div style={{ padding:"12px 20px",borderBottom:"0.5px solid #EFF2F8",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                  <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>Inconsistências de Conciliação</span>
                  <span style={{ fontSize:11,fontWeight:700,color:"#C9921B",background:"#FBF3E0",padding:"2px 8px",borderRadius:10,border:"0.5px solid #C9921B40" }}>
                    {conciliPend.length} sem lançamento
                  </span>
                </div>
                {conciliPend.slice(0,5).map(p => (
                  <div key={p.id} style={{ padding:"11px 20px",borderBottom:"0.5px solid #F3F5FB",display:"flex",alignItems:"center",gap:12,background:"#fff" }}>
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,background:p.tipo==="debito"?"#E24B4A18":"#16A34A18",color:p.tipo==="debito"?"#E24B4A":"#16A34A",flexShrink:0 }}>
                      {p.tipo==="debito"?"DÉBITO":"CRÉDITO"}
                    </span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:12,fontWeight:600,color:"#1a1a1a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{p.descricao}</div>
                      <div style={{ fontSize:11,color:"#888" }}>{p.data.split("-").reverse().join("/")} · {p.conta_nome ?? "—"}</div>
                    </div>
                    <span style={{ fontSize:13,fontWeight:700,color:p.tipo==="debito"?"#E24B4A":"#16A34A",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums" }}>
                      {p.tipo==="debito"?"−":"+"}R$ {p.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}
                    </span>
                    <button disabled={resolvendo===p.id} onClick={() => { const cat=prompt(`Categoria (${p.descricao}):`,p.tipo==="debito"?"Taxas Bancárias":"Outros Créditos"); if(cat!==null) resolverInconsistencia(p,cat||(p.tipo==="debito"?"Taxas Bancárias":"Outros Créditos")); }}
                      style={{ padding:"5px 12px",background:"#1A4870",color:"#fff",border:"none",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",opacity:resolvendo===p.id?.6:1,flexShrink:0 }}>
                      {resolvendo===p.id?"Lançando…":"Lançar"}
                    </button>
                    <button onClick={() => ignorarInconsistencia(p.id)} style={{ padding:"5px 10px",background:"#F4F6FA",color:"#888",border:"0.5px solid #DDE2EE",borderRadius:7,fontSize:11,cursor:"pointer",flexShrink:0 }}>
                      Ignorar
                    </button>
                  </div>
                ))}
                {conciliPend.length > 5 && (
                  <div style={{ padding:"10px 20px",textAlign:"center" }}>
                    <a href="/financeiro/conciliacao" style={{ fontSize:12,color:"#1A4870",fontWeight:600,textDecoration:"none" }}>Ver todas ({conciliPend.length}) →</a>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── COLUNA DIREITA: Mercado + Atalhos ── */}
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

            {/* Card Mercado */}
            <div style={{ background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(26,72,112,.07)",overflow:"hidden" }}>
              <div style={{ padding:"14px 18px",borderBottom:"0.5px solid #EFF2F8",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>Mercado ao Vivo</span>
                {!loadPr && precos && (
                  <span style={{ fontSize:10,color:"#ccc" }}>
                    {precos.erro ? "⚠ fallback" : new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
                  </span>
                )}
              </div>

              {/* Status bolsas */}
              <div style={{ padding:"10px 18px 0",display:"flex",gap:8,flexWrap:"wrap" }}>
                {[mercado.cbot, mercado.b3].map((m,i) => (
                  <span key={i} style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,color:m.cor,padding:"3px 9px",borderRadius:20,background:m.aberto?"#F0FDF4":"#F3F6F9",border:`0.5px solid ${m.aberto?"#86EFAC60":"#DDE2EE"}` }}>
                    <span style={{ width:5,height:5,borderRadius:"50%",background:m.cor,display:"inline-block",animation:m.aberto?"pulso 2s ease infinite":"none" }} />
                    {m.label}
                  </span>
                ))}
              </div>

              {loadPr ? (
                <div style={{ padding:"28px 18px",textAlign:"center",fontSize:12,color:"#ccc" }}>Carregando…</div>
              ) : !precos ? null : (() => {
                type Linha = { key:string; nome:string; fonte:string; valor:string; brl?:string; var:number };
                const linhas: Linha[] = [
                  { key:"soja",    nome:"Soja",    fonte:"CBOT · ¢/bu",                                             valor:`${fmtUsd(precos.soja.cbot)}¢`,     brl:`R$ ${fmtBrl(precos.soja.brl)}/sc`,   var:precos.soja.variacao    },
                  { key:"milho",   nome:"Milho",   fonte:precos.milho.fonte==="B3"?"B3 · R$/sc":"CBOT est. · R$/sc", valor:`R$ ${fmtBrl(precos.milho.brl)}/sc`,                                           var:precos.milho.variacao   },
                  { key:"algodao", nome:"Algodão", fonte:"CBOT · ¢/lb",                                             valor:`${fmtUsd(precos.algodao.cbot)}¢`,  brl:`R$ ${fmtBrl(precos.algodao.brl)}/@`, var:precos.algodao.variacao },
                ];
                return (
                  <div style={{ paddingTop:6 }}>
                    {linhas.map(m => {
                      const dir = flash[m.key] ?? "same";
                      return (
                        <div key={m.key} className="mkt-row" style={{ padding:"13px 18px",borderBottom:"0.5px solid #EFF2F8",background:dir==="up"?"#F0FDF480":dir==="down"?"#FEF2F280":"transparent" }}>
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                            <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>{m.nome}</span>
                            <div style={{ textAlign:"right" }}>
                              <span style={{ fontWeight:800,fontSize:17,color:DIR_COLOR[dir],fontVariantNumeric:"tabular-nums",transition:"color .6s" }}>
                                {m.valor}{DIR_ARROW[dir]}
                              </span>
                              <span style={{ marginLeft:6,fontSize:10,fontWeight:700,color:m.var>=0?"#16A34A":"#E24B4A",background:m.var>=0?"#F0FDF4":"#FEF2F2",padding:"1px 6px",borderRadius:5 }}>
                                {fmtPct(m.var)}
                              </span>
                            </div>
                          </div>
                          <div style={{ display:"flex",justifyContent:"space-between",marginTop:3 }}>
                            <span style={{ fontSize:10,color:"#bbb" }}>{m.fonte}</span>
                            {m.brl && <span style={{ fontSize:11,color:"#1A4870",fontWeight:600 }}>{m.brl}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {/* USD Spot */}
                    {(() => {
                      const dir = flash["usd"] ?? "same";
                      return (
                        <div className="mkt-row" style={{ padding:"13px 18px",borderBottom:"0.5px solid #EFF2F8",background:dir==="up"?"#F0FDF480":dir==="down"?"#FEF2F280":"transparent" }}>
                          <div style={{ display:"flex",justifyContent:"space-between" }}>
                            <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>Dólar Spot</span>
                            <span style={{ fontWeight:800,fontSize:17,color:DIR_COLOR[dir],fontVariantNumeric:"tabular-nums",transition:"color .6s" }}>R$ {fmtBrl(precos.usdBrl)}{DIR_ARROW[dir]}</span>
                          </div>
                          <span style={{ fontSize:10,color:"#bbb" }}>Comercial · AwesomeAPI</span>
                        </div>
                      );
                    })()}
                    {/* PTAX */}
                    <div style={{ padding:"13px 18px" }}>
                      <div style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ fontWeight:700,fontSize:14,color:"#0B2D50" }}>Dólar PTAX</span>
                        <span style={{ fontWeight:700,fontSize:15,color:precos.usdPtax?"#1a1a1a":"#ddd",fontVariantNumeric:"tabular-nums" }}>
                          {precos.usdPtax?`R$ ${fmtBrl4(precos.usdPtax)}`:"—"}
                        </span>
                      </div>
                      <span style={{ fontSize:10,color:"#bbb" }}>Banco Central · oficial</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Card Atalhos */}
            <div style={{ background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(26,72,112,.07)",padding:"14px 18px" }}>
              <div style={{ fontSize:10,fontWeight:700,color:"#bbb",letterSpacing:".1em",textTransform:"uppercase",marginBottom:12 }}>Acesso Rápido</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                {ATALHOS.map(a => (
                  <a key={a.link} href={a.link} className="atalho"
                    style={{ display:"flex",alignItems:"center",gap:9,padding:"10px 11px",borderRadius:9,border:"0.5px solid #EEF1F6",textDecoration:"none",background:"#FAFBFC",boxShadow:"none" }}
                    onMouseEnter={e => { const el=e.currentTarget as HTMLAnchorElement; el.style.background=a.cor+"0D"; el.style.borderColor=a.cor+"55"; }}
                    onMouseLeave={e => { const el=e.currentTarget as HTMLAnchorElement; el.style.background="#FAFBFC"; el.style.borderColor="#EEF1F6"; }}>
                    <span style={{ width:30,height:30,borderRadius:8,background:a.cor+"18",color:a.cor,fontWeight:800,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:".02em" }}>{a.sigla}</span>
                    <span style={{ fontSize:11,color:"#333",fontWeight:500,lineHeight:1.25 }}>{a.label}</span>
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

