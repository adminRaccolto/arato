// Título gerado por NF/NFS-e processada não pode ser excluído solto: a nota ficava "processada" sem título
// (casos reais de set-out/2026: Tornearia Renascer, Reformas A C.Mil, NF 2503 da Muriana). O caminho certo é
// desfazer a baixa (se houver) e estornar a nota, que exclui os títulos junto com o estoque.
// Só os botões "Excluir" das telas usam esta checagem; as rotinas de estorno/reprocessamento apagam os títulos
// por conta própria (lib/db.ts) e não passam por aqui.
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotaDoTitulo = { tipo: "NF" | "NFS-e"; numero: string; status: string };

export function motivoBloqueioExclusao(nota: NotaDoTitulo | null): string | null {
  if (!nota || nota.status !== "processada") return null;
  return `Este título foi gerado pela ${nota.tipo} ${nota.numero}, que está processada, e não pode ser excluído sozinho. `
    + `Para remover: se o título estiver pago, desfaça a baixa; depois estorne a ${nota.tipo} em Documentos Fiscais. O estorno exclui os títulos da nota junto.`;
}

type Titulo = { nf_entrada_id?: string | null; origem?: string | null; origem_lancamento?: string | null; numero_documento?: string | null; pessoa_id?: string | null };

/** Nota processada que originou o título (produtor: lancamentos; empresa: empresa_lancamentos), ou null. */
export async function notaDoTitulo(db: SupabaseClient, tabela: "lancamentos" | "empresa_lancamentos", id: string): Promise<NotaDoTitulo | null> {
  const campos = tabela === "lancamentos" ? "nf_entrada_id, origem_lancamento, numero_documento, pessoa_id" : "nf_entrada_id, origem, numero_documento, pessoa_id";
  const { data } = await db.from(tabela).select(campos).eq("id", id).maybeSingle();
  const t = (data ?? null) as Titulo | null;
  if (!t) return null;
  const vinculoNf = tabela === "lancamentos" ? "lancamento_id" : "emp_lancamento_id";
  const qNf = t.nf_entrada_id
    ? db.from("nf_entradas").select("numero, status").eq("id", t.nf_entrada_id)
    : db.from("nf_entradas").select("numero, status").eq(vinculoNf, id);
  const { data: nf } = await qNf.limit(1).maybeSingle();
  if (nf) return { tipo: "NF", numero: String(nf.numero ?? ""), status: String(nf.status ?? "") };
  if ((t.origem_lancamento ?? t.origem) === "nf_servico") {
    let { data: nfs } = tabela === "lancamentos"
      ? await db.from("nf_servicos").select("numero_nf, status").eq("lancamento_id", id).limit(1).maybeSingle()
      : { data: null };
    // Parcelas seguintes e títulos de Empresa não guardam o vínculo: casa pelo nº da nota + prestador
    if (!nfs && t.numero_documento && t.pessoa_id) {
      ({ data: nfs } = await db.from("nf_servicos").select("numero_nf, status").eq("numero_nf", t.numero_documento)
        .eq("prestador_id", t.pessoa_id).eq("status", "processada").limit(1).maybeSingle());
    }
    if (nfs) return { tipo: "NFS-e", numero: String(nfs.numero_nf ?? ""), status: String(nfs.status ?? "") };
  }
  return null;
}
