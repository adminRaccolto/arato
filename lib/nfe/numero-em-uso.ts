// SEFAZ recusou porque a série e o número já existem em outra nota. Nada foi autorizado, então dá para tentar o número
// seguinte. A chave citada na mensagem é da nota antiga, não desta emissão.
export function numeroJaEmUso(cStat: string | null | undefined, xMotivo: string | null | undefined, chaveDestaNota: string): boolean {
  if (cStat === "539") return true;
  if (!/duplicidade/i.test(xMotivo ?? "")) return false;
  return (xMotivo ?? "").match(/\d{44}/)?.[0] !== chaveDestaNota;
}

export const mensagemNumeroEmUso = (serie: string | number, numero: string | number, xMotivo: string | null | undefined) =>
  `A série ${serie} já tem nota com o número ${numero}, e a nota NÃO foi emitida. Ajuste o próximo número desta IE em Parâmetros → Fiscal para depois do último usado. Resposta da SEFAZ: ${xMotivo ?? ""}`;
