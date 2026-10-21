// Edição manual de parcelas de contrato financeiro: Valor da Parcela = Amortização + Juros + Encargos.
// O usuário edita dois dos três (valor, amortização, juros) e o terceiro é calculado; com um só editado,
// o valor da parcela acompanha (ou, se editou o valor, a amortização absorve a diferença).

export type CampoValor = "valor_parcela" | "amortizacao" | "juros";
export type EdicaoParcela = {
  data_vencimento?: string;
  valor_parcela?: string;
  amortizacao?: string;
  juros?: string;
  /** Ordem em que os campos de valor foram editados (o mais recente por último). */
  ordem?: CampoValor[];
};
export type ParcelaValores = { valor_parcela: number; amortizacao: number; juros: number; despesas_acessorios?: number | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Número digitado: aceita "1234.56" (campo numérico) e "1.234,56" (formato brasileiro). */
export function numeroDigitado(s: string | undefined | null): number {
  const t = String(s ?? "").trim();
  if (!t) return NaN;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Registra a edição de um campo mantendo a ordem (o último editado vai para o fim). */
export function registrarEdicao(ed: EdicaoParcela | undefined, campo: keyof Omit<EdicaoParcela, "ordem">, valor: string): EdicaoParcela {
  const novo: EdicaoParcela = { ...(ed ?? {}), [campo]: valor };
  if (campo !== "data_vencimento") novo.ordem = [...(ed?.ordem ?? []).filter(c => c !== campo), campo as CampoValor];
  return novo;
}

/** Valores finais da parcela com a edição aplicada. `erro` quando a combinação dá valor negativo. */
export function resolverParcela(p: ParcelaValores, ed: EdicaoParcela | undefined): ParcelaValores & { erro?: string } {
  const acess = Number(p.despesas_acessorios ?? 0);
  const base = { valor_parcela: p.valor_parcela, amortizacao: p.amortizacao, juros: p.juros, despesas_acessorios: acess };
  if (!ed) return base;
  const editados = (ed.ordem ?? (["valor_parcela", "amortizacao", "juros"] as CampoValor[]).filter(c => ed[c] !== undefined))
    .filter(c => ed[c] !== undefined && Number.isFinite(numeroDigitado(ed[c])));
  if (editados.length === 0) return base;
  const v = (c: CampoValor) => numeroDigitado(ed[c]);

  let valor = base.valor_parcela, amort = base.amortizacao, juros = base.juros;
  if (editados.length === 1) {
    const c = editados[0];
    if (c === "valor_parcela") {
      valor = v(c);
      amort = r2(valor - acess - juros);
      if (amort < 0) { amort = 0; juros = Math.max(0, r2(valor - acess)); }
    } else if (c === "amortizacao") { amort = v(c); valor = r2(amort + juros + acess); }
    else { juros = v(c); valor = r2(amort + juros + acess); }
  } else {
    // Os dois editados por último ficam como o usuário digitou; o terceiro é calculado
    const fixos = editados.slice(-2);
    const tem = (c: CampoValor) => fixos.includes(c);
    if (tem("valor_parcela") && tem("amortizacao")) { valor = v("valor_parcela"); amort = v("amortizacao"); juros = r2(valor - acess - amort); }
    else if (tem("valor_parcela") && tem("juros")) { valor = v("valor_parcela"); juros = v("juros"); amort = r2(valor - acess - juros); }
    else { amort = v("amortizacao"); juros = v("juros"); valor = r2(amort + juros + acess); }
  }
  const out = { valor_parcela: r2(valor), amortizacao: r2(amort), juros: r2(juros), despesas_acessorios: acess };
  if (out.amortizacao < 0) return { ...out, erro: "A amortização ficaria negativa: o valor da parcela é menor que juros + encargos." };
  if (out.juros < 0) return { ...out, erro: "Os juros ficariam negativos: o valor da parcela é menor que amortização + encargos." };
  return out;
}
