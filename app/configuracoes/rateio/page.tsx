"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarRegrasRateio, criarRateioRegra, atualizarRateioRegra, excluirRateioRegra,
  listarTodosCiclos, listarAnosSafra, listarCentrosCustoGeral,
} from "../../../lib/db";
import type { RateioRegra, RateioRegraLinha, Ciclo, AnoSafra, CentroCusto } from "../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" };
const btnX: React.CSSProperties = { padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const CULT: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo",
};

// Cores para os segmentos da barra (até 8 ciclos)
const CORES = ["#1A5CB8","#C9921B","#16A34A","#E24B4A","#7C3AED","#0891B2","#B45309","#6B7280"];

type LinhaForm = {
  ciclo_id: string;
  percentual: string;
  descricao: string;
};

const LINHA_VAZIA: LinhaForm = { ciclo_id: "", percentual: "", descricao: "" };

const FORM_VAZIO = {
  ano_safra_id: "",
  centro_custo_id: "",
  nome: "",
  descricao: "",
  ativo: true,
};

export default function RateioPage() {
  const { fazendaId } = useAuth();
  const [regras,    setRegras]    = useState<RateioRegra[]>([]);
  const [ciclos,    setCiclos]    = useState<Ciclo[]>([]);
  const [anos,      setAnos]      = useState<AnoSafra[]>([]);
  const [ccs,       setCcs]       = useState<CentroCusto[]>([]);
  const [filtroAno, setFiltroAno] = useState<string>("");
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [modal,     setModal]     = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [f,         setF]         = useState({ ...FORM_VAZIO });
  const [linhas,    setLinhas]    = useState<LinhaForm[]>([{ ...LINHA_VAZIA }]);
  const [erro,      setErro]      = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [r, c, a, cc] = await Promise.all([
        listarRegrasRateio(fazendaId),
        listarTodosCiclos(fazendaId),
        listarAnosSafra(fazendaId),
        listarCentrosCustoGeral(fazendaId),
      ]);
      setRegras(r);
      setCiclos(c);
      setAnos(a);
      setCcs(cc);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeCiclo = (id?: string) => {
    if (!id) return "Sem ciclo";
    const c = ciclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anos.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULT[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };

  const nomeCC = (id?: string) => {
    if (!id) return "—";
    const cc = ccs.find(x => x.id === id);
    return cc ? cc.nome : "—";
  };

  const nomeAno = (id: string) => anos.find(a => a.id === id)?.descricao ?? "—";

  const ciclosModal = f.ano_safra_id
    ? ciclos.filter(c => c.ano_safra_id === f.ano_safra_id)
    : ciclos;

  const regrasFiltradas = filtroAno ? regras.filter(r => r.ano_safra_id === filtroAno) : regras;

  // Soma dos percentuais das linhas
  const somaLinhas = linhas.reduce((s, l) => s + (parseFloat(l.percentual) || 0), 0);
  const somaOk = Math.abs(somaLinhas - 100) < 0.01;

  // ── Linhas handlers ──────────────────────────────────────────
  const addLinha = () => setLinhas(p => [...p, { ...LINHA_VAZIA }]);
  const removeLinha = (i: number) => setLinhas(p => p.filter((_, j) => j !== i));
  const setLinha = (i: number, campo: keyof LinhaForm, valor: string) =>
    setLinhas(p => p.map((l, j) => j === i ? { ...l, [campo]: valor } : l));

  // Auto-balancear: ao alterar % de uma linha, ajusta a última se só há 2
  const setPctLinha = (i: number, valor: string) => {
    setLinhas(p => {
      const next = p.map((l, j) => j === i ? { ...l, percentual: valor } : l);
      if (next.length === 2) {
        const outra = i === 0 ? 1 : 0;
        const n = parseFloat(valor) || 0;
        next[outra] = { ...next[outra], percentual: String(Math.max(0, 100 - n)) };
      }
      return next;
    });
  };

  // ── Abrir modal ───────────────────────────────────────────────
  const abrirNovo = () => {
    setF({ ...FORM_VAZIO, ano_safra_id: filtroAno });
    setLinhas([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
    setEditId(null);
    setErro(null);
    setModal(true);
  };

  const abrirEditar = (r: RateioRegra) => {
    setF({
      ano_safra_id: r.ano_safra_id,
      centro_custo_id: r.centro_custo_id,
      nome: r.nome,
      descricao: r.descricao ?? "",
      ativo: r.ativo ?? true,
    });
    setLinhas(
      (r.linhas && r.linhas.length > 0)
        ? r.linhas.map(l => ({
            ciclo_id: l.ciclo_id ?? "",
            percentual: String(l.percentual),
            descricao: l.descricao ?? "",
          }))
        : [{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]
    );
    setEditId(r.id);
    setErro(null);
    setModal(true);
  };

  // ── Salvar ────────────────────────────────────────────────────
  const salvar = async () => {
    if (!fazendaId) return;
    if (!f.ano_safra_id)      { setErro("Selecione o Ano Safra"); return; }
    if (!f.centro_custo_id)   { setErro("Selecione o Centro de Custo"); return; }
    if (!f.nome.trim())        { setErro("Informe o nome da regra"); return; }
    if (linhas.length === 0)   { setErro("Adicione ao menos uma linha de destino"); return; }
    if (!somaOk)               { setErro(`Os percentuais somam ${somaLinhas.toFixed(2)}% — devem totalizar 100%`); return; }

    setSalvando(true); setErro(null);
    try {
      const linhasPayload: Omit<RateioRegraLinha, "id" | "regra_id" | "created_at">[] = linhas.map((l, i) => ({
        ciclo_id: l.ciclo_id || undefined,
        percentual: parseFloat(l.percentual) || 0,
        descricao: l.descricao || undefined,
        ordem: i,
      }));

      const header = {
        fazenda_id: fazendaId,
        ano_safra_id: f.ano_safra_id,
        centro_custo_id: f.centro_custo_id,
        nome: f.nome.trim(),
        descricao: f.descricao || undefined,
        ativo: f.ativo,
      };

      if (editId) {
        await atualizarRateioRegra(editId, header, linhasPayload);
      } else {
        await criarRateioRegra(header, linhasPayload);
      }
      setModal(false);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1 }}>
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Regras de Rateio</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>
              Defina como custos de um Centro de Custo são distribuídos entre N ciclos — proporcional por área, cultura ou qualquer critério
            </p>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Nova Regra</button>
        </header>

        <div style={{ padding: "18px 22px" }}>

          {/* Info box */}
          <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
            <strong>Como funciona:</strong> Crie um Centro de Custo chamado <em>"Rateio"</em> (ou o nome que preferir) em Configurações → Centros de Custo.
            Lance todas as despesas compartilhadas nesse CC. Aqui você define quanto (%) vai para cada ciclo.
            Exemplo: CC "Rateio" → 60% Soja, 30% Milho 2ª, 10% Algodão. Sem limite de culturas.
          </div>

          {/* Filtro */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Filtrar por Ano Safra:</span>
            <select
              style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, background: "#fff", outline: "none", color: "#1a1a1a" }}
              value={filtroAno}
              onChange={e => setFiltroAno(e.target.value)}
            >
              <option value="">Todos os anos</option>
              {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
            </select>
            {filtroAno && (
              <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={() => setFiltroAno("")}>Limpar</button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
              {regrasFiltradas.length} regra{regrasFiltradas.length !== 1 ? "s" : ""}
              {filtroAno ? ` em ${nomeAno(filtroAno)}` : " no total"}
            </span>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 48, color: "#555" }}>Carregando...</div>
          ) : regrasFiltradas.length === 0 ? (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>
              {filtroAno
                ? `Nenhuma regra em ${nomeAno(filtroAno)}. Clique em "+ Nova Regra".`
                : "Nenhuma regra cadastrada. Clique em \"+ Nova Regra\" para começar."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {regrasFiltradas.map(r => {
                const linhasR = r.linhas ?? [];
                return (
                  <div key={r.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Header da regra */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                            {nomeAno(r.ano_safra_id)}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{r.nome}</span>
                          {!r.ativo && (
                            <span style={{ fontSize: 10, background: "#F3F6F9", color: "#888", padding: "2px 8px", borderRadius: 6 }}>Inativa</span>
                          )}
                        </div>

                        {/* CC de origem */}
                        <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
                          Centro de Custo: <strong style={{ color: "#1A4870" }}>{nomeCC(r.centro_custo_id)}</strong>
                          {r.descricao && <span style={{ color: "#888", marginLeft: 8 }}>· {r.descricao}</span>}
                        </div>

                        {/* Barra de distribuição */}
                        {linhasR.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", border: "0.5px solid #D4DCE8" }}>
                              {linhasR.map((l, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: `${l.percentual}%`,
                                    background: CORES[i % CORES.length],
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", fontSize: 10, fontWeight: 700,
                                    minWidth: l.percentual > 0 ? 24 : 0,
                                    transition: "width 0.2s",
                                  }}
                                >
                                  {l.percentual > 4 ? `${l.percentual}%` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Legenda das linhas */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {linhasR.map((l, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F3F6F9", border: "0.5px solid #D4DCE8" }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES[i % CORES.length], display: "inline-block", flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{l.percentual}%</span>
                              <span style={{ color: "#555" }}>{nomeCiclo(l.ciclo_id)}</span>
                              {l.descricao && <span style={{ color: "#888" }}>· {l.descricao}</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Ações */}
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button style={btnR} onClick={() => abrirEditar(r)}>Editar</button>
                        <button style={btnX} onClick={async () => {
                          if (confirm(`Excluir regra "${r.nome}"?`)) {
                            await excluirRateioRegra(r.id);
                            await carregar();
                          }
                        }}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── Modal ── */}
      {modal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 14, width: 760, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {editId ? "Editar Regra de Rateio" : "Nova Regra de Rateio"}
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>

            <div style={{ padding: 22 }}>

              {/* Ano Safra + CC */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Ano Safra *</label>
                  <select
                    style={{ ...inp, borderColor: !f.ano_safra_id ? "#E24B4A80" : "#D4DCE8" }}
                    value={f.ano_safra_id}
                    onChange={e => setF(p => ({ ...p, ano_safra_id: e.target.value }))}
                  >
                    <option value="">— Selecionar —</option>
                    {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Centro de Custo de Origem *</label>
                  <select
                    style={{ ...inp, borderColor: !f.centro_custo_id ? "#E24B4A80" : "#D4DCE8" }}
                    value={f.centro_custo_id}
                    onChange={e => setF(p => ({ ...p, centro_custo_id: e.target.value }))}
                  >
                    <option value="">— Selecionar CC —</option>
                    {ccs.map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                  </select>
                  {ccs.length === 0 && (
                    <div style={{ fontSize: 11, color: "#C9921B", marginTop: 3 }}>
                      Cadastre Centros de Custo em Configurações → Centros de Custo primeiro
                    </div>
                  )}
                </div>
              </div>

              {/* Nome + Descrição */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={f.nome} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Regra Padrão 25/26" />
                </div>
                <div>
                  <label style={lbl}>Descrição (opcional)</label>
                  <input style={inp} value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Proporcional à área plantada" />
                </div>
              </div>

              {/* Barra de distribuição visual */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>
                  Distribuição do Custo
                  <span style={{ marginLeft: 10, fontWeight: 400, color: somaOk ? "#16A34A" : somaLinhas > 100 ? "#E24B4A" : "#C9921B" }}>
                    {somaLinhas.toFixed(1)}% de 100%
                  </span>
                </div>
                <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "0.5px solid #D4DCE8", background: "#F3F6F9" }}>
                  {linhas.map((l, i) => {
                    const pct = Math.min(100, parseFloat(l.percentual) || 0);
                    return pct > 0 ? (
                      <div
                        key={i}
                        style={{
                          width: `${pct}%`, background: CORES[i % CORES.length],
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 10, fontWeight: 700, transition: "width 0.15s",
                          minWidth: pct > 0 ? 20 : 0,
                        }}
                      >
                        {pct > 5 ? `${pct}%` : ""}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Linhas de destino */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase" }}>
                    Destinos do Rateio *
                  </span>
                  <button
                    style={{ ...btnR, fontSize: 11, padding: "4px 12px", background: "#fff" }}
                    onClick={addLinha}
                  >
                    + Adicionar Ciclo
                  </button>
                </div>

                {linhas.length === 0 && (
                  <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: "12px 0" }}>
                    Clique em "+ Adicionar Ciclo" para definir os destinos
                  </div>
                )}

                {linhas.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid", gridTemplateColumns: "16px 2fr 80px 2fr 32px",
                      gap: 8, alignItems: "center", marginBottom: i < linhas.length - 1 ? 8 : 0,
                    }}
                  >
                    {/* Indicador de cor */}
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: CORES[i % CORES.length], flexShrink: 0 }} />

                    {/* Ciclo */}
                    <select
                      style={inp}
                      value={l.ciclo_id}
                      onChange={e => setLinha(i, "ciclo_id", e.target.value)}
                    >
                      <option value="">— Ciclo / Cultura —</option>
                      {(f.ano_safra_id ? ciclosModal : ciclos).map(c => (
                        <option key={c.id} value={c.id}>{CULT[c.cultura] ?? c.cultura}</option>
                      ))}
                    </select>

                    {/* Percentual */}
                    <div style={{ position: "relative" }}>
                      <input
                        style={{ ...inp, paddingRight: 20 }}
                        type="number"
                        min="0" max="100" step="0.5"
                        placeholder="0"
                        value={l.percentual}
                        onChange={e => setPctLinha(i, e.target.value)}
                      />
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#888", pointerEvents: "none" }}>%</span>
                    </div>

                    {/* Descrição */}
                    <input
                      style={inp}
                      placeholder="Observação (opcional)"
                      value={l.descricao}
                      onChange={e => setLinha(i, "descricao", e.target.value)}
                    />

                    {/* Remover */}
                    <button
                      style={{ ...btnX, padding: "5px 7px", flexShrink: 0 }}
                      onClick={() => removeLinha(i)}
                      disabled={linhas.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Indicador de total */}
                {linhas.length > 0 && (
                  <div style={{
                    marginTop: 10, padding: "6px 10px", borderRadius: 6,
                    background: somaOk ? "#DCFCE7" : somaLinhas > 100 ? "#FCEBEB" : "#FBF3E0",
                    border: `0.5px solid ${somaOk ? "#16A34A40" : somaLinhas > 100 ? "#E24B4A40" : "#C9921B40"}`,
                    fontSize: 12,
                    color: somaOk ? "#166534" : somaLinhas > 100 ? "#791F1F" : "#633806",
                    fontWeight: 600,
                  }}>
                    Total: {somaLinhas.toFixed(2)}%
                    {somaOk
                      ? " ✓ Correto"
                      : somaLinhas > 100
                        ? ` — excede 100% em ${(somaLinhas - 100).toFixed(2)}%`
                        : ` — faltam ${(100 - somaLinhas).toFixed(2)}%`}
                  </div>
                )}
              </div>

              {/* Ativo */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={f.ativo} onChange={e => setF(p => ({ ...p, ativo: e.target.checked }))} />
                  Regra ativa
                </label>
              </div>

              {erro && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>
                  {erro}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                <button
                  style={{
                    ...btnV,
                    opacity: salvando || !f.nome.trim() || !f.ano_safra_id || !f.centro_custo_id || !somaOk ? 0.5 : 1,
                  }}
                  disabled={salvando || !f.nome.trim() || !f.ano_safra_id || !f.centro_custo_id || !somaOk}
                  onClick={salvar}
                >
                  {salvando ? "Salvando…" : editId ? "Salvar Alterações" : "Criar Regra"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
