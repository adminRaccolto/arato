import assert from "node:assert/strict";
import test from "node:test";
import { ehFundoDeModal } from "./fundo-modal.ts";

const base = { position: "fixed", backgroundColor: "rgba(0, 0, 0, 0.376)", width: 1440, height: 900, vw: 1440, vh: 900, temFilhos: true };
test("fundo escurecido de modal é reconhecido; camada transparente de menu e caixas comuns não", () => {
  assert.equal(ehFundoDeModal(base), true);
  assert.equal(ehFundoDeModal({ ...base, backgroundColor: "rgb(0, 0, 0)" }), true);
  assert.equal(ehFundoDeModal({ ...base, backgroundColor: "rgba(0, 0, 0, 0)" }), false);
  assert.equal(ehFundoDeModal({ ...base, backgroundColor: "transparent" }), false);
  assert.equal(ehFundoDeModal({ ...base, position: "absolute" }), false);
  assert.equal(ehFundoDeModal({ ...base, width: 600 }), false);
  assert.equal(ehFundoDeModal({ ...base, temFilhos: false }), false);
});
