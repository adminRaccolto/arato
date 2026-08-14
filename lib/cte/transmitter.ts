/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 *
 * Roteamento: pela UF do emitente (não por uf_ini/uf_fim do transporte).
 * SOAP direto via Node.js https.request (preferredRegion: gru1 = São Paulo, Brasil).
 * CA bundle ICP-Brasil hardcoded para verificação dos servidores SEFAZ.
 */

import https from "https";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PemPair } from "../nfe/signer";

// ─── CA Bundle ICP-Brasil para verificar servidores SEFAZ ────────────────────
// Contém: AC SOLUTI SSL EV G4 (usada pelo SEFAZ-MT) + AC Raiz v10 + AC Raiz v5
// Certificados públicos da ICP-Brasil — sem informações confidenciais.
export const ICP_BRASIL_CA_BUNDLE = `-----BEGIN CERTIFICATE-----
MIIHtDCCBZygAwIBAgIJANjGl6F55VD+MA0GCSqGSIb3DQEBDQUAMIGYMQswCQYD
VQQGEwJCUjETMBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRv
IE5hY2lvbmFsIGRlIFRlY25vbG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMG
A1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2
MTAwHhcNMjMwMzIyMTgwOTExWhcNMzIwNzAxMTIwMDU5WjB3MQswCQYDVQQGEwJC
UjETMBEGA1UEChMKSUNQLUJyYXNpbDE1MDMGA1UECxMsQXV0b3JpZGFkZSBDZXJ0
aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2MTAxHDAaBgNVBAMTE0FDIFNPTFVU
SSBTU0wgRVYgRzQwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDHv3Kv
oEPrNrzImIPn17GI5vdoVxghsm6EVLMUjnM4JdCpDED+0BqZF0kycyZaiWt7jqSR
vcGm66RKzSGcHJlUgahp9qcXAmSwMn00pwvgBKb+4htp48vQc1/5MWpaBzQW4Di/
tWvNkh9URtMyhtltf2u3s9r5vgF12ff7mCu3oj0bDBIaGs/a9EtMKoCfw/ziKUp7
11JYu1fbIWVOgbW9iHE24oiE33LGLm+uToCWpjGL3n9D+q+ryfIYFoes6gPCYYSt
udDUB9lfpe83IOVcVslL3DmYd2oEncGCogO3qzaMSH3OVLMO4Rg5edERpMw5U0tA
MeyO0k5/tmnFfUM476lZl+ce2Ol56p7R2yjKxHJizeCOSmwDE5FXz7ll+Zq9C7QW
UzoPQtyT739UGEeBRTAz4KsO77frCtdifGRvX3lMfI8qeMnfvf08BK9e2dRkCHwD
iv23Aw7QIixDS9PiSsMxObgjHwroEqAAN2Mwz1B1zAuzZVUH7k6MyQQ/II/GDUpT
jT4VKnhjdIfz5aEFHx7By2XjMkx1hyeONLS/2SoDnKitE9yY/PASqWDCPCpSoJ+x
fEdyZvoawEbJfL+CMhU5I7IXgf9f7gibghIc2CG4bf6dfVAdPcGkYkcjw21dtq/G
1V2dHpOX67BbihThAVr8Z7NTgVAv4nC6MPpAywIDAQABo4ICHzCCAhswggEHBgNV
HSAEgf8wgfwwQwYFYEwBAQAwOjA4BggrBgEFBQcCARYsaHR0cDovL2FjcmFpei5p
Y3BicmFzaWwuZ292LmJyL0RQQ2FjcmFpei5wZGYwUAYGYEwBAYECMEYwRAYIKwYB
BQUHAgEWOGh0dHA6Ly9jY2QuYWNzb2x1dGkuY29tLmJyL2RvY3MvZHBjLWFjLXNv
bHV0aS1zc2wtZXYucGRmMFAGBmBMAQIBcDBGMEQGCCsGAQUFBwIBFjhodHRwOi8v
Y2NkLmFjc29sdXRpLmNvbS5ici9kb2NzL2RwYy1hYy1zb2x1dGktc3NsLWV2LnBk
ZjAHBgVngQwBATAIBgZngQwBAgIwQAYDVR0fBDkwNzA1oDOgMYYvaHR0cDovL2Fj
cmFpei5pY3BicmFzaWwuZ292LmJyL0xDUmFjcmFpenYxMC5jcmwwHwYDVR0jBBgw
FoAUdPN+//yfU3rxfOurPqSm2hi6RWMwHQYDVR0OBBYEFP4GuSyVfi/m0Lio8S+3
8i6F1dfAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQW
MBQGCCsGAQUFBwMBBggrBgEFBQcDAjBMBggrBgEFBQcBAQRAMD4wPAYIKwYBBQUH
MAKGMGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9JQ1AtQnJhc2lsdjEw
LmNydDANBgkqhkiG9w0BAQ0FAAOCAgEAABxayeHitwL18QeXSQvRZ2eiNb82IlYT
uvER4JRMzZDWoamKOqmD7KXSSj+sdBThYiRkkNiVFiMn2qoYAdylI2I4w1npbxyr
ukfXQ7tadTEiMCFva0uHHw9lpBx+oyy9rcLM7qC5qquksyhC222Yt3WbqC6Fla+L
o3GlTOpogqexeyc9hgvAQxeMmq+xyDcjSLzKmmRmMKQ9y3w7wpufXTO/0K5uOLLZ
sfyXZTw+MYYeIk2+GNv1qQBbWo3gmwlD1W0pJEHe+/KxiCRkDHpJY7Lk2Rm4bSDZ
Rr4Bn8bk/XJWpiu7Fm9b8piPKjTtstDYTzu40ccPRh9UCWDUz4nKF97dXjIgYf+a
TA0vnKdlnpPUDeBVpfyXavhGf/akFh5AO7/v6xkzWOUlawn5g614mWhOQ6ITwmua
y1spnpBO684d0bynFQfMoZGS5fdKoYKKDzp29xhBm3s9WD1f/oP79Ie0eDribpOv
j3Xsjz72MTG4+UVxuv0OIYuXDc8x1foMzVOco6DxuLel6KG5RH+m0tWmX4ouCgBK
TNUQC70AWHBa4PCF5YA7H8qVnH2EUBPo3rxOY0wN6GzyMbg9+D9l5e2Xcg7/ytqY
BIBnZKLPjzS3OqUsM9UgUKGwcEnaHnmRxH8vyVEMGnoK1cZNf9uDM9sMGgQUzKwV
wixwyINOM8U=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIGrDCCBJSgAwIBAgIJANLVi0S/gZNCMA0GCSqGSIb3DQEBDQUAMIGYMQswCQYD
VQQGEwJCUjETMBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRv
IE5hY2lvbmFsIGRlIFRlY25vbG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMG
A1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2
MTAwHhcNMTkwNzAxMTkxNTU5WhcNMzIwNzAxMTIwMDU5WjCBmDELMAkGA1UEBhMC
QlIxEzARBgNVBAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBOYWNp
b25hbCBkZSBUZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNTAzBgNVBAMM
LEF1dG9yaWRhZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjEwMIIC
IjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAk3AxKl1ZtP0pNyjChqO7qNkn
+/sClZeqiV/Kd7KnnbkDbI2y3VWcUG7feCE/deIxot6GH6JXncRG794UZl+4doD0
D0/cEwBd4DvrDSZm0RT40xhmYYOTxZDJxv+coTHdmsT5aNmSkktfjzYX4HQHh/7M
em+kTOpT/3E4K6B7KVs9HkOT7nXx5yU1qYbVWqI0qpJM9mOTSFx8C9HiKcHvLCvt
1ioXKPAmFuHPkayOcXP2MXeb+VRNjWKU4E+L2t5uZPKVx1M/9i1DztlLb4K8OfYg
GaPDUSF1sxnoGk5qZHLleO6KjCpmuQepmgsBvxi2YNO7X2YUwQQx1AXNSolgtkAR
5gt+1WzxhbFUhItQqlhqxgWHefLmiT5T/Ctz/P2v+zSO4efkkIzsi1iwD+ypZvM2
lnIvB24RcSN6jzmCahLPX4CwjwIK6JsSoMVxIhpZHCguUP4LXqP8IWUZ6WgS/4zB
7B9E0EICl2rM1PRy+6ulv+ZOW256e8a0pijUB+hXM1msUq9L92476FAAX8va3sP7
+Uut94+bGHmubcTLImWUPrxNT7QyrvE3FyHicfiHioeFL2oV4cXTLZrEq2wS8R4P
KPdSzNn5Z9e2uMEGYQaSNO+OwvVycpIhOBOqrm12wJ9ZhWKtM5UOo34/o37r5ZBI
TYXAGbhqQDB9mWXwH+0CAwEAAaOB9jCB8zBOBgNVHSAERzBFMEMGBWBMAQEAMDow
OAYIKwYBBQUHAgEWLGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9EUENh
Y3JhaXoucGRmMEAGA1UdHwQ5MDcwNaAzoDGGL2h0dHA6Ly9hY3JhaXouaWNwYnJh
c2lsLmdvdi5ici9MQ1JhY3JhaXp2MTAuY3JsMB8GA1UdIwQYMBaAFHTzfv/8n1N6
8Xzrqz6kptoYukVjMB0GA1UdDgQWBBR0837//J9TevF866s+pKbaGLpFYzAPBgNV
HRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQ0FAAOCAgEA
eCNhBSuy/Ih/T+1VOtAJju85SrtoE3vET1qXASpmjQllDHG/ph7VFNRAkC+gha+B
CbjoA5oJ/8wwl+Qdp1KGz6nXXFTLx3osU+kjm0srmBf9nyXHPqvFyvBeB0A7sYb7
TmII9GKD20oCxsdkccR/oE/JuTaNnGq0GYZ2aDb5v62uLi21Y6P9UBiTxZqQ4ojW
ET6kXNjlK238jpXv17FR8Sg3VusCvX7Q8eJkavvHHZDeWck2fSA+ycAc2JeL2Z0B
MSxGWpH32WM9J8+6XqCJUXHiWEV0zCE8wDYiYC+047pTxQI/gB/FcU7jvylh98DJ
kQPHd/Tp6Og3ynlDA9n9uBbxYHVRZs9vsZ/7xTFaxRe+zk8dhgKgZ/3RrcMFB570
2t8LFbyuUE/kQVY6rZ0QJ9qMWQ7VPLRwRhiMeU3k8WDJb/tBbOXHBqldTbWyQ+mp
MEDWhbrzE/IED82wAuO23Tb05cYk2xC7+Izef8fSc3XdJDuPSbcDpWukzyCDtSEH
isLiGEtIbYRiPsF3czlQPsnIEVoTTCWxHCH1zYR6zScSv18Qh69qVe2J40K5jZoP
GEOhq/oKhVJQAdvAFW5Odp7mF3Tk9nivjjsctJSxY26LFiV5GRV+07SSse4ti0aO
jO5PLg5SWjfcOtBG2rz02EIvQAmLcb0kGBtfdj0lW/w=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIGoTCCBImgAwIBAgIBATANBgkqhkiG9w0BAQ0FADCBlzELMAkGA1UEBhMCQlIx
EzARBgNVBAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBOYWNpb25h
bCBkZSBUZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNDAyBgNVBAMMK0F1
dG9yaWRhZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjUwHhcNMTYw
MzAyMTMwMTM4WhcNMjkwMzAyMjM1OTM4WjCBlzELMAkGA1UEBhMCQlIxEzARBgNV
BAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBOYWNpb25hbCBkZSBU
ZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNDAyBgNVBAMMK0F1dG9yaWRh
ZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjUwggIiMA0GCSqGSIb3
DQEBAQUAA4ICDwAwggIKAoICAQD3LXgabUWsF+gUXw/6YODeF2XkqEyfk3VehdsI
x+3/ERgdjCS/ouxYR0Epi2hdoMUVJDNf3XQfjAWXJyCoTneHYAl2McMdvoqtLB2i
leQlJiis0fTtYTJayee9BAIdIrCor1Lc0vozXCpDtq5nTwhjIocaZtcuFsdrkl+n
bfYxl5m7vjTkTMS6j8ffjmFzbNPDlJuV3Vy7AzapPVJrMl6UHPXCHMYMzl0KxR/4
7S5XGgmLYkYt8bNCHA3fg07y+Gtvgu+SNhMPwWKIgwhYw+9vErOnavRhOimYo4M2
AwNpNK0OKLI7Im5V094jFp4Ty+mlmfQH00k8nkSUEN+1TGGkhv16c2hukbx9iCfb
mk7im2hGKjQA8eH64VPYoS2qdKbPbd3xDDHN2croYKpy2U2oQTVBSf9hC3o6fKo3
zp0U3dNiw7ZgWKS9UwP31Q0gwgB1orZgLuF+LIppHYwxcTG/AovNWa4sTPukMiX2
L+p7uIHExTZJJU4YoDacQh/mfbPIz3261He4YFmQ35sfw3eKHQSOLyiVfev/n0l/
r308PijEd+d+Hz5RmqIzS8jYXZIeJxym4mEjE1fKpeP56Ea52LlIJ8ZqsJ3xzHWu
3WkAVz4hMqrX6BPMGW2IxOuEUQyIaCBg1lI6QLiPMHvo2/J7gu4YfqRcH6i27W3H
yzamEQIDAQABo4H1MIHyME4GA1UdIARHMEUwQwYFYEwBAQAwOjA4BggrBgEFBQcC
ARYsaHR0cDovL2FjcmFpei5pY3BicmFzaWwuZ292LmJyL0RQQ2FjcmFpei5wZGYw
PwYDVR0fBDgwNjA0oDKgMIYuaHR0cDovL2FjcmFpei5pY3BicmFzaWwuZ292LmJy
L0xDUmFjcmFpenY1LmNybDAfBgNVHSMEGDAWgBRpqL512cTvbOcTReRhbuVo+LZA
XjAdBgNVHQ4EFgQUaai+ddnE72znE0XkYW7laPi2QF4wDwYDVR0TAQH/BAUwAwEB
/zAOBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQENBQADggIBABRt2/JiWapef7o/
plhR4PxymlMIp/JeZ5F0BZ1XafmYpl5g6pRokFrIRMFXLyEhlgo51I05InyCc9Td
6UXjlsOASTc/LRavyjB/8NcQjlRYDh6xf7OdP05mFcT/0+6bYRtNgsnUbr10pfsK
/UzyUvQWbumGS57hCZrAZOyd9MzukiF/azAa6JfoZk2nDkEudKOY8tRyTpMmDzN5
fufPSC3v7tSJUqTqo5z7roN/FmckRzGAYyz5XulbOc5/UsAT/tk+KP/clbbqd/hh
evmmdJclLr9qWZZcOgzuFU2YsgProtVu0fFNXGr6KK9fu44pOHajmMsTXK3X7r/P
wh19kFRow5F3RQMUZC6Re0YLfXh+ypnUSCzA+uL4JPtHIGyvkbWiulkustpOKUSV
wBPzvA2sQUOvqdbAR7C8jcHYFJMuK2HZFji7pxcWWab/NKsFcJ3sluDjmhizpQax
bYTfAVXu3q8yd0su/BHHhBpteyHvYyyz0Eb9LUysR2cMtWvfPU6vnoPgYvOGO1Cz
iyGEsgKULkCH4o2Vgl1gQuKWO4V68rFW8a/jvq28sbY+y/Ao0I5ohpnBcQOAawiF
bz6yJtObajYMuztDDP8oY656EuuJXBJhuKAJPI/7WDtgfV8ffOh/iQGQATVMtgDN
0gv8bn5NdUX8UMNX1sHhU3H1UpoW
-----END CERTIFICATE-----`;

// ─── Autorizadores por UF ─────────────────────────────────────────────────────
type Ambiente    = "producao" | "homologacao";
type Autorizador = "MT" | "MS" | "MG" | "PR" | "RS" | "SP" | "SVRS" | "SVSP";

const AUTORIZADOR_POR_UF: Record<string, Autorizador> = {
  MT: "MT", MS: "MS", MG: "MG", PR: "PR", RS: "RS", SP: "SP",
  // SVRS
  AC: "SVRS", AL: "SVRS", AM: "SVRS", BA: "SVRS", CE: "SVRS", DF: "SVRS",
  ES: "SVRS", GO: "SVRS", MA: "SVRS", PA: "SVRS", PB: "SVRS", PI: "SVRS",
  RJ: "SVRS", RN: "SVRS", RO: "SVRS", SC: "SVRS", SE: "SVRS", TO: "SVRS",
  // SVSP
  AP: "SVSP", PE: "SVSP", RR: "SVSP",
};

const ENDPOINTS: Record<Ambiente, Record<Autorizador, string>> = {
  producao: {
    MT:   "https://cte.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoSincV4",
    MS:   "https://producao.cte.ms.gov.br/ws/CTeRecepcaoSincV4",
    MG:   "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSincV4",
    PR:   "https://cte.fazenda.pr.gov.br/cte4/CTeRecepcaoSincV4",
    RS:   "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SP:   "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
    SVRS: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SVSP: "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
  },
  homologacao: {
    MT:   "https://homologacao.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoSincV4",
    MS:   "https://homologacao.cte.ms.gov.br/ws/CTeRecepcaoSincV4",
    MG:   "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSincV4",
    PR:   "https://homologacao.cte.fazenda.pr.gov.br/cte4/CTeRecepcaoSincV4",
    RS:   "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SP:   "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
    SVRS: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SVSP: "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
  },
};

function endpoint(ufEmitente: string, ambiente: Ambiente): string {
  const uf = ufEmitente.trim().toUpperCase();
  const autorizador = AUTORIZADOR_POR_UF[uf];
  if (!autorizador) throw new Error(`UF do emitente inválida ou não mapeada: "${uf}"`);
  const url = ENDPOINTS[ambiente][autorizador];
  console.log("[CT-e routing]", { ufEmitente: uf, ambiente, autorizador, endpoint: url });
  return url;
}

// ─── SOAP ─────────────────────────────────────────────────────────────────────
const SOAP_ACTION = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao";
const SOAP_NS     = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4";


// ─── Compactação e envelope CT-e 4.00 ────────────────────────────────────────
// cteDadosMsg = GZip/Base64 da área de dados.
// A SEFAZ-MT (cStat 402) exige que a declaração <?xml version="1.0" encoding="UTF-8"?>
// esteja PRESENTE dentro do GZip — sem ela, o parser detecta encoding incorreto.

function compactarCTeBase64(xmlAssinado: string): string {
  // Remove apenas BOM com escape Unicode explícito (mais robusto que literal no source)
  const semBom = xmlAssinado.replace(/^﻿/, "");

  // Normaliza (ou adiciona) a declaração XML com encoding="UTF-8".
  // xml-crypto serializa sem declaração; o SEFAZ-MT exige que ela esteja no GZip.
  let raizCom: string;
  if (/^<\?xml/i.test(semBom)) {
    // Já tem declaração — garante encoding="UTF-8" (maiúsculo, padrão SEFAZ)
    raizCom = semBom.replace(/^<\?xml[^?]*\?>/, '<?xml version="1.0" encoding="UTF-8"?>');
  } else {
    // Signer retornou sem declaração — insere antes de <CTe>
    raizCom = '<?xml version="1.0" encoding="UTF-8"?>\n' + semBom;
  }

  if (!raizCom.includes("<CTe")) {
    throw new Error(
      `XML inválido antes da compactação: ${JSON.stringify(raizCom.slice(0, 80))}`
    );
  }

  console.log("[CT-e GZip raiz]", raizCom.slice(0, 100));

  const naoAscii = [...new Set(
    Array.from(raizCom).filter(c => (c.codePointAt(0) ?? 0) > 127)
  )];
  if (naoAscii.length > 0) {
    console.warn("[CT-e caracteres não ASCII]", naoAscii.map(c => ({
      caractere: c,
      codigo: `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
    })));
  }

  const bytesUtf8 = Buffer.from(raizCom, "utf8");
  new TextDecoder("utf-8", { fatal: true }).decode(bytesUtf8);

  return gzipSync(bytesUtf8, { level: 9 }).toString("base64");
}

function envelopeCTe(xmlAssinado: string): string {
  const dadosBase64 = compactarCTeBase64(xmlAssinado);

  // Extrai cUF do XML para o cabeçalho SOAP (obrigatório na SEFAZ-MT CT-e 4.00)
  const cUFMatch = xmlAssinado.match(/<cUF>(\d+)<\/cUF>/);
  const cUF      = cUFMatch ? cUFMatch[1] : "51"; // fallback MT

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <cteCabecMsg xmlns="${SOAP_NS}">
      <cUF>${cUF}</cUF>
      <versaoDados>4.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="${SOAP_NS}">${dadosBase64}</cteDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

  console.log("[CT-e SOAP check]", {
    hasCteCabecMsg: envelope.includes("cteCabecMsg"),
    hasSoapHeader:  envelope.includes("soap12:Header"),
    cUF,
  });

  return envelope;
}

// ─── Relay via Supabase Edge Function (IP brasileiro) ────────────────────────
async function soapPostViaEdge(url: string, body: string, pem: PemPair): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_SEFAZ_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const edgeFnUrl   = `${supabaseUrl}/functions/v1/cte-transmit`;
  const edgeSecret  = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetch(edgeFnUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${edgeSecret}`,
      "x-region":      "sa-east-1",
    },
    body: JSON.stringify({
      endpoint:    url,
      soapBody:    body,
      certPem:     pem.certChain ?? pem.cert,
      keyPem:      pem.key,
      soapAction:  SOAP_ACTION,
      soapVersion: "1.2",
    }),
  });

  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 401 || text.toLowerCase().includes("unauthorized")) {
      throw new Error(
        "Edge Function: acesso negado (401). " +
        "Desabilite JWT verification no Supabase Dashboard → Edge Functions → cte-transmit → Settings " +
        "e configure EDGE_BEARER_SECRET nas Secrets da Edge Function e nas variáveis de ambiente da Vercel."
      );
    }
    throw new Error(`Edge Function retornou HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }

  const result = await resp.json() as {
    httpStatus?: number; body?: string; error?: string; errorCode?: string;
  };
  if (result.error) throw new Error(`Edge Function erro: ${result.error}`);

  const httpStatus = result.httpStatus ?? 0;
  const soapResp   = result.body ?? "";

  console.log(`[CT-e via Edge] → HTTP ${httpStatus}`);

  if (httpStatus === 0) {
    throw new Error("mTLS falhou na Edge Function (HTTP 0). Verifique os logs do Supabase.");
  }
  if (httpStatus !== 200) {
    console.log("[CT-e via Edge body]", soapResp.slice(0, 500));
    // Preserva status HTTP distinto de cStat para parseResposta discriminar
    return `__HTTP_${httpStatus}__${soapResp.slice(0, 300)}`;
  }
  return soapResp;
}

// ─── SOAP direto via https.request (Node.js, gru1 = São Paulo) ───────────────
// Usa CA bundle ICP-Brasil hardcoded para verificar o servidor SEFAZ.
// O IP de saída do Vercel gru1 é aceito pelo SEFAZ — sem bloqueio de firewall.
function soapPost(url: string, body: string, pem: PemPair): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuffer = Buffer.from(body, "utf8");

    const req = https.request({
      hostname: u.hostname,
      port:     443,
      path:     u.pathname + u.search,
      method:   "POST",
      headers: {
        "Content-Type":   `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
        "SOAPAction":     `"${SOAP_ACTION}"`,
        "Content-Length": bodyBuffer.length,
      },
      cert: pem.certChain ?? pem.cert,
      key:  pem.key,
      ca:   ICP_BRASIL_CA_BUNDLE,
      rejectUnauthorized: true,
    }, (res) => {
      const status = res.statusCode ?? 0;
      let data = "";

      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[CT-e SOAP] ${u.hostname} → HTTP ${status}`);
        if (status !== 200) console.log("[CT-e SOAP body]", data.slice(0, 500));
        resolve(status !== 200 ? `__HTTP_${status}__${data.slice(0, 300)}` : data);
      });
    });

    req.on("error", (err: NodeJS.ErrnoException) => reject(new Error(String(err))));
    req.end(bodyBuffer);
  });
}

// ─── Parser de resposta ───────────────────────────────────────────────────────
function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return m ? m[1] : "";
}

export interface RespostaCTe {
  sucesso:    boolean;
  cStat:      string | null;
  xMotivo:    string;
  errorCode?: string;
  httpStatus?: number;
  protocolo?: string;
  dhRecbto?:  string;
  chave?:     string;
  xmlProt?:   string;
}

function parseResposta(soapResp: string): RespostaCTe {
  // Sentinela __HTTP_NNN__ = erro HTTP (não é resposta SEFAZ com cStat)
  const httpErr = soapResp.match(/^__HTTP_(\d+)__([\s\S]*)/);
  if (httpErr) {
    const httpStatus = parseInt(httpErr[1]);
    const body = httpErr[2];
    const motivoHttp: Record<number, string> = {
      400: "Requisição rejeitada pelo servidor (HTTP 400). Verifique o formato do envelope SOAP e os headers.",
      403: "Acesso negado (HTTP 403). IP fora do Brasil ou CNPJ não habilitado no ambiente.",
      404: "Endpoint não encontrado (HTTP 404). Verifique a URL do webservice.",
      500: "Erro interno no servidor SEFAZ (HTTP 500).",
    };
    return {
      sucesso:   false,
      cStat:     null,
      errorCode: "SEFAZ_HTTP_ERROR",
      httpStatus,
      xMotivo:   motivoHttp[httpStatus] ?? `HTTP ${httpStatus}: ${body.slice(0, 200)}`,
    };
  }

  console.log("[CT-e SOAP response]", soapResp.slice(0, 2000));

  // SOAP Fault
  const faultMatch = soapResp.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    return { sucesso: false, cStat: null, errorCode: "SOAP_FAULT", xMotivo: `SOAP Fault: ${faultMatch[1].trim()}` };
  }

  const cStat    = tagVal(soapResp, "cStat");
  const xMotivo  = tagVal(soapResp, "xMotivo");
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto");
  const chave     = tagVal(soapResp, "chCTe");
  const xmlProtMatch = soapResp.match(/<cteProc[\s\S]*?<\/cteProc>/)
    ?? soapResp.match(/<protCTe[\s\S]*?<\/protCTe>/);
  const xmlProt = xmlProtMatch?.[0];

  if (!cStat) {
    return {
      sucesso: false, cStat: null, errorCode: "SEFAZ_UNEXPECTED_RESPONSE",
      xMotivo: `Resposta inesperada: ${soapResp.slice(0, 500)}`,
    };
  }

  return {
    sucesso:   cStat === "100",
    cStat,
    xMotivo,
    protocolo: protocolo || undefined,
    dhRecbto:  dhRecbto  || undefined,
    chave:     chave     || undefined,
    xmlProt,
  };
}

// ─── Transmissão ─────────────────────────────────────────────────────────────
export async function transmitirCTe(
  cteXmlAssinado: string,
  pem:            PemPair,
  uf:             string,
  ambiente:       Ambiente,
): Promise<RespostaCTe> {
  const ep       = endpoint(uf, ambiente);
  const soapBody = envelopeCTe(cteXmlAssinado);

  const resp = await soapPost(ep, soapBody, pem);

  return parseResposta(resp);
}
