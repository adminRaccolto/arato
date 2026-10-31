// A fazenda de um registro novo vem do que o usuário escolheu — produtor, empresa, conta bancária,
// ciclo, depósito ou máquina —, nunca da fazenda de referência da sessão. O banco exige fazenda_id,
// e ela decide o LCDPR/SPED (entidade_contabil vem da fazenda) e onde fica o estoque.
import { supabase } from "./supabase";

type Tabela = "empresas" | "contas_bancarias" | "ciclos" | "depositos" | "maquinas" | "talhoes" | "pessoas" | "contratos_financeiros" | "contratos";

const cache = new Map<string, string | null>();

async function fazendaDoRegistro(tabela: Tabela, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const k = `${tabela}:${id}`;
  if (cache.has(k)) return cache.get(k)!;
  const { data } = await supabase.from(tabela).select("fazenda_id").eq("id", id).maybeSingle();
  const fid = (data as { fazenda_id?: string | null } | null)?.fazenda_id ?? null;
  cache.set(k, fid);
  return fid;
}

// Fazenda do produtor: a fazenda de que ele é dono (fazendas.produtor_id); senão a do cadastro dele.
export async function fazendaDoProdutor(produtorId: string | null | undefined): Promise<string | null> {
  if (!produtorId) return null;
  const k = `produtor:${produtorId}`;
  if (cache.has(k)) return cache.get(k)!;
  const { data: faz } = await supabase.from("fazendas").select("id").eq("produtor_id", produtorId)
    .order("created_at").limit(1).maybeSingle();
  let fid = (faz as { id?: string } | null)?.id ?? null;
  if (!fid) {
    const { data: p } = await supabase.from("produtores").select("fazenda_id").eq("id", produtorId).maybeSingle();
    fid = (p as { fazenda_id?: string | null } | null)?.fazenda_id ?? null;
  }
  cache.set(k, fid);
  return fid;
}

export const fazendaDaEmpresa      = (id?: string | null) => fazendaDoRegistro("empresas", id);
export const fazendaDaContaBancaria = (id?: string | null) => fazendaDoRegistro("contas_bancarias", id);
export const fazendaDoCiclo        = (id?: string | null) => fazendaDoRegistro("ciclos", id);
export const fazendaDoDeposito     = (id?: string | null) => fazendaDoRegistro("depositos", id);
export const fazendaDaMaquina      = (id?: string | null) => fazendaDoRegistro("maquinas", id);
export const fazendaDoTalhao       = (id?: string | null) => fazendaDoRegistro("talhoes", id);

// Primeira fazenda que se resolver, na ordem dada; por fim o fallback (fazenda técnica do cliente).
export async function primeiraFazenda(candidatas: Array<Promise<string | null> | string | null | undefined>, fallback: string | null | undefined): Promise<string | null> {
  for (const c of candidatas) {
    const v = await c;
    if (v) return v;
  }
  return fallback ?? null;
}
