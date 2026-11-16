// Espelho no navegador: abre a janela já no clique (depois de um await o bloqueador de pop-up barra) e mostra nela o DANFE
// do espelho (PDF vindo de /api/fiscal/emitir-nfe com previa) ou a impressão em HTML (DACTE, DAMDFE) marcada como espelho.
// Quando o servidor recusa, o motivo é o mesmo que barraria a transmissão — a tela avisa e a janela fecha.
import { marcarHtmlEspelho } from "./espelho";

export type JanelaEspelho = { janela: Window | null; usada: boolean };

/** Abre a janela no clique e fecha se nada chegar a ser mostrado nela (validação local, erro, desistência). */
export async function comJanelaEspelho(fn: (j: JanelaEspelho) => Promise<unknown>): Promise<void> {
  const janela = window.open("", "_blank");
  try { janela?.document.write(`<title>Espelho</title><p style="font:14px Arial,sans-serif;padding:24px;color:#555">Gerando o espelho…</p>`); } catch { /* janela de outra origem */ }
  const j: JanelaEspelho = { janela, usada: false };
  try { await fn(j); } finally { if (!j.usada) janela?.close(); }
}

function avisarRecusa(motivo: string) {
  alert(`Espelho não gerado — a transmissão seria barrada pelo mesmo motivo:\n\n${motivo}`);
}

/** NF-e: manda o mesmo corpo da emissão com previa e abre o DANFE do espelho. */
export async function mostrarEspelhoNfe(corpo: Record<string, unknown>, j: JanelaEspelho): Promise<boolean> {
  const resp = await fetch("/api/fiscal/emitir-nfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, previa: true }) });
  if ((resp.headers.get("content-type") ?? "").includes("application/pdf")) {
    const url = URL.createObjectURL(await resp.blob());
    if (j.janela && !j.janela.closed) j.janela.location.href = url;
    else if (!window.open(url, "_blank")) { alert("O navegador bloqueou a janela do espelho. Libere pop-ups para este site."); return false; }
    j.usada = true;
    return true;
  }
  const r = await resp.json().catch(() => ({})) as { xMotivo?: string; erro?: string };
  avisarRecusa(r.xMotivo ?? r.erro ?? `Erro HTTP ${resp.status}`);
  return false;
}

/** CT-e / MDF-e: valida no servidor (mesma montagem da transmissão, com previa). Devolve o XML do espelho ou null. */
export async function validarEspelho(url: "/api/fiscal/emitir-cte" | "/api/fiscal/emitir-mdfe", corpo: Record<string, unknown>): Promise<{ xml: string; numero?: string; aviso?: string } | null> {
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, previa: true }) });
  const r = await resp.json().catch(() => ({})) as { sucesso?: boolean; xmlPrevia?: string; numero?: string; aviso?: string; xMotivo?: string; erro?: string };
  if (!r.sucesso || !r.xmlPrevia) { avisarRecusa(r.xMotivo ?? r.erro ?? `Erro HTTP ${resp.status}`); return null; }
  return { xml: r.xmlPrevia, numero: r.numero, aviso: r.aviso };
}

/** Mostra uma impressão em HTML marcada como espelho. */
export function mostrarHtmlEspelho(html: string, j: JanelaEspelho): void {
  const w = j.janela && !j.janela.closed ? j.janela : window.open("", "_blank");
  if (!w) { alert("O navegador bloqueou a janela do espelho. Libere pop-ups para este site."); return; }
  w.document.open();
  w.document.write(marcarHtmlEspelho(html));
  w.document.close();
  j.usada = true;
}
