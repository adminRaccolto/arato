import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";



export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  try {
    const body = await req.json();

    if (!body.fazenda_id || !body.nome) {
      return NextResponse.json({ error: "fazenda_id e nome são obrigatórios" }, { status: 400 });
    }

    const auth = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.cpf_cnpj) {
      // Compara por dígitos puros e formatado — cadastros antigos guardam com
      // máscara ("176.798.429-49") e um match exato só na string enviada perdia
      // duplicatas reais (achado de auditoria: mesmo padrão causou 91
      // fornecedores duplicados em `pessoas`). limit(1) evita a falha silenciosa
      // do maybeSingle() quando já existe mais de um registro para o documento.
      const docRaw = String(body.cpf_cnpj).replace(/\D/g, "");
      const docFmt = docRaw.length === 14
        ? docRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
        : docRaw.length === 11
          ? docRaw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
          : docRaw;
      const { data: existentes } = await admin.from("produtores")
        .select("*").eq("fazenda_id", body.fazenda_id)
        .or(`cpf_cnpj.eq.${docRaw},cpf_cnpj.eq.${docFmt}`)
        .limit(1);
      if (existentes?.[0]) {
        return NextResponse.json({ error: "duplicado", produtor_existente: existentes[0] }, { status: 409 });
      }
    }

    // Allowlist explícita — nunca repassar o body cru para o insert (evita injeção
    // de colunas como owner_user_id/conta_id de outra conta via payload arbitrário).
    const payload = {
      fazenda_id: body.fazenda_id,
      conta_id: body.conta_id,
      nome: body.nome,
      tipo: body.tipo,
      cpf_cnpj: body.cpf_cnpj,
      incra: body.incra,
      inscricao_est: body.inscricao_est,
      email: body.email,
      telefone: body.telefone,
      cep: body.cep,
      logradouro: body.logradouro,
      numero: body.numero,
      complemento: body.complemento,
      bairro: body.bairro,
      municipio: body.municipio,
      municipio_ibge: body.municipio_ibge,
      estado: body.estado,
    };

    const { data, error } = await admin
      .from("produtores")
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ produtor: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
