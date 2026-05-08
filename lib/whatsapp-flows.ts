// Motor de fluxos conversacionais — máquina de estados do WhatsApp IA
import { createClient } from "@supabase/supabase-js";
import { extrairEntidade } from "./whatsapp-ai";

export type FluxoNome =
  | "abastecimento" | "operacao_lavoura" | "entrada_estoque"
  | "saida_estoque" | "lancar_cp" | "baixar_cp"
  | "lancar_cr" | "baixar_cr" | "romaneio" | "vincular_nf";

export type Sessao = {
  id: string;
  telefone: string;
  usuario_id: string;
  fazenda_id: string;
  fazenda_nome: string;
  fluxo: FluxoNome | null;
  etapa: string | null;
  dados: Record<string, unknown>;
  aguardando_foto: boolean;
  updated_at: string;
};

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── CRUD de sessão ──────────────────────────────────────────────────────────
export async function buscarSessao(telefone: string): Promise<Sessao | null> {
  // limit(1) em vez de single() para não quebrar se houver linhas duplicadas
  const { data } = await sb().from("sessoes_whatsapp")
    .select("*").eq("telefone", telefone)
    .order("updated_at", { ascending: false })
    .limit(1);
  return (data?.[0] ?? null) as Sessao | null;
}

export async function salvarSessao(telefone: string, patch: Partial<Sessao>) {
  // upsert atômico pelo telefone — elimina race condition de criação dupla
  const { error } = await sb().from("sessoes_whatsapp").upsert(
    { telefone, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "telefone" }
  );
  if (error) console.error("[SESSAO] erro upsert:", error.message);
}

export async function limparSessao(telefone: string) {
  await sb().from("sessoes_whatsapp")
    .update({ fluxo: null, etapa: null, dados: {}, aguardando_foto: false, updated_at: new Date().toISOString() })
    .eq("telefone", telefone);
}

// ── Definição dos fluxos ────────────────────────────────────────────────────
// Cada fluxo define suas etapas em ordem, a pergunta de cada etapa e
// como extrair a entidade da resposta do usuário.

type EtapaConfig = {
  pergunta: string;
  campo: string;
  opcoes?: string[];          // lista para validar resposta
  aguarda_foto?: boolean;     // próxima mensagem é uma foto
  opcional?: boolean;
};

const FLUXOS: Record<FluxoNome, { etapas: EtapaConfig[]; resumo: (d: Record<string, unknown>) => string }> = {

  abastecimento: {
    etapas: [
      { campo: "produto", pergunta: "Qual combustível foi abastecido?\n(ex: diesel S10, gasolina, arla)" },
      { campo: "quantidade", pergunta: "Quantos litros foram abastecidos?" },
      { campo: "valor", pergunta: "Qual o valor total pago? (ex: 1200 ou 1200.00)" },
      { campo: "tipo_destino", pergunta: "Você *abasteceu direto no veículo/máquina* ou comprou *para o estoque*?\n\nResponda: *posto* ou *estoque*", opcoes: ["posto", "estoque"] },
      { campo: "veiculo", pergunta: "Qual veículo ou máquina foi abastecido?\n(ex: F-250, Trator MF, Colhedora JD)" },
      { campo: "tem_nf", pergunta: "Tem nota fiscal ou cupom fiscal?\n\nResponda *sim* (envie a foto a seguir) ou *não tenho*", opcoes: ["sim", "não tenho", "nao tenho"] },
      { campo: "nf", pergunta: "Envie a foto da nota fiscal agora (ou foto do cupom):", aguarda_foto: true, opcional: true },
      { campo: "vencimento", pergunta: "Qual o vencimento do pagamento?\n(ex: hoje, amanhã, 15/05 — ou responda *à vista*)" },
    ],
    resumo: (d) => `🔵 *Abastecimento*\n• ${d.produto} — ${d.quantidade}L\n• Valor: R$ ${d.valor}\n• ${d.tipo_destino === "posto" ? `Veículo: ${d.veiculo}` : "Destino: Estoque"}\n• Vencimento: ${d.vencimento}\n• NF: ${d.nf_dados ? "lida ✅" : d.tem_nf === "sim" ? "aguardando" : "⚠️ sem NF — pendência fiscal"}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  operacao_lavoura: {
    etapas: [
      { campo: "tipo_op", pergunta: "Qual tipo de operação?\n*1* Pulverização\n*2* Adubação\n*3* Plantio\n*4* Correção de solo", opcoes: ["1", "2", "3", "4", "pulverizacao", "adubacao", "plantio", "correcao"] },
      { campo: "talhao", pergunta: "Qual talhão?\n(informe o nome ou número)" },
      { campo: "produto", pergunta: "Qual produto foi aplicado?" },
      { campo: "dose", pergunta: "Qual a dose? (ex: 2 L/ha, 300 kg/ha)" },
      { campo: "data_op", pergunta: "Qual a data da operação?\n(ex: hoje, ontem, 28/04)" },
    ],
    resumo: (d) => `🌱 *Operação de lavoura*\n• Tipo: ${d.tipo_op}\n• Talhão: ${d.talhao}\n• Produto: ${d.produto}\n• Dose: ${d.dose}\n• Data: ${d.data_op}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  entrada_estoque: {
    etapas: [
      { campo: "nf", pergunta: "Envie a foto da nota fiscal para leitura automática, ou responda *manual* para informar os dados manualmente.", aguarda_foto: true, opcional: true },
      { campo: "fornecedor", pergunta: "Nome do fornecedor:" },
      { campo: "vencimento", pergunta: "Data de vencimento do pagamento:\n(ex: 15/05, à vista)" },
      { campo: "deposito", pergunta: "Onde armazenar?\n(ex: Tanque principal, Depósito central)" },
    ],
    resumo: (d) => `📦 *Entrada em estoque*\n• ${d.produto} — ${d.quantidade} ${d.unidade}\n• Fornecedor: ${d.fornecedor}\n• Valor: R$ ${d.valor}\n• Vencimento CP: ${d.vencimento}\n• Depósito: ${d.deposito}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  saida_estoque: {
    etapas: [
      { campo: "produto", pergunta: "Qual produto está saindo do estoque?" },
      { campo: "quantidade", pergunta: "Qual a quantidade?" },
      { campo: "destino", pergunta: "Destino da saída:\n(ex: Talhão 3, Máquina X, Consumo)" },
    ],
    resumo: (d) => `📤 *Saída de estoque*\n• ${d.produto} — ${d.quantidade}\n• Destino: ${d.destino}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  lancar_cp: {
    etapas: [
      { campo: "descricao", pergunta: "Descrição da conta a pagar:" },
      { campo: "valor", pergunta: "Valor (ex: 1500.00):" },
      { campo: "vencimento", pergunta: "Data de vencimento (ex: 15/05, mês que vem):" },
      { campo: "fornecedor", pergunta: "Fornecedor ou credor:\n(nome ou responda *não informar*)" },
      { campo: "categoria", pergunta: "Categoria:\n(ex: diesel, arrendamento, defensivo, mão de obra)" },
    ],
    resumo: (d) => `📋 *Conta a Pagar*\n• ${d.descricao}\n• Valor: R$ ${d.valor}\n• Vence: ${d.vencimento}\n• Fornecedor: ${d.fornecedor}\n• Categoria: ${d.categoria}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  baixar_cp: {
    etapas: [
      { campo: "busca", pergunta: "Qual conta deseja baixar? Informe parte da descrição ou valor:" },
      { campo: "data_pagamento", pergunta: "Data do pagamento:\n(ex: hoje, ontem, 28/04)" },
      { campo: "valor_pago", pergunta: "Valor pago:\n(ou responda *mesmo valor* se igual ao lançado)" },
    ],
    resumo: (d) => `✅ *Baixar pagamento*\n• Conta: ${d.descricao_encontrada ?? d.busca}\n• Data: ${d.data_pagamento}\n• Valor: R$ ${d.valor_pago}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  lancar_cr: {
    etapas: [
      { campo: "descricao", pergunta: "Descrição da conta a receber:" },
      { campo: "valor", pergunta: "Valor (ex: 50000.00):" },
      { campo: "vencimento", pergunta: "Data de vencimento:" },
      { campo: "cliente", pergunta: "Cliente ou devedor:\n(nome ou responda *não informar*)" },
    ],
    resumo: (d) => `💰 *Conta a Receber*\n• ${d.descricao}\n• Valor: R$ ${d.valor}\n• Vence: ${d.vencimento}\n• Cliente: ${d.cliente}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  baixar_cr: {
    etapas: [
      { campo: "busca", pergunta: "Qual recebimento deseja confirmar? Informe parte da descrição:" },
      { campo: "data_recebimento", pergunta: "Data do recebimento:" },
      { campo: "valor_recebido", pergunta: "Valor recebido:\n(ou responda *mesmo valor*)" },
    ],
    resumo: (d) => `✅ *Confirmar recebimento*\n• Conta: ${d.descricao_encontrada ?? d.busca}\n• Data: ${d.data_recebimento}\n• Valor: R$ ${d.valor_recebido}\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },

  romaneio: {
    etapas: [
      { campo: "commodity", pergunta: "Qual commodity?\n(ex: soja, milho, algodão)" },
      { campo: "talhao", pergunta: "Talhão de origem:" },
      { campo: "placa", pergunta: "Placa do caminhão:" },
      { campo: "peso_bruto", pergunta: "Peso bruto (kg):" },
      { campo: "tara", pergunta: "Tara (kg):" },
    ],
    resumo: (d) => {
      const liquido = Number(d.peso_bruto) - Number(d.tara);
      const sacas = (liquido / 60).toFixed(0);
      return `🌾 *Romaneio*\n• ${d.commodity} — Talhão ${d.talhao}\n• Placa: ${d.placa}\n• Peso bruto: ${Number(d.peso_bruto).toLocaleString("pt-BR")} kg\n• Tara: ${Number(d.tara).toLocaleString("pt-BR")} kg\n• Líquido: ${liquido.toLocaleString("pt-BR")} kg (${sacas} sc)\n\nConfirma? Responda *SIM* ou *NÃO*`;
    },
  },
  vincular_nf: {
    etapas: [
      { campo: "nf_numero",   pergunta: "Número da nota fiscal:" },
      { campo: "nf_emitente", pergunta: "Nome do emitente/fornecedor (ou deixe em branco):" },
      { campo: "busca",       pergunta: "Trecho da descrição do lançamento para localizar (ex: 'abastecimento diesel'):" },
    ],
    resumo: (d) => `📎 *Vincular NF*\n• NF: ${d.nf_numero}\n• Emitente: ${d.nf_emitente || "não informado"}\n• Lançamento: "${d.busca}"\n\nConfirma? Responda *SIM* ou *NÃO*`,
  },
};

// ── Avançar fluxo ───────────────────────────────────────────────────────────
export async function avancarFluxo(
  sessao: Sessao,
  textoResposta: string,
  dadosFoto?: Record<string, unknown>  // resultado de lerNotaFiscal se veio foto
): Promise<{ mensagem: string; concluido: boolean; dadosFinais?: Record<string, unknown> }> {

  const config = FLUXOS[sessao.fluxo!];
  if (!config) return { mensagem: "❌ Fluxo desconhecido. Digite *cancelar* para recomeçar.", concluido: false };

  const etapas = config.etapas;
  const etapaAtual = etapas.findIndex(e => e.campo === sessao.etapa);

  // Processar resposta da etapa atual
  const etapaConfig = etapas[etapaAtual];
  let valorExtraido = textoResposta.trim();

  if (dadosFoto) {
    // Se veio foto de NF, preencher dados automaticamente
    const nfDados = dadosFoto;
    const dadosAtualizados = {
      ...sessao.dados,
      nf_dados: nfDados,
      fornecedor: nfDados.razao_social ?? sessao.dados.fornecedor,
      valor: nfDados.valor_total ?? sessao.dados.valor,
      vencimento: nfDados.data_vencimento ?? sessao.dados.vencimento,
    };
    await salvarSessao(sessao.telefone, { dados: dadosAtualizados, aguardando_foto: false });
    sessao.dados = dadosAtualizados;
    valorExtraido = "foto_processada";
  } else if (etapaConfig?.aguarda_foto && textoResposta.toLowerCase().includes("não")) {
    valorExtraido = "sem_foto";
  } else if (etapaConfig) {
    // Usar IA para extrair a entidade se resposta for texto livre
    if (!etapaConfig.opcoes) {
      valorExtraido = await extrairEntidade(
        etapaConfig.campo,
        textoResposta,
        `Fluxo: ${sessao.fluxo}, dados coletados: ${JSON.stringify(sessao.dados)}`
      ) || textoResposta;
    }
  }

  // Salvar dado coletado
  const dadosAtualizados = { ...sessao.dados };
  if (etapaConfig) dadosAtualizados[etapaConfig.campo] = valorExtraido;

  // Próxima etapa
  let proxEtapa = etapaAtual + 1;

  if (sessao.fluxo === "abastecimento") {
    // Pular etapa de veículo se destino for estoque
    if (dadosAtualizados.tipo_destino === "estoque" && etapaConfig?.campo === "tipo_destino") {
      proxEtapa = etapas.findIndex(e => e.campo === "tem_nf");
    }
    // Pular etapa de foto se usuário disse que não tem NF
    if (etapaConfig?.campo === "tem_nf") {
      const resp = String(valorExtraido).toLowerCase();
      if (resp.includes("não") || resp.includes("nao")) {
        dadosAtualizados.tem_nf = "nao";
        proxEtapa = etapas.findIndex(e => e.campo === "vencimento");
      } else {
        proxEtapa = etapas.findIndex(e => e.campo === "nf");
      }
    }
  }

  if (proxEtapa >= etapas.length) {
    // Fluxo completo — mostrar resumo para confirmação
    await salvarSessao(sessao.telefone, { dados: dadosAtualizados, etapa: "aguardando_confirmacao" });
    return { mensagem: config.resumo(dadosAtualizados), concluido: false };
  }

  const proximaEtapa = etapas[proxEtapa];
  await salvarSessao(sessao.telefone, {
    dados: dadosAtualizados,
    etapa: proximaEtapa.campo,
    aguardando_foto: proximaEtapa.aguarda_foto ?? false,
  });

  return { mensagem: proximaEtapa.pergunta, concluido: false };
}

// ── Iniciar fluxo ───────────────────────────────────────────────────────────
export async function iniciarFluxo(
  telefone: string,
  fluxo: FluxoNome,
  dadosIniciais: Record<string, unknown>
): Promise<string> {
  const config = FLUXOS[fluxo];
  // Descobrir qual é a primeira etapa que ainda não tem dado
  const primeiraEtapaSemDado = config.etapas.find(e => !dadosIniciais[e.campo]);

  if (!primeiraEtapaSemDado) {
    // Todos os dados já vieram na primeira mensagem — ir direto para confirmação
    await salvarSessao(telefone, { fluxo, etapa: "aguardando_confirmacao", dados: dadosIniciais });
    return config.resumo(dadosIniciais);
  }

  await salvarSessao(telefone, {
    fluxo,
    etapa: primeiraEtapaSemDado.campo,
    dados: dadosIniciais,
    aguardando_foto: primeiraEtapaSemDado.aguarda_foto ?? false,
  });
  return primeiraEtapaSemDado.pergunta;
}

export { FLUXOS };
