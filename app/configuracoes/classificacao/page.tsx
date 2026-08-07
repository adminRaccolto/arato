"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { RegraClassificacaoNf } from "../../../lib/supabase";

type Insumo      = { id: string; nome: string; categoria?: string };
type CentroCusto = { id: string; nome: string; codigo?: string; parent_id?: string };

const CATEGORIAS_PRODUTO = [
  "sementes", "fertilizantes", "defensivos", "correcao_solo",
  "combustivel", "pecas_manutencao", "outros",
];
const CATEGORIAS_SERVICO = [
  "servicos", "outros",
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

// ── Padrões Arato — NCMs de insumos agrícolas mais comuns no MT ──────────────
type PadraoNcm = { ncm: string; nome_regra: string; categoria: string; descricao_contem?: string };
const REGRAS_PADRAO_ARATO: PadraoNcm[] = [
  // Defensivos
  { ncm: "3808.91", nome_regra: "Inseticidas",                   categoria: "defensivos" },
  { ncm: "3808.92", nome_regra: "Fungicidas",                    categoria: "defensivos" },
  { ncm: "3808.93", nome_regra: "Herbicidas",                    categoria: "defensivos" },
  { ncm: "3808.94", nome_regra: "Desinfetantes Agrícolas",       categoria: "defensivos" },
  { ncm: "3808.99", nome_regra: "Outros Defensivos",             categoria: "defensivos" },
  { ncm: "3002.90", nome_regra: "Inoculantes Biológicos",        categoria: "defensivos" },
  // Fertilizantes nitrogenados
  { ncm: "3102.10", nome_regra: "Ureia (N)",                     categoria: "fertilizantes" },
  { ncm: "3102.21", nome_regra: "Sulfato de Amônio",             categoria: "fertilizantes" },
  // Fertilizantes fosfatados
  { ncm: "3103.10", nome_regra: "Superfosfato Simples / Triplo", categoria: "fertilizantes" },
  // Fertilizantes potássicos
  { ncm: "3104.20", nome_regra: "Cloreto de Potássio (KCl)",     categoria: "fertilizantes" },
  { ncm: "3104.30", nome_regra: "Sulfato de Potássio",           categoria: "fertilizantes" },
  // Fertilizantes compostos
  { ncm: "3105.20", nome_regra: "NPK Composto (N+P+K)",          categoria: "fertilizantes" },
  { ncm: "3105.30", nome_regra: "DAP — Diamônio Fosfato",        categoria: "fertilizantes" },
  { ncm: "3105.40", nome_regra: "MAP — Monoamônio Fosfato",      categoria: "fertilizantes" },
  { ncm: "3105.59", nome_regra: "Outros Adubos Compostos",       categoria: "fertilizantes" },
  { ncm: "3105.90", nome_regra: "Outros Fertilizantes",          categoria: "fertilizantes" },
  // Correção de solo
  { ncm: "2521.00", nome_regra: "Calcário Agrícola",             categoria: "correcao_solo" },
  { ncm: "2520.20", nome_regra: "Gesso Agrícola",                categoria: "correcao_solo" },
  // Sementes
  { ncm: "1201.90", nome_regra: "Sementes de Soja",              categoria: "sementes" },
  { ncm: "1005.10", nome_regra: "Sementes de Milho",             categoria: "sementes" },
  { ncm: "5201.00", nome_regra: "Sementes de Algodão",           categoria: "sementes" },
  { ncm: "1007.10", nome_regra: "Sementes de Sorgo",             categoria: "sementes" },
  { ncm: "1001.19", nome_regra: "Sementes de Trigo",             categoria: "sementes" },
  // Combustível
  { ncm: "2710.19", nome_regra: "Óleo Diesel / Combustível",     categoria: "combustivel" },
  // Peças e manutenção
  { ncm: "3403.19", nome_regra: "Graxas / Lubrificantes",        categoria: "pecas_manutencao" },
  { ncm: "8708.99", nome_regra: "Peças para Máquinas Agrícolas", categoria: "pecas_manutencao" },
  { ncm: "4010.39", nome_regra: "Correias de Transmissão",       categoria: "pecas_manutencao" },
  // Embalagens
  { ncm: "6305.33", nome_regra: "Sacaria de Polipropileno",      categoria: "outros" },
];

const VAZIO: Omit<RegraClassificacaoNf, "id" | "created_at" | "qtd_aplicacoes" | "ultima_aplicacao"> = {
  fazenda_id:       "",
  nome_regra:       "",
  tipo_nf:          "produto",
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
  const [regras,          setRegras]          = useState<RegraClassificacaoNf[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [modal,           setModal]           = useState(false);
  const [form,            setForm]            = useState({ ...VAZIO });
  const [editId,          setEditId]          = useState<string | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [busca,           setBusca]           = useState("");
  const [carregandoPad,   setCarregandoPad]   = useState(false);
  const [msgPadroes,      setMsgPadroes]      = useState<string | null>(null);

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
      tipo_nf:          r.tipo_nf          ?? "produto",
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
    const ehProduto = form.tipo_nf !== "servico";
    const payload = {
      fazenda_id:       fazendaId,
      nome_regra:       form.nome_regra       || null,
      tipo_nf:          form.tipo_nf          || "produto",
      cnpj_emitente:    form.cnpj_emitente    || null,
      ncm:              form.ncm              || null,
      descricao_contem: form.descricao_contem || null,
      categoria:        form.categoria        || null,
      // insumo e CC só fazem sentido para serviço ou quando explicitamente informados
      insumo_id:        ehProduto ? null : (form.insumo_id || null),
      centro_custo_id:  ehProduto ? null : (form.centro_custo_id || null),
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

  async function carregarPadroesArato() {
    if (!fazendaId) return;
    setCarregandoPad(true);
    setMsgPadroes(null);
    const rows = REGRAS_PADRAO_ARATO.map(p => ({
      nome_regra:       p.nome_regra,
      tipo_nf:          "produto",
      ncm:              p.ncm,
      categoria:        p.categoria,
      descricao_contem: p.descricao_contem || null,
      ativo:            true,
      qtd_aplicacoes:   0,
    }));
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/configuracoes/classificacao-padroes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ fazenda_id: fazendaId, rows }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsgPadroes(`Erro ao inserir: ${json.error ?? res.statusText}`);
      setCarregandoPad(false);
      return;
    }
    if (json.inseridos === 0) {
      setMsgPadroes(json.msg ?? "Todos os padrões Arato já estão cadastrados.");
    } else {
      setMsgPadroes(`${json.inseridos} regra(s) padrão carregada(s) com sucesso.`);
    }
    setCarregandoPad(false);
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
  const ehProduto  = form.tipo_nf !== "servico";

  const btnTab = (ativo: boolean) => ({
    padding: "6px 18px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: ativo ? "#1A4870" : "var(--bg-page)", color: ativo ? "#fff" : "var(--text-3)",
  } as React.CSSProperties);

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
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={carregarPadroesArato}
              disabled={carregandoPad}
              style={{ padding: "9px 16px", borderRadius: 8, border: "0.5px solid #C9921B", background: "#FBF3E0", color: "#7A4300", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {carregandoPad ? "Carregando…" : "Padrões Arato"}
            </button>
            <button
              onClick={abrirNova}
              style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              + Nova Regra
            </button>
          </div>
        </div>

        {msgPadroes && (
          <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#166534", display: "flex", justifyContent: "space-between" }}>
            {msgPadroes}
            <button onClick={() => setMsgPadroes(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534", fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Regras Ativas",    valor: `${ativas} / ${regras.length}`,                                                cor: "#16A34A" },
            { label: "Total Aplicações", valor: aplicacoes.toLocaleString("pt-BR"),                                           cor: "#1A4870" },
            { label: "Eficácia",         valor: regras.length > 0 ? `${Math.round((ativas / regras.length) * 100)}%` : "—",  cor: "#C9921B" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.cor }}>{k.valor}</div>
            </div>
          ))}
        </div>

        {/* Banner */}
        <div style={{ background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
          <strong>Fluxo NF Produto:</strong> regra classifica a categoria do CP e gera vencimento D+30. Centro de custo e insumo são completados em <em>Pendências</em> após a entrada.{" "}
          <strong>Fluxo NFS Serviço:</strong> classificação completa na regra — sem pendências adicionais.
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
              Use <strong>Padrões Arato</strong> para carregar os NCMs mais comuns do agronegócio de uma vez.
            </div>
            {regras.length === 0 && (
              <button onClick={carregarPadroesArato} disabled={carregandoPad}
                style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#C9921B", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Carregar Padrões Arato
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border)" }}>
                  {["Regra", "Tipo NF", "Critérios de Match", "Classificação", "Aplicações", "Última", "Ativa", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regrasFiltradas.map((r, i) => {
                  const insumo = insumos.find(ins => ins.id === r.insumo_id);
                  const cc     = centrosCusto.find(c => c.id === r.centro_custo_id);
                  const isProd = r.tipo_nf !== "servico";
                  return (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: i % 2 === 1 ? "#FAFBFD" : "var(--bg-card)", opacity: r.ativo ? 1 : 0.5 }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{r.nome_regra || `Regra #${i + 1}`}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                          background: isProd ? "#E8EEFA" : "#FBF3E0",
                          color:      isProd ? "#1A4870" : "#7A4300" }}>
                          {isProd ? "Produto" : "Serviço"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {r.cnpj_emitente    && <span style={{ fontSize: 11, color: "var(--text-2)" }}>CNPJ: {fmtCnpj(r.cnpj_emitente)}</span>}
                          {r.ncm              && <span style={{ fontSize: 11, color: "var(--text-2)" }}>NCM: {r.ncm}</span>}
                          {r.descricao_contem && <span style={{ fontSize: 11, color: "var(--text-2)" }}>Desc: &ldquo;{r.descricao_contem}&rdquo;</span>}
                          {!r.cnpj_emitente && !r.ncm && !r.descricao_contem && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Match universal</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {r.categoria && <span style={{ fontSize: 11, background: "#EBF5FF", color: "#1A4870", padding: "1px 7px", borderRadius: 8, display: "inline-block" }}>{CAT_LABEL[r.categoria] || r.categoria}</span>}
                          {!isProd && insumo && <span style={{ fontSize: 11, color: "var(--text-2)" }}>↳ {insumo.nome}</span>}
                          {!isProd && cc     && <span style={{ fontSize: 11, color: "var(--text-3)" }}>CC: {cc.nome}</span>}
                          {isProd            && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>CC via Pendências</span>}
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

      {/* ── Modal ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "min(640px, 97vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{editId ? "Editar Regra" : "Nova Regra de Classificação"}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Os critérios de match são cumulativos (AND) — preencha apenas os que tornam a regra específica.</div>
            </div>

            <div style={{ padding: 24 }}>

              {/* Tipo NF */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>Tipo de NF</div>
                <div style={{ display: "inline-flex", background: "var(--bg-page)", borderRadius: 8, padding: 3, gap: 2 }}>
                  <button style={btnTab(ehProduto)} onClick={() => setForm(f => ({ ...f, tipo_nf: "produto", insumo_id: "", centro_custo_id: "" }))}>NF Produto</button>
                  <button style={btnTab(!ehProduto)} onClick={() => setForm(f => ({ ...f, tipo_nf: "servico" }))}>NFS Serviço</button>
                </div>
                {ehProduto && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#1e40af", background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 6, padding: "6px 10px" }}>
                    Produto: o sistema gera o CP com vencimento D+30 e envia para <strong>Pendências</strong> para apontar centro de custo e insumo.
                  </div>
                )}
              </div>

              {/* Nome */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Nome da Regra</label>
                <input
                  value={form.nome_regra ?? ""}
                  onChange={e => setForm(f => ({ ...f, nome_regra: e.target.value }))}
                  placeholder={ehProduto ? "Ex: Herbicidas — 3808.93" : "Ex: Serviço de Aviação Agrícola"}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              {/* Critérios */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" }}>Critérios de Match (AND)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>NCM{ehProduto ? " (principal)" : " (opcional)"}</label>
                    <input
                      value={form.ncm ?? ""}
                      onChange={e => setForm(f => ({ ...f, ncm: e.target.value }))}
                      placeholder="3808.93"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `0.5px solid ${ehProduto ? "#1A4870" : "var(--border)"}`, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>CNPJ do Fornecedor (opcional)</label>
                    <input
                      value={form.cnpj_emitente ?? ""}
                      onChange={e => setForm(f => ({ ...f, cnpj_emitente: e.target.value }))}
                      placeholder="00.000.000/0000-00"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Descrição contém (opcional)</label>
                    <input
                      value={form.descricao_contem ?? ""}
                      onChange={e => setForm(f => ({ ...f, descricao_contem: e.target.value }))}
                      placeholder="Ex: GLIFOSATO, UREIA, NPK"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              {/* Classificação Destino */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" }}>Classificação Destino</div>
                <div style={{ display: "grid", gridTemplateColumns: ehProduto ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Categoria</label>
                    <select
                      value={form.categoria ?? ""}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">— Nenhuma —</option>
                      {(ehProduto ? CATEGORIAS_PRODUTO : CATEGORIAS_SERVICO).map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                    </select>
                  </div>

                  {/* Insumo e CC só para serviço */}
                  {!ehProduto && (
                    <>
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
                          {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(cc => (
                            <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {ehProduto && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)" }}>
                    Centro de custo e insumo específico serão apontados na tela de <strong>Pendências</strong> após a entrada da NF.
                  </div>
                )}
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
