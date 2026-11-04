// Motor de casamento da Conciliação Bancária — funções puras (sem I/O), usadas pela tela
// e pelas rotas de API. Níveis de confiança:
//   alta      → aplica sozinho (baixa + vínculo)
//   media     → vira sugestão: um clique do usuário
//   bloqueado → existe lançamento de mesmo valor, mas não pode casar (já conciliado, baixado
//               em outra conta, etc.) — nunca casa sozinho nem é sugerido
//   nenhum    → sem candidato: fica pendente

export type NivelConfianca = "alta" | "media" | "bloqueado" | "nenhum";

export interface LinhaMatch {
  id: string;
  data: string;                       // AAAA-MM-DD
  valor: number;                      // sempre positivo
  tipo: "credito" | "debito";
  descricao: string;
}

export interface LancMatch {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  valor_pago?: number | null;
  data_vencimento: string;
  data_baixa?: string | null;
  status: string;
  conta_bancaria?: string | null;
  produtor_id?: string | null;
  conciliado?: boolean | null;
  moeda?: string | null;
}

export interface ContaMatch {
  id: string;
  titulares: string[];                // produtor_id do titular + cotitulares
}

export interface Avaliacao {
  nivel: NivelConfianca;
  lancamento?: LancMatch;
  motivos: string[];                  // por que não é "alta" (ou por que foi bloqueado)
}

export interface CtxAvaliacao {
  conta: ContaMatch | null;
  lancamentosJaVinculados?: Set<string>;   // já ligados a alguma linha de extrato
}

const DIA = 86400000;
const TOL_VALOR = 0.02;
const JANELA_DIAS = 7;
const ALTA_DIAS = 2;

const dias = (a: string, b: string) =>
  Math.abs((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / DIA);

const valorDe = (l: LancMatch) => Number(l.valor_pago ?? l.valor);
const jaPago = (l: LancMatch) => l.status === "baixado" || l.status === "parcial";

// ── Texto ────────────────────────────────────────────────────────────────────
export function normalizarTexto(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sugere o texto de uma regra a partir da descrição do extrato: tira números longos
// (ids, CPF/CNPJ, protocolos) e mantém as primeiras palavras.
export function sugerirTextoRegra(descricao: string): string {
  const toks = normalizarTexto(descricao).split(" ").filter(Boolean);
  const uteis = toks.filter(t => !/\d{3,}/.test(t) && t.length > 1);
  return uteis.slice(0, 5).join(" ");
}

// ── Nome de quem recebeu ─────────────────────────────────────────────────────
// Salário de mesmo valor é comum: sem olhar o nome, o PIX de um funcionário casava com o título de outro.
const PALAVRAS_DE_BANCO = new Set(("pagamento pagamentos pag pgto pagto pix deb cred debito credito transf transferencia realizada emitido enviado recebido " +
  "outra entre contas conta corrente poupanca ted doc tef liquidacao boleto tarifa salario salarios folha remuneracao sicoob sicredi cresol bradesco itau " +
  "santander caixa banco brasil ltda mei dos das").split(" "));

export function tokensDeNome(texto: string): string[] {
  return normalizarTexto(texto).split(" ").filter(t => t.length >= 3 && !/\d/.test(t) && !PALAVRAS_DE_BANCO.has(t));
}

export const ehTituloDeSalario = (descricao: string) => /^\s*sal[aá]rio/i.test(descricao ?? "");

// Nome no título: o que vem depois do travessão ("Salário Out/2026 — JOSE EVERTON"; "Salário - JOSE"). Sem travessão, não há nome.
export function nomeDoTitulo(descricao: string): string {
  const m = (descricao ?? "").match(/\s[—–-]\s(.+)$/);
  return m ? m[1] : "";
}

// Palavras do nome presentes na linha. O banco corta o fim do nome, então vale o início da palavra (mínimo 3 letras).
export function pontosDeNome(descricaoLinha: string, descricaoTitulo: string): number {
  const linha = tokensDeNome(descricaoLinha);
  const nome = tokensDeNome(nomeDoTitulo(descricaoTitulo));
  return nome.filter(n => linha.some(l => l === n || n.startsWith(l) || l.startsWith(n))).length;
}

// ── Regras ───────────────────────────────────────────────────────────────────
export interface RegraMatch {
  id: string;
  conta_bancaria_id: string | null;
  texto: string;
  tipo: "debito" | "credito";
  ativa: boolean;
}

// Primeira regra que casa: mesma natureza (débito/crédito), texto contido no histórico
// (por palavras inteiras, sem acento/caixa) e conta compatível. Conta específica e texto
// mais longo têm prioridade.
export function escolherRegra<R extends RegraMatch>(
  linha: { descricao: string; tipo: "credito" | "debito" },
  regras: R[],
  contaBancariaId: string,
): R | undefined {
  const desc = ` ${normalizarTexto(linha.descricao)} `;
  return regras
    .filter(r => r.ativa && r.tipo === linha.tipo
      && (!r.conta_bancaria_id || r.conta_bancaria_id === contaBancariaId)
      && normalizarTexto(r.texto).length >= 3
      && desc.includes(` ${normalizarTexto(r.texto)} `))
    .sort((a, b) =>
      (a.conta_bancaria_id ? 0 : 1) - (b.conta_bancaria_id ? 0 : 1)
      || normalizarTexto(b.texto).length - normalizarTexto(a.texto).length)[0];
}

// ── Avaliação de uma linha ───────────────────────────────────────────────────
// `usados`: lançamentos que já ganharam outra linha neste mesmo lote (1 lançamento ↔ 1 linha).
export function avaliarLinha(
  linha: LinhaMatch,
  lancs: LancMatch[],
  ctx: CtxAvaliacao,
  usados: Set<string>,
): Avaliacao {
  const mesmaNatureza = (l: LancMatch) =>
    (linha.tipo === "credito" ? l.tipo === "receber" : l.tipo === "pagar");

  // Candidatos por valor + natureza + janela de data (linha do OFX é sempre em R$)
  const porValor = lancs.filter(l => {
    if (l.moeda && l.moeda !== "BRL") return false;
    if (!mesmaNatureza(l)) return false;
    if (Math.abs(valorDe(l) - linha.valor) > TOL_VALOR) return false;
    return dias(linha.data, l.data_baixa ?? l.data_vencimento) <= JANELA_DIAS;
  });
  if (porValor.length === 0) return { nivel: "nenhum", motivos: [] };

  // Bloqueios duros
  const viaveis: LancMatch[] = [];
  const bloqueios: string[] = [];
  for (const l of porValor) {
    if (usados.has(l.id) || ctx.lancamentosJaVinculados?.has(l.id) || l.conciliado) {
      bloqueios.push("já conciliado com outra linha"); continue;
    }
    if (jaPago(l) && ctx.conta && l.conta_bancaria && l.conta_bancaria !== ctx.conta.id) {
      bloqueios.push("já baixado em outra conta bancária"); continue;
    }
    if (ehTituloDeSalario(l.descricao) && tokensDeNome(linha.descricao).length && tokensDeNome(nomeDoTitulo(l.descricao)).length && pontosDeNome(linha.descricao, l.descricao) === 0) {
      bloqueios.push("a linha é de outra pessoa"); continue;
    }
    viaveis.push(l);
  }
  if (viaveis.length === 0) return { nivel: "bloqueado", motivos: Array.from(new Set(bloqueios)) };

  // Melhor candidato: nome de quem recebeu; depois data mais próxima; empate → já baixado nesta conta
  const ranked = viaveis
    .map(l => ({ l, d: dias(linha.data, l.data_baixa ?? l.data_vencimento), n: pontosDeNome(linha.descricao, l.descricao) }))
    .sort((a, b) => b.n - a.n || a.d - b.d || (jaPago(a.l) ? 0 : 1) - (jaPago(b.l) ? 0 : 1));
  const { l: melhor, d: dMelhor, n: nomeMelhor } = ranked[0];

  // Critérios de "alta"
  const motivos: string[] = [];
  if (viaveis.length > 1) motivos.push(`${viaveis.length} lançamentos com o mesmo valor`);
  // Salário só casa sozinho com o nome confirmado na linha
  if (ehTituloDeSalario(melhor.descricao) && nomeMelhor === 0) motivos.push("linha sem o nome do funcionário");
  if (dMelhor > ALTA_DIAS) motivos.push(`data ${Math.round(dMelhor)} dias distante`);

  // Conta: lançamento em aberto ainda não tem conta (a baixa é que define). Só há
  // contradição quando ele já aponta para OUTRA conta.
  if (ctx.conta && melhor.conta_bancaria && melhor.conta_bancaria !== ctx.conta.id) {
    motivos.push("conta prevista no lançamento é outra");
  }
  // Titular: precisa ser do titular (ou cotitular) da conta
  if (!ctx.conta || ctx.conta.titulares.length === 0) motivos.push("conta sem titular cadastrado");
  else if (!melhor.produtor_id) motivos.push("lançamento sem titular");
  else if (!ctx.conta.titulares.includes(melhor.produtor_id)) motivos.push("titular do lançamento difere do titular da conta");

  return { nivel: motivos.length === 0 ? "alta" : "media", lancamento: melhor, motivos };
}

// Um título vai para uma linha só: quem tem o nome confirmado escolhe primeiro. 1º passo: "alta" consome o lançamento;
// 2º passo: as sugestões ("media") dividem o que sobrou, sem repetir título. Antes, o mesmo título era sugerido a todas as
// linhas de mesmo valor.
export function avaliarLinhas(
  linhas: LinhaMatch[],
  lancs: LancMatch[],
  ctx: CtxAvaliacao,
): Map<string, Avaliacao> {
  const melhorNome = (l: LinhaMatch) => lancs.reduce((m, t) =>
    Math.abs(valorDe(t) - l.valor) <= TOL_VALOR ? Math.max(m, pontosDeNome(l.descricao, t.descricao)) : m, 0);
  const ordem = linhas.map(l => ({ l, n: melhorNome(l) })).sort((a, b) => b.n - a.n).map(x => x.l);
  const usados = new Set<string>();
  const res = new Map<string, Avaliacao>();
  for (const linha of ordem) {
    const a = avaliarLinha(linha, lancs, ctx, usados);
    if (a.nivel === "alta" && a.lancamento) { usados.add(a.lancamento.id); res.set(linha.id, a); }
  }
  for (const linha of ordem) {
    if (res.has(linha.id)) continue;
    const a = avaliarLinha(linha, lancs, ctx, usados);
    if (a.lancamento) usados.add(a.lancamento.id);
    res.set(linha.id, a);
  }
  return res;
}

// Soma dos lançamentos ligados a uma linha (borderô) vs valor da linha.
export function diferencaSoma(linhaValor: number, lancs: { valor: number; valor_pago?: number | null }[]): number {
  const soma = lancs.reduce((s, l) => s + Number(l.valor_pago ?? l.valor), 0);
  return Math.round((linhaValor - soma) * 100) / 100;
}
