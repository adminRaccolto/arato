"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type Aba = "excluir_cliente" | "limpar_dados";

type ContaInfo = {
  id: string;
  nome: string;
  tipo: string;
  fazendas: { id: string; nome: string; municipio: string; estado: string }[];
};

type ResultGrupo = { grupo: string; ok: boolean; deletados: number; erros: string[] };

const GRUPOS = [
  {
    id: "financeiro",
    label: "Financeiro",
    icon: "💰",
    desc: "Lançamentos CP/CR · Contratos financeiros · Parcelas · Mútuo · Consórcio · Seguros · Taxas bancárias",
    cor: "#E24B4A", bg: "#FFF0F0",
    countTables: ["lancamentos", "contratos_financeiros", "mutuos", "apolices_seguro", "consorcios"],
    deleteTables: [
      "pagamento_lote_itens", "pagamento_lotes",
      "parcelas_pagamento", "pagamentos_mutuo",
      "pagamentos_premio_seguro", "sinistros_seguro", "parcelas_consorcio",
      "lancamentos", "contratos_financeiros", "mutuos", "apolices_seguro", "consorcios", "taxas_bancarias",
    ],
    aviso: null as string | null,
  },
  {
    id: "comercial",
    label: "Comercialização",
    icon: "📋",
    desc: "Contratos de venda/compra · Romaneios · Expedição · CT-e · MDF-e",
    cor: "#C9921B", bg: "#FBF3E0",
    countTables: ["contratos", "romaneios"],
    deleteTables: ["romaneios", "contrato_itens", "contratos", "cargas_expedicao", "ctes", "mdfes"],
    aviso: null as string | null,
  },
  {
    id: "lavoura",
    label: "Lavoura",
    icon: "🌾",
    desc: "Plantios · Pulverizações · Colheitas · Adubações · Correções de solo · Orçamentos",
    cor: "#16A34A", bg: "#DCFCE7",
    countTables: ["plantios", "pulverizacoes", "colheitas", "correcoes_solo", "adubacoes_base"],
    deleteTables: ["orcamento_itens", "orcamentos", "colheitas", "pulverizacoes", "plantios", "correcoes_solo", "adubacoes_base", "monitoramento_pragas"],
    aviso: null as string | null,
  },
  {
    id: "arrendamentos",
    label: "Arrendamentos",
    icon: "📜",
    desc: "Contratos de arrendamento · Parcelas de pagamento · Matrículas vinculadas",
    cor: "#6B7280", bg: "#F3F4F6",
    countTables: ["arrendamentos"],
    deleteTables: ["arrendamento_pagamentos", "arrendamento_matriculas", "arrendamentos"],
    aviso: null as string | null,
  },
  {
    id: "estoque",
    label: "Estoque & Compras",
    icon: "📦",
    desc: "NFs de entrada · Pedidos de compra · Movimentações de estoque",
    cor: "#378ADD", bg: "#EFF6FF",
    countTables: ["nf_entradas", "pedidos_compra", "movimentacoes_estoque"],
    deleteTables: ["movimentacoes_estoque", "nf_entrada_itens", "nf_entradas", "pedidos_compra_itens", "pedidos_compra"],
    aviso: null as string | null,
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: "👤",
    desc: "Pessoas · Produtores · Insumos · Máquinas · Depósitos",
    cor: "#7C3AED", bg: "#F5F3FF",
    countTables: ["pessoas", "produtores", "insumos", "maquinas"],
    deleteTables: ["abastecimentos", "historico_manutencao", "maquinas", "depositos", "insumos", "pessoas", "produtores"],
    aviso: "Exclua Financeiro, Comercial, Arrendamentos e Estoque antes — há registros vinculados a Pessoas.",
  },
  {
    id: "estrutura",
    label: "Estrutura (Talhões & Ciclos)",
    icon: "🗺️",
    desc: "Talhões · Ciclos de produção · Anos safra · Matrículas de imóvel",
    cor: "#0B2D50", bg: "#D5E8F5",
    countTables: ["talhoes", "ciclos", "anos_safra"],
    deleteTables: ["matriculas_imoveis", "talhoes", "ciclos", "anos_safra"],
    aviso: "Exclua Lavoura antes — operações de lavoura dependem de ciclos e talhões.",
  },
];

function isErroBenigno(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("no rows") || m.includes("pgrst116");
}

export default function DadosAdminPage() {
  const { raccotloGestor } = useAuth();
  const [aba, setAba] = useState<Aba>("excluir_cliente");

  // ─── Estado: Excluir Cliente ──────────────────────────────────────────
  const [contas, setContas] = useState<ContaInfo[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<string>("");
  const [confirmaTexto, setConfirmaTexto] = useState("");
  const [deletandoCliente, setDeletandoCliente] = useState(false);
  const [resultadoCliente, setResultadoCliente] = useState<{ ok: boolean; msg: string } | null>(null);

  // ─── Estado: Limpar Dados ─────────────────────────────────────────────
  const [contaLimpar, setContaLimpar] = useState<string>("");
  const [fazendaLimpar, setFazendaLimpar] = useState<string>("");
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [carregandoContagens, setCarregandoContagens] = useState(false);
  const [gruposSelecionados, setGruposSelecionados] = useState<Set<string>>(new Set());
  const [confirmaDeletar, setConfirmaDeletar] = useState("");
  const [deletandoDados, setDeletandoDados] = useState(false);
  const [resultadoLimpeza, setResultadoLimpeza] = useState<ResultGrupo[] | null>(null);

  if (!raccotloGestor) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a" }}>Acesso restrito a Gestores</div>
      </div>
    );
  }

  // ─── Carregar contas ──────────────────────────────────────────────────
  const carregarContas = useCallback(async () => {
    setCarregandoContas(true);
    const { data: contasDB } = await supabase.from("contas").select("id, nome, tipo").order("nome");
    const { data: fazendasDB } = await supabase.from("fazendas").select("id, nome, municipio, estado, conta_id");
    const fazPorConta: Record<string, ContaInfo["fazendas"]> = {};
    for (const f of (fazendasDB ?? [])) {
      if (!f.conta_id) continue;
      if (!fazPorConta[f.conta_id]) fazPorConta[f.conta_id] = [];
      fazPorConta[f.conta_id].push({ id: f.id, nome: f.nome, municipio: f.municipio, estado: f.estado });
    }
    setContas((contasDB ?? []).map(c => ({
      id: c.id, nome: c.nome, tipo: c.tipo,
      fazendas: fazPorConta[c.id] ?? [],
    })));
    setCarregandoContas(false);
  }, []);

  useEffect(() => { carregarContas(); }, [carregarContas]);

  // ─── Carregar contagens ───────────────────────────────────────────────
  async function carregarContagens() {
    const contaObj = contas.find(c => c.id === contaLimpar);
    if (!contaObj || !fazendaLimpar) return;
    const fazIds = fazendaLimpar === "todas"
      ? contaObj.fazendas.map(f => f.id)
      : [fazendaLimpar];
    if (!fazIds.length) return;
    setCarregandoContagens(true);
    setContagens({});
    const novo: Record<string, number> = {};
    for (const grupo of GRUPOS) {
      let total = 0;
      for (const table of grupo.countTables) {
        for (const fId of fazIds) {
          try {
            const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("fazenda_id", fId);
            total += count ?? 0;
          } catch { /* tabela pode não existir */ }
        }
      }
      novo[grupo.id] = total;
    }
    setContagens(novo);
    setCarregandoContagens(false);
    setResultadoLimpeza(null);
  }

  // ─── Executar limpeza seletiva ────────────────────────────────────────
  async function executarLimpeza() {
    const contaObj = contas.find(c => c.id === contaLimpar);
    if (!contaObj || !fazendaLimpar || gruposSelecionados.size === 0) return;
    if (confirmaDeletar !== "CONFIRMO") return;
    setDeletandoDados(true);
    setResultadoLimpeza(null);
    const fazIds = fazendaLimpar === "todas"
      ? contaObj.fazendas.map(f => f.id)
      : [fazendaLimpar];
    const resultados: ResultGrupo[] = [];
    for (const grupo of GRUPOS.filter(g => gruposSelecionados.has(g.id))) {
      const erros: string[] = [];
      let deletados = 0;
      for (const table of grupo.deleteTables) {
        for (const fId of fazIds) {
          try {
            const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("fazenda_id", fId);
            if (error) { if (!isErroBenigno(error.message)) erros.push(`${table}: ${error.message}`); }
            else deletados += count ?? 0;
          } catch { /* tabela inexistente */ }
        }
      }
      resultados.push({ grupo: grupo.label, ok: erros.length === 0, deletados, erros });
    }
    setResultadoLimpeza(resultados);
    setGruposSelecionados(new Set());
    setConfirmaDeletar("");
    await carregarContagens();
    setDeletandoDados(false);
  }

  // ─── Excluir cliente completo ─────────────────────────────────────────
  async function excluirClienteCompleto() {
    const contaObj = contas.find(c => c.id === contaSelecionada);
    if (!contaObj || confirmaTexto !== contaObj.nome) return;
    setDeletandoCliente(true);
    setResultadoCliente(null);
    try {
      for (const faz of contaObj.fazendas) {
        const { error } = await supabase.from("fazendas").delete().eq("id", faz.id);
        if (error) throw new Error(`Erro ao excluir fazenda "${faz.nome}": ${error.message}`);
      }
      await supabase.from("produtores").delete().eq("conta_id", contaObj.id);
      try { await supabase.from("perfis").update({ conta_id: null, fazenda_id: null }).eq("conta_id", contaObj.id); } catch { /* coluna pode não existir */ }
      const { error: errConta } = await supabase.from("contas").delete().eq("id", contaObj.id);
      if (errConta) throw new Error(`Erro ao excluir conta: ${errConta.message}`);
      setResultadoCliente({
        ok: true,
        msg: `Cliente "${contaObj.nome}" excluído com sucesso. ${contaObj.fazendas.length} fazenda(s) e todos os dados foram removidos. Usuários de autenticação permanecem no Supabase — exclua-os em Authentication → Users se necessário.`,
      });
      setContaSelecionada("");
      setConfirmaTexto("");
      await carregarContas();
    } catch (e) {
      setResultadoCliente({ ok: false, msg: String(e) });
    }
    setDeletandoCliente(false);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  const contaExcluirObj = contas.find(c => c.id === contaSelecionada) ?? null;
  const contaLimparObj  = contas.find(c => c.id === contaLimpar) ?? null;
  const fazLimparNome   = fazendaLimpar === "todas"
    ? "Todas as fazendas"
    : contaLimparObj?.fazendas.find(f => f.id === fazendaLimpar)?.nome ?? "";
  const totalRegistros   = Object.values(contagens).reduce((a, b) => a + b, 0);
  const totalSelecionado = GRUPOS.filter(g => gruposSelecionados.has(g.id)).reduce((acc, g) => acc + (contagens[g.id] ?? 0), 0);

  // estilos comuns
  const card: React.CSSProperties = {
    background: "white", borderRadius: 10, border: "0.5px solid #DDE2EE",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
            Dados & Limpeza de Clientes
          </h1>
          <span style={{ padding: "2px 10px", background: "#E24B4A", color: "white", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            ZONA DE PERIGO
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          Ações irreversíveis de gestão de dados. Todas as exclusões são permanentes e não podem ser desfeitas.
        </p>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {([
          { id: "excluir_cliente" as Aba, icon: "🗑️", label: "Excluir Cliente", desc: "Remove a conta e TODOS os dados permanentemente" },
          { id: "limpar_dados"    as Aba, icon: "🧹", label: "Limpar Dados",    desc: "Escolha quais categorias excluir por fazenda" },
        ]).map(a => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setResultadoCliente(null); setResultadoLimpeza(null); }}
            style={{
              padding: "12px 20px", borderRadius: 10, cursor: "pointer",
              border: `2px solid ${aba === a.id ? "#E24B4A" : "#DDE2EE"}`,
              background: aba === a.id ? "#FFF0F0" : "white",
              textAlign: "left", minWidth: 220,
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: aba === a.id ? "#E24B4A" : "#1a1a1a" }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{a.desc}</div>
          </button>
        ))}
      </div>

      {/* ─── ABA: EXCLUIR CLIENTE ───────────────────────────────────────────── */}
      {aba === "excluir_cliente" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "flex-start" }}>

          {/* Lista de contas */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>Contas ({contas.length})</span>
              <button onClick={carregarContas} style={{ padding: "3px 8px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 11, background: "white", cursor: "pointer", color: "#555" }}>
                {carregandoContas ? "⏳" : "↺"}
              </button>
            </div>
            {carregandoContas
              ? <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
              : contas.length === 0
              ? <div style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>Nenhuma conta.</div>
              : contas.map(c => (
                <button key={c.id} onClick={() => { setContaSelecionada(c.id); setConfirmaTexto(""); setResultadoCliente(null); }}
                  style={{
                    display: "block", width: "100%", padding: "11px 16px",
                    borderBottom: "0.5px solid #DDE2EE", border: "none",
                    background: contaSelecionada === c.id ? "#FFF0F0" : "transparent",
                    textAlign: "left", cursor: "pointer",
                  }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: contaSelecionada === c.id ? "#E24B4A" : "#1a1a1a" }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {c.fazendas.length} fazenda{c.fazendas.length !== 1 ? "s" : ""}
                    {c.fazendas.length > 0 && ` · ${c.fazendas.map(f => f.nome).slice(0, 2).join(", ")}${c.fazendas.length > 2 ? "..." : ""}`}
                  </div>
                </button>
              ))
            }
          </div>

          {/* Painel de exclusão */}
          <div>
            {!contaExcluirObj ? (
              <div style={{ ...card, padding: 40, textAlign: "center", color: "#aaa", fontSize: 14 }}>
                Selecione um cliente à esquerda para ver as opções de exclusão.
              </div>
            ) : (
              <>
                {/* Aviso */}
                <div style={{ background: "#FFF0F0", border: "1.5px solid #E24B4A", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#E24B4A", marginBottom: 6 }}>⚠️ Operação irreversível</div>
                  <div style={{ fontSize: 13, color: "#7A1A1A", lineHeight: 1.7 }}>
                    Você está prestes a excluir permanentemente a conta <strong>{contaExcluirObj.nome}</strong>,
                    suas <strong>{contaExcluirObj.fazendas.length} fazenda{contaExcluirObj.fazendas.length !== 1 ? "s" : ""}</strong> e todos os dados vinculados — lançamentos, contratos, operações de lavoura, arrendamentos, estoque. Tudo.
                  </div>
                  {contaExcluirObj.fazendas.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {contaExcluirObj.fazendas.map(f => (
                        <span key={f.id} style={{ padding: "3px 8px", background: "#FFF", border: "0.5px solid #E24B4A40", borderRadius: 16, fontSize: 11, color: "#7A1A1A" }}>
                          {f.nome} · {f.municipio}/{f.estado}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: "#999" }}>
                    Os usuários de autenticação (e-mail/senha) NÃO são excluídos — remova-os manualmente em Supabase → Authentication se necessário.
                  </div>
                </div>

                {/* Confirmação */}
                <div style={{ ...card, padding: "18px 22px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 8 }}>
                    Para confirmar, digite exatamente o nome da conta:
                  </div>
                  <code style={{ display: "block", background: "#F4F6FA", padding: "6px 12px", borderRadius: 6, fontSize: 14, color: "#1A4870", fontWeight: 700, marginBottom: 10 }}>
                    {contaExcluirObj.nome}
                  </code>
                  <input
                    value={confirmaTexto}
                    onChange={e => setConfirmaTexto(e.target.value)}
                    placeholder="Digite o nome da conta aqui..."
                    style={{
                      width: "100%", padding: "9px 12px", fontSize: 13, boxSizing: "border-box",
                      border: `1.5px solid ${confirmaTexto === contaExcluirObj.nome ? "#E24B4A" : "#DDE2EE"}`,
                      borderRadius: 8, outline: "none",
                    }}
                  />
                  <button
                    onClick={excluirClienteCompleto}
                    disabled={confirmaTexto !== contaExcluirObj.nome || deletandoCliente}
                    style={{
                      marginTop: 14, width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                      background: confirmaTexto !== contaExcluirObj.nome ? "#DDE2EE" : "#E24B4A",
                      color: confirmaTexto !== contaExcluirObj.nome ? "#888" : "white",
                      fontWeight: 700, fontSize: 14,
                      cursor: confirmaTexto !== contaExcluirObj.nome ? "default" : "pointer",
                    }}
                  >
                    {deletandoCliente ? "⏳ Excluindo..." : `🗑️ Excluir "${contaExcluirObj.nome}" permanentemente`}
                  </button>
                </div>
              </>
            )}

            {/* Resultado */}
            {resultadoCliente && (
              <div style={{ marginTop: 14, padding: "14px 18px", borderRadius: 10, background: resultadoCliente.ok ? "#DCFCE7" : "#FFF0F0", border: `0.5px solid ${resultadoCliente.ok ? "#16A34A" : "#E24B4A"}` }}>
                <div style={{ fontWeight: 700, color: resultadoCliente.ok ? "#15803D" : "#E24B4A", marginBottom: 4 }}>
                  {resultadoCliente.ok ? "✓ Excluído com sucesso" : "✗ Erro na exclusão"}
                </div>
                <div style={{ fontSize: 12, color: resultadoCliente.ok ? "#166534" : "#7A1A1A", lineHeight: 1.6 }}>
                  {resultadoCliente.msg}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ABA: LIMPAR DADOS ─────────────────────────────────────────────── */}
      {aba === "limpar_dados" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "flex-start" }}>

          {/* Painel esquerdo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <div style={{ ...card, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "#555", marginBottom: 6 }}>1. Cliente</div>
              <select value={contaLimpar}
                onChange={e => { setContaLimpar(e.target.value); setFazendaLimpar(""); setContagens({}); setGruposSelecionados(new Set()); setResultadoLimpeza(null); }}
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}>
                <option value="">— selecione —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.fazendas.length} faz.)</option>)}
              </select>
            </div>

            {contaLimparObj && (
              <div style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#555", marginBottom: 6 }}>2. Fazenda</div>
                <select value={fazendaLimpar}
                  onChange={e => { setFazendaLimpar(e.target.value); setContagens({}); setGruposSelecionados(new Set()); setResultadoLimpeza(null); }}
                  style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}>
                  <option value="">— selecione —</option>
                  {contaLimparObj.fazendas.length > 1 && <option value="todas">Todas as fazendas</option>}
                  {contaLimparObj.fazendas.map(f => <option key={f.id} value={f.id}>{f.nome} ({f.municipio}/{f.estado})</option>)}
                </select>
                {fazendaLimpar && (
                  <button onClick={carregarContagens} disabled={carregandoContagens}
                    style={{ marginTop: 10, width: "100%", padding: "7px 0", border: "0.5px solid #1A4870", borderRadius: 8, background: "white", color: "#1A4870", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    {carregandoContagens ? "⏳ Contando..." : "↺ Carregar contagens"}
                  </button>
                )}
              </div>
            )}

            {/* Resumo da seleção */}
            {Object.keys(contagens).length > 0 && gruposSelecionados.size > 0 && (
              <div style={{ background: "#FFF0F0", borderRadius: 10, border: "0.5px solid #E24B4A", padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#E24B4A", marginBottom: 6 }}>
                  {gruposSelecionados.size} grupo{gruposSelecionados.size !== 1 ? "s" : ""} selecionado{gruposSelecionados.size !== 1 ? "s" : ""}
                </div>
                {GRUPOS.filter(g => gruposSelecionados.has(g.id)).map(g => (
                  <div key={g.id} style={{ fontSize: 12, color: "#7A1A1A", marginTop: 2 }}>
                    • {g.label}: {(contagens[g.id] ?? 0).toLocaleString("pt-BR")} registros
                  </div>
                ))}
                <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: "#E24B4A" }}>
                  Total: {totalSelecionado.toLocaleString("pt-BR")} registros
                </div>
              </div>
            )}

            <div style={{ padding: "10px 12px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #C9921B", fontSize: 11, color: "#7A5A12", lineHeight: 1.7 }}>
              <strong>Passo a passo:</strong><br />
              1. Selecione cliente e fazenda<br />
              2. Carregue as contagens<br />
              3. Marque os grupos<br />
              4. Digite <code>CONFIRMO</code><br />
              5. Execute a limpeza
            </div>
          </div>

          {/* Painel direito */}
          <div>
            {!fazendaLimpar ? (
              <div style={{ ...card, padding: 40, textAlign: "center", color: "#aaa", fontSize: 13 }}>
                Selecione cliente e fazenda para ver os grupos disponíveis.
              </div>
            ) : (
              <>
                {/* Header da grade */}
                <div style={{ ...card, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{fazLimparNome}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {Object.keys(contagens).length > 0
                        ? `${totalRegistros.toLocaleString("pt-BR")} registros totais`
                        : "Clique em ↺ Carregar contagens"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setGruposSelecionados(new Set(GRUPOS.map(g => g.id)))}
                      style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 11, background: "white", cursor: "pointer", color: "#555" }}>
                      Marcar todos
                    </button>
                    <button onClick={() => setGruposSelecionados(new Set())}
                      style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 11, background: "white", cursor: "pointer", color: "#555" }}>
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Grade de grupos */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 18 }}>
                  {GRUPOS.map(g => {
                    const sel = gruposSelecionados.has(g.id);
                    const qtd = contagens[g.id] ?? null;
                    return (
                      <div key={g.id}
                        onClick={() => {
                          const novo = new Set(gruposSelecionados);
                          if (sel) novo.delete(g.id); else novo.add(g.id);
                          setGruposSelecionados(novo);
                        }}
                        style={{
                          background: sel ? g.bg : "white",
                          border: `1.5px solid ${sel ? g.cor : "#DDE2EE"}`,
                          borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all 0.12s",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? g.cor : "#DDE2EE"}`,
                              background: sel ? g.cor : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                              {sel && <span style={{ color: "white", fontSize: 10 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 15 }}>{g.icon}</span>
                            <span style={{ fontWeight: 700, fontSize: 13, color: sel ? g.cor : "#1a1a1a" }}>{g.label}</span>
                          </div>
                          {qtd !== null ? (
                            <span style={{
                              padding: "2px 7px", borderRadius: 16, fontSize: 11, fontWeight: 700,
                              background: qtd > 0 ? g.bg : "#F4F6FA",
                              color: qtd > 0 ? g.cor : "#aaa",
                              border: `0.5px solid ${qtd > 0 ? g.cor + "40" : "#DDE2EE"}`,
                            }}>
                              {qtd.toLocaleString("pt-BR")}
                            </span>
                          ) : carregandoContagens ? (
                            <span style={{ fontSize: 11, color: "#aaa" }}>...</span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5, marginLeft: 24 }}>{g.desc}</div>
                        {g.aviso && sel && (
                          <div style={{ marginTop: 6, marginLeft: 24, padding: "5px 8px", background: "#FBF3E0", borderRadius: 6, fontSize: 11, color: "#7A5A12", lineHeight: 1.5 }}>
                            ⚠️ {g.aviso}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Confirmação */}
                {gruposSelecionados.size > 0 && (
                  <div style={{ ...card, border: "1.5px solid #E24B4A", padding: "18px 22px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 8 }}>
                      Digite <code style={{ background: "#F4F6FA", padding: "2px 7px", borderRadius: 4, color: "#E24B4A", fontWeight: 700 }}>CONFIRMO</code> para habilitar:
                    </div>
                    <input value={confirmaDeletar} onChange={e => setConfirmaDeletar(e.target.value)}
                      placeholder="Digite CONFIRMO"
                      style={{
                        width: "100%", padding: "9px 12px", fontSize: 13, boxSizing: "border-box",
                        border: `1.5px solid ${confirmaDeletar === "CONFIRMO" ? "#E24B4A" : "#DDE2EE"}`,
                        borderRadius: 8, outline: "none",
                      }} />
                    <button onClick={executarLimpeza}
                      disabled={confirmaDeletar !== "CONFIRMO" || deletandoDados}
                      style={{
                        marginTop: 12, width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                        background: confirmaDeletar !== "CONFIRMO" ? "#DDE2EE" : "#E24B4A",
                        color: confirmaDeletar !== "CONFIRMO" ? "#888" : "white",
                        fontWeight: 700, fontSize: 14,
                        cursor: confirmaDeletar !== "CONFIRMO" ? "default" : "pointer",
                      }}>
                      {deletandoDados
                        ? "⏳ Limpando..."
                        : `🧹 Limpar ${gruposSelecionados.size} grupo${gruposSelecionados.size !== 1 ? "s" : ""} · ${totalSelecionado.toLocaleString("pt-BR")} registros`}
                    </button>
                  </div>
                )}

                {/* Resultado */}
                {resultadoLimpeza && (
                  <div style={{ marginTop: 14, ...card, overflow: "hidden" }}>
                    <div style={{ padding: "10px 18px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>
                      Resultado da limpeza
                    </div>
                    {resultadoLimpeza.map((r, i) => (
                      <div key={i} style={{ padding: "10px 18px", borderBottom: "0.5px solid #DDE2EE", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14 }}>{r.ok ? "✅" : "⚠️"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: r.ok ? "#15803D" : "#C9921B" }}>
                            {r.grupo}
                            {r.deletados > 0 && <span style={{ fontWeight: 400, color: "#888", marginLeft: 8 }}>— {r.deletados.toLocaleString("pt-BR")} registros removidos</span>}
                          </div>
                          {r.erros.map((e, j) => (
                            <div key={j} style={{ fontSize: 11, color: "#E24B4A", marginTop: 2 }}>✗ {e}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "10px 18px", background: "#F4F6FA", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#16A34A", fontWeight: 600 }}>
                        ✓ {resultadoLimpeza.filter(r => r.ok).length}/{resultadoLimpeza.length} grupos limpos
                      </span>
                      <span style={{ color: "#888" }}>
                        {resultadoLimpeza.reduce((acc, r) => acc + r.deletados, 0).toLocaleString("pt-BR")} registros removidos
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
