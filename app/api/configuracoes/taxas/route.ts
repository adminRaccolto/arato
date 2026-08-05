import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function buscarIndexador(
  indexador: string,
  cfg: { serie: number; tipo: "mensal_pct" | "aa_direto" },
  ano: number,
  mes: number
): Promise<{ indexador: string; valor_pct: number | null; erro?: string }> {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cfg.serie}/dados/ultimos/3?formato=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!resp.ok) throw new Error(`BCB HTTP ${resp.status}`);
    const dados: { data: string; valor: string }[] = await resp.json();
    if (!dados.length) throw new Error("Resposta vazia");

    const ultimo = dados[dados.length - 1];
    const valorRaw = parseFloat(ultimo.valor.replace(",", "."));
    if (isNaN(valorRaw)) throw new Error("Valor inválido");

    const valorAa = cfg.tipo === "aa_direto" ? valorRaw : amParaAa(valorRaw);

    const partes = ultimo.data.split("/");
    const obsAno = partes.length === 3 ? parseInt(partes[2]) : ano;
    const obsMes = partes.length === 3 ? parseInt(partes[1]) : mes;

    return { indexador, valor_pct: parseFloat(valorAa.toFixed(4)), ano: obsAno, mes: obsMes } as never;
  } catch (e) {
    return { indexador, valor_pct: null, erro: (e as Error).message };
  }
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const agora = new Date();
  const ano   = agora.getFullYear();
  const mes   = agora.getMonth() + 1;

  // Todas as chamadas BCB em paralelo — muito mais rápido que sequencial
  const resultados = await Promise.all(
    Object.entries(BCB_SERIES).map(([idx, cfg]) => buscarIndexador(idx, cfg, ano, mes))
  );

  // Salva os que vieram com sucesso
  const upserts = await Promise.all(
    resultados
      .filter(r => r.valor_pct != null)
      .map(r => {
        const rr = r as { indexador: string; valor_pct: number; ano: number; mes: number };
        return supabase
          .from("taxas_variaveis_historico")
          .upsert(
            { indexador: rr.indexador, ano: rr.ano, mes: rr.mes, valor_pct: parseFloat((rr.valor_pct).toFixed(6)), fonte: "bcb", updated_at: new Date().toISOString() },
            { onConflict: "indexador,ano,mes" }
          )
          .then(({ error }) => error ? { ...rr, erro: error.message, valor_pct: null } : rr);
      })
  );

  const final = [
    ...upserts,
    ...resultados.filter(r => r.valor_pct == null),
  ];

  const sucessos = final.filter(r => r.valor_pct != null).length;
  const erros    = final.filter(r => r.valor_pct == null);

  return NextResponse.json({
    ok: erros.length === 0,
    sucesso: `${sucessos}/${Object.keys(BCB_SERIES).length} indexadores atualizados`,
    erros: erros.map(e => `${e.indexador}: ${"erro" in e ? e.erro : "erro desconhecido"}`),
  });
}
