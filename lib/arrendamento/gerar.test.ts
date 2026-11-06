import { test } from "node:test";
import assert from "node:assert/strict";
import { conciliarContratos, parcelaExistente, produtoDoContrato } from "./gerar.ts";

test("parcela existente: mesma safra e commodity; sem safra casa pelo ano do vencimento", () => {
  const ex = [
    { id: "a", ano_safra_id: "s27", commodity: "Soja", data_vencimento: "2027-04-30" },
    { id: "b", ano_safra_id: null, commodity: "Soja", data_vencimento: "2024-04-30" },
    { id: "c", ano_safra_id: null, commodity: "Milho", data_vencimento: "2024-07-31" },
  ];
  assert.equal(parcelaExistente(ex, { ano_safra_id: "s27", commodity: "Soja", data_vencimento: "2027-04-30" })?.id, "a");
  assert.equal(parcelaExistente(ex, { ano_safra_id: "s24", commodity: "Soja", data_vencimento: "2024-04-30" })?.id, "b");
  assert.equal(parcelaExistente(ex, { ano_safra_id: "s24", commodity: "Milho", data_vencimento: "2024-07-31" })?.id, "c");
  assert.equal(parcelaExistente(ex, { ano_safra_id: "s25", commodity: "Soja", data_vencimento: "2025-04-30" }), undefined);
});

test("contrato de grãos só para parcela em sacas, com safra e ainda não paga", () => {
  assert.equal(produtoDoContrato("Soja ref."), null);
  const parcelas = [
    { id: "1", ano_safra_id: "s27", commodity: "Soja", data_vencimento: "2027-04-30", sacas_previstas: 100, status: "pendente" },
    { id: "2", ano_safra_id: "s28", commodity: "Soja", data_vencimento: "2028-04-30", sacas_previstas: 100, status: "pendente" },
    { id: "3", ano_safra_id: "s29", commodity: "Soja", data_vencimento: "2029-04-30", sacas_previstas: 100, status: "pago" },
    { id: "4", ano_safra_id: null, commodity: "Soja", data_vencimento: "2024-04-30", sacas_previstas: 100, status: "pendente" },
    { id: "5", ano_safra_id: "s30", commodity: "Soja ref.", data_vencimento: "2030-04-30", sacas_previstas: 100, status: "pendente" },
    { id: "6", ano_safra_id: "s31", commodity: "Milho", data_vencimento: "2031-07-31", sacas_previstas: 80, status: "pendente" },
  ];
  const contratos = [
    { id: "c28", ano_safra_id: "s28", produto: "Soja", quantidade_sc: 90, entregue_sc: 0, data_entrega: "2028-04-30" },
    { id: "c31", ano_safra_id: "s31", produto: "Milho", quantidade_sc: 50, entregue_sc: 10, data_entrega: "2031-07-31" },
  ];
  const r = conciliarContratos(parcelas, contratos);
  assert.deepEqual(r.criar.map(p => p.id), ["1"]);
  assert.deepEqual(r.atualizar, [{ id: "c28", quantidade_sc: 100, data_entrega: "2028-04-30" }]); // c31 já teve entrega
});
