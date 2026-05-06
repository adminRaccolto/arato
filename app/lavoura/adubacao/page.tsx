"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarTodosCiclos, listarTalhoes, listarInsumos,
  listarAnosSafra,
  listarAdubacoes, criarAdubacao, criarAdubacaoItem, processarAdubacao, excluirAdubacao,
} from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import FazendaSelector from "../../../components/FazendaSelector";
import type { Ciclo, Talhao, Insumo, AdubacaoBase, AdubacaoBaseItem, AnoSafra } from "../../../lib/supabase";

// ── estilos ───────────────────────────────────────────────
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10, marginTop: 16, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" };

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const fmtN    = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const MODALIDADES: Record<AdubacaoBase["modalidade"], { label: string; bg: string; color: string }> = {
  convencional:  { label: "Convencional",   bg: "#F3F6F9", color: "#1a1a1a" },
  sulco:         { label: "Sulco",          bg: "#E6F1FB", color: "#0C447C" },
  broadcast:     { label: "Broadcast",      bg: "#FBF3E0", color: "#7A5A12" },
  foliar:        { label: "Foliar",         bg: "#ECFDF5", color: "#14532D" },
  fertirrigacao: { label: "Fertirrigação",  bg: "#F0EAFB", color: "#5A1A90" },
};

const CULTURAS: Record<string, string> = { soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª", algodao: "Algodão", trigo: "Trigo", sorgo: "Sorgo" };

type ItemForm = { insumo_id: string; produto_nome: string; dose_kg_ha: string; };

export default function AdubacaoBasePage() {
  const { fazendaId, contaId } = useAuth();
  const [formFazendaId, setFormFazendaId] = useState<string | null>(null);
  const fid = formFazendaId ?? fazendaId;

  const [registros, setRegistros]     = useState<AdubacaoBase[]>([]);
  const [todosCiclos, setTodosCiclos] = useState<Ciclo[]>([]);
  const [talhoes, setTalhoes]         = useState<Talhao[]>([]);
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [erro, setErro]           = useState<string | null>(null);
  const [salvando, setSalvando]   = useState(false);
  const [modal, setModal]         = useState(false);

  const [f, setF] = useState({
    ano_safra_sel: "", ciclo_id: "", talhao_id: "",
    modalidade: "convencional" as AdubacaoBase["modalidade"],
    area_ha: "", data_aplicacao: "", observacao: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([{ insumo_id: "", produto_nome: "", dose_kg_ha: "" }]);

  // Lista de registros — sempre da fazenda ativa no switcher
  useEffect(() => {
    if (!fazendaId) return;
    setErro(null);
    Promise.all([
      listarAdubacoes(fazendaId).then(setRegistros),
      listarInsumos(fazendaId).then(ins => setInsumos(ins.filter(i => i.tipo === "insumo"))),
    ]).catch(e => setErro((e as { message?: string })?.message || JSON.stringify(e)));
    listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
  }, [fazendaId]);

  // Ciclos e talhões — recarregam quando fazenda do formulário muda
  useEffect(() => {
    if (!fid) return;
    listarTodosCiclos(fid).then(setTodosCiclos).catch(() => {});
    listarTalhoes(fid).then(setTalhoes).catch(() => {});
  }, [fid]);

  function mudarFazenda(novaId: string) {
    setFormFazendaId(novaId);
    setF(p => ({ ...p, ciclo_id: "", talhao_id: "", ano_safra_sel: "" }));
  }

  const ciclosDisponiveis = f.ano_safra_sel
    ? todosCiclos.filter(c => c.ano_safra_id === f.ano_safra_sel)
    : todosCiclos;

  const areaHa = parseFloat(f.area_ha) || 0;

  const calcItens = itens.filter(it => it.dose_kg_ha && (it.insumo_id || it.produto_nome)).map(it => {
    const ins = insumos.find(i => i.id === it.insumo_id);
    const dose = parseFloat(it.dose_kg_ha) || 0;
    const qtdKg = dose * areaHa;
    const vu = ins?.custo_medio ?? ins?.valor_unitario ?? 0;
    return {
      ...it,
      dose_kg_ha: dose,
      quantidade_kg: qtdKg,
      valor_unitario: vu,
      custo_total: vu * qtdKg,
      nome: ins?.nome ?? it.produto_nome,
    };
  });
  const custoTotal = calcItens.reduce((s, it) => s + it.custo_total, 0);

  function addItem() { setItens(p => [...p, { insumo_id: "", produto_nome: "", dose_kg_ha: "" }]); }
  function removeItem(i: number) { setItens(p => p.filter((_, idx) => idx !== i)); }

  async function salvar() {
    if (!f.ciclo_id || !f.area_ha || !f.data_aplicacao) return;
    if (calcItens.length === 0) { alert("Adicione ao menos um produto."); return; }
    try {
      setSalvando(true);
      const reg = await criarAdubacao({
        fazenda_id: fid!,
        ciclo_id: f.ciclo_id,
        talhao_id: f.talhao_id || undefined,
        modalidade: f.modalidade,
        area_ha: areaHa,
        data_aplicacao: f.data_aplicacao,
        observacao: f.observacao || undefined,
        custo_total: custoTotal || undefined,
      });
      const itensSalvos: AdubacaoBaseItem[] = [];
      const nomes: Record<string, string> = {};
      for (const it of calcItens) {
        const item = await criarAdubacaoItem({
          adubacao_id: reg.id, fazenda_id: fazendaId!,
          insumo_id: it.insumo_id || undefined,
          produto_nome: it.nome,
          dose_kg_ha: it.dose_kg_ha,
          quantidade_kg: it.quantidade_kg,
          valor_unitario: it.valor_unitario || undefined,
          custo_total: it.custo_total || undefined,
        });
        itensSalvos.push(item);
        if (it.insumo_id) nomes[it.insumo_id] = it.nome;
      }
      await processarAdubacao({ ...reg, custo_total: custoTotal }, itensSalvos, nomes);
      setRegistros(p => [{ ...reg, custo_total: custoTotal }, ...p]);
      setModal(false);
      setItens([{ insumo_id: "", produto_nome: "", dose_kg_ha: "" }]);
      setF({ ano_safra_sel: "", ciclo_id: "", talhao_id: "", modalidade: "convencional", area_ha: "", data_aplicacao: "", observacao: "" });
    } catch (e) { alert((e as { message?: string })?.message || JSON.stringify(e)); }
    finally { setSalvando(false); }
  }

  const cicloLabel = (id: string) => {
    const c = todosCiclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULTURAS[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };
  const talhaoLabel = (id?: string) => talhoes.find(t => t.id === id)?.nome ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Adubação de Base</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>NPK, micronutrientes, adubação foliar e fertirrigação</p>
          </div>
          <button style={btnV} onClick={() => { setFormFazendaId(fazendaId); setModal(true); }}>+ Registrar Aplicação</button>
        </header>

        <div style={{ padding: "18px 22px", flex: 1, overflowY: "auto" }}>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total de aplicações",    valor: String(registros.length),                                                           cor: "#1A4870" },
              { label: "Área total adubada",     valor: `${registros.reduce((s, r) => s + r.area_ha, 0).toLocaleString("pt-BR")} ha`,       cor: "#C9921B" },
              { label: "Custo total fertilizantes", valor: fmtBRL(registros.reduce((s, r) => s + (r.custo_total ?? 0), 0)),                cor: "#E24B4A" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: s.cor }}>{s.valor}</div>
              </div>
            ))}
          </div>

          {registros.length === 0 ? (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 40, textAlign: "center", color: "#444" }}>
              Nenhuma aplicação registrada.
            </div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Safra / Talhão", "Modalidade", "Área", "Data", "Custo Total", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r, i) => {
                    const mod = MODALIDADES[r.modalidade];
                    return (
                      <tr key={r.id} style={{ borderBottom: i < registros.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{cicloLabel(r.ciclo_id)}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{r.talhao_id ? talhaoLabel(r.talhao_id) : "Todos os talhões"}</div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span style={{ background: mod.bg, color: mod.color, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{mod.label}</span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>{fmtN(r.area_ha)} ha</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmtData(r.data_aplicacao)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#E24B4A" }}>
                          {r.custo_total ? fmtBRL(r.custo_total) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <button style={btnX} onClick={() => { if (confirm("Excluir registro?")) excluirAdubacao(r.id).then(() => setRegistros(x => x.filter(x2 => x2.id !== r.id))); }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 720, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>Registrar Adubação de Base</div>
              <FazendaSelector contaId={contaId} value={fid} onChange={mudarFazenda} />
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>NPK, micronutrientes, adubação foliar e fertirrigação</div>

            <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#0B2D50" }}>
              ⟳ Ao salvar: baixa automática do estoque dos fertilizantes + lançamento CP "Insumos / Fertilizantes" no financeiro.
            </div>

            {erro && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erro}</div>}

            {/* Identificação */}
            <div style={secTit}>Identificação</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 4 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select style={inp} value={f.ano_safra_sel} onChange={e => setF(p => ({ ...p, ano_safra_sel: e.target.value, ciclo_id: "" }))}>
                  <option value="">— Todos os anos —</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo / Cultura *</label>
                <select style={inp} value={f.ciclo_id} onChange={e => setF(p => ({ ...p, ciclo_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {ciclosDisponiveis.map(c => {
                    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
                    return <option key={c.id} value={c.id}>{CULTURAS[c.cultura] ?? c.cultura}{ano ? ` · ${ano}` : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={lbl}>Talhão</label>
                <select style={inp} value={f.talhao_id} onChange={e => setF(p => ({ ...p, talhao_id: e.target.value }))}>
                  <option value="">Todos os talhões</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome} · {t.area_ha} ha</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Modalidade *</label>
                <select style={inp} value={f.modalidade} onChange={e => setF(p => ({ ...p, modalidade: e.target.value as AdubacaoBase["modalidade"] }))}>
                  {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Área (ha) *</label>
                <input style={inp} type="number" step="0.1" placeholder="Ex: 440" value={f.area_ha} onChange={e => setF(p => ({ ...p, area_ha: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Data de Aplicação *</label>
                <input style={inp} type="date" value={f.data_aplicacao} onChange={e => setF(p => ({ ...p, data_aplicacao: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input style={inp} placeholder="Ex: Adubação em sulco no plantio" value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} />
              </div>
            </div>

            {/* Produtos */}
            <div style={secTit}>Fertilizantes Aplicados</div>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr 1fr 1fr auto", gap: 8, marginBottom: 6, padding: "0 2px" }}>
              {["Produto / Insumo", "Produto (se não estiver no estoque)", "Dose (kg/ha)", "Total (kg)", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 10, color: "#666", fontWeight: 600 }}>{h}</div>
              ))}
            </div>
            {itens.map((it, idx) => {
              const ins = insumos.find(i => i.id === it.insumo_id);
              const dose = parseFloat(it.dose_kg_ha) || 0;
              const qtd = dose * areaHa;
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "3fr 2fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select style={inp} value={it.insumo_id} onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, insumo_id: e.target.value, produto_nome: "" } : x))}>
                    <option value="">— Selecionar do estoque —</option>
                    {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} · {fmtN(i.estoque, 0)} {i.unidade}</option>)}
                  </select>
                  <input style={{ ...inp, opacity: it.insumo_id ? 0.4 : 1 }} placeholder="Nome livre" value={it.produto_nome} disabled={!!it.insumo_id}
                    onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, produto_nome: e.target.value } : x))} />
                  <input style={inp} type="number" step="1" placeholder="Ex: 350" value={it.dose_kg_ha}
                    onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, dose_kg_ha: e.target.value } : x))} />
                  <div style={{ ...inp, background: "#F3F6F9", color: "#555", textAlign: "center" as const }}>
                    {qtd > 0 ? fmtN(qtd, 0) : "—"} kg
                  </div>
                  <button style={btnX} onClick={() => removeItem(idx)}>✕</button>
                  {ins && <div style={{ gridColumn: "1/-1", fontSize: 10, color: "#1A4870", marginTop: -4 }}>
                    Estoque atual: {fmtN(ins.estoque, 0)} {ins.unidade} · Custo médio: {fmtBRL(ins.custo_medio ?? ins.valor_unitario ?? 0)}/kg
                  </div>}
                </div>
              );
            })}
            <button style={{ ...btnR, fontSize: 12, padding: "5px 12px" }} onClick={addItem}>+ Adicionar fertilizante</button>

            {/* Preview custo */}
            {custoTotal > 0 && (
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", marginTop: 16, fontSize: 12 }}>
                <div style={{ color: "#7A5A12", fontWeight: 600, marginBottom: 4 }}>Resumo de custo</div>
                {calcItens.map((it, i) => (
                  <div key={i} style={{ color: "#555", marginBottom: 2 }}>
                    {it.nome}: {fmtN(it.quantidade_kg, 0)} kg · {fmtBRL(it.custo_total)}
                  </div>
                ))}
                <div style={{ marginTop: 6, fontWeight: 600, color: "#C9921B" }}>
                  Total: {fmtBRL(custoTotal)} · {areaHa > 0 ? fmtBRL(custoTotal / areaHa) + "/ha" : ""}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
              <button
                style={{ ...btnV, opacity: salvando || !f.ciclo_id || !f.area_ha || !f.data_aplicacao ? 0.5 : 1 }}
                disabled={salvando || !f.ciclo_id || !f.area_ha || !f.data_aplicacao}
                onClick={salvar}>
                {salvando ? "Salvando…" : "⟳ Registrar e baixar estoque"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
