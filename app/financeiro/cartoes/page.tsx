"use client";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalGrid, OperationalHeading } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import InputData from "../../../components/InputData";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarCartoesDaConta,
  criarCartao,
  atualizarCartao,
  excluirCartao,
  listarFaturasDaConta,
  listarLancamentosDaFatura,
  fecharFatura,
  reabrirFatura,
  vincularLancamentoFatura,
  competenciaFatura,
  autoFecharFaturasVencidas,
  pagarFaturaCartao,
  listarContasProdutorDaConta,
} from "../../../lib/db";
import type { CartaoCredito, FaturaCartao, Lancamento, ContaBancaria } from "../../../lib/supabase";
import { confirmarEstornoCartao } from "../../../components/financeiro/ConfirmarEstornoCartao";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData   = (s?: string | null) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };

const BANDEIRA_LABEL: Record<string, string> = {
  visa: "Visa", master: "Mastercard", elo: "Elo",
  amex: "Amex", hipercard: "Hipercard", outros: "Outros",
};
const BANDEIRA_COR: Record<string, string> = {
  visa: "#1A4870", master: "#E24B4A", elo: "#3D8B37",
  amex: "#6B7C93", hipercard: "#C9921B", outros: "#888",
};

const STATUS_LABEL: Record<string, string> = { aberta: "Aberta", fechada: "Fechada", paga: "Paga" };
const STATUS_COR: Record<string, { bg: string; cor: string }> = {
  aberta:  { bg: "#EEF4FF", cor: "#1e40af" },
  fechada: { bg: "#FBF3E0", cor: "#7A5A12" },
  paga:    { bg: "#EAF3DE", cor: "#1A5C38" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type Aba = "cartoes" | "faturas" | "conciliacao";

const BANDEIRAS = ["visa","master","elo","amex","hipercard","outros"] as const;

type FormCartao = {
  titular: string; banco: string; bandeira: CartaoCredito["bandeira"];
  numero_final: string; dia_fechamento: string; dia_vencimento: string;
  limite: string; observacao: string; ativo: boolean;
};
const FORM_VAZIO: FormCartao = {
  titular: "", banco: "", bandeira: "visa", numero_final: "",
  dia_fechamento: "1", dia_vencimento: "10", limite: "", observacao: "", ativo: true,
};

// ─── Tipos para conciliação ───────────────────────────────────────────────────
interface LinhaExtrato {
  data: string; descricao: string; valor: number;
  _status: "pendente" | "conciliado" | "divergente";
  _lancId?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function CartoesCredito() {
  const { contaId, fazendaId } = useAuth();
  const [aba, setAba] = useState<Aba>("cartoes");

  // ── Estado da aba Cartões ──────────────────────────────────────────────────
  const [modalCartao,    setModalCartao]    = useState(false);
  const [editandoCartao, setEditandoCartao] = useState<CartaoCredito | null>(null);
  const [formCartao,     setFormCartao]     = useState<FormCartao>(FORM_VAZIO);
  const [salvandoCartao, setSalvandoCartao] = useState(false);
  const [erroCartao,     setErroCartao]     = useState("");

  const [cartoes,  setCartoes]  = useState<CartaoCredito[]>([]);
  const [faturas,  setFaturas]  = useState<FaturaCartao[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [cartaoFiltro, setCartaoFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");

  const [faturaAberta, setFaturaAberta] = useState<FaturaCartao | null>(null);
  const [lançsFatura,  setLançsFatura]  = useState<Lancamento[]>([]);
  const [loadingLanc,  setLoadingLanc]  = useState(false);

  // Pagar Fatura — o único evento que move dinheiro de verdade
  const [contasPagamento, setContasPagamento] = useState<ContaBancaria[]>([]);
  const [faturaPagar,     setFaturaPagar]     = useState<FaturaCartao | null>(null);
  const [pagarConta,      setPagarConta]      = useState("");
  const [pagarData,       setPagarData]       = useState(() => hojeLocal());
  const [pagandoFatura,   setPagandoFatura]   = useState(false);
  const [erroPagarFatura, setErroPagarFatura] = useState("");

  // Conciliação
  const [cartaoConcil,  setCartaoConcil]  = useState<string>("");
  const [faturaConcil,  setFaturaConcil]  = useState<string>("");
  const [linhasExtrato, setLinhasExtrato] = useState<LinhaExtrato[]>([]);
  const [lancFatura,    setLancFatura]    = useState<Lancamento[]>([]);
  const [loadingConc,   setLoadingConc]   = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!contaId) return;
    setLoading(true);
    // Fecha sozinha qualquer fatura 'aberta' cuja data de fechamento já
    // passou, antes de listar — não tem cron pra isso (achado real 08/10/2026:
    // basta checar toda vez que a tela é aberta, "fechamento" só precisa
    // acontecer antes da próxima vez que alguém olhar pra fatura).
    autoFecharFaturasVencidas(contaId).catch(() => {}).finally(() => {
      Promise.all([
        listarCartoesDaConta(contaId),
        listarFaturasDaConta(contaId),
        listarContasProdutorDaConta(contaId),
      ]).then(([c, f, cb]) => {
        setCartoes(c);
        setFaturas(f);
        setContasPagamento(cb);
      }).finally(() => setLoading(false));
    });
  }, [contaId]);

  const faturasFiltradas = useMemo(() => {
    let f = faturas;
    if (cartaoFiltro !== "todos") f = f.filter(x => x.cartao_id === cartaoFiltro);
    if (statusFiltro !== "todos") f = f.filter(x => x.status === statusFiltro);
    return f;
  }, [faturas, cartaoFiltro, statusFiltro]);

  const totalAberto  = faturas.filter(f => f.status !== "paga").reduce((s, f) => s + f.valor_total, 0);
  const totalFatura  = faturas.length;
  const totalPago    = faturas.filter(f => f.status === "paga").reduce((s, f) => s + f.valor_total, 0);

  // ── CRUD de cartões ───────────────────────────────────────────────────────
  const abrirNovoCartao = () => {
    setEditandoCartao(null);
    setFormCartao(FORM_VAZIO);
    setErroCartao("");
    setModalCartao(true);
  };
  const abrirEditarCartao = (c: CartaoCredito) => {
    setEditandoCartao(c);
    setFormCartao({
      titular: c.titular, banco: c.banco ?? "", bandeira: c.bandeira,
      numero_final: c.numero_final ?? "", dia_fechamento: String(c.dia_fechamento),
      dia_vencimento: String(c.dia_vencimento), limite: c.limite ? String(c.limite) : "",
      observacao: c.observacao ?? "", ativo: c.ativo,
    });
    setErroCartao("");
    setModalCartao(true);
  };
  const salvarCartaoModal = async () => {
    if (!contaId) return;
    if (!formCartao.titular.trim()) { setErroCartao("Informe o titular do cartão."); return; }
    if (!formCartao.dia_fechamento || !formCartao.dia_vencimento) { setErroCartao("Informe os dias de fechamento e vencimento."); return; }
    setSalvandoCartao(true); setErroCartao("");
    try {
      const payload = {
        conta_id: contaId,
        fazenda_id: fazendaId ?? null,
        titular: formCartao.titular.trim(),
        banco: formCartao.banco.trim() || null,
        bandeira: formCartao.bandeira,
        numero_final: formCartao.numero_final.replace(/\D/g,"").slice(-4) || null,
        dia_fechamento: parseInt(formCartao.dia_fechamento) || 1,
        dia_vencimento: parseInt(formCartao.dia_vencimento) || 10,
        limite: formCartao.limite ? parseFloat(formCartao.limite.replace(/\./g,"").replace(",",".")) : null,
        observacao: formCartao.observacao.trim() || null,
        ativo: formCartao.ativo,
      };
      if (editandoCartao) {
        await atualizarCartao(editandoCartao.id, payload);
      } else {
        await criarCartao(payload);
      }
      const novos = await listarCartoesDaConta(contaId);
      setCartoes(novos);
      setModalCartao(false);
    } catch (e) { setErroCartao((e as Error).message); }
    setSalvandoCartao(false);
  };
  const deletarCartao = async (c: CartaoCredito) => {
    if (!confirm(`Excluir o cartão "${c.titular}"? Só é possível se não houver faturas vinculadas.`)) return;
    try {
      await excluirCartao(c.id);
      setCartoes(prev => prev.filter(x => x.id !== c.id));
    } catch (e) { alert((e as Error).message); }
  };

  // ── Detalhe da fatura ─────────────────────────────────────────────────────
  const abrirFatura = async (f: FaturaCartao) => {
    setFaturaAberta(f);
    setLoadingLanc(true);
    try {
      const lancs = await listarLancamentosDaFatura(f.id);
      setLançsFatura(lancs as Lancamento[]);
    } finally { setLoadingLanc(false); }
  };

  // Estorno de compra no cartão — confirma como aconteceu (retirar da fatura aberta, crédito em fatura seguinte ou reembolso)
  const estornarCompra = async (f: FaturaCartao, l: Lancamento) => {
    const escolha = await confirmarEstornoCartao({
      titulos: [{ id: l.id, descricao: l.descricao ?? "", valor: Number(l.valor), fatura: { status: f.status, mes: f.mes, ano: f.ano } }],
      permitirRetirar: true, permitirValorParcial: true,
      contexto: f.status === "aberta"
        ? "Fatura ainda aberta: se a compra foi cancelada antes de fechar, retire da fatura (o título volta ao Contas a Pagar em aberto). Se a loja ou a operadora devolveu, escolha crédito ou reembolso."
        : "Esta fatura já fechou: a operadora já cobrou a compra. Informe como o estorno chegou.",
    });
    if (!escolha) return;
    const r = await fetch("/api/financeiro/cartao", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "estornar_titulo", lancamento_id: l.id, ...escolha }) });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; feito?: string };
    if (!j.ok) { alert(j.error ?? `Erro HTTP ${r.status}`); return; }
    alert(`Estorno registrado: ${j.feito}.`);
    const atualizadas = await listarFaturasDaConta(contaId!);
    setFaturas(atualizadas);
    await abrirFatura(atualizadas.find(x => x.id === f.id) ?? f);
  };

  const toggleFecharFatura = async (f: FaturaCartao) => {
    if (f.status === "aberta") await fecharFatura(f.id);
    else await reabrirFatura(f.id);
    const atualizadas = await listarFaturasDaConta(contaId!);
    setFaturas(atualizadas);
    if (faturaAberta?.id === f.id) setFaturaAberta(atualizadas.find(x => x.id === f.id) ?? null);
  };

  // ── Pagar Fatura — único evento que move dinheiro de verdade ─────────────
  const abrirPagarFatura = (f: FaturaCartao) => {
    setFaturaPagar(f);
    setPagarConta("");
    setPagarData(hojeLocal());
    setErroPagarFatura("");
  };

  const confirmarPagarFatura = async () => {
    if (!faturaPagar) return;
    const cartao = cartoes.find(c => c.id === faturaPagar.cartao_id);
    if (!cartao) { setErroPagarFatura("Cartão não encontrado."); return; }
    if (!pagarConta) { setErroPagarFatura("Selecione a conta de pagamento."); return; }
    setPagandoFatura(true);
    setErroPagarFatura("");
    try {
      await pagarFaturaCartao(faturaPagar, cartao, pagarConta, pagarData);
      const atualizadas = await listarFaturasDaConta(contaId!);
      setFaturas(atualizadas);
      setFaturaPagar(null);
    } catch (e) {
      setErroPagarFatura(e instanceof Error ? e.message : "Erro ao pagar a fatura");
    } finally {
      setPagandoFatura(false);
    }
  };

  // ── Conciliação: parse do extrato ─────────────────────────────────────────
  const handleExtrato = async (file: File) => {
    setLoadingConc(true);
    try {
      const XLSX = await import("xlsx");
      const wb   = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const g = (r: Record<string, unknown>, ...keys: string[]) =>
        keys.reduce<string>((a, k) => a || String(r[k] ?? ""), "").trim();
      const linhas: LinhaExtrato[] = rows.map(r => {
        const dataRaw = g(r, "Data", "data", "DATE");
        let dataIso = dataRaw;
        if (dataRaw.includes("/")) {
          const p = dataRaw.split("/");
          if (p.length === 3) dataIso = `${p[2].length === 4 ? p[2] : "20"+p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
        }
        const val = parseFloat(g(r, "Valor", "valor", "AMOUNT").replace(/\./g,"").replace(",",".")) || 0;
        return { data: dataIso, descricao: g(r, "Descrição", "descricao", "DESCRIPTION", "Estabelecimento"), valor: Math.abs(val), _status: "pendente" as const };
      }).filter(l => l.valor > 0);
      setLinhasExtrato(linhas);

      // Carrega lançamentos da fatura para conciliar
      if (faturaConcil) {
        const lancs = await listarLancamentosDaFatura(faturaConcil);
        setLancFatura(lancs as Lancamento[]);
      }
    } finally { setLoadingConc(false); }
  };

  const conciliarLinha = (idx: number, lancId: string) => {
    setLinhasExtrato(prev => prev.map((l, i) => i === idx ? { ...l, _status: "conciliado", _lancId: lancId } : l));
  };
  const marcarDivergente = (idx: number) => {
    setLinhasExtrato(prev => prev.map((l, i) => i === idx ? { ...l, _status: "divergente" } : l));
  };

  const totalExtrato    = linhasExtrato.reduce((s, l) => s + l.valor, 0);
  const totalConciliado = linhasExtrato.filter(l => l._status === "conciliado").reduce((s, l) => s + l.valor, 0);
  const totalDivergente = linhasExtrato.filter(l => l._status === "divergente").reduce((s, l) => s + l.valor, 0);

  const faturasParaConcil = useMemo(() =>
    cartaoConcil ? faturas.filter(f => f.cartao_id === cartaoConcil) : [],
    [faturas, cartaoConcil]
  );

  // ─────────────────────────────────────────────────────────────────────────
  const inpS: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div data-arato-page="true" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, padding: "20px 24px" }}>

        <OperationalHeading as="header" data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Cartões de Crédito</h1>
          </div>
        </OperationalHeading>

        {/* KPI cards */}
        <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {([
            { label: "Cartões ativos",    val: cartoes.length,                  fmt: false },
            { label: "Total de faturas",  val: totalFatura,                     fmt: false },
            { label: "A pagar (em aberto)", val: totalAberto,                   fmt: true,  cor: "#E24B4A" },
            { label: "Pago no período",   val: totalPago,                       fmt: true,  cor: "#1A5C38" },
          ] as any[]).map((c, i) => (
            <div data-arato-statistic="display" key={i} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.cor ?? "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
                {c.fmt ? fmtBRL(c.val) : c.val}
              </div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
          <div data-arato-tabs="true" style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)" }}>
            {([["cartoes","💳 Meus Cartões"], ["faturas","Faturas"], ["conciliacao","Conciliação"]] as [Aba, string][]).map(([k, lbl]) => (
              <OperationalButton data-arato-tab-active={aba === (k)} data-arato-tab="true" data-arato-button="toggle" key={k} onClick={() => setAba(k)} style={{ padding: "10px 20px", border: "none", background: aba===k ? "#fff" : "var(--bg-card)", borderBottom: `2px solid ${aba===k ? "#1A5C38" : "transparent"}`, cursor: "pointer", fontSize: 13, fontWeight: aba===k ? 600 : 400, color: aba===k ? "#1A5C38" : "var(--text-2)" }}>
                {lbl}
              </OperationalButton>
            ))}
          </div>

          {/* ═══ CARTÕES ═══ */}
          {aba === "cartoes" && (
            <div data-arato-statistic="action" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <OperationalButton data-arato-button="primary" onClick={abrirNovoCartao}
                  style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  + Novo Cartão
                </OperationalButton>
              </div>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Carregando…</div>
              ) : cartoes.length === 0 ? (
                <div data-arato-statistic="display" style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
                  <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum cartão cadastrado</div>
                  <div style={{ fontSize: 12 }}>Cadastre os cartões de crédito utilizados pela fazenda ou empresa.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {cartoes.map(c => (
                    <div key={c.id} style={{ border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden", background: "var(--bg-card)" }}>
                      {/* Topo colorido */}
                      <div style={{ background: BANDEIRA_COR[c.bandeira], padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.titular}</div>
                          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 }}>
                            {BANDEIRA_LABEL[c.bandeira]}{c.numero_final ? ` ••••${c.numero_final}` : ""}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: c.ativo ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)", color: "#fff", fontWeight: 600 }}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      {/* Detalhes */}
                      <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 12 }}>
                        {c.banco && <div><span style={{ color: "var(--text-3)" }}>Banco: </span><span style={{ color: "var(--text-1)", fontWeight: 500 }}>{c.banco}</span></div>}
                        {c.limite && <div><span style={{ color: "var(--text-3)" }}>Limite: </span><span style={{ color: "var(--text-1)", fontWeight: 600 }}>{fmtBRL(c.limite)}</span></div>}
                        <div><span style={{ color: "var(--text-3)" }}>Fecha: </span><span style={{ color: "var(--text-1)" }}>dia {c.dia_fechamento}</span></div>
                        <div><span style={{ color: "var(--text-3)" }}>Vence: </span><span style={{ color: "var(--text-1)" }}>dia {c.dia_vencimento}</span></div>
                        {c.observacao && <div style={{ gridColumn: "1/-1", color: "var(--text-2)", fontStyle: "italic", marginTop: 2 }}>{c.observacao}</div>}
                      </div>
                      {/* Ações */}
                      <div style={{ borderTop: "0.5px solid var(--border-table)", padding: "10px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <OperationalButton data-arato-button="secondary" onClick={() => abrirEditarCartao(c)}
                          style={{ fontSize: 12, padding: "5px 14px", border: "0.5px solid var(--border-table)", borderRadius: 7, background: "var(--bg-page)", color: "var(--text-1)", cursor: "pointer", fontWeight: 500 }}>
                          ✏ Editar
                        </OperationalButton>
                        <OperationalButton data-arato-button="secondary" onClick={() => deletarCartao(c)}
                          style={{ fontSize: 12, padding: "5px 14px", border: "0.5px solid #E24B4A50", borderRadius: 7, background: "#FFF5F5", color: "#991B1B", cursor: "pointer", fontWeight: 500 }}>
                          Excluir
                        </OperationalButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ FATURAS ═══ */}
          {aba === "faturas" && (
            <div style={{ padding: 20 }}>
              <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ minWidth: 200 }}>
                  <label data-arato-label="true" style={lblS}>Cartão</label>
                  <SelectField value={cartaoFiltro} onChange={e => setCartaoFiltro(e.target.value)} style={{ ...inpS, width: "auto", minWidth: 200 }}>
                    <option value="todos">Todos os cartões</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.titular} — {BANDEIRA_LABEL[c.bandeira]} {c.numero_final ? `••••${c.numero_final}` : ""}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label data-arato-label="true" style={lblS}>Status</label>
                  <SelectField value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ ...inpS, width: "auto" }}>
                    <option value="todos">Todos</option>
                    <option value="aberta">Aberta</option>
                    <option value="fechada">Fechada</option>
                    <option value="paga">Paga</option>
                  </SelectField>
                </div>
              </OperationalFilters>

              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Carregando…</div>
              ) : faturasFiltradas.length === 0 ? (
                <div data-arato-statistic="display" style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
                  <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhuma fatura encontrada</div>
                  <div style={{ fontSize: 12 }}>As faturas são geradas automaticamente quando um lançamento de Contas a Pagar escolhe Cartão de Crédito como forma de pagamento.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {faturasFiltradas.map(f => {
                    const cartao = cartoes.find(c => c.id === f.cartao_id);
                    const sc = STATUS_COR[f.status] ?? STATUS_COR.aberta;
                    const ativa = faturaAberta?.id === f.id;
                    return (
                      <div key={f.id} style={{ border: `0.5px solid ${ativa ? "#1A5C38" : "var(--border-table)"}`, borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
                        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 14, cursor: "pointer" }}
                          onClick={() => ativa ? setFaturaAberta(null) : abrirFatura(f)}>
                          {/* Bandeira */}
                          <div style={{ width: 40, height: 28, borderRadius: 5, background: BANDEIRA_COR[cartao?.bandeira ?? "outros"], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>{BANDEIRA_LABEL[cartao?.bandeira ?? "outros"].slice(0,4).toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>
                              {cartao?.titular ?? "—"} {cartao?.numero_final ? `••••${cartao.numero_final}` : ""}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                              {MESES[(f.mes - 1)]} {f.ano} · Fecha {fmtData(f.data_fechamento)} · Vence {fmtData(f.data_vencimento)}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: sc.bg, color: sc.cor }}>{STATUS_LABEL[f.status]}</span>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: f.status === "paga" ? "#1A5C38" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(f.valor_total)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{ativa ? "▲ fechar" : "▼ detalhe"}</div>
                          </div>
                        </div>

                        {ativa && (
                          <div style={{ borderTop: "0.5px solid var(--border-table)", padding: 16 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "flex-end" }}>
                              {f.status !== "paga" && (
                                <OperationalButton data-arato-button="toggle" onClick={() => toggleFecharFatura(f)}
                                  style={{ padding: "6px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: f.status === "aberta" ? "#FBF3E0" : "var(--bg-card)", color: f.status === "aberta" ? "#7A5A12" : "var(--text-1)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  {f.status === "aberta" ? "🔒 Fechar fatura" : "🔓 Reabrir fatura"}
                                </OperationalButton>
                              )}
                              {f.status === "fechada" && (
                                <OperationalButton data-arato-button="primary" onClick={() => abrirPagarFatura(f)}
                                  style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#1A5C38", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  💰 Pagar fatura
                                </OperationalButton>
                              )}
                            </div>
                            {loadingLanc ? (
                              <div style={{ padding: 20, textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Carregando lançamentos…</div>
                            ) : lançsFatura.length === 0 ? (
                              <div style={{ padding: 20, textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Nenhum lançamento vinculado a esta fatura.</div>
                            ) : (
                              <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-page)" }}>
                                    {["Data", "Descrição", "Categoria", "Valor", ""].map((h, i) => (
                                      <th key={i} style={{ padding: "7px 10px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {lançsFatura.map((l, i) => (
                                    <tr key={l.id} style={{ borderBottom: i < lançsFatura.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtData(l.data_baixa ?? l.data_lancamento)}</td>
                                      <td style={{ padding: "7px 10px", color: "var(--text-1)" }}>{l.descricao}</td>
                                      <td style={{ padding: "7px 10px", color: "var(--text-2)" }}>{l.categoria}</td>
                                      {/* Crédito de estorno (título a receber no cartão) abate o total da fatura */}
                                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{l.tipo === "receber" ? "− " : ""}{fmtBRL(l.valor_pago ?? l.valor)}</td>
                                      <td style={{ padding: "7px 10px", textAlign: "right" }}>
                                        {l.tipo === "pagar" && l.status === "cartao" && (
                                          <button type="button" onClick={() => estornarCompra(f, l)} style={{ padding: "3px 10px", borderRadius: 6, border: "0.5px solid #E8C97A", background: "#FBF3E0", color: "#7A5200", fontSize: 11, cursor: "pointer" }}>Estornar</button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: "1px solid var(--border-table)", background: "var(--bg-page)" }}>
                                    <td colSpan={3} style={{ padding: "8px 10px", fontWeight: 700, color: "var(--text-1)" }}>Total da fatura</td>
                                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(f.valor_total)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </OperationalGrid>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ CONCILIAÇÃO ═══ */}
          {aba === "conciliacao" && (
            <div style={{ padding: 20 }}>
              <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <label data-arato-label="true" style={lblS}>Cartão</label>
                  <SelectField value={cartaoConcil} onChange={e => { setCartaoConcil(e.target.value); setFaturaConcil(""); setLinhasExtrato([]); setLancFatura([]); }} style={inpS}>
                    <option value="">— Selecionar cartão —</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.titular} — {BANDEIRA_LABEL[c.bandeira]} {c.numero_final ? `••••${c.numero_final}` : ""}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label data-arato-label="true" style={lblS}>Fatura (competência)</label>
                  <SelectField value={faturaConcil} onChange={async e => {
                    setFaturaConcil(e.target.value);
                    if (e.target.value) {
                      const lancs = await listarLancamentosDaFatura(e.target.value);
                      setLancFatura(lancs as Lancamento[]);
                    }
                  }} style={inpS} disabled={!cartaoConcil}>
                    <option value="">— Selecionar fatura —</option>
                    {faturasParaConcil.map(f => <option key={f.id} value={f.id}>{MESES[f.mes-1]} {f.ano} — {fmtBRL(f.valor_total)} ({STATUS_LABEL[f.status]})</option>)}
                  </SelectField>
                </div>
              </div>

              {faturaConcil && (
                <>
                  <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#1e40af", lineHeight: 1.7 }}>
                    <strong>Como conciliar:</strong> Faça o download do extrato do cartão no app do banco (normalmente em CSV ou XLSX).
                    Importe o arquivo abaixo. O sistema cruza automaticamente os valores com os lançamentos da fatura.<br />
                    Colunas esperadas: <strong>Data</strong> · <strong>Descrição</strong> · <strong>Valor</strong>
                  </div>

                  <div data-arato-statistic="action" onClick={() => importRef.current?.click()}
                    style={{ border: "1.5px dashed var(--border-table)", borderRadius: 10, padding: "24px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{loadingConc ? "Processando…" : "Importar extrato do cartão (CSV / XLSX)"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>Arraste ou clique para selecionar</div>
                  </div>
                  <input ref={importRef} type="file" accept=".csv,.xls,.xlsx" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleExtrato(f); e.target.value = ""; }} />

                  {linhasExtrato.length > 0 && (
                    <>
                      {/* Resumo */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { l: "Total extrato",    v: totalExtrato,    cor: "var(--text-1)" },
                          { l: "Total fatura",     v: faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0, cor: "var(--text-1)" },
                          { l: "Conciliado",       v: totalConciliado, cor: "#1A5C38" },
                          { l: "Divergente",       v: totalDivergente, cor: "#E24B4A" },
                        ].map((c, i) => (
                          <div key={i} style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>{c.l}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: c.cor, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(c.v)}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabela comparativa */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        {/* Extrato do banco */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Extrato do banco ({linhasExtrato.length} linhas)</div>
                          <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
                            <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  <th style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Data</th>
                                  <th style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Descrição</th>
                                  <th style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Valor</th>
                                  <th style={{ padding: "7px 10px", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {linhasExtrato.map((l, i) => {
                                  const cor = l._status === "conciliado" ? "#1A5C38" : l._status === "divergente" ? "#E24B4A" : "var(--text-2)";
                                  return (
                                    <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: l._status === "conciliado" ? "#F0FAF0" : l._status === "divergente" ? "#FFF5F5" : "transparent" }}>
                                      <td style={{ padding: "6px 10px", color: cor, whiteSpace: "nowrap", fontSize: 11 }}>{fmtData(l.data)}</td>
                                      <td style={{ padding: "6px 10px", color: cor, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{l.descricao}</td>
                                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: cor, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{fmtBRL(l.valor)}</td>
                                      <td style={{ padding: "6px 4px" }}>
                                        {l._status === "pendente" ? (
                                          <div style={{ display: "flex", gap: 2 }}>
                                            <OperationalButton data-arato-button="danger" title="Marcar divergente" onClick={() => marcarDivergente(i)}
                                              style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>!</OperationalButton>
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: 11, color: cor }}>{l._status === "conciliado" ? "✓" : "✕"}</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </OperationalGrid>
                          </div>
                        </div>

                        {/* Lançamentos da fatura */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Lançamentos da fatura ({lancFatura.length})</div>
                          <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
                            <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  {["Data", "Descrição", "Valor"].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 2 ? "right" : "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {lancFatura.length === 0 ? (
                                  <tr><td colSpan={3} style={{ padding: "16px 10px", textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Importe o extrato para conciliar</td></tr>
                                ) : lancFatura.map((l, i) => (
                                  <tr key={l.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                                    <td style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_baixa)}</td>
                                    <td style={{ padding: "6px 10px", fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "#E24B4A", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{fmtBRL(l.valor_pago ?? l.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </OperationalGrid>
                          </div>
                          {lancFatura.length > 0 && linhasExtrato.length > 0 && (
                            <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)", fontSize: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ color: "var(--text-2)" }}>Diferença extrato × fatura:</span>
                                <strong style={{ color: Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)) < 0.01 ? "#1A5C38" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>
                                  {fmtBRL(Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)))}
                                </strong>
                              </div>
                              {Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)) < 0.01 && (
                                <div style={{ color: "#1A5C38", fontWeight: 600, fontSize: 11 }}>✓ Fatura e extrato conferem</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {!faturaConcil && (
                <div data-arato-statistic="display" style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Selecione um cartão e uma fatura para conciliar</div>
                  <div style={{ fontSize: 12 }}>Depois importe o extrato do banco para cruzar os valores.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ═══ MODAL CADASTRO / EDIÇÃO CARTÃO ═══ */}
      {modalCartao && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setModalCartao(false); }}>
          <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{editandoCartao ? "Editar Cartão" : "Novo Cartão de Crédito"}</span>
              <OperationalButton data-arato-button="icon" onClick={() => setModalCartao(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</OperationalButton>
            </div>
            <div data-arato-dialog-body="true" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Titular */}
              <div data-arato-dialog-body="true">
                <label data-arato-label="true" style={lblS}>Titular / Nome do cartão *</label>
                <input value={formCartao.titular} onChange={e => setFormCartao(p => ({ ...p, titular: e.target.value }))}
                  placeholder="Ex: Empresa Rancho Alegre — Bradesco" style={inpS} />
              </div>
              {/* Banco + Bandeira */}
              <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label data-arato-label="true" style={lblS}>Banco</label>
                  <input value={formCartao.banco} onChange={e => setFormCartao(p => ({ ...p, banco: e.target.value }))}
                    placeholder="Ex: Bradesco, Itaú, BB" style={inpS} />
                </div>
                <div>
                  <label data-arato-label="true" style={lblS}>Bandeira *</label>
                  <SelectField value={formCartao.bandeira} onChange={e => setFormCartao(p => ({ ...p, bandeira: e.target.value as CartaoCredito["bandeira"] }))} style={inpS}>
                    {BANDEIRAS.map(b => <option key={b} value={b}>{BANDEIRA_LABEL[b]}</option>)}
                  </SelectField>
                </div>
              </div>
              {/* Nº final + Limite */}
              <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label data-arato-label="true" style={lblS}>Últimos 4 dígitos</label>
                  <input value={formCartao.numero_final} onChange={e => setFormCartao(p => ({ ...p, numero_final: e.target.value.replace(/\D/g,"").slice(0,4) }))}
                    placeholder="1234" maxLength={4} style={inpS} />
                </div>
                <div>
                  <label data-arato-label="true" style={lblS}>Limite (R$)</label>
                  <input value={formCartao.limite} onChange={e => setFormCartao(p => ({ ...p, limite: e.target.value }))}
                    placeholder="0,00" inputMode="decimal" style={inpS} />
                </div>
              </div>
              {/* Fechamento + Vencimento */}
              <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label data-arato-label="true" style={lblS}>Dia de fechamento *</label>
                  <input type="number" min={1} max={31} value={formCartao.dia_fechamento}
                    onChange={e => setFormCartao(p => ({ ...p, dia_fechamento: e.target.value }))} style={inpS} />
                </div>
                <div>
                  <label data-arato-label="true" style={lblS}>Dia de vencimento *</label>
                  <input type="number" min={1} max={31} value={formCartao.dia_vencimento}
                    onChange={e => setFormCartao(p => ({ ...p, dia_vencimento: e.target.value }))} style={inpS} />
                </div>
              </div>
              {/* Observação */}
              <div data-arato-dialog-body="true">
                <label data-arato-label="true" style={lblS}>Observação</label>
                <input value={formCartao.observacao} onChange={e => setFormCartao(p => ({ ...p, observacao: e.target.value }))}
                  placeholder="Ex: Cartão corporativo operacional" style={inpS} />
              </div>
              {/* Ativo */}
              <label data-arato-label="true" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={formCartao.ativo} onChange={e => setFormCartao(p => ({ ...p, ativo: e.target.checked }))} />
                Cartão ativo
              </label>

              {erroCartao && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 12 }}>{erroCartao}</div>}
            </div>
            <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ padding: "14px 20px", borderTop: "0.5px solid var(--border-table)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <OperationalButton data-arato-button="secondary" onClick={() => setModalCartao(false)}
                style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-1)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </OperationalButton>
              <OperationalButton data-arato-button="toggle" onClick={salvarCartaoModal} disabled={salvandoCartao}
                style={{ padding: "8px 22px", background: salvandoCartao ? "#999" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: salvandoCartao ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}>
                {salvandoCartao ? "Salvando…" : (editandoCartao ? "Salvar alterações" : "Cadastrar cartão")}
              </OperationalButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL PAGAR FATURA — único evento que move dinheiro de verdade ═══ */}
      {faturaPagar && (() => {
        const cartao = cartoes.find(c => c.id === faturaPagar.cartao_id);
        return (
          <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setFaturaPagar(null); }}>
            <div data-arato-dialog="form" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>💰 Pagar Fatura</span>
                <OperationalButton data-arato-button="icon" onClick={() => setFaturaPagar(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</OperationalButton>
              </div>
              <div data-arato-dialog-body="true" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div data-arato-dialog-body="true" style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{cartao?.titular ?? "—"} {cartao?.numero_final ? `••••${cartao.numero_final}` : ""}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 12 }}>{MESES[faturaPagar.mes - 1]} {faturaPagar.ano} · vence {fmtData(faturaPagar.data_vencimento)}</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#E24B4A", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(faturaPagar.valor_total)}</div>
                </div>
                <div data-arato-dialog-body="true">
                  <label data-arato-label="true" style={lblS}>Conta de Pagamento *</label>
                  <SelectField value={pagarConta} onChange={e => setPagarConta(e.target.value)} style={inpS}>
                    <option value="">— Selecionar —</option>
                    {contasPagamento.map(c => {
                      const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                      return <option key={c.id} value={label}>{label}</option>;
                    })}
                  </SelectField>
                </div>
                <div data-arato-dialog-body="true">
                  <label data-arato-label="true" style={lblS}>Data do Pagamento *</label>
                  <InputData type="date" value={pagarData} onChange={e => setPagarData(e.target.value)} style={inpS} />
                </div>
                <div data-arato-dialog-body="true" style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Gera um lançamento único, já baixado, pelo valor total da fatura — este é o movimento real de caixa. Os lançamentos individuais que compuseram a fatura não são alterados.
                </div>
                {erroPagarFatura && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 12 }}>{erroPagarFatura}</div>}
              </div>
              <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ padding: "14px 20px", borderTop: "0.5px solid var(--border-table)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <OperationalButton data-arato-button="secondary" onClick={() => setFaturaPagar(null)}
                  style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-1)", cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </OperationalButton>
                <OperationalButton data-arato-button="toggle" onClick={confirmarPagarFatura} disabled={pagandoFatura}
                  style={{ padding: "8px 22px", background: pagandoFatura ? "#999" : "#1A5C38", color: "#fff", border: "none", borderRadius: 8, cursor: pagandoFatura ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}>
                  {pagandoFatura ? "Pagando…" : "Confirmar Pagamento"}
                </OperationalButton>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
