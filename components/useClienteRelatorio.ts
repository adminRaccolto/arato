"use client";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";

/**
 * Nome do CLIENTE (a conta, ex.: "Grupo Ogliari") para nomes de relatório. Nunca a fazenda ativa: o nome da conta
 * às vezes ainda não carregou no contexto (troca de cliente pela Raccolto) e os relatórios caíam no nome da fazenda.
 * Ordem: nome da conta no contexto → nome da conta lido do banco → nome do produtor exibido no topo.
 */
export function useClienteRelatorio(): string | null {
  const { contaNome, contaId, nomeProdutor } = useAuth();
  const [lido, setLido] = useState<{ id: string; nome: string } | null>(null);
  useEffect(() => {
    if (contaNome || !contaId || lido?.id === contaId) return;
    let vivo = true;
    supabase.from("contas").select("nome").eq("id", contaId).maybeSingle()
      .then(({ data }) => { if (vivo && data?.nome) setLido({ id: contaId, nome: data.nome as string }); });
    return () => { vivo = false; };
  }, [contaNome, contaId, lido?.id]);
  return contaNome ?? (lido && lido.id === contaId ? lido.nome : null) ?? nomeProdutor ?? null;
}
