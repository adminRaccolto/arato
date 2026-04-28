"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarRegrasClassificacao, criarRegraClassificacao,
  atualizarRegraClassificacao, excluirRegraClassificacao,
  listarCentrosCustoGeral, listarOperacoesGerenciais,
} from "../../../lib/db";
import type { RegraClassificacao, CentroCusto, OperacaoGerencial } from "../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" };
const btnX: React.CSSProperties = { padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const FORM_VAZIO = {
  nome: "",
  fornecedor_cnpj: "",
  fornecedor_nome_contem: "",
  ncm: "",
  cfop: "",
  descricao_contem: "",
  operacao_gerencial_id: "",
  centro_custo_id: "",
  prioridade: "10",
  ativo: true,
};

export default function ClassificacaoPage() {
  const { fazendaId } = useAuth();
  const [regras,   setRegras]   = useState<RegraClassificacao[]>([]);
  const [ccs,      setCcs]      = useState<CentroCusto[]>([]);
  const [ops,      setOps]      = useState<OperacaoGerencial[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modal,    setModal]    = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [f,        setF]        = useState({ ...FORM_VAZIO });
  const [erro,     setErro]     = useState<string | null>(null);
  const [busca,    setBusca]    = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [r, cc, op] = await Promise.all([
        listarRegrasClassificacao(fazendaId),
        listarCentrosCustoGeral(fazendaId),
        listarOperacoesGerenciais(fazendaId),
      ]);
      setRegras(r);
      setCcs(cc);
      setOps(op);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeCC = (id?: string) => ccs.find(x => x.id === id)?.nome ?? "—";
  const nomeOp = (id?: string) => ops.find(x => x.id === id)?.descricao ?? "—";

  const regrasFiltradas = busca
    ? regras.filter(r =>
        r.nome.toLowerCase().includes(busca.toLowerCase()) ||
        (r.fornecedor_cnpj ?? "").includes(busca) ||
        (r.fornecedor_nome_contem ?? "").toLowerCase().includes(busca.toLowerCase())
      )
    : regras;

  const abrirNovo = () => {
    setF({ ...FORM_VAZIO });
    setEditId(null);
    setErro(null);
    setModal(true);
  };

  const abrirEditar = (r: RegraClassificacao) => {
    setF({
      nome: r.nome,
      fornecedor_cnpj: r.fornecedor_cnpj ?? "",
      fornecedor_nome_contem: r.fornecedor_nome_contem ?? "",
      ncm: r.ncm ?? "",
      cfop: r.cfop ?? "",
      descricao_contem: r.descricao_contem ?? "",
      operacao_gerencial_id: r.operacao_gerencial_id ?? "",
      centro_custo_id: r.centro_custo_id ?? "",
      prioridade: String(r.prioridade ?? 10),
      ativo: r.ativo ?? true,
    });
    setEditId(r.id);
    setErro(null);
    setModal(true);
  };

  // Conta quantos critérios estão preenchidos
  const criteriosPreenchidos = (r: RegraClassificacao) =>
    [r.fornecedor_cnpj, r.fornecedor_nome_contem, r.ncm, r.cfop, r.descricao_contem]
      .filter(Boolean).length;

  const salvar = async () => {
    if (!fazendaId) return;
    if (!f.nome.trim()) { setErro("Informe o nome da regra"); return; }
    const temCriterio = f.fornecedor_cnpj || f.fornecedor_nome_contem || f.ncm || f.cfop || f.descricao_contem;
    if (!temCriterio) { setErro("Preencha ao menos um critério de match"); return; }
    const temSugestao = f.operacao_gerencial_id || f.centro_custo_id;
    if (!temSugestao) { setErro("Defina ao menos uma sugestão (Operação ou Centro de Custo)"); return; }

    setSalvando(true); setErro(null);
    try {
      const payload: Omit<RegraClassificacao, "id" | "created_at"> = {
        fazenda_id: fazendaId,
        nome: f.nome.trim(),
        fornecedor_cnpj:        f.fornecedor_cnpj.replace(/\D/g, "") || undefined,
        fornecedor_nome_contem: f.fornecedor_nome_contem || undefined,
        ncm:                    f.ncm || undefined,
        cfop:                   f.cfop || undefined,
        descricao_contem:       f.descricao_contem || undefined,
        operacao_gerencial_id:  f.operacao_gerencial_id || undefined,
        centro_custo_id:        f.centro_custo_id || undefined,
        prioridade:             parseInt(f.prioridade) || 10,
        ativo:                  f.ativo,
      };
      if (editId) {
        await atualizarRegraClassificacao(editId, payload);
      } else {
        await criarRegraClassificacao(payload);
      }
      setModal(false);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1 }}>
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Regras de Classificação Automática</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>
              Quando uma NF é lançada (XML, manual ou Sieg), o sistema sugere automaticamente a operação e o centro de custo corretos
            </p>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Nova Regra</button>
        </header>

        <div style={{ padding: "18px 22px" }}>

          {/* Info */}
          <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
            <strong>Como funciona:</strong> Cadastre uma regra por fornecedor (CNPJ ou nome), por NCM, por CFOP ou por descrição do item.
            Todos os critérios preenchidos devem bater. A regra de maior <strong>prioridade</strong> vence em caso de conflito.
            O usuário sempre pode revisar e confirmar a sugestão.
          </div>

          {/* Busca */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input
              style={{ ...inp, maxWidth: 320 }}
              placeholder="Buscar por nome, CNPJ ou fornecedor…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#888", alignSelf: "center" }}>
              {regrasFiltradas.length} regra{regrasFiltradas.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tabela */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 48, color: "#555" }}>Carregando...</div>
          ) : regrasFiltradas.length === 0 ? (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>
              {busca ? "Nenhuma regra encontrada." : "Nenhuma regra cadastrada. Clique em \"+ Nova Regra\" para começar."}
            </div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Pri.", "Regra", "Critérios de Match", "Sugestão Aplicada", "Ativo", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regrasFiltradas.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < regrasFiltradas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      {/* Prioridade */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", background: "#D5E8F5", padding: "2px 8px", borderRadius: 6 }}>
                          {r.prioridade ?? 10}
                        </span>
                      </td>

                      {/* Nome */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{r.nome}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                          {criteriosPreenchidos(r)} critério{criteriosPreenchidos(r) !== 1 ? "s" : ""}
                        </div>
                      </td>

                      {/* Critérios */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {r.fornecedor_cnpj && (
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: "#555", fontWeight: 600 }}>CNPJ:</span> {r.fornecedor_cnpj}
                            </span>
                          )}
                          {r.fornecedor_nome_contem && (
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: "#555", fontWeight: 600 }}>Nome contém:</span> "{r.fornecedor_nome_contem}"
                            </span>
                          )}
                          {r.ncm && (
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: "#555", fontWeight: 600 }}>NCM:</span> {r.ncm}
                            </span>
                          )}
                          {r.cfop && (
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: "#555", fontWeight: 600 }}>CFOP:</span> {r.cfop}
                            </span>
                          )}
                          {r.descricao_contem && (
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: "#555", fontWeight: 600 }}>Descrição contém:</span> "{r.descricao_contem}"
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sugestão */}
                      <td style={{ padding: "10px 14px" }}>
                        {r.operacao_gerencial_id && (
                          <div style={{ fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: "#555", fontWeight: 600 }}>Operação:</span> {nomeOp(r.operacao_gerencial_id)}
                          </div>
                        )}
                        {r.centro_custo_id && (
                          <div style={{ fontSize: 11 }}>
                            <span style={{ color: "#555", fontWeight: 600 }}>CC:</span> {nomeCC(r.centro_custo_id)}
                          </div>
                        )}
                        {!r.operacao_gerencial_id && !r.centro_custo_id && (
                          <span style={{ fontSize: 11, color: "#888" }}>—</span>
                        )}
                      </td>

                      {/* Ativo */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 10, background: r.ativo ? "#DCFCE7" : "#F3F6F9", color: r.ativo ? "#166534" : "#888", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                          {r.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>

                      {/* Ações */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          <button style={btnR} onClick={() => abrirEditar(r)}>Editar</button>
                          <button style={btnX} onClick={async () => {
                            if (confirm(`Excluir regra "${r.nome}"?`)) {
                              await excluirRegraClassificacao(r.id);
                              await carregar();
                            }
                          }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div style={{ background: "#fff", borderRadius: 14, width: 780, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {editId ? "Editar Regra de Classificação" : "Nova Regra de Classificação"}
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>

            <div style={{ padding: 22 }}>

              {/* Nome + Prioridade */}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={f.nome} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Defensivos Bayer, Fertilizantes NCM 3102, Combustível" />
                </div>
                <div>
                  <label style={lbl}>Prioridade</label>
                  <input style={inp} type="number" min="1" max="999" value={f.prioridade} onChange={e => setF(p => ({ ...p, prioridade: e.target.value }))} />
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Maior = mais prioritário</div>
                </div>
              </div>

              {/* Critérios de match */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 12, textTransform: "uppercase" }}>
                  Critérios de Match <span style={{ fontWeight: 400, color: "#888", textTransform: "none" }}>(todos os preenchidos devem bater — AND)</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>CNPJ do Fornecedor (exato)</label>
                    <input style={inp} value={f.fornecedor_cnpj} onChange={e => setF(p => ({ ...p, fornecedor_cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
                  </div>
                  <div>
                    <label style={lbl}>Nome do Fornecedor contém</label>
                    <input style={inp} value={f.fornecedor_nome_contem} onChange={e => setF(p => ({ ...p, fornecedor_nome_contem: e.target.value }))} placeholder="Ex: BAYER, BASF, PETROBRAS" />
                  </div>
                  <div>
                    <label style={lbl}>NCM começa com</label>
                    <input style={inp} value={f.ncm} onChange={e => setF(p => ({ ...p, ncm: e.target.value }))} placeholder="Ex: 3808 (defensivos), 3102 (fertiliz.)" />
                  </div>
                  <div>
                    <label style={lbl}>CFOP começa com</label>
                    <input style={inp} value={f.cfop} onChange={e => setF(p => ({ ...p, cfop: e.target.value }))} placeholder="Ex: 1, 2, 1101" />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Descrição do item contém</label>
                    <input style={inp} value={f.descricao_contem} onChange={e => setF(p => ({ ...p, descricao_contem: e.target.value }))} placeholder="Ex: ADUBO, SEMENTE, ÓLEO DIESEL" />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#C9921B" }}>
                  ⚠ Preencha ao menos um critério. Critérios vazios são ignorados na comparação.
                </div>
              </div>

              {/* Sugestão */}
              <div style={{ background: "#F0FDF4", border: "0.5px solid #16A34A40", borderRadius: 8, padding: "14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#166534", marginBottom: 12, textTransform: "uppercase" }}>
                  Sugestão a Aplicar <span style={{ fontWeight: 400, color: "#888", textTransform: "none" }}>(preencha ao menos um)</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Operação Gerencial</label>
                    <select style={inp} value={f.operacao_gerencial_id} onChange={e => setF(p => ({ ...p, operacao_gerencial_id: e.target.value }))}>
                      <option value="">— Não sugerir —</option>
                      {ops.map(o => <option key={o.id} value={o.id}>{o.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Centro de Custo</label>
                    <select style={inp} value={f.centro_custo_id} onChange={e => setF(p => ({ ...p, centro_custo_id: e.target.value }))}>
                      <option value="">— Não sugerir —</option>
                      {ccs.map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                    </select>
                  </div>
                </div>
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
                  style={{ ...btnV, opacity: salvando || !f.nome.trim() ? 0.5 : 1 }}
                  disabled={salvando || !f.nome.trim()}
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
