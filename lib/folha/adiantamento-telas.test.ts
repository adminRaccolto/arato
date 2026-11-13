/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requisicaoAdiantamento } from "./adiantamento.ts";

// Executa o handler real de cada tela, isolando somente React/rede. Não replica sua implementação.
function tela(caminho: string, api: (body: any) => Promise<any>) {
  const source = readFileSync(caminho,"utf8");
  const start=source.indexOf("  async function salvarAdiantamento() {");
  const end=source.indexOf("  async function cancelarAdiantamento",start);
  assert.ok(start>0&&end>start);
  const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const estado: any={adis:[],folhas:[{id:"folha",valor_liquido:1900}],folha:{id:"folha",funcionarios:[{id:"linha"}]},mensagem:"",modal:true,recargas:0};
  const alterar=(key: string)=>(value: any)=>{estado[key]=typeof value==="function"?value(estado[key]):value;};
  const deps: any={
    adiEmEnvio:{current:false},adiRequisicao:{current:null},confirmarAcao:async()=>true,
    fazendaId:"fazenda",adiEdit:{funcionario_id:"func",data:"2026-11-11",valor:300,competencia_ref:"2026-11"},
    adiConta:"banco",adiGratInfo:{lancada:1000,disponivel:1000},funcionarios:[{id:"func",nome:"Ana"}],
    requisicaoAdiantamento,moeda:String,setMsg:alterar("mensagem"),setSaving:alterar("saving"),setModalAdi:alterar("modal"),
    setAdiEdit:alterar("edicao"),setAdiantamentos:alterar("adis"),setFolhas:alterar("folhas"),setFolhaEdit:alterar("folha"),
    carregar:()=>{estado.recargas++;},apiFolha:api,
    baixarLancamento:()=>{throw new Error("A tela tentou baixar duas vezes");},
    supabase:{auth:{getSession:async()=>({data:{session:{access_token:"token-falso"}}})}},
    fetch:async(_url: string,req: any)=>({ok:true,json:()=>api(JSON.parse(req.body))}),
  };
  deps.fetchFinanceiro=deps.fetch;
  const executar=new Function(...Object.keys(deps),`${code};return salvarAdiantamento;`)(...Object.values(deps)) as ()=>Promise<void>;
  return {executar,estado,deps};
}
const resposta={ok:true,baixado:true,adiantamento:{id:"adi",funcionario_nome:"Ana",data:"2026-11-11",valor:300},
  folhas_atualizadas:[{id:"folha",valor_liquido:1600}],linhas_atualizadas:[{id:"linha",folha_id:"folha",adiantamento:300,cp_lancamento_id:"cp"}]};

for(const caminho of ["app/financeiro/folha/page.tsx","app/empresas/folha/page.tsx"]) {
  test(`${caminho}: uma operação, sem conta bancária (CP em aberto) e com chave; sem baixa adicional ou recarga geral`,async()=>{
    const chamadas: any[]=[];
    const {executar,estado}=tela(caminho,async body=>{chamadas.push(body);return resposta;});
    await executar();
    assert.equal(chamadas.length,1);assert.equal(chamadas[0].conta_bancaria,null);
    assert.match(chamadas[0].requisicao_id,/^[0-9a-f-]{36}$/i);
    assert.equal(estado.adis[0].id,"adi");assert.equal(estado.folhas[0].valor_liquido,1600);
    assert.equal(estado.recargas,0);assert.equal(estado.modal,false);assert.match(estado.mensagem,/em aberto/);
  });
  test(`${caminho}: erro de rede preserva chave para repetir sem duplicar`,async()=>{
    const chamadas: any[]=[];
    const {executar,estado}=tela(caminho,async body=>{chamadas.push(body);if(chamadas.length===1)throw new Error("Rede indisponível");return resposta;});
    await executar();assert.equal(estado.modal,true);assert.equal(estado.adis.length,0);
    await executar();assert.equal(chamadas.length,2);assert.equal(chamadas[0].requisicao_id,chamadas[1].requisicao_id);
    assert.equal(estado.adis.length,1);
  });
  test(`${caminho}: clique duplo não abre duas confirmações nem gera dois movimentos`,async()=>{
    let liberar: (value: any)=>void=()=>{};let chamadas=0;
    const {executar,estado}=tela(caminho,async()=>{chamadas++;return new Promise(r=>{liberar=r;});});
    const primeira=executar();await new Promise(r=>setTimeout(r,0));
    await executar();assert.equal(chamadas,1);
    liberar(resposta);await primeira;assert.equal(estado.adis.length,1);
  });
}
