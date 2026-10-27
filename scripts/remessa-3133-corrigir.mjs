// Corrige o cabeçalho da remessa 3133 (nota própria registrada antes da tela Remessas):
// valor_total estava 100× maior (24.553.000 em vez de 245.530 = 11.420 kg × 21,50) e o destinatário ficou "—".
// Guarda o registro original em backup/ antes de alterar.
// Uso: node --env-file=.env.local scripts/remessa-3133-corrigir.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "c6c6b07c-4b4c-4a1c-8248-010d6215f5a0";

const { data: antes, error: e1 } = await s.from("nf_remessas_logisticas").select("*").eq("id", ID).single();
if (e1) { console.error(e1.message); process.exit(1); }
fs.mkdirSync("backup", { recursive: true });
fs.writeFileSync("backup/fix_remessa_3133_20261027.json", JSON.stringify(antes, null, 2));

const valor = Math.round((antes.itens_json ?? []).reduce((t, i) => t + Number(i.valor_total ?? 0), 0) * 100) / 100;
const { data, error } = await s.from("nf_remessas_logisticas").update({
  valor_total: valor,
  destinatario_pessoa_id: "9e77aae0-6d07-4f21-b4be-552611dee462",
  destinatario_nome: "LUFT LOGISTICS LTDA",
  destinatario_uf: "MT",
  conta_id: "f9607c38-c23f-4740-a38d-db117ba0c320",
}).eq("id", ID).select("nf_remessa_numero, valor_total, destinatario_nome").single();
if (error) { console.error(error.message); process.exit(1); }
console.log("corrigida:", data, "— backup em backup/fix_remessa_3133_20261027.json");
