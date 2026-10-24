// Acertos antes da Seção 365 (saldo do item = soma das movimentações).
//
// Para cada item cujo saldo no cadastro (insumos.estoque) difere da soma das movimentações:
//   A — saldo no cadastro e NENHUMA movimentação  → lança movimentação "Saldo inicial (migração)" com o saldo do cadastro
//   B — cadastro é exatamente 2×/3×/4× as movimentações → nada (vale a movimentação; decisão do dono 24/10/2026)
//   C — outra diferença → só com --c=cadastro: lança ajuste (cadastro − movimentações) marcado "acerto_migracao_saldo";
//       sem a opção, fica de fora e o item passa a mostrar a soma das movimentações
//
// Só INSERE movimentações novas (motivo 'acerto_migracao_saldo'); nunca altera nem apaga registro existente.
// Simulação por padrão. Gravar exige --aplicar. Cada execução gravada salva backup/acertos_migracao_<data>.json com os ids
// inseridos (para desfazer: apagar esses ids).
//
// Uso:
//   node scripts/estoque-acertos-migracao.mjs                          (simulação, todos os clientes)
//   node scripts/estoque-acertos-migracao.mjs --conta=<uuid>           (simulação, um cliente)
//   node scripts/estoque-acertos-migracao.mjs --conta=<uuid> --aplicar (grava os acertos A desse cliente)
//   node scripts/estoque-acertos-migracao.mjs --aplicar --c=cadastro   (grava A e C de todos)
//   node scripts/estoque-acertos-migracao.mjs --registrar-etapa        (libera a Seção 365 — só depois de todos os acertos)
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const hoje = new Date().toISOString().slice(0, 10);

async function todas(tabela, colunas, filtro = q => q) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order("id").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

if (args["registrar-etapa"]) {
  const { error } = await sb.from("estoque_migracao_controle").upsert({ etapa: "acertos_a_c", feito_por: "script estoque-acertos-migracao", obs: `registrado em ${new Date().toISOString()}` });
  if (error) throw error;
  console.log("Etapa acertos_a_c registrada — a Seção 365 pode ser rodada.");
  process.exit(0);
}

const contas = await todas("contas", "id, nome", q => (args.conta ? q.eq("id", args.conta) : q));
const relatorio = [];
const inseridos = [];
for (const conta of contas) {
  const fazendas = await todas("fazendas", "id, nome", q => q.eq("conta_id", conta.id));
  if (!fazendas.length) continue;
  const fIds = fazendas.map(f => f.id);
  const insumos = await todas("insumos", "id, nome, unidade, estoque, custo_medio, valor_unitario, fazenda_id, deposito_id", q => q.in("fazenda_id", fIds));
  const ids = insumos.map(i => i.id);
  const movs = [];
  for (let k = 0; k < ids.length; k += 200) movs.push(...await todas("movimentacoes_estoque", "id, insumo_id, tipo, quantidade", q => q.in("insumo_id", ids.slice(k, k + 200))));
  const soma = new Map(), qtd = new Map();
  for (const m of movs) {
    soma.set(m.insumo_id, (soma.get(m.insumo_id) ?? 0) + (m.tipo === "saida" ? -Number(m.quantidade) : Number(m.quantidade)));
    qtd.set(m.insumo_id, (qtd.get(m.insumo_id) ?? 0) + 1);
  }
  const acertos = [];
  for (const i of insumos) {
    const e = Number(i.estoque ?? 0), m = soma.get(i.id) ?? 0, n = qtd.get(i.id) ?? 0;
    if (Math.abs(e - m) < 0.01) continue;
    let classe;
    if (n === 0) classe = "A";
    else if (Math.abs(m) > 0.01 && [2, 3, 4].some(k => Math.abs(e - k * m) < 0.01)) classe = "B";
    else classe = "C";
    const delta = Math.round((e - m) * 1000) / 1000;
    relatorio.push({ cliente: conta.nome, classe, item: i.nome, cadastro: e, movimentacoes: Math.round(m * 1000) / 1000, delta });
    if (classe === "A" || (classe === "C" && args.c === "cadastro")) {
      acertos.push({
        insumo_id: i.id, fazenda_id: i.fazenda_id, deposito_id: i.deposito_id ?? null,
        tipo: "ajuste", quantidade: delta, data: hoje, auto: true,
        motivo: "acerto_migracao_saldo", origem: "migracao_item_cliente",
        valor_unitario: i.custo_medio ?? i.valor_unitario ?? null,
        observacao: classe === "A"
          ? "Saldo inicial (migração): saldo que estava no cadastro sem movimentação"
          : "Acerto da migração: preserva o saldo do cadastro (diferença sem explicação nas movimentações)",
      });
    }
  }
  const cont = relatorio.filter(r => r.cliente === conta.nome).reduce((a, r) => ({ ...a, [r.classe]: (a[r.classe] ?? 0) + 1 }), {});
  console.log(`${conta.nome.padEnd(34)} A=${cont.A ?? 0} B=${cont.B ?? 0} C=${cont.C ?? 0}  → acertos a lançar: ${acertos.length}`);
  if (args.aplicar && acertos.length) {
    for (let k = 0; k < acertos.length; k += 200) {
      const { data, error } = await sb.from("movimentacoes_estoque").insert(acertos.slice(k, k + 200)).select("id, insumo_id, quantidade");
      if (error) throw new Error(`${conta.nome}: ${error.message}`);
      inseridos.push(...data.map(d => ({ ...d, conta: conta.nome })));
    }
  }
}

fs.mkdirSync(new URL("../backup/", import.meta.url), { recursive: true });
const sufixo = `${hoje}_${Date.now()}`;
fs.writeFileSync(new URL(`../backup/acertos_migracao_relatorio_${sufixo}.json`, import.meta.url), JSON.stringify(relatorio, null, 1));
if (args.aplicar) {
  fs.writeFileSync(new URL(`../backup/acertos_migracao_inseridos_${sufixo}.json`, import.meta.url), JSON.stringify(inseridos, null, 1));
  console.log(`\nGRAVADO: ${inseridos.length} movimentação(ões) de acerto. Para desfazer, apague os ids de backup/acertos_migracao_inseridos_${sufixo}.json.`);
} else {
  console.log("\nSimulação — nada foi gravado. Use --aplicar para gravar.");
}
