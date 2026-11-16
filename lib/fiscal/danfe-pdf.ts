// DANFE em PDF a partir do XML (nfe-danfe-pdf + pdfkit) — usado pelo DANFE da nota autorizada (/api/fiscal/danfe) e pelo
// espelho antes da transmissão (/api/fiscal/emitir-nfe com previa). Só no servidor (Node).
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AVISO_ESPELHO, TEXTO_ESPELHO } from "./espelho";

/**
 * dhEmi com o mesmo horário de parede da nota, mas no fuso de quem gera o PDF. O canhoto do nfe-danfe-pdf formata a
 * emissão no fuso do processo: no servidor (UTC) a nota de 16:46 (-04:00) saía "EMISSÃO: 20:46" (achado 16/11/2026,
 * NF 5/923 da Kuluene). A data (10 primeiros caracteres) continua a da nota. Só para desenhar o DANFE; o XML não muda.
 */
export function dhEmiNoFusoLocal(dh: string): string {
  const m = dh.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return dh;
  const [ano, mes, dia, h, mi, se] = m.slice(1).map(Number);
  const off = -new Date(ano, mes - 1, dia, h, mi, se).getTimezoneOffset();
  const p2 = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${m[0]}${off >= 0 ? "+" : "-"}${p2(Math.trunc(off / 60))}:${p2(off % 60)}`;
}

/** Gera o PDF do DANFE. `logo` é o Buffer da imagem (pdfkit aceita Buffer no lugar do caminho). */
export async function gerarDanfePdf(xml: string, opcoes: { cancelada?: boolean; logo?: Buffer } = {}): Promise<Buffer> {
  const { gerarPDF } = await import("nfe-danfe-pdf");
  const xmlDanfe = xml.replace(/<dhEmi>([^<]+)<\/dhEmi>/, (_t, dh: string) => `<dhEmi>${dhEmiNoFusoLocal(dh)}</dhEmi>`);
  const pdfDoc = await gerarPDF(xmlDanfe, {
    cancelada: !!opcoes.cancelada,
    ...(opcoes.logo ? { pathLogo: opcoes.logo as unknown as string } : {}),
  });
  // pdfkit em Node ≥18 emite "stream.push() after EOF" como erro depois do "end" — não é fatal; se já há dados, resolve.
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    let ended = false;
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => { ended = true; resolve(Buffer.concat(chunks)); });
    pdfDoc.on("error", (err: Error) => {
      if (ended) return;
      if (chunks.length > 0 && /push.*after EOF/i.test(err?.message ?? "")) resolve(Buffer.concat(chunks));
      else reject(err);
    });
    // O nfe-danfe-pdf já chama end(); chamar de novo fechava o arquivo duas vezes e o pdf-lib não conseguia ler o resultado
    if (!(pdfDoc as { _ended?: boolean })._ended) pdfDoc.end();
  });
}

/** Logo da conta pronta para o PDF. O PNG com transparência saía invisível no pdfkit (achado 08/10/2026): achata sobre
 *  fundo branco; falhando o achatamento, usa a imagem original. Sem logo (ou erro), undefined. */
export async function logoContaParaPdf(db: SupabaseClient, contaId: string | null | undefined): Promise<Buffer | undefined> {
  if (!contaId) return undefined;
  try {
    const { data: conta } = await db.from("contas").select("logo_url").eq("id", contaId).maybeSingle();
    if (!conta?.logo_url) return undefined;
    const imgRes = await fetch(conta.logo_url as string);
    if (!imgRes.ok) return undefined;
    const raw = Buffer.from(await imgRes.arrayBuffer());
    try {
      const sharp = (await import("sharp")).default;
      return await sharp(raw).flatten({ background: "#ffffff" }).png().toBuffer();
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

/** Marca o DANFE como espelho em todas as folhas: faixa vermelha no topo, marca d'água diagonal e o quadro da chave de
 *  acesso / protocolo coberto (a chave do espelho não é a que vai valer — cNF e número mudam na transmissão). */
export async function marcarPdfEspelho(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const vermelho = rgb(0.886, 0.294, 0.29);
  const escuro = rgb(0.475, 0.122, 0.122);
  doc.getPages().forEach((pagina, i) => {
    const { width, height } = pagina.getSize();
    // Marca d'água
    const t1 = "ESPELHO", t2 = "SEM VALOR FISCAL";
    pagina.drawText(t1, { x: width / 2 - negrito.widthOfTextAtSize(t1, 96) / 2 * Math.cos(Math.PI / 5) - 20, y: height / 2 - 60,
      size: 96, font: negrito, color: vermelho, opacity: 0.16, rotate: degrees(36) });
    pagina.drawText(t2, { x: width / 2 - negrito.widthOfTextAtSize(t2, 40) / 2 * Math.cos(Math.PI / 5) + 30, y: height / 2 - 120,
      size: 40, font: negrito, color: vermelho, opacity: 0.16, rotate: degrees(36) });
    // Faixa no topo: na 1ª folha cobre o canhoto (que não tem uso no espelho); nas demais só a margem, numa linha
    const faixa = i === 0 ? 26 : 12;
    pagina.drawRectangle({ x: 0, y: height - faixa, width, height: faixa, color: rgb(0.988, 0.922, 0.922), borderColor: vermelho, borderWidth: 0.8 });
    pagina.drawText(TEXTO_ESPELHO, { x: width / 2 - negrito.widthOfTextAtSize(TEXTO_ESPELHO, i === 0 ? 9 : 7) / 2, y: height - (i === 0 ? 12 : 9), size: i === 0 ? 9 : 7, font: negrito, color: escuro });
    if (i === 0) pagina.drawText(AVISO_ESPELHO, { x: width / 2 - normal.widthOfTextAtSize(AVISO_ESPELHO, 7) / 2, y: height - 22, size: 7, font: normal, color: escuro });
    // Quadro da chave de acesso e do protocolo (coordenadas do layout do nfe-danfe-pdf; 1ª folha tem o canhoto acima)
    const topo = i === 0 ? CHAVE_PRIMEIRA_FOLHA : CHAVE_DEMAIS_FOLHAS;
    pagina.drawRectangle({ x: topo.x, y: height - topo.yBase, width: topo.largura, height: topo.altura, color: rgb(1, 1, 1), borderColor: vermelho, borderWidth: 0.8 });
    const c1 = "ESPELHO — NÃO TRANSMITIDO", c2 = "Chave de acesso e protocolo são gerados na transmissão";
    pagina.drawText(c1, { x: topo.x + topo.largura / 2 - negrito.widthOfTextAtSize(c1, 10) / 2, y: height - topo.yBase + topo.altura / 2 + 2, size: 10, font: negrito, color: escuro });
    pagina.drawText(c2, { x: topo.x + topo.largura / 2 - normal.widthOfTextAtSize(c2, 7) / 2, y: height - topo.yBase + topo.altura / 2 - 10, size: 7, font: normal, color: escuro });
  });
  return await doc.save();
}

// Retângulo (em pontos, origem no topo) que cobre código de barras + chave de acesso. Calibrado renderizando um DANFE real.
const CHAVE_PRIMEIRA_FOLHA = { x: 345, yBase: 151, largura: 242, altura: 88 };
const CHAVE_DEMAIS_FOLHAS = { x: 345, yBase: 107, largura: 242, altura: 88 };
