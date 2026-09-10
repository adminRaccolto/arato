// Fonte única de naturezas de operação / CFOP — consolida o que antes vivia
// hardcoded e duplicado em app/contratos/page.tsx (NATUREZAS_OPERACAO) e
// app/comercial/faturamento/page.tsx (NATUREZAS_VENDA/NATUREZAS_DEVOLUCAO).
// Os dados reais ficam na tabela `operacoes_fiscais` (Configurações → Sistema
// → Operações Fiscais), semeada por fazenda na migration Seção 245.
import { supabase } from "./supabase";

export interface OperacaoFiscalRow {
  id: string;
  fazenda_id: string;
  codigo: string | null;
  nome: string;
  descricao?: string | null;
  grupo: string; // "Vendas" | "Exportação" | "Venda à Ordem" | "Remessas" | "Devolução"
  tipo_pessoa: "pf" | "pj" | null; // null = aplica a PF e PJ igualmente
  cfop_interno: string;
  cfop_externo: string;
  cfop_tipo_interno: string | null; // liga a textos_legais_uf.cfop_tipo
  cfop_tipo_externo: string | null;
  icms_cst_interno: string;
  icms_cst_externo: string;
  icms_aliq: number;
  icms_base_reduzida_pct: number;
  pis_cst: string;
  pis_aliq: number;
  cofins_cst: string;
  cofins_aliq: number;
  ibs_cbs_imune: boolean;
  ibs_cbs_reducao_pct: number;
  inf_cpl_template: string | null;
  ativa: boolean;
}

export async function listarOperacoesFiscais(fazenda_id: string): Promise<OperacaoFiscalRow[]> {
  const { data, error } = await supabase
    .from("operacoes_fiscais")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .eq("ativa", true)
    .order("grupo")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as OperacaoFiscalRow[];
}

// ── Forma consumida por app/contratos/page.tsx ────────────────────────────
// Cada linha de operacoes_fiscais vira 1 ou 2 entradas (interna/externa) —
// exatamente como a antiga NATUREZAS_OPERACAO listava "-INTRA" separado.
export interface NaturezaContrato {
  codigo: string;
  grupo: string;
  descricao: string;
  cfop: string;
  cst_icms: string;
  obs: string;
}

export function flattenParaContratos(rows: OperacaoFiscalRow[]): NaturezaContrato[] {
  const out: NaturezaContrato[] = [];
  for (const r of rows) {
    const sufixoPessoa = r.tipo_pessoa ? ` — ${r.tipo_pessoa.toUpperCase()}` : "";
    out.push({
      codigo: r.codigo ?? r.id,
      grupo: r.grupo,
      descricao: `${r.descricao ?? r.nome}${sufixoPessoa}`.trim(),
      cfop: r.cfop_externo,
      cst_icms: r.icms_cst_externo,
      obs: r.inf_cpl_template ?? "",
    });
    if (r.cfop_interno && r.cfop_interno !== r.cfop_externo) {
      out.push({
        codigo: `${r.codigo ?? r.id}-INTRA`,
        grupo: r.grupo,
        descricao: `${r.descricao ?? r.nome}${sufixoPessoa} (mesmo estado)`.trim(),
        cfop: r.cfop_interno,
        cst_icms: r.icms_cst_interno,
        obs: r.inf_cpl_template ?? "",
      });
    }
  }
  return out;
}

// ── Forma consumida por app/comercial/faturamento/page.tsx ───────────────
// `codigo` mantém o formato CFOP-com-pontos usado como valor literal do
// <select> (ex: "6.501", "6.501.PJ") para não alterar o payload de emissão
// que já sanitiza esse valor (`.replace(/\D/g,"")`) antes de ir para a SEFAZ.
export interface NaturezaFaturamento {
  codigo: string;
  cfop_tipo: string | null;
  descricao: string;
  obs: string;
  tipo_pessoa: "pf" | "pj" | null;
  grupoVisual: "Vendas" | "Remessas" | "Devoluções";
}

const cfopDotted = (cfop: string) => cfop.length === 4 ? `${cfop[0]}.${cfop.slice(1)}` : cfop;

function grupoVisualDe(grupo: string): "Vendas" | "Remessas" | "Devoluções" {
  if (grupo === "Remessas") return "Remessas";
  if (grupo === "Devolução") return "Devoluções";
  return "Vendas"; // Vendas, Exportação e Venda à Ordem compartilham o optgroup "Vendas"
}

export function flattenParaFaturamento(rows: OperacaoFiscalRow[]): NaturezaFaturamento[] {
  const out: NaturezaFaturamento[] = [];
  const sufixo = (tp: "pf" | "pj" | null) => tp === "pj" ? ".PJ" : "";
  for (const r of rows) {
    const grupoVisual = grupoVisualDe(r.grupo);
    out.push({
      codigo: `${cfopDotted(r.cfop_externo)}${sufixo(r.tipo_pessoa)}`,
      cfop_tipo: r.cfop_tipo_externo,
      descricao: `${r.descricao ?? r.nome} (CFOP ${r.cfop_externo})`,
      obs: r.inf_cpl_template ?? "",
      tipo_pessoa: r.tipo_pessoa,
      grupoVisual,
    });
    if (r.cfop_interno && r.cfop_interno !== r.cfop_externo) {
      out.push({
        codigo: `${cfopDotted(r.cfop_interno)}${sufixo(r.tipo_pessoa)}`,
        cfop_tipo: r.cfop_tipo_interno,
        descricao: `${r.descricao ?? r.nome} — Interna (CFOP ${r.cfop_interno})`,
        obs: r.inf_cpl_template ?? "",
        tipo_pessoa: r.tipo_pessoa,
        grupoVisual,
      });
    }
  }
  // dedup por codigo (VO e VO-TER, por ex., podem colidir no mesmo CFOP 6118)
  const vistos = new Set<string>();
  return out.filter(n => vistos.has(n.codigo) ? false : (vistos.add(n.codigo), true));
}
