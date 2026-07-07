import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULTS = [
  { nome: "Soja",                categoria: "graos", unidade: "sc", ncm: "1201.10.00", ordem: 1 },
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

  // Insere produtos agrícolas padrão em insumos (ignora se já existe)
  const { data: existPA } = await sb.from("insumos").select("id").eq("fazenda_id", fazenda_id).eq("categoria", "produto_agricola");
  if (!existPA || existPA.length === 0) {
    await sb.from("insumos").insert(
      DEFAULTS_PA.map(p => ({
        fazenda_id, tipo: "produto", nome: p.nome, categoria: "produto_agricola",
        unidade: p.unidade, estoque: 0, estoque_minimo: 0, valor_unitario: 0,
      }))
    );
  }

  // Retorna as culturas inseridas/existentes
  const { data } = await sb.from("culturas").select("*").eq("fazenda_id", fazenda_id).order("ordem").order("nome");
  return NextResponse.json({ culturas: data ?? [] });
}
