/**
 * POST /api/fiscal/cte-entrada — CT-e recebido (frete contratado, cliente como tomador), Seção 381.
 *   processar: gera o Contas a Pagar para a transportadora (produtor → lancamentos; empresa → empresa_lancamentos)
 *              e marca o CT-e como processado. A transportadora entra no cadastro de Pessoas se ainda não existir.
 *   estornar:  apaga o título (se ainda não foi pago, conciliado nem posto em borderô) e volta o CT-e a pendente.
 *   criar:     lança um CT-e recebido fora do SIEG — pelo arquivo XML (lido como na importação do SIEG) ou digitado.
 *              Entra pendente; o processamento é o mesmo.
 *   excluir:   apaga um CT-e lançado à mão (XML ou digitado) que ainda está pendente.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazenda, getRequestUser } from "../../../../lib/api-auth";
import { parseCTeXml } from "../../../../lib/sieg";

export const runtime = "nodejs";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fmtDoc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

type CteDigitado = {
  chave: string; numero?: string; serie?: string; data_emissao: string; cfop?: string;
  emitente_nome: string; emitente_cnpj?: string; emitente_uf?: string;
  municipio_origem?: string; uf_origem?: string; municipio_destino?: string; uf_destino?: string;
  produto_descricao?: string; peso_kg?: number | null; valor_mercadoria?: number | null; valor_prestacao: number;
  nfe_chaves?: string[];
};
type Corpo = {
  acao: "processar" | "estornar" | "criar" | "excluir";
  id: string;
  xml?: string;
  digitado?: CteDigitado;
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
    const db = admin();
    if (b.acao === "criar") return criar(req, db, b);
    if (!b.id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
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

    if (b.acao === "excluir") {
      if (cte.status !== "pendente") return NextResponse.json({ ok: false, error: "Só CT-e pendente pode ser excluído (estorne antes, se já foi processado)." }, { status: 409 });
      if (cte.origem === "sieg") return NextResponse.json({ ok: false, error: "CT-e que veio do SIEG não é excluído: ele voltaria na próxima sincronização." }, { status: 409 });
      if (cte.xml_storage_path) await db.storage.from("arquivos").remove([cte.xml_storage_path as string]);
      const { error: eD } = await db.from("cte_entradas").delete().eq("id", cte.id).eq("status", "pendente");
      if (eD) return NextResponse.json({ ok: false, error: eD.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Chave do CT-e: cUF(2) AAMM(4) CNPJ emitente(14) modelo 57(2) série(3) número(9) tpEmis(1) código(8) DV(1)
function chaveValida(chave: string) {
  if (!/^\d{44}$/.test(chave) || chave.slice(20, 22) !== "57") return false;
  let peso = 2, soma = 0;
  for (let i = 42; i >= 0; i--) { soma += Number(chave[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return Number(chave[43]) === (resto < 2 ? 0 : 11 - resto);
}

async function criar(req: NextRequest, db: ReturnType<typeof admin>, b: Corpo) {
  if (!b.fazenda_id) return NextResponse.json({ ok: false, error: "Escolha a fazenda." }, { status: 400 });
  const negado = await exigirAcessoFazenda(req, b.fazenda_id);
  if (negado) return negado;
  const { data: fz } = await db.from("fazendas").select("conta_id").eq("id", b.fazenda_id).maybeSingle();
  const contaId = (fz?.conta_id as string | null) ?? null;

  let dados: Record<string, unknown>;
  let chave: string;
  let origem: "xml" | "manual";
  if (b.xml) {
    const c = parseCTeXml(b.xml);
    if (!c || !c.numero) return NextResponse.json({ ok: false, error: "Arquivo não é o XML de um CT-e." }, { status: 400 });
    chave = c.chave; origem = "xml";
    dados = {
      numero: c.numero, serie: c.serie, data_emissao: c.data_emissao || null, cfop: c.cfop, natureza_operacao: c.natureza,
      emitente_nome: c.emitente.nome, emitente_cnpj: c.emitente.cnpj, emitente_ie: c.emitente.ie, emitente_uf: c.emitente.uf,
      tomador_tipo: c.tomador.tipo, tomador_nome: c.tomador.nome, tomador_cnpj: c.tomador.cnpj,
      remetente_nome: c.remetente.nome, remetente_cnpj: c.remetente.cnpj, destinatario_nome: c.destinatario.nome, destinatario_cnpj: c.destinatario.cnpj,
      municipio_origem: c.municipio_origem, uf_origem: c.uf_origem, municipio_destino: c.municipio_destino, uf_destino: c.uf_destino,
      produto_descricao: c.produto || null, peso_kg: c.peso_kg, valor_mercadoria: c.valor_mercadoria,
      valor_prestacao: c.valor_prestacao, valor_receber: c.valor_receber, valor_icms: c.valor_icms, nfe_chaves: c.nfe_chaves,
    };
  } else if (b.digitado) {
    const d = b.digitado;
    chave = dig(d.chave); origem = "manual";
    if (!chaveValida(chave)) return NextResponse.json({ ok: false, error: "Chave de acesso inválida: confira os 44 dígitos do CT-e." }, { status: 400 });
    if (!d.emitente_nome?.trim()) return NextResponse.json({ ok: false, error: "Informe a transportadora." }, { status: 400 });
    if (!d.data_emissao || !/^\d{4}-\d{2}-\d{2}$/.test(d.data_emissao)) return NextResponse.json({ ok: false, error: "Informe a data de emissão." }, { status: 400 });
    const valor = Math.round(Number(d.valor_prestacao) * 100) / 100;
    if (!(valor > 0)) return NextResponse.json({ ok: false, error: "Informe o valor do frete." }, { status: 400 });
    const up = (v?: string) => v?.trim().toUpperCase() || null;
    dados = {
      // número, série e CNPJ da transportadora estão na própria chave
      numero: dig(d.numero) || chave.slice(25, 34).replace(/^0+/, ""), serie: dig(d.serie) || chave.slice(22, 25).replace(/^0+/, "") || "0",
      data_emissao: d.data_emissao, cfop: dig(d.cfop) || null,
      emitente_nome: d.emitente_nome.trim().toUpperCase(), emitente_cnpj: dig(d.emitente_cnpj) || chave.slice(6, 20), emitente_uf: up(d.emitente_uf),
      municipio_origem: up(d.municipio_origem), uf_origem: up(d.uf_origem), municipio_destino: up(d.municipio_destino), uf_destino: up(d.uf_destino),
      produto_descricao: up(d.produto_descricao), peso_kg: d.peso_kg ?? null, valor_mercadoria: d.valor_mercadoria ?? null,
      valor_prestacao: valor, valor_receber: valor, nfe_chaves: (d.nfe_chaves ?? []).map(dig).filter(k => k.length === 44),
    };
  } else {
    return NextResponse.json({ ok: false, error: "Envie o XML ou os dados do CT-e." }, { status: 400 });
  }

  // CT-e emitido pela própria conta (Fretes e Transporte) já tem o financeiro da emissão
  const { data: fazConta } = await db.from("fazendas").select("id").eq("conta_id", contaId ?? "");
  const { data: proprio } = await db.from("ctes").select("id").in("fazenda_id", (fazConta ?? []).map(f => f.id as string)).eq("chave_acesso", chave).limit(1);
  if (proprio?.length) return NextResponse.json({ ok: false, error: "Este CT-e foi emitido pelo próprio sistema (Fretes e Transporte) — não entra como frete contratado." }, { status: 409 });
  const { data: ja, error: eJa } = await db.from("cte_entradas").select("id, status, origem").eq("conta_id", contaId ?? "").eq("chave", chave).limit(1);
  if (eJa) return NextResponse.json({ ok: false, error: eJa.code === "42P01" || eJa.code === "PGRST205" ? "Rode a Seção 381 do supabase_migrations.sql." : eJa.message }, { status: 400 });
  if (ja?.length) return NextResponse.json({ ok: false, error: `Este CT-e já está lançado (${ja[0].origem === "sieg" ? "veio do SIEG" : "lançado à mão"}, ${ja[0].status}).`, existente_id: ja[0].id }, { status: 409 });

  let xmlPath: string | null = null;
  if (b.xml) {
    const caminho = `ctes-entrada/${b.fazenda_id}/${chave}.xml`;
    const up = await db.storage.from("arquivos").upload(caminho, b.xml, { contentType: "application/xml", upsert: true });
    if (!up.error) xmlPath = caminho;
  }
  const { data: novo, error: eIns } = await db.from("cte_entradas").insert({
    ...dados, conta_id: contaId, fazenda_id: b.fazenda_id, chave, origem, status: "pendente", xml_storage_path: xmlPath,
  }).select("id").single();
  if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: novo.id });
}
