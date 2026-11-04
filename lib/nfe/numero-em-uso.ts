// SEFAZ recusou porque a série e o número já existem em outra nota. Nada foi autorizado, então dá para tentar o número
// seguinte. A chave citada na mensagem é da nota antiga, não desta emissão.
export function numeroJaEmUso(cStat: string | null | undefined, xMotivo: string | null | undefined, chaveDestaNota: string): boolean {
  if (cStat === "539") return true;
  if (!/duplicidade/i.test(xMotivo ?? "")) return false;
  return (xMotivo ?? "").match(/\d{44}/)?.[0] !== chaveDestaNota;
}

// Maior número já usado por este CPF/CNPJ nesta série, pelas chaves das notas (serve para qualquer IE do mesmo documento,
// porque a chave não tem IE). Assim, a primeira recusa pula direto para depois do último, sem bater na SEFAZ número a número.
export function maiorNumeroDaSerie(chaves: (string | null | undefined)[], documento: string, serie: string | number): number {
  const doc = String(documento).replace(/\D/g, "").padStart(14, "0");
  const ser = String(serie).padStart(3, "0");
  return chaves.reduce<number>((maior, c) => {
    if (!c || !/^\d{44}$/.test(c) || c.slice(6, 20) !== doc || c.slice(22, 25) !== ser) return maior;
    return Math.max(maior, Number(c.slice(25, 34)));
  }, 0);
}

export const mensagemNumeroEmUso = (serie: string | number, numero: string | number, xMotivo: string | null | undefined) =>
  `A série ${serie} já tem nota com o número ${numero}, e a nota NÃO foi emitida. Ajuste o próximo número desta IE em Parâmetros → Fiscal para depois do último usado. Resposta da SEFAZ: ${xMotivo ?? ""}`;
