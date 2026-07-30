import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  // Apenas raccotlo pode executar
  const body = await req.json().catch(() => ({}));
  if (body.secret !== process.env.ADMIN_SECRET && body.role !== "raccotlo") {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 403 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Busca todas as pessoas com CEP mas sem IBGE
  const { data: pessoas, error } = await db
    .from("pessoas")
    .select("id, nome, cep, municipio, estado")
    .or("municipio_ibge.is.null,municipio_ibge.eq.")
    .not("cep", "is", null)
    .neq("cep", "")
    .order("nome");

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!pessoas?.length) return NextResponse.json({ atualizados: 0, erros: 0, detalhes: [] });

  let atualizados = 0;
  let erros = 0;
  const detalhes: { nome: string; cep: string; ibge?: string; erro?: string }[] = [];

  for (const p of pessoas) {
    const cep = (p.cep as string).replace(/\D/g, "");
    if (cep.length !== 8) { erros++; detalhes.push({ nome: p.nome, cep, erro: "CEP inválido (não tem 8 dígitos)" }); continue; }

    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) });
      const d    = await resp.json();

      if (d.erro) { erros++; detalhes.push({ nome: p.nome, cep, erro: "CEP não encontrado no ViaCEP" }); }
      else {
        const ibge = String(d.ibge ?? "");
        if (!ibge) { erros++; detalhes.push({ nome: p.nome, cep, erro: "ViaCEP não retornou IBGE" }); }
        else {
          await db.from("pessoas").update({
            municipio_ibge: ibge,
            municipio: d.localidade ?? p.municipio ?? "",
            estado:    d.uf        ?? p.estado    ?? "",
            bairro:    d.bairro    ?? undefined,
          }).eq("id", p.id);
          atualizados++;
          detalhes.push({ nome: p.nome, cep, ibge });
        }
      }
    } catch {
      erros++;
      detalhes.push({ nome: p.nome, cep, erro: "Timeout ou falha na chamada ao ViaCEP" });
    }

    await sleep(150); // respeita limite de taxa do ViaCEP
  }

  return NextResponse.json({ total: pessoas.length, atualizados, erros, detalhes });
}
