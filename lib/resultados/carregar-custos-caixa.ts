import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaginado } from "../buscar-paginado";
import { dataParaIso, exibirData } from "../input-data";
import {
  apurarCustosCaixa,
  comporFaturasCaixa,
  type FiltroCaixa,
  type RegistroCaixa,
} from "./custos-caixa";

const COMUNS =
  "id,fazenda_id,tipo,status,moeda,descricao,categoria,valor,valor_pago,valor_juros,valor_multa,valor_desconto,cotacao_usd,ciclo_id,operacao_gerencial_id,forma_pagamento,numero_documento,pagamento_parcial,lote_id";
const CAMPOS: Record<string, string> = {
  lancamentos: `${COMUNS},data_baixa,natureza,origem_lancamento,nfe_numero,fatura_cartao_id`,
  empresa_lancamentos: `${COMUNS},data_pagamento,origem`,
  operacoes_gerenciais: "id,classificacao,descricao",
  faturas_cartao: "id,lancamento_cp_id",
};
const blocos = <T>(a: T[], tamanho = 120) =>
  Array.from({ length: Math.ceil(a.length / tamanho) }, (_, i) =>
    a.slice(i * tamanho, (i + 1) * tamanho),
  );
type Consulta = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
export async function carregarCustosCaixa(
  db: SupabaseClient,
  filtro: FiltroCaixa,
) {
  if (!filtro.fazendaIds.length)
    throw new Error("Selecione ao menos uma fazenda autorizada.");
  const valida = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) && dataParaIso(exibirData(d)) === d;
  if (
    !valida(filtro.inicio) ||
    !valida(filtro.fim) ||
    filtro.inicio > filtro.fim
  )
    throw new Error(
      "Informe um período de baixa válido, com início anterior ao fim.",
    );
  async function ler(tabela: string, configurar: (q: Consulta) => Consulta) {
    try {
      return await buscarPaginado<RegistroCaixa>((de, ate) =>
        configurar(db.from(tabela).select(CAMPOS[tabela]))
          .order("id")
          .range(de, ate)
          .returns<RegistroCaixa[]>(),
      );
    } catch (e) {
      throw new Error(
        `Não foi possível carregar ${tabela}: ${String((e as { message?: string })?.message ?? e)}`,
      );
    }
  }
  async function pagos(tabela: "lancamentos" | "empresa_lancamentos") {
    const data = tabela === "lancamentos" ? "data_baixa" : "data_pagamento";
    return (
      await Promise.all(
        blocos([...new Set(filtro.fazendaIds)]).map((ids) =>
          ler(tabela, (q) =>
            q
              .in("fazenda_id", ids)
              .eq("tipo", "pagar")
              .in("status", ["baixado", "pago", "parcial"])
              .gte(data, filtro.inicio)
              .lte(data, filtro.fim),
          ),
        ),
      )
    ).flat();
  }
  const [titulosProdutor, empresa] = await Promise.all([
    pagos("lancamentos"),
    pagos("empresa_lancamentos"),
  ]);
  let produtor = titulosProdutor;
  const idsFaturas = produtor
    .filter((t) => t.origem_lancamento === "cartao_fatura")
    .map((t) => String(t.id));
  if (idsFaturas.length) {
    const faturas = (
      await Promise.all(
        blocos(idsFaturas).map((ids) =>
          ler("faturas_cartao", (q) => q.in("lancamento_cp_id", ids)),
        ),
      )
    ).flat();
    const itens = (
      await Promise.all(
        blocos(faturas.map((f) => String(f.id))).flatMap((ids) =>
          blocos(filtro.fazendaIds).map((fazendas) =>
            ler("lancamentos", (q) =>
              q
                .in("fatura_cartao_id", ids)
                .in("fazenda_id", fazendas)
                .eq("tipo", "pagar")
                .eq("status", "cartao"),
            ),
          ),
        ),
      )
    ).flat();
    produtor = comporFaturasCaixa(produtor, faturas, itens);
  }
  // Carrega somente as OGs efetivamente usadas; nunca varre os cadastros de outros clientes.
  const idsOG = [
    ...new Set(
      [...produtor, ...empresa]
        .map((t) => t.operacao_gerencial_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const operacoes = (
    await Promise.all(
      blocos(idsOG).map((ids) =>
        ler("operacoes_gerenciais", (q) => q.in("id", ids)),
      ),
    )
  ).flat();
  return apurarCustosCaixa(
    [
      { origem: "lancamentos", linhas: produtor },
      { origem: "empresa_lancamentos", linhas: empresa },
    ],
    operacoes,
    filtro,
  );
}
