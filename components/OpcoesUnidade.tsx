"use client";
// Opções de unidade de medida para os <select> de cadastro e lançamento. Cada tela mantém a sua lista de sempre
// (mesmos rótulos, mesma ordem) e ganha, num grupo à parte, todas as unidades ativas de Cadastros → Unidades de Medida
// (tabela unidades_medida, compartilhada por todos os clientes). Antes cada tela tinha uma lista fixa e a unidade
// cadastrada não aparecia em lugar nenhum. O valor atual sempre aparece, mesmo fora das listas.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Unidade = { sigla: string; nome: string };
let cache: Unidade[] | null = null;
let pendente: Promise<Unidade[]> | null = null;

function carregar(): Promise<Unidade[]> {
  if (cache) return Promise.resolve(cache);
  pendente ??= (async () => {
    try {
      const { data } = await supabase.from("unidades_medida").select("sigla, nome").eq("inativo", false).order("tipo").order("sigla");
      cache = ((data ?? []) as Unidade[]).filter(u => u.sigla?.trim());
    } catch {
      cache = [];
    }
    pendente = null;
    return cache;
  })();
  return pendente;
}

/** Unidades ativas do cadastro (carregadas uma vez por sessão do navegador). */
export function useUnidadesMedida(): Unidade[] {
  const [lista, setLista] = useState<Unidade[]>(cache ?? []);
  useEffect(() => {
    let vivo = true;
    carregar().then(l => { if (vivo) setLista(l); });
    return () => { vivo = false; };
  }, []);
  return lista;
}

// Mesma unidade escrita de outro jeito nas listas fixas antigas
const EQUIVALENTE: Record<string, string> = { "m²": "m2", "t": "ton" };

/**
 * `base`: a lista da tela — sigla, ou [sigla, rótulo]. `atual`: o valor selecionado (sempre listado).
 * Use como filho do <select>/<SelectField>, no lugar das <option> fixas.
 */
export default function OpcoesUnidade({ base, atual }: { base: (string | readonly [string, string])[]; atual?: string | null }) {
  const cadastro = useUnidadesMedida();
  const itens = base.map(b => (typeof b === "string" ? [b, b] as const : b));
  const naBase = new Set(itens.map(([v]) => v));
  const extras = cadastro.filter(u => !naBase.has(u.sigla) && !(EQUIVALENTE[u.sigla] && naBase.has(EQUIVALENTE[u.sigla])));
  const mostrarAtual = !!atual && !naBase.has(atual) && !extras.some(u => u.sigla === atual);
  return (
    <>
      {itens.map(([v, r]) => <option key={`b-${v}`} value={v}>{r}</option>)}
      {mostrarAtual && <option value={atual!}>{atual}</option>}
      {extras.length > 0 && (
        <optgroup label="Outras unidades do cadastro">
          {extras.map(u => <option key={`c-${u.sigla}`} value={u.sigla}>{u.sigla}{u.nome && u.nome !== u.sigla ? ` (${u.nome})` : ""}</option>)}
        </optgroup>
      )}
    </>
  );
}
