import type { SupabaseClient } from "@supabase/supabase-js";

type Titulo = { id: string; origem_tabela: string };
export type EventoUsuario = {
  id: string; registro_id: string; acao: string; usuario_app: string | null; created_at: string;
  antes_status?: string | null; depois_status?: string | null;
};

/** Quem criou o documento, ou quem efetivamente processou a NF. Baixas e edições posteriores não mudam o autor. */
export function usuarioDoDocumento(eventos: EventoUsuario[], fiscal = false): string | null {
  const ordenados = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (fiscal) {
    const processamento = ordenados.filter(e => e.acao === "UPDATE"
      && ["processada", "autorizada"].includes(e.depois_status ?? "") && e.antes_status !== e.depois_status).at(-1);
    if (processamento) return processamento.usuario_app?.trim() || null;
    return ordenados.find(e => e.acao === "INSERT" && ["processada", "autorizada"].includes(e.depois_status ?? ""))?.usuario_app?.trim() || null;
  }
  return ordenados.find(e => e.acao === "INSERT")?.usuario_app?.trim() || null;
}

async function autores(db: SupabaseClient, tabela: string, ids: string[], fiscal = false): Promise<Map<string, string | null>> {
  const resultado = new Map<string, string | null>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 150) {
    const eventos: EventoUsuario[] = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await db.from("audit_log")
        .select("id,registro_id,acao,usuario_app,created_at,antes_status:dados_antes->>status,depois_status:dados_depois->>status")
        .eq("tabela", tabela).in("registro_id", unicos.slice(i, i + 150))
        .in("acao", fiscal ? ["INSERT", "UPDATE"] : ["INSERT"])
        .order("created_at").order("id").range(inicio, inicio + 999);
      if (error) throw error;
      eventos.push(...(data ?? []) as EventoUsuario[]);
      if (!data || data.length < 1000) break;
    }
    const grupos = new Map<string, EventoUsuario[]>();
    for (const e of eventos) grupos.set(e.registro_id, [...(grupos.get(e.registro_id) ?? []), e]);
    for (const [id, grupo] of grupos) resultado.set(id, usuarioDoDocumento(grupo, fiscal));
  }
  return resultado;
}

/** Lê os vínculos reais, sem depender de novas colunas no espelho rel_lancamentos. Todas as consultas respeitam RLS. */
export async function carregarUsuariosTitulos<T extends Titulo>(db: SupabaseClient, titulos: T[]): Promise<(T & { usuario_origem: string | null })[]> {
  const resultado = titulos.map(t => ({ ...t, usuario_origem: null as string | null }));
  const tarefas: (() => Promise<void>)[] = [];
  for (const tabela of ["lancamentos", "empresa_lancamentos"]) {
    const linhas = resultado.filter(t => t.origem_tabela === tabela);
    for (let i = 0; i < linhas.length; i += 200) {
      const bloco = linhas.slice(i, i + 200);
      tarefas.push(async () => {
        const ids = bloco.map(t => t.id);
        const campos = tabela === "lancamentos"
          ? "id,nf_entrada_id,pedido_compra_id,chave_xml,origem_lancamento,fazenda_id,pessoa_id,nfe_numero,numero_documento"
          : "id,nf_entrada_id,origem,fazenda_id,pessoa_id,numero_documento";
        const { data, error } = await db.from(tabela).select(campos).in("id", ids);
        if (error) throw error;
        const originais = (data ?? []) as unknown as {
          id: string; nf_entrada_id?: string; pedido_compra_id?: string; chave_xml?: string;
          origem_lancamento?: string; origem?: string; fazenda_id: string; pessoa_id?: string;
          nfe_numero?: string; numero_documento?: string;
        }[];
        const nfIds = [...new Set(originais.map(t => t.nf_entrada_id).filter((id): id is string => !!id))];
        const pedidoIds = originais.map(t => t.pedido_compra_id).filter((id): id is string => !!id);
        const [criadores, pedidos, notas] = await Promise.all([
          autores(db, tabela, originais.filter(t => !t.nf_entrada_id && !t.pedido_compra_id).map(t => t.id)), autores(db, "pedidos_compra", pedidoIds),
          nfIds.length ? db.from("nf_entradas").select("id,processado_por").in("id", nfIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (notas.error) throw notas.error;
        const historicoNF = await autores(db, "nf_entradas", (notas.data ?? []).filter(n => !n.processado_por?.trim()).map(n => n.id), true);
        const processadores = new Map((notas.data ?? []).map(n => [n.id, n.processado_por?.trim() || historicoNF.get(n.id) || null]));
        const servicos = originais.filter(t => (t.origem_lancamento ?? t.origem) === "nf_servico" && !t.nf_entrada_id);
        const numerosServico = [...new Set(servicos.map(t => t.nfe_numero || t.numero_documento).filter((n): n is string => !!n))];
        const chaves = [...new Set(originais.map(t => t.chave_xml).filter((c): c is string => !!c))];
        const [nfs, saidas] = await Promise.all([
          numerosServico.length ? db.from("nf_servicos").select("id,fazenda_id,numero_nf,prestador_id,lancamento_id,processado_por")
            .in("fazenda_id", [...new Set(servicos.map(t => t.fazenda_id))]).in("numero_nf", numerosServico)
            : Promise.resolve({ data: [], error: null }),
          chaves.length ? db.from("notas_fiscais").select("id,chave_acesso").in("chave_acesso", chaves)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (nfs.error) throw nfs.error;
        if (saidas.error) throw saidas.error;
        const [autoresServico, autoresSaida] = await Promise.all([
          autores(db, "nf_servicos", (nfs.data ?? []).filter(n => !n.processado_por?.trim()).map(n => n.id), true),
          autores(db, "notas_fiscais", (saidas.data ?? []).map(n => n.id), true),
        ]);
        const porId = new Map(originais.map(t => [t.id, t]));
        for (const t of bloco) {
          const original = porId.get(t.id);
          t.usuario_origem = original?.nf_entrada_id
            ? processadores.get(original.nf_entrada_id) ?? null
            : original?.pedido_compra_id ? pedidos.get(original.pedido_compra_id) ?? null : criadores.get(t.id) ?? null;
          if (original && !original.nf_entrada_id && ["nf_entrada", "nf_servico", "nf_saida"].includes(original.origem_lancamento ?? original.origem ?? "")) {
            t.usuario_origem = null;
          }
          if (original && !original.nf_entrada_id && (original.origem_lancamento ?? original.origem) === "nf_servico") {
            const candidatas = (nfs.data ?? []).filter(n => n.lancamento_id === t.id || (original.pessoa_id
              && n.fazenda_id === original.fazenda_id && n.prestador_id === original.pessoa_id
              && n.numero_nf === (original.nfe_numero || original.numero_documento)));
            // Mesmo número pode existir para prestadores diferentes. Sem vínculo inequívoco, não atribui um processador.
            if (candidatas.length === 1) t.usuario_origem = candidatas[0].processado_por?.trim() || autoresServico.get(candidatas[0].id) || null;
          }
          if (original?.chave_xml && !original.nf_entrada_id) {
            const nota = (saidas.data ?? []).find(n => n.chave_acesso === original.chave_xml);
            if (nota) t.usuario_origem = autoresSaida.get(nota.id) ?? null;
          }
        }
      });
    }
  }
  for (let i = 0; i < tarefas.length; i += 6) await Promise.all(tarefas.slice(i, i + 6).map(t => t()));
  return resultado;
}
