/**
 * POST /api/fiscal/status-sefaz
 * Diagnóstico: consulta CTeStatusServicoV4 na SEFAZ-MT (homologação ou produção).
 * Útil para isolar problema de TLS/rede antes de tentar emitir CT-e.
 * Não requer CT-e; apenas testa se a camada mTLS está funcionando.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pfxParaPem } from "../../../../lib/nfe/signer";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

const SOAP_NS  = "http://www.portalfiscal.inf.br/cte/wsdl/CTeStatusServicoV4";
const ACTION   = `${SOAP_NS}/cteStatusServico`;

const ENDPOINTS = {
  homologacao: "https://homologacao.sefaz.mt.gov.br/ctews2/services/CTeStatusServicoV4",
  producao:    "https://cte.sefaz.mt.gov.br/ctews2/services/CTeStatusServicoV4",
};

function buildStatusSoap(tpAmb: "1" | "2"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
  xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Header>
    <cteCabecMsg xmlns="${SOAP_NS}">
      <cUF>51</cUF>
      <versaoDados>4.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="${SOAP_NS}">
      <consStatServCTe versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
        <tpAmb>${tpAmb}</tpAmb>
        <cUF>51</cUF>
      </consStatServCTe>
    </cteDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

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

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { fazenda_id } = await req.json() as { fazenda_id?: string };
    console.log("[status-sefaz] iniciando diagnóstico", { fazenda_id: fazenda_id ?? "sem_fazenda" });

    let certPem: string | undefined;
    let keyPem:  string | undefined;
    let ambiente: string = "homologacao";

    // Carrega cert se fazenda_id fornecido
    if (fazenda_id) {
      const { data: cteRow } = await sb()
        .from("configuracoes_modulo").select("config")
        .eq("fazenda_id", fazenda_id).eq("modulo", "cte").single();
      const { data: fiscalRow } = await sb()
        .from("configuracoes_modulo").select("config")
        .eq("fazenda_id", fazenda_id).eq("modulo", "fiscal").single();

      const confg = (cteRow?.config ?? {}) as Record<string, string>;
      const fc    = (fiscalRow?.config ?? {}) as Record<string, string>;
      const certPath  = confg.cert_a1_path  ?? fc.cert_a1_path;
      const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
      ambiente = (confg.ambiente ?? "homologacao") as typeof ambiente;

      if (certPath && certSenha) {
        const pfx = await carregarPfx(certPath);
        const pem = pfxParaPem(pfx, certSenha);
        certPem = pem.certChain ?? pem.cert;
        keyPem  = pem.key;
      }
    }

    const endpoint = ENDPOINTS[ambiente as keyof typeof ENDPOINTS] ?? ENDPOINTS.homologacao;
    const tpAmb    = ambiente === "producao" ? "1" : "2";
    const soapBody = buildStatusSoap(tpAmb);

    // Chama via Edge Function (mesmo relay usado pelo CT-e)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const edgeSecret  = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const edgeFnUrl   = `${supabaseUrl}/functions/v1/cte-transmit`;

    const edgeResp = await fetch(edgeFnUrl, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${edgeSecret}`,
      },
      body: JSON.stringify({
        endpoint,
        soapBody,
        certPem:    certPem ?? "",
        keyPem:     keyPem  ?? "",
        soapAction: ACTION,
      }),
    });

    const elapsed = Date.now() - t0;

    if (!edgeResp.ok && !edgeResp.headers.get("content-type")?.includes("json")) {
      const text = await edgeResp.text();
      return NextResponse.json({
        ok: false,
        diagnostico: "edge_function_erro",
        detalhe: `Edge Function retornou HTTP ${edgeResp.status}: ${text.slice(0, 300)}`,
        elapsed_ms: elapsed,
      });
    }

    const edgeResult = await edgeResp.json() as { httpStatus?: number; body?: string; error?: string };

    if (edgeResult.error) {
      // Classifica o tipo de erro para facilitar diagnóstico
      const e = edgeResult.error;
      let diagnostico = "transporte_desconhecido";
      if (e.includes("Connection reset") || e.includes("connection error"))
        diagnostico = "connection_reset — provável falha de mTLS ou IP bloqueado";
      else if (e.includes("timeout") || e.includes("timed out"))
        diagnostico = "timeout — SEFAZ não respondeu em 45s";
      else if (e.includes("UnknownIssuer") || e.includes("unknown issuer"))
        diagnostico = "tls_unknown_issuer — ICP_BRASIL_CA_BUNDLE_B64 incorreto";
      else if (e.includes("CertificateExpired"))
        diagnostico = "certificado_expirado";

      return NextResponse.json({
        ok: false,
        diagnostico,
        detalhe: e,
        httpStatus: edgeResult.httpStatus ?? 0,
        elapsed_ms: elapsed,
        certCarregado: !!certPem,
      });
    }

    const soapResp = edgeResult.body ?? "";
    // Extrai cStat e xMotivo da resposta de status
    const cStat   = soapResp.match(/<cStat>(\d+)<\/cStat>/)?.[1] ?? null;
    const xMotivo = soapResp.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] ?? null;
    const dhRecbto = soapResp.match(/<dhRecbto>([^<]+)<\/dhRecbto>/)?.[1] ?? null;

    return NextResponse.json({
      ok:           edgeResult.httpStatus === 200 && cStat === "107",
      httpStatus:   edgeResult.httpStatus,
      cStat,
      xMotivo,
      dhRecbto,
      elapsed_ms:   elapsed,
      certCarregado: !!certPem,
      ambiente,
      endpoint,
      diagnostico: cStat === "107"
        ? "SEFAZ em operação — mTLS e rede OK ✓"
        : cStat
          ? `SEFAZ respondeu cStat ${cStat} — mTLS OK mas serviço fora do ar`
          : "Sem cStat — resposta SOAP inesperada",
      soapRespPreview: soapResp.slice(0, 600),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      diagnostico: "erro_interno",
      detalhe: String(err),
      elapsed_ms: Date.now() - t0,
    }, { status: 500 });
  }
}
