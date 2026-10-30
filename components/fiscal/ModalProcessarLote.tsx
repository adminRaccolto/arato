"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Modal de Processamento em Lote de NF de Produtos — extraído de
// app/compras/nf/page.tsx (02/10/2026, última das 4 lacunas da Fase 2 de
// unificação de Documentos Fiscais). Lógica de processarEmLote() preservada
// exatamente como estava — só a casca mudou (recebe a lista de NFs
// selecionadas via props em vez de ler um Set da página inteira).
//
// Diferença de arquitetura em relação a ModalNf/ModalNfServico: este modal
// não representa UMA NF — ele aplica uma configuração comum (Centro de
// Custo, Operação Gerencial, Depósito, Ano Safra/Ciclo, Pedido de Compra)
// a VÁRIAS NFs pendentes de uma vez, processando-as quando o tipo de
// destino é "Apropriação Direta" (sem entrada em estoque).
// ═══════════════════════════════════════════════════════════════════════════
import { hojeLocal } from "../../lib/data-local";
import SelectField from "../SelectField";
import InputData from "../../components/InputData";
import { useState, useEffect } from "react";
import {
  atualizarNfEntrada,
  listarNfEntradaItens,
  processarNfEntrada, verificarMovimentoEmpresaNf, registrarAutorizacaoMovimentoEmpresa, limparMovimentacoesEFinanceiroDaNf,
  listarCentrosCustoGeralDaConta,
  listarDepositosMulti,
  listarOperacoesGerenciaisAtivasDaConta,
  listarAnosSafra,
  listarCiclos,
  listarPessoasDaConta,
  ogDaLista,
} from "../../lib/db";
import { useAuth } from "../AuthProvider";
import type { NfEntrada, NfEntradaItem, Deposito, CentroCusto, OperacaoGerencial, AnoSafra, Ciclo, Pessoa } from "../../lib/supabase";
import { supabase } from "../../lib/supabase";
import SelectBusca from "../SelectBusca";
import { CFOPS_RETORNO_ARMAZENAGEM, CFOPS_RETORNO_DE_REMESSA } from "../../lib/cfop-imobilizado";
import { fatorUnidade } from "../../lib/estoque/unidades";
import { CFOPS_CONFIRMAR } from "../../lib/fiscal/cfop-cobranca";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

interface PedidoMin { id: string; nr_pedido?: string; numero?: string; nr_pedido_fornecedor?: string; fornecedor_id?: string; contato_fornecedor?: string; status: string; ano_safra_id?: string; ciclo_id?: string; data_vencimento?: string; }

const STATUS_PEDIDO: Record<string, string> = { rascunho: "rascunho", aprovado: "aprovado", parcialmente_entregue: "parcialmente entregue", entregue: "entregue" };
const dig = (v?: string | null) => (v ?? "").replace(/\D/g, "");
// Mesma empresa = mesma raiz de CNPJ (matriz e filiais); CPF compara inteiro
const raiz = (v?: string | null) => { const d = dig(v); return d.length === 14 ? d.slice(0, 8) : d; };


type ItemPedido = { id: string; insumo_id: string | null; quantidade: number; qtd_cancelada: number | null; qtd_entregue: number | null; unidade: string | null };

/** NF de Insumos pronta para processar em lote: as mesmas travas do processamento individual (ModalNf). Devolve o
 *  motivo quando não está pronta — a NF fica pendente para ser aberta e ajustada. */
async function motivoNaoProntaEstoque(itens: NfEntradaItem[], pedidoId: string | null | undefined, observacao: string | null | undefined): Promise<string | null> {
  const comDescricao = itens.filter(it => (it.descricao_nf ?? it.descricao_produto ?? "").trim());
  if (!comDescricao.length) return "sem itens";
  const semProduto = comDescricao.filter(it => !it.insumo_id && !it.principio_ativo_id);
  if (semProduto.length) return `${semProduto.length} item(ns) sem insumo associado ao catálogo`;
  // Unidade que vai para o estoque = unidade do cadastro do insumo
  const ids = [...new Set(comDescricao.map(it => it.insumo_id).filter((x): x is string => !!x))];
  const { data: ins } = ids.length ? await supabase.from("insumos").select("id, nome, unidade").in("id", ids) : { data: [] };
  const insPor = new Map((ins ?? []).map(i => [i.id as string, i as { id: string; nome: string; unidade: string }]));
  for (const it of comDescricao) {
    if (!it.insumo_id) continue;
    const cad = insPor.get(it.insumo_id);
    if (!cad) return `item "${it.descricao_nf}": insumo não encontrado`;
    if (fatorUnidade(it.unidade, cad.unidade) !== 1) return `item "${it.descricao_nf}": unidade ${it.unidade || "—"} diferente da do cadastro (${cad.unidade}) — confira a conversão`;
  }
  // Lotes de semente: cada lote precisa de peso
  for (const it of comDescricao) {
    const lotes = it.lotes_semente ?? [];
    if (lotes.length >= 2 && lotes.some(l => l.numero && !(l.quantidade_kg ?? 0))) return `item "${it.descricao_nf}": lote de semente sem peso`;
  }
  // Pedido vinculado: o item precisa constar no pedido, na linha certa e dentro do saldo (exceção só com justificativa)
  if (pedidoId) {
    const { data: linhasPed } = await supabase.from("pedidos_compra_itens").select("id, insumo_id, quantidade, qtd_cancelada, qtd_entregue, unidade").eq("pedido_id", pedidoId);
    const linhas = (linhasPed ?? []) as ItemPedido[];
    const excecoes: string[] = [];
    for (const it of comDescricao) {
      if (!it.insumo_id) continue;
      const doProduto = linhas.filter(l => l.insumo_id === it.insumo_id);
      if (doProduto.length > 1 && !it.pedido_item_id) return `item "${it.descricao_nf}": o pedido tem o produto em mais de uma linha — indique a linha na NF`;
      if (!doProduto.length) { excecoes.push(`"${it.descricao_nf}" não consta no pedido`); continue; }
      const linha = doProduto.length === 1 ? doProduto[0] : doProduto.find(l => l.id === it.pedido_item_id);
      if (!linha || fatorUnidade(linha.unidade, insPor.get(it.insumo_id)?.unidade) !== 1) continue;
      const saldo = Number(linha.quantidade) - Number(linha.qtd_cancelada ?? 0) - Number(linha.qtd_entregue ?? 0);
      if (Number(it.quantidade) > saldo + 0.001) excecoes.push(`"${it.descricao_nf}" acima do saldo do pedido (${Math.max(0, saldo)})`);
    }
    if (excecoes.length && (observacao ?? "").trim().length < 15) return `divergência com o pedido: ${excecoes.join("; ")} — corrija ou justifique na Observação da NF`;
  }
  return null;
}


const normTxt = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Associa ao catálogo os itens ainda sem insumo pelo histórico: o mesmo produto (descrição e unidade da NF) do mesmo
 *  fornecedor já processado antes ligado a UM único insumo, com a mesma conversão de unidade. Item ambíguo ou sem
 *  histórico fica como está. Não grava nada: devolve os itens com a associação aplicada. */
async function associarPeloHistorico(itens: NfEntradaItem[], emitenteCnpj: string | null | undefined, fazendaIds: string[]): Promise<NfEntradaItem[]> {
  const doc = dig(emitenteCnpj);
  if (!doc || !itens.some(it => !it.insumo_id && !it.principio_ativo_id)) return itens;
  const fmt = doc.length === 14 ? doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : doc;
  const { data: nfsAnt } = await supabase.from("nf_entradas").select("id").in("fazenda_id", fazendaIds)
    .eq("status", "processada").or(`emitente_cnpj.eq.${doc},emitente_cnpj.eq.${fmt}`).order("data_emissao", { ascending: false }).limit(300);
  const ids = (nfsAnt ?? []).map(n => n.id as string);
  if (!ids.length) return itens;
  const hist = new Map<string, { insumos: Set<string>; fatores: Set<string>; unidade: string; nome: string }>();
  for (let k = 0; k < ids.length; k += 150) {
    const { data } = await supabase.from("nf_entrada_itens").select("descricao_nf, unidade_nf, unidade, insumo_id, descricao_produto, quantidade, qtd_nf, tipo_apropiacao")
      .in("nf_entrada_id", ids.slice(k, k + 150)).eq("tipo_apropiacao", "estoque").not("insumo_id", "is", null);
    for (const h of (data ?? []) as { descricao_nf: string; unidade_nf: string | null; unidade: string | null; insumo_id: string; descricao_produto: string | null; quantidade: number; qtd_nf: number | null }[]) {
      const chave = `${normTxt(h.descricao_nf)}|${normTxt(h.unidade_nf)}`;
      const fator = h.qtd_nf && Number(h.qtd_nf) > 0 ? Math.round(Number(h.quantidade) / Number(h.qtd_nf) * 1e6) / 1e6 : 1;
      const e = hist.get(chave) ?? { insumos: new Set<string>(), fatores: new Set<string>(), unidade: h.unidade ?? "", nome: h.descricao_produto ?? "" };
      e.insumos.add(h.insumo_id); e.fatores.add(String(fator));
      hist.set(chave, e);
    }
  }
  return itens.map(it => {
    if (it.insumo_id || it.principio_ativo_id) return it;
    const h = hist.get(`${normTxt(it.descricao_nf)}|${normTxt(it.unidade_nf ?? it.unidade)}`);
    if (!h || h.insumos.size !== 1 || h.fatores.size !== 1) return it;
    const fator = Number([...h.fatores][0]) || 1;
    const qtdNf = Number(it.qtd_nf ?? it.quantidade);
    return { ...it, insumo_id: [...h.insumos][0], unidade: h.unidade || it.unidade, unidade_nf: it.unidade_nf ?? it.unidade,
      qtd_nf: qtdNf, quantidade: Math.round(qtdNf * fator * 1e6) / 1e6, fator_conversao: fator, descricao_produto: h.nome || it.descricao_produto };
  });
}

export default function ModalProcessarLote({
  nfs, onClose, onSaved,
}: {
  nfs: Array<{ id: string; fazenda_id: string | null; numero: string | null; emitente_nome?: string | null; emitente_cnpj?: string | null; valor?: number | null }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { fazendaId, fazendaIds } = useAuth();
  const batchFazendaId = nfs[0]?.fazenda_id ?? fazendaId ?? "";
  // Lote é de UM fornecedor (o mesmo CPF/CNPJ emitente): a OG, o centro de custo e o pedido valem para todas
  const fornecedores = [...new Map(nfs.map(n => [dig(n.emitente_cnpj) || `nome:${(n.emitente_nome ?? "").trim().toUpperCase()}`, n.emitente_nome ?? "sem emitente"])).values()];
  const fornecedorUnico = fornecedores.length === 1;
  const cnpjLote = dig(nfs[0]?.emitente_cnpj);
  const nomeLote = nfs[0]?.emitente_nome ?? "";
  const totalLote = nfs.reduce((t, n) => t + Number(n.valor ?? 0), 0);

  const [centros, setCentros]   = useState<CentroCusto[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [ops, setOps]           = useState<OperacaoGerencial[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]     = useState<Ciclo[]>([]);
  const [pedidos, setPedidos]   = useState<PedidoMin[]>([]);
  const [pessoas, setPessoas]   = useState<Pessoa[]>([]);
  const [depFiltro, setDepFiltro] = useState<"proprio" | "terceiro">("proprio");

  const [settings, setSettings] = useState({
    pedido_compra_id: "", data_vencimento_cp: "",
    deposito_destino_id: "", centro_custo_id: "",
    ano_safra_id: "", ciclo_id: "",
    operacao_gerencial_id: "",
    tipo_destino: "" as "" | "estoque" | "direto",
    tipo_estoque: "insumos" as "insumos" | "pecas" | "combustivel",
  });
  const [saving, setSaving] = useState(false);

  // Apoio — carregado uma vez, na fazenda da primeira NF selecionada
  useEffect(() => {
    if (!batchFazendaId) return;
    const allFazIds = fazendaIds.length > 1 ? fazendaIds : [batchFazendaId];
    (async () => {
      const [ccData, depData, opsData, anosData] = await Promise.all([
        listarCentrosCustoGeralDaConta(batchFazendaId).catch(() => [] as CentroCusto[]),
        listarDepositosMulti(allFazIds).catch(() => [] as Deposito[]),
        // OGs habilitadas para Notas Fiscais de Entrada OU Contas a Pagar/Receber (as só de NF entram sem CP)
        Promise.all([
          listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "notas_fiscais" }, batchFazendaId).catch(() => [] as OperacaoGerencial[]),
          listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, batchFazendaId).catch(() => [] as OperacaoGerencial[]),
        ]).then(([nf, cp]) => {
          const m = new Map<string, OperacaoGerencial>();
          for (const o of [...nf, ...cp]) if (!m.has(o.classificacao)) m.set(o.classificacao, o);
          return [...m.values()].sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR", { numeric: true }));
        }),
        listarAnosSafra(batchFazendaId).catch(() => [] as AnoSafra[]),
        // A função recebe a FAZENDA (resolve a conta por ela); passar o contaId deixava a lista vazia e o pedido sem fornecedor
        listarPessoasDaConta(batchFazendaId).then(setPessoas).catch(() => setPessoas([])),
      ]);
      setCentros(ccData);
      setDepositos(depData);
      setOps(opsData);
      setAnosSafra(anosData);
      try {
        const { data } = await supabase
          .from("pedidos_compra")
          .select("id, numero, nr_pedido, nr_pedido_fornecedor, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
          .in("fazenda_id", allFazIds)
          .in("status", ["rascunho", "aprovado", "parcialmente_entregue", "entregue"])
          .order("created_at", { ascending: false });
        setPedidos((data ?? []) as PedidoMin[]);
      } catch { setPedidos([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFazendaId]);

  // Ciclos do ano safra escolhido
  useEffect(() => {
    if (!settings.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(settings.ano_safra_id, batchFazendaId).then(setCiclos).catch(() => setCiclos([]));
  }, [settings.ano_safra_id, batchFazendaId]);

  // Pedido escolhido: preenche ano safra, ciclo e vencimento vazios (como no processamento individual) e confirma
  // quando o pedido é de outra empresa (compra por conta e ordem)
  function escolherPedido(pedidoId: string) {
    if (!pedidoId) { setSettings(p => ({ ...p, pedido_compra_id: "" })); return; }
    const ped = pedidos.find(x => x.id === pedidoId);
    const forn = pessoas.find(x => x.id === ped?.fornecedor_id);
    if (ped && forn?.cpf_cnpj && cnpjLote && raiz(forn.cpf_cnpj) !== raiz(cnpjLote)) {
      const ok = confirm(`O pedido ${ped.nr_pedido ?? ped.numero ?? ""} é de "${forn.nome}" (${forn.cpf_cnpj}), mas as NFs foram emitidas por "${nomeLote}".\n\nVincule só se for compra por conta e ordem. O título a pagar fica com "${forn.nome}".\n\nVincular mesmo assim?`);
      if (!ok) return;
    }
    setSettings(p => ({
      ...p, pedido_compra_id: pedidoId,
      ano_safra_id: p.ano_safra_id || ped?.ano_safra_id || "",
      ciclo_id: p.ciclo_id || (p.ano_safra_id ? "" : ped?.ciclo_id ?? ""),
      data_vencimento_cp: p.data_vencimento_cp || ped?.data_vencimento || "",
    }));
  }

  async function processarEmLote() {
    if (!nfs.length || !fornecedorUnico) return;
    setSaving(true);
    const erros: string[] = [];
    let processadas = 0;
    const salvas: string[] = [];
    const tipoDest = settings.tipo_destino;
    const ped = settings.pedido_compra_id ? pedidos.find(x => x.id === settings.pedido_compra_id) : undefined;

    for (const nfRef of nfs) {
      try {
        const { data: nf } = await supabase.from("nf_entradas").select("*").eq("id", nfRef.id).single();
        if (!nf) { erros.push(`NF ${nfRef.numero}: não encontrada`); continue; }
        const nfTyped = nf as NfEntrada;
        if (nfTyped.status !== "pendente") { erros.push(`NF ${nfRef.numero}: já está ${nfTyped.status}`); continue; }
        // Retorno de armazém ou de máquina não é compra: vai para Documentos Fiscais → Retornos
        const cfopDig = dig(nfTyped.cfop);
        if (CFOPS_RETORNO_ARMAZENAGEM.has(cfopDig) || CFOPS_RETORNO_DE_REMESSA.has(cfopDig)) { erros.push(`NF ${nfRef.numero}: é retorno (CFOP ${nfTyped.cfop}) — processe em Documentos Fiscais → Retornos`); continue; }
        // CFOP genérico 5949/6949: só o usuário sabe se é compra a pagar — no lote não dá para perguntar
        if (CFOPS_CONFIRMAR.has(cfopDig)) { erros.push(`NF ${nfRef.numero}: CFOP ${nfTyped.cfop} ("outras entradas") — processe individualmente para confirmar se é compra a pagar`); continue; }
        // Ano Safra é obrigatório: vale o do lote ou o que a NF já tem
        if (!settings.ano_safra_id && !nfTyped.ano_safra_id) { erros.push(`NF ${nfRef.numero}: sem Ano Safra — escolha um no lote ou indique na NF`); continue; }

        const ccId  = settings.centro_custo_id || nfTyped.centro_custo_id;
        const ogId  = settings.operacao_gerencial_id || nfTyped.operacao_gerencial_id;
        const cicId = settings.ciclo_id || nfTyped.ciclo_id;
        // OG habilitada para Notas Fiscais mas NÃO para Contas a Pagar/Receber: a NF entra (estoque/custo) sem gerar CP
        const semCpPelaOg = ogDaLista(ops, ogId)?.permite_cp_cr === false;

        // 1. Persistir campos de cabeçalho na NF
        const upd: Partial<NfEntrada> = {};
        if (settings.data_vencimento_cp)    upd.data_vencimento_cp    = settings.data_vencimento_cp;
        if (settings.pedido_compra_id)       upd.pedido_compra_id      = settings.pedido_compra_id;
        if (ped?.fornecedor_id)              upd.pessoa_id             = ped.fornecedor_id;   // fornecedor do título = o do pedido
        if (settings.centro_custo_id)        upd.centro_custo_id       = settings.centro_custo_id;
        if (settings.operacao_gerencial_id)  upd.operacao_gerencial_id = settings.operacao_gerencial_id;
        if (settings.ano_safra_id)           upd.ano_safra_id          = settings.ano_safra_id;
        if (settings.ciclo_id)               upd.ciclo_id              = settings.ciclo_id;
        if (tipoDest === "direto") {
          upd.tipo_entrada = "custo_direto";
        } else if (tipoDest === "estoque") {
          if (settings.deposito_destino_id) (upd as Record<string, unknown>).deposito_destino_id = settings.deposito_destino_id;
          upd.tipo_entrada = settings.tipo_estoque;
        } else {
          if (settings.deposito_destino_id) (upd as Record<string, unknown>).deposito_destino_id = settings.deposito_destino_id;
        }
        if (Object.keys(upd).length) await atualizarNfEntrada(nfTyped.id, upd);

        // 2. Apropriação direta processa agora; estoque fica pendente para associar os itens ao catálogo
        // "— não alterar —" com NF ainda sem tipo (a maioria das que chegam pelo SIEG): não adivinha — antes virava
        // Apropriação Direta sem ninguém ter escolhido
        const tipoEfetivo = tipoDest === "direto" ? "custo_direto"
          : tipoDest === "estoque" ? settings.tipo_estoque
          : nfTyped.tipo_entrada;
        if (!tipoEfetivo) { salvas.push(`NF ${nfRef.numero}: sem tipo de entrada — escolha Estoque ou Apropriação Direta no lote`); continue; }

        // Peças e combustível pedem dados por item (máquina, bomba): ficam para o processamento individual
        if (tipoEfetivo !== "custo_direto" && tipoEfetivo !== "insumos") {
          const rotulo: Record<string, string> = { combustivel: "combustível", pecas: "peças / manutenção", vef: "entrega de compra futura (VEF)", remessa: "entrega de compra futura (VEF)" };
          salvas.push(`NF ${nfRef.numero}: ${rotulo[tipoEfetivo] ?? tipoEfetivo} — processe individualmente`); continue;
        }
        // Operação gerencial é obrigatória (como no individual); centro de custo só na apropriação direta
        if (!ogId) { erros.push(`NF ${nfRef.numero}: sem Operação Gerencial — escolha no lote ou na NF`); continue; }
        if (tipoEfetivo === "custo_direto" && !ccId) { erros.push(`NF ${nfRef.numero}: sem Centro de Custo — escolha no lote ou na NF`); continue; }

        const itensNf = await listarNfEntradaItens(nfTyped.id);
        let itensProc: NfEntradaItem[];
        if (tipoEfetivo === "custo_direto") {
          itensProc = itensNf.map(it => ({ ...it, tipo_apropiacao: "direto" as NfEntradaItem["tipo_apropiacao"], centro_custo_id: ccId }));
        } else {
          // Insumos: associa pelo histórico do fornecedor o que ainda não tem insumo; processa só se todos os itens
          // ficaram associados ao catálogo e passam nas travas do individual
          const associados = await associarPeloHistorico(itensNf, nfTyped.emitente_cnpj, fazendaIds.length ? fazendaIds : [batchFazendaId]);
          const motivo = await motivoNaoProntaEstoque(associados, settings.pedido_compra_id || nfTyped.pedido_compra_id, nfTyped.observacao);
          if (motivo) { salvas.push(`NF ${nfRef.numero}: ${motivo}`); continue; }
          // Estoque nunca leva centro de custo na entrada (custo é apropriado no consumo); depósito do item, do lote ou da NF
          const dep = settings.deposito_destino_id || (nfTyped as unknown as { deposito_destino_id?: string }).deposito_destino_id || undefined;
          itensProc = associados.map(it => ({ ...it, tipo_apropiacao: (it.tipo_apropiacao === "direto" ? "direto" : "estoque") as NfEntradaItem["tipo_apropiacao"],
            centro_custo_id: it.tipo_apropiacao === "direto" ? it.centro_custo_id : undefined, maquina_id: undefined, deposito_id: it.deposito_id || dep }));
          // Grava nos itens a associação, a conversão, o depósito e a apropriação (o individual recria os itens; aqui atualiza)
          for (const it of itensProc) {
            const { error: eIt } = await supabase.from("nf_entrada_itens").update({
              insumo_id: it.insumo_id ?? null, unidade: it.unidade ?? null, unidade_nf: it.unidade_nf ?? null, qtd_nf: it.qtd_nf ?? null,
              quantidade: it.quantidade, fator_conversao: it.fator_conversao ?? 1, descricao_produto: it.descricao_produto ?? null,
              deposito_id: it.deposito_id ?? null, tipo_apropiacao: it.tipo_apropiacao, centro_custo_id: it.centro_custo_id ?? null, maquina_id: null,
            }).eq("id", it.id);
            if (eIt) throw eIt;
          }
          await limparMovimentacoesEFinanceiroDaNf(nfTyped.id);
        }
        const movEmp = await verificarMovimentoEmpresaNf(nfTyped.id);
        if (movEmp) {
          const ok = window.confirm(`NF ${nfTyped.numero}: destinada à empresa ${movEmp.empresa} (CNPJ ${movEmp.cnpj}). O financeiro vai para o CP da EMPRESA e os CPs do produtor desta NF serão cancelados.\n\nAutoriza? Fica registrado no log.`);
          if (!ok) { erros.push(`NF ${nfTyped.numero}: não processada (movimentação para empresa não autorizada)`); continue; }
          registrarAutorizacaoMovimentoEmpresa(batchFazendaId, nfTyped.id, String(nfTyped.numero ?? ""), movEmp.empresa, movEmp.cps_produtor.map(c => c.id));
        }
        // Parcelas: vencimento único do lote, se informado; senão as duplicatas do XML (como no individual)
        const dups = (nfTyped.duplicatas_xml ?? []).filter(d => d.data_vencimento && Number(d.valor) > 0);
        const parcelas = !settings.data_vencimento_cp && dups.length > 1
          ? dups.map(d => ({ data: String(d.data_vencimento).slice(0, 10), valor: Number(d.valor) })) : undefined;
        await processarNfEntrada(
          nfTyped.id,
          nfTyped.fazenda_id ?? batchFazendaId,
          itensProc,
          nfTyped.valor_total,
          nfTyped.emitente_nome,
          // Bug real 02/10/2026: ordem invertida (data_emissao primeiro) descartava a
          // "Data de Entrada" digitada no cabeçalho — ver mesmo fix em ModalNf.tsx.
          nfTyped.data_entrada ?? nfTyped.data_emissao ?? hojeLocal(),
          nfTyped.emitente_cnpj ?? undefined,
          {
            nfeNumero:             nfTyped.numero,
            dataVencimentoCp:      settings.data_vencimento_cp || nfTyped.data_vencimento_cp || dups[0]?.data_vencimento || undefined,
            formaPagamento:        nfTyped.forma_pagamento || undefined,
            tipoEntrada:           tipoEfetivo,
            anoSafraId:            settings.ano_safra_id || nfTyped.ano_safra_id || undefined,
            cicloId:               cicId || undefined,
            operacaoGerencialId:   ogId,
            centroCustoId:         ccId || undefined,
            pedidoCompraId:        settings.pedido_compra_id || nfTyped.pedido_compra_id || undefined,
            produtorId:            nfTyped.produtor_id || undefined,
            parcelas,
            ...(semCpPelaOg ? { gerarCp: false } : {}),
          },
        );
        processadas++;
      } catch (e) {
        erros.push(`NF ${nfRef.numero}: ${e instanceof Error ? e.message : "Erro"}`);
      }
    }
    setSaving(false);
    onSaved();
    onClose();
    const partes = [
      `${processadas} NF(s) processada(s).`,
      salvas.length ? `\nCampos gravados, NF continua pendente (abra para ajustar):\n${salvas.join("\n")}` : "",
      erros.length ? `\nNão processadas:\n${erros.join("\n")}` : "",
    ].filter(Boolean);
    alert(partes.join("\n"));
  }

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}>
      <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 620, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div data-arato-dialog-body="true" style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>
          ⚡ Processar em Lote
        </div>
        <div data-arato-dialog-body="true" style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14 }}>
          {nfs.length} NF(s) pendente(s) selecionada(s){totalLote ? ` · ${totalLote.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}. Campos em branco mantêm o valor de cada NF.
        </div>
        {fornecedorUnico ? (
          <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 18 }}>
            Fornecedor: <strong>{nomeLote || "—"}</strong>{cnpjLote ? <span style={{ color: "var(--text-3)" }}> · {nfs[0]?.emitente_cnpj}</span> : null}
          </div>
        ) : (
          <div style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#B91C1C", marginBottom: 18 }}>
            O processamento em lote é de um fornecedor só, e a seleção tem {fornecedores.length}: {fornecedores.slice(0, 4).join(", ")}{fornecedores.length > 4 ? "…" : ""}. Selecione as NFs de um fornecedor por vez.
          </div>
        )}

        {/* ── Tipo de Destino ── */}
        <div data-arato-dialog-body="true" style={{ marginBottom: 18 }}>
          <label data-arato-label="true" style={lbl}>Tipo de Processamento</label>
          <div data-arato-dialog-body="true" style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--border-ui)" }}>
            {([
              { v: "" as const,        label: "— não alterar —",     desc: "Mantém o tipo de cada NF" },
              { v: "estoque" as const,  label: "Estoque / Insumos",   desc: "Salva depósito; itens mapeados individualmente" },
              { v: "direto" as const,   label: "Apropriação Direta",  desc: "Processa sem entrada em estoque" },
            ] as const).map(opt => (
              <button data-arato-button="toggle" key={opt.v} onClick={() => setSettings(p => ({ ...p, tipo_destino: opt.v }))}
                title={opt.desc}
                style={{
                  flex: 1, padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: settings.tipo_destino === opt.v
                    ? (opt.v === "direto" ? "#166534" : opt.v === "estoque" ? "#1A4870" : "#374151")
                    : "var(--bg-input)",
                  color: settings.tipo_destino === opt.v ? "#fff" : "var(--text-2)",
                  borderRight: opt.v !== "direto" ? "0.5px solid var(--border-ui)" : "none",
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-tipo de estoque — só quando "estoque" está selecionado */}
        {settings.tipo_destino === "estoque" && (
          <div style={{ marginBottom: 14 }}>
            <label data-arato-label="true" style={lbl}>Subcategoria do Estoque</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([ ["insumos", "Insumos Agrícolas"], ["pecas", "Peças / Manutenção"], ["combustivel", "Combustível"] ] as const).map(([v, label]) => (
                <button data-arato-button="toggle" key={v} onClick={() => setSettings(p => ({ ...p, tipo_estoque: v }))}
                  style={{ flex: 1, padding: "7px 8px", border: `0.5px solid ${settings.tipo_estoque === v ? "#1A4870" : "var(--border-ui)"}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, background: settings.tipo_estoque === v ? "#D5E8F5" : "var(--bg-input)", color: settings.tipo_estoque === v ? "#1A4870" : "var(--text-2)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div data-arato-dialog-body="true">
            <label data-arato-label="true" style={lbl}>Vencimento da CP</label>
            <InputData type="date" value={settings.data_vencimento_cp} onChange={e => setSettings(p => ({ ...p, data_vencimento_cp: e.target.value }))} style={inp} />
          </div>
          <div data-arato-dialog-body="true">
            <label data-arato-label="true" style={lbl}>Ano Safra (obrigatório — vale para as NFs que ainda não têm)</label>
            <SelectField value={settings.ano_safra_id} onChange={e => setSettings(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))} style={inp}>
              <option value="">— manter individual —</option>
              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
            </SelectField>
          </div>

          {settings.ano_safra_id && (
            <div>
              <label data-arato-label="true" style={lbl}>Ciclo</label>
              <SelectField value={settings.ciclo_id} onChange={e => setSettings(p => ({ ...p, ciclo_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </SelectField>
            </div>
          )}

          <div>
            <label data-arato-label="true" style={lbl}>OG — Operação Gerencial</label>
            <SelectBusca value={settings.operacao_gerencial_id} onChange={v => setSettings(p => ({ ...p, operacao_gerencial_id: v }))} style={inp}
              placeholder="— manter individual —"
              options={ops.map(o => ({ value: o.id, label: `${o.classificacao ? `${o.classificacao} — ` : ""}${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))} />
          </div>
          <div>
            <label data-arato-label="true" style={lbl}>Centro de Custo</label>
            <SelectBusca value={settings.centro_custo_id} onChange={v => setSettings(p => ({ ...p, centro_custo_id: v }))} style={inp}
              placeholder="— manter individual —"
              options={centros.filter(c => !centros.some(x => x.parent_id === c.id)).map(c => ({ value: c.id, label: `${c.codigo ? `${c.codigo} — ` : ""}${c.nome}` }))} />
          </div>

          {(settings.tipo_destino === "estoque" || settings.tipo_destino === "") && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <label data-arato-label="true" style={{ ...lbl, marginBottom: 0 }}>Depósito de Entrada</label>
                <div style={{ display: "flex", gap: 3, background: "var(--bg-input)", borderRadius: 6, padding: 2, border: "0.5px solid var(--border-ui)" }}>
                  {(["proprio", "terceiro"] as const).map(t => (
                    <button data-arato-button="toggle" key={t} onClick={() => setDepFiltro(t)}
                      style={{ fontSize: 9, fontWeight: 600, padding: "1px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                        background: depFiltro === t ? "#111111" : "transparent",
                        color: depFiltro === t ? "#fff" : "var(--text-3)" }}>
                      {t === "proprio" ? "Próprio" : "Terceiro"}
                    </button>
                  ))}
                </div>
              </div>
              <SelectField value={settings.deposito_destino_id} onChange={e => setSettings(p => ({ ...p, deposito_destino_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {depositos
                  .filter(d => depFiltro === "terceiro"
                    ? ["terceiro", "armazem_terceiro"].includes(d.tipo)
                    : !["terceiro", "armazem_terceiro"].includes(d.tipo))
                  .map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </SelectField>
            </div>
          )}

          <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
            <label data-arato-label="true" style={lbl}>Vincular a Pedido de Compra</label>
            <SelectBusca value={settings.pedido_compra_id} onChange={escolherPedido}
              placeholder="— sem pedido —" style={inp}
              options={pedidos
                .map(p => {
                  const pf = pessoas.find(x => x.id === p.fornecedor_id);
                  const doFornecedor = !!cnpjLote && !!pf?.cpf_cnpj && raiz(pf.cpf_cnpj) === raiz(cnpjLote);
                  const nr = p.nr_pedido ?? (p.numero != null ? String(p.numero) : p.id.substring(0, 8));
                  const nrForn = p.nr_pedido_fornecedor && p.nr_pedido_fornecedor !== nr ? ` · ped. fornecedor ${p.nr_pedido_fornecedor}` : "";
                  return { doFornecedor, opt: { value: p.id,
                    label: `${doFornecedor ? "★ " : ""}${pf?.nome ?? p.contato_fornecedor ?? "fornecedor não informado"} — PC ${nr}${nrForn} (${STATUS_PEDIDO[p.status] ?? p.status})`,
                    group: doFornecedor ? "Pedidos deste fornecedor" : "Outros fornecedores (conta e ordem)" } };
                })
                .sort((a, b) => Number(b.doFornecedor) - Number(a.doFornecedor))
                .map(x => x.opt)}
            />
          </div>
        </div>

        {/* ── Avisos contextuais ── */}
        {settings.tipo_destino === "direto" && (
          <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
            ✓ <strong>Apropriação Direta</strong>: as NFs são processadas agora, sem entrada em estoque, e geram o Contas a Pagar (vencimento do lote ou as parcelas do XML de cada NF). Cada NF precisa de Operação Gerencial, Centro de Custo e Ano Safra — os do lote ou os que ela já tem; a que faltar fica pendente e aparece no resumo.
          </div>
        )}
        {settings.tipo_destino === "estoque" && (
          <div style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1D4ED8", marginBottom: 16 }}>
            ℹ <strong>Estoque / Insumos</strong>: os campos acima são gravados em todas as NFs. As de <strong>Insumos Agrícolas</strong> com todos os itens já associados ao catálogo (unidade do cadastro, linha e saldo do pedido conferidos) são processadas agora: entram no estoque e geram o Contas a Pagar. As demais — e as de Peças e Combustível — continuam <em>Pendentes</em>, e o resumo diz o que falta em cada uma. Cada NF precisa de Operação Gerencial e Ano Safra.
          </div>
        )}
        {settings.tipo_destino === "" && (
          <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>
            Cada NF segue o tipo que já tem: Apropriação Direta e Insumos com os itens já associados são processadas; as outras recebem os campos acima e continuam pendentes.
          </div>
        )}

        <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button data-arato-button="secondary" style={btnR} onClick={onClose} disabled={saving}>Cancelar</button>
          <button data-arato-button="primary"
            onClick={processarEmLote}
            disabled={saving || !fornecedorUnico}
            style={{ ...btnV, opacity: (saving || !fornecedorUnico) ? 0.5 : 1, cursor: saving || !fornecedorUnico ? "default" : "pointer" }}
          >
            {saving ? "Processando…" : "Aplicar e Processar"}
          </button>
        </div>
      </div>
    </div>
  );
}
