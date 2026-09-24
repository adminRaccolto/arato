// Regra de exigência do CIOT no MDF-e (definida com o dono em 24/09/2026).
// Transporte remunerado de terceiros: o CIOT é exigido quando o transportador contratado é
// autônomo (TAC) — motorista TAC ou veículo que NÃO é da própria transportadora
// (agregado/terceiro). Motorista CLT em veículo próprio de uma ETC não gera CIOT.
// Carga própria (tpEmit "2") nunca exige. Confirmar sempre com o contador/ANTT.
export function ciotExigido(p: {
  tpEmit?: string | null;                    // "1" prestador · "2" carga própria · "3" CT-e globalizado
  motoristaTipo?: string | null;             // "clt" | "tac" | ...
  veiculoProprietarioTipo?: string | null;   // "proprio" | "terceiro" | "agregado" | ...
}): boolean {
  if (p.tpEmit === "2") return false;
  if ((p.motoristaTipo ?? "").toLowerCase() === "tac") return true;
  const prop = (p.veiculoProprietarioTipo ?? "").toLowerCase();
  return !!prop && prop !== "proprio";
}
