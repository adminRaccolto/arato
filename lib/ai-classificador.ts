/**
 * Classificador de itens de NF-e usando Claude Haiku.
 *
 * Chamado pelo sieg-sync quando matchRegra() retorna null.
 * Retorna classificação com nível de confiança e motivo auditável.
 *
 * Alta/Média → auto-classifica (status "classificado")
 * Baixa      → item fica "pendente" mas com sugestão pré-preenchida na UI
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type ClassificacaoIA = {
  insumo_id:  string | null;
  og_id:      string | null;
  categoria:  string;
  confianca:  "alta" | "media" | "baixa";
  motivo:     string;
};

export interface ItemParaClassificar {
  descricao:      string;
  ncm:            string | null;
  cfop:           string | null;
  valor_unitario: number;
  valor_total:    number;
  quantidade:     number;
  unidade:        string | null;
}

export interface InfoEmitente {
  cnpj_emitente: string;
  nome_emitente: string;
  natureza:      string;
}

// NCM prefix → categorias de insumo prováveis (filtro pré-busca)
const NCM_HINT: Record<string, string[]> = {
  "3808": ["defensivos", "herbicida", "fungicida", "inseticida", "nematicida", "adjuvante", "acaricida"],
  "3105": ["fertilizantes"],
  "3101": ["fertilizantes"],
  "3102": ["fertilizantes"],
  "3103": ["fertilizantes"],
  "3104": ["fertilizantes"],
  "1209": ["sementes"],
  "2710": ["combustivel", "lubrificantes"],
  "2709": ["combustivel"],
  "8432": ["maquinas", "implementos"],
  "8433": ["maquinas", "colheitadeiras"],
};

function categoriaHint(ncm: string | null): string[] | null {
  if (!ncm) return null;
  const limpo = ncm.replace(/\D/g, "");
  for (const [prefix, cats] of Object.entries(NCM_HINT)) {
    if (limpo.startsWith(prefix)) return cats;
  }
  return null;
}

export async function classificarItemNF(
  supabase:  SupabaseClient,
  contaId:   string | null,
  fazendaId: string,
  item:      ItemParaClassificar,
  emitente:  InfoEmitente,
): Promise<ClassificacaoIA | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // ── 1. Insumos da fazenda (filtrados por categoria quando NCM sugere) ──────
  const hint = categoriaHint(item.ncm);
  let insQ = supabase
    .from("insumos")
    .select("id, nome, categoria, subgrupo, unidade")
    .eq("fazenda_id", fazendaId)
    .order("nome")
    .limit(100);
  if (hint && hint.length > 0) insQ = insQ.in("categoria", hint);
  const { data: insumos } = await insQ;

  // ── 2. OGs analíticas (global + conta) ─────────────────────────────────────
  const ogParts = ["and(fazenda_id.is.null,conta_id.is.null)"];
  if (contaId) ogParts.push(`conta_id.eq.${contaId}`);

  const { data: ogs } = await supabase
    .from("operacoes_gerenciais")
    .select("id, codigo, descricao, classificacao")
    .or(ogParts.join(","))
    .eq("inativo", false)
    .eq("permite_notas_fiscais", true)
    .order("classificacao")
    .limit(80);

  // ── 3. Montar listas compactas para o prompt ────────────────────────────────
  const listaInsumos = (insumos ?? [])
    .map(i => `${i.id}|${i.nome}|${i.categoria}|${i.unidade ?? ""}`)
    .join("\n");

  const listaOGs = (ogs ?? [])
    .map(o => `${o.id}|${o.codigo ?? ""}|${o.descricao}`)
    .join("\n");

  const userMsg = [
    `Classifique este item de nota fiscal do agronegócio:`,
    `Descrição: "${item.descricao}"`,
    `NCM: ${item.ncm || "—"}  CFOP: ${item.cfop || "—"}`,
    `Emitente: ${emitente.nome_emitente} (CNPJ: ${emitente.cnpj_emitente})`,
    `Natureza da operação: ${emitente.natureza}`,
    `Valor unitário: R$ ${item.valor_unitario?.toFixed(2) ?? "0,00"}`,
    "",
    listaInsumos
      ? `INSUMOS CADASTRADOS (id|nome|categoria|unidade):\n${listaInsumos}`
      : "INSUMOS: nenhum cadastrado",
    "",
    listaOGs
      ? `OPERAÇÕES GERENCIAIS (id|código|descrição):\n${listaOGs}`
      : "OGs: nenhuma cadastrada",
    "",
    `Responda APENAS com JSON no formato exato:`,
    `{"insumo_id":"<uuid ou null>","og_id":"<uuid ou null>","categoria":"<texto>","confianca":"<alta|media|baixa>","motivo":"<1 frase>"}`,
  ].join("\n");

  // ── 4. Chamar Claude Haiku ──────────────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: [
          "Você é um classificador especializado em notas fiscais do agronegócio brasileiro.",
          "Identifique o insumo e a operação gerencial mais adequados para o item recebido.",
          "Use confiança 'alta' quando há certeza, 'media' quando há boa evidência, 'baixa' quando há dúvida.",
          "Responda APENAS com JSON válido — sem markdown, sem texto extra.",
        ].join(" "),
        messages: [{ role: "user", content: userMsg }],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  // ── 5. Parsear resposta ─────────────────────────────────────────────────────
  try {
    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    const raw  = data.content?.find(b => b.type === "text")?.text ?? "";
    const json = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(json) as ClassificacaoIA;

    if (!parsed.categoria || !["alta", "media", "baixa"].includes(parsed.confianca)) return null;

    // Validar UUIDs contra as listas carregadas (evitar alucinações)
    const insumosIds = new Set((insumos ?? []).map(i => i.id));
    const ogsIds     = new Set((ogs ?? []).map(o => o.id));

    if (parsed.insumo_id && !insumosIds.has(parsed.insumo_id)) parsed.insumo_id = null;
    if (parsed.og_id     && !ogsIds.has(parsed.og_id))         parsed.og_id     = null;

    return parsed;
  } catch {
    return null;
  }
}
