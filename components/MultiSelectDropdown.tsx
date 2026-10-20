"use client";
import { useEffect, useRef, useState } from "react";

export type OpcaoMulti = { v: string; label: string; busca?: string };   // busca = texto extra pesquisável (ex.: CNPJ)

interface Props {
  opcoes: OpcaoMulti[];
  selecionados: Set<string>;
  onChange: (novo: Set<string>) => void;
  textoTodos?: string;   // exibido quando nada está marcado (= sem filtro)
  largura?: number | string;
  buscavel?: boolean;          // campo de pesquisa para filtrar as opções do dropdown
  placeholderBusca?: string;
  limite?: number;             // máximo de opções desenhadas por vez (listas grandes); refine a busca para ver as demais
}

/** Filtro em dropdown com caixas de seleção múltipla. Nada marcado = sem filtro (todos). */
export default function MultiSelectDropdown({ opcoes, selecionados, onChange, textoTodos = "Todos", largura = 170, buscavel = false, placeholderBusca = "Pesquisar…", limite = 200 }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = semAcento(busca.trim()); const qd = q.replace(/\D/g, "");
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const marcados = opcoes.filter(o => selecionados.has(o.v));
  const visiveis = !buscavel || !q ? opcoes : opcoes.filter(o => semAcento(o.label).includes(q) || semAcento(o.busca ?? "").includes(q) || (qd.length >= 3 && (o.busca ?? "").replace(/\D/g, "").includes(qd)));
  const resumo = marcados.length === 0 ? textoTodos
    : marcados.length <= 2 ? marcados.map(o => o.label).join(", ")
    : `${marcados.length} selecionados`;

  function alternar(v: string) {
    const novo = new Set(selecionados);
    if (novo.has(v)) novo.delete(v); else novo.add(v);
    onChange(novo);
  }

  return (
    <div data-arato-filter-select="true" ref={raiz} style={{ position: "relative", width: largura }}>
      <button data-arato-button="secondary" type="button" onClick={() => { setAberto(a => !a); setBusca(""); }}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, textAlign: "left", color: marcados.length ? "#1A1A1A" : "#555" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumo}</span>
        <span style={{ fontSize: 9, color: "#888" }}>▼</span>
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "100%", ...(buscavel ? { right: 0, boxSizing: "border-box" as const, overflowX: "hidden" as const } : {}), background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", zIndex: 50, padding: 6 }}>
          {buscavel && (
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder={placeholderBusca} aria-label={placeholderBusca}
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", marginBottom: 4, border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 12, outline: "none" }} />
          )}
          {buscavel && marcados.length > 0 && (
            <div style={{ fontSize: 11, color: "#1A4870", padding: "0 2px 4px" }}>{marcados.length} marcado(s): {marcados.slice(0, 3).map(o => o.label).join(", ")}{marcados.length > 3 ? "…" : ""}</div>
          )}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {visiveis.length === 0 && <div style={{ padding: "8px", fontSize: 12, color: "#888" }}>Nada encontrado</div>}
          {visiveis.slice(0, limite).map(o => (
            <label data-arato-label="true" key={o.v} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6, whiteSpace: buscavel ? "normal" : "nowrap", wordBreak: buscavel ? "break-word" : undefined }}>
              <input type="checkbox" checked={selecionados.has(o.v)} onChange={() => alternar(o.v)} />
              {o.label}
            </label>
          ))}
          {visiveis.length > limite && <div style={{ padding: "4px 8px", fontSize: 11, color: "#888" }}>Mostrando {limite} de {visiveis.length}; digite para refinar.</div>}
          </div>
          <button data-arato-button="secondary" type="button" onClick={() => onChange(new Set())}
            style={{ width: "100%", marginTop: 4, padding: "6px 8px", border: "none", borderTop: "0.5px solid #EEF0F6", background: "transparent", fontSize: 12, color: "#1A4870", cursor: "pointer", textAlign: "left" }}>
            Limpar seleção ({textoTodos.toLowerCase()})
          </button>
        </div>
      )}
    </div>
  );
}
