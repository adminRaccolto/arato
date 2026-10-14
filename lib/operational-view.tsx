import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

export type PresentationElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
export function element(node: ReactNode): node is PresentationElement { return isValidElement(node); }

/** Only inspect supplied JSX. Never call a component or move a DOM node owned by React. */
export function nodes(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => element(child) && child.type === Fragment ? nodes(child.props.children) : [child]);
}
export function textOf(children: ReactNode): string {
  return nodes(children).map(child => typeof child === "string" || typeof child === "number" ? String(child) : element(child) ? textOf(child.props.children) : "").join(" ").replace(/\s+/g, " ").trim();
}
export function contains(children: ReactNode, predicate: (child: PresentationElement) => boolean): boolean {
  return nodes(children).some(child => element(child) && (predicate(child) || contains(child.props.children, predicate)));
}
export function filterValue(children: ReactNode): string[] {
  return nodes(children).flatMap(child => {
    if (!element(child)) return [];
    const p = child.props;
    if (p.selecionados instanceof Set && Array.isArray(p.opcoes)) {
      return p.opcoes.filter(option => p.selecionados instanceof Set && p.selecionados.has(option.v)).map(option => String(option.label));
    }
    if (p.value !== undefined && p.value !== "" && p.value !== null && p.type !== "hidden") {
      if (child.type === "select") {
        const option = nodes(p.children).find(o => element(o) && String(o.props.value) === String(p.value));
        return option && element(option) ? [textOf(option.props.children)] : [String(p.value)];
      }
      const raw = String(p.value);
      return [/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split("-").reverse().join("/") : raw];
    }
    return filterValue(p.children);
  });
}

export function tableModel(children: ReactNode) {
  const parts = nodes(children);
  const head = parts.find(p => element(p) && p.type === "thead");
  const headerRows = element(head) ? nodes(head.props.children).filter(p => element(p) && p.type === "tr") : [];
  const headers = headerRows.length === 1 && element(headerRows[0]) ? nodes(headerRows[0].props.children).filter(element) : [];
  const bodies = parts.filter(p => element(p) && p.type === "tbody");
  const rows = bodies.flatMap(body => element(body) ? nodes(body.props.children).filter(p => element(p) && p.type === "tr") : []).filter(element);
  const dataRows = rows.filter(row => typeof row.props.onClick === "function" || nodes(row.props.children).filter(element).some(cell => cell.type === "td" && Number(cell.props.colSpan ?? 1) === 1));
  const simpleHeader = headers.length > 1 && headers.every(h => h.type === "th" && Number(h.props.colSpan ?? 1) === 1 && Number(h.props.rowSpan ?? 1) === 1);
  const regular = simpleHeader
    && rows.every(row => { const cells = nodes(row.props.children).filter(element); return cells.length === headers.length && cells.every(cell => cell.type === "td" && Number(cell.props.colSpan ?? 1) === 1 && Number(cell.props.rowSpan ?? 1) === 1); });
  // Horizontal spans (borderô summaries and expanded details) fit inside a card. Vertical spans do not.
  const cardStructure = simpleHeader && rows.every(row => {
    const cells = nodes(row.props.children).filter(element);
    return cells.length > 0 && cells.every(cell => cell.type === "td" && Number(cell.props.rowSpan ?? 1) === 1 && Number(cell.props.colSpan ?? 1) >= 1)
      && cells.reduce((sum, cell) => sum + Number(cell.props.colSpan ?? 1), 0) === headers.length;
  });
  const editable = contains(bodies, cell => cell.type === "input" && cell.props.type !== "checkbox" || cell.type === "select" || cell.type === "textarea" || typeof cell.type !== "string" && cell.props.value !== undefined && typeof cell.props.onChange === "function");
  return { parts, headers, rows, dataRows, regular, decoratable: simpleHeader, cards: cardStructure && !editable };
}
