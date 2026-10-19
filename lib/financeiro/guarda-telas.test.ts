// Guarda contra regressão silenciosa: recursos que o dono já usava em Contas a Pagar/Receber e que
// sumiram uma vez ao trocar a tela (01/10/2026). Se um destes marcadores sair do arquivo, o teste
// falha ANTES do push — remover um recurso passa a exigir decisão explícita (editar este teste).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const TELAS = ["app/financeiro/pagar/page.tsx", "app/financeiro/receber/page.tsx"];
const MARCADORES: [string, string][] = [
  ["filtrosCol", "linha de filtros por coluna sob o cabeçalho do grid"],
  ["casaFiltroNumero", "filtro de valores por coluna (exato, >n, <n, faixa)"],
  ["fmtUSDn", "valor em US$ exibido no grid de lançamentos em dólar"],
  ["valorEmReais", "conversão do dólar em reais (cotação do lançamento ou PTAX)"],
  ["carregarCotacoesUSD", "cotação gravada em cada título USD"],
];

for (const tela of TELAS) {
  const src = readFileSync(new URL(`../../${tela}`, import.meta.url), "utf8");
  for (const [marcador, o_que] of MARCADORES) {
    test(`${tela} mantém: ${o_que}`, () => assert.ok(src.includes(marcador), `${tela} perdeu "${marcador}" (${o_que})`));
  }
}
