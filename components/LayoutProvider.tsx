"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./AuthProvider";
import { DENSITY_KEY, LAYOUT_EVENT, LAYOUT_KEY, preferenceKey, validDensity, validLayout, type GridDensity, type LayoutMode } from "../lib/layout-preferences";

let identity: string | null = null;
export function applyLayout(layout: LayoutMode, density: GridDensity, persist = true) {
  const root = document.documentElement;
  root.dataset.layout = layout;
  root.dataset.gridDensity = density;
  if (persist) {
    try {
      for (const [key, value] of [[LAYOUT_KEY, layout], [DENSITY_KEY, density]]) {
        localStorage.setItem(key, value);
        localStorage.setItem(preferenceKey(identity, key), value);
      }
    } catch { /* A seleção permanece ativa mesmo sem armazenamento. */ }
  }
  window.dispatchEvent(new Event(LAYOUT_EVENT));
  window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}
function subscribe(listener: () => void) {
  window.addEventListener(LAYOUT_EVENT, listener);
  return () => window.removeEventListener(LAYOUT_EVENT, listener);
}
function snapshot() { const d = document.documentElement.dataset; return `${validLayout(d.layout)}|${validDensity(d.gridDensity)}`; }
export function useLayout() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "current|comfortable");
  const [mode, density] = value.split("|");
  return {
    mode: validLayout(mode), modern: mode === "new", density: validDensity(density),
    setMode: (next: LayoutMode) => applyLayout(next, validDensity(document.documentElement.dataset.gridDensity)),
    setDensity: (next: GridDensity) => applyLayout(validLayout(document.documentElement.dataset.layout), next),
  };
}
export default function LayoutProvider() {
  const { emailUsuario } = useAuth();
  useEffect(() => {
    identity = emailUsuario;
    if (!emailUsuario) return;
    try {
      const layout = validLayout(localStorage.getItem(preferenceKey(emailUsuario, LAYOUT_KEY))), density = validDensity(localStorage.getItem(preferenceKey(emailUsuario, DENSITY_KEY)));
      applyLayout(layout, density, false);
      localStorage.setItem(LAYOUT_KEY, layout); localStorage.setItem(DENSITY_KEY, density);
    } catch { /* */ }
  }, [emailUsuario]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      const keys = identity ? [preferenceKey(identity, LAYOUT_KEY), preferenceKey(identity, DENSITY_KEY)] : [LAYOUT_KEY, DENSITY_KEY];
      if (event.key && !keys.includes(event.key)) return;
      try { applyLayout(validLayout(localStorage.getItem(preferenceKey(identity, LAYOUT_KEY))), validDensity(localStorage.getItem(preferenceKey(identity, DENSITY_KEY))), false); } catch { /* */ }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return null;
}
