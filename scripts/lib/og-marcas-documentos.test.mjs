import test from 'node:test';
import assert from 'node:assert/strict';
import { sugerirMarcas } from './og-marcas-documentos.mjs';

const og = (classificacao, descricao, extra = {}) => ({ tipo: 'despesa', classificacao, descricao, permite_notas_fiscais: true, permite_cp_cr: true, ...extra });
const todas = { nf_produtos: true, nfs: true, cte: true };
const so = s => ({ nf_produtos: s.nf_produtos, nfs: s.nfs, cte: s.cte });

test('sugestão por nome/grupo', () => {
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.01.001', 'COMPRA DE DEFENSIVOS'), todas)), { nf_produtos: true, nfs: false, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.07.001', 'FRETES PRODUÇÃO'), todas)), { nf_produtos: false, nfs: false, cte: true });
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.03.001', 'MANUTENÇÃO DE MAQ. / EQUIP. / IMPLEM.'), todas)), { nf_produtos: true, nfs: true, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.03.004', 'COMPRA DE PEÇAS PARA ESTOQUE'), todas)), { nf_produtos: true, nfs: false, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.01.02.01.02.002', 'ASSESSORIA CONTÁBIL'), todas)), { nf_produtos: false, nfs: true, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.10.001', 'SALÁRIOS - FAZ', { permite_notas_fiscais: false }), todas)), { nf_produtos: false, nfs: false, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.02.01.05.001', 'DESPESAS PARTICULARES - SEM FINANCEIRO', { permite_cp_cr: false }), todas)), { nf_produtos: true, nfs: true, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('2.01.02.01.01.001', 'ÁGUA', { permite_notas_fiscais: false }), todas)), { nf_produtos: false, nfs: false, cte: false });
});

test('grupo sem nota hoje não entra; RH não vira serviço; grupo 4: mercadoria só em NF, financeiro fora', () => {
  const nada = { nf_produtos: false, nfs: false, cte: false };
  assert.deepEqual(so(sugerirMarcas(og('2.01.01.03', 'MANUTENÇÃO E REPAROS', { permite_notas_fiscais: false, permite_cp_cr: false }), nada)), nada);
  assert.deepEqual(so(sugerirMarcas(og('2.01.02.01.03.001', 'SALÁRIOS - ADM', { permite_notas_fiscais: false }), todas)), nada);
  const rh = sugerirMarcas(og('2.01.01.10.099', 'RECURSOS HUMANOS - OUTROS', { permite_notas_fiscais: false }), todas);
  assert.equal(rh.nfs, false);
  assert.deepEqual(so(sugerirMarcas(og('4.04', 'REMESSA PARA ARMAZENAGEM (SAÍDA)'), todas)), { nf_produtos: true, nfs: false, cte: false });
  assert.deepEqual(so(sugerirMarcas(og('4.08', 'SAQUES', { permite_notas_fiscais: false }), todas)), nada);
});

test('uso real nunca sai da sugestão; receita não muda', () => {
  const s = sugerirMarcas(og('2.01.02.01.04.008', 'TAXAS DIVERSAS', { permite_notas_fiscais: false }), todas, { nfs: 3 });
  assert.deepEqual(so(s), { nf_produtos: false, nfs: true, cte: false });
  assert.match(s.motivo, /usada em NFS/);
  const r = sugerirMarcas({ ...og('1.01.01.01', 'VENDA DE GRÃOS'), tipo: 'receita' }, { nf_produtos: true, nfs: false, cte: false });
  assert.deepEqual(so(r), { nf_produtos: true, nfs: false, cte: false });
});
