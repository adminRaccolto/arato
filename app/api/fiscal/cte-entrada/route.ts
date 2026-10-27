/**
 * POST /api/fiscal/cte-entrada — CT-e recebido (frete contratado, cliente como tomador), Seção 381.
 *   processar: gera o Contas a Pagar para a transportadora (produtor → lancamentos; empresa → empresa_lancamentos)
 *              e marca o CT-e como processado. A transportadora entra no cadastro de Pessoas se ainda não existir.
 *   estornar:  apaga o título (se ainda não foi pago, conciliado nem posto em borderô) e volta o CT-e a pendente.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazenda, getRequestUser } from "../../../../lib/api-auth";

export const runtime = "nodejs";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fmtDoc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

type Corpo = {
  acao: "processar" | "estornar";
  id: string;
  pagador_tipo?: "produtor" | "empresa";
  pagador_id?: string;
  fazenda_id?: string;
  operacao_gerencial_id?: string | null;
  ano_safra_id?: string | null;
  ciclo_id?: string | null;
  centro_custo_id?: string | null;
  data_vencimento?: string;
  observacao?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Corpo;
    if (!b.id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
    const db = admin();
    const { data: cte, error: eCte } = await db.from("cte_entradas").select("*").eq("id", b.id).maybeSingle();
    if (eCte) return NextResponse.json({ ok: false, error: eCte.code === "42P01" || eCte.code === "PGRST205" ? "Rode a Seção 381 do supabase_migrations.sql." : eCte.message }, { status: 400 });
    if (!cte) return NextResponse.json({ ok: false, error: "CT-e não encontrado." }, { status: 404 });
    const negado = await exigirAcessoFazenda(req, cte.fazenda_id as string);
    if (negado) return negado;
    const numDoc = `${String(cte.numero ?? "").replace(/^0+/, "")}/${String(cte.serie ?? "").replace(/^0+/, "") || "1"}`;

    if (b.acao === "processar") {
      if (cte.status !== "pendente") return NextResponse.json({ ok: false, error: "Este CT-e não está pendente." }, { status: 409 });
      if (!b.pagador_tipo || !b.pagador_id) return NextResponse.json({ ok: false, error: "Escolha quem paga o frete (produtor ou empresa)." }, { status: 400 });
      if (!b.data_vencimento || !/^\d{4}-\d{2}-\d{2}$/.test(b.data_vencimento)) return NextResponse.json({ ok: false, error: "Informe o vencimento." }, { status: 400 });
      if (!b.operacao_gerencial_id) return NextResponse.json({ ok: false, error: "Escolha a operação gerencial (ex.: FRETES)." }, { status: 400 });
      const valor = Math.round(Number(cte.valor_receber ?? cte.valor_prestacao ?? 0) * 100) / 100;
      if (!(valor > 0)) return NextResponse.json({ ok: false, error: "CT-e sem valor a pagar." }, { status: 400 });
      const fazendaTitulo = b.fazenda_id || (cte.fazenda_id as string);
      if (fazendaTitulo !== cte.fazenda_id) {
        const negadoFaz = await exigirAcessoFazenda(req, fazendaTitulo);
        if (negadoFaz) return negadoFaz;
      }

      // Transportadora no cadastro de Pessoas do cliente (um cadastro por CPF/CNPJ)
      const docEmit = dig(cte.emitente_cnpj);
      let pessoaId: string | null = null;
      if (docEmit) {
        const { data: ps } = await db.from("pessoas").select("id").eq("conta_id", cte.conta_id).or(`cpf_cnpj.eq.${docEmit},cpf_cnpj.eq.${fmtDoc(docEmit)}`).limit(1);
        pessoaId = (ps?.[0]?.id as string | undefined) ?? null;
        if (!pessoaId) {
          const { data: nova, error: eP } = await db.from("pessoas").insert({
            fazenda_id: cte.fazenda_id, conta_id: cte.conta_id, nome: cte.emitente_nome ?? "TRANSPORTADORA", tipo: docEmit.length === 11 ? "pf" : "pj",
            fornecedor: true, cliente: false, cpf_cnpj: fmtDoc(docEmit), inscricao_est: cte.emitente_ie ?? null, estado: cte.emitente_uf ?? null,
            subcategorias: ["Prestador de Serviço"], importado_sieg: true,
          }).select("id").single();
          if (eP) return NextResponse.json({ ok: false, error: `Cadastro da transportadora: ${eP.message}` }, { status: 500 });
          pessoaId = nova.id as string;
        }
      }

      const descricao = `CT-e ${numDoc} — ${cte.emitente_nome ?? "frete"}`.slice(0, 200);
      const rota = [cte.municipio_origem && `${cte.municipio_origem}/${cte.uf_origem}`, cte.municipio_destino && `${cte.municipio_destino}/${cte.uf_destino}`].filter(Boolean).join(" → ");
      const obs = [b.observacao?.trim(), rota && `Frete ${rota}`, cte.produto_descricao && `Carga: ${cte.produto_descricao}`].filter(Boolean).join(" · ") || null;
      let tabela: "lancamentos" | "empresa_lancamentos";
      let lancId: string;
      if (b.pagador_tipo === "produtor") {
        const { data: ja } = await db.from("lancamentos").select("id").eq("tipo", "pagar").eq("chave_xml", cte.chave).neq("status", "cancelado").limit(1);
        if (ja?.length) return NextResponse.json({ ok: false, error: "Já existe um Contas a Pagar para este CT-e." }, { status: 409 });
        const { data: l, error: eL } = await db.from("lancamentos").insert({
          fazenda_id: fazendaTitulo, tipo: "pagar", moeda: "BRL", natureza: "real", descricao, categoria: "Frete",
          data_lancamento: cte.data_emissao, data_emissao: cte.data_emissao, data_vencimento: b.data_vencimento,
          status: "em_aberto", auto: true, valor, pessoa_id: pessoaId, produtor_id: b.pagador_id,
          nfe_numero: numDoc, numero_documento: numDoc, chave_xml: cte.chave, origem_lancamento: "cte",
          operacao_gerencial_id: b.operacao_gerencial_id, ano_safra_id: b.ano_safra_id || null, ciclo_id: b.ciclo_id || null,
          centro_custo_id: b.centro_custo_id || null, observacao: obs,
        }).select("id").single();
        if (eL) return NextResponse.json({ ok: false, error: eL.message }, { status: 500 });
        tabela = "lancamentos"; lancId = l.id as string;
      } else {
        const { data: ja } = await db.from("empresa_lancamentos").select("id").eq("empresa_id", b.pagador_id).eq("tipo", "pagar").eq("origem", "cte").eq("numero_documento", numDoc).neq("status", "cancelado").limit(1);
        if (ja?.length) return NextResponse.json({ ok: false, error: "Já existe um Contas a Pagar da empresa para este CT-e." }, { status: 409 });
        const { data: l, error: eL } = await db.from("empresa_lancamentos").insert({
          fazenda_id: fazendaTitulo, empresa_id: b.pagador_id, tipo: "pagar", moeda: "BRL", descricao, categoria: "Fretes",
          competencia: String(cte.data_emissao ?? b.data_vencimento).slice(0, 7), status: "pendente", data_vencimento: b.data_vencimento,
          valor, pessoa_id: pessoaId, numero_documento: numDoc, origem: "cte",
          operacao_gerencial_id: b.operacao_gerencial_id, ano_safra_id: b.ano_safra_id || null, ciclo_id: b.ciclo_id || null,
          centro_custo_id: b.centro_custo_id || null, observacao: obs,
        }).select("id").single();
        if (eL) return NextResponse.json({ ok: false, error: eL.message }, { status: 500 });
        tabela = "empresa_lancamentos"; lancId = l.id as string;
      }

      const user = await getRequestUser(req.headers.get("authorization"));
      const { error: eU } = await db.from("cte_entradas").update({
        status: "processada", lancamento_id: lancId, lancamento_tabela: tabela, pessoa_id: pessoaId,
        produtor_id: b.pagador_tipo === "produtor" ? b.pagador_id : null, empresa_id: b.pagador_tipo === "empresa" ? b.pagador_id : null,
        operacao_gerencial_id: b.operacao_gerencial_id, ano_safra_id: b.ano_safra_id || null, ciclo_id: b.ciclo_id || null,
        centro_custo_id: b.centro_custo_id || null, data_vencimento: b.data_vencimento, observacao: b.observacao?.trim() || cte.observacao || null,
        processado_em: new Date().toISOString(), processado_por: user?.email ?? null,
      }).eq("id", cte.id).eq("status", "pendente");
      if (eU) {
        await db.from(tabela).delete().eq("id", lancId);
        return NextResponse.json({ ok: false, error: eU.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, lancamento_id: lancId });
    }

    if (b.acao === "estornar") {
      if (cte.status !== "processada") return NextResponse.json({ ok: false, error: "Só CT-e processado pode ser estornado." }, { status: 409 });
      if (cte.lancamento_id && cte.lancamento_tabela) {
        const tab = cte.lancamento_tabela as "lancamentos" | "empresa_lancamentos";
        const { data: t } = await db.from(tab).select("id, status, valor_pago, conciliado, lote_id").eq("id", cte.lancamento_id).maybeSingle();
        if (t) {
          const aberto = tab === "lancamentos" ? ["em_aberto", "vencido", "vencendo"].includes(String(t.status)) : t.status === "pendente";
          if (!aberto || Number(t.valor_pago ?? 0) > 0 || t.conciliado || t.lote_id)
            return NextResponse.json({ ok: false, error: "O Contas a Pagar deste CT-e já foi pago, conciliado ou está em borderô. Desfaça isso no Contas a Pagar antes de estornar." }, { status: 409 });
          const { error: eD } = await db.from(tab).delete().eq("id", t.id);
          if (eD) return NextResponse.json({ ok: false, error: eD.message }, { status: 500 });
        }
      }
      const { error: eU } = await db.from("cte_entradas").update({
        status: "pendente", lancamento_id: null, lancamento_tabela: null, processado_em: null, processado_por: null,
      }).eq("id", cte.id);
      if (eU) return NextResponse.json({ ok: false, error: eU.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
