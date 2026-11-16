// Espelho de NF-e, CT-e e MDF-e (16/11/2026): o documento montado exatamente como iria para a SEFAZ, para conferência antes
// da transmissão. Sem valor fiscal: o número mostrado é o próximo da série, e a chave de acesso e o protocolo definitivos só
// existem depois de transmitir. Aqui ficam as partes puras (sem banco nem PDF): o XML que o gerador de DANFE aceita e a
// marca das impressões em HTML.

export const TEXTO_ESPELHO = "ESPELHO PARA CONFERÊNCIA — SEM VALOR FISCAL — NÃO TRANSMITIDO À SEFAZ";
export const AVISO_ESPELHO = "Número, chave de acesso e protocolo definitivos são gerados na transmissão.";

/** Envolve o XML da NF-e (sem assinatura) num nfeProc com protocolo vazio — o gerador de DANFE só lê nfeProc. */
export function nfeProcEspelho(xmlNFe: string): string {
  const nfe = xmlNFe.replace(/<\?xml[^>]*\?>\s*/i, "").trim();
  if (!/<NFe[\s>]/.test(nfe)) throw new Error("XML da NF-e inválido para o espelho.");
  const chave = nfe.match(/Id="NFe(\d{44})"/)?.[1] ?? "";
  const tpAmb = nfe.match(/<tpAmb>(\d)<\/tpAmb>/)?.[1] ?? "2";
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${nfe}`
    + `<protNFe versao="4.00"><infProt><tpAmb>${tpAmb}</tpAmb><chNFe>${chave}</chNFe><dhRecbto></dhRecbto><nProt></nProt>`
    + `<cStat></cStat><xMotivo>ESPELHO</xMotivo></infProt></protNFe></nfeProc>`;
}

/** Marca uma impressão em HTML (DACTE, DAMDFE) como espelho: faixa no topo e marca d'água em todas as páginas. */
export function marcarHtmlEspelho(html: string): string {
  const estilo = `<style>
.arato-espelho-faixa{position:relative;z-index:10;background:#FCEBEB;color:#791F1F;border:1px solid #E24B4A;font:700 10pt Arial,sans-serif;text-align:center;padding:5px 8px;margin-bottom:6px}
.arato-espelho-faixa small{display:block;font-weight:400;font-size:8pt}
.arato-espelho-marca{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font:700 64pt Arial,sans-serif;color:rgba(226,75,74,.16);white-space:nowrap;pointer-events:none;z-index:9;text-align:center;line-height:1.1}
.arato-espelho-marca span{display:block;font-size:30pt}
@media print{.arato-espelho-faixa,.arato-espelho-marca{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>`;
  const marca = `<div class="arato-espelho-faixa">${TEXTO_ESPELHO}<small>${AVISO_ESPELHO}</small></div>`
    + `<div class="arato-espelho-marca">ESPELHO<span>SEM VALOR FISCAL</span></div>`;
  let saida = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${estilo}</head>`) : estilo + html;
  saida = /<body[^>]*>/i.test(saida) ? saida.replace(/<body[^>]*>/i, m => m + marca) : marca + saida;
  // O título da janela (e o nome sugerido ao salvar em PDF) também diz que é espelho
  return saida.replace(/<title>([^<]*)<\/title>/i, (_m, t: string) => `<title>ESPELHO — ${t}</title>`);
}
