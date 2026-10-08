"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

// Achado real 08/10/2026: usuária era deslogada ao navegar no sistema — depois
// de 3 rodadas de correção no código (prefetch, renovação de token, clientes
// Supabase duplicados), a causa real era o RELÓGIO DO COMPUTADOR dela estar
// desacertado. A sessão do Supabase valida o token contra o horário local do
// navegador — se o relógio do sistema está muito adiantado/atrasado, o
// navegador acha que a sessão expirou numa hora errada e força o logout, sem
// nenhum bug de código envolvido. Esse banner detecta isso proativamente
// (compara o horário do servidor com o do navegador) em vez de deixar o
// usuário achar que o sistema está quebrado.
const ROTAS_PUBLICAS = ["/login", "/planos", "/cadastro", "/alterar-senha", "/seletor-cliente"];
const LIMIAR_MS = 3 * 60 * 1000; // 3 minutos de diferença já é sinal de relógio errado

export default function BannerRelogioDessincronizado() {
  const pathname = usePathname();
  const [diferencaMs, setDiferencaMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function checar() {
      try {
        const antes = Date.now();
        const r = await fetch("/api/version", { cache: "no-store" });
        const depois = Date.now();
        const { serverTime } = await r.json() as { serverTime?: number };
        if (!serverTime || cancelado) return;
        // Desconta a latência da própria requisição (metade do round-trip) pra não acusar falso positivo em conexão lenta
        const latencia = (depois - antes) / 2;
        const horarioLocalEstimado = antes + latencia;
        setDiferencaMs(serverTime - horarioLocalEstimado);
      } catch { /* ignora falha de rede — não é o que este banner verifica */ }
    }
    checar();
    const id = setInterval(checar, 5 * 60 * 1000);
    return () => { cancelado = true; clearInterval(id); };
  }, []);

  if (ROTAS_PUBLICAS.some(r => pathname.startsWith(r))) return null;
  if (diferencaMs === null || Math.abs(diferencaMs) < LIMIAR_MS) return null;

  const minutos = Math.round(Math.abs(diferencaMs) / 60000);
  const sentido = diferencaMs > 0 ? "atrasado" : "adiantado";

  return (
    <div style={{
      background: "#FFF9F0",
      borderBottom: "0.5px solid #F6C87A",
      padding: "8px 20px",
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 13, color: "#7A5200",
      zIndex: 99, flexShrink: 0,
    }}>
      <span style={{ fontSize: 15 }}>🕐</span>
      <span>
        <strong>O relógio deste computador está {sentido} em cerca de {minutos} minuto(s).</strong>{" "}
        Isso pode fazer você ser desconectado sem motivo aparente e causar erro de data em lançamentos.
        Corrija a data e hora do sistema (ative &quot;sincronizar automaticamente pela internet&quot;) e atualize a página.
      </span>
    </div>
  );
}
