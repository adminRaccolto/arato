// Quando uma NF de entrada gera Contas a Pagar, pelo CFOP. Achado 29/10/2026: remessa de compra para entrega futura,
// comodato e garantia eram processados como compra — CP em dobro com o simples faturamento (R$ 72 mil apagados) e CP
// de bem que nem é do produtor.
//
//  - "entrega_futura": remessa da compra para entrega futura (5116/5117…). O produto entra (estoque), o CP vem da NF de
//    simples faturamento (5922/6922), que é a cobrança.
//  - "sem_cobranca": remessa/retorno que não é compra — comodato, conserto, demonstração, industrialização, armazenagem,
//    vasilhame. Não gera CP.
//  - "confirmar": CFOP genérico "outras entradas/saídas" (5949/6949/1949/2949) — pode ser compra com CFOP genérico ou
//    garantia/bonificação; o usuário decide se gera CP.
//  - "compra": o resto (inclusive o simples faturamento) gera CP como sempre.

const dig = (c: string | null | undefined) => String(c ?? "").replace(/\D/g, "");
const grupo = (...base: string[]) => base.flatMap(b => [`5${b}`, `6${b}`, `1${b}`, `2${b}`]);

export const CFOPS_ENTREGA_FUTURA = new Set(grupo("116", "117"));
export const CFOPS_SIMPLES_FATURAMENTO = new Set(grupo("922"));
export const CFOPS_SEM_COBRANCA = new Set([
  ...grupo("908", "909"),          // comodato (remessa / retorno)
  ...grupo("915", "916"),          // conserto/reparo (remessa / retorno)
  ...grupo("912", "913"),          // demonstração (remessa / retorno)
  ...grupo("901", "902"),          // industrialização por encomenda (remessa / retorno de insumo)
  ...grupo("905", "906", "907", "934"), // armazém geral / depósito fechado (remessa / retorno)
  ...grupo("920", "921"),          // vasilhame/sacaria (remessa / retorno)
]);
export const CFOPS_CONFIRMAR = new Set(grupo("949"));

export type CobrancaCfop = "compra" | "entrega_futura" | "sem_cobranca" | "confirmar";

/** Classificação da NF pelos CFOPs (cabeçalho e itens): todos os itens precisam cair no mesmo caso para não ser compra. */
export function cobrancaDaNf(cfopCabecalho: string | null | undefined, cfopsItens: (string | null | undefined)[] = []): CobrancaCfop {
  const cs = [...cfopsItens.map(dig), dig(cfopCabecalho)].filter(Boolean);
  if (!cs.length) return "compra";
  const usados = cfopsItens.map(dig).filter(Boolean);
  const lista = usados.length ? usados : cs;   // itens mandam; sem CFOP nos itens, vale o do cabeçalho
  if (lista.every(c => CFOPS_ENTREGA_FUTURA.has(c))) return "entrega_futura";
  if (lista.every(c => CFOPS_SEM_COBRANCA.has(c))) return "sem_cobranca";
  if (lista.every(c => CFOPS_CONFIRMAR.has(c) || CFOPS_SEM_COBRANCA.has(c)) && lista.some(c => CFOPS_CONFIRMAR.has(c))) return "confirmar";
  return "compra";
}

/** Texto curto do motivo de não gerar CP (para avisos e observações). */
export function motivoSemCp(c: CobrancaCfop): string {
  return c === "entrega_futura"
    ? "remessa de compra para entrega futura: o Contas a Pagar vem da NF de simples faturamento (CFOP 5922/6922)"
    : c === "sem_cobranca" ? "remessa/retorno sem cobrança (comodato, conserto, demonstração, industrialização, armazenagem ou vasilhame)"
    : "";
}
