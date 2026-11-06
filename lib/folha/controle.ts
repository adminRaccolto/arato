// Modelo de leitura do controle real da folha. Os valores vêm dos registros gravados e do CP.
export type FolhaControle = {
  id: string;
  fazenda_id: string;
  competencia: string;
  status: string;
  empresa_id?: string | null;
  produtor_id?: string | null;
  cp_fgts_id?: string | null;
  cp_inss_patronal_id?: string | null;
  data_vencimento?: string | null;
};
export type PessoaControle = {
  id: string;
  fazenda_id: string;
  nome: string;
  funcao?: string | null;
  ativo?: boolean;
  empresa_id?: string | null;
  produtor_id?: string | null;
  data_admissao?: string | null;
  data_demissao?: string | null;
};
export type LinhaControle = {
  id: string;
  folha_id: string;
  funcionario_id: string | null;
  nome_funcionario: string;
  cargo?: string | null;
  cp_lancamento_id?: string | null;
  salario_bruto?: number | null;
  complemento_salarial?: number | null;
  gratificacao?: number | null;
  he_valor?: number | null;
  he_dsr?: number | null;
  he_50_horas?: number | null;
  he_100_horas?: number | null;
  inss_trabalhador?: number | null;
  irrf?: number | null;
  adiantamento?: number | null;
  outros_descontos?: number | null;
  desc_outros_descontos?: string | null;
  vale_transporte?: number | null;
  vale_refeicao?: number | null;
  outros_beneficios?: number | null;
  fgts?: number | null;
  inss_patronal?: number | null;
};
export type AdiantamentoControle = {
  id: string;
  fazenda_id: string;
  funcionario_id: string;
  competencia_ref?: string | null;
  data: string;
  valor: number;
  descricao?: string | null;
  tipo?: string | null;
  status: string;
  lancamento_id?: string | null;
  descontado_gratificacao_cp?: number | null;
};
export type PremioControle = {
  id: string;
  fazenda_id: string;
  funcionario_id: string;
  mes_referencia: string;
  valor: number;
  descricao: string;
  lancamento_id?: string | null;
  data_pagamento?: string | null;
};
export type TituloControle = {
  id: string;
  fazenda_id: string;
  titulo_origem_id?: string | null;
  descricao?: string | null;
  numero?: number | null;
  valor: number;
  valor_pago?: number | null;
  status: string;
  natureza?: string | null;
  data_vencimento?: string | null;
  data_baixa?: string | null;
  lote_id?: string | null;
  conciliado?: boolean | null;
  empresa_id?: string | null;
  produtor_id?: string | null;
};
export type GrupoTitulo =
  | "salario"
  | "gratificacao"
  | "adiantamento"
  | "encargo"
  | "ferias"
  | "rescisao"
  | "decimo";
export type VinculoControle = {
  titulo_id: string;
  funcionario_id?: string | null;
  folha_id?: string | null;
  competencia: string;
  grupo: GrupoTitulo;
  descricao: string;
};
export type ConferenciaControle = {
  id: string;
  linha_id: string;
  folha_id: string;
  funcionario_id?: string | null;
  assinatura: string;
  usuario_nome: string;
  created_at: string;
};
export type HistoricoControle = {
  id: string;
  folha_id: string;
  usuario_nome?: string | null;
  acao: string;
  alteracoes?: unknown;
  created_at: string;
};
export type ControleDados = {
  folhas: FolhaControle[];
  linhas: LinhaControle[];
  funcionarios: PessoaControle[];
  adiantamentos: AdiantamentoControle[];
  premios: PremioControle[];
  titulos: TituloControle[];
  vinculos: VinculoControle[];
  conferencias: ConferenciaControle[];
  historico: HistoricoControle[];
  avisos: string[];
  conferenciaDisponivel: boolean;
};
export type FinanceiroControle = VinculoControle & {
  documentos: TituloControle[];
  valor: number;
  pago: number;
  saldo: number;
  previsao: boolean;
  protegido: boolean;
  ausente: boolean;
  cancelado: boolean;
  compensado: boolean;
  vencimento: string | null;
  numero: number | null;
  empresa_id: string | null;
  produtor_id: string | null;
};
const n = (v: unknown) => Number(v ?? 0);
export const arredondar = (v: number) => Math.round(v * 100) / 100;
export function liquidoGravado(l: LinhaControle): number {
  return Math.max(
    0,
    arredondar(
      n(l.salario_bruto) -
        n(l.inss_trabalhador) -
        n(l.irrf) -
        n(l.adiantamento) -
        n(l.outros_descontos) +
        n(l.vale_transporte) +
        n(l.vale_refeicao) +
        n(l.outros_beneficios) +
        n(l.complemento_salarial),
    ),
  );
}
/** Cada título aparece uma vez. Partes de uma baixa são somadas à obrigação original, nunca duplicadas. */
export function financeirosControle(
  dados: Pick<ControleDados, "titulos" | "vinculos">,
): FinanceiroControle[] {
  const vistos = new Set<string>();
  return dados.vinculos
    .filter((v) => {
      if (vistos.has(v.titulo_id)) return false;
      vistos.add(v.titulo_id);
      return true;
    })
    .map((v) => {
      const raiz = dados.titulos.find((t) => t.id === v.titulo_id);
      const todos = dados.titulos.filter(
        (t) => t.id === v.titulo_id || t.titulo_origem_id === v.titulo_id,
      );
      const ativos = todos.filter((t) => t.status !== "cancelado");
      const valor = arredondar(ativos.reduce((s, t) => s + n(t.valor), 0));
      const saldo = arredondar(
        ativos.reduce(
          (s, t) =>
            s +
            (t.status === "baixado"
              ? 0
              : Math.max(0, n(t.valor) - n(t.valor_pago))),
          0,
        ),
      );
      const pago = arredondar(
        ativos.reduce(
          (s, t) =>
            s +
            (t.status === "baixado"
              ? n(t.valor_pago ?? t.valor)
              : n(t.valor_pago)),
          0,
        ),
      );
      return {
        ...v,
        documentos: ativos,
        valor,
        pago,
        saldo,
        previsao: ativos.some((t) => t.natureza === "previsao"),
        protegido: ativos.some(
          (t) =>
            ["baixado", "parcial"].includes(t.status) ||
            n(t.valor_pago) > 0 ||
            !!t.lote_id ||
            !!t.conciliado,
        ),
        ausente: !todos.length,
        cancelado: !!todos.length && !ativos.length,
        compensado:
          v.grupo === "gratificacao" &&
          !!raiz &&
          raiz.status === "cancelado" &&
          Number(raiz.valor) === 0,
        vencimento: raiz?.data_vencimento ?? ativos[0]?.data_vencimento ?? null,
        numero: raiz?.numero ?? null,
        empresa_id: raiz?.empresa_id ?? null,
        produtor_id: raiz?.produtor_id ?? null,
      };
    });
}
/** Versão determinística: pagamento/baixa não invalida conferência; mudanças nos valores e eventos invalidam. */
export function assinaturaConferencia(
  l: LinhaControle,
  d: Pick<
    ControleDados,
    "adiantamentos" | "premios" | "folhas" | "titulos" | "vinculos"
  >,
  financeiros?: FinanceiroControle[],
): string {
  const f = d.folhas.find((f) => f.id === l.folha_id);
  const campos = [
    l.funcionario_id,
    f?.competencia,
    f?.fazenda_id,
    f?.data_vencimento,
    f?.empresa_id,
    f?.produtor_id,
    l.nome_funcionario,
    l.cargo,
    l.cp_lancamento_id,
    ...[
      l.salario_bruto,
      l.complemento_salarial,
      l.gratificacao,
      l.he_valor,
      l.he_dsr,
      l.he_50_horas,
      l.he_100_horas,
      l.inss_trabalhador,
      l.irrf,
      l.adiantamento,
      l.outros_descontos,
      l.vale_transporte,
      l.vale_refeicao,
      l.outros_beneficios,
      l.fgts,
      l.inss_patronal,
    ].map(n),
    l.desc_outros_descontos,
  ];
  const adis = d.adiantamentos
    .filter(
      (a) =>
        a.funcionario_id === l.funcionario_id &&
        a.status !== "cancelado" &&
        (!a.competencia_ref || a.competencia_ref === f?.competencia),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => [
      a.id,
      n(a.valor),
      a.competencia_ref,
      a.tipo,
      a.lancamento_id,
      n(a.descontado_gratificacao_cp),
    ]);
  const premios = d.premios
    .filter(
      (p) =>
        p.funcionario_id === l.funcionario_id &&
        p.mes_referencia === f?.competencia,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => [
      p.id,
      n(p.valor),
      p.descricao,
      p.lancamento_id,
      p.data_pagamento,
    ]);
  const valores = (financeiros ?? financeirosControle(d))
    .filter(
      (t) =>
        t.funcionario_id === l.funcionario_id &&
        (t.folha_id === l.folha_id ||
          (!t.folha_id && t.competencia === f?.competencia)),
    )
    .map((t) => [t.titulo_id, t.valor, t.ausente, t.cancelado, t.vencimento])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([campos, adis, premios, valores]);
}
export function conferenciaAtual(
  l: LinhaControle,
  d: ControleDados,
  financeiros?: FinanceiroControle[],
): ConferenciaControle | undefined {
  const assinatura = assinaturaConferencia(l, d, financeiros);
  return d.conferencias.find(
    (c) => c.linha_id === l.id && c.assinatura === assinatura,
  );
}
export function statusFinanceiro(ts: FinanceiroControle[]): string {
  const validos = ts.filter((t) => !t.ausente && !t.cancelado);
  if (ts.some((t) => t.ausente)) return "Vínculo pendente";
  if (ts.length && ts.every((t) => t.compensado))
    return "Compensado por adiantamento";
  if (!validos.length) return "Sem título ativo";
  if (validos.every((t) => t.saldo <= 0.005)) return "Pago / compensado";
  if (validos.some((t) => t.pago > 0)) return "Parcial";
  return validos.some((t) => t.previsao) ? "Previsão" : "Em aberto";
}

/** Mesmas convenções do AuthProvider: grupo não configurado mantém o padrão; leitura não concede edição. */
export function podeUsarControleFolha(
  role: string | null | undefined,
  permissao: unknown,
  conferir = false,
): boolean {
  if (
    [
      "raccotlo",
      "raccotlo_gestor",
      "raccotlo_seletor",
      "raccotlo_operacional",
      "bpo",
    ].includes(role ?? "")
  )
    return true;
  if (
    permissao === undefined ||
    permissao === null ||
    (Array.isArray(permissao) && permissao.length === 0)
  )
    return true;
  if (Array.isArray(permissao))
    return (
      permissao.includes("visualizar") &&
      (!conferir ||
        permissao.some((p) =>
          ["editar", "criar", "processar", "reprocessar"].includes(String(p)),
        ))
    );
  return conferir ? permissao === "escrita" : permissao !== "nenhum";
}
