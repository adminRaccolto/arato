"use client";
import { useEffect, useSyncExternalStore } from "react";
import { themeVariables, validMode, validPalette, resolveMode, type AppearanceMode, type PaletteId } from "../lib/appearance";

const EVENT = "arato-appearance-change";

export function applyAppearance(palette: PaletteId, mode: AppearanceMode, persist = true) {
  const root = document.documentElement;
  const resolved = resolveMode(mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.palette = palette;
  root.dataset.appearance = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  for (const [name, value] of Object.entries(themeVariables(palette, resolved))) root.style.setProperty(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeVariables(palette, resolved)["--bg-page"]);
  if (persist) {
    try { localStorage.setItem("arato-palette", palette); localStorage.setItem("arato-theme", mode); } catch { /* A preferência continua ativa nesta aba. */ }
  }
  window.dispatchEvent(new Event(EVENT));
}

function snapshot() {
  const d = document.documentElement.dataset;
  return `${validPalette(d.palette)}|${validMode(d.appearance)}|${d.theme === "dark" ? "dark" : "light"}`;
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function useAppearance() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "default|light|light");
  const [palette, mode, resolved] = value.split("|");
  return {
    palette: validPalette(palette), mode: validMode(mode), dark: resolved === "dark",
    setPalette: (id: PaletteId) => applyAppearance(id, validMode(document.documentElement.dataset.appearance)),
    setMode: (id: AppearanceMode) => applyAppearance(validPalette(document.documentElement.dataset.palette), id),
  };
}

export default function AppearanceProvider() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => {
      if (document.documentElement.dataset.appearance === "system") applyAppearance(validPalette(document.documentElement.dataset.palette), "system", false);
    };
    const updateStorage = (event: StorageEvent) => {
      if (event.key !== null && !["arato-palette", "arato-theme"].includes(event.key)) return;
      try { applyAppearance(validPalette(localStorage.getItem("arato-palette")), validMode(localStorage.getItem("arato-theme")), false); } catch { /* */ }
    };
    applyAppearance(validPalette(document.documentElement.dataset.palette), validMode(document.documentElement.dataset.appearance), false);
    media.addEventListener("change", updateSystem);
    window.addEventListener("storage", updateStorage);
    return () => { media.removeEventListener("change", updateSystem); window.removeEventListener("storage", updateStorage); };
  }, []);
  return null;
}
