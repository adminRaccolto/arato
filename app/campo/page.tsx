"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";

type Resumo = {
  talhoes: number;
  cicloAtivo: string;
  criticos: number;
  operacoesHoje: number;
};

const ACOES = [
  { href: "/campo/monitoramento", label: "Monitoramento",  sub: "Pragas, doenças e invasoras", icon: "🐛", cor: "#7C2D12", bg: "#FEF2F2" },
  { href: "/campo/plantio",       label: "Plantio",        sub: "Registrar operação de plantio", icon: "🌱", cor: "#14532D", bg: "#F0FDF4" },
  { href: "/campo/pulverizacao",  label: "Pulverização",   sub: "Defensivos e fertilizantes foliares", icon: "💧", cor: "#1E3A5F", bg: "#EFF6FF" },
  { href: "/campo/colheita",      label: "Colheita",       sub: "Romaneio e produtividade", icon: "🌾", cor: "#7D4A00", bg: "#FFFBEB" },
  { href: "/lavoura/pluviometria", label: "Pluviometria",  sub: "Leituras do pluviômetro", icon: "🌧", cor: "#1E3A5F", bg: "#EFF6FF" },
  { href: "/lavoura/recomendacoes", label: "Recomendações",sub: "Laudos agronômicos", icon: "📋", cor: "#166534", bg: "#F0FDF4" },
];

export default function CampoHome() {
  const { fazendaId, nomeFazendaSelecionada, emailUsuario } = useAuth();
  const [resumo, setResumo] = useState<Resumo>({ talhoes: 0, cicloAtivo: "—", criticos: 0, operacoesHoje: 0 });
  const [hora, setHora] = useState("");

  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    tick(); const iv = setInterval(tick, 30000); return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!fazendaId) return;
    async function load() {
      const [{ count: tal }, { data: ciclos }, { data: pragas }] = await Promise.all([
        supabase.from("talhoes").select("id", { count: "exact", head: true }).eq("fazenda_id", fazendaId!),
        supabase.from("ciclos").select("cultura, anos_safra(ano)").eq("fazenda_id", fazendaId!).order("created_at", { ascending: false }).limit(1),
        supabase.from("monitoramento_pragas").select("id").eq("fazenda_id", fazendaId!).eq("nivel", 4),
      ]);
      const ciclo = ciclos?.[0];
      setResumo({
        talhoes: tal ?? 0,
        cicloAtivo: ciclo ? `${ciclo.cultura} ${(ciclo.anos_safra as unknown as { ano: string } | null)?.ano ?? ""}` : "—",
        criticos: pragas?.length ?? 0,
        operacoesHoje: 0,
      });
    }
    load();
  }, [fazendaId]);

  const saudacao = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header / saudação */}
      <div style={{ background: "#1A4870", borderRadius: 14, padding: "18px 20px", color: "#fff" }}>
        <div style={{ fontSize: 13, color: "#B0C8E0" }}>{hora} · {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{saudacao()}, {emailUsuario?.split("@")[0] ?? "operador"}!</div>
        <div style={{ fontSize: 13, color: "#B0C8E0", marginTop: 4 }}>📍 {nomeFazendaSelecionada ?? "Fazenda"}</div>
      </div>

      {/* Alertas críticos */}
      {resumo.criticos > 0 && (
        <Link href="/campo/monitoramento" style={{ display: "flex", alignItems: "center", gap: 12, background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 12, padding: "14px 16px", textDecoration: "none" }}>
          <span style={{ fontSize: 28 }}>🚨</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{resumo.criticos} ocorrência{resumo.criticos > 1 ? "s" : ""} crítica{resumo.criticos > 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>Toque para registrar ação</div>
          </div>
          <span style={{ marginLeft: "auto", color: "#991B1B", fontSize: 20 }}>›</span>
        </Link>
      )}

      {/* KPIs resumidos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Talhões",    valor: resumo.talhoes,    icon: "🗺" },
          { label: "Ciclo ativo", valor: resumo.cicloAtivo, icon: "🌱", small: true },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 20 }}>{k.icon}</div>
            <div style={{ fontSize: k.small ? 14 : 22, fontWeight: 700, color: "#1a1a1a", marginTop: 6 }}>{k.valor}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Ações rápidas */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Operações de Campo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ACOES.map(a => (
            <Link key={a.href} href={a.href} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "14px 16px", textDecoration: "none" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{a.label}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{a.sub}</div>
              </div>
              <span style={{ color: "#888", fontSize: 18 }}>›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ textAlign: "center", fontSize: 11, color: "#aaa", paddingTop: 8 }}>
        RacTech Campo · Versão web · Funciona offline*
      </div>
    </div>
  );
}
