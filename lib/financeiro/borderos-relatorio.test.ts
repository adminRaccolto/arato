import assert from "node:assert/strict";
import test from "node:test";
import type { Lancamento, PagamentoLote } from "../supabase.ts";
import { agruparBorderosRelatorio, datasBorderosRelatorio } from "./borderos-relatorio.ts";
const b={id:'b',fazenda_id:'f',tipo:'pagar',status:'pago',valor_total:300,valor_pago:300,data_vencimento:'2026-11-15',data_pagamento:'2026-11-10',numero_titulo:'123'} as PagamentoLote;
const a={id:'a',fazenda_id:'f',tipo:'pagar',lote_id:'b',moeda:'BRL',valor:100,valor_pago:100,status:'baixado',descricao:'NF A',data_vencimento:'2026-10-01',pessoa_id:'forn',categoria:'Peças'} as Lancamento;
const c={...a,id:'c',valor:200,valor_pago:200,descricao:'NF B',empresa_id:'pj',categoria:'Serviços'} as Lancamento;
test('relatório mostra um borderô de300 com detalhes100/200, sem duplicar',()=>{
 const rows=agruparBorderosRelatorio([a,c],[a,c],[b],5);
 assert.equal(rows.length,1); assert.equal(rows[0].valor,300); assert.equal(rows[0].valor_pago,300);
 assert.deepEqual(rows[0].bordero?.titulos.map(t=>t.valor),[100,200]);
 assert.equal(rows[0].categoria,'Diversas'); assert.equal(rows[0].bordero?.divergente,false);
 assert.match(rows[0].observacao!,/100.00.*200.00/);
});
test('filtro por produtor/OG não traz outras contas do borderô nem infla o total',()=>{
 const rows=agruparBorderosRelatorio([a],[a,c],[b],5);
 assert.equal(rows[0].valor,100);assert.equal(rows[0].bordero?.filtrado,true); assert.equal(rows[0].bordero?.quantidade,2);
});
test('data e banco dos filtros vêm do borderô',()=>{
 const rows=datasBorderosRelatorio([a,c],[{...b,conta_bancaria:'banco'}]);
 assert.equal(rows[0].data_vencimento,'2026-11-15');assert.equal(rows[0].data_baixa,'2026-11-10');assert.equal(rows[1].conta_bancaria,'banco');
 assert.equal(a.data_vencimento,'2026-10-01');
});
test('avulsos e borderôs ausentes continuam presentes; divergência fica explícita',()=>{
 const livre={...a,id:'livre',lote_id:undefined};
 const rows=agruparBorderosRelatorio([a,c,livre],[a,c,livre],[{...b,valor_total:301}],5);
 assert.equal(rows.length,2);assert.equal(rows[0].bordero?.divergente,true);assert.equal(rows[1].id,'livre');
 assert.equal(agruparBorderosRelatorio([a],[a],[],5)[0].id,'a');
});
test('desconto/juros afetam caixa, preservam o principal e a situação',()=>{
 const parcial={...a,status:'parcial' as const,valor_pago:49,valor_juros:1,valor_desconto:2};
 const rows=agruparBorderosRelatorio([parcial],[parcial],[{...b,valor_total:100}],5);
 assert.equal(rows[0].valor,100);assert.equal(rows[0].valor_pago,49);assert.equal(rows[0].status,'parcial');
});

test('legado pago sem valor_pago explícito mantém quitação e valor real no relatório',()=>{
 const rows=agruparBorderosRelatorio([{...a,valor_pago:undefined}],[{...a,valor_pago:undefined}],[{...b,valor_total:100}],5);
 assert.equal(rows[0].valor_pago,100);assert.equal(rows[0].status,'baixado');
});
