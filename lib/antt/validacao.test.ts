import assert from "node:assert/strict";
import { test } from "node:test";
import { prepararDeclaracao, cnpjValido, cpfValido, agoraBrasilia, haversineKm } from "./validacao";
import type { DeclaracaoCIOT } from "./ciot";

const base = (): DeclaracaoCIOT => ({
  CpfCnpjContratado: "21016959000195", RNTRCContratado: "47964242", CpfCnpjContratante: "17679842949", CpfCnpjDestinatario: "17679842949",
  ValorFrete: "2000", DataInicioViagem: "2020-01-01", DataFimViagem: "2020-01-01",
  Veiculos: [{ Placa: "RNI6I31", RNTRC: "47964242", NumeroEixos: "3" }, { Placa: "ABC1D23", RNTRC: "47964242", NumeroEixos: "3" }],
  OrigemDestino: [{ Origem: { CodigoMunicipioOrigem: "5108006", LatitudeOrigem: "-12.35", LongitudeOrigem: "-56.5" }, Destino: { CodigoMunicipioDestino: "5105259", LatitudeDestino: "-13.05", LongitudeDestino: "-55.9" }, DistanciaPercorrida: "140", QtdViagens: "1" }],
  DadosCarga: { CodigoNaturezaCarga: "2202", PesoCarga: "75,040", CodigoTipoCarga: "1" },
  InfPagamento: [{ TipoPagamento: "6", ChavePix: "21016959000195", CpfCnpjCreditado: "21016959000195", IndPagamento: "0" }],
});

test("documentos: DV de CPF/CNPJ", () => {
  assert.equal(cnpjValido("21016959000195"), true);
  assert.equal(cpfValido("17679842949"), true);
  assert.equal(cnpjValido("21016959000196"), false);
});
test("normaliza RNTRC (8→9), peso 2 casas, data de início nunca no passado", () => {
  const { dados, erros } = prepararDeclaracao({ dados: base(), cnpjEmitente: "21016959000195", rntrcEmitente: "47964242" });
  assert.deepEqual(erros, []);
  assert.equal(dados.RNTRCContratado, "047964242");
  assert.equal(dados.DadosCarga.PesoCarga, "75.04");
  assert.equal(dados.DataInicioViagem, agoraBrasilia().data);
  assert.equal(dados.Veiculos[1].RNTRC, "047964242");
});
test("cavalo sem implemento é barrado; com 'sem implemento' passa", () => {
  const b = base(); b.Veiculos = [b.Veiculos[0]];
  assert.ok(prepararDeclaracao({ dados: b, cnpjEmitente: "21016959000195" }).erros.some(e => /implemento/i.test(e)));
  assert.deepEqual(prepararDeclaracao({ dados: b, cnpjEmitente: "21016959000195", semImplemento: true }).erros, []);
});
test("origem e destino com tipos de localização diferentes é barrado (B111)", () => {
  const b = base(); b.OrigemDestino[0].Destino = { CodigoMunicipioDestino: "5105259", CepDestino: "78455000" };
  assert.ok(prepararDeclaracao({ dados: b, cnpjEmitente: "21016959000195" }).erros.some(e => /mesmo/.test(e)));
});
test("distância menor que a linha reta é barrada (B82)", () => {
  const b = base(); b.OrigemDestino[0].DistanciaPercorrida = "20";
  assert.ok(prepararDeclaracao({ dados: b, cnpjEmitente: "21016959000195" }).erros.some(e => /linha reta/.test(e)));
  assert.ok(haversineKm(-12.35, -56.5, -13.05, -55.9) > 90);
});
test("peso zero, placa duplicada, PIX ausente e destinatário inválido", () => {
  const b = base(); b.DadosCarga.PesoCarga = "0"; b.Veiculos[1].Placa = "RNI6I31"; b.InfPagamento[0].ChavePix = ""; b.CpfCnpjDestinatario = "11111111111";
  const er = prepararDeclaracao({ dados: b, cnpjEmitente: "21016959000195" }).erros.join(" ");
  assert.match(er, /Peso/); assert.match(er, /duplicadas/); assert.match(er, /PIX/); assert.match(er, /destinatário/);
});

import { normalizarRespostaAntt } from "./ciot";
test("resposta de sucesso da ANTT (sem envelope Sucesso) é sucesso", () => {
  const r = normalizarRespostaAntt({ IdOperacaoTransporte: "560000569297", CodigoVerificador: "3535", Protocolo: "T98000000000720", Codigo: "110", Mensagem: "Dados inseridos com sucesso!", AvisoTransportador: null });
  assert.equal(r.Sucesso, true);
  assert.equal(r.Dados.CodigoVerificador, "3535");
});
test("lista de rejeições é falha, com as mensagens", () => {
  const r = normalizarRespostaAntt({ Mensagem: '["Rejeição: A data e hora da declaração está fora do intervalo"]' });
  assert.equal(r.Sucesso, false);
  assert.match(r.Mensagem, /fora do intervalo/);
  assert.equal(normalizarRespostaAntt(["Rejeição: x"]).Sucesso, false);
});
