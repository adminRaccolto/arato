/** Converte yyyy-mm-dd → dd/mm/yyyy (para exibição) */
export function toBR(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Converte dd/mm/yyyy → yyyy-mm-dd (para salvar no banco) */
export function toISO(br: string): string {
  const digits = br.replace(/\D/g, '');
  if (digits.length < 8) return '';
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  return `${y}-${m}-${d}`;
}

/** Formata a string enquanto o usuário digita: "21" → "21", "2112" → "21/12", "21122025" → "21/12/2025" */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Retorna a data de hoje no formato dd/mm/yyyy */
export function todayBR(): string {
  return toBR(new Date().toISOString().split('T')[0]);
}
