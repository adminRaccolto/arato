import assert from "node:assert/strict";
import test from "node:test";
import { centroServicoMaquinas, rotuloPatrimonioServico } from "./servico-maquina.ts";
test("centro Máquinas e seus filhos permitem apropriação; despesas comuns permanecem sem patrimônio",()=>{
  const centros=[{id:"m",nome:"Máquinas"},{id:"filho",nome:"Serviços terceirizados",parent_id:"m"},{id:"a",nome:"Administrativo"},{id:"f",nome:"Frota",manutencao_maquinas:true}];
  for(const id of ["m","filho","f"])assert.equal(centroServicoMaquinas(id,centros),true);
  assert.equal(centroServicoMaquinas("a",centros),false);assert.equal(centroServicoMaquinas("",centros),false);
});
test("cadastro com ciclo na hierarquia não trava o processamento",()=>{
  assert.equal(centroServicoMaquinas("a",[{id:"a",nome:"Um",parent_id:"b"},{id:"b",nome:"Dois",parent_id:"a"}]),false);
});
test("a máquina é identificada pelo patrimônio, nome e placa",()=>{
  assert.equal(rotuloPatrimonioServico({nome:"Trator",patrimonio:"123",placa:"ABC1D23"}),"Patrimônio 123 · Trator · ABC1D23");
  assert.equal(rotuloPatrimonioServico({nome:"Implemento"}),"Sem nº de patrimônio · Implemento");
});
