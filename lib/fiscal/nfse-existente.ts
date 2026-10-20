import type { SupabaseClient } from "@supabase/supabase-js";
import { mesmaNfse, type NfseDup } from "./dedup-nfse";

/** Procura, nas fazendas que o usuário enxerga, uma NFS-e que já seja esta nota (mesma regra do SIEG e do banco). */
export async function buscarNfseExistente(
  db: SupabaseClient,
  nova: { numero_nf: string; prestador_cnpj?: string | null; data_prestacao?: string | null; chave_nfse?: string | null },
): Promise<NfseDup | null> {
  const numBusca = String(nova.numero_nf ?? "").trim().replace(/^0+(?=\d)/, "");
  if (!numBusca) return null;
  const { data } = await db.from("nf_servicos")
    .select("id, fazenda_id, numero_nf, serie, prestador_cnpj, prestador_nome, data_prestacao, chave_nfse, status, created_at")
    .like("numero_nf", `%${numBusca}`).neq("status", "cancelada").limit(200);
  const alvo: NfseDup = { id: "novo", fazenda_id: "", numero_nf: nova.numero_nf, prestador_cnpj: nova.prestador_cnpj ?? null, data_prestacao: nova.data_prestacao ?? null, chave_nfse: nova.chave_nfse ?? null, status: "pendente", created_at: "" };
  return ((data ?? []) as NfseDup[]).find(c => mesmaNfse(c, alvo)) ?? null;
}
