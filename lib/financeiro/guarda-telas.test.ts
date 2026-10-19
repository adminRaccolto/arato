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
  ["saldoBRL", "saldo/baixa de título em dólar calculado em reais (valor_pago é sempre em R$)"],
];

// Recursos restaurados em 19/10/2026 após a comparação com a tela anterior (page.legado.tsx)
const MARCADORES_POR_TELA: Record<string, [string, string][]> = {
  "app/financeiro/pagar/page.tsx": [
    ["fProdutor", "filtro e coluna de Produtor"], ["Efetivar", "botão Efetivar previsão"], ["ModalVincularNf", "vincular NF à baixa"], ["bClass", "classificação e salvar padrão do fornecedor na baixa"],
    ["bNovaData", "nova data do saldo em baixa parcial"], ["juros_pct", "% juros, multa e desconto de pontualidade do título"],
    ["funcionario_id", "mão de obra (funcionário/prestador)"], ["veiculo_sel", "veículo/máquina vinculado"],
    ["ciclosPorSafra", "rateio por vencimento (safra e ciclo por parcela)"], ["fAtalho", "atalhos de status"], ["Confirmar entrega (barter)", "baixa barter"],
  ],
  "app/financeiro/contratos/page.tsx": [
    ["lancarDespesasFinanciadas", "IOF/tarifas financiados lançados separados do capital na liberação"], ["repartirCronograma", "cronograma da cédula separa juros e amortização (não lança a prestação toda como amortização)"], ["repartirJurosAmortizacao", "botão para repartir juros × amortização de contratos existentes"], ["derivarDespesasFinanciadas", "IA preenche valor liberado e despesas financiadas"],
  ],
  "app/financeiro/conciliacao/page.tsx": [
    ["popupDetalhe", "produtor e documento de origem no popup do extrato vinculado"], ["produtorDoTitulo", "coluna Produtor na lista de títulos da conciliação"],
  ],
  "app/financeiro/relatorios/page.tsx": [
    ["ogExtra", "operação gerencial dos títulos resolvida por id também no grid do relatório CP/CR"], ["resolverExtras", "Nº da NF e operação gerencial resolvidos do banco na exportação/impressão CP/CR"], ["enriquecer-titulos", "exportação CP/CR usa a rota de servidor que resolve NF e operação gerencial"],
    ["printCpcrRef", "impressão limpa do relatório CP/CR (sem filtros da tela)"], ["cpcrEmitir", "relatório CP/CR emitido por janela de filtro (PDF/XLSX direto, sem abrir a tela)"], ["salvarRelCols", "colunas personalizadas do relatório CP/CR escolhidas na janela de filtro"], ["printOutrosRef", "impressão própria de DFC e Posição por Conta"], ["listarEmpresasDaConta", "empresas de toda a conta no relatório (produtor de título de PJ)"], ["escopoImpressao", "cabeçalho do relatório mostra o escopo real (conta/produtor), não a fazenda ativa"],
  ],
  "app/financeiro/receber/page.tsx": [
    ["fProdutor", "filtro e coluna de Produtor"], ["Efetivar", "botão Efetivar previsão"], ["bClass", "classificação na baixa"], ["bNovaData", "nova data do saldo em recebimento parcial"],
    ["fAtalho", "atalhos de status"], ["Confirmar entrega (barter)", "baixa barter"],
  ],
};
for (const [tela, lista] of Object.entries(MARCADORES_POR_TELA)) {
  const src = readFileSync(new URL(`../../${tela}`, import.meta.url), "utf8");
  for (const [marcador, o_que] of lista) {
    test(`${tela} mantém: ${o_que}`, () => assert.ok(src.includes(marcador), `${tela} perdeu "${marcador}" (${o_que})`));
  }
}

for (const tela of TELAS) {
  const src = readFileSync(new URL(`../../${tela}`, import.meta.url), "utf8");
  for (const [marcador, o_que] of MARCADORES) {
    test(`${tela} mantém: ${o_que}`, () => assert.ok(src.includes(marcador), `${tela} perdeu "${marcador}" (${o_que})`));
  }
}

// Sincronização automática do SIEG (19/10/2026): sem este cron nenhuma conta atualiza NFs sozinha
test("vercel.json agenda a sincronização automática do SIEG", () => {
  const v = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
  assert.ok(v.includes("/api/cron/sieg-auto"), "vercel.json perdeu o cron /api/cron/sieg-auto");
});
test("sincronização SIEG grava a marca pelo fim da janela consultada, não por 'agora'", () => {
  const src = readFileSync(new URL("../../app/api/integracoes/sieg-sync/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("avancaMarca") && src.includes("marcaTs"), "a marca de última sincronização voltou a usar o horário do fim do processamento");
});
