// Relatório da Folha de Pagamento — regras puras (sem banco), testadas em relatorios.test.ts.
// Tudo o que a folha guarda vira "movimento": funcionário × competência × modalidade (tipo de remuneração, benefício,
// desconto ou encargo) × valor, com a origem (folha mensal, gratificação em título, 13º, rescisão, adiantamento).
// O relatório filtra modalidades e origens em qualquer combinação e monta lista detalhada ou quadro (colunas por
// modalidade ou por mês), com agrupamento em níveis e subtotais. Descontos entram com valor negativo.

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

export type GrupoMod = "provento" | "beneficio" | "desconto" | "encargo" | "controle";
export type Modalidade = { id: string; rotulo: string; grupo: GrupoMod; padrao: boolean };

export const MODALIDADES: Modalidade[] = [
  { id: "salario", rotulo: "Salário (carteira)", grupo: "provento", padrao: true },
  { id: "gratificacao", rotulo: "Gratificação", grupo: "provento", padrao: true },
  { id: "he50", rotulo: "Horas extras 50%", grupo: "provento", padrao: true },
  { id: "he100", rotulo: "Horas extras 100%", grupo: "provento", padrao: true },
  { id: "dsr", rotulo: "DSR sobre horas extras", grupo: "provento", padrao: true },
  { id: "complemento", rotulo: "Complemento salarial", grupo: "provento", padrao: true },
  { id: "decimo", rotulo: "13º salário", grupo: "provento", padrao: true },
  { id: "verbas_rescisao", rotulo: "Verbas rescisórias", grupo: "provento", padrao: true },
  { id: "vt", rotulo: "Vale-transporte", grupo: "beneficio", padrao: true },
  { id: "vr", rotulo: "Vale-refeição", grupo: "beneficio", padrao: true },
  { id: "outros_beneficios", rotulo: "Outros benefícios", grupo: "beneficio", padrao: true },
  { id: "inss", rotulo: "INSS do funcionário", grupo: "desconto", padrao: true },
  { id: "irrf", rotulo: "IRRF", grupo: "desconto", padrao: true },
  { id: "adiantamento", rotulo: "Adiantamentos descontados", grupo: "desconto", padrao: true },
  { id: "outros_descontos", rotulo: "Outros descontos", grupo: "desconto", padrao: true },
  { id: "inss_patronal", rotulo: "INSS patronal", grupo: "encargo", padrao: false },
  { id: "fgts", rotulo: "FGTS", grupo: "encargo", padrao: false },
  { id: "multa_fgts", rotulo: "Multa do FGTS (rescisão)", grupo: "encargo", padrao: false },
  { id: "adiantamento_concedido", rotulo: "Adiantamentos concedidos", grupo: "controle", padrao: false },
];

export const GRUPOS_MOD: { id: GrupoMod; rotulo: string; ajuda?: string }[] = [
  { id: "provento", rotulo: "Remuneração" },
  { id: "beneficio", rotulo: "Benefícios" },
  { id: "desconto", rotulo: "Descontos", ajuda: "saem com valor negativo" },
  { id: "encargo", rotulo: "Encargos do empregador" },
  { id: "controle", rotulo: "Controle", ajuda: "adiantamento pago no dia; não somar com o descontado" },
];

export type Origem = "folha" | "gratificacao" | "decimo" | "rescisao" | "adiantamento";
export const ORIGENS: { id: Origem; rotulo: string }[] = [
  { id: "folha", rotulo: "Folha mensal" },
  { id: "gratificacao", rotulo: "Gratificação em título próprio" },
  { id: "decimo", rotulo: "13º salário" },
  { id: "rescisao", rotulo: "Rescisões" },
  { id: "adiantamento", rotulo: "Adiantamentos concedidos" },
];

/** Dados do funcionário que acompanham cada movimento (resolvidos pela tela a partir do cadastro). */
export type Pessoa = { funcionario_id: string | null; nome: string; cargo: string; empregador: string; fazenda: string; area: string };

export type Movimento = Pessoa & {
  competencia: string; data: string; modalidade: string; origem: Origem; descricao: string; horas: number; valor: number; situacao: string;
};

export const modalidade = (id: string) => MODALIDADES.find(m => m.id === id);
const sinal = (id: string) => (modalidade(id)?.grupo === "desconto" ? -1 : 1);

/** Divide o valor das horas extras entre 50% e 100% pelo peso das horas (1,5 e 2,0 — mesmo valor-hora). */
export function dividirHorasExtras(valor: number, h50: number, h100: number): { he50: number; he100: number } {
  const p50 = Math.max(0, h50) * 1.5, p100 = Math.max(0, h100) * 2, tot = p50 + p100;
  if (!(valor > 0)) return { he50: 0, he100: 0 };
  if (!(tot > 0)) return { he50: r2(valor), he100: 0 };
  const he50 = r2(valor * p50 / tot);
  return { he50, he100: r2(valor - he50) };
}

type R = Record<string, unknown>;
function mov(p: Pessoa, base: { competencia: string; data: string; origem: Origem; situacao: string }, modalidadeId: string, valor: number, descricao = "", horas = 0): Movimento | null {
  const v = r2(Math.abs(valor));
  if (!v && !horas) return null;
  return { ...p, ...base, modalidade: modalidadeId, descricao, horas: r2(horas), valor: r2(v * sinal(modalidadeId)) };
}
const sem = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

/** Linha da folha mensal (folha_funcionarios). Salário = bruto − gratificação − horas extras − DSR. */
export function movimentosDaFolha(i: R, competencia: string, situacao: string, p: Pessoa): Movimento[] {
  const b = { competencia, data: `${competencia}-01`, origem: "folha" as const, situacao };
  const grat = num(i.gratificacao), heV = num(i.he_valor), dsr = num(i.he_dsr);
  const h50 = num(i.he_50_horas), h100 = num(i.he_100_horas);
  const { he50, he100 } = dividirHorasExtras(heV, h50, h100);
  return sem([
    mov(p, b, "salario", num(i.salario_bruto) - grat - heV - dsr),
    mov(p, b, "gratificacao", grat, "Na folha do mês"),
    mov(p, b, "he50", he50, "", h50),
    mov(p, b, "he100", he100, "", h100),
    mov(p, b, "dsr", dsr),
    mov(p, b, "complemento", num(i.complemento_salarial)),
    mov(p, b, "vt", num(i.vale_transporte)),
    mov(p, b, "vr", num(i.vale_refeicao)),
    mov(p, b, "outros_beneficios", num(i.outros_beneficios), String(i.desc_outros_beneficios ?? "")),
    mov(p, b, "inss", num(i.inss_trabalhador)),
    mov(p, b, "irrf", num(i.irrf)),
    mov(p, b, "adiantamento", num(i.adiantamento)),
    mov(p, b, "outros_descontos", num(i.outros_descontos), String(i.desc_outros_descontos ?? "")),
    mov(p, b, "inss_patronal", num(i.inss_patronal)),
    mov(p, b, "fgts", num(i.fgts)),
  ]);
}

/** Gratificação lançada em título próprio no CP (as sem título já estão na folha do mês). */
export function movimentosDaGratificacao(g: R, situacao: string, p: Pessoa): Movimento[] {
  const c = String(g.mes_referencia ?? "").slice(0, 7);
  return sem([mov(p, { competencia: c, data: String(g.data_pagamento ?? `${c}-01`).slice(0, 10), origem: "gratificacao", situacao }, "gratificacao", num(g.valor), String(g.descricao ?? ""))]);
}

/** 13º: 1ª parcela no mês do vencimento dela; 2ª parcela bruta (líquido + INSS + IRRF) e os descontos no mês da 2ª. Só parcela lançada. */
export function movimentosDo13(d: R, situacao1: string, situacao2: string, p: Pessoa): Movimento[] {
  const out: (Movimento | null)[] = [];
  const v1 = String(d.parcela1_vencimento ?? "").slice(0, 10), v2 = String(d.parcela2_vencimento ?? "").slice(0, 10);
  const ref = `${d.ano ?? ""} · ${num(d.avos)}/12 avos`;
  if (d.parcela1_lancamento_id && v1) out.push(mov(p, { competencia: v1.slice(0, 7), data: v1, origem: "decimo", situacao: situacao1 }, "decimo", num(d.parcela1_valor), `1ª parcela ${ref}`));
  if (d.parcela2_lancamento_id && v2) {
    const b = { competencia: v2.slice(0, 7), data: v2, origem: "decimo" as const, situacao: situacao2 };
    out.push(mov(p, b, "decimo", num(d.parcela2_valor) + num(d.inss) + num(d.irrf), `2ª parcela ${ref}`));
    out.push(mov(p, b, "inss", num(d.inss), "Sobre o 13º"));
    out.push(mov(p, b, "irrf", num(d.irrf), "Sobre o 13º"));
  }
  return sem(out);
}

/** Rescisão lançada: cada verba vira movimento (INSS/IRRF/adiantamentos/complemento na modalidade própria), + FGTS do mês e multa. */
export function movimentosDaRescisao(r: R, p: Pessoa): Movimento[] {
  if (r.status === "estornada") return [];
  const d = String(r.data_desligamento ?? "").slice(0, 10);
  const b = { competencia: d.slice(0, 7), data: d, origem: "rescisao" as const, situacao: "Lançada" };
  const out: (Movimento | null)[] = [];
  for (const v of (Array.isArray(r.verbas) ? r.verbas : []) as R[]) {
    const cod = String(v.codigo ?? ""), desc = String(v.descricao ?? ""), val = num(v.valor);
    const id = cod.startsWith("inss") ? "inss" : cod.startsWith("irrf") ? "irrf" : cod === "adiantamentos" ? "adiantamento"
      : cod === "complemento" ? "complemento" : v.tipo === "desconto" ? "outros_descontos" : "verbas_rescisao";
    out.push(mov(p, b, id, val, desc));
  }
  out.push(mov(p, b, "fgts", num(r.fgts_mes), "FGTS do mês da rescisão"));
  out.push(mov(p, b, "multa_fgts", num(r.multa_fgts)));
  return sem(out);
}

/** Adiantamento pago (controle de caixa; o desconto aparece na folha como "Adiantamentos descontados"). */
export function movimentosDoAdiantamento(a: R, situacao: string, p: Pessoa): Movimento[] {
  const d = String(a.data ?? "").slice(0, 10);
  const tipo = a.tipo === "gratificacao" ? "De gratificação" : a.tipo === "devolucao" ? "Devolução" : "De salário";
  return sem([mov(p, { competencia: d.slice(0, 7), data: d, origem: "adiantamento", situacao }, "adiantamento_concedido", num(a.valor), [tipo, String(a.descricao ?? "")].filter(Boolean).join(" · "))]);
}

// ─── Montagem do relatório ──────────────────────────────────────────────────

export type Nivel = "funcionario" | "competencia" | "modalidade" | "grupo" | "origem" | "empregador" | "fazenda" | "area" | "cargo";
export const NIVEIS: { id: Nivel; rotulo: string }[] = [
  { id: "funcionario", rotulo: "Funcionário" }, { id: "competencia", rotulo: "Competência (mês)" }, { id: "modalidade", rotulo: "Modalidade" },
  { id: "grupo", rotulo: "Grupo da modalidade" }, { id: "origem", rotulo: "Origem" }, { id: "empregador", rotulo: "Empregador" },
  { id: "fazenda", rotulo: "Fazenda" }, { id: "area", rotulo: "Área (fazenda/administrativo)" }, { id: "cargo", rotulo: "Cargo" },
];

export type ColunaLista = "competencia" | "data" | "funcionario" | "cargo" | "empregador" | "fazenda" | "area" | "modalidade" | "origem" | "descricao" | "horas" | "valor" | "situacao";
export const COLUNAS_LISTA: { id: ColunaLista; rotulo: string; padrao: boolean }[] = [
  { id: "competencia", rotulo: "Competência", padrao: true }, { id: "data", rotulo: "Data", padrao: false },
  { id: "funcionario", rotulo: "Funcionário", padrao: true }, { id: "cargo", rotulo: "Cargo", padrao: false },
  { id: "empregador", rotulo: "Empregador", padrao: false }, { id: "fazenda", rotulo: "Fazenda", padrao: false },
  { id: "area", rotulo: "Área", padrao: false }, { id: "modalidade", rotulo: "Modalidade", padrao: true },
  { id: "origem", rotulo: "Origem", padrao: true }, { id: "descricao", rotulo: "Descrição / motivo", padrao: true },
  { id: "horas", rotulo: "Horas", padrao: true }, { id: "valor", rotulo: "Valor", padrao: true }, { id: "situacao", rotulo: "Situação", padrao: true },
];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const nomeMes = (c: string) => { const [y, m] = c.split("-"); return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]}/${y}` : c; };
const dataBR = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d;
const AREA: Record<string, string> = { operacional: "Fazenda", administrativo: "Administrativo" };

/** Texto do movimento no nível pedido (rótulo exibido) e chave de ordenação. */
export function valorNivel(m: Movimento, n: Nivel): { rot: string; ord: string } {
  switch (n) {
    case "funcionario": return { rot: m.nome, ord: m.nome.toLocaleUpperCase("pt-BR") };
    case "competencia": return { rot: nomeMes(m.competencia), ord: m.competencia };
    case "modalidade": { const i = MODALIDADES.findIndex(x => x.id === m.modalidade); return { rot: MODALIDADES[i]?.rotulo ?? m.modalidade, ord: String(i).padStart(3, "0") }; }
    case "grupo": { const g = modalidade(m.modalidade)?.grupo ?? "controle"; const i = GRUPOS_MOD.findIndex(x => x.id === g); return { rot: GRUPOS_MOD[i]?.rotulo ?? g, ord: String(i) }; }
    case "origem": { const i = ORIGENS.findIndex(x => x.id === m.origem); return { rot: ORIGENS[i]?.rotulo ?? m.origem, ord: String(i) }; }
    case "empregador": return { rot: m.empregador || "Sem empregador", ord: (m.empregador || "~").toLocaleUpperCase("pt-BR") };
    case "fazenda": return { rot: m.fazenda || "—", ord: (m.fazenda || "~").toLocaleUpperCase("pt-BR") };
    case "area": return { rot: AREA[m.area] ?? m.area ?? "—", ord: m.area || "~" };
    case "cargo": return { rot: m.cargo || "Sem cargo", ord: (m.cargo || "~").toLocaleUpperCase("pt-BR") };
  }
}

export type TipoCol = "texto" | "moeda" | "horas";
export type Col = { rot: string; tipo: TipoCol };
export type LinhaRel = { cels: (string | number)[]; tipo?: "grupo" | "subtotal" | "total"; nivel?: number };
export type TabelaRel = { colunas: Col[]; linhas: LinhaRel[] };

const ordenar = (ms: Movimento[], niveis: Nivel[], extra: (m: Movimento) => string) =>
  [...ms].sort((a, b) => {
    for (const n of niveis) { const x = valorNivel(a, n).ord, y = valorNivel(b, n).ord; if (x !== y) return x < y ? -1 : 1; }
    const x = extra(a), y = extra(b); return x < y ? -1 : x > y ? 1 : 0;
  });

/** Percorre os movimentos agrupados nos níveis e emite cabeçalho/subtotal de cada grupo. */
function porNiveis<T>(ms: Movimento[], niveis: Nivel[], folha: (grupo: Movimento[]) => T[], cab: (rot: string, nivel: number) => T, sub: (rot: string, nivel: number, grupo: Movimento[]) => T): T[] {
  const out: T[] = [];
  const rec = (lista: Movimento[], k: number) => {
    if (k >= niveis.length) { out.push(...folha(lista)); return; }
    const blocos: Movimento[][] = [];
    for (const m of lista) {
      const rot = valorNivel(m, niveis[k]).rot;
      const ult = blocos[blocos.length - 1];
      if (ult && valorNivel(ult[0], niveis[k]).rot === rot) ult.push(m); else blocos.push([m]);
    }
    for (const b of blocos) {
      const rot = valorNivel(b[0], niveis[k]).rot;
      out.push(cab(rot, k));
      rec(b, k + 1);
      out.push(sub(rot, k, b));
    }
  };
  rec(ms, 0);
  return out;
}
const soma = (ms: Movimento[]) => r2(ms.reduce((t, m) => t + m.valor, 0));

/** Lista detalhada: uma linha por movimento, nas colunas escolhidas, com subtotais por nível e total geral. */
export function montarLista(ms: Movimento[], colunas: ColunaLista[], niveis: Nivel[]): TabelaRel {
  const cols = colunas.length ? colunas : COLUNAS_LISTA.filter(c => c.padrao).map(c => c.id);
  const def = (id: ColunaLista) => COLUNAS_LISTA.find(c => c.id === id)!;
  const colunasRel: Col[] = cols.map(c => ({ rot: def(c).rotulo, tipo: c === "valor" ? "moeda" : c === "horas" ? "horas" : "texto" }));
  const cel = (m: Movimento, c: ColunaLista): string | number => {
    switch (c) {
      case "competencia": return nomeMes(m.competencia);
      case "data": return dataBR(m.data);
      case "funcionario": return m.nome;
      case "cargo": return m.cargo;
      case "empregador": return m.empregador;
      case "fazenda": return m.fazenda;
      case "area": return AREA[m.area] ?? m.area;
      case "modalidade": return modalidade(m.modalidade)?.rotulo ?? m.modalidade;
      case "origem": return ORIGENS.find(o => o.id === m.origem)?.rotulo ?? m.origem;
      case "descricao": return m.descricao;
      case "horas": return m.horas || "";
      case "valor": return m.valor;
      case "situacao": return m.situacao;
    }
  };
  const vazio = () => cols.map(() => "" as string | number);
  const linhaSoma = (rot: string, grupo: Movimento[], tipo: LinhaRel["tipo"], nivel?: number): LinhaRel => {
    const c = vazio(); c[0] = rot;
    const iv = cols.indexOf("valor"), ih = cols.indexOf("horas");
    if (iv >= 0) c[iv] = soma(grupo);
    if (ih >= 0) c[ih] = r2(grupo.reduce((t, m) => t + m.horas, 0)) || "";
    if (iv === 0 || ih === 0) c[0] = soma(grupo);
    return { cels: c, tipo, nivel };
  };
  const ord = ordenar(ms, niveis, m => `${m.competencia}|${m.nome}|${valorNivel(m, "modalidade").ord}|${m.data}`);
  const linhas = porNiveis<LinhaRel>(ord, niveis,
    g => g.map(m => ({ cels: cols.map(c => cel(m, c)) })),
    (rot, k) => { const c = vazio(); c[0] = rot; return { cels: c, tipo: "grupo", nivel: k }; },
    (rot, k, g) => linhaSoma(`Subtotal ${rot}`, g, "subtotal", k));
  if (ms.length) linhas.push(linhaSoma(`Total geral · ${ms.length} lançamento(s)`, ms, "total"));
  return { colunas: colunasRel, linhas };
}

/** Quadro: linhas pelos níveis escolhidos; colunas por modalidade ou por mês; última coluna = total. */
export function montarQuadro(ms: Movimento[], niveis: Nivel[], colunasPor: "modalidade" | "competencia", meses: string[]): TabelaRel {
  const linhasNiveis = niveis.length ? niveis : (["funcionario"] as Nivel[]);
  const chavesCol = colunasPor === "modalidade"
    ? MODALIDADES.filter(md => ms.some(m => m.modalidade === md.id)).map(md => ({ id: md.id, rot: md.rotulo }))
    : (meses.length ? meses : [...new Set(ms.map(m => m.competencia))].sort()).map(c => ({ id: c, rot: nomeMes(c) }));
  const chaveDe = (m: Movimento) => colunasPor === "modalidade" ? m.modalidade : m.competencia;
  const valores = (g: Movimento[]) => [...chavesCol.map(k => soma(g.filter(m => chaveDe(m) === k.id))), soma(g)];
  const colunas: Col[] = [{ rot: linhasNiveis.map(n => NIVEIS.find(x => x.id === n)!.rotulo).join(" / "), tipo: "texto" }, ...chavesCol.map(k => ({ rot: k.rot, tipo: "moeda" as const })), { rot: "Total", tipo: "moeda" }];
  const ultimo = linhasNiveis[linhasNiveis.length - 1], acima = linhasNiveis.slice(0, -1);
  const ord = ordenar(ms, linhasNiveis, () => "");
  const linhas = porNiveis<LinhaRel>(ord, acima,
    g => {
      const out: LinhaRel[] = [];
      for (const m of g) {
        const rot = valorNivel(m, ultimo).rot;
        const ult = out[out.length - 1];
        if (!ult || ult.cels[0] !== rot) out.push({ cels: [rot] });
      }
      return out.map(l => ({ cels: [l.cels[0], ...valores(g.filter(m => valorNivel(m, ultimo).rot === l.cels[0]))] }));
    },
    (rot, k) => ({ cels: [rot, ...chavesCol.map(() => ""), ""], tipo: "grupo", nivel: k }),
    (rot, k, g) => ({ cels: [`Subtotal ${rot}`, ...valores(g)], tipo: "subtotal", nivel: k }));
  if (ms.length) linhas.push({ cels: ["Total geral", ...valores(ms)], tipo: "total" });
  return { colunas, linhas };
}

/** Competências (YYYY-MM) de `de` até `ate`, inclusive. */
export function competencias(de: string, ate: string): string[] {
  const out: string[] = [];
  let [y, m] = de.split("-").map(Number);
  const [y2, m2] = ate.split("-").map(Number);
  if (!y || !m || !y2 || !m2) return out;
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 240) break;
  }
  return out;
}
