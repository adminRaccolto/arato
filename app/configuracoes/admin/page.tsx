"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
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
    cor: "#E24B4A",
    bg: "#FFF0F0",
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
    desc: "Contratos de venda/compra · Romaneios · Expedição de grãos · CT-e · MDF-e",
    cor: "#C9921B",
    bg: "#FBF3E0",
    countTables: ["contratos", "romaneios"],
    deleteTables: ["romaneios", "contrato_itens", "contratos", "cargas_expedicao", "ctes", "mdfes"],
    aviso: null as string | null,
  },
  {
    id: "lavoura",
    label: "Lavoura",
    icon: "🌾",
    desc: "Plantios · Pulverizações · Colheitas · Adubações · Correções de solo · Orçamentos",
    cor: "#16A34A",
    bg: "#DCFCE7",
    countTables: ["plantios", "pulverizacoes", "colheitas", "correcoes_solo", "adubacoes_base"],
    deleteTables: ["orcamento_itens", "orcamentos", "colheitas", "pulverizacoes", "plantios", "correcoes_solo", "adubacoes_base", "monitoramento_pragas"],
    aviso: null as string | null,
  },
  {
    id: "arrendamentos",
    label: "Arrendamentos",
    icon: "📜",
    desc: "Contratos de arrendamento · Parcelas de pagamento · Matrículas vinculadas",
    cor: "#6B7280",
    bg: "#F3F4F6",
    countTables: ["arrendamentos"],
    deleteTables: ["arrendamento_pagamentos", "arrendamento_matriculas", "arrendamentos"],
    aviso: null as string | null,
  },
  {
    id: "estoque",
    label: "Estoque & Compras",
    icon: "📦",
    desc: "NFs de entrada · Pedidos de compra · Movimentações de estoque",
    cor: "#378ADD",
    bg: "#EFF6FF",
    countTables: ["nf_entradas", "pedidos_compra", "movimentacoes_estoque"],
    deleteTables: ["movimentacoes_estoque", "nf_entrada_itens", "nf_entradas", "pedidos_compra_itens", "pedidos_compra"],
    aviso: null as string | null,
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: "👤",
    desc: "Pessoas · Produtores · Insumos · Máquinas · Depósitos",
    cor: "#7C3AED",
    bg: "#F5F3FF",
    countTables: ["pessoas", "produtores", "insumos", "maquinas"],
    deleteTables: ["abastecimentos", "historico_manutencao", "maquinas", "depositos", "insumos", "pessoas", "produtores"],
    aviso: "Exclua Financeiro, Comercial, Arrendamentos e Estoque antes — há registros vinculados a Pessoas.",
  },
  {
    id: "estrutura",
    label: "Estrutura (Talhões & Ciclos)",
    icon: "🗺️",
    desc: "Talhões · Ciclos de produção · Anos safra · Matrículas de imóvel",
    cor: "#0B2D50",
    bg: "#D5E8F5",
    countTables: ["talhoes", "ciclos", "anos_safra"],
    deleteTables: ["matriculas_imoveis", "talhoes", "ciclos", "anos_safra"],
    aviso: "Exclua Lavoura antes — operações de lavoura dependem de ciclos e talhões.",
  },
];

// Ignore estes erros do Supabase: tabela não existe, zero linhas
function isErroBenigno(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("no rows") || m.includes("pgrst116");
}

export default function AdminPage() {
  const { userRole } = useAuth();
  const [aba, setAba] = useState<Aba>("excluir_cliente");

  // ─── Estado: Excluir Cliente ──────────────────────────────────────────────
  const [contas, setContas] = useState<ContaInfo[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<string>("");
  const [confirmaTexto, setConfirmaTexto] = useState("");
  const [deletandoCliente, setDeletandoCliente] = useState(false);
  const [resultadoCliente, setResultadoCliente] = useState<{ ok: boolean; msg: string } | null>(null);

  // ─── Estado: Limpar Dados ─────────────────────────────────────────────────
  const [contaLimpar, setContaLimpar] = useState<string>("");
  const [fazendaLimpar, setFazendaLimpar] = useState<string>("");
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [carregandoContagens, setCarregandoContagens] = useState(false);
  const [gruposSelecionados, setGruposSelecionados] = useState<Set<string>>(new Set());
  const [confirmaDeletar, setConfirmaDeletar] = useState("");
  const [deletandoDados, setDeletandoDados] = useState(false);
  const [resultadoLimpeza, setResultadoLimpeza] = useState<ResultGrupo[] | null>(null);

  // ─── Acesso restrito ──────────────────────────────────────────────────────
  if (userRole !== "raccotlo") {
    return (
      <>
        <TopNav />
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-1)" }}>Acesso restrito</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Esta área é exclusiva para a equipe Raccolto.</div>
        </div>
      </>
    );
  }

  // ─── Carregar contas ──────────────────────────────────────────────────────
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

  // ─── Carregar contagens ───────────────────────────────────────────────────
  async function carregarContagens() {
    const contaObj = contas.find(c => c.id === contaLimpar);
    if (!contaObj) return;
    const fazIds = fazendaLimpar === "todas"
      ? contaObj.fazendas.map(f => f.id)
      : fazendaLimpar ? [fazendaLimpar] : [];
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

  // ─── Executar limpeza seletiva ────────────────────────────────────────────
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
            if (error) {
              if (!isErroBenigno(error.message)) erros.push(`${table}: ${error.message}`);
            } else {
              deletados += count ?? 0;
            }
          } catch { /* ignorar tabela inexistente */ }
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

  // ─── Excluir cliente completo ─────────────────────────────────────────────
  async function excluirClienteCompleto() {
    const contaObj = contas.find(c => c.id === contaSelecionada);
    if (!contaObj || confirmaTexto !== contaObj.nome) return;
    setDeletandoCliente(true);
    setResultadoCliente(null);
    try {
      // DELETE cada fazenda → CASCADE elimina todos os dados
      for (const faz of contaObj.fazendas) {
        const { error } = await supabase.from("fazendas").delete().eq("id", faz.id);
        if (error) throw new Error(`Erro ao excluir fazenda "${faz.nome}": ${error.message}`);
      }
      // Limpar produtores vinculados à conta (pode haver sem fazenda_id)
      await supabase.from("produtores").delete().eq("conta_id", contaObj.id);
      // Desvincula perfis sem deletar os usuários de auth
      try { await supabase.from("perfis").update({ conta_id: null, fazenda_id: null }).eq("conta_id", contaObj.id); } catch { /* coluna pode não existir */ }
      // Deleta a conta
      const { error: errConta } = await supabase.from("contas").delete().eq("id", contaObj.id);
      if (errConta) throw new Error(`Erro ao excluir conta: ${errConta.message}`);

      setResultadoCliente({
        ok: true,
        msg: `Cliente "${contaObj.nome}" excluído com sucesso. ${contaObj.fazendas.length} fazenda(s) e todos os dados foram removidos. Os usuários de autenticação continuam existindo no Supabase — exclua-os manualmente em Authentication → Users se necessário.`,
      });
      setContaSelecionada("");
      setConfirmaTexto("");
      await carregarContas();
    } catch (e) {
      setResultadoCliente({ ok: false, msg: String(e) });
    }
    setDeletandoCliente(false);
  }

  // ─── Helpers de UI ────────────────────────────────────────────────────────
  const contaExcluirObj = contas.find(c => c.id === contaSelecionada) ?? null;
  const contaLimparObj  = contas.find(c => c.id === contaLimpar) ?? null;
  const fazLimparNome   = fazendaLimpar === "todas"
    ? "Todas as fazendas"
    : contaLimparObj?.fazendas.find(f => f.id === fazendaLimpar)?.nome ?? "";

  const totalRegistros = Object.values(contagens).reduce((a, b) => a + b, 0);
  const totalSelecionado = GRUPOS
    .filter(g => gruposSelecionados.has(g.id))
    .reduce((acc, g) => acc + (contagens[g.id] ?? 0), 0);

  const ABAs: { id: Aba; label: string; icon: string; desc: string }[] = [
    { id: "excluir_cliente", label: "Excluir Cliente", icon: "🗑️", desc: "Remove a conta e TODOS os dados permanentemente" },
    { id: "limpar_dados",    label: "Limpar Dados",    icon: "🧹", desc: "Escolha quais categorias excluir por fazenda" },
  ];

  return (
    <>
      <TopNav />
      <div style={{ background: "var(--bg-page)", minHeight: "100vh", padding: "24px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>
              Administração de Clientes
            </h1>
            <span style={{ padding: "2px 10px", background: "#E24B4A", color: "white", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              ZONA DE PERIGO
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            Ações irreversíveis — exclusivo Raccolto. Todas as exclusões são permanentes e não podem ser desfeitas.
          </p>
        </div>

        {/* Seletor de abas */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {ABAs.map(a => (
            <button
              key={a.id}
              onClick={() => { setAba(a.id); setResultadoCliente(null); setResultadoLimpeza(null); }}
              style={{
                padding: "12px 20px", borderRadius: 10, cursor: "pointer",
                border: `2px solid ${aba === a.id ? "#E24B4A" : "var(--border)"}`,
                background: aba === a.id ? "#FFF0F0" : "white",
                textAlign: "left", minWidth: 240,
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: aba === a.id ? "#E24B4A" : "var(--text-1)" }}>{a.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{a.desc}</div>
            </button>
          ))}
        </div>

        {/* ─── ABA: EXCLUIR CLIENTE ──────────────────────────────────── */}
        {aba === "excluir_cliente" && (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "flex-start" }}>

            {/* Lista de contas */}
            <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)" }}>
                  Contas ({contas.length})
                </span>
                <button onClick={carregarContas} style={{ padding: "4px 10px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, background: "white", cursor: "pointer", color: "var(--text-2)" }}>
                  {carregandoContas ? "⏳" : "↺"} Recarregar
                </button>
              </div>
              {carregandoContas ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando...</div>
              ) : contas.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhuma conta encontrada.</div>
              ) : (
                contas.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setContaSelecionada(c.id); setConfirmaTexto(""); setResultadoCliente(null); }}
                    style={{
                      display: "block", width: "100%", padding: "12px 16px",
                      borderBottom: "0.5px solid var(--border)", border: "none",
                      background: contaSelecionada === c.id ? "#FFF0F0" : "transparent",
                      textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: contaSelecionada === c.id ? "#E24B4A" : "var(--text-1)" }}>
                      {c.nome}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {c.fazendas.length} fazenda{c.fazendas.length !== 1 ? "s" : ""}
                      {c.fazendas.length > 0 && ` · ${c.fazendas.map(f => f.nome).join(", ")}`}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Painel de exclusão */}
            <div>
              {!contaExcluirObj ? (
                <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                  Selecione um cliente à esquerda para ver as opções de exclusão.
                </div>
              ) : (
                <>
                  {/* Aviso */}
                  <div style={{ background: "#FFF0F0", border: "1.5px solid #E24B4A", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#E24B4A", marginBottom: 8 }}>
                      ⚠️ Atenção — operação irreversível
                    </div>
                    <div style={{ fontSize: 13, color: "#7A1A1A", lineHeight: 1.7 }}>
                      Você está prestes a excluir permanentemente:
                    </div>
                    <ul style={{ margin: "8px 0 0 16px", padding: 0, fontSize: 13, color: "#7A1A1A", lineHeight: 1.8 }}>
                      <li>A conta <strong>{contaExcluirObj.nome}</strong></li>
                      {contaExcluirObj.fazendas.map(f => (
                        <li key={f.id}>Fazenda <strong>{f.nome}</strong> ({f.municipio}/{f.estado}) e <em>todos os dados vinculados</em></li>
                      ))}
                      <li>Lançamentos, contratos, operações de lavoura, arrendamentos, estoque — tudo</li>
                    </ul>
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-3)" }}>
                      Os usuários de autenticação (e-mail/senha) NÃO são excluídos — remova-os manualmente em Supabase → Authentication se necessário.
                    </div>
                  </div>

                  {/* Detalhes da conta */}
                  <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: "16px 20px", marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>
                      Resumo do cliente selecionado
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {[
                        { label: "Conta", valor: contaExcluirObj.nome },
                        { label: "Tipo", valor: contaExcluirObj.tipo?.toUpperCase() ?? "—" },
                        { label: "Fazendas", valor: String(contaExcluirObj.fazendas.length) },
                      ].map(({ label, valor }) => (
                        <div key={label} style={{ padding: "10px 14px", background: "var(--bg-page)", borderRadius: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginTop: 2 }}>{valor}</div>
                        </div>
                      ))}
                    </div>
                    {contaExcluirObj.fazendas.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {contaExcluirObj.fazendas.map(f => (
                          <span key={f.id} style={{ padding: "4px 10px", background: "#FFF0F0", border: "0.5px solid #E24B4A40", borderRadius: 20, fontSize: 12, color: "#7A1A1A" }}>
                            {f.nome} · {f.municipio}/{f.estado}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confirmação */}
                  <div style={{ background: "white", borderRadius: 12, border: "1.5px solid #E24B4A", padding: "20px 24px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>
                      Para confirmar, digite exatamente o nome da conta:
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <code style={{ background: "var(--bg-page)", padding: "4px 10px", borderRadius: 6, fontSize: 14, color: "#1A4870", fontWeight: 700 }}>
                        {contaExcluirObj.nome}
                      </code>
                    </div>
                    <input
                      value={confirmaTexto}
                      onChange={e => setConfirmaTexto(e.target.value)}
                      placeholder="Digite o nome da conta aqui..."
                      style={{
                        width: "100%", padding: "10px 14px", border: `1.5px solid ${confirmaTexto === contaExcluirObj.nome ? "#E24B4A" : "var(--border)"}`,
                        borderRadius: 8, fontSize: 14, outline: "none", marginTop: 8, boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={excluirClienteCompleto}
                      disabled={confirmaTexto !== contaExcluirObj.nome || deletandoCliente}
                      style={{
                        marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                        background: confirmaTexto !== contaExcluirObj.nome ? "var(--border)" : "#E24B4A",
                        color: confirmaTexto !== contaExcluirObj.nome ? "var(--text-3)" : "white",
                        fontWeight: 700, fontSize: 15, cursor: confirmaTexto !== contaExcluirObj.nome ? "default" : "pointer",
                      }}
                    >
                      {deletandoCliente ? "⏳ Excluindo..." : `🗑️ Excluir "${contaExcluirObj.nome}" permanentemente`}
                    </button>
                  </div>
                </>
              )}

              {/* Resultado */}
              {resultadoCliente && (
                <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 10, background: resultadoCliente.ok ? "#DCFCE7" : "#FFF0F0", border: `0.5px solid ${resultadoCliente.ok ? "#16A34A" : "#E24B4A"}` }}>
                  <div style={{ fontWeight: 700, color: resultadoCliente.ok ? "#15803D" : "#E24B4A", marginBottom: 6 }}>
                    {resultadoCliente.ok ? "✓ Excluído com sucesso" : "✗ Erro na exclusão"}
                  </div>
                  <div style={{ fontSize: 13, color: resultadoCliente.ok ? "#166534" : "#7A1A1A", lineHeight: 1.6 }}>
                    {resultadoCliente.msg}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── ABA: LIMPAR DADOS ────────────────────────────────────── */}
        {aba === "limpar_dados" && (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "flex-start" }}>

            {/* Painel esquerdo: seleção de conta + fazenda */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: "16px 20px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>1. Selecione o cliente</div>
                <select
                  value={contaLimpar}
                  onChange={e => { setContaLimpar(e.target.value); setFazendaLimpar(""); setContagens({}); setGruposSelecionados(new Set()); setResultadoLimpeza(null); }}
                  style={{ width: "100%", padding: "9px 12px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}
                >
                  <option value="">— selecione —</option>
                  {contas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.fazendas.length} fazenda{c.fazendas.length !== 1 ? "s" : ""})</option>
                  ))}
                </select>
              </div>

              {contaLimparObj && (
                <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: "16px 20px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>2. Selecione a fazenda</div>
                  <select
                    value={fazendaLimpar}
                    onChange={e => { setFazendaLimpar(e.target.value); setContagens({}); setGruposSelecionados(new Set()); setResultadoLimpeza(null); }}
                    style={{ width: "100%", padding: "9px 12px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}
                  >
                    <option value="">— selecione —</option>
                    {contaLimparObj.fazendas.length > 1 && <option value="todas">Todas as fazendas</option>}
                    {contaLimparObj.fazendas.map(f => (
                      <option key={f.id} value={f.id}>{f.nome} ({f.municipio}/{f.estado})</option>
                    ))}
                  </select>
                  {fazendaLimpar && (
                    <button
                      onClick={carregarContagens}
                      disabled={carregandoContagens}
                      style={{ marginTop: 10, width: "100%", padding: "8px 0", border: "0.5px solid #1A4870", borderRadius: 8, background: "white", color: "#1A4870", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                    >
                      {carregandoContagens ? "⏳ Contando..." : "↺ Carregar contagens"}
                    </button>
                  )}
                </div>
              )}

              {/* Resumo da seleção */}
              {Object.keys(contagens).length > 0 && gruposSelecionados.size > 0 && (
                <div style={{ background: "#FFF0F0", borderRadius: 10, border: "0.5px solid #E24B4A", padding: "12px 16px" }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#E24B4A", marginBottom: 6 }}>
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

              {/* Instruções gerais */}
              <div style={{ padding: "12px 14px", background: "#FBF3E0", borderRadius: 10, border: "0.5px solid #C9921B", fontSize: 12, color: "#7A5A12", lineHeight: 1.7 }}>
                <strong>Passo a passo:</strong><br />
                1. Selecione cliente e fazenda<br />
                2. Carregue as contagens<br />
                3. Marque os grupos a excluir<br />
                4. Digite <code>CONFIRMO</code><br />
                5. Execute a limpeza
              </div>
            </div>

            {/* Painel direito: grupos + confirmação */}
            <div>
              {!fazendaLimpar ? (
                <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                  Selecione um cliente e uma fazenda para ver os grupos disponíveis.
                </div>
              ) : (
                <>
                  {/* Cabeçalho dos grupos */}
                  <div style={{ background: "white", borderRadius: 12, border: "0.5px solid var(--border)", padding: "14px 20px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>
                        {fazLimparNome || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                        {Object.keys(contagens).length > 0
                          ? `${totalRegistros.toLocaleString("pt-BR")} registros totais`
                          : "Clique em ↺ Carregar contagens para ver os dados"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setGruposSelecionados(new Set(GRUPOS.map(g => g.id)))}
                        style={{ padding: "6px 12px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, background: "white", cursor: "pointer", color: "var(--text-2)" }}
                      >
                        Marcar todos
                      </button>
                      <button
                        onClick={() => setGruposSelecionados(new Set())}
                        style={{ padding: "6px 12px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, background: "white", cursor: "pointer", color: "var(--text-2)" }}
                      >
                        Limpar seleção
                      </button>
                    </div>
                  </div>

                  {/* Grade de grupos */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
                    {GRUPOS.map(g => {
                      const selecionado = gruposSelecionados.has(g.id);
                      const qtd = contagens[g.id] ?? null;
                      return (
                        <div
                          key={g.id}
                          onClick={() => {
                            const novo = new Set(gruposSelecionados);
                            if (selecionado) novo.delete(g.id); else novo.add(g.id);
                            setGruposSelecionados(novo);
                          }}
                          style={{
                            background: selecionado ? g.bg : "white",
                            border: `1.5px solid ${selecionado ? g.cor : "var(--border)"}`,
                            borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, border: `2px solid ${selecionado ? g.cor : "var(--border)"}`,
                                background: selecionado ? g.cor : "white", display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                              }}>
                                {selecionado && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: 16 }}>{g.icon}</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: selecionado ? g.cor : "var(--text-1)" }}>{g.label}</span>
                            </div>
                            {qtd !== null && (
                              <span style={{
                                padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                background: qtd > 0 ? g.bg : "var(--bg-page)",
                                color: qtd > 0 ? g.cor : "var(--text-muted)",
                                border: `0.5px solid ${qtd > 0 ? g.cor + "40" : "var(--border)"}`,
                              }}>
                                {qtd.toLocaleString("pt-BR")}
                              </span>
                            )}
                            {qtd === null && carregandoContagens && (
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>...</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, marginLeft: 26 }}>{g.desc}</div>
                          {g.aviso && selecionado && (
                            <div style={{ marginTop: 8, marginLeft: 26, padding: "6px 10px", background: "#FBF3E0", borderRadius: 6, fontSize: 11, color: "#7A5A12", lineHeight: 1.5 }}>
                              ⚠️ {g.aviso}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Confirmação e botão */}
                  {gruposSelecionados.size > 0 && (
                    <div style={{ background: "white", borderRadius: 12, border: "1.5px solid #E24B4A", padding: "20px 24px" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 8 }}>
                        Para confirmar a exclusão, digite <code style={{ background: "var(--bg-page)", padding: "2px 8px", borderRadius: 4, color: "#E24B4A", fontWeight: 700 }}>CONFIRMO</code>:
                      </div>
                      <input
                        value={confirmaDeletar}
                        onChange={e => setConfirmaDeletar(e.target.value)}
                        placeholder="Digite CONFIRMO para habilitar o botão"
                        style={{
                          width: "100%", padding: "10px 14px", fontSize: 14, outline: "none", boxSizing: "border-box",
                          border: `1.5px solid ${confirmaDeletar === "CONFIRMO" ? "#E24B4A" : "var(--border)"}`, borderRadius: 8,
                        }}
                      />
                      <button
                        onClick={executarLimpeza}
                        disabled={confirmaDeletar !== "CONFIRMO" || deletandoDados}
                        style={{
                          marginTop: 14, width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                          background: confirmaDeletar !== "CONFIRMO" ? "var(--border)" : "#E24B4A",
                          color: confirmaDeletar !== "CONFIRMO" ? "var(--text-3)" : "white",
                          fontWeight: 700, fontSize: 15, cursor: confirmaDeletar !== "CONFIRMO" ? "default" : "pointer",
                        }}
                      >
                        {deletandoDados
                          ? "⏳ Excluindo..."
                          : `🧹 Limpar ${gruposSelecionados.size} grupo${gruposSelecionados.size !== 1 ? "s" : ""} · ${totalSelecionado.toLocaleString("pt-BR")} registros`}
                      </button>
                    </div>
                  )}

                  {/* Resultado da limpeza */}
                  {resultadoLimpeza && (
                    <div style={{ marginTop: 16, background: "white", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                      <div style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--border)", fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>
                        Resultado da limpeza
                      </div>
                      {resultadoLimpeza.map((r, i) => (
                        <div key={i} style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 16 }}>{r.ok ? "✅" : "⚠️"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: r.ok ? "#15803D" : "#C9921B" }}>
                              {r.grupo}
                              {r.deletados > 0 && <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 8 }}>— {r.deletados.toLocaleString("pt-BR")} registros removidos</span>}
                            </div>
                            {r.erros.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                {r.erros.map((e, j) => (
                                  <div key={j} style={{ fontSize: 11, color: "#E24B4A", marginTop: 2 }}>✗ {e}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: "12px 20px", background: "var(--bg-page)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "#16A34A", fontWeight: 600 }}>
                          ✓ {resultadoLimpeza.filter(r => r.ok).length} grupo{resultadoLimpeza.filter(r => r.ok).length !== 1 ? "s" : ""} limpo{resultadoLimpeza.filter(r => r.ok).length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "var(--text-3)" }}>
                          {resultadoLimpeza.reduce((acc, r) => acc + r.deletados, 0).toLocaleString("pt-BR")} registros removidos no total
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
    </>
  );
}
