/**
 * POST /api/fiscal/status-sefaz
 * Diagnóstico: consulta CTeStatusServicoV4 na SEFAZ-MT (homologação ou produção).
 * Útil para isolar problema de TLS/rede antes de tentar emitir CT-e.
 * Usa SOAP direto (Node.js https) sem passar pelo Supabase Edge Function.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import { pfxParaPem } from "../../../../lib/nfe/signer";
import { resolverConfigCTe } from "../../../../lib/cte/config";
import { ICP_BRASIL_CA_BUNDLE } from "../../../../lib/cte/transmitter";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

const SOAP_NS  = "http://www.portalfiscal.inf.br/cte/wsdl/CTeStatusServicoV4";
const ACTION   = `${SOAP_NS}/cteStatusServicoCT`;

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
        <xServ>STATUS</xServ>
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
    const { fazenda_id, emitente_cnpj } = await req.json() as { fazenda_id?: string; emitente_cnpj?: string | null };
    console.log("[status-sefaz] iniciando diagnóstico", { fazenda_id: fazenda_id ?? "sem_fazenda", emitente_cnpj: emitente_cnpj ?? null });
    if (!fazenda_id) {
      return NextResponse.json({
        ok: false,
        diagnostico: "fazenda_nao_informada",
        detalhe: "Informe a fazenda para localizar o emitente e o certificado A1.",
        elapsed_ms: Date.now() - t0,
      }, { status: 400 });
    }

    let certPem: string | undefined;
    let keyPem:  string | undefined;
    let ambiente: string = "homologacao";
    let cteModulo: string | undefined;
    let fiscalModulo: string | undefined;

    const resolved = await resolverConfigCTe(fazenda_id, emitente_cnpj);
    if (!resolved) {
      return NextResponse.json({
        ok: false,
        diagnostico: "configuracao_cte_nao_encontrada",
        detalhe: "Nenhuma configuração CT-e encontrada para o emitente selecionado.",
        elapsed_ms: Date.now() - t0,
      });
    }

    const confg = resolved.cteConfig;
    const fc    = resolved.fiscalConfig;
    cteModulo = resolved.cteModulo;
    fiscalModulo = resolved.fiscalModulo;
    const certPath  = confg.cert_a1_path  ?? fc.cert_a1_path;
    const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
    ambiente = (confg.ambiente ?? "homologacao") as typeof ambiente;

    if (!certPath || !certSenha) {
      return NextResponse.json({
        ok: false,
        diagnostico: "certificado_nao_configurado",
        detalhe: "Certificado A1 ou senha não encontrados para o emitente selecionado. Verifique Fiscal → Certificado Digital.",
        elapsed_ms: Date.now() - t0,
        certCarregado: false,
        cteModulo,
        fiscalModulo,
      });
    }

    const pfx = await carregarPfx(certPath);
    const pem = pfxParaPem(pfx, certSenha);
    certPem = pem.certChain ?? pem.cert;
    keyPem  = pem.key;

    const endpointUrl = ENDPOINTS[ambiente as keyof typeof ENDPOINTS] ?? ENDPOINTS.homologacao;
    const tpAmb       = ambiente === "producao" ? "1" : "2";
    const soapBody    = buildStatusSoap(tpAmb);

    // SOAP direto via Node.js https — sem relay Supabase Edge Function.
    // preferredRegion: ["gru1"] garante IP brasileiro (São Paulo) aceito pela SEFAZ.
    const soapResp = await new Promise<string>((resolve, reject) => {
      const u = new URL(endpointUrl);
      const req = https.request({
        hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
        headers: {
          "Content-Type":   `application/soap+xml;charset=UTF-8;action="${ACTION}"`,
          "SOAPAction":     `"${ACTION}"`,
          "Content-Length": Buffer.byteLength(soapBody, "utf8"),
        },
        cert: certPem,
        key:  keyPem,
        ca:   ICP_BRASIL_CA_BUNDLE,
        timeout: 30_000,
      }, (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end",  () => resolve(data));
      });
      req.on("error",   (err) => reject(err));
      req.on("timeout", ()    => { req.destroy(); reject(new Error("timeout — SEFAZ não respondeu em 30s")); });
      req.write(soapBody);
      req.end();
    });

    const elapsed = Date.now() - t0;

    const cStat    = soapResp.match(/<cStat>(\d+)<\/cStat>/)?.[1] ?? null;
    const xMotivo  = soapResp.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] ?? null;
    const dhRecbto = soapResp.match(/<dhRecbto>([^<]+)<\/dhRecbto>/)?.[1] ?? null;

    console.log("[status-sefaz]", { cStat, xMotivo, elapsed_ms: elapsed, ambiente });

    return NextResponse.json({
      ok:            cStat === "107",
      httpStatus:    200,
      cStat,
      xMotivo,
      dhRecbto,
      elapsed_ms:    elapsed,
      certCarregado: true,
      ambiente,
      endpoint:      endpointUrl,
      cteModulo,
      fiscalModulo,
      diagnostico: cStat === "107"
        ? "SEFAZ em operação — mTLS e rede OK ✓"
        : cStat
          ? `SEFAZ respondeu cStat ${cStat} — mTLS OK mas serviço fora do ar`
          : "Sem cStat — resposta SOAP inesperada",
      soapRespPreview: soapResp.slice(0, 600),
    });
  } catch (err) {
    const msg = String(err);
    const eLower = msg.toLowerCase();
    let diagnostico = "erro_interno";
    if (eLower.includes("connection reset") || eLower.includes("reset by peer"))
      diagnostico = "connection_reset — falha de mTLS ou IP bloqueado";
    else if (eLower.includes("timeout"))
      diagnostico = "timeout — SEFAZ não respondeu";
    else if (eLower.includes("unknown") && eLower.includes("issuer"))
      diagnostico = "tls_unknown_issuer — CA bundle incorreto";
    else if (eLower.includes("expired"))
      diagnostico = "certificado_expirado";

    console.error("[status-sefaz] erro:", msg);
    return NextResponse.json({
      ok: false,
      diagnostico,
      detalhe: msg,
      elapsed_ms: Date.now() - t0,
    }, { status: 500 });
  }
}
