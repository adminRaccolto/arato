"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarOperacoesGerenciais, criarOperacaoGerencial, atualizarOperacaoGerencial, excluirOperacaoGerencial,
  listarPlanoContas,
} from "../../../lib/db";
import { seedOperacoesGerenciais } from "../../../lib/seedOperacoesGerenciais";
import type { OperacaoGerencial } from "../../../lib/supabase";
import type { ContaContabil } from "../../../lib/planoContas";

// ── Styles ────────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const chkRow = (checked: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 7, marginBottom: 7, cursor: "pointer", fontSize: 13,
  padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--border-table)",
  background: checked ? "#EEF5FE" : "var(--bg-card)",
});

type AbaModal = "telas" | "estoque" | "fiscal" | "financeiro" | "contabilidade";

const OG_VAZIO = {
  parent_id:               "",
  classificacao:           "",
  descricao:               "",
  tipo:                    "despesa" as OperacaoGerencial["tipo"],
  tipo_lcdpr:              "",
  inativo:                 false,
  informa_complemento:     false,
  permite_notas_fiscais:   false,
  permite_cp_cr:           false,
  permite_adiantamentos:   false,
  permite_tesouraria:      false,
  permite_baixas:          false,
  permite_custo_produto:   false,
  permite_contrato_financeiro: false,
  permite_estoque:         false,
  permite_pedidos_venda:   false,
  permite_manutencao:      false,
  marcar_fiscal_padrao:    false,
  permite_energia_eletrica: false,
  operacao_estoque:        "" as OperacaoGerencial["operacao_estoque"] | "",
  tipo_custo_estoque:      "nenhum" as OperacaoGerencial["tipo_custo_estoque"],
  obs_legal:               "",
  natureza_receita:        "",
  impostos:                [] as string[],
  gerar_financeiro:        false,
  gerar_financeiro_gerencial: false,
  valida_propriedade:      false,
  custo_absorcao:          false,
  custo_abc:               false,
  atualizar_custo_estoque: false,
  manutencao_reparos:      false,
  gerar_depreciacao:       false,
  tipo_formula:            "" as OperacaoGerencial["tipo_formula"] | "",
  modelo_contabil:         "",
  conta_debito:            "",
  conta_credito:           "",
  historico_tesouraria_id:   "" as number | "",
  historico_tesouraria_nome: "",
};

// helper para badge de conta
function BadgeConta({ codigo, contas }: { codigo: string; contas: ContaContabil[] }) {
  if (!codigo) return <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>;
  const c = contas.find(x => x.codigo === codigo);
  return (
    <span style={{ fontFamily: "monospace", fontSize: 11, background: "#EEF5FE", color: "#1A4870", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }} title={c?.nome ?? codigo}>
      {codigo}
    </span>
  );
}

// ── Componente ─────────────────────────────────────────────────────────────────
export default function OperacoesGerenciaisPage() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();

  const [ops,       setOps]       = useState<OperacaoGerencial[]>([]);
  const [plano,     setPlano]     = useState<ContaContabil[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [seeding,   setSeeding]   = useState(false);
  const [busca,     setBusca]     = useState(searchParams.get("conta") ? `conta:${searchParams.get("conta")}` : "");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "receita" | "despesa">("todos");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modal,     setModal]     = useState(false);
  const [editOp,    setEditOp]    = useState<OperacaoGerencial | null>(null);
  const [abaModal,  setAbaModal]  = useState<AbaModal>("telas");
  const [form,      setForm]      = useState({ ...OG_VAZIO });
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState<string | null>(null);

  // ── Carga ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [ogs, pdc] = await Promise.all([
        listarOperacoesGerenciais(fazendaId),
        listarPlanoContas(fazendaId),
      ]);
      setOps(ogs);
      setPlano(pdc);
    } finally { setLoading(false); }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const opsFiltradas = [...ops]
    .sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR", { numeric: false }))
    .filter(o => {
      if (!mostrarInativos && o.inativo) return false;
      if (filtroTipo !== "todos" && o.tipo !== filtroTipo) return false;
      if (!busca) return true;
      // Suporte a "conta:5.01" para filtrar por conta débito/crédito
      if (busca.startsWith("conta:")) {
        const cod = busca.slice(6).trim();
        return o.conta_debito?.startsWith(cod) || o.conta_credito?.startsWith(cod);
      }
      const q = busca.toLowerCase();
      return o.classificacao.toLowerCase().includes(q) || o.descricao.toLowerCase().includes(q);
    });

  // ── Contagens ──────────────────────────────────────────────────────────────
  const totalAtivos   = ops.filter(o => !o.inativo).length;
  const totalReceita  = ops.filter(o => o.tipo === "receita" && !o.inativo).length;
  const totalDespesa  = ops.filter(o => o.tipo === "despesa" && !o.inativo).length;
  const totalComConta = ops.filter(o => o.conta_debito || o.conta_credito).length;

  // ── Modal ──────────────────────────────────────────────────────────────────
  function abrirNovo() {
    setEditOp(null);
    setForm({ ...OG_VAZIO });
    setAbaModal("telas");
    setErro(null);
    setModal(true);
  }
  function abrirEditar(o: OperacaoGerencial) {
    setEditOp(o);
    setForm({
      parent_id:               o.parent_id ?? "",
      classificacao:           o.classificacao ?? "",
      descricao:               o.descricao ?? "",
      tipo:                    o.tipo ?? "despesa",
      tipo_lcdpr:              o.tipo_lcdpr ?? "",
      inativo:                 o.inativo ?? false,
      informa_complemento:     o.informa_complemento ?? false,
      permite_notas_fiscais:   o.permite_notas_fiscais ?? false,
      permite_cp_cr:           o.permite_cp_cr ?? false,
      permite_adiantamentos:   o.permite_adiantamentos ?? false,
      permite_tesouraria:      o.permite_tesouraria ?? false,
      permite_baixas:          o.permite_baixas ?? false,
      permite_custo_produto:   o.permite_custo_produto ?? false,
      permite_contrato_financeiro: o.permite_contrato_financeiro ?? false,
      permite_estoque:         o.permite_estoque ?? false,
      permite_pedidos_venda:   o.permite_pedidos_venda ?? false,
      permite_manutencao:      o.permite_manutencao ?? false,
      marcar_fiscal_padrao:    o.marcar_fiscal_padrao ?? false,
      permite_energia_eletrica: o.permite_energia_eletrica ?? false,
      operacao_estoque:        o.operacao_estoque ?? "",
      tipo_custo_estoque:      o.tipo_custo_estoque ?? "nenhum",
      obs_legal:               o.obs_legal ?? "",
      natureza_receita:        o.natureza_receita ?? "",
      impostos:                (o.impostos as string[] | null) ?? [],
      gerar_financeiro:        o.gerar_financeiro ?? false,
      gerar_financeiro_gerencial: o.gerar_financeiro_gerencial ?? false,
      valida_propriedade:      o.valida_propriedade ?? false,
      custo_absorcao:          o.custo_absorcao ?? false,
      custo_abc:               o.custo_abc ?? false,
      atualizar_custo_estoque: o.atualizar_custo_estoque ?? false,
      manutencao_reparos:      o.manutencao_reparos ?? false,
      gerar_depreciacao:       o.gerar_depreciacao ?? false,
      tipo_formula:            o.tipo_formula ?? "",
      modelo_contabil:         o.modelo_contabil ?? "",
      conta_debito:            o.conta_debito ?? "",
      conta_credito:           o.conta_credito ?? "",
      historico_tesouraria_id:   o.historico_tesouraria_id ?? "",
      historico_tesouraria_nome: o.historico_tesouraria_nome ?? "",
    });
    setAbaModal("telas");
    setErro(null);
    setModal(true);
  }

  async function salvar() {
    if (!fazendaId || !form.classificacao || !form.descricao) {
      setErro("Classificação e Descrição são obrigatórios.");
      return;
    }
    setSalvando(true); setErro(null);
    try {
      const payload: Partial<OperacaoGerencial> & { fazenda_id?: string } = {
        fazenda_id:              fazendaId,
        parent_id:               form.parent_id || undefined,
        classificacao:           form.classificacao,
        descricao:               form.descricao,
        tipo:                    form.tipo,
        tipo_lcdpr:              form.tipo_lcdpr || undefined,
        inativo:                 form.inativo,
        informa_complemento:     form.informa_complemento,
        permite_notas_fiscais:   form.permite_notas_fiscais,
        permite_cp_cr:           form.permite_cp_cr,
        permite_adiantamentos:   form.permite_adiantamentos,
        permite_tesouraria:      form.permite_tesouraria,
        permite_baixas:          form.permite_baixas,
        permite_custo_produto:   form.permite_custo_produto,
        permite_contrato_financeiro: form.permite_contrato_financeiro,
        permite_estoque:         form.permite_estoque,
        permite_pedidos_venda:   form.permite_pedidos_venda,
        permite_manutencao:      form.permite_manutencao,
        marcar_fiscal_padrao:    form.marcar_fiscal_padrao,
        permite_energia_eletrica: form.permite_energia_eletrica,
        operacao_estoque:        form.operacao_estoque || undefined,
        tipo_custo_estoque:      form.tipo_custo_estoque,
        obs_legal:               form.obs_legal || undefined,
        natureza_receita:        form.natureza_receita || undefined,
        impostos:                form.impostos,
        gerar_financeiro:        form.gerar_financeiro,
        gerar_financeiro_gerencial: form.gerar_financeiro_gerencial,
        valida_propriedade:      form.valida_propriedade,
        custo_absorcao:          form.custo_absorcao,
        custo_abc:               form.custo_abc,
        atualizar_custo_estoque: form.atualizar_custo_estoque,
        manutencao_reparos:      form.manutencao_reparos,
        gerar_depreciacao:       form.gerar_depreciacao,
        tipo_formula:            form.tipo_formula || undefined,
        modelo_contabil:         form.modelo_contabil || undefined,
        conta_debito:            form.conta_debito || undefined,
        conta_credito:           form.conta_credito || undefined,
        historico_tesouraria_id:   form.historico_tesouraria_id !== "" ? Number(form.historico_tesouraria_id) : undefined,
        historico_tesouraria_nome: form.historico_tesouraria_nome || undefined,
      };
      if (editOp) {
        await atualizarOperacaoGerencial(editOp.id, payload as Partial<OperacaoGerencial>);
      } else {
        await criarOperacaoGerencial(payload as Omit<OperacaoGerencial, "id" | "created_at">);
      }
      await carregar();
      setModal(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setSalvando(false); }
  }

  async function excluir(o: OperacaoGerencial) {
    if (!confirm(`Excluir "${o.descricao}"?`)) return;
    try {
      await excluirOperacaoGerencial(o.id);
      setOps(p => p.filter(x => x.id !== o.id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Erro ao excluir."); }
  }

  async function importarPadrao() {
    if (!fazendaId) return;
    if (!confirm("Isso vai SUBSTITUIR todas as operações pelo plano padrão do sistema. Continuar?")) return;
    setSeeding(true);
    try {
      await seedOperacoesGerenciais(fazendaId);
      await carregar();
      alert("Plano padrão importado com sucesso.");
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Erro."); } finally { setSeeding(false); }
  }

  async function exportarXlsx() {
    const XLSX = await import("xlsx");
    const sorted = [...ops].sort((a, b) => a.classificacao.localeCompare(b.classificacao));
    const dados = sorted.map(o => ({
      "Código":        o.classificacao,
      "Descrição":     o.descricao,
      "Tipo":          o.tipo,
      "CP/CR":         o.permite_cp_cr ? "Sim" : "",
      "NF":            o.permite_notas_fiscais ? "Sim" : "",
      "Tesouraria":    o.permite_tesouraria ? "Sim" : "",
      "Estoque":       o.permite_estoque ? "Sim" : "",
      "Conta Débito":  o.conta_debito ?? "",
      "Nome Débito":   plano.find(c => c.codigo === o.conta_debito)?.nome ?? "",
      "Conta Crédito": o.conta_credito ?? "",
      "Nome Crédito":  plano.find(c => c.codigo === o.conta_credito)?.nome ?? "",
      "Inativo":       o.inativo ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 18 }, { wch: 45 }, { wch: 10 }, { wch: 7 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 40 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Operações Gerenciais");
    XLSX.writeFile(wb, `operacoes_gerenciais_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  // ── helper: select de conta do plano ──────────────────────────────────────
  function SelectConta({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    const nome = plano.find(c => c.codigo === value)?.nome;
    return (
      <div>
        <select style={{ ...inp, fontFamily: "monospace" }} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">{placeholder}</option>
          {plano.map(c => {
            const d = c.codigo.split(".").length - 1;
            return (
              <option key={c.codigo} value={c.codigo} style={{ fontWeight: d <= 1 ? 700 : 400 }}>
                {" ".repeat(d * 3)}{c.codigo} — {c.nome}
              </option>
            );
          })}
        </select>
        {value && nome && (
          <div style={{ fontSize: 11, color: "#0B2D50", marginTop: 3, background: "#EEF5FE", padding: "3px 8px", borderRadius: 5 }}>
            {nome}
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Operações Gerenciais</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
              Categorias de lançamento · CP/CR · NF · Estoque · Financeiro · Contabilidade
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportarXlsx}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #16A34A", borderRadius: 8, background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontWeight: 600 }}>
              ⬇ XLSX
            </button>
            <button onClick={importarPadrao} disabled={seeding}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF3E0", color: "#7A5A10", cursor: seeding ? "not-allowed" : "pointer", fontWeight: 600, opacity: seeding ? 0.7 : 1 }}>
              {seeding ? "Importando…" : "↓ Importar Padrão"}
            </button>
            <a href="/configuracoes/plano-contas"
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #1A4870", borderRadius: 8, background: "#D5E8F5", color: "#0B2D50", cursor: "pointer", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              → Plano de Contas
            </a>
            <button onClick={abrirNovo}
              style={{ fontSize: 12, padding: "7px 14px", border: "none", borderRadius: 8, background: "#1A4870", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              + Nova Operação
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Ativas",       value: totalAtivos,   color: "#1A4870", bg: "#D5E8F5" },
            { label: "Receitas",           value: totalReceita,  color: "#1A5C38", bg: "#EAF3DE" },
            { label: "Despesas",           value: totalDespesa,  color: "#633806", bg: "#FAEEDA" },
            { label: "Com Conta Contábil", value: totalComConta, color: "#4B1A8A", bg: "#F0EAF8" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `0.5px solid ${k.color}20`, borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: k.color, opacity: 0.8, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)", padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {(["todos", "receita", "despesa"] as const).map(f => (
            <button key={f} onClick={() => setFiltroTipo(f)} style={{
              padding: "4px 12px", borderRadius: 16, border: "0.5px solid",
              borderColor: filtroTipo === f ? "#1A4870" : "var(--border-table)",
              background: filtroTipo === f ? "#D5E8F5" : "transparent",
              color: filtroTipo === f ? "#0B2D50" : "var(--text-3)", fontWeight: filtroTipo === f ? 600 : 400, fontSize: 12, cursor: "pointer",
            }}>
              {f === "todos" ? "Todos" : f === "receita" ? "Receitas" : "Despesas"}
            </button>
          ))}
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por código, descrição ou conta: (ex: conta:5.01)"
            style={{ ...inp, padding: "5px 10px", width: 340 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "pointer", marginLeft: "auto" }}>
            <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
            Mostrar inativas
          </label>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{opsFiltradas.length} de {ops.length}</span>
        </div>

        {/* Tabela */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando operações…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--bg-page)" }}>
                  {["Código", "Descrição", "Tipo", "Débito → Crédito (Plano de Contas)", "Telas", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opsFiltradas.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    Nenhuma operação encontrada. Use "↓ Importar Padrão" ou "+ Nova Operação".
                  </td></tr>
                )}
                {opsFiltradas.map((o, i) => {
                  const nivel    = (o.classificacao?.match(/\./g) || []).length;
                  const isGrupo  = nivel <= 1;
                  const telas: string[] = [];
                  if (o.permite_notas_fiscais) telas.push("NF");
                  if (o.permite_cp_cr)         telas.push("CP/CR");
                  if (o.permite_tesouraria)    telas.push("Tesouraria");
                  if (o.permite_estoque)       telas.push("Estoque");
                  if (o.permite_pedidos_venda) telas.push("Ped.Venda");
                  const temConta = !!(o.conta_debito || o.conta_credito);
                  return (
                    <tr key={o.id} style={{
                      borderBottom: "0.5px solid var(--border-row)",
                      background: o.inativo ? "var(--bg-page)" : isGrupo ? "#F8FAFC" : i % 2 === 0 ? "var(--bg-card)" : "transparent",
                      opacity: o.inativo ? 0.55 : 1,
                    }}>
                      <td style={{ padding: "7px 12px", fontFamily: "monospace", fontSize: 12, color: isGrupo ? "#1A4870" : "var(--text-2)", fontWeight: isGrupo ? 700 : 400 }}>
                        {o.classificacao}
                      </td>
                      <td style={{ padding: "7px 12px", fontSize: isGrupo ? 13 : 12, fontWeight: isGrupo ? 600 : 400, color: "var(--text-1)" }}>
                        <span style={{ paddingLeft: nivel * 12, display: "inline-block" }}>
                          {!isGrupo && <span style={{ color: "var(--text-3)", marginRight: 4 }}>└</span>}
                          {o.descricao}
                          {o.inativo && <span style={{ marginLeft: 6, fontSize: 9, background: "#FCEBEB", color: "#791F1F", padding: "1px 5px", borderRadius: 4 }}>INATIVA</span>}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: o.tipo === "receita" ? "#EAF3DE" : "#FBF3E0", color: o.tipo === "receita" ? "#1A5C38" : "#8B5E14" }}>
                          {o.tipo === "receita" ? "Receita" : "Despesa"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        {temConta ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <BadgeConta codigo={o.conta_debito ?? ""} contas={plano} />
                            {(o.conta_debito || o.conta_credito) && <span style={{ color: "var(--text-3)", fontSize: 11 }}>→</span>}
                            <BadgeConta codigo={o.conta_credito ?? ""} contas={plano} />
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-3)", fontSize: 11 }}>Não vinculada</span>
                        )}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        {telas.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                            {telas.map(t => (
                              <span key={t} style={{ fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{t}</span>
                            ))}
                          </div>
                        ) : <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(o)} title="Editar"
                            style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>✎</button>
                          <button onClick={() => excluir(o)} title="Excluir"
                            style={{ background: "#FCEBEB", border: "0.5px solid #F5C2C2", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
          Busca especial: <code style={{ background: "var(--bg-page)", padding: "1px 5px", borderRadius: 4 }}>conta:5.01</code> filtra todas as OGs que usam contas do grupo 5.01 no Plano de Contas
        </div>
      </div>

      {/* ── Modal OG ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: 860, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>

            {/* Header modal */}
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                {editOp ? `Editar — ${editOp.classificacao} · ${editOp.descricao}` : "Nova Operação Gerencial"}
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            {/* Cabeçalho fixo do formulário */}
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border-row)", flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 10 }}>
                <div>
                  <label style={lbl}>Operação Pai (hierarquia)</label>
                  <select style={inp} value={form.parent_id} onChange={e => setForm(p => ({ ...p, parent_id: e.target.value }))}>
                    <option value="">— Nível raiz —</option>
                    {ops.filter(o => !editOp || o.id !== editOp.id).sort((a, b) => a.classificacao.localeCompare(b.classificacao)).map(o => (
                      <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Descrição *</label>
                  <input style={inp} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Compra de Defensivos" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 160px 180px", gap: 12 }}>
                <div>
                  <label style={lbl}>Classificação *</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={form.classificacao} onChange={e => setForm(p => ({ ...p, classificacao: e.target.value }))} placeholder="Ex: 1.01.001" />
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={lbl}>Tipo</label>
                  {(["receita", "despesa"] as const).map(t => (
                    <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={form.tipo === t} onChange={() => setForm(p => ({ ...p, tipo: t }))} />
                      {t === "receita" ? "Receita" : "Despesa"}
                    </label>
                  ))}
                </div>
                <div>
                  <label style={lbl}>Tipo Doc. LCDPR</label>
                  <select style={inp} value={form.tipo_lcdpr} onChange={e => setForm(p => ({ ...p, tipo_lcdpr: e.target.value }))}>
                    <option value="">— Nenhum —</option>
                    <option value="1">1 — Nota Fiscal</option>
                    <option value="2">2 — Recibo</option>
                    <option value="3">3 — Folha de Pagamento</option>
                    <option value="4">4 — Pró-Labore</option>
                    <option value="5">5 — Outros</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-end", paddingBottom: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={form.inativo} onChange={e => setForm(p => ({ ...p, inativo: e.target.checked }))} /> Inativa
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={form.informa_complemento} onChange={e => setForm(p => ({ ...p, informa_complemento: e.target.checked }))} /> Inf. Compl.
                  </label>
                </div>
              </div>
            </div>

            {/* Abas */}
            <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", flexShrink: 0, background: "var(--bg-card)" }}>
              {([
                { key: "telas",         label: "Telas / Módulos"   },
                { key: "estoque",       label: "Estoque"            },
                { key: "fiscal",        label: "Fiscal"             },
                { key: "financeiro",    label: "Financeiro/Custos"  },
                { key: "contabilidade", label: "Contabilidade"      },
              ] as { key: AbaModal; label: string }[]).map(a => (
                <button key={a.key} onClick={() => setAbaModal(a.key)} style={{
                  padding: "9px 18px", border: "none", cursor: "pointer", fontSize: 13, background: "transparent",
                  borderBottom: abaModal === a.key ? "2px solid #1A5CB8" : "2px solid transparent",
                  color: abaModal === a.key ? "#1A5CB8" : "var(--text-2)",
                  fontWeight: abaModal === a.key ? 600 : 400,
                }}>
                  {a.key === "contabilidade" && (form.conta_debito || form.conta_credito) ? (
                    <span>{a.label} <span style={{ marginLeft: 4, fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>✓</span></span>
                  ) : a.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ padding: "18px 20px", flex: 1, overflowY: "auto" }}>

              {/* ── Telas / Módulos ── */}
              {abaModal === "telas" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Lançamentos Gerais</div>
                    {([
                      { key: "permite_notas_fiscais",       label: "Notas Fiscais de Entrada"    },
                      { key: "permite_cp_cr",               label: "Contas a Pagar / Receber"    },
                      { key: "permite_adiantamentos",       label: "Adiantamentos"               },
                      { key: "permite_tesouraria",          label: "Tesouraria"                  },
                      { key: "permite_baixas",              label: "Baixas"                      },
                      { key: "permite_custo_produto",       label: "Custo de Produto"            },
                      { key: "permite_contrato_financeiro", label: "Contrato Financeiro"         },
                    ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                      <label key={key} style={chkRow(!!form[key])}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Lançamentos Específicos</div>
                    {([
                      { key: "permite_estoque",         label: "Estoque"                          },
                      { key: "permite_pedidos_venda",   label: "Pedidos de Venda"                 },
                      { key: "permite_manutencao",      label: "Manutenção e Reparos"             },
                      { key: "marcar_fiscal_padrao",    label: "Marcar como Fiscal por Padrão"    },
                      { key: "permite_energia_eletrica",label: "Importação de Energia Elétrica"   },
                    ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                      <label key={key} style={chkRow(!!form[key])}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Estoque ── */}
              {abaModal === "estoque" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Operação de Estoque</div>
                    <div style={{ display: "flex", gap: 20 }}>
                      {(["entrada", "saida", "neutra"] as const).map(v => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                          <input type="radio" checked={form.operacao_estoque === v} onChange={() => setForm(p => ({ ...p, operacao_estoque: v }))} />
                          {v === "entrada" ? "Entrada" : v === "saida" ? "Saída" : "Neutra"}
                        </label>
                      ))}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                        <input type="radio" checked={!form.operacao_estoque} onChange={() => setForm(p => ({ ...p, operacao_estoque: "" }))} />
                        Não Aplica
                      </label>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Tipo de Custo no Estoque</div>
                    <div style={{ display: "flex", gap: 20 }}>
                      {(["gasto", "ajuste", "contrato", "nenhum"] as const).map(v => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                          <input type="radio" checked={form.tipo_custo_estoque === v} onChange={() => setForm(p => ({ ...p, tipo_custo_estoque: v }))} />
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Fiscal ── */}
              {abaModal === "fiscal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>OBS Legal (NF-e — campo infCpl)</label>
                      <input style={inp} value={form.obs_legal} onChange={e => setForm(p => ({ ...p, obs_legal: e.target.value }))} placeholder="Texto padrão incluído automaticamente na NF-e" />
                    </div>
                    <div>
                      <label style={lbl}>Natureza da Receita</label>
                      <input style={inp} value={form.natureza_receita} onChange={e => setForm(p => ({ ...p, natureza_receita: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Impostos / Retenções</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[
                        { key: "icms",         label: "ICMS"         },
                        { key: "funrural",     label: "FUNRURAL"     },
                        { key: "fethab1",      label: "FETHAB 1"     },
                        { key: "fethab2",      label: "FETHAB 2"     },
                        { key: "iagro",        label: "IAGRO"        },
                        { key: "senar",        label: "SENAR"        },
                        { key: "cbs",          label: "CBS"          },
                        { key: "ibs_estadual", label: "IBS Estadual" },
                      ].map(({ key, label }) => (
                        <label key={key} style={{
                          display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13,
                          padding: "6px 12px", border: "0.5px solid var(--border-table)", borderRadius: 6,
                          background: form.impostos.includes(key) ? "#D5E8F5" : "var(--bg-card)",
                        }}>
                          <input type="checkbox" checked={form.impostos.includes(key)}
                            onChange={e => setForm(p => ({ ...p, impostos: e.target.checked ? [...p.impostos, key] : p.impostos.filter(x => x !== key) }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Financeiro/Custos ── */}
              {abaModal === "financeiro" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Financeiro</div>
                    {([
                      { key: "gerar_financeiro",            label: "Gerar Financeiro"                 },
                      { key: "gerar_financeiro_gerencial",  label: "Gerar Financeiro Gerencial"       },
                      { key: "valida_propriedade",          label: "Valida Propriedade no Lançamento" },
                    ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                      <label key={key} style={chkRow(!!form[key])}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, marginTop: 16, textTransform: "uppercase" }}>Custos</div>
                    {([
                      { key: "custo_absorcao",          label: "Custo por Absorção"         },
                      { key: "custo_abc",               label: "Custo ABC"                  },
                      { key: "atualizar_custo_estoque", label: "Atualizar Custo do Estoque" },
                    ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                      <label key={key} style={chkRow(!!form[key])}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Patrimonial</div>
                    {([
                      { key: "manutencao_reparos", label: "Manutenção e Reparos" },
                      { key: "gerar_depreciacao",  label: "Gerar Depreciação"    },
                    ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                      <label key={key} style={chkRow(!!form[key])}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Contabilidade ── (VÍNCULO COM PLANO DE CONTAS) */}
              {abaModal === "contabilidade" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                  {/* Alerta se plano vazio */}
                  {plano.length === 0 && (
                    <div style={{ padding: "10px 14px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #C9921B", fontSize: 12, color: "#7A5A10" }}>
                      ⚠️ Plano de Contas não cadastrado. <a href="/configuracoes/plano-contas" style={{ color: "#1A4870", fontWeight: 600 }}>Cadastre o Plano de Contas</a> para vincular contas contábeis às operações gerenciais.
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={lbl}>Conta Contábil — Débito</label>
                      <SelectConta
                        value={form.conta_debito}
                        onChange={v => setForm(p => ({ ...p, conta_debito: v }))}
                        placeholder="— Selecione a conta de débito —"
                      />
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Conta que será debitada no razão contábil</div>
                    </div>
                    <div>
                      <label style={lbl}>Conta Contábil — Crédito</label>
                      <SelectConta
                        value={form.conta_credito}
                        onChange={v => setForm(p => ({ ...p, conta_credito: v }))}
                        placeholder="— Selecione a conta de crédito —"
                      />
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Conta que será creditada no razão contábil</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>Tipo de Fórmula</label>
                      <select style={inp} value={form.tipo_formula} onChange={e => setForm(p => ({ ...p, tipo_formula: e.target.value as typeof form.tipo_formula }))}>
                        <option value="">— Nenhuma —</option>
                        <option value="baixas">Baixas</option>
                        <option value="tesouraria">Tesouraria</option>
                        <option value="adiantamentos">Adiantamentos</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Modelo Contábil</label>
                      <input style={inp} value={form.modelo_contabil} onChange={e => setForm(p => ({ ...p, modelo_contabil: e.target.value }))} placeholder="Código do modelo de lançamento contábil" />
                    </div>
                  </div>

                  {/* Partida dupla visual */}
                  {(form.conta_debito || form.conta_credito) && (
                    <div style={{ padding: "14px 18px", background: "#F0F4FF", borderRadius: 8, border: "0.5px solid #1A4870" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Partida Dobrada — Prévia</div>
                      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "#1A4870", fontWeight: 600, marginBottom: 4 }}>DÉBITO</div>
                          {form.conta_debito ? (
                            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1A4870" }}>
                              {form.conta_debito}
                              <div style={{ fontFamily: "system-ui", fontSize: 11, fontWeight: 400, color: "var(--text-2)", marginTop: 2 }}>
                                {plano.find(c => c.codigo === form.conta_debito)?.nome ?? "—"}
                              </div>
                            </div>
                          ) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>Não selecionada</span>}
                        </div>
                        <div style={{ fontSize: 20, color: "var(--text-3)", alignSelf: "center" }}>⇄</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "#791F1F", fontWeight: 600, marginBottom: 4 }}>CRÉDITO</div>
                          {form.conta_credito ? (
                            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#791F1F" }}>
                              {form.conta_credito}
                              <div style={{ fontFamily: "system-ui", fontSize: 11, fontWeight: 400, color: "var(--text-2)", marginTop: 2 }}>
                                {plano.find(c => c.codigo === form.conta_credito)?.nome ?? "—"}
                              </div>
                            </div>
                          ) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>Não selecionada</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, fontStyle: "italic" }}>
                        Ao lançar nesta operação, o sistema registra automaticamente esta partida no razão contábil.
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer modal */}
            {erro && (
              <div style={{ padding: "8px 20px", background: "#FCEBEB", borderTop: "0.5px solid #F5C2C2", fontSize: 12, color: "#791F1F", flexShrink: 0 }}>{erro}</div>
            )}
            <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
              <button onClick={() => setModal(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? 0.7 : 1 }}>
                {salvando ? "Salvando…" : editOp ? "Salvar Alterações" : "Criar Operação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
