// Só uma execução por vez refaz as previsões de uma folha. Duas ao mesmo tempo criavam um título cada, e só o último
// ficava ligado à linha: os outros viravam previsão solta, sem nada que os apagasse depois (233 títulos em 04/11/2026).
export const TRAVA_VALIDADE_MS = 120_000;
export const TRAVA_ESPERA_MS = 500;
export const TRAVA_TENTATIVAS = 40;

export type Reserva = "reservada" | "ocupada" | "sem_coluna";

export async function comTravaDaFolha<T>(
  reservar: () => Promise<Reserva>,
  liberar: () => Promise<unknown>,
  fn: () => Promise<T>,
  esperar: () => Promise<unknown> = () => new Promise(r => setTimeout(r, TRAVA_ESPERA_MS)),
): Promise<T> {
  for (let i = 0; i < TRAVA_TENTATIVAS; i++) {
    const r = await reservar();
    if (r === "sem_coluna") return fn(); // Seção 412 ainda não rodada: segue sem trava
    if (r === "reservada") {
      try { return await fn(); } finally { await liberar(); }
    }
    await esperar();
  }
  throw new Error("Esta folha está sendo atualizada por outra operação. Aguarde um instante e tente de novo.");
}
