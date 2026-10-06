"use client";
import { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { supabase } from "../lib/supabase";

export type ColDef = {
  key: string;
  label: string;
  fixo?: boolean; // fixo = sempre visível, não pode ocultar
  largura?: number; // largura inicial em px (se o usuário ainda não redimensionou)
};

const LARGURA_MINIMA = 40;

async function tokenAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Visibilidade + ordem das colunas de um grid, guardadas POR USUÁRIO LOGADO no banco
 * (tabela preferencias_grid, via /api/preferencias-grid). Antes ficava no localStorage do
 * navegador, então o layout de um usuário aparecia para quem usasse o mesmo aparelho.
 *
 * Retorna:
 *   col(key)              → true se a coluna está visível
 *   toggle(key)           → alterna visibilidade
 *   ordem                 → array de chaves na ordem atual (só visíveis + fixas)
 *   ordemTodas            → array de chaves na ordem atual (todas, inclusive ocultas)
 *   moverColuna(from,to)  → reordena por índice em ordemTodas
 *   visiveis              → objeto { key: boolean }
 *   resetar()             → volta ao padrão
 */
export function useColunasGrid(grid: string, colunas: ColDef[]) {
  const defaultVis   = Object.fromEntries(colunas.map(c => [c.key, true]));
  const defaultOrder = colunas.map(c => c.key);

  const [visiveis,   setVisiveis]   = useState<Record<string, boolean>>(defaultVis);
  const [ordemTodas, setOrdemTodas] = useState<string[]>(defaultOrder);
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const largurasRef = useRef(larguras);
  largurasRef.current = larguras;
  // Só grava no servidor depois que o layout salvo do usuário foi carregado (senão um
  // render inicial com o padrão sobrescreveria o layout dele).
  const prontoRef = useRef(false);

  // Carrega o layout do usuário logado
  useEffect(() => {
    let cancelado = false;
    prontoRef.current = false;
    (async () => {
      try {
        const token = await tokenAtual();
        if (!token) return;
        const r = await fetch(`/api/preferencias-grid?grid=${encodeURIComponent(grid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await r.json() as { config?: { visiveis?: Record<string, boolean>; ordem?: string[]; larguras?: Record<string, number> } | null };
        if (cancelado) return;
        if (json.config) {
          setVisiveis({ ...defaultVis, ...(json.config.visiveis ?? {}) });
          const salva = json.config.ordem ?? [];
          const conhecidas = new Set(salva);
          setOrdemTodas([
            ...salva.filter(k => defaultOrder.includes(k)),
            ...defaultOrder.filter(k => !conhecidas.has(k)),
          ]);
          setLarguras(json.config.larguras ?? {});
        } else {
          setLarguras({});
        }
      } catch {
        // sem rede/sem tabela: mantém o padrão
      } finally {
        if (!cancelado) prontoRef.current = true;
      }
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // Grava sempre que o layout muda (após carregar). Se a tela for fechada antes do prazo, o
  // que estiver pendente é enviado ao desmontar — senão uma largura recém-ajustada se perderia.
  const pendenteRef = useRef<{ grid: string; config: Record<string, unknown> } | null>(null);
  const enviarPendente = useCallback(async () => {
    const p = pendenteRef.current;
    if (!p) return;
    pendenteRef.current = null;
    try {
      const token = await tokenAtual();
      if (!token) return;
      await fetch("/api/preferencias-grid", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(p),
        keepalive: true,
      });
    } catch {
      // falha de rede: o próximo ajuste grava de novo
    }
  }, []);

  useEffect(() => {
    if (!prontoRef.current) return;
    pendenteRef.current = { grid, config: { visiveis, ordem: ordemTodas, larguras } };
    const t = setTimeout(() => { enviarPendente(); }, 300);
    return () => clearTimeout(t);
  }, [visiveis, ordemTodas, larguras, grid, enviarPendente]);

  useEffect(() => () => { enviarPendente(); }, [enviarPendente]);

  // Redimensionar coluna arrastando a borda do cabeçalho (estilo Excel). Salva pelo usuário.
  const startResize = useCallback((key: string) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = largurasRef.current[key] ?? colunas.find(c => c.key === key)?.largura ?? 120;
    const onMove = (ev: MouseEvent) => {
      const nova = Math.max(LARGURA_MINIMA, startW + ev.clientX - startX);
      setLarguras(prev => ({ ...prev, [key]: nova }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colunas]);

  // Largura atual da coluna (px); undefined = automática
  const w = useCallback((key: string): number | undefined =>
    larguras[key] ?? colunas.find(c => c.key === key)?.largura, [larguras, colunas]);

  const toggle = useCallback((key: string) => {
    setVisiveis(prev => {
      // colunas fixas não podem ser ocultadas
      const col = colunas.find(c => c.key === key);
      if (col?.fixo) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colunas]);

  const moverColuna = useCallback((fromIdx: number, toIdx: number) => {
    setOrdemTodas(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const resetar = useCallback(() => {
    setVisiveis(defaultVis);
    setOrdemTodas(defaultOrder);
    setLarguras({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  const col = (key: string) => visiveis[key] !== false;

  // ordem visível: apenas as que estão marcadas como visíveis
  const ordem = ordemTodas.filter(k => visiveis[k] !== false);

  return { visiveis, toggle, col, ordem, ordemTodas, moverColuna, resetar, colunas, w, startResize };
}
