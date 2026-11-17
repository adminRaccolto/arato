import test from "node:test";
import assert from "node:assert/strict";
import { formatarIe, idIeDoModulo, ieEmitenteDaNota } from "./ie-nota";

test("IE do emitente da nota: gravada na nota → configuração do emitente usada; sem fonte, null", () => {
  const mapa = { "fiscal_pf_01614596174__ie_eb84e54d-13de-481a-b217-635c2dae399d": "136859909" };
  assert.equal(ieEmitenteDaNota({ emit_ie: "13.360.646-5" }, mapa), "133606465");
  assert.equal(ieEmitenteDaNota({ rascunho: true, modulo_key: "fiscal_pf_01614596174__ie_eb84e54d-13de-481a-b217-635c2dae399d" }, mapa), "136859909");
  assert.equal(ieEmitenteDaNota({ emit_ie: "" }, mapa), null);
  assert.equal(ieEmitenteDaNota(null, mapa), null);
  assert.equal(formatarIe("136859909"), "13.685.990-9");
  assert.equal(formatarIe("00137865210"), "00137865210");
  assert.equal(idIeDoModulo("fiscal_pf_01614596174__ie_eb84e54d-13de-481a-b217-635c2dae399d"), "eb84e54d-13de-481a-b217-635c2dae399d");
  assert.equal(idIeDoModulo("fiscal_pf_01614596174"), null);
});
