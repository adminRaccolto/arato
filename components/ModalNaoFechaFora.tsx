"use client";
// Popups só fecham pelos botões (Cancelar, Fechar, Salvar) — nunca por clique no fundo escurecido.
// Um clique perdido fora da janela descartava o que estava sendo digitado. O bloqueio é global: intercepta,
// antes do React, cliques cujo alvo é o próprio fundo do modal; cliques dentro da janela seguem normais.
import { useEffect } from "react";
import { ehFundoDeModal } from "../lib/ui/fundo-modal";

export default function ModalNaoFechaFora() {
  useEffect(() => {
    const medidas = (el: HTMLElement) => {
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { position: cs.position, backgroundColor: cs.backgroundColor, width: r.width, height: r.height,
        vw: window.innerWidth, vh: window.innerHeight, temFilhos: el.childElementCount > 0 };
    };
    // Bloqueia quando o clique caiu no fundo do modal ou numa camada de tela cheia entre o fundo e a janela
    // (alguns modais centralizam a janela dentro de um contêiner transparente do tamanho da tela).
    const bloquear = (e: MouseEvent) => {
      let el = e.target instanceof HTMLElement ? e.target : null;
      while (el && el !== document.body) {
        const m = medidas(el);
        if (m.width < m.vw * 0.9 || m.height < m.vh * 0.9) return; // caiu dentro da janela
        if (ehFundoDeModal(m)) { e.stopPropagation(); return; }
        if (m.position !== "fixed" && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(m.backgroundColor)) return; // janela grande (fundo próprio)
        el = el.parentElement;
      }
    };
    const eventos = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "dblclick"] as const;
    for (const ev of eventos) window.addEventListener(ev, bloquear, true);
    return () => { for (const ev of eventos) window.removeEventListener(ev, bloquear, true); };
  }, []);
  return null;
}
