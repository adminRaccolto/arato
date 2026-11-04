// Texto e ordem das movimentações de transferência entre depósitos nas telas de estoque.
// O motivo gravado ("Transferência TRF-1 ← origem") não muda: a Auditoria Fiscal e a Rastreabilidade leem o número dele,
// e o texto novo vale também para o histórico, sem alterar nenhum registro.

export type DepositosDaTransferencia = { origem?: string | null; destino?: string | null };

const MOTIVO_TRANSFERENCIA = /^Transferência (TRF-\S+) (←|→)/;

export function numeroDaTransferencia(motivo?: string | null): string | null {
  return motivo?.match(MOTIVO_TRANSFERENCIA)?.[1] ?? null;
}

/** "Transferência TRF-1 — recebido de Depósito A" / "— enviado para Depósito B". Outros motivos voltam como estão. */
export function textoDoMotivo(motivo: string | null | undefined, depositos: Map<string, DepositosDaTransferencia>): string | null {
  const achou = motivo?.match(MOTIVO_TRANSFERENCIA);
  if (!achou) return motivo ?? null;
  const [, numero, seta] = achou;
  const deps = depositos.get(numero);
  return seta === "←"
    ? `Transferência ${numero} — recebido de ${deps?.origem || "origem não informada"}`
    : `Transferência ${numero} — enviado para ${deps?.destino || "destino não informado"}`;
}

type MovOrdenavel = { id?: string; data?: string | null; tipo: string; motivo?: string | null; created_at?: string | null };

/** Do mais antigo ao mais recente. No mesmo dia vale a hora de gravação; na mesma transferência, a saída vem antes da entrada. */
export function ordenarCronologico<T extends MovOrdenavel>(movs: T[]): T[] {
  return [...movs].sort((a, b) => {
    const porData = (a.data ?? "").localeCompare(b.data ?? "");
    if (porData) return porData;
    const trf = numeroDaTransferencia(a.motivo);
    if (trf && trf === numeroDaTransferencia(b.motivo) && a.tipo !== b.tipo) return a.tipo === "saida" ? -1 : 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "") || (a.id ?? "").localeCompare(b.id ?? "");
  });
}
