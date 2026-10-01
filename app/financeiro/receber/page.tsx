"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Contas a Receber — unificado (Produtor + Empresa). Promovida de piloto pra
// tela real em 01/10/2026, a pedido do dono: "reunificar os lançamentos de
// PF e PJ no financeiro e tratar somente F.C. separadamente".
//
// Lista vem de rel_lancamentos (tipo='receber'), trazendo Produtor e Empresa
// juntos (coluna Origem). Ações (Baixar/Reprogramar/Reabrir/Novo) chamam as
// MESMAS rotinas que já existiam nas duas telas separadas — nada de lógica
// financeira nova:
//   Produtor: baixarLancamento()/reabrirLancamento()/atualizarLancamento()/
//             criarLancamento() (lib/db.ts)
//   Empresa:  fetch /api/empresa-lancamentos/baixar (acao baixar/reabrir/
//             reprogramar) + criarEmpresaLancamento()
//
// A versão antiga (só produtor) fica guardada em page.legado.tsx — NÃO é
// rota, só referência. app/empresas/receber/page.tsx (a tela separada de
// Empresa) também fica, intocada, mas sem link no menu — essa tela aqui
// cobre o mesmo dado agora.
//
// Validado antes como piloto: relatório (filtra, gera documento) nunca fica
// dentro da tela de lançamento — isso tem ambiente próprio em Financeiro →
// Relatórios. Esta tela é só grid de trabalho: carrega direto (período
// padrão hoje até +3 meses), filtros como barra sempre visível.
//
// Baixar em Lote (01/10/2026): mesma lógica do Contas a Pagar (ver
// app/financeiro/pagar/page.tsx) — seleção via checkbox, barra flutuante,
// modal com data/conta únicas + multa/juros/desconto por título. Cada baixa
// chama a mesma rotina de sempre conforme a origem (produtor/empresa).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import {
  baixarLancamento, reabrirLancamento, atualizarLancamento, listarContas, listarContasPorEmpresa,
  criarLancamento, criarEmpresaLancamento, listarPessoasDaConta, listarEmpresasDaConta, listarCentrosCustoGeralDaConta,
} from "../../../lib/db";
import type { ContaBancaria, Pessoa, Empresa, CentroCusto } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

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

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lblMini: React.CSSProperties = { fontSize: 10, color: "#888", fontWeight: 600, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const chip = (ativo: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: ativo ? "1.5px solid #2A2A2A" : "0.5px solid #DDE2EE", background: ativo ? "#2A2A2A" : "#fff", color: ativo ? "#fff" : "#555",
});

export default function ContasAReceberPage() {
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
      let q = supabase.from("rel_lancamentos").select("*").eq("tipo", "receber");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fOrigem.size > 0) q = q.in("origem_tabela", Array.from(fOrigem));
      if (fStatus.size > 0) q = q.in("status_normalizado", Array.from(fStatus));
      if (fDataDe) q = q.gte("data_vencimento", fDataDe);
      if (fDataAte) q = q.lte("data_vencimento", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`descricao.ilike.%${t}%,pessoa_nome.ilike.%${t}%,empresa_nome.ilike.%${t}%`);
      }
      q = q.order("data_vencimento", { ascending: true }).limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelLancamento[]);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_lancamentos — a migration da Seção 312 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, fazendaIds?.join(","), contaId]);

  // Carrega automaticamente ao abrir a tela (período padrão) — nunca espera
  // o usuário escolher filtro primeiro. Refiltrar é sempre sobre o que já
  // está carregado; só período/busca disparam nova consulta (botão Atualizar).
  useEffect(() => { carregar(); }, [carregar]);

  // Filtro client-side de Origem/Status (instantâneo, sem nova consulta) —
  // período e busca exigem nova consulta porque mudam o WHERE no banco.
  const linhas = (resultado ?? []).filter(l => {
    if (fOrigem.size > 0 && !fOrigem.has(l.origem_tabela)) return false;
    if (fStatus.size > 0 && !fStatus.has(l.status_normalizado ?? "")) return false;
    return true;
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

  // ── Novo Lançamento (criar) ───────────────────────────────────
  const NOVO_VAZIO = {
    origem: "lancamentos" as "lancamentos" | "empresa_lancamentos",
    empresa_id: "", pessoa_id: "", descricao: "", categoria: "",
    valor: "", moeda: "BRL" as "BRL" | "USD", data_vencimento: "",
    centro_custo_id: "", centro_custo_texto: "", observacao: "",
  };
  const [modalNovo, setModalNovo] = useState(false);
  const [novoForm,  setNovoForm]  = useState(NOVO_VAZIO);
  const [erroNovo,  setErroNovo]  = useState("");

  function abrirNovo() {
    setErroNovo("");
    setNovoForm({ ...NOVO_VAZIO, data_vencimento: hojeISO() });
    setModalNovo(true);
  }

  async function salvarNovo() {
    if (!fazendaId) return;
    if (!novoForm.descricao.trim() || !novoForm.valor || !novoForm.data_vencimento) {
      setErroNovo("Preencha descrição, valor e vencimento."); return;
    }
    if (novoForm.origem === "empresa_lancamentos" && !novoForm.empresa_id) {
      setErroNovo("Selecione a empresa."); return;
    }
    setSalvandoAcao(true);
    setErroNovo("");
    try {
      const valor = numBR(novoForm.valor);
      const hoje = hojeISO();
      if (novoForm.origem === "lancamentos") {
        await criarLancamento({
          fazenda_id: fazendaId, tipo: "receber", moeda: novoForm.moeda, descricao: novoForm.descricao.trim(),
          categoria: novoForm.categoria.trim() || "Outros", data_lancamento: hoje, data_vencimento: novoForm.data_vencimento,
          valor, status: novoForm.data_vencimento < hoje ? "vencido" : "em_aberto", auto: false,
          pessoa_id: novoForm.pessoa_id || undefined, centro_custo_id: novoForm.centro_custo_id || undefined,
          observacao: novoForm.observacao.trim() || undefined,
        });
      } else {
        await criarEmpresaLancamento({
          fazenda_id: fazendaId, empresa_id: novoForm.empresa_id, tipo: "receber", descricao: novoForm.descricao.trim(),
          categoria: novoForm.categoria.trim() || undefined, valor, moeda: novoForm.moeda, data_vencimento: novoForm.data_vencimento,
          status: "pendente",
          pessoa_id: novoForm.pessoa_id || undefined, centro_custo: novoForm.centro_custo_texto.trim() || undefined,
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
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote, setModalLote] = useState(false);
  const [loteData, setLoteData] = useState("");
  const [loteConta, setLoteConta] = useState("");
  const [loteContasOpcoes, setLoteContasOpcoes] = useState<ContaBancaria[]>([]);
  const [loteEncargos, setLoteEncargos] = useState<Record<string, { multa: string; juros: string; desconto: string }>>({});
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [erroLote, setErroLote] = useState("");

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

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "20px 24px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Contas a Receber</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>Produtor e Empresa juntos — veja a coluna Origem</p>
          </div>
          <button onClick={abrirNovo} style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 600, cursor: "pointer", border: "none", width: "auto", padding: "9px 18px" }}>
            + Novo Lançamento
          </button>
        </div>

        {/* ── Barra de filtros SEMPRE VISÍVEL (não popup) ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label style={lblMini}>Buscar</label>
            <input value={fBusca} onChange={e => setFBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && carregar()} placeholder="Descrição, cliente..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
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

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
          <span><strong>{linhas.length}</strong> lançamento(s)</span>
          <span>·</span>
          <span>Total: <strong>{fmtBRL(totalPagar)}</strong></span>
          <span>·</span>
          <span>Saldo a receber: <strong style={{ color: "#16A34A" }}>{fmtBRL(totalAberto)}</strong></span>
        </div>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F4F6FA" }}>
                <th style={{ padding: "7px 10px", borderBottom: "0.5px solid #DDE2EE" }}>
                  <input type="checkbox" checked={idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionados.has(id))} onChange={toggleTodos} />
                </th>
                {["Origem", "Nº", "Cliente", "Descrição", "Operação", "Safra", "Ciclo", "Centro Custo", "Vencimento", "Dias", "Venc. Original", "Baixa", "Valor", "Pago", "Saldo", "Moeda", "Conta", "Nº NF", "Lançado via", "Observação", "Status", "Ações"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={23} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
              )}
              {!carregando && linhas.map(l => {
                const sm = STATUS_OPCOES.find(s => s.v === l.status_normalizado);
                const aberto = l.status_normalizado === "em_aberto" || l.status_normalizado === "vencido" || l.status_normalizado === "parcial";
                const dias = diasVencimento(l.data_vencimento, l.status_normalizado);
                const saldo = Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0));
                return (
                  <tr key={l.id} style={{ borderBottom: "0.5px solid #F0F2F7", background: selecionados.has(l.id) ? "#F0F7FF" : undefined }}>
                    <td style={{ padding: "7px 10px" }}>
                      {aberto && <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} />}
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: l.origem_tabela === "lancamentos" ? "#E6F1FB" : "#F5F3FF", color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6", padding: "2px 7px", borderRadius: 6 }}>
                        {l.origem_tabela === "lancamentos" ? "Produtor" : "Empresa"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{l.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.empresa_nome ?? l.pessoa_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.operacao_gerencial_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.ano_safra_descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.ciclo_descricao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.centro_custo_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{fmtData(l.data_vencimento)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: dias != null && dias < 0 ? "#E24B4A" : "#555" }}>{dias ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontStyle: "italic" }}>{l.data_prorrogacao ? fmtData(l.data_prorrogacao) : "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{fmtData(l.data_baixa)}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: "#16A34A" }}>{fmtBRL(l.valor)}</td>
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
                <tr><td colSpan={23} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento encontrado para esse filtro/período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
          <button onClick={() => setSelecionados(new Set())} style={{ background: "none", border: "0.5px solid #555", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Cancelar
          </button>
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
                <label style={lbl}>Data do recebimento *</label>
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
                <span style={{ textAlign: "center" }}>Desconto</span><span style={{ textAlign: "right" }}>A receber</span>
              </div>
              {itensLote.map((l, i) => {
                const e = encargoLoteDe(l.id);
                const inpMini: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "0.5px solid #DDE2EE", borderRadius: 5, fontSize: 11, textAlign: "right", background: "#fff", boxSizing: "border-box", outline: "none" };
                return (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "60px 1.6fr 68px 80px 70px 70px 70px 90px", gap: 6, padding: "6px 10px", borderTop: i > 0 ? "0.5px solid #F0F2F7" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6" }}>{l.origem_tabela === "lancamentos" ? "Produtor" : "Empresa"}</span>
                    <span style={{ color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.empresa_nome ?? l.pessoa_nome ?? l.descricao}</span>
                    <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ color: "#888", textAlign: "right", whiteSpace: "nowrap", fontSize: 11 }}>{fmtBRL(saldoLote(l))}</span>
                    <input value={e.multa} onChange={ev => setEncargoLote(l.id, "multa", ev.target.value)} style={inpMini} />
                    <input value={e.juros} onChange={ev => setEncargoLote(l.id, "juros", ev.target.value)} style={inpMini} />
                    <input value={e.desconto} onChange={ev => setEncargoLote(l.id, "desconto", ev.target.value)} style={inpMini} />
                    <span style={{ fontWeight: 700, color: "#16A34A", textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(valorFinalLote(l))}</span>
                  </div>
                );
              })}
              <div style={{ background: "#F4F6FA", padding: "8px 10px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #DDE2EE" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total a receber (já com encargos)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#16A34A" }}>{fmtBRL(itensLote.reduce((s, l) => s + valorFinalLote(l), 0))}</span>
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
      {modalNovo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalNovo(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(94vw, 520px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>+ Novo Lançamento — Contas a Receber</h2>
              <button onClick={() => setModalNovo(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            <div style={{ marginBottom: 14 }}>
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

            {novoForm.origem === "empresa_lancamentos" && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Empresa *</label>
                <select value={novoForm.empresa_id} onChange={e => setNovoForm(p => ({ ...p, empresa_id: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome || e.razao_social}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Descrição *</label>
              <input value={novoForm.descricao} onChange={e => setNovoForm(p => ({ ...p, descricao: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: Compra de adubo — NF 1234" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Cliente</label>
                <select value={novoForm.pessoa_id} onChange={e => setNovoForm(p => ({ ...p, pessoa_id: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Categoria</label>
                <input value={novoForm.categoria} onChange={e => setNovoForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Ex: Insumos" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Valor *</label>
                <input value={novoForm.valor} onChange={e => setNovoForm(p => ({ ...p, valor: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>Moeda</label>
                <select value={novoForm.moeda} onChange={e => setNovoForm(p => ({ ...p, moeda: e.target.value as "BRL" | "USD" }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="BRL">R$ (Real)</option>
                  <option value="USD">US$ (Dólar)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Vencimento *</label>
                <input type="date" value={novoForm.data_vencimento} onChange={e => setNovoForm(p => ({ ...p, data_vencimento: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Centro de Custo</label>
              {novoForm.origem === "lancamentos" ? (
                <select value={novoForm.centro_custo_id} onChange={e => setNovoForm(p => ({ ...p, centro_custo_id: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Selecionar...</option>
                  {centrosCusto.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              ) : (
                <input value={novoForm.centro_custo_texto} onChange={e => setNovoForm(p => ({ ...p, centro_custo_texto: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Texto livre — empresa não tem CC cadastrado" />
              )}
            </div>

            <div>
              <label style={lbl}>Observação</label>
              <input value={novoForm.observacao} onChange={e => setNovoForm(p => ({ ...p, observacao: e.target.value }))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            </div>

            {erroNovo && <div style={{ marginTop: 12, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 10px", borderRadius: 6 }}>{erroNovo}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setModalNovo(false)} style={{ ...inp, background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarNovo} disabled={salvandoAcao}
                style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 700, cursor: "pointer", border: "none" }}>
                {salvandoAcao ? "Salvando..." : "Salvar Lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
