// Preenche movimentacoes_estoque.usuario_nome das movimentações antigas com quem disparou a rotina de origem.
// Fontes, nesta ordem: NF de entrada (processado_por ou auditoria da NF); auditoria do documento de origem (transferência,
// operação de lavoura, abastecimento, romaneio) na mesma fazenda até 20s antes/depois; só grava quando há UM usuário só.
// Uso: npx tsx scripts/backfill-usuario-movimentacoes.mts        → prévia
//      npx tsx scripts/backfill-usuario-movimentacoes.mts exec   → grava (backup em backup/)
import fs from "fs";
for (const l of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const exec = process.argv[2] === "exec";
async function todos<T>(tabela: string, sel: string, f: (q: any) => any = q => q): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) { const { data, error } = await f(sb.from(tabela).select(sel)).order("id").range(de, de + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; }
  return out;
}
type Mov = { id: string; fazenda_id: string; created_at: string; nf_entrada_id: string | null; motivo: string | null; operacao: string | null };
const movs = await todos<Mov>("movimentacoes_estoque", "id,fazenda_id,created_at,nf_entrada_id,motivo,operacao", q => q.is("usuario_nome", null));
const nfs = await todos<{ id: string; processado_por: string | null }>("nf_entradas", "id,processado_por", q => q.not("processado_por", "is", null));
const procPor = new Map(nfs.map(n => [n.id, n.processado_por!]));
const resultado: { id: string; nome: string; fonte: string }[] = []; const sem: Record<string, number> = {};
for (const m of movs) {
  let nome: string | null = null, fonte = "";
  if (m.nf_entrada_id && procPor.has(m.nf_entrada_id)) { nome = procPor.get(m.nf_entrada_id)!; fonte = "NF processado_por"; }
  if (!nome && m.nf_entrada_id) {
    const { data } = await sb.from("audit_log").select("usuario_app").eq("tabela", "nf_entradas").eq("registro_id", m.nf_entrada_id).not("usuario_app", "is", null).limit(20);
    const u = [...new Set((data ?? []).map(x => x.usuario_app))]; if (u.length === 1) { nome = u[0]; fonte = "auditoria da NF"; }
  }
  if (!nome) {
    const t = new Date(m.created_at).getTime();
    const { data } = await sb.from("audit_log").select("usuario_app").eq("fazenda_id", m.fazenda_id).not("usuario_app", "is", null)
      .gte("created_at", new Date(t - 20000).toISOString()).lte("created_at", new Date(t + 20000).toISOString()).limit(200);
    const u = [...new Set((data ?? []).map(x => x.usuario_app).filter(x => !/^[0-9a-f-]{36}$/i.test(x)))];
    if (u.length === 1) { nome = u[0]; fonte = "auditoria da rotina (mesma fazenda, ±20s)"; }
  }
  if (nome) resultado.push({ id: m.id, nome, fonte });
  else { const k = m.nf_entrada_id ? "NF" : (m.motivo || m.operacao || "outros").replace(/TRF-\d+.*/, "TRF"); sem[k] = (sem[k] ?? 0) + 1; }
}
const porFonte: Record<string, number> = {}; for (const r of resultado) porFonte[r.fonte] = (porFonte[r.fonte] ?? 0) + 1;
const porNome: Record<string, number> = {}; for (const r of resultado) porNome[r.nome] = (porNome[r.nome] ?? 0) + 1;
console.log(`${movs.length} movimentações sem usuário · ${resultado.length} identificadas`, porFonte);
console.log("por usuário:", porNome);
console.log("sem identificação:", sem);
if (exec && resultado.length) {
  fs.mkdirSync(new URL("../backup/", import.meta.url), { recursive: true });
  const arq = new URL(`../backup/backfill_usuario_movimentacoes_${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
  fs.writeFileSync(arq, JSON.stringify(resultado.map(r => r.id)));
  let ok = 0;
  for (const r of resultado) { const { error } = await sb.from("movimentacoes_estoque").update({ usuario_nome: r.nome }).eq("id", r.id).is("usuario_nome", null); if (error) console.log(r.id, error.message); else ok++; }
  console.log(`${ok} gravadas. Ids em ${arq.pathname} (rollback: usuario_nome = null nesses ids)`);
}
