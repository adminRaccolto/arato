"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./AuthProvider";
import { DENSITY_EVENT, DENSITY_KEY, preferenceKey, retireAlternativeLayout, validDensity, type GridDensity } from "../lib/layout-preferences";

let identity: string | null = null;
function applyDensity(density: GridDensity, persist = true) {
  document.documentElement.dataset.layout = "current";
  document.documentElement.dataset.gridDensity = density;
  if (persist) {
    try {
      localStorage.setItem(DENSITY_KEY, density);
      localStorage.setItem(preferenceKey(identity, DENSITY_KEY), density);
    } catch { /* Density still applies when storage is blocked. */ }
  }
  window.dispatchEvent(new Event(DENSITY_EVENT));
}
function subscribe(listener: () => void) {
  window.addEventListener(DENSITY_EVENT, listener);
  return () => window.removeEventListener(DENSITY_EVENT, listener);
}
export function useGridDensity() {
  const density = useSyncExternalStore(subscribe, () => validDensity(document.documentElement.dataset.gridDensity), () => "comfortable" as GridDensity);
  return { density, setDensity: applyDensity };
}
export default function GridDensityProvider() {
  const { emailUsuario } = useAuth();
  useEffect(() => {
    identity = emailUsuario;
    try {
      retireAlternativeLayout(localStorage, emailUsuario);
      const density = validDensity(localStorage.getItem(preferenceKey(emailUsuario, DENSITY_KEY)));
      applyDensity(density, false);
      if (emailUsuario) localStorage.setItem(DENSITY_KEY, density);
    } catch { applyDensity("comfortable", false); }
  }, [emailUsuario]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      try {
        retireAlternativeLayout(localStorage, identity);
        if (event.key && event.key !== preferenceKey(identity, DENSITY_KEY)) return;
        applyDensity(validDensity(localStorage.getItem(preferenceKey(identity, DENSITY_KEY))), false);
      } catch { /* Keep the selected density. */ }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return null;
}
