"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type RegraMap = {
  id: string;
  ncm: string;
  nome_regra?: string;
  categoria?: string;
  operacao_gerencial_id?: string;
  og_esperada_descricao?: string;
  og_esperada_classif?: string;
};

type InconsistenciaItem = {
  item_id: string;
  nf_numero: string;
  nf_data: string;
  emitente: string;
  descricao_produto: string;
  ncm: string;
  tipo_apropiacao: string;
  // Classificação real
  insumo_nome?: string;
  insumo_categoria?: string;
  og_real_id?: string;
  og_real_descricao?: string;
  og_real_classif?: string;
  // Esperado pela regra
  regra_nome?: string;
  categoria_esperada?: string;
  og_esperada_id?: string;
  og_esperada_descricao?: string;
  og_esperada_classif?: string;
  // Tipo da inconsistência
  tipo_inconsistencia: "og_diferente" | "categoria_errada" | "sem_og_direto";
};

const CAT_LABEL: Record<string, string> = {
  sementes: "Sementes", fertilizantes: "Fertilizantes", defensivos: "Defensivos",
  correcao_solo: "Correção de Solo", combustivel: "Combustível",
  pecas_manutencao: "Peças / Manutenção", servicos: "Serviços", outros: "Outros",
};

const TIPO_META: Record<string, { label: string; bg: string; cor: string }> = {
  og_diferente:    { label: "OG diferente",      bg: "#FEF3C7", cor: "#92400E" },
  categoria_errada:{ label: "Categoria errada",  bg: "#FEE2E2", cor: "#991B1B" },
  sem_og_direto:   { label: "OG não informada",  bg: "#F1F5F9", cor: "#475569" },
};

export default function AuditoriaClassificacaoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();
  const [inconsistencias, setInconsistencias] = useState<InconsistenciaItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [ogsDisponiveis, setOgsDisponiveis] = useState<{ id: string; descricao: string; classificacao: string }[]>([]);
  const [ogCorrecao, setOgCorrecao] = useState<Record<string, string>>({});

  // Carrega OGs para seleção de correção
  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("operacoes_gerenciais").select("id, descricao, classificacao")
      .or(`fazenda_id.eq.${fazendaId},fazenda_id.is.null`).eq("inativo", false).order("classificacao")
      .then(({ data }) => setOgsDisponiveis((data ?? []) as { id: string; descricao: string; classificacao: string }[]));
  }, [fazendaId]);

  const rodarAuditoria = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const ids = fazendaIds && fazendaIds.length > 0 ? fazendaIds : [fazendaId];

    // 1. Carrega regras ativas com NCM
    const { data: regrasRaw } = await supabase
      .from("regras_classificacao_nf")
      .select("id, ncm, nome_regra, categoria, operacao_gerencial_id")
      .in("fazenda_id", ids)
      .eq("ativo", true)
      .not("ncm", "is", null);

    if (!regrasRaw || regrasRaw.length === 0) { setInconsistencias([]); setLoading(false); return; }

    // Monta mapa NCM → regra (normaliza NCM: remove pontos para comparação)
    const regraMap = new Map<string, RegraMap>();
    for (const r of regrasRaw) {
      regraMap.set((r.ncm as string).replace(/\./g, ""), r as RegraMap);
    }

    // 2. Carrega OGs esperadas para enriquecer o mapa
    const ogIds = regrasRaw.map(r => r.operacao_gerencial_id).filter(Boolean) as string[];
    const ogMap = new Map<string, { descricao: string; classificacao: string }>();
    if (ogIds.length > 0) {
      const { data: ogsRaw } = await supabase
        .from("operacoes_gerenciais").select("id, descricao, classificacao").in("id", ogIds);
      for (const og of ogsRaw ?? []) ogMap.set(og.id, og);
    }

    // 3. Carrega itens de NF com NCM (últimos 365 dias)
    const umAnoAtras = new Date(); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    const { data: itensRaw } = await supabase
      .from("nf_entrada_itens")
      .select(`id, ncm, descricao_produto, tipo_apropiacao, insumo_id, operacao_gerencial_id,
               nf_entradas!inner(numero, data_emissao, emitente_nome, fazenda_id)`)
      .in("nf_entradas.fazenda_id", ids)
      .not("ncm", "is", null)
      .gte("nf_entradas.data_emissao", umAnoAtras.toISOString().slice(0, 10))
      .limit(2000);

    if (!itensRaw || itensRaw.length === 0) { setInconsistencias([]); setLoading(false); return; }

    // 4. Carrega insumos para saber categoria real dos itens de estoque
    const insumoIds = [...new Set(itensRaw.map((i: { insumo_id?: string }) => i.insumo_id).filter(Boolean))] as string[];
    const insumoMap = new Map<string, { nome: string; categoria?: string }>();
    if (insumoIds.length > 0) {
      const { data: insumosRaw } = await supabase
        .from("insumos").select("id, nome, categoria").in("id", insumoIds);
      for (const ins of insumosRaw ?? []) insumoMap.set(ins.id, ins);
    }

    // 5. Carrega OGs reais dos itens
    const ogReaisIds = [...new Set(itensRaw.map((i: { operacao_gerencial_id?: string }) => i.operacao_gerencial_id).filter(Boolean))] as string[];
    const ogReaisMap = new Map<string, { descricao: string; classificacao: string }>();
    if (ogReaisIds.length > 0) {
      const { data: ogReaisRaw } = await supabase
        .from("operacoes_gerenciais").select("id, descricao, classificacao").in("id", ogReaisIds);
      for (const og of ogReaisRaw ?? []) ogReaisMap.set(og.id, og);
    }

    // 6. Cruza e detecta inconsistências
    const resultado: InconsistenciaItem[] = [];
    for (const item of itensRaw as Record<string, unknown>[]) {
      const ncmNorm = ((item.ncm as string) ?? "").replace(/\./g, "");
      const regra = regraMap.get(ncmNorm);
      if (!regra) continue; // NCM sem regra → ignora

      const nf = (item.nf_entradas as Record<string, string>) ?? {};
      const insumo = item.insumo_id ? insumoMap.get(item.insumo_id as string) : undefined;
      const ogReal = item.operacao_gerencial_id ? ogReaisMap.get(item.operacao_gerencial_id as string) : undefined;
      const ogEsperada = regra.operacao_gerencial_id ? (ogMap.get(regra.operacao_gerencial_id) ?? null) : null;

      const base: Omit<InconsistenciaItem, "tipo_inconsistencia"> = {
        item_id:              item.id as string,
        nf_numero:            nf.numero,
        nf_data:              nf.data_emissao,
        emitente:             nf.emitente_nome,
        descricao_produto:    item.descricao_produto as string,
        ncm:                  item.ncm as string,
        tipo_apropiacao:      item.tipo_apropiacao as string,
        insumo_nome:          insumo?.nome,
        insumo_categoria:     insumo?.categoria,
        og_real_id:           item.operacao_gerencial_id as string | undefined,
        og_real_descricao:    ogReal?.descricao,
        og_real_classif:      ogReal?.classificacao,
        regra_nome:           regra.nome_regra,
        categoria_esperada:   regra.categoria,
        og_esperada_id:       regra.operacao_gerencial_id,
        og_esperada_descricao:ogEsperada?.descricao,
        og_esperada_classif:  ogEsperada?.classificacao,
      };

      // Caso 1: item direto com OG esperada na regra — compara OGs diretamente
      if (item.tipo_apropiacao === "direto" && regra.operacao_gerencial_id) {
        if (!item.operacao_gerencial_id) {
          resultado.push({ ...base, tipo_inconsistencia: "sem_og_direto" });
        } else if (item.operacao_gerencial_id !== regra.operacao_gerencial_id) {
          resultado.push({ ...base, tipo_inconsistencia: "og_diferente" });
        }
        continue;
      }

      // Caso 2: item de estoque com categoria na regra — compara categoria do insumo
      if (item.tipo_apropiacao === "estoque" && regra.categoria && insumo?.categoria) {
        if (insumo.categoria !== regra.categoria) {
          resultado.push({ ...base, tipo_inconsistencia: "categoria_errada" });
        }
      }
    }

    setInconsistencias(resultado);
    setLoading(false);
  }, [fazendaId, fazendaIds]);

  async function corrigirOG(itemId: string, novaOgId: string) {
    if (!novaOgId) return;
    await supabase.from("nf_entrada_itens").update({ operacao_gerencial_id: novaOgId }).eq("id", itemId);
    setInconsistencias(p => p.filter(x => x.item_id !== itemId));
    setCorrigindo(null);
  }

  const filtradas = inconsistencias.filter(i => filtroTipo === "todos" || i.tipo_inconsistencia === filtroTipo);
  const fmtData = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Auditoria de Classificação</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Cruza o NCM de cada item com as regras cadastradas e aponta classificações inconsistentes nos últimos 12 meses.
            </p>
          </div>
          <button onClick={rodarAuditoria} disabled={loading}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#111111", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "Verificando…" : "Rodar Auditoria"}
          </button>
        </div>

        {/* KPIs */}
        {inconsistencias.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total inconsistências", valor: inconsistencias.length, cor: "#E24B4A" },
              { label: "OG diferente",          valor: inconsistencias.filter(i => i.tipo_inconsistencia === "og_diferente").length,    cor: "#92400E" },
              { label: "Categoria errada",       valor: inconsistencias.filter(i => i.tipo_inconsistencia === "categoria_errada").length, cor: "#991B1B" },
              { label: "OG não informada",       valor: inconsistencias.filter(i => i.tipo_inconsistencia === "sem_og_direto").length,   cor: "#475569" },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.cor }}>{k.valor}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtro */}
        {inconsistencias.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["todos", "og_diferente", "categoria_errada", "sem_og_direto"].map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                style={{ padding: "5px 14px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: filtroTipo === t ? "#111111" : "var(--bg-card)", color: filtroTipo === t ? "#fff" : "var(--text-2)" }}>
                {t === "todos" ? "Todos" : TIPO_META[t]?.label}
              </button>
            ))}
          </div>
        )}

        {!loading && inconsistencias.length === 0 && (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)", marginBottom: 6 }}>Auditoria não executada</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              Clique em <strong>Rodar Auditoria</strong> para verificar inconsistências de classificação nos últimos 12 meses.
              <br />Para que a auditoria funcione, as <strong>Regras de Classificação</strong> precisam ter NCM e OG esperada configurados.
            </div>
          </div>
        )}

        {filtradas.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-page)", borderBottom: "0.5px solid var(--border)" }}>
                  {["NF / Data", "Emitente", "Item / NCM", "Tipo", "Regra", "Classificado como", "Esperado", ""].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((inc, idx) => {
                  const tm = TIPO_META[inc.tipo_inconsistencia];
                  const isCorrigindo = corrigindo === inc.item_id;
                  return (
                    <tr key={inc.item_id} style={{ borderBottom: idx < filtradas.length - 1 ? "0.5px solid var(--bg-tag)" : "none", background: idx % 2 === 1 ? "#FAFBFD" : "var(--bg-card)" }}>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{inc.nf_numero}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtData(inc.nf_data)}</div>
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inc.emitente || "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 500 }}>{inc.descricao_produto}</div>
                        <div style={{ fontSize: 11, color: "#111111", fontFamily: "monospace" }}>NCM {inc.ncm}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: tm.bg, color: tm.cor, whiteSpace: "nowrap" }}>
                          {tm.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-2)" }}>
                        {inc.regra_nome || "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {inc.tipo_apropiacao === "estoque" ? (
                          <div>
                            <div style={{ fontSize: 11 }}>{inc.insumo_nome || "sem insumo"}</div>
                            {inc.insumo_categoria && (
                              <span style={{ fontSize: 10, background: "#F1F5F9", color: "#475569", padding: "1px 6px", borderRadius: 4 }}>
                                {CAT_LABEL[inc.insumo_categoria] || inc.insumo_categoria}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            {inc.og_real_descricao
                              ? <><div style={{ fontSize: 11 }}>{inc.og_real_descricao}</div><div style={{ fontSize: 10, color: "var(--text-3)" }}>{inc.og_real_classif}</div></>
                              : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>não informada</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {inc.og_esperada_descricao ? (
                          <div>
                            <div style={{ fontSize: 11, color: "#166534" }}>{inc.og_esperada_descricao}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{inc.og_esperada_classif}</div>
                          </div>
                        ) : inc.categoria_esperada ? (
                          <span style={{ fontSize: 11, background: "#EEEEEE", color: "#111111", padding: "1px 7px", borderRadius: 8 }}>
                            {CAT_LABEL[inc.categoria_esperada] || inc.categoria_esperada}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: 180 }}>
                        {inc.tipo_apropiacao !== "estoque" && (
                          isCorrigindo ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <select style={{ fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "0.5px solid var(--border)", flex: 1 }}
                                value={ogCorrecao[inc.item_id] ?? ""}
                                onChange={e => setOgCorrecao(p => ({ ...p, [inc.item_id]: e.target.value }))}>
                                <option value="">— selecionar —</option>
                                {ogsDisponiveis.map(og => <option key={og.id} value={og.id}>{og.classificacao} — {og.descricao}</option>)}
                              </select>
                              <button onClick={() => corrigirOG(inc.item_id, ogCorrecao[inc.item_id] ?? "")}
                                style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: "#16A34A", color: "#fff", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                                ✓
                              </button>
                              <button onClick={() => setCorrigindo(null)}
                                style={{ padding: "4px 8px", borderRadius: 5, border: "0.5px solid var(--border)", background: "var(--bg-card)", fontSize: 11, cursor: "pointer" }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setCorrigindo(inc.item_id); setOgCorrecao(p => ({ ...p, [inc.item_id]: inc.og_esperada_id ?? "" })); }}
                              style={{ padding: "4px 12px", borderRadius: 5, border: "0.5px solid #C9921B", background: "#FBF3E0", color: "#7A4300", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Corrigir OG
                            </button>
                          )
                        )}
                        {inc.tipo_apropiacao === "estoque" && (
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>Corrigir via insumo</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
