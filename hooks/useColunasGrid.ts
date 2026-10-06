"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export type ColDef = {
  key: string;
  label: string;
  fixo?: boolean; // fixo = sempre visível, não pode ocultar
};

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
        const json = await r.json() as { config?: { visiveis?: Record<string, boolean>; ordem?: string[] } | null };
        if (cancelado) return;
        if (json.config) {
          setVisiveis({ ...defaultVis, ...(json.config.visiveis ?? {}) });
          const salva = json.config.ordem ?? [];
          const conhecidas = new Set(salva);
          setOrdemTodas([
            ...salva.filter(k => defaultOrder.includes(k)),
            ...defaultOrder.filter(k => !conhecidas.has(k)),
          ]);
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

  // Grava sempre que o layout muda (após carregar)
  useEffect(() => {
    if (!prontoRef.current) return;
    const t = setTimeout(async () => {
      try {
        const token = await tokenAtual();
        if (!token) return;
        await fetch("/api/preferencias-grid", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ grid, config: { visiveis, ordem: ordemTodas } }),
        });
      } catch {
        // falha de rede: o próximo ajuste grava de novo
      }
    }, 300);
    return () => clearTimeout(t);
  }, [visiveis, ordemTodas, grid]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  const col = (key: string) => visiveis[key] !== false;

  // ordem visível: apenas as que estão marcadas como visíveis
  const ordem = ordemTodas.filter(k => visiveis[k] !== false);

  return { visiveis, toggle, col, ordem, ordemTodas, moverColuna, resetar, colunas };
}
