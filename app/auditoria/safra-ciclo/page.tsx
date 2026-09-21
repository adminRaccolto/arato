"use client";
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// Auditoria por Ano Safra e Ciclo — lista, num só lugar, tudo o que a conta lançou:
// financeiro (CP/CR, tesouraria, consórcio…), operações agrícolas, abastecimentos, estoque,
// notas, pedidos e contratos. Serve para achar o que está sem ano safra / ciclo e conferir
// o que entrou em cada um.

type Linha = {
  key: string;
  origem: string;          // rótulo da fonte
  grupo: "Financeiro" | "Lavoura" | "Combustível" | "Estoque" | "Compras" | "Comercial";
  data: string | null;
  descricao: string;
  valor: number | null;    // com sinal quando faz sentido (pagar = negativo)
  status: string;
  fazenda_id: string;
  ano_safra_id: string | null;
  ciclo_id: string | null;
};

type AnoSafra = { id: string; descricao: string; fazenda_id: string };
type Ciclo = { id: string; descricao: string | null; cultura: string; ano_safra_id: string; fazenda_id: string };

const GRUPOS: Linha["grupo"][] = ["Financeiro", "Lavoura", "Combustível", "Estoque", "Compras", "Comercial"];
const SEM = "__sem__";
const COR_NEG = "#A93226";
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

const ORIGEM_LANC: Record<string, string> = {
  nf_entrada: "Financeiro · NF de entrada", nf_servico: "Financeiro · NF de serviço",
  contrato_financeiro: "Financeiro · Contrato financeiro", pedido_compra: "Financeiro · Pedido de compra",
  consorcio: "Financeiro · Consórcio", tesouraria: "Tesouraria", manual: "Financeiro · Manual",
};

// Supabase corta em 1.000 linhas por consulta: pagina até acabar
async function paginar<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(error.message);
    tudo.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return tudo;
}

type R = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function AuditoriaSafraCicloPainel({ embedded = false }: { embedded?: boolean }) {
  const { fazendaId, fazendaIds } = useAuth();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [anos, setAnos] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [fazNomes, setFazNomes] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [falhas, setFalhas] = useState<string[]>([]);

  const [fAno, setFAno] = useState("");            // descrição do ano safra | SEM | "" = todos
  const [fCiclo, setFCiclo] = useState("");        // id do ciclo | SEM | "" = todos
  const [fGrupos, setFGrupos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(200);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const ids = fazendaIds.length > 0 ? fazendaIds : [fazendaId];
    const erros: string[] = [];
    const out: Linha[] = [];

    const [anosR, ciclosR, fazR] = await Promise.all([
      supabase.from("anos_safra").select("id,descricao,fazenda_id").in("fazenda_id", ids),
      supabase.from("ciclos").select("id,descricao,cultura,ano_safra_id,fazenda_id").in("fazenda_id", ids),
      supabase.from("fazendas").select("id,nome").in("id", ids),
    ]);
    setAnos((anosR.data ?? []) as AnoSafra[]);
    setCiclos((ciclosR.data ?? []) as Ciclo[]);
    setFazNomes(new Map(((fazR.data ?? []) as { id: string; nome: string }[]).map(f => [f.id, f.nome])));

    const cicloAno = new Map(((ciclosR.data ?? []) as Ciclo[]).map(c => [c.id, c.ano_safra_id]));
    const add = (l: Omit<Linha, "ano_safra_id"> & { ano_safra_id?: string | null }) =>
      out.push({ ...l, ano_safra_id: l.ano_safra_id ?? (l.ciclo_id ? cicloAno.get(l.ciclo_id) ?? null : null) });

    // Cada fonte é independente: se uma falhar, as outras continuam e o aviso aparece na tela
    const fonte = async (nome: string, fn: () => Promise<void>) => {
      try { await fn(); } catch (e) { erros.push(`${nome}: ${(e as Error).message}`); }
    };
    const busc = (tabela: string, cols: string) =>
      paginar<R>((de, ate) => supabase.from(tabela).select(cols).in("fazenda_id", ids).order("id").range(de, ate));

    await Promise.all([
      fonte("Lançamentos financeiros", async () => {
        for (const l of await busc("lancamentos", "id,fazenda_id,tipo,descricao,valor,valor_pago,status,data_vencimento,data_baixa,ciclo_id,ano_safra_id,origem_lancamento")) {
          if (l.status === "cancelado") continue;
          const v = Number(l.status === "baixado" ? (l.valor_pago ?? l.valor) : l.valor);
          add({ key: `l${l.id}`, origem: ORIGEM_LANC[String(l.origem_lancamento ?? "manual")] ?? "Financeiro", grupo: "Financeiro",
            data: s(l.status === "baixado" ? (l.data_baixa ?? l.data_vencimento) : l.data_vencimento),
            descricao: `${l.tipo === "pagar" ? "CP" : "CR"} · ${l.descricao}`, valor: l.tipo === "pagar" ? -v : v,
            status: String(l.status), fazenda_id: String(l.fazenda_id), ciclo_id: s(l.ciclo_id), ano_safra_id: s(l.ano_safra_id) });
        }
      }),
      fonte("Plantios", async () => {
        for (const p of await busc("plantios", "id,fazenda_id,ciclo_id,variedade,area_ha,custo_semente_total,custo_sementes,data_plantio,status_campo")) {
          add({ key: `pl${p.id}`, origem: "Lavoura · Plantio", grupo: "Lavoura", data: s(p.data_plantio),
            descricao: `Plantio${p.variedade ? " " + p.variedade : ""} · ${n(p.area_ha) ?? 0} ha`, valor: n(p.custo_semente_total) ?? n(p.custo_sementes),
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Pulverizações", async () => {
        for (const p of await busc("pulverizacoes", "id,fazenda_id,ciclo_id,tipo,area_ha,custo_total,data_inicio,status_campo")) {
          add({ key: `pu${p.id}`, origem: "Lavoura · Pulverização", grupo: "Lavoura", data: s(p.data_inicio),
            descricao: `Pulverização${p.tipo ? " " + p.tipo : ""} · ${n(p.area_ha) ?? 0} ha`, valor: n(p.custo_total),
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Adubações de base", async () => {
        for (const p of await busc("adubacoes_base", "id,fazenda_id,ciclo_id,area_ha,custo_total,data_aplicacao,status_campo")) {
          add({ key: `ad${p.id}`, origem: "Lavoura · Adubação de base", grupo: "Lavoura", data: s(p.data_aplicacao),
            descricao: `Adubação de base · ${n(p.area_ha) ?? 0} ha`, valor: n(p.custo_total),
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Correções de solo", async () => {
        for (const p of await busc("correcoes_solo", "id,fazenda_id,ciclo_id,area_ha,custo_total,data_aplicacao,status_campo")) {
          add({ key: `cs${p.id}`, origem: "Lavoura · Correção de solo", grupo: "Lavoura", data: s(p.data_aplicacao),
            descricao: `Correção de solo · ${n(p.area_ha) ?? 0} ha`, valor: n(p.custo_total),
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Colheitas", async () => {
        for (const p of await busc("colheitas", "id,fazenda_id,ciclo_id,produto,total_sacas,data_colheita,status_campo")) {
          add({ key: `co${p.id}`, origem: "Lavoura · Colheita", grupo: "Lavoura", data: s(p.data_colheita),
            descricao: `Colheita ${p.produto ?? ""} · ${(n(p.total_sacas) ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} sc`, valor: null,
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Romaneios de entrada", async () => {
        for (const p of await busc("romaneios_entrada", "id,fazenda_id,ciclo_id,produto_nome,sacas,data,status,placa")) {
          add({ key: `ro${p.id}`, origem: "Lavoura · Romaneio de entrada", grupo: "Lavoura", data: s(p.data),
            descricao: `Romaneio ${p.placa ?? ""} · ${p.produto_nome ?? ""} · ${(n(p.sacas) ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} sc`, valor: null,
            status: String(p.status ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("Abastecimentos", async () => {
        for (const p of await busc("abastecimentos", "id,fazenda_id,ciclo_id,ano_safra_id,tipo_combustivel,quantidade_l,valor_total,data,maquina_descricao,status_campo")) {
          add({ key: `ab${p.id}`, origem: "Combustível · Abastecimento", grupo: "Combustível", data: s(p.data),
            descricao: `Abastecimento ${p.tipo_combustivel ?? ""} · ${(n(p.quantidade_l) ?? 0).toLocaleString("pt-BR")} L${p.maquina_descricao ? " · " + p.maquina_descricao : ""}`, valor: n(p.valor_total) == null ? null : -Number(p.valor_total),
            status: String(p.status_campo ?? "aprovado"), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id), ano_safra_id: s(p.ano_safra_id) });
        }
      }),
      fonte("Movimentações de estoque", async () => {
        const nomes = new Map((await busc("insumos", "id,fazenda_id,nome")).map(i => [String(i.id), String(i.nome)]));
        for (const p of await busc("movimentacoes_estoque", "id,fazenda_id,ciclo_id,insumo_id,tipo,quantidade,data,valor_unitario,custo_unitario_na_baixa,operacao,origem")) {
          const q = n(p.quantidade) ?? 0, vu = n(p.custo_unitario_na_baixa) ?? n(p.valor_unitario) ?? 0;
          add({ key: `me${p.id}`, origem: "Estoque · Movimentação", grupo: "Estoque", data: s(p.data),
            descricao: `${p.tipo === "entrada" ? "Entrada" : "Saída"} · ${nomes.get(String(p.insumo_id)) ?? "insumo"} · ${q.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${p.operacao ? " · " + p.operacao : ""}`,
            valor: vu ? (p.tipo === "entrada" ? 1 : -1) * q * vu : null,
            status: String(p.origem ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id) });
        }
      }),
      fonte("NFs de entrada", async () => {
        for (const p of await busc("nf_entradas", "id,fazenda_id,ciclo_id,ano_safra_id,numero,emitente_nome,valor_total,data_emissao,status")) {
          add({ key: `nf${p.id}`, origem: "Compras · NF de entrada", grupo: "Compras", data: s(p.data_emissao),
            descricao: `NF ${p.numero ?? ""} · ${p.emitente_nome ?? ""}`, valor: n(p.valor_total) == null ? null : -Number(p.valor_total),
            status: String(p.status ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id), ano_safra_id: s(p.ano_safra_id) });
        }
      }),
      fonte("Pedidos de compra", async () => {
        for (const p of await busc("pedidos_compra", "id,fazenda_id,ciclo_id,ano_safra_id,numero,total_financeiro,data_registro,status")) {
          add({ key: `pc${p.id}`, origem: "Compras · Pedido de compra", grupo: "Compras", data: s(p.data_registro),
            descricao: `Pedido ${p.numero ?? ""}`, valor: n(p.total_financeiro) == null ? null : -Number(p.total_financeiro),
            status: String(p.status ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id), ano_safra_id: s(p.ano_safra_id) });
        }
      }),
      fonte("Contratos de grãos", async () => {
        for (const p of await busc("contratos", "id,fazenda_id,ciclo_id,ano_safra_id,numero,produto,produtor_nome,quantidade_sc,preco,moeda,data_contrato,status")) {
          add({ key: `ct${p.id}`, origem: "Comercial · Contrato de grãos", grupo: "Comercial", data: s(p.data_contrato),
            descricao: `Contrato ${p.numero ?? ""} · ${p.produto ?? ""}${p.produtor_nome ? " · " + p.produtor_nome : ""} · ${(n(p.quantidade_sc) ?? 0).toLocaleString("pt-BR")} kg a ${p.moeda === "USD" ? "US$" : "R$"} ${(n(p.preco) ?? 0).toLocaleString("pt-BR")}/sc`,
            valor: null, status: String(p.status ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: s(p.ciclo_id), ano_safra_id: s(p.ano_safra_id) });
        }
      }),
      fonte("Contratos financeiros", async () => {
        for (const p of await busc("contratos_financeiros", "id,fazenda_id,ano_safra_id,descricao,numero_contrato,valor_total,data_contrato,status")) {
          add({ key: `cf${p.id}`, origem: "Financeiro · Contrato financeiro (cédula)", grupo: "Financeiro", data: s(p.data_contrato),
            descricao: `Cédula ${p.numero_contrato ?? ""} · ${p.descricao ?? ""}`, valor: n(p.valor_total),
            status: String(p.status ?? ""), fazenda_id: String(p.fazenda_id), ciclo_id: null, ano_safra_id: s(p.ano_safra_id) });
        }
      }),
    ]);

    setLinhas(out);
    setFalhas(erros);
    setLoading(false);
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  const multiFazenda = fazNomes.size > 1;
  const anoDesc = useMemo(() => new Map(anos.map(a => [a.id, a.descricao])), [anos]);
  const cicloMap = useMemo(() => new Map(ciclos.map(c => [c.id, c])), [ciclos]);
  const cicloRotulo = (c: Ciclo) => `${c.descricao || c.cultura}${multiFazenda ? " · " + (fazNomes.get(c.fazenda_id) ?? "") : ""}`;

  const opcoesAno = useMemo(() => Array.from(new Set(anos.map(a => a.descricao))).sort().reverse(), [anos]);
  const opcoesCiclo = useMemo(() => ciclos
    .filter(c => !fAno || fAno === SEM ? true : anoDesc.get(c.ano_safra_id) === fAno)
    .sort((a, b) => cicloRotulo(a).localeCompare(cicloRotulo(b))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ciclos, fAno, anoDesc, fazNomes]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l => {
      const ano = l.ano_safra_id ? anoDesc.get(l.ano_safra_id) ?? null : null;
      if (fAno === SEM ? !!l.ano_safra_id : fAno && ano !== fAno) return false;
      if (fCiclo === SEM ? !!l.ciclo_id : fCiclo && l.ciclo_id !== fCiclo) return false;
      if (fGrupos.size > 0 && !fGrupos.has(l.grupo)) return false;
      if (q && !`${l.descricao} ${l.origem}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [linhas, fAno, fCiclo, fGrupos, busca, anoDesc]);

  useEffect(() => { setLimite(200); }, [fAno, fCiclo, fGrupos, busca]);
  useEffect(() => { setFCiclo(""); }, [fAno]);

  const resumo = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number; semCiclo: number; grupo: string }>();
    for (const l of filtradas) {
      const r = m.get(l.origem) ?? { qtd: 0, total: 0, semCiclo: 0, grupo: l.grupo };
      r.qtd++; r.total += l.valor ?? 0; if (!l.ciclo_id) r.semCiclo++;
      m.set(l.origem, r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtradas]);
  const semCicloTotal = filtradas.filter(l => !l.ciclo_id).length;
  const semAnoTotal = filtradas.filter(l => !l.ano_safra_id).length;

  const rotuloAno = (l: Linha) => (l.ano_safra_id ? anoDesc.get(l.ano_safra_id) ?? "—" : null);
  const rotuloCiclo = (l: Linha) => { const c = l.ciclo_id ? cicloMap.get(l.ciclo_id) : undefined; return c ? cicloRotulo(c) : null; };

  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Auditoria por Ano Safra e Ciclo"],
      ["Ano safra", fAno === SEM ? "(sem ano safra)" : fAno || "Todos"],
      ["Ciclo", fCiclo === SEM ? "(sem ciclo)" : fCiclo ? (cicloMap.get(fCiclo) ? cicloRotulo(cicloMap.get(fCiclo)!) : fCiclo) : "Todos"],
      [],
      ["Origem", "Registros", "Sem ciclo", "Soma dos valores (R$)"],
      ...resumo.map(([o, r]) => [o, r.qtd, r.semCiclo, Math.round(r.total * 100) / 100]),
    ]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtradas.map(l => ({
      "Ano safra": rotuloAno(l) ?? "(sem ano safra)", "Ciclo": rotuloCiclo(l) ?? "(sem ciclo)", "Grupo": l.grupo, "Origem": l.origem,
      "Data": fmtDt(l.data), "Descrição": l.descricao, "Valor (R$)": l.valor == null ? "" : Math.round(l.valor * 100) / 100,
      "Status": l.status, "Fazenda": fazNomes.get(l.fazenda_id) ?? "",
    }))), "Registros");
    XLSX.writeFile(wb, `auditoria_safra_ciclo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const chip = (ativo: boolean): CSSProperties => ({
    fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "0.5px solid var(--border)", cursor: "pointer", fontWeight: 600,
    background: ativo ? "#1A4870" : "var(--bg-card)", color: ativo ? "#fff" : "var(--text-2)",
  });
  const sel: CSSProperties = { padding: "5px 9px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 12, background: "var(--bg-card)", minWidth: 150 };
  const th: CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)", whiteSpace: "nowrap" };
  const td: CSSProperties = { padding: "7px 10px", fontSize: 12, borderBottom: "0.5px solid var(--bg-tag)", color: "var(--text-1)" };

  return (
    <>
      {!embedded && <TopNav />}
      <main style={{ padding: embedded ? 0 : "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: "var(--text-1)" }}>Auditoria por Ano Safra e Ciclo</h1>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "2px 0 0" }}>
              Lançamentos financeiros, tesouraria, operações agrícolas, abastecimentos, estoque, compras e contratos — com o ano safra e o ciclo de cada um.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={carregar} disabled={loading} style={chip(false)}>{loading ? "Carregando…" : "↻ Atualizar"}</button>
            <button onClick={exportar} disabled={loading || filtradas.length === 0} style={{ ...chip(true), padding: "5px 12px" }}>Exportar XLSX</button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 3 }}>Ano Safra
            <select value={fAno} onChange={e => setFAno(e.target.value)} style={sel}>
              <option value="">Todos</option>
              {opcoesAno.map(a => <option key={a} value={a}>{a}</option>)}
              <option value={SEM}>(sem ano safra)</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 3 }}>Ciclo
            <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={{ ...sel, minWidth: 220 }}>
              <option value="">Todos</option>
              {opcoesCiclo.map(c => <option key={c.id} value={c.id}>{cicloRotulo(c)}</option>)}
              <option value={SEM}>(sem ciclo)</option>
            </select>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--text-3)" }}>Tipo de lançamento
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button onClick={() => setFGrupos(new Set())} style={chip(fGrupos.size === 0)}>Todos</button>
              {GRUPOS.map(g => (
                <button key={g} onClick={() => setFGrupos(prev => { const x = new Set(prev); if (x.has(g)) x.delete(g); else x.add(g); return x; })} style={chip(fGrupos.has(g))}>{g}</button>
              ))}
            </div>
          </div>
          <input placeholder="Buscar descrição…" value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...sel, flex: "1 1 180px", alignSelf: "flex-end" }} />
        </div>

        {falhas.length > 0 && (
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", color: "#7A4300", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
            Algumas fontes não puderam ser lidas e ficaram de fora: {falhas.join(" · ")}
          </div>
        )}

        {/* Resumo por origem */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflowX: "auto", marginBottom: 12 }}>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>
            <strong style={{ color: "var(--text-1)" }}>{filtradas.length.toLocaleString("pt-BR")}</strong> registros
            {" · "}<span style={{ color: semAnoTotal ? COR_NEG : undefined, fontWeight: semAnoTotal ? 700 : 400 }}>{semAnoTotal.toLocaleString("pt-BR")} sem ano safra</span>
            {" · "}<span style={{ color: semCicloTotal ? COR_NEG : undefined, fontWeight: semCicloTotal ? 700 : 400 }}>{semCicloTotal.toLocaleString("pt-BR")} sem ciclo</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Origem</th><th style={{ ...th, textAlign: "right" }}>Registros</th><th style={{ ...th, textAlign: "right" }}>Sem ciclo</th><th style={{ ...th, textAlign: "right" }}>Soma dos valores</th></tr></thead>
            <tbody>
              {resumo.map(([o, r]) => (
                <tr key={o}>
                  <td style={td}>{o}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.qtd.toLocaleString("pt-BR")}</td>
                  <td style={{ ...td, textAlign: "right", color: r.semCiclo ? COR_NEG : "var(--text-3)", fontWeight: r.semCiclo ? 700 : 400 }}>{r.semCiclo.toLocaleString("pt-BR")}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.total < 0 ? COR_NEG : "var(--text-1)" }}>{r.total ? fmtBRL(r.total) : "—"}</td>
                </tr>
              ))}
              {resumo.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 20 }}>{loading ? "Carregando…" : "Nenhum registro para os filtros escolhidos."}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Lista */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={th}>Ano safra</th><th style={th}>Ciclo</th><th style={th}>Origem</th><th style={th}>Data</th>
                <th style={th}>Descrição</th><th style={{ ...th, textAlign: "right" }}>Valor</th><th style={th}>Status</th>
                {multiFazenda && <th style={th}>Fazenda</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, limite).map(l => {
                const ano = rotuloAno(l), ci = rotuloCiclo(l);
                return (
                  <tr key={l.key}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: ano ? "var(--text-1)" : COR_NEG, fontWeight: ano ? 400 : 600 }}>{ano ?? "sem ano"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: ci ? "var(--text-1)" : COR_NEG, fontWeight: ci ? 400 : 600 }}>{ci ?? "sem ciclo"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-2)" }}>{l.origem}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDt(l.data)}</td>
                    <td style={{ ...td, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.descricao}>{l.descricao}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: (l.valor ?? 0) < 0 ? COR_NEG : "var(--text-1)" }}>{l.valor == null ? "—" : fmtBRL(l.valor)}</td>
                    <td style={{ ...td, color: "var(--text-3)", whiteSpace: "nowrap" }}>{l.status}</td>
                    {multiFazenda && <td style={{ ...td, color: "var(--text-3)", whiteSpace: "nowrap" }}>{fazNomes.get(l.fazenda_id) ?? "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length > limite && (
            <div style={{ padding: 10, textAlign: "center" }}>
              <button onClick={() => setLimite(x => x + 500)} style={chip(false)}>Mostrar mais ({(filtradas.length - limite).toLocaleString("pt-BR")} restantes) — a exportação XLSX leva todos</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default function AuditoriaSafraCicloPage() {
  return <AuditoriaSafraCicloPainel />;
}
