// Títulos em aberto (CP ou CR) com o MESMO critério do grid de Contas a Pagar/Receber, para o painel inicial: a mesma
// fonte (rel_lancamentos, produtor e Empresa), por cliente, status em aberto/vencido/parcial, sem previsão, sem barter,
// e o valor é o SALDO em reais (dólar pela cotação do título ou a PTAX). Achado 29/10/2026: o painel lia a tabela crua,
// somava o valor cheio de título parcial, contava US$ como R$, ignorava a Empresa e só olhava 180 dias — os números não
// batiam com o que a tela de CP mostrava.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCotacoesUSD, cotacaoEfetiva, ehUSD, valorEmReais } from "./moeda";

export type TituloAberto = { id: string; data_vencimento: string; saldo: number; descricao: string | null };

export async function titulosAbertosAte(sb: SupabaseClient, p: { contaId?: string | null; fazendaIds: string[]; tipo: "pagar" | "receber"; ate: string; ptax?: number | null }): Promise<TituloAberto[]> {
  type Linha = { id: string; origem_tabela: string; moeda: string | null; valor: number | null; valor_pago: number | null; data_vencimento: string | null; descricao: string | null };
  const linhas: Linha[] = [];
  for (let i = 0; ; i += 1000) {
    let q = sb.from("rel_lancamentos").select("id, origem_tabela, moeda, valor, valor_pago, data_vencimento, descricao")
      .eq("tipo", p.tipo).in("status_normalizado", ["em_aberto", "vencido", "parcial"])
      .or("natureza.is.null,natureza.neq.previsao").neq("moeda", "barter").lte("data_vencimento", p.ate);
    q = p.contaId ? q.eq("conta_id", p.contaId) : q.in("fazenda_id", p.fazendaIds.length ? p.fazendaIds : [""]);
    const { data, error } = await q.order("id").range(i, i + 999);
    if (error) throw error;
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  const cot = await carregarCotacoesUSD(sb, linhas);
  return linhas.filter(l => l.data_vencimento).map(l => {
    const valorBRL = ehUSD(l.moeda) ? (valorEmReais(l.valor, l.moeda, cotacaoEfetiva(cot.get(l.id), p.ptax ?? null)) ?? 0) : Number(l.valor ?? 0);
    return { id: l.id, data_vencimento: l.data_vencimento!, descricao: l.descricao, saldo: Math.max(0, Math.round((valorBRL - Number(l.valor_pago ?? 0)) * 100) / 100) };
  }).filter(t => t.saldo > 0.005);
}
