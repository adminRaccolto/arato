import { test } from "node:test";
import assert from "node:assert/strict";
import {
  funcionarios,
  dadosIniciais,
  titulosDoMes,
  salario,
  chave,
  proximoMes,
} from "./modelo.ts";

test("gratificação e adiantamento geram saldo separado e não reduzem o salário", () => {
  const ms = dadosIniciais();
  const ana = funcionarios.find((f) => f.id === "ana")!;
  const ts = titulosDoMes("2026-11", ms, {}, { "adi-ana": 300 }).filter(
    (t) => t.funcionario === ana.id,
  );
  assert.equal(salario(ana, ms, "2026-11"), 3000);
  assert.equal(ts.find((t) => t.grupo === "gratificacao")?.valor, 700);
  assert.equal(
    ts.reduce((v, t) => v + t.valor - t.pago, 0),
    3700,
  );
  assert.equal(
    ts.reduce((v, t) => v + t.valor, 0),
    4000,
  );
});

test("adiantamento salarial é compensado no salário e permanece com pagamento próprio", () => {
  const ms = dadosIniciais();
  const pedro = funcionarios.find((f) => f.id === "pedro")!;
  const ts = titulosDoMes("2026-11", ms, {}, { "adi-pedro": 600 }).filter(
    (t) => t.funcionario === pedro.id,
  );
  assert.equal(salario(pedro, ms, "2026-11"), 2800);
  assert.equal(
    ts.reduce((v, t) => v + t.valor, 0),
    3400,
  );
  assert.equal(
    ts.reduce((v, t) => v + t.valor - t.pago, 0),
    2800,
  );
});

test("fechamento efetiva apenas salários e encargos do empregador escolhido", () => {
  const ts = titulosDoMes(
    "2026-11",
    dadosIniciais(),
    { [chave("2026-11", funcionarios[0].empregador)]: "fechada" },
    {},
  );
  assert.ok(
    ts
      .filter((t) => t.empregador === funcionarios[0].empregador)
      .every((t) => !t.previsao),
  );
  assert.ok(
    ts
      .filter(
        (t) =>
          t.empregador === funcionarios[2].empregador &&
          ["salario", "encargo"].includes(t.grupo),
      )
      .every((t) => t.previsao),
  );
});

test("nova competência não reaproveita verbas eventuais nem pagamentos do mês anterior", () => {
  const ts = titulosDoMes("2026-12", dadosIniciais(), {}, { "adi-ana": 300 });
  assert.equal(ts.filter((t) => t.grupo === "gratificacao").length, 0);
  assert.ok(ts.every((t) => t.pago === 0));
  assert.equal(proximoMes("2026-12"), "2027-01");
});
