import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMDFe, type MDFeInput } from "./builder";

function entrada(): MDFeInput {
  return {
    emitente: {
      cpf_cnpj: "12345678000195", razao_social: "Transportadora de teste", ie: "123456789",
      logradouro: "Rua Teste", numero: "1", bairro: "Centro", municipio_ibge: "5103403",
      municipio_nome: "Cuiaba", uf: "MT", cep: "78000000", tpEmit: "1",
      ambiente: "homologacao", serie: "1", numero_mdfe: 1,
    },
    uf_ini: "MT", municipio_ini_ibge: "5103403", municipio_ini_nome: "Cuiaba", uf_fim: "MT",
    municipios_descarga: [{ municipio_ibge: "5103403", municipio_nome: "Cuiaba", cte_chaves: ["1".repeat(44)], nfe_chaves: [] }],
    veiculo: { placa: "ABC1D23", tara_kg: 5000 }, condutores: [{ nome: "Motorista", cpf: "12345678909" }],
    peso_bruto_kg: 200, valor_carga: 1000,
    produto_predominante: { descricao: "Soja & milho <grãos>", tipo_carga: "01", ncm: "12019000", cep_carregamento: "78000000", cep_descarregamento: "78450000" },
  };
}

test("produto e lotação aparecem na ordem do leiaute, com texto escapado", () => {
  const { xml } = buildMDFe(entrada());
  assert.match(xml, /<\/seg><prodPred><tpCarga>01<\/tpCarga><xProd>Soja &amp; milho &lt;graos&gt;<\/xProd><NCM>12019000<\/NCM>/);
  assert.match(xml, /<infLotacao><infLocalCarrega><CEP>78000000<\/CEP><\/infLocalCarrega><infLocalDescarrega><CEP>78450000<\/CEP><\/infLocalDescarrega><\/infLotacao><\/prodPred><tot>/);
});

test("bloqueia produto ausente para prestador e carga própria com tpTransp", () => {
  const input = entrada();
  delete input.produto_predominante;
  assert.throws(() => buildMDFe(input), /produto predominante/);
  input.emitente.tpEmit = "2";
  assert.doesNotThrow(() => buildMDFe(input));
  input.emitente.tpTransp = "1";
  assert.throws(() => buildMDFe(input), /produto predominante/);
});

test("um documento exige locais; vários permitem omitir lotação e NCM", () => {
  const input = entrada();
  input.produto_predominante!.cep_carregamento = "";
  input.produto_predominante!.cep_descarregamento = "";
  input.produto_predominante!.ncm = "";
  assert.throws(() => buildMDFe(input), /CEPs reais/);
  input.municipios_descarga[0].cte_chaves.push("2".repeat(44));
  const { xml } = buildMDFe(input);
  assert.match(xml, /<prodPred>/);
  assert.doesNotMatch(xml, /<infLotacao>|<NCM>/);
});

test("rejeita tipo, NCM, descrição e CEPs inválidos antes da transmissão", () => {
  for (const [campo, valor] of [["tipo_carga", "99"], ["ncm", "123"], ["descricao", " "], ["cep_carregamento", "123"]] as const) {
    const input = entrada();
    input.produto_predominante![campo] = valor;
    assert.throws(() => buildMDFe(input));
  }
});
