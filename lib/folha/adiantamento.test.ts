import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarAdiantamentoFuncionario, requisicaoAdiantamento, type DadosAdiantamento } from "./adiantamento.ts";

const dados: DadosAdiantamento = { fazenda_id:"f",funcionario_id:"p",data:"2026-11-11",valor:300,competencia_ref:"2026-11",conta_bancaria:"b" };
test("falha de rede mantém a mesma chave; mudanças financeiras iniciam outra tentativa",()=>{
  let n=0;const gerar=()=>`req-${++n}`;
  const first=requisicaoAdiantamento(null,dados,gerar);
  assert.equal(requisicaoAdiantamento(first,{...dados},gerar),first);
  for(const patch of [{valor:301},{conta_bancaria:"c"},{competencia_ref:"2026-12"},{funcionario_id:"q"},{tipo:"gratificacao" as const}]) {
    assert.notEqual(requisicaoAdiantamento(first,{...dados,...patch},gerar).id,first.id);
  }
});
test("valores equivalentes dos campos opcionais não mudam a tentativa",()=>{
  const first=requisicaoAdiantamento(null,{...dados,descricao:"Motivo"},()=>"req");
  assert.equal(requisicaoAdiantamento(first,{...dados,descricao:" Motivo ",tipo:"salario"},()=>"outra"),first);
});
test("servidor faz uma única operação financeira e devolve o CP já baixado",async()=>{
  const chamadas: unknown[]=[];const result={ok:true,baixado:true,lancamento_id:"cp"};
  const db={rpc:async(...args: unknown[])=>{chamadas.push(args);return {data:result,error:null};}} as unknown as SupabaseClient;
  assert.equal(await criarAdiantamentoFuncionario(db,dados,"req","user"),result);
  assert.deepEqual(chamadas,[["folha_criar_adiantamento",{p_dados:dados,p_requisicao:"req",p_usuario:"user"}]]);
});
test("sem a migração não executa fallback com gravações separadas ou reconstrução de folhas",async()=>{
  let n=0;const db={rpc:async()=>{n++;return {data:null,error:{code:"PGRST202",message:"ausente"}};}} as unknown as SupabaseClient;
  await assert.rejects(criarAdiantamentoFuncionario(db,dados,"req","user"),/Seção 432/);
  assert.equal(n,1);
});
test("erro financeiro não vira sucesso",async()=>{
  const db={rpc:async()=>({data:null,error:{code:"P0001",message:"Conta de outro cliente"}})} as unknown as SupabaseClient;
  await assert.rejects(criarAdiantamentoFuncionario(db,dados,"req","user"),/outro cliente/);
});
