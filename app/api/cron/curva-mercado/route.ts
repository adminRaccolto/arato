import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Meses de vencimento CME
const SOJA_MESES:  Record<number, string> = { 1:"F", 3:"H", 5:"K", 7:"N", 8:"Q", 9:"U", 11:"X" };
const MILHO_MESES: Record<number, string> = { 3:"H", 5:"K", 7:"N", 9:"U", 12:"Z" };

// Converte letra CME para número do mês
const LETRA_MES: Record<string, number> = {
  F:1, G:2, H:3, J:4, K:5, M:6, N:7, Q:8, U:9, V:10, X:11, Z:12
};

interface Simbolo {
  yahoo:       string;   // "ZSX26=F"
  instrumento: string;   // "CBOT_SOJA"
  vencimento:  string;   // "X26"
  dataVenc:    string;   // "2026-11-01" (formato date para o banco)
}

function gerarSimbolos(): Simbolo[] {
  const now  = new Date();
  const res: Simbolo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= 18; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mes = d.getMonth() + 1;
    const yy  = String(d.getFullYear()).slice(-2);
    const yyyy = d.getFullYear();

    const letraSoja = SOJA_MESES[mes];
    if (letraSoja) {
      const venc = `${letraSoja}${yy}`;
      if (!seen.has(`S${venc}`)) {
        seen.add(`S${venc}`);
        res.push({
          yahoo:       `ZS${venc}=F`,
          instrumento: "CBOT_SOJA",
          vencimento:  venc,
          dataVenc:    `${yyyy}-${String(mes).padStart(2,"0")}-01`,
        });
      }
    }

    const letraMilho = MILHO_MESES[mes];
    if (letraMilho) {
      const venc = `${letraMilho}${yy}`;
      if (!seen.has(`C${venc}`)) {
        seen.add(`C${venc}`);
        res.push({
          yahoo:       `ZC${venc}=F`,
          instrumento: "CBOT_MILHO",
          vencimento:  venc,
          dataVenc:    `${yyyy}-${String(mes).padStart(2,"0")}-01`,
        });
      }
    }
  }

  return res;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

// Yahoo v8/chart com range maior para pegar contratos com menos liquidez
async function fetchYahooChart(symbol: string): Promise<number> {
  // Tenta 6mo primeiro; se 404, tenta 1d (intraday às vezes funciona quando OHLCV não tem)
  for (const range of ["6mo", "1mo", "1d"]) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) continue;
    const json = await r.json() as {
      chart?: {
        result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[];
        error?:  { code?: string };
      };
    };
    if (json?.chart?.error) continue;
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
    if (price > 0) return price;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hoje     = new Date().toISOString().slice(0, 10);
  const simbolos = gerarSimbolos();
  const inicio   = Date.now();
  console.log("[curva-mercado] inicio", { hoje, total: simbolos.length });

  // Limpa dados globais de hoje antes de reinserir
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .in("fonte", ["YAHOO", "BARCHART", "CME"]);

  // Busca todas as cotações em paralelo
  const resultados = await Promise.allSettled(
    simbolos.map(s => fetchYahooChart(s.yahoo))
  );

  let inseridos = 0;
  const semCotacao: string[] = [];
  const erros:      string[] = [];

  for (let i = 0; i < simbolos.length; i++) {
    const sim = simbolos[i];
    const res = resultados[i];

    if (res.status === "rejected") {
      erros.push(`${sim.vencimento}: ${String(res.reason)}`);
      continue;
    }

    const preco = res.value;
    if (!preco || preco <= 0) { semCotacao.push(sim.vencimento); continue; }

    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     sim.instrumento,
      vencimento:      sim.dataVenc,   // "2026-11-01" (date, não "X26")
      data_referencia: hoje,
      valor:           preco,
      unidade:         "cents_bu",
      fonte:           "YAHOO",
      boletim:         "fechamento",
    });

    if (error) erros.push(`${sim.vencimento}: ${error.message}`);
    else inseridos++;
  }

  // Resultado também informa quantos por instrumento
  const inseridosSoja  = simbolos.filter((s,i) => s.instrumento === "CBOT_SOJA"  && resultados[i].status === "fulfilled" && (resultados[i] as PromiseFulfilledResult<number>).value > 0).length;
  const inseridosMilho = simbolos.filter((s,i) => s.instrumento === "CBOT_MILHO" && resultados[i].status === "fulfilled" && (resultados[i] as PromiseFulfilledResult<number>).value > 0).length;

  const resultado = {
    ok:           erros.length === 0 && inseridos > 0,
    data:         hoje,
    fonte:        "YAHOO",
    inseridos,
    soja:         inseridosSoja,
    milho:        inseridosMilho,
    semCotacao,
    erros,
    totalSimbolos: simbolos.length,
    duracaoMs:    Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
