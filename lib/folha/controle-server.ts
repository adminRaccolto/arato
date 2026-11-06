import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaginado } from "../buscar-paginado.ts";
import { mesAnterior } from "./empregador.ts";
import { competenciaDoSalario, unificarPremiacoes } from "./premiacoes-origem.ts";
import type {
  ControleDados,
  FolhaControle,
  LinhaControle,
  PessoaControle,
  AdiantamentoControle,
  PremioControle,
  TituloControle,
  VinculoControle,
  ConferenciaControle,
  HistoricoControle,
} from "./controle";

const ausente = (e: unknown) =>
  ["42P01", "42703", "PGRST205", "PGRST204"].includes(
    String((e as { code?: string })?.code),
  );
export function validarPeriodoControle(
  de: unknown,
  ate: unknown,
): de is string {
  return (
    typeof de === "string" &&
    typeof ate === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(de) &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(ate) &&
    de <= ate
  );
}
export async function carregarControleFolha(
  sb: SupabaseClient,
  fazendas: string[],
  de: string,
  ate: string,
): Promise<ControleDados> {
  if (!fazendas.length || !validarPeriodoControle(de, ate))
    throw new Error("Informe as fazendas e um período válido da folha.");
  const avisos: string[] = [];
  const [anoFim, mesFim] = ate.split("-").map(Number);
  const fimExclusivo = `${mesFim === 12 ? anoFim + 1 : anoFim}-${String(mesFim === 12 ? 1 : mesFim + 1).padStart(2, "0")}-01`;
  const selecionar = (tabela: string, campos: string) =>
    sb.from(tabela).select(campos);
  const todas = <T>(
    tabela: string,
    filtro: (q: ReturnType<typeof selecionar>) => ReturnType<typeof selecionar>,
    campos = "*",
  ) =>
    buscarPaginado<T>(async (inicio, fim) => {
      const { data, error } = await filtro(selecionar(tabela, campos))
        .order("id")
        .range(inicio, fim);
      return { data: data as unknown as T[] | null, error };
    });
  const opcionais = async <T>(
    nome: string,
    fn: () => Promise<T[]>,
  ): Promise<T[]> => {
    try {
      return await fn();
    } catch (e) {
      if (!ausente(e)) throw e;
      avisos.push(
        `${nome}: estrutura indisponível no banco. Aplique as migrações correspondentes para incluir este controle.`,
      );
      return [];
    }
  };
  const [folhas, funcionarios, adiantamentos, premiosAtuais, premiosAntigos] = await Promise.all([
    todas<FolhaControle>(
      "folha_pagamento",
      (q) =>
        q
          .in("fazenda_id", fazendas)
          .gte("competencia", mesAnterior(de))
          .lte("competencia", ate),
      "*",
    ),
    todas<PessoaControle>(
      "funcionarios",
      (q) => q.in("fazenda_id", fazendas),
      "id,fazenda_id,nome,funcao,ativo,empresa_id,produtor_id,data_admissao,data_demissao",
    ),
    todas<AdiantamentoControle>(
      "adiantamentos_salario",
      (q) =>
        q
          .in("fazenda_id", fazendas)
          .or(
            `and(competencia_ref.gte.${de},competencia_ref.lte.${ate}),competencia_ref.is.null`,
          ),
      "*",
    ),
    todas<PremioControle>(
      "funcionarios_premiacoes",
      (q) =>
        q
          .in("fazenda_id", fazendas)
          .gte("mes_referencia", de)
          .lte("mes_referencia", ate),
      "*",
    ),
    opcionais<PremioControle>("Premiações do cadastro histórico", () => todas<PremioControle>(
      "funcionario_premiacoes",
      q => q.in("fazenda_id", fazendas).gte("mes_referencia", de).lte("mes_referencia", ate),
      "*",
    )),
  ]);
  const premios = unificarPremiacoes(premiosAtuais, premiosAntigos);
  const folhaIds = folhas.map((f) => f.id),
    linhas: LinhaControle[] = [],
    historico: HistoricoControle[] = [],
    conferencias: ConferenciaControle[] = [];
  let conferenciaDisponivel = true;
  for (let i = 0; i < folhaIds.length; i += 150) {
    const bloco = folhaIds.slice(i, i + 150);
    const [ls, hs, cs] = await Promise.all([
      todas<LinhaControle>(
        "folha_funcionarios",
        (q) => q.in("folha_id", bloco),
        "*",
      ),
      opcionais<HistoricoControle>("Histórico da folha", () =>
        todas("folha_historico", (q) => q.in("folha_id", bloco), "*"),
      ),
      (async () => {
        try {
          return await todas<ConferenciaControle>(
            "folha_conferencias",
            (q) => q.in("folha_id", bloco),
            "id,linha_id,folha_id,funcionario_id,assinatura,usuario_nome,created_at",
          );
        } catch (e) {
          if (!ausente(e)) throw e;
          conferenciaDisponivel = false;
          return [];
        }
      })(),
    ]);
    linhas.push(...ls);
    historico.push(...hs);
    conferencias.push(...cs);
  }
  if (!folhaIds.length) {
    const { error } = await sb.from("folha_conferencias").select("id").limit(0);
    if (error) {
      if (!ausente(error)) throw error;
      conferenciaDisponivel = false;
    }
  }
  if (!conferenciaDisponivel)
    avisos.push(
      "Conferência por funcionário: aplique a Seção 420 do supabase_migrations.sql para registrar usuário, data e versão conferida.",
    );
  const vinculos: VinculoControle[] = [];
  const add = (
    titulo_id: string | null | undefined,
    v: Omit<VinculoControle, "titulo_id">,
  ) => {
    if (titulo_id) vinculos.push({ titulo_id, ...v });
  };
  for (const l of linhas) {
    const f = folhas.find((f) => f.id === l.folha_id)!;
    add(l.cp_lancamento_id, {
      funcionario_id: l.funcionario_id,
      folha_id: f.id,
      competencia: f.competencia,
      grupo: "salario",
      descricao: `Salário — ${l.nome_funcionario}`,
    });
  }
  for (const f of folhas) {
    add(f.cp_fgts_id, {
      folha_id: f.id,
      competencia: f.competencia,
      grupo: "encargo",
      descricao: "FGTS",
    });
    add(f.cp_inss_patronal_id, {
      folha_id: f.id,
      competencia: f.competencia,
      grupo: "encargo",
      descricao: "INSS patronal",
    });
  }
  for (const a of adiantamentos)
    if (a.status !== "cancelado")
      add(a.lancamento_id, {
        funcionario_id: a.funcionario_id,
        competencia: a.competencia_ref || a.data.slice(0, 7),
        grupo: "adiantamento",
        descricao: a.descricao || "Adiantamento",
      });
  for (const p of premios)
    add(p.lancamento_id, {
      funcionario_id: p.funcionario_id,
      competencia: p.mes_referencia,
      grupo: "gratificacao",
      descricao: p.descricao,
    });
  type Especial = {
    id: string;
    funcionario_id: string;
    lancamento_ids?: string[];
    data_pagamento?: string;
    data_inicio_gozo?: string;
    data_desligamento?: string;
    status?: string;
    ano?: number;
    parcela1_lancamento_id?: string;
    parcela2_lancamento_id?: string;
    parcela1_vencimento?: string;
    parcela2_vencimento?: string;
  };
  const [ferias, rescisoes, decimos] = await Promise.all([
    opcionais<Especial>("Férias", () =>
      todas(
        "funcionario_ferias",
        (q) =>
          q
            .in("fazenda_id", fazendas)
            .gte("data_pagamento", `${de}-01`)
            .lt("data_pagamento", fimExclusivo),
        "*",
      ),
    ),
    opcionais<Especial>("Rescisões", () =>
      todas(
        "funcionario_rescisoes",
        (q) =>
          q
            .in("fazenda_id", fazendas)
            .gte("data_pagamento", `${de}-01`)
            .lt("data_pagamento", fimExclusivo),
        "*",
      ),
    ),
    opcionais<Especial>("13º salário", () =>
      todas(
        "decimo_terceiro",
        (q) =>
          q
            .in("fazenda_id", fazendas)
            .gte("ano", Number(de.slice(0, 4)) - 1)
            .lte("ano", Number(ate.slice(0, 4))),
        "*",
      ),
    ),
  ]);
  for (const f of ferias)
    for (const id of f.lancamento_ids ?? [])
      add(id, {
        funcionario_id: f.funcionario_id,
        competencia: (f.data_pagamento || f.data_inicio_gozo || de).slice(0, 7),
        grupo: "ferias",
        descricao: "Férias",
      });
  for (const r of rescisoes)
    if (r.status !== "estornada")
      for (const id of r.lancamento_ids ?? [])
        add(id, {
          funcionario_id: r.funcionario_id,
          competencia: (r.data_pagamento || r.data_desligamento || de).slice(
            0,
            7,
          ),
          grupo: "rescisao",
          descricao: "Rescisão",
        });
  for (const d of decimos) {
    add(d.parcela1_lancamento_id, {
      funcionario_id: d.funcionario_id,
      competencia: (d.parcela1_vencimento || `${d.ano}-11`).slice(0, 7),
      grupo: "decimo",
      descricao: "13º — 1ª parcela",
    });
    add(d.parcela2_lancamento_id, {
      funcionario_id: d.funcionario_id,
      competencia: (d.parcela2_vencimento || `${d.ano}-12`).slice(0, 7),
      grupo: "decimo",
      descricao: "13º — 2ª parcela",
    });
  }
  // O histórico pode ter CPs válidos que perderam o vínculo. Exibe-os para conciliação,
  // sem associar por nome ou criar novas obrigações automaticamente.
  const salarios = await todas<TituloControle>("lancamentos", q => q.in("fazenda_id", fazendas).ilike("descricao", "Salário%"),
    "id,funcionario_id,titulo_origem_id,descricao,status,natureza");
  const ligados = new Set(vinculos.map(v => v.titulo_id));
  let semFolha = 0;
  for (const t of salarios) {
    const comp = competenciaDoSalario(t.descricao);
    if (!comp || comp < de || comp > ate || ligados.has(t.id) || t.titulo_origem_id || t.status === "cancelado" || t.natureza === "previsao") continue;
    vinculos.push({ titulo_id: t.id, funcionario_id: t.funcionario_id, competencia: comp, grupo: "salario", sem_folha: true,
      descricao: `${t.descricao} · sem vínculo com folha — conferir competência` });
    semFolha++;
  }
  if (semFolha) avisos.push(`${semFolha} título(s) de salário sem vínculo com a folha foram incluídos em Pagamentos. Confira a competência e o pagamento existente antes de gerar outro título.`);
  if (folhas.some(f => f.competencia >= de && !f.empresa_id && !f.produtor_id)) avisos.push("Há folhas históricas sem empregador identificado. Os valores foram preservados; confirme o vínculo pelos documentos da competência.");
  const raizes = [...new Set(vinculos.map((v) => v.titulo_id))],
    titulos: TituloControle[] = [];
  for (let i = 0; i < raizes.length; i += 150) {
    const lista = raizes.slice(i, i + 150).join(",");
    titulos.push(
      ...(await todas<TituloControle>(
        "lancamentos",
        (q) =>
          q
            .in("fazenda_id", fazendas)
            .or(`id.in.(${lista}),titulo_origem_id.in.(${lista})`),
        "id,fazenda_id,titulo_origem_id,descricao,numero,valor,valor_pago,status,natureza,data_vencimento,data_baixa,lote_id,conciliado,empresa_id,produtor_id",
      )),
    );
  }
  return {
    folhas,
    funcionarios,
    linhas,
    adiantamentos,
    premios,
    titulos: [...new Map(titulos.map((t) => [t.id, t])).values()],
    vinculos,
    conferencias,
    historico,
    avisos: [...new Set(avisos)],
    conferenciaDisponivel,
  };
}
