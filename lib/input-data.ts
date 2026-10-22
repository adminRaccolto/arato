export type TipoData = "date" | "datetime-local" | "month";

export function exibirData(iso?: string | null, tipo: TipoData = "date"): string {
  if (tipo === "month") {
    if (!iso || !/^\d{4}-\d{2}$/.test(iso)) return "";
    const [ano, mes] = iso.split("-");
    return `${mes}/${ano}`;
  }
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  const data = `${dia}/${mes}/${ano}`;
  return tipo === "datetime-local" && iso[10] === "T"
    ? `${data} ${iso.slice(11, 16)}`
    : data;
}

export function mascararData(raw: string, tipo: TipoData = "date"): string {
  if (tipo === "month") {
    const nums = raw.replace(/\D/g, "").slice(0, 6);
    return nums.length > 2 ? `${nums.slice(0, 2)}/${nums.slice(2)}` : nums;
  }
  const nums = raw.replace(/\D/g, "").slice(0, tipo === "date" ? 8 : 12);
  let out = nums.slice(0, 2);
  if (nums.length > 2) out += "/" + nums.slice(2, 4);
  if (nums.length > 4) out += "/" + nums.slice(4, 8);
  if (nums.length > 8) out += " " + nums.slice(8, 10);
  if (nums.length > 10) out += ":" + nums.slice(10, 12);
  return out;
}

export function dataParaIso(display: string, tipo: TipoData = "date", validar = true): string {
  const nums = display.replace(/\D/g, "");
  if (tipo === "month") {
    if (nums.length !== 6) return "";
    const mes = nums.slice(0, 2), ano = nums.slice(2);
    if (validar && (Number(ano) < 1 || Number(mes) < 1 || Number(mes) > 12)) return "";
    return `${ano}-${mes}`;
  }
  if (nums.length !== (tipo === "date" ? 8 : 12)) return "";
  const dia = nums.slice(0, 2), mes = nums.slice(2, 4), ano = nums.slice(4, 8);
  const hora = nums.slice(8, 10), minuto = nums.slice(10, 12);
  if (validar) {
    const a = Number(ano), m = Number(mes), d = Number(dia);
    const bissexto = a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0);
    const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (a < 1 || m < 1 || m > 12 || d < 1 || d > diasNoMes[m - 1]) return "";
    if (tipo === "datetime-local" && (Number(hora) > 23 || Number(minuto) > 59)) return "";
  }
  const data = `${ano}-${mes}-${dia}`;
  return tipo === "datetime-local" ? `${data}T${hora}:${minuto}` : data;
}

/**
 * Dia além do fim do mês (31/09, 30/02, 29/02 em ano comum) vira o último dia daquele mês.
 * Devolve o texto corrigido (dd/mm/aaaa[ hh:mm]) ou null quando não há o que corrigir.
 * Antes a data inexistente era descartada em silêncio e o filtro ficava "sem data" (relatório sem data final).
 */
export function corrigirFimDoMes(display: string, tipo: TipoData = "date"): string | null {
  if (tipo === "month") return null;
  const nums = display.replace(/\D/g, "");
  if (nums.length !== (tipo === "date" ? 8 : 12)) return null;
  const d = Number(nums.slice(0, 2)), m = Number(nums.slice(2, 4)), a = Number(nums.slice(4, 8));
  if (a < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (d <= ultimo) return null;
  const novo = `${String(ultimo).padStart(2, "0")}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`;
  return tipo === "datetime-local" ? `${novo} ${nums.slice(8, 10)}:${nums.slice(10, 12)}` : novo;
}

export function dataLocalAgora(tipo: TipoData = "date", agora = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (tipo === "month") return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}`;
  const data = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
  return tipo === "datetime-local" ? `${data}T${pad(agora.getHours())}:${pad(agora.getMinutes())}` : data;
}
