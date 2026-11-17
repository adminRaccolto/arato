import test from "node:test";
import assert from "node:assert/strict";
import { bancoTemMarcasPorDocumento, ogAceitaDocumento } from "./og-documentos";

test("marca própria vale; NULL segue a regra antiga (a mesma do preenchimento da Seção 455)", () => {
  const soNf = { tipo: "despesa", permite_notas_fiscais: true, permite_cp_cr: false };
  const soCp = { tipo: "despesa", permite_notas_fiscais: false, permite_cp_cr: true };
  const receitaNf = { tipo: "receita", permite_notas_fiscais: true, permite_cp_cr: true };
  // Regra antiga: NF = NF ou despesa de CP; NFS = despesa de NF ou CP; CT-e = despesa de CP
  assert.deepEqual(["nf_produtos", "nfs", "cte"].map(d => ogAceitaDocumento(soNf, d as never)), [true, true, false]);
  assert.deepEqual(["nf_produtos", "nfs", "cte"].map(d => ogAceitaDocumento(soCp, d as never)), [true, true, true]);
  assert.deepEqual(["nf_produtos", "nfs", "cte"].map(d => ogAceitaDocumento(receitaNf, d as never)), [true, false, false]);
  // Marcas próprias mandam, inclusive false
  const marcada = { ...soCp, permite_nf_produtos: false, permite_nfs: true, permite_cte: false };
  assert.deepEqual(["nf_produtos", "nfs", "cte"].map(d => ogAceitaDocumento(marcada, d as never)), [false, true, false]);
  assert.equal(bancoTemMarcasPorDocumento([{ id: 1, permite_nfs: null }]), true);
  assert.equal(bancoTemMarcasPorDocumento([{ id: 1 }]), false);
});
