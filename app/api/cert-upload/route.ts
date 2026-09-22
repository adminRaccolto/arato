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

    // A config fiscal é do CLIENTE: atualiza a(s) linha(s) que já existem em QUALQUER fazenda da conta
    // (antes gravava só na fazenda ativa e deixava outra cópia da config sem a senha — o emissor
    // pegava a cópia sem senha e dava "Certificado A1 não configurado").
    const { data: fazAtual } = await supabase.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
    let idsConta: string[] = [fazendaId];
    if (fazAtual?.conta_id) {
      const { data: fzs } = await supabase.from("fazendas").select("id").eq("conta_id", fazAtual.conta_id);
      if (fzs?.length) idsConta = fzs.map(f => f.id as string);
    }
    const { data: existentes } = await supabase
      .from("configuracoes_modulo")
      .select("fazenda_id, config")
      .in("fazenda_id", idsConta)
      .eq("modulo", fiscalModulo);

    // Também alcança fazendas da conta que usam este CNPJ como emitente de CT-e (transportadora
    // de terceiro prestando serviço pra mais de uma fazenda do cliente) mas nunca passaram pelo
    // cadastro Fiscal com este documento — sem isso, a fazenda tinha o certificado "aparecendo
    // configurado" (metadado genérico certificado_a1_*) mas sem senha, e a emissão de CT-e falhava
    // com "Certificado A1 não configurado no módulo CT-e nem no Fiscal".
    const { data: cteRows } = await supabase
      .from("configuracoes_modulo")
      .select("fazenda_id")
      .in("fazenda_id", idsConta)
      .eq("modulo", `cte_emp_${digits}`);

    const cfgPorFazenda = new Map<string, Record<string, string>>();
    (existentes ?? []).forEach(e => cfgPorFazenda.set(e.fazenda_id, (e.config as Record<string, string>) ?? {}));
    const idsAlvo = new Set<string>([fazendaId, ...cfgPorFazenda.keys(), ...(cteRows ?? []).map(r => r.fazenda_id)]);

    for (const fid of idsAlvo) {
      const cfgAtual = cfgPorFazenda.get(fid) ?? {};
      await supabase
        .from("configuracoes_modulo")
        .upsert(
          {
            fazenda_id: fid,
            modulo: fiscalModulo,
            config: { ...cfgAtual, cert_a1_path: path, cert_a1_senha: senha },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fazenda_id,modulo" }
        );
    }
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
