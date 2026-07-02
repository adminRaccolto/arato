"use client";
import { useState, useCallback } from "react";

export type ColDef = {
  key: string;
  label: string;
  fixo?: boolean; // fixo = não pode esconder
};

export function useColunasGrid(storageKey: string, colunas: ColDef[]) {
  const defaults = Object.fromEntries(colunas.map(c => [c.key, true]));

  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });

  const toggle = useCallback((key: string) => {
    setVisiveis(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const col = (key: string) => visiveis[key] !== false;

  return { visiveis, toggle, col, colunas };
}
