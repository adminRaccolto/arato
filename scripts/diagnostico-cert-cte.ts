/**
 * Diagnóstico da cadeia de certificado A1 do CT-e.
 * Lê o cert do Supabase Storage via .env.local e exibe:
 *  - Quantos certs estão dentro do PFX
 *  - Subject / Issuer de cada um
 *  - AIA URL (onde buscar o intermediário)
 *  - Se o intermediário foi buscado com sucesso via AIA
 *  - O PEM correto para setar como ICP_CLIENT_CHAIN_B64
 *
 * Uso:
 *   FAZENDA_ID=xxx EMITENTE_CNPJ=yyy npx tsx scripts/diagnostico-cert-cte.ts
 *
 * Variáveis de ambiente lidas de .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import forge from "node-forge";
import * as fs from "fs";
import * as path from "path";

// ── Carrega .env.local ────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FAZENDA_ID   = process.env.FAZENDA_ID ?? "";
const CNPJ         = process.env.EMITENTE_CNPJ ?? null;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados em .env.local");
  process.exit(1);
}
if (!FAZENDA_ID) {
  console.error("❌ Defina FAZENDA_ID= na linha de comando");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function attrStr(attrs: Array<{ shortName: string; value: string }>) {
  return attrs.map(a => `${a.shortName}=${a.value}`).join(", ");
}

function getAia(cert: forge.pki.Certificate): string | null {
  try {
    const ext = (cert.extensions ?? []).find(
      (e: { id: string }) => e.id === "1.3.6.1.5.5.7.1.1"
    );
    if (!ext) return null;
    const s = String(ext.value ?? "");
    const m = s.match(/https?:\/\/[^\s"'<>]+\.crt/i) ?? s.match(/https?:\/\/[^\s"'<>]+/i);
    return m?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchCertFromAia(url: string): Promise<forge.pki.Certificate | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const raw = Buffer.from(buf).toString("binary");
    // tenta DER
    try {
      return forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(forge.util.createBuffer(raw, "raw"))
      );
    } catch {
      // tenta PEM
      try {
        const pem = `-----BEGIN CERTIFICATE-----\n${forge.util.encode64(raw)}\n-----END CERTIFICATE-----`;
        return forge.pki.certificateFromPem(pem);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function main() {
  // ── 1. Busca config CT-e / Fiscal ─────────────────────────────────────────
  console.log(`\n🔍 Buscando config para fazenda_id=${FAZENDA_ID} cnpj=${CNPJ ?? "qualquer"}`);

  const [{ data: cteRows }, { data: fiscalRows }] = await Promise.all([
    sb.from("configuracoes_modulo").select("config").eq("fazenda_id", FAZENDA_ID).eq("modulo", "cte"),
    sb.from("configuracoes_modulo").select("config").eq("fazenda_id", FAZENDA_ID).eq("modulo", "fiscal"),
  ]);

  const cteConf   = (cteRows?.[0]?.config ?? {}) as Record<string, string>;
  const fiscalConf = (fiscalRows?.[0]?.config ?? {}) as Record<string, string>;

  const certPath  = cteConf.cert_a1_path  ?? fiscalConf.cert_a1_path;
  const certSenha = cteConf.cert_a1_senha ?? fiscalConf.cert_a1_senha;

  if (!certPath || !certSenha) {
    console.error("❌ cert_a1_path ou cert_a1_senha não configurados em configuracoes_modulo");
    process.exit(1);
  }

  console.log(`   cert_a1_path: ${certPath}`);
  console.log(`   senha: ${"*".repeat(certSenha.length)}`);

  // ── 2. Baixa PFX do Storage ───────────────────────────────────────────────
  console.log("\n📥 Baixando PFX do Supabase Storage…");
  const { data, error } = await sb.storage.from("certificados").download(certPath);
  if (error || !data) {
    console.error("❌ Erro ao baixar cert:", error?.message ?? "sem dados");
    process.exit(1);
  }
  const pfxBuf = Buffer.from(await data.arrayBuffer());
  console.log(`   ${pfxBuf.length} bytes recebidos`);

  // ── 3. Parse do PFX ───────────────────────────────────────────────────────
  console.log("\n🔐 Abrindo PFX…");
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const bytes = pfxBuf.toString("binary");
    const der   = forge.util.createBuffer(bytes, "raw");
    const asn1  = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, certSenha);
  } catch (e) {
    console.error("❌ Falha ao abrir PFX:", String(e));
    console.error("   Verifique se a senha em configuracoes_modulo está correta");
    process.exit(1);
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certs    = certBags.map(b => b.cert!);

  console.log(`\n📋 Certs dentro do PFX: ${certs.length}`);
  if (certs.length === 1) {
    console.log("   ⚠️  PFX contém APENAS o cert folha — intermediárias precisam vir de ICP_CLIENT_CHAIN_B64");
  } else {
    console.log(`   ✅ PFX contém ${certs.length} certs (folha + ${certs.length - 1} intermediária(s))`);
  }

  // ── 4. Exibe cada cert ────────────────────────────────────────────────────
  const intermediariasPem: string[] = [];

  for (let i = 0; i < certs.length; i++) {
    const c = certs[i];
    const sub  = attrStr(c.subject.attributes);
    const iss  = attrStr(c.issuer.attributes);
    const aia  = getAia(c);
    const vali = c.validity.notAfter.toISOString().slice(0, 10);

    console.log(`\n  [${i}] ${i === 0 ? "FOLHA" : "INTERMEDIÁRIA"}`);
    console.log(`      Subject:  ${sub}`);
    console.log(`      Issuer:   ${iss}`);
    console.log(`      Válido até: ${vali}`);
    console.log(`      AIA URL:  ${aia ?? "(não encontrada)"}`);

    if (i > 0) {
      intermediariasPem.push(forge.pki.certificateToPem(c));
    }
  }

  // ── 5. Se PFX tem só folha → busca intermediária via AIA ─────────────────
  if (certs.length === 1) {
    const leafAia = getAia(certs[0]);
    if (leafAia) {
      console.log(`\n🌐 Buscando intermediária via AIA: ${leafAia}`);
      const interm = await fetchCertFromAia(leafAia);
      if (interm) {
        const sub = attrStr(interm.subject.attributes);
        const iss = attrStr(interm.issuer.attributes);
        const aia2 = getAia(interm);
        console.log(`   ✅ Encontrada!`);
        console.log(`      Subject: ${sub}`);
        console.log(`      Issuer:  ${iss}`);
        console.log(`      AIA:     ${aia2 ?? "(sem AIA — provavelmente raiz)"}`);

        const intermPem = forge.pki.certificateToPem(interm);
        intermediariasPem.push(intermPem);

        // Tenta buscar mais um nível se houver AIA
        if (aia2) {
          console.log(`\n🌐 Buscando próxima intermediária: ${aia2}`);
          const interm2 = await fetchCertFromAia(aia2);
          if (interm2) {
            const sub2 = attrStr(interm2.subject.attributes);
            const iss2 = attrStr(interm2.issuer.attributes);
            console.log(`   ✅ Encontrada!`);
            console.log(`      Subject: ${sub2}`);
            console.log(`      Issuer:  ${iss2}`);
            const aia3 = getAia(interm2);
            if (aia3) {
              console.log(`      (AIA: ${aia3} — raiz, não é necessário baixar)`);
            }
            intermediariasPem.push(forge.pki.certificateToPem(interm2));
          }
        }
      } else {
        console.log("   ❌ Não foi possível buscar a intermediária via AIA");
      }
    } else {
      console.log("\n⚠️  AIA URL não encontrada no cert folha — não é possível auto-detectar intermediária");
      console.log("   Identifique manualmente qual AC emitiu o certificado e baixe o cert da intermediária");
    }
  }

  // ── 6. Resultado: o que botar no ICP_CLIENT_CHAIN_B64 ────────────────────
  console.log("\n" + "═".repeat(70));
  if (intermediariasPem.length === 0) {
    console.log("⚠️  Nenhuma intermediária encontrada.");
    console.log("   O PFX provavelmente já inclui a cadeia completa, ou a AC não foi identificada.");
    console.log("   Se o connection_reset persistir, verifique se o ambiente de homologação");
    console.log("   da SEFAZ-MT exige mTLS com certificado ICP-Brasil.");
  } else {
    const chainPem   = intermediariasPem.join("\n");
    const chainB64   = Buffer.from(chainPem).toString("base64");
    const tmpFile    = "/tmp/icp_client_chain.pem";
    fs.writeFileSync(tmpFile, chainPem);

    console.log(`\n✅ Intermediárias encontradas (${intermediariasPem.length} cert(s))`);
    console.log(`   PEM salvo em: ${tmpFile}`);
    console.log("\n📋 Execute para atualizar o secret do Supabase:");
    console.log(`\n   supabase secrets set ICP_CLIENT_CHAIN_B64="${chainB64}" --project-ref ptbougxydvxxdlhywhps`);
    console.log("\n   OU via base64 do arquivo:");
    console.log(`   base64 -i ${tmpFile} | tr -d '\\n' | xargs -I{} supabase secrets set ICP_CLIENT_CHAIN_B64="{}" --project-ref ptbougxydvxxdlhywhps`);
  }

  console.log("\n" + "═".repeat(70));
}

main().catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
