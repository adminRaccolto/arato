"use client";
import { useState, useEffect, useRef } from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | string | undefined | null;
  onChange: (valor: number) => void;
  decimais?: number; // padrão 2; use 4 para cotações USD com PTAX
}

function formatar(n: number, dec = 2): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function desformatar(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function aplicarMascara(raw: string, dec = 2): string {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / Math.pow(10, dec)).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function valorParaDisplay(v: number | string | undefined | null, dec = 2): string {
  if (v === "" || v === null || v === undefined) return "";
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (v.includes(",")) {
    n = Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  } else {
    n = Number(v) || 0;
  }
  return n > 0 ? formatar(n, dec) : "";
}

export default function InputMonetario({ value, onChange, onBlur, onFocus, decimais = 2, ...props }: Props) {
  const focused = useRef(false);
  const [display, setDisplay] = useState(() => valorParaDisplay(value, decimais));

  useEffect(() => {
    if (!focused.current) {
      setDisplay(valorParaDisplay(value, decimais));
    }
  }, [value, decimais]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = aplicarMascara(e.target.value, decimais);
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
      placeholder={props.placeholder ?? (decimais === 4 ? "0,0000" : "0,00")}
    />
  );
}
