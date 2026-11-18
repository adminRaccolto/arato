/** Uma operação com vários produtos conta uma vez. A área física é única por ciclo/talhão. */
export function estatisticasAplicacoes<
  T extends {
    operacao_id: string;
    tipo_op: string;
    ciclo_id: string;
    talhao_id?: string;
    area_ha: number;
    custo_total: number;
  },
>(linhas: T[]) {
  const areas = new Map<string, number>();
  let custo = 0,
    custoComArea = 0;
  for (const l of linhas) {
    custo += Number(l.custo_total) || 0;
    if (l.talhao_id && Number(l.area_ha) > 0) {
      const chave = `${l.ciclo_id}:${l.talhao_id}`;
      areas.set(chave, Math.max(areas.get(chave) ?? 0, l.area_ha));
      custoComArea += Number(l.custo_total) || 0;
    }
  }
  const area = [...areas.values()].reduce((s, a) => s + a, 0);
  return {
    custo,
    area,
    custo_ha: area > 0 ? custoComArea / area : 0,
    ops: new Set(linhas.map((l) => `${l.tipo_op}:${l.operacao_id}`)).size,
    semArea: linhas.filter((l) => !l.talhao_id || !(Number(l.area_ha) > 0))
      .length,
  };
}
