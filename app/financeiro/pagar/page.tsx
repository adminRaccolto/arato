"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Contas a Pagar — unificado (Produtor + Empresa). Promovida de piloto pra
// tela real em 01/10/2026, a pedido do dono: "reunificar os lançamentos de
// PF e PJ no financeiro e tratar somente F.C. separadamente".
//
// Lista vem de rel_lancamentos (tipo='pagar'), trazendo Produtor e Empresa
// juntos (coluna Origem). Ações (Baixar/Reprogramar/Reabrir/Novo) chamam as
// MESMAS rotinas que já existiam nas duas telas separadas — nada de lógica
// financeira nova:
//   Produtor: baixarLancamento()/reabrirLancamento()/atualizarLancamento()/
//             criarLancamento() (lib/db.ts)
//   Empresa:  fetch /api/empresa-lancamentos/baixar (acao baixar/reabrir/
//             reprogramar) + criarEmpresaLancamento()
//
// A versão antiga (só produtor) fica guardada em page.legado.tsx — NÃO é
// rota, só referência. app/empresas/pagar/page.tsx (a tela separada de
// Empresa) também fica, intocada, mas sem link no menu — essa tela aqui
// cobre o mesmo dado agora.
//
// Validado antes como piloto: relatório (filtra, gera documento) nunca fica
// dentro da tela de lançamento — isso tem ambiente próprio em Financeiro →
// Relatórios. Esta tela é só grid de trabalho: carrega direto (período
// padrão hoje até +3 meses), filtros como barra sempre visível.
//
// Baixar em Lote (release -s) e Criar Borderô (release -u, 01/10/2026) usam
// a mesma seleção por checkbox. Borderô agora aceita Produtor e Empresa no
// mesmo lote — pagamento_lote_itens ganhou origem_tabela (Seção 317) porque
// antes só referenciava lancamentos (produtor). Criar Borderô não pede
// data/conta na hora (igual ao mecanismo antigo): só agrupa os títulos
// (status fica igual, só ganham lote_id); "Confirmar Pagamento" depois é que
// define data+conta e baixa todos de uma vez via /api/financeiro/bordero-acao.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import {
  baixarLancamento, reabrirLancamento, atualizarLancamento, atualizarEmpresaLancamento, listarContas, listarContasPorEmpresa,
  criarLancamento, criarEmpresaLancamento, listarPessoasDaConta, listarEmpresasDaConta, listarCentrosCustoGeralDaConta,
  criarPagamentoLote, confirmarPagamentoBordero, cancelarBordero, listarBorderosPendentes,
  listarOperacoesGerenciaisAtivasDaConta, criarParcelamento, buscarLancamentoDuplicado,
  excluirLancamento, excluirEmpresaLancamento,
} from "../../../lib/db";
import type { ContaBancaria, Pessoa, Empresa, CentroCusto, PagamentoLote, Lancamento, OperacaoGerencial } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import AnexoDocumentos from "../../../components/AnexoDocumentos";
import SelectBusca from "../../../components/SelectBusca";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";

type RelLancamento = {
  id: string;
  origem_tabela: string;
  fazenda_id: string | null;
  empresa_id: string | null;
  numero: number | null;
  nfe_numero: string | null;
  descricao: string | null;
  categoria: string | null;
  valor: number | null;
  valor_pago: number | null;
  valor_multa: number | null;
  valor_juros: number | null;
  valor_desconto: number | null;
  moeda: string | null;
  status_normalizado: string | null;
  data_vencimento: string | null;
  data_lancamento: string | null;
  lote_id: string | null;
  data_baixa: string | null;
  data_prorrogacao: string | null;
  pessoa_nome: string | null;
  empresa_nome: string | null;
  produtor_nome: string | null;
  centro_custo_nome: string | null;
  ano_safra_descricao: string | null;
  ciclo_descricao: string | null;
  operacao_gerencial_nome: string | null;
  origem_lancamento: string | null;
  conta_bancaria: string | null;
  conta_bancaria_nome: string | null;
  observacao: string | null;
};

const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "em_aberto", label: "Em Aberto", bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "vencido",   label: "Vencido",   bg: "#FCEBEB", color: "#791F1F" },
  { v: "parcial",   label: "Parcial",   bg: "#FBF3E0", color: "#7A5200" },
  { v: "baixado",   label: "Baixado",   bg: "#DCFCE7", color: "#166534" },
  { v: "cancelado", label: "Cancelado", bg: "#F4F6FA", color: "#555" },
];
const ORIGEM_OPCOES = [
  { v: "lancamentos",         label: "Produtor" },
  { v: "empresa_lancamentos", label: "Empresa" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const numBR = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const maisMeses = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
// Dias até o vencimento (negativo = dias em atraso) — só faz sentido pra quem
// ainda não foi baixado/cancelado.
const diasVencimento = (venc: string | null, status: string | null): number | null => {
  if (!venc || status === "baixado" || status === "cancelado") return null;
  const ms = new Date(venc + "T00:00:00").getTime() - new Date(hojeISO() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
};
const ORIGEM_LANC_LABEL: Record<string, string> = {
  nf_entrada: "NF de Entrada", nf_saida: "NF de Saída", pedido_compra: "Pedido de Compra",
  arrendamento: "Arrendamento", tesouraria: "Tesouraria", plantio: "Plantio",
  contrato_financeiro: "Contrato Financeiro", consorcio: "Consórcio", manual: "Manual",
  compra_terra: "Compra de Terra", nf_servico: "NF de Serviço", seguro: "Seguro",
  folha: "Folha de Pagamento", nf_entrada_empresa: "NF de Entrada",
};

const FORMAS_PAGAMENTO = ["PIX", "TED", "DOC", "Boleto", "Dinheiro", "Cheque", "Cartão de Crédito", "Débito Automático", "Outros"];
const CATS_CP = [
  "Insumos — Sementes", "Insumos — Fertilizantes", "Insumos — Defensivos",
  "Insumos — Inoculantes", "Combustível — Compra para Estoque", "Combustível — Consumo Direto",
  "Serviços Agrícolas", "Fretes e Transportes", "Arrendamento de Terra",
  "Manutenção de Máquinas", "Impostos", "Juros e IOF", "Pagamento de Custeio",
  "Pagamento de Financiamento", "Pagamento de Empréstimo", "Prêmio de Seguro",
  "Consórcio — A Contemplar", "Consórcio — Contemplado", "Despesas Administrativas", "Outros",
];
// Deriva a categoria legada a partir do código da Operação Gerencial — mesma
// lógica da tela antiga, pra manter o campo "categoria" (usado em telas
// legadas/relatórios) coerente com a OG escolhida.
function derivarCategoriaDespesa(classificacao: string): string {
  const c = classificacao ?? "";
  if (c.startsWith("2.01.01.01"))     return "Insumos";
  if (c.startsWith("2.01.01.02.099")) return "Combustível — Consumo Direto";
  if (c.startsWith("2.01.01.02"))     return "Combustível — Compra para Estoque";
  if (c.startsWith("2.01.01.03.002")) return "Manutenção de Veículos";
  if (c.startsWith("2.01.01.03"))     return "Manutenção de Máquinas";
  if (c.startsWith("2.01.01.04.001")) return "Arrendamento de Terra";
  if (c.startsWith("2.01.01.04"))     return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.05"))     return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.07"))     return "Fretes e Transportes";
  if (c.startsWith("2.01.01.08"))     return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.10"))     return "Mão de Obra";
  if (c.startsWith("2.01.02.01.04"))  return "Impostos";
  if (c.startsWith("2.01.02"))        return "Despesas Administrativas";
  if (c.startsWith("2.02.01.02"))     return "Pagamento de Custeio";
  if (c.startsWith("2.02.01.01"))     return "Tarifas Bancárias";
  if (c.startsWith("2.02.01.03"))     return "Juros e IOF";
  if (c.startsWith("2.03.03"))        return "Prêmio de Seguro";
  if (c.startsWith("2.03."))          return "Patrimônio / Imobilizado";
  if (c.startsWith("1.01.01.05"))     return "Impostos";
  return "Outros";
}

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lblMini: React.CSSProperties = { fontSize: 10, color: "#888", fontWeight: 600, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const chip = (ativo: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: ativo ? "1.5px solid #2A2A2A" : "0.5px solid #DDE2EE", background: ativo ? "#2A2A2A" : "#fff", color: ativo ? "#fff" : "#555",
});

export default function ContasAPagarPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelLancamento[] | null>(null);

  // Filtros — barra sempre visível acima do grid, não popup. Default igual à
  // tela real: período hoje → +3 meses (traz vencidos acumulados também,
  // porque "vencido" não some do status mesmo com data < hoje).
  const [fOrigem,  setFOrigem]  = useState<Set<string>>(new Set());
  const [fStatus,  setFStatus]  = useState<Set<string>>(new Set());
  const [fBusca,   setFBusca]   = useState("");
  const [fDataDe,  setFDataDe]  = useState("");
  const [fDataAte, setFDataAte] = useState(() => maisMeses(3));

  // Ordenação — padrão por data de lançamento (não vencimento), mais recente
  // primeiro; clicar no cabeçalho da coluna alterna o campo e a direção, sem
  // precisar de nova consulta (é só reordenar o que já está carregado).
  const [ordenarPor, setOrdenarPor] = useState<"lancamento" | "vencimento">("lancamento");
  const [ordemAsc,   setOrdemAsc]   = useState(false);
  function clicarOrdenar(campo: "lancamento" | "vencimento") {
    if (ordenarPor === campo) setOrdemAsc(a => !a);
    else { setOrdenarPor(campo); setOrdemAsc(campo === "vencimento"); }
  }

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setFn(next);
  };

  // ── Cadastros de apoio pro formulário de Novo Lançamento ──────
  const [pessoas,       setPessoas]       = useState<Pessoa[]>([]);
  const [empresas,      setEmpresas]      = useState<Empresa[]>([]);
  const [centrosCusto,  setCentrosCusto]  = useState<CentroCusto[]>([]);
  useEffect(() => {
    if (!fazendaId) return;
    listarPessoasDaConta(fazendaId).then(setPessoas).catch(() => {});
    listarEmpresasDaConta(fazendaIds?.length ? fazendaIds : [fazendaId]).then(setEmpresas).catch(() => {});
    listarCentrosCustoGeralDaConta(fazendaId).then(setCentrosCusto).catch(() => {});
  }, [fazendaId, fazendaIds?.join(",")]);

  const carregar = useCallback(async () => {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    setCarregando(true);
    setErro("");
    try {
      let q = supabase.from("rel_lancamentos").select("*").eq("tipo", "pagar");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fOrigem.size > 0) q = q.in("origem_tabela", Array.from(fOrigem));
      if (fStatus.size > 0) q = q.in("status_normalizado", Array.from(fStatus));
      if (fDataDe) q = q.gte("data_vencimento", fDataDe);
      if (fDataAte) q = q.lte("data_vencimento", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`descricao.ilike.%${t}%,pessoa_nome.ilike.%${t}%,empresa_nome.ilike.%${t}%`);
      }
      q = q.order("data_lancamento", { ascending: false }).limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelLancamento[]);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_lancamentos — a migration da Seção 312 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  // Período/busca/origem/status entram nos deps pra "Atualizar" e Enter
  // sempre lerem o valor atual dos campos (sem isso, carregar() ficava com
  // uma closure velha — digitar na busca ou mudar a data não tinha efeito
  // nenhum ao clicar Atualizar). O efeito abaixo NÃO depende de carregar —
  // só de fazenda/conta — pra não disparar uma consulta nova a cada tecla.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, fazendaIds?.join(","), contaId, fOrigem, fStatus, fDataDe, fDataAte, fBusca]);

  // Carrega automaticamente ao abrir a tela (período padrão) — nunca espera
  // o usuário escolher filtro primeiro. Refiltrar é sempre sobre o que já
  // está carregado; só período/busca disparam nova consulta (botão Atualizar).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [fazendaId, fazendaIds?.join(","), contaId]);

  // ── Borderôs pendentes (ainda não confirmados/baixados) ───────
  const [borderosPendentes, setBorderosPendentes] = useState<PagamentoLote[]>([]);
  const carregarBorderos = useCallback(async () => {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length) return;
    try {
      setBorderosPendentes(await listarBorderosPendentes(fids, "pagar"));
    } catch { /* silencioso — painel só não aparece */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, fazendaIds?.join(",")]);
  useEffect(() => { carregarBorderos(); }, [carregarBorderos]);

  // Filtro client-side de Origem/Status (instantâneo, sem nova consulta) —
  // período e busca exigem nova consulta porque mudam o WHERE no banco.
  // Ordenação também é client-side — reordena o que já está carregado.
  const linhas = (resultado ?? []).filter(l => {
    if (fOrigem.size > 0 && !fOrigem.has(l.origem_tabela)) return false;
    if (fStatus.size > 0 && !fStatus.has(l.status_normalizado ?? "")) return false;
    return true;
  }).sort((a, b) => {
    const campo = ordenarPor === "lancamento" ? "data_lancamento" : "data_vencimento";
    const da = a[campo] ?? "";
    const db = b[campo] ?? "";
    return ordemAsc ? da.localeCompare(db) : db.localeCompare(da);
  });

  // Borderô pendente entra na ordem normal do grid (não fica mais fixo no
  // topo) — a "data" dele pra ordenar é a mesma do título mais relevante que
  // tem dentro (o mais recente lançamento/vencimento entre os itens
  // agrupados, usando os próprios dados já carregados em `linhas`).
  type LinhaOuBordero = { kind: "lanc"; l: RelLancamento } | { kind: "bordero"; b: PagamentoLote; data: string };
  const linhasComBordero: LinhaOuBordero[] = [
    ...linhas.map((l): LinhaOuBordero => ({ kind: "lanc", l })),
    ...borderosPendentes.map((b): LinhaOuBordero => {
      const campo = ordenarPor === "lancamento" ? "data_lancamento" : "data_vencimento";
      const itensDoLote = linhas.filter(l => l.lote_id === b.id);
      const datas = itensDoLote.map(l => l[campo]).filter((d): d is string => !!d);
      const data = datas.length ? datas.sort().slice(-1)[0] : (b.created_at ?? "");
      return { kind: "bordero", b, data };
    }),
  ].sort((x, y) => {
    const dx = x.kind === "lanc" ? (x.l[ordenarPor === "lancamento" ? "data_lancamento" : "data_vencimento"] ?? "") : x.data;
    const dy = y.kind === "lanc" ? (y.l[ordenarPor === "lancamento" ? "data_lancamento" : "data_vencimento"] ?? "") : y.data;
    return ordemAsc ? dx.localeCompare(dy) : dy.localeCompare(dx);
  });

  // ── Baixar (com encargos) ──────────────────────────────────
  const [modalBaixa,   setModalBaixa]   = useState<RelLancamento | null>(null);
  const [contasOpcoes, setContasOpcoes] = useState<ContaBancaria[]>([]);
  const [bValor,  setBValor]  = useState("");
  const [bData,   setBData]   = useState("");
  const [bConta,  setBConta]  = useState("");
  const [bMulta,  setBMulta]  = useState("0,00");
  const [bJuros,  setBJuros]  = useState("0,00");
  const [bDesc,   setBDesc]   = useState("0,00");
  const [salvandoAcao, setSalvandoAcao] = useState(false);
  const [erroAcao,     setErroAcao]     = useState("");

  const saldoBase = (l: RelLancamento) => Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0));
  const recalcValor = (multa: string, juros: string, desc: string) => {
    if (!modalBaixa) return;
    setBValor(Math.max(0, saldoBase(modalBaixa) + numBR(multa) + numBR(juros) - numBR(desc)).toFixed(2).replace(".", ","));
  };

  async function abrirBaixa(l: RelLancamento) {
    setErroAcao("");
    setModalBaixa(l);
    setBValor(saldoBase(l).toFixed(2).replace(".", ","));
    setBData(hojeISO());
    setBConta(""); setBMulta("0,00"); setBJuros("0,00"); setBDesc("0,00");
    try {
      const contas = l.origem_tabela === "empresa_lancamentos" && l.empresa_id
        ? await listarContasPorEmpresa(l.empresa_id)
        : l.fazenda_id ? await listarContas(l.fazenda_id) : [];
      setContasOpcoes(contas);
    } catch { setContasOpcoes([]); }
  }

  async function confirmarBaixa() {
    if (!modalBaixa || !bConta || !bValor) { setErroAcao("Preencha valor e conta bancária."); return; }
    setSalvandoAcao(true);
    setErroAcao("");
    try {
      if (modalBaixa.origem_tabela === "lancamentos") {
        await baixarLancamento(modalBaixa.id, numBR(bValor), bData, bConta, {
          multa_valor: numBR(bMulta) || undefined, juros_valor: numBR(bJuros) || undefined, desconto_valor: numBR(bDesc) || undefined,
        });
      } else {
        const res = await fetch("/api/empresa-lancamentos/baixar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "baixar", lancamento_id: modalBaixa.id,
            valor_pago_agora: numBR(bValor), data_baixa: bData, conta_bancaria: bConta,
            multa_valor: numBR(bMulta), juros_valor: numBR(bJuros), desconto_valor: numBR(bDesc),
          }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Erro ao baixar");
      }
      setModalBaixa(null);
      await carregar();
    } catch (e: unknown) {
      setErroAcao(e instanceof Error ? e.message : "Erro ao baixar lançamento");
    } finally {
      setSalvandoAcao(false);
    }
  }

  // ── Reprogramar ──────────────────────────────────────────────
  const [modalReprog, setModalReprog] = useState<RelLancamento | null>(null);
  const [rData,  setRData]  = useState("");
  const [rValor, setRValor] = useState("");
  const [rObs,   setRObs]   = useState("");

  function abrirReprog(l: RelLancamento) {
    setErroAcao("");
    setModalReprog(l);
    setRData(""); setRValor(""); setRObs("");
  }

  async function confirmarReprog() {
    if (!modalReprog || !rData) { setErroAcao("Informe a nova data de vencimento."); return; }
    setSalvandoAcao(true);
    setErroAcao("");
    try {
      if (modalReprog.origem_tabela === "lancamentos") {
        const hoje = hojeISO();
        const dataOriginal = modalReprog.data_prorrogacao ?? modalReprog.data_vencimento ?? undefined;
        const novaObs = rObs.trim()
          ? `[Reprogramado para ${fmtData(rData)}] ${rObs.trim()}`
          : `[Reprogramado para ${fmtData(rData)}]`;
        await atualizarLancamento(modalReprog.id, {
          data_vencimento: rData,
          data_prorrogacao: dataOriginal,
          status: rData < hoje ? "vencido" : "em_aberto",
          valor: rValor ? numBR(rValor) : modalReprog.valor ?? undefined,
          observacao: novaObs,
        });
      } else {
        const res = await fetch("/api/empresa-lancamentos/baixar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "reprogramar", lancamento_id: modalReprog.id,
            nova_data: rData, novo_valor: rValor ? numBR(rValor) : undefined, observacao: rObs.trim() || undefined,
          }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Erro ao reprogramar");
      }
      setModalReprog(null);
      await carregar();
    } catch (e: unknown) {
      setErroAcao(e instanceof Error ? e.message : "Erro ao reprogramar");
    } finally {
      setSalvandoAcao(false);
    }
  }

  // ── Reabrir ──────────────────────────────────────────────────
  async function reabrir(l: RelLancamento) {
    if (!confirm(`Reabrir "${l.descricao}"? Volta pra em aberto/vencido.`)) return;
    try {
      if (l.origem_tabela === "lancamentos") {
        await reabrirLancamento(l.id);
      } else {
        const res = await fetch("/api/empresa-lancamentos/baixar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "reabrir", lancamento_id: l.id }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Erro ao reabrir");
      }
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao reabrir lançamento");
    }
  }

  // Só deixa excluir lançamento de origem manual — um lançamento gerado automaticamente
  // (NF de entrada/saída, pedido de compra, arrendamento, contrato financeiro, etc.) tem
  // contrapartida em outra tela (estoque, contrato, parcela) que ficaria órfã/dessincronizada
  // se o lançamento sumisse por aqui; a exclusão desses só pode ser feita na tela de origem.
  function podeExcluir(l: RelLancamento): boolean {
    if (l.origem_tabela !== "lancamentos") return true; // empresa_lancamentos não tem outra origem ainda
    return !l.origem_lancamento || l.origem_lancamento === "manual";
  }

  async function excluirLanc(l: RelLancamento) {
    if (!podeExcluir(l)) {
      setErro(`Este lançamento foi gerado automaticamente (${ORIGEM_LANC_LABEL[l.origem_lancamento ?? ""] ?? l.origem_lancamento}) — exclua pela tela de origem, não por aqui.`);
      return;
    }
    if (!confirm(`Excluir "${l.descricao}" definitivamente? Essa ação não pode ser desfeita.`)) return;
    try {
      if (l.origem_tabela === "lancamentos") {
        await excluirLancamento(l.id);
      } else {
        await excluirEmpresaLancamento(l.id);
      }
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir lançamento");
    }
  }

  // ── Novo Lançamento (criar) ───────────────────────────────────
  // Reconstruído 02/10/2026 fiel ao modal antigo (page.legado.tsx), a pedido
  // do dono: "a tela de Nova CP/CR deveria ser a mesma que tínhamos antes".
  // Fiel pro lado Produtor (tabela lancamentos, que sempre teve esses campos
  // todos): OG obrigatória com preview débito/crédito + regra de
  // classificação automática, cascata Produtor/Fazenda/Safra/Ciclo, Nº
  // Documento/Série/Tipo Doc LCDPR, Entidade Contábil, Forma de Pagamento +
  // Conta, moeda BRL/USD/barter, Condição de Pagamento (À Vista/Parcelado
  // com grade editável/Recorrência). Lado Empresa fica fiel ao que
  // app/empresas/pagar/page.tsx (também legado, nunca teve esses campos —
  // empresa_lancamentos não tem OG/safra/ciclo/parcelamento no schema):
  // Empresa, Descrição, Categoria, Competência, Valor, Vencimento,
  // Fornecedor, Centro de Custo (texto), Forma de Pagamento, Conta, Nº
  // Documento, Observação.
  // Deliberadamente fora desta reconstrução (subsistemas próprios, maiores
  // que o modal em si): Mão de Obra/Veículo vinculado, Cartão de Crédito,
  // upload de NF pro Storage + anexos múltiplos, conciliação OFX, alerta de
  // NF duplicada com vínculo manual — avisar o dono se algum fizer falta.
  const NOVO_VAZIO = {
    origem: "lancamentos" as "lancamentos" | "empresa_lancamentos",
    natureza: "real" as "real" | "previsao",
    moeda: "BRL" as "BRL" | "USD" | "barter",
    empresa_id: "", pessoa_id: "", descricao: "", categoria: CATS_CP[0],
    data_vencimento: "", valor: 0, cotacao_usd: 5.12,
    sacas: 0, cultura_barter: "soja", preco_saca_barter: 120,
    centro_custo_id: "", centro_custo_texto: "", observacao: "",
    condicao: "avista" as "avista" | "prazo" | "recorrencia",
    qtd_parcelas: 2, frequencia: 1,
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    numero_documento: "", serie: "",
    entidade_contabil: "" as "" | "pf" | "pj",
    operacao_gerencial_id: "",
    forma_pagamento: "PIX",
    conta_pagamento: "",
    competencia: "",
  };
  type ParcelaGrid = { data: string; valor: number };
  const [modalNovo, setModalNovo] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoTab,   setNovoTab]   = useState<"principal" | "adicionais" | "documentos">("principal");
  const [novoForm,  setNovoForm]  = useState(NOVO_VAZIO);
  const [erroNovo,  setErroNovo]  = useState("");
  const [cascadeNovo, setCascadeNovo] = useState<Partial<CascadeValues>>({});
  const [parcelasNovo, setParcelasNovo] = useState<ParcelaGrid[]>([]);
  const [salvarComoRegra, setSalvarComoRegra] = useState(false);
  const [opGerenciais, setOpGerenciais] = useState<OperacaoGerencial[]>([]);
  const [contasNovo, setContasNovo] = useState<ContaBancaria[]>([]);

  useEffect(() => {
    if (!contaId && !fazendaId) return;
    listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, fazendaId)
      .then(ops => setOpGerenciais(ops.filter(o => {
        const cls = o.classificacao ?? "";
        if (cls.startsWith("3.") || cls.startsWith("4.")) return false;
        if (o.gerar_financeiro === false) return false;
        return true;
      })))
      .catch(() => {});
  }, [contaId, fazendaId]);

  // Conta de pagamento — por fazenda (produtor) ou por empresa, conforme a Origem
  useEffect(() => {
    if (!modalNovo) return;
    (async () => {
      try {
        const contas = novoForm.origem === "empresa_lancamentos" && novoForm.empresa_id
          ? await listarContasPorEmpresa(novoForm.empresa_id)
          : fazendaId ? await listarContas(fazendaId) : [];
        setContasNovo(contas);
      } catch { setContasNovo([]); }
    })();
  }, [modalNovo, novoForm.origem, novoForm.empresa_id, fazendaId]);

  function gerarParcelasNovo(vencimento: string, qtd: number, freqMeses: number, valorTotal: number) {
    if (!vencimento || qtd < 2) { setParcelasNovo([]); return; }
    const valorParcela = valorTotal > 0 ? valorTotal / qtd : 0;
    const novas: ParcelaGrid[] = Array.from({ length: qtd }, (_, i) => {
      const d = new Date(vencimento + "T12:00:00");
      d.setMonth(d.getMonth() + i * freqMeses);
      return { data: d.toISOString().split("T")[0], valor: Math.round(valorParcela * 100) / 100 };
    });
    setParcelasNovo(novas);
  }

  async function criarRegraClassificacaoNovo() {
    if (!fazendaId || !novoForm.pessoa_id || !novoForm.operacao_gerencial_id) return;
    const pessoa = pessoas.find(p => p.id === novoForm.pessoa_id);
    if (!pessoa?.cpf_cnpj) return;
    await supabase.from("regras_classificacao_nf").insert({
      fazenda_id: fazendaId, nome_regra: pessoa.nome, cnpj_emitente: pessoa.cpf_cnpj.replace(/\D/g, ""),
      operacao_gerencial_id: novoForm.operacao_gerencial_id, categoria: novoForm.categoria || null,
      ativo: true, criada_por: "CP — manual",
    });
  }

  function abrirNovo() {
    setErroNovo("");
    setNovoTab("principal");
    setEditandoId(null);
    setNovoForm({ ...NOVO_VAZIO, data_vencimento: hojeISO() });
    setCascadeNovo({});
    setParcelasNovo([]);
    setSalvarComoRegra(false);
    setModalNovo(true);
  }

  // ── Editar lançamento existente — reaproveita o mesmo modal, sem a parte
  // de Condição de Pagamento/parcelamento (converter parcelas de um título já
  // lançado é um fluxo à parte, não entra aqui; editar muda só os campos).
  async function abrirEditar(l: RelLancamento) {
    setErroNovo("");
    setNovoTab("principal");
    setParcelasNovo([]);
    setSalvarComoRegra(false);
    setEditandoId(l.id);
    if (l.origem_tabela === "lancamentos") {
      const { data } = await supabase.from("lancamentos").select("*").eq("id", l.id).single();
      const lanc = data as Lancamento | null;
      if (!lanc) return;
      setNovoForm({
        ...NOVO_VAZIO,
        origem: "lancamentos",
        natureza: lanc.natureza ?? "real",
        moeda: lanc.moeda,
        pessoa_id: lanc.pessoa_id ?? "",
        descricao: lanc.descricao ?? "",
        categoria: lanc.categoria || CATS_CP[0],
        data_vencimento: lanc.data_vencimento,
        valor: lanc.valor,
        cotacao_usd: lanc.cotacao_usd ?? 5.12,
        sacas: lanc.sacas ?? 0,
        cultura_barter: lanc.cultura_barter ?? "soja",
        preco_saca_barter: lanc.preco_saca_barter ?? 120,
        centro_custo_id: lanc.centro_custo_id ?? "",
        observacao: lanc.observacao ?? "",
        tipo_documento_lcdpr: lanc.tipo_documento_lcdpr ?? "RECIBO",
        numero_documento: lanc.numero_documento ?? "",
        entidade_contabil: lanc.entidade_contabil ?? "",
        operacao_gerencial_id: lanc.operacao_gerencial_id ?? "",
        forma_pagamento: lanc.forma_pagamento ?? "PIX",
        conta_pagamento: lanc.conta_bancaria ?? "",
        empresa_id: lanc.empresa_id ?? "",
      });
      setCascadeNovo({ produtorId: lanc.produtor_id || undefined, anoSafraId: lanc.ano_safra_id || undefined, cicloId: lanc.ciclo_id || undefined });
    } else {
      const { data } = await supabase.from("empresa_lancamentos").select("*").eq("id", l.id).single();
      const emp = data as { empresa_id: string; pessoa_id?: string; descricao?: string; categoria?: string; data_vencimento: string; valor: number; centro_custo?: string; observacao?: string; forma_pagamento?: string; conta_bancaria?: string; numero_documento?: string; competencia?: string } | null;
      if (!emp) return;
      setNovoForm({
        ...NOVO_VAZIO,
        origem: "empresa_lancamentos",
        empresa_id: emp.empresa_id,
        pessoa_id: emp.pessoa_id ?? "",
        descricao: emp.descricao ?? "",
        categoria: emp.categoria || CATS_CP[0],
        data_vencimento: emp.data_vencimento,
        valor: emp.valor,
        centro_custo_texto: emp.centro_custo ?? "",
        observacao: emp.observacao ?? "",
        forma_pagamento: emp.forma_pagamento ?? "PIX",
        conta_pagamento: emp.conta_bancaria ?? "",
        numero_documento: emp.numero_documento ?? "",
        competencia: emp.competencia ?? "",
      });
      setCascadeNovo({});
    }
    setModalNovo(true);
  }

  async function salvarNovo() {
    if (!fazendaId) return;
    const erros: string[] = [];
    if (novoForm.origem === "empresa_lancamentos") {
      if (!novoForm.empresa_id) erros.push("Selecione a empresa.");
      if (!novoForm.descricao.trim()) erros.push("Descrição é obrigatória.");
      if (!novoForm.valor) erros.push("Valor é obrigatório.");
      if (!novoForm.data_vencimento) erros.push("Vencimento é obrigatório.");
    } else {
      if (!novoForm.pessoa_id && !novoForm.descricao.trim()) erros.push("Fornecedor ou Descrição é obrigatório.");
      if (!novoForm.data_vencimento) erros.push("1º Vencimento é obrigatório.");
      if (novoForm.moeda !== "barter" && !novoForm.valor) erros.push("Valor é obrigatório.");
      if (novoForm.moeda === "barter" && !novoForm.sacas) erros.push("Quantidade de sacas é obrigatória.");
      if (!novoForm.operacao_gerencial_id) erros.push("Operação Gerencial é obrigatória.");
      if (novoForm.condicao === "prazo" && parcelasNovo.length === 0) erros.push("Gere as parcelas antes de salvar.");
    }
    if (erros.length > 0) { setErroNovo(erros.join(" ")); return; }
    setErroNovo("");

    // Mesmo fornecedor + mesmo nº de documento já lançado (não se aplica editando o próprio título)
    if (novoForm.origem === "lancamentos" && !editandoId) {
      const dup = await buscarLancamentoDuplicado(fazendaId, "pagar", novoForm.pessoa_id, novoForm.numero_documento);
      if (dup) { setErroNovo(`Já existe um lançamento com este documento para este fornecedor (venc. ${fmtData(dup.data_vencimento)}, ${fmtBRL(dup.valor)}).`); return; }
    }

    // ── Edição: UPDATE no título existente — sem reconversão de parcelamento ──
    if (editandoId) {
      setSalvandoAcao(true);
      try {
        if (novoForm.origem === "lancamentos") {
          const sacas = Number(novoForm.sacas);
          const valorFinal = novoForm.moeda === "barter" ? sacas * novoForm.preco_saca_barter : novoForm.valor;
          await atualizarLancamento(editandoId, {
            moeda: novoForm.moeda,
            pessoa_id: novoForm.pessoa_id || undefined,
            descricao: novoForm.descricao.trim() || (pessoas.find(p => p.id === novoForm.pessoa_id)?.nome ?? ""),
            categoria: novoForm.categoria,
            data_vencimento: novoForm.data_vencimento,
            valor: valorFinal,
            cotacao_usd: novoForm.moeda === "USD" ? novoForm.cotacao_usd : undefined,
            sacas: novoForm.moeda === "barter" ? sacas : undefined,
            cultura_barter: novoForm.moeda === "barter" ? novoForm.cultura_barter : undefined,
            preco_saca_barter: novoForm.moeda === "barter" ? novoForm.preco_saca_barter : undefined,
            tipo_documento_lcdpr: novoForm.tipo_documento_lcdpr || undefined,
            conta_bancaria: novoForm.conta_pagamento || undefined,
            numero_documento: novoForm.numero_documento || undefined,
            centro_custo_id: novoForm.centro_custo_id || undefined,
            observacao: novoForm.observacao.trim() || undefined,
            ano_safra_id: cascadeNovo.anoSafraId || undefined,
            ciclo_id: cascadeNovo.cicloId || undefined,
            produtor_id: cascadeNovo.produtorId || undefined,
            operacao_gerencial_id: novoForm.operacao_gerencial_id || undefined,
            natureza: novoForm.natureza,
            forma_pagamento: novoForm.forma_pagamento || undefined,
            entidade_contabil: novoForm.entidade_contabil || undefined,
          });
          if (salvarComoRegra) await criarRegraClassificacaoNovo();
        } else {
          await atualizarEmpresaLancamento(editandoId, {
            empresa_id: novoForm.empresa_id,
            descricao: novoForm.descricao.trim(),
            categoria: novoForm.categoria || undefined,
            valor: novoForm.valor,
            moeda: novoForm.moeda,
            data_vencimento: novoForm.data_vencimento,
            competencia: novoForm.competencia || undefined,
            pessoa_id: novoForm.pessoa_id || undefined,
            centro_custo: novoForm.centro_custo_texto.trim() || undefined,
            forma_pagamento: novoForm.forma_pagamento || undefined,
            conta_bancaria: novoForm.conta_pagamento || undefined,
            numero_documento: novoForm.numero_documento || undefined,
            observacao: novoForm.observacao.trim() || undefined,
          });
        }
        setModalNovo(false);
        setEditandoId(null);
        await carregar();
      } catch (e: unknown) {
        setErroNovo(e instanceof Error ? e.message : "Erro ao salvar alterações");
      } finally {
        setSalvandoAcao(false);
      }
      return;
    }

    setSalvandoAcao(true);
    try {
      const hoje = hojeISO();
      if (novoForm.origem === "lancamentos") {
        const sacas = Number(novoForm.sacas);
        const valorFinal = novoForm.moeda === "barter" ? sacas * novoForm.preco_saca_barter : novoForm.valor;
        const base: Omit<Lancamento, "id" | "created_at" | "num_parcela" | "total_parcelas" | "agrupador"> = {
          fazenda_id: fazendaId, tipo: "pagar", moeda: novoForm.moeda,
          pessoa_id: novoForm.pessoa_id || undefined,
          descricao: novoForm.descricao.trim() || (pessoas.find(p => p.id === novoForm.pessoa_id)?.nome ?? ""),
          categoria: novoForm.categoria, data_lancamento: hoje, data_vencimento: novoForm.data_vencimento,
          valor: valorFinal, status: novoForm.data_vencimento < hoje ? "vencido" : "em_aberto", auto: false,
          cotacao_usd: novoForm.moeda === "USD" ? novoForm.cotacao_usd : undefined,
          sacas: novoForm.moeda === "barter" ? sacas : undefined,
          cultura_barter: novoForm.moeda === "barter" ? novoForm.cultura_barter : undefined,
          preco_saca_barter: novoForm.moeda === "barter" ? novoForm.preco_saca_barter : undefined,
          tipo_documento_lcdpr: novoForm.tipo_documento_lcdpr || undefined,
          conta_bancaria: novoForm.conta_pagamento || undefined,
          numero_documento: novoForm.numero_documento || undefined,
          centro_custo_id: novoForm.centro_custo_id || undefined,
          observacao: novoForm.observacao.trim() || undefined,
          ano_safra_id: cascadeNovo.anoSafraId || undefined,
          ciclo_id: cascadeNovo.cicloId || undefined,
          produtor_id: cascadeNovo.produtorId || undefined,
          operacao_gerencial_id: novoForm.operacao_gerencial_id || undefined,
          natureza: novoForm.natureza,
          forma_pagamento: novoForm.forma_pagamento || undefined,
          entidade_contabil: novoForm.entidade_contabil || undefined,
        };
        if (novoForm.condicao === "prazo" && parcelasNovo.length > 0) {
          const agrupador = Date.now().toString(36);
          const total = parcelasNovo.length;
          for (let i = 0; i < total; i++) {
            await criarLancamento({ ...base, data_vencimento: parcelasNovo[i].data, valor: parcelasNovo[i].valor, num_parcela: i + 1, total_parcelas: total, agrupador });
          }
        } else if (novoForm.condicao === "prazo") {
          await criarParcelamento(base, Math.max(2, novoForm.qtd_parcelas), Math.max(1, novoForm.frequencia));
        } else if (novoForm.condicao === "recorrencia") {
          await criarParcelamento(base, Math.max(2, novoForm.qtd_parcelas), Math.max(1, novoForm.frequencia));
        } else {
          await criarLancamento(base);
        }
        if (salvarComoRegra) await criarRegraClassificacaoNovo();
      } else {
        await criarEmpresaLancamento({
          fazenda_id: fazendaId, empresa_id: novoForm.empresa_id, tipo: "pagar", descricao: novoForm.descricao.trim(),
          categoria: novoForm.categoria || undefined, valor: novoForm.valor, moeda: novoForm.moeda, data_vencimento: novoForm.data_vencimento,
          status: "pendente", competencia: novoForm.competencia || undefined,
          pessoa_id: novoForm.pessoa_id || undefined, centro_custo: novoForm.centro_custo_texto.trim() || undefined,
          forma_pagamento: novoForm.forma_pagamento || undefined, conta_bancaria: novoForm.conta_pagamento || undefined,
          numero_documento: novoForm.numero_documento || undefined,
          observacao: novoForm.observacao.trim() || undefined,
        });
      }
      setModalNovo(false);
      await carregar();
    } catch (e: unknown) {
      setErroNovo(e instanceof Error ? e.message : "Erro ao criar lançamento");
    } finally {
      setSalvandoAcao(false);
    }
  }

  const totalPagar = linhas.reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalAberto = linhas.filter(l => l.status_normalizado !== "baixado" && l.status_normalizado !== "cancelado").reduce((s, l) => s + Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0)), 0);

  // ── Baixar em Lote ─────────────────────────────────────────
  // Reintroduzido 01/10/2026 — a tela antiga do produtor tinha isso, mas só
  // pra lancamentos; aqui funciona pra Produtor e Empresa juntos no mesmo
  // lote, cada item roteando pra sua própria rotina de baixa (a mesma usada
  // na baixa individual acima — nenhuma lógica financeira nova).
  const [selecionados,      setSelecionados]      = useState<Set<string>>(new Set());
  const [modalLote,         setModalLote]         = useState(false);
  const [loteData,          setLoteData]          = useState("");
  const [loteConta,         setLoteConta]         = useState("");
  const [loteContasOpcoes,  setLoteContasOpcoes]  = useState<ContaBancaria[]>([]);
  const [loteEncargos,      setLoteEncargos]      = useState<Record<string, { multa: string; juros: string; desconto: string }>>({});
  const [salvandoLote,      setSalvandoLote]      = useState(false);
  const [erroLote,          setErroLote]          = useState("");

  // ── Popover de detalhe/ações ao clicar na linha ─────────────
  // Trazido de volta 02/10/2026 (existia na tela antiga, sumiu quando a
  // tela virou a grid unificada Produtor+Empresa) — mesmo padrão: clique
  // na linha (fora de botão/input/select/a) abre um popover posicionado
  // no ponto do clique, com detalhe + ações rápidas; Escape fecha.
  const [popover, setPopover] = useState<{ l: RelLancamento; x: number; y: number } | null>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setPopover(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const podeSelecionar = (l: RelLancamento) =>
    l.status_normalizado === "em_aberto" || l.status_normalizado === "vencido" || l.status_normalizado === "parcial";
  const toggleSel = (id: string) => setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const idsSelecionaveis = linhas.filter(podeSelecionar).map(l => l.id);
  const toggleTodos = () => {
    const todosSel = idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionados.has(id));
    setSelecionados(todosSel ? new Set() : new Set(idsSelecionaveis));
  };

  const itensLote = linhas.filter(l => selecionados.has(l.id) && podeSelecionar(l));
  const encargoLoteDe = (id: string) => loteEncargos[id] ?? { multa: "0,00", juros: "0,00", desconto: "0,00" };
  const setEncargoLote = (id: string, campo: "multa" | "juros" | "desconto", v: string) =>
    setLoteEncargos(prev => ({ ...prev, [id]: { ...encargoLoteDe(id), [campo]: v } }));
  const saldoLote = (l: RelLancamento) => Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0));
  const valorFinalLote = (l: RelLancamento) => {
    const e = encargoLoteDe(l.id);
    return Math.max(0, saldoLote(l) + numBR(e.multa) + numBR(e.juros) - numBR(e.desconto));
  };

  async function abrirModalLote() {
    setErroLote("");
    setLoteData(hojeISO());
    setLoteConta("");
    setLoteEncargos({});
    try {
      const empresaIds = Array.from(new Set(
        itensLote.filter(l => l.origem_tabela === "empresa_lancamentos" && l.empresa_id).map(l => l.empresa_id as string)
      ));
      const [contasProd, ...contasEmp] = await Promise.all([
        fazendaId ? listarContas(fazendaId) : Promise.resolve([] as ContaBancaria[]),
        ...empresaIds.map(id => listarContasPorEmpresa(id)),
      ]);
      const unicas = Array.from(new Map([contasProd, ...contasEmp].flat().map(c => [c.id, c])).values());
      setLoteContasOpcoes(unicas);
    } catch { setLoteContasOpcoes([]); }
    setModalLote(true);
  }

  async function baixarUmItem(l: RelLancamento, valor: number, data: string, conta: string, e: { multa: string; juros: string; desconto: string }) {
    if (l.origem_tabela === "lancamentos") {
      await baixarLancamento(l.id, valor, data, conta, {
        multa_valor: numBR(e.multa) || undefined, juros_valor: numBR(e.juros) || undefined, desconto_valor: numBR(e.desconto) || undefined,
      });
    } else {
      const res = await fetch("/api/empresa-lancamentos/baixar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "baixar", lancamento_id: l.id,
          valor_pago_agora: valor, data_baixa: data, conta_bancaria: conta,
          multa_valor: numBR(e.multa), juros_valor: numBR(e.juros), desconto_valor: numBR(e.desconto),
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Erro ao baixar");
    }
  }

  async function confirmarLote() {
    if (!loteData || !loteConta || itensLote.length === 0) { setErroLote("Informe data e conta bancária."); return; }
    setSalvandoLote(true); setErroLote("");
    try {
      await Promise.all(itensLote.map(l => baixarUmItem(l, valorFinalLote(l), loteData, loteConta, encargoLoteDe(l.id))));
      setSelecionados(new Set());
      setModalLote(false);
      await carregar();
    } catch (e: unknown) {
      setErroLote(e instanceof Error ? e.message : "Erro ao baixar em lote");
    } finally {
      setSalvandoLote(false);
    }
  }

  // ── Criar Borderô (lote pendente, confirma depois) ─────────────
  const [modalCriarBordero, setModalCriarBordero] = useState(false);
  const [borderoDesc, setBorderoDesc] = useState("");
  const [salvandoBordero, setSalvandoBordero] = useState(false);
  const [erroBordero, setErroBordero] = useState("");

  function abrirModalCriarBordero() {
    setErroBordero("");
    setBorderoDesc("");
    setModalCriarBordero(true);
  }

  async function criarBorderoAction() {
    if (!fazendaId || itensLote.length === 0) return;
    setSalvandoBordero(true); setErroBordero("");
    try {
      const itensPayload = itensLote.map(l => ({ lancamento_id: l.id, origem_tabela: l.origem_tabela as "lancamentos" | "empresa_lancamentos", valor_pago: saldoLote(l) }));
      const desc = borderoDesc.trim() || `Borderô ${new Date().toLocaleDateString("pt-BR")} — ${itensLote.length} título${itensLote.length !== 1 ? "s" : ""}`;
      await criarPagamentoLote(fazendaId, "pagar", null, null, desc, itensPayload, "pendente");
      setSelecionados(new Set());
      setModalCriarBordero(false);
      await Promise.all([carregar(), carregarBorderos()]);
    } catch (e: unknown) {
      setErroBordero(e instanceof Error ? e.message : "Erro ao criar borderô");
    } finally {
      setSalvandoBordero(false);
    }
  }

  // ── Confirmar Pagamento / Cancelar / Ver Itens de um Borderô ───
  async function carregarItensBordero(loteId: string): Promise<RelLancamento[]> {
    const { data, error } = await supabase.from("rel_lancamentos").select("*").eq("lote_id", loteId);
    if (error) throw error;
    return (data ?? []) as RelLancamento[];
  }

  const [modalConfirmarBordero, setModalConfirmarBordero] = useState<PagamentoLote | null>(null);
  const [confirmData, setConfirmData] = useState("");
  const [confirmConta, setConfirmConta] = useState("");
  const [confirmContasOpcoes, setConfirmContasOpcoes] = useState<ContaBancaria[]>([]);

  async function abrirConfirmarBordero(b: PagamentoLote) {
    setErroBordero("");
    setModalConfirmarBordero(b);
    setConfirmData(hojeISO());
    setConfirmConta("");
    try {
      const itens = await carregarItensBordero(b.id);
      const empresaIds = Array.from(new Set(itens.filter(i => i.origem_tabela === "empresa_lancamentos" && i.empresa_id).map(i => i.empresa_id as string)));
      const [contasProd, ...contasEmp] = await Promise.all([
        fazendaId ? listarContas(fazendaId) : Promise.resolve([] as ContaBancaria[]),
        ...empresaIds.map(id => listarContasPorEmpresa(id)),
      ]);
      setConfirmContasOpcoes(Array.from(new Map([contasProd, ...contasEmp].flat().map(c => [c.id, c])).values()));
    } catch { setConfirmContasOpcoes([]); }
  }

  async function confirmarBorderoAction() {
    if (!modalConfirmarBordero || !confirmData || !confirmConta) { setErroBordero("Informe data e conta bancária."); return; }
    setSalvandoBordero(true); setErroBordero("");
    try {
      await confirmarPagamentoBordero(modalConfirmarBordero.id, confirmData, confirmConta);
      setModalConfirmarBordero(null);
      await Promise.all([carregar(), carregarBorderos()]);
    } catch (e: unknown) {
      setErroBordero(e instanceof Error ? e.message : "Erro ao confirmar pagamento do borderô");
    } finally {
      setSalvandoBordero(false);
    }
  }

  async function cancelarBorderoAction(b: PagamentoLote) {
    if (!confirm(`Cancelar o borderô "${b.descricao}"? Os títulos voltam a ficar soltos (sem borderô), sem baixar nada.`)) return;
    try {
      await cancelarBordero(b.id);
      await carregarBorderos();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao cancelar borderô");
    }
  }

  const [modalVerBordero, setModalVerBordero] = useState<PagamentoLote | null>(null);
  const [verBorderoItens, setVerBorderoItens] = useState<RelLancamento[]>([]);
  const [carregandoVerBordero, setCarregandoVerBordero] = useState(false);

  async function abrirVerBordero(b: PagamentoLote) {
    setModalVerBordero(b);
    setCarregandoVerBordero(true);
    try {
      setVerBorderoItens(await carregarItensBordero(b.id));
    } catch { setVerBorderoItens([]); }
    finally { setCarregandoVerBordero(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "14px 20px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Contas a Pagar</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>Produtor e Empresa juntos — veja a coluna Origem</p>
          </div>
          <button onClick={abrirNovo} style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 600, cursor: "pointer", border: "none", width: "auto", padding: "9px 18px" }}>
            + Novo Lançamento
          </button>
        </div>

        {/* ── Barra de filtros SEMPRE VISÍVEL (não popup) ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label style={lblMini}>Buscar</label>
            <input value={fBusca} onChange={e => setFBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && carregar()} placeholder="Descrição, fornecedor..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={lblMini}>Origem</label>
            <div style={{ display: "flex", gap: 6 }}>
              {ORIGEM_OPCOES.map(o => (
                <button key={o.v} onClick={() => toggle(fOrigem, setFOrigem, o.v)} style={chip(fOrigem.has(o.v))}>{o.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lblMini}>Status</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUS_OPCOES.map(s => (
                <button key={s.v} onClick={() => toggle(fStatus, setFStatus, s.v)} style={chip(fStatus.has(s.v))}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lblMini}>Vencimento de</label>
            <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lblMini}>até</label>
            <input type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={inp} />
          </div>
          <button onClick={carregar} disabled={carregando} style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            {carregando ? "Atualizando..." : "↻ Atualizar"}
          </button>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#791F1F" }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
          <span><strong>{linhas.length}</strong> lançamento(s)</span>
          <span>·</span>
          <span>Total: <strong>{fmtBRL(totalPagar)}</strong></span>
          <span>·</span>
          <span>Saldo em aberto: <strong style={{ color: "#E24B4A" }}>{fmtBRL(totalAberto)}</strong></span>
        </div>

        {/* maxHeight + overflow:auto (em vez de só overflowX no container inteiro) —
            a barra de rolagem horizontal fica logo abaixo da área visível, não depois
            dos 1000 registros. Cabeçalho sticky pra não perder o contexto das colunas
            ao rolar verticalmente dentro do grid. Altura reaproveitando o espaço que
            sobrou com paddings mais enxutos acima e o borderô saindo do painel fixo. */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "calc(100vh - 270px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F4F6FA", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "7px 8px", width: 30, background: "#F4F6FA" }}>
                  <input type="checkbox" style={{ cursor: "pointer" }}
                    checked={idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionados.has(id))}
                    onChange={toggleTodos} />
                </th>
                {["Origem", "Nº", "Fornecedor", "Descrição", "Operação", "Safra", "Ciclo", "Centro Custo", "Lançamento", "Vencimento", "Dias", "Venc. Original", "Baixa", "Valor", "Pago", "Saldo", "Moeda", "Conta", "Nº NF", "Lançado via", "Observação", "Status", "Ações"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA" }}>
                    {h === "Lançamento" || h === "Vencimento" ? (
                      <button
                        onClick={() => clicarOrdenar(h === "Lançamento" ? "lancamento" : "vencimento")}
                        title="Ordenar por esta data"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 700, color: ordenarPor === (h === "Lançamento" ? "lancamento" : "vencimento") ? "#1A4870" : "#555", display: "flex", alignItems: "center", gap: 3 }}>
                        {h}
                        {ordenarPor === (h === "Lançamento" ? "lancamento" : "vencimento") && <span>{ordemAsc ? "▲" : "▼"}</span>}
                      </button>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={24} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
              )}
              {!carregando && linhasComBordero.map(entry => {
                if (entry.kind === "bordero") {
                  const b = entry.b;
                  return (
                    <tr key={`bdr-${b.id}`} style={{ background: "#FBF3E0", borderBottom: "0.5px solid #C9921B60" }}>
                      <td colSpan={24} style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#7A5200", background: "#FDE9BB", padding: "2px 8px", borderRadius: 6 }}>📋 BORDERÔ PENDENTE</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{b.descricao || "Borderô"}</span>
                            <span style={{ fontSize: 12, color: "#555" }}>{(b.itens ?? []).length} título{(b.itens ?? []).length !== 1 ? "s" : ""} · <strong>{fmtBRL(b.valor_total)}</strong></span>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => abrirVerBordero(b)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Ver Itens</button>
                            <button onClick={() => abrirConfirmarBordero(b)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer", background: "#16A34A", color: "#fff", border: "none" }}>✅ Confirmar Pagamento</button>
                            <button onClick={() => cancelarBorderoAction(b)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#791F1F" }}>✕ Cancelar</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const l = entry.l;
                const sm = STATUS_OPCOES.find(s => s.v === l.status_normalizado);
                const aberto = l.status_normalizado === "em_aberto" || l.status_normalizado === "vencido" || l.status_normalizado === "parcial";
                const dias = diasVencimento(l.data_vencimento, l.status_normalizado);
                const saldo = Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0));
                return (
                  <tr key={l.id}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest("button,input,select,a")) return;
                      setPopover(p => p?.l.id === l.id ? null : { l, x: e.clientX, y: e.clientY });
                    }}
                    style={{ borderBottom: "0.5px solid #F0F2F7", background: selecionados.has(l.id) ? "#F0F7FF" : undefined, cursor: "pointer" }}>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      {aberto && <input type="checkbox" style={{ cursor: "pointer" }} checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} />}
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: l.origem_tabela === "lancamentos" ? "#E6F1FB" : "#F5F3FF", color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6", padding: "2px 7px", borderRadius: 6 }}>
                        {l.origem_tabela === "lancamentos" ? "PF" : "PJ"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{l.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.empresa_nome ?? l.pessoa_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.operacao_gerencial_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.ano_safra_descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.ciclo_descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.centro_custo_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888" }}>{fmtData(l.data_lancamento)}</td>
                    <td style={{ padding: "7px 10px" }}>{fmtData(l.data_vencimento)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: dias != null && dias < 0 ? "#E24B4A" : "#555" }}>{dias ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontStyle: "italic" }}>{l.data_prorrogacao ? fmtData(l.data_prorrogacao) : "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{fmtData(l.data_baixa)}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: "#E24B4A" }}>{fmtBRL(l.valor)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(l.valor_pago)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(saldo)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center" }}>{l.moeda ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.conta_bancaria_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.nfe_numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888" }}>{ORIGEM_LANC_LABEL[l.origem_lancamento ?? ""] ?? l.origem_lancamento ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.observacao ?? undefined}>{l.observacao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? l.status_normalizado}</span>
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {l.status_normalizado === "baixado" ? (
                          <button onClick={() => reabrir(l)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Reabrir</button>
                        ) : aberto ? (
                          <>
                            <button onClick={() => abrirBaixa(l)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer", background: "#16A34A", color: "#fff", border: "none" }}>Baixar</button>
                            <button onClick={() => abrirReprog(l)} style={{ ...inp, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Reprogramar</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!carregando && linhas.length === 0 && (
                <tr><td colSpan={24} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento encontrado para esse filtro/período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Popover de lançamento — detalhe + ações rápidas ── */}
      {popover && (() => {
        const l = popover.l;
        const dias = diasVencimento(l.data_vencimento, l.status_normalizado);
        const sm = STATUS_OPCOES.find(s => s.v === l.status_normalizado);
        const nome = l.empresa_nome ?? l.pessoa_nome ?? l.descricao ?? "—";
        const saldo = Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0));
        const aberto = l.status_normalizado === "em_aberto" || l.status_normalizado === "vencido" || l.status_normalizado === "parcial";
        const W = 380, H = 420;
        const top  = Math.min(popover.y + 10, (typeof window !== "undefined" ? window.innerHeight : 800) - H);
        const left = Math.max(8, Math.min(popover.x - 20, (typeof window !== "undefined" ? window.innerWidth : 1200) - W - 8));
        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 1490 }} onClick={() => setPopover(null)} />
            <div style={{ position: "fixed", top, left, zIndex: 1491, width: W, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(11,45,80,0.22)", border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</div>
                    {l.descricao && l.descricao !== nome && <div style={{ fontSize: 11, color: "#888", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: l.origem_tabela === "lancamentos" ? "#E6F1FB" : "#F5F3FF", color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6", padding: "2px 7px", borderRadius: 6 }}>
                      {l.origem_tabela === "lancamentos" ? "PF" : "PJ"}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555" }}>{sm?.label ?? l.status_normalizado}</span>
                    <button onClick={() => setPopover(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Valor</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor)}</div>
                </div>

                {l.status_normalizado === "parcial" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "#F4F6FA", borderRadius: 6, padding: "6px 10px" }}>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Pago</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#16A34A" }}>{fmtBRL(l.valor_pago)}</div>
                    </div>
                    <div style={{ background: "#FEF3C7", border: "0.5px solid #F0C060", borderRadius: 6, padding: "6px 10px" }}>
                      <div style={{ fontSize: 10, color: "#8B5E14", marginBottom: 2, fontWeight: 600 }}>Saldo devedor</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#C9921B" }}>{fmtBRL(saldo)}</div>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 11 }}>
                  <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Vencimento</div>
                    <div style={{ fontWeight: 600, color: dias != null && dias < 0 ? "#E24B4A" : "#1a1a1a" }}>{fmtData(l.data_vencimento)}</div>
                    {dias != null && <div style={{ fontSize: 10, color: dias < 0 ? "#E24B4A" : "#888", fontWeight: 700 }}>{dias < 0 ? `${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? "s" : ""} em atraso` : dias === 0 ? "Vence hoje" : `em ${dias} dia${dias !== 1 ? "s" : ""}`}</div>}
                  </div>
                  {l.operacao_gerencial_nome && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Operação Gerencial</div>
                    <div style={{ color: "#1a1a1a" }}>{l.operacao_gerencial_nome}</div>
                  </div>}
                  {l.ano_safra_descricao && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Safra</div>
                    <div style={{ color: "#1a1a1a" }}>{l.ano_safra_descricao}</div>
                  </div>}
                  {l.ciclo_descricao && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Ciclo</div>
                    <div style={{ color: "#1a1a1a" }}>{l.ciclo_descricao}</div>
                  </div>}
                  {l.centro_custo_nome && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Centro de Custo</div>
                    <div style={{ color: "#1a1a1a" }}>{l.centro_custo_nome}</div>
                  </div>}
                  {l.conta_bancaria_nome && l.status_normalizado === "baixado" && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Conta bancária</div>
                    <div style={{ color: "#1a1a1a" }}>{l.conta_bancaria_nome}</div>
                  </div>}
                  {l.data_baixa && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Pago em</div>
                    <div style={{ color: "#15803D", fontWeight: 600 }}>{fmtData(l.data_baixa)}</div>
                  </div>}
                  {(l.numero || l.nfe_numero) && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Nº documento</div>
                    <div style={{ color: "#1a1a1a" }}>{l.nfe_numero ?? l.numero}</div>
                  </div>}
                  {l.origem_lancamento && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Origem do lançamento</div>
                    <div style={{ color: "#1a1a1a" }}>{ORIGEM_LANC_LABEL[l.origem_lancamento] ?? l.origem_lancamento}</div>
                  </div>}
                </div>

                {l.observacao && (
                  <div style={{ background: "#F4F6FA", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#555", borderLeft: "3px solid #DDE2EE" }}>
                    {l.observacao}
                  </div>
                )}
              </div>

              {/* Ações rápidas */}
              <div style={{ padding: "10px 14px", borderTop: "0.5px solid #DDE2EE", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {aberto && (
                  <button onClick={() => { setPopover(null); abrirBaixa(l); }} style={{ flex: 1, minWidth: 80, padding: "7px 10px", borderRadius: 7, background: "#16A34A", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>↓ Baixar</button>
                )}
                {(l.status_normalizado === "baixado" || l.status_normalizado === "parcial") && (
                  <button onClick={() => { setPopover(null); reabrir(l); }} style={{ flex: 1, minWidth: 80, padding: "7px 10px", borderRadius: 7, background: "#F4F6FA", color: "#555", border: "0.5px solid #C9921B", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>↺ Reabrir</button>
                )}
                {l.status_normalizado !== "baixado" && l.status_normalizado !== "cancelado" && (
                  <button onClick={() => { setPopover(null); abrirReprog(l); }} style={{ flex: 1, minWidth: 80, padding: "7px 10px", borderRadius: 7, background: "#F4F6FA", color: "#555", border: "0.5px solid #DDE2EE", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>↕ Reprogramar</button>
                )}
                {l.status_normalizado !== "baixado" && (
                  <button onClick={() => { setPopover(null); abrirEditar(l); }} style={{ flex: 1, minWidth: 80, padding: "7px 10px", borderRadius: 7, background: "#F4F6FA", color: "#555", border: "0.5px solid #DDE2EE", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>✎ Editar</button>
                )}
                {l.status_normalizado !== "baixado" && podeExcluir(l) && (
                  <button onClick={() => { setPopover(null); excluirLanc(l); }} style={{ flex: 1, minWidth: 80, padding: "7px 10px", borderRadius: 7, background: "#FEF2F2", color: "#B91C1C", border: "0.5px solid #FCA5A5", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>🗑 Excluir</button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Barra flutuante de seleção — Baixar em Lote ── */}
      {selecionados.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#111111", color: "#fff", borderRadius: 12, padding: "10px 18px",
          display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(0,0,0,.25)",
          zIndex: 900, whiteSpace: "nowrap", maxWidth: "calc(100vw - 32px)",
        }}>
          <span style={{ fontSize: 12 }}>
            <strong>{itensLote.length}</strong> título{itensLote.length !== 1 ? "s" : ""} selecionado{itensLote.length !== 1 ? "s" : ""}
            {itensLote.length > 0 && <>&nbsp;·&nbsp;<strong>{fmtBRL(itensLote.reduce((s, l) => s + saldoLote(l), 0))}</strong></>}
          </span>
          <button onClick={abrirModalLote} style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✓ Baixar em Lote
          </button>
          <button onClick={abrirModalCriarBordero} style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            📋 Criar Borderô
          </button>
          <button onClick={() => setSelecionados(new Set())} style={{ background: "none", border: "0.5px solid #555", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ══ MODAL — Criar Borderô ══ */}
      {modalCriarBordero && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalCriarBordero(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(96vw, 760px)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>📋 Criar Borderô</h2>
              <button onClick={() => setModalCriarBordero(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
              Agrupa os títulos selecionados sem baixar agora — define data e conta bancária depois, ao confirmar o pagamento do borderô inteiro de uma vez.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Descrição do borderô (opcional)</label>
              <input value={borderoDesc} onChange={e => setBorderoDesc(e.target.value)}
                placeholder={`Borderô ${new Date().toLocaleDateString("pt-BR")} — ${itensLote.length} título${itensLote.length !== 1 ? "s" : ""}`}
                style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            </div>

            <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ background: "#F4F6FA", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#888", textTransform: "uppercase", display: "grid", gridTemplateColumns: "60px 1.6fr 90px 100px", gap: 6 }}>
                <span>Origem</span><span>Título</span><span>Venc.</span><span style={{ textAlign: "right" }}>Saldo</span>
              </div>
              {itensLote.map((l, i) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "60px 1.6fr 90px 100px", gap: 6, padding: "6px 10px", borderTop: i > 0 ? "0.5px solid #F0F2F7" : "none", fontSize: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6" }}>{l.origem_tabela === "lancamentos" ? "PF" : "PJ"}</span>
                  <span style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.empresa_nome ?? l.pessoa_nome ?? l.descricao}</span>
                  <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                  <span style={{ fontWeight: 700, color: "#E24B4A", textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(saldoLote(l))}</span>
                </div>
              ))}
              <div style={{ background: "#F4F6FA", padding: "8px 10px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #DDE2EE" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total do borderô</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E24B4A" }}>{fmtBRL(itensLote.reduce((s, l) => s + saldoLote(l), 0))}</span>
              </div>
            </div>

            {erroBordero && <div style={{ fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6, marginBottom: 12 }}>{erroBordero}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setModalCriarBordero(false)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={criarBorderoAction} disabled={salvandoBordero}
                style={{ ...inp, background: "#C9921B", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoBordero ? "Criando..." : `Criar Borderô (${itensLote.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Confirmar Pagamento de Borderô ══ */}
      {modalConfirmarBordero && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalConfirmarBordero(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(94vw, 440px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>✅ Confirmar Pagamento do Borderô</h2>
              <button onClick={() => setModalConfirmarBordero(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>
              {modalConfirmarBordero.descricao} · Total: <strong>{fmtBRL(modalConfirmarBordero.valor_total)}</strong>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={lbl}>Data do pagamento *</label>
                <input type="date" value={confirmData} onChange={e => setConfirmData(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Conta bancária *</label>
                <select value={confirmConta} onChange={e => setConfirmConta(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {confirmContasOpcoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            {erroBordero && <div style={{ marginTop: 12, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6 }}>{erroBordero}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setModalConfirmarBordero(null)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarBorderoAction} disabled={salvandoBordero}
                style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoBordero ? "Confirmando..." : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Ver Itens do Borderô ══ */}
      {modalVerBordero && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalVerBordero(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(96vw, 760px)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>Borderô — {modalVerBordero.descricao}</h2>
              <button onClick={() => setModalVerBordero(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
              {modalVerBordero.status === "pago" ? "✅ Pago" : "⏳ Pendente"} · Total: <strong>{fmtBRL(modalVerBordero.valor_total)}</strong>
            </div>
            {carregandoVerBordero ? (
              <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Carregando...</div>
            ) : (
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: "#F4F6FA", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#888", textTransform: "uppercase", display: "grid", gridTemplateColumns: "60px 1.6fr 90px 90px 90px", gap: 6 }}>
                  <span>Origem</span><span>Título</span><span>Nº NF</span><span>Venc.</span><span style={{ textAlign: "right" }}>Valor</span>
                </div>
                {verBorderoItens.map((l, i) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "60px 1.6fr 90px 90px 90px", gap: 6, padding: "6px 10px", borderTop: i > 0 ? "0.5px solid #F0F2F7" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6" }}>{l.origem_tabela === "lancamentos" ? "PF" : "PJ"}</span>
                    <span style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.empresa_nome ?? l.pessoa_nome ?? l.descricao}</span>
                    <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{l.nfe_numero ?? "—"}</span>
                    <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(l.valor)}</span>
                  </div>
                ))}
                {verBorderoItens.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 12 }}>Nenhum item encontrado.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL — Baixar em Lote ══ */}
      {modalLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalLote(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(96vw, 900px)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>✓ Baixar em Lote</h2>
              <button onClick={() => setModalLote(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
              {itensLote.length} título{itensLote.length !== 1 ? "s" : ""} · total original {fmtBRL(itensLote.reduce((s, l) => s + saldoLote(l), 0))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Data do pagamento *</label>
                <input type="date" value={loteData} onChange={e => setLoteData(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Conta bancária *</label>
                <select value={loteConta} onChange={e => setLoteConta(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {loteContasOpcoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ background: "#F4F6FA", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#888", textTransform: "uppercase", display: "grid", gridTemplateColumns: "60px 1.6fr 68px 80px 70px 70px 70px 90px", gap: 6 }}>
                <span>Origem</span><span>Título</span><span>Venc.</span><span style={{ textAlign: "right" }}>Saldo</span>
                <span style={{ textAlign: "center" }}>Multa</span><span style={{ textAlign: "center" }}>Juros</span>
                <span style={{ textAlign: "center" }}>Desconto</span><span style={{ textAlign: "right" }}>A pagar</span>
              </div>
              {itensLote.map((l, i) => {
                const e = encargoLoteDe(l.id);
                const inpMini: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "0.5px solid #DDE2EE", borderRadius: 5, fontSize: 11, textAlign: "right", background: "#fff", boxSizing: "border-box", outline: "none" };
                return (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "60px 1.6fr 68px 80px 70px 70px 70px 90px", gap: 6, padding: "6px 10px", borderTop: i > 0 ? "0.5px solid #F0F2F7" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6" }}>{l.origem_tabela === "lancamentos" ? "PF" : "PJ"}</span>
                    <span style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.empresa_nome ?? l.pessoa_nome ?? l.descricao}</span>
                    <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ color: "#888", textAlign: "right", whiteSpace: "nowrap", fontSize: 11 }}>{fmtBRL(saldoLote(l))}</span>
                    <input value={e.multa} onChange={ev => setEncargoLote(l.id, "multa", ev.target.value)} style={inpMini} />
                    <input value={e.juros} onChange={ev => setEncargoLote(l.id, "juros", ev.target.value)} style={inpMini} />
                    <input value={e.desconto} onChange={ev => setEncargoLote(l.id, "desconto", ev.target.value)} style={inpMini} />
                    <span style={{ fontWeight: 700, color: "#E24B4A", textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(valorFinalLote(l))}</span>
                  </div>
                );
              })}
              <div style={{ background: "#F4F6FA", padding: "8px 10px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #DDE2EE" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total a pagar (já com encargos)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E24B4A" }}>{fmtBRL(itensLote.reduce((s, l) => s + valorFinalLote(l), 0))}</span>
              </div>
            </div>

            {erroLote && <div style={{ fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6, marginBottom: 12 }}>{erroLote}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setModalLote(false)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarLote} disabled={salvandoLote || !loteData || !loteConta}
                style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoLote ? "Baixando..." : `✓ Confirmar Baixa (${itensLote.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Baixar ══ */}
      {modalBaixa && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalBaixa(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(94vw, 460px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>Baixar Lançamento</h2>
              <button onClick={() => setModalBaixa(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>
              {modalBaixa.descricao} · Saldo: <span style={{ fontWeight: 700 }}>{fmtBRL(saldoBase(modalBaixa))}</span>
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                Rota: {modalBaixa.origem_tabela === "lancamentos" ? "/api/financeiro/baixar" : "/api/empresa-lancamentos/baixar"} (mesma da tela real)
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Multa</label>
                <input value={bMulta} onChange={e => { setBMulta(e.target.value); recalcValor(e.target.value, bJuros, bDesc); }} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Juros</label>
                <input value={bJuros} onChange={e => { setBJuros(e.target.value); recalcValor(bMulta, e.target.value, bDesc); }} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Desconto</label>
                <input value={bDesc} onChange={e => { setBDesc(e.target.value); recalcValor(bMulta, bJuros, e.target.value); }} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={lbl}>Valor pago agora</label>
                <input value={bValor} onChange={e => setBValor(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box", fontWeight: 700 }} />
              </div>
              <div>
                <label style={lbl}>Data da baixa</label>
                <input type="date" value={bData} onChange={e => setBData(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Conta bancária</label>
                <select value={bConta} onChange={e => setBConta(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {contasOpcoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>📎 Anexar comprovante</label>
                <AnexoDocumentos entidade_tipo="lancamento_cp_comprovante" entidade_id={modalBaixa.id} fazenda_id={modalBaixa.fazenda_id ?? fazendaId ?? ""} maxBytes={1024 * 1024} label="Comprovante" />
              </div>
            </div>
            {erroAcao && <div style={{ marginTop: 12, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6 }}>{erroAcao}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setModalBaixa(null)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarBaixa} disabled={salvandoAcao}
                style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoAcao ? "Baixando..." : "Confirmar Baixa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Reprogramar ══ */}
      {modalReprog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalReprog(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(94vw, 420px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>📅 Reprogramar Vencimento</h2>
              <button onClick={() => setModalReprog(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>
              {modalReprog.descricao} · Vencimento atual: <strong>{fmtData(modalReprog.data_vencimento)}</strong>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={lbl}>Nova data de vencimento</label>
                <input type="date" value={rData} onChange={e => setRData(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Novo valor (opcional)</label>
                <input value={rValor} onChange={e => setRValor(e.target.value)} placeholder={fmtBRL(modalReprog.valor)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={rObs} onChange={e => setRObs(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
            {erroAcao && <div style={{ marginTop: 12, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6 }}>{erroAcao}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setModalReprog(null)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarReprog} disabled={salvandoAcao}
                style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoAcao ? "Salvando..." : "Reprogramar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Novo Lançamento ══ */}
      {modalNovo && (() => {
        const ehEmpresa = novoForm.origem === "empresa_lancamentos";
        const ogSelecionada = opGerenciais.find(o => o.id === novoForm.operacao_gerencial_id);
        const pessoaSel = pessoas.find(p => p.id === novoForm.pessoa_id);
        return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setModalNovo(false)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(95vw, 820px)", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 24px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>{editandoId ? "✎ Editar Lançamento — Contas a Pagar" : "+ Novo Lançamento — Contas a Pagar"}</h2>
                  {!ehEmpresa && (
                    <div style={{ display: "flex", border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                      {(["real", "previsao"] as const).map(n => (
                        <button key={n} onClick={() => setNovoForm(p => ({ ...p, natureza: n }))}
                          style={{ padding: "4px 12px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: novoForm.natureza === n ? 700 : 400,
                            background: novoForm.natureza === n ? (n === "previsao" ? "#2A2A2A" : "#C9921B") : "#F4F6FA",
                            color: novoForm.natureza === n ? "#fff" : "#555" }}>
                          {n === "real" ? "Real" : "Previsão"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setModalNovo(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Origem</label>
                <div style={{ display: "flex", gap: 14, border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                  {ORIGEM_OPCOES.map(o => (
                    <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="radio" checked={novoForm.origem === o.v} onChange={() => setNovoForm(p => ({ ...p, origem: o.v as typeof p.origem, empresa_id: "" }))} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 0 }}>
                {(editandoId ? (["principal", "adicionais", "documentos"] as const) : (["principal", "adicionais"] as const)).map(t => (
                  <button key={t} onClick={() => setNovoTab(t)}
                    style={{ padding: "7px 18px", border: "none", cursor: "pointer", fontSize: 12, background: "transparent",
                      fontWeight: novoTab === t ? 700 : 400, color: novoTab === t ? "#1A4870" : "#888",
                      borderBottom: novoTab === t ? "2px solid #1A4870" : "2px solid transparent" }}>
                    {t === "principal" ? "Principal" : t === "adicionais" ? "Adicionais" : "📎 Documentos"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto" }}>
              {novoTab === "principal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {ehEmpresa ? (
                    <>
                      <div>
                        <label style={lbl}>Empresa *</label>
                        <select value={novoForm.empresa_id} onChange={e => setNovoForm(p => ({ ...p, empresa_id: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                          <option value="">Selecionar...</option>
                          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome || e.razao_social}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Descrição *</label>
                        <input value={novoForm.descricao} onChange={e => setNovoForm(p => ({ ...p, descricao: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: Frete Rancho Alegre → Cuiabá" />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={lbl}>Categoria *</label>
                          <select value={novoForm.categoria} onChange={e => setNovoForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                            {CATS_CP.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Competência</label>
                          <input type="month" value={novoForm.competencia} onChange={e => setNovoForm(p => ({ ...p, competencia: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={lbl}>Valor (R$) *</label>
                          <InputMonetario value={novoForm.valor} onChange={v => setNovoForm(p => ({ ...p, valor: v }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="0,00" />
                        </div>
                        <div>
                          <label style={lbl}>Vencimento *</label>
                          <input type="date" value={novoForm.data_vencimento} onChange={e => setNovoForm(p => ({ ...p, data_vencimento: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={lbl}>Fornecedor</label>
                          <select value={novoForm.pessoa_id} onChange={e => setNovoForm(p => ({ ...p, pessoa_id: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                            <option value="">— Nenhum —</option>
                            {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Centro de Custo</label>
                          <input value={novoForm.centro_custo_texto} onChange={e => setNovoForm(p => ({ ...p, centro_custo_texto: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: Operações, Adm..." />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Produtor → Fazenda → Safra → Ciclo */}
                      <CascadeSelector
                        contaId={contaId}
                        fazendaIdFallback={fazendaId}
                        fazendaRequired={false}
                        levels={["produtor", "fazenda", "anoSafra", "ciclo"]}
                        values={cascadeNovo}
                        onChange={setCascadeNovo}
                      />

                      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: 12 }}>
                        <div>
                          <label style={lbl}>Moeda</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.moeda} onChange={e => setNovoForm(p => ({ ...p, moeda: e.target.value as typeof p.moeda }))}>
                            <option value="BRL">Real (R$)</option>
                            <option value="USD">Dólar (US$)</option>
                            <option value="barter">Barter</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Operação Gerencial <span style={{ color: "#E24B4A" }}>*</span></label>
                          <SelectBusca
                            value={novoForm.operacao_gerencial_id}
                            onChange={id => {
                              const op = opGerenciais.find(o => o.id === id);
                              setNovoForm(p => ({ ...p, operacao_gerencial_id: id, categoria: op ? derivarCategoriaDespesa(op.classificacao ?? "") : p.categoria }));
                            }}
                            options={opGerenciais.map(o => ({ value: o.id, label: `${o.classificacao} — ${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") }))}
                            placeholder="— Selecionar operação —"
                            style={{ ...inp, width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={lbl}>Entidade Contábil</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.entidade_contabil} onChange={e => setNovoForm(p => ({ ...p, entidade_contabil: e.target.value as typeof p.entidade_contabil }))}>
                            <option value="">— Padrão da fazenda —</option>
                            <option value="pf">Pessoa Física</option>
                            <option value="pj">Pessoa Jurídica</option>
                          </select>
                        </div>
                      </div>

                      {ogSelecionada && (ogSelecionada.conta_debito || ogSelecionada.conta_credito) && (
                        <div style={{ padding: "5px 12px", background: "#F0F7FF", borderRadius: 7, border: "0.5px solid #C5DCF5", fontSize: 11, color: "#0D0D0D", display: "flex", gap: 20 }}>
                          <span>Débito: <strong>{ogSelecionada.conta_debito || "—"}</strong></span>
                          <span>Crédito: <strong>{ogSelecionada.conta_credito || "—"}</strong></span>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px 160px", gap: 12 }}>
                        <div>
                          <label style={lbl}>Fornecedor / Credor</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.pessoa_id} onChange={e => setNovoForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                            <option value="">— Selecionar do cadastro —</option>
                            {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Nº Documento</label>
                          <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: 001234" value={novoForm.numero_documento} onChange={e => setNovoForm(p => ({ ...p, numero_documento: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Série</label>
                          <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="1" value={novoForm.serie} onChange={e => setNovoForm(p => ({ ...p, serie: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Tipo de Documento</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.tipo_documento_lcdpr} onChange={e => setNovoForm(p => ({ ...p, tipo_documento_lcdpr: e.target.value as typeof p.tipo_documento_lcdpr }))}>
                            <option value="NF">Nota Fiscal (NF-e)</option>
                            <option value="FATURA">Fatura</option>
                            <option value="BOLETO">Boleto</option>
                            <option value="RECIBO">Recibo</option>
                            <option value="DUPLICATA">Duplicata</option>
                            <option value="OUTROS">Outros</option>
                          </select>
                        </div>
                      </div>

                      {pessoaSel && novoForm.operacao_gerencial_id && pessoaSel.cpf_cnpj && (
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: salvarComoRegra ? "#EBF5EB" : "#F4F6FA", border: `0.5px solid ${salvarComoRegra ? "#86C78A" : "#DDE2EE"}`, borderRadius: 8, cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={salvarComoRegra} onChange={e => setSalvarComoRegra(e.target.checked)} style={{ marginTop: 1, flexShrink: 0, accentColor: "#16A34A" }} />
                          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 600, color: salvarComoRegra ? "#166534" : "#1a1a1a" }}>Salvar como regra de classificação automática</span>
                            <span style={{ color: "#888", display: "block", fontSize: 11, marginTop: 2 }}>
                              Próximas NFs de <strong>{pessoaSel.nome}</strong> serão classificadas automaticamente como <strong>{ogSelecionada?.descricao ?? "—"}</strong>
                            </span>
                          </div>
                        </label>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 12 }}>
                        <div>
                          <label style={lbl}>Descrição {!novoForm.pessoa_id && <span style={{ color: "#E24B4A" }}>*</span>}</label>
                          <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: Compra de herbicida — Talhão 3" value={novoForm.descricao} onChange={e => setNovoForm(p => ({ ...p, descricao: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>1º Vencimento *</label>
                          <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} type="date" value={novoForm.data_vencimento} onChange={e => setNovoForm(p => ({ ...p, data_vencimento: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Forma de Pagamento</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.forma_pagamento} onChange={e => setNovoForm(p => ({ ...p, forma_pagamento: e.target.value }))}>
                            {FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={lbl}>Conta de Pagamento</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.conta_pagamento} onChange={e => setNovoForm(p => ({ ...p, conta_pagamento: e.target.value }))}>
                            <option value="">— Selecionar —</option>
                            {contasNovo.map(c => {
                              const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                              return <option key={c.id} value={label}>{label}</option>;
                            })}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Centro de Custo</label>
                          <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.centro_custo_id} onChange={e => setNovoForm(p => ({ ...p, centro_custo_id: e.target.value }))}>
                            <option value="">— Sem vínculo —</option>
                            {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(c => (
                              <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Valor — por moeda */}
                      {novoForm.moeda === "BRL" && (
                        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Valor Total (R$) *</label>
                            <InputMonetario style={{ ...inp, width: "100%", boxSizing: "border-box", fontWeight: 600 }} value={novoForm.valor} onChange={v => setNovoForm(p => ({ ...p, valor: v }))} placeholder="0,00" />
                          </div>
                        </div>
                      )}
                      {novoForm.moeda === "USD" && (
                        <div style={{ display: "grid", gridTemplateColumns: "180px 160px 1fr", gap: 12, alignItems: "end" }}>
                          <div>
                            <label style={lbl}>Valor (US$) *</label>
                            <InputMonetario style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.valor} onChange={v => setNovoForm(p => ({ ...p, valor: v }))} placeholder="0,00" />
                          </div>
                          <div>
                            <label style={lbl}>Cotação R$/US$</label>
                            <InputMonetario decimais={4} style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.cotacao_usd} onChange={v => setNovoForm(p => ({ ...p, cotacao_usd: v }))} placeholder="5,12" />
                          </div>
                          {novoForm.valor > 0 && novoForm.cotacao_usd > 0 && (
                            <div style={{ background: "#FEF3E2", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7A4300" }}>
                              Equivalente: <strong>{fmtBRL(novoForm.valor * novoForm.cotacao_usd)}</strong>
                            </div>
                          )}
                        </div>
                      )}
                      {novoForm.moeda === "barter" && (
                        <div style={{ display: "grid", gridTemplateColumns: "140px 140px 180px", gap: 12 }}>
                          <div>
                            <label style={lbl}>Quantidade (sacas) *</label>
                            <InputNumerico style={{ ...inp, width: "100%", boxSizing: "border-box" }} decimais={0} min={0} value={novoForm.sacas} onChange={v => setNovoForm(p => ({ ...p, sacas: Number(v) || 0 }))} />
                          </div>
                          <div>
                            <label style={lbl}>Cultura</label>
                            <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.cultura_barter} onChange={e => setNovoForm(p => ({ ...p, cultura_barter: e.target.value }))}>
                              <option value="soja">Soja</option><option value="milho">Milho</option><option value="algodão">Algodão</option>
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Preço referência (R$/sc)</label>
                            <InputMonetario style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.preco_saca_barter} onChange={v => setNovoForm(p => ({ ...p, preco_saca_barter: v }))} placeholder="120,00" />
                          </div>
                        </div>
                      )}

                      {/* Condição de Pagamento */}
                      <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "end" }}>
                        <div>
                          <label style={lbl}>Condição de Pagamento</label>
                          <div style={{ display: "flex", border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                            {(["avista", "prazo", "recorrencia"] as const).map((v, idx) => (
                              <button key={v} type="button"
                                onClick={() => { setNovoForm(p => ({ ...p, condicao: v })); if (v !== "prazo") setParcelasNovo([]); }}
                                style={{ padding: "7px 14px", fontSize: 12, fontWeight: novoForm.condicao === v ? 600 : 400, cursor: "pointer", border: "none",
                                  borderRight: idx < 2 ? "0.5px solid #DDE2EE" : "none",
                                  background: novoForm.condicao === v ? "#111111" : "#F4F6FA", color: novoForm.condicao === v ? "#fff" : "#555", whiteSpace: "nowrap" }}>
                                {v === "avista" ? "À Vista" : v === "prazo" ? "Parcelado" : "Recorrência"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(novoForm.condicao === "prazo" || novoForm.condicao === "recorrencia") && (
                          <>
                            <div>
                              <label style={lbl}>{novoForm.condicao === "prazo" ? "Nº de parcelas" : "Nº de repetições"}</label>
                              <InputNumerico style={{ ...inp, width: 80 }} decimais={0} min={2} max={120} value={novoForm.qtd_parcelas} onChange={v => setNovoForm(p => ({ ...p, qtd_parcelas: Number(v) || 2 }))} />
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                              <div style={{ flex: 1 }}>
                                <label style={lbl}>Frequência</label>
                                <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.frequencia} onChange={e => setNovoForm(p => ({ ...p, frequencia: Number(e.target.value) }))}>
                                  <option value={1}>Mensal</option>
                                  <option value={2}>Bimestral</option>
                                  <option value={3}>Trimestral</option>
                                  <option value={6}>Semestral</option>
                                  <option value={12}>Anual</option>
                                </select>
                              </div>
                              {novoForm.condicao === "prazo" && (
                                <button type="button"
                                  onClick={() => gerarParcelasNovo(novoForm.data_vencimento, novoForm.qtd_parcelas, novoForm.frequencia, novoForm.valor)}
                                  disabled={!novoForm.data_vencimento || !novoForm.valor}
                                  style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid #93C5FD", background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", opacity: !novoForm.data_vencimento || !novoForm.valor ? 0.4 : 1 }}>
                                  Gerar
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {novoForm.condicao === "prazo" && parcelasNovo.length === 0 && (
                        <div style={{ fontSize: 11, color: "#888", padding: "10px 14px", background: "#F4F6FA", borderRadius: 7, border: "0.5px solid #DDE2EE" }}>
                          Preencha o Vencimento e Valor, depois clique em &quot;Gerar&quot;.
                        </div>
                      )}
                      {novoForm.condicao === "prazo" && parcelasNovo.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#F4F6FA" }}>
                                {["#", "Vencimento", "Valor (R$)"].map((h, i) => (
                                  <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {parcelasNovo.map((p, i) => (
                                <tr key={i} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                                  <td style={{ padding: "4px 10px", textAlign: "center", color: "#888", fontSize: 11, width: 40 }}>{i + 1}/{parcelasNovo.length}</td>
                                  <td style={{ padding: "4px 8px" }}>
                                    <input style={{ ...inp, fontSize: 12, width: "100%", boxSizing: "border-box" }} type="date" value={p.data}
                                      onChange={e => setParcelasNovo(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))} />
                                  </td>
                                  <td style={{ padding: "4px 8px" }}>
                                    <InputMonetario style={{ ...inp, fontSize: 12, textAlign: "right", width: "100%", boxSizing: "border-box" }} value={p.valor}
                                      onChange={v => setParcelasNovo(prev => prev.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: "#F4F6FA" }}>
                                <td colSpan={2} style={{ padding: "6px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#888" }}>Total:</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>{fmtBRL(parcelasNovo.reduce((s, p) => s + p.valor, 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {novoForm.condicao === "recorrencia" && novoForm.valor > 0 && (
                        <div style={{ background: "#FFFBEB", border: "0.5px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#555" }}>
                          O mesmo valor é lançado <strong>{Math.max(2, novoForm.qtd_parcelas)}×</strong>.
                          <span style={{ float: "right", fontWeight: 700 }}>Total: {fmtBRL(novoForm.valor * Math.max(2, novoForm.qtd_parcelas))}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {novoTab === "adicionais" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {!ehEmpresa && (
                    <div>
                      <label style={lbl}>Empresa (não-rural)</label>
                      <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.empresa_id} onChange={e => setNovoForm(p => ({ ...p, empresa_id: e.target.value }))}>
                        <option value="">— Fazenda (padrão) —</option>
                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}{e.razao_social && e.razao_social !== e.nome ? ` — ${e.razao_social}` : ""}</option>)}
                      </select>
                    </div>
                  )}
                  {ehEmpresa && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Forma de Pagamento</label>
                        <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.forma_pagamento} onChange={e => setNovoForm(p => ({ ...p, forma_pagamento: e.target.value }))}>
                          {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Conta Bancária</label>
                        <select style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.conta_pagamento} onChange={e => setNovoForm(p => ({ ...p, conta_pagamento: e.target.value }))}>
                          <option value="">— Nenhuma —</option>
                          {contasNovo.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Nº Documento</label>
                        <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={novoForm.numero_documento} onChange={e => setNovoForm(p => ({ ...p, numero_documento: e.target.value }))} placeholder="NF, Boleto, Recibo..." />
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>Observação</label>
                      <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Opcional" value={novoForm.observacao} onChange={e => setNovoForm(p => ({ ...p, observacao: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Documentos — só disponível editando um título já existente (precisa
                  do id real pra vincular os anexos); 1 MB por arquivo em cada seção ── */}
              {novoTab === "documentos" && editandoId && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Nota Fiscal</div>
                    <AnexoDocumentos entidade_tipo="lancamento_cp_nf" entidade_id={editandoId} fazenda_id={fazendaId ?? ""} maxBytes={1024 * 1024} label="Nota Fiscal" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Documento de Pagamento (Boleto)</div>
                    <AnexoDocumentos entidade_tipo="lancamento_cp_boleto" entidade_id={editandoId} fazenda_id={fazendaId ?? ""} maxBytes={1024 * 1024} label="Boleto" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Comprovante de Pagamento</div>
                    <AnexoDocumentos entidade_tipo="lancamento_cp_comprovante" entidade_id={editandoId} fazenda_id={fazendaId ?? ""} maxBytes={1024 * 1024} label="Comprovante" />
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", gap: 8, alignItems: "center" }}>
              {erroNovo && (
                <div style={{ flex: 1, background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 7, padding: "7px 12px", fontSize: 11, color: "#791F1F" }}>
                  {erroNovo}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button onClick={() => setModalNovo(false)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
                <button onClick={salvarNovo} disabled={salvandoAcao}
                  style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                  {salvandoAcao ? "Salvando…" : editandoId ? "✓ Salvar alterações" : !ehEmpresa && novoForm.condicao === "prazo" && parcelasNovo.length > 0 ? `◈ Criar ${parcelasNovo.length} parcelas` : !ehEmpresa && novoForm.condicao === "recorrencia" ? `◈ Criar ${Math.max(2, novoForm.qtd_parcelas)} repetições` : "Salvar Lançamento"}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
