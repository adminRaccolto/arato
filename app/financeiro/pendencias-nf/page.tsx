"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { NfImportadaSieg, NfImportadaItemSieg, RegraClassificacaoNf } from "../../../lib/supabase";

// ─── Tipos auxiliares ────────────────────────────────────────

type NfComItens = NfImportadaSieg & {
  itens?: NfImportadaItemSieg[];
  pessoa_nome?: string;
};

type Insumo = { id: string; nome: string; categoria?: string };
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

const STATUS_COLOR: Record<string, string> = {
  pendente:    "#C9921B",
  classificada:"#16A34A",
  ignorada:    "#888",
  erro:        "#E24B4A",
};

// ─── Página ──────────────────────────────────────────────────

export default function PendenciasNfPage() {
  const { fazendaId } = useAuth();

  const [nfs,         setNfs]         = useState<NfComItens[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filtroStatus,setFiltroStatus]= useState<string>("pendente");
  const [busca,       setBusca]       = useState("");

  // Modal classificação
  const [modal,       setModal]       = useState<NfComItens | null>(null);
  const [loadingItens,setLoadingItens]= useState(false);

  // Classificação item a item
  type ItemClassif = { insumo_id: string; categoria: string; centro_custo_id: string };
  const [classif, setClassif] = useState<Record<string, ItemClassif>>({});

  // Modal de regra
  const [modalRegra, setModalRegra]   = useState<{ item: NfImportadaItemSieg; cnpj: string; nomeEmit: string } | null>(null);
  const [nomeRegra,  setNomeRegra]    = useState("");
  const [criandoRegra, setCriandoRegra] = useState(false);

  // Dados auxiliares
  const [insumos,      setInsumos]      = useState<Insumo[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);

  // ── Carrega dados ────────────────────────────────────────

  const carregarNfs = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    let q = supabase
      .from("nf_importadas_sieg")
      .select("*, pessoa:pessoas(nome)")
      .eq("fazenda_id", fazendaId)
      .order("data_emissao", { ascending: false });
    if (filtroStatus !== "todas") q = q.eq("status", filtroStatus);
    const { data } = await q;
    setNfs(
      (data ?? []).map((n: NfImportadaSieg & { pessoa?: { nome: string } }) => ({
        ...n,
        pessoa_nome: n.pessoa?.nome,
      }))
    );
    setLoading(false);
  }, [fazendaId, filtroStatus]);

  useEffect(() => { carregarNfs(); }, [carregarNfs]);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("insumos").select("id, nome, categoria").eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => setInsumos((data ?? []) as Insumo[]));
    supabase.from("centros_custo").select("id, nome, codigo").eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => setCentrosCusto((data ?? []) as CentroCusto[]));
  }, [fazendaId]);

  // ── Abre modal e carrega itens ───────────────────────────

  async function abrirModal(nf: NfComItens) {
    setModal(nf);
    setLoadingItens(true);
    setClassif({});
    const { data } = await supabase
      .from("nf_importada_itens_sieg")
      .select("*")
      .eq("nf_id", nf.id)
      .order("numero_item");
    const itens = (data ?? []) as NfImportadaItemSieg[];

    // Pré-preenche com o que já está classificado
    const init: Record<string, ItemClassif> = {};
    for (const it of itens) {
      init[it.id] = {
        insumo_id:      it.insumo_id      ?? "",
        categoria:      it.categoria      ?? "",
        centro_custo_id:it.centro_custo_id ?? "",
      };
    }
    setClassif(init);
    setModal({ ...nf, itens });
    setLoadingItens(false);
  }

  // ── Salva classificação de um item ──────────────────────

  async function salvarItemClassif(item: NfImportadaItemSieg) {
    const c = classif[item.id];
    if (!c) return;

    await supabase.from("nf_importada_itens_sieg").update({
      insumo_id:       c.insumo_id       || null,
      categoria:       c.categoria       || null,
      centro_custo_id: c.centro_custo_id || null,
      status_item:     c.insumo_id || c.categoria ? "classificado" : "pendente",
    }).eq("id", item.id);

    // Recalcula status da NF
    const { data: todos } = await supabase
      .from("nf_importada_itens_sieg")
      .select("status_item")
      .eq("nf_id", item.nf_id);
    const pendentes = (todos ?? []).filter(i => i.status_item === "pendente");
    if (pendentes.length === 0) {
      await supabase.from("nf_importadas_sieg")
        .update({ status: "classificada", classificada_em: new Date().toISOString() })
        .eq("id", item.nf_id);
      setNfs(prev => prev.map(n => n.id === item.nf_id ? { ...n, status: "classificada" as NfImportadaSieg["status"] } : n));
    }

    // Pergunta sobre regra se acabou de classificar manualmente
    if ((c.insumo_id || c.categoria) && !item.classificado_automaticamente && item.status_item === "pendente") {
      setModalRegra({
        item:      { ...item, insumo_id: c.insumo_id, categoria: c.categoria, centro_custo_id: c.centro_custo_id },
        cnpj:      modal?.cnpj_emitente ?? "",
        nomeEmit:  modal?.nome_emitente ?? "",
      });
    }

    // Atualiza itens no modal
    if (modal) {
      setModal(prev => prev ? {
        ...prev,
        itens: prev.itens?.map(i => i.id === item.id ? { ...i, ...c, status_item: c.insumo_id || c.categoria ? "classificado" : "pendente" } as NfImportadaItemSieg : i),
      } : prev);
    }
  }

  // ── Ignorar NF ────────────────────────────────────────

  async function ignorarNf(nfId: string) {
    await supabase.from("nf_importadas_sieg").update({ status: "ignorada" }).eq("id", nfId);
    await supabase.from("nf_importada_itens_sieg").update({ status_item: "ignorado" }).eq("nf_id", nfId);
    setNfs(prev => prev.map(n => n.id === nfId ? { ...n, status: "ignorada" as NfImportadaSieg["status"] } : n));
    setModal(null);
  }

  // ── Criar regra ───────────────────────────────────────

  async function criarRegra() {
    if (!modalRegra || !fazendaId) return;
    setCriandoRegra(true);
    const { item, cnpj } = modalRegra;
    const c = classif[item.id];
    await supabase.from("regras_classificacao_nf").insert({
      fazenda_id:      fazendaId,
      nome_regra:      nomeRegra || `${modalRegra.nomeEmit} — ${item.descricao.substring(0, 40)}`,
      cnpj_emitente:   cnpj || null,
      ncm:             item.ncm  || null,
      insumo_id:       c?.insumo_id       || item.insumo_id       || null,
      categoria:       c?.categoria       || item.categoria       || null,
      centro_custo_id: c?.centro_custo_id || item.centro_custo_id || null,
      ativo:           true,
      qtd_aplicacoes:  0,
    } as Partial<RegraClassificacaoNf>);
    setCriandoRegra(false);
    setModalRegra(null);
    setNomeRegra("");
  }

  // ── Helpers ───────────────────────────────────────────

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  const nfsFiltradas = nfs.filter(n =>
    !busca || [n.nome_emitente, n.cnpj_emitente, n.numero].join(" ").toLowerCase().includes(busca.toLowerCase())
  );

  const totPendentes   = nfs.filter(n => n.status === "pendente").length;
  const totClassific   = nfs.filter(n => n.status === "classificada").length;
  const totIgnoradas   = nfs.filter(n => n.status === "ignorada").length;
  const valorPendente  = nfs.filter(n => n.status === "pendente").reduce((s, n) => s + (n.valor_total ?? 0), 0);

  // ── Render ────────────────────────────────────────────

  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "#F4F6FA", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Pendências SIEG</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              NFs importadas automaticamente que aguardam classificação de insumo / categoria
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/configuracoes/classificacao" style={{ padding: "8px 14px", borderRadius: 7, border: "0.5px solid #DDE2EE", background: "#fff", fontSize: 12, fontWeight: 600, color: "#555", textDecoration: "none" }}>
              ⚙️ Regras Automáticas
            </a>
            <a href="/configuracoes/automacoes" style={{ padding: "8px 14px", borderRadius: 7, background: "#1A4870", fontSize: 12, fontWeight: 600, color: "#fff", textDecoration: "none" }}>
              ▶ Executar Sync SIEG
            </a>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Pendentes", valor: totPendentes, sub: fmt(valorPendente), cor: "#C9921B", bg: "#FBF3E0" },
            { label: "Classificadas", valor: totClassific, sub: "automaticamente + manual", cor: "#16A34A", bg: "#F0FDF4" },
            { label: "Ignoradas", valor: totIgnoradas, sub: "sem movimentação", cor: "#888", bg: "#F3F6F9" },
            { label: "Total importado", valor: nfs.length, sub: "últimos 30 dias", cor: "#1A4870", bg: "#EBF5FF" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.cor }}>{k.valor}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {["pendente", "classificada", "ignorada", "todas"].map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: `0.5px solid ${filtroStatus === s ? "#1A4870" : "#DDE2EE"}`,
                background: filtroStatus === s ? "#1A4870" : "transparent",
                color: filtroStatus === s ? "#fff" : "#555",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {s === "todas" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
              {s === "pendente" && totPendentes > 0 && (
                <span style={{ marginLeft: 6, background: "#C9921B", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px" }}>{totPendentes}</span>
              )}
            </button>
          ))}
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor ou NF..."
            style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12, width: 240 }}
          />
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#888", fontSize: 13 }}>Carregando…</div>
        ) : nfsFiltradas.length === 0 ? (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: 48, textAlign: "center", color: "#888" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#555" }}>
              {filtroStatus === "pendente" ? "Nenhuma NF pendente — tudo classificado!" : "Nenhuma NF encontrada"}
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "0.5px solid #DDE2EE" }}>
                  {["NF", "Fornecedor", "CNPJ Emitente", "Emissão", "Valor Total", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nfsFiltradas.map((nf, i) => (
                  <tr key={nf.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: i % 2 === 1 ? "#FAFBFD" : "#fff" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1A4870" }}>
                      {nf.numero}/{nf.serie}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{nf.nome_emitente || nf.pessoa_nome || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#555" }}>
                      {(nf.cnpj_emitente || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#555" }}>{fmtDate(nf.data_emissao)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{fmt(nf.valor_total ?? 0)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 10,
                        background: `${STATUS_COLOR[nf.status]}18`,
                        color: STATUS_COLOR[nf.status],
                        border: `0.5px solid ${STATUS_COLOR[nf.status]}44`,
                      }}>
                        {nf.status === "pendente" ? "⏳ Pendente" : nf.status === "classificada" ? "✓ Classificada" : nf.status === "ignorada" ? "Ignorada" : nf.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => abrirModal(nf)}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "0.5px solid #1A4870", background: "transparent", color: "#1A4870", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        {nf.status === "pendente" ? "Classificar" : "Ver Itens"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Modal Classificação ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(900px, 97vw)", maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
                  NF {modal.numero}/{modal.serie} — {modal.nome_emitente || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {fmtDate(modal.data_emissao)} · {fmt(modal.valor_total ?? 0)} · CNPJ {(modal.cnpj_emitente || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {modal.status === "pendente" && (
                  <button
                    onClick={() => ignorarNf(modal.id)}
                    style={{ padding: "7px 14px", borderRadius: 7, border: "0.5px solid #DDE2EE", background: "#fff", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Ignorar NF
                  </button>
                )}
                <button onClick={() => setModal(null)} style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Fechar
                </button>
              </div>
            </div>

            {/* Itens */}
            <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
              {loadingItens ? (
                <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando itens…</div>
              ) : !modal.itens?.length ? (
                <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13 }}>
                  Nenhum item encontrado para esta NF
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {modal.itens.map(item => {
                    const c = classif[item.id] ?? { insumo_id: "", categoria: "", centro_custo_id: "" };
                    const classificado = item.status_item === "classificado";
                    return (
                      <div
                        key={item.id}
                        style={{
                          border: `0.5px solid ${classificado ? "#86EFAC" : "#DDE2EE"}`,
                          borderRadius: 10,
                          padding: 16,
                          background: classificado ? "#F0FDF4" : item.classificado_automaticamente ? "#EBF5FF" : "#fff",
                        }}
                      >
                        {/* Info do item */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>
                              {item.numero_item}. {item.descricao}
                            </div>
                            <div style={{ fontSize: 11, color: "#888", marginTop: 3, display: "flex", gap: 12 }}>
                              {item.ncm  && <span>NCM: {item.ncm}</span>}
                              {item.cfop && <span>CFOP: {item.cfop}</span>}
                              <span>{item.quantidade} {item.unidade} × {fmt(item.valor_unitario ?? 0)} = <strong>{fmt(item.valor_total ?? 0)}</strong></span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {item.classificado_automaticamente && (
                              <span style={{ fontSize: 10, color: "#1A4870", background: "#D5E8F5", padding: "2px 7px", borderRadius: 8, border: "0.5px solid #93C5FD" }}>
                                🤖 Auto
                              </span>
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 8,
                              background: classificado ? "#DCFCE7" : "#FBF3E0",
                              color: classificado ? "#166534" : "#92400E",
                              border: `0.5px solid ${classificado ? "#86EFAC" : "#FCD34D"}`,
                            }}>
                              {classificado ? "✓ Classificado" : "⏳ Pendente"}
                            </span>
                          </div>
                        </div>

                        {/* Seletores de classificação */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                          <div>
                            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Categoria</label>
                            <select
                              value={c.categoria}
                              onChange={e => setClassif(prev => ({ ...prev, [item.id]: { ...c, categoria: e.target.value } }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12 }}
                            >
                              <option value="">— Selecionar —</option>
                              {CATEGORIAS.map(cat => <option key={cat} value={cat}>{CAT_LABEL[cat]}</option>)}
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Insumo</label>
                            <select
                              value={c.insumo_id}
                              onChange={e => setClassif(prev => ({ ...prev, [item.id]: { ...c, insumo_id: e.target.value } }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12 }}
                            >
                              <option value="">— Nenhum —</option>
                              {insumos
                                .filter(ins => !c.categoria || ins.categoria === c.categoria)
                                .map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)
                              }
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Centro de Custo</label>
                            <select
                              value={c.centro_custo_id}
                              onChange={e => setClassif(prev => ({ ...prev, [item.id]: { ...c, centro_custo_id: e.target.value } }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12 }}
                            >
                              <option value="">— Nenhum —</option>
                              {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                            </select>
                          </div>

                          <button
                            onClick={() => salvarItemClassif(item)}
                            disabled={!c.categoria && !c.insumo_id}
                            style={{
                              padding: "7px 14px", borderRadius: 7, border: "none",
                              background: (!c.categoria && !c.insumo_id) ? "#DDE2EE" : "#1A4870",
                              color: (!c.categoria && !c.insumo_id) ? "#aaa" : "#fff",
                              fontSize: 12, fontWeight: 600, cursor: (!c.categoria && !c.insumo_id) ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Criar Regra ── */}
      {modalRegra && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(520px, 97vw)", padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>💡 Criar Regra Automática?</div>
            <p style={{ fontSize: 13, color: "#555", margin: "0 0 20px", lineHeight: 1.6 }}>
              Deseja que o sistema classifique automaticamente nas próximas importações itens de
              {" "}<strong>{modalRegra.nomeEmit || modalRegra.cnpj}</strong>{" "}
              com o NCM <strong>{modalRegra.item.ncm || "(qualquer)"}</strong>?
            </p>

            <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#555" }}>
              <div><strong>Fornecedor:</strong> {modalRegra.nomeEmit} ({(modalRegra.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})</div>
              <div><strong>NCM:</strong> {modalRegra.item.ncm || "—"} · <strong>Produto:</strong> {modalRegra.item.descricao}</div>
              <div><strong>Classificação:</strong> {CAT_LABEL[classif[modalRegra.item.id]?.categoria || modalRegra.item.categoria || ""] || "—"} {insumos.find(i => i.id === (classif[modalRegra.item.id]?.insumo_id || modalRegra.item.insumo_id))?.nome ? `→ ${insumos.find(i => i.id === (classif[modalRegra.item.id]?.insumo_id || modalRegra.item.insumo_id))?.nome}` : ""}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Nome da regra (opcional)</label>
              <input
                value={nomeRegra}
                onChange={e => setNomeRegra(e.target.value)}
                placeholder={`${modalRegra.nomeEmit} — ${modalRegra.item.descricao.substring(0, 30)}`}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setModalRegra(null); setNomeRegra(""); }}
                style={{ padding: "8px 18px", borderRadius: 7, border: "0.5px solid #DDE2EE", background: "#fff", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Não, obrigado
              </button>
              <button
                onClick={criarRegra}
                disabled={criandoRegra}
                style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {criandoRegra ? "Salvando…" : "✓ Criar Regra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

