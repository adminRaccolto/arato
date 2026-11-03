// Correção de adiantamento já descontado na folha. Regras puras: o que muda no desconto de cada folha e o que fazer com
// o salário. Salário pago nunca é alterado: a diferença vira título a pagar ou desconto em outra competência.

export type LadoCorrecao = { funcionario_id: string; competencia: string; valor: number };
export type EfeitoCorrecao = { funcionario_id: string; competencia: string; delta: number };
export type AcaoSalario = "atualizar" | "pagar_diferenca" | "descontar" | "nada";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Variação do desconto em cada folha. Mesma folha: a diferença. Funcionário ou competência diferente: sai de uma e entra na outra. */
export function efeitosCorrecao(antes: LadoCorrecao, depois: LadoCorrecao): EfeitoCorrecao[] {
  if (antes.funcionario_id === depois.funcionario_id && antes.competencia === depois.competencia) {
    const delta = r2(depois.valor - antes.valor);
    return delta === 0 ? [] : [{ funcionario_id: antes.funcionario_id, competencia: antes.competencia, delta }];
  }
  return [
    { funcionario_id: antes.funcionario_id, competencia: antes.competencia, delta: r2(-antes.valor) },
    { funcionario_id: depois.funcionario_id, competencia: depois.competencia, delta: r2(depois.valor) },
  ];
}

/** Desconto maior (delta > 0) reduz o salário; menor, aumenta. Pago: recebeu a mais vira desconto, recebeu a menos vira título. */
export function acaoSalario(delta: number, salarioPago: boolean): AcaoSalario {
  if (Math.abs(delta) < 0.005) return "nada";
  if (!salarioPago) return "atualizar";
  return delta > 0 ? "descontar" : "pagar_diferenca";
}
