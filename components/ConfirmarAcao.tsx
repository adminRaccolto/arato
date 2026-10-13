"use client";
import { useEffect, useState } from "react";

/**
 * Confirmação do próprio sistema, usada antes de salvar, editar ou excluir.
 *   const ok = await confirmarAcao({ titulo, mensagem, perigo: true })
 * O diálogo fica montado uma vez no layout (ConfirmarAcaoHost). Retorna true só se o usuário confirmar.
 */
export type OpcoesConfirmacao = {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  perigo?: boolean;
};

type Pedido = OpcoesConfirmacao & { resolver: (ok: boolean) => void };

let ouvinte: ((p: Pedido) => void) | null = null;

export function confirmarAcao(opts: OpcoesConfirmacao): Promise<boolean> {
  return new Promise(resolve => {
    if (!ouvinte) { resolve(window.confirm(`${opts.titulo}\n\n${opts.mensagem}`)); return; }
    ouvinte({ ...opts, resolver: resolve });
  });
}

export default function ConfirmarAcaoHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    ouvinte = (p) => setPedido(p);
    return () => { ouvinte = null; };
  }, []);

  useEffect(() => {
    if (!pedido) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { pedido.resolver(false); setPedido(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pedido]);

  if (!pedido) return null;

  const responder = (ok: boolean) => { pedido.resolver(ok); setPedido(null); };
  const corBotao = pedido.perigo ? "#B91C1C" : "var(--c-primary)";

  return (
    <div data-arato-overlay="true" onClick={() => responder(false)} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div data-arato-dialog="confirmation" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 440, padding: "20px 22px", boxShadow: "var(--shadow-modal)", fontFamily: "inherit" }}>
        <div data-arato-dialog-body="true" style={{ fontSize: 15, fontWeight: 700, color: pedido.perigo ? "var(--status-danger-text)" : "var(--text-1)", marginBottom: 8 }}>{pedido.titulo}</div>
        <div data-arato-dialog-body="true" style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, whiteSpace: "pre-line" }}>{pedido.mensagem}</div>
        <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button data-arato-button="secondary" autoFocus onClick={() => responder(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-control)", background: "var(--bg-card)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button data-arato-button="secondary" onClick={() => responder(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: corBotao, color: pedido.perigo ? "#fff" : "var(--on-primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{pedido.textoConfirmar ?? (pedido.perigo ? "Excluir" : "Confirmar")}</button>
        </div>
      </div>
    </div>
  );
}
