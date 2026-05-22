"use client";
import { useState, useEffect, useRef } from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | string | undefined | null;
  onChange: (valor: number) => void;
}

// 1234.56 → "1.234,56"
function formatar(n: number): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "1.234,56" → 1234.56
function desformatar(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}

// Aplica máscara de centavos em tempo real: "12345" → "123,45"
function aplicarMascara(raw: string): string {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function valorParaDisplay(v: number | string | undefined | null): string {
  if (v === "" || v === null || v === undefined) return "";
  const n = typeof v === "string"
    ? Number(v.replace(/\./g, "").replace(",", ".")) || 0
    : Number(v) || 0;
  return n > 0 ? formatar(n) : "";
}

export default function InputMonetario({ value, onChange, onBlur, onFocus, ...props }: Props) {
  const focused = useRef(false);
  const [display, setDisplay] = useState(() => valorParaDisplay(value));

  // Sincroniza quando o valor externo muda (ex: reset de formulário)
  useEffect(() => {
    if (!focused.current) {
      setDisplay(valorParaDisplay(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = aplicarMascara(e.target.value);
    setDisplay(masked);
    onChange(desformatar(masked));
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = false;
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
