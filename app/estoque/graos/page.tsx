"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarFazendasDaConta } from "../../../lib/db";

type Aba = "posicao" | "movimentacoes" | "quebra" | "qualidade" | "config";

type Deposito  = { id: string; nome: string; tipo: string };
type AnoSafra  = { id: string; descricao: string };
type Ciclo     = { id: string; cultura: string; ano_safra_id?: string };

// Configuração de quebra técnica
type QuebConfig = {
  id?:           string;
  produto:       string | null;   // null = todos os produtos
  tipo_deposito: string;          // "armazem_fazenda" | "todos"
  quebra_pct:    number;
  observacao:    string;
};

type PosicaoRow = {
  produto:        string;
  deposito_id:    string | null;
  deposito_nome:  string;
  tipo_deposito:  string;
  entradas_sc:    number;
  quebra_sc:      number;     // calculada pela config
  saidas_sc:      number;
  saldo_sc:       number;
  saldo_kg:       number;
};

type MovRow = {
  id:      string;
  data:    string;
  produto: string;
  deposito:string;
  tipo:    "entrada" | "saida" | "quebra";
  origem:  string;
  sacas:   number;
  kg:      number;
  ciclo:   string;
};

type QuebRow = {
  id:         string;
  data:       string;
  ticket:     string;
  produto:    string;
  deposito:   string;
  tipo_dep:   string;
  pl_kg:      number;
  class_kg:   number;
  quebra_kg:  number;
  quebra_pct: number;
  config_pct: number;   // quebra configurada aplicada
  umid:       number | null;
  imp:        number | null;
  avar:       number | null;
};

type QualRow = {
  id:         string;
  data:       string;
  ticket:     string;
  produto:    string;
  deposito:   string;
  umidade_pct:number | null;
  imp_pct:    number | null;
  avar_pct:   number | null;
  ardidos_pct:number | null;
  ph_hl:      number | null;
  sacas:      number | null;
};

const fmt = (n: number, dec = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtDate = (d: string) => d ? d.split("-").reverse().join("/") : "—";

const TABS: { k: Aba; label: string }[] = [
  { k: "posicao",       label: "Posição Atual"  },
  { k: "movimentacoes", label: "Movimentações"  },
  { k: "quebra",        label: "Quebra Técnica" },
  { k: "qualidade",     label: "Qualidade"      },
  { k: "config",        label: "Configuração"   },
];

const TIPO_DEP_OPS = [
  { v: "armazem_fazenda", label: "Armazém Próprio" },
  { v: "armazem_terceiro", label: "Armazém de Terceiro" },
  { v: "todos", label: "Todos os tipos" },
];

const th: React.CSSProperties = { padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: "var(--text-1)", borderBottom: "0.5px solid var(--border-table)" };
const tdr: React.CSSProperties = { ...td, textAlign: "right" };
const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", outline: "none" };

function semaforo(val: number | null, warn: number, err: number) {
  if (val === null) return "#888";
  return val >= err ? "#E24B4A" : val >= warn ? "#EF9F27" : "#16A34A";
}

function BadgeTipo({ tipo }: { tipo: "entrada" | "saida" | "quebra" }) {
  const MAP = {
    entrada: { bg: "#DCFCE7", cl: "#166534", label: "Entrada" },
    saida:   { bg: "#FEE2E2", cl: "#991B1B", label: "Saída"   },
    quebra:  { bg: "#FEF3C7", cl: "#92400E", label: "Quebra"  },
  };
  const s = MAP[tipo];
  return <span style={{ background: s.bg, color: s.cl, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function EstoqueGraosPage() {
  const { fazendaId, contaId } = useAuth();
  // Fazenda de trabalho — seletor explícito no topo da página; fazendaId é
  // só o hint inicial, nunca uma restrição (não existe "fazenda ativa").
  const [fazendasConta, setFazendasConta] = useState<{ id: string; nome: string }[]>([]);
  const [fazTrabalho, setFazTrabalho] = useState<string>("");
  useEffect(() => {
    if (!fazendaId && !contaId) return;
    listarFazendasDaConta(contaId, fazendaId).then(fzs => {
      setFazendasConta(fzs.map(f => ({ id: f.id!, nome: f.nome })));
      setFazTrabalho(prev => prev || fazendaId || (fzs[0]?.id ?? ""));
    }).catch(() => {});
  }, [fazendaId, contaId]);
  const fazAtiva = fazTrabalho || fazendaId || "";
  const [aba, setAba] = useState<Aba>("posicao");
  const [carregando, setCarregando] = useState(false);

  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [ciclos,    setCiclos]    = useState<Ciclo[]>([]);
  const [quebConfig, setQuebConfig] = useState<QuebConfig[]>([]);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Formulário nova config
  const [cfProduto,   setCfProduto]   = useState("");
  const [cfTipoDep,   setCfTipoDep]   = useState("armazem_fazenda");
  const [cfQuebraPct, setCfQuebraPct] = useState("2.0");
  const [cfObs,       setCfObs]       = useState("");

  // Dados tabulados
  const [posicao,    setPosicao]   = useState<PosicaoRow[]>([]);
  const [movs,       setMovs]      = useState<MovRow[]>([]);
  const [quebra,     setQuebra]    = useState<QuebRow[]>([]);
  const [qualidade,  setQualidade] = useState<QualRow[]>([]);

  // Filtros globais
  const [fAno,       setFAno]       = useState("");
  const [fCiclo,     setFCiclo]     = useState("");
  const [fDeposito,  setFDeposito]  = useState("");
  const [fMovTipo,   setFMovTipo]   = useState<"" | "entrada" | "saida" | "quebra">("");
  const [fProduto,   setFProduto]   = useState("");

  const ciclosFiltrados = fAno ? ciclos.filter(c => c.ano_safra_id === fAno) : ciclos;

  // Função utilitária: encontra a quebra% configurada para um produto+tipo
  const getQuebraPct = useCallback((produto: string, tipoDep: string): number => {
    // busca específica (produto + tipo)
    const exato = quebConfig.find(c =>
      c.produto?.toLowerCase() === produto.toLowerCase() &&
      (c.tipo_deposito === tipoDep || c.tipo_deposito === "todos")
    );
    if (exato) return exato.quebra_pct;
    // busca genérica (null produto = todos)
    const generico = quebConfig.find(c =>
      c.produto === null &&
      (c.tipo_deposito === tipoDep || c.tipo_deposito === "todos")
    );
    if (generico) return generico.quebra_pct;
    return 0;
  }, [quebConfig]);

  // ── Carga base ──────────────────────────────────────────────────────────────
  const carregarBase = useCallback(async () => {
    if (!fazAtiva) return;
    const [{ data: dep }, { data: anos }, { data: cic }, { data: cfg }] = await Promise.all([
      supabase.from("depositos").select("id, nome, tipo").eq("fazenda_id", fazAtiva).order("nome"),
      supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", fazAtiva).order("descricao", { ascending: false }),
      supabase.from("ciclos").select("id, cultura, ano_safra_id").eq("fazenda_id", fazAtiva).order("created_at", { ascending: false }),
      supabase.from("parametros_armazenagem").select("*").eq("fazenda_id", fazAtiva).order("created_at"),
    ]);
    setDepositos((dep ?? []) as Deposito[]);
    setAnosSafra((anos ?? []) as AnoSafra[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setQuebConfig((cfg ?? []) as QuebConfig[]);
  }, [fazAtiva]);

  // ── Posição ─────────────────────────────────────────────────────────────────
  const carregarPosicao = useCallback(async () => {
    if (!fazAtiva) return;
    setCarregando(true);

    const cicloIds = fCiclo ? [fCiclo]
      : fAno ? ciclos.filter(c => c.ano_safra_id === fAno).map(c => c.id)
      : [];

    const colQ = supabase.from("colheitas")
      .select("produto, deposito_id, total_sacas, total_kg_classificado")
      .eq("fazenda_id", fazAtiva);
    if (cicloIds.length) colQ.in("ciclo_id", cicloIds);
    const { data: colheitas } = await colQ;

    const romQ = supabase.from("romaneios_entrada")
      .select("produto_nome, deposito_id, sacas, peso_classificado_kg")
      .eq("fazenda_id", fazAtiva)
      .eq("status", "confirmado")
      .eq("tipo", "proprio");
    if (cicloIds.length) romQ.in("ciclo_id", cicloIds);
    const { data: romaneios } = await romQ;

    const ctQ = supabase.from("contratos")
      .select("produto_agricola_id, entregue_sc, insumo:produto_agricola_id(nome)")
      .eq("fazenda_id", fazAtiva)
      .eq("tipo", "venda")
      .gt("entregue_sc", 0);
    if (cicloIds.length) ctQ.in("ciclo_id", cicloIds);
    const { data: contratos } = await ctQ;

    const depNome = (id: string | null) => depositos.find(d => d.id === id)?.nome ?? "Sem depósito";
    const depTipo = (id: string | null) => depositos.find(d => d.id === id)?.tipo ?? "";
    const key = (prod: string, dep: string | null) => `${prod.toLowerCase().trim()}||${dep ?? "_"}`;

    const mapa: Record<string, PosicaoRow> = {};

    for (const col of (colheitas ?? [])) {
      const prod = col.produto ?? "Grão";
      const k = key(prod, col.deposito_id);
      if (!mapa[k]) mapa[k] = { produto: prod, deposito_id: col.deposito_id, deposito_nome: depNome(col.deposito_id), tipo_deposito: depTipo(col.deposito_id), entradas_sc: 0, quebra_sc: 0, saidas_sc: 0, saldo_sc: 0, saldo_kg: 0 };
      mapa[k].entradas_sc += col.total_sacas ?? 0;
      mapa[k].saldo_kg    += col.total_kg_classificado ?? 0;
    }

    for (const rom of (romaneios ?? [])) {
      const prod = rom.produto_nome ?? "Grão";
      const k = key(prod, rom.deposito_id);
      if (!mapa[k]) mapa[k] = { produto: prod, deposito_id: rom.deposito_id, deposito_nome: depNome(rom.deposito_id), tipo_deposito: depTipo(rom.deposito_id), entradas_sc: 0, quebra_sc: 0, saidas_sc: 0, saldo_sc: 0, saldo_kg: 0 };
      mapa[k].entradas_sc += rom.sacas ?? 0;
      mapa[k].saldo_kg    += rom.peso_classificado_kg ?? (rom.sacas ?? 0) * 60;
    }

    // Aplica quebra técnica configurada por produto+tipo de depósito
    for (const row of Object.values(mapa)) {
      const pct = getQuebraPct(row.produto, row.tipo_deposito);
      if (pct > 0) {
        row.quebra_sc = +(row.entradas_sc * pct / 100).toFixed(3);
      }
    }

    // Distribui saídas de contratos proporcionalmente (sem deposito_id nas saídas)
    const saidaPorProduto: Record<string, number> = {};
    for (const ct of (contratos ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prod = (ct.insumo as any)?.nome ?? "";
      if (prod) saidaPorProduto[prod.toLowerCase().trim()] = (saidaPorProduto[prod.toLowerCase().trim()] ?? 0) + (ct.entregue_sc ?? 0);
    }

    // Distribui as saídas pelos depósitos onde esse produto existe, proporcionalmente
    for (const row of Object.values(mapa)) {
      const prodKey = row.produto.toLowerCase().trim();
      const totalEntradas = Object.values(mapa)
        .filter(r => r.produto.toLowerCase().trim() === prodKey)
        .reduce((s, r) => s + r.entradas_sc, 0);
      if (totalEntradas > 0 && saidaPorProduto[prodKey]) {
        const proporcao = row.entradas_sc / totalEntradas;
        row.saidas_sc = +(saidaPorProduto[prodKey] * proporcao).toFixed(3);
      }
    }

    for (const row of Object.values(mapa)) {
      row.saldo_sc = row.entradas_sc - row.quebra_sc - row.saidas_sc;
    }

    let rows = Object.values(mapa);
    if (fDeposito) rows = rows.filter(r => r.deposito_id === fDeposito);
    if (fProduto)  rows = rows.filter(r => r.produto.toLowerCase().includes(fProduto.toLowerCase()));
    rows.sort((a, b) => a.produto.localeCompare(b.produto) || a.deposito_nome.localeCompare(b.deposito_nome));
    setPosicao(rows);
    setCarregando(false);
  }, [fazAtiva, fAno, fCiclo, fDeposito, fProduto, ciclos, depositos, getQuebraPct]);

  // ── Movimentações ────────────────────────────────────────────────────────────
  const carregarMovs = useCallback(async () => {
    if (!fazAtiva) return;
    setCarregando(true);

    const cicloIds = fCiclo ? [fCiclo]
      : fAno ? ciclos.filter(c => c.ano_safra_id === fAno).map(c => c.id)
      : [];
    const depNome = (id: string | null) => depositos.find(d => d.id === id)?.nome ?? "—";
    const depTipo = (id: string | null) => depositos.find(d => d.id === id)?.tipo ?? "";
    const cicloLabel = (id: string | null) => ciclos.find(c => c.id === id)?.cultura ?? "";
    const resultado: MovRow[] = [];

    if (!fMovTipo || fMovTipo === "entrada") {
      const q = supabase.from("romaneios_entrada")
        .select("id, data, produto_nome, deposito_id, sacas, peso_classificado_kg, ciclo_id")
        .eq("fazenda_id", fazAtiva).eq("status", "confirmado").eq("tipo", "proprio")
        .order("data", { ascending: false }).limit(200);
      if (cicloIds.length) q.in("ciclo_id", cicloIds);
      const { data: roms } = await q;
      for (const r of (roms ?? [])) {
        const prod = r.produto_nome ?? "Grão";
        if (fProduto && !prod.toLowerCase().includes(fProduto.toLowerCase())) continue;
        resultado.push({ id: r.id, data: r.data, produto: prod, deposito: depNome(r.deposito_id), tipo: "entrada", origem: "romaneio", sacas: r.sacas ?? 0, kg: r.peso_classificado_kg ?? (r.sacas ?? 0) * 60, ciclo: cicloLabel(r.ciclo_id) });
        // Gera linha de quebra técnica se configurada
        const pct = getQuebraPct(prod, depTipo(r.deposito_id));
        if (pct > 0 && (r.sacas ?? 0) > 0) {
          const quebraSc = +((r.sacas ?? 0) * pct / 100).toFixed(3);
          resultado.push({ id: r.id + "_qb", data: r.data, produto: prod, deposito: depNome(r.deposito_id), tipo: "quebra", origem: `Quebra técnica (${pct}%)`, sacas: quebraSc, kg: quebraSc * 60, ciclo: cicloLabel(r.ciclo_id) });
        }
      }
    }

    if (!fMovTipo || fMovTipo === "entrada") {
      const q = supabase.from("colheitas")
        .select("id, data_colheita, produto, deposito_id, total_sacas, total_kg_classificado, ciclo_id")
        .eq("fazenda_id", fazAtiva).order("data_colheita", { ascending: false }).limit(200);
      if (cicloIds.length) q.in("ciclo_id", cicloIds);
      const { data: cols } = await q;
      for (const c of (cols ?? [])) {
        const prod = c.produto ?? "Grão";
        if (fProduto && !prod.toLowerCase().includes(fProduto.toLowerCase())) continue;
        resultado.push({ id: c.id, data: c.data_colheita, produto: prod, deposito: depNome(c.deposito_id), tipo: "entrada", origem: "colheita", sacas: c.total_sacas ?? 0, kg: c.total_kg_classificado ?? 0, ciclo: cicloLabel(c.ciclo_id) });
        const pct = getQuebraPct(prod, depTipo(c.deposito_id));
        if (pct > 0 && (c.total_sacas ?? 0) > 0) {
          const quebraSc = +((c.total_sacas ?? 0) * pct / 100).toFixed(3);
          resultado.push({ id: c.id + "_qb", data: c.data_colheita, produto: prod, deposito: depNome(c.deposito_id), tipo: "quebra", origem: `Quebra técnica (${pct}%)`, sacas: quebraSc, kg: quebraSc * 60, ciclo: cicloLabel(c.ciclo_id) });
        }
      }
    }

    if (!fMovTipo || fMovTipo === "saida") {
      const q = supabase.from("contratos")
        .select("id, data_entrega, entregue_sc, ciclo_id, insumo:produto_agricola_id(nome)")
        .eq("fazenda_id", fazAtiva).eq("tipo", "venda").gt("entregue_sc", 0)
        .order("data_entrega", { ascending: false }).limit(200);
      if (cicloIds.length) q.in("ciclo_id", cicloIds);
      const { data: cts } = await q;
      for (const c of (cts ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prod = (c.insumo as any)?.nome ?? "Produto";
        if (fProduto && !prod.toLowerCase().includes(fProduto.toLowerCase())) continue;
        resultado.push({ id: c.id, data: c.data_entrega ?? "", produto: prod, deposito: "—", tipo: "saida", origem: "contrato", sacas: c.entregue_sc ?? 0, kg: (c.entregue_sc ?? 0) * 60, ciclo: cicloLabel(c.ciclo_id) });
      }
    }

    if (fMovTipo === "quebra") {
      // Filtra só quebras
      resultado.push(...resultado.filter(m => m.tipo === "quebra"));
    }

    resultado.sort((a, b) => b.data.localeCompare(a.data));
    setMovs(fMovTipo === "quebra" ? resultado.filter(m => m.tipo === "quebra") : resultado);
    setCarregando(false);
  }, [fazAtiva, fAno, fCiclo, fMovTipo, fProduto, ciclos, depositos, getQuebraPct]);

  // ── Quebra Técnica ────────────────────────────────────────────────────────────
  const carregarQuebra = useCallback(async () => {
    if (!fazAtiva) return;
    setCarregando(true);

    const cicloIds = fCiclo ? [fCiclo]
      : fAno ? ciclos.filter(c => c.ano_safra_id === fAno).map(c => c.id)
      : [];
    const depNome = (id: string | null) => depositos.find(d => d.id === id)?.nome ?? "—";
    const depTipo = (id: string | null) => depositos.find(d => d.id === id)?.tipo ?? "";

    const q = supabase.from("romaneios_entrada")
      .select("id, data, ticket_numero, produto_nome, deposito_id, peso_liquido_kg, peso_classificado_kg, umidade_pct, impureza_pct, avariados_pct, sacas")
      .eq("fazenda_id", fazAtiva).eq("status", "confirmado")
      .order("data", { ascending: false }).limit(300);
    if (cicloIds.length) q.in("ciclo_id", cicloIds);
    const { data: roms } = await q;

    const rows: QuebRow[] = (roms ?? [])
      .filter(r => {
        const pl = r.peso_liquido_kg ?? 0;
        if (pl <= 0 && (r.sacas ?? 0) <= 0) return false;
        if (fProduto && !r.produto_nome?.toLowerCase().includes(fProduto.toLowerCase())) return false;
        return true;
      })
      .map(r => {
        const pl = r.peso_liquido_kg ?? (r.sacas ?? 0) * 60;
        const cls = r.peso_classificado_kg ?? pl;
        const qbr = pl - cls;
        const tipDep = depTipo(r.deposito_id);
        const configPct = getQuebraPct(r.produto_nome ?? "", tipDep);
        return {
          id: r.id, data: r.data, ticket: r.ticket_numero ?? "—",
          produto: r.produto_nome ?? "Grão", deposito: depNome(r.deposito_id), tipo_dep: tipDep,
          pl_kg: pl, class_kg: cls, quebra_kg: qbr,
          quebra_pct: pl > 0 ? (qbr / pl) * 100 : 0,
          config_pct: configPct,
          umid: r.umidade_pct ?? null, imp: r.impureza_pct ?? null, avar: r.avariados_pct ?? null,
        };
      });

    setQuebra(rows);
    setCarregando(false);
  }, [fazAtiva, fAno, fCiclo, fProduto, ciclos, depositos, getQuebraPct]);

  // ── Qualidade ─────────────────────────────────────────────────────────────────
  const carregarQualidade = useCallback(async () => {
    if (!fazAtiva) return;
    setCarregando(true);

    const cicloIds = fCiclo ? [fCiclo]
      : fAno ? ciclos.filter(c => c.ano_safra_id === fAno).map(c => c.id)
      : [];
    const depNome = (id: string | null) => depositos.find(d => d.id === id)?.nome ?? "—";

    const q = supabase.from("romaneios_entrada")
      .select("id, data, ticket_numero, produto_nome, deposito_id, umidade_pct, impureza_pct, avariados_pct, ardidos_pct, ph_hl, sacas")
      .eq("fazenda_id", fazAtiva).eq("status", "confirmado").not("umidade_pct", "is", null)
      .order("data", { ascending: false }).limit(300);
    if (cicloIds.length) q.in("ciclo_id", cicloIds);
    const { data: roms } = await q;

    const rows: QualRow[] = (roms ?? [])
      .filter(r => !fProduto || r.produto_nome?.toLowerCase().includes(fProduto.toLowerCase()))
      .map(r => ({ id: r.id, data: r.data, ticket: r.ticket_numero ?? "—", produto: r.produto_nome ?? "Grão", deposito: depNome(r.deposito_id), umidade_pct: r.umidade_pct ?? null, imp_pct: r.impureza_pct ?? null, avar_pct: r.avariados_pct ?? null, ardidos_pct: r.ardidos_pct ?? null, ph_hl: r.ph_hl ?? null, sacas: r.sacas ?? null }));

    setQualidade(rows);
    setCarregando(false);
  }, [fazAtiva, fAno, fCiclo, fProduto, ciclos, depositos]);

  // ── Salvar configuração ──────────────────────────────────────────────────────
  async function salvarConfig() {
    if (!fazAtiva) return;
    setSalvandoConfig(true);
    const { error } = await supabase.from("parametros_armazenagem").insert({
      fazenda_id:    fazAtiva,
      produto:       cfProduto.trim() || null,
      tipo_deposito: cfTipoDep,
      quebra_pct:    parseFloat(cfQuebraPct) || 0,
      observacao:    cfObs.trim() || null,
    });
    if (!error) {
      setCfProduto(""); setCfQuebraPct("2.0"); setCfObs("");
      await carregarBase();
    } else {
      alert("Erro ao salvar: " + error.message);
    }
    setSalvandoConfig(false);
  }

  async function excluirConfig(id: string) {
    if (!confirm("Remover esta configuração de quebra?")) return;
    await supabase.from("parametros_armazenagem").delete().eq("id", id);
    setQuebConfig(prev => prev.filter(c => c.id !== id));
  }

  useEffect(() => { carregarBase(); }, [carregarBase]);

  useEffect(() => {
    if (!fazAtiva) return;
    if (aba === "posicao")       carregarPosicao();
    if (aba === "movimentacoes") carregarMovs();
    if (aba === "quebra")        carregarQuebra();
    if (aba === "qualidade")     carregarQualidade();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, fAno, fCiclo, fDeposito, fProduto, fMovTipo, quebConfig, depositos, ciclos, fazAtiva]);

  // KPIs posição
  const totalEntradas  = posicao.reduce((s, r) => s + r.entradas_sc,  0);
  const totalQuebra    = posicao.reduce((s, r) => s + r.quebra_sc,    0);
  const totalSaidas    = posicao.reduce((s, r) => s + r.saidas_sc,    0);
  const totalSaldo     = posicao.reduce((s, r) => s + r.saldo_sc,     0);

  // KPIs quebra
  const quebraMedia    = quebra.length ? quebra.reduce((s, r) => s + r.quebra_pct, 0) / quebra.length : 0;
  const quebraTotal    = quebra.reduce((s, r) => s + r.quebra_kg, 0);
  const quebraConfMedia = quebra.length ? quebra.reduce((s, r) => s + r.config_pct, 0) / quebra.length : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      {/* Header */}
      <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "14px 22px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Estoque de Grãos</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Soja · Milho · Algodão · Sorgo — posição, qualidade e quebra técnica</div>
      </header>

      {/* Filtros globais */}
      <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {fazendasConta.length > 1 && (
          <select value={fazTrabalho} onChange={e => setFazTrabalho(e.target.value)} style={inp}>
            {fazendasConta.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        )}
        <select value={fAno} onChange={e => { setFAno(e.target.value); setFCiclo(""); }} style={inp}>
          <option value="">Todos os anos</option>
          {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
        </select>
        <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
          <option value="">Todos os ciclos</option>
          {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.cultura}</option>)}
        </select>
        {aba === "posicao" && (
          <select value={fDeposito} onChange={e => setFDeposito(e.target.value)} style={inp}>
            <option value="">Todos os depósitos</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        )}
        {aba === "movimentacoes" && (
          <select value={fMovTipo} onChange={e => setFMovTipo(e.target.value as "" | "entrada" | "saida" | "quebra")} style={inp}>
            <option value="">Tudo</option>
            <option value="entrada">Só Entradas</option>
            <option value="saida">Só Saídas</option>
            <option value="quebra">Só Quebras</option>
          </select>
        )}
        {aba !== "config" && (
          <input placeholder="Filtrar produto..." value={fProduto} onChange={e => setFProduto(e.target.value)} style={{ ...inp, minWidth: 140 }} />
        )}
      </div>

      {/* Abas */}
      <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", display: "flex", padding: "0 22px", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setAba(t.k)} style={{ padding: "11px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: aba === t.k ? 700 : 400, color: aba === t.k ? "var(--text-1)" : "var(--text-2)", borderBottom: aba === t.k ? "2px solid #111111" : "2px solid transparent", whiteSpace: "nowrap" }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "22px" }}>

        {/* ── POSIÇÃO ──────────────────────────────────────────────────────────── */}
        {aba === "posicao" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 22 }}>
              {[
                { label: "Total Entradas",    value: fmt(totalEntradas, 1) + " sc",  color: "#166534", bg: "#ECFDF5" },
                { label: "Quebra Técnica",    value: "− " + fmt(totalQuebra, 1) + " sc", color: "#92400E", bg: "#FEF3C7" },
                { label: "Saídas (contratos)", value: "− " + fmt(totalSaidas, 1) + " sc", color: "#991B1B", bg: "#FEF2F2" },
                { label: "Saldo Atual",       value: fmt(totalSaldo, 1) + " sc",     color: "#1A4870", bg: "#EFF6FF" },
              ].map((kpi, i) => (
                <div key={i} style={{ background: kpi.bg, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {totalQuebra > 0 && (
              <div style={{ background: "#FEF9EC", border: "0.5px solid #F59E0B", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
                ⚠️ Quebra técnica de <strong>{fmt(totalQuebra, 1)} sc</strong> aplicada automaticamente conforme configuração de parâmetros de armazenagem. <button onClick={() => setAba("config")} style={{ background: "none", border: "none", color: "#1A4870", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>Ver configuração</button>
              </div>
            )}

            {carregando ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando...</div>
            ) : posicao.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                <div>Nenhum dado de estoque encontrado para os filtros selecionados.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-card)", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)" }}>
                      <th style={th}>Produto</th>
                      <th style={th}>Depósito</th>
                      <th style={{ ...th, textAlign: "right" }}>Entradas (sc)</th>
                      <th style={{ ...th, textAlign: "right" }}>Quebra (sc)</th>
                      <th style={{ ...th, textAlign: "right" }}>Saídas (sc)</th>
                      <th style={{ ...th, textAlign: "right" }}>Saldo (sc)</th>
                      <th style={{ ...th, textAlign: "right" }}>Comprometido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posicao.map((row, i) => {
                      const base = row.entradas_sc - row.quebra_sc;
                      const comp = base > 0 ? (row.saidas_sc / base) * 100 : 0;
                      const saldoNeg = row.saldo_sc < 0;
                      return (
                        <tr key={i} style={{ background: i % 2 ? "var(--bg-page)" : "var(--bg-card)" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{row.produto}</td>
                          <td style={td}>
                            {row.deposito_nome}
                            {row.tipo_deposito === "armazem_fazenda" && <span style={{ fontSize: 10, marginLeft: 6, background: "#E0F2FE", color: "#075985", borderRadius: 4, padding: "1px 5px" }}>Próprio</span>}
                          </td>
                          <td style={tdr}>{fmt(row.entradas_sc, 1)}</td>
                          <td style={{ ...tdr, color: row.quebra_sc > 0 ? "#92400E" : "var(--text-3)" }}>
                            {row.quebra_sc > 0 ? "−" + fmt(row.quebra_sc, 1) : "—"}
                          </td>
                          <td style={tdr}>{fmt(row.saidas_sc, 1)}</td>
                          <td style={{ ...tdr, fontWeight: 700, color: saldoNeg ? "#E24B4A" : "#166534" }}>
                            {fmt(row.saldo_sc, 1)}
                          </td>
                          <td style={tdr}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                              <div style={{ width: 55, height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(100, comp)}%`, height: "100%", background: comp >= 100 ? "#E24B4A" : comp >= 80 ? "#EF9F27" : "#16A34A" }} />
                              </div>
                              <span style={{ fontSize: 12 }}>{fmt(comp, 0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-page)", fontWeight: 700 }}>
                      <td style={td} colSpan={2}>Total</td>
                      <td style={tdr}>{fmt(totalEntradas, 1)}</td>
                      <td style={{ ...tdr, color: "#92400E" }}>{totalQuebra > 0 ? "−" + fmt(totalQuebra, 1) : "—"}</td>
                      <td style={tdr}>{fmt(totalSaidas, 1)}</td>
                      <td style={{ ...tdr, color: totalSaldo < 0 ? "#E24B4A" : "#166534" }}>{fmt(totalSaldo, 1)}</td>
                      <td style={tdr} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MOVIMENTAÇÕES ──────────────────────────────────────────────────── */}
        {aba === "movimentacoes" && (
          <div>
            {carregando ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando...</div>
            : movs.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Nenhuma movimentação encontrada.</div>
            : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-card)", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)" }}>
                      <th style={th}>Data</th><th style={th}>Tipo</th><th style={th}>Produto</th>
                      <th style={th}>Depósito</th><th style={th}>Origem</th>
                      <th style={{ ...th, textAlign: "right" }}>Sacas</th><th style={{ ...th, textAlign: "right" }}>Kg</th>
                      <th style={th}>Ciclo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m, i) => (
                      <tr key={i} style={{ background: i % 2 ? "var(--bg-page)" : "var(--bg-card)" }}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(m.data)}</td>
                        <td style={td}><BadgeTipo tipo={m.tipo} /></td>
                        <td style={{ ...td, fontWeight: 600 }}>{m.produto}</td>
                        <td style={td}>{m.deposito}</td>
                        <td style={{ ...td, fontSize: 11, color: "var(--text-2)", textTransform: "capitalize" }}>{m.origem}</td>
                        <td style={{ ...tdr, color: m.tipo === "quebra" ? "#92400E" : m.tipo === "saida" ? "#991B1B" : "#166534" }}>
                          {m.tipo !== "entrada" ? "−" : "+"}{fmt(m.sacas, 1)}
                        </td>
                        <td style={tdr}>{fmt(m.kg, 0)}</td>
                        <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }}>{m.ciclo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── QUEBRA TÉCNICA ─────────────────────────────────────────────────── */}
        {aba === "quebra" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 22 }}>
              {[
                { label: "Quebra Classif. Média", value: fmt(quebraMedia, 2) + "%",  color: quebraMedia > 2 ? "#991B1B" : "#555" },
                { label: "Quebra Classif. Total",  value: fmt(quebraTotal / 1000, 2) + " t", color: "#555" },
                { label: "Quebra Armazém Config.", value: fmt(quebraConfMedia, 2) + "%", color: "#92400E" },
                { label: "Romaneios analisados",   value: String(quebra.length), color: "#1A4870" },
              ].map((kpi, i) => (
                <div key={i} style={{ background: "var(--bg-card)", borderRadius: 10, padding: "14px 18px", border: "0.5px solid var(--border-table)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {carregando ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando...</div>
            : quebra.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚖️</div>
                <div>Nenhum romaneio com classificação encontrado.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-card)", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)" }}>
                      <th style={th}>Data</th><th style={th}>Ticket</th><th style={th}>Produto</th>
                      <th style={th}>Depósito</th>
                      <th style={{ ...th, textAlign: "right" }}>Peso Líq. (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>Classif. (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>Quebra Classif.</th>
                      <th style={{ ...th, textAlign: "right" }}>Quebra Armazém</th>
                      <th style={{ ...th, textAlign: "right" }}>Umid %</th>
                      <th style={{ ...th, textAlign: "right" }}>Imp %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quebra.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 ? "var(--bg-page)" : "var(--bg-card)" }}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(row.data)}</td>
                        <td style={{ ...td, fontSize: 12 }}>{row.ticket}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{row.produto}</td>
                        <td style={td}>{row.deposito}</td>
                        <td style={tdr}>{fmt(row.pl_kg, 0)}</td>
                        <td style={tdr}>{fmt(row.class_kg, 0)}</td>
                        <td style={{ ...tdr, color: row.quebra_pct >= 3 ? "#E24B4A" : row.quebra_pct >= 1.5 ? "#EF9F27" : "#16A34A", fontWeight: 700 }}>
                          {fmt(row.quebra_kg, 0)} kg ({fmt(row.quebra_pct, 2)}%)
                        </td>
                        <td style={{ ...tdr, color: row.config_pct > 0 ? "#92400E" : "#aaa", fontWeight: row.config_pct > 0 ? 700 : 400 }}>
                          {row.config_pct > 0 ? fmt(row.config_pct, 1) + "%" : "—"}
                        </td>
                        <td style={{ ...tdr, color: semaforo(row.umid, 13, 14) }}>{row.umid != null ? fmt(row.umid, 1) + "%" : "—"}</td>
                        <td style={{ ...tdr, color: semaforo(row.imp, 1, 2) }}>{row.imp != null ? fmt(row.imp, 1) + "%" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── QUALIDADE ─────────────────────────────────────────────────────── */}
        {aba === "qualidade" && (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {[{ label: "Dentro do padrão", color: "#16A34A" }, { label: "Atenção", color: "#EF9F27" }, { label: "Fora do padrão", color: "#E24B4A" }].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color }} />
                  {item.label}
                </div>
              ))}
              <span style={{ fontSize: 11, color: "#aaa" }}>Ref. ABIOVE: Umid ≤13% · Imp ≤1% · Avar ≤8%</span>
            </div>
            {carregando ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando...</div>
            : qualidade.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Nenhum dado de qualidade encontrado.</div>
            : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-card)", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)" }}>
                      <th style={th}>Data</th><th style={th}>Ticket</th><th style={th}>Produto</th>
                      <th style={th}>Depósito</th><th style={{ ...th, textAlign: "right" }}>Sacas</th>
                      <th style={{ ...th, textAlign: "right" }}>Umidade %</th>
                      <th style={{ ...th, textAlign: "right" }}>Impureza %</th>
                      <th style={{ ...th, textAlign: "right" }}>Avariados %</th>
                      <th style={{ ...th, textAlign: "right" }}>Ardidos %</th>
                      <th style={{ ...th, textAlign: "right" }}>PH (HL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualidade.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 ? "var(--bg-page)" : "var(--bg-card)" }}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(row.data)}</td>
                        <td style={{ ...td, fontSize: 12 }}>{row.ticket}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{row.produto}</td>
                        <td style={td}>{row.deposito}</td>
                        <td style={tdr}>{row.sacas != null ? fmt(row.sacas, 1) : "—"}</td>
                        <td style={{ ...tdr, color: semaforo(row.umidade_pct, 13, 14), fontWeight: 700 }}>{row.umidade_pct != null ? fmt(row.umidade_pct, 2) + "%" : "—"}</td>
                        <td style={{ ...tdr, color: semaforo(row.imp_pct, 1, 2), fontWeight: 700 }}>{row.imp_pct != null ? fmt(row.imp_pct, 2) + "%" : "—"}</td>
                        <td style={{ ...tdr, color: semaforo(row.avar_pct, 8, 15), fontWeight: 700 }}>{row.avar_pct != null ? fmt(row.avar_pct, 2) + "%" : "—"}</td>
                        <td style={{ ...tdr, color: semaforo(row.ardidos_pct, 3, 8), fontWeight: 700 }}>{row.ardidos_pct != null ? fmt(row.ardidos_pct, 2) + "%" : "—"}</td>
                        <td style={tdr}>{row.ph_hl != null ? fmt(row.ph_hl, 1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIGURAÇÃO DE QUEBRA TÉCNICA ───────────────────────────────── */}
        {aba === "config" && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Parâmetros de Armazenagem — Quebra Técnica</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Define o percentual de desconto automático aplicado sobre o volume estocado por tipo de depósito.
                A quebra técnica representa perdas de evaporação, limpeza e movimentação no armazém.
                O saldo na aba Posição já desconta esse percentual das entradas.
              </div>
            </div>

            {/* Formulário nova regra */}
            <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: "18px", border: "0.5px solid var(--border-table)", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Nova regra</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Produto (vazio = todos)</label>
                  <input placeholder="Ex: Soja, Milho..." value={cfProduto} onChange={e => setCfProduto(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Tipo de Depósito</label>
                  <select value={cfTipoDep} onChange={e => setCfTipoDep(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                    {TIPO_DEP_OPS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Quebra %</label>
                  <input type="number" step="0.1" min="0" max="20" value={cfQuebraPct} onChange={e => setCfQuebraPct(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Observação</label>
                <input placeholder="Ex: Perda por evaporação em silos verticais" value={cfObs} onChange={e => setCfObs(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <button onClick={salvarConfig} disabled={salvandoConfig} style={{ padding: "10px 20px", background: salvandoConfig ? "#888" : "#111111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: salvandoConfig ? "default" : "pointer" }}>
                {salvandoConfig ? "Salvando..." : "+ Adicionar regra"}
              </button>
            </div>

            {/* Lista de regras */}
            {quebConfig.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)", background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>
                <div>Nenhuma regra de quebra técnica configurada.</div>
                <div style={{ fontSize: 12, marginTop: 4, color: "#aaa" }}>Adicione uma regra acima para aplicar desconto automático no estoque.</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-card)", borderRadius: 10, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    <th style={th}>Produto</th>
                    <th style={th}>Tipo de Depósito</th>
                    <th style={{ ...th, textAlign: "right" }}>Quebra %</th>
                    <th style={th}>Observação</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {quebConfig.map((cfg, i) => (
                    <tr key={i} style={{ background: i % 2 ? "var(--bg-page)" : "var(--bg-card)" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{cfg.produto ?? <span style={{ color: "#aaa", fontStyle: "italic" }}>Todos os produtos</span>}</td>
                      <td style={td}>{TIPO_DEP_OPS.find(o => o.v === cfg.tipo_deposito)?.label ?? cfg.tipo_deposito}</td>
                      <td style={{ ...tdr, fontWeight: 700, color: "#92400E" }}>{fmt(cfg.quebra_pct, 2)}%</td>
                      <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }}>{cfg.observacao || "—"}</td>
                      <td style={td}>
                        {cfg.id && (
                          <button onClick={() => excluirConfig(cfg.id!)} style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none", cursor: "pointer" }}>
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 20, padding: "14px 18px", background: "#F0F9FF", borderRadius: 8, border: "0.5px solid #BAE6FD", fontSize: 12, color: "#0369A1" }}>
              <strong>Como funciona:</strong> a cada entrada de grão em depósitos do tipo configurado (ex: Armazém Próprio),
              o sistema desconta automaticamente o percentual definido. Esse desconto aparece como <strong>Quebra Técnica</strong> na posição e nas movimentações.
              Valores típicos: soja 1,5–2% · milho 2–3% · sorgo 2%.
              A quebra de classificação (umidade/impurezas do romaneio) é separada e registrada no romaneio de entrada.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
