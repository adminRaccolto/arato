// Placas de carreta digitadas para um cavalo sem conjunto (CT-e ou CIOT do MDF-e): cadastra os implementos que faltam e
// o conjunto do cavalo, para que o CT-e e o MDF-e seguintes já tragam as carretas sozinhos.
import type { SupabaseClient } from "@supabase/supabase-js";

export function placasDoTexto(texto: string): string[] {
  return [...new Set(texto.split(/[,;\s]+/).map(x => x.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).filter(x => x.length === 7))].slice(0, 3);
}

export async function registrarConjuntoDigitado(sb: SupabaseClient, p: {
  fazendaId: string; contaId: string | null; cavaloId: string; texto: string;
  veiculos: { id: string; placa: string }[];
}): Promise<{ conjuntoId: string; implementoIds: string[] } | null> {
  const placas = placasDoTexto(p.texto);
  if (!placas.length || !p.cavaloId) return null;
  const { data: ja } = await sb.from("conjuntos_veiculos").select("id, implemento_ids").eq("cavalo_id", p.cavaloId).eq("ativo", true).limit(1);
  if (ja?.length) return { conjuntoId: ja[0].id as string, implementoIds: (ja[0].implemento_ids ?? []) as string[] };
  const ids: string[] = [];
  for (const pl of placas) {
    const existente = p.veiculos.find(v => v.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === pl);
    if (existente) { ids.push(existente.id); continue; }
    const { data: noBanco } = await sb.from("veiculos").select("id").eq("placa", pl).limit(1);
    if (noBanco?.length) { ids.push(noBanco[0].id as string); continue; }
    const { data: novo, error } = await sb.from("veiculos").insert({ fazenda_id: p.fazendaId, conta_id: p.contaId, placa: pl, categoria: "implemento", tipo: "Carreta", ativo: true }).select("id").single();
    if (error || !novo) return null;
    ids.push(novo.id as string);
  }
  const cavalo = p.veiculos.find(v => v.id === p.cavaloId);
  const { data: cj, error } = await sb.from("conjuntos_veiculos").insert({
    conta_id: p.contaId, fazenda_id: p.fazendaId, cavalo_id: p.cavaloId, implemento_ids: ids,
    nome: [cavalo?.placa, ...placas].filter(Boolean).join(" + "), ativo: true,
  }).select("id").single();
  if (error || !cj) return null;
  return { conjuntoId: cj.id as string, implementoIds: ids };
}
