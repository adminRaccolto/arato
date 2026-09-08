// Processa automaticamente todos os CP sem produtor de uma conta:
// carrega NFs vinculadas, envia para Claude Haiku em lotes e aplica os UPDATEs.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300; // Vercel — até 5 min

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LOTE = 40;

interface LancRow {
  id: string;
  fazenda_id: string;
  fazenda_nome: string;
  descricao: string;
  categoria: string;
  data_vencimento: string;
  valor: number;
  nfe_numero?: string;
  fornecedor_nome?: string;
  // da NF vinculada (quando existir)
  nf_emitente?: string;
  nf_emitente_cnpj?: string;
  nf_natureza?: string;
  nf_cfop?: string;
  nf_tipo_entrada?: string;
  nf_origem?: string;
}

interface Produtor {
  id: string;
  nome: string;
  cpf_cnpj?: string;
  fazenda_nome?: string;
}

interface Sugestao {
  lancamento_id: string;
  produtor_id: string | null;
  motivo: string;
}

async function sugerirLote(
  lancamentos: LancRow[],
  produtores: Produtor[],
  conta_nome: string
): Promise<Sugestao[]> {
  const prodStr = produtores
    .map(p => `  ID: ${p.id} | ${p.nome}${p.cpf_cnpj ? ` (${p.cpf_cnpj})` : ""}${p.fazenda_nome ? ` — Fazenda: ${p.fazenda_nome}` : ""}`)
    .join("\n");

  const lancStr = lancamentos.map(l => {
    const nfInfo = l.nf_emitente
      ? ` | NF Emitente: ${l.nf_emitente}${l.nf_emitente_cnpj ? ` (CNPJ: ${l.nf_emitente_cnpj})` : ""}${l.nf_tipo_entrada ? ` | Tipo: ${l.nf_tipo_entrada}` : ""}${l.nf_cfop ? ` | CFOP: ${l.nf_cfop}` : ""}`
      : "";
    return `  ID: ${l.id} | Fazenda: ${l.fazenda_nome} | Data: ${l.data_vencimento} | R$ ${l.valor.toFixed(2)} | ${l.descricao} | Cat: ${l.categoria}${l.fornecedor_nome ? ` | Fornecedor: ${l.fornecedor_nome}` : ""}${l.nfe_numero ? ` | NF: ${l.nfe_numero}` : ""}${nfInfo}`;
  }).join("\n");

  const prompt = `Você é um especialista em contabilidade rural. Associe cada lançamento de CP ao produtor correto.

CONTA: ${conta_nome}

PRODUTORES DISPONÍVEIS:
${prodStr}

LANÇAMENTOS (${lancamentos.length}):
${lancStr}

REGRAS:
- Use os dados da NF (emitente, CFOP, tipo) e da fazenda para identificar o produtor
- Se a fazenda tiver apenas um produtor compatível, use-o
- Se não for possível determinar com certeza, retorne produtor_id: null
- Retorne APENAS JSON, sem texto adicional

FORMATO:
[{"lancamento_id":"<id>","produtor_id":"<id ou null>","motivo":"<razão curta>"}]`;

  const resp = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = resp.content[0].type === "text" ? resp.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]) as Sugestao[];
}

export async function POST(req: NextRequest) {
  try {
    const { conta_id } = await req.json() as { conta_id: string };
    if (!conta_id) return NextResponse.json({ erro: "conta_id obrigatório" }, { status: 400 });

    const supabase = sb();

    // Nome da conta
    const { data: conta } = await supabase.from("contas").select("nome").eq("id", conta_id).single();
    const conta_nome = conta?.nome ?? conta_id;

    // Fazendas da conta
    const { data: fazendas } = await supabase
      .from("fazendas")
      .select("id, nome")
      .eq("conta_id", conta_id);
    const fazMap: Record<string, string> = {};
    (fazendas ?? []).forEach((f: { id: string; nome: string }) => { fazMap[f.id] = f.nome; });
    const fazIds = Object.keys(fazMap);

    if (!fazIds.length) return NextResponse.json({ erro: "Nenhuma fazenda encontrada" }, { status: 404 });

    // Produtores da conta
    const { data: prods } = await supabase
      .from("produtores")
      .select("id, nome, cpf_cnpj, fazenda_id")
      .eq("conta_id", conta_id);
    const produtores: Produtor[] = (prods ?? []).map(p => ({
      ...p,
      fazenda_nome: fazMap[p.fazenda_id],
    }));

    if (!produtores.length) return NextResponse.json({ erro: "Nenhum produtor encontrado para esta conta" }, { status: 404 });

    // CP sem produtor — com JOIN para dados da NF (duas vias possíveis de link)
    const { data: lancs } = await supabase
      .from("lancamentos")
      .select(`
        id, fazenda_id, descricao, categoria,
        data_vencimento, valor, nfe_numero, pessoa_id,
        pessoas:pessoa_id ( nome ),
        nf_por_id:nf_entrada_id (
          emitente_nome, emitente_cnpj, natureza, cfop, tipo_entrada, origem
        )
      `)
      .in("fazenda_id", fazIds)
      .eq("tipo", "pagar")
      .is("produtor_id", null)
      .order("data_vencimento", { ascending: false })
      .limit(1000);

    if (!lancs?.length) {
      return NextResponse.json({ atualizados: 0, mensagem: "Nenhum CP sem produtor encontrado." });
    }

    // Para lançamentos sem nf_entrada_id, tenta via nf_entradas.lancamento_id
    const semNfIds = (lancs as Record<string, unknown>[])
      .filter(l => !(l.nf_por_id as Record<string, unknown> | null))
      .map(l => l.id as string);

    const nfPorLancId: Record<string, Record<string, unknown>> = {};
    if (semNfIds.length) {
      const { data: nfsViaLanc } = await supabase
        .from("nf_entradas")
        .select("lancamento_id, emitente_nome, emitente_cnpj, natureza, cfop, tipo_entrada, origem")
        .in("lancamento_id", semNfIds);
      (nfsViaLanc ?? []).forEach((n: Record<string, unknown>) => {
        if (n.lancamento_id) nfPorLancId[n.lancamento_id as string] = n;
      });
    }

    // Monta lista enriquecida
    const lista: LancRow[] = (lancs as Record<string, unknown>[]).map(l => {
      const nf = (l.nf_por_id as Record<string, unknown> | null) ?? nfPorLancId[l.id as string];
      return {
        id: l.id as string,
        fazenda_id: l.fazenda_id as string,
        fazenda_nome: fazMap[l.fazenda_id as string] ?? "?",
        descricao: l.descricao as string,
        categoria: l.categoria as string,
        data_vencimento: l.data_vencimento as string,
        valor: l.valor as number,
        nfe_numero: l.nfe_numero as string | undefined,
        fornecedor_nome: (l.pessoas as { nome?: string } | null)?.nome,
        nf_emitente: nf?.emitente_nome as string | undefined,
        nf_emitente_cnpj: nf?.emitente_cnpj as string | undefined,
        nf_natureza: nf?.natureza as string | undefined,
        nf_cfop: nf?.cfop as string | undefined,
        nf_tipo_entrada: nf?.tipo_entrada as string | undefined,
        nf_origem: nf?.origem as string | undefined,
      };
    });

    // Processa em lotes
    let atualizados = 0;
    let indeterminados = 0;
    const erros: string[] = [];

    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      let sugestoes: Sugestao[] = [];

      try {
        sugestoes = await sugerirLote(lote, produtores, conta_nome);
      } catch (e) {
        erros.push(`Lote ${Math.floor(i / LOTE) + 1}: ${e instanceof Error ? e.message : "erro IA"}`);
        continue;
      }

      // Aplica apenas as sugestões com produtor_id definido
      const updates = sugestoes.filter(s => s.produtor_id !== null && s.produtor_id !== "");
      indeterminados += sugestoes.filter(s => !s.produtor_id).length;

      for (const s of updates) {
        const { error } = await supabase
          .from("lancamentos")
          .update({ produtor_id: s.produtor_id })
          .eq("id", s.lancamento_id);
        if (error) erros.push(`${s.lancamento_id}: ${error.message}`);
        else atualizados++;
      }
    }

    return NextResponse.json({
      total_processados: lista.length,
      atualizados,
      indeterminados,
      erros_count: erros.length,
      erros: erros.slice(0, 10),
    });
  } catch (err) {
    console.error("[cp-produtor/processar-auto]", err);
    return NextResponse.json({ erro: "Erro interno" }, { status: 500 });
  }
}
