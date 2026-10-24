import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { validateFazendaAccess } from "../../../lib/api-auth";
import { itemDoCliente } from "../../../lib/estoque/duplicados";

const DEFAULTS = [
  { nome: "Soja",                categoria: "graos", unidade: "sc", ncm: "1201.90.00", ordem: 1 },
  { nome: "Milho 1ª",            categoria: "graos", unidade: "sc", ncm: "1005.90.10", ordem: 2 },
  { nome: "Milho 2ª (Safrinha)", categoria: "graos", unidade: "sc", ncm: "1005.90.10", ordem: 3 },
  { nome: "Algodão",             categoria: "fibra", unidade: "@",  ncm: "5201.00.10", ordem: 4 },
  { nome: "Sorgo",               categoria: "graos", unidade: "sc", ncm: "1007.90.00", ordem: 5 },
  { nome: "Feijão",              categoria: "graos", unidade: "sc", ncm: "0713.33.19", ordem: 6 },
  { nome: "Trigo",               categoria: "graos", unidade: "sc", ncm: "1001.99.00", ordem: 7 },
];

const DEFAULTS_PA = [
  { nome: "Soja",             unidade: "sc"     },
  { nome: "Milho",            unidade: "sc"     },
  { nome: "Algodão em Pluma", unidade: "outros" },
  { nome: "Arroz",            unidade: "sc"     },
  { nome: "Trigo",            unidade: "sc"     },
  { nome: "Sorgo",            unidade: "sc"     },
];

export async function POST(req: NextRequest) {
  const { fazenda_id } = await req.json() as { fazenda_id: string };
  if (!fazenda_id) return NextResponse.json({ error: "fazenda_id required" }, { status: 400 });

  const access = await validateFazendaAccess(fazenda_id, req.headers.get("authorization") ?? undefined);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // upsert ignora conflito UNIQUE (fazenda_id, nome)
  await sb.from("culturas").upsert(
    DEFAULTS.map(d => ({ ...d, fazenda_id })),
    { onConflict: "fazenda_id,nome", ignoreDuplicates: true }
  );

  // Produtos agrícolas padrão: o cadastro é do CLIENTE — só cria os que não existem em nenhuma fazenda dele, um a um.
  // Antes conferia só a fazenda e só "se está vazio": chamadas simultâneas criaram cada produto até 8× (out/2026).
  const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
  const { data: fzs } = faz?.conta_id ? await sb.from("fazendas").select("id").eq("conta_id", faz.conta_id) : { data: [{ id: fazenda_id }] };
  const { data: existPA } = await sb.from("insumos").select("id, nome, tipo, ativo, mesclado_em").in("fazenda_id", (fzs ?? []).map(f => f.id)).eq("tipo", "produto");
  const faltando = DEFAULTS_PA.filter(p => !itemDoCliente(existPA ?? [], p.nome, "produto"));
  for (const p of faltando) {
    // Um por vez: se outra chamada criou ao mesmo tempo, o índice único (Seção 368) recusa e seguimos.
    await sb.from("insumos").insert({ fazenda_id, tipo: "produto", nome: p.nome, categoria: "produto_agricola", unidade: p.unidade, estoque: 0, estoque_minimo: 0, valor_unitario: 0 });
  }

  // Retorna as culturas inseridas/existentes
  const { data } = await sb.from("culturas").select("*").eq("fazenda_id", fazenda_id).order("ordem").order("nome");
  return NextResponse.json({ culturas: data ?? [] });
}
