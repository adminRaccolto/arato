"use client";
import { useState, useCallback, useEffect } from "react";

export type ColDef = {
  key: string;
  label: string;
  fixo?: boolean; // fixo = não pode esconder
};

export function useColunasGrid(storageKey: string, colunas: ColDef[]) {
  const defaults = Object.fromEntries(colunas.map(c => [c.key, true]));

  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(defaults);

  // Re-lê do localStorage quando storageKey muda (ex: emailUsuario carrega depois da auth)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setVisiveis({ ...defaults, ...JSON.parse(saved) });
      else setVisiveis(defaults);
    } catch {
      setVisiveis(defaults);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

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
