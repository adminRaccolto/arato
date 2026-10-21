import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { buscarConfEmitente, carregarPfx } from "@/lib/nfe";
import { selecionarCertificadoA1ParaConsulta, type CandidatoCertificadoA1 } from "@/lib/nfe/certificado-a1";
import { consultarCadastroContribuinte } from "@/lib/nfe/consulta-cadastro";
import { resolverModuloKeyFiscal } from "@/lib/nfe/resolver-emitente";
import { validateFazendaAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Consulta Cadastro de Contribuintes (Sintegra) por IE/CNPJ/CPF — usada no
// cadastro de Produtores para auto-preencher nome e endereço a partir da IE,
// igual ao botão "Sintegra" do sistema de referência. Reaproveita o certificado
// A1 já configurado em Parâmetros → Fiscal para essa fazenda: a consulta de
// cadastro é um serviço de busca (qualquer certificado válido consulta
// qualquer contribuinte daquela UF), não precisa ser o certificado do próprio
// produtor consultado.
async function consultar(req: NextRequest) {
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
  const acesso = await validateFazendaAccess(fazenda_id);
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

  const ufFinal = (uf || "MT").toUpperCase();

  // Prefere o certificado do emitente padrão, incluindo a resolução de caminhos legados.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const moduloKeyReal = await resolverModuloKeyFiscal(fazenda_id, admin);
  const confg = moduloKeyReal ? await buscarConfEmitente(fazenda_id, moduloKeyReal, undefined, true) : null;
  const candidatos: CandidatoCertificadoA1[] = [];
  if (confg?.cert_a1_path && confg?.cert_a1_senha) {
    candidatos.push({ fazendaId: fazenda_id, caminho: confg.cert_a1_path, senha: confg.cert_a1_senha });
  }

  // Uma configuração preenchida pode conter senha incorreta ou um arquivo antigo. Busca
  // alternativas da mesma conta mesmo quando o emitente padrão tem caminho e senha.
  const { data: faz, error: erroFazenda } = await admin.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
  if (erroFazenda) throw new Error("Não foi possível buscar a conta da fazenda.");
  let fazendasDaConta = [fazenda_id];
  if (faz?.conta_id) {
    const { data, error } = await admin.from("fazendas").select("id").eq("conta_id", faz.conta_id);
    if (error) throw new Error("Não foi possível buscar as fazendas da conta.");
    fazendasDaConta = (data ?? []).map(f => f.id as string);
  }
  const { data: modulosFiscais, error } = await admin.from("configuracoes_modulo").select("fazenda_id, modulo, config")
    .in("fazenda_id", fazendasDaConta)
    .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%,modulo.eq.fiscal")
    .not("modulo", "like", "%__ie_%")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Não foi possível buscar os certificados da conta.");
  for (const m of modulosFiscais ?? []) {
    const cfg = m.config as Record<string, string> | null;
    if (cfg?.cert_a1_path && cfg.cert_a1_senha) {
      candidatos.push({ fazendaId: m.fazenda_id as string, caminho: cfg.cert_a1_path, senha: cfg.cert_a1_senha });
    }
  }

  if (candidatos.length === 0) {
    return NextResponse.json({
      error: "Nenhum certificado A1 configurado nesta conta. Configure em Parâmetros → Fiscal antes de consultar o Sintegra.",
    }, { status: 400 });
  }

  let pem;
  try {
    pem = await selecionarCertificadoA1ParaConsulta(candidatos, carregarPfx);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const resultado = await consultarCadastroContribuinte(ufFinal, pem, { ie, cnpj, cpf });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: `Falha ao consultar SEFAZ: ${e}` }, { status: 502 });
  }
}

// Sempre responde JSON — se algo falhar antes do try interno, o cliente recebia uma página de erro
// HTML e a tela mostrava "SyntaxError" em vez do motivo.
export async function POST(req: NextRequest) {
  try {
    return await consultar(req);
  } catch (e) {
    console.error("[consultar-cadastro]", e);
    return NextResponse.json({ error: `Falha no servidor ao consultar o Sintegra: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
