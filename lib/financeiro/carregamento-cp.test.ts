import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarVinculosCP } from "./carregamento-cp.ts";
import { exibirNoCP } from "./visibilidade-cp.ts";

type Linha=Record<string,unknown>;
function banco(tabelas:Record<string,Linha[]>,falha?:string){
  const consultas:{tabela:string;campos:string}[]=[];
  return { consultas,db:{from(tabela:string){
    let filtradas=[...(tabelas[tabela]??[])],de=0,ate=Infinity,campos="";
    const q={select(c:string){campos=c;return q;},in(c:string,v:unknown[]){filtradas=filtradas.filter(r=>v.includes(r[c]));return q;},
      order(){return q;},range(a:number,b:number){de=a;ate=b;return q;},then(resolve:(r:unknown)=>unknown){
        consultas.push({tabela,campos});return Promise.resolve(falha===tabela?{data:null,error:new Error("Falha de leitura")}:{data:filtradas.slice(de,ate+1),error:null}).then(resolve);
      }};return q;
  }} as unknown as SupabaseClient };
}
const basico={origem_tabela:"lancamentos",fazenda_id:"faz",origem_lancamento:"nf_entrada",categoria:"Insumos",nfe_numero:"123"};
test("6.000 títulos comuns não geram uma consulta de vínculos a cada bloco do histórico",async()=>{
  const titulos=Array.from({length:6000},(_,i)=>({...basico,id:`cp${i}`}));
  titulos.push({...basico,id:"pedido",origem_lancamento:"pedido_compra",nfe_numero:""});
  const b=banco({adiantamentos_fornecedor:[{id:"a",fazenda_id:"faz",lancamento_id:"cp1"}],lancamentos:[
    {id:"cp1"},{id:"cp2",titulo_origem_id:"cp1"},{id:"pedido",pedido_compra_id:"p",nf_entrada_id:null},
  ]});
  const linhas=await carregarVinculosCP(b.db,titulos);
  assert.equal(b.consultas.length,3);
  assert.equal(linhas.filter(exibirNoCP).length,5998);
  assert.equal(exibirNoCP(linhas.find(t=>t.id==="cp1")!),false);
  assert.equal(exibirNoCP(linhas.find(t=>t.id==="cp2")!),false);
  assert.equal(exibirNoCP(linhas.find(t=>t.id==="pedido")!),false);
  assert.ok(b.consultas.every(c=>["adiantamentos_fornecedor","lancamentos"].includes(c.tabela)));
});
test("preserva NF antiga que reaproveitou título do pedido e separa produtor de empresa",async()=>{
  const b=banco({adiantamentos_fornecedor:[{id:"a",fazenda_id:"faz",lancamento_id:"a"}],lancamentos:[{id:"p",nf_entrada_id:"nf",pedido_compra_id:"pedido"}]});
  const t=await carregarVinculosCP(b.db,[{...basico,id:"p",origem_lancamento:"pedido_compra",nfe_numero:""},{...basico,id:"a",origem_tabela:"empresa_lancamentos"}]);
  assert.equal(t[0].nf_entrada_id,"nf");assert.equal(exibirNoCP(t[0]),true);assert.equal(t[1].adiantamento_fornecedor,undefined);
});
test("página adicional de adiantamentos não deixa registros históricos vazarem para o CP",async()=>{
  const adts=Array.from({length:1001},(_,i)=>({id:`a${i}`,fazenda_id:"faz",lancamento_id:`l${i}`}));
  const b=banco({adiantamentos_fornecedor:adts,lancamentos:[]});
  const [t]=await carregarVinculosCP(b.db,[{...basico,id:"l1000"}]);
  assert.equal(t.adiantamento_fornecedor,true);
  assert.equal(b.consultas.filter(c=>c.tabela==="adiantamentos_fornecedor").length,2);
});
test("erro na classificação não publica títulos sem validar seus vínculos",async()=>{
  const b=banco({},"adiantamentos_fornecedor");await assert.rejects(carregarVinculosCP(b.db,[{...basico,id:"a"}]),/Falha de leitura/);
});
