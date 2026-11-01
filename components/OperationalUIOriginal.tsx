"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, Ref, TableHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement>; "data-arato-button"?: string };
export function OperationalButton(props: ButtonProps) {
  return <button {...props} />;
}

type HeadingProps = HTMLAttributes<HTMLDivElement> & { as?: "div" | "header" };
export function OperationalHeading({ as: Tag = "div", ...props }: HeadingProps) {
  return <Tag {...props} />;
}

type FiltersProps = HTMLAttributes<HTMLDivElement> & { "data-arato-filters"?: string };
export function OperationalFilters(props: FiltersProps) {
  return <div {...props} />;
}

type GridProps = TableHTMLAttributes<HTMLTableElement> & { ref?: Ref<HTMLTableElement>; "data-arato-grid"?: string; "data-op-title"?: string };
export function OperationalGrid(props: GridProps) {
  return <table {...props} />;
}
