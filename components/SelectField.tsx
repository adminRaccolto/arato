"use client";
import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useLayout } from "./LayoutProvider";
interface Option { value: string; label: string; disabled: boolean; group: string; }
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return "";
}
function options(children: ReactNode, group = "", disabled = false): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? text(child.props.children)), label: child.props.label ?? text(child.props.children), disabled: disabled || !!child.props.disabled, group }];
    return options(child.props.children, child.type === "optgroup" ? child.props.label ?? "" : group, disabled || !!child.props.disabled);
  });
}
function popupPosition(bounds: DOMRect, count: number) {
  const width = Math.min(Math.max(bounds.width, 220), window.innerWidth - 16), height = Math.min(340, window.innerHeight - 32);
  const preferred = window.innerHeight - bounds.bottom >= Math.min(height, count * 36 + 55) ? bounds.bottom + 4 : bounds.top - height - 4;
  return { top: Math.max(8, Math.min(preferred, window.innerHeight - height - 8)), left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)), width };
}
export default function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { modern } = useLayout(), id = useId();
  const all = options(props.children), enhanced = modern && !props.multiple && !props.size && all.length > 10;
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [index, setIndex] = useState(0), [label, setLabel] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const native = useRef<HTMLSelectElement>(null), wrapper = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(String(props.defaultValue ?? all[0]?.value ?? ""));
  const value = String(props.value ?? uncontrolledValue);
  const selected = all.find(option => option.value === value);
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = all.filter(option => !query || normalize(`${option.label} ${option.group}`).includes(normalize(query)));
  const active = filtered[Math.min(index, Math.max(0, filtered.length - 1))];
  const nativeRef = useCallback((node: HTMLSelectElement | null) => {
    native.current = node;
    if (!node) return;
    const original = props.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(props.id)}"]`) : node.parentElement?.parentElement?.querySelector(":scope > label");
    if (original?.textContent) setLabel(original.textContent.trim());
  }, [props.id, setLabel]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    const reposition = (event: Event) => { if (event.target instanceof Node && popup.current?.contains(event.target)) return; const bounds = wrapper.current?.getBoundingClientRect(); if (bounds) setPosition(popupPosition(bounds, all.length)); };
    document.addEventListener("mousedown", close); window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, all.length]);
  const eligible = enhanced && !props.disabled;
  const [previousEligibility, setPreviousEligibility] = useState(eligible);
  if (previousEligibility !== eligible) { setPreviousEligibility(eligible); setOpen(false); }
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [open, index, id]);
  function show() {
    if (props.disabled || !enhanced) return;
    const bounds = wrapper.current?.getBoundingClientRect();
    if (bounds) setPosition(popupPosition(bounds, all.length));
    setQuery(""); setIndex(Math.max(0, all.findIndex(o => o.value === value))); setOpen(true);
  }
  function choose(option: Option) {
    if (option.disabled || !native.current) return;
    native.current.value = option.value;
    native.current.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false); trigger.current?.focus();
  }
  return <div ref={wrapper} className={enhanced ? "modern-select-field" : "arato-native-select"}>
    <select {...props} ref={nativeRef} onChange={event => { if (props.value === undefined) setUncontrolledValue(event.target.value); props.onChange?.(event); }} aria-hidden={enhanced || undefined} tabIndex={enhanced ? -1 : props.tabIndex} className={`${props.className ?? ""}${enhanced ? " modern-select-native" : ""}`} onFocus={event => { props.onFocus?.(event); if (enhanced) show(); }} />
    {enhanced && <button ref={trigger} type="button" className="modern-select-trigger" role="combobox" aria-label={props["aria-label"] ?? (label || selected?.label || "Selecionar")} aria-invalid={props["aria-invalid"]} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} disabled={props.disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(); } }}><span>{selected?.label ?? "Selecionar…"}</span><span aria-hidden="true">⌄</span></button>}
    {enhanced && open && createPortal(<div ref={popup} className="modern-select-popup" style={{ top: position.top, left: position.left, width: position.width }}>
      <input ref={search} type="search" value={query} placeholder="Buscar opção…" role="combobox" aria-label={`Buscar em ${label || selected?.label || "opções"}`} aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={active ? `${id}-option-${Math.min(index, filtered.length - 1)}` : undefined} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        if (event.key === "Tab") setOpen(false);
        if (event.key === "ArrowDown") { event.preventDefault(); setIndex(i => Math.min(i + 1, filtered.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
        if (event.key === "Enter") { event.preventDefault(); if (active) choose(active); }
      }} />
      <div role="listbox" id={`${id}-list`} aria-label={label || selected?.label || "Opções"} className="modern-select-options">
        {filtered.map((option, i) => <div key={`${option.value}-${i}`} role="option" id={`${id}-option-${i}`} aria-selected={value === option.value} aria-disabled={option.disabled || undefined} data-highlighted={active === option} className="modern-select-option" onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option.group && <span>{option.group}</span>}{option.label}</div>)}
        {!filtered.length && <p>Nenhuma opção encontrada.</p>}
      </div>
    </div>, document.body)}
  </div>;
}
