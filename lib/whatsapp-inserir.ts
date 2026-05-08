// Executa as inserções no banco após confirmação do usuário
import { createClient } from "@supabase/supabase-js";
import type { FluxoNome } from "./whatsapp-flows";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseData(texto: string): string {
  const hoje = new Date();
  const t = texto.toLowerCase().trim();
  if (t === "hoje" || t === "à vista" || t === "a vista") return hoje.toISOString().split("T")[0];
  if (t === "ontem") { hoje.setDate(hoje.getDate() - 1); return hoje.toISOString().split("T")[0]; }
  if (t === "amanhã" || t === "amanha") { hoje.setDate(hoje.getDate() + 1); return hoje.toISOString().split("T")[0]; }
  if (t === "mês que vem" || t === "mes que vem") { hoje.setMonth(hoje.getMonth() + 1); return hoje.toISOString().split("T")[0]; }
  // dd/mm ou dd/mm/yyyy
  const match = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (match) {
    const ano = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : hoje.getFullYear();
    return `${ano}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return hoje.toISOString().split("T")[0];
}

function parseValor(texto: string): number {
  return parseFloat(String(texto).replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

type Resultado = { ok: boolean; mensagem: string };

// ── Roteador principal ──────────────────────────────────────────────────────
export async function executarInsercao(
  fluxo: FluxoNome,
  dados: Record<string, unknown>,
  fazendaId: string,
  usuarioId: string
): Promise<Resultado> {
  switch (fluxo) {
    case "abastecimento":      return inserirAbastecimento(dados, fazendaId);
    case "operacao_lavoura":   return inserirOperacaoLavoura(dados, fazendaId);
    case "entrada_estoque":    return inserirEntradaEstoque(dados, fazendaId);
    case "saida_estoque":      return inserirSaidaEstoque(dados, fazendaId);
    case "lancar_cp":          return inserirLancamento("pagar", dados, fazendaId);
    case "lancar_cr":          return inserirLancamento("receber", dados, fazendaId);
    case "baixar_cp":          return baixarLancamento("pagar", dados, fazendaId);
    case "baixar_cr":          return baixarLancamento("receber", dados, fazendaId);
    case "romaneio":           return inserirRomaneio(dados, fazendaId);
    default:                   return { ok: false, mensagem: "Fluxo desconhecido." };
  }
}

// ── Abastecimento ───────────────────────────────────────────────────────────
async function inserirAbastecimento(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const valor = parseValor(String(dados.valor ?? 0));
  const vencimento = parseData(String(dados.vencimento ?? "hoje"));

  // Lançar CP
  const { error: errCp } = await sb().from("lancamentos").insert({
    fazenda_id: fazendaId,
    tipo: "pagar",
    descricao: `Abastecimento ${dados.produto ?? "combustível"} — ${dados.veiculo ?? dados.tipo_destino}`,
    categoria: "combustivel",
    data_lancamento: new Date().toISOString().split("T")[0],
    data_vencimento: vencimento,
    valor,
    moeda: "BRL",
    status: "em_aberto",
    auto: false,
    origem: "whatsapp",
  });
  if (errCp) return { ok: false, mensagem: `❌ Erro ao lançar CP: ${errCp.message}` };

  // Se for para estoque, movimentar estoque
  if (dados.tipo_destino === "estoque") {
    const { data: insumo } = await sb().from("insumos")
      .select("id, estoque, valor_unitario, custo_medio")
      .eq("fazenda_id", fazendaId)
      .ilike("nome", `%${dados.produto}%`).single();

    if (insumo) {
      const qtd = Number(dados.quantidade ?? 0);
      const novoEstoque = Number(insumo.estoque) + qtd;
      const novoMedio = qtd > 0 ? (Number(insumo.custo_medio ?? insumo.valor_unitario) * Number(insumo.estoque) + valor) / novoEstoque : Number(insumo.custo_medio ?? insumo.valor_unitario);

      await sb().from("insumos").update({ estoque: novoEstoque, custo_medio: novoMedio }).eq("id", insumo.id);
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id: fazendaId, insumo_id: insumo.id, tipo: "entrada",
        quantidade: qtd, valor_unitario: valor / (qtd || 1),
        motivo: "Compra via WhatsApp", data: new Date().toISOString().split("T")[0],
      });
    }
  }

  // Criar pendência fiscal se não teve NF
  const semNf = !dados.nf_dados && (dados.tem_nf === "nao" || !dados.tem_nf);
  if (semNf) {
    // Buscar id do lançamento recém-criado para vincular
    const { data: lancRecente } = await sb().from("lancamentos")
      .select("id")
      .eq("fazenda_id", fazendaId)
      .eq("origem", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    await sb().from("pendencias_fiscais").insert({
      fazenda_id: fazendaId,
      lancamento_id: lancRecente?.id ?? null,
      tipo: "abastecimento",
      status: "aguardando",
      descricao: `Abastecimento ${dados.produto ?? "combustível"} — ${dados.veiculo ?? dados.tipo_destino}`,
      valor,
      data_operacao: new Date().toISOString().split("T")[0],
      origem: "whatsapp",
      observacoes: `Registrado via WhatsApp sem NF — ${dados.quantidade}L de ${dados.produto}`,
    });
  }

  const avisoNf = semNf ? "\n⚠️ _Sem NF — criada pendência fiscal em Fiscal → Pendências_" : "";
  return { ok: true, mensagem: `✅ Abastecimento registrado!\n• CP lançado: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Vence: ${vencimento}${avisoNf}` };
}

// ── Operação de lavoura ─────────────────────────────────────────────────────
async function inserirOperacaoLavoura(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  // tipo_op aceita string direta (pulverizacao, adubacao…) ou código numérico legado (1,2,3,4)
  const tipoMap: Record<string, string> = { "1": "pulverizacao", "2": "adubacao", "3": "plantio", "4": "correcao_solo" };
  const tipoRaw = String(dados.tipo_op ?? "pulverizacao");
  const tipoOp = tipoMap[tipoRaw] ?? tipoRaw;
  const tipoProduto = String(dados.tipo_produto ?? "herbicida");
  const dataOp = parseData(String(dados.data_op ?? "hoje"));
  const doseStr = String(dados.dose ?? "0");
  const doseNum = parseFloat(doseStr) || 0;
  const unidade = String(dados.unidade ?? (doseStr.includes("kg") ? "kg/ha" : "L/ha"));
  const areaHa  = Number(dados.area_ha ?? 0) || null;

  // Buscar talhão pelo nome
  const { data: talhoes } = await sb().from("talhoes")
    .select("id, nome").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.talhao}%`).limit(1);
  const talhao = talhoes?.[0] ?? null;

  // Buscar insumo pelo nome
  const { data: insumos } = await sb().from("insumos")
    .select("id, nome, custo_medio").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.produto}%`).limit(1);
  const insumo = insumos?.[0] ?? null;

  // Buscar ciclo: primeiro pelo nome/descrição fornecido, depois pelo mais recente ativo
  let ciclo: { id: string } | null = null;
  const nomeCiclo = String(dados.ciclo ?? "").trim();
  if (nomeCiclo) {
    const { data: ciclosBusca } = await sb().from("ciclos")
      .select("id, descricao, cultura")
      .eq("fazenda_id", fazendaId)
      .or(`descricao.ilike.%${nomeCiclo}%,cultura.ilike.%${nomeCiclo}%`)
      .limit(1);
    ciclo = ciclosBusca?.[0] ?? null;
  }
  if (!ciclo) {
    const { data: ciclosAtivos } = await sb().from("ciclos")
      .select("id").eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false }).limit(1);
    ciclo = ciclosAtivos?.[0] ?? null;
  }

  // ── Pulverização ────────────────────────────────────────────────────────────
  if (tipoOp === "pulverizacao") {
    const { data: pulv, error } = await sb().from("pulverizacoes").insert({
      fazenda_id: fazendaId,
      ciclo_id: ciclo?.id ?? null,
      talhao_id: talhao?.id ?? null,
      tipo: tipoProduto,
      data_inicio: dataOp,
      area_ha: areaHa,
      observacao: `Registrado via WhatsApp — ${dados.produto}`,
    }).select("id").single();

    if (error) return { ok: false, mensagem: `❌ Erro pulverização: ${error.message}` };

    if (pulv && insumo) {
      const custoHa = doseNum * Number(insumo.custo_medio ?? 0);
      await sb().from("pulverizacao_itens").insert({
        pulverizacao_id: pulv.id,
        fazenda_id: fazendaId,
        insumo_id: insumo.id,
        nome_produto: insumo.nome,
        dose_ha: doseNum,
        unidade,
        valor_unitario: Number(insumo.custo_medio ?? 0),
        custo_ha: custoHa,
      });
    }
  }

  // ── Adubação ────────────────────────────────────────────────────────────────
  else if (tipoOp === "adubacao") {
    const { data: adub, error } = await sb().from("adubacoes_base").insert({
      fazenda_id: fazendaId,
      ciclo_id: ciclo?.id ?? null,
      talhao_id: talhao?.id ?? null,
      data_aplicacao: dataOp,
      area_ha: areaHa,
      observacao: `Registrado via WhatsApp — ${dados.produto}`,
    }).select("id").single();

    if (error) return { ok: false, mensagem: `❌ Erro adubação: ${error.message}` };

    if (adub && insumo) {
      try {
        await sb().from("adubacao_itens").insert({
          adubacao_id: adub.id,
          fazenda_id: fazendaId,
          insumo_id: insumo.id,
          nome_produto: insumo.nome,
          dose_ha: doseNum,
          unidade,
        });
      } catch { /* tabela pode não existir em todas as instâncias */ }
    }
  }

  // ── Plantio ─────────────────────────────────────────────────────────────────
  else if (tipoOp === "plantio") {
    const { error } = await sb().from("plantios").insert({
      fazenda_id: fazendaId,
      ciclo_id: ciclo?.id ?? null,
      talhao_id: talhao?.id ?? null,
      data_plantio: dataOp,
      area_ha: areaHa,
      cultura: String(dados.cultura ?? "soja"),
      semente: insumo ? insumo.nome : String(dados.produto ?? ""),
      observacao: `Registrado via WhatsApp`,
    });
    if (error) return { ok: false, mensagem: `❌ Erro plantio: ${error.message}` };
  }

  // ── Correção de solo ─────────────────────────────────────────────────────────
  else if (tipoOp === "correcao_solo") {
    const { error } = await sb().from("correcoes_solo").insert({
      fazenda_id: fazendaId,
      ciclo_id: ciclo?.id ?? null,
      talhao_id: talhao?.id ?? null,
      data_aplicacao: dataOp,
      area_ha: areaHa,
      produto: insumo ? insumo.nome : String(dados.produto ?? ""),
      dose_tha: doseNum,
      observacao: `Registrado via WhatsApp`,
    });
    if (error) return { ok: false, mensagem: `❌ Erro correção de solo: ${error.message}` };
  }

  const tipoLabel: Record<string, string> = {
    pulverizacao: "Pulverização", adubacao: "Adubação",
    plantio: "Plantio", correcao_solo: "Correção de Solo",
  };
  return {
    ok: true,
    mensagem: `✅ ${tipoLabel[tipoOp] ?? tipoOp} registrada!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto: ${insumo?.nome ?? dados.produto}\n• Dose: ${doseNum} ${unidade}\n• Data: ${dataOp}`,
  };
}

// ── Entrada em estoque ──────────────────────────────────────────────────────
async function inserirEntradaEstoque(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const valor = parseValor(String(dados.valor ?? 0));
  const vencimento = parseData(String(dados.vencimento ?? "hoje"));
  const qtd = Number(dados.quantidade ?? 0);

  const { data: insumo } = await sb().from("insumos")
    .select("id, estoque, custo_medio").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.produto}%`).single();

  if (insumo) {
    const novoEstoque = Number(insumo.estoque) + qtd;
    const novoMedio = qtd > 0 ? (Number(insumo.custo_medio ?? 0) * Number(insumo.estoque) + valor) / novoEstoque : Number(insumo.custo_medio ?? 0);
    await sb().from("insumos").update({ estoque: novoEstoque, custo_medio: novoMedio }).eq("id", insumo.id);
    await sb().from("movimentacoes_estoque").insert({
      fazenda_id: fazendaId, insumo_id: insumo.id, tipo: "entrada",
      quantidade: qtd, valor_unitario: qtd > 0 ? valor / qtd : 0,
      motivo: `Compra via WhatsApp — ${dados.fornecedor}`,
      data: new Date().toISOString().split("T")[0],
    });
  }

  await sb().from("lancamentos").insert({
    fazenda_id: fazendaId, tipo: "pagar",
    descricao: `Compra ${dados.produto} — ${dados.fornecedor}`,
    categoria: "insumo", data_lancamento: new Date().toISOString().split("T")[0],
    data_vencimento: vencimento, valor, moeda: "BRL", status: "em_aberto",
    auto: false, origem: "whatsapp",
  });

  return { ok: true, mensagem: `✅ Entrada registrada!\n• ${dados.produto}: +${qtd} unidades\n• CP: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — vence ${vencimento}` };
}

// ── Saída de estoque ────────────────────────────────────────────────────────
async function inserirSaidaEstoque(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const qtd = Number(dados.quantidade ?? 0);

  const { data: insumo } = await sb().from("insumos")
    .select("id, estoque, nome").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.produto}%`).single();

  if (!insumo) return { ok: false, mensagem: `❌ Produto "${dados.produto}" não encontrado.` };
  if (Number(insumo.estoque) < qtd) return { ok: false, mensagem: `❌ Estoque insuficiente. Disponível: ${insumo.estoque}` };

  await sb().from("insumos").update({ estoque: Number(insumo.estoque) - qtd }).eq("id", insumo.id);
  await sb().from("movimentacoes_estoque").insert({
    fazenda_id: fazendaId, insumo_id: insumo.id, tipo: "saida",
    quantidade: qtd, motivo: `Saída para ${dados.destino} via WhatsApp`,
    data: new Date().toISOString().split("T")[0],
  });

  return { ok: true, mensagem: `✅ Saída registrada!\n• ${insumo.nome}: -${qtd}\n• Destino: ${dados.destino}` };
}

// ── Lançamento CP/CR ────────────────────────────────────────────────────────
async function inserirLancamento(tipo: "pagar" | "receber", dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const valor = parseValor(String(dados.valor ?? 0));
  const vencimento = parseData(String(dados.vencimento ?? "hoje"));

  let pessoaId: string | null = null;
  const nomePessoa = String(dados.fornecedor ?? dados.cliente ?? "");
  if (nomePessoa && nomePessoa !== "não informar") {
    const { data: pessoa } = await sb().from("pessoas")
      .select("id").eq("fazenda_id", fazendaId).ilike("nome", `%${nomePessoa}%`).single();
    pessoaId = pessoa?.id ?? null;
  }

  const { error } = await sb().from("lancamentos").insert({
    fazenda_id: fazendaId, tipo,
    descricao: String(dados.descricao ?? ""),
    categoria: String(dados.categoria ?? "outros"),
    data_lancamento: new Date().toISOString().split("T")[0],
    data_vencimento: vencimento, valor, moeda: "BRL",
    status: "em_aberto", auto: false, origem: "whatsapp",
    pessoa_id: pessoaId,
  });

  if (error) return { ok: false, mensagem: `❌ Erro: ${error.message}` };
  const label = tipo === "pagar" ? "Conta a Pagar" : "Conta a Receber";
  return { ok: true, mensagem: `✅ ${label} lançada!\n• ${dados.descricao}\n• R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Vence: ${vencimento}` };
}

// ── Baixa CP/CR ─────────────────────────────────────────────────────────────
async function baixarLancamento(tipo: "pagar" | "receber", dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const { data: lancamentos } = await sb().from("lancamentos")
    .select("id, descricao, valor").eq("fazenda_id", fazendaId).eq("tipo", tipo)
    .in("status", ["em_aberto"]).ilike("descricao", `%${dados.busca}%`).limit(1);

  if (!lancamentos?.length) return { ok: false, mensagem: `❌ Conta não encontrada: "${dados.busca}"` };
  const lanc = lancamentos[0];

  const valorStr = String(dados.valor_pago ?? dados.valor_recebido ?? "mesmo valor");
  const valorFinal = valorStr.toLowerCase().includes("mesmo") ? Number(lanc.valor) : parseValor(valorStr);
  const dataStr = String(dados.data_pagamento ?? dados.data_recebimento ?? "hoje");
  const dataBaixa = parseData(dataStr);
  const statusFinal = tipo === "pagar" ? "pago" : "recebido";

  await sb().from("lancamentos").update({
    status: statusFinal,
    data_pagamento: dataBaixa,
    valor_pago: valorFinal,
  }).eq("id", lanc.id);

  return { ok: true, mensagem: `✅ Baixa registrada!\n• ${lanc.descricao}\n• Valor: R$ ${valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Data: ${dataBaixa}` };
}

// ── Romaneio ────────────────────────────────────────────────────────────────
async function inserirRomaneio(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const pesoBruto = Number(dados.peso_bruto ?? 0);
  const tara = Number(dados.tara ?? 0);
  const liquido = pesoBruto - tara;
  const sacas = liquido / 60;

  const { data: talhao } = await sb().from("talhoes")
    .select("id").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.talhao}%`).single();

  const { error } = await sb().from("romaneios").insert({
    fazenda_id: fazendaId,
    talhao_id: talhao?.id ?? null,
    commodity: String(dados.commodity ?? "soja"),
    placa_veiculo: String(dados.placa ?? ""),
    peso_bruto_kg: pesoBruto,
    tara_kg: tara,
    peso_liquido_kg: liquido,
    total_sacas: sacas,
    data_romaneio: new Date().toISOString().split("T")[0],
    origem: "whatsapp",
  });

  if (error) return { ok: false, mensagem: `❌ Erro: ${error.message}` };
  return { ok: true, mensagem: `✅ Romaneio registrado!\n• ${dados.commodity} — Placa ${dados.placa}\n• Líquido: ${liquido.toLocaleString("pt-BR")} kg (${sacas.toFixed(0)} sc)` };
}
