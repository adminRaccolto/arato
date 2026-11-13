import test from "node:test";
import assert from "node:assert/strict";
import { saldoInicialFluxo } from "./saldo-inicial-fluxo";

test("fluxo sem saldo anterior inicia em zero mesmo com contas e atrasados",()=>{
  assert.equal(saldoInicialFluxo(false,1500,300,800),0);
});
test("fluxo com saldo anterior conserva a abertura e os atrasados opcionais",()=>{
  assert.equal(saldoInicialFluxo(true,1500),1500);
  assert.equal(saldoInicialFluxo(true,1500,300,800),1000);
  assert.equal(saldoInicialFluxo(true,-500,0,100),-600);
});
test("opção altera o acumulado, mantendo entradas e saídas do período",()=>{
  const periodos=[100,-250,50];
  const acumular=(inicial:number)=>periodos.map(v=>inicial+=v);
  assert.deepEqual(acumular(saldoInicialFluxo(false,1000)),[100,-150,-100]);
  assert.deepEqual(acumular(saldoInicialFluxo(true,1000)),[1100,850,900]);
  assert.deepEqual(periodos,[100,-250,50]);
});
