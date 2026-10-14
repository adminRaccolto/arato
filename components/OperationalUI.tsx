"use client";

import { cloneElement, createContext, useContext, useId, useMemo, useCallback, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type Ref, type TableHTMLAttributes } from "react";
import { usePathname } from "next/navigation";
import { contains, element, filterValue, nodes, tableModel, textOf } from "../lib/operational-view";
import { modernNavigation } from "../lib/modern-navigation";
import Icon from "./NavigationIcon";
import { useLayout } from "./LayoutProvider";

export const OperationalContext = createContext(false);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement>; "data-arato-button"?: string };
export function OperationalButton({ children, className, ...props }: ButtonProps) {
  const active = useContext(OperationalContext);
  if (!active) return <button className={className} {...props}>{children}</button>;
  const label = textOf(children);
  const selected = props["aria-pressed"] ?? props["aria-selected"] ?? (props as ButtonProps & { "data-arato-tab-active"?: boolean | string })["data-arato-tab-active"];
  const name = /novo|nova|adicionar|incluir|criar/i.test(label) ? "plus" : /salvar|confirmar|aprovar|concluir/i.test(label) ? "check" : /atualizar|recarregar/i.test(label) ? "refresh" : /excluir|remover|apagar/i.test(label) ? "trash" : /exportar|baixar.*(?:pdf|xml|arquivo)|download/i.test(label) ? "download" : /filtr/i.test(label) ? "filter" : /editar|alterar/i.test(label) ? "edit" : null;
  return <button className={`op-button ${className ?? ""}`} {...props} data-op-selected={selected === true || selected === "true" ? "true" : undefined}>
    {name && !contains(children, e => e.type === "svg") && <Icon name={name} size={16} />}
    <span className="op-button-label">{children}</span>
  </button>;
}

type HeadingProps = HTMLAttributes<HTMLDivElement> & { as?: "div" | "header" };
export function OperationalHeading({ as: Tag = "div", children, className, ...props }: HeadingProps) {
  const active = useContext(OperationalContext), pathname = usePathname();
  if (!active) return <Tag className={className} {...props}>{children}</Tag>;
  const group = modernNavigation().find(g => g.links.some(l => l.path.split("?")[0] === pathname));
  const items = nodes(children);
  const title = items.filter(n => contains([n], e => e.type === "h1"));
  const actions = items.filter(n => !title.includes(n));
  // An outer header containing another heading keeps its tabs and auxiliary content in place.
  if (contains(children, e => e.type === OperationalHeading)) return <Tag className={`op-heading-wrapper ${className ?? ""}`} {...props}>{children}</Tag>;
  return <Tag className={`op-heading ${className ?? ""}`} {...props}>
    <div className="op-heading-title"><span className="op-eyebrow"><Icon name={group?.icon ?? "box"} size={14} />{group?.label ?? "Operação"}</span>{title.length ? title : children}</div>
    {title.length > 0 && actions.length > 0 && <div className="op-heading-actions">{actions}</div>}
  </Tag>;
}

type FiltersProps = HTMLAttributes<HTMLDivElement> & { "data-arato-filters"?: string };
export function OperationalFilters({ children, className, ...props }: FiltersProps) {
  const active = useContext(OperationalContext), panelId = useId();
  const [expanded, setExpanded] = useState(false);
  if (!active) return <div className={className} {...props}>{children}</div>;
  const parts = nodes(children);
  const fields = parts.filter(n => element(n) && contains([n], e => /^(?:input|select|textarea)$/.test(String(e.type)) || e.props.value !== undefined || e.props.selecionados instanceof Set));
  const search = fields.find(n => contains([n], e => e.type === "input" && e.props.type !== "date" && /busca|pesquis|descri|nome|nº|nf/i.test(String(e.props.placeholder ?? ""))) || /buscar|pesquisar/i.test(textOf(n)));
  const otherFields = fields.filter(n => n !== search);
  const actions = parts.filter(n => !fields.includes(n));
  const values = fields.flatMap(n => {
    const label = element(n) ? nodes(n.props.children).find(child => element(child) && child.type === "label") : undefined;
    return filterValue([n]).map(value => ({ label: label ? textOf(label) : "", value }));
  });
  // Small contextual selectors (e.g. a page's farm selector) do not become a filter panel.
  if (fields.length < 2) return <div className={`op-inline-controls ${className ?? ""}`} {...props}>{children}</div>;
  return <div className={`op-filters ${className ?? ""}`} {...props} data-op-expanded={expanded}>
    <div className="op-filter-bar">
      {search ? <div className="op-filter-search"><Icon name="search" />{search}</div> : <strong className="op-filter-caption"><Icon name="filter" />Refinar informações</strong>}
      <div className="op-filter-actions">
        <button type="button" className="op-tool" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={panelId}><Icon name="filter" size={16} />Filtros<span className="op-count">{otherFields.length}</span><Icon name="chevron" size={13} /></button>
        {actions}
      </div>
    </div>
    <div className="op-filter-criteria" aria-label="Critérios atuais">
      {values.length ? values.map(({ label, value }, i) => <span className="op-filter-chip" key={`${i}-${value}`} title={`${label}: ${value}`}>{label && <span>{label}:</span>}<strong>{value}</strong></span>) : <span className="op-filter-hint">Todos os registros do contexto selecionado</span>}
    </div>
    <div className="op-filter-fields" id={panelId} hidden={!expanded}>{otherFields.map((field, i) => <div className="op-filter-field" key={element(field) ? field.key ?? i : i}>{field}</div>)}</div>
  </div>;
}

type GridProps = TableHTMLAttributes<HTMLTableElement> & { tools?: ReactNode; ref?: Ref<HTMLTableElement>; "data-arato-grid"?: string; "data-op-title"?: string };
export function OperationalGrid({ children, tools, ...props }: GridProps) {
  const active = useContext(OperationalContext);
  // The original layout must not parse or decorate the operational grid.
  if (!active) return <table {...props}>{children}</table>;
  return <ActiveOperationalGrid {...props} tools={tools}>{children}</ActiveOperationalGrid>;
}

function ActiveOperationalGrid({ children, tools, className, ref: suppliedRef, ...props }: GridProps) {
  const layout = useLayout();
  const [view, setView] = useState<"table" | "cards">("table"), [columnsOpen, setColumnsOpen] = useState(false), [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(""), [findResult, setFindResult] = useState(""), [expanded, setExpanded] = useState(false);
  const table = useRef<HTMLTableElement>(null), workspace = useRef<HTMLElement>(null), menuId = useId();
  const model = useMemo(() => tableModel(children), [children]);
  const labels = useMemo(() => model.headers.map((h, i) => textOf(h.props.children) || (contains(h.props.children, child => child.type === "input" && child.props.type === "checkbox") ? "Selecionar" : `Coluna ${i + 1}`)), [model.headers]);
  // Operational commands and selection always remain available, even when columns are customized.
  const protectedColumns = useMemo(() => {
    const protectedLabels = new Set<string>();
    if (!model.regular || tools) return protectedLabels;
    model.headers.forEach((header, i) => {
      if (/aç[õo]es|op[çc][õo]es/i.test(labels[i]) || contains(header.props.children, e => e.type === "input")) protectedLabels.add(labels[i]);
    });
    for (const cells of model.rowCells.values()) {
      cells.forEach((cell, i) => {
        if (!protectedLabels.has(labels[i]) && contains(cell, e => e.type === "button" || e.type === OperationalButton || e.type === "input" || e.type === "a")) protectedLabels.add(labels[i]);
      });
      if (protectedLabels.size === labels.length) break;
    }
    return protectedLabels;
  }, [model, labels, tools]);
  const cards = model.cards && view === "cards";
  const tableRef = useCallback((node: HTMLTableElement | null) => {
    table.current = node;
    if (typeof suppliedRef === "function") return suppliedRef(node);
    if (suppliedRef) suppliedRef.current = node;
  }, [suppliedRef]);
  const decoratedChildren = useMemo(() => {
    function decorate(children: ReactNode): ReactNode {
      return nodes(children).map(node => {
        if (!element(node)) return node;
        if (node.type === "thead" || node.type === "tbody" || node.type === "tfoot") return cloneElement(node, {}, decorate(node.props.children));
        if (node.type !== "tr") return node;
        let column = 0;
        const wide = contains(node.props.children, child => child.type === "table" || child.props["data-arato-grid"] !== undefined);
        return cloneElement(node, { "data-op-wide-row": wide || undefined }, nodes(node.props.children).map(cell => {
          if (!element(cell) || !["td", "th"].includes(String(cell.type))) return cell;
          const span = Number(cell.props.colSpan ?? 1), label = labels[column];
          column += span;
          return cloneElement(cell, { "data-op-label": span === 1 ? label : undefined, "data-op-spanned-cell": span > 1 || undefined, "data-op-column-hidden": model.regular && !protectedColumns.has(label) && hidden.has(label) ? "true" : undefined });
        }));
      });
    }
    return model.decoratable ? decorate(children) : children;
  }, [children, model.decoratable, model.regular, labels, protectedColumns, hidden]);
  function locate() {
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const needle = normalize(query.trim());
    let first: HTMLTableRowElement | undefined, count = 0;
    for (const row of table.current?.querySelectorAll<HTMLTableRowElement>("tbody > tr") ?? []) {
      if (row.closest("table") !== table.current) continue;
      const matches = !!needle && normalize(row.textContent ?? "").includes(needle);
      row.toggleAttribute("data-op-found", matches);
      if (matches) { first ??= row; count++; }
    }
    first?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFindResult(needle ? `${count} correspondência${count === 1 ? "" : "s"}` : "");
  }
  return <section className="op-grid-workspace" ref={workspace} aria-label={props["aria-label"] ?? props["data-op-title"] ?? "Área de registros"} data-op-view={cards ? "cards" : "table"} data-op-expanded={expanded || undefined} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented && expanded) { event.preventDefault(); setExpanded(false); } }}>
    <div className="op-grid-tools">
      <div className="op-grid-caption"><span className="op-grid-icon"><Icon name="table" /></span><div><strong>{props["data-op-title"] ?? "Registros"}</strong><span>{model.dataRows.length} linha{model.dataRows.length === 1 ? "" : "s"} na tabela</span></div></div>
      <div className="op-grid-options">
        {tools}
        {model.cards && <div className="op-view-switch" role="group" aria-label="Visualização dos registros"><button type="button" aria-pressed={!cards} onClick={() => setView("table")}><Icon name="table" size={15} />Tabela</button><button type="button" aria-pressed={cards} onClick={() => setView("cards")}><Icon name="cards" size={15} />Fichas</button></div>}
        <button type="button" className="op-tool op-density" aria-label={layout.density === "compact" ? "Usar linhas confortáveis" : "Usar linhas compactas"} onClick={() => layout.setDensity(layout.density === "compact" ? "comfortable" : "compact")}><Icon name="density" size={17} /></button>
        {model.regular && !tools && <button type="button" className="op-tool" aria-controls={menuId} aria-expanded={columnsOpen} onClick={() => setColumnsOpen(!columnsOpen)}><Icon name="columns" size={16} />Exibição</button>}
        <button type="button" className="op-tool" aria-label={expanded ? "Restaurar área da tabela" : "Ampliar área da tabela"} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><Icon name="expand" size={17} /></button>
      </div>
    </div>
    {model.regular && !tools && <div className="op-columns" id={menuId} hidden={!columnsOpen}><strong>Informações visíveis</strong>{labels.map((label, i) => <label key={`${label}-${i}`}><input type="checkbox" disabled={protectedColumns.has(label)} checked={protectedColumns.has(label) || !hidden.has(label)} onChange={() => setHidden(previous => { const next = new Set(previous); if (next.has(label)) next.delete(label); else next.add(label); return next; })} />{label}</label>)}<button type="button" className="op-tool" onClick={() => setHidden(new Set())}>Mostrar todas</button></div>}
    <div className="op-grid-scroll"><table {...props} ref={tableRef} className={`op-data-table ${className ?? ""}`}>{decoratedChildren}</table></div>
    <div className="op-grid-footer"><span className="op-grid-note"><span className="op-live-dot" />{cards ? "Informações organizadas por registro" : "Ações e seleção disponíveis nas linhas"}</span><form className="op-grid-find" onSubmit={e => { e.preventDefault(); locate(); }}><Icon name="search" size={14} /><input aria-label="Localizar texto nesta tabela" placeholder="Localizar na tabela…" value={query} onChange={e => { setQuery(e.target.value); setFindResult(""); if (!e.target.value) for (const row of table.current?.querySelectorAll("[data-op-found]") ?? []) row.removeAttribute("data-op-found"); }} /><button type="submit" className="op-tool">Localizar</button></form><span className="op-find-result" role="status">{findResult}</span></div>
  </section>;
}

export function OperationalSummary({ items }: { items: { label: string; value: ReactNode; detail?: string; tone?: "warning" | "positive" }[] }) {
  const active = useContext(OperationalContext);
  if (!active) return null;
  return <div className="op-summary">{items.map(item => <div className="op-summary-item" key={item.label} data-tone={item.tone}><span>{item.label}</span><strong>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div>)}</div>;
}
