/**
 * POST /api/debug/cert-chain
 * Diagnóstico da cadeia de certificados do CT-e.
 * Retorna info pública do cert (subject, issuer, AIA) + numero de certs no PFX.
 * NÃO expõe chave privada nem senha.
 * Restrito a perfil raccotlo.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import forge from "node-forge";
import { resolverConfigCTe } from "../../../../lib/cte/config";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function carregarPfx(storagePath: string): Promise<Buffer> {
  const { data, error } = await sb().storage.from("certificados").download(storagePath);
  if (error || !data) throw new Error(`Certificado não encontrado: ${storagePath}`);
  return Buffer.from(await data.arrayBuffer());
}

function getAiaUrl(cert: forge.pki.Certificate): string | null {
  try {
    const ext = (cert.extensions ?? []).find((e: { id: string }) => e.id === "1.3.6.1.5.5.7.1.1");
    if (!ext) return null;
    const val: string = typeof ext.value === "string" ? ext.value : String(ext.value);
    const match = val.match(/https?:\/\/[^\s"'<>]+\.crt/i) ?? val.match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0] ?? null;
  } catch {
    return null;
  }
}

function certInfo(cert: forge.pki.Certificate) {
  const sub = (cert.subject?.attributes ?? []).map((a) => `${a.shortName ?? "?"}=${a.value}`).join(", ");
  const iss = (cert.issuer?.attributes  ?? []).map((a) => `${a.shortName ?? "?"}=${a.value}`).join(", ");
  const notAfter = cert.validity?.notAfter;
  const aia = getAiaUrl(cert);
  return { subject: sub, issuer: iss, validUntil: notAfter?.toISOString() ?? null, aiaUrl: aia };
}

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, emitente_cnpj } = await req.json() as {
      fazenda_id?: string;
      emitente_cnpj?: string | null;
    };

    if (!fazenda_id) {
      return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
    }

    const resolved = await resolverConfigCTe(fazenda_id, emitente_cnpj);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: "Configuração CT-e não encontrada" }, { status: 404 });
    }

    const confg = resolved.cteConfig;
    const fc    = resolved.fiscalConfig;
    const certPath  = confg.cert_a1_path  ?? fc.cert_a1_path;
    const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;

    if (!certPath || !certSenha) {
      return NextResponse.json({ ok: false, error: "Cert A1 ou senha não configurados" }, { status: 404 });
    }

    const pfxBuf = await carregarPfx(certPath);
    const bytes  = pfxBuf.toString("binary");
    const der    = forge.util.createBuffer(bytes, "raw");
    const asn1   = forge.asn1.fromDer(der);
    const p12    = forge.pkcs12.pkcs12FromAsn1(asn1, false, certSenha);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const certs    = certBags.map(bag => bag.cert!);
    const chainInfo = certs.map((c, i) => ({ index: i, ...certInfo(c) }));

    // Busca intermediária via AIA do cert folha (index 0)
    let aiaFetched: { url: string; subject: string; issuer: string; aiaUrl: string | null } | null = null;
    const leafAia = chainInfo[0]?.aiaUrl;
    if (leafAia) {
      try {
        const resp = await fetch(leafAia, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const derStr = Buffer.from(buf).toString("binary");
          // Tenta DER primeiro, depois PEM
          let intermCert: forge.pki.Certificate | null = null;
          try {
            intermCert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(derStr, "raw")));
          } catch {
            try {
              const pem = `-----BEGIN CERTIFICATE-----\n${forge.util.encode64(derStr)}\n-----END CERTIFICATE-----`;
              intermCert = forge.pki.certificateFromPem(pem);
            } catch { /* ignora */ }
          }
          if (intermCert) {
            aiaFetched = { url: leafAia, ...certInfo(intermCert) };
          }
        }
      } catch {
        // sem internet ou AIA fora do ar — só reporta
      }
    }

    return NextResponse.json({
      ok: true,
      certPath,
      certsNoPfx: certs.length,
      chainInfo,
      aiaFetched,
      diagnostico: certs.length === 1
        ? "PFX contém APENAS o cert folha — intermediárias devem vir do ICP_CLIENT_CHAIN_B64"
        : `PFX contém ${certs.length} certs (folha + ${certs.length - 1} intermediária(s)) — cadeia completa no PFX`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
