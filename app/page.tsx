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
  medio:   { bg: "#F2F2F2", border: "#BFDBFE", text: "#1e40af", badge: "#444444" },
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


// ─── Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const { fazendaId, fazendaIds, onboardingAtivo, nomeUsuario, anoSafraVigenteDesc } = useAuth();

  const [alertas,    setAlertas]    = useState<Alerta[]>([]);
  const [loadAl,     setLoadAl]     = useState(true);
  const [precos,     setPrecos]     = useState<PrecosData | null>(null);
  const [loadPr,     setLoadPr]     = useState(true);
  const [mercado,    setMercado]    = useState(statusMercado());
  const [flash,      setFlash]      = useState<Record<string, Direcao>>({});
  const prevPrecos   = useRef<PrecosData | null>(null);

  // Stats lavoura
  const [ciclosAtivos, setCiclosAtivos] = useState(0);

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
          supabase.from("lancamentos").select("id, descricao, valor, tipo").in("fazenda_id", fazendaIds).ilike("descricao", `%${q}%`).in("status", ["em_aberto", "vencido", "vencendo"]).limit(3),
          supabase.from("contratos").select("id, numero_contrato, cliente").in("fazenda_id", fazendaIds).or(`numero_contrato.ilike.%${q}%,cliente.ilike.%${q}%`).limit(3),
          supabase.from("ciclos").select("id, nome, cultura").in("fazenda_id", fazendaIds).ilike("nome", `%${q}%`).limit(3),
          supabase.from("insumos").select("id, nome, categoria").in("fazenda_id", fazendaIds).ilike("nome", `%${q}%`).limit(3),
          supabase.from("pessoas").select("id, nome, cpf_cnpj").in("fazenda_id", fazendaIds).ilike("nome", `%${q}%`).limit(3),
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
          res.push({ id: `ins-${r.id}`, categoria: "Insumo", titulo: r.nome, subtitulo: r.categoria, link: "/estoque", cor: "#111111" });
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
        .in("fazenda_id", fazendaIds)
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
        .in("fazenda_id", fazendaIds)
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
        .in("fazenda_id", fazendaIds)
        .eq("status", "pendente")
        .lte("data_vencimento", isoEm15)
        .order("data_vencimento"),

      // Certificado A1
      supabase.from("configuracoes")
        .select("cert_a1_vencimento")
        .in("fazenda_id", fazendaIds)
        .maybeSingle(),

      // Ciclos ativos
      supabase.from("ciclos")
        .select("id", { count: "exact", head: true })
        .in("fazenda_id", fazendaIds)
        .eq("status", "ativo"),

      // Seguros de máquinas vencendo em 30 dias
      supabase.from("maquinas")
        .select("id, nome, seguro_vencimento_apolice, seguro_seguradora")
        .in("fazenda_id", fazendaIds)
        .eq("ativa", true)
        .not("seguro_vencimento_apolice", "is", null)
        .lte("seguro_vencimento_apolice", new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]),

      // Pendências fiscais aguardando NF
      supabase.from("pendencias_fiscais")
        .select("id", { count: "exact", head: true })
        .in("fazenda_id", fazendaIds)
        .eq("status", "aguardando"),

      // Insumos com estoque negativo
      supabase.from("insumos")
        .select("id, nome, estoque, unidade")
        .in("fazenda_id", fazendaIds)
        .lt("estoque", 0),

      // Solicitações de transferência — via API route (service_role_key, sem RLS)
      fetch("/api/campo/transferencias-pendentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_ids: fazendaIds && fazendaIds.length > 0 ? fazendaIds : [fazendaId] }),
      }).then(r => r.json()).catch(() => ({ ok: false, data: [], count: 0 })),

      // Contratos com prazo de entrega vencendo nos próximos 30 dias
      supabase.from("contratos")
        .select("id, numero, produto, comprador, data_entrega, quantidade_sc, entregue_sc, status")
        .in("fazenda_id", fazendaIds)
        .eq("confirmado", true)
        .neq("status", "encerrado")
        .neq("status", "cancelado")
        .gte("data_entrega", isoHoje)
        .lte("data_entrega", new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
        .order("data_entrega"),

      // Contratos com saldo totalmente entregue mas não encerrados
      supabase.from("contratos")
        .select("id, numero, produto, comprador, data_entrega, quantidade_sc, entregue_sc, status")
        .in("fazenda_id", fazendaIds)
        .eq("confirmado", true)
        .in("status", ["aberto", "parcial"])
        .gt("quantidade_sc", 0),

    ]).then(([
      cpRes, crRes, arrRes, certRes,
      ciclosRes, segurosRes,
      pendFiscalRes, insNegRes, transfSolRes,
      contratosEntregaRes, contratosSaldoRes,
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

      // ── Prazo de entrega de contratos ──
      type ContratoAlerta = { id: string; numero: string; produto: string; comprador: string; data_entrega: string; quantidade_sc: number; entregue_sc: number; status: string };
      for (const c of (contratosEntregaRes.data ?? []) as ContratoAlerta[]) {
        const dias = diasAte(c.data_entrega);
        const saldoSc = Math.max(0, (c.quantidade_sc ?? 0) - (c.entregue_sc ?? 0));
        const urg: Urgencia = dias <= 3 ? "critico" : dias <= 7 ? "alto" : "medio";
        novosAlertas.push({
          id: `entrega-${c.id}`,
          tipo: "contrato",
          desc: `Entrega "${c.numero}" (${c.produto}) · ${saldoSc.toLocaleString("pt-BR")} sc restantes · ${labelDias(dias)} · ${c.comprador}`,
          dias,
          urgencia: urg,
          link: "/contratos",
          linkLabel: "Ver Contrato",
        });
      }

      // ── Contratos com entrega completa pendentes de encerramento ──
      const contratosParaEncerrar = ((contratosSaldoRes.data ?? []) as ContratoAlerta[])
        .filter(c => (c.entregue_sc ?? 0) >= (c.quantidade_sc ?? 0) && (c.quantidade_sc ?? 0) > 0);
      if (contratosParaEncerrar.length > 0) {
        if (contratosParaEncerrar.length === 1) {
          const c = contratosParaEncerrar[0];
          novosAlertas.push({
            id: `encerrar-${c.id}`,
            tipo: "contrato",
            desc: `Contrato "${c.numero}" (${c.produto}) totalmente entregue — encerre o contrato para liberar o saldo`,
            urgencia: "medio",
            link: "/contratos",
            linkLabel: "Encerrar",
          });
        } else {
          novosAlertas.push({
            id: "encerrar-varios",
            tipo: "contrato",
            desc: `${contratosParaEncerrar.length} contratos totalmente entregues aguardando encerramento`,
            urgencia: "medio",
            link: "/contratos",
            linkLabel: "Ver Contratos",
          });
        }
      }

      // Ordenar: crítico → alto → médio
      const ordem: Record<Urgencia, number> = { critico: 0, alto: 1, medio: 2, info: 3 };
      novosAlertas.sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia]);

      setAlertas(novosAlertas);

      setCiclosAtivos(ciclosRes.count ?? 0);

      setLoadAl(false);
    }).catch(() => setLoadAl(false));

    // Carrega pendências de conciliação independentemente
    supabase.from("conciliacao_pendencias")
      .select("id,conta_nome,conta_id,data,descricao,valor,tipo,fitid")
      .in("fazenda_id", fazendaIds)
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

  const TIPO_LABEL: Record<string, string> = {
    cp: "A Pagar", cr: "A Receber", arrendamento: "Arrendamento",
    cert_a1: "Certificado", contrato: "Contrato", estoque: "Estoque", fiscal: "Fiscal",
  };

  const ATALHOS = [
    { label: "Contas a Pagar",   link: "/financeiro/pagar",    cor: "#E24B4A", sigla: "CP" },
    { label: "Contas a Receber", link: "/financeiro/receber",  cor: "#16A34A", sigla: "CR" },
    { label: "Pedido de Compra", link: "/compras",             cor: "#111111", sigla: "PC" },
    { label: "NF Entrada",       link: "/compras/nf",          cor: "#111111", sigla: "NF" },
    { label: "Contratos Grãos",  link: "/contratos",           cor: "#C9921B", sigla: "CG" },
    { label: "Estoque",          link: "/estoque",             cor: "var(--text-2)", sigla: "ES" },
    { label: "Lavoura",          link: "/lavoura",             cor: "#16A34A", sigla: "LV" },
    { label: "Relatórios",       link: "/relatorios",          cor: "#444444", sigla: "RL" },
  ];

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

        {/* ═══ HERO COMPACTO ═══ */}
        <div style={{
          padding:"22px 28px 20px",
          background:"linear-gradient(160deg,#0D0D0D 0%,#0D1F38 60%,#091422 100%)",
          borderBottom:"0.5px solid var(--border)",
          animation:"fadeUp .5s ease both",
        }}>

          {/* Linha 1: saudação + status bolsas + busca */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap" }}>
            <span style={{ fontSize:13,color:"var(--text-3)",fontWeight:500,letterSpacing:".01em" }}>
              {saudar()}, {(nomeUsuario ?? "").split(" ")[0] || "…"}&nbsp;·&nbsp;
              {new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
              {ciclosAtivos > 0 && <span style={{ color:"#22C55E" }}> · {ciclosAtivos} ciclo{ciclosAtivos>1?"s":""} ativo{ciclosAtivos>1?"s":""}</span>}
            </span>
            {[mercado.cbot,mercado.b3].map((m,i) => (
              <span key={i} style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,
                color:m.aberto?"#22C55E":"var(--text-3)",padding:"3px 10px",borderRadius:20,
                background:m.aberto?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
                border:`0.5px solid ${m.aberto?"rgba(34,197,94,0.3)":"var(--border)"}` }}>
                <span style={{ width:5,height:5,borderRadius:"50%",background:m.aberto?"#22C55E":"var(--text-muted)",display:"inline-block",animation:m.aberto?"pulso 2s ease infinite":"none" }} />
                {m.label}
              </span>
            ))}
            {alertas.some(a=>a.urgencia==="critico") && (
              <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,
                color:"#EF4444",padding:"3px 10px",borderRadius:20,
                background:"rgba(239,68,68,0.1)",border:"0.5px solid rgba(239,68,68,0.3)" }}>
                <span style={{ width:5,height:5,borderRadius:"50%",background:"#EF4444",display:"inline-block",animation:"pulso 1s ease infinite" }} />
                {alertas.filter(a=>a.urgencia==="critico").length} crítico{alertas.filter(a=>a.urgencia==="critico").length>1?"s":""}
              </span>
            )}
            {anoSafraVigenteDesc && (
              <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,
                color:"#4ADE80",padding:"3px 10px",borderRadius:20,
                background:"rgba(22,163,74,0.12)",border:"0.5px solid rgba(22,163,74,0.3)",
                whiteSpace:"nowrap" }}>
                {anoSafraVigenteDesc}
              </span>
            )}
            {/* Busca global */}
            <div ref={buscaRef} style={{ marginLeft:"auto",position:"relative",width:300 }}>
              <span style={{ position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"var(--text-muted)",pointerEvents:"none" }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar lançamentos, contratos, insumos…"
                value={buscaGlobal}
                onChange={e => { setBuscaGlobal(e.target.value); setBuscaAberta(true); }}
                onFocus={() => setBuscaAberta(true)}
                style={{ width:"100%",boxSizing:"border-box",padding:"6px 10px 6px 30px",
                  border:"0.5px solid rgba(255,255,255,0.12)",borderRadius:8,fontSize:12,
                  background:"rgba(255,255,255,0.06)",outline:"none",color:"var(--text-1)" }}
              />
              {buscaGlobal && !buscandoGlobal && (
                <button onClick={() => { setBuscaGlobal(""); setResultadosBusca([]); }} style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:13,color:"var(--text-3)",padding:0,lineHeight:1 }}>×</button>
              )}
              {buscaAberta && buscaGlobal.trim().length >= 2 && (
                <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#112236",border:"0.5px solid var(--border)",borderRadius:10,boxShadow:"0 12px 40px rgba(0,0,0,0.5)",zIndex:200,overflow:"hidden",maxHeight:300,overflowY:"auto" }}>
                  {resultadosBusca.length === 0 && !buscandoGlobal && (
                    <div style={{ padding:"14px",fontSize:12,color:"var(--text-3)",textAlign:"center" }}>Nenhum resultado para "{buscaGlobal}"</div>
                  )}
                  {resultadosBusca.map(r => (
                    <a key={r.id} href={r.link} onClick={() => setBuscaAberta(false)}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderBottom:"0.5px solid var(--border-table)",textDecoration:"none",background:"transparent" }}
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

          {/* Linha 2: atalhos rápidos (linha horizontal) */}
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap" }}>
            <span style={{ fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:".12em",textTransform:"uppercase",marginRight:4,flexShrink:0 }}>ATALHOS</span>
            {ATALHOS.map(a => (
              <a key={a.link} href={a.link} className="atalho-dark"
                style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:7,
                  border:"0.5px solid rgba(255,255,255,0.1)",textDecoration:"none",
                  background:"rgba(255,255,255,0.05)",flexShrink:0 }}>
                <span style={{ width:20,height:20,borderRadius:5,background:a.cor+"22",color:a.cor,fontWeight:800,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{a.sigla}</span>
                <span style={{ fontSize:12,color:"rgba(255,255,255,0.65)",fontWeight:500,whiteSpace:"nowrap" }}>{a.label}</span>
              </a>
            ))}
          </div>

          {/* Linha 3: cotações inline */}
          {!loadPr && precos && (
            <div style={{ display:"flex",alignItems:"center",flexWrap:"wrap",gap:24,borderTop:"0.5px solid rgba(255,255,255,0.06)",paddingTop:14 }}>
              {[
                { nome:"SOJA CBOT", v:`${fmtUsd(precos.soja.cbot)}¢/bu`, brl:`R$ ${fmtBrl(precos.soja.brl)}/sc`, d:precos.soja.variacao },
                { nome:"MILHO",    v:`R$ ${fmtBrl(precos.milho.brl)}/sc`, brl:"",                                 d:precos.milho.variacao },
                { nome:"ALGODÃO",  v:`${fmtUsd(precos.algodao.cbot)}¢/lb`,brl:`R$ ${fmtBrl(precos.algodao.brl)}/@`, d:precos.algodao.variacao },
                { nome:"USD SPOT", v:`R$ ${fmtBrl(precos.usdBrl)}`,       brl:"",                                 d:0 },
                { nome:"PTAX",     v:precos.usdPtax?`R$ ${fmtBrl4(precos.usdPtax)}`:"—", brl:"",                 d:0 },
              ].map((m,i) => (
                <div key={i} style={{ display:"flex",alignItems:"center",gap:7,flexShrink:0 }}>
                  <span style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.35)",letterSpacing:".06em" }}>{m.nome}</span>
                  <span style={{ fontSize:13,fontWeight:700,color:"var(--text-1)",fontVariantNumeric:"tabular-nums" }}>{m.v}</span>
                  {m.brl && <span style={{ fontSize:11,color:"rgba(255,255,255,0.4)" }}>{m.brl}</span>}
                  {m.d !== 0 && <span style={{ fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,
                    background:m.d>0?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",
                    color:m.d>0?"#22C55E":"#EF4444" }}>{fmtPct(m.d)}</span>}
                  {i < 4 && <div style={{ width:1,height:12,background:"rgba(255,255,255,0.08)",marginLeft:4 }} />}
                </div>
              ))}
              <span style={{ fontSize:9,color:"rgba(255,255,255,0.18)",marginLeft:"auto" }}>
                {precos.erro ? "⚠ dados aprox." : new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
              </span>
            </div>
          )}
        </div>

        {/* Alertas & Pendências — fora do hero, no conteúdo principal */}
        <div style={{ padding:"20px 28px 0" }}>
          <div style={{ background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:12,overflow:"hidden" }}>
            <div style={{ padding:"12px 20px",borderBottom:"0.5px solid var(--border-table)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <span style={{ fontWeight:700,fontSize:14,color:"var(--text-1)" }}>Alertas &amp; Pendências</span>
              {!loadAl && (
                <span style={{ fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                  background:alertas.some(a=>a.urgencia==="critico")?"rgba(239,68,68,0.1)":alertas.some(a=>a.urgencia==="alto")?"#F0F0F0":"rgba(22,163,74,0.08)",
                  color:alertas.some(a=>a.urgencia==="critico")?"#E24B4A":alertas.some(a=>a.urgencia==="alto")?"#EF9F27":"#16A34A",
                  border:`0.5px solid ${alertas.some(a=>a.urgencia==="critico")?"rgba(226,75,74,0.3)":alertas.some(a=>a.urgencia==="alto")?"rgba(239,159,39,0.3)":"rgba(22,163,74,0.2)"}` }}>
                  {alertas.length === 0 ? "Tudo em dia" : `${alertas.length} ${alertas.length===1?"item":"itens"}`}
                </span>
              )}
            </div>
            {loadAl ? (
              <div style={{ padding:"16px 20px",fontSize:12,color:"var(--text-3)" }}>Verificando alertas…</div>
            ) : alertas.length === 0 ? (
              <div style={{ display:"flex",alignItems:"center",gap:10,padding:"14px 20px" }}>
                <span style={{ color:"#16A34A",fontSize:16 }}>✓</span>
                <span style={{ fontSize:13,fontWeight:600,color:"#16A34A" }}>Nenhuma pendência no momento</span>
              </div>
            ) : (
              alertas.map(a => {
                const cor = COR[a.urgencia];
                return (
                  <a key={a.id} href={a.link} style={{ display:"flex",alignItems:"center",gap:12,
                    padding:"10px 20px",borderBottom:"0.5px solid var(--border-table)",
                    borderLeft:`3px solid ${cor.badge}`,textDecoration:"none",
                    background:"var(--bg-card)" }}>
                    <span style={{ fontSize:10,fontWeight:700,color:cor.badge,letterSpacing:".05em",textTransform:"uppercase",
                      flexShrink:0,padding:"2px 7px",borderRadius:5,background:cor.badge+"14",whiteSpace:"nowrap" }}>
                      {TIPO_LABEL[a.tipo] ?? a.tipo}
                    </span>
                    <span style={{ flex:1,fontSize:12,color:"var(--text-2)",lineHeight:1.4,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                      {a.desc}
                    </span>
                    <span style={{ fontSize:11,color:"var(--text-3)",flexShrink:0 }}>ver →</span>
                  </a>
                );
              })
            )}
          </div>
        </div>

        {/* Conciliação (apenas se houver pendências) */}
        {conciliPend.length > 0 && (
          <div style={{ padding:"20px 28px 0" }}>
            <div style={{ background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:12,overflow:"hidden" }}>
              <div style={{ padding:"12px 20px",borderBottom:"0.5px solid var(--border-table)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ fontWeight:700,fontSize:14,color:"var(--text-1)" }}>Inconsistências de Conciliação</span>
                <span style={{ fontSize:11,fontWeight:700,color:"#555555",background:"#F0F0F0",padding:"2px 8px",borderRadius:10,border:"0.5px solid #D8D8D8" }}>
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
          </div>
        )}

      </main>
    </div>
  );
}

