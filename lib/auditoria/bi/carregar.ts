// Carrega os dados do CLIENTE (todas as fazendas da conta) e roda as verificações da aba BI → Auditoria.
// Cadastros duplicados ficam em Estoque → Possíveis Duplicados (lib/estoque/duplicados.ts), não aqui.
// Roda no servidor (service role). Cada verificação devolve seus itens ou o erro — nunca ✓ quando a consulta falha.
import type { SupabaseClient } from "@supabase/supabase-js";
import { unidadeDivergente, type ItemNfEntrada } from "./verificacoes";
import type { InsumoCadastro } from "../../estoque/duplicados";

export type Verificacao = {
  id: string; titulo: string; subtitulo: string; caminho: string;
  total: number; itens: Record<string, unknown>[]; erro?: string;
};

const BLOCO = 1000;
/** Lê todas as linhas (paginado; ordem com id de desempate — sem ele o .range repete/pula linhas). */
async function todas<T>(q: () => { order: (c: string, o?: { ascending?: boolean }) => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } }): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += BLOCO) {
    const { data, error } = await q().order("id").range(de, de + BLOCO - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < BLOCO) return out;
  }
}
const emLotes = <T,>(ids: string[], n = 300) => Array.from({ length: Math.ceil(ids.length / n) }, (_, i) => ids.slice(i * n, i * n + n)) as T[];

async function rodar(def: Omit<Verificacao, "total" | "itens" | "erro">, fn: () => Promise<Record<string, unknown>[]>, total?: (itens: Record<string, unknown>[]) => number): Promise<Verificacao> {
  try {
    const itens = await fn();
    return { ...def, itens, total: total ? total(itens) : itens.length };
  } catch (e) {
    return { ...def, itens: [], total: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function verificacoesDoCliente(sb: SupabaseClient, contaId: string, hoje = new Date()): Promise<Verificacao[]> {
  const { data: fazRows, error: fe } = await sb.from("fazendas").select("id, nome").eq("conta_id", contaId);
  if (fe) throw new Error(fe.message);
  const fazendas = (fazRows ?? []) as { id: string; nome: string }[];
  const fIds = fazendas.map(f => f.id);
  const nomeFaz = (id?: string | null) => fazendas.find(f => f.id === id)?.nome ?? "";
  if (!fIds.length) return [];
  const limite = new Date(hoje.getTime() - 3 * 86400000).toISOString().slice(0, 10);

  // Cadastro de insumos/produtos do cliente (usado por várias verificações)
  let insumos: InsumoCadastro[] = [];
  let erroInsumos: string | undefined;
  try {
    insumos = await todas<InsumoCadastro>(() => sb.from("insumos").select("id, nome, unidade, tipo, categoria, fazenda_id, estoque, ativo").in("fazenda_id", fIds));
  } catch (e) { erroInsumos = e instanceof Error ? e.message : String(e); }
  const insPorId = new Map(insumos.map(i => [i.id, i]));
  const exigeInsumos = () => { if (erroInsumos) throw new Error(erroInsumos); };

  const v: Promise<Verificacao>[] = [];

  v.push(rodar({ id: "romaneios_sem_nf", titulo: "Romaneios de venda sem NF", subtitulo: "Carga de contrato embarcada há mais de 3 dias sem NF-e emitida", caminho: "Comercial → Contratos de Venda → Romaneios" }, async () => {
    const rows = await todas<Record<string, unknown>>(() => sb.from("romaneios").select("id, numero, data, placa, sacas, peso_liquido_kg, fazenda_id, contrato_id").in("fazenda_id", fIds).is("nfe_numero", null).is("nfe_chave", null).lte("data", limite));
    return rows.sort((a, b) => String(a.data).localeCompare(String(b.data))).map(r => ({ ...r, fazenda: nomeFaz(r.fazenda_id as string) }));
  }));

  v.push(rodar({ id: "romaneio_entrada_pesagem", titulo: "Romaneios de entrada parados na pesagem", subtitulo: "Peso bruto registrado há mais de 3 dias, sem tara — a carga não entrou no estoque", caminho: "Lavoura → Colheita Própria" }, async () => {
    const rows = await todas<Record<string, unknown>>(() => sb.from("romaneios_entrada").select("id, ticket_numero, data, placa, produto_nome, peso_bruto_kg, fazenda_id, status").in("fazenda_id", fIds).eq("status", "em_pesagem").lte("data", limite));
    return rows.map(r => ({ ...r, fazenda: nomeFaz(r.fazenda_id as string) }));
  }));

  v.push(rodar({ id: "uom_divergente", titulo: "Entradas com unidade de medida divergente", subtitulo: "NF processada em unidade diferente do cadastro, sem fator de conversão — a quantidade entrou errada no estoque", caminho: "Documentos Fiscais → Notas de Terceiro (estornar e reprocessar com o fator)" }, async () => {
    exigeInsumos();
    const nfs = await todas<{ id: string; numero: string; emitente_nome: string; data_emissao: string; fazenda_id: string }>(() => sb.from("nf_entradas").select("id, numero, emitente_nome, data_emissao, fazenda_id").in("fazenda_id", fIds).eq("status", "processada"));
    const nfPorId = new Map(nfs.map(n => [n.id, n]));
    const out: Record<string, unknown>[] = [];
    for (const lote of emLotes<string[]>(nfs.map(n => n.id))) {
      const itens = await todas<ItemNfEntrada>(() => sb.from("nf_entrada_itens").select("id, nf_entrada_id, insumo_id, descricao_produto, unidade_nf, unidade, fator_conversao, quantidade").in("nf_entrada_id", lote).not("insumo_id", "is", null));
      for (const it of itens) {
        const ins = insPorId.get(it.insumo_id ?? "");
        if (!unidadeDivergente(it, ins)) continue;
        const nf = nfPorId.get(it.nf_entrada_id);
        out.push({ id: it.id, nf: nf?.numero, fornecedor: nf?.emitente_nome, data: nf?.data_emissao, fazenda: nomeFaz(nf?.fazenda_id),
          produto: it.descricao_produto, insumo: ins?.nome, quantidade: it.quantidade, unidade_nf: it.unidade_nf, unidade_cadastro: ins?.unidade });
      }
    }
    return out.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }));

  v.push(rodar({ id: "estoque_negativo", titulo: "Estoque negativo", subtitulo: "Insumos com saldo abaixo de zero — saída lançada sem entrada correspondente", caminho: "Estoque → Movimentação por Produto" }, async () => {
    exigeInsumos();
    return insumos.filter(i => i.ativo !== false && Number(i.estoque ?? 0) < -0.0001)
      .map(i => ({ id: i.id, insumo: i.nome, estoque: i.estoque, unidade: i.unidade, fazenda: nomeFaz(i.fazenda_id) }))
      .sort((a, b) => Number(a.estoque) - Number(b.estoque));
  }));

  v.push(rodar({ id: "saidas_sem_ciclo", titulo: "Saídas manuais sem safra/ciclo", subtitulo: "Consumo lançado à mão sem ciclo — o custo não entra no DRE de nenhuma safra", caminho: "Estoque → Movimentações" }, async () => {
    const rows = await todas<Record<string, unknown>>(() => sb.from("movimentacoes_estoque").select("id, data, insumo_id, quantidade, motivo, observacao, operacao, usuario_nome, fazenda_id").in("fazenda_id", fIds).eq("tipo", "saida").eq("auto", false).is("ciclo_id", null));
    return rows.sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .map(r => ({ ...r, insumo: insPorId.get(r.insumo_id as string)?.nome ?? "—", unidade: insPorId.get(r.insumo_id as string)?.unidade ?? "", fazenda: nomeFaz(r.fazenda_id as string) }));
  }));

  v.push(rodar({ id: "contratos_sem_cp", titulo: "Contratos financeiros sem parcelas no Contas a Pagar", subtitulo: "Contrato ativo sem nenhum título no CP — o endividamento não aparece no fluxo de caixa", caminho: "Financeiro → Contratos Financeiros → Pagamento" }, async () => {
    const cs = await todas<{ id: string; descricao: string; credor: string; numero_contrato: string; valor_total: number; status: string; fazenda_id: string }>(() => sb.from("contratos_financeiros").select("id, descricao, credor, numero_contrato, valor_total, status, fazenda_id").in("fazenda_id", fIds));
    const ativos = cs.filter(c => !["quitado", "cancelado", "liquidado", "encerrado"].includes(String(c.status ?? "").toLowerCase()));
    const comCp = new Set<string>();
    for (const lote of emLotes<string[]>(ativos.map(c => c.id))) {
      const ls = await todas<{ contrato_financeiro_id: string }>(() => sb.from("lancamentos").select("id, contrato_financeiro_id").in("contrato_financeiro_id", lote).eq("tipo", "pagar"));
      ls.forEach(l => comCp.add(l.contrato_financeiro_id));
    }
    return ativos.filter(c => !comCp.has(c.id)).map(c => ({ ...c, fazenda: nomeFaz(c.fazenda_id) }));
  }));

  return Promise.all(v);
}

