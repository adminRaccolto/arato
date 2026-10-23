/**
 * Títulos (CP) gerados por uma NFS-e — do produtor (lancamentos) e da Empresa (empresa_lancamentos).
 * Mesmo papel de titulos-nf.ts para a NF de Produtos: estornar/excluir a NFS-e tem que desfazer todos os títulos dela,
 * e não pode apagar título já pago, conciliado ou em borderô (antes o estorno apagava até título baixado e ignorava
 * o CP da Empresa, que ficava para trás).
 * Vínculos: produtor = nf_servicos.lancamento_id (1ª parcela) + as demais parcelas pelo agrupador; Empresa = título de
 * origem nf_servico com o mesmo nº de documento e prestador (a NFS-e não guarda o id do título da Empresa).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { motivosBloqueio, mensagemBloqueio, type TituloParaEstorno } from "./titulos-nf";

type NfseRow = { id: string; numero_nf: string | null; prestador_id: string | null; prestador_nome: string | null; empresa_id: string | null; lancamento_id: string | null };

async function carregar(sb: SupabaseClient, nfId: string) {
  const { data: nf } = await sb.from("nf_servicos").select("id, numero_nf, prestador_id, prestador_nome, empresa_id, lancamento_id").eq("id", nfId).maybeSingle();
  const n = nf as NfseRow | null;
  if (!n) return { nf: null, prod: [] as TituloParaEstorno[], emp: [] as TituloParaEstorno[] };
  let prod: TituloParaEstorno[] = [];
  if (n.lancamento_id) {
    const { data: primeiro } = await sb.from("lancamentos").select("id,status,conciliado,lote_id,valor,agrupador").eq("id", n.lancamento_id).maybeSingle();
    if (primeiro?.agrupador) prod = ((await sb.from("lancamentos").select("id,status,conciliado,lote_id,valor").eq("agrupador", primeiro.agrupador)).data ?? []) as TituloParaEstorno[];
    else if (primeiro) prod = [primeiro as TituloParaEstorno];
  }
  let emp: TituloParaEstorno[] = [];
  if (n.empresa_id && n.numero_nf) {
    let q = sb.from("empresa_lancamentos").select("id,status,conciliado,lote_id,valor").eq("empresa_id", n.empresa_id).eq("origem", "nf_servico").eq("numero_documento", n.numero_nf);
    q = n.prestador_id ? q.eq("pessoa_id", n.prestador_id) : q.eq("descricao", `NFS-e ${n.numero_nf} — ${n.prestador_nome ?? ""}`);
    emp = ((await q).data ?? []) as TituloParaEstorno[];
  }
  return { nf: n, prod, emp };
}

export async function titulosNfseBloqueiamEstorno(sb: SupabaseClient, nfId: string): Promise<string | null> {
  const { prod, emp } = await carregar(sb, nfId);
  return mensagemBloqueio([...motivosBloqueio(prod, "produtor"), ...motivosBloqueio(emp, "empresa")], "a NFS-e");
}

export async function excluirTitulosDaNfse(sb: SupabaseClient, nfId: string): Promise<void> {
  const { prod, emp } = await carregar(sb, nfId);
  await sb.from("nf_servicos").update({ lancamento_id: null }).eq("id", nfId);
  if (prod.length) {
    const { error } = await sb.from("lancamentos").delete().in("id", prod.map(t => t.id));
    if (error) throw new Error(`excluir títulos a pagar da NFS-e: ${error.message}`);
  }
  if (emp.length) {
    const { error } = await sb.from("empresa_lancamentos").delete().in("id", emp.map(t => t.id));
    if (error) throw new Error(`excluir títulos da Empresa da NFS-e: ${error.message}`);
  }
}
