// Completa os títulos de folha no Contas a Pagar sem funcionário (coluna Fornecedor vazia) e/ou sem operação gerencial
// (28/10/2026). Origem: "Processar folha do mês" antigo (Cadastros → Funcionários / eSocial) não gravava o funcionário e
// só achava a OG de salário na própria fazenda; adiantamentos da folha também ficavam sem OG quando o plano de contas
// estava gravado em outra fazenda do cliente.
//  - "Salário — NOME" / "Salário Mmm/AAAA — NOME" / "Adiantamento — NOME…": funcionário pelo nome, nas fazendas do cliente
//    (só quando há exatamente um funcionário com esse nome).
//  - OG: salário → 2.01.01.10.001 (FAZ) ou 2.01.02.01.03.001 (ADM, pela área do funcionário); adiantamento → 2.01.01.09.002.
//    Prefere a OG da própria fazenda; senão, a de outra fazenda do cliente.
// Só preenche campo vazio; nunca troca o que já está gravado. Uso: node --env-file=.env.local scripts/folha-titulos-completar.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const todas = async (f) => { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await f(i, i + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; };
const norm = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const titulos = await todas((a, b) => sb.from("lancamentos")
  .select("id, fazenda_id, descricao, funcionario_id, pessoa_id, operacao_gerencial_id, origem_lancamento")
  .eq("tipo", "pagar").or("descricao.ilike.Salário —%,descricao.ilike.Salário %/% —%,descricao.ilike.Adiantamento —%")
  .or("funcionario_id.is.null,operacao_gerencial_id.is.null").order("id").range(a, b));
// "Adiantamento — X" também é usado em contrato de grãos e adiantamento a fornecedor: só os da folha ou com nome de funcionário
const fazendas = await todas((a, b) => sb.from("fazendas").select("id, conta_id").order("id").range(a, b));
const contaDa = new Map(fazendas.map(f => [f.id, f.conta_id]));
const funcs = await todas((a, b) => sb.from("funcionarios").select("id, nome, fazenda_id, area_trabalho").order("id").range(a, b));
const ogs = await todas((a, b) => sb.from("operacoes_gerenciais").select("id, classificacao, fazenda_id, conta_id, inativo")
  .in("classificacao", ["2.01.01.10.001", "2.01.02.01.03.001", "2.01.01.09.002"]).order("id").range(a, b));

const funcPorConta = new Map();
for (const f of funcs) { const c = contaDa.get(f.fazenda_id); if (!c) continue; const k = `${c}|${norm(f.nome)}`; (funcPorConta.get(k) ?? funcPorConta.set(k, []).get(k)).push(f); }
const ogPara = (fazenda_id, classificacao) => {
  const conta = contaDa.get(fazenda_id);
  const cand = ogs.filter(o => !o.inativo && o.classificacao === classificacao);
  return (cand.find(o => o.fazenda_id === fazenda_id) ?? cand.find(o => o.conta_id && o.conta_id === conta)
    ?? cand.find(o => o.fazenda_id && contaDa.get(o.fazenda_id) === conta) ?? cand.find(o => !o.fazenda_id && !o.conta_id))?.id ?? null;
};

const plano = [];
for (const t of titulos) {
  const adiant = /^Adiantamento —/.test(t.descricao);
  const nome = t.descricao.replace(/^Salário( \S+\/\d{4})? — /, "").replace(/^Adiantamento — /, "").split(" — ")[0];
  const achados = funcPorConta.get(`${contaDa.get(t.fazenda_id)}|${norm(nome)}`) ?? [];
  const func = t.funcionario_id ? funcs.find(f => f.id === t.funcionario_id) : achados.length === 1 ? achados[0] : null;
  if (adiant && !func) continue;   // não é de funcionário (contrato de grãos, fornecedor...)
  const patch = {};
  if (!t.funcionario_id && func) patch.funcionario_id = func.id;
  if (!t.operacao_gerencial_id) {
    const cls = adiant ? "2.01.01.09.002" : func?.area_trabalho === "administrativo" ? "2.01.02.01.03.001" : "2.01.01.10.001";
    const og = ogPara(t.fazenda_id, cls);
    if (og) patch.operacao_gerencial_id = og;
  }
  if (Object.keys(patch).length) plano.push({ id: t.id, descricao: t.descricao, antes: { funcionario_id: t.funcionario_id, operacao_gerencial_id: t.operacao_gerencial_id }, patch });
}
const nFunc = plano.filter(p => p.patch.funcionario_id).length, nOg = plano.filter(p => p.patch.operacao_gerencial_id).length;
console.log(`Títulos examinados: ${titulos.length} · a completar: ${plano.length} (funcionário: ${nFunc}, operação gerencial: ${nOg})`);
const semFunc = titulos.filter(t => !t.funcionario_id && !plano.find(p => p.id === t.id && p.patch.funcionario_id) && !/^Adiantamento —/.test(t.descricao));
if (semFunc.length) console.log(`Sem funcionário identificável pelo nome (ficam como estão): ${semFunc.length} — ex.: ${semFunc.slice(0, 5).map(t => t.descricao).join(" | ")}`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para gravar (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/folha_titulos_completar_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano, null, 1));
for (const p of plano) { const { error } = await sb.from("lancamentos").update(p.patch).eq("id", p.id); if (error) throw error; }
console.log(`Gravado. Backup: ${arq}`);
