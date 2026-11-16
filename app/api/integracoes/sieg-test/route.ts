/** GET: diagnóstico de acesso ao SIEG, sem importar nem devolver documentos fiscais. */
import { NextRequest, NextResponse } from "next/server";
import { credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";
import { diagnosticarSieg } from "../../../../lib/fiscal/sieg-diagnostico";
import { exigirAcessoFazenda, exigirLogin } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id") ?? "";
  const negado = fazendaId ? await exigirAcessoFazenda(req, fazendaId) : await exigirLogin(req);
  if (negado) return negado;
  const creds = credenciaisEnv();
  if (!credenciaisValidas(creds)) return NextResponse.json({ tipo: "erro", situacao: "configuracao_pendente",
    titulo: "Credenciais não configuradas", mensagem: "Solicite ao administrador a configuração das credenciais da integração SIEG." },
    { status: 503, headers: { "Cache-Control": "no-store" } });
  const resultado = await diagnosticarSieg(creds);
  return NextResponse.json(resultado, { status: resultado.sieg_status === 429 ? 429 : 200,
    headers: { "Cache-Control": "no-store", ...(resultado.retry_after ? { "Retry-After": String(resultado.retry_after) } : {}) } });
}
