// Todas as 23 consultas disponíveis via WhatsApp
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}
function hoje() {
  return new Date().toISOString().split("T")[0];
}
function fimSemana() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}
function fimMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
}

// ── CP ──────────────────────────────────────────────────────────────────────
export async function consultaContasPagarSemana(fazendaId: string) {
  const { data } = await sb().from("lancamentos")
    .select("descricao, valor, moeda, data_vencimento, status")
    .eq("fazenda_id", fazendaId).eq("tipo", "pagar")
    .in("status", ["em_aberto", "vencido"])
    .gte("data_vencimento", hoje()).lte("data_vencimento", fimSemana())
    .order("data_vencimento");
  if (!data?.length) return "📭 Nenhuma conta a pagar nos próximos 7 dias.";
  const total = data.reduce((s, r) => s + Number(r.valor), 0);
  const linhas = data.map(r => `• ${fmtData(r.data_vencimento)} — ${r.descricao}: ${fmtBRL(Number(r.valor))} ${r.moeda !== "BRL" ? `(${r.moeda})` : ""}`).join("\n");
  return `📋 *Contas a pagar — próximos 7 dias*\n${linhas}\n\n💰 Total: ${fmtBRL(total)}`;
}

export async function consultaContasAtrasadas(fazendaId: string) {
  const { data } = await sb().from("lancamentos")
    .select("descricao, valor, moeda, data_vencimento")
    .eq("fazenda_id", fazendaId).eq("tipo", "pagar").eq("status", "vencido")
    .order("data_vencimento");
  if (!data?.length) return "✅ Nenhuma conta em atraso!";
  const total = data.reduce((s, r) => s + Number(r.valor), 0);
  const linhas = data.map(r => {
    const dias = Math.floor((Date.now() - new Date(r.data_vencimento).getTime()) / 86400000);
    return `• ${r.descricao}: ${fmtBRL(Number(r.valor))} — ${dias}d atraso`;
  }).join("\n");
  return `⚠️ *Contas em atraso*\n${linhas}\n\n💰 Total: ${fmtBRL(total)}`;
}

export async function consultaProximoVencimentoMoeda(fazendaId: string, moeda: string) {
  const moedaUpper = moeda.toUpperCase();
  const { data } = await sb().from("lancamentos")
    .select("descricao, valor, moeda, data_vencimento")
    .eq("fazenda_id", fazendaId).eq("tipo", "pagar").eq("moeda", moedaUpper)
    .in("status", ["em_aberto"]).gte("data_vencimento", hoje())
    .order("data_vencimento").limit(1);
  if (!data?.length) return `📭 Nenhum vencimento em ${moedaUpper}.`;
  const r = data[0];
  return `📅 Próximo vencimento em ${moedaUpper}:\n• ${r.descricao}\n• Valor: ${r.moeda === "USD" ? `US$ ${Number(r.valor).toFixed(2)}` : fmtBRL(Number(r.valor))}\n• Vence: ${fmtData(r.data_vencimento)}`;
}

export async function consultaContasReceberMes(fazendaId: string) {
  const { data } = await sb().from("lancamentos")
    .select("descricao, valor, moeda, data_vencimento")
    .eq("fazenda_id", fazendaId).eq("tipo", "receber")
    .in("status", ["em_aberto"]).lte("data_vencimento", fimMes())
    .gte("data_vencimento", hoje()).order("data_vencimento");
  if (!data?.length) return "📭 Nenhuma conta a receber este mês.";
  const total = data.reduce((s, r) => s + Number(r.valor), 0);
  return `💰 *A receber este mês*: ${fmtBRL(total)}\n${data.length} lançamento${data.length !== 1 ? "s" : ""}`;
}

export async function consultaSaldoProjetado(fazendaId: string) {
  const { data: cp } = await sb().from("lancamentos")
    .select("valor").eq("fazenda_id", fazendaId).eq("tipo", "pagar")
    .in("status", ["em_aberto"]).lte("data_vencimento", fimMes());
  const { data: cr } = await sb().from("lancamentos")
    .select("valor").eq("fazenda_id", fazendaId).eq("tipo", "receber")
    .in("status", ["em_aberto"]).lte("data_vencimento", fimMes());
  const totalCp = (cp ?? []).reduce((s, r) => s + Number(r.valor), 0);
  const totalCr = (cr ?? []).reduce((s, r) => s + Number(r.valor), 0);
  const saldo = totalCr - totalCp;
  const emoji = saldo >= 0 ? "🟢" : "🔴";
  return `${emoji} *Saldo projetado até fim do mês*\n📈 A receber: ${fmtBRL(totalCr)}\n📉 A pagar: ${fmtBRL(totalCp)}\n💰 Saldo: ${fmtBRL(saldo)}`;
}

export async function consultaGastoCategoria(fazendaId: string, categoria: string, ano?: number) {
  const anoAtual = ano ?? new Date().getFullYear();
  const { data } = await sb().from("lancamentos")
    .select("valor").eq("fazenda_id", fazendaId).eq("tipo", "pagar")
    .ilike("categoria", `%${categoria}%`)
    .gte("data_lancamento", `${anoAtual}-01-01`)
    .lte("data_lancamento", `${anoAtual}-12-31`);
  const total = (data ?? []).reduce((s, r) => s + Number(r.valor), 0);
  return `📊 Gastos com *${categoria}* em ${anoAtual}: ${fmtBRL(total)}`;
}

// ── Arrendamentos ──────────────────────────────────────────────────────────
export async function consultaArrendamentosVencer(fazendaId: string) {
  const { data } = await sb().from("arrendamento_pagamentos")
    .select("valor, forma_pagamento, data_vencimento, arrendamentos(fazenda_id)")
    .eq("status", "pendente").gte("data_vencimento", hoje())
    .lte("data_vencimento", fimSemana()).order("data_vencimento");
  const filtrados = (data ?? []).filter((r: Record<string, unknown>) => {
    const arr = r.arrendamentos as { fazenda_id: string } | null;
    return arr?.fazenda_id === fazendaId;
  });
  if (!filtrados.length) return "✅ Nenhum arrendamento vencendo nos próximos 7 dias.";
  const linhas = filtrados.map((r: Record<string, unknown>) =>
    `• ${fmtData(r.data_vencimento as string)} — ${fmtBRL(Number(r.valor))} (${r.forma_pagamento})`
  ).join("\n");
  return `🌾 *Arrendamentos a vencer*\n${linhas}`;
}

// ── Contratos / Comercialização ────────────────────────────────────────────
export async function consultaSacasComprometidas(fazendaId: string, commodity?: string, safra?: string) {
  let q = sb().from("contratos").select("produto, safra, quantidade_total, quantidade_entregue, unidade, status")
    .eq("fazenda_id", fazendaId).in("status", ["confirmado", "em_andamento", "encerrado"]) as unknown as ReturnType<typeof sb>["from"];
  if (commodity) q = (q as unknown as { ilike: (col: string, val: string) => unknown }).ilike("produto", `%${commodity}%`) as unknown as typeof q;
  const { data } = await (q as unknown as Promise<{ data: Record<string, unknown>[] | null }>);
  if (!data?.length) return `📭 Nenhum contrato${commodity ? ` de ${commodity}` : ""} encontrado.`;
  const filtrados = safra ? data.filter((r) => String(r.safra ?? "").includes(safra.replace("/", ""))) : data;
  const total = filtrados.reduce((s, r) => s + Number(r.quantidade_total ?? 0), 0);
  const entregue = filtrados.reduce((s, r) => s + Number(r.quantidade_entregue ?? 0), 0);
  const saldo = total - entregue;
  return `📦 *Contratos${commodity ? ` ${commodity}` : ""}${safra ? ` safra ${safra}` : ""}*\n• Total vendido: ${total.toLocaleString("pt-BR")} sc\n• Já entregue: ${entregue.toLocaleString("pt-BR")} sc\n• Saldo a entregar: ${saldo.toLocaleString("pt-BR")} sc`;
}

export async function consultaPrecoMedioVenda(fazendaId: string, commodity: string) {
  const { data } = await sb().from("contratos")
    .select("produto, quantidade_total, valor_unitario, moeda")
    .eq("fazenda_id", fazendaId).in("status", ["confirmado", "em_andamento"])
    .ilike("produto", `%${commodity}%`);
  if (!data?.length) return `📭 Nenhum contrato de ${commodity}.`;
  const totalQtd = data.reduce((s, r) => s + Number(r.quantidade_total ?? 0), 0);
  const totalVal = data.reduce((s, r) => s + Number(r.quantidade_total ?? 0) * Number(r.valor_unitario ?? 0), 0);
  const pmedio = totalQtd > 0 ? totalVal / totalQtd : 0;
  return `📈 Preço médio de venda — *${commodity}*: ${fmtBRL(pmedio)}/sc (${data.length} contrato${data.length !== 1 ? "s" : ""})`;
}

// ── Estoque ────────────────────────────────────────────────────────────────
export async function consultaEstoqueProduto(fazendaId: string, produto: string) {
  const { data } = await sb().from("insumos")
    .select("nome, estoque, unidade, estoque_minimo")
    .eq("fazenda_id", fazendaId).ilike("nome", `%${produto}%`);
  if (!data?.length) return `📭 Produto "${produto}" não encontrado no estoque.`;
  const linhas = data.map(r => {
    const alerta = r.estoque <= r.estoque_minimo ? " ⚠️ abaixo do mínimo" : "";
    return `• ${r.nome}: ${Number(r.estoque).toLocaleString("pt-BR")} ${r.unidade}${alerta}`;
  }).join("\n");
  return `📦 *Estoque — ${produto}*\n${linhas}`;
}

export async function consultaEstoqueMinimo(fazendaId: string) {
  const { data } = await sb().from("insumos")
    .select("nome, estoque, estoque_minimo, unidade")
    .eq("fazenda_id", fazendaId)
    .filter("estoque", "lte", sb().from("insumos").select("estoque_minimo"));
  // Fallback via js filter
  const { data: todos } = await sb().from("insumos").select("nome, estoque, estoque_minimo, unidade").eq("fazenda_id", fazendaId);
  const criticos = (todos ?? []).filter(r => Number(r.estoque) <= Number(r.estoque_minimo));
  if (!criticos.length) return "✅ Todos os itens estão acima do estoque mínimo.";
  const linhas = criticos.map(r => `• ${r.nome}: ${Number(r.estoque)} ${r.unidade} (mín: ${Number(r.estoque_minimo)})`).join("\n");
  return `⚠️ *Itens abaixo do mínimo*\n${linhas}`;
}

// ── Lavoura ────────────────────────────────────────────────────────────────
export async function consultaStatusLavoura(fazendaId: string) {
  const { data: ciclos } = await sb().from("ciclos")
    .select("id, cultura, descricao, anos_safra(ano)")
    .eq("fazenda_id", fazendaId).eq("status", "em_andamento").limit(5);
  if (!ciclos?.length) return "📭 Nenhum ciclo em andamento.";
  const linhas = ciclos.map((c: Record<string, unknown>) => {
    const ano = (c.anos_safra as { ano: string } | null)?.ano ?? "";
    return `• ${c.cultura} ${ano} — ${c.descricao ?? ""}`;
  }).join("\n");
  return `🌱 *Ciclos em andamento*\n${linhas}`;
}

export async function consultaProdutividade(fazendaId: string) {
  const { data } = await sb().from("colheitas")
    .select("talhoes(nome), total_sacas, area_ha, created_at")
    .eq("fazenda_id", fazendaId).order("created_at", { ascending: false }).limit(5);
  if (!data?.length) return "📭 Nenhuma colheita registrada.";
  const linhas = (data as Record<string, unknown>[]).map(r => {
    const sc_ha = Number(r.area_ha) > 0 ? (Number(r.total_sacas) / Number(r.area_ha)).toFixed(1) : "?";
    const talhao = (r.talhoes as { nome: string } | null)?.nome ?? "?";
    return `• ${talhao}: ${Number(r.total_sacas).toLocaleString("pt-BR")} sc | ${sc_ha} sc/ha`;
  }).join("\n");
  return `🌾 *Últimas colheitas*\n${linhas}`;
}

// ── DRE ────────────────────────────────────────────────────────────────────
export async function consultaDRESumario(fazendaId: string) {
  const anoAtual = new Date().getFullYear();
  const { data: receitas } = await sb().from("lancamentos")
    .select("valor").eq("fazenda_id", fazendaId).eq("tipo", "receber")
    .eq("status", "recebido").gte("data_lancamento", `${anoAtual}-01-01`);
  const { data: custos } = await sb().from("lancamentos")
    .select("valor").eq("fazenda_id", fazendaId).eq("tipo", "pagar")
    .eq("status", "pago").gte("data_lancamento", `${anoAtual}-01-01`);
  const totalReceita = (receitas ?? []).reduce((s, r) => s + Number(r.valor), 0);
  const totalCusto = (custos ?? []).reduce((s, r) => s + Number(r.valor), 0);
  const resultado = totalReceita - totalCusto;
  const margem = totalReceita > 0 ? ((resultado / totalReceita) * 100).toFixed(1) : "0";
  const emoji = resultado >= 0 ? "🟢" : "🔴";
  return `${emoji} *DRE ${anoAtual}*\n📈 Receita: ${fmtBRL(totalReceita)}\n📉 Custos: ${fmtBRL(totalCusto)}\n💰 Resultado: ${fmtBRL(resultado)} (${margem}%)`;
}
