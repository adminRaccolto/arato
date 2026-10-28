"use client";
// Diagrama de fluxo (Sankey) em SVG, sem biblioteca: colunas por profundidade (origens → intermediários → destinos),
// altura dos nós e largura das faixas proporcionais à quantidade. Passar o mouse numa faixa ou nó destaca o caminho.
import { useMemo, useState } from "react";

export type SankeyNo = { id: string; rotulo: string; cor: string; coluna?: number };
export type SankeyElo = { de: string; para: string; valor: number };

const LARG_NO = 14, GAP = 14, MARGEM_X = 210, MARGEM_Y = 10;

export default function Sankey({ nos, elos, altura, formatar = v => v.toLocaleString("pt-BR"), unidade = "" }: {
  nos: SankeyNo[]; elos: SankeyElo[]; altura?: number; formatar?: (v: number) => string; unidade?: string;
}) {
  const [foco, setFoco] = useState<string | null>(null);   // id de nó ou "de→para"

  const lay = useMemo(() => {
    const porId = new Map(nos.map(n => [n.id, n]));
    const entra = new Map<string, number>(), sai = new Map<string, number>();
    for (const e of elos) { sai.set(e.de, (sai.get(e.de) ?? 0) + e.valor); entra.set(e.para, (entra.get(e.para) ?? 0) + e.valor); }
    // Coluna: a informada, ou 1 + a maior coluna de quem manda para ele (sem ciclos infinitos)
    const col = new Map<string, number>();
    for (const n of nos) if (n.coluna != null) col.set(n.id, n.coluna);
    for (let it = 0; it < nos.length; it++) {
      let mudou = false;
      for (const e of elos) {
        if (porId.get(e.para)?.coluna != null) continue;
        const c = (col.get(e.de) ?? 0) + 1;
        if (c > (col.get(e.para) ?? 0) && c <= nos.length) { col.set(e.para, c); mudou = true; }
      }
      if (!mudou) break;
    }
    const nCols = Math.max(0, ...nos.map(n => col.get(n.id) ?? 0)) + 1;
    const valor = (id: string) => Math.max(entra.get(id) ?? 0, sai.get(id) ?? 0);
    const colunas: string[][] = Array.from({ length: nCols }, () => []);
    for (const n of nos) colunas[col.get(n.id) ?? 0].push(n.id);
    for (const c of colunas) c.sort((a, b) => valor(b) - valor(a));
    const maiorColuna = Math.max(1, ...colunas.map(c => c.length));
    const H = altura ?? Math.max(320, maiorColuna * 40);
    const escala = Math.min(...colunas.filter(c => c.length).map(c => (H - MARGEM_Y * 2 - GAP * (c.length - 1)) / Math.max(1e-9, c.reduce((a, id) => a + valor(id), 0))));
    const W = 1100;
    const xCol = (c: number) => MARGEM_X + (nCols <= 1 ? 0 : c * ((W - MARGEM_X * 2 - LARG_NO) / (nCols - 1)));
    const pos = new Map<string, { x: number; y: number; h: number }>();
    colunas.forEach((ids, c) => {
      const total = ids.reduce((a, id) => a + Math.max(3, valor(id) * escala), 0) + GAP * (ids.length - 1);
      let y = Math.max(MARGEM_Y, (H - total) / 2);
      for (const id of ids) { const h = Math.max(3, valor(id) * escala); pos.set(id, { x: xCol(c), y, h }); y += h + GAP; }
    });
    // Faixas: empilhadas na saída e na entrada de cada nó, na ordem vertical do outro lado
    const offSai = new Map<string, number>(), offEnt = new Map<string, number>();
    const ordenados = [...elos].sort((a, b) => (pos.get(a.para)!.y - pos.get(b.para)!.y) || (pos.get(a.de)!.y - pos.get(b.de)!.y));
    const faixas = ordenados.map(e => {
      const a = pos.get(e.de)!, b = pos.get(e.para)!;
      const w = Math.max(1, e.valor * escala);
      const y0 = a.y + (offSai.get(e.de) ?? 0); offSai.set(e.de, (offSai.get(e.de) ?? 0) + w);
      const y1 = b.y + (offEnt.get(e.para) ?? 0); offEnt.set(e.para, (offEnt.get(e.para) ?? 0) + w);
      const x0 = a.x + LARG_NO, x1 = b.x, xm = (x0 + x1) / 2;
      const d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + w} C${xm},${y1 + w} ${xm},${y0 + w} ${x0},${y0 + w} Z`;
      return { ...e, d, cor: porId.get(e.de)?.cor ?? "#888" };
    });
    return { W, H, pos, faixas, valor, nCols, col };
  }, [nos, elos, altura]);

  const ligado = (e: SankeyElo) => !foco || foco === `${e.de}→${e.para}` || foco === e.de || foco === e.para;
  const noLigado = (id: string) => !foco || foco === id || elos.some(e => (e.de === id || e.para === id) && ligado(e));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${lay.W} ${lay.H}`} style={{ width: "100%", minWidth: 760, height: "auto", display: "block" }} onMouseLeave={() => setFoco(null)}>
        {lay.faixas.map(f => (
          <path key={`${f.de}→${f.para}`} d={f.d} fill={f.cor} fillOpacity={ligado(f) ? (foco ? 0.55 : 0.32) : 0.06}
            onMouseEnter={() => setFoco(`${f.de}→${f.para}`)} style={{ cursor: "default", transition: "fill-opacity .15s" }}>
            <title>{`${nos.find(n => n.id === f.de)?.rotulo} → ${nos.find(n => n.id === f.para)?.rotulo}: ${formatar(f.valor)} ${unidade}`}</title>
          </path>
        ))}
        {nos.map(n => {
          const p = lay.pos.get(n.id); if (!p) return null;
          const c = lay.col.get(n.id) ?? 0;
          const aDireita = c < lay.nCols - 1 || lay.nCols === 1;
          const naEsquerda = c === 0;
          const tx = naEsquerda ? p.x - 6 : aDireita ? p.x + LARG_NO + 6 : p.x + LARG_NO + 6;
          return (
            <g key={n.id} onMouseEnter={() => setFoco(n.id)} opacity={noLigado(n.id) ? 1 : 0.35} style={{ transition: "opacity .15s" }}>
              <rect x={p.x} y={p.y} width={LARG_NO} height={p.h} rx={3} fill={n.cor} />
              <text x={tx} y={p.y + p.h / 2} dy="-0.15em" textAnchor={naEsquerda ? "end" : "start"} fontSize={12} fontWeight={600} fill="var(--text-1, #1a1a1a)">{n.rotulo.length > 34 ? n.rotulo.slice(0, 33) + "…" : n.rotulo}</text>
              <text x={tx} y={p.y + p.h / 2} dy="1.05em" textAnchor={naEsquerda ? "end" : "start"} fontSize={11} fill="var(--text-2, #555)" style={{ fontVariantNumeric: "tabular-nums" }}>{formatar(lay.valor(n.id))} {unidade}</text>
              <title>{`${n.rotulo}: ${formatar(lay.valor(n.id))} ${unidade}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
