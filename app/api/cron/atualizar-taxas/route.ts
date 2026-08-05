import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Séries do BCB (api.bcb.gov.br) — taxa acumulada no mês, anualizada onde necessário
// Séries mensais: retornam o valor do mês em % (formato variado por série)
const BCB_SERIES: Record<string, { serie: number; tipo: "mensal_pct" | "diaria_acum" | "aa_direto" }> = {
  CDI:    { serie: 4391,  tipo: "mensal_pct"  }, // CDI acumulado no mês (% a.m.)
  IPCA:   { serie: 433,   tipo: "mensal_pct"  }, // IPCA mensal (% a.m.)
  SELIC:  { serie: 4390,  tipo: "mensal_pct"  }, // SELIC acumulada no mês (% a.m.)
  TR:     { serie: 226,   tipo: "mensal_pct"  }, // TR mensal (% a.m.)
  TJLP:   { serie: 256,   tipo: "aa_direto"   }, // TJLP (% a.a. — publicada diretamente a.a.)
  TLP:    { serie: 28684, tipo: "aa_direto"   }, // TLP (% a.a.)
  INPC:   { serie: 188,   tipo: "mensal_pct"  }, // INPC mensal (% a.m.)
  "IGP-M":{ serie: 189,   tipo: "mensal_pct"  }, // IGP-M mensal (% a.m.)
};

// Converte taxa mensal em anual: (1 + am/100)^12 - 1
function amParaAa(am: number): number {
  return (Math.pow(1 + am / 100, 12) - 1) * 100;
}

export async function GET(req: Request) {
  // Segurança: aceita Vercel cron (header Authorization) ou ambiente local
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const agora = new Date();
  const ano   = agora.getFullYear();
  const mes   = agora.getMonth() + 1;

  const resultados: { indexador: string; valor_pct: number | null; erro?: string }[] = [];

  for (const [indexador, cfg] of Object.entries(BCB_SERIES)) {
    try {
      // BCB API — últimos 3 meses para garantir que pega o mês atual
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cfg.serie}/dados/ultimos/3?formato=json`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`BCB HTTP ${resp.status}`);
      const dados: { data: string; valor: string }[] = await resp.json();
      if (!dados.length) throw new Error("Resposta vazia");

      // Último registro disponível
      const ultimo = dados[dados.length - 1];
      const valorRaw = parseFloat(ultimo.valor.replace(",", "."));
      if (isNaN(valorRaw)) throw new Error("Valor inválido");

      // Converter para % a.a.
      let valorAa: number;
      if (cfg.tipo === "aa_direto") {
        valorAa = valorRaw;
      } else {
        // mensal_pct → anualizado
        valorAa = amParaAa(valorRaw);
      }

      // Determinar ano/mês da observação (formato DD/MM/YYYY)
      const partes = ultimo.data.split("/");
      const obsAno = partes.length === 3 ? parseInt(partes[2]) : ano;
      const obsMes = partes.length === 3 ? parseInt(partes[1]) : mes;

      const { error } = await supabase
        .from("taxas_variaveis_historico")
        .upsert(
          { indexador, ano: obsAno, mes: obsMes, valor_pct: parseFloat(valorAa.toFixed(6)), fonte: "bcb", updated_at: new Date().toISOString() },
          { onConflict: "indexador,ano,mes" }
        );

      if (error) throw new Error(error.message);
      resultados.push({ indexador, valor_pct: parseFloat(valorAa.toFixed(4)) });
    } catch (e) {
      resultados.push({ indexador, valor_pct: null, erro: (e as Error).message });
    }
  }

  const sucessos  = resultados.filter(r => r.valor_pct != null).length;
  const erros     = resultados.filter(r => r.valor_pct == null).length;

  return NextResponse.json({
    ok: erros === 0,
    sucesso: `${sucessos}/${Object.keys(BCB_SERIES).length} indexadores atualizados`,
    resultados,
  });
}
