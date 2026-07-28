import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import forge from "node-forge";
import { validateFazendaAccess } from "../../../lib/api-auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function extrairVencimento(buffer: ArrayBuffer, senha: string): string | null {
  try {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const der = forge.util.createBuffer(bin, "raw");
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certs = bags[forge.pki.oids.certBag];
    if (!certs || certs.length === 0) return null;
    const cert = certs[0].cert;
    if (!cert) return null;
    return cert.validity.notAfter.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// POST /api/cert-upload
// multipart/form-data: file, senha, fazenda_id, produtor_id, produtor_nome, cpf_cnpj
export async function POST(req: Request) {
  const form = await req.formData();
  const file       = form.get("file")         as File   | null;
  const senha      = form.get("senha")        as string | null;
  const fazendaId  = form.get("fazenda_id")   as string | null;
  const produtorId = form.get("produtor_id")  as string | null;
  const prodNome   = form.get("produtor_nome") as string | null;
  const cpfCnpj    = form.get("cpf_cnpj")     as string | null;

  if (!file || !senha || !fazendaId) {
    return NextResponse.json({ error: "file, senha e fazenda_id são obrigatórios" }, { status: 400 });
  }

  const access = await validateFazendaAccess(fazendaId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const buffer = await file.arrayBuffer();
  const dataVencimento = extrairVencimento(buffer, senha);

  const supabase = adminClient();
  const path = `${fazendaId}/${produtorId ?? "geral"}/${file.name}`;

  // Garante que o bucket existe (cria se necessário — privado)
  const { error: bucketErr } = await supabase.storage.createBucket("certificados", { public: false });
  // Ignora erro de bucket já existente (código "Duplicate")
  if (bucketErr && !bucketErr.message.toLowerCase().includes("already") && !bucketErr.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: "Bucket: " + bucketErr.message }, { status: 500 });
  }

  const { error: storageErr } = await supabase.storage
    .from("certificados")
    .upload(path, Buffer.from(buffer), { upsert: true, contentType: "application/x-pkcs12" });

  if (storageErr) {
    return NextResponse.json({ error: "Storage: " + storageErr.message }, { status: 500 });
  }

  const config = {
    arquivo_nome:    file.name,
    storage_path:    path,
    produtor_id:     produtorId  ?? null,
    produtor_nome:   prodNome    ?? "",
    cpf_cnpj:        cpfCnpj     ?? "",
    data_vencimento: dataVencimento,
  };

  // 1. Chave de metadados por produtor — preserva info de certificados de outros produtores
  const modulo = `certificado_a1_${produtorId ?? "geral"}`;

  const { error: dbErr } = await supabase
    .from("configuracoes_modulo")
    .upsert(
      { fazenda_id: fazendaId, modulo, config },
      { onConflict: "fazenda_id,modulo" }
    );

  if (dbErr) {
    return NextResponse.json({ error: "Banco: " + dbErr.message }, { status: 500 });
  }

  // 2. Atualiza também o módulo fiscal (fiscal_pf_XXX ou fiscal_emp_XXX) com cert_a1_path e cert_a1_senha
  // Isso conecta o upload ao emitirNFe que lê de fiscal_pf/fiscal_emp
  if (cpfCnpj) {
    const digits = cpfCnpj.replace(/\D/g, "");
    // Tenta PF primeiro, depois PJ (empresa)
    const isPJ = digits.length === 14;
    const fiscalModulo = isPJ ? `fiscal_emp_${digits}` : `fiscal_pf_${digits}`;

    // Lê config existente para não sobrescrever outros campos
    const { data: existente } = await supabase
      .from("configuracoes_modulo")
      .select("config")
      .eq("fazenda_id", fazendaId)
      .eq("modulo", fiscalModulo)
      .single();

    const cfgAtual = (existente?.config as Record<string, string>) ?? {};
    await supabase
      .from("configuracoes_modulo")
      .upsert(
        {
          fazenda_id: fazendaId,
          modulo: fiscalModulo,
          config: { ...cfgAtual, cert_a1_path: path, cert_a1_senha: senha },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fazenda_id,modulo" }
      );
  }

  return NextResponse.json({
    ok: true,
    produtor_id:     produtorId   ?? null,
    arquivo_nome:    file.name,
    storage_path:    path,
    produtor_nome:   prodNome     ?? "",
    cpf_cnpj:        cpfCnpj      ?? "",
    data_vencimento: dataVencimento,
  });
}
