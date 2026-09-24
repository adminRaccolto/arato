// Lançamentos financeiros automáticos do CT-e autorizado (definidos com o dono em 24/09/2026):
//  • CONTAS A RECEBER da transportadora (empresa emitente) — financeiro isolado da Empresa
//    (empresa_lancamentos), operação "PRESTAÇÃO DE SERVIÇO DE FRETE (CT-E)".
//  • CONTAS A PAGAR do tomador quando o frete é pago por alguém da própria conta: produtor
//    (lancamentos, com a operação FRETES conforme o produto) ou outra empresa do grupo
//    (empresa_lancamentos). Tomador de fora da conta → só o recebível da transportadora.
// Idempotente (não duplica ao reprocessar) e nunca derruba a emissão: erros só vão pro log.
import { createClient } from "@supabase/supabase-js";

const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fmtDoc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const somaDias = (iso: string, dias: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

function ogFretePorProduto(desc: string): string {
  const d = desc.toLowerCase();
  if (/(corretiv|calc|dolom)/.test(d)) return "FRETES CORRETIVOS";
  if (/sement/.test(d)) return "FRETES SEMENTES";
  if (/(soja|milho|algod|trigo|sorgo|gr[aã]o)/.test(d)) return "FRETES PRODUÇÃO";
  return "FRETES DIVERSOS";
}

export async function lancarFinanceiroCte(cteId: string): Promise<string[]> {
  const log: string[] = [];
  const db = sb();
  const { data: c } = await db.from("ctes").select("*").eq("id", cteId).maybeSingle();
  if (!c || c.status !== "autorizado") return ["CT-e não autorizado — nada lançado."];
  const valor = Number(c.valor_frete) || 0;
  if (valor <= 0) return ["CT-e sem valor de frete — nada lançado."];

  const { data: fz } = await db.from("fazendas").select("conta_id").eq("id", c.fazenda_id).maybeSingle();
  const { data: fzs } = fz?.conta_id ? await db.from("fazendas").select("id").eq("conta_id", fz.conta_id) : { data: [{ id: c.fazenda_id }] };
  const fazIds = (fzs ?? []).map(f => f.id as string);

  const docEmit = dig(c.emitente_cnpj);
  const numDoc = `${String(c.numero_cte).replace(/^0+/, "")}/${String(c.serie).replace(/^0+/, "")}`;
  const docTom = dig({ remetente: c.remetente_cnpj, destinatario: c.destinatario_cnpj, expedidor: c.expedidor_cnpj, recebedor: c.recebedor_cnpj }[String(c.tomador_tipo)] ?? c.destinatario_cnpj);
  const nomeTom = String({ remetente: c.remetente_nome, destinatario: c.destinatario_nome, expedidor: c.expedidor_nome, recebedor: c.recebedor_nome }[String(c.tomador_tipo)] ?? c.destinatario_nome ?? "");

  // Prazo de vencimento (Parâmetros → CT-e do emitente: frete_prazo_dias; padrão 30)
  const { data: cfgRows } = await db.from("configuracoes_modulo").select("config").in("fazenda_id", fazIds).eq("modulo", `cte_emp_${docEmit}`);
  const prazo = parseInt(String((cfgRows ?? []).map(r => (r.config as Record<string, string>)?.frete_prazo_dias).find(Boolean) ?? "30")) || 30;
  const emissao = String(c.data_emissao);
  const venc = somaDias(emissao, prazo);
  const competencia = emissao.slice(0, 7);

  const pessoaPorDoc = async (doc: string) => {
    if (!doc) return null;
    const { data } = await db.from("pessoas").select("id").in("fazenda_id", fazIds).or(`cpf_cnpj.eq.${doc},cpf_cnpj.eq.${fmtDoc(doc)}`).limit(1).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const empresaPorDoc = async (doc: string) => {
    if (!doc) return null;
    const { data } = await db.from("empresas").select("id, fazenda_id").in("fazenda_id", fazIds).or(`cpf_cnpj.eq.${doc},cpf_cnpj.eq.${fmtDoc(doc)}`).limit(1).maybeSingle();
    return data ?? null;
  };

  // 1) A RECEBER — empresa transportadora (financeiro isolado)
  const empEmit = await empresaPorDoc(docEmit);
  if (empEmit) {
    const { data: ja } = await db.from("empresa_lancamentos").select("id").eq("empresa_id", empEmit.id).eq("tipo", "receber").eq("origem", "cte").eq("numero_documento", numDoc).limit(1);
    if (!ja?.length) {
      const { error } = await db.from("empresa_lancamentos").insert({
        fazenda_id: empEmit.fazenda_id, empresa_id: empEmit.id, tipo: "receber", moeda: "BRL",
        descricao: `CT-e ${numDoc} — frete ${nomeTom}`.slice(0, 200), categoria: "Prestação de serviço de frete (CT-e)",
        competencia, status: "pendente", data_vencimento: venc, valor,
        pessoa_id: await pessoaPorDoc(docTom), numero_documento: numDoc, origem: "cte",
      });
      log.push(error ? `Receber (empresa) falhou: ${error.message}` : `A receber da transportadora lançado (${venc}).`);
    } else log.push("A receber da transportadora já existia.");
  } else log.push("Emitente do CT-e não é uma Empresa cadastrada — sem a receber.");

  // 2) A PAGAR — tomador da própria conta
  if (docTom && docTom !== docEmit) {
    const { data: prod } = await db.from("produtores").select("id").eq("conta_id", fz?.conta_id ?? "").or(`cpf_cnpj.eq.${docTom},cpf_cnpj.eq.${fmtDoc(docTom)}`).limit(1).maybeSingle();
    const empTom = await empresaPorDoc(docTom);
    const pessoaTransp = await pessoaPorDoc(docEmit);
    if (empTom) {
      const { data: ja } = await db.from("empresa_lancamentos").select("id").eq("empresa_id", empTom.id).eq("tipo", "pagar").eq("origem", "cte").eq("numero_documento", numDoc).limit(1);
      if (!ja?.length) {
        const { error } = await db.from("empresa_lancamentos").insert({
          fazenda_id: empTom.fazenda_id, empresa_id: empTom.id, tipo: "pagar", moeda: "BRL",
          descricao: `CT-e ${numDoc} — frete ${c.emitente_razao_social ?? ""}`.slice(0, 200), categoria: "Fretes",
          competencia, status: "pendente", data_vencimento: venc, valor, pessoa_id: pessoaTransp, numero_documento: numDoc, origem: "cte",
        });
        log.push(error ? `Pagar (empresa) falhou: ${error.message}` : "A pagar da empresa tomadora lançado.");
      }
    } else if (prod) {
      const { data: ja } = await db.from("lancamentos").select("id").eq("tipo", "pagar").eq("chave_xml", c.chave_acesso).in("fazenda_id", fazIds).limit(1);
      if (!ja?.length) {
        const nomeOg = ogFretePorProduto(String(c.produto_descricao ?? ""));
        const { data: ogs } = await db.from("operacoes_gerenciais").select("id, fazenda_id").in("fazenda_id", fazIds).eq("descricao", nomeOg);
        const og = (ogs ?? []).find(o => o.fazenda_id === c.fazenda_id) ?? (ogs ?? [])[0];
        const { error } = await db.from("lancamentos").insert({
          fazenda_id: c.fazenda_id, tipo: "pagar", moeda: "BRL", descricao: `CT-e ${numDoc} — ${c.emitente_razao_social ?? "frete"}`.slice(0, 200),
          categoria: "Frete", data_lancamento: emissao, data_vencimento: venc, status: "em_aberto", auto: true, valor,
          pessoa_id: pessoaTransp, produtor_id: prod.id, nfe_numero: numDoc, numero_documento: numDoc, chave_xml: c.chave_acesso,
          origem_lancamento: "cte", operacao_gerencial_id: og?.id ?? null,
        });
        log.push(error ? `Pagar (produtor) falhou: ${error.message}` : `A pagar do produtor lançado (${nomeOg}, ${venc}).`);
      } else log.push("A pagar do produtor já existia.");
    } else log.push("Tomador fora da conta — frete não é pago por este cliente (só o a receber da transportadora).");
  }
  return log;
}

// Cancelamento do CT-e: cancela os lançamentos automáticos que ainda não foram movimentados.
// Recebido/pago (pago, baixado, parcial) NÃO é tocado — devolve aviso pra tratar à mão.
export async function cancelarFinanceiroCte(cteId: string): Promise<{ log: string[]; pendenteManual: boolean }> {
  const log: string[] = [];
  let pendenteManual = false;
  const db = sb();
  const { data: c } = await db.from("ctes").select("numero_cte, serie, chave_acesso, fazenda_id").eq("id", cteId).maybeSingle();
  if (!c) return { log: ["CT-e não encontrado."], pendenteManual };
  const numDoc = `${String(c.numero_cte).replace(/^0+/, "")}/${String(c.serie).replace(/^0+/, "")}`;
  const { data: fz } = await db.from("fazendas").select("conta_id").eq("id", c.fazenda_id).maybeSingle();
  const { data: fzs } = fz?.conta_id ? await db.from("fazendas").select("id").eq("conta_id", fz.conta_id) : { data: [{ id: c.fazenda_id }] };
  const fazIds = (fzs ?? []).map(f => f.id as string);

  const { data: emp } = await db.from("empresa_lancamentos").select("id, status, tipo").in("fazenda_id", fazIds).eq("origem", "cte").eq("numero_documento", numDoc);
  for (const l of emp ?? []) {
    if (l.status === "pendente") {
      await db.from("empresa_lancamentos").update({ status: "cancelado" }).eq("id", l.id);
      log.push(`Empresa (${l.tipo}) cancelado.`);
    } else if (l.status === "pago") { pendenteManual = true; log.push(`Empresa (${l.tipo}) já movimentado — tratar manualmente.`); }
  }
  const { data: lan } = await db.from("lancamentos").select("id, status").in("fazenda_id", fazIds).eq("tipo", "pagar").eq("chave_xml", c.chave_acesso);
  for (const l of lan ?? []) {
    if (["previsto", "em_aberto", "vencido", "vencendo"].includes(String(l.status))) {
      await db.from("lancamentos").update({ status: "cancelado" }).eq("id", l.id);
      log.push("Conta a pagar do produtor cancelada.");
    } else if (l.status !== "cancelado") { pendenteManual = true; log.push(`Conta a pagar já ${l.status} — tratar manualmente.`); }
  }
  return { log, pendenteManual };
}
