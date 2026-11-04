import test from "node:test";
import assert from "node:assert/strict";
import { montarProcAutorizado } from "./documento-autorizado.ts";

const CTE = `<?xml version="1.0" encoding="UTF-8"?><CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="CTe1"/><Signature/></CTe>`;
const PROT = `<protCTe versao="4.00"><infProt><nProt>151</nProt></infProt></protCTe>`;

test("CT-e arquivado leva o documento assinado e o protocolo", () => {
  const xml = montarProcAutorizado("cte", CTE, PROT, "4.00");
  assert.equal(xml, `<?xml version="1.0" encoding="UTF-8"?><cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="CTe1"/><Signature/></CTe>${PROT}</cteProc>`);
});

test("MDF-e usa o envelope do modelo", () => {
  const xml = montarProcAutorizado("mdfe", "<MDFe/>", "<protMDFe/>", "3.00");
  assert.ok(xml.includes(`<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><MDFe/><protMDFe/></mdfeProc>`));
});

test("resposta que já traz o envelope não é embrulhada de novo", () => {
  const pronto = `<cteProc versao="4.00"><CTe/>${PROT}</cteProc>`;
  assert.equal(montarProcAutorizado("cte", CTE, pronto, "4.00"), pronto);
});
