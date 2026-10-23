import assert from "node:assert/strict";
import test from "node:test";
import { responsavelDoAchado, registrosDoAchado, type EventoBase } from "./responsaveis.ts";
import type { Achado, Base } from "./regras.ts";

const base = (p: Partial<Base> = {}): Base => ({ contaDaFazenda: () => "c1", nfs: [], cfopsItens: new Map(), nfse: [], titulos: [], excluidos: [], movs: [], espelhoPj: [],
  contagem: { lanc: 0, relLanc: 0, emp: 0, relEmp: 0 }, ...p });
const ach = (p: Partial<Achado>): Achado => ({ regra: "nf_sem_titulo", chave: "nf1", conta_id: "c1", fazenda_id: "f1", titulo: "NF", valor: 1, detalhe: {}, ...p });
const ev = (p: Partial<EventoBase>): EventoBase => ({ id: "e", tabela: "nf_entradas", registro_id: "nf1", acao: "UPDATE", usuario_app: "Ana", created_at: "2026-10-01T10:00:00Z", campos_alterados: null, ...p });

test("NF sem título: quem excluiu o título vem antes de quem processou", () => {
  const r = responsavelDoAchado(ach({ detalhe: { titulo_excluido: { quem: "Marcia", quando: "2026-10-20T12:22" } } }), base(), [ev({ antes_status: "pendente", depois_status: "processada" })]);
  assert.deepEqual(r, { quem: "Marcia", quando: "2026-10-20T12:22", acao: "Excluiu o título da NF processada" });
  const p = responsavelDoAchado(ach({}), base(), [ev({ antes_status: "pendente", depois_status: "processada", usuario_app: "Wanessa" })]);
  assert.equal(p?.quem, "Wanessa");
  assert.equal(p?.acao, "Processou a NF sem gerar título");
});

test("pagamento apagado usa quem excluiu; sem usuário vira rotina do sistema; uuid nunca aparece como nome", () => {
  assert.equal(responsavelDoAchado(ach({ regra: "baixa_perdida", detalhe: { excluido_por: "Lidiani", excluido_em: "2026-09-18" } }), base(), [])?.quem, "Lidiani");
  assert.match(responsavelDoAchado(ach({ regra: "pago_sem_titulo", detalhe: { excluido_por: null } }), base(), [])!.quem, /Sistema/);
  assert.equal(responsavelDoAchado(ach({ regra: "pago_sem_titulo", detalhe: { excluido_por: "rotina do sistema" } }), base(), [])!.quem, "Sistema (rotina automática)");
  assert.match(responsavelDoAchado(ach({ regra: "pago_sem_titulo", detalhe: { excluido_por: "13cd7017-f47e-4f4b-9256-735b45856cdb" } }), base(), [])!.quem, /Sistema/);
});

test("estoque negativo: usuário que mais lançou saídas", () => {
  assert.equal(responsavelDoAchado(ach({ regra: "estoque_negativo", detalhe: { usuarios: ["Iara", "Elaine"], ultima_saida: "2026-10-10" } }), base(), [])?.quem, "Iara");
});

test("NF com chave repetida: só aponta usuário quando a cópia foi lançada à mão", () => {
  const b = base({ nfs: [{ id: "a", chave_acesso: "K" } as never, { id: "b", chave_acesso: "K" } as never] });
  assert.deepEqual(registrosDoAchado(ach({ regra: "nf_chave_repetida", chave: "K" }), b), ["a", "b"]);
  const manual = responsavelDoAchado(ach({ regra: "nf_chave_repetida", chave: "K" }), b, [ev({ acao: "INSERT", depois_origem: "sieg", usuario_app: null }), ev({ acao: "INSERT", depois_origem: "xml", usuario_app: "Tati", created_at: "2026-10-02T00:00:00Z" })]);
  assert.equal(manual?.quem, "Tati");
  assert.match(responsavelDoAchado(ach({ regra: "nf_chave_repetida", chave: "K" }), b, [ev({ acao: "INSERT", depois_origem: "sieg", usuario_app: null })])!.quem, /SIEG/);
});
