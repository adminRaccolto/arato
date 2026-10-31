// Títulos de CP duplicados na mesma NF (processamento da NF disparado duas vezes ao mesmo tempo — achado 30/10/2026).
// Grupo = mesma NF + mesma parcela (produtor) ou mesma NF + parcela/vencimento/valor (empresa), títulos ativos, que não
// sejam partes de um pagamento parcial dividido. Mantém o título que a NF aponta (lancamento_id/emp_lancamento_id) ou o
// mais antigo; apaga os outros SÓ se estiverem em aberto, sem pagamento, sem conciliação e fora de borderô.
// Uso: node --env-file=.env.local scripts/titulos-nf-duplicados.mjs [--aplicar]      (sem --aplicar = simulação)
//      node --env-file=.env.local scripts/titulos-nf-duplicados.mjs --reverter backup/<arquivo>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const aplicar = process.argv.includes("--aplicar");
const iRev = process.argv.indexOf("--reverter");

if (iRev > 0) {
  const bk = JSON.parse(fs.readFileSync(process.argv[iRev + 1], "utf8"));
  if (bk.produtor.length) { const { error } = await sb.from("lancamentos").insert(bk.produtor.map(({ numero: _n, ...t }) => t)); if (error) throw error; }
  if (bk.empresa.length) { const { error } = await sb.from("empresa_lancamentos").insert(bk.empresa.map(({ numero: _n, ...t }) => t)); if (error) throw error; }
  console.log(`Revertido: ${bk.produtor.length + bk.empresa.length} título(s) recriado(s).`);
  process.exit(0);
}

async function todos(montar) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().order("id").range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const livre = t => ["em_aberto", "vencido", "pendente"].includes(t.status) && !(Number(t.valor_pago) > 0) && !t.conciliado && !t.lote_id;

async function lado(tabela, chave, campoNf) {
  const ts = await todos(() => sb.from(tabela).select("*").not("nf_entrada_id", "is", null).neq("status", "cancelado"));
  const grupos = new Map();
  for (const t of ts) {
    if (t.titulo_origem_id) continue;   // partes de pagamento parcial dividido não são duplicata
    const k = chave(t);
    (grupos.get(k) ?? grupos.set(k, []).get(k)).push(t);
  }
  const apagar = [], manter = [];
  for (const g of [...grupos.values()].filter(v => v.length > 1)) {
    const { data: nf } = await sb.from("nf_entradas").select("numero, emitente_nome, " + campoNf).eq("id", g[0].nf_entrada_id).maybeSingle();
    const ficar = g.find(t => t.id === nf?.[campoNf]) ?? [...g].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    manter.push(ficar);
    for (const t of g) if (t.id !== ficar.id) {
      if (livre(t)) apagar.push({ ...t, _nf: `NF ${nf?.numero} — ${nf?.emitente_nome ?? ""}` });
      else console.log(`  ⚠ ${tabela} ${t.id} (NF ${nf?.numero}) não apagado: tem pagamento/conciliação/borderô`);
    }
  }
  return apagar;
}
const produtor = await lado("lancamentos", t => `${t.nf_entrada_id}|${t.num_parcela ?? 0}`, "lancamento_id");
const empresa = await lado("empresa_lancamentos", t => `${t.nf_entrada_id}|${t.observacao ?? ""}|${t.data_vencimento}|${t.valor}`, "emp_lancamento_id");
for (const t of [...produtor, ...empresa]) console.log(`  apagar: ${t._nf} · R$ ${t.valor} · venc. ${t.data_vencimento} · criado ${t.created_at.slice(0, 19)}`);
console.log(`Duplicados a apagar: ${produtor.length} do produtor, ${empresa.length} da empresa.`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar (cópia em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/titulos_nf_duplicados_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
const limpa = ts => ts.map(({ _nf, ...t }) => t);
fs.writeFileSync(arq, JSON.stringify({ produtor: limpa(produtor), empresa: limpa(empresa) }, null, 1));
if (produtor.length) { const { error } = await sb.from("lancamentos").delete().in("id", produtor.map(t => t.id)); if (error) throw error; }
if (empresa.length) { const { error } = await sb.from("empresa_lancamentos").delete().in("id", empresa.map(t => t.id)); if (error) throw error; }
console.log(`Feito: ${produtor.length + empresa.length} título(s) duplicado(s) apagado(s). Cópia: ${arq} (para desfazer: --reverter ${arq})`);
