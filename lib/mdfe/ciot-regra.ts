// Regra de exigência do CIOT no MDF-e (definida com o dono em 24/09/2026).
// CIOT — Resolução ANTT 5.862/2020 e atualização de 24/05/2026. Confirmar sempre com a ANTT.
export function ciotExigido(p: {
  tpEmit?: string | null;                    // "1" prestador · "2" carga própria · "3" CT-e globalizado
  motoristaTipo?: string | null;             // (não usado desde 24/05/2026 — mantido por compatibilidade)
  veiculoProprietarioTipo?: string | null;   // (idem)
}): boolean {
  void p.motoristaTipo; void p.veiculoProprietarioTipo;
  // ATUALIZADO 25/09/2026: desde 24/05/2026 o CIOT é obrigatório em TODA operação de transporte
  // rodoviário REMUNERADA de carga — inclusive ETC com frota própria e motorista CLT. Continuam
  // dispensados: transporte internacional e carga própria SEM contratação de terceiros (tpEmit 2).
  // Frete pago entre empresas do mesmo grupo é operação remunerada → exige CIOT. Antes esta
  // regra só exigia com motorista TAC ou veículo de terceiro (regra pré-maio/2026).
  return p.tpEmit !== "2";
}
