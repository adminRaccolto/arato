"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./AuthProvider";
import { DENSITY_KEY, LAYOUT_CHOICE_KEY, LAYOUT_EVENT, LAYOUT_KEY, preferenceKey, savedLayout, validDensity, validLayout, type GridDensity, type LayoutMode } from "../lib/layout-preferences";

let identity: string | null = null;
export function applyLayout(layout: LayoutMode, density: GridDensity, persist = true, explicitChoice = false) {
  const root = document.documentElement;
  root.dataset.layout = layout;
  root.dataset.gridDensity = density;
  if (persist) {
    try {
      if (explicitChoice) {
        localStorage.setItem(LAYOUT_CHOICE_KEY, layout);
        localStorage.setItem(preferenceKey(identity, LAYOUT_CHOICE_KEY), layout);
      }
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
    setMode: (next: LayoutMode) => applyLayout(next, validDensity(document.documentElement.dataset.gridDensity), true, true),
    setDensity: (next: GridDensity) => applyLayout(validLayout(document.documentElement.dataset.layout), next),
  };
}
export default function LayoutProvider() {
  const { emailUsuario } = useAuth();
  useEffect(() => {
    identity = emailUsuario;
    if (!emailUsuario) { applyLayout("current", "comfortable", false); return; }
    try {
      const layout = savedLayout(localStorage, emailUsuario), density = validDensity(localStorage.getItem(preferenceKey(emailUsuario, DENSITY_KEY)));
      applyLayout(layout, density, false);
      localStorage.setItem(LAYOUT_KEY, layout); localStorage.setItem(DENSITY_KEY, density);
      localStorage.setItem(preferenceKey(emailUsuario, LAYOUT_KEY), layout);
      // Only copy a stored or known legacy manual choice; never record opting in during initialization.
      if (layout === "new" || localStorage.getItem(preferenceKey(emailUsuario, LAYOUT_CHOICE_KEY)) === "current") localStorage.setItem(LAYOUT_CHOICE_KEY, layout);
      else localStorage.removeItem(LAYOUT_CHOICE_KEY);
    } catch { applyLayout("current", "comfortable", false); }
  }, [emailUsuario]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      const keys = identity ? [preferenceKey(identity, LAYOUT_KEY), preferenceKey(identity, DENSITY_KEY), preferenceKey(identity, LAYOUT_CHOICE_KEY)] : [LAYOUT_KEY, DENSITY_KEY, LAYOUT_CHOICE_KEY];
      if (event.key && !keys.includes(event.key)) return;
      try { applyLayout(savedLayout(localStorage, identity), validDensity(localStorage.getItem(preferenceKey(identity, DENSITY_KEY))), false); } catch { /* */ }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return null;
}
