"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import type { AcertoFrete, AcertoFreteItem } from "../../../lib/supabase";

// ─── Tipos locais ─────────────────────────────────────────────────────────────
interface Motorista {
  id: string;
  nome: string;
  cpf: string;
  tipo?: string;
  rntrc?: string;
}

interface CteResumo {
  id: string;
  numero?: string;
  data_emissao?: string;
  valor_frete?: number;
  remetente?: string;
  municipio_origem?: string;
  municipio_destino?: string;
  status?: string;
}

interface AbastecimentoResumo {
  id: string;
  data_abastecimento?: string;
  litros?: number;
  valor_total?: number;
  veiculo_placa?: string;
}

interface ModalAcerto {
  acerto: AcertoFrete;
  itens: AcertoFreteItem[];
  ctesPeriodo: CteResumo[];
  abastecimentos: AbastecimentoResumo[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesAno(mes: number, ano: number) {
  return `${MESES[mes - 1]}/${ano}`;
}

const s = (obj: React.CSSProperties): React.CSSProperties => obj;

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  aberto:  { label: "Aberto",  bg: "#EBF3FB", color: "#1A4870" },
  fechado: { label: "Fechado", bg: "#FBF3E0", color: "#7A5400" },
  pago:    { label: "Pago",    bg: "#DCFCE7", color: "#166534" },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AcertoFretePage() {
  const { fazendaId } = useAuth();

  const now = new Date();
  const [filtromes, setFiltroMes] = useState(now.getMonth() + 1);
  const [filtroAno, setFiltroAno] = useState(now.getFullYear());
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [acertos, setAcertos] = useState<AcertoFrete[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalData, setModalData] = useState<ModalAcerto | null>(null);
  const [savingAcerto, setSavingAcerto] = useState(false);
  const [novoDesc, setNovoDesc] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoTipo, setNovoTipo] = useState<AcertoFreteItem["tipo"]>("adiantamento");

  // ── Carregar motoristas TAC ───────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("motoristas").select("id, nome, cpf, tipo, rntrc")
      .eq("fazenda_id", fazendaId).eq("tipo", "tac")
      .order("nome")
      .then(({ data }) => data && setMotoristas(data as Motorista[]));
  }, [fazendaId]);

  // ── Carregar acertos do período ───────────────────────────────────────────
  const carregarAcertos = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    let q = supabase.from("acertos_frete")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .eq("periodo_mes", filtromes)
      .eq("periodo_ano", filtroAno)
      .order("motorista_nome");
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
    const { data } = await q;
    setAcertos((data as AcertoFrete[]) ?? []);
    setLoading(false);
  }, [fazendaId, filtromes, filtroAno, filtroStatus]);

  useEffect(() => { carregarAcertos(); }, [carregarAcertos]);

  // ── Criar acerto para motorista ───────────────────────────────────────────
  const criarAcerto = async (motorista: Motorista) => {
    if (!fazendaId) return;
    const { data } = await supabase.from("acertos_frete").insert({
      fazenda_id: fazendaId,
      motorista_id: motorista.id,
      motorista_nome: motorista.nome,
      periodo_mes: filtromes,
      periodo_ano: filtroAno,
      status: "aberto",
      valor_bruto: 0,
      valor_combustivel: 0,
      valor_adiantamentos: 0,
      valor_outros_descontos: 0,
    }).select().single();
    if (data) { await carregarAcertos(); abrirAcerto(data as AcertoFrete); }
  };

  // ── Abrir acerto (modal detalhe) ──────────────────────────────────────────
  const abrirAcerto = async (acerto: AcertoFrete) => {
    const [itensRes, ctesRes, abastRes] = await Promise.all([
      supabase.from("acerto_frete_itens").select("*").eq("acerto_id", acerto.id).order("tipo").order("data_ref"),
      fazendaId ? supabase.from("ctes")
        .select("id, numero, data_emissao, valor_frete, remetente, municipio_origem, municipio_destino, status")
        .eq("fazenda_id", fazendaId)
        .eq("motorista_id", acerto.motorista_id ?? "")
        .gte("data_emissao", `${acerto.periodo_ano}-${String(acerto.periodo_mes).padStart(2,"0")}-01`)
        .lte("data_emissao", `${acerto.periodo_ano}-${String(acerto.periodo_mes).padStart(2,"0")}-31`)
        .in("status", ["autorizado", "encerrado"]) : { data: [] },
      fazendaId ? supabase.from("lancamentos")
        .select("id, data_vencimento, valor, historico, veiculo_id")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "cp")
        .ilike("historico", "%combustível%")
        .gte("data_vencimento", `${acerto.periodo_ano}-${String(acerto.periodo_mes).padStart(2,"0")}-01`)
        .lte("data_vencimento", `${acerto.periodo_ano}-${String(acerto.periodo_mes).padStart(2,"0")}-31`) : { data: [] },
    ]);

    setModalData({
      acerto,
      itens: (itensRes.data as AcertoFreteItem[]) ?? [],
      ctesPeriodo: (ctesRes.data as CteResumo[]) ?? [],
      abastecimentos: (abastRes.data ?? []).map((l: Record<string, unknown>) => ({
        id: String(l.id),
        data_abastecimento: l.data_vencimento as string | undefined,
        valor_total: Number(l.valor ?? 0),
        veiculo_placa: undefined,
      })),
    });
  };

  // ── Adicionar item manual ao acerto ──────────────────────────────────────
  const adicionarItem = async () => {
    if (!modalData || !novoDesc.trim() || !novoValor) return;
    const valor = parseFloat(novoValor.replace(",", "."));
    if (isNaN(valor) || valor === 0) return;
    const { data } = await supabase.from("acerto_frete_itens").insert({
      acerto_id: modalData.acerto.id,
      tipo: novoTipo,
      descricao: novoDesc.trim(),
      valor,
    }).select().single();
    if (data) {
      await recalcularTotais(modalData.acerto.id);
      setNovoDesc(""); setNovoValor("");
      await abrirAcerto(modalData.acerto);
    }
  };

  // ── Importar CT-e para o acerto ──────────────────────────────────────────
  const importarCte = async (cte: CteResumo) => {
    if (!modalData) return;
    const jaExiste = modalData.itens.find(i => i.referencia_id === cte.id);
    if (jaExiste) return;
    await supabase.from("acerto_frete_itens").insert({
      acerto_id: modalData.acerto.id,
      tipo: "cte" as const,
      descricao: `CT-e ${cte.numero ?? ""} — ${cte.municipio_origem ?? ""} → ${cte.municipio_destino ?? ""}`,
      referencia_id: cte.id,
      data_ref: cte.data_emissao,
      valor: cte.valor_frete ?? 0,
    });
    await recalcularTotais(modalData.acerto.id);
    await abrirAcerto(modalData.acerto);
  };

  // ── Remover item ──────────────────────────────────────────────────────────
  const removerItem = async (itemId: string) => {
    if (!modalData) return;
    await supabase.from("acerto_frete_itens").delete().eq("id", itemId);
    await recalcularTotais(modalData.acerto.id);
    await abrirAcerto(modalData.acerto);
  };

  // ── Recalcular totais do acerto a partir dos itens ────────────────────────
  const recalcularTotais = async (acertoId: string) => {
    const { data: itens } = await supabase.from("acerto_frete_itens").select("tipo, valor").eq("acerto_id", acertoId);
    if (!itens) return;
    const bruto = itens.filter(i => i.tipo === "cte" || i.tipo === "bonus").reduce((s: number, i: { valor: number }) => s + i.valor, 0);
    const combustivel = itens.filter(i => i.tipo === "combustivel").reduce((s: number, i: { valor: number }) => s + i.valor, 0);
    const adiantamentos = itens.filter(i => i.tipo === "adiantamento").reduce((s: number, i: { valor: number }) => s + i.valor, 0);
    const outros = itens.filter(i => i.tipo === "desconto").reduce((s: number, i: { valor: number }) => s + i.valor, 0);
    await supabase.from("acertos_frete").update({
      valor_bruto: bruto,
      valor_combustivel: combustivel,
      valor_adiantamentos: adiantamentos,
      valor_outros_descontos: outros,
      updated_at: new Date().toISOString(),
    }).eq("id", acertoId);
  };

  // ── Fechar acerto + gerar CP ──────────────────────────────────────────────
  const fecharAcerto = async () => {
    if (!modalData || !fazendaId) return;
    setSavingAcerto(true);
    const a = modalData.acerto;
    const liquido = (a.valor_bruto ?? 0) - (a.valor_combustivel ?? 0) - (a.valor_adiantamentos ?? 0) - (a.valor_outros_descontos ?? 0);
    if (liquido <= 0) {
      alert("Valor líquido é zero ou negativo — confira os itens antes de fechar.");
      setSavingAcerto(false);
      return;
    }
    // Gerar CP
    const { data: cp } = await supabase.from("lancamentos").insert({
      fazenda_id: fazendaId,
      tipo: "cp",
      descricao: `Acerto de Frete — ${a.motorista_nome} — ${mesAno(a.periodo_mes, a.periodo_ano)}`,
      historico: `Acerto de frete motorista TAC ${a.motorista_nome}`,
      valor: liquido,
      data_vencimento: new Date(`${a.periodo_ano}-${String(a.periodo_mes).padStart(2,"0")}-10`).toISOString().slice(0,10),
      status: "pendente",
      origem: "acerto_frete",
    }).select("id").single();

    await supabase.from("acertos_frete").update({
      status: "fechado",
      lancamento_id: cp?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", a.id);

    setSavingAcerto(false);
    setModalData(null);
    await carregarAcertos();
  };

  // ── Motoristas sem acerto no período ─────────────────────────────────────
  const motoristasComAcerto = new Set(acertos.map(a => a.motorista_id));
  const motoristasSemAcerto = motoristas.filter(m => !motoristasComAcerto.has(m.id));

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const totalBruto  = acertos.reduce((s, a) => s + (a.valor_bruto ?? 0), 0);
  const totalDesc   = acertos.reduce((s, a) => s + (a.valor_combustivel ?? 0) + (a.valor_adiantamentos ?? 0) + (a.valor_outros_descontos ?? 0), 0);
  const totalLiq    = acertos.reduce((s, a) => s + (a.valor_liquido ?? 0), 0);
  const totalAbertos = acertos.filter(a => a.status === "aberto").length;

  const card = (label: string, value: string, sub?: string, color?: string) => (
    <div style={s({ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 20px", minWidth: 160 })}>
      <div style={s({ fontSize: 11, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 })}>{label}</div>
      <div style={s({ fontSize: 22, fontWeight: 700, color: color ?? "var(--text-1)" })}>{value}</div>
      {sub && <div style={s({ fontSize: 11, color: "var(--text-3)", marginTop: 3 })}>{sub}</div>}
    </div>
  );

  // ── Modal detalhe do acerto ───────────────────────────────────────────────
  const renderModal = () => {
    if (!modalData) return null;
    const { acerto, itens, ctesPeriodo, abastecimentos } = modalData;
    const liquido = (acerto.valor_bruto ?? 0) - (acerto.valor_combustivel ?? 0) - (acerto.valor_adiantamentos ?? 0) - (acerto.valor_outros_descontos ?? 0);
    const ctesImportados = new Set(itens.filter(i => i.tipo === "cte").map(i => i.referencia_id));

    const modalStyle: React.CSSProperties = {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: 60, overflowY: "auto",
    };
    const boxStyle: React.CSSProperties = {
      background: "var(--bg-card)", borderRadius: 14,
      width: "min(960px, 95vw)", padding: 32,
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)", marginBottom: 40,
    };

    return (
      <div style={modalStyle}>
        <div style={boxStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Acerto de Frete</h2>
                {(() => { const st = STATUS_LABEL[acerto.status]; return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10, background: st.bg, color: st.color }}>{st.label}</span>; })()}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>{acerto.motorista_nome} — {mesAno(acerto.periodo_mes, acerto.periodo_ano)}</div>
            </div>
            <button onClick={() => setModalData(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-3)" }}>×</button>
          </div>

          {/* KPIs do acerto */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { l: "Valor Bruto (Fretes)", v: brl(acerto.valor_bruto ?? 0), c: "#1A4870" },
              { l: "Combustível", v: brl(acerto.valor_combustivel ?? 0), c: "#E24B4A" },
              { l: "Adiantamentos", v: brl(acerto.valor_adiantamentos ?? 0), c: "#EF9F27" },
              { l: "Valor Líquido a Pagar", v: brl(liquido), c: liquido > 0 ? "#16A34A" : "#E24B4A" },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* CT-e do período (para importar) */}
          {ctesPeriodo.length > 0 && acerto.status === "aberto" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>CT-e do Período — Clique para Importar</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ctesPeriodo.map(cte => {
                  const importado = ctesImportados.has(cte.id);
                  return (
                    <div key={cte.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 12px", borderRadius: 8,
                      border: `0.5px solid ${importado ? "#BBF7D0" : "var(--border)"}`,
                      background: importado ? "#F0FDF4" : "var(--bg-page)",
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 13 }}>CT-e {cte.numero}</span>
                        <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>{cte.municipio_origem} → {cte.municipio_destino}</span>
                        {cte.data_emissao && <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>{new Date(cte.data_emissao).toLocaleDateString("pt-BR")}</span>}
                      </div>
                      <div style={{ fontWeight: 700, color: "#1A4870", fontSize: 14 }}>{brl(cte.valor_frete ?? 0)}</div>
                      {importado
                        ? <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>✓ Importado</span>
                        : <button onClick={() => importarCte(cte)} style={{ fontSize: 11, padding: "4px 12px", background: "#111111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Importar</button>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Itens do acerto */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Itens do Acerto</div>
            {itens.length === 0
              ? <div style={{ padding: "20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhum item adicionado</div>
              : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)" }}>
                      {["Tipo","Descrição","Data","Valor",""].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(item => {
                      const tipoColor: Record<string, { bg: string; color: string }> = {
                        cte:          { bg: "#EBF3FB", color: "#1A4870" },
                        combustivel:  { bg: "#FEE2E2", color: "#E24B4A" },
                        adiantamento: { bg: "#FBF3E0", color: "#7A5400" },
                        desconto:     { bg: "#FEE2E2", color: "#E24B4A" },
                        bonus:        { bg: "#DCFCE7", color: "#166534" },
                      };
                      const tc = tipoColor[item.tipo] ?? { bg: "#F4F6FA", color: "#555" };
                      const tipoLabel: Record<string, string> = {
                        cte: "CT-e", combustivel: "Combustível", adiantamento: "Adiantamento", desconto: "Desconto", bonus: "Bônus"
                      };
                      return (
                        <tr key={item.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: tc.bg, color: tc.color }}>{tipoLabel[item.tipo] ?? item.tipo}</span>
                          </td>
                          <td style={{ padding: "7px 10px", color: "var(--text-1)" }}>{item.descricao || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "var(--text-3)", fontSize: 12 }}>{item.data_ref ? new Date(item.data_ref).toLocaleDateString("pt-BR") : "—"}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: item.tipo === "cte" || item.tipo === "bonus" ? "#16A34A" : "#E24B4A" }}>
                            {item.tipo === "cte" || item.tipo === "bonus" ? "+" : "-"} {brl(Math.abs(item.valor))}
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            {acerto.status === "aberto" && (
                              <button onClick={() => removerItem(item.id)} style={{ background: "none", border: "0.5px solid #E24B4A40", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "#E24B4A" }}>Remover</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-page)" }}>
                      <td colSpan={3} style={{ padding: "10px", fontWeight: 700, fontSize: 13 }}>Líquido a Pagar</td>
                      <td style={{ padding: "10px", fontWeight: 700, fontSize: 16, color: liquido >= 0 ? "#16A34A" : "#E24B4A" }}>{brl(liquido)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )
            }
          </div>

          {/* Adicionar item manual */}
          {acerto.status === "aberto" && (
            <div style={{ marginBottom: 24, padding: "16px", background: "var(--bg-page)", borderRadius: 10, border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 12 }}>Adicionar Item</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Tipo</label>
                  <select value={novoTipo} onChange={e => setNovoTipo(e.target.value as AcertoFreteItem["tipo"])}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                    <option value="combustivel">Combustível</option>
                    <option value="adiantamento">Adiantamento</option>
                    <option value="desconto">Desconto</option>
                    <option value="bonus">Bônus</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Descrição</label>
                  <input value={novoDesc} onChange={e => setNovoDesc(e.target.value)} placeholder="Ex: Adiantamento 01/08, diesel 200L..." style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Valor (R$)</label>
                  <input value={novoValor} onChange={e => setNovoValor(e.target.value)} placeholder="0,00" type="number" step="0.01" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <button onClick={adicionarItem} style={{ padding: "8px 18px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Adicionar</button>
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
            <button onClick={() => setModalData(null)} style={{ padding: "8px 20px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, cursor: "pointer" }}>Fechar</button>
            {acerto.status === "aberto" && (
              <button
                onClick={fecharAcerto}
                disabled={savingAcerto || liquido <= 0}
                style={{ padding: "8px 24px", background: savingAcerto || liquido <= 0 ? "#ccc" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: savingAcerto || liquido <= 0 ? "not-allowed" : "pointer" }}>
                {savingAcerto ? "Fechando…" : `Fechar Acerto e Gerar CP (${brl(liquido)})`}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const anos = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Acerto de Frete</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-2)" }}>Fechamento mensal de motoristas TAC (autônomos) — fretes, combustível, adiantamentos</p>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <select value={filtromes} onChange={e => setFiltroMes(Number(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
            <option value="todos">Todos os Status</option>
            <option value="aberto">Aberto</option>
            <option value="fechado">Fechado</option>
            <option value="pago">Pago</option>
          </select>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 600 }}>
            Período: {mesAno(filtromes, filtroAno)}
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
          {card("Acertos no Período", String(acertos.length), `${totalAbertos} aberto${totalAbertos !== 1 ? "s" : ""}`)}
          {card("Total Bruto (Fretes)", brl(totalBruto), undefined, "#1A4870")}
          {card("Total Descontos", brl(totalDesc), "Combustível + Adiant.", "#E24B4A")}
          {card("Total Líquido", brl(totalLiq), "A pagar no período", totalLiq > 0 ? "#16A34A" : "var(--text-1)")}
        </div>

        {/* Motoristas sem acerto no período */}
        {motoristasSemAcerto.length > 0 && (
          <div style={{ marginBottom: 24, padding: "16px 20px", background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7A5400", marginBottom: 10 }}>MOTORISTAS TAC SEM ACERTO EM {mesAno(filtromes, filtroAno).toUpperCase()}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {motoristasSemAcerto.map(m => (
                <button key={m.id} onClick={() => criarAcerto(m)}
                  style={{ padding: "6px 14px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  + Abrir Acerto — {m.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {motoristas.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", color: "var(--text-3)", fontSize: 14 }}>
            Nenhum motorista TAC cadastrado. Cadastre motoristas autônomos em <strong>Parâmetros do Sistema → Transportes → Motoristas</strong>.
          </div>
        )}

        {/* Tabela de acertos */}
        {acertos.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-page)" }}>
                  {["Motorista","Período","Fretes (Bruto)","Combustível","Adiantamentos","Líquido a Pagar","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acertos.map(a => {
                  const st = STATUS_LABEL[a.status];
                  const liq = a.valor_liquido ?? ((a.valor_bruto ?? 0) - (a.valor_combustivel ?? 0) - (a.valor_adiantamentos ?? 0) - (a.valor_outros_descontos ?? 0));
                  return (
                    <tr key={a.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", cursor: "pointer" }}
                      onClick={() => abrirAcerto(a)}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{a.motorista_nome}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-2)" }}>{mesAno(a.periodo_mes, a.periodo_ano)}</td>
                      <td style={{ padding: "10px 14px", color: "#1A4870", fontWeight: 600 }}>{brl(a.valor_bruto ?? 0)}</td>
                      <td style={{ padding: "10px 14px", color: "#E24B4A" }}>{brl(a.valor_combustivel ?? 0)}</td>
                      <td style={{ padding: "10px 14px", color: "#EF9F27" }}>{brl(a.valor_adiantamentos ?? 0)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: liq >= 0 ? "#16A34A" : "#E24B4A" }}>{brl(liq)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button onClick={e => { e.stopPropagation(); abrirAcerto(a); }}
                          style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && acertos.length === 0 && motoristas.length > 0 && (
          <div style={{ padding: "40px", textAlign: "center", background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", color: "var(--text-3)", fontSize: 14 }}>
            Nenhum acerto em {mesAno(filtromes, filtroAno)}. Clique em <strong>Abrir Acerto</strong> acima para iniciar.
          </div>
        )}
      </div>

      {renderModal()}
    </div>
  );
}
