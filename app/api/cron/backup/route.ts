import { NextResponse } from "next/server";
import { executarBackup } from "../../backup/route";
import { createClient } from "@supabase/supabase-js";

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const admin = adminClient();
  const { data: fazendas, error } = await admin.from("fazendas").select("id, nome");

  if (error || !fazendas?.length) {
    return NextResponse.json({ erro: "Nenhuma fazenda encontrada", detalhe: error?.message });
  }

  const resultados: Array<{ fazenda_id: string; nome: string; sucesso: boolean; arquivo: string; total_registros: number; erro?: string }> = [];

  for (const fazenda of fazendas) {
    const res = await executarBackup(fazenda.id);
    const totalReg = Object.values(res.tabelas ?? {}).reduce((s, v) => s + v, 0);
    resultados.push({
      fazenda_id: fazenda.id,
      nome: fazenda.nome,
      sucesso: res.sucesso,
      arquivo: res.arquivo,
      total_registros: totalReg,
      erro: res.erro,
    });
  }

  const ok    = resultados.filter(r => r.sucesso).length;
  const falha = resultados.filter(r => !r.sucesso).length;

  return NextResponse.json({
    executado_em: new Date().toISOString(),
    fazendas_ok: ok,
    fazendas_erro: falha,
    resultados,
  });
}
