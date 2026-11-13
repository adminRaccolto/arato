import test from "node:test";
import assert from "node:assert/strict";
import { preservarTituloDaFolha } from "./inativacao";

test("sincronização preserva título real ou movimentado mesmo antes da baixa integral",()=>{
 const base={natureza:"previsao",status:"em_aberto"};assert.equal(preservarTituloDaFolha(base),false);
 for(const patch of [{natureza:"real"},{status:"baixado"},{status:"pago"},{status:"parcial"},{valor_pago:100},{conciliado:true},
  {lote_id:"lote"},{contrato_financeiro_id:"contrato"},{fatura_cartao_id:"cartao"},{titulo_origem_id:"origem"},{data_baixa:"2026-11-13"}])
  assert.equal(preservarTituloDaFolha({...base,...patch}),true,JSON.stringify(patch));
});
