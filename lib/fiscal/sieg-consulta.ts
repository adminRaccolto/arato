import type { SiegBaixarParams } from "../sieg";

export type PedidoConsultaSieg = {
  data_inicio?: string; data_fim?: string; base_periodo?: "emissao" | "upload";
  chaves_acesso?: string[]; numero_nf?: string; cnpj_emitente?: string; serie?: string;
};
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const numero = (v: unknown) => digitos(v).replace(/^0+(?=\d)/, "");
function dataISO(v: string, fim = false): string {
  const dia = v.slice(0, 10);
  const data = new Date(`${dia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dia)
    throw new Error("Informe uma data válida para a consulta.");
  return `${dia}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`;
}

/** Tela: emissão. Robô incremental sem período: recebimento no SIEG. */
export function prepararConsultaSieg(p: PedidoConsultaSieg) {
  if (p.base_periodo && !["emissao", "upload"].includes(p.base_periodo)) throw new Error("Base de período inválida.");
  const chaves = p.chaves_acesso ?? [];
  if (!Array.isArray(chaves) || chaves.length > 20 || chaves.some(c => typeof c !== "string" || !/^\d{44}$/.test(c) || c.slice(20, 22) !== "55"))
    throw new Error("Informe uma chave de NF-e com 44 dígitos (modelo 55).");
  const temNumero = p.numero_nf !== undefined;
  const pontual = chaves.length > 0 || temNumero;
  let inicio = p.data_inicio, fim = p.data_fim;
  let emitente = digitos(p.cnpj_emitente);
  if (temNumero && (!/^\d{1,9}$/.test(p.numero_nf ?? "") || emitente.length !== 14 || !inicio || !fim))
    throw new Error("Para localizar pelo número, informe número, CNPJ do fornecedor e período de emissão.");
  if (p.serie && !/^\d{1,3}$/.test(p.serie)) throw new Error("Série inválida.");
  if (chaves.length) {
    const meses = chaves.map(c => `20${c.slice(2, 4)}-${c.slice(4, 6)}`).sort();
    inicio = `${meses[0]}-01`;
    const ultimo = new Date(`${meses.at(-1)}-01T00:00:00.000Z`);
    ultimo.setUTCMonth(ultimo.getUTCMonth() + 1);
    ultimo.setUTCDate(0);
    fim = Number.isFinite(ultimo.getTime()) ? ultimo.toISOString().slice(0, 10) : "inválida";
    const emitentes = new Set(chaves.map(c => c.slice(6, 20)));
    if (emitentes.size === 1) emitente = [...emitentes][0];
  }
  if (!inicio && fim && p.base_periodo !== "upload") {
    inicio = new Date(new Date(dataISO(fim)).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  }
  const de = inicio ? dataISO(inicio) : undefined, ate = fim ? dataISO(fim, true) : undefined;
  if (de && ate && de > ate) throw new Error("A data inicial deve ser anterior à data final.");
  if (pontual && de && ate && new Date(ate).getTime() - new Date(de).getTime() > 55 * 86_400_000)
    throw new Error("Para localizar uma NF-e, informe um período de até 55 dias.");
  const base = pontual ? "emissao" : p.base_periodo ?? (de || ate ? "emissao" : "upload");
  return { pontual, base, inicio: de, fim: ate, emitente, chaves,
    numero: p.numero_nf ? numero(p.numero_nf) : "", serie: p.serie ? numero(p.serie) : "" };
}
export type ConsultaSieg = ReturnType<typeof prepararConsultaSieg>;
export function periodoSieg(base: string, inicio: string, fim: string): Pick<SiegBaixarParams, "DataEmissaoInicio" | "DataEmissaoFim" | "DataUploadInicio" | "DataUploadFim"> {
  return base === "emissao" ? { DataEmissaoInicio: inicio, DataEmissaoFim: fim } : { DataUploadInicio: inicio, DataUploadFim: fim };
}
export function correspondeConsultaSieg(n: { chave: string; numero?: string | null; serie?: string | null; data_emissao?: string; cnpj_emitente?: string | null; cnpj_destinatario?: string | null }, c: ConsultaSieg, destinos: string[]): boolean {
  if (c.chaves.length && !c.chaves.includes(n.chave)) return false;
  if (c.numero && numero(n.numero) !== c.numero) return false;
  if (c.emitente && digitos(n.cnpj_emitente) !== c.emitente) return false;
  if (c.serie && numero(n.serie) !== c.serie) return false;
  if (c.base === "emissao" && n.data_emissao && ((c.inicio && n.data_emissao < c.inicio.slice(0, 10)) || (c.fim && n.data_emissao > c.fim.slice(0, 10)))) return false;
  return destinos.map(digitos).includes(digitos(n.cnpj_destinatario));
}
export const autenticacaoSiegRecusada = (erro: unknown) => /HTTP\s*(401|403)\b|API Key inv[aá]lida/i.test(String(erro));
export const mensagemCredencialSieg = "O SIEG recusou as credenciais da integração. Verifique a configuração ativa do servidor; nenhuma busca foi confirmada.";
