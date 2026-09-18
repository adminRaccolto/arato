import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { buscarConfEmitente, carregarPfx } from "@/lib/nfe";
import { pfxParaPem } from "@/lib/nfe/signer";
import { consultarCadastroContribuinte } from "@/lib/nfe/consulta-cadastro";

export const dynamic = "force-dynamic";

// Consulta Cadastro de Contribuintes (Sintegra) por IE/CNPJ/CPF — usada no
// cadastro de Produtores para auto-preencher nome e endereço a partir da IE,
// igual ao botão "Sintegra" do sistema de referência. Reaproveita o certificado
// A1 já configurado em Parâmetros → Fiscal para essa fazenda: a consulta de
// cadastro é um serviço de busca (qualquer certificado válido consulta
// qualquer contribuinte daquela UF), não precisa ser o certificado do próprio
// produtor consultado.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { fazenda_id, uf, ie, cnpj, cpf } = await req.json();
  if (!fazenda_id) {
    return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });
  }
  if (!ie && !cnpj && !cpf) {
    return NextResponse.json({ error: "Informe IE, CNPJ ou CPF para consultar" }, { status: 400 });
  }

  const ufFinal = (uf || "MT").toUpperCase();

  // moduloKey exato não importa — buscarConfEmitente já cai no fallback de
  // "qualquer módulo fiscal com CPF/CNPJ e certificado" dessa fazenda.
  let confg = await buscarConfEmitente(fazenda_id, "fiscal_pf_consulta_cadastro");
  let fazendaIdComCert = fazenda_id;

  // Certificado não achado nesta fazenda específica — antes de desistir,
  // procura em qualquer outra fazenda da mesma conta. A consulta de cadastro
  // é um serviço de busca genérico (qualquer certificado válido consulta
  // qualquer contribuinte daquela UF) — diferente da emissão de NF-e, não
  // precisa ser o certificado da própria fazenda ativa. Sem isso, uma conta
  // com várias fazendas via "nenhum certificado configurado" mesmo o
  // certificado existindo, só que cadastrado noutra fazenda da mesma conta
  // (achado real 18/09/2026, mesmo padrão de bug já corrigido em Operações
  // Gerenciais, Plano de Contas, Usuários, Grupos de Acesso e Máquinas).
  if (!confg?.cert_a1_path || !confg?.cert_a1_senha) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: faz } = await admin.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    if (faz?.conta_id) {
      const { data: fazendasDaConta } = await admin.from("fazendas").select("id").eq("conta_id", faz.conta_id);
      for (const f of fazendasDaConta ?? []) {
        if (f.id === fazenda_id) continue;
        const tentativa = await buscarConfEmitente(f.id, "fiscal_pf_consulta_cadastro");
        if (tentativa?.cert_a1_path && tentativa?.cert_a1_senha) { confg = tentativa; fazendaIdComCert = f.id; break; }
      }
    }
  }

  if (!confg?.cert_a1_path || !confg?.cert_a1_senha) {
    return NextResponse.json({
      error: "Nenhum certificado A1 configurado nesta conta. Configure em Parâmetros → Fiscal antes de consultar o Sintegra.",
    }, { status: 400 });
  }

  let pfxBuffer: Buffer;
  try {
    pfxBuffer = await carregarPfx(confg.cert_a1_path, fazendaIdComCert);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  let pem;
  try {
    pem = pfxParaPem(pfxBuffer, confg.cert_a1_senha);
  } catch (e) {
    return NextResponse.json({ error: `Certificado inválido ou senha incorreta: ${e}` }, { status: 400 });
  }

  try {
    const resultado = await consultarCadastroContribuinte(ufFinal, pem, { ie, cnpj, cpf });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: `Falha ao consultar SEFAZ: ${e}` }, { status: 502 });
  }
}
