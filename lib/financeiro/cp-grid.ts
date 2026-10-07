import type { PagamentoLote } from "../supabase";
import { resumoBordero } from "./saldo-bordero";

export type TituloGrid = {
  id: string; origem_tabela: string; lote_id: string | null;
  status_normalizado: string | null; data_vencimento: string | null;
  descricao: string | null; pessoa_nome: string | null; empresa_nome: string | null;
  nfe_numero: string | null;
};
export type FiltrosCP = {
  origens: Set<string>; status: Set<string>; busca: string;
  de: string; ate: string; hoje: string;
};
export const chaveTitulo = (origem: string, id: string) => `${origem}:${id}`;
export function vinculosBorderos(borderos: PagamentoLote[]) {
  return new Set(borderos.flatMap(b => (b.itens ?? []).map(i =>
    chaveTitulo(i.origem_tabela ?? "lancamentos", i.lancamento_id))));
}
export function tituloVinculado(t: TituloGrid, vinculos: Set<string>) {
  return !!t.lote_id || vinculos.has(chaveTitulo(t.origem_tabela, t.id));
}
function texto(v: unknown) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
function corresponde(status: string, vencimento: string | null, campos: unknown[], f: FiltrosCP) {
  const vencido = (status === "em_aberto" || status === "vencido" || status === "parcial") && !!vencimento && vencimento < f.hoje;
  if (f.status.size && !f.status.has(status) && !(f.status.has("vencido") && vencido)
      && !(f.status.has("em_aberto") && (status === "vencido" || status === "parcial"))) return false;
  if (f.de && (!vencimento || vencimento < f.de)) return false;
  if (f.ate && (!vencimento || vencimento > f.ate)) return false;
  return !f.busca.trim() || campos.some(v => texto(v).includes(texto(f.busca.trim())));
}
export function filtrarTitulo(t: TituloGrid, f: FiltrosCP) {
  return (!f.origens.size || f.origens.has(t.origem_tabela)) && corresponde(
    t.status_normalizado ?? "", t.data_vencimento,
    [t.descricao, t.pessoa_nome, t.empresa_nome, t.nfe_numero], f);
}
export function itensDoBordero<T extends TituloGrid>(b: PagamentoLote, titulos: T[]) {
  const vinculos = vinculosBorderos([b]);
  return titulos.filter(t => t.lote_id === b.id || vinculos.has(chaveTitulo(t.origem_tabela, t.id)));
}
export function vencimentoBordero(b: PagamentoLote, titulos: TituloGrid[]) {
  return b.data_vencimento || itensDoBordero(b, titulos).map(t => t.data_vencimento)
    .filter((d): d is string => !!d).sort().at(-1) || null;
}
export function filtrarBordero(b: PagamentoLote, titulos: TituloGrid[], f: FiltrosCP) {
  if (f.origens.size && !(b.itens ?? []).some(i => f.origens.has(i.origem_tabela ?? "lancamentos"))) return false;
  const itens = itensDoBordero(b, titulos);
  return corresponde(resumoBordero(b).status, vencimentoBordero(b, titulos),
    [b.descricao, b.numero_titulo, ...itens.flatMap(t => [t.descricao, t.pessoa_nome, t.empresa_nome, t.nfe_numero])], f);
}

// O número sequencial do lançamento e documentos de contratos não são números de NF.
export function numeroNF(original: { nfe_numero?: unknown; numero_documento?: unknown }, numeroFiscal: unknown, origem: string, relNumero?: unknown): string | null {
  const candidatos = [numeroFiscal, original.nfe_numero, origem === "empresa_lancamentos" ? original.numero_documento : null, relNumero];
  for (const v of candidatos) if (v != null && String(v).trim()) return String(v).trim();
  return null;
}
