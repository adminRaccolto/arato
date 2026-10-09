"use client";
import { forwardRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { exibirData, mascararData, dataParaIso, dataLocalAgora, type TipoData } from "../lib/input-data";

/**
 * Campo de data com botão "Hoje" ao lado. Digitação fluida (dd/mm/aaaa) — os números
 * entram naturalmente, as barras aparecem sozinhas, sem precisar de Tab pra passar de
 * dia pra mês pra ano (o <input type="date"> nativo exigia isso, achado real 09/10/2026).
 * value/onChange usam ISO, igual ao input nativo. `calendario` habilita o seletor
 * ao lado da digitação; `datetime-local` inclui a hora, sem conversão de fuso.
 */
interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value?: string | null;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: TipoData;
  calendario?: boolean;
}

const InputData = forwardRef<HTMLInputElement, Props>(function InputData(
  { style, disabled, readOnly, value, onChange, onBlur, onFocus, placeholder,
    type = "date", calendario = false, min, max, step, ...resto },
  ref,
) {
  // O rascunho preserva a digitação incompleta; alterações externas usam o valor do pai.
  const [rascunho, setRascunho] = useState(() => ({ display: exibirData(value, type), value, type }));
  const display = rascunho.value === value && rascunho.type === type
    ? rascunho.display : exibirData(value, type);

  function atualizarDisplay(display: string, proximoValor = value) {
    setRascunho({ display, value: onChange ? proximoValor : value, type });
  }

  function dentroDoPeriodo(iso: string) {
    return !!iso && (min == null || iso >= String(min)) && (max == null || iso <= String(max));
  }

  function dispararChange(iso: string) {
    onChange?.({ target: { value: iso }, currentTarget: { value: iso } } as unknown as ChangeEvent<HTMLInputElement>);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = mascararData(e.target.value, type);
    const iso = dataParaIso(masked, type, calendario);
    if (calendario || masked === "" || iso) {
      const proximoValor = calendario && !dentroDoPeriodo(iso) ? "" : iso;
      atualizarDisplay(masked, proximoValor);
      dispararChange(proximoValor);
    } else atualizarDisplay(masked);
  }

  function marcarHoje() {
    const iso = dataLocalAgora(type);
    if (calendario && !dentroDoPeriodo(iso)) return;
    atualizarDisplay(exibirData(iso, type), iso);
    dispararChange(iso);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", ...(calendario ? { width: style?.width ?? "100%" } : {}) }}>
      <input
        ref={ref}
        {...resto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        disabled={disabled}
        readOnly={readOnly}
        min={min}
        max={max}
        placeholder={placeholder ?? (type === "date" ? "dd/mm/aaaa" : "dd/mm/aaaa hh:mm")}
        aria-invalid={resto["aria-invalid"] ?? (calendario && !!display && !dentroDoPeriodo(dataParaIso(display, type)))}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        style={calendario ? { ...style, minWidth: 0, flex: 1 } : style}
      />
      {calendario && !disabled && !readOnly && (
        <span className="input-data-calendario" style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 30, height: 30, border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 5, background: "var(--bg-input, #F4F6FA)", color: "var(--text-2, #1A4870)" }}>
          <style>{`.input-data-calendario:focus-within { outline: 2px solid #1A4870; outline-offset: 2px; } .input-data-calendario input::-webkit-calendar-picker-indicator { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; cursor: pointer; }`}</style>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          <input
            type={type}
            aria-label={type === "date" ? "Escolher data no calendário" : "Escolher data e hora no calendário"}
            title="Abrir calendário"
            value={value ?? ""}
            min={min}
            max={max}
            step={step ?? (type === "datetime-local" ? 60 : undefined)}
            onClick={e => {
              // O input permanece acessível e clicável como alternativa ao showPicker.
              try { e.currentTarget.showPicker?.(); } catch { e.currentTarget.focus(); }
            }}
            onChange={e => {
              const iso = e.target.value;
              const proximoValor = dentroDoPeriodo(iso) ? iso : "";
              atualizarDisplay(exibirData(iso, type), proximoValor);
              dispararChange(proximoValor);
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", minWidth: 0 }}
          />
        </span>
      )}
      {!disabled && !readOnly && (
        <button type="button" onClick={marcarHoje} title={type === "date" ? "Preencher com a data de hoje" : "Preencher com a data e hora atuais"}
          disabled={calendario && !dentroDoPeriodo(dataLocalAgora(type))}
          style={{ padding: "2px 6px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: "0.5px solid #DDE2EE", background: "#F4F6FA", color: "#1A4870", cursor: "pointer", whiteSpace: "nowrap" }}>
          {type === "date" ? "Hoje" : "Agora"}
        </button>
      )}
    </span>
  );
});

export default InputData;
