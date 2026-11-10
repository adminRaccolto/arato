import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmarBorderoComSaldo } from "./confirmar-bordero.ts";
import { estornarBorderoComSaldo } from "./estornar-bordero.ts";
import { acumularPagamentoBordero, ratearMoeda, resumoBordero } from "./saldo-bordero.ts";

// Os cenários de baixa, estorno e falha no meio da gravação usam PostgreSQL real em bordero-atomico-sql.test.ts.
test("100/200 quitados por 300 conservam exatamente o saldo de cada conta",()=>{
  assert.deepEqual(ratearMoeda(300,[100,200]),[100,200]);
  assert.deepEqual(ratearMoeda(150,[100,200]),[50,100]);
});
test("centavos conservam o total sem pagar título sem saldo",()=>{
  assert.deepEqual(ratearMoeda(100,[1,1,1]),[33.34,33.33,33.33]);
  assert.deepEqual(ratearMoeda(.01,[0,1,1]),[0,.01,0]);
});
test("parcial mantém 150 no mesmo borderô; encargos não alteram o principal",()=>{
  const b={id:'b',fazenda_id:'f',tipo:'pagar' as const,status:'pendente' as const,valor_total:300};
  const pagamento=acumularPagamentoBordero(b,{valor_pago:150,valor_juros:3,valor_multa:6,valor_desconto:15});
  assert.deepEqual(resumoBordero({...b,...pagamento.patch,status:'pendente'}),{liquidado:150,saldo:150,status:'parcial'});
  assert.equal(pagamento.principal+pagamento.juros+pagamento.multa-pagamento.desconto,144);
});
test("valores e datas inválidos são recusados",()=>{
  const b={id:'b',fazenda_id:'f',tipo:'pagar' as const,status:'pendente' as const,valor_total:300};
  for(const valor_pago of [0,-1,Infinity,NaN,301]) assert.throws(()=>acumularPagamentoBordero(b,{valor_pago}));
  for(const novo_vencimento_saldo of ['2026-02-30','15/11/2026']) assert.throws(()=>acumularPagamentoBordero(b,{valor_pago:150,novo_vencimento_saldo}));
});
test("confirmação e estorno delegam à mesma transação, com idempotência estável",async()=>{
  const chamadas:unknown[]=[];
  const db={rpc:async(nome:string,args:unknown)=>{chamadas.push([nome,args]);return {data:{ok:true},error:null};}} as unknown as SupabaseClient;
  await confirmarBorderoComSaldo(db,'b','2026-11-10','c',{valor_pago:300,requisicao_id:'req',principal_anterior:0});
  await estornarBorderoComSaldo(db,'b');
  assert.deepEqual(chamadas,[['bordero_acao_atomica',{p_lote:'b',p_acao:'confirmar',p_data:'2026-11-10',p_conta:'c',p_titulo:{valor_pago:300,requisicao_id:'req',principal_anterior:0}}],['bordero_acao_atomica',{p_lote:'b',p_acao:'estornar'}]]);
});
