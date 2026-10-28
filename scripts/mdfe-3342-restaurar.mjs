// Restaura o MDF-e 3342 (Muriana, 28/10/2026): autorizado pela SEFAZ às 10:57 (protocolo 951260027093659, XML em
// mdfe_emitidos), mas uma tela aberta antes da autorização salvou por cima e o devolveu para "rascunho", sem chave.
// Backup do registro antes da alteração em backup/mdfe_3342_antes_restauracao_20261028.json.
// Uso: node scripts/mdfe-3342-restaurar.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => {
  const i = l.indexOf("=");
  return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const id = "37ff1551-86fc-47f2-835b-0d9f3e2d84b3";
const { data: antes, error: e1 } = await sb.from("mdfes").select("*").eq("id", id).single();
if (e1) { console.error(e1); process.exit(1); }
fs.writeFileSync("backup/mdfe_3342_antes_restauracao_20261028.json", JSON.stringify(antes, null, 2));

const { error } = await sb.from("mdfes")
  .update({ status: "autorizado", chave_acesso: "51261021016959000195580020000033421815563163" })
  .eq("id", id).eq("protocolo_autorizacao", "951260027093659");
if (error) { console.error(error); process.exit(1); }

const { data } = await sb.from("mdfes").select("numero_mdfe, status, chave_acesso, protocolo_autorizacao").eq("id", id).single();
console.log("Restaurado:", data);
