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
test("adiantamentos ao fornecedor aparecem no grid do CP (18/11/2026)",()=>{
  assert.equal(exibirNoCP({...nf,adiantamento_fornecedor:true}),true);
  assert.equal(exibirNoCP({...nf,categoria:"Adiantamento a Fornecedores"}),true);
  const pedidoAdiantado={...nf,id:"adi",origem_lancamento:"pedido_compra",nf_entrada_id:null,adiantamento_fornecedor:true};
  assert.equal(exibirNoCP(pedidoAdiantado),false);
  assert.equal(exibirNoCP({...nf,adiantamento_fornecedor:true,adiantamento_aplicado:true}),false, "todo usado em NF: sai do grid (25/11/2026)");
});
test("borderô só de pedidos é oculto; com adiantamento ou NF aparece",()=>{
  const ped={...nf,id:"ped",origem_lancamento:"pedido_compra",nf_entrada_id:null};
  const a={...nf,id:"adi",adiantamento_fornecedor:true};
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:ped.id}]},[ped,a,nf]),false);
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:a.id}]},[ped,a,nf]),true);
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:ped.id},{lancamento_id:nf.id}]},[ped,a,nf]),true);
  assert.equal(exibirBorderoNoCP({itens:[{lancamento_id:"antigo"}]},[ped,a,nf]),true);
});
