"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import { listarTalhoes, listarInsumos, listarAnosSafra, listarTodosCiclos, criarPlantio, processarPlantio, listarPlantiosDaConta, excluirPlantio, atualizarPlantio, listarFazendas } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import type { Talhao, Insumo, Plantio, AnoSafra, Ciclo, Fazenda } from "../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const fmtN = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const CULTURA_SEMENTE: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª", algodao: "Algodão", trigo: "Trigo", sorgo: "Sorgo",
};

export default function PlantioPage() {
  const { fazendaId, contaId } = useAuth();
  const [cascade, setCascade] = useState<Partial<CascadeValues>>({});
  const fid = cascade.fazendaId ?? fazendaId ?? "";

  const [plantios, setPlantios]       = useState<Plantio[]>([]);
  const [talhoes, setTalhoes]         = useState<Talhao[]>([]);
  const [sementes, setSementes]       = useState<Insumo[]>([]);
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [todosCiclos, setTodosCiclos] = useState<Ciclo[]>([]);
  const [fazendas, setFazendas]       = useState<Fazenda[]>([]);
  const [fazendaFiltro, setFazendaFiltro] = useState("");
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [salvando, setSalvando]       = useState(false);
  const [modal, setModal]             = useState(false);

  const [f, setF] = useState({
    ano_safra_sel: "", ciclo_id: "", talhao_id: "", insumo_id: "", variedade: "",
    area_ha: "", dose_kg_ha: 0, data_plantio: "", data_colheita_prevista: "",
    produtividade_esperada_sc_ha: "", preco_esperado_sc: 0, moeda: "BRL" as "BRL" | "USD",
    observacao: "",
  });

  // Carrega fazendas da conta para filtro
  useEffect(() => {
    listarFazendas(fazendaId ?? undefined).then(setFazendas).catch(() => {});
  }, [fazendaId]);

  // Lista de todas as fazendas da conta, com filtro opcional
  useEffect(() => {
    if (!fazendaId) return;
    setErroCarregamento(null);
    listarPlantiosDaConta(fazendaId)
      .then(data => setPlantios(fazendaFiltro ? data.filter(p => p.fazenda_id === fazendaFiltro) : data))
      .catch(e => setErroCarregamento((e as {message?:string})?.message || JSON.stringify(e)));
    listarInsumos(fazendaId).then(ins => setSementes(ins.filter(i => i.categoria === "semente"))).catch(() => {});
    listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
  }, [fazendaId, fazendaFiltro]);

  // Ciclos e talhões recarregam quando fazenda do formulário muda
  useEffect(() => {
    if (!fid) return;
    listarTalhoes(fid).then(setTalhoes).catch(() => {});
    listarTodosCiclos(fid).then(setTodosCiclos).catch(() => {});
  }, [fid]);

  // Ciclos filtrados pelo Ano Safra selecionado (via cascade)
  const ciclosDisponiveis = cascade.anoSafraId
    ? todosCiclos.filter(c => c.ano_safra_id === cascade.anoSafraId)
    : todosCiclos;

  // calcula quantidade_kg automaticamente
  const qtdKg = f.dose_kg_ha && f.area_ha ? f.dose_kg_ha * parseFloat(f.area_ha) : null;
  const sementeItem = sementes.find(s => s.id === f.insumo_id);
  const custoSementes = qtdKg && sementeItem ? qtdKg * (sementeItem.custo_medio ?? sementeItem.valor_unitario) : null;
  const receitaEsperada = f.produtividade_esperada_sc_ha && f.area_ha && f.preco_esperado_sc
    ? parseFloat(f.produtividade_esperada_sc_ha) * parseFloat(f.area_ha) * f.preco_esperado_sc : null;

  const talhoesFiltrados = talhoes;

  async function salvar() {
    if (!f.ciclo_id || !f.talhao_id || !f.area_ha || !f.data_plantio) return;
    try {
      setSalvando(true);
      const payload: Omit<Plantio, "id" | "created_at"> = {
        fazenda_id: fid!,
        ciclo_id: f.ciclo_id,
        talhao_id: f.talhao_id,
        insumo_id: f.insumo_id || undefined,
        variedade: f.variedade || undefined,
        area_ha: parseFloat(f.area_ha),
        dose_kg_ha: f.dose_kg_ha || undefined,
        quantidade_kg: qtdKg ?? undefined,
        data_plantio: f.data_plantio,
        data_colheita_prevista: f.data_colheita_prevista || undefined,
        produtividade_esperada_sc_ha: f.produtividade_esperada_sc_ha ? parseFloat(f.produtividade_esperada_sc_ha) : undefined,
        preco_esperado_sc: f.preco_esperado_sc ? f.preco_esperado_sc : undefined,
        moeda: f.moeda,
        custo_sementes: custoSementes ?? undefined,
        observacao: f.observacao || undefined,
      };
      const novo = await criarPlantio(payload);
      if (f.insumo_id && qtdKg) {
        await processarPlantio(novo, sementeItem?.nome ?? "Semente");
      }
      setPlantios(p => [novo, ...p]);
      setModal(false);
      setCascade({});
      setF({ ano_safra_sel: "", ciclo_id: "", talhao_id: "", insumo_id: "", variedade: "", area_ha: "", dose_kg_ha: 0, data_plantio: "", data_colheita_prevista: "", produtividade_esperada_sc_ha: "", preco_esperado_sc: 0, moeda: "BRL", observacao: "" });
    } catch (e) { alert((e as {message?:string})?.message || JSON.stringify(e)); } finally { setSalvando(false); }
  }

  const cicloLabel = (id: string) => {
    const c = todosCiclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULTURA_SEMENTE[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };
  const talhaoLabel = (id: string) => talhoes.find(t => t.id === id)?.nome ?? "—";
  const sementeLabel = (id?: string) => sementes.find(s => s.id === id)?.nome ?? "—";

  const totalArea = plantios.reduce((a, p) => a + p.area_ha, 0);

  async function recalcularCusto(plantio: Plantio) {
    const ins = sementes.find(s => s.id === plantio.insumo_id);
    if (!ins || !plantio.quantidade_kg) return;
    const custo = plantio.quantidade_kg * (ins.custo_medio ?? ins.valor_unitario);
    if (!custo) return;
    await atualizarPlantio(plantio.id, { custo_sementes: custo });
    setPlantios(prev => prev.map(p => p.id === plantio.id ? { ...p, custo_sementes: custo } : p));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, padding: "24px 28px" }}>
        <header style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "10px 18px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "var(--text-1)", fontWeight: 600 }}>Plantio</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Registro de plantio por talhão — semente, dose, datas e projeção de colheita</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {fazendas.length > 1 && (
              <select style={{ ...inp, width: 200 }} value={fazendaFiltro} onChange={e => setFazendaFiltro(e.target.value)}>
                <option value="">Todas as fazendas</option>
                {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            )}
            <button style={btnV} onClick={() => { setCascade({}); setModal(true); }}>+ Registrar Plantio</button>
          </div>
        </header>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Talhões plantados", valor: String(plantios.length), cor: "#1A4870" },
            { label: "Área total plantada", valor: totalArea.toLocaleString("pt-BR"), unidade: "ha", cor: "#C9921B" },
            { label: "Receita esperada total", valor: fmtBRL(plantios.reduce((s, p) => s + ((p.produtividade_esperada_sc_ha ?? 0) * p.area_ha * (p.preco_esperado_sc ?? 0)), 0)), cor: "#1A4870" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.cor }}>
                {s.valor}{"unidade" in s && s.unidade && <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 4 }}>{s.unidade}</span>}
              </div>
            </div>
          ))}
        </div>

        {plantios.length === 0 ? (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 40, textAlign: "center", color: "#444" }}>
            Nenhum plantio registrado. Clique em "+ Registrar Plantio" para começar.
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {fazendas.length > 1 && <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Fazenda</th>}
                    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Safra / Talhão</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Semente / Cultivar</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Área</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Dose / Qtd Total</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Data Plantio</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Colheita Prev.</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Produt. Esp.</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Receita Esp.</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Custo Semente</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {plantios.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < plantios.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                      {fazendas.length > 1 && (
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, background: "#EFF6FF", color: "#1A4870", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>
                            {fazendas.find(f => f.id === p.fazenda_id)?.nome ?? "—"}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ color: "var(--text-1)", fontWeight: 600 }}>{cicloLabel(p.ciclo_id)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>{talhaoLabel(p.talhao_id)}</div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <div>{sementeLabel(p.insumo_id)}</div>
                        {p.variedade && <div style={{ fontSize: 11, color: "var(--text-2)" }}>{p.variedade}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-1)", fontWeight: 600 }}>{fmtN(p.area_ha)} ha</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {p.dose_kg_ha ? <div>{fmtN(p.dose_kg_ha)} kg/ha</div> : "—"}
                        {p.quantidade_kg ? <div style={{ fontSize: 11, color: "var(--text-2)" }}>{fmtN(p.quantidade_kg)} kg total</div> : ""}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtData(p.data_plantio)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtData(p.data_colheita_prevista)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {p.produtividade_esperada_sc_ha
                          ? <span style={{ fontWeight: 600, color: "#1A4870" }}>{fmtN(p.produtividade_esperada_sc_ha)} sc/ha</span>
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {p.preco_esperado_sc && p.produtividade_esperada_sc_ha
                          ? <span style={{ fontWeight: 600, color: "#1A4870" }}>{fmtBRL(p.produtividade_esperada_sc_ha * p.area_ha * p.preco_esperado_sc)}</span>
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {(() => {
                          if (p.custo_sementes) {
                            return <span style={{ color: "#E24B4A", fontWeight: 600 }}>{fmtBRL(p.custo_sementes)}</span>;
                          }
                          const ins = sementes.find(s => s.id === p.insumo_id);
                          const calc = ins && p.quantidade_kg ? p.quantidade_kg * (ins.custo_medio ?? ins.valor_unitario) : null;
                          if (calc) {
                            return (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                <span style={{ color: "#C9921B", fontWeight: 600 }}>{fmtBRL(calc)}</span>
                                <button
                                  style={{ fontSize: 10, padding: "1px 6px", border: "0.5px solid #C9921B", borderRadius: 4, background: "#FBF3E0", color: "#7A5A0A", cursor: "pointer" }}
                                  onClick={() => recalcularCusto(p)}
                                  title="Salvar custo calculado no registro"
                                >
                                  💾 salvar
                                </button>
                              </div>
                            );
                          }
                          return <span style={{ color: "var(--text-3)" }}>—</span>;
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirPlantio(p.id).then(() => setPlantios(x => x.filter(r => r.id !== p.id))); }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 26 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "var(--text-1)", fontWeight: 600, fontSize: 15 }}>Registrar Plantio</div>
            </div>

            {/* Hierarquia: Produtor → Fazenda → Safra → Ciclo → Talhão */}
            <div style={{ marginBottom: 14 }}>
              <CascadeSelector
                contaId={contaId}
                values={cascade}
                onChange={next => {
                  setCascade(next);
                  setF(p => ({ ...p, ano_safra_sel: next.anoSafraId ?? "", ciclo_id: next.cicloId ?? "", talhao_id: next.talhaoId ?? "" }));
                }}
              />
            </div>

            {/* Automação info */}
            <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
              ⟳ Ao salvar: baixa automática do estoque de semente + lançamento CP "Custo de Sementes" no financeiro.
            </div>

            {erroCarregamento && (
              <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>
                Erro ao carregar dados: {erroCarregamento}
              </div>
            )}


            {/* Semente */}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "0.5px solid var(--border-table)", paddingBottom: 4 }}>Semente / Cultivar</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>
                  Semente (estoque)
                  {sementeItem && <span style={{ color: "#1A4870", marginLeft: 6 }}>Estoque: {fmtN(sementeItem.estoque)} {sementeItem.unidade}</span>}
                </label>
                <select style={inp} value={f.insumo_id} onChange={e => setF(p => ({ ...p, insumo_id: e.target.value }))}>
                  <option value="">— Selecionar semente —</option>
                  {sementes.map(s => <option key={s.id} value={s.id}>{s.nome} · {fmtN(s.estoque)} {s.unidade}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Cultivar / Variedade</label>
                <input style={inp} placeholder="Ex: M 5947 IPRO" value={f.variedade} onChange={e => setF(p => ({ ...p, variedade: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Dose (kg/ha)</label>
                <InputMonetario style={inp} placeholder="Ex: 55" value={f.dose_kg_ha} onChange={v => setF(p => ({ ...p, dose_kg_ha: v }))} />
              </div>
            </div>

            {/* Área e datas */}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "0.5px solid var(--border-table)", paddingBottom: 4 }}>Área e Datas</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Área (ha) *</label>
                <InputNumerico style={inp} placeholder="Ex: 150" value={f.area_ha} onChange={v => setF(p => ({ ...p, area_ha: v }))} />
              </div>
              <div>
                <label style={lbl}>Data de Plantio *</label>
                <input style={inp} type="date" value={f.data_plantio} onChange={e => setF(p => ({ ...p, data_plantio: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Colheita Prevista</label>
                <input style={inp} type="date" value={f.data_colheita_prevista} onChange={e => setF(p => ({ ...p, data_colheita_prevista: e.target.value }))} />
              </div>
              <div></div>
            </div>

            {/* Projeção financeira */}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "0.5px solid var(--border-table)", paddingBottom: 4 }}>Projeção de Colheita</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Produtividade Esperada (sc/ha)</label>
                <InputNumerico style={inp} placeholder="Ex: 65,0" value={f.produtividade_esperada_sc_ha} onChange={v => setF(p => ({ ...p, produtividade_esperada_sc_ha: v }))} />
              </div>
              <div>
                <label style={lbl}>Moeda</label>
                <select style={inp} value={f.moeda} onChange={e => setF(p => ({ ...p, moeda: e.target.value as "BRL" | "USD" }))}>
                  <option value="BRL">Real (R$)</option>
                  <option value="USD">Dólar (US$)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Preço Esperado ({f.moeda === "USD" ? "US$/sc" : "R$/sc"})</label>
                <InputMonetario style={inp} placeholder={f.moeda === "USD" ? "Ex: 10,50" : "Ex: 130,00"} value={f.preco_esperado_sc} onChange={v => setF(p => ({ ...p, preco_esperado_sc: v }))} />
              </div>
              {/* Preview */}
              {(qtdKg || custoSementes || receitaEsperada) && (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                    {qtdKg && <div>Semente total: <strong>{fmtN(qtdKg)} kg</strong></div>}
                    {custoSementes && <div>Custo semente: <strong style={{ color: "#E24B4A" }}>{fmtBRL(custoSementes)}</strong></div>}
                    {receitaEsperada && <div>Receita esperada: <strong style={{ color: "#1A4870" }}>{fmtBRL(receitaEsperada)}</strong></div>}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>Observação</label>
              <input style={inp} value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando || !f.ciclo_id || !f.talhao_id || !f.area_ha || !f.data_plantio ? 0.5 : 1 }}
                disabled={salvando || !f.ciclo_id || !f.talhao_id || !f.area_ha || !f.data_plantio}
                onClick={salvar}>{salvando ? "Salvando…" : "⟳ Registrar e baixar estoque"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
