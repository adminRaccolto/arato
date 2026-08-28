"use client";
import { useState, useCallback, useEffect } from "react";

export type ColDef = {
  key: string;
  label: string;
  fixo?: boolean; // fixo = sempre visível, não pode ocultar
};

/**
 * Hook que gerencia visibilidade + ordem das colunas de um grid.
 * Persiste tudo no localStorage por chave de usuário.
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
export function useColunasGrid(storageKey: string, colunas: ColDef[]) {
  const defaultVis   = Object.fromEntries(colunas.map(c => [c.key, true]));
  const defaultOrder = colunas.map(c => c.key);

  const [visiveis,   setVisiveis]   = useState<Record<string, boolean>>(defaultVis);
  const [ordemTodas, setOrdemTodas] = useState<string[]>(defaultOrder);

  // Re-lê do localStorage quando storageKey muda
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedVis = localStorage.getItem(storageKey);
      if (savedVis) setVisiveis({ ...defaultVis, ...JSON.parse(savedVis) });
      else setVisiveis(defaultVis);

      const savedOrd = localStorage.getItem(storageKey + "_ordem");
      if (savedOrd) {
        const parsed: string[] = JSON.parse(savedOrd);
        // reconcilia: preserva ordem salva, appenda novas colunas no fim
        const known = new Set(parsed);
        const merged = [
          ...parsed.filter(k => defaultOrder.includes(k)),
          ...defaultOrder.filter(k => !known.has(k)),
        ];
        setOrdemTodas(merged);
      } else {
        setOrdemTodas(defaultOrder);
      }
    } catch {
      setVisiveis(defaultVis);
      setOrdemTodas(defaultOrder);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = useCallback((key: string) => {
    setVisiveis(prev => {
      // colunas fixas não podem ser ocultadas
      const col = colunas.find(c => c.key === key);
      if (col?.fixo) return prev;
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey, colunas]);

  const moverColuna = useCallback((fromIdx: number, toIdx: number) => {
    setOrdemTodas(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      localStorage.setItem(storageKey + "_ordem", JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const resetar = useCallback(() => {
    setVisiveis(defaultVis);
    setOrdemTodas(defaultOrder);
    localStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey + "_ordem");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const col = (key: string) => visiveis[key] !== false;

  // ordem visível: apenas as que estão marcadas como visíveis
  const ordem = ordemTodas.filter(k => visiveis[k] !== false);

  return { visiveis, toggle, col, ordem, ordemTodas, moverColuna, resetar, colunas };
}
