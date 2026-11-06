import assert from "node:assert/strict";
import test from "node:test";
import { exibirNoCP, exibirBorderoNoCP } from "./visibilidade-cp.ts";
const nf={id:"nf",origem_tabela:"lancamentos",origem_lancamento:"nf_entrada",nf_entrada_id:"nf1"};
test("pedido fica fora do CP e a NF vinculada continua visível",()=>{
  assert.equal(exibirNoCP({...nf,id:"pedido",origem_lancamento:"pedido_compra",nf_entrada_id:null}),false);
  assert.equal(exibirNoCP({...nf,origem_lancamento:"pedido_compra"}),true);
  assert.equal(exibirNoCP(nf),true);
  assert.equal(exibirNoCP({...nf,origem_lancamento:"pedido_compra",nf_entrada_id:null,nfe_numero:"123"}),true);
});
test("adiantamentos ao fornecedor, com ou sem pedido e partes pagas, ficam fora do grid",()=>{
  assert.equal(exibirNoCP({...nf,adiantamento_fornecedor:true}),false);
  assert.equal(exibirNoCP({...nf,categoria:"Adiantamento a Fornecedores"}),false);
  assert.equal(exibirNoCP({...nf,categoria:"Adiantamento a funcionários"}),true);
});
test("borderô só de pedidos/adiantamentos é oculto; misto conserva a NF e valores",()=>{
  const a={...nf,id:"adi",adiantamento_fornecedor:true};
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:a.id}]},[a,nf]),false);
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:a.id},{lancamento_id:nf.id}]},[a,nf]),true);
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:"antigo"}]},[a,nf]),true);
});
