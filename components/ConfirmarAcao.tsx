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
  const corBotao = pedido.perigo ? "#B91C1C" : "#111111";

  return (
    <div onClick={() => responder(false)} style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.35)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 440, padding: "20px 22px", boxShadow: "0 8px 32px rgba(11,45,80,0.25)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: pedido.perigo ? "#B91C1C" : "#0B2D50", marginBottom: 8 }}>{pedido.titulo}</div>
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5, whiteSpace: "pre-line" }}>{pedido.mensagem}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button autoFocus onClick={() => responder(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", color: "#333", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => responder(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: corBotao, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{pedido.textoConfirmar ?? (pedido.perigo ? "Excluir" : "Confirmar")}</button>
        </div>
      </div>
    </div>
  );
}
