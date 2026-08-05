import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60; // segundos — necessário para BCB séries lentas

const BCB_SERIES: Record<string, { serie: number; tipo: "mensal_pct" | "aa_direto" }> = {
  CDI:     { serie: 4391,  tipo: "mensal_pct" },
  IPCA:    { serie: 433,   tipo: "mensal_pct" },
  SELIC:   { serie: 4390,  tipo: "mensal_pct" },
  TR:      { serie: 226,   tipo: "mensal_pct" },
  TJLP:    { serie: 256,   tipo: "aa_direto"  },
  TLP:     { serie: 28684, tipo: "aa_direto"  },
  INPC:    { serie: 188,   tipo: "mensal_pct" },
  "IGP-M": { serie: 189,   tipo: "mensal_pct" },
};

function amParaAa(am: number): number {
  return (Math.pow(1 + am / 100, 12) - 1) * 100;
}

type BuscarResult =
  | { indexador: string; valor_pct: number | null; erro: string }
  | { indexador: string; valor_pct: number; ano: number; mes: number };

async function fetchBCBUltimos(
  serie: number,
  qtd: number,
  timeoutMs: number
): Promise<{ data: string; valor: string }[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${qtd}?formato=json`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`BCB HTTP ${resp.status}`);
  return resp.json();
}

function parseDados(
  dados: { data: string; valor: string }[],
  indexador: string,
  tipo: "mensal_pct" | "aa_direto"
): BuscarResult[] {
  return dados.flatMap(d => {
    const valorRaw = parseFloat(d.valor.replace(",", "."));
    if (isNaN(valorRaw)) return [];
    const valorAa = tipo === "aa_direto" ? valorRaw : amParaAa(valorRaw);
    const partes = d.data.split("/");
    if (partes.length !== 3) return [];
    return [{
      indexador,
      valor_pct: parseFloat(valorAa.toFixed(4)),
      ano: parseInt(partes[2]),
      mes: parseInt(partes[1]),
    }];
  });
}

async function buscarIndexador(
  indexador: string,
  cfg: { serie: number; tipo: "mensal_pct" | "aa_direto" },
): Promise<BuscarResult[]> {
  // Tenta 6 meses; se falhar (400/timeout), tenta 3
  for (const [qtd, ms] of [[6, 15_000], [3, 12_000]] as [number, number][]) {
    try {
      const dados = await fetchBCBUltimos(cfg.serie, qtd, ms);
      if (!dados.length) throw new Error("Resposta vazia");
      return parseDados(dados, indexador, cfg.tipo);
    } catch (e) {
      if (qtd === 3) return [{ indexador, valor_pct: null, erro: (e as Error).message }];
    }
  }
  return [{ indexador, valor_pct: null, erro: "Falha inesperada" }];
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca histórico completo (120 meses) de cada indexador em paralelo
  const porIndexador = await Promise.all(
    Object.entries(BCB_SERIES).map(([idx, cfg]) => buscarIndexador(idx, cfg))
  );

  // Aplana em lista única, separa ok vs erro por indexador
  const todos   = porIndexador.flat();
  const validos = todos.filter((r): r is { indexador: string; valor_pct: number; ano: number; mes: number } => r.valor_pct != null);
  const falhos  = porIndexador
    .map(arr => arr.find(r => r.valor_pct == null))
    .filter((r): r is { indexador: string; valor_pct: null; erro: string } => r != null);

  // Upsert em lote (Supabase aceita array)
  let erroUpsert: string | null = null;
  if (validos.length > 0) {
    const { error } = await supabase
      .from("taxas_variaveis_historico")
      .upsert(
        validos.map(r => ({
          indexador: r.indexador,
          ano: r.ano,
          mes: r.mes,
          valor_pct: parseFloat(r.valor_pct.toFixed(6)),
          fonte: "bcb",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "indexador,ano,mes" }
      );
    if (error) erroUpsert = error.message;
  }

  const indexadoresOk    = Object.keys(BCB_SERIES).length - falhos.length;
  const indexadoresTotal = Object.keys(BCB_SERIES).length;

  return NextResponse.json({
    ok: falhos.length === 0 && !erroUpsert,
    sucesso: `${indexadoresOk}/${indexadoresTotal} indexadores atualizados (${validos.length} observações salvas)`,
    erros: [
      ...falhos.map(e => `${e.indexador}: ${e.erro}`),
      ...(erroUpsert ? [`Erro ao salvar: ${erroUpsert}`] : []),
    ],
  });
}
