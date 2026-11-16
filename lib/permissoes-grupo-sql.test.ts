import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { converterGrupoParaV2, grupoPermite } from "./permissoes-grupo";
import { MODULOS } from "./modulos";

const source = readFileSync(new URL("../supabase_migrations.sql", import.meta.url), "utf8");
const ini = source.indexOf("-- Seção 454 —");
const fim = source.indexOf("\n-- Seção ", ini + 10);
const sql = source.slice(ini, fim < 0 ? undefined : fim).replace(/NOTIFY pgrst[^;]*;/g, "");

async function rodar(grupos: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const db = new PGlite();
  await db.exec("CREATE TABLE grupos_usuarios (id serial primary key, permissoes jsonb);");
  for (const g of grupos) await db.query("INSERT INTO grupos_usuarios (permissoes) VALUES ($1)", [JSON.stringify(g)]);
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada
  const r = await db.query<{ permissoes: Record<string, unknown> }>("SELECT permissoes FROM grupos_usuarios ORDER BY id");
  return r.rows.map(x => x.permissoes);
}

test("Seção 454: o que o usuário via antes continua visível depois", async () => {
  const antes = [
    { estoque: [], custos: ["exportar"], lavoura_plantio: ["criar", "editar", "excluir"], nf_entrada: ["criar"], conf_fiscal: [], conf_financeiro: ["visualizar"] },
    { fin_pagar: "escrita", lavoura_pulv: "nenhum", contratos: "nenhum", folha: ["visualizar"] },
    {},
  ];
  const depois = await rodar(antes);
  // Antes, só o que já tinha moduleId no menu controlava a tela; o resto aparecia para todos.
  const controlavaAntes = new Set(["contratos", "nf_entrada", "fin_pagar", "fiscal_nfe", "transporte", "compras", "algodao", "apoio_financeiro",
    "arrendamento", "expedicao", "fin_receber", "fin_contratos", "fin_tesouraria", "fin_seguros", "fiscal_sped", "fin_relatorios", "usuarios"]);
  const modulos = MODULOS.filter(m => m.permissao && m.id !== "conf_raccotlo").map(m => m.id);
  depois.forEach((d, i) => {
    assert.equal(d._v2, true);
    for (const mod of modulos) {
      const viaAntes = controlavaAntes.has(mod) || mod.startsWith("conf_") ? grupoPermite(antes[i], mod) : true;
      assert.equal(grupoPermite(d, mod), viaAntes, `grupo ${i}, ${mod}`);
    }
  });
  assert.deepEqual(depois[0].custos, ["visualizar", "exportar"]);
  assert.deepEqual(depois[0].nf_entrada, ["criar"], "módulo que já controlava a tela fica como estava");
  assert.deepEqual(depois[0].conf_fiscal, [], "configuração não muda");
  assert.deepEqual(depois[1].fin_pagar, ["visualizar", "criar", "editar"]);
  assert.deepEqual(depois[1].contratos, []);
  assert.deepEqual(depois[1].lavoura_pulv, ["visualizar"]);
});

test("Seção 454: grupo já convertido não é mexido (o administrador pode desmarcar depois)", async () => {
  const [d] = await rodar([{ _v2: true, estoque: [] }]);
  assert.deepEqual(d, { _v2: true, estoque: [] });
});

test("a tela converte igual à Seção 454", async () => {
  const acoes = Object.fromEntries(MODULOS.filter(m => m.permissao && !m.id.startsWith("conf_")).map(m => [m.id, m.acoes as string[]]));
  const amostras = [
    { estoque: [], custos: ["exportar"], lavoura_plantio: ["criar"], nf_entrada: ["criar"], conf_fiscal: [] },
    { fin_pagar: "escrita", lavoura_pulv: "nenhum", contratos: "nenhum", usuarios: "admin", folha: "leitura", outro: [1] },
    {},
  ];
  const sqlOut = await rodar(amostras);
  amostras.forEach((a, i) => assert.deepEqual(converterGrupoParaV2(a, acoes), sqlOut[i], `amostra ${i}`));
});

test("Seção 454 cobre exatamente os módulos da tela de permissões de hoje", () => {
  const m = sql.match(/catalogo jsonb := '(\{.*?\})'::jsonb/);
  assert.ok(m);
  const doSql = JSON.parse(m![1]) as Record<string, string[]>;
  const doCatalogo = Object.fromEntries(MODULOS.filter(x => x.permissao && !x.id.startsWith("conf_")).map(x => [x.id, x.acoes]));
  // Módulo criado depois de 16/11/2026 NÃO entra aqui: grupo v2 já o recebe bloqueado (regra nova).
  for (const [k, v] of Object.entries(doSql)) assert.deepEqual(v, doCatalogo[k], k);
});
