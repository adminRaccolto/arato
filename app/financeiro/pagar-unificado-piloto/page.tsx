"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO 3 — Contas a Pagar unificado (Produtor + Empresa), pedido do dono
// 01/10/2026: "reunificar os lançamentos de PF e PJ no financeiro e tratar
// somente F.C. separadamente".
//
// Lista vem de rel_lancamentos (tipo='pagar'), filtrando os dois PF/PJ
// juntos. Ações (Baixar/Reprogramar/Reabrir) chamam as MESMAS rotinas que
// as telas reais já usam hoje — nada de lógica financeira nova:
//   Produtor: baixarLancamento()/reabrirLancamento()/atualizarLancamento()
//             (lib/db.ts — a mesma usada em app/financeiro/pagar/page.tsx)
//   Empresa:  fetch /api/empresa-lancamentos/baixar (acao baixar/reabrir/
//             reprogramar — a mesma usada em app/empresas/pagar/page.tsx)
//
// Fora do menu, só leitura+escrita de teste. Não substitui app/financeiro/
// pagar nem app/empresas/pagar ainda — essa troca só acontece depois de
// validado aqui.
//
// Escopo deliberadamente fora deste piloto (fica pra depois, se aprovado):
// pagamento em lote/borderô. O objetivo aqui é validar o motor unificado
// (listar + lançar + baixar individual com encargos + reprogramar + reabrir).
//
// Achado real 01/10/2026: a 1ª versão só tinha a parte de RELATÓRIO (listar/
// filtrar/baixar um lançamento já existente) — faltava a tela de LANÇAMENTO
// (criar um CP novo do zero). Adicionado "+ Novo Lançamento", roteando pra
// criarLancamento() (produtor) ou criarEmpresaLancamento() (empresa)
// conforme a Origem escolhida no próprio formulário.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
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
  operacao_gerencial_nome: string | null;
  conta_bancaria: string | null;
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

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };

export default function PagarUnificadoPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [filtroAberto, setFiltroAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelLancamento[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

  const [fOrigem,  setFOrigem]  = useState<Set<string>>(new Set());
  const [fStatus,  setFStatus]  = useState<Set<string>>(new Set());
  const [fBusca,   setFBusca]   = useState("");
  const [fDataDe,  setFDataDe]  = useState("");
  const [fDataAte, setFDataAte] = useState("");

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

  async function aplicarFiltro() {
    setCarregando(true);
    setErro("");
    const t0 = performance.now();
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
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
      q = q.order("data_vencimento", { ascending: true }).limit(500);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelLancamento[]);
      setTempoMs(Math.round(performance.now() - t0));
      setFiltroAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_lancamentos — a migration da Seção 312 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  const limparFiltro = () => { setFOrigem(new Set()); setFStatus(new Set()); setFBusca(""); setFDataDe(""); setFDataAte(""); };
  const temFiltro = fOrigem.size > 0 || fStatus.size > 0 || fBusca || fDataDe || fDataAte;

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
    setBData(new Date().toISOString().slice(0, 10));
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
      await aplicarFiltro();
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
        const hoje = new Date().toISOString().slice(0, 10);
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
      await aplicarFiltro();
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
      await aplicarFiltro();
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
    setNovoForm({ ...NOVO_VAZIO, data_vencimento: new Date().toISOString().slice(0, 10) });
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
      const hoje = new Date().toISOString().slice(0, 10);
      if (novoForm.origem === "lancamentos") {
        await criarLancamento({
          fazenda_id: fazendaId, tipo: "pagar", moeda: novoForm.moeda, descricao: novoForm.descricao.trim(),
          categoria: novoForm.categoria.trim() || "Outros", data_lancamento: hoje, data_vencimento: novoForm.data_vencimento,
          valor, status: novoForm.data_vencimento < hoje ? "vencido" : "em_aberto", auto: false,
          pessoa_id: novoForm.pessoa_id || undefined, centro_custo_id: novoForm.centro_custo_id || undefined,
          observacao: novoForm.observacao.trim() || undefined,
        });
      } else {
        await criarEmpresaLancamento({
          fazenda_id: fazendaId, empresa_id: novoForm.empresa_id, tipo: "pagar", descricao: novoForm.descricao.trim(),
          categoria: novoForm.categoria.trim() || undefined, valor, moeda: novoForm.moeda, data_vencimento: novoForm.data_vencimento,
          status: novoForm.data_vencimento < hoje ? "pendente" : "pendente",
          pessoa_id: novoForm.pessoa_id || undefined, centro_custo: novoForm.centro_custo_texto.trim() || undefined,
          observacao: novoForm.observacao.trim() || undefined,
        });
      }
      setModalNovo(false);
      await aplicarFiltro();
    } catch (e: unknown) {
      setErroNovo(e instanceof Error ? e.message : "Erro ao criar lançamento");
    } finally {
      setSalvandoAcao(false);
    }
  }

  const totalPagar = (resultado ?? []).reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalAberto = (resultado ?? []).filter(l => l.status_normalizado !== "baixado" && l.status_normalizado !== "cancelado").reduce((s, l) => s + Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0)), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1450, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto 3 — Contas a Pagar unificado (Produtor + Empresa)</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Fora do menu. Baixar/Reprogramar/Reabrir chamam as mesmas rotinas das telas reais. Não substitui nada ainda.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Contas a Pagar — piloto unificado</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={abrirNovo} style={{ ...inp, background: "#16A34A", color: "#fff", fontWeight: 600, cursor: "pointer", border: "none" }}>
              + Novo Lançamento
            </button>
            <button onClick={() => setFiltroAberto(true)} style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              🔍 Filtro
            </button>
          </div>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#791F1F" }}>
            {erro}
          </div>
        )}

        {resultado === null && !carregando && !erro && (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 48, textAlign: "center", color: "#888" }}>
            Defina o filtro e clique em Aplicar pra consultar.
          </div>
        )}

        {resultado !== null && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
              <span><strong>{resultado.length}</strong> lançamento(s)</span>
              <span>·</span>
              <span>Total: <strong>{fmtBRL(totalPagar)}</strong></span>
              <span>·</span>
              <span>Saldo em aberto: <strong style={{ color: "#E24B4A" }}>{fmtBRL(totalAberto)}</strong></span>
              <span>·</span>
              <span style={{ color: "#16A34A" }}>Consulta em {tempoMs}ms</span>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Origem", "Fornecedor", "Descrição", "Centro Custo", "Vencimento", "Baixa", "Valor", "Pago", "Status", "Ações"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(l => {
                    const sm = STATUS_OPCOES.find(s => s.v === l.status_normalizado);
                    const aberto = l.status_normalizado === "em_aberto" || l.status_normalizado === "vencido" || l.status_normalizado === "parcial";
                    return (
                      <tr key={l.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: l.origem_tabela === "lancamentos" ? "#E6F1FB" : "#F5F3FF", color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6", padding: "2px 7px", borderRadius: 6 }}>
                            {l.origem_tabela === "lancamentos" ? "Produtor" : "Empresa"}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px" }}>{l.empresa_nome ?? l.pessoa_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.centro_custo_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(l.data_vencimento)}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(l.data_baixa)}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: "#E24B4A" }}>{fmtBRL(l.valor)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(l.valor_pago)}</td>
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
                  {resultado.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento encontrado para esse filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ══ POPUP DE FILTRO ══ */}
      {filtroAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => resultado !== null && setFiltroAberto(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 26, width: "min(94vw, 560px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Filtrar Contas a Pagar</h2>
              {resultado !== null && (
                <button onClick={() => setFiltroAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Buscar (descrição, fornecedor)</label>
              <input value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="Ex: Adubo, ADM, Muriana..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Origem</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                  {ORIGEM_OPCOES.map(o => (
                    <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fOrigem.has(o.v)} onChange={() => toggle(fOrigem, setFOrigem, o.v)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                  {STATUS_OPCOES.map(s => (
                    <label key={s.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fStatus.has(s.v)} onChange={() => toggle(fStatus, setFStatus, s.v)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Vencimento de</label>
                <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Vencimento até</label>
                <input type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {temFiltro && (
                <button onClick={limparFiltro} style={{ ...inp, background: "#fff", cursor: "pointer", color: "#555" }}>Limpar</button>
              )}
              <button onClick={aplicarFiltro} disabled={carregando}
                style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 700, cursor: "pointer", padding: "9px 20px" }}>
                {carregando ? "Consultando..." : "Aplicar Filtro"}
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
              <h2 style={{ margin: 0, fontSize: 15, color: "#0B2D50" }}>+ Novo Lançamento — Contas a Pagar</h2>
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
                <label style={lbl}>Fornecedor</label>
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
