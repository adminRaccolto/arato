import { OPCOES_CST_ICMS } from "../nfe/cst-por-cfop";

/** Opções suportadas pelo gerador do XML para ICMS no regime normal. */
export const OPCOES_CST_EMISSAO = [
  { v: "000", rotulo: "000 — Tributada integralmente" },
  { v: "020", rotulo: "020 — Com redução de base" },
  ...OPCOES_CST_ICMS,
];

type Campos = { cfop: string; cst_icms: string; aliq_icms: string; red_bc: string };
export function icmsDaEmissao(f: Campos): { cst_icms?: string; cst_icms_manual?: boolean; pICMS?: number; pRedBC?: number } {
  const cst = f.cst_icms.trim();
  if (cst && !OPCOES_CST_EMISSAO.some(o => o.v === cst)) throw new Error("Selecione um CST do ICMS suportado pela emissão.");
  const percentual = (v: string, nome: string) => {
    if (!v.trim()) return undefined;
    const n = Number(v.trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${nome}: informe um percentual entre 0 e 100.`);
    return n;
  };
  const comAliquota = ["000", "020", "051"].includes(cst) || (!cst && ["5556", "6556"].includes(f.cfop.replace(/\D/g, "")));
  const comReducao = cst === "020" || (!cst && ["5556", "6556"].includes(f.cfop.replace(/\D/g, "")));
  const pRedBC = comReducao ? percentual(f.red_bc, "Redução da base ICMS") : undefined;
  if (cst === "020" && pRedBC === undefined) throw new Error("Informe a redução da base para o CST 020.");
  return {
    ...(cst ? { cst_icms: cst.slice(-2), cst_icms_manual: true } : {}),
    ...(comAliquota ? { pICMS: percentual(f.aliq_icms, "Alíquota ICMS") } : {}),
    ...(comReducao ? { pRedBC } : {}),
  };
}
