import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoFazenda } from "../../../../../lib/api-auth";
import { createClient } from "../../../../../lib/supabase-servidor";

// Cria o adiantamento a fornecedor (ficha + título no CP) pelo servidor (23/11/2026). Pelo navegador, a gravação
// esbarrava na regra de acesso do banco ("new row violates row-level security policy for table
// adiantamentos_fornecedor") quando a sessão chegava sem usuário ou para quem opera a conta pelo seletor de clientes.
// Aqui o acesso é conferido antes: a fazenda tem de ser do usuário, e fornecedor, conta bancária, pedido, ano safra,
// operação gerencial e produtor têm de ser do mesmo cliente da fazenda.
type Dados = Record<string, unknown> & {
  fazenda_id?: string; pessoa_id?: string; conta_bancaria_id?: string; pedido_compra_id?: string; ano_safra_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    const p = await req.json() as { dados?: Dados; quitado?: boolean; og?: string | null; produtor_id?: string | null };
    const dados = p.dados;
    if (!dados || typeof dados !== "object" || !dados.fazenda_id) return NextResponse.json({ ok: false, error: "Dados do adiantamento incompletos." }, { status: 400 });
    const negado = await exigirAcessoFazenda(req, dados.fazenda_id);
    if (negado) return negado;

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", dados.fazenda_id).maybeSingle();
    const conta = faz?.conta_id as string | undefined;
    if (!conta) return NextResponse.json({ ok: false, error: "Fazenda do adiantamento sem cliente definido." }, { status: 400 });
    const { data: fzs } = await sb.from("fazendas").select("id").eq("conta_id", conta);
    const doCliente = new Set((fzs ?? []).map(f => f.id as string));

    // Cada registro ligado precisa ser do mesmo cliente (a gravação abaixo não passa pela regra do banco)
    const conferir = async (tabela: string, id: unknown, rotulo: string, aceitaGlobal = false): Promise<string | null> => {
      if (!id) return null;
      const { data } = await sb.from(tabela).select("*").eq("id", String(id)).maybeSingle();
      const r = data as { fazenda_id?: string | null; conta_id?: string | null } | null;
      if (!r) return `${rotulo} não encontrado.`;
      if (r.conta_id === conta || (r.fazenda_id && doCliente.has(r.fazenda_id))) return null;
      if (aceitaGlobal && !r.conta_id && !r.fazenda_id) return null;
      return `${rotulo} é de outro cliente.`;
    };
    const erros = (await Promise.all([
      conferir("pessoas", dados.pessoa_id, "Fornecedor"),
      conferir("contas_bancarias", dados.conta_bancaria_id, "Conta bancária"),
      conferir("pedidos_compra", dados.pedido_compra_id, "Pedido de compra"),
      conferir("anos_safra", dados.ano_safra_id, "Ano safra"),
      conferir("operacoes_gerenciais", p.og, "Operação gerencial", true),
      conferir("produtores", p.produtor_id, "Produtor"),
    ])).filter(Boolean);
    if (erros.length) return NextResponse.json({ ok: false, error: erros.join(" ") }, { status: 403 });

    const { data, error } = await sb.rpc("criar_adiantamento_fornecedor", { p_dados: dados, p_quitado: !!p.quitado, p_og: p.og ?? null });
    if (error) return NextResponse.json({ ok: false, error: error.code === "PGRST202" ? "Execute a Seção 421 do supabase_migrations.sql." : error.message }, { status: 400 });
    const novo = data as { lancamento_id?: string | null };
    // O título no CP leva o produtor que paga (LCDPR)
    if (p.produtor_id && novo.lancamento_id) await sb.from("lancamentos").update({ produtor_id: p.produtor_id }).eq("id", novo.lancamento_id);
    return NextResponse.json({ ok: true, adiantamento: data });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao criar o adiantamento." }, { status: 500 });
  }
}
