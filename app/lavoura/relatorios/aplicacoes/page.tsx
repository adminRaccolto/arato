"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import TopNav from "../../../../components/TopNav";
import { useAuth } from "../../../../components/AuthProvider";
import { supabase } from "../../../../lib/supabase";
import {
  listarTalhoes, listarInsumos, listarAnosSafra, listarTodosCiclos, listarGruposInsumo, listarFazendas,
} from "../../../../lib/db";
import type { Talhao, Insumo, AnoSafra, Ciclo, GrupoInsumo, Fazenda } from "../../../../lib/supabase";

// ─── Estilos base ────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const btnV: React.CSSProperties = { padding: "9px 22px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" };

// ─── Mapas de labels ─────────────────────────────────────────
const PULV_TIPOS: Record<string, string> = {
  herbicida: "Herbicida", fungicida: "Fungicida", inseticida: "Inseticida",
  nematicida: "Nematicida", acaricida: "Acaricida", fertilizante_foliar: "Fert. Foliar",
  regulador: "Regulador", dessecacao: "Dessecação", outros: "Outros",
};
const CORR_TIPOS: Record<string, string> = {
  calcario: "Calcário", gesso: "Gesso", micronutrientes: "Micronutrientes",
  organico: "Org. Solo", outros: "Outros",
};
const ADU_TIPOS: Record<string, string> = {
  convencional: "Convencional", sulco: "Sulco", broadcast: "Broadcast",
  foliar: "Foliar", fertirrigacao: "Fertirrigação",
};
const OP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pulverizacao: { label: "Pulverização",    bg: "#E6F1FB", color: "#0C447C" },
  correcao:     { label: "Correção Solo",   bg: "#FAEEDA", color: "#633806" },
  adubacao:     { label: "Adubação Base",   bg: "#DCFCE7", color: "#166534" },
  plantio:      { label: "Plantio/Semente", bg: "#F3F6F9", color: "#555"   },
};
const CULT: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo",
};

// ─── Tipo da linha unificada ─────────────────────────────────
type Linha = {
  _id: string;
  tipo_op: "pulverizacao" | "correcao" | "adubacao" | "plantio";
  tipo_detalhe: string;
  data: string;
  talhao_id?: string;
  talhao_nome: string;
  ciclo_id: string;
  ciclo_nome: string;
  produto: string;
  insumo_id?: string;
  grupo_id?: string;
  grupo_nome: string;
  subgrupo?: string;
  dose_ha?: number;
  dose_unidade: string;
  total_consumido?: number;
  valor_unitario?: number;
  custo_ha: number;
  custo_total: number;
  area_ha: number;
};

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN    = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  return arr.reduce((acc, x) => { const k = key(x); (acc[k] = acc[k] ?? []).push(x); return acc; }, {} as Record<string, T[]>);
}

type Agrupamento = "detalhado" | "produto" | "grupo" | "talhao" | "operacao";
const AGRUP_LABELS: { key: Agrupamento; label: string }[] = [
  { key: "detalhado", label: "Detalhado"            },
  { key: "produto",   label: "Por Insumo"            },
  { key: "grupo",     label: "Por Grupo / Subgrupo"  },
  { key: "talhao",    label: "Por Talhão"            },
  { key: "operacao",  label: "Por Tipo de Operação"  },
];

// ─── Componente principal ─────────────────────────────────────
export default function RelAplicacoesPage() {
  const { fazendaId, nomeUsuario } = useAuth();

  // Suporte multi-fazenda
  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [filtroFazenda, setFiltroFazenda] = useState<string>(""); // "" = ativa, "todas", ou id

  // Dados de referência
  const [talhoes,   setTalhoes]   = useState<Talhao[]>([]);
  const [insumos,   setInsumos]   = useState<Insumo[]>([]);
  const [anos,      setAnos]      = useState<AnoSafra[]>([]);
  const [ciclos,    setCiclos]    = useState<Ciclo[]>([]);
  const [grupos,    setGrupos]    = useState<GrupoInsumo[]>([]);
  const [fazenda,   setFazenda]   = useState<Fazenda | null>(null);
  const [logoFaz,   setLogoFaz]   = useState<string | null>(null);

  // Filtros
  const [fAno,      setFAno]      = useState("");
  const [fCiclos,   setFCiclos]   = useState<string[]>([]);
  const [fTalhoes,  setFTalhoes]  = useState<string[]>([]);
  const [fTiposOp,  setFTiposOp]  = useState<string[]>(["pulverizacao","correcao","adubacao","plantio"]);
  const [fDtInicio, setFDtInicio] = useState("");
  const [fDtFim,    setFDtFim]    = useState("");
  const [fProduto,  setFProduto]  = useState("");

  // Resultado
  const [linhas,       setLinhas]       = useState<Linha[]>([]);
  const [agrupamento,  setAgrupamento]  = useState<Agrupamento>("detalhado");
  const [gerado,       setGerado]       = useState(false);
  const [dataGeracao,  setDataGeracao]  = useState("");
  const [carregando,   setCarregando]   = useState(false);
  const [erro,         setErro]         = useState<string | null>(null);

  // Modal WhatsApp
  const [modalWA,   setModalWA]   = useState(false);
  const [waPhone,   setWaPhone]   = useState("");
  const [waStatus,  setWaStatus]  = useState<"idle"|"uploading"|"done"|"error">("idle");
  const [waUrl,     setWaUrl]     = useState("");

  // IDs efetivos
  const fids = (() => {
    if (filtroFazenda === "todas") return todasFazendas.map(f => f.id);
    const fid = filtroFazenda || fazendaId || "";
    return fid ? [fid] : [];
  })();
  const fid0 = fids[0] ?? fazendaId ?? "";

  // ── Carregar fazendas disponíveis ──
  useEffect(() => {
    listarFazendas().then(setTodasFazendas).catch(() => {});
  }, []);

  // ── Carrega referências ───────────────────────────────────
  useEffect(() => {
    if (fids.length === 0) return;
    Promise.all([
      Promise.all(fids.map(f => listarTalhoes(f))).then(rs => setTalhoes(rs.flat())),
      Promise.all(fids.map(f => listarInsumos(f))).then(rs => setInsumos(rs.flat())),
      Promise.all(fids.map(f => listarAnosSafra(f))).then(rs => {
        const seen = new Set<string>(); const merged: AnoSafra[] = [];
        rs.flat().forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); } });
        setAnos(merged);
      }),
      Promise.all(fids.map(f => listarTodosCiclos(f))).then(rs => setCiclos(rs.flat())),
      listarGruposInsumo(fid0).then(setGrupos),
      supabase.from("fazendas").select("*").eq("id", fid0).single().then(({ data }) => { if (data) setFazenda(data as Fazenda); }),
    ]).catch(() => {});
    const logo = localStorage.getItem(`fazenda_logo_${fid0}`);
    if (logo) setLogoFaz(logo);
    setFCiclos([]); setFTalhoes([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fids.join(",")]);

  const ciclosFiltradosAno = fAno ? ciclos.filter(c => c.ano_safra_id === fAno) : ciclos;

  const toggleFCiclo  = (id: string) => setFCiclos(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleFTalhao = (id: string) => setFTalhoes(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleFTipoOp = (k: string) => setFTiposOp(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);

  const nomeCicloFn = useCallback((id: string) => {
    const c = ciclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anos.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULT[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  }, [ciclos, anos]);

  // ── Descrição dos filtros (para cabeçalho do relatório) ──
  const filtroDescricao = useMemo(() => {
    const partes: string[] = [];
    if (fAno) partes.push(`Ano: ${anos.find(a => a.id === fAno)?.descricao ?? fAno}`);
    if (fCiclos.length > 0) partes.push(`Ciclos: ${fCiclos.map(id => nomeCicloFn(id)).join(", ")}`);
    else if (fAno) partes.push("Ciclos: todos do ano");
    if (fTalhoes.length > 0) partes.push(`Talhões: ${fTalhoes.map(id => talhoes.find(t => t.id === id)?.nome ?? id).join(", ")}`);
    else partes.push("Talhões: todos");
    const opLabels = fTiposOp.map(k => OP_BADGE[k]?.label ?? k);
    partes.push(`Operações: ${opLabels.join(", ")}`);
    if (fDtInicio || fDtFim) partes.push(`Período: ${fDtInicio ? fmtData(fDtInicio) : "início"} a ${fDtFim ? fmtData(fDtFim) : "hoje"}`);
    if (fProduto) partes.push(`Produto: "${fProduto}"`);
    return partes.join(" · ");
  }, [fAno, fCiclos, fTalhoes, fTiposOp, fDtInicio, fDtFim, fProduto, anos, talhoes, nomeCicloFn]);

  // ── Gera relatório ────────────────────────────────────────
  const gerar = useCallback(async () => {
    if (fids.length === 0) return;
    setCarregando(true); setErro(null);
    try {
      const ciclosAlvo = fCiclos.length > 0 ? fCiclos : ciclosFiltradosAno.map(c => c.id);

      const fazQ = (table: string) => {
        const q = supabase.from(table).select("*") as any;
        return fids.length === 1 ? q.eq("fazenda_id", fids[0]) : q.in("fazenda_id", fids);
      };

      const [
        { data: pulvs }, { data: pulvItens },
        { data: corrSolos }, { data: corrItens },
        { data: adubs }, { data: aduItens },
        { data: plantios },
      ] = await Promise.all([
        fazQ("pulverizacoes"),
        fazQ("pulverizacao_itens"),
        fazQ("correcoes_solo").then((r: any) => r.error ? { data: [] } : r),
        fazQ("correcoes_solo_itens").then((r: any) => r.error ? { data: [] } : r),
        fazQ("adubacoes_base").then((r: any) => r.error ? { data: [] } : r),
        fazQ("adubacoes_base_itens").then((r: any) => r.error ? { data: [] } : r),
        fazQ("plantios"),
      ]);

      const nomeT   = (id?: string) => talhoes.find(t => t.id === id)?.nome ?? "Sem talhão";
      const infoIns = (insumo_id?: string) => {
        const ins = insumos.find(i => i.id === insumo_id);
        const grp = grupos.find(g => g.id === ins?.grupo_id);
        return { grupo_id: ins?.grupo_id, grupo_nome: grp?.nome ?? ins?.categoria ?? "Outros", subgrupo: ins?.subgrupo };
      };

      const ll: Linha[] = [];

      // Pulverizações
      if (fTiposOp.includes("pulverizacao")) {
        for (const p of ((pulvs ?? []) as any[]).filter((p: any) => ciclosAlvo.includes(p.ciclo_id))) {
          if (fTalhoes.length > 0 && p.talhao_id && !fTalhoes.includes(p.talhao_id)) continue;
          if (fDtInicio && p.data_inicio < fDtInicio) continue;
          if (fDtFim   && p.data_inicio > fDtFim)   continue;
          const itens = ((pulvItens ?? []) as any[]).filter((i: any) => i.pulverizacao_id === p.id);
          for (const it of itens) {
            if (fProduto && !it.nome_produto.toLowerCase().includes(fProduto.toLowerCase())) continue;
            const info = infoIns(it.insumo_id);
            ll.push({ _id: `pulv-${p.id}-${it.id}`, tipo_op: "pulverizacao", tipo_detalhe: p.tipo,
              data: p.data_inicio, talhao_id: p.talhao_id, talhao_nome: nomeT(p.talhao_id),
              ciclo_id: p.ciclo_id, ciclo_nome: nomeCicloFn(p.ciclo_id),
              produto: it.nome_produto, insumo_id: it.insumo_id, ...info,
              dose_ha: it.dose_ha, dose_unidade: it.unidade,
              total_consumido: it.total_consumido, valor_unitario: it.valor_unitario,
              custo_ha: it.custo_ha ?? 0, custo_total: it.custo_total ?? 0, area_ha: p.area_ha });
          }
        }
      }

      // Correções de Solo
      if (fTiposOp.includes("correcao")) {
        for (const c of (corrSolos ?? []).filter((c: {ciclo_id:string}) => ciclosAlvo.includes(c.ciclo_id))) {
          if (fTalhoes.length > 0 && c.talhao_id && !fTalhoes.includes(c.talhao_id)) continue;
          if (fDtInicio && c.data_aplicacao < fDtInicio) continue;
          if (fDtFim   && c.data_aplicacao > fDtFim)   continue;
          const itens = (corrItens ?? []).filter((i: {correcao_id:string}) => i.correcao_id === c.id);
          for (const it of itens) {
            const produto = it.produto_nome ?? (insumos.find(i => i.id === it.insumo_id)?.nome ?? "—");
            if (fProduto && !produto.toLowerCase().includes(fProduto.toLowerCase())) continue;
            const info = infoIns(it.insumo_id);
            const custo_ha = it.custo_total && c.area_ha ? it.custo_total / c.area_ha : 0;
            ll.push({ _id: `corr-${c.id}-${it.id}`, tipo_op: "correcao", tipo_detalhe: c.finalidade,
              data: c.data_aplicacao, talhao_id: c.talhao_id, talhao_nome: nomeT(c.talhao_id),
              ciclo_id: c.ciclo_id, ciclo_nome: nomeCicloFn(c.ciclo_id),
              produto, insumo_id: it.insumo_id,
              grupo_id: info.grupo_id, grupo_nome: info.grupo_nome ?? "Correção de Solo", subgrupo: info.subgrupo,
              dose_ha: it.dose_ton_ha, dose_unidade: "ton/ha", total_consumido: it.quantidade_ton,
              valor_unitario: it.valor_unitario, custo_ha, custo_total: it.custo_total ?? 0, area_ha: c.area_ha });
          }
        }
      }

      // Adubações de Base
      if (fTiposOp.includes("adubacao")) {
        for (const a of (adubs ?? []).filter((a: {ciclo_id:string}) => ciclosAlvo.includes(a.ciclo_id))) {
          if (fTalhoes.length > 0 && a.talhao_id && !fTalhoes.includes(a.talhao_id)) continue;
          if (fDtInicio && a.data_aplicacao < fDtInicio) continue;
          if (fDtFim   && a.data_aplicacao > fDtFim)   continue;
          const itens = (aduItens ?? []).filter((i: {adubacao_id:string}) => i.adubacao_id === a.id);
          for (const it of itens) {
            const produto = it.produto_nome ?? (insumos.find(i => i.id === it.insumo_id)?.nome ?? "—");
            if (fProduto && !produto.toLowerCase().includes(fProduto.toLowerCase())) continue;
            const info = infoIns(it.insumo_id);
            const custo_ha = it.custo_total && a.area_ha ? it.custo_total / a.area_ha : 0;
            ll.push({ _id: `adu-${a.id}-${it.id}`, tipo_op: "adubacao", tipo_detalhe: a.modalidade,
              data: a.data_aplicacao, talhao_id: a.talhao_id, talhao_nome: nomeT(a.talhao_id),
              ciclo_id: a.ciclo_id, ciclo_nome: nomeCicloFn(a.ciclo_id),
              produto, insumo_id: it.insumo_id,
              grupo_id: info.grupo_id, grupo_nome: info.grupo_nome ?? "Adubação", subgrupo: info.subgrupo,
              dose_ha: it.dose_kg_ha, dose_unidade: "kg/ha", total_consumido: it.quantidade_kg,
              valor_unitario: it.valor_unitario, custo_ha, custo_total: it.custo_total ?? 0, area_ha: a.area_ha });
          }
        }
      }

      // Plantio / Semente
      if (fTiposOp.includes("plantio")) {
        for (const p of (plantios ?? []).filter((p: {ciclo_id:string}) => ciclosAlvo.includes(p.ciclo_id))) {
          if (fTalhoes.length > 0 && p.talhao_id && !fTalhoes.includes(p.talhao_id)) continue;
          if (fDtInicio && p.data_plantio < fDtInicio) continue;
          if (fDtFim   && p.data_plantio > fDtFim)   continue;
          if (!p.insumo_id && !p.variedade) continue;
          const produto = p.variedade ?? (insumos.find(i => i.id === p.insumo_id)?.nome ?? "Semente");
          if (fProduto && !produto.toLowerCase().includes(fProduto.toLowerCase())) continue;
          const info = infoIns(p.insumo_id);
          const custo_ha = p.custo_sementes && p.area_ha ? p.custo_sementes / p.area_ha : 0;
          ll.push({ _id: `pl-${p.id}`, tipo_op: "plantio", tipo_detalhe: "semente",
            data: p.data_plantio, talhao_id: p.talhao_id, talhao_nome: nomeT(p.talhao_id),
            ciclo_id: p.ciclo_id, ciclo_nome: nomeCicloFn(p.ciclo_id),
            produto, insumo_id: p.insumo_id,
            grupo_id: info.grupo_id, grupo_nome: info.grupo_nome ?? "Semente", subgrupo: info.subgrupo,
            dose_ha: p.dose_kg_ha, dose_unidade: "kg/ha", total_consumido: p.quantidade_kg,
            valor_unitario: undefined, custo_ha, custo_total: p.custo_sementes ?? 0, area_ha: p.area_ha });
        }
      }

      ll.sort((a, b) => a.data.localeCompare(b.data));
      setLinhas(ll);
      setGerado(true);
      setDataGeracao(new Date().toLocaleString("pt-BR"));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar relatório");
    } finally {
      setCarregando(false);
    }
  }, [fazendaId, fCiclos, fTalhoes, fTiposOp, fDtInicio, fDtFim, fProduto, ciclosFiltradosAno, talhoes, insumos, grupos, nomeCicloFn]);

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const custo = linhas.reduce((s, l) => s + l.custo_total, 0);
    const tids  = new Set(linhas.map(l => l.talhao_id ?? "__"));
    const area  = [...tids].reduce((s, tid) => s + Math.max(...linhas.filter(l => (l.talhao_id ?? "__") === tid).map(l => l.area_ha)), 0);
    return { custo, area, custo_ha: area > 0 ? custo / area : 0, ops: linhas.length };
  }, [linhas]);

  // ── Helpers de layout compartilhados PDF/Print ───────────
  const buildLinhasHtml = () => linhas.map((l, i) => {
    const det = l.tipo_op === "pulverizacao" ? (PULV_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
      : l.tipo_op === "correcao" ? (CORR_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
      : l.tipo_op === "adubacao" ? (ADU_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe) : "Semente";
    const bg = i % 2 === 0 ? "#fff" : "#F9FAFB";
    const td = (v: string, right = false) =>
      `<td style="padding:3px 6px;border:1px solid #E5E7EB;${right ? "text-align:right;" : ""}white-space:nowrap">${v}</td>`;
    return `<tr style="background:${bg}">
      ${td(fmtData(l.data))}${td(OP_BADGE[l.tipo_op]?.label ?? l.tipo_op)}${td(det)}
      ${td(l.talhao_nome)}${td(l.ciclo_nome)}${td(l.produto)}
      <td style="padding:3px 6px;border:1px solid #E5E7EB;color:#555">${l.grupo_nome}</td>
      ${td(fmtN(l.dose_ha,3),true)}${td(l.dose_unidade,true)}${td(fmtN(l.total_consumido,3),true)}
      ${td(l.valor_unitario != null ? fmtBRL(l.valor_unitario) : "—",true)}
      ${td(fmtBRL(l.custo_ha),true)}
      <td style="padding:3px 6px;border:1px solid #E5E7EB;text-align:right;font-weight:700">${fmtBRL(l.custo_total)}</td>
      ${td(fmtN(l.area_ha,1),true)}
    </tr>`;
  }).join("");

  const buildPrintHtml = (logoAratoSrc: string) => {
    const fazNome = fazenda?.nome ?? "Fazenda";
    const fazSub  = [fazenda?.municipio, fazenda?.estado].filter(Boolean).join(" · ")
                  + (fazenda?.area_total_ha ? ` · ${fazenda.area_total_ha.toLocaleString("pt-BR")} ha` : "");
    const agrupLabel = AGRUP_LABELS.find(a => a.key === agrupamento)?.label ?? "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Relatório de Aplicações — ${fazNome}</title>
<style>
  body{margin:0;padding:14mm;font-family:Arial,sans-serif;font-size:9pt;color:#1a1a1a;background:#fff}
  @page{size:A4 landscape;margin:14mm}
  table{width:100%;border-collapse:collapse;font-size:8pt}
  th{background:#1A4870;color:#fff;padding:4px 6px;text-align:left;border:1px solid #1A4870;white-space:nowrap}
  th.r{text-align:right} tfoot td{background:#1A4870;color:#fff;font-weight:700;padding:4px 6px;border:1px solid #1A4870}
  .r{text-align:right}
</style></head><body>
<div style="border-bottom:2px solid #1A4870;padding-bottom:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="display:flex;align-items:center;gap:12px">
    ${logoFaz ? `<img src="${logoFaz}" style="height:40px;object-fit:contain">` : ""}
    <div>
      <div style="font-size:14pt;font-weight:700;color:#1A4870">${fazNome}</div>
      ${fazSub ? `<div style="font-size:8pt;color:#555">${fazSub}</div>` : ""}
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#1A4870">RELATÓRIO DE APLICAÇÕES</div>
    <div style="font-size:8pt;color:#555">por Safra / Ciclo</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:#F3F6F9;padding:7px 10px;border-radius:4px;margin-bottom:8px;font-size:8pt">
  <div><span style="color:#888">Gerado por: </span><strong>${nomeUsuario ?? "—"}</strong></div>
  <div><span style="color:#888">Data / Hora: </span><strong>${dataGeracao}</strong></div>
  <div><span style="color:#888">Agrupamento: </span><strong>${agrupLabel}</strong></div>
</div>
<div style="background:#EBF3FD;border:1px solid rgba(26,72,112,0.2);border-radius:4px;padding:5px 10px;margin-bottom:8px;font-size:8pt">
  <strong style="color:#1A4870">FILTROS: </strong><span style="color:#333">${filtroDescricao || "Nenhum filtro"}</span>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
  ${[
    { l:"Aplicações",     v: String(stats.ops),           hl: false },
    { l:"Área coberta",   v: `${fmtN(stats.area,1)} ha`,  hl: false },
    { l:"Custo Total",    v: fmtBRL(stats.custo),          hl: true  },
    { l:"Custo Médio/ha", v: fmtBRL(stats.custo_ha),       hl: false },
  ].map(s => `<div style="border:1px solid #D4DCE8;border-radius:4px;padding:5px 8px;background:${s.hl?"#1A4870":"#fff"};color:${s.hl?"#fff":"#1a1a1a"}">
    <div style="font-size:7pt;color:${s.hl?"rgba(255,255,255,0.8)":"#555"};margin-bottom:2px">${s.l}</div>
    <div style="font-size:11pt;font-weight:700">${s.v}</div>
  </div>`).join("")}
</div>
<table>
  <thead><tr>
    <th>Data</th><th>Operação</th><th>Detalhe</th><th>Talhão</th><th>Ciclo</th>
    <th>Produto / Insumo</th><th>Grupo</th>
    <th class="r">Dose/ha</th><th class="r">Unid.</th><th class="r">Total</th>
    <th class="r">R$/unid</th><th class="r">R$/ha</th><th class="r">Custo Total</th><th class="r">Área ha</th>
  </tr></thead>
  <tbody>${buildLinhasHtml()}</tbody>
  <tfoot><tr>
    <td colspan="7">TOTAL GERAL — ${linhas.length} aplicações</td>
    <td colspan="4"></td>
    <td class="r">${fmtBRL(stats.custo_ha)}/ha</td>
    <td class="r">${fmtBRL(stats.custo)}</td>
    <td class="r">${fmtN(stats.area,1)} ha</td>
  </tr></tfoot>
</table>
<div style="margin-top:12px;padding-top:6px;border-top:1px solid #D4DCE8;display:flex;justify-content:space-between;align-items:center;font-size:7pt;color:#888">
  ${logoAratoSrc ? `<img src="${logoAratoSrc}" style="height:20px;object-fit:contain">` : "<span></span>"}
  <span>RacTech — Gestão Agrícola de Precisão</span>
  <span>Gerado em ${dataGeracao}</span>
</div>
</body></html>`;
  };

  // ── Exportar PDF (download via jsPDF) ─────────────────────
  const exportarPDF = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const loadImg = async (src: string): Promise<string | null> => {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    };

    const imgArato = await loadImg("/Logo_Arato.png");
    const imgFaz   = logoFaz ?? null;

    const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw   = doc.internal.pageSize.getWidth();
    const ph   = doc.internal.pageSize.getHeight();
    const mg   = 14;
    let y      = mg;

    // ── Cabeçalho ──
    if (imgFaz) {
      try { doc.addImage(imgFaz, "PNG", mg, y, 28, 11); } catch {}
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 72, 112);
      doc.text(fazenda?.nome ?? "Fazenda", mg + 31, y + 5);
      const sub = [fazenda?.municipio, fazenda?.estado].filter(Boolean).join(" · ");
      if (sub) { doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(85,85,85); doc.text(sub, mg + 31, y + 10); }
    } else {
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 72, 112);
      doc.text(fazenda?.nome ?? "Fazenda", mg, y + 8);
    }
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 72, 112);
    doc.text("RELATÓRIO DE APLICAÇÕES", pw - mg, y + 5, { align: "right" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(85,85,85);
    doc.text("por Safra / Ciclo", pw - mg, y + 11, { align: "right" });
    y += 17;

    doc.setDrawColor(26, 72, 112); doc.setLineWidth(0.4);
    doc.line(mg, y, pw - mg, y); y += 5;

    // ── Meta ──
    const cw = (pw - mg * 2) / 3;
    doc.setFillColor(243, 246, 249); doc.roundedRect(mg, y, pw - mg * 2, 9, 1.5, 1.5, "F");
    const agrupLabel = AGRUP_LABELS.find(a => a.key === agrupamento)?.label ?? "";
    [
      { label: "Gerado por: ",   val: nomeUsuario ?? "—",  x: mg + 3 },
      { label: "Data / Hora: ",  val: dataGeracao,          x: mg + cw + 3 },
      { label: "Agrupamento: ",  val: agrupLabel,           x: mg + cw * 2 + 3 },
    ].forEach(({ label, val, x }) => {
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(136,136,136);
      doc.text(label, x, y + 6);
      doc.setFont("helvetica", "bold"); doc.setTextColor(26,26,26);
      doc.text(val, x + doc.getTextWidth(label), y + 6);
    });
    y += 13;

    // ── Filtros ──
    const filtroText  = filtroDescricao || "Nenhum filtro — todos os dados";
    const filtroLines = doc.splitTextToSize(filtroText, pw - mg * 2 - 22);
    const fH = filtroLines.length * 4 + 7;
    doc.setFillColor(235, 243, 253); doc.roundedRect(mg, y, pw - mg * 2, fH, 1.5, 1.5, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 72, 112);
    doc.text("FILTROS: ", mg + 3, y + 5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(51,51,51);
    doc.text(filtroLines, mg + 3 + doc.getTextWidth("FILTROS: "), y + 5);
    y += fH + 4;

    // ── Stats ──
    const bW = (pw - mg * 2 - 9) / 4;
    [
      { l: "Aplicações",     v: String(stats.ops),          hl: false },
      { l: "Área coberta",   v: `${fmtN(stats.area,1)} ha`, hl: false },
      { l: "Custo Total",    v: fmtBRL(stats.custo),         hl: true  },
      { l: "Custo Médio/ha", v: fmtBRL(stats.custo_ha),      hl: false },
    ].forEach((s, i) => {
      const bx = mg + i * (bW + 3);
      if (s.hl) { doc.setFillColor(26, 72, 112); doc.roundedRect(bx, y, bW, 13, 1.5, 1.5, "F"); }
      else { doc.setFillColor(255,255,255); doc.setDrawColor(212,220,232); doc.setLineWidth(0.25); doc.roundedRect(bx, y, bW, 13, 1.5, 1.5, "FD"); }
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.setTextColor(s.hl ? 200 : 85, s.hl ? 210 : 85, s.hl ? 230 : 85);
      doc.text(s.l, bx + 3, y + 5);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(s.hl ? 255 : 26, s.hl ? 255 : 26, s.hl ? 255 : 26);
      doc.text(s.v, bx + 3, y + 10.5);
      doc.setFont("helvetica", "normal");
    });
    y += 17;

    // ── Tabela ──
    const cols = ["Data","Operação","Detalhe","Talhão","Ciclo","Produto / Insumo","Grupo","Dose/ha","Unid.","Total","R$/unid","R$/ha","Custo Total","Área ha"];
    const rows = linhas.map(l => {
      const det = l.tipo_op === "pulverizacao" ? (PULV_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
        : l.tipo_op === "correcao" ? (CORR_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
        : l.tipo_op === "adubacao" ? (ADU_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe) : "Semente";
      return [fmtData(l.data), OP_BADGE[l.tipo_op]?.label ?? l.tipo_op, det,
        l.talhao_nome, l.ciclo_nome, l.produto, l.grupo_nome,
        fmtN(l.dose_ha,3), l.dose_unidade, fmtN(l.total_consumido,3),
        l.valor_unitario != null ? fmtBRL(l.valor_unitario) : "—",
        fmtBRL(l.custo_ha), fmtBRL(l.custo_total), fmtN(l.area_ha,1)];
    });

    autoTable(doc, {
      startY: y, head: [cols], body: rows,
      styles: { fontSize: 6.5, cellPadding: 1.8 },
      headStyles: { fillColor: [26, 72, 112], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 7:{halign:"right"}, 8:{halign:"right"}, 9:{halign:"right"}, 10:{halign:"right"}, 11:{halign:"right"}, 12:{halign:"right",fontStyle:"bold"}, 13:{halign:"right"} },
      foot: [[`TOTAL GERAL — ${linhas.length} aplicações`,"","","","","","","","","","",fmtBRL(stats.custo_ha)+"/ha",fmtBRL(stats.custo),fmtN(stats.area,1)+" ha"]],
      footStyles: { fillColor: [26, 72, 112], textColor: 255, fontStyle: "bold" },
      didDrawPage: () => {
        const pn = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } }).getCurrentPageInfo().pageNumber;
        doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(136,136,136);
        if (imgArato) { try { doc.addImage(imgArato, "PNG", mg, ph - 7, 14, 5); } catch {} }
        doc.text("RacTech — Gestão Agrícola de Precisão", pw / 2, ph - 4, { align: "center" });
        doc.text(`Página ${pn}`, pw - mg, ph - 4, { align: "right" });
      },
    });

    const nome = `aplicacoes_${fazenda?.nome?.replace(/\s+/g,"_") ?? "fazenda"}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(nome);
  };

  // ── Imprimir (nova janela com layout idêntico ao PDF) ─────
  const imprimir = async () => {
    const loadImg = async (src: string): Promise<string> => {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        });
      } catch { return ""; }
    };
    const imgArato = await loadImg("/Logo_Arato.png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildPrintHtml(imgArato));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  // ── Exportar XLSX ─────────────────────────────────────────
  const exportarXLSX = async () => {
    const XLSX = await import("xlsx");
    const rows = linhas.map(l => ({
      "Data":             fmtData(l.data),
      "Tipo Operação":    OP_BADGE[l.tipo_op]?.label ?? l.tipo_op,
      "Detalhe":          l.tipo_op === "pulverizacao" ? (PULV_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
                        : l.tipo_op === "correcao"     ? (CORR_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
                        : l.tipo_op === "adubacao"     ? (ADU_TIPOS[l.tipo_detalhe]  ?? l.tipo_detalhe)
                        : "Semente",
      "Talhão":           l.talhao_nome,
      "Ciclo":            l.ciclo_nome,
      "Produto / Insumo": l.produto,
      "Grupo":            l.grupo_nome,
      "Subgrupo":         l.subgrupo ?? "",
      "Dose/ha":          l.dose_ha ?? "",
      "Unidade":          l.dose_unidade,
      "Total Consumido":  l.total_consumido ?? "",
      "R$/unid":          l.valor_unitario ?? "",
      "R$/ha":            l.custo_ha,
      "Custo Total (R$)": l.custo_total,
      "Área (ha)":        l.area_ha,
    }));

    // Aba Resumo
    const resumo = [
      ["Relatório",      "Aplicações por Safra / Ciclo"],
      ["Fazenda",        fazenda?.nome ?? ""],
      ["Gerado por",     nomeUsuario ?? ""],
      ["Data / Hora",    dataGeracao],
      ["Filtros",        filtroDescricao],
      [],
      ["Métrica",        "Valor"],
      ["Operações",      stats.ops],
      ["Área coberta",   stats.area],
      ["Custo Total",    stats.custo],
      ["Custo Médio/ha", stats.custo_ha],
    ];

    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(resumo);
    const ws2 = XLSX.utils.json_to_sheet(rows);

    // Largura das colunas
    ws2["!cols"] = [8,14,14,12,16,24,14,12,8,8,12,10,10,14,8].map(w => ({ wch: w }));

    XLSX.utils.book_append_sheet(wb, ws1, "Resumo");
    XLSX.utils.book_append_sheet(wb, ws2, "Aplicações");

    const nome = `aplicacoes_${fazenda?.nome?.replace(/\s+/g, "_") ?? "fazenda"}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, nome);
  };

  // ── WhatsApp: upload para Storage + link ──────────────────
  const prepararWA = async () => {
    setModalWA(true); setWaStatus("uploading"); setWaUrl("");
    try {
      const XLSX = await import("xlsx");
      const rows = linhas.map(l => ({
        Data: fmtData(l.data), Operação: OP_BADGE[l.tipo_op]?.label,
        Talhão: l.talhao_nome, Ciclo: l.ciclo_nome,
        Produto: l.produto, "Custo Total": l.custo_total, "Área ha": l.area_ha,
      }));
      const wb  = XLSX.utils.book_new();
      const ws  = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Aplicações");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const nome = `relatorios/aplicacoes_${fazendaId}_${Date.now()}.xlsx`;
      const { error } = await supabase.storage.from("arquivos").upload(nome, blob, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("arquivos").getPublicUrl(nome);
      setWaUrl(urlData.publicUrl);
      setWaStatus("done");
    } catch {
      setWaStatus("error");
    }
  };

  const abrirWA = () => {
    const phone = waPhone.replace(/\D/g, "");
    const texto = `*Relatório de Aplicações — ${fazenda?.nome ?? "Fazenda"}*\n\nGerado em ${dataGeracao} por ${nomeUsuario ?? "usuário"}\n\n${filtroDescricao}\n\n📊 *Resumo:* ${stats.ops} aplicações · ${fmtN(stats.area, 1)} ha · ${fmtBRL(stats.custo)} · ${fmtBRL(stats.custo_ha)}/ha${waUrl ? `\n\n📥 *Download:* ${waUrl}` : ""}`;
    const url = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />

      {/* ── INTERFACE PRINCIPAL (tela) ────────────────────── */}
      <main style={{ flex: 1 }}>
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Lavoura · Relatórios</div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Aplicações por Safra / Ciclo</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Pulverizações, adubações, correções de solo e sementes — com exportação PDF, XLSX e WhatsApp</p>
          </div>
          {gerado && (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnR} onClick={() => { setGerado(false); setLinhas([]); }}>← Filtros</button>
              <button style={{ ...btnV, background: "#166534", fontSize: 12 }} onClick={exportarXLSX}>⬇ XLSX</button>
              <button style={{ ...btnV, background: "#1A4870", fontSize: 12 }} onClick={exportarPDF}>⬇ PDF</button>
              <button style={{ ...btnR, fontSize: 12 }} onClick={imprimir}>🖨 Imprimir</button>
              <button style={{ ...btnV, background: "#25D366", fontSize: 12 }} onClick={prepararWA}>WhatsApp</button>
            </div>
          )}
        </header>

        {/* ── FASE 1: Filtros ─────────────────────────────── */}
        {!gerado && (
          <div style={{ padding: "20px 22px", maxWidth: 900 }}>
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 18, paddingBottom: 10, borderBottom: "0.5px solid #D4DCE8" }}>Filtros do Relatório</div>

              {/* Fazenda (só mostra se múltiplas fazendas) */}
              {todasFazendas.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Fazenda</label>
                  <select
                    style={{ ...inp, borderColor: "#1A4870", background: "#F0F6FB" }}
                    value={filtroFazenda || fid0}
                    onChange={e => { setFiltroFazenda(e.target.value); setFAno(""); setFCiclos([]); setFTalhoes([]); }}
                  >
                    {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    <option value="todas">Todas as fazendas (consolidado)</option>
                  </select>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={lbl}>Ano Safra</label>
                  <select style={inp} value={fAno} onChange={e => { setFAno(e.target.value); setFCiclos([]); }}>
                    <option value="">Todos os anos</option>
                    {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data início</label>
                  <input style={inp} type="date" value={fDtInicio} onChange={e => setFDtInicio(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Data fim</label>
                  <input style={inp} type="date" value={fDtFim} onChange={e => setFDtFim(e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>Ciclos <span style={{ color: "#888", fontWeight: 400 }}>— {fCiclos.length === 0 ? "todos" : `${fCiclos.length} selecionado(s)`}</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {ciclosFiltradosAno.length === 0 ? <span style={{ fontSize: 12, color: "#888" }}>{fAno ? "Nenhum ciclo para este ano" : "Selecione um ano safra para filtrar ciclos"}</span>
                    : ciclosFiltradosAno.map(c => {
                      const sel = fCiclos.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, border: sel ? "0.5px solid #1A5CB8" : "0.5px solid #D4DCE8", background: sel ? "#EBF3FD" : "#fff", cursor: "pointer", fontSize: 12, color: sel ? "#1A4870" : "#333", fontWeight: sel ? 600 : 400 }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleFCiclo(c.id)} style={{ accentColor: "#1A5CB8" }} />
                          {nomeCicloFn(c.id)}
                        </label>
                      );
                    })}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>Talhões <span style={{ color: "#888", fontWeight: 400 }}>— {fTalhoes.length === 0 ? "todos" : `${fTalhoes.length} selecionado(s)`}</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {talhoes.map(t => {
                    const sel = fTalhoes.includes(t.id);
                    return (
                      <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, border: sel ? "0.5px solid #1A5CB8" : "0.5px solid #D4DCE8", background: sel ? "#EBF3FD" : "#fff", cursor: "pointer", fontSize: 12, color: sel ? "#1A4870" : "#333", fontWeight: sel ? 600 : 400 }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleFTalhao(t.id)} style={{ accentColor: "#1A5CB8" }} />
                        {t.nome}{t.area_ha ? ` (${fmtN(t.area_ha, 1)} ha)` : ""}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>Tipo de Operação</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {(["pulverizacao","correcao","adubacao","plantio"] as const).map(k => {
                    const { label, bg, color } = OP_BADGE[k];
                    const sel = fTiposOp.includes(k);
                    return (
                      <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, border: sel ? `0.5px solid ${color}40` : "0.5px solid #D4DCE8", background: sel ? bg : "#fff", cursor: "pointer", fontSize: 12, color: sel ? color : "#888", fontWeight: sel ? 600 : 400 }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleFTipoOp(k)} />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                <div>
                  <label style={lbl}>Busca por produto / insumo</label>
                  <input style={inp} value={fProduto} onChange={e => setFProduto(e.target.value)} placeholder="Ex: Roundup, Potássio, NK…" />
                </div>
                <div>
                  <label style={lbl}>Agrupamento padrão</label>
                  <select style={inp} value={agrupamento} onChange={e => setAgrupamento(e.target.value as Agrupamento)}>
                    {AGRUP_LABELS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
              </div>

              {erro && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>{erro}</div>}

              <button style={{ ...btnV, opacity: carregando || fTiposOp.length === 0 ? 0.5 : 1 }} disabled={carregando || fTiposOp.length === 0} onClick={gerar}>
                {carregando ? "Carregando…" : "Gerar Relatório"}
              </button>
            </div>
          </div>
        )}

        {/* ── FASE 2: Resultado ────────────────────────────── */}
        {gerado && (
          <div style={{ padding: "18px 22px" }}>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
              {[
                { label: "Operações",     value: String(stats.ops),           sub: "registros"        },
                { label: "Área coberta",  value: `${fmtN(stats.area, 1)} ha`, sub: "hectares únicos"  },
                { label: "Custo total",   value: fmtBRL(stats.custo),         sub: "insumos"          },
                { label: "Custo médio/ha",value: fmtBRL(stats.custo_ha),      sub: "R$/ha"            },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, color: "#555" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginTop: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Switcher de agrupamento */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {AGRUP_LABELS.map(a => (
                <button key={a.key} onClick={() => setAgrupamento(a.key)} style={{ padding: "6px 14px", borderRadius: 7, border: agrupamento === a.key ? "0.5px solid #1A5CB8" : "0.5px solid #D4DCE8", background: agrupamento === a.key ? "#1A5CB8" : "#fff", color: agrupamento === a.key ? "#fff" : "#555", fontSize: 12, fontWeight: agrupamento === a.key ? 600 : 400, cursor: "pointer" }}>
                  {a.label}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#888", alignSelf: "center" }}>{linhas.length} linha{linhas.length !== 1 ? "s" : ""}</span>
            </div>

            {linhas.length === 0 ? (
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>Nenhuma aplicação encontrada para os filtros selecionados.</div>
            ) : (
              <TabelaResultado linhas={linhas} agrupamento={agrupamento} nomeCiclo={nomeCicloFn} />
            )}
          </div>
        )}
      </main>

      {/* ── Modal WhatsApp ────────────────────────────────── */}
      {modalWA && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setModalWA(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 560, maxWidth: "96vw", padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Enviar via WhatsApp</div>
              <button onClick={() => setModalWA(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>

            {waStatus === "uploading" && (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#555" }}>
                <div style={{ fontSize: 13 }}>Preparando arquivo XLSX…</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Fazendo upload para o servidor de arquivos</div>
              </div>
            )}

            {(waStatus === "done" || waStatus === "error") && (
              <>
                {waStatus === "done" && waUrl && (
                  <div style={{ background: "#DCFCE7", border: "0.5px solid #166534", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12 }}>
                    Arquivo disponível: <a href={waUrl} target="_blank" rel="noreferrer" style={{ color: "#166534", fontWeight: 600 }}>baixar XLSX</a>
                  </div>
                )}
                {waStatus === "error" && (
                  <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#7A5A12" }}>
                    Não foi possível fazer upload do arquivo. O link de download não será incluído na mensagem, mas o resumo será enviado.
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Número WhatsApp do destinatário (opcional)</label>
                  <input style={inp} value={waPhone} onChange={e => setWaPhone(e.target.value)} placeholder="Ex: 66999887766 (sem +55, sem espaços)" />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Se deixar em branco, abrirá o WhatsApp Web para você escolher o contato.</div>
                </div>

                <div style={{ background: "#F3F6F9", borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 11, color: "#333", whiteSpace: "pre-line", maxHeight: 150, overflowY: "auto", border: "0.5px solid #D4DCE8" }}>
                  {`*Relatório de Aplicações — ${fazenda?.nome ?? "Fazenda"}*\nGerado em ${dataGeracao} por ${nomeUsuario ?? ""}\n${filtroDescricao}\n\n📊 ${stats.ops} aplicações · ${fmtN(stats.area,1)} ha · ${fmtBRL(stats.custo)} · ${fmtBRL(stats.custo_ha)}/ha${waUrl ? `\n\n📥 Download: ${waUrl}` : ""}`}
                </div>

                <button style={{ ...btnV, background: "#25D366", width: "100%" }} onClick={abrirWA}>
                  Abrir WhatsApp e enviar →
                </button>

                {/* Info sobre API */}
                <div style={{ marginTop: 18, background: "#F3F6F9", borderRadius: 8, padding: 12, fontSize: 11, color: "#555" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: "#1a1a1a" }}>Para envio automático sem abrir o WhatsApp:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div><strong>Z-API</strong> — serviço brasileiro, ~R$99/mês, sem servidor. Integração via API REST. <a href="https://z-api.io" target="_blank" rel="noreferrer" style={{ color: "#1A5CB8" }}>z-api.io</a></div>
                    <div><strong>Evolution API</strong> — open source, gratuito, precisa de VPS (~R$50/mês). <a href="https://evolution-api.com" target="_blank" rel="noreferrer" style={{ color: "#1A5CB8" }}>evolution-api.com</a></div>
                    <div><strong>Meta Business API</strong> — oficial, requer aprovação Meta, cobrado por conversa.</div>
                  </div>
                  <div style={{ marginTop: 8, color: "#888", fontSize: 10 }}>Configure uma destas opções em Configurações → Automações para envio automático.</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente tabela de resultado ──────────────────────────
function TabelaResultado({ linhas, agrupamento, nomeCiclo }: { linhas: Linha[]; agrupamento: Agrupamento; nomeCiclo: (id: string) => string }) {
  if (agrupamento === "detalhado") return <TabelaDetalhada linhas={linhas} nomeCiclo={nomeCiclo} />;

  if (agrupamento === "produto") {
    const gps = Object.entries(groupBy(linhas, l => l.produto)).sort(([a],[b]) => a.localeCompare(b));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {gps.map(([prod, rows]) => (
          <SecaoAgrupada key={prod} titulo={prod} linhas={rows} cor="#1A5CB8">
            <TabelaDetalhada linhas={rows} nomeCiclo={nomeCiclo} compact />
          </SecaoAgrupada>
        ))}
        <Rodape linhas={linhas} />
      </div>
    );
  }

  if (agrupamento === "grupo") {
    const byGrupo = Object.entries(groupBy(linhas, l => l.grupo_nome)).sort(([a],[b]) => a.localeCompare(b));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {byGrupo.map(([grp, gRows]) => (
          <SecaoAgrupada key={grp} titulo={grp} linhas={gRows} cor="#166534" nivel={1}>
            {Object.entries(groupBy(gRows, l => l.subgrupo || "Geral")).sort(([a],[b]) => a.localeCompare(b)).map(([sub, sRows]) => {
              const sc = sRows.reduce((s,r) => s + r.custo_total, 0);
              const sa = sRows.reduce((s,r) => s + r.area_ha, 0);
              return (
                <div key={sub} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", padding: "4px 14px", background: "#F9FAFB", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between" }}>
                    <span>{sub}</span>
                    <span style={{ fontWeight: 400, color: "#888" }}>{fmtBRL(sc)} · {fmtBRL(sa > 0 ? sc/sa : 0)}/ha</span>
                  </div>
                  <TabelaDetalhada linhas={sRows} nomeCiclo={nomeCiclo} compact />
                </div>
              );
            })}
          </SecaoAgrupada>
        ))}
        <Rodape linhas={linhas} />
      </div>
    );
  }

  if (agrupamento === "talhao") {
    const byT = Object.entries(groupBy(linhas, l => l.talhao_nome)).sort(([a],[b]) => a.localeCompare(b));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {byT.map(([t, rows]) => (
          <SecaoAgrupada key={t} titulo={t} linhas={rows} cor="#633806">
            <TabelaDetalhada linhas={rows} nomeCiclo={nomeCiclo} compact />
          </SecaoAgrupada>
        ))}
        <Rodape linhas={linhas} />
      </div>
    );
  }

  // Por Tipo de Operação
  const byOp = groupBy(linhas, l => l.tipo_op);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(["pulverizacao","correcao","adubacao","plantio"] as const).filter(op => byOp[op]).map(op => {
        const badge = OP_BADGE[op];
        const opRows = byOp[op];
        const byDet = groupBy(opRows, l => {
          if (op === "pulverizacao") return PULV_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe;
          if (op === "correcao")     return CORR_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe;
          if (op === "adubacao")     return ADU_TIPOS[l.tipo_detalhe]  ?? l.tipo_detalhe;
          return "Semente";
        });
        return (
          <SecaoAgrupada key={op} titulo={badge.label} linhas={opRows} cor={badge.color} nivel={1}>
            {Object.entries(byDet).sort(([a],[b]) => a.localeCompare(b)).map(([det, dRows]) => {
              const dc = dRows.reduce((s,r) => s + r.custo_total, 0);
              const da = dRows.reduce((s,r) => s + r.area_ha, 0);
              return (
                <div key={det} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", padding: "4px 14px", background: "#F9FAFB", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between" }}>
                    <span>{det}</span>
                    <span style={{ fontWeight: 400, color: "#888" }}>{fmtBRL(dc)} · {fmtBRL(da > 0 ? dc/da : 0)}/ha</span>
                  </div>
                  <TabelaDetalhada linhas={dRows} nomeCiclo={nomeCiclo} compact />
                </div>
              );
            })}
          </SecaoAgrupada>
        );
      })}
      <Rodape linhas={linhas} />
    </div>
  );
}

function SecaoAgrupada({ titulo, linhas, cor, nivel = 0, children }: { titulo: string; linhas: Linha[]; cor: string; nivel?: number; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(true);
  const custo = linhas.reduce((s,l) => s + l.custo_total, 0);
  const area  = linhas.reduce((s,l) => s + l.area_ha, 0);
  return (
    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: nivel === 0 ? "10px 16px" : "8px 16px", background: nivel === 0 ? "#F3F6F9" : "#fff", borderBottom: aberto ? "0.5px solid #D4DCE8" : "none", display: "flex", alignItems: "center", cursor: "pointer", gap: 12 }} onClick={() => setAberto(!aberto)}>
        <span style={{ fontSize: 9, color: "#888", transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: nivel === 0 ? 14 : 13, color: cor }}>{titulo}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{linhas.length} aplicação{linhas.length !== 1 ? "ões" : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtBRL(custo)}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{fmtBRL(area > 0 ? custo/area : 0)}/ha</div>
        </div>
      </div>
      {aberto && <div>{children}</div>}
    </div>
  );
}

function TabelaDetalhada({ linhas, nomeCiclo, compact = false }: { linhas: Linha[]; nomeCiclo: (id: string) => string; compact?: boolean }) {
  const sorted = [...linhas].sort((a,b) => a.data.localeCompare(b.data));
  const pad = compact ? "5px 12px" : "8px 14px";
  const th: React.CSSProperties = { padding: pad, textAlign: "left", fontSize: 10, fontWeight: 600, color: "#555", background: "#F9FAFB", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: pad, fontSize: 12, color: "#1a1a1a", borderBottom: "0.5px solid #F0F3F9" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>Data</th>
            <th style={th}>Operação</th>
            <th style={th}>Talhão</th>
            <th style={th}>Ciclo</th>
            <th style={th}>Produto / Insumo</th>
            <th style={{ ...th, textAlign: "right" }}>Dose/ha</th>
            <th style={th}>Unid.</th>
            <th style={{ ...th, textAlign: "right" }}>Total</th>
            <th style={{ ...th, textAlign: "right" }}>R$/unid</th>
            <th style={{ ...th, textAlign: "right" }}>R$/ha</th>
            <th style={{ ...th, textAlign: "right" }}>Custo Total</th>
            <th style={{ ...th, textAlign: "right" }}>Área ha</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(l => {
            const det = l.tipo_op === "pulverizacao" ? (PULV_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
              : l.tipo_op === "correcao" ? (CORR_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe)
              : l.tipo_op === "adubacao" ? (ADU_TIPOS[l.tipo_detalhe] ?? l.tipo_detalhe) : "Semente";
            const badge = OP_BADGE[l.tipo_op];
            return (
              <tr key={l._id}>
                <td style={td}>{fmtData(l.data)}</td>
                <td style={td}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: badge.bg, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{det}</div>
                </td>
                <td style={td}>{l.talhao_nome}</td>
                <td style={td}>{nomeCiclo(l.ciclo_id)}</td>
                <td style={{ ...td, maxWidth: 200 }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.produto}</div>
                  {l.grupo_nome && <div style={{ fontSize: 10, color: "#888" }}>{l.grupo_nome}{l.subgrupo ? ` › ${l.subgrupo}` : ""}</div>}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{fmtN(l.dose_ha, 3)}</td>
                <td style={td}>{l.dose_unidade}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtN(l.total_consumido, 3)}</td>
                <td style={{ ...td, textAlign: "right" }}>{l.valor_unitario != null ? fmtBRL(l.valor_unitario) : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtBRL(l.custo_ha)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#1A4870" }}>{fmtBRL(l.custo_total)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtN(l.area_ha, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rodape({ linhas }: { linhas: Linha[] }) {
  const custo = linhas.reduce((s,l) => s + l.custo_total, 0);
  const area  = linhas.reduce((s,l) => s + l.area_ha, 0);
  return (
    <div style={{ background: "#1A4870", color: "#fff", borderRadius: 8, padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>TOTAL GERAL — {linhas.length} aplicação{linhas.length !== 1 ? "ões" : ""}</span>
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>Custo Total</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtBRL(custo)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>Custo Médio/ha</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtBRL(area > 0 ? custo/area : 0)}</div>
        </div>
      </div>
    </div>
  );
}
