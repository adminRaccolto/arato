// Quem fez a baixa de cada título (30/10/2026): vem do histórico (audit_log.usuario_app), na última alteração em que o
// título passou a baixado/pago/parcial ou teve o valor pago mudado. Usado no popup (title) da Baixa e do Status no CP/CR.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { ultimaBaixa, type Linha, type QuemBaixou } from "./quem-baixou-regra";
export { textoQuemBaixou, type QuemBaixou } from "./quem-baixou-regra";

/** Carrega (em lotes, com cache) quem baixou os títulos informados — só os que ainda não estão no cache. */
export function useQuemBaixou(ids: string[]): Map<string, QuemBaixou> {
  const [mapa, setMapa] = useState<Map<string, QuemBaixou>>(new Map());
  const pedidos = useRef(new Set<string>());
  const chave = ids.join(",");
  useEffect(() => {
    const novos = ids.filter(id => !pedidos.current.has(id));
    if (!novos.length) return;
    novos.forEach(id => pedidos.current.add(id));
    let vivo = true;
    (async () => {
      const achados = new Map<string, QuemBaixou>();
      for (let i = 0; i < novos.length; i += 150) {
        const { data } = await supabase.from("audit_log")
          .select("registro_id, usuario_app, created_at, dados_antes, dados_depois")
          .in("tabela", ["lancamentos", "empresa_lancamentos"]).eq("acao", "UPDATE")
          .in("registro_id", novos.slice(i, i + 150));
        for (const [k, v] of ultimaBaixa((data ?? []) as Linha[])) achados.set(k, v);
      }
      if (vivo && achados.size) setMapa(m => new Map([...m, ...achados]));
    })();
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return mapa;
}
