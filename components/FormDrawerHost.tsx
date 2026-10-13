"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLayout } from "./LayoutProvider";
import { isPublicLayout } from "../lib/layout-preferences";

const overlays = '[data-arato-overlay], .modal-overlay, div[style*="position: fixed"]';
const controls = 'input:not([type="hidden"]):not([disabled]),select,textarea,[role="combobox"]';
const focusable = 'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
type Layer = { panel: HTMLElement; order: number; previousFocus: HTMLElement | null; restore: (() => void)[] };

function fullScreenOverlay(element: HTMLElement) {
  if (element.hasAttribute("data-arato-overlay") || element.classList.contains("modal-overlay")) return true;
  const { position, inset, top, left, right, bottom, display } = element.style;
  return position === "fixed" && ["flex", "grid"].includes(display) && (inset === "0px" || [top, left, right, bottom].every(value => value === "0px"));
}
function drawerWidth(panel: HTMLElement) {
  const preferred = Number(panel.dataset.aratoDrawerWidth);
  if (Number.isFinite(preferred) && preferred > 0) return Math.max(520, Math.min(1140, preferred));
  if (panel.dataset.aratoDialog === "drawer") return 520;
  // Read the original inline dimensions, before the workspace CSS stretches a page dialog.
  const dimensions = [panel.style.width, panel.style.maxWidth].flatMap(value => {
    if (!/^(?:\d+(?:\.\d+)?px|(?:min|max|clamp)\()/.test(value)) return [];
    const pixels = [...value.matchAll(/(?:^|[\s,(])(\d+(?:\.\d+)?)px\b/g)].map(match => Number(match[1]));
    return pixels.length ? [value.startsWith("clamp(") || value.startsWith("max(") ? Math.max(...pixels) : Math.min(...pixels)] : [];
  });
  return Math.max(520, Math.min(1140, dimensions.length ? Math.min(...dimensions) : panel.dataset.aratoDialog === "page" ? 900 : 520));
}

/** Applies the shared presentation to existing forms without replacing their nodes or handlers. */
export default function FormDrawerHost() {
  const { modern } = useLayout();
  const pathname = usePathname();
  useEffect(() => {
    if (!modern || isPublicLayout(pathname)) return;
    const layers = new Map<HTMLElement, Layer>();
    let sequence = 0;
    let active: Layer | undefined;
    const oldOverflow = document.body.style.getPropertyValue("overflow");
    const oldOverflowPriority = document.body.style.getPropertyPriority("overflow");
    function attribute(element: HTMLElement, name: string, value: string, restore: (() => void)[]) {
      const previous = element.getAttribute(name);
      element.setAttribute(name, value);
      restore.push(() => previous === null ? element.removeAttribute(name) : element.setAttribute(name, previous));
    }
    function property(element: HTMLElement, name: string, value: string, restore: (() => void)[]) {
      const previous = element.style.getPropertyValue(name), priority = element.style.getPropertyPriority(name);
      element.style.setProperty(name, value);
      restore.push(() => previous ? element.style.setProperty(name, previous, priority) : element.style.removeProperty(name));
    }
    function topLayer() { return [...layers.values()].sort((a, b) => a.order - b.order).at(-1); }
    function focusPanel(layer: Layer) {
      if (!layer.panel.contains(document.activeElement)) layer.panel.focus({ preventScroll: true });
    }
    function adaptForm(overlay: HTMLElement, layer: Layer) {
      const { panel } = layer;
      const form = ["form", "page", "drawer"].includes(panel.dataset.aratoDialog ?? "") || !!panel.querySelector(controls);
      if (!form) return;
      if (!panel.hasAttribute("data-arato-form-drawer")) {
        property(panel, "--arato-drawer-width", `${drawerWidth(panel)}px`, layer.restore);
        attribute(overlay, "data-arato-form-overlay", "true", layer.restore);
        attribute(panel, "data-arato-form-drawer", "true", layer.restore);
      } else if (panel.style.getPropertyValue("--arato-drawer-width") !== `${drawerWidth(panel)}px`) {
        panel.style.setProperty("--arato-drawer-width", `${drawerWidth(panel)}px`);
      }
    }
    function scan() {
      const previousActive = active;
      let returnFocus: HTMLElement | null = null;
      for (const [overlay, layer] of layers) {
        if (overlay.isConnected && layer.panel.isConnected && getComputedStyle(overlay).display !== "none") continue;
        if (layer === previousActive) returnFocus = layer.previousFocus;
        layer.restore.reverse().forEach(restore => restore());
        layers.delete(overlay);
      }
      for (const overlay of document.querySelectorAll<HTMLElement>(overlays)) {
        const existing = layers.get(overlay);
        if (existing) { adaptForm(overlay, existing); continue; }
        if (!fullScreenOverlay(overlay) || getComputedStyle(overlay).display === "none") continue;
        const panel = [...overlay.children].find((child): child is HTMLElement => child instanceof HTMLElement && (
          child.hasAttribute("data-arato-dialog") || child.classList.contains("modal-box") || !!child.querySelector(controls)
        ));
        if (!panel || panel.closest('[data-theme-static],.print-area,#rom-print-area')) continue;
        const layer: Layer = { panel, order: ++sequence, previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null, restore: [] };
        property(overlay, "--arato-dialog-layer", String(layer.order), layer.restore);
        attribute(overlay, "data-arato-dialog-layer", "true", layer.restore);
        attribute(panel, "role", "dialog", layer.restore);
        attribute(panel, "aria-modal", "true", layer.restore);
        if (!panel.hasAttribute("tabindex")) attribute(panel, "tabindex", "-1", layer.restore);
        if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
          const title = panel.querySelector('h1,h2,h3,[data-arato-dialog-heading]')?.textContent ?? panel.firstElementChild?.textContent;
          attribute(panel, "aria-label", title?.trim().slice(0, 100) || "Formulário", layer.restore);
        }
        adaptForm(overlay, layer);
        layers.set(overlay, layer);
      }
      active = topLayer();
      for (const layer of layers.values()) layer.panel.setAttribute("aria-modal", String(layer === active));
      if (active) document.body.style.setProperty("overflow", "hidden");
      else if (oldOverflow) document.body.style.setProperty("overflow", oldOverflow, oldOverflowPriority);
      else document.body.style.removeProperty("overflow");
      if (active !== previousActive) {
        if (returnFocus?.isConnected && (!active || active.panel.contains(returnFocus))) returnFocus.focus({ preventScroll: true });
        else if (active) focusPanel(active);
      }
    }
    function popup(target: Element) { return !!target.closest('.modern-select-popup,[data-arato-search-popup]'); }
    function focus(event: FocusEvent) {
      if (active && event.target instanceof Element && !active.panel.contains(event.target) && !popup(event.target)) active.panel.focus({ preventScroll: true });
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key !== "Tab" || !active || (event.target instanceof Element && popup(event.target))) return;
      const items = [...active.panel.querySelectorAll<HTMLElement>(focusable)].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden" && !element.matches('.modern-select-native,.input-data-calendario input,[aria-hidden="true"]'));
      const first = items[0], last = items.at(-1);
      if (!first || !active.panel.contains(document.activeElement) || document.activeElement === active.panel || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-arato-dialog", "data-arato-drawer-width"] });
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", keyboard);
    scan();
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", keyboard);
      for (const layer of layers.values()) layer.restore.reverse().forEach(restore => restore());
      if (oldOverflow) document.body.style.setProperty("overflow", oldOverflow, oldOverflowPriority);
      else document.body.style.removeProperty("overflow");
    };
  }, [modern, pathname]);
  return null;
}
