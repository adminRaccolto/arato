"use client";
import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from "react";

/**
 * Campo de data com botão "Hoje" ao lado. Aceita as mesmas props de <input type="date">
 * e chama onChange com o mesmo formato de evento (e.target.value = "AAAA-MM-DD").
 */
const InputData = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function InputData(
  { style, disabled, onChange, ...resto },
  ref,
) {
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function marcarHoje() {
    if (!onChange) return;
    onChange({ target: { value: hojeISO() }, currentTarget: { value: hojeISO() } } as unknown as ChangeEvent<HTMLInputElement>);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <input ref={ref} {...resto} type="date" style={style} disabled={disabled} onChange={onChange} />
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
