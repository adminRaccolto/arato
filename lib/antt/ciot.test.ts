import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { CiotService, type DeclaracaoCIOT } from "./ciot";

test("transporte CIOT: falhas externas e gravações sem repetição automática", async t => {
  const svc = new CiotService({ cert: "teste", key: "teste" }, "homologacao");
  for (const corpo of ["<html>Service Unavailable</html>", JSON.stringify({ Sucesso: true, Dados: { CIOT: "560000000001" } })]) {
    await t.test(`HTTP 503 com ${corpo.startsWith("<") ? "HTML" : "JSON"}`, async t => {
      let chamadas = 0;
      t.mock.method(https, "request", (_options: unknown, callback: (res: IncomingMessage) => void) => {
        chamadas++;
        const req = Object.assign(new EventEmitter(), {
          write() {}, end() {
            const res = Object.assign(new EventEmitter(), { statusCode: 503 });
            callback(res as IncomingMessage);
            res.emit("data", corpo);
            res.emit("end");
          },
        });
        return req;
      });
      const r = await svc.gerar("00000000000000");
      assert.equal(chamadas, 1);
      assert.equal(r.Sucesso, false);
      assert.equal(r.HttpStatus, 503);
      assert.equal(r.ResultadoIncerto, true);
      assert.match(r.Mensagem, /HTTP 503.*\/gerar/);
      assert.doesNotMatch(r.Mensagem, /3 tentativas|não erro nos dados/);
    });
  }
  await t.test("declaração mantém diagnóstico HTTP em vez de perder a mensagem", async t => {
    t.mock.method(https, "request", (_options: unknown, callback: (res: IncomingMessage) => void) =>
      Object.assign(new EventEmitter(), {
        write() {}, end() {
          const res = Object.assign(new EventEmitter(), { statusCode: 503 });
          callback(res as IncomingMessage);
          res.emit("data", "indisponível"); res.emit("end");
        },
      }));
    const r = await svc.declarar("560000000001", {} as DeclaracaoCIOT);
    assert.equal(r.HttpStatus, 503);
    assert.equal(r.ResultadoIncerto, true);
    assert.match(r.Mensagem, /DeclaracaoOperacaoTransporte/);
  });
  await t.test("conexão perdida retorna falha estruturada, sem repetir reserva", async t => {
    let chamadas = 0;
    t.mock.method(https, "request", () => {
      chamadas++;
      const req = Object.assign(new EventEmitter(), {
        write() {}, end() { req.emit("error", new Error("ECONNRESET")); },
      });
      return req;
    });
    const r = await svc.gerar("00000000000000");
    assert.equal(chamadas, 1);
    assert.equal(r.Sucesso, false);
    assert.equal(r.ResultadoIncerto, true);
    assert.match(r.Mensagem, /não foi confirmado/);
  });
  await t.test("HTTP 401 prevalece sobre corpo JSON de sucesso", async t => {
    t.mock.method(https, "request", (_options: unknown, callback: (res: IncomingMessage) => void) =>
      Object.assign(new EventEmitter(), {
        write() {}, end() {
          const res = Object.assign(new EventEmitter(), { statusCode: 401 });
          callback(res as IncomingMessage);
          res.emit("data", JSON.stringify({ Sucesso: true, Message: "Unauthorized" })); res.emit("end");
        },
      }));
    const r = await svc.gerar("00000000000000");
    assert.equal(r.Sucesso, false);
    assert.equal(r.HttpStatus, 401);
    assert.equal(r.ResultadoIncerto, false);
  });
});
