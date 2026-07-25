import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Meses de vencimento CME por cultura
const SOJA_MESES:  Record<number, string> = { 1:"F", 3:"H", 5:"K", 7:"N", 8:"Q", 9:"U", 11:"X" };
const MILHO_MESES: Record<number, string> = { 3:"H", 5:"K", 7:"N", 9:"U", 12:"Z" };

interface BarchartQuote {
  symbol:    string;
  lastPrice: number | null;
  tradeTime: string | null;
  volume:    number | null;
}

function gerarSimbolos() {
  const now = new Date();
  const simbolos: { barchart: string; instrumento: string; vencimento: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mes = d.getMonth() + 1;
    const yy  = String(d.getFullYear()).slice(-2);

    const letraSoja = SOJA_MESES[mes];
    if (letraSoja) {
      const venc = `${letraSoja}${yy}`;
      const key  = `S${venc}`;
      if (!seen.has(key)) {
        seen.add(key);
        simbolos.push({ barchart: `ZS${venc}`, instrumento: "CBOT_SOJA", vencimento: venc });
      }
    }

    const letraMilho = MILHO_MESES[mes];
    if (letraMilho) {
      const venc = `${letraMilho}${yy}`;
      const key  = `C${venc}`;
      if (!seen.has(key)) {
        seen.add(key);
        simbolos.push({ barchart: `ZC${venc}`, instrumento: "CBOT_MILHO", vencimento: venc });
      }
    }
  }

  return simbolos;
}

export async function GET(req: NextRequest) {
  // Verificar autorização (Vercel injeta automaticamente em produção)
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.BARCHART_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BARCHART_API_KEY não configurada" }, { status: 500 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hoje     = new Date().toISOString().slice(0, 10);
  const simbolos = gerarSimbolos();

  // Limpar dados globais de hoje antes de reinserir (evita duplicatas)
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .eq("fonte", "BARCHART");

  // Barchart free: buscar em lotes de 10 para respeitar rate limits
  const chunks: typeof simbolos[] = [];
  for (let i = 0; i < simbolos.length; i += 10) chunks.push(simbolos.slice(i, i + 10));

  let inseridos = 0;
  const erros: string[] = [];
  const semCotacao: string[] = [];
  const inicio = Date.now();
  console.log("[curva-mercado] inicio", { hoje, totalSimbolos: simbolos.length });

  for (const chunk of chunks) {
    const syms = chunk.map(s => s.barchart).join(",");
    try {
      const res = await fetch(
        `https://ondemand.websol.barchart.com/getQuote.json?apikey=${apiKey}&symbols=${syms}&fields=lastPrice,tradeTime,volume`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        erros.push(`HTTP ${res.status} para símbolos ${syms}`);
        continue;
      }

      const json = await res.json();
      const quotes: BarchartQuote[] = json?.results ?? [];

      for (const q of quotes) {
        const meta = chunk.find(s => s.barchart === q.symbol);
        if (!meta) continue;

        if (!q.lastPrice || q.lastPrice <= 0) {
          semCotacao.push(q.symbol);
          continue;
        }

        const { error } = await sb.from("curva_mercado").insert({
          fazenda_id:     null,           // dado global, não por fazenda
          instrumento:    meta.instrumento,
          vencimento:     meta.vencimento,
          data_referencia: hoje,
          valor:          q.lastPrice,
          unidade:        "cents_bu",
          fonte:          "BARCHART",
          boletim:        "fechamento",
        });

        if (error) erros.push(`${q.symbol}: ${error.message}`);
        else inseridos++;
      }
    } catch (e) {
      erros.push(`Fetch falhou para ${syms}: ${String(e)}`);
    }
  }

  const resultado = {
    ok:            erros.length === 0,
    data:          hoje,
    inseridos,
    semCotacao,
    erros,
    totalSimbolos: simbolos.length,
    duracaoMs:     Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
