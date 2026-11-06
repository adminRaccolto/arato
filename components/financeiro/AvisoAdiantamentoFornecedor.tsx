"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

/** Informação na entrada da NF; a compensação é feita no CP, com validação do pagamento. */
export default function AvisoAdiantamentoFornecedor({ fazendaId, pessoaId, pedidoId }: { fazendaId?: string | null; pessoaId?: string | null; pedidoId?: string | null }) {
  type Linha = { id: string; descricao: string; moeda: string; saldo: number; credito: number | null; pedido: string | null };
  const chave = JSON.stringify([fazendaId, pessoaId, pedidoId]);
  const [consulta, setConsulta] = useState<{ chave: string; linhas: Linha[]; erro: string } | null>(null);
  const linhas = consulta?.chave === chave ? consulta.linhas : [];
  const erro = consulta?.chave === chave ? consulta.erro : "";
  useEffect(() => {
    let ativo = true;
    if (!fazendaId || !pessoaId) return;
    void (async () => {
      const { data, error } = await supabase.from("adiantamentos_fornecedor")
        .select("id,descricao,moeda,valor,valor_aplicado,pedido_compra_id")
        .eq("fazenda_id", fazendaId).eq("pessoa_id", pessoaId).in("status", ["em_aberto", "parcial"]);
      if (error) throw error;
      const itens = await Promise.all((data ?? []).map(async a => {
        const { data: credito, error } = await supabase.rpc("adiantamento_credito_pago", { p_adi: a.id });
        if (error && error.code !== "PGRST202") throw error;
        return { id: a.id, descricao: a.descricao, moeda: a.moeda, saldo: Number(a.valor)-Number(a.valor_aplicado), credito: error ? null : Number(credito ?? 0), pedido: a.pedido_compra_id };
      }));
      if (ativo) setConsulta({ chave, linhas: itens.filter(a => a.saldo > 0.005), erro: "" });
    })().catch(() => { if (ativo) setConsulta({ chave, linhas: [], erro: "Não foi possível conferir os adiantamentos deste fornecedor. Consulte Financeiro → Adiantamentos antes de pagar." }); });
    return () => { ativo = false; };
  }, [fazendaId, pessoaId, pedidoId, chave]);
  if (!linhas.length && !erro) return null;
  const fmt = (v: number, moeda: string) => v.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  return <div role="status" style={{ margin: "8px 0", padding: "8px 12px", border: "1px solid #DAC382", borderRadius: 8, background: "#FFF9E9", color: "#73501A", fontSize: 12 }}>
    <strong>Adiantamentos deste fornecedor</strong>
    {erro && <div>{erro}</div>}
    {linhas.map(a => <div key={a.id}>{a.descricao} — {a.credito === null ? `saldo registrado ${fmt(a.saldo, a.moeda)}; pagamento a conferir no CP` : `crédito pago ${fmt(a.credito, a.moeda)}`}
      {a.pedido ? a.pedido === pedidoId ? " · Vinculado a este pedido" : " · Vinculado a outro pedido; indisponível para esta NF" : " · Sem pedido vinculado"}</div>)}
    <div>Aplique o crédito na baixa do CP da NF para reduzir o valor a pagar pelo banco.</div>
  </div>;
}
