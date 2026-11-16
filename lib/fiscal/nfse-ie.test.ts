import test from "node:test";
import assert from "node:assert/strict";
import { escolherIeTomador, ieObrigatoria, ieTomadorDaObservacao, marcaIeTomador, tomadorDoXmlNfse, type IeTomador } from "./nfse-ie";

const ies: IeTomador[] = [
  { inscricao_estadual: "13.226.712-8", fazenda_id: "faz-ogliari", municipio: "Tapurah", estado: "MT", municipio_ibge: "5108006", ativa: true },
  { inscricao_estadual: "13.883.052-5", fazenda_id: "faz-santa-rita", municipio: "Lucas do Rio Verde", estado: "MT", municipio_ibge: "5105259", ativa: true },
  { inscricao_estadual: "13.000.000-1", fazenda_id: "faz-velha", municipio: "Sorriso", estado: "MT", municipio_ibge: "5107925", ativa: false },
];

test("tomadorDoXmlNfse: IE e município só do bloco do tomador (IPM, ABRASF e Padrão Nacional)", () => {
  const ipm = `<nfse><prestador><cpfcnpj>11222333000144</cpfcnpj><ie>999999999</ie><cidade>9999</cidade></prestador>
    <tomador><tipo>F</tipo><cpfcnpj>17679842949</cpfcnpj><ie>138830525</ie><nome_razao_social>DENIS</nome_razao_social><cidade>9105</cidade></tomador></nfse>`;
  assert.deepEqual(tomadorDoXmlNfse(ipm), { ie: "138830525", ibge: "" });
  const abrasf = `<Nfse><PrestadorServico><Endereco><CodigoMunicipio>5106240</CodigoMunicipio></Endereco></PrestadorServico>
    <TomadorServico><IdentificacaoTomador><CpfCnpj><Cpf>17679842949</Cpf></CpfCnpj></IdentificacaoTomador><Endereco><CodigoMunicipio>5105259</CodigoMunicipio></Endereco></TomadorServico></Nfse>`;
  assert.deepEqual(tomadorDoXmlNfse(abrasf), { ie: "", ibge: "5105259" });
  const nacional = `<NFSe><emit><CNPJ>11222333000144</CNPJ><enderNac><cMun>5106240</cMun></enderNac></emit><DPS><toma><CPF>17679842949</CPF><end><endNac><cMun>5108006</cMun></endNac></end></toma></DPS></NFSe>`;
  assert.deepEqual(tomadorDoXmlNfse(nacional), { ie: "", ibge: "5108006" });
  assert.deepEqual(tomadorDoXmlNfse(`<Nfse><Tomador><Cpf>1</Cpf><InscricaoEstadual>ISENTO</InscricaoEstadual></Tomador></Nfse>`), { ie: "", ibge: "" });
  assert.deepEqual(tomadorDoXmlNfse(`<Nfse><Numero>1</Numero></Nfse>`), { ie: "", ibge: "" });
});

test("escolherIeTomador: IE da nota → município do tomador → única fazenda → nenhuma", () => {
  assert.equal(escolherIeTomador(ies, "138830525", "5108006")?.fazenda_id, "faz-santa-rita");
  assert.equal(escolherIeTomador(ies, "", "5108006")?.fazenda_id, "faz-ogliari");
  assert.equal(escolherIeTomador(ies, "123456789", ""), null);          // IE de fora e sem município: não chuta
  assert.equal(escolherIeTomador(ies, "", "5107925"), null);            // só a IE inativa é desse município
  assert.equal(escolherIeTomador(ies, "130000001", ""), null);          // IE inativa não vale
  assert.equal(escolherIeTomador([ies[0]], "", "")?.fazenda_id, "faz-ogliari");
  assert.equal(escolherIeTomador([], "138830525", "5105259"), null);
});

test("ieObrigatoria: só quando as IEs ativas estão em fazendas diferentes", () => {
  assert.equal(ieObrigatoria(ies), true);
  assert.equal(ieObrigatoria([ies[0], ies[2]]), false);
  assert.equal(ieObrigatoria([ies[0], { ...ies[1], fazenda_id: "faz-ogliari" }]), false);
});

test("marca da IE na observação vai e volta", () => {
  const obs = `Importado via Sieg DFe em 16/11/2026 — Tomador: 17679842949${marcaIeTomador("13.883.052-5")}`;
  assert.equal(ieTomadorDaObservacao(obs), "138830525");
  assert.equal(marcaIeTomador(""), "");
  assert.equal(ieTomadorDaObservacao("Importado via Sieg"), "");
});
