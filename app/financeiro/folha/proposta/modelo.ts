export type Situacao = "preparacao" | "conferida" | "fechada";
export type Tipo =
  | "gratificacao"
  | "adiantamento_salario"
  | "adiantamento_gratificacao"
  | "horas_extras"
  | "beneficio"
  | "desconto"
  | "ajuste_salario"
  | "diferenca"
  | "ferias"
  | "rescisao"
  | "decimo1"
  | "decimo2";
export type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  empregador: string;
  salario: number;
  anterior: number;
  encargos: number;
};
export type Movimento = {
  id: string;
  funcionario: string;
  competencia: string;
  tipo: Tipo;
  descricao: string;
  valor: number;
  data: string;
  reprocessamentoDe?: string;
};
export type Titulo = {
  id: string;
  funcionario: string;
  nome: string;
  empregador: string;
  descricao: string;
  valor: number;
  pago: number;
  previsao: boolean;
  vencimento: string;
  grupo: "salario" | "gratificacao" | "adiantamento" | "encargo" | "especial";
};
export const rotulos: Record<Tipo, string> = {
  gratificacao: "Gratificação",
  adiantamento_salario: "Adiantamento de salário",
  adiantamento_gratificacao: "Adiantamento de gratificação",
  horas_extras: "Horas extras / DSR",
  beneficio: "Benefício",
  desconto: "Desconto",
  ajuste_salario: "Ajuste de salário",
  diferenca: "Diferença a pagar",
  ferias: "Férias",
  rescisao: "Rescisão",
  decimo1: "13º · 1ª parcela",
  decimo2: "13º · 2ª parcela",
};
export const funcionarios: Funcionario[] = [
  {
    id: "ana",
    nome: "Ana Ribeiro",
    cargo: "Assistente administrativa",
    empregador: "Fazenda Horizonte · Produtor PF",
    salario: 3000,
    anterior: 3000,
    encargos: 240,
  },
  {
    id: "joao",
    nome: "João Martins",
    cargo: "Operador de máquinas",
    empregador: "Fazenda Horizonte · Produtor PF",
    salario: 4200,
    anterior: 4000,
    encargos: 336,
  },
  {
    id: "maria",
    nome: "Maria Costa",
    cargo: "Técnica agrícola",
    empregador: "Agro Horizonte · Empresa PJ",
    salario: 3800,
    anterior: 3800,
    encargos: 490,
  },
  {
    id: "pedro",
    nome: "Pedro Alves",
    cargo: "Motorista",
    empregador: "Agro Horizonte · Empresa PJ",
    salario: 3400,
    anterior: 3400,
    encargos: 440,
  },
  {
    id: "lucia",
    nome: "Lúcia Ferreira",
    cargo: "Encarregada de campo",
    empregador: "Fazenda Horizonte · Produtor PF",
    salario: 5100,
    anterior: 5100,
    encargos: 408,
  },
];
export const centavos = (n: number) => Math.round(n * 100) / 100;
export function proximoMes(comp: string): string {
  const [a, m] = comp.split("-").map(Number);
  return `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
}
export function chave(comp: string, empregador: string) {
  return `${comp}|${empregador}`;
}
export function salario(
  f: Funcionario,
  movimentos: Movimento[],
  competencia: string,
): number {
  const lista = movimentos.filter(
    (m) => m.funcionario === f.id && m.competencia === competencia,
  );
  return Math.max(
    0,
    centavos(
      f.salario +
        lista.reduce(
          (v, m) =>
            v +
            (["horas_extras", "beneficio", "ajuste_salario"].includes(m.tipo)
              ? m.valor
              : ["desconto", "adiantamento_salario"].includes(m.tipo)
                ? -m.valor
                : 0),
          0,
        ),
    ),
  );
}
export function titulosDoMes(
  comp: string,
  movimentos: Movimento[],
  situacoes: Record<string, Situacao>,
  pagamentos: Record<string, number>,
): Titulo[] {
  const todos: Titulo[] = [];
  for (const f of funcionarios) {
    const lista = movimentos.filter(
      (m) => m.funcionario === f.id && m.competencia === comp,
    );
    const add = (
      id: string,
      descricao: string,
      valor: number,
      grupo: Titulo["grupo"],
      data: string,
      previsao = false,
    ) => {
      todos.push({
        id,
        funcionario: f.id,
        nome: f.nome,
        empregador: f.empregador,
        descricao,
        valor: centavos(valor),
        grupo,
        vencimento: data,
        previsao,
        pago: pagamentos[id] ?? 0,
      });
    };
    const fechada = situacoes[chave(comp, f.empregador)] === "fechada";
    add(
      `${comp}:${f.id}:salario`,
      "Salário líquido",
      salario(f, movimentos, comp),
      "salario",
      `${proximoMes(comp)}-05`,
      !fechada,
    );
    let adiantado = lista
      .filter((m) => m.tipo === "adiantamento_gratificacao")
      .reduce((s, m) => s + m.valor, 0);
    for (const m of lista) {
      if (m.tipo === "gratificacao") {
        const desconto = Math.min(adiantado, m.valor);
        adiantado -= desconto;
        add(m.id, m.descricao, m.valor - desconto, "gratificacao", m.data);
      }
      if (
        ["adiantamento_salario", "adiantamento_gratificacao"].includes(m.tipo)
      )
        add(m.id, m.descricao, m.valor, "adiantamento", m.data);
      if (
        ["ferias", "rescisao", "diferenca", "decimo1", "decimo2"].includes(
          m.tipo,
        )
      )
        add(m.id, m.descricao, m.valor, "especial", m.data);
    }
  }
  for (const emp of [...new Set(funcionarios.map((f) => f.empregador))]) {
    const id = `${comp}:${emp}:encargos`;
    todos.push({
      id,
      funcionario: "",
      nome: "Empregador",
      empregador: emp,
      descricao: "Encargos · valores ilustrativos",
      valor: funcionarios
        .filter((f) => f.empregador === emp)
        .reduce((v, f) => v + f.encargos, 0),
      pago: pagamentos[id] ?? 0,
      previsao: situacoes[chave(comp, emp)] !== "fechada",
      vencimento: `${proximoMes(comp)}-20`,
      grupo: "encargo",
    });
  }
  return todos;
}
export function dadosIniciais(): Movimento[] {
  return [
    {
      id: "grat-ana",
      funcionario: "ana",
      competencia: "2026-11",
      tipo: "gratificacao",
      descricao: "Gratificação de produtividade",
      valor: 1000,
      data: "2026-12-05",
    },
    {
      id: "adi-ana",
      funcionario: "ana",
      competencia: "2026-11",
      tipo: "adiantamento_gratificacao",
      descricao: "Adiantamento da gratificação",
      valor: 300,
      data: "2026-11-03",
    },
    {
      id: "he-joao",
      funcionario: "joao",
      competencia: "2026-11",
      tipo: "horas_extras",
      descricao: "Horas extras e DSR · valor de exemplo",
      valor: 450,
      data: "2026-12-05",
    },
    {
      id: "adi-pedro",
      funcionario: "pedro",
      competencia: "2026-11",
      tipo: "adiantamento_salario",
      descricao: "Adiantamento quinzenal",
      valor: 600,
      data: "2026-11-04",
    },
  ];
}
export function pendencias(
  f: Funcionario,
  movimentos: Movimento[],
  comp: string,
  revisados: string[],
): string[] {
  const p: string[] = [];
  if (!revisados.includes(`${comp}:${f.id}`)) p.push("Conferência pendente");
  if (salario(f, movimentos, comp) !== f.anterior)
    p.push("Diferença em relação ao mês anterior");
  return p;
}
