"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TopNav from "../components/TopNav";
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
  const alvo = new Date(dataStr + "T12:00:00");
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
type Alerta = {
  id: string;
  tipo: "cp" | "cr" | "arrendamento" | "cert_a1" | "contrato" | "estoque";
  desc: string;
  valor?: number;
  dias?: number;
  urgencia: Urgencia;
  link: string;
  linkLabel: string;
};

// ─── Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const { fazendaId } = useAuth();

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

  // ── Polling 30s ──
  useEffect(() => {
    buscarPrecos();
    const id = setInterval(buscarPrecos, 30_000);
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
    const isoHoje = hoje.toISOString().split("T")[0];
    const isoEm7  = em7.toISOString().split("T")[0];
    const isoEm15 = em15.toISOString().split("T")[0];

    Promise.all([
      // CP em aberto (vencidos + vencendo 7 dias)
      supabase.from("contas_pagar")
        .select("id, descricao, valor, data_vencimento, status")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto")
        .lte("data_vencimento", isoEm7)
        .order("data_vencimento"),

      // CR em aberto (vencidos + vencendo 7 dias)
      supabase.from("contas_receber")
        .select("id, descricao, valor, data_vencimento, status")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto")
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
      supabase.from("contas_pagar")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto"),

      // CR total em aberto
      supabase.from("contas_receber")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto"),

      // CP vencendo esta semana
      supabase.from("contas_pagar")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto")
        .gte("data_vencimento", isoHoje)
        .lte("data_vencimento", isoEm7),

      // CR vencendo esta semana
      supabase.from("contas_receber")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto")
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

      // CP vencidos
      supabase.from("contas_pagar")
        .select("valor")
        .eq("fazenda_id", fazendaId)
        .eq("status", "aberto")
        .lt("data_vencimento", isoHoje),
    ]).then(([
      cpRes, crRes, arrRes, certRes,
      cpTotalRes, crTotalRes, cpSemRes, crSemRes,
      ciclosRes, contratosRes, cpVencRes,
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
        const total = cp1.reduce((s, r) => s + (r.valor ?? 0), 0);
        const minD = Math.min(...cp1.map(r => diasAte(r.data_vencimento)));
        novosAlertas.push({ id: "cp-urgente", tipo: "cp", desc: `${cp1.length} CP ${labelDias(minD)} · ${fmtMoeda(total)}`, valor: total, dias: minD, urgencia: "alto", link: "/financeiro/pagar", linkLabel: "Pagar" });
      }
      if (cp3.length > 0) {
        const total = cp3.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({ id: "cp-3dias", tipo: "cp", desc: `${cp3.length} CP vencem em 2–3 dias · ${fmtMoeda(total)}`, valor: total, dias: 3, urgencia: "alto", link: "/financeiro/pagar", linkLabel: "Ver" });
      }
      if (cp7.length > 0) {
        const total = cp7.reduce((s, r) => s + (r.valor ?? 0), 0);
        novosAlertas.push({ id: "cp-7dias", tipo: "cp", desc: `${cp7.length} CP vencem esta semana · ${fmtMoeda(total)}`, valor: total, dias: 7, urgencia: "medio", link: "/financeiro/pagar", linkLabel: "Ver" });
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
        novosAlertas.push({ id: "cr-prox", tipo: "cr", desc: `${crProx.length} CR a receber · ${fmtMoeda(total)} · ${labelDias(minD)}`, valor: total, dias: minD, urgencia: urgDias(minD), link: "/financeiro/receber", linkLabel: "Ver" });
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
  }, [fazendaId]);

  const saldoSemana = crSemana - cpSemana;

  const TIPO_LABEL: Record<string, string> = {
    cp: "A Pagar", cr: "A Receber", arrendamento: "Arrendamento",
    cert_a1: "Certificado", contrato: "Contrato", estoque: "Estoque",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />

      <main style={{ flex: 1, padding: "18px 24px" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Dashboard</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#666" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {ciclosAtivos > 0 && ` · ${ciclosAtivos} ciclo${ciclosAtivos > 1 ? "s" : ""} ativo${ciclosAtivos > 1 ? "s" : ""}`}
              {contratosAtivos > 0 && ` · ${contratosAtivos} contrato${contratosAtivos > 1 ? "s" : ""} em aberto`}
            </p>
          </div>
          {alertas.some(a => a.urgencia === "critico") && (
            <div style={{ background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#991B1B" }}>
              {alertas.filter(a => a.urgencia === "critico").length} alerta{alertas.filter(a => a.urgencia === "critico").length > 1 ? "s" : ""} crítico{alertas.filter(a => a.urgencia === "critico").length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* ── Grade principal ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

          {/* ── COLUNA ESQUERDA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Alertas */}
            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                  Alertas & Pendências
                </span>
                {loadAl
                  ? <span style={{ fontSize: 11, color: "#aaa" }}>verificando...</span>
                  : <span style={{ fontSize: 11, color: "#888" }}>{alertas.length} item{alertas.length !== 1 ? "s" : ""}</span>
                }
              </div>

              {loadAl ? (
                <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: "#aaa" }}>Verificando pendências...</div>
              ) : alertas.length === 0 ? (
                <div style={{ padding: "20px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>Tudo em dia</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Nenhuma pendência nos próximos 7 dias</div>
                </div>
              ) : (
                <div>
                  {alertas.map(a => {
                    const cor = COR[a.urgencia];
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 16px",
                          borderBottom: "0.5px solid #F3F5F9",
                          background: cor.bg,
                          borderLeft: `3px solid ${cor.badge}`,
                        }}
                      >
                        {/* Badge tipo */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                          background: cor.badge, color: "#fff",
                        }}>
                          {TIPO_LABEL[a.tipo] ?? a.tipo}
                        </span>

                        {/* Descrição */}
                        <span style={{ flex: 1, fontSize: 12.5, color: cor.text, lineHeight: 1.4 }}>{a.desc}</span>

                        {/* Ação */}
                        <a
                          href={a.link}
                          style={{
                            fontSize: 11, padding: "5px 12px", borderRadius: 6,
                            background: "#fff", border: `0.5px solid ${cor.badge}`,
                            color: cor.badge, fontWeight: 600, textDecoration: "none",
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}
                        >
                          {a.linkLabel}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* KPIs financeiros */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "A Pagar — total", valor: cpAberto, cor: "#E24B4A" },
                { label: "A Receber — total", valor: crAberto, cor: "#1A4870" },
                { label: "A Pagar — 7 dias", valor: cpSemana, cor: "#EF9F27" },
                { label: "A Receber — 7 dias", valor: crSemana, cor: "#16A34A" },
              ].map((k, i) => (
                <div key={i} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: loadAl ? "#ccc" : k.cor }}>
                    {loadAl ? "—" : fmtMoeda(k.valor)}
                  </div>
                </div>
              ))}
            </div>

            {/* Saldo da semana */}
            <div style={{
              background: saldoSemana >= 0 ? "#F0FDF4" : "#FEF2F2",
              border: `0.5px solid ${saldoSemana >= 0 ? "#86EFAC" : "#FECACA"}`,
              borderRadius: 10, padding: "14px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 12, color: saldoSemana >= 0 ? "#166534" : "#991B1B", marginBottom: 2 }}>
                  Saldo projetado — próximos 7 dias
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: saldoSemana >= 0 ? "#16A34A" : "#E24B4A" }}>
                  {loadAl ? "—" : fmtMoeda(saldoSemana)}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "#666" }}>
                <div>Recebimentos: <strong style={{ color: "#16A34A" }}>{fmtMoeda(crSemana)}</strong></div>
                <div>Pagamentos: <strong style={{ color: "#E24B4A" }}>{fmtMoeda(cpSemana)}</strong></div>
                {vencidosCp > 0 && (
                  <div style={{ color: "#E24B4A", fontWeight: 600, marginTop: 4 }}>
                    Vencidos: {fmtMoeda(vencidosCp)}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── COLUNA DIREITA — Preços ao vivo ── */}
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "14px 16px" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Mercado</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!loadPr && precos && (
                  <span style={{ fontSize: 10, color: "#888" }}>
                    {precos.erro ? "⚠ fallback" : new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
                {loadPr && <span style={{ fontSize: 10, color: "#aaa" }}>buscando...</span>}
              </div>
            </div>

            {/* Status CBOT / B3 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[mercado.cbot, mercado.b3].map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 20, background: m.aberto ? "#F0FDF4" : "#F3F6F9", border: `0.5px solid ${m.aberto ? "#86EFAC" : "#DDE2EE"}`, color: m.cor }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.cor, display: "inline-block", boxShadow: m.aberto ? `0 0 0 2px ${m.cor}33` : "none" }} />
                  {m.label}
                </div>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 10, color: "#aaa", alignSelf: "center" }}>30s</div>
            </div>

            {loadPr ? (
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "#aaa" }}>Carregando...</div>
            ) : !precos ? null : (() => {
              type Linha = { key: string; nome: string; fonte: string; valor: string; brl: string; var: number };
              const linhas: Linha[] = [
                {
                  key: "soja",
                  nome: "Soja",
                  fonte: "CBOT · ¢/bu",
                  valor: `${fmtUsd(precos.soja.cbot)}¢`,
                  brl: `R$ ${fmtBrl(precos.soja.brl)}/sc`,
                  var: precos.soja.variacao,
                },
                {
                  key: "milho",
                  nome: "Milho",
                  fonte: precos.milho.fonte === "B3" ? "B3 · R$/sc" : "CBOT · ¢/bu",
                  valor: precos.milho.fonte === "B3" ? `R$ ${fmtBrl(precos.milho.brl)}` : `${fmtUsd(precos.milho.cbot)}¢`,
                  brl: precos.milho.fonte === "B3" ? "" : `R$ ${fmtBrl(precos.milho.brl)}/sc`,
                  var: precos.milho.variacao,
                },
                {
                  key: "algodao",
                  nome: "Algodão",
                  fonte: "CBOT · ¢/lb",
                  valor: `${fmtUsd(precos.algodao.cbot)}¢`,
                  brl: `R$ ${fmtBrl(precos.algodao.brl)}/@`,
                  var: precos.algodao.variacao,
                },
              ];

              return (
                <>
                  {linhas.map(m => {
                    const dir = flash[m.key] ?? "same";
                    const flashBg = dir === "up" ? "#F0FDF4" : dir === "down" ? "#FEF2F2" : "transparent";
                    return (
                      <div
                        key={m.key}
                        style={{
                          padding: "10px 6px",
                          borderBottom: "0.5px solid #EEF1F6",
                          borderRadius: 6,
                          background: flashBg,
                          transition: "background 0.6s ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{m.nome}</span>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: DIR_COLOR[dir], transition: "color 0.6s" }}>
                              {m.valor}{DIR_ARROW[dir]}
                            </span>
                            <span style={{ fontSize: 11, marginLeft: 8, color: m.var >= 0 ? "#16A34A" : "#E24B4A", fontWeight: 600 }}>
                              {fmtPct(m.var)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                          <span style={{ fontSize: 10, color: "#aaa" }}>{m.fonte}</span>
                          {m.brl && <span style={{ fontSize: 11, color: "#1A4870", fontWeight: 600 }}>{m.brl}</span>}
                        </div>
                      </div>
                    );
                  })}

                  {/* USD */}
                  {(() => {
                    const dir = flash["usd"] ?? "same";
                    const flashBg = dir === "up" ? "#F0FDF4" : dir === "down" ? "#FEF2F2" : "transparent";
                    return (
                      <div style={{ padding: "10px 6px", borderBottom: "0.5px solid #EEF1F6", borderRadius: 6, background: flashBg, transition: "background 0.6s ease" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Dólar Spot</span>
                          <span style={{ fontWeight: 700, fontSize: 16, color: DIR_COLOR[dir], transition: "color 0.6s" }}>
                            R$ {fmtBrl(precos.usdBrl)}{DIR_ARROW[dir]}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: "#aaa" }}>Comercial · AwesomeAPI</span>
                      </div>
                    );
                  })()}

                  <div style={{ padding: "10px 6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Dólar PTAX</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: precos.usdPtax ? "#1a1a1a" : "#ccc" }}>
                        {precos.usdPtax ? `R$ ${fmtBrl4(precos.usdPtax)}` : "—"}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: "#aaa" }}>Banco Central · oficial</span>
                  </div>
                </>
              );
            })()}
          </div>

        </div>

      </main>
    </div>
  );
}
