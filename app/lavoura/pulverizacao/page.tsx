"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarTalhoes, listarInsumos,
  listarAnosSafra, listarTodosCiclos,
  criarPulverizacao, criarPulverizacaoItem, processarPulverizacao,
  listarPulverizacoes, listarPulverizacaoItens, excluirPulverizacao,
} from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import FazendaSelector from "../../../components/FazendaSelector";
import type { Talhao, Insumo, PulverizacaoOp, PulverizacaoItem, AnoSafra, Ciclo } from "../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 16, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const fmtN = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const TIPOS: Record<PulverizacaoOp["tipo"], { label: string; bg: string; color: string }> = {
  herbicida:          { label: "Herbicida",             bg: "#FAEEDA", color: "#633806" },
  fungicida:          { label: "Fungicida",             bg: "#E6F1FB", color: "#0C447C" },
  inseticida:         { label: "Inseticida",            bg: "#FBF0D8", color: "#7A5A12" },
  nematicida:         { label: "Nematicida",            bg: "#FBF3E0", color: "#8B5E14" },
  acaricida:          { label: "Acaricida",             bg: "#F1EFE8", color: "#555"    },
  fertilizante_foliar:{ label: "Fertilizante Foliar",   bg: "#D5E8F5", color: "#0B2D50" },
  regulador:          { label: "Regulador Crescimento", bg: "#FFF8EC", color: "#7A5200" },
  dessecacao:         { label: "Dessecação",            bg: "#F8EBE0", color: "#7A2E00" },
  outros:             { label: "Outros",                bg: "#F3F6F9", color: "#555"    },
};

const ESTADIOS = ["VE","V1","V2","V3","V4","V5","V6","R1","R2","R3","R4","R5","R6","R7","R8","Pós-emergência","Pré-emergência"];

type ItemForm = { insumo_id: string; dose_ha: string; unidade: string };

export default function PulverizacaoPage() {
  const { fazendaId, contaId } = useAuth();
  const [formFazendaId, setFormFazendaId] = useState<string | null>(null);
  const fid = formFazendaId ?? fazendaId;

  const [pulverizacoes, setPulverizacoes] = useState<PulverizacaoOp[]>([]);
  const [talhoes, setTalhoes]     = useState<Talhao[]>([]);
  const [insumos, setInsumos]     = useState<Insumo[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [todosCiclos, setTodosCiclos] = useState<Ciclo[]>([]);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [salvando, setSalvando]   = useState(false);
  const [modal, setModal]         = useState(false);
  const [detalhe, setDetalhe]     = useState<{ pulv: PulverizacaoOp; itens: PulverizacaoItem[] } | null>(null);

  const [f, setF] = useState({
    ano_safra_sel: "", ciclo_id: "", talhao_id: "", tipo: "herbicida" as PulverizacaoOp["tipo"],
    pre_pos: "" as "" | "pre" | "pos" | "dessecacao", estadio_fenologico: "",
    data_inicio: "", data_fim: "", area_ha: "",
    cap_tanque_l: "", vazao_l_ha: "", num_tanques: "",
    fiscal: false, observacao: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([{ insumo_id: "", dose_ha: "", unidade: "L" }]);

  useEffect(() => {
    if (!fazendaId) return;
    setErroCarregamento(null);
    Promise.all([
      listarPulverizacoes(fazendaId).then(setPulverizacoes),
      listarInsumos(fazendaId).then(ins => setInsumos(ins.filter(i => i.tipo === "insumo"))),
    ]).catch(e => setErroCarregamento((e as {message?:string})?.message || JSON.stringify(e)));
    listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
  }, [fazendaId]);

  useEffect(() => {
    if (!fid) return;
    listarTalhoes(fid).then(setTalhoes).catch(() => {});
    listarTodosCiclos(fid).then(setTodosCiclos).catch(() => {});
  }, [fid]);

  function mudarFazenda(novaId: string) {
    setFormFazendaId(novaId);
    setF(p => ({ ...p, ciclo_id: "", talhao_id: "", ano_safra_sel: "" }));
  }

  // Ciclos filtrados pelo Ano Safra selecionado
  const ciclosDisponiveis = f.ano_safra_sel
    ? todosCiclos.filter(c => c.ano_safra_id === f.ano_safra_sel)
    : todosCiclos;

  const areaHa = parseFloat(f.area_ha) || 0;
  const caldaTotal = f.cap_tanque_l && f.num_tanques ? parseFloat(f.cap_tanque_l) * parseInt(f.num_tanques) : null;

  const calcItens = itens.filter(it => it.insumo_id && it.dose_ha).map(it => {
    const ins = insumos.find(i => i.id === it.insumo_id);
    const dose = parseFloat(it.dose_ha) || 0;
    const total = dose * areaHa;
    const vu = ins?.custo_medio ?? ins?.valor_unitario ?? 0;
    return { ...it, total_consumido: total, valor_unitario: vu, custo_ha: vu * dose, custo_total: vu * dose * areaHa, nome: ins?.nome ?? "—" };
  });
  const custoTotal = calcItens.reduce((s, it) => s + it.custo_total, 0);

  async function salvar() {
    if (!f.ciclo_id || !f.area_ha || !f.data_inicio) return;
    if (calcItens.length === 0) { alert("Adicione ao menos um produto."); return; }
    try {
      setSalvando(true);
      const pulv = await criarPulverizacao({
        fazenda_id: fid!, ciclo_id: f.ciclo_id,
        talhao_id: f.talhao_id || undefined,
        tipo: f.tipo,
        pre_pos: f.pre_pos || null,
        estadio_fenologico: f.estadio_fenologico || undefined,
        data_inicio: f.data_inicio, data_fim: f.data_fim || undefined,
        area_ha: areaHa,
        cap_tanque_l: f.cap_tanque_l ? parseFloat(f.cap_tanque_l) : undefined,
        vazao_l_ha: f.vazao_l_ha ? parseFloat(f.vazao_l_ha) : undefined,
        num_tanques: f.num_tanques ? parseInt(f.num_tanques) : undefined,
        calda_total_l: caldaTotal ?? undefined,
        custo_total: custoTotal,
        fiscal: f.fiscal, observacao: f.observacao || undefined,
      });
      const itensSalvos: PulverizacaoItem[] = [];
      for (const it of calcItens) {
        const item = await criarPulverizacaoItem({
          pulverizacao_id: pulv.id, fazenda_id: fid!,
          insumo_id: it.insumo_id, nome_produto: it.nome,
          dose_ha: parseFloat(it.dose_ha),
          unidade: it.unidade, total_consumido: it.total_consumido,
          valor_unitario: it.valor_unitario, custo_ha: it.custo_ha, custo_total: it.custo_total,
        });
        itensSalvos.push(item);
      }
      const nomes: Record<string, string> = {};
      calcItens.forEach(it => { nomes[it.insumo_id] = it.nome; });
      await processarPulverizacao(pulv, itensSalvos, nomes);
      setPulverizacoes(p => [{ ...pulv, custo_total: custoTotal }, ...p]);
      setModal(false);
      setItens([{ insumo_id: "", dose_ha: "", unidade: "L" }]);
      setF({ ano_safra_sel: "", ciclo_id: "", talhao_id: "", tipo: "herbicida", pre_pos: "", estadio_fenologico: "", data_inicio: "", data_fim: "", area_ha: "", cap_tanque_l: "", vazao_l_ha: "", num_tanques: "", fiscal: false, observacao: "" });
    } catch (e) { alert((e as {message?:string})?.message || JSON.stringify(e)); } finally { setSalvando(false); }
  }

  const CULT_LABEL: Record<string, string> = { soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª", algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo" };
  const cicloLabel = (id: string) => {
    const c = todosCiclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULT_LABEL[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, padding: "24px 28px" }}>
        <header style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "10px 18px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Pulverização</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Herbicidas, fungicidas, inseticidas, nematicidas e fertilizantes foliares</p>
          </div>
          <button style={btnV} onClick={() => { setFormFazendaId(fazendaId); setModal(true); }}>+ Registrar Aplicação</button>
        </header>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Total de aplicações", valor: String(pulverizacoes.length), cor: "#1A4870" },
            { label: "Custo total defensivos", valor: fmtBRL(pulverizacoes.reduce((s, p) => s + (p.custo_total ?? 0), 0)), cor: "#E24B4A" },
            { label: "Área total tratada", valor: `${pulverizacoes.reduce((s, p) => s + p.area_ha, 0).toLocaleString("pt-BR")} ha`, cor: "#C9921B" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.cor }}>{s.valor}</div>
            </div>
          ))}
        </div>

        {pulverizacoes.length === 0 ? (
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 40, textAlign: "center", color: "#444" }}>
            Nenhuma pulverização registrada.
          </div>
        ) : (
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Safra / Talhão</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Tipo</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Estádio</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Data</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Área</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Calda Total</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Custo Total</th>
                    <th style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pulverizacoes.map((p, i) => {
                    const tm = TIPOS[p.tipo];
                    return (
                      <tr key={p.id} style={{ borderBottom: i < pulverizacoes.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{cicloLabel(p.ciclo_id ?? "")}</div>
                          {p.talhao_id && <div style={{ fontSize: 11, color: "#555" }}>{talhoes.find(t => t.id === p.talhao_id)?.nome ?? "—"}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: tm.bg, color: tm.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{tm.label}</span>
                          {p.pre_pos && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{p.pre_pos === "pre" ? "Pré-emerg." : p.pre_pos === "pos" ? "Pós-emerg." : "Dessecação"}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.estadio_fenologico ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtData(p.data_inicio)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{fmtN(p.area_ha)} ha</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>
                          {p.calda_total_l ? `${fmtN(p.calda_total_l)} L` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#E24B4A" }}>
                          {p.custo_total ? fmtBRL(p.custo_total) : (
                            <span style={{ color: "#EF9F27", fontSize: 11 }} title="Insumo sem preço no momento do registro">⚠️ s/ custo</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={async () => {
                              const itensList = await listarPulverizacaoItens(p.id);
                              // Recalcula com preço atual quando custo armazenado é zero
                              const itensRecalc = itensList.map(it => {
                                if ((it.custo_total ?? 0) > 0) return it;
                                const ins = insumos.find(i => i.id === it.insumo_id);
                                const vu = ins?.custo_medio ?? ins?.valor_unitario ?? 0;
                                if (!vu) return it;
                                const dose = it.dose_ha ?? 0;
                                const total = it.total_consumido ?? 0;
                                return { ...it, valor_unitario: vu, custo_ha: vu * dose, custo_total: vu * total };
                              });
                              setDetalhe({ pulv: p, itens: itensRecalc });
                            }}>Produtos</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirPulverizacao(p.id).then(() => setPulverizacoes(x => x.filter(r => r.id !== p.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Detalhe Produtos */}
      {detalhe && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setDetalhe(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 26 }}>
            <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Produtos aplicados</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: detalhe.itens.some(it => (it.custo_total ?? 0) === 0 && (insumos.find(i => i.id === it.insumo_id)?.custo_medio ?? 0) > 0) ? 8 : 18 }}>
              {TIPOS[detalhe.pulv.tipo].label} · {fmtData(detalhe.pulv.data_inicio)} · {fmtN(detalhe.pulv.area_ha)} ha
            </div>
            {detalhe.itens.some(it => (it.custo_total ?? 0) === 0 && (insumos.find(i => i.id === it.insumo_id)?.custo_medio ?? 0) > 0) && (
              <div style={{ background: "#FBF3E0", border: "0.5px solid #EF9F27", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#7A5200", marginBottom: 14 }}>
                ⚠️ Custo recalculado com o preço atual do insumo — valor original era R$0,00 (insumo sem preço no momento do registro).
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#F3F6F9" }}>
                  {["Produto", "Dose/ha", "Total Consumido", "Valor Unit.", "Custo/ha", "Custo Total"].map((h, i) => (
                    <th key={i} style={{ padding: "7px 12px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {detalhe.itens.map((it, i) => (
                    <tr key={it.id} style={{ borderBottom: i < detalhe.itens.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "8px 12px" }}>{insumos.find(x => x.id === it.insumo_id)?.nome ?? it.insumo_id}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtN(it.dose_ha, 3)} {it.unidade}/ha</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtN(it.total_consumido, 3)} {it.unidade}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtBRL(it.valor_unitario)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(it.custo_ha)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#E24B4A" }}>{fmtBRL(it.custo_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F3F6F9", color: "#1a1a1a", fontWeight: 600 }}>
                    <td colSpan={4} style={{ padding: "7px 12px", textAlign: "right", fontSize: 11, color: "#555" }}>TOTAL</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(detalhe.itens.reduce((s, it) => s + it.custo_ha, 0))}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(detalhe.itens.reduce((s, it) => s + it.custo_total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnR} onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Aplicação */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 740, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 15 }}>Registrar Pulverização / Aplicação</div>
              <FazendaSelector contaId={contaId} value={fid} onChange={mudarFazenda} />
            </div>

            <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
              ⟳ Ao salvar: baixa automática do estoque de cada produto + lançamento CP "Defensivos Agrícolas" no financeiro.
            </div>

            {erroCarregamento && (
              <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>
                Erro ao carregar dados: {erroCarregamento}
              </div>
            )}

            {/* Identificação */}
            <div style={secTit}>Identificação</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select style={inp} value={f.ano_safra_sel} onChange={e => setF(p => ({ ...p, ano_safra_sel: e.target.value, ciclo_id: "" }))}>
                  <option value="">— Todos os anos —</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Safra / Cultura *</label>
                <select style={inp} value={f.ciclo_id} onChange={e => setF(p => ({ ...p, ciclo_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {ciclosDisponiveis.map(c => {
                    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
                    return <option key={c.id} value={c.id}>{CULT_LABEL[c.cultura] ?? c.cultura}{ano ? ` · ${ano}` : ""}{c.descricao ? ` — ${c.descricao}` : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={lbl}>Talhão</label>
                <select style={inp} value={f.talhao_id} onChange={e => setF(p => ({ ...p, talhao_id: e.target.value }))}>
                  <option value="">— Todos os talhões —</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome} · {t.area_ha} ha</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo de Aplicação *</label>
                <select style={inp} value={f.tipo} onChange={e => setF(p => ({ ...p, tipo: e.target.value as PulverizacaoOp["tipo"] }))}>
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Pré / Pós Emergência</label>
                <select style={inp} value={f.pre_pos} onChange={e => setF(p => ({ ...p, pre_pos: e.target.value as "" | "pre" | "pos" | "dessecacao" }))}>
                  <option value="">—</option>
                  <option value="pre">Pré-emergência</option>
                  <option value="pos">Pós-emergência</option>
                  <option value="dessecacao">Dessecação</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Estádio Fenológico</label>
                <select style={inp} value={f.estadio_fenologico} onChange={e => setF(p => ({ ...p, estadio_fenologico: e.target.value }))}>
                  <option value="">—</option>
                  {ESTADIOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Área (ha) *</label>
                <input style={inp} type="number" step="0.1" placeholder="Ex: 500" value={f.area_ha} onChange={e => setF(p => ({ ...p, area_ha: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Data Início *</label>
                <input style={inp} type="date" value={f.data_inicio} onChange={e => setF(p => ({ ...p, data_inicio: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Data Término</label>
                <input style={inp} type="date" value={f.data_fim} onChange={e => setF(p => ({ ...p, data_fim: e.target.value }))} />
              </div>
            </div>

            {/* Calda */}
            <div style={secTit}>Calda / Pulverizador</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Cap. Tanque (L)</label>
                <input style={inp} type="number" step="1" placeholder="Ex: 2000" value={f.cap_tanque_l} onChange={e => setF(p => ({ ...p, cap_tanque_l: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Vazão (L/ha)</label>
                <input style={inp} type="number" step="0.1" placeholder="Ex: 100" value={f.vazao_l_ha} onChange={e => setF(p => ({ ...p, vazao_l_ha: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Nº de Tanques</label>
                <input style={inp} type="number" step="1" placeholder="Ex: 25" value={f.num_tanques} onChange={e => setF(p => ({ ...p, num_tanques: e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {caldaTotal !== null && (
                  <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                    <div style={{ color: "#555", fontSize: 10, marginBottom: 2 }}>Calda Total</div>
                    <strong>{fmtN(caldaTotal)} L</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Produtos */}
            <div style={secTit}>Produtos Aplicados</div>
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#F3F6F9" }}>
                  {["Produto (estoque)", "Un.", "Dose/ha", "Total", "Custo/ha", "Custo Total", ""].map((h, i) => (
                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {itens.map((it, idx) => {
                    const ins = insumos.find(i => i.id === it.insumo_id);
                    const dose = parseFloat(it.dose_ha) || 0;
                    const total = dose * areaHa;
                    const vu = ins?.custo_medio ?? ins?.valor_unitario ?? 0;
                    const custoHa = vu * dose;
                    const custoTot = custoHa * areaHa;
                    return (
                      <tr key={idx} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                        <td style={{ padding: "6px 8px" }}>
                          <select style={{ ...inp, fontSize: 12 }} value={it.insumo_id} onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, insumo_id: e.target.value, unidade: insumos.find(i => i.id === e.target.value)?.unidade ?? "L" } : x))}>
                            <option value="">— Produto —</option>
                            {insumos.map(i => <option key={i.id} value={i.id}>{i.nome}{i.subgrupo ? ` (${i.subgrupo})` : ""} · Estoq: {fmtN(i.estoque)} {i.unidade}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", width: 70 }}>
                          <select style={{ ...inp, fontSize: 12 }} value={it.unidade} onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, unidade: e.target.value } : x))}>
                            {["L","kg","mL","g"].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", width: 90 }}>
                          <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="number" step="0.001" placeholder="0,000" value={it.dose_ha} onChange={e => setItens(p => p.map((x, j) => j === idx ? { ...x, dose_ha: e.target.value } : x))} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, color: "#1a1a1a" }}>{total > 0 ? `${fmtN(total, 2)} ${it.unidade}` : "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, color: "#E24B4A" }}>{custoHa > 0 ? fmtBRL(custoHa) : "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "#E24B4A" }}>{custoTot > 0 ? fmtBRL(custoTot) : "—"}</td>
                        <td style={{ padding: "6px 8px", width: 40 }}>
                          {itens.length > 1 && <button style={btnX} onClick={() => setItens(p => p.filter((_, j) => j !== idx))}>✕</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button style={{ ...btnR, fontSize: 12 }} onClick={() => setItens(p => [...p, { insumo_id: "", dose_ha: "", unidade: "L" }])}>+ Produto</button>
              {custoTotal > 0 && (
                <div style={{ fontSize: 12, color: "#555" }}>
                  Custo total: <strong style={{ color: "#E24B4A" }}>{fmtBRL(custoTotal)}</strong>
                  {areaHa > 0 && <> · <strong style={{ color: "#E24B4A" }}>{fmtBRL(custoTotal / areaHa)}/ha</strong></>}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, alignItems: "end" }}>
              <div>
                <label style={lbl}>Observação</label>
                <input style={inp} value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, paddingBottom: 2 }}>
                <input type="checkbox" checked={f.fiscal} onChange={e => setF(p => ({ ...p, fiscal: e.target.checked }))} />
                Fiscal
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando || !f.ciclo_id || !f.area_ha || !f.data_inicio ? 0.5 : 1 }}
                disabled={salvando || !f.ciclo_id || !f.area_ha || !f.data_inicio}
                onClick={salvar}>{salvando ? "Salvando…" : "⟳ Registrar e baixar estoque"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
