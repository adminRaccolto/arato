"use client";
import { useState, useEffect, useRef } from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string | number | undefined | null;
  onChange: (value: string) => void; // retorna string dot-decimal: "1234.56"
  decimais?: number;                 // 0=inteiro · 2=moeda (padrão) · 3=kg · 4=taxa
}

function formatar(raw: string, decimais: number): string {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  if (decimais === 0) {
    return parseInt(nums, 10).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
  const n = Number(nums) / Math.pow(10, decimais);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

function parseDisplay(display: string, decimais: number): string {
  if (!display) return "";
  if (decimais === 0) {
    const n = parseInt(display.replace(/\D/g, ""), 10);
    return isNaN(n) ? "" : String(n);
  }
  // "1.234,56" → "1234.56"
  return display.replace(/\./g, "").replace(",", ".") || "";
}

function valorParaDisplay(v: string | number | undefined | null, decimais: number): string {
  if (v === "" || v === null || v === undefined) return "";
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string" && v.includes(",")) {
    n = Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  } else {
    n = Number(v) || 0;
  }
  if (!n) return "";
  if (decimais === 0) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

export default function InputNumerico({
  value,
  onChange,
  onBlur,
  onFocus,
  decimais = 2,
  placeholder,
  ...props
}: Props) {
  const focused = useRef(false);
  const [display, setDisplay] = useState(() => valorParaDisplay(value, decimais));

  useEffect(() => {
    if (!focused.current) {
      setDisplay(valorParaDisplay(value, decimais));
    }
  }, [value, decimais]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = formatar(e.target.value, decimais);
    setDisplay(masked);
    onChange(parseDisplay(masked, decimais));
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = false;
    onBlur?.(e);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = true;
    onFocus?.(e);
  }

  const ph = placeholder ?? (decimais === 0 ? "0" : `0,${"0".repeat(decimais)}`);

  return (
    <input
      {...props}
      type="text"
      inputMode={decimais === 0 ? "numeric" : "decimal"}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={ph}
    />
  );
}
