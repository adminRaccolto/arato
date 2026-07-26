import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

// Yahoo v8/chart — confirmado funciona de IPs Vercel para contratos contínuos
async function fetchYahooChart(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const json = await r.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
  return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
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

  const hoje   = new Date().toISOString().slice(0, 10);
  const inicio = Date.now();
  console.log("[curva-mercado] inicio", { hoje });

  // Limpa dados de today antes de reinserir
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .in("fonte", ["YAHOO", "BARCHART", "CME"]);

  const erros: string[] = [];
  let inseridos = 0;

  // Busca front-month CBOT em paralelo (contratos contínuos — confirmados funcionando)
  const [sojaRes, milhoRes, algodaoRes] = await Promise.allSettled([
    fetchYahooChart("ZS=F"),
    fetchYahooChart("ZC=F"),
    fetchYahooChart("CT=F"),
  ]);

  const precos: { instrumento: string; valor: number }[] = [];

  if (sojaRes.status === "fulfilled" && sojaRes.value > 0)
    precos.push({ instrumento: "CBOT_SOJA",    valor: sojaRes.value });
  else if (sojaRes.status === "rejected")
    erros.push(`ZS=F: ${String(sojaRes.reason)}`);

  if (milhoRes.status === "fulfilled" && milhoRes.value > 0)
    precos.push({ instrumento: "CBOT_MILHO",   valor: milhoRes.value });
  else if (milhoRes.status === "rejected")
    erros.push(`ZC=F: ${String(milhoRes.reason)}`);

  if (algodaoRes.status === "fulfilled" && algodaoRes.value > 0)
    precos.push({ instrumento: "CBOT_ALGODAO", valor: algodaoRes.value });
  else if (algodaoRes.status === "rejected")
    erros.push(`CT=F: ${String(algodaoRes.reason)}`);

  // Insere como spot (vencimento=null = contrato contínuo/front-month)
  for (const p of precos) {
    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     p.instrumento,
      vencimento:      null,
      data_referencia: hoje,
      valor:           p.valor,
      unidade:         "cents_bu",
      fonte:           "YAHOO",
      boletim:         "fechamento",
    });
    if (error) erros.push(`${p.instrumento}: ${error.message}`);
    else inseridos++;
  }

  const resultado = {
    ok:        erros.length === 0 && inseridos > 0,
    data:      hoje,
    fonte:     "YAHOO",
    inseridos,
    precos:    precos.map(p => ({ instrumento: p.instrumento, valor: p.valor })),
    erros,
    duracaoMs: Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
