"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import InputNumerico from "../../components/InputNumerico";
import type {
  Parceria, ParceriaParticipante, ParceriaArea, ParceriaDistribuicao,
  ParceriaApuracao, ParceriaApuracaoCota,
  GrupoEconomico, GrupoEconomicoMembro,
  ParceriaTipo, PapelParceiro, PapelGrupo,
} from "../../lib/supabase";

// ─── Paleta ──────────────────────────────────────────────────
const C = {
  azul:     "#1A4870", azulEsc:  "#0B2D50", azulClr: "#D5E8F5",
  mostr:    "#C9921B", mostrClr: "#FBF3E0",
  fundo:    "var(--bg-page)", branco:   "#ffffff",
  borda:    "var(--border)", txt:      "var(--text-1)", sub:     "var(--text-2)",
  ter:      "#666666", fraco:    "var(--text-3)",
  verde:    "#16A34A", verdeClr: "#DCFCE7",
  verm:     "#E24B4A", vermClr:  "#FEE2E2",
  larClr:   "#FEF3C7", lar:      "#D97706",
  inf:      "#378ADD", infClr:   "#DBEAFE",
};

// ─── Helpers ─────────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
const lbl  = { fontSize: 11, fontWeight: 600, color: C.sub, textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const inp  = (extra: object = {}) => ({
  width: "100%", padding: "7px 10px", border: `0.5px solid ${C.borda}`,
  borderRadius: 6, fontSize: 13, color: C.txt, backgroundColor: C.branco,
  boxSizing: "border-box" as const, ...extra,
});
const btn  = (bg: string, fg = "#fff", extra: object = {}) => ({
  background: bg, color: fg, border: "none", borderRadius: 6, padding: "7px 14px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", ...extra,
});

const TIPO_LABEL: Record<ParceriaTipo, string> = {
  parceria_agricola:  "Parceria Agrícola",
  meacao:             "Meia (50/50)",
  condominio_rural:   "Condomínio Rural",
  grupo_economico:    "Grupo Econômico",
  barter:             "Barter",
};
const TIPO_COR: Record<ParceriaTipo, string> = {
  parceria_agricola:  C.azul,
  meacao:             C.verde,
  condominio_rural:   C.mostr,
  grupo_economico:    "#7C3AED",
  barter:             C.lar,
};
const PAPEL_LABEL: Record<PapelParceiro, string> = {
  parceiro:            "Parceiro",
  parceiro_terra:      "Entra com a terra",
  parceiro_maquinas:   "Entra com máquinas",
  parceiro_capital:    "Entra com capital",
  administrador:       "Administrador",
};
const PAPELGRP_LABEL: Record<PapelGrupo, string> = {
  controladora: "Controladora",
  subsidiaria:  "Subsidiária",
  coligada:     "Coligada",
  equiparada:   "Equiparada",
};
const CUSTO_LABEL: Record<string, string> = {
  todos:                "Todos os custos (padrão)",
  semente:              "Sementes",
  fertilizante:         "Fertilizantes",
  defensivo:            "Defensivos",
  correcao_solo:        "Correção de solo",
  operacao_mecanizada:  "Operações mecanizadas",
  arrendamento:         "Arrendamento",
  mao_obra:             "Mão de obra",
  combustivel:          "Combustível",
  manutencao:           "Manutenção",
  administrativo:       "Despesas administrativas",
};
const TIPOS_CUSTO = Object.entries(CUSTO_LABEL).map(([v, l]) => ({ v, l }));

// ─── Modal genérico ───────────────────────────────────────────
function Modal({ titulo, subtitulo, children, onClose, width = 760 }: {
  titulo: string; subtitulo?: string; children: React.ReactNode;
  onClose: () => void; width?: number;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: C.branco, borderRadius: 12, width: "min(98vw, " + width + "px)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${C.borda}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.txt }}>{titulo}</div>
            {subtitulo && <div style={{ fontSize: 12, color: C.ter, marginTop: 2 }}>{subtitulo}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.ter, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Campo e grid helpers ─────────────────────────────────────
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ ...lbl, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function Grid({ cols = 2, children }: { cols?: number; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>{children}</div>;
}

// ─── Tipos locais ─────────────────────────────────────────────
type ParcNova = {
  id?: string;
  conta_id: string;
  nome: string;
  tipo: ParceriaTipo;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  modelo_nfe: "centralizado" | "fracionado";
  observacao: string;
};
type ParticNovo = {
  id?: string;
  nome: string;
  cpf_cnpj: string;
  percentual: string;
  papel: PapelParceiro;
  responsavel_nfe: boolean;
  observacao: string;
};
type DistribNova = {
  id?: string;
  participante_idx: number;
  tipo_custo: string;
  percentual: string;
};
type MembroNovo = {
  id?: string;
  nome_entidade: string;
  cpf_cnpj: string;
  papel: PapelGrupo;
  percentual_participacao: string;
};
type GrupoNovo = {
  id?: string;
  conta_id: string;
  nome: string;
  cnpj_controlador: string;
  tipo: "familiar" | "empresarial" | "cooperativa" | "condominio";
};

// ─── Componente principal ─────────────────────────────────────
export default function ParceriasPage() {
  const { contaId, fazendaId } = useAuth();
  const [aba, setAba] = useState<"parcerias" | "grupos" | "apuracao">("parcerias");

  // ── Parcerias ─────────────────────────────────────────────
  const [parcerias, setParcerias] = useState<Parceria[]>([]);
  const [loadingParc, setLoadingParc] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  // dados de detalhe do item expandido
  const [ptcMap, setPtcMap]   = useState<Record<string, ParceriaParticipante[]>>({});
  const [areaMap, setAreaMap] = useState<Record<string, ParceriaArea[]>>({});
  const [distMap, setDistMap] = useState<Record<string, ParceriaDistribuicao[]>>({});
  const [apurMap, setApurMap] = useState<Record<string, ParceriaApuracao[]>>({});

  // ── Modal parceria ────────────────────────────────────────
  const [modalParc, setModalParc]   = useState(false);
  const [abaMod, setAbaMod]         = useState<"geral" | "participantes" | "distribuicao" | "apuracao">("geral");
  const [parcForm, setParcForm]     = useState<ParcNova | null>(null);
  const [participants, setParticipants] = useState<ParticNovo[]>([]);
  const [distribs, setDistribs]     = useState<DistribNova[]>([]);
  const [salvando, setSalvando]     = useState(false);
  const [errMsg, setErrMsg]         = useState("");

  // ── Grupos econômicos ─────────────────────────────────────
  const [grupos, setGrupos]         = useState<GrupoEconomico[]>([]);
  const [loadingGrp, setLoadingGrp] = useState(true);
  const [expandidoGrp, setExpandidoGrp] = useState<string | null>(null);
  const [membrosMap, setMembrosMap] = useState<Record<string, GrupoEconomicoMembro[]>>({});
  const [modalGrp, setModalGrp]     = useState(false);
  const [grupoForm, setGrupoForm]   = useState<GrupoNovo | null>(null);
  const [membros, setMembros]       = useState<MembroNovo[]>([]);

  // ── Produtores e talhões do sistema (lookup) ──────────────
  const [produtores, setProdutores] = useState<{ id: string; nome: string; cpf_cnpj: string }[]>([]);
  const [ciclos, setCiclos]         = useState<{ id: string; descricao: string }[]>([]);
  const [talhoes, setTalhoes]       = useState<{ id: string; nome: string; area_ha: number }[]>([]);

  // ── Carga inicial ─────────────────────────────────────────
  const carregarParcerias = useCallback(async () => {
    if (!contaId) return;
    setLoadingParc(true);
    const { data } = await supabase.from("parcerias").select("*").eq("conta_id", contaId).order("nome");
    setParcerias(data ?? []);
    setLoadingParc(false);
  }, [contaId]);

  const carregarGrupos = useCallback(async () => {
    if (!contaId) return;
    setLoadingGrp(true);
    const { data } = await supabase.from("grupos_economicos").select("*").eq("conta_id", contaId).order("nome");
    setGrupos(data ?? []);
    setLoadingGrp(false);
  }, [contaId]);

  const carregarLookups = useCallback(async () => {
    if (!contaId || !fazendaId) return;
    const [{ data: prods }, { data: cics }, { data: tlhs }] = await Promise.all([
      supabase.from("produtores").select("id, nome, cpf_cnpj").eq("conta_id", contaId).order("nome"),
      supabase.from("ciclos").select("id, descricao").order("descricao"),
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    setProdutores(prods ?? []);
    setCiclos(cics ?? []);
    setTalhoes(tlhs ?? []);
  }, [contaId, fazendaId]);

  useEffect(() => {
    carregarParcerias();
    carregarGrupos();
    carregarLookups();
  }, [carregarParcerias, carregarGrupos, carregarLookups]);

  // ── Expandir parceria ─────────────────────────────────────
  const expandirParceria = async (id: string) => {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (!ptcMap[id]) {
      const [{ data: pts }, { data: ars }, { data: dst }, { data: apr }] = await Promise.all([
        supabase.from("parceria_participantes").select("*, produtor:produtores(nome, cpf_cnpj)").eq("parceria_id", id).order("percentual", { ascending: false }),
        supabase.from("parceria_areas").select("*, talhao:talhoes(nome, area_ha), ciclo:ciclos(descricao)").eq("parceria_id", id),
        supabase.from("parceria_distribuicao").select("*").eq("parceria_id", id),
        supabase.from("parceria_apuracoes").select("*").eq("parceria_id", id).order("data_apuracao", { ascending: false }),
      ]);
      setPtcMap(m => ({ ...m, [id]: pts ?? [] }));
      setAreaMap(m => ({ ...m, [id]: ars ?? [] }));
      setDistMap(m => ({ ...m, [id]: dst ?? [] }));
      setApurMap(m => ({ ...m, [id]: apr ?? [] }));
    }
  };

  const expandirGrupo = async (id: string) => {
    if (expandidoGrp === id) { setExpandidoGrp(null); return; }
    setExpandidoGrp(id);
    if (!membrosMap[id]) {
      const { data } = await supabase.from("grupo_economico_membros")
        .select("*, fazenda:fazendas(nome), produtor:produtores(nome, cpf_cnpj)")
        .eq("grupo_id", id);
      setMembrosMap(m => ({ ...m, [id]: data ?? [] }));
    }
  };

  // ── Abrir modal nova/editar parceria ──────────────────────
  const abrirModalParceria = (p?: Parceria) => {
    setAbaMod("geral");
    setErrMsg("");
    setParcForm({
      id: p?.id,
      conta_id: contaId ?? "",
      nome: p?.nome ?? "",
      tipo: p?.tipo ?? "parceria_agricola",
      descricao: p?.descricao ?? "",
      data_inicio: p?.data_inicio ?? "",
      data_fim: p?.data_fim ?? "",
      ativa: p?.ativa ?? true,
      modelo_nfe: p?.modelo_nfe ?? "centralizado",
      observacao: p?.observacao ?? "",
    });
    setParticipants([]);
    setDistribs([]);
    if (p?.id) {
      supabase.from("parceria_participantes").select("*").eq("parceria_id", p.id).order("percentual", { ascending: false })
        .then(({ data }) => {
          setParticipants((data ?? []).map((pt: ParceriaParticipante) => ({
            id: pt.id,
            nome: (pt.produtor as { nome?: string })?.nome ?? pt.nome_override ?? "",
            cpf_cnpj: (pt.produtor as { cpf_cnpj?: string })?.cpf_cnpj ?? pt.cpf_cnpj_override ?? "",
            percentual: String(pt.percentual),
            papel: pt.papel,
            responsavel_nfe: pt.responsavel_nfe,
            observacao: pt.observacao ?? "",
          })));
        });
      supabase.from("parceria_distribuicao").select("*").eq("parceria_id", p.id)
        .then(({ data }) => {
          setDistribs((data ?? []).map((d: ParceriaDistribuicao & { _idx?: number }, _i: number) => ({
            id: d.id,
            participante_idx: 0,
            tipo_custo: d.tipo_custo,
            percentual: String(d.percentual),
          })));
        });
    }
    setModalParc(true);
  };

  // ── Salvar parceria ───────────────────────────────────────
  const salvarParceria = async () => {
    if (!parcForm) return;
    if (!parcForm.nome.trim()) { setErrMsg("Nome da parceria é obrigatório."); return; }
    const totalPct = participants.reduce((s, p) => s + Number(p.percentual || 0), 0);
    if (participants.length > 0 && Math.abs(totalPct - 100) > 0.1) {
      setErrMsg(`Soma dos percentuais dos participantes = ${totalPct.toFixed(2)}% (deve ser 100%).`);
      return;
    }
    setSalvando(true);
    setErrMsg("");
    try {
      const payload = {
        conta_id: parcForm.conta_id,
        nome: parcForm.nome.trim(),
        tipo: parcForm.tipo,
        descricao: parcForm.descricao || null,
        data_inicio: parcForm.data_inicio || null,
        data_fim: parcForm.data_fim || null,
        ativa: parcForm.ativa,
        modelo_nfe: parcForm.modelo_nfe,
        observacao: parcForm.observacao || null,
      };
      let parcId = parcForm.id;
      if (parcId) {
        await supabase.from("parcerias").update(payload).eq("id", parcId);
      } else {
        const { data, error } = await supabase.from("parcerias").insert(payload).select("id").single();
        if (error) throw error;
        parcId = data.id;
      }
      // salvar participantes
      if (parcId && participants.length > 0) {
        await supabase.from("parceria_participantes").delete().eq("parceria_id", parcId);
        await supabase.from("parceria_participantes").insert(
          participants.map(pt => ({
            parceria_id: parcId,
            nome_override: pt.nome,
            cpf_cnpj_override: pt.cpf_cnpj,
            percentual: Number(pt.percentual),
            papel: pt.papel,
            responsavel_nfe: pt.responsavel_nfe,
            observacao: pt.observacao || null,
          }))
        );
      }
      // salvar distribuições
      if (parcId && distribs.length > 0) {
        await supabase.from("parceria_distribuicao").delete().eq("parceria_id", parcId);
        // Buscar ids dos participantes recém salvos para vincular
        const { data: ptsSalvos } = await supabase.from("parceria_participantes")
          .select("id, nome_override").eq("parceria_id", parcId);
        if (ptsSalvos && ptsSalvos.length > 0) {
          await supabase.from("parceria_distribuicao").insert(
            distribs.filter(d => d.participante_idx < ptsSalvos.length).map(d => ({
              parceria_id: parcId,
              participante_id: ptsSalvos[d.participante_idx]?.id,
              tipo_custo: d.tipo_custo,
              percentual: Number(d.percentual),
            })).filter(d => d.participante_id)
          );
        }
      }

      setModalParc(false);
      // invalida cache do item
      if (parcId) {
        setPtcMap(m => { const n = { ...m }; delete n[parcId!]; return n; });
        setAreaMap(m => { const n = { ...m }; delete n[parcId!]; return n; });
        setDistMap(m => { const n = { ...m }; delete n[parcId!]; return n; });
      }
      await carregarParcerias();
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      setSalvando(false);
    }
  };

  const excluirParceria = async (id: string, nome: string) => {
    if (!confirm(`Excluir parceria "${nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("parcerias").delete().eq("id", id);
    setParcerias(p => p.filter(x => x.id !== id));
    if (expandido === id) setExpandido(null);
  };

  // ── Modal grupo econômico ─────────────────────────────────
  const abrirModalGrupo = (g?: GrupoEconomico) => {
    setGrupoForm({
      id: g?.id,
      conta_id: contaId ?? "",
      nome: g?.nome ?? "",
      cnpj_controlador: g?.cnpj_controlador ?? "",
      tipo: g?.tipo ?? "familiar",
    });
    setMembros([]);
    if (g?.id) {
      supabase.from("grupo_economico_membros").select("*").eq("grupo_id", g.id)
        .then(({ data }) => {
          setMembros((data ?? []).map((m: GrupoEconomicoMembro) => ({
            id: m.id,
            nome_entidade: m.nome_entidade ?? "",
            cpf_cnpj: m.cpf_cnpj ?? "",
            papel: m.papel,
            percentual_participacao: String(m.percentual_participacao ?? ""),
          })));
        });
    }
    setModalGrp(true);
  };

  const salvarGrupo = async () => {
    if (!grupoForm) return;
    if (!grupoForm.nome.trim()) return;
    try {
      const payload = {
        conta_id: grupoForm.conta_id,
        nome: grupoForm.nome.trim(),
        cnpj_controlador: grupoForm.cnpj_controlador || null,
        tipo: grupoForm.tipo,
      };
      let gid = grupoForm.id;
      if (gid) {
        await supabase.from("grupos_economicos").update(payload).eq("id", gid);
      } else {
        const { data } = await supabase.from("grupos_economicos").insert(payload).select("id").single();
        gid = data?.id;
      }
      if (gid && membros.length > 0) {
        await supabase.from("grupo_economico_membros").delete().eq("grupo_id", gid);
        await supabase.from("grupo_economico_membros").insert(
          membros.map(m => ({
            grupo_id: gid,
            nome_entidade: m.nome_entidade,
            cpf_cnpj: m.cpf_cnpj || null,
            papel: m.papel,
            percentual_participacao: m.percentual_participacao ? Number(m.percentual_participacao) : null,
          }))
        );
      }
      setModalGrp(false);
      if (gid) setMembrosMap(m => { const n = { ...m }; delete n[gid!]; return n; });
      await carregarGrupos();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Apuração de resultado ─────────────────────────────────
  const [apurModal, setApurModal]   = useState(false);
  const [apurParcId, setApurParcId] = useState<string | null>(null);
  const [apurParcNome, setApurParcNome] = useState("");
  const [apurForm, setApurForm]     = useState<{
    ciclo_id: string; ano_safra_id: string;
    receita_total: string; data_apuracao: string; observacao: string;
    custos: Record<string, string>;
  }>({ ciclo_id: "", ano_safra_id: "", receita_total: "", data_apuracao: "", observacao: "", custos: {} });
  const [apurParticipantes, setApurParticipantes] = useState<ParceriaParticipante[]>([]);
  const [apurDistrib, setApurDistrib] = useState<ParceriaDistribuicao[]>([]);
  const [apurCotas, setApurCotas]   = useState<ParceriaApuracaoCota[]>([]);
  const [calculado, setCalculado]   = useState(false);

  const abrirApuracao = async (parcId: string, parcNome: string) => {
    setApurParcId(parcId);
    setApurParcNome(parcNome);
    setApurForm({ ciclo_id: "", ano_safra_id: "", receita_total: "", data_apuracao: new Date().toISOString().slice(0, 10), observacao: "", custos: {} });
    setApurCotas([]);
    setCalculado(false);
    const [{ data: pts }, { data: dst }] = await Promise.all([
      supabase.from("parceria_participantes").select("*").eq("parceria_id", parcId),
      supabase.from("parceria_distribuicao").select("*").eq("parceria_id", parcId),
    ]);
    setApurParticipantes(pts ?? []);
    setApurDistrib(dst ?? []);
    setApurModal(true);
  };

  const calcularApuracao = () => {
    const receita = Number(apurForm.receita_total || 0);
    const custos: Record<string, number> = {};
    for (const [k, v] of Object.entries(apurForm.custos)) {
      if (v) custos[k] = Number(v);
    }
    // Calcular cotas
    const cotas = apurParticipantes.map(pt => {
      const receita_cota = receita * (pt.percentual / 100);
      let custo_cota = 0;
      for (const [tipoCusto, valorCusto] of Object.entries(custos)) {
        const regra = apurDistrib.find(d => d.participante_id === pt.id && d.tipo_custo === tipoCusto)
                   ?? apurDistrib.find(d => d.participante_id === pt.id && d.tipo_custo === "todos");
        const pct = regra ? regra.percentual : pt.percentual;
        custo_cota += valorCusto * (pct / 100);
      }
      return {
        id: "", apuracao_id: "",
        participante_id: pt.id,
        receita_cota, custo_cota,
        resultado_cota: receita_cota - custo_cota,
        lancado_sped: false,
        _nome: (pt.produtor as { nome?: string })?.nome ?? pt.nome_override ?? "Participante",
        _pct: pt.percentual,
      };
    });
    setApurCotas(cotas as ParceriaApuracaoCota[]);
    setCalculado(true);
  };

  const salvarApuracaoFinal = async () => {
    if (!apurParcId || apurCotas.length === 0) return;
    const receita = Number(apurForm.receita_total || 0);
    const custoTotal = Object.values(apurForm.custos).reduce((s, v) => s + Number(v || 0), 0);
    const { data: apuracaoData } = await supabase.from("parceria_apuracoes").insert({
      parceria_id: apurParcId,
      ciclo_id: apurForm.ciclo_id || null,
      receita_total: receita,
      custo_total: custoTotal,
      resultado_liquido: receita - custoTotal,
      status: "aprovada",
      data_apuracao: apurForm.data_apuracao || null,
      observacao: apurForm.observacao || null,
    }).select("id").single();
    if (apuracaoData) {
      await supabase.from("parceria_apuracao_cotas").insert(
        apurCotas.map(c => ({
          apuracao_id: apuracaoData.id,
          participante_id: c.participante_id,
          receita_cota: c.receita_cota,
          custo_cota: c.custo_cota,
          resultado_cota: c.resultado_cota,
          lancado_sped: false,
        }))
      );
    }
    setApurModal(false);
    // invalidar cache
    setApurMap(m => { const n = { ...m }; delete n[apurParcId!]; return n; });
    if (expandido === apurParcId) await expandirParceria(apurParcId);
  };

  // ── Geração LCDPR por participante ────────────────────────
  const gerarLcdprParticipante = (
    p: Parceria,
    pts: ParceriaParticipante[],
    apuracoes: ParceriaApuracao[]
  ): string => {
    const linhas: string[] = [];
    linhas.push(`LCDPR — Cota-parte de Parceria`);
    linhas.push(`Parceria: ${p.nome} | Tipo: ${TIPO_LABEL[p.tipo]}`);
    linhas.push(`Modelo NF-e: ${p.modelo_nfe === "centralizado" ? "Centralizado (1 emitente)" : "Fracionado (cada parceiro emite sua cota)"}`);
    linhas.push("");
    linhas.push("Participante | CPF/CNPJ | % | Receita Cota | Custo Cota | Resultado");
    for (const pt of pts) {
      const nome = (pt.produtor as { nome?: string })?.nome ?? pt.nome_override ?? "?";
      const doc  = (pt.produtor as { cpf_cnpj?: string })?.cpf_cnpj ?? pt.cpf_cnpj_override ?? "?";
      let recCota = 0, cstCota = 0;
      for (const apr of apuracoes) {
        recCota += apr.receita_total * (pt.percentual / 100);
        cstCota += apr.custo_total  * (pt.percentual / 100);
      }
      linhas.push(`${nome} | ${doc} | ${pt.percentual}% | ${fmtBRL(recCota)} | ${fmtBRL(cstCota)} | ${fmtBRL(recCota - cstCota)}`);
    }
    linhas.push("");
    linhas.push("Fundamento: IN RFB 1.848/2018 — LCDPR, Art. 6° §2° (parceiros declaram sua cota-parte)");
    return linhas.join("\n");
  };

  // ── Geração SPED ECD — apuração parceria ─────────────────
  const gerarSpedParceria = (
    p: Parceria,
    pts: ParceriaParticipante[],
    apuracoes: ParceriaApuracao[],
  ): string => {
    const linhas: string[] = [];
    const d = new Date();
    const dtHoje = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

    linhas.push(`|I001|1|`);
    let seq = 1;
    for (const apr of apuracoes) {
      const dataApr = apr.data_apuracao ? apr.data_apuracao.split("-").reverse().join("") : dtHoje.replace(/\//g,"");
      // I100 — Identificação da parceria como centro de resultado
      linhas.push(`|I100|${String(seq++).padStart(9,"0")}|${dataApr}|Apuração Parceria ${p.nome}|${apr.resultado_liquido.toFixed(2)}|`);
      // I155 — Lançamentos de rateio por participante
      for (const pt of pts) {
        const nome = (pt.produtor as { nome?: string })?.nome ?? pt.nome_override ?? "Participante";
        const recCota = apr.receita_total * (pt.percentual / 100);
        const cstCota = apr.custo_total   * (pt.percentual / 100);
        const res     = recCota - cstCota;
        // Rateio de receita
        linhas.push(`|I155|${String(seq++).padStart(9,"0")}|${dataApr}|Cota-parte receita ${pt.percentual}% - ${nome}|3.3.01|2.1.99|${recCota.toFixed(2)}|D|`);
        // Rateio de custo
        linhas.push(`|I155|${String(seq++).padStart(9,"0")}|${dataApr}|Cota-parte custo ${pt.percentual}% - ${nome}|2.1.99|3.3.02|${cstCota.toFixed(2)}|C|`);
        // Resultado da cota
        linhas.push(`|I155|${String(seq++).padStart(9,"0")}|${dataApr}|Resultado cota-parte ${nome} (${pt.percentual}%)|3.3.03|2.1.${String(seq).padStart(2,"0")}|${Math.abs(res).toFixed(2)}|${res >= 0 ? "C" : "D"}|`);
      }
    }
    linhas.push(`|I990|${seq}|`);
    return linhas.join("\n");
  };

  // ─── Render ───────────────────────────────────────────────
  const totalPct = participants.reduce((s, p) => s + Number(p.percentual || 0), 0);

  return (
    <div style={{ background: C.fundo, minHeight: "100vh" }}>
      <TopNav />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.mostr, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>FISCAL / CADASTROS</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.txt, margin: 0 }}>Parcerias & Grupos Econômicos</h1>
              <p style={{ fontSize: 13, color: C.ter, margin: "4px 0 0" }}>
                Lei 4.504/1964 (Estatuto da Terra) · LCDPR IN RFB 1.848/2018 · SPED ECD Leiaute 10
              </p>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${C.borda}`, paddingBottom: 0 }}>
          {(["parcerias", "grupos", "apuracao"] as const).map(a => {
            const labels = { parcerias: "Parcerias Agrícolas", grupos: "Grupos Econômicos", apuracao: "Apuração & SPED" };
            const ativo = aba === a;
            return (
              <button key={a} onClick={() => setAba(a)} style={{
                padding: "8px 18px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                borderRadius: "6px 6px 0 0", background: ativo ? C.branco : "transparent",
                color: ativo ? C.azul : C.sub,
                borderBottom: ativo ? `2px solid ${C.azul}` : "2px solid transparent",
              }}>{labels[a]}</button>
            );
          })}
        </div>

        {/* ── ABA PARCERIAS ─────────────────────────────── */}
        {aba === "parcerias" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.ter }}>
                {parcerias.length} parceria{parcerias.length !== 1 ? "s" : ""} cadastrada{parcerias.length !== 1 ? "s" : ""}
              </div>
              <button onClick={() => abrirModalParceria()} style={btn(C.verde)}>+ Nova Parceria</button>
            </div>

            {loadingParc ? (
              <div style={{ textAlign: "center", padding: 40, color: C.ter }}>Carregando…</div>
            ) : parcerias.length === 0 ? (
              <div style={{ background: C.branco, borderRadius: 12, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🤝</div>
                <div style={{ fontWeight: 600, color: C.txt, marginBottom: 4 }}>Nenhuma parceria cadastrada</div>
                <div style={{ fontSize: 13, color: C.ter }}>Parcerias agrícolas permitem dividir produção e custos entre produtores (Lei 4.504/1964).</div>
              </div>
            ) : parcerias.map(p => {
              const aberto = expandido === p.id;
              const cor = TIPO_COR[p.tipo] ?? C.azul;
              return (
                <div key={p.id} style={{ background: C.branco, borderRadius: 10, border: `0.5px solid ${C.borda}`, marginBottom: 10, overflow: "hidden" }}>
                  {/* Cabeçalho */}
                  <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", gap: 14, cursor: "pointer" }}
                    onClick={() => expandirParceria(p.id)}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.ativa ? C.verde : C.fraco, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.txt }}>{p.nome}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: cor + "18", color: cor }}>
                          {TIPO_LABEL[p.tipo]}
                        </span>
                        <span style={{ fontSize: 11, color: C.ter, padding: "2px 8px", borderRadius: 10, background: C.fundo }}>
                          {p.modelo_nfe === "centralizado" ? "NF-e Centralizada" : "NF-e Fracionada"}
                        </span>
                      </div>
                      {p.descricao && <div style={{ fontSize: 12, color: C.ter, marginTop: 2 }}>{p.descricao}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); abrirApuracao(p.id, p.nome); }}
                        style={btn(C.mostrClr, C.mostr, { fontSize: 12, padding: "5px 10px" })}>Apurar</button>
                      <button onClick={e => { e.stopPropagation(); abrirModalParceria(p); }}
                        style={btn(C.azulClr, C.azul, { fontSize: 12, padding: "5px 10px" })}>Editar</button>
                      <button onClick={e => { e.stopPropagation(); excluirParceria(p.id, p.nome); }}
                        style={btn(C.vermClr, C.verm, { fontSize: 12, padding: "5px 10px" })}>Excluir</button>
                      <span style={{ color: C.ter }}>{aberto ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Detalhe expandido */}
                  {aberto && (
                    <div style={{ borderTop: `1px solid ${C.borda}`, padding: "16px 18px", background: "#fafbfc" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                        {/* Participantes */}
                        <div>
                          <div style={{ ...lbl, marginBottom: 8 }}>Participantes</div>
                          {(ptcMap[p.id] ?? []).length === 0 ? (
                            <div style={{ fontSize: 12, color: C.ter }}>Nenhum participante cadastrado</div>
                          ) : (ptcMap[p.id] ?? []).map(pt => (
                            <div key={pt.id} style={{ marginBottom: 6, padding: "8px 10px", background: C.branco, borderRadius: 6, border: `0.5px solid ${C.borda}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: C.txt }}>
                                  {(pt.produtor as { nome?: string })?.nome ?? pt.nome_override ?? "?"}
                                </span>
                                <span style={{ fontWeight: 700, fontSize: 14, color: cor }}>{pt.percentual}%</span>
                              </div>
                              <div style={{ fontSize: 11, color: C.ter }}>
                                {(pt.produtor as { cpf_cnpj?: string })?.cpf_cnpj ?? pt.cpf_cnpj_override ?? ""}
                                {" · "}{PAPEL_LABEL[pt.papel]}
                                {pt.responsavel_nfe && <span style={{ color: C.verde, marginLeft: 6 }}>✓ emite NF-e</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Áreas */}
                        <div>
                          <div style={{ ...lbl, marginBottom: 8 }}>Áreas Vinculadas</div>
                          {(areaMap[p.id] ?? []).length === 0 ? (
                            <div style={{ fontSize: 12, color: C.ter }}>Todos os talhões da conta</div>
                          ) : (areaMap[p.id] ?? []).map(a => (
                            <div key={a.id} style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>
                              • {(a.talhao as { nome?: string })?.nome ?? a.talhao_id}
                              {a.area_ha_override && ` (${a.area_ha_override} ha)`}
                              {" — "}{(a.ciclo as { descricao?: string })?.descricao ?? "Todos os ciclos"}
                            </div>
                          ))}
                        </div>

                        {/* Distribuição de custos */}
                        <div>
                          <div style={{ ...lbl, marginBottom: 8 }}>Distribuição de Custos</div>
                          {(distMap[p.id] ?? []).length === 0 ? (
                            <div style={{ fontSize: 12, color: C.ter }}>Proporcional ao % de cada participante</div>
                          ) : (distMap[p.id] ?? []).map(d => (
                            <div key={d.id} style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>
                              {CUSTO_LABEL[d.tipo_custo] ?? d.tipo_custo}: {d.percentual}%
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Apurações */}
                      {(apurMap[p.id] ?? []).length > 0 && (
                        <div style={{ marginTop: 16, borderTop: `1px solid ${C.borda}`, paddingTop: 14 }}>
                          <div style={{ ...lbl, marginBottom: 8 }}>Apurações de Resultado</div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr>
                                {["Data", "Receita Total", "Custo Total", "Resultado", "Status", ""].map(h => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", background: C.fundo, fontWeight: 600, fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.borda}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(apurMap[p.id] ?? []).map(a => (
                                <tr key={a.id}>
                                  <td style={{ padding: "8px 10px" }}>{a.data_apuracao ?? "—"}</td>
                                  <td style={{ padding: "8px 10px", color: C.verde }}>{fmtBRL(a.receita_total)}</td>
                                  <td style={{ padding: "8px 10px", color: C.verm }}>{fmtBRL(a.custo_total)}</td>
                                  <td style={{ padding: "8px 10px", fontWeight: 700, color: a.resultado_liquido >= 0 ? C.verde : C.verm }}>{fmtBRL(a.resultado_liquido)}</td>
                                  <td style={{ padding: "8px 10px" }}>
                                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                      background: a.status === "aprovada" ? C.verdeClr : a.status === "lancada_sped" ? C.infClr : C.mostrClr,
                                      color: a.status === "aprovada" ? C.verde : a.status === "lancada_sped" ? C.inf : C.mostr }}>
                                      {a.status === "rascunho" ? "Rascunho" : a.status === "aprovada" ? "Aprovada" : "Lançada SPED"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "8px 10px" }}>
                                    <button
                                      onClick={async () => {
                                        const txt = gerarSpedParceria(p, ptcMap[p.id] ?? [], [a]);
                                        const blob = new Blob([txt], { type: "text/plain" });
                                        const url = URL.createObjectURL(blob);
                                        const a2 = document.createElement("a");
                                        a2.href = url; a2.download = `SPED_Parceria_${p.nome.replace(/\s+/g,"_")}.txt`;
                                        a2.click(); URL.revokeObjectURL(url);
                                      }}
                                      style={btn(C.infClr, C.inf, { fontSize: 11, padding: "3px 8px" })}>
                                      ⬇ SPED
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* LCDPR */}
                      {(ptcMap[p.id] ?? []).length > 0 && (apurMap[p.id] ?? []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => {
                              const txt = gerarLcdprParticipante(p, ptcMap[p.id] ?? [], apurMap[p.id] ?? []);
                              const blob = new Blob([txt], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a2 = document.createElement("a");
                              a2.href = url; a2.download = `LCDPR_Parceria_${p.nome.replace(/\s+/g,"_")}.txt`;
                              a2.click(); URL.revokeObjectURL(url);
                            }}
                            style={btn(C.mostrClr, C.mostr, { fontSize: 12 })}>
                            ⬇ Exportar LCDPR (cota-parte por participante)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── ABA GRUPOS ECONÔMICOS ─────────────────────── */}
        {aba === "grupos" && (
          <>
            <div style={{ background: C.infClr, border: `0.5px solid ${C.inf}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.azulEsc }}>
              <strong>Grupo Econômico</strong> — conjunto de empresas ou pessoas sob mesmo controle. Permite visão consolidada de DRE, balanço e fluxo de caixa. Não é uma parceria (sem compartilhamento de produção), mas tem implicações em preços de transferência e consolidação SPED.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.ter }}>{grupos.length} grupo{grupos.length !== 1 ? "s" : ""} cadastrado{grupos.length !== 1 ? "s" : ""}</div>
              <button onClick={() => abrirModalGrupo()} style={btn(C.verde)}>+ Novo Grupo</button>
            </div>

            {loadingGrp ? (
              <div style={{ textAlign: "center", padding: 40, color: C.ter }}>Carregando…</div>
            ) : grupos.length === 0 ? (
              <div style={{ background: C.branco, borderRadius: 12, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
                <div style={{ fontWeight: 600, color: C.txt, marginBottom: 4 }}>Nenhum grupo econômico cadastrado</div>
              </div>
            ) : grupos.map(g => {
              const aberto = expandidoGrp === g.id;
              const TIPO_GRP = { familiar: "Familiar", empresarial: "Empresarial", cooperativa: "Cooperativa", condominio: "Condomínio" };
              return (
                <div key={g.id} style={{ background: C.branco, borderRadius: 10, border: `0.5px solid ${C.borda}`, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", gap: 14, cursor: "pointer" }} onClick={() => expandirGrupo(g.id)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{g.nome}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#7C3AED18", color: "#7C3AED" }}>
                          {TIPO_GRP[g.tipo]}
                        </span>
                      </div>
                      {g.cnpj_controlador && <div style={{ fontSize: 12, color: C.ter }}>CNPJ Controladora: {g.cnpj_controlador}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); abrirModalGrupo(g); }}
                        style={btn(C.azulClr, C.azul, { fontSize: 12, padding: "5px 10px" })}>Editar</button>
                      <button onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`Excluir grupo "${g.nome}"?`)) return;
                        await supabase.from("grupos_economicos").delete().eq("id", g.id);
                        setGrupos(gs => gs.filter(x => x.id !== g.id));
                      }} style={btn(C.vermClr, C.verm, { fontSize: 12, padding: "5px 10px" })}>Excluir</button>
                      <span style={{ color: C.ter }}>{aberto ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {aberto && (
                    <div style={{ borderTop: `1px solid ${C.borda}`, padding: "14px 18px", background: "#fafbfc" }}>
                      <div style={{ ...lbl, marginBottom: 8 }}>Membros do Grupo</div>
                      {(membrosMap[g.id] ?? []).length === 0 ? (
                        <div style={{ fontSize: 13, color: C.ter }}>Nenhum membro. Edite o grupo para adicionar.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              {["Entidade", "CPF / CNPJ", "Papel", "Participação %"].map(h => (
                                <th key={h} style={{ textAlign: "left", padding: "6px 10px", background: C.fundo, fontWeight: 600, fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.borda}` }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(membrosMap[g.id] ?? []).map(m => (
                              <tr key={m.id}>
                                <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                  {(m.fazenda as { nome?: string })?.nome ?? (m.produtor as { nome?: string })?.nome ?? m.nome_entidade}
                                </td>
                                <td style={{ padding: "8px 10px", color: C.ter }}>
                                  {(m.produtor as { cpf_cnpj?: string })?.cpf_cnpj ?? m.cpf_cnpj ?? "—"}
                                </td>
                                <td style={{ padding: "8px 10px" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                    background: m.papel === "controladora" ? "#7C3AED18" : C.fundo, color: m.papel === "controladora" ? "#7C3AED" : C.sub }}>
                                    {PAPELGRP_LABEL[m.papel]}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 10px" }}>{m.percentual_participacao != null ? fmtPct(m.percentual_participacao) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── ABA APURAÇÃO & SPED ───────────────────────── */}
        {aba === "apuracao" && (
          <div style={{ background: C.branco, borderRadius: 12, padding: 28 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, color: C.txt }}>Apuração de Resultado e Integração SPED</h3>
            <p style={{ fontSize: 13, color: C.ter, marginTop: 0, marginBottom: 24 }}>
              Selecione uma parceria na aba "Parcerias Agrícolas" e clique em "Apurar" para registrar os resultados por safra.
              Após a apuração, os arquivos SPED ECD e LCDPR são gerados automaticamente.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {[
                { titulo: "SPED ECD — Leiaute 10", descr: "Bloco I: lançamentos de rateio de parceria (I155). Cada apuração gera partidas dobradas por participante.", tipo: "contabil", cor: C.azul },
                { titulo: "LCDPR", descr: "Livro Caixa do Produtor Rural (IN RFB 1.848/2018). Art. 6° §2°: participante PF declara cota-parte da receita e custo.", tipo: "lcdpr", cor: C.verde },
              ].map(item => (
                <div key={item.tipo} style={{ padding: 20, border: `1px solid ${C.borda}`, borderRadius: 10, background: C.fundo }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: item.cor, marginBottom: 6 }}>{item.titulo}</div>
                  <div style={{ fontSize: 13, color: C.ter }}>{item.descr}</div>
                </div>
              ))}
            </div>

            <div style={{ background: C.mostrClr, border: `0.5px solid ${C.mostr}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.mostr }}>
              <strong>Base legal:</strong> Lei 4.504/1964 Art. 96 (parceria agrícola) · IN RFB 1.848/2018 (LCDPR) · Instrução Normativa RFB 1.420/2013 (SPED ECD) · LC 214/2025 (Reforma Tributária — IBS/CBS mantém parceria como não-sujeito passivo autônomo)
            </div>

            <div style={{ marginTop: 20, fontSize: 13, color: C.sub }}>
              <strong>Modelo centralizado vs. fracionado:</strong>
              <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
                <li><strong>Centralizado</strong>: um parceiro emite NF-e por 100% da produção. O repasse da cota dos demais parceiros é feito via Contrato de Parceria e registrado no LCDPR de cada um como "cota-parte recebida". O SPED ECD do centralizador registra a saída da cota como despesa.</li>
                <li><strong>Fracionado</strong>: cada parceiro emite NF-e pela sua cota (ex.: 60% + 40%). A negociação com a trading pode exigir duas NF-e distintas. Mais complexo operacionalmente, mas mais limpo fiscalmente para cada participante.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL PARCERIA ──────────────────────────────── */}
      {modalParc && parcForm && (
        <Modal
          titulo={parcForm.id ? `Editar — ${parcForm.nome || "Parceria"}` : "Nova Parceria Agrícola"}
          subtitulo="Lei 4.504/1964, Art. 96 · Parceria Rural"
          onClose={() => setModalParc(false)}
          width={900}
        >
          {/* Abas do modal */}
          <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${C.borda}` }}>
            {(["geral", "participantes", "distribuicao"] as const).map(a => {
              const labels = { geral: "Dados Gerais", participantes: `Participantes (${participants.length})`, distribuicao: `Distribuição de Custos (${distribs.length})` };
              return (
                <button key={a} onClick={() => setAbaMod(a)} style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                  borderRadius: "5px 5px 0 0", background: abaMod === a ? C.branco : "transparent",
                  color: abaMod === a ? C.azul : C.sub,
                  borderBottom: abaMod === a ? `2px solid ${C.azul}` : "2px solid transparent",
                }}>{labels[a]}</button>
              );
            })}
          </div>

          {/* Aba Geral */}
          {abaMod === "geral" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Grid cols={2}>
                <Campo label="Nome da Parceria *">
                  <input style={inp()} value={parcForm.nome}
                    onChange={e => setParcForm(f => f && { ...f, nome: e.target.value })} />
                </Campo>
                <Campo label="Tipo">
                  <select style={inp()} value={parcForm.tipo}
                    onChange={e => setParcForm(f => f && { ...f, tipo: e.target.value as ParceriaTipo })}>
                    {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Campo>
              </Grid>
              <Campo label="Descrição">
                <input style={inp()} value={parcForm.descricao}
                  onChange={e => setParcForm(f => f && { ...f, descricao: e.target.value })} />
              </Campo>
              <Grid cols={3}>
                <Campo label="Data de Início">
                  <input type="date" style={inp()} value={parcForm.data_inicio}
                    onChange={e => setParcForm(f => f && { ...f, data_inicio: e.target.value })} />
                </Campo>
                <Campo label="Data de Fim">
                  <input type="date" style={inp()} value={parcForm.data_fim}
                    onChange={e => setParcForm(f => f && { ...f, data_fim: e.target.value })} />
                </Campo>
                <Campo label="Status">
                  <select style={inp()} value={parcForm.ativa ? "ativa" : "inativa"}
                    onChange={e => setParcForm(f => f && { ...f, ativa: e.target.value === "ativa" })}>
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                  </select>
                </Campo>
              </Grid>
              <Campo label="Modelo de Emissão NF-e">
                <select style={inp()} value={parcForm.modelo_nfe}
                  onChange={e => setParcForm(f => f && { ...f, modelo_nfe: e.target.value as "centralizado" | "fracionado" })}>
                  <option value="centralizado">Centralizado — um parceiro emite 100% e reparte internamente</option>
                  <option value="fracionado">Fracionado — cada parceiro emite sua cota individualmente</option>
                </select>
              </Campo>
              <Campo label="Observação">
                <textarea style={{ ...inp(), resize: "vertical", minHeight: 60 }} value={parcForm.observacao}
                  onChange={e => setParcForm(f => f && { ...f, observacao: e.target.value })} />
              </Campo>
            </div>
          )}

          {/* Aba Participantes */}
          {abaMod === "participantes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: C.ter }}>
                  Soma dos percentuais:{" "}
                  <span style={{ fontWeight: 700, color: Math.abs(totalPct - 100) < 0.1 ? C.verde : C.verm }}>
                    {totalPct.toFixed(2)}%
                  </span>
                  {Math.abs(totalPct - 100) < 0.1 && <span style={{ color: C.verde, marginLeft: 6 }}>✓ OK</span>}
                </div>
                <button onClick={() => setParticipants(p => [...p, {
                  nome: "", cpf_cnpj: "", percentual: "", papel: "parceiro", responsavel_nfe: false, observacao: ""
                }])} style={btn(C.azulClr, C.azul, { fontSize: 12 })}>+ Participante</button>
              </div>

              {participants.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: C.ter, fontSize: 13 }}>
                  Nenhum participante. Adicione ao menos 2 participantes.
                </div>
              )}

              {participants.map((pt, i) => (
                <div key={i} style={{ background: C.fundo, borderRadius: 8, padding: 14, marginBottom: 10, border: `0.5px solid ${C.borda}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: C.sub }}>Participante {i + 1}</span>
                    <button onClick={() => setParticipants(p => p.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: C.verm, cursor: "pointer", fontSize: 13 }}>Remover</button>
                  </div>
                  <Grid cols={3}>
                    <Campo label="Nome *">
                      <input style={inp()} value={pt.nome} placeholder="João Silva"
                        onChange={e => setParticipants(p => p.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                    </Campo>
                    <Campo label="CPF / CNPJ">
                      <input style={inp()} value={pt.cpf_cnpj} placeholder="000.000.000-00"
                        onChange={e => setParticipants(p => p.map((x, j) => j === i ? { ...x, cpf_cnpj: e.target.value } : x))} />
                    </Campo>
                    <Campo label="% de Participação *">
                      <InputNumerico min={0} max={100} style={inp()} value={pt.percentual} placeholder="50.00"
                        onChange={v => setParticipants(p => p.map((x, j) => j === i ? { ...x, percentual: v } : x))} />
                    </Campo>
                  </Grid>
                  <Grid cols={2}>
                    <Campo label="Papel na Parceria">
                      <select style={inp()} value={pt.papel}
                        onChange={e => setParticipants(p => p.map((x, j) => j === i ? { ...x, papel: e.target.value as PapelParceiro } : x))}>
                        {Object.entries(PAPEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Emite NF-e?">
                      <select style={inp()} value={pt.responsavel_nfe ? "sim" : "nao"}
                        onChange={e => setParticipants(p => p.map((x, j) => j === i ? { ...x, responsavel_nfe: e.target.value === "sim" } : x))}>
                        <option value="nao">Não (recebe repasse)</option>
                        <option value="sim">Sim (emitente da NF-e)</option>
                      </select>
                    </Campo>
                  </Grid>
                </div>
              ))}

              {/* Barra visual de distribuição */}
              {participants.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...lbl, marginBottom: 6 }}>Distribuição visual</div>
                  <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden" }}>
                    {participants.map((pt, i) => {
                      const pct = Number(pt.percentual || 0);
                      const cores = [C.azul, C.verde, C.mostr, "#7C3AED", C.lar, C.inf];
                      return pct > 0 ? (
                        <div key={i} title={`${pt.nome || `P${i+1}`}: ${pct}%`}
                          style={{ width: `${pct}%`, background: cores[i % cores.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, transition: "width 0.3s" }}>
                          {pct >= 10 ? `${pt.nome.split(" ")[0] || `P${i+1}`} ${pct}%` : ""}
                        </div>
                      ) : null;
                    })}
                    {totalPct < 100 && (
                      <div style={{ flex: 1, background: C.borda, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.fraco }}>
                        {(100 - totalPct).toFixed(2)}% livre
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba Distribuição de Custos */}
          {abaMod === "distribuicao" && (
            <div>
              <div style={{ background: C.infClr, border: `0.5px solid ${C.inf}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.azulEsc }}>
                Por padrão, todos os custos são divididos proporcionalmente ao % de cada participante. Adicione regras abaixo <strong>apenas quando houver exceção</strong> (ex.: sementes 100% do parceiro A, outros 50/50).
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button onClick={() => setDistribs(d => [...d, { participante_idx: 0, tipo_custo: "todos", percentual: "" }])}
                  style={btn(C.azulClr, C.azul, { fontSize: 12 })}>+ Regra de Exceção</button>
              </div>
              {distribs.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: C.ter, fontSize: 13 }}>
                  Nenhuma regra de exceção. Todos os custos seguem o % geral de cada participante.
                </div>
              ) : distribs.map((d, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1fr auto", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
                  <Campo label="Participante">
                    <select style={inp()} value={d.participante_idx}
                      onChange={e => setDistribs(ds => ds.map((x, j) => j === i ? { ...x, participante_idx: Number(e.target.value) } : x))}>
                      {participants.map((pt, pi) => <option key={pi} value={pi}>{pt.nome || `Participante ${pi + 1}`}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Tipo de Custo">
                    <select style={inp()} value={d.tipo_custo}
                      onChange={e => setDistribs(ds => ds.map((x, j) => j === i ? { ...x, tipo_custo: e.target.value } : x))}>
                      {TIPOS_CUSTO.map(tc => <option key={tc.v} value={tc.v}>{tc.l}</option>)}
                    </select>
                  </Campo>
                  <Campo label="% Deste Participante">
                    <InputNumerico min={0} max={100} style={inp()} value={d.percentual} placeholder="50.00"
                      onChange={v => setDistribs(ds => ds.map((x, j) => j === i ? { ...x, percentual: v } : x))} />
                  </Campo>
                  <button onClick={() => setDistribs(ds => ds.filter((_, j) => j !== i))}
                    style={{ background: C.vermClr, color: C.verm, border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 13, marginTop: 18 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {errMsg && <div style={{ background: C.vermClr, color: C.verm, padding: "8px 12px", borderRadius: 6, fontSize: 13, marginTop: 12 }}>{errMsg}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, borderTop: `1px solid ${C.borda}`, paddingTop: 16 }}>
            <button onClick={() => setModalParc(false)} style={btn(C.fundo, C.sub)}>Cancelar</button>
            <button onClick={salvarParceria} disabled={salvando} style={btn(C.verde, "#fff", { opacity: salvando ? 0.6 : 1 })}>
              {salvando ? "Salvando…" : "Salvar Parceria"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL GRUPO ECONÔMICO ──────────────────────── */}
      {modalGrp && grupoForm && (
        <Modal titulo={grupoForm.id ? `Editar — ${grupoForm.nome}` : "Novo Grupo Econômico"} onClose={() => setModalGrp(false)} width={800}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Grid cols={2}>
              <Campo label="Nome do Grupo *">
                <input style={inp()} value={grupoForm.nome}
                  onChange={e => setGrupoForm(f => f && { ...f, nome: e.target.value })} />
              </Campo>
              <Campo label="Tipo">
                <select style={inp()} value={grupoForm.tipo}
                  onChange={e => setGrupoForm(f => f && { ...f, tipo: e.target.value as GrupoNovo["tipo"] })}>
                  <option value="familiar">Familiar</option>
                  <option value="empresarial">Empresarial</option>
                  <option value="cooperativa">Cooperativa</option>
                  <option value="condominio">Condomínio</option>
                </select>
              </Campo>
            </Grid>
            <Campo label="CNPJ da Controladora">
              <input style={inp()} value={grupoForm.cnpj_controlador} placeholder="00.000.000/0001-00"
                onChange={e => setGrupoForm(f => f && { ...f, cnpj_controlador: e.target.value })} />
            </Campo>

            {/* Membros */}
            <div style={{ borderTop: `1px solid ${C.borda}`, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ ...lbl }}>Membros do Grupo</div>
                <button onClick={() => setMembros(m => [...m, { nome_entidade: "", cpf_cnpj: "", papel: "subsidiaria", percentual_participacao: "" }])}
                  style={btn(C.azulClr, C.azul, { fontSize: 12 })}>+ Membro</button>
              </div>
              {membros.map((m, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 2fr 2fr 1fr auto", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
                  <Campo label="Nome / Razão Social">
                    <input style={inp()} value={m.nome_entidade} placeholder="Fazenda XYZ Ltda"
                      onChange={e => setMembros(ms => ms.map((x, j) => j === i ? { ...x, nome_entidade: e.target.value } : x))} />
                  </Campo>
                  <Campo label="CPF / CNPJ">
                    <input style={inp()} value={m.cpf_cnpj}
                      onChange={e => setMembros(ms => ms.map((x, j) => j === i ? { ...x, cpf_cnpj: e.target.value } : x))} />
                  </Campo>
                  <Campo label="Papel">
                    <select style={inp()} value={m.papel}
                      onChange={e => setMembros(ms => ms.map((x, j) => j === i ? { ...x, papel: e.target.value as PapelGrupo } : x))}>
                      {Object.entries(PAPELGRP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Campo>
                  <Campo label="% Part.">
                    <InputNumerico min={0} max={100} style={inp()} value={m.percentual_participacao}
                      onChange={v => setMembros(ms => ms.map((x, j) => j === i ? { ...x, percentual_participacao: v } : x))} />
                  </Campo>
                  <button onClick={() => setMembros(ms => ms.filter((_, j) => j !== i))}
                    style={{ background: C.vermClr, color: C.verm, border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", marginTop: 18 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, borderTop: `1px solid ${C.borda}`, paddingTop: 16 }}>
            <button onClick={() => setModalGrp(false)} style={btn(C.fundo, C.sub)}>Cancelar</button>
            <button onClick={salvarGrupo} style={btn(C.verde)}>Salvar Grupo</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL APURAÇÃO ──────────────────────────────── */}
      {apurModal && (
        <Modal titulo={`Apurar Resultado — ${apurParcNome}`} subtitulo="Informe receitas e custos do ciclo para calcular as cotas" onClose={() => setApurModal(false)} width={820}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Grid cols={2}>
              <Campo label="Ciclo / Safra">
                <select style={inp()} value={apurForm.ciclo_id}
                  onChange={e => setApurForm(f => ({ ...f, ciclo_id: e.target.value }))}>
                  <option value="">Todos os ciclos</option>
                  {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                </select>
              </Campo>
              <Campo label="Data da Apuração">
                <input type="date" style={inp()} value={apurForm.data_apuracao}
                  onChange={e => setApurForm(f => ({ ...f, data_apuracao: e.target.value }))} />
              </Campo>
            </Grid>

            <Campo label="Receita Total (R$) *">
              <InputNumerico min={0} style={inp()} value={apurForm.receita_total} placeholder="0.00"
                onChange={v => { setApurForm(f => ({ ...f, receita_total: v })); setCalculado(false); }} />
            </Campo>

            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Custos por Categoria (R$)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {["semente", "fertilizante", "defensivo", "correcao_solo", "operacao_mecanizada", "arrendamento", "mao_obra", "administrativo"].map(tc => (
                  <div key={tc}>
                    <div style={{ fontSize: 11, color: C.ter, marginBottom: 3 }}>{CUSTO_LABEL[tc]}</div>
                    <InputNumerico min={0} style={inp()} value={apurForm.custos[tc] ?? ""} placeholder="0.00"
                      onChange={v => { setApurForm(f => ({ ...f, custos: { ...f.custos, [tc]: v } })); setCalculado(false); }} />
                  </div>
                ))}
              </div>
            </div>

            <Campo label="Observação">
              <input style={inp()} value={apurForm.observacao}
                onChange={e => setApurForm(f => ({ ...f, observacao: e.target.value }))} />
            </Campo>

            <button onClick={calcularApuracao} style={btn(C.azul, "#fff", { fontSize: 14, padding: "10px 20px" })}>
              Calcular Distribuição das Cotas
            </button>

            {/* Resultado */}
            {calculado && apurCotas.length > 0 && (
              <div style={{ background: C.fundo, borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.txt, marginBottom: 12 }}>Resultado por Participante</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Participante", "%", "Receita Cota", "Custo Cota", "Resultado", "Conta D", "Conta C"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", background: C.branco, fontWeight: 600, fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.borda}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(apurCotas as (ParceriaApuracaoCota & { _nome?: string; _pct?: number })[]).map((c, i) => {
                      const pt = apurParticipantes[i];
                      const nome = (pt as { produtor?: { nome?: string } })?.produtor?.nome ?? (pt as { nome_override?: string })?.nome_override ?? `P${i+1}`;
                      return (
                        <tr key={i}>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{nome}</td>
                          <td style={{ padding: "8px 10px" }}>{pt?.percentual ?? 0}%</td>
                          <td style={{ padding: "8px 10px", color: C.verde }}>{fmtBRL(c.receita_cota)}</td>
                          <td style={{ padding: "8px 10px", color: C.verm }}>{fmtBRL(c.custo_cota)}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: c.resultado_cota >= 0 ? C.verde : C.verm }}>{fmtBRL(c.resultado_cota)}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <input style={{ ...inp(), fontSize: 11, padding: "4px 6px" }} value={c.conta_debito ?? ""} placeholder="3.3.01"
                              onChange={e => setApurCotas(cs => cs.map((x, j) => j === i ? { ...x, conta_debito: e.target.value } : x))} />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <input style={{ ...inp(), fontSize: 11, padding: "4px 6px" }} value={c.conta_credito ?? ""} placeholder="2.1.99"
                              onChange={e => setApurCotas(cs => cs.map((x, j) => j === i ? { ...x, conta_credito: e.target.value } : x))} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 12, color: C.ter }}>
                  Contas contábeis opcionais para geração dos lançamentos SPED ECD (Bloco I, registro I155).
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, borderTop: `1px solid ${C.borda}`, paddingTop: 16 }}>
            <button onClick={() => setApurModal(false)} style={btn(C.fundo, C.sub)}>Cancelar</button>
            {calculado && (
              <button onClick={salvarApuracaoFinal} style={btn(C.verde)}>Salvar Apuração</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
