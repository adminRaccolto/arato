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
  const match = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (match) {
    const ano = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : hoje.getFullYear();
    return `${ano}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return hoje.toISOString().split("T")[0];
}

function parseValor(texto: string): number {
  const s = String(texto).trim().replace(/[R$\s]/g, "");
  // Número JS passado como string (ex: "237.27") — ponto é decimal, sem vírgula
  if (s.includes(".") && !s.includes(",")) return parseFloat(s) || 0;
  // Formato BR: remove pontos de milhar, substitui vírgula decimal (ex: "1.234,56" ou "237,27")
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

// ── Conversão de unidades ────────────────────────────────────────────────────
// Fatores para converter para a unidade base (litro ou kg)
const PARA_LITRO: Record<string, number> = {
  ul: 1e-6, ml: 0.001, cl: 0.01, dl: 0.1, l: 1,
};
const PARA_KG: Record<string, number> = {
  mg: 1e-6, g: 0.001, kg: 1, t: 1000, ton: 1000,
  sc: 60, saca: 60, sacas: 60,
  "@": 15, ar: 15, arroba: 15, arrobas: 15,
};

// Normaliza string de unidade: remove "/ha", "/100L", etc. e coloca em minúsculo
function normUnit(str: string): string {
  return str.split("/")[0].trim().toLowerCase()
    .replace("litro", "l").replace("litros", "l").replace("liter", "l")
    .replace("mililitro", "ml").replace("mililitros", "ml")
    .replace("tonelada", "t").replace("toneladas", "t")
    .replace("saca", "sc").replace("sacas", "sc")
    .replace("grama", "g").replace("gramas", "g")
    .replace("kilograma", "kg").replace("quilograma", "kg")
    .replace("arroba", "@").replace("arrobas", "@");
}

/**
 * Converte `valor` de `unidadeOrigem` para `unidadeDestino`.
 * Aceita unidades compostas como "L/ha", "ml/ha", "kg/100L" — extrai apenas o numerador.
 * Suporta: ml, cl, dl, L (volume) · g, kg, t, sc (60 kg), @ (15 kg) (massa).
 * Conversão cross-domínio (volume → massa) não é feita — retorna o valor original.
 */
export function converterUnidade(valor: number, unidadeOrigem: string, unidadeDestino: string): number {
  if (!unidadeOrigem || !unidadeDestino) return valor;
  const de   = normUnit(unidadeOrigem);
  const para = normUnit(unidadeDestino);
  if (de === para) return valor;

  const deL = PARA_LITRO[de], paraL = PARA_LITRO[para];
  if (deL !== undefined && paraL !== undefined) return valor * deL / paraL;

  const deK = PARA_KG[de], paraK = PARA_KG[para];
  if (deK !== undefined && paraK !== undefined) return valor * deK / paraK;

  // Domínios diferentes ou unidade desconhecida — retorna sem converter
  console.warn(`[CONV] não converteu ${valor} ${unidadeOrigem} → ${unidadeDestino}`);
  return valor;
}

type Resultado = { ok: boolean; mensagem: string };

// ── Busca de insumo com fallback por palavras individuais ──────────────────
type InsumoRow = { id: string; nome: string; unidade: string; custo_medio: number; valor_unitario: number; estoque: number };

// ── Busca de insumo com fallback por palavras individuais ──────────────────
// Aceita nomes parciais: "3770", "tmg 3770", "semente tmg" encontram "Semente Soja TMG 3770"
async function buscarInsumo(fazendaId: string, nomeProduto: string): Promise<InsumoRow | null> {
  if (!nomeProduto) return null;
  const cols = "id, nome, unidade, custo_medio, valor_unitario, estoque";

  // 1. Match do termo completo
  const { data: r1 } = await sb().from("insumos").select(cols)
    .eq("fazenda_id", fazendaId).ilike("nome", `%${nomeProduto}%`).limit(1);
  if (r1?.[0]) return r1[0] as InsumoRow;

  // 2. Busca por palavra individualmente — números/alfanuméricos primeiro (ex: "3770")
  const palavras = nomeProduto.split(/\s+/).filter(w => w.length > 2);
  palavras.sort((a, b) => {
    const an = /\d/.test(a), bn = /\d/.test(b);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return b.length - a.length;
  });
  for (const palavra of palavras) {
    const { data: r2 } = await sb().from("insumos").select(cols)
      .eq("fazenda_id", fazendaId).ilike("nome", `%${palavra}%`).limit(1);
    if (r2?.[0]) return r2[0] as InsumoRow;
  }
  return null;
}

// ── Ciclo vigente na data (usado por todos os inserters) ────────────────────
async function buscarCicloVigente(fazendaId: string, dataRef: string): Promise<{ id: string; ano_safra_id: string | null } | null> {
  // 1. Ciclo cujo período contém a data
  const { data: c1 } = await sb().from("ciclos")
    .select("id, ano_safra_id").eq("fazenda_id", fazendaId)
    .lte("data_inicio", dataRef).gte("data_fim", dataRef)
    .order("data_inicio", { ascending: false }).limit(1);
  if (c1?.[0]) return c1[0];

  // 2. Ano safra vigente → ciclo mais recente do ano
  const { data: ano } = await sb().from("anos_safra")
    .select("id").eq("fazenda_id", fazendaId)
    .lte("data_inicio", dataRef).gte("data_fim", dataRef)
    .limit(1).maybeSingle();
  if (ano) {
    const { data: c2 } = await sb().from("ciclos")
      .select("id, ano_safra_id").eq("fazenda_id", fazendaId).eq("ano_safra_id", ano.id)
      .order("data_inicio", { ascending: false }).limit(1);
    if (c2?.[0]) return c2[0];
  }

  // 3. Fallback: ciclo mais recente
  const { data: c3 } = await sb().from("ciclos")
    .select("id, ano_safra_id").eq("fazenda_id", fazendaId)
    .order("created_at", { ascending: false }).limit(1);
  return c3?.[0] ?? null;
}

// ── Lookup de conta bancária por nome ───────────────────────────────────────
async function buscarContaBancaria(fazendaId: string, nome: string): Promise<{ id: string; nome: string } | null> {
  if (!nome || nome.trim() === "") return null;
  const { data } = await sb().from("contas_bancarias")
    .select("id, nome")
    .eq("fazenda_id", fazendaId)
    .eq("ativa", true)
    .ilike("nome", `%${nome.trim()}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ── Cria pendência operacional (insumo não encontrado) ──────────────────────
async function criarPendenciaInsumo(
  fazendaId: string,
  subtipo: string,
  operacaoId: string,
  dadosOriginais: Record<string, unknown>,
  produtoNome: string,
  talhaoNome: string | null,
  usuarioNome: string,
  usuarioWhatsapp: string,
): Promise<void> {
  const tipoLabel: Record<string, string> = {
    pulverizacao: "Pulverização", adubacao: "Adubação",
    plantio: "Plantio", correcao_solo: "Correção de Solo",
  };
  await sb().from("pendencias_operacionais").insert({
    fazenda_id: fazendaId,
    tipo: "operacao_lavoura",
    subtipo,
    motivo: "insumo_nao_encontrado",
    descricao: `${tipoLabel[subtipo] ?? subtipo} — produto "${produtoNome}" não encontrado no cadastro`,
    dados_originais: dadosOriginais,
    operacao_id: operacaoId,
    produto_nome_pendente: produtoNome,
    talhao_nome_pendente: talhaoNome ?? null,
    origem: "whatsapp",
    usuario_nome: usuarioNome || null,
    usuario_whatsapp: usuarioWhatsapp || null,
  });
}

// ── Roteador principal ──────────────────────────────────────────────────────
export async function executarInsercao(
  fluxo: FluxoNome,
  dados: Record<string, unknown>,
  fazendaId: string,
  usuarioId: string,
  usuarioNome: string = "",
  usuarioWhatsapp: string = "",
): Promise<Resultado> {
  switch (fluxo) {
    case "abastecimento":      return inserirAbastecimento(dados, fazendaId);
    case "operacao_lavoura":   return inserirOperacaoLavoura(dados, fazendaId, usuarioNome, usuarioWhatsapp);
    case "entrada_estoque":    return inserirEntradaEstoque(dados, fazendaId);
    case "saida_estoque":      return inserirSaidaEstoque(dados, fazendaId);
    case "lancar_cp":          return inserirLancamento("pagar", dados, fazendaId);
    case "lancar_cr":          return inserirLancamento("receber", dados, fazendaId);
    case "baixar_cp":          return baixarLancamento("pagar", dados, fazendaId);
    case "baixar_cr":          return baixarLancamento("receber", dados, fazendaId);
    case "romaneio":           return inserirRomaneio(dados, fazendaId);
    case "vincular_nf":        return vincularNF(dados, fazendaId);
    default:                   return { ok: false, mensagem: "Fluxo desconhecido." };
  }
}

// ── Abastecimento ───────────────────────────────────────────────────────────
async function inserirAbastecimento(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const hoje = new Date().toISOString().split("T")[0];

  // 1. Bomba obrigatória
  const bombaStr = String(dados.bomba_nome ?? "").trim();
  if (!bombaStr) {
    return { ok: false, mensagem: "❓ Qual bomba ou posto foi usado? (ex: *Bomba Fazenda*, *Posto Shell*)" };
  }

  // 2. Buscar bomba no banco — multi-tentativa para nomes parciais
  type BombaRow = { id: string; consume_estoque: boolean; estoque_atual_l: number; combustivel: string; nome: string };
  let bomba: BombaRow | null = null;

  // 2a. Match completo da string
  { const { data } = await sb().from("bombas_combustivel")
      .select("id, consume_estoque, estoque_atual_l, combustivel, nome")
      .eq("fazenda_id", fazendaId)
      .ilike("nome", `%${bombaStr}%`)
      .limit(1).maybeSingle();
    if (data) bomba = data as BombaRow;
  }

  // 2b. Match por cada palavra (ex: "bomba fazenda" → tenta "bomba", depois "fazenda")
  if (!bomba) {
    const palavras = bombaStr.split(/\s+/).filter(w => w.length > 2);
    for (const palavra of palavras) {
      const { data } = await sb().from("bombas_combustivel")
        .select("id, consume_estoque, estoque_atual_l, combustivel, nome")
        .eq("fazenda_id", fazendaId)
        .ilike("nome", `%${palavra}%`)
        .limit(1).maybeSingle();
      if (data) { bomba = data as BombaRow; break; }
    }
  }

  // 2c. Se ainda não encontrou, listar bombas disponíveis e pedir confirmação
  // NÃO cair no fluxo externo quando usuário claramente quis bomba interna
  if (!bomba) {
    const { data: todasBombas } = await sb().from("bombas_combustivel")
      .select("nome, consume_estoque")
      .eq("fazenda_id", fazendaId)
      .eq("ativa", true)
      .order("nome");
    const lista = (todasBombas ?? []).map((b: { nome: string; consume_estoque: boolean }) =>
      `• ${b.nome} (${b.consume_estoque ? "interna" : "posto externo"})`).join("\n");
    if (lista) {
      return { ok: false, mensagem: `❓ Não encontrei a bomba "*${bombaStr}*". Bombas cadastradas:\n${lista}\n\nQual foi usada?` };
    }
    // Sem bombas cadastradas → fluxo externo normal (posto sem cadastro)
  }

  const qtdUsuario = Number(dados.quantidade ?? 0);

  // 3. BOMBA INTERNA (consume_estoque = true ou não definido)
  if (bomba && bomba.consume_estoque !== false) {
    // Buscar insumo correspondente pelo tipo de combustível
    const insumo = await buscarInsumo(fazendaId, bomba.combustivel.replace(/_/g, " "));
    const custoMedio = Number(insumo?.custo_medio ?? insumo?.valor_unitario ?? 0);

    // Quantidade obrigatória
    if (!qtdUsuario || qtdUsuario === 0) {
      return { ok: false, mensagem: "❓ Quantos litros foram abastecidos?" };
    }

    const valorInterno = custoMedio * qtdUsuario;

    // Lookup máquina
    const { data: maqData } = await sb().from("maquinas")
      .select("id")
      .eq("fazenda_id", fazendaId)
      .ilike("nome", `%${String(dados.veiculo ?? "")}%`)
      .limit(1).maybeSingle();

    // Inserir abastecimento sem CP
    await sb().from("abastecimentos").insert({
      fazenda_id:     fazendaId,
      bomba_id:       bomba.id,
      maquina_id:     maqData?.id ?? null,
      quantidade_l:   qtdUsuario,
      valor_unitario: custoMedio,
      valor_total:    valorInterno,
      data:           hoje,
      observacao:     String(dados.veiculo ?? "") || null,
      lancamento_id:  null,
    });

    // Deduzir estoque da bomba
    await sb().from("bombas_combustivel")
      .update({ estoque_atual_l: bomba.estoque_atual_l - qtdUsuario })
      .eq("id", bomba.id);

    // Deduzir insumo de estoque + movimentação
    if (insumo) {
      const novoEstoque = Number(insumo.estoque ?? 0) - qtdUsuario;
      await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id:     fazendaId,
        insumo_id:      insumo.id,
        tipo:           "saida",
        motivo:         "abastecimento",
        quantidade:     qtdUsuario,
        valor_unitario: custoMedio,
        data:           hoje,
        auto:           false,
        observacao:     `Abastecimento via WhatsApp — ${String(dados.veiculo ?? bomba.nome)}`,
      });
    }

    const custoLabel = custoMedio > 0
      ? `R$ ${valorInterno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (custo médio R$ ${custoMedio.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}/L)`
      : "custo médio não cadastrado";

    return {
      ok: true,
      mensagem: `✅ Abastecimento registrado!\n• ${qtdUsuario} L de ${bomba.combustivel.replace(/_/g, " ")} — *${bomba.nome}*${dados.veiculo ? `\n• Máquina: ${dados.veiculo}` : ""}\n• Custo: ${custoLabel}\n• Sem Conta a Pagar (bomba interna — custo pelo estoque)`,
    };
  }

  // 4. POSTO EXTERNO (consume_estoque === false — confirma que não é bomba interna)
  const valor = parseValor(String(dados.valor ?? 0));
  if (!valor || valor === 0) {
    const nomeBomba = bomba?.nome ?? bombaStr;
    return { ok: false, mensagem: `❓ Posto externo *${nomeBomba}* — qual o valor total do abastecimento? (ex: R$ 180,00)` };
  }

  if (!qtdUsuario || qtdUsuario === 0) {
    return { ok: false, mensagem: "❓ Quantos litros foram abastecidos?" };
  }

  const vencimento = parseData(String(dados.vencimento ?? "hoje"));
  const jaVStr = String(dados.ja_pago ?? "").toLowerCase();
  const formaPag = String(dados.forma_pagamento ?? "").toLowerCase();
  const jaPago = jaVStr === "true" || jaVStr === "sim" || jaVStr === "yes" ||
    String(dados.vencimento ?? "").toLowerCase().includes("vista") ||
    formaPag.includes("dinheiro") || formaPag.includes("débito") || formaPag.includes("debito") || formaPag.includes("pix");

  const conta   = await buscarContaBancaria(fazendaId, String(dados.conta_bancaria ?? ""));
  const cicloAb = await buscarCicloVigente(fazendaId, hoje);

  const cpPayload: Record<string, unknown> = {
    fazenda_id:      fazendaId,
    tipo:            "pagar",
    descricao:       `Abastecimento ${dados.produto ?? "combustível"} — ${dados.veiculo ?? bombaStr ?? "direto"}`,
    categoria:       "combustivel",
    data_lancamento: hoje,
    data_vencimento: vencimento,
    valor, moeda:    "BRL",
    status:          jaPago ? "baixado" : "em_aberto",
    conta_bancaria:  conta?.id ?? null,
    safra_id:        cicloAb?.id ?? null,
    ano_safra_id:    cicloAb?.ano_safra_id ?? null,
    observacao:      "Inserido via Arato-IA",
    auto:            false,
  };
  if (jaPago) { cpPayload.data_baixa = hoje; cpPayload.valor_pago = valor; }

  const { data: lancRow, error: errCp } = await sb().from("lancamentos").insert(cpPayload).select("id").maybeSingle();
  if (errCp) {
    console.error("[BOT] Erro insert lancamentos abastecimento:", JSON.stringify(errCp));
    return { ok: false, mensagem: `❌ Erro DB lancamentos: [${errCp.code}] ${errCp.message}` };
  }

  // Histórico de abastecimentos
  const { data: maqExtData } = await sb().from("maquinas")
    .select("id")
    .eq("fazenda_id", fazendaId)
    .ilike("nome", `%${String(dados.veiculo ?? "")}%`)
    .limit(1).maybeSingle();

  await sb().from("abastecimentos").insert({
    fazenda_id:     fazendaId,
    bomba_id:       bomba?.id ?? null,
    maquina_id:     maqExtData?.id ?? null,
    quantidade_l:   qtdUsuario,
    valor_unitario: qtdUsuario > 0 ? valor / qtdUsuario : 0,
    valor_total:    valor,
    data:           hoje,
    observacao:     String(dados.veiculo ?? "") || null,
    lancamento_id:  lancRow?.id ?? null,
  });

  // Pendência fiscal — aguardando NF do posto
  await sb().from("pendencias_fiscais").insert({
    fazenda_id:      fazendaId,
    lancamento_id:   lancRow?.id ?? null,
    tipo:            "abastecimento",
    status:          "aguardando",
    descricao:       String(cpPayload.descricao),
    valor,
    data_operacao:   hoje,
    fornecedor_nome: bombaStr || String(dados.veiculo ?? ""),
    origem:          "whatsapp",
  });

  const statusLabel = jaPago
    ? `Pago ✓${conta ? ` — debitado de *${conta.nome}*` : ""}`
    : `A vencer: ${vencimento}`;

  return {
    ok: true,
    mensagem: `✅ Abastecimento registrado!\n• ${qtdUsuario} L de ${dados.produto ?? "combustível"} — *${bombaStr}*${dados.veiculo ? `\n• Máquina: ${dados.veiculo}` : ""}\n• Valor: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• CP: ${statusLabel}`,
  };
}

// ── Operação de lavoura ─────────────────────────────────────────────────────
async function inserirOperacaoLavoura(dados: Record<string, unknown>, fazendaId: string, usuarioNome = "", usuarioWhatsapp = ""): Promise<Resultado> {
  const tipoMap: Record<string, string> = { "1": "pulverizacao", "2": "adubacao", "3": "plantio", "4": "correcao_solo" };
  const tipoRaw  = String(dados.tipo_op ?? "pulverizacao");
  const tipoOp   = tipoMap[tipoRaw] ?? tipoRaw;
  const tipoProduto = String(dados.tipo_produto ?? "herbicida");

  // Data obrigatória — perguntar se não informada
  const dataOpRaw = String(dados.data_op ?? "").trim();
  if (!dataOpRaw) return { ok: false, mensagem: "❓ Qual a data da operação? (ex: hoje, ontem, 10/05)" };
  const dataOp = parseData(dataOpRaw);
  const doseNum  = parseFloat(String(dados.dose ?? "0")) || 0;
  const areaHa   = Number(dados.area_ha ?? 0) || 0;

  // Unidade informada pelo usuário (ex: "L/ha", "ml/ha", "kg/ha")
  const unidadeUsuario = String(dados.unidade ?? "L/ha");

  const tipoLabel: Record<string, string> = {
    pulverizacao: "Pulverização", adubacao: "Adubação",
    plantio: "Plantio", correcao_solo: "Correção de Solo",
  };

  // ── Buscar talhão ──────────────────────────────────────────────────────────
  const { data: talhoes } = await sb().from("talhoes")
    .select("id, nome").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.talhao}%`).limit(1);
  const talhao = talhoes?.[0] ?? null;

  // ── Buscar insumo com unidade e custo_medio ────────────────────────────────
  const insumo = await buscarInsumo(fazendaId, String(dados.produto ?? ""));
  if (!insumo) console.warn("[BOT-OP] Insumo não encontrado para:", dados.produto, "| fazenda:", fazendaId);
  const unidadeInsumo = String(insumo?.unidade ?? "kg");
  const custoMedio = Number(insumo?.custo_medio ?? 0);

  // ── Conversão de dose: unidade do usuário → unidade nativa do insumo ───────
  const doseNativa = insumo ? converterUnidade(doseNum, unidadeUsuario, unidadeInsumo) : doseNum;
  const totalNativo = doseNativa * areaHa;   // total consumido na unidade nativa
  const custoHa     = doseNativa * custoMedio;
  const custoTotal  = totalNativo * custoMedio;

  // Indica se houve conversão de unidade (para mostrar no resultado)
  const converteu = normUnit(unidadeUsuario) !== normUnit(unidadeInsumo) && insumo !== null;
  const notaConversao = converteu
    ? `\n_↔️ Dose convertida: ${doseNum} ${unidadeUsuario} → ${doseNativa.toFixed(4).replace(/\.?0+$/, "")} ${unidadeInsumo}/ha_`
    : "";

  // ── Buscar ciclo ─────────────────────────────────────────────────────────────
  let ciclo: { id: string; descricao?: string; cultura?: string } | null = null;
  const nomeCiclo = String(dados.ciclo ?? "").trim();

  // 1. Usuário nomeou o ciclo → busca por nome, cultura ou ano safra
  if (nomeCiclo) {
    const { data: ciclosBusca } = await sb().from("ciclos")
      .select("id, descricao, cultura").eq("fazenda_id", fazendaId)
      .or(`descricao.ilike.%${nomeCiclo}%,cultura.ilike.%${nomeCiclo}%`).limit(1);
    ciclo = ciclosBusca?.[0] ?? null;

    if (!ciclo) {
      const { data: anos } = await sb().from("anos_safra")
        .select("id").eq("fazenda_id", fazendaId)
        .ilike("descricao", `%${nomeCiclo}%`).limit(1);
      const anoId = anos?.[0]?.id;
      if (anoId) {
        const { data: ciclosDoAno } = await sb().from("ciclos")
          .select("id, descricao, cultura").eq("fazenda_id", fazendaId).eq("ano_safra_id", anoId)
          .order("created_at", { ascending: false }).limit(1);
        ciclo = ciclosDoAno?.[0] ?? null;
      }
    }
  }

  // 2. Sem nome → busca ciclos ativos no período da operação
  if (!ciclo) {
    const { data: ciclosAtivos } = await sb().from("ciclos")
      .select("id, descricao, cultura").eq("fazenda_id", fazendaId)
      .lte("data_inicio", dataOp).gte("data_fim", dataOp)
      .order("data_inicio", { ascending: false });

    if (ciclosAtivos && ciclosAtivos.length === 1) {
      // Apenas 1 ciclo ativo no período → seleciona automaticamente
      ciclo = ciclosAtivos[0];
    } else if (ciclosAtivos && ciclosAtivos.length > 1) {
      // Múltiplos ciclos ativos → pergunta ao usuário
      const lista = ciclosAtivos
        .map((c, i) => `*${i + 1}* ${[c.cultura, c.descricao].filter(Boolean).join(" — ")}`)
        .join("\n");
      return { ok: false, mensagem: `❓ Há ${ciclosAtivos.length} ciclos ativos nesta data. Qual devo usar?\n${lista}` };
    }
  }

  // 3. Nenhum ciclo ativo no período → usa o mais recente cadastrado
  if (!ciclo) {
    const { data: ciclosRecentes } = await sb().from("ciclos")
      .select("id, descricao, cultura").eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false }).limit(1);
    ciclo = ciclosRecentes?.[0] ?? null;
  }

  // 4. Nenhum ciclo cadastrado → erro claro
  if (!ciclo) {
    return { ok: false, mensagem: "❌ Não encontrei nenhum ciclo/safra cadastrado para essa fazenda. Cadastre um ciclo em Lavoura → Safras antes de registrar operações." };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PULVERIZAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tipoOp === "pulverizacao") {
    if (!areaHa) return { ok: false, mensagem: "❌ Informe a área em hectares para registrar a pulverização." };
    const { data: pulv, error: errPulv } = await sb().from("pulverizacoes").insert({
      fazenda_id:  fazendaId,
      ciclo_id:    ciclo!.id,
      talhao_id:   talhao?.id ?? null,
      tipo:        tipoProduto,
      data_inicio: dataOp,
      data_fim:    dataOp,
      area_ha:     areaHa,
      observacao:  `Registrado via WhatsApp — ${insumo?.nome ?? dados.produto}`,
    }).select("id").single();

    if (errPulv) {
      console.error("[BOT-PULV] Erro insert pulverizacoes:", JSON.stringify(errPulv), "| fazenda:", fazendaId, "| ciclo:", ciclo!.id, "| talhao:", talhao?.id ?? "null", "| tipo:", tipoProduto, "| data:", dataOp, "| area:", areaHa);
      return { ok: false, mensagem: `❌ Erro pulverização: [${errPulv.code}] ${errPulv.message}` };
    }
    if (!pulv)   return { ok: false, mensagem: "❌ Erro ao obter ID da pulverização." };

    if (!insumo && dados.produto) {
      // Insumo não encontrado — cria pendência para resolver depois
      await criarPendenciaInsumo(fazendaId, "pulverizacao", pulv.id, {
        tipo_op: "pulverizacao", tipo_produto: tipoProduto,
        produto: dados.produto, talhao: dados.talhao,
        talhao_id: talhao?.id ?? null, ciclo_id: ciclo!.id,
        dose: doseNum, unidade: unidadeUsuario, area_ha: areaHa, data_op: dataOp,
      }, String(dados.produto), talhao ? null : String(dados.talhao ?? ""), usuarioNome, usuarioWhatsapp);
      return {
        ok: true,
        mensagem: `⚠️ Pulverização registrada com pendência!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto *"${dados.produto}"* não encontrado no cadastro.\n_Acesse Pendências → Operacionais para vincular o insumo e processar custo/estoque._\n_🔍 ${pulv.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
      };
    }

    if (insumo) {
      await sb().from("pulverizacao_itens").insert({
        pulverizacao_id: pulv.id,
        fazenda_id:      fazendaId,
        insumo_id:       insumo.id,
        nome_produto:    insumo.nome,
        dose_ha:         doseNativa,
        unidade:         unidadeInsumo,
        valor_unitario:  custoMedio,
        custo_ha:        custoHa,
        total_consumido: totalNativo,
        custo_total:     custoTotal,
      });

      const novoEstoque = Number(insumo.estoque ?? 0) - totalNativo;
      await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id: fazendaId, insumo_id: insumo.id,
        tipo: "saida", motivo: "baixa_uso", quantidade: totalNativo, data: dataOp,
        safra: ciclo?.id ?? null, operacao: tipoProduto,
        observacao: `Pulverização ${tipoProduto} — ${insumo.nome} via WhatsApp`, auto: true,
      });
      await sb().from("pulverizacoes").update({ custo_total: custoTotal }).eq("id", pulv.id);
      if (custoTotal > 0) {
        await sb().from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
          descricao: `Pulverização ${tipoProduto} — ${insumo.nome}`,
          categoria: "Insumos — Defensivos",
          data_lancamento: new Date().toISOString().split("T")[0],
          data_vencimento: dataOp, valor: custoTotal,
          safra_id: ciclo?.id ?? null, status: "em_aberto",
        });
      }
    }

    const estoqueRestante = insumo ? Number(insumo.estoque ?? 0) - totalNativo : null;
    const alertaNeg = estoqueRestante !== null && estoqueRestante < 0 ? `\n⚠️ *Estoque negativo!* Saldo: ${estoqueRestante.toFixed(2)} ${unidadeInsumo}` : "";
    const infoEstoque = insumo
      ? `\n• Consumido: ${totalNativo.toFixed(2)} ${unidadeInsumo} — estoque restante: ${(estoqueRestante ?? 0).toFixed(2)} ${unidadeInsumo}${alertaNeg}` : "";
    const infoCusto = custoTotal > 0
      ? `\n• Custo: R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (CP lançado)`
      : (insumo && custoMedio === 0 ? `\n⚠️ _Insumo sem preço cadastrado — atualize o custo médio em Estoque para registrar custos futuros._` : "");

    return {
      ok: true,
      mensagem: `✅ Pulverização registrada!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto: ${insumo?.nome ?? dados.produto}\n• Dose: ${doseNativa.toFixed(4).replace(/\.?0+$/, "")} ${unidadeInsumo}/ha × ${areaHa} ha${infoEstoque}${infoCusto}${notaConversao}\n_🔍 ${pulv.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADUBAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tipoOp === "adubacao") {
    if (!areaHa) return { ok: false, mensagem: "❌ Informe a área em hectares para registrar a adubação." };

    const { data: adub, error: errAdub } = await sb().from("adubacoes_base").insert({
      fazenda_id: fazendaId,
      ciclo_id:   ciclo!.id,
      talhao_id:  talhao?.id ?? null,
      data_aplicacao: dataOp,
      area_ha:    areaHa,
      custo_total: custoTotal || null,
      observacao: `Registrado via WhatsApp — ${insumo?.nome ?? dados.produto}`,
    }).select("id").single();

    if (errAdub) {
      console.error("[BOT-ADUB] Erro insert adubacoes_base:", JSON.stringify(errAdub), "| fazenda:", fazendaId, "| ciclo:", ciclo!.id, "| data:", dataOp);
      return { ok: false, mensagem: `❌ Erro adubação: [${errAdub.code}] ${errAdub.message}` };
    }
    if (!adub)   return { ok: false, mensagem: "❌ Erro ao obter ID da adubação." };

    if (!insumo && dados.produto) {
      await criarPendenciaInsumo(fazendaId, "adubacao", adub.id, {
        tipo_op: "adubacao", produto: dados.produto, talhao: dados.talhao,
        talhao_id: talhao?.id ?? null, ciclo_id: ciclo!.id,
        dose: doseNum, unidade: unidadeUsuario, area_ha: areaHa, data_op: dataOp,
      }, String(dados.produto), talhao ? null : String(dados.talhao ?? ""), usuarioNome, usuarioWhatsapp);
      return {
        ok: true,
        mensagem: `⚠️ Adubação registrada com pendência!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto *"${dados.produto}"* não encontrado no cadastro.\n_Acesse Pendências → Operacionais para vincular o insumo._\n_🔍 ${adub.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
      };
    }

    if (insumo) {
      const totalKg = converterUnidade(totalNativo, unidadeInsumo, "kg");
      await sb().from("adubacoes_base_itens").insert({
        adubacao_id: adub.id, fazenda_id: fazendaId,
        insumo_id: insumo.id, produto_nome: insumo.nome,
        dose_kg_ha: doseNativa, quantidade_kg: totalKg,
        valor_unitario: custoMedio, custo_total: custoTotal,
      });
      const novoEstoque = Number(insumo.estoque ?? 0) - totalNativo;
      await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id: fazendaId, insumo_id: insumo.id,
        tipo: "saida", motivo: "baixa_uso", quantidade: totalNativo, data: dataOp,
        safra: ciclo?.id ?? null, operacao: "adubacao_base",
        observacao: `Adubação de Base — ${insumo.nome} via WhatsApp`, auto: true,
      });
      if (custoTotal > 0) {
        await sb().from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
          descricao: `Adubação de Base — ${insumo.nome}`,
          categoria: "Insumos — Fertilizantes",
          data_lancamento: new Date().toISOString().split("T")[0],
          data_vencimento: dataOp, valor: custoTotal,
          safra_id: ciclo?.id ?? null, status: "em_aberto",
        });
      }
    }

    const estoqueRestante = insumo ? Number(insumo.estoque ?? 0) - totalNativo : null;
    const alertaNeg = estoqueRestante !== null && estoqueRestante < 0 ? `\n⚠️ *Estoque negativo!* Saldo: ${estoqueRestante.toFixed(2)} ${unidadeInsumo}` : "";
    const infoEstoque = insumo
      ? `\n• Consumido: ${totalNativo.toFixed(2)} ${unidadeInsumo} — estoque restante: ${(estoqueRestante ?? 0).toFixed(2)} ${unidadeInsumo}${alertaNeg}` : "";
    const infoCusto = custoTotal > 0
      ? `\n• Custo: R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (CP lançado)`
      : (insumo && custoMedio === 0 ? `\n⚠️ _Insumo sem preço cadastrado — atualize o custo médio em Estoque._` : "");

    return {
      ok: true,
      mensagem: `✅ Adubação registrada!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto: ${insumo?.nome ?? dados.produto}\n• Dose: ${doseNativa.toFixed(2)} ${unidadeInsumo}/ha × ${areaHa} ha${infoEstoque}${infoCusto}${notaConversao}\n_🔍 ${adub.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLANTIO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tipoOp === "plantio") {
    // Para plantio: quantidade em kg (semente)
    const quantidadeKg = converterUnidade(totalNativo, unidadeInsumo, "kg");
    const custoSementes = custoTotal; // total_nativo * custo_medio

    if (!areaHa) return { ok: false, mensagem: "❌ Informe a área em hectares para registrar o plantio." };
    const { data: plantioRow, error: errPlantio } = await sb().from("plantios").insert({
      fazenda_id:      fazendaId,
      ciclo_id:        ciclo!.id,
      talhao_id:       talhao?.id ?? null,
      data_plantio:    dataOp,
      area_ha:         areaHa,
      variedade:       insumo?.nome ?? String(dados.produto ?? ""),
      insumo_id:       insumo?.id ?? null,
      dose_kg_ha:      doseNativa || null,
      quantidade_kg:   quantidadeKg || null,
      custo_sementes:  custoSementes || null,
      observacao:      `Registrado via WhatsApp`,
    }).select("id").single();

    if (errPlantio) return { ok: false, mensagem: `❌ Erro plantio: ${errPlantio.message}` };
    if (!plantioRow) return { ok: false, mensagem: "❌ Erro ao obter ID do plantio." };

    if (!insumo && dados.produto) {
      await criarPendenciaInsumo(fazendaId, "plantio", plantioRow.id, {
        tipo_op: "plantio", produto: dados.produto, talhao: dados.talhao,
        talhao_id: talhao?.id ?? null, ciclo_id: ciclo!.id,
        dose: doseNum, unidade: unidadeUsuario, area_ha: areaHa, data_op: dataOp,
      }, String(dados.produto), talhao ? null : String(dados.talhao ?? ""), usuarioNome, usuarioWhatsapp);
      return {
        ok: true,
        mensagem: `⚠️ Plantio registrado com pendência!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto *"${dados.produto}"* não encontrado no cadastro.\n_Acesse Pendências → Operacionais para vincular a semente._\n_🔍 ${plantioRow.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
      };
    }

    if (insumo && totalNativo > 0) {
      const novoEstoque = Number(insumo.estoque ?? 0) - totalNativo;
      await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id: fazendaId, insumo_id: insumo.id,
        tipo: "saida", motivo: "baixa_uso", quantidade: totalNativo, data: dataOp,
        safra: ciclo?.id ?? null, operacao: "plantio",
        observacao: `Plantio — ${insumo.nome} via WhatsApp`, auto: true,
      });
      if (custoSementes > 0) {
        const { data: lanc } = await sb().from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
          descricao: `Plantio — ${insumo.nome}`,
          categoria: "Insumos — Sementes",
          data_lancamento: new Date().toISOString().split("T")[0],
          data_vencimento: dataOp, valor: custoSementes,
          safra_id: ciclo?.id ?? null, status: "em_aberto",
        }).select("id").single();
        if (lanc?.id) {
          await sb().from("plantios").update({ lancamento_id: lanc.id }).eq("id", plantioRow.id);
        }
      }
    }

    const estoqueRestante = insumo ? Number(insumo.estoque ?? 0) - totalNativo : null;
    const alertaNegP = estoqueRestante !== null && estoqueRestante < 0 ? `\n⚠️ *Estoque negativo!* Saldo: ${estoqueRestante.toFixed(2)} ${unidadeInsumo}` : "";
    const infoEstoque = insumo
      ? `\n• Semente: ${totalNativo.toFixed(2)} ${unidadeInsumo} (${quantidadeKg.toFixed(1)} kg) — estoque restante: ${(estoqueRestante ?? 0).toFixed(2)} ${unidadeInsumo}${alertaNegP}` : "";
    const infoCusto = custoSementes > 0
      ? `\n• Custo sementes: R$ ${custoSementes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (CP lançado)`
      : (insumo && custoMedio === 0 ? `\n⚠️ _Semente sem preço cadastrado — atualize o custo médio em Estoque._` : "");

    return {
      ok: true,
      mensagem: `✅ Plantio registrado!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Semente: ${insumo?.nome ?? dados.produto}\n• Dose: ${doseNativa.toFixed(2)} ${unidadeInsumo}/ha × ${areaHa} ha${infoEstoque}${infoCusto}${notaConversao}\n_🔍 ${plantioRow.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORREÇÃO DE SOLO
  // ═══════════════════════════════════════════════════════════════════════════
  if (tipoOp === "correcao_solo") {
    // dose_tha = dose em t/ha (coluna da tabela correcoes_solo)
    const doseTha   = converterUnidade(doseNativa, unidadeInsumo, "t");
    const totalTon  = converterUnidade(totalNativo, unidadeInsumo, "t");

    if (!areaHa) return { ok: false, mensagem: "❌ Informe a área em hectares para registrar a correção de solo." };
    const { data: corr, error: errCorr } = await sb().from("correcoes_solo").insert({
      fazenda_id:     fazendaId,
      ciclo_id:       ciclo!.id,
      talhao_id:      talhao?.id ?? null,
      data_aplicacao: dataOp,
      area_ha:        areaHa,
      finalidade:     "calcario",
      custo_total:    custoTotal || null,
      observacao:     `Registrado via WhatsApp — ${insumo?.nome ?? dados.produto}`,
    }).select("id").single();

    if (errCorr) return { ok: false, mensagem: `❌ Erro correção de solo: ${errCorr.message}` };
    if (!corr)   return { ok: false, mensagem: "❌ Erro ao obter ID da correção." };

    if (!insumo && dados.produto) {
      await criarPendenciaInsumo(fazendaId, "correcao_solo", corr.id, {
        tipo_op: "correcao_solo", produto: dados.produto, talhao: dados.talhao,
        talhao_id: talhao?.id ?? null, ciclo_id: ciclo!.id,
        dose: doseNum, unidade: unidadeUsuario, area_ha: areaHa, data_op: dataOp,
      }, String(dados.produto), talhao ? null : String(dados.talhao ?? ""), usuarioNome, usuarioWhatsapp);
      return {
        ok: true,
        mensagem: `⚠️ Correção de Solo registrada com pendência!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto *"${dados.produto}"* não encontrado no cadastro.\n_Acesse Pendências → Operacionais para vincular o insumo._\n_🔍 ${corr.id.slice(-8)} · faz:${fazendaId.slice(-6)}_`,
      };
    }

    if (insumo) {
      // Item da correção (usa quantidade_ton)
      await sb().from("correcoes_solo_itens").insert({
        correcao_id:    corr.id,
        fazenda_id:     fazendaId,
        insumo_id:      insumo.id,
        produto_nome:   insumo.nome,
        dose_ton_ha:    doseTha,
        quantidade_ton: totalTon,
        valor_unitario: custoMedio,
        custo_total:    custoTotal,
      });

      // Baixa de estoque na unidade nativa
      const novoEstoque = Number(insumo.estoque ?? 0) - totalNativo;
      await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);

      // Movimentação
      await sb().from("movimentacoes_estoque").insert({
        fazenda_id: fazendaId, insumo_id: insumo.id,
        tipo: "saida", motivo: "baixa_uso", quantidade: totalNativo, data: dataOp,
        safra: ciclo?.id ?? null, operacao: "correcao_solo",
        observacao: `Correção de Solo — ${insumo.nome} via WhatsApp`, auto: true,
      });

      // CP
      if (custoTotal > 0) {
        await sb().from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
          descricao: `Correção de Solo — ${insumo.nome}`,
          categoria: "Insumos — Corretivos",
          data_lancamento: new Date().toISOString().split("T")[0],
          data_vencimento: dataOp, valor: custoTotal,
          safra_id: ciclo?.id ?? null,
          status: "em_aberto",
        });
      }
    }

    const estoqueRestante = insumo ? Number(insumo.estoque ?? 0) - totalNativo : null;
    const alertaNegC = estoqueRestante !== null && estoqueRestante < 0 ? `\n⚠️ *Estoque negativo!* Saldo: ${estoqueRestante.toFixed(2)} ${unidadeInsumo}` : "";
    const infoEstoque = insumo
      ? `\n• Consumido: ${totalTon.toFixed(3)} t (${totalNativo.toFixed(2)} ${unidadeInsumo}) — estoque restante: ${(estoqueRestante ?? 0).toFixed(2)} ${unidadeInsumo}${alertaNegC}` : "";
    const infoCusto = custoTotal > 0
      ? `\n• Custo: R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (CP lançado)` : "";

    return {
      ok: true,
      mensagem: `✅ Correção de Solo registrada!\n• Talhão: ${talhao?.nome ?? dados.talhao}\n• Produto: ${insumo?.nome ?? dados.produto}\n• Dose: ${doseTha.toFixed(3)} t/ha × ${areaHa} ha${infoEstoque}${infoCusto}${notaConversao}`,
    };
  }

  return { ok: false, mensagem: `❌ Tipo de operação desconhecido: ${tipoOp}` };
}

// ── Entrada em estoque ──────────────────────────────────────────────────────
async function inserirEntradaEstoque(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const valor     = parseValor(String(dados.valor ?? 0));
  const vencimento = parseData(String(dados.vencimento ?? "hoje"));
  const qtdUsuario = Number(dados.quantidade ?? 0);
  const unidadeUsuario = String(dados.unidade ?? "");

  const insumo = await buscarInsumo(fazendaId, String(dados.produto ?? ""));

  let qtdFinal = qtdUsuario;
  let unidadeFinal = unidadeUsuario;
  let notaConversao = "";

  if (insumo) {
    const unidadeInsumo = String(insumo.unidade ?? "");
    if (unidadeUsuario && unidadeInsumo && normUnit(unidadeUsuario) !== normUnit(unidadeInsumo)) {
      qtdFinal = converterUnidade(qtdUsuario, unidadeUsuario, unidadeInsumo);
      notaConversao = ` _(${qtdUsuario} ${unidadeUsuario} → ${qtdFinal.toFixed(4).replace(/\.?0+$/, "")} ${unidadeInsumo})_`;
    }
    unidadeFinal = String(insumo.unidade ?? unidadeUsuario);

    const novoEstoque = Number(insumo.estoque ?? 0) + qtdFinal;
    const custoMedioAtual = Number(insumo.custo_medio ?? 0);
    const novoMedio = qtdFinal > 0
      ? (custoMedioAtual * Number(insumo.estoque ?? 0) + valor) / novoEstoque
      : custoMedioAtual;

    await sb().from("insumos").update({ estoque: novoEstoque, custo_medio: novoMedio }).eq("id", insumo.id);
    await sb().from("movimentacoes_estoque").insert({
      fazenda_id: fazendaId, insumo_id: insumo.id, tipo: "entrada",
      quantidade: qtdFinal, valor_unitario: qtdFinal > 0 ? valor / qtdFinal : 0,
      motivo: "compra", observacao: `Compra via WhatsApp — ${dados.fornecedor ?? ""}`,
      data: new Date().toISOString().split("T")[0], auto: false,
    });
  }

  await sb().from("lancamentos").insert({
    fazenda_id: fazendaId, tipo: "pagar",
    descricao: `Compra ${insumo?.nome ?? dados.produto} — ${dados.fornecedor ?? ""}`,
    categoria: "insumo", data_lancamento: new Date().toISOString().split("T")[0],
    data_vencimento: vencimento, valor, moeda: "BRL", status: "em_aberto",
  });

  return {
    ok: true,
    mensagem: `✅ Entrada registrada!\n• ${insumo?.nome ?? dados.produto}: +${qtdFinal.toFixed(2)} ${unidadeFinal}${notaConversao}\n• CP: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — vence ${vencimento}`,
  };
}

// ── Saída de estoque ────────────────────────────────────────────────────────
async function inserirSaidaEstoque(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const qtdUsuario = Number(dados.quantidade ?? 0);
  const unidadeUsuario = String(dados.unidade ?? "");

  const insumo = await buscarInsumo(fazendaId, String(dados.produto ?? ""));
  if (!insumo) return { ok: false, mensagem: `❌ Produto "${dados.produto}" não encontrado.` };

  const unidadeInsumo = String(insumo.unidade ?? "");
  let qtdFinal = qtdUsuario;
  let notaConversao = "";

  if (unidadeUsuario && unidadeInsumo && normUnit(unidadeUsuario) !== normUnit(unidadeInsumo)) {
    qtdFinal = converterUnidade(qtdUsuario, unidadeUsuario, unidadeInsumo);
    notaConversao = ` _(${qtdUsuario} ${unidadeUsuario} → ${qtdFinal.toFixed(4).replace(/\.?0+$/, "")} ${unidadeInsumo})_`;
  }

  if (Number(insumo.estoque ?? 0) < qtdFinal) {
    return { ok: false, mensagem: `❌ Estoque insuficiente. Disponível: ${Number(insumo.estoque ?? 0).toFixed(2)} ${unidadeInsumo}` };
  }

  const novoEstoque = Number(insumo.estoque ?? 0) - qtdFinal;
  await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
  await sb().from("movimentacoes_estoque").insert({
    fazenda_id: fazendaId, insumo_id: insumo.id, tipo: "saida",
    quantidade: qtdFinal, motivo: "baixa_uso",
    observacao: `Saída para ${dados.destino ?? "uso"} via WhatsApp`,
    data: new Date().toISOString().split("T")[0], auto: false,
  });

  return {
    ok: true,
    mensagem: `✅ Saída registrada!\n• ${insumo.nome}: -${qtdFinal.toFixed(2)} ${unidadeInsumo}${notaConversao}\n• Destino: ${dados.destino}\n• Restante: ${novoEstoque.toFixed(2)} ${unidadeInsumo}`,
  };
}

// ── Lançamento CP/CR ────────────────────────────────────────────────────────
async function inserirLancamento(tipo: "pagar" | "receber", dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const valor = parseValor(String(dados.valor ?? 0));
  if (!valor || valor === 0) {
    const label = tipo === "pagar" ? "pagar" : "receber";
    return { ok: false, mensagem: `❓ Qual o valor da conta a ${label}? (ex: R$ 1.500,00)` };
  }
  const vencimento = parseData(String(dados.vencimento ?? "hoje"));
  const hoje       = new Date().toISOString().split("T")[0];

  // ja_pago (CP) ou ja_recebido (CR)
  const jaVStrCP = String(dados.ja_pago ?? "").toLowerCase();
  const jaVStrCR = String(dados.ja_recebido ?? "").toLowerCase();
  const jaPago = jaVStrCP === "sim" || jaVStrCP === "true" || jaVStrCR === "sim" || jaVStrCR === "true" ||
    String(dados.vencimento ?? "").toLowerCase().includes("vista");

  let pessoaId: string | null = null;
  const nomePessoa = String(dados.fornecedor ?? dados.cliente ?? "");
  if (nomePessoa && nomePessoa !== "não informar" && nomePessoa !== "nao informar") {
    const { data: pessoa } = await sb().from("pessoas")
      .select("id").eq("fazenda_id", fazendaId).ilike("nome", `%${nomePessoa}%`).single();
    pessoaId = pessoa?.id ?? null;
  }

  // Conta bancária e ciclo vigente
  const conta   = await buscarContaBancaria(fazendaId, String(dados.conta_bancaria ?? ""));
  const cicloLanc = await buscarCicloVigente(fazendaId, hoje);

  const payload: Record<string, unknown> = {
    fazenda_id: fazendaId, tipo,
    descricao: String(dados.descricao ?? ""),
    categoria: String(dados.categoria ?? "outros"),
    data_lancamento: hoje,
    data_vencimento: vencimento, valor, moeda: "BRL",
    status: jaPago ? "baixado" : "em_aberto",
    pessoa_id: pessoaId,
    conta_bancaria: conta?.id ?? null,
    safra_id:      cicloLanc?.id ?? null,
    ano_safra_id:  cicloLanc?.ano_safra_id ?? null,
    observacao:    "Inserido via Arato-IA",
    auto: false,
  };
  if (jaPago) { payload.data_baixa = hoje; payload.valor_pago = valor; }

  const { data: lancRowCP, error } = await sb().from("lancamentos").insert(payload).select("id").maybeSingle();

  if (error) {
    console.error("[BOT] Erro insert lancamentos:", JSON.stringify(error));
    return { ok: false, mensagem: `❌ Erro DB lancamentos: [${error.code}] ${error.message}` };
  }

  // Pendência fiscal para CPs de insumos/combustível (categorias que exigem NF)
  const catsFiscais = ["combustivel", "insumo", "Insumos — Sementes", "Insumos — Fertilizantes", "Insumos — Defensivos", "Insumos — Inoculantes", "Insumos — Corretivos"];
  const catAtual = String(payload.categoria ?? "");
  if (tipo === "pagar" && catsFiscais.some(c => catAtual.toLowerCase().includes(c.toLowerCase()))) {
    await sb().from("pendencias_fiscais").insert({
      fazenda_id: fazendaId,
      lancamento_id: lancRowCP?.id ?? null,
      tipo: "lancamento_cp",
      status: "aguardando",
      descricao: String(payload.descricao),
      valor: parseValor(String(payload.valor ?? 0)),
      data_operacao: hoje,
      fornecedor_nome: nomePessoa || null,
      origem: "whatsapp",
    });
  }

  const label = tipo === "pagar" ? "Conta a Pagar" : "Conta a Receber";
  const statusLabel = jaPago
    ? `✓ ${tipo === "pagar" ? "Pago" : "Recebido"}${conta ? ` — *${conta.nome}*` : ""}`
    : `Vence: ${vencimento}`;
  return {
    ok: true,
    mensagem: `✅ ${label} lançada!\n• ${dados.descricao}\n• R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• ${statusLabel}`,
  };
}

// ── Baixa CP/CR ─────────────────────────────────────────────────────────────
async function baixarLancamento(tipo: "pagar" | "receber", dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const { data: lancamentos } = await sb().from("lancamentos")
    .select("id, descricao, valor").eq("fazenda_id", fazendaId).eq("tipo", tipo)
    .in("status", ["em_aberto"]).ilike("descricao", `%${dados.busca}%`).limit(1);

  if (!lancamentos?.length) return { ok: false, mensagem: `❌ Conta não encontrada: "${dados.busca}"` };
  const lanc = lancamentos[0];

  const valorStr  = String(dados.valor_pago ?? dados.valor_recebido ?? "mesmo valor");
  const valorFinal = valorStr.toLowerCase().includes("mesmo") ? Number(lanc.valor) : parseValor(valorStr);
  const dataStr   = String(dados.data_pagamento ?? dados.data_recebimento ?? "hoje");
  const dataBaixa = parseData(dataStr);

  // Conta bancária (lookup por nome)
  const conta = await buscarContaBancaria(fazendaId, String(dados.conta_bancaria ?? ""));

  await sb().from("lancamentos").update({
    status: "baixado", data_baixa: dataBaixa, valor_pago: valorFinal,
    conta_bancaria: conta?.id ?? null,
  }).eq("id", lanc.id);

  const contaLabel = conta ? ` — *${conta.nome}*` : "";
  return {
    ok: true,
    mensagem: `✅ Baixa registrada!\n• ${lanc.descricao}\n• Valor: R$ ${valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Data: ${dataBaixa}${contaLabel}`,
  };
}

// ── Vincular NF a lançamento existente ──────────────────────────────────────
async function vincularNF(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const nfNumero   = String(dados.nf_numero   ?? "").trim();
  const nfEmitente = String(dados.nf_emitente ?? "").trim();
  const busca      = String(dados.busca       ?? dados.descricao ?? "").trim();

  if (!nfNumero) return { ok: false, mensagem: "❓ Qual é o número da nota fiscal?" };

  // Busca o CP mais recente que bate com a descrição/emitente
  let query = sb().from("lancamentos")
    .select("id, descricao, valor, data_vencimento")
    .eq("fazenda_id", fazendaId)
    .eq("tipo", "pagar")
    .in("status", ["em_aberto", "baixado"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (busca) {
    query = query.ilike("descricao", `%${busca}%`);
  }

  const { data: candidatos } = await query;
  if (!candidatos?.length) {
    return { ok: false, mensagem: `❌ Não encontrei CP com "${busca || "combustível"}". Tente com um trecho da descrição.` };
  }

  // Pega o primeiro (mais recente)
  const lanc = candidatos[0];
  const obsAtual = String((lanc as Record<string, unknown>).observacao ?? "");
  const novaObs = obsAtual ? `${obsAtual} | NF ${nfNumero}${nfEmitente ? ` — ${nfEmitente}` : ""}` : `NF ${nfNumero}${nfEmitente ? ` — ${nfEmitente}` : ""}`;

  const { error } = await sb().from("lancamentos").update({
    nfe_numero: nfNumero,
    observacao: novaObs,
  }).eq("id", lanc.id);

  if (error) return { ok: false, mensagem: `❌ Erro ao vincular NF: ${error.message}` };

  const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  return {
    ok: true,
    mensagem: `✅ NF ${nfNumero} vinculada!\n• Lançamento: ${lanc.descricao}\n• Valor: R$ ${Number(lanc.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n• Vencimento: ${fmtData(lanc.data_vencimento)}`,
  };
}

// ── Romaneio ────────────────────────────────────────────────────────────────
async function inserirRomaneio(dados: Record<string, unknown>, fazendaId: string): Promise<Resultado> {
  const pesoBruto = Number(dados.peso_bruto ?? 0);
  const tara      = Number(dados.tara ?? 0);
  const liquido   = pesoBruto - tara;
  const sacas     = liquido / 60;

  const { data: talhao } = await sb().from("talhoes")
    .select("id").eq("fazenda_id", fazendaId)
    .ilike("nome", `%${dados.talhao}%`).limit(1).single();

  const { error } = await sb().from("romaneios").insert({
    fazenda_id: fazendaId,
    talhao_id:  talhao?.id ?? null,
    commodity:  String(dados.commodity ?? "soja"),
    placa_veiculo: String(dados.placa ?? ""),
    peso_bruto_kg: pesoBruto, tara_kg: tara,
    peso_liquido_kg: liquido, total_sacas: sacas,
    data_romaneio: new Date().toISOString().split("T")[0],
  });

  if (error) return { ok: false, mensagem: `❌ Erro: ${error.message}` };
  return {
    ok: true,
    mensagem: `✅ Romaneio registrado!\n• ${dados.commodity} — Placa ${dados.placa}\n• Líquido: ${liquido.toLocaleString("pt-BR")} kg (${sacas.toFixed(0)} sc)`,
  };
}
