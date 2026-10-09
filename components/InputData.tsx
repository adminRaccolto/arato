"use client";
import { forwardRef, useState, useEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from "react";

/**
 * Campo de data com botão "Hoje" ao lado. Digitação fluida (dd/mm/aaaa) — os números
 * entram naturalmente, as barras aparecem sozinhas, sem precisar de Tab pra passar de
 * dia pra mês pra ano (o <input type="date"> nativo exigia isso, achado real 09/10/2026).
 * Mantém a mesma interface de fora: value/onChange usam "AAAA-MM-DD" (e.target.value),
 * igual ao <input type="date"> — nenhuma tela que usa este componente precisa mudar.
 */
interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value?: string | null;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: "date";
}

function paraExibicao(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function mascarar(raw: string): string {
  const nums = raw.replace(/\D/g, "").slice(0, 8);
  let out = "";
  if (nums.length > 0) out += nums.slice(0, 2);
  if (nums.length > 2) out += "/" + nums.slice(2, 4);
  if (nums.length > 4) out += "/" + nums.slice(4, 8);
  return out;
}

// "dd/mm/aaaa" completo → "aaaa-mm-dd"; incompleto → "" (não dispara onChange até fechar os 8 dígitos)
function paraIso(display: string): string {
  const nums = display.replace(/\D/g, "");
  if (nums.length < 8) return "";
  const d = nums.slice(0, 2), m = nums.slice(2, 4), a = nums.slice(4, 8);
  return `${a}-${m}-${d}`;
}

const InputData = forwardRef<HTMLInputElement, Props>(function InputData(
  { style, disabled, value, onChange, onBlur, onFocus, placeholder, ...resto },
  ref,
) {
  const focused = useRef(false);
  const [display, setDisplay] = useState(() => paraExibicao(value));

  useEffect(() => {
    if (!focused.current) setDisplay(paraExibicao(value));
  }, [value]);

  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function dispararChange(iso: string) {
    onChange?.({ target: { value: iso }, currentTarget: { value: iso } } as unknown as ChangeEvent<HTMLInputElement>);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = mascarar(e.target.value);
    setDisplay(masked);
    if (masked === "") { dispararChange(""); return; } // campo limpo (ex: apagar tudo) — propaga pro pai
    const iso = paraIso(masked);
    if (iso) dispararChange(iso);
  }

  function marcarHoje() {
    const iso = hojeISO();
    setDisplay(paraExibicao(iso));
    dispararChange(iso);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <input
        ref={ref}
        {...resto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        disabled={disabled}
        placeholder={placeholder ?? "dd/mm/aaaa"}
        onChange={handleChange}
        onFocus={e => { focused.current = true; onFocus?.(e); }}
        onBlur={e => { focused.current = false; onBlur?.(e); }}
        style={style}
      />
      {!disabled && (
        <button type="button" onClick={marcarHoje} title="Preencher com a data de hoje"
          style={{ padding: "2px 6px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: "0.5px solid #DDE2EE", background: "#F4F6FA", color: "#1A4870", cursor: "pointer", whiteSpace: "nowrap" }}>
          Hoje
        </button>
      )}
    </span>
  );
});

export default InputData;
