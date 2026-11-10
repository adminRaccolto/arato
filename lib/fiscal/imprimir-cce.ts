// Impressão da Carta de Correção Eletrônica (DACCE): documento auxiliar do evento já aceito pela SEFAZ.
// Abre uma janela com o layout e chama a impressão (o usuário salva em PDF ou imprime).
import { X_COND_USO_CCE } from "../nfe/cce-condicao.ts";

export type NotaParaCce = {
  numero: string; serie?: string | null; data_emissao?: string | null; chave_acesso?: string | null;
  destinatario?: string | null; cnpj_destinatario?: string | null;
  dados_nf_json?: Record<string, unknown> | null;
};
export type CceParaImprimir = { sequencia: number; texto_correcao: string; protocolo_evento?: string | null; created_at: string };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtDoc = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(v ?? "");
};
const fmtChave = (c?: string | null) => String(c ?? "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const fmtDataHora = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR"); };

export function htmlCce(nota: NotaParaCce, cce: CceParaImprimir): string {
  const dj = (nota.dados_nf_json ?? {}) as Record<string, unknown>;
  const emitEnd = [dj.emit_endereco, dj.emit_numero, dj.emit_bairro].filter(Boolean).join(", ");
  const emitCid = [dj.emit_municipio, dj.emit_uf].filter(Boolean).join(" / ");
  const linha = (rot: string, val: unknown) => `<div class="c"><span>${esc(rot)}</span><b>${esc(val) || "—"}</b></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta de Correção ${esc(cce.sequencia)} — NF-e ${esc(nota.numero)}</title>
<style>
@page{size:A4 portrait;margin:14mm}
body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:11px;margin:0}
h1{font-size:15px;margin:0 0 2px}.sub{color:#555;font-size:10px;margin-bottom:10px}
.box{border:0.8px solid #444;border-radius:4px;padding:8px 10px;margin-bottom:8px}
.t{font-size:9px;font-weight:700;text-transform:uppercase;color:#444;margin-bottom:6px;letter-spacing:.04em}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px}.g2{grid-template-columns:2fr 1fr}
.c span{display:block;font-size:8.5px;color:#666;text-transform:uppercase}.c b{font-size:11px;font-weight:600}
.texto{white-space:pre-wrap;font-size:12px;line-height:1.5;min-height:80px}
.cond{font-size:9px;color:#444;line-height:1.4}.rod{font-size:8.5px;color:#888;margin-top:10px;text-align:right}
</style></head><body>
<h1>CARTA DE CORREÇÃO ELETRÔNICA</h1>
<div class="sub">Documento auxiliar do evento de Carta de Correção da NF-e (não substitui a NF-e)</div>
<div class="box"><div class="t">Emitente</div><div class="g g2">
${linha("Razão social", dj.emit_razao)}${linha("CNPJ / CPF", fmtDoc(dj.emit_cnpj))}
${linha("Endereço", emitEnd)}${linha("Inscrição estadual", dj.emit_ie)}
${linha("Município / UF", emitCid)}${linha("CEP", dj.emit_cep)}
</div></div>
<div class="box"><div class="t">NF-e corrigida</div><div class="g">
${linha("Número", nota.numero)}${linha("Série", nota.serie)}${linha("Data de emissão", fmtData(nota.data_emissao))}
</div><div class="c" style="margin-top:6px"><span>Chave de acesso</span><b>${esc(fmtChave(nota.chave_acesso))}</b></div></div>
<div class="box"><div class="t">Destinatário</div><div class="g g2">
${linha("Nome / razão social", nota.destinatario)}${linha("CNPJ / CPF", fmtDoc(nota.cnpj_destinatario))}
</div></div>
<div class="box"><div class="t">Evento</div><div class="g">
${linha("Sequência da correção", cce.sequencia)}${linha("Protocolo do evento", cce.protocolo_evento)}${linha("Data / hora do registro", fmtDataHora(cce.created_at))}
</div></div>
<div class="box"><div class="t">Correção</div><div class="texto">${esc(cce.texto_correcao)}</div></div>
<div class="box"><div class="t">Condições de uso</div><div class="cond">${esc(X_COND_USO_CCE)}</div></div>
<div class="rod">Impresso pelo Arato em ${esc(new Date().toLocaleString("pt-BR"))}</div>
</body></html>`;
}

export function imprimirCce(nota: NotaParaCce, cce: CceParaImprimir): void {
  const w = window.open("", "_blank");
  if (!w) { alert("O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo."); return; }
  w.document.open(); w.document.write(htmlCce(nota, cce)); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 300);
}
