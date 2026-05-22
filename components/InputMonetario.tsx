"use client";
import { useState, useEffect, useRef } from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | string | undefined | null;
  onChange: (valor: number) => void;
}

// "1.234,56" → 1234.56
function parsear(s: string): number {
  const clean = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

// 1234.56 → "1.234,56"
function formatar(n: number): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InputMonetario({ value, onChange, onBlur, onFocus, ...props }: Props) {
  const focused = useRef(false);
  const [display, setDisplay] = useState(() => {
    const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) || 0 : (Number(value) || 0);
    return n > 0 ? formatar(n) : "";
  });

  // Sincroniza quando o valor externo muda (ex: reset de formulário)
  useEffect(() => {
    if (!focused.current) {
      const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) || 0 : (Number(value) || 0);
      setDisplay(n > 0 ? formatar(n) : "");
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Permite apenas dígitos e vírgula
    const raw = e.target.value.replace(/[^\d,]/g, "");
    setDisplay(raw);
    onChange(parsear(raw));
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = false;
    const n = parsear(display);
    setDisplay(n > 0 ? formatar(n) : "");
    onBlur?.(e);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = true;
    onFocus?.(e);
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={props.placeholder ?? "0,00"}
    />
  );
}
