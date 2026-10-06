import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { buscarConfEmitente, carregarPfx } from "@/lib/nfe";
import { pfxParaPem } from "@/lib/nfe/signer";
import { consultarCadastroContribuinte } from "@/lib/nfe/consulta-cadastro";
import { resolverModuloKeyFiscal } from "@/lib/nfe/resolver-emitente";

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

  const ufFinal = (uf || "MT").toUpperCase();

  // Achado real 28/09/2026: "fiscal_pf_consulta_cadastro" nunca foi um módulo de verdade — é só um
  // rótulo interno desta rota. buscarConfEmitente() não tem (nunca teve) um fallback de "qualquer
  // módulo fiscal com certificado"; ele só resolve a chave exata que recebe. Chamá-lo com esse
  // rótulo inventado sempre voltava vazio, mesmo com o certificado configurado — daí o erro
  // "Nenhum certificado A1 configurado" aparecer em toda consulta de Sintegra. Corrigido: resolve
  // primeiro a chave REAL do emitente padrão da conta (mesma função usada na emissão de NF-e), que
  // já busca em qualquer fazenda do cliente — a consulta de cadastro é um serviço de busca genérico
  // (qualquer certificado válido consulta qualquer contribuinte daquela UF), não precisa ser o
  // certificado da fazenda ativa nem de um emitente específico.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const moduloKeyReal = await resolverModuloKeyFiscal(fazenda_id, admin);
  let confg = moduloKeyReal ? await buscarConfEmitente(fazenda_id, moduloKeyReal) : null;
  let fazendaIdComCert = fazenda_id;

  // Certificado não achado nesse emitente padrão — procura em qualquer outro emitente cadastrado
  // em qualquer fazenda da mesma conta, até achar um com certificado A1 completo.
  if (!confg?.cert_a1_path || !confg?.cert_a1_senha) {
    const { data: faz } = await admin.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    if (faz?.conta_id) {
      const { data: fazendasDaConta } = await admin.from("fazendas").select("id").eq("conta_id", faz.conta_id);
      const { data: modulosFiscais } = await admin.from("configuracoes_modulo").select("fazenda_id, modulo")
        .in("fazenda_id", (fazendasDaConta ?? []).map(f => f.id as string))
        .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%")
        .not("modulo", "like", "%__ie_%");
      for (const m of modulosFiscais ?? []) {
        if (m.modulo === moduloKeyReal) continue; // já tentado acima
        const tentativa = await buscarConfEmitente(m.fazenda_id as string, m.modulo as string);
        if (tentativa?.cert_a1_path && tentativa?.cert_a1_senha) { confg = tentativa; fazendaIdComCert = m.fazenda_id as string; break; }
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
