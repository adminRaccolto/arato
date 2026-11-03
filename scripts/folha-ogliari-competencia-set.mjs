// Grupo Ogliari: as folhas criadas até 01/10/2026 com competência 2026-10 são o salário de setembro (decisão do dono,
// 03/11/2026). Muda a competência das folhas e o rótulo dos títulos; encargos não pagos voltam ao vencimento de setembro.
// Uso: node --env-file=.env.local scripts/folha-ogliari-competencia-set.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const aplicar = process.argv.includes("--aplicar");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: contas } = await s.from("contas").select("id").eq("nome", "Grupo Ogliari");
if (contas?.length !== 1) throw new Error("Conta Grupo Ogliari não encontrada.");
const { data: fazendas } = await s.from("fazendas").select("id").eq("conta_id", contas[0].id);
const { data: folhas, error } = await s.from("folha_pagamento").select("*").in("fazenda_id", fazendas.map(f => f.id)).eq("competencia", "2026-10").lt("created_at", "2026-10-02");
if (error) throw error;
const { data: linhas } = await s.from("folha_funcionarios").select("funcionario_id, nome_funcionario, cp_lancamento_id").in("folha_id", folhas.map(f => f.id));
const idsSalario = linhas.map(l => l.cp_lancamento_id).filter(Boolean);
const idsEncargo = folhas.flatMap(f => [f.cp_fgts_id, f.cp_inss_patronal_id]).filter(Boolean);
const titulos = [];
for (let i = 0; i < idsSalario.length + idsEncargo.length; i += 200) {
  const { data } = await s.from("lancamentos").select("id, descricao, status, data_vencimento, valor").in("id", [...idsSalario, ...idsEncargo].slice(i, i + 200));
  titulos.push(...(data ?? []));
}
const { data: folhasSet } = await s.from("folha_pagamento").select("id").in("fazenda_id", fazendas.map(f => f.id)).eq("competencia", "2026-09");
const { data: linhasSet } = await s.from("folha_funcionarios").select("funcionario_id, nome_funcionario").in("folha_id", (folhasSet ?? []).map(f => f.id));
const nosDois = (linhasSet ?? []).filter(l => linhas.some(x => x.funcionario_id === l.funcionario_id)).map(l => l.nome_funcionario);

const planos = titulos.filter(t => t.descricao?.includes("Out/2026")).map(t => {
  const encargo = idsEncargo.includes(t.id);
  return { id: t.id, antes: { descricao: t.descricao, data_vencimento: t.data_vencimento },
    depois: { descricao: t.descricao.replace("Out/2026", "Set/2026"), ...(encargo && t.status !== "baixado" && t.data_vencimento === "2026-11-20" ? { data_vencimento: "2026-10-20" } : {}) } };
});
console.log(`Folhas: ${folhas.length} · Linhas: ${linhas.length} · Títulos a renomear: ${planos.length} de ${titulos.length}`);
console.log(`Encargos com vencimento ajustado: ${planos.filter(p => p.depois.data_vencimento).length}`);
console.log(`Já estão em folha de setembro (ficariam duas vezes no mês): ${nosDois.length ? nosDois.join(", ") : "nenhum"}`);
if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }
if (nosDois.length) throw new Error("Há funcionários nos dois lotes: revise antes de aplicar.");

const arquivo = `backup/folha_ogliari_competencia_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify({ folhas: folhas.map(f => f.id), planos }, null, 1));
for (const p of planos) {
  const { error: e } = await s.from("lancamentos").update(p.depois).eq("id", p.id);
  if (e) throw e;
}
for (const f of folhas) {
  const { error: e } = await s.from("folha_pagamento").update({ competencia: "2026-09" }).eq("id", f.id);
  if (e) throw e;
  await s.from("folha_historico").insert({ folha_id: f.id, usuario_nome: "Raccolto", acao: "corrigir_competencia", alteracoes: { de: "2026-10", para: "2026-09" } });
}
console.log(`\nFeito. Cópia para desfazer: ${arquivo}`);
