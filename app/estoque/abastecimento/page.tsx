"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarBombas, listarMaquinas, listarFuncionarios } from "../../../lib/db";
import InputNumerico from "../../../components/InputNumerico";
import SelectBusca from "../../../components/SelectBusca";
import CascadeSelector from "../../../components/CascadeSelector";
import type { BombaCombustivel, Maquina, Funcionario } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Abastecimento = {
  id: string;
  fazenda_id: string;
  bomba_id: string;
  bomba_nome?: string;
  maquina_id: string | null;
  maquina_nome?: string;
  funcionario_id: string | null;
  funcionario_nome?: string;
  destino_livre: string | null;
  quantidade_l: number;
  valor_unitario: number;
  valor_total: number;
  data: string;
  observacao: string | null;
  lancamento_id: string | null;
  horimetro: number | null;
  ano_safra_id: string | null;
  ciclo_id: string | null;
  ciclo_nome?: string;
  created_at: string;
};

type InsumoCombo = { id: string; fazenda_id?: string; nome: string; estoque: number; custo_medio: number; unidade: string };

// ─── Estilos utilitários ───────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 };

const COMB_LABEL: Record<string, string> = {
  diesel_s10:  "Diesel S-10",
  diesel_s500: "Diesel S-500",
  gasolina:    "Gasolina",
  etanol:      "Etanol",
  arla:        "Arla 32",
};
const COMB_COR: Record<string, [string, string]> = {
  diesel_s10:  ["#FFF3E0", "#7B4A00"],
  diesel_s500: ["#FEF3C7", "#92400E"],
  gasolina:    ["#FFEBEE", "#B71C1C"],
  etanol:      ["#E8F5E9", "#1B5E20"],
  arla:        ["#E3F2FD", "#0D47A1"],
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number, dec = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function AbastecimentoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [bombas,       setBombas]       = useState<BombaCombustivel[]>([]);
  const [maquinas,     setMaquinas]     = useState<Maquina[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [insumos,      setInsumos]      = useState<InsumoCombo[]>([]);
  const [historico,    setHistorico]    = useState<Abastecimento[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fazNomes,     setFazNomes]     = useState<Map<string, string>>(new Map());
  const sufFaz = (id?: string | null) => (fazNomes.size > 1 && id ? ` · ${fazNomes.get(id) ?? ""}` : "");

  // Filtros
  const [filtroBomba,   setFiltroBomba]   = useState("");
  const [filtroMes,     setFiltroMes]     = useState(() => new Date().toISOString().substring(0, 7));

  // Modal
  const [modal,         setModal]         = useState(false);
  const [editando,      setEditando]      = useState<Abastecimento | null>(null);
  const [salvando,      setSalvando]      = useState(false);
  const [erroModal,     setErroModal]     = useState("");

  // Campos do formulário
  const [fBomba,        setFBomba]        = useState("");
  const [fDestTipo,     setFDestTipo]     = useState<"maquina" | "funcionario" | "livre">("maquina");
  const [fMaquina,      setFMaquina]      = useState("");
  const [fFuncionario,  setFFuncionario]  = useState("");
  const [fDestLivre,    setFDestLivre]    = useState("");
  const [fQuantidade,   setFQuantidade]   = useState("");
  const [fValUnit,      setFValUnit]      = useState("");
  const [fData,         setFData]         = useState(() => new Date().toISOString().split("T")[0]);
  const [fObs,          setFObs]          = useState("");
  const [fGerarCP,      setFGerarCP]      = useState(false);
  const [fVencimento,   setFVencimento]   = useState(() => new Date().toISOString().split("T")[0]);
  const [fHorimetro,    setFHorimetro]    = useState("");
  const [fAnoSafra,     setFAnoSafra]     = useState("");
  const [fCiclo,        setFCiclo]        = useState("");

  // ─── Carga inicial ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const idsConta = fazendaIds?.length ? fazendaIds : [fazendaId];
    // Bombas, máquinas e funcionários são do CLIENTE (todas as fazendas da conta), não da fazenda ativa
    const [b, m, f, fz] = await Promise.all([
      supabase.from("bombas_combustivel").select("*").in("fazenda_id", idsConta).order("nome")
        .then(({ data, error }) => { if (error) throw error; return (data ?? []) as BombaCombustivel[]; }),
      listarMaquinas(fazendaId),
      listarFuncionarios(idsConta),
      supabase.from("fazendas").select("id,nome").in("id", idsConta),
    ]);
    setFazNomes(new Map(((fz.data ?? []) as { id: string; nome: string }[]).map(x => [x.id, x.nome])));
    setBombas(b);
    setMaquinas(m);
    setFuncionarios(f);

    // Insumos de combustível cadastrados
    const { data: ins } = await supabase.from("insumos")
      .select("id, fazenda_id, nome, estoque, custo_medio, unidade")
      .in("fazenda_id", fazendaIds)
      .eq("categoria", "combustivel")
      .order("nome");
    setInsumos((ins ?? []) as InsumoCombo[]);

    // Histórico de abastecimentos
    const inicio = filtroMes + "-01";
    const fim    = filtroMes + "-31";
    const { data: hist } = await supabase.from("abastecimentos")
      .select(`
        *,
        bombas_combustivel(nome),
        maquinas(nome),
        funcionarios(nome),
        ciclos(descricao, cultura)
      `)
      .in("fazenda_id", fazendaIds)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    const normalizado: Abastecimento[] = (hist ?? []).map((r: Record<string, unknown>) => {
      const ciclo = r.ciclos as Record<string, string> | null;
      return {
        ...r,
        bomba_nome:       (r.bombas_combustivel as Record<string, string> | null)?.nome,
        maquina_nome:     (r.maquinas as Record<string, string> | null)?.nome,
        funcionario_nome: (r.funcionarios as Record<string, string> | null)?.nome,
        ciclo_nome:       ciclo ? [ciclo.cultura, ciclo.descricao].filter(Boolean).join(" · ") : undefined,
      };
    }) as Abastecimento[];

    setHistorico(filtroBomba ? normalizado.filter(h => h.bomba_id === filtroBomba) : normalizado);
    setLoading(false);
  }, [fazendaId, filtroMes, filtroBomba]);

  useEffect(() => { carregar(); }, [carregar]);

  // O combustível da bomba é o insumo da MESMA fazenda da bomba (o estoque é físico, por propriedade)
  const insumoDaBomba = (bomba: BombaCombustivel) => {
    const bate = (i: InsumoCombo) =>
      i.nome.toLowerCase().includes(bomba.combustivel.replace("_", " ").toLowerCase()) ||
      bomba.combustivel.includes(i.nome.toLowerCase().split(" ")[0]);
    return insumos.find(i => bate(i) && i.fazenda_id === bomba.fazenda_id) ?? insumos.find(bate);
  };

  // ─── Auto-fill custo médio + gerar CP ao selecionar bomba ────────────────────
  useEffect(() => {
    if (!fBomba) return;
    const bomba = bombas.find(b => b.id === fBomba);
    if (!bomba) return;
    const insumo = insumoDaBomba(bomba);
    if (insumo?.custo_medio) setFValUnit(String(insumo.custo_medio.toFixed(4)));
    // Auto-set fGerarCP based on bomb type
    if (bomba.consume_estoque === false) {
      setFGerarCP(true);
    } else {
      setFGerarCP(false);
    }
  }, [fBomba, bombas, insumos]);

  const valorTotal = (parseFloat(fQuantidade) || 0) * (parseFloat(fValUnit) || 0);
  const bombaSelecionada = bombas.find(b => b.id === fBomba);

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const totalLitrosMes  = historico.reduce((s, h) => s + h.quantidade_l, 0);
  const totalCustoMes   = historico.reduce((s, h) => s + h.valor_total, 0);
  const totalAbastMes   = historico.length;
  const litrosHoje      = historico
    .filter(h => h.data === new Date().toISOString().split("T")[0])
    .reduce((s, h) => s + h.quantidade_l, 0);

  // ─── Salvar abastecimento ────────────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    setErroModal("");

    const qtd  = parseFloat(fQuantidade);
    if (!fBomba)        return setErroModal("Selecione a bomba.");
    if (isNaN(qtd) || qtd <= 0) return setErroModal("Informe a quantidade em litros.");
    if (!fData)         return setErroModal("Informe a data.");

    const bomba = bombas.find(b => b.id === fBomba)!;

    // Para bomba interna usa custo_medio como fallback se não informado
    let vUnit = parseFloat(fValUnit);
    if (bomba.consume_estoque && (isNaN(vUnit) || vUnit <= 0)) {
      const insumo = insumos.find(i =>
        i.nome.toLowerCase().includes(bomba.combustivel.replace("_", " ").toLowerCase()) ||
        bomba.combustivel.includes(i.nome.toLowerCase().split(" ")[0])
      );
      if (insumo?.custo_medio) vUnit = insumo.custo_medio;
    }
    // Para POSTO (externo) valor/litro é obrigatório para gerar CP correto
    if (!bomba.consume_estoque && (isNaN(vUnit) || vUnit <= 0)) {
      return setErroModal("Informe o valor por litro para registrar a conta a pagar.");
    }
    if (isNaN(vUnit)) vUnit = 0;

    setSalvando(true);
    try {
      if (editando) {
        await salvarEdicao(editando, qtd, vUnit, bomba);
      } else {
        // Bomba interna: verifica estoque disponível; posto externo: sem controle de estoque
        if (bomba.consume_estoque && qtd > bomba.estoque_atual_l) {
          setSalvando(false);
          return setErroModal(`Estoque insuficiente na bomba. Disponível: ${fmtNum(bomba.estoque_atual_l)} L`);
        }
        await inserirNovo(qtd, vUnit, bomba);
      }
      fecharModal();
      await carregar();
    } catch (e) {
      setErroModal((e as Error).message);
    }
    setSalvando(false);
  }

  // Todas as escritas (abastecimento + baixa de estoque da bomba/insumo + CP
  // opcional) passam por /api/campo/abastecimento-acao, com service_role_key
  // — insert direto pelo navegador batia em "new row violates row-level
  // security policy" mesmo com a policy certa (JWT expirado na sessão,
  // mesmo padrão já resolvido em outras telas — ver lib/db.ts pattern).
  async function salvarEdicao(ab: Abastecimento, qtdNova: number, vUnit: number, bomba: BombaCombustivel) {
    if (!fazendaId) return;
    const horimetroVal = fHorimetro ? parseFloat(fHorimetro.replace(",", ".")) : null;
    const res = await fetch("/api/campo/abastecimento-acao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "editar", fazenda_id: fazendaId, abastecimento_id: ab.id,
        bomba_id: ab.bomba_id,
        destino_tipo: fDestTipo, maquina_id: fMaquina, funcionario_id: fFuncionario, destino_livre: fDestLivre,
        quantidade_l: qtdNova, valor_unitario: vUnit, data: fData, horimetro: horimetroVal,
        ano_safra_id: fAnoSafra, ciclo_id: fCiclo, observacao: fObs,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.erro ?? "Erro ao editar abastecimento");
  }

  async function inserirNovo(qtd: number, vUnit: number, bomba: BombaCombustivel) {
    if (!fazendaId) return;
    const fazBomba = bomba.fazenda_id || fazendaId;   // o abastecimento pertence à fazenda da bomba
    const horimetroVal = fHorimetro ? parseFloat(fHorimetro.replace(",", ".")) : null;
    const res = await fetch("/api/campo/abastecimento-acao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "criar", fazenda_id: fazBomba, bomba_id: fBomba,
        destino_tipo: fDestTipo, maquina_id: fMaquina, funcionario_id: fFuncionario, destino_livre: fDestLivre,
        destino_nome: nomeDestino(),
        quantidade_l: qtd, valor_unitario: vUnit, data: fData, horimetro: horimetroVal,
        ano_safra_id: fAnoSafra, ciclo_id: fCiclo, observacao: fObs,
        gerar_cp: fGerarCP, vencimento: fVencimento, comb_label: COMB_LABEL[bomba.combustivel] ?? bomba.combustivel,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.erro ?? "Erro ao registrar abastecimento");
  }

  function nomeDestino(): string {
    if (fDestTipo === "maquina")     return maquinas.find(m => m.id === fMaquina)?.nome ?? fMaquina;
    if (fDestTipo === "funcionario") return funcionarios.find(f => f.id === fFuncionario)?.nome ?? fFuncionario;
    return fDestLivre || "—";
  }

  // ─── Excluir abastecimento em cascata ─────────────────────────────────────
  async function excluir(ab: Abastecimento) {
    const dataFmt = new Date(ab.data + "T12:00").toLocaleDateString("pt-BR");
    const linhas = [`Excluir abastecimento de ${fmtNum(ab.quantidade_l, 0)} L em ${dataFmt}?`, ""];
    if (ab.lancamento_id) linhas.push("• Conta a Pagar vinculada será excluída");
    linhas.push("• Pendência fiscal será excluída (se existir)");
    linhas.push("• Estoque da bomba será restaurado");
    linhas.push("", "Esta ação não pode ser desfeita.");
    if (!confirm(linhas.join("\n"))) return;

    // 1. Pendências fiscais — por abastecimento_id (cascade) ou lancamento_id (legado)
    await supabase.from("pendencias_fiscais").delete().eq("abastecimento_id", ab.id);
    if (ab.lancamento_id) {
      await supabase.from("pendencias_fiscais").delete().eq("lancamento_id", ab.lancamento_id);
      // 2. Lançamento (CP)
      await supabase.from("lancamentos").delete().eq("id", ab.lancamento_id);
    }

    // 3. Restaurar estoque da bomba (apenas bombas internas com estoque)
    if (ab.bomba_id) {
      const bomba = bombas.find(b => b.id === ab.bomba_id);
      if (bomba && bomba.consume_estoque !== false) {
        await supabase.from("bombas_combustivel")
          .update({ estoque_atual_l: bomba.estoque_atual_l + ab.quantidade_l })
          .eq("id", ab.bomba_id);
        setBombas(prev => prev.map(b =>
          b.id === ab.bomba_id ? { ...b, estoque_atual_l: b.estoque_atual_l + ab.quantidade_l } : b
        ));
      }
    }

    // 4. Excluir abastecimento
    await supabase.from("abastecimentos").delete().eq("id", ab.id);
    setHistorico(prev => prev.filter(h => h.id !== ab.id));
  }

  function abrirModal() {
    setEditando(null);
    setFBomba(""); setFDestTipo("maquina"); setFMaquina(""); setFFuncionario(""); setFDestLivre("");
    setFQuantidade(""); setFValUnit(""); setFObs(""); setFHorimetro(""); setFGerarCP(false);
    setFAnoSafra(""); setFCiclo("");
    setFData(new Date().toISOString().split("T")[0]);
    setFVencimento(new Date().toISOString().split("T")[0]);
    setErroModal(""); setModal(true);
  }

  function abrirEditar(ab: Abastecimento) {
    setEditando(ab);
    setFBomba(ab.bomba_id);
    if (ab.maquina_id) { setFDestTipo("maquina"); setFMaquina(ab.maquina_id); setFFuncionario(""); setFDestLivre(""); }
    else if (ab.funcionario_id) { setFDestTipo("funcionario"); setFFuncionario(ab.funcionario_id); setFMaquina(""); setFDestLivre(""); }
    else { setFDestTipo("livre"); setFDestLivre(ab.destino_livre ?? ""); setFMaquina(""); setFFuncionario(""); }
    setFQuantidade(String(ab.quantidade_l));
    setFValUnit(String(ab.valor_unitario));
    setFData(ab.data);
    setFHorimetro(ab.horimetro != null ? String(ab.horimetro) : "");
    setFAnoSafra(ab.ano_safra_id ?? "");
    setFCiclo(ab.ciclo_id ?? "");
    setFObs(ab.observacao ?? "");
    setFGerarCP(!!ab.lancamento_id);
    setFVencimento(ab.data);
    setErroModal(""); setModal(true);
  }

  function fecharModal() { setModal(false); setSalvando(false); setEditando(null); }

  return (
    <>
      <TopNav />
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "28px 32px", background: "var(--bg-page)", minHeight: "100vh" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Abastecimento de Máquinas</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Consumo de combustível das bombas da fazenda — dedução de estoque e custo</p>
          </div>
          <button
            onClick={abrirModal}
            style={{ padding: "9px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            + Registrar Abastecimento
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Litros Hoje",        valor: fmtNum(litrosHoje, 0) + " L",   sub: "consumo no dia",         cor: "#111111", bg: "#EAF3FB" },
            { label: "Litros no Mês",      valor: fmtNum(totalLitrosMes, 0) + " L", sub: filtroMes,              cor: "#166534", bg: "#DCFCE7" },
            { label: "Custo no Mês",       valor: fmtBRL(totalCustoMes),           sub: "a pagar / pago",        cor: "#9D4900", bg: "#FFF4E5" },
            { label: "Abastecimentos",     valor: String(totalAbastMes),           sub: "no período",            cor: "var(--text-2)",   bg: "#F3F4F6" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, padding: "16px 20px", border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.valor}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Estoque das bombas */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 14 }}>Bombas e Tanques — Estoque Atual</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {bombas.length === 0 && (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>Nenhuma bomba cadastrada. Acesse Cadastros → Combustíveis & Bombas.</div>
            )}
            {bombas.map(b => {
              const pct = b.capacidade_l ? Math.round((b.estoque_atual_l / b.capacidade_l) * 100) : null;
              const [cbg, ccl] = COMB_COR[b.combustivel] ?? ["#F1EFE8", "var(--text-2)"];
              const baixo = pct !== null && pct < 20;
              return (
                <div key={b.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px", background: baixo ? "#FFF4E5" : "#FAFBFC" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{b.nome}<span style={{ fontWeight: 400, color: "var(--text-3)" }}>{sufFaz(b.fazenda_id)}</span></div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: cbg, color: ccl, fontWeight: 600 }}>
                      {COMB_LABEL[b.combustivel] ?? b.combustivel}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: baixo ? "#9D4900" : "#111111" }}>
                    {fmtNum(b.estoque_atual_l, 0)} L
                  </div>
                  {b.capacidade_l && (
                    <>
                      <div style={{ margin: "8px 0 4px", height: 6, background: "var(--bg-tag)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: baixo ? "#EF9F27" : "#111111", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>{pct}% de {fmtNum(b.capacidade_l, 0)} L</div>
                    </>
                  )}
                  {baixo && <div style={{ fontSize: 11, color: "#9D4900", fontWeight: 600, marginTop: 4 }}>⚠ Nível baixo</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Filtros do histórico */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="month"
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            style={{ ...inp, width: 160 }}
          />
          <select
            value={filtroBomba}
            onChange={e => setFiltroBomba(e.target.value)}
            style={{ ...inp, width: 200 }}
          >
            <option value="">Todas as bombas</option>
            {bombas.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>
            {historico.length} registro{historico.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Tabela de histórico */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando...</div>
          ) : historico.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              Nenhum abastecimento no período selecionado.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border)" }}>
                  {["Data", "Bomba / Combustível", "Veículo / Máquina", "Safra / Ciclo", "Km / Horas", "Litros", "Valor/L", "Total", "CP", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historico.map((h, idx) => {
                  const bomba = bombas.find(b => b.id === h.bomba_id);
                  const [cbg, ccl] = COMB_COR[bomba?.combustivel ?? ""] ?? ["#F1EFE8", "var(--text-2)"];
                  const destino = h.maquina_nome ?? h.funcionario_nome ?? h.destino_livre ?? "—";
                  return (
                    <tr key={h.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>
                        {new Date(h.data + "T12:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>
                        <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{h.bomba_nome ?? "—"}</div>
                        {bomba && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: cbg, color: ccl, fontWeight: 600 }}>
                            {COMB_LABEL[bomba.combustivel]}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-2)" }}>{destino}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-3)" }}>{h.ciclo_nome ?? "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                        {h.horimetro != null ? fmtNum(h.horimetro, 1) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#111111", whiteSpace: "nowrap" }}>
                        {fmtNum(h.quantidade_l, 0)} L
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                        {fmtBRL(h.valor_unitario)}/L
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>
                        {fmtBRL(h.valor_total)}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>
                        {h.lancamento_id ? (
                          <span style={{ background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>Gerado</span>
                        ) : (
                          <span style={{ background: "#F3F4F6", color: "var(--text-3)", padding: "2px 8px", borderRadius: 8 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => abrirEditar(h)}
                            title="Editar abastecimento"
                            style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 13, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#EAF3FB"; (e.currentTarget as HTMLButtonElement).style.color = "#111111"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#B8D0EE"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                          >
                            ✏
                          </button>
                          <button
                            onClick={() => excluir(h)}
                            title="Excluir abastecimento (e CP/pendência vinculados)"
                            style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 13, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#FEE2E2"; (e.currentTarget as HTMLButtonElement).style.color = "#991B1B"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#FCA5A5"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg-card)", borderTop: "0.5px solid var(--border)" }}>
                  <td colSpan={5} style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Total do período</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#111111" }}>{fmtNum(totalLitrosMes, 0)} L</td>
                  <td style={{ padding: "10px 14px" }} />
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{fmtBRL(totalCustoMes)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

      </div>

      {/* ── Modal de lançamento ─────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "0.5px solid var(--bg-tag)" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{editando ? "Editar Abastecimento" : "Registrar Abastecimento"}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{editando ? "Atualize os dados do abastecimento" : "Consumo da bomba da fazenda"}</div>
              </div>
              <button onClick={fecharModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Bomba */}
              <div>
                <label style={lbl}>Bomba / Tanque *</label>
                {editando ? (
                  <div style={{ ...inp, background: "var(--bg-card)", color: "var(--text-2)", cursor: "default" }}>
                    {bombaSelecionada?.nome ?? editando.bomba_nome ?? "—"}
                    {bombaSelecionada && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-3)" }}>({COMB_LABEL[bombaSelecionada.combustivel] ?? bombaSelecionada.combustivel})</span>}
                  </div>
                ) : (
                  <select
                    value={fBomba}
                    onChange={e => setFBomba(e.target.value)}
                    style={inp}
                  >
                    <option value="">Selecione a bomba...</option>
                    {bombas.filter(b => b.ativa).map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nome}{sufFaz(b.fazenda_id)} — {COMB_LABEL[b.combustivel]} · {fmtNum(b.estoque_atual_l, 0)} L disponíveis
                      </option>
                    ))}
                  </select>
                )}
                {bombaSelecionada && !editando && (
                  <div style={{ marginTop: 6, padding: "8px 12px", background: "#F0F8FF", borderRadius: 8, fontSize: 12, color: "#0D0D0D" }}>
                    <strong>Estoque atual:</strong> {fmtNum(bombaSelecionada.estoque_atual_l, 0)} L
                    {bombaSelecionada.capacidade_l && ` de ${fmtNum(bombaSelecionada.capacidade_l, 0)} L`}
                    {bombaSelecionada.estoque_atual_l < 100 && <span style={{ color: "#9D4900", fontWeight: 600 }}> — ⚠ Nível baixo</span>}
                  </div>
                )}
                {/* Info badge: tipo de bomba */}
                {bombaSelecionada && (
                  bombaSelecionada.consume_estoque === false ? (
                    <div style={{ marginTop: 6, padding: "7px 12px", background: "#FFF8E1", border: "0.5px solid #FFD54F", borderRadius: 8, fontSize: 12, color: "#7B4A00", fontWeight: 600 }}>
                      ⛽ Posto externo — gera Conta a Pagar
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, padding: "7px 12px", background: "#EAF3FB", border: "0.5px solid #B8D0EE", borderRadius: 8, fontSize: 12, color: "#0D0D0D", fontWeight: 600 }}>
                      🏠 Bomba interna — custo pelo estoque, sem CP novo
                    </div>
                  )
                )}
              </div>

              {/* Destino */}
              <div>
                <label style={lbl}>Destino do Combustível *</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {(["maquina", "funcionario", "livre"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFDestTipo(t)}
                      style={{
                        padding: "5px 14px", borderRadius: 8, border: "0.5px solid",
                        fontSize: 12, cursor: "pointer", fontWeight: fDestTipo === t ? 600 : 400,
                        borderColor: fDestTipo === t ? "#111111" : "var(--border-table)",
                        background: fDestTipo === t ? "#E8E8E8" : "var(--bg-card)",
                        color: fDestTipo === t ? "#0D0D0D" : "var(--text-2)",
                      }}
                    >
                      {t === "maquina" ? "Máquina" : t === "funcionario" ? "Funcionário" : "Outro"}
                    </button>
                  ))}
                </div>
                {fDestTipo === "maquina" && (
                  <SelectBusca
                    value={fMaquina}
                    onChange={setFMaquina}
                    options={maquinas.filter(m => m.ativa).map(m => ({ value: m.id, label: `${m.nome} — ${m.tipo}` }))}
                    placeholder="Selecione a máquina..."
                    style={inp}
                  />
                )}
                {fDestTipo === "funcionario" && (
                  <select value={fFuncionario} onChange={e => setFFuncionario(e.target.value)} style={inp}>
                    <option value="">Selecione o funcionário...</option>
                    {funcionarios.filter(f => f.ativo).map(f => (
                      <option key={f.id} value={f.id}>{f.nome} — {f.funcao ?? f.tipo}</option>
                    ))}
                  </select>
                )}
                {fDestTipo === "livre" && (
                  <input
                    placeholder="Ex: Caminhão terceiro, Gerador, Irrigação..."
                    value={fDestLivre}
                    onChange={e => setFDestLivre(e.target.value)}
                    style={inp}
                  />
                )}
              </div>

              {/* Safra / Ciclo — pra separar custo de combustível por safra no DRE/Orçamento */}
              <div>
                <label style={lbl}>Safra / Ciclo</label>
                <CascadeSelector
                  contaId={contaId}
                  fazendaIdFallback={fazendaId}
                  levels={["anoSafra", "ciclo"]}
                  values={{ fazendaId: fazendaId ?? "", anoSafraId: fAnoSafra, cicloId: fCiclo }}
                  onChange={next => { setFAnoSafra(next.anoSafraId ?? ""); setFCiclo(next.cicloId ?? ""); }}
                />
              </div>

              {/* Data + Quantidade + Valor */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Data *</label>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Quantidade (L) *</label>
                  <InputNumerico
                    min="0" placeholder="0,00"
                    value={fQuantidade} onChange={v => setFQuantidade(v)} style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Valor por Litro (R$) *</label>
                  <InputNumerico
                    decimais={4} min="0" placeholder="6,0000"
                    value={fValUnit} onChange={v => setFValUnit(v)} style={inp}
                  />
                </div>
              </div>

              {/* Horímetro / Odômetro */}
              <div>
                <label style={lbl}>
                  {fDestTipo === "maquina"
                    ? (maquinas.find(m => m.id === fMaquina)?.tipo === "caminhao" ? "Odômetro (km)" : "Horímetro (h)")
                    : "Odômetro / Horímetro"}
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <InputNumerico
                    min="0"
                    placeholder={fDestTipo === "maquina" && maquinas.find(m => m.id === fMaquina)?.tipo === "caminhao"
                      ? "Ex: 12.450 km" : "Ex: 4.320 h"}
                    value={fHorimetro}
                    onChange={v => setFHorimetro(v)}
                    style={{ ...inp, maxWidth: 220 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {fDestTipo === "maquina" && maquinas.find(m => m.id === fMaquina)?.tipo === "caminhao" ? "km" : "h"}
                    {" "}— opcional, para controle de manutenção
                  </span>
                </div>
              </div>

              {/* Valor total calculado */}
              {valorTotal > 0 && (
                <div style={{ background: "#F0F8FF", border: "0.5px solid #B8D0EE", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "var(--text-2)" }}>Valor Total</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#0D0D0D" }}>{fmtBRL(valorTotal)}</span>
                </div>
              )}

              {/* Gerar CP */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={fGerarCP}
                    onChange={e => setFGerarCP(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600, color: "var(--text-1)" }}>Gerar Conta a Pagar</span>
                  <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(lança no financeiro)</span>
                </label>
                {fGerarCP && (
                  <div>
                    <label style={lbl}>Vencimento do CP</label>
                    <input type="date" value={fVencimento} onChange={e => setFVencimento(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
                  </div>
                )}
              </div>

              {/* Observação */}
              <div>
                <label style={lbl}>Observação</label>
                <input
                  placeholder="Ex: Abasteceu no campo Sul, hodômetro 12.450 km..."
                  value={fObs}
                  onChange={e => setFObs(e.target.value)}
                  style={inp}
                />
              </div>

              {erroModal && (
                <div style={{ padding: "9px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13, border: "0.5px solid #FCA5A5" }}>
                  {erroModal}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={fecharModal} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-card)", fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}>
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando}
                  style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: salvando ? "var(--text-muted)" : "#111111", color: "#fff", fontSize: 13, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}
                >
                  {salvando ? "Salvando..." : editando ? "✓ Salvar Alterações" : "✓ Confirmar Abastecimento"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
