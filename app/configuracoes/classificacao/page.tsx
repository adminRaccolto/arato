"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { RegraClassificacaoNf } from "../../../lib/supabase";

type Insumo      = { id: string; nome: string; categoria?: string };
type CentroCusto = { id: string; nome: string; codigo?: string; parent_id?: string };

const CATEGORIAS = [
  "sementes", "fertilizantes", "defensivos", "correcao_solo",
  "combustivel", "pecas_manutencao", "servicos", "outros",
];
const CAT_LABEL: Record<string, string> = {
  sementes:         "Sementes",
  fertilizantes:    "Fertilizantes",
  defensivos:       "Defensivos",
  correcao_solo:    "Correção de Solo",
  combustivel:      "Combustível",
  pecas_manutencao: "Peças / Manutenção",
  servicos:         "Serviços",
  outros:           "Outros",
};

const VAZIO: Omit<RegraClassificacaoNf, "id" | "created_at" | "qtd_aplicacoes" | "ultima_aplicacao"> = {
  fazenda_id:       "",
  nome_regra:       "",
  cnpj_emitente:    "",
  ncm:              "",
  descricao_contem: "",
  insumo_id:        "",
  categoria:        "",
  centro_custo_id:  "",
  ativo:            true,
};

export default function ClassificacaoPage() {
  const { fazendaId } = useAuth();
  const [regras,  setRegras]  = useState<RegraClassificacaoNf[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState({ ...VAZIO });
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [busca,   setBusca]   = useState("");

  const [insumos,      setInsumos]      = useState<Insumo[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const { data } = await supabase
      .from("regras_classificacao_nf")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false });
    setRegras((data ?? []) as RegraClassificacaoNf[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("insumos").select("id, nome, categoria").eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => setInsumos((data ?? []) as Insumo[]));
    supabase.from("centros_custo").select("id, nome, codigo").eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => setCentrosCusto((data ?? []) as CentroCusto[]));
  }, [fazendaId]);

  function abrirNova() {
    setForm({ ...VAZIO, fazenda_id: fazendaId ?? "" });
    setEditId(null);
    setModal(true);
  }

  function abrirEditar(r: RegraClassificacaoNf) {
    setForm({
      fazenda_id:       r.fazenda_id,
      nome_regra:       r.nome_regra       ?? "",
      cnpj_emitente:    r.cnpj_emitente    ?? "",
      ncm:              r.ncm              ?? "",
      descricao_contem: r.descricao_contem ?? "",
      insumo_id:        r.insumo_id        ?? "",
      categoria:        r.categoria        ?? "",
      centro_custo_id:  r.centro_custo_id  ?? "",
      ativo:            r.ativo,
    });
    setEditId(r.id);
    setModal(true);
  }

  async function salvar() {
    if (!fazendaId) return;
    setSaving(true);
    const payload = {
      fazenda_id:       fazendaId,
      nome_regra:       form.nome_regra       || null,
      cnpj_emitente:    form.cnpj_emitente    || null,
      ncm:              form.ncm              || null,
      descricao_contem: form.descricao_contem || null,
      insumo_id:        form.insumo_id        || null,
      categoria:        form.categoria        || null,
      centro_custo_id:  form.centro_custo_id  || null,
      ativo:            form.ativo,
    };
    if (editId) {
      await supabase.from("regras_classificacao_nf").update(payload).eq("id", editId);
    } else {
      await supabase.from("regras_classificacao_nf").insert({ ...payload, qtd_aplicacoes: 0 });
    }
    setSaving(false);
    setModal(false);
    carregar();
  }

  async function toggleAtivo(r: RegraClassificacaoNf) {
    await supabase.from("regras_classificacao_nf").update({ ativo: !r.ativo }).eq("id", r.id);
    setRegras(prev => prev.map(x => x.id === r.id ? { ...x, ativo: !x.ativo } : x));
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta regra?")) return;
    await supabase.from("regras_classificacao_nf").delete().eq("id", id);
    setRegras(prev => prev.filter(r => r.id !== id));
  }

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "Nunca";
  const fmtCnpj = (c?: string) => (c || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

  const regrasFiltradas = regras.filter(r =>
    !busca || [r.nome_regra, r.cnpj_emitente, r.ncm, r.descricao_contem].join(" ").toLowerCase().includes(busca.toLowerCase())
  );

  const ativas     = regras.filter(r => r.ativo).length;
  const aplicacoes = regras.reduce((s, r) => s + (r.qtd_aplicacoes ?? 0), 0);

  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Regras de Classificação Automática</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Critérios para o sistema classificar NFs da SIEG sem intervenção manual. Quanto mais regras, menos pendências.
            </p>
          </div>
          <button
            onClick={abrirNova}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            + Nova Regra
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Regras Ativas",      valor: `${ativas} / ${regras.length}`,                    cor: "#16A34A" },
            { label: "Total Aplicações",   valor: aplicacoes.toLocaleString("pt-BR"),                cor: "#1A4870" },
            { label: "Eficácia",           valor: regras.length > 0 ? `${Math.round((ativas / regras.length) * 100)}%` : "—", cor: "#C9921B" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.cor }}>{k.valor}</div>
            </div>
          ))}
        </div>

        {/* Banner */}
        <div style={{ background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
          <strong>Como funciona:</strong> cada regra define critérios de match (CNPJ do fornecedor, NCM, ou parte da descrição) e uma classificação destino.
          Na importação SIEG o sistema testa cada item sequencialmente — o primeiro match classifica automaticamente.
          Regras mais específicas devem vir antes das mais genéricas.
        </div>

        {/* Busca */}
        <div style={{ marginBottom: 14 }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ, NCM ou descrição..."
            style={{ padding: "8px 12px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 12, width: 320, background: "var(--bg-card)" }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-3)" }}>Carregando…</div>
        ) : regrasFiltradas.length === 0 ? (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)", marginBottom: 6 }}>
              {regras.length === 0 ? "Nenhuma regra criada ainda" : "Nenhuma regra encontrada"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 20 }}>
              Classifique uma NF manualmente — o sistema pergunta se quer criar uma regra automaticamente.
            </div>
            {regras.length === 0 && (
              <button onClick={abrirNova} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                + Criar primeira regra
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border)" }}>
                  {["Regra", "Critérios de Match", "Classificação Destino", "Aplicações", "Última Aplicação", "Ativa", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regrasFiltradas.map((r, i) => {
                  const insumo = insumos.find(ins => ins.id === r.insumo_id);
                  const cc     = centrosCusto.find(c => c.id === r.centro_custo_id);
                  return (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: i % 2 === 1 ? "#FAFBFD" : "var(--bg-card)", opacity: r.ativo ? 1 : 0.5 }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{r.nome_regra || `Regra #${i + 1}`}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {r.cnpj_emitente    && <span style={{ fontSize: 11, color: "var(--text-2)" }}>CNPJ: {fmtCnpj(r.cnpj_emitente)}</span>}
                          {r.ncm              && <span style={{ fontSize: 11, color: "var(--text-2)" }}>NCM: {r.ncm}</span>}
                          {r.descricao_contem && <span style={{ fontSize: 11, color: "var(--text-2)" }}>Desc: "{r.descricao_contem}"</span>}
                          {!r.cnpj_emitente && !r.ncm && !r.descricao_contem && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Match universal</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {r.categoria && <span style={{ fontSize: 11, background: "#EBF5FF", color: "#1A4870", padding: "1px 7px", borderRadius: 8, display: "inline-block" }}>{CAT_LABEL[r.categoria] || r.categoria}</span>}
                          {insumo      && <span style={{ fontSize: 11, color: "var(--text-2)" }}>↳ {insumo.nome}</span>}
                          {cc          && <span style={{ fontSize: 11, color: "var(--text-3)" }}>CC: {cc.nome}</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1A4870" }}>{(r.qtd_aplicacoes ?? 0).toLocaleString("pt-BR")}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-3)", fontSize: 12 }}>{fmtDate(r.ultima_aplicacao)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <button
                          onClick={() => toggleAtivo(r)}
                          style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: r.ativo ? "#16A34A" : "var(--border)", position: "relative", transition: "background 0.2s" }}
                        >
                          <span style={{ position: "absolute", top: 3, left: r.ativo ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)", transition: "left 0.2s", display: "block", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                        </button>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => abrirEditar(r)} style={{ padding: "4px 10px", borderRadius: 5, border: "0.5px solid var(--border)", background: "var(--bg-card)", fontSize: 11, cursor: "pointer" }}>Editar</button>
                          <button onClick={() => excluir(r.id)} style={{ padding: "4px 10px", borderRadius: 5, border: "0.5px solid #FECACA", background: "var(--bg-card)", color: "#E24B4A", fontSize: 11, cursor: "pointer" }}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "min(660px, 97vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{editId ? "Editar Regra" : "Nova Regra de Classificação"}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Todos os critérios são opcionais — preencha apenas os que tornam a regra específica.</div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Nome da Regra</label>
                <input
                  value={form.nome_regra ?? ""}
                  onChange={e => setForm(f => ({ ...f, nome_regra: e.target.value }))}
                  placeholder="Ex: Agrícola Premium — Defensivos"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" }}>Critérios de Match (AND)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>CNPJ do Fornecedor</label>
                    <input
                      value={form.cnpj_emitente ?? ""}
                      onChange={e => setForm(f => ({ ...f, cnpj_emitente: e.target.value }))}
                      placeholder="00.000.000/0000-00"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>NCM</label>
                    <input
                      value={form.ncm ?? ""}
                      onChange={e => setForm(f => ({ ...f, ncm: e.target.value }))}
                      placeholder="3808.93"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Descrição contém</label>
                    <input
                      value={form.descricao_contem ?? ""}
                      onChange={e => setForm(f => ({ ...f, descricao_contem: e.target.value }))}
                      placeholder="Ex: GLIFOSATO, ADUBO NPK"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" }}>Classificação Destino</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Categoria</label>
                    <select
                      value={form.categoria ?? ""}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">— Nenhuma —</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Insumo</label>
                    <select
                      value={form.insumo_id ?? ""}
                      onChange={e => setForm(f => ({ ...f, insumo_id: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">— Nenhum —</option>
                      {insumos
                        .filter(ins => !form.categoria || ins.categoria === form.categoria)
                        .map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Centro de Custo</label>
                    <select
                      value={form.centro_custo_id ?? ""}
                      onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">— Nenhum —</option>
                      {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <label htmlFor="ativo" style={{ fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>Regra ativa</label>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModal(false)} style={{ padding: "8px 20px", borderRadius: 7, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Salvando…" : editId ? "Salvar" : "Criar Regra"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
