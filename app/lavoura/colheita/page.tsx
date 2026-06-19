"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import { useAuth } from "../../../components/AuthProvider";
import FazendaSelector from "../../../components/FazendaSelector";
import {
  listarColheitas,
  criarColheita,
  excluirColheita,
  listarColheitaRomaneios,
  criarColheitaRomaneio,
  excluirColheitaRomaneio,
  finalizarColheita,
  listarTodosCiclos,
  listarAnosSafra,
  listarTalhoes,
  listarDepositos,
  listarInsumos,
} from "../../../lib/db";
import type { ColheitaRegistro, ColheitaRomaneio, Ciclo, AnoSafra, Talhao, Deposito, Insumo } from "../../../lib/supabase";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const hoje = () => new Date().toISOString().split("T")[0];
const fmt  = (n: number, d = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Desconto umidade: ((U - U_pad) / (100 - U_pad)) × PL  — só se U > U_pad */
function descontoUmidade(pl: number, u: number, u_pad: number): number {
  if (u <= u_pad) return 0;
  return ((u - u_pad) / (100 - u_pad)) * pl;
}

/** Tolerância: soja 1% impureza e 0% avariados grátis; milho 1% impureza / 0.5% avariados */
function descontoImpureza(pl: number, pct: number): number {
  const tolerancia = 1;
  const excedente  = Math.max(0, pct - tolerancia);
  return (excedente / 100) * pl;
}

function descontoAvariados(pl: number, pct: number): number {
  const tolerancia = 0.5;
  const excedente  = Math.max(0, pct - tolerancia);
  return (excedente / 100) * pl;
}

function calcRomaneio(
  peso_bruto_kg: number,
  tara_kg: number,
  umidade_pct: number,
  umidade_padrao_pct: number,
  impureza_pct: number,
  avariados_pct: number,
) {
  const pl           = Math.max(0, peso_bruto_kg - tara_kg);
  const d_umid       = descontoUmidade(pl, umidade_pct, umidade_padrao_pct);
  const d_imp        = descontoImpureza(pl, impureza_pct);
  const d_avar       = descontoAvariados(pl, avariados_pct);
  const classificado = Math.max(0, pl - d_umid - d_imp - d_avar);
  const sacas        = classificado / 60;
  return { pl, d_umid, d_imp, d_avar, classificado, sacas };
}

const PRODUTOS_PADRAO: Record<string, { umPad: number; label: string }> = {
  "soja":    { umPad: 14,   label: "Soja" },
  "milho":   { umPad: 14.5, label: "Milho" },
  "milho1":  { umPad: 14.5, label: "Milho 1ª" },
  "milho2":  { umPad: 14.5, label: "Milho 2ª" },
  "algodao": { umPad: 12,   label: "Algodão" },
  "trigo":   { umPad: 13,   label: "Trigo" },
  "sorgo":   { umPad: 13,   label: "Sorgo" },
};

type CommodityClass = { umidade_padrao: number; impureza_padrao: number; avariados_padrao: number; kg_saca: number };
const CLASSE_COMMODITY: Record<string, CommodityClass> = {
  "soja":    { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 8.0, kg_saca: 60 },
  "milho":   { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "milho1":  { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "milho2":  { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "algodao": { umidade_padrao: 12.0, impureza_padrao: 1.5, avariados_padrao: 0.0, kg_saca: 15 },
  "trigo":   { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 2.0, kg_saca: 60 },
  "sorgo":   { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
};
const getClasse = (produto: string): CommodityClass =>
  CLASSE_COMMODITY[produto] ?? { umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, kg_saca: 60 };

const calcDescUmid  = (pl: number, u: number, uPad: number) => u > uPad ? +(pl * (u - uPad) / (100 - uPad)).toFixed(2) : 0;
const calcDescImp   = (pl: number, i: number, iPad: number) => i > iPad ? +(pl * (i - iPad) / 100).toFixed(2)          : 0;
const calcDescAvar  = (pl: number, a: number, aPad: number) => a > aPad ? +(pl * (a - aPad) / 100).toFixed(2)          : 0;

// ────────────────────────────────────────────────────────────
// Tipos auxiliares
// ────────────────────────────────────────────────────────────

type ColheitaComRomaneios = ColheitaRegistro & { romaneios?: ColheitaRomaneio[] };

const COLHEITA_VAZIO: Omit<ColheitaRegistro, "id" | "created_at"> = {
  fazenda_id:            "",
  ciclo_id:              "",
  talhao_id:             "",
  data_colheita:         hoje(),
  deposito_id:           "",
  produto:               "soja",
  variedade:             "",
  area_ha:               0,
  total_kg_bruto:        0,
  total_kg_classificado: 0,
  total_sacas:           0,
};

const ROMANEIO_VAZIO = {
  numero:             "",
  placa:              "",
  peso_bruto_kg:      0,
  tara_kg:            0,
  umidade_pct:        0,
  umidade_padrao_pct: 14,
  impureza_pct:       0,
  avariados_pct:      0,
  ph:                 "",
  ardidos:            "",
  mofados:            "",
  fermentados:        "",
  germinados:         "",
  esverdeados:        "",
  quebrados:          "",
  carunchados:        "",
  outros_avariados:   "",
  data:               hoje(),
};

// ────────────────────────────────────────────────────────────
// Hook mobile
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// Página principal
// ────────────────────────────────────────────────────────────

export default function ColheitaPage() {
  const { fazendaId, contaId } = useAuth();
  const [formFazendaId, setFormFazendaId] = useState<string | null>(null);
  const fid = formFazendaId ?? fazendaId;

  const [colheitas,   setColheitas]   = useState<ColheitaComRomaneios[]>([]);
  const [todosCiclos, setTodosCiclos] = useState<Ciclo[]>([]);
  const [anosSafra,   setAnosSafra]   = useState<AnoSafra[]>([]);
  const [talhoes,     setTalhoes]     = useState<Talhao[]>([]);
  const [depositos,   setDepositos]   = useState<Deposito[]>([]);
  const [insumos,     setInsumos]     = useState<Insumo[]>([]);
  const [anoSafraSel, setAnoSafraSel] = useState("");
  const [expandido,  setExpandido]  = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [erro,       setErro]       = useState<string | null>(null);

  // Modais
  const [modalColheita,  setModalColheita]  = useState(false);
  const [modalRomaneio,  setModalRomaneio]  = useState<string | null>(null); // colheita_id
  const [modalFinalizar, setModalFinalizar] = useState<ColheitaComRomaneios | null>(null);

  // Formulários
  const [formColheita, setFormColheita] = useState({ ...COLHEITA_VAZIO });
  const [formRomaneio, setFormRomaneio] = useState({ ...ROMANEIO_VAZIO });
  const [insumoIdFinal, setInsumoIdFinal] = useState("");
  // Culturas para pré-seleção automática do produto na finalização

  // ── Carregamento ──────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [c, t, d, ins] = await Promise.all([
        listarColheitas(fazendaId),
        listarTalhoes(fazendaId),
        listarDepositos(fazendaId),
        listarInsumos(fazendaId),
      ]);
      setColheitas(c);
      setTalhoes(t);
      setDepositos(d);
      setInsumos(ins.filter(i => i.categoria === "produto_agricola"));
      listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
      listarTodosCiclos(fazendaId).then(setTodosCiclos).catch(() => {});
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Expande colheita e carrega romaneios
  const toggleExpandir = async (id: string) => {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    const col = colheitas.find(c => c.id === id);
    if (col && !col.romaneios) {
      const roms = await listarColheitaRomaneios(id);
      setColheitas(prev => prev.map(c => c.id === id ? { ...c, romaneios: roms } : c));
    }
  };

  // ── Stats ─────────────────────────────────────────────────

  const totalSacas      = colheitas.reduce((s, c) => s + (c.total_sacas ?? 0), 0);
  const totalKgClass    = colheitas.reduce((s, c) => s + (c.total_kg_classificado ?? 0), 0);
  const totalArea       = colheitas.reduce((s, c) => s + (c.area_ha ?? 0), 0);
  const prodMedia       = totalArea > 0 ? totalSacas / totalArea : 0;

  // ── Criar colheita ────────────────────────────────────────

  const abrirModalColheita = () => {
    const id = fazendaId ?? "";
    setFormFazendaId(fazendaId);
    setFormColheita({ ...COLHEITA_VAZIO, fazenda_id: id });
    setModalColheita(true);
  };

  async function mudarFazendaColheita(novaId: string) {
    setFormFazendaId(novaId);
    setFormColheita(p => ({ ...p, fazenda_id: novaId, ciclo_id: "", talhao_id: "" }));
    listarTalhoes(novaId).then(setTalhoes).catch(() => {});
    listarTodosCiclos(novaId).then(setTodosCiclos).catch(() => {});
  }

  const salvarColheita = async () => {
    if (!fid || !formColheita.ciclo_id) { setErro("Selecione a safra"); return; }
    setSalvando(true);
    setErro(null);
    try {
      await criarColheita({ ...formColheita, fazenda_id: fid });
      setModalColheita(false);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Romaneio ──────────────────────────────────────────────

  const abrirRomaneio = (colheitaId: string) => {
    const col = colheitas.find(c => c.id === colheitaId);
    const umPad = PRODUTOS_PADRAO[col?.produto ?? "soja"]?.umPad ?? 14;
    setFormRomaneio({ ...ROMANEIO_VAZIO, umidade_padrao_pct: umPad, umidade_pct: umPad, data: hoje() });
    setModalRomaneio(colheitaId);
  };

  const calcRom = () => {
    const col     = colheitas.find(c => c.id === modalRomaneio);
    const cls     = getClasse(col?.produto ?? "soja");
    const pl      = Math.max(0, formRomaneio.peso_bruto_kg - formRomaneio.tara_kg);
    // sub-parâmetros avariados
    const pArd = parseFloat(formRomaneio.ardidos)          || 0;
    const pMof = parseFloat(formRomaneio.mofados)          || 0;
    const pFer = parseFloat(formRomaneio.fermentados)      || 0;
    const pGer = parseFloat(formRomaneio.germinados)       || 0;
    const pEsv = parseFloat(formRomaneio.esverdeados)      || 0;
    const pQue = parseFloat(formRomaneio.quebrados)        || 0;
    const pCar = parseFloat(formRomaneio.carunchados)      || 0;
    const pOut = parseFloat(formRomaneio.outros_avariados) || 0;
    const temSub   = pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut > 0;
    const avar_pct = temSub ? +(pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut).toFixed(2) : formRomaneio.avariados_pct;
    const d_umid   = calcDescUmid(pl, formRomaneio.umidade_pct, cls.umidade_padrao);
    const d_imp    = calcDescImp (pl, formRomaneio.impureza_pct, cls.impureza_padrao);
    const d_avar   = calcDescAvar(pl, avar_pct, cls.avariados_padrao);
    const classificado = Math.max(0, pl - d_umid - d_imp - d_avar);
    const sacas        = +(classificado / cls.kg_saca).toFixed(3);
    return { cls, pl, d_umid, d_imp, d_avar, avar_pct, classificado, sacas,
             pArd, pMof, pFer, pGer, pEsv, pQue, pCar, pOut, temSub };
  };

  const salvarRomaneio = async () => {
    if (!fazendaId || !modalRomaneio) return;
    if (!formRomaneio.placa.trim()) { setErro("Informe a placa do caminhão"); return; }
    if (formRomaneio.peso_bruto_kg <= 0) { setErro("Informe o peso bruto"); return; }
    setSalvando(true);
    setErro(null);
    try {
      const { cls, pl, d_umid, d_imp, d_avar, avar_pct, classificado, sacas,
              pArd, pMof, pFer, pGer, pEsv, pQue, pCar, pOut, temSub } = calcRom();
      const temClassif = formRomaneio.umidade_pct > 0 || formRomaneio.impureza_pct > 0 || avar_pct > 0;
      await criarColheitaRomaneio({
        colheita_id:            modalRomaneio,
        fazenda_id:             fazendaId,
        numero:                 formRomaneio.numero || undefined,
        placa:                  formRomaneio.placa.toUpperCase(),
        peso_bruto_kg:          formRomaneio.peso_bruto_kg,
        tara_kg:                formRomaneio.tara_kg,
        peso_liquido_kg:        pl,
        umidade_pct:            formRomaneio.umidade_pct || undefined,
        umidade_padrao_pct:     temClassif ? cls.umidade_padrao : undefined,
        desconto_umidade_kg:    d_umid || undefined,
        impureza_pct:           formRomaneio.impureza_pct || undefined,
        desconto_impureza_kg:   d_imp || undefined,
        avariados_pct:          avar_pct || undefined,
        avariados_padrao_pct:   temClassif ? cls.avariados_padrao : undefined,
        desconto_avariados_kg:  d_avar || undefined,
        ph_hl:                  parseFloat(formRomaneio.ph) || undefined,
        ardidos_pct:            temSub ? pArd || undefined : undefined,
        mofados_pct:            temSub ? pMof || undefined : undefined,
        fermentados_pct:        temSub ? pFer || undefined : undefined,
        germinados_pct:         temSub ? pGer || undefined : undefined,
        esverdeados_pct:        temSub ? pEsv || undefined : undefined,
        quebrados_pct:          temSub ? pQue || undefined : undefined,
        carunchados_pct:        temSub ? pCar || undefined : undefined,
        outros_avariados_pct:   temSub ? pOut || undefined : undefined,
        peso_classificado_kg:   temClassif ? classificado : pl,
        sacas,
        data:                   formRomaneio.data,
      });
      setModalRomaneio(null);
      // Recarrega romaneios e totais
      const roms = await listarColheitaRomaneios(modalRomaneio);
      const colAtt = await listarColheitas(fazendaId);
      setColheitas(colAtt.map(c => c.id === modalRomaneio ? { ...c, romaneios: roms } : c));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar romaneio");
    } finally {
      setSalvando(false);
    }
  };

  const removerRomaneio = async (romId: string, colheitaId: string) => {
    if (!fazendaId) return;
    if (!confirm("Remover este romaneio?")) return;
    try {
      await excluirColheitaRomaneio(romId, colheitaId, fazendaId);
      const roms  = await listarColheitaRomaneios(colheitaId);
      const colAtt = await listarColheitas(fazendaId);
      setColheitas(colAtt.map(c => c.id === colheitaId ? { ...c, romaneios: roms } : c));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  // ── Finalizar colheita ────────────────────────────────────

  const finalizarColheitaModal = async () => {
    if (!modalFinalizar || !fazendaId) return;
    setSalvando(true);
    setErro(null);
    try {
      await finalizarColheita(modalFinalizar, insumoIdFinal || null);
      setModalFinalizar(null);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao finalizar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Labels helpers ────────────────────────────────────────

  const CULTURAS: Record<string, string> = { soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª", algodao: "Algodão", trigo: "Trigo", sorgo: "Sorgo" };
  const cicloLabel = (id: string) => {
    const c = todosCiclos.find(x => x.id === id);
    if (!c) return "—";
    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    return `${CULTURAS[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };
  const ciclosDisponiveis = anoSafraSel
    ? todosCiclos.filter(c => c.ano_safra_id === anoSafraSel)
    : todosCiclos;
  const nomeTalhao  = (id?: string) => id ? (talhoes.find(t => t.id === id)?.nome ?? id) : "—";
  const nomeDeposito = (id?: string) => id ? (depositos.find(d => d.id === id)?.nome ?? id) : "—";

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9" }}>
      <TopNav />

      <main style={{ flex: 1, padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>Colheita Própria</h1>
            <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>
              Pesagem de caminhões, classificação de grãos e entrada no estoque
            </p>
          </div>
          <button
            onClick={abrirModalColheita}
            style={{
              background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            + Nova Colheita
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Registros de colheita", valor: colheitas.length.toString(), cor: "#1A4870" },
            { label: "Total sacas colhidas",  valor: fmt(totalSacas) + " sc", cor: "#378ADD" },
            { label: "Total kg classificado", valor: fmt(totalKgClass / 1000, 1) + " t", cor: "#EF9F27" },
            { label: "Produtividade média",   valor: totalArea > 0 ? fmt(prodMedia, 1) + " sc/ha" : "—", cor: "#C9921B" },
          ].map(st => (
            <div key={st.label} style={{
              background: "#fff", borderRadius: 10, padding: "16px 18px",
              border: "0.5px solid #D4DCE8",
            }}>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {st.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: st.cor }}>{st.valor}</div>
            </div>
          ))}
        </div>

        {/* Erros */}
        {erro && (
          <div style={{
            background: "#FFF5F5", border: "0.5px solid #FECACA", borderRadius: 8,
            padding: "10px 16px", color: "#E24B4A", fontSize: 13, marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            {erro}
            <button onClick={() => setErro(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Lista de colheitas */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#444", padding: 48, fontSize: 14 }}>Carregando...</div>
        ) : colheitas.length === 0 ? (
          <div style={{
            background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8",
            padding: 48, textAlign: "center", color: "#444",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🌾</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#555", marginBottom: 4 }}>Nenhuma colheita registrada</div>
            <div style={{ fontSize: 13 }}>Clique em "Nova Colheita" para iniciar o registro</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {colheitas.map(col => {
              const isExp = expandido === col.id;
              const prodLabel = PRODUTOS_PADRAO[col.produto]?.label ?? col.produto;
              return (
                <div key={col.id} style={{
                  background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden",
                }}>
                  {/* Cabeçalho do card */}
                  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "row", alignItems: "center", gap: 14 }}>
                    {/* Ícone produto */}
                    <div style={{
                      width: 40, height: 40, background: "#D5E8F5", borderRadius: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>
                      🌾
                    </div>

                    {/* Infos principais */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                        {prodLabel}{col.variedade ? ` — ${col.variedade}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                        {cicloLabel(col.ciclo_id ?? "")} · {nomeTalhao(col.talhao_id)} · {nomeDeposito(col.deposito_id)}
                      </div>
                    </div>

                    {/* Métricas */}
                    <div style={{ display: "flex", gap: 20, flexWrap: "nowrap", flexShrink: 0 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#444" }}>Área</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmt(col.area_ha ?? 0, 1)} ha</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#444" }}>Peso Liq.</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmt(col.total_kg_bruto / 1000, 1)} t</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#444" }}>Classificado</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870" }}>{fmt(col.total_kg_classificado / 1000, 1)} t</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#444" }}>Sacas</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1A4870" }}>{fmt(col.total_sacas, 1)} sc</div>
                      </div>
                      {col.produtividade_sc_ha && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#444" }}>Prod.</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#C9921B" }}>{fmt(col.produtividade_sc_ha, 1)} sc/ha</div>
                        </div>
                      )}
                      {col.umidade_media && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#444" }}>Umid. méd.</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#EF9F27" }}>{fmt(col.umidade_media, 1)}%</div>
                        </div>
                      )}
                    </div>

                    {/* Botões ação */}
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "nowrap", width: "auto" }}>
                      <button
                        onClick={() => abrirRomaneio(col.id)}
                        style={{
                          background: "#F0FAF6", color: "#1A4870", border: "0.5px solid #1A4870",
                          borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        + Romaneio
                      </button>
                      <button
                        onClick={() => {
                          // Auto-seleciona produto vinculado ao ciclo (definido no planejamento)
                          const ciclo = todosCiclos.find(ci => ci.id === col.ciclo_id);
                          setInsumoIdFinal(ciclo?.produto_agricola_id ?? "");
                          setModalFinalizar(col);
                        }}
                        style={{
                          background: "#1A5C38", color: "#fff", border: "none",
                          borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Finalizar
                      </button>
                      <button
                        onClick={() => toggleExpandir(col.id)}
                        style={{
                          background: "none", border: "0.5px solid #D4DCE8", borderRadius: 7,
                          padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "#555",
                        }}
                      >
                        {isExp ? "▲" : "▼"}
                      </button>
                      <button
                        onClick={async () => { if (confirm("Excluir esta colheita e todos os romaneios?")) { await excluirColheita(col.id); await carregar(); } }}
                        style={{
                          background: "none", border: "0.5px solid #FECACA", borderRadius: 7,
                          padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "#E24B4A",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Romaneios expandidos */}
                  {isExp && (
                    <div style={{ borderTop: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
                      <div style={{ padding: "10px 20px 6px", fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Romaneios ({col.romaneios?.length ?? 0})
                      </div>
                      {!col.romaneios || col.romaneios.length === 0 ? (
                        <div style={{ padding: "8px 20px 16px", fontSize: 13, color: "#444" }}>
                          Nenhum romaneio lançado. Clique em "+ Romaneio" para adicionar.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#DEE5EE" }}>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "left", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Nº</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "left", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Placa</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Data</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Peso Bruto</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Tara</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Peso Líq.</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Umid %</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>D.Umid kg</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Imp %</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>D.Imp kg</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Avar %</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>D.Avar kg</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Classificado kg</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, color: "#666", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid #D4DCE8" }}>Sacas</th>
                                <th style={{ padding: "7px 12px", borderBottom: "0.5px solid #D4DCE8" }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {col.romaneios!.map(rom => (
                                <tr key={rom.id} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                                  <td style={{ padding: "8px 12px", color: "#1a1a1a" }}>{rom.numero || "—"}</td>
                                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "#1a1a1a" }}>{rom.placa}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#1a1a1a" }}>{rom.data ? new Date(rom.data + "T12:00").toLocaleDateString("pt-BR") : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(rom.peso_bruto_kg)} kg</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(rom.tara_kg)} kg</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#1a1a1a", fontWeight: 600 }}>{fmt(rom.peso_liquido_kg)} kg</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: (rom.umidade_pct ?? 0) > (rom.umidade_padrao_pct ?? 14) ? "#E24B4A" : "#1a1a1a" }}>
                                    {fmt(rom.umidade_pct ?? 0, 1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#E24B4A" }}>
                                    {(rom.desconto_umidade_kg ?? 0) > 0 ? `-${fmt(rom.desconto_umidade_kg ?? 0, 1)}` : "—"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: (rom.impureza_pct ?? 0) > 1 ? "#EF9F27" : "#1a1a1a" }}>
                                    {fmt(rom.impureza_pct ?? 0, 1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#EF9F27" }}>
                                    {(rom.desconto_impureza_kg ?? 0) > 0 ? `-${fmt(rom.desconto_impureza_kg ?? 0, 1)}` : "—"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: (rom.avariados_pct ?? 0) > 0.5 ? "#EF9F27" : "#1a1a1a" }}>
                                    {fmt(rom.avariados_pct ?? 0, 1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#EF9F27" }}>
                                    {(rom.desconto_avariados_kg ?? 0) > 0 ? `-${fmt(rom.desconto_avariados_kg ?? 0, 1)}` : "—"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#1A4870" }}>{fmt(rom.peso_classificado_kg, 1)} kg</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>{fmt(rom.sacas, 2)} sc</td>
                                  <td style={{ padding: "8px 12px" }}>
                                    <button
                                      onClick={() => removerRomaneio(rom.id, col.id)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 14 }}
                                    >
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            {/* Totais */}
                            <tfoot>
                              <tr style={{ background: "#D5E8F5", color: "#1a1a1a", fontWeight: 600 }}>
                                <td colSpan={3} style={{ padding: "8px 12px", color: "#0B2D50" }}>Total</td>
                                <td colSpan={2} style={{ padding: "8px 12px" }} />
                                <td style={{ padding: "8px 12px", textAlign: "right", color: "#0B2D50" }}>
                                  {fmt(col.romaneios!.reduce((s, r) => s + r.peso_liquido_kg, 0))} kg
                                </td>
                                <td colSpan={2} style={{ padding: "8px 12px", textAlign: "right", color: "#E24B4A" }}>
                                  {col.umidade_media ? `${fmt(col.umidade_media, 1)}% méd.` : "—"}
                                </td>
                                <td colSpan={2} style={{ padding: "8px 12px", textAlign: "right", color: "#EF9F27" }}>
                                  {col.impureza_media ? `${fmt(col.impureza_media, 1)}% méd.` : "—"}
                                </td>
                                <td colSpan={2} style={{ padding: "8px 12px" }} />
                                <td style={{ padding: "8px 12px", textAlign: "right", color: "#0B2D50" }}>
                                  {fmt(col.total_kg_classificado, 1)} kg
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: "#0B2D50" }}>
                                  {fmt(col.total_sacas, 2)} sc
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ──────────────────────────────────────────
          MODAL — Nova Colheita
      ────────────────────────────────────────── */}
      {modalColheita && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setModalColheita(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Nova Colheita</h2>
              <button onClick={() => setModalColheita(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#444" }}>×</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Fazenda */}
              <div style={{ background: "#EFF6FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase" as const, letterSpacing: 1, whiteSpace: "nowrap" }}>Fazenda *</span>
                <FazendaSelector contaId={contaId} value={fid} onChange={mudarFazendaColheita} style={{ flex: 1 }} />
              </div>

              {/* Ano Safra, Safra e Talhão */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <label>
                  <div style={lbStyle}>Ano Safra</div>
                  <select value={anoSafraSel} onChange={e => { setAnoSafraSel(e.target.value); setFormColheita(f => ({ ...f, ciclo_id: "" })); }} style={inpStyle}>
                    <option value="">— Todos —</option>
                    {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </label>
                <label>
                  <div style={lbStyle}>Safra / Cultura *</div>
                  <select value={formColheita.ciclo_id ?? ""} onChange={e => setFormColheita(f => ({ ...f, ciclo_id: e.target.value }))} style={inpStyle}>
                    <option value="">Selecione...</option>
                    {ciclosDisponiveis.map(c => {
                      const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
                      return <option key={c.id} value={c.id}>{CULTURAS[c.cultura] ?? c.cultura}{ano ? ` · ${ano}` : ""}{c.descricao ? ` — ${c.descricao}` : ""}</option>;
                    })}
                  </select>
                </label>
                <label>
                  <div style={lbStyle}>Talhão</div>
                  <select value={formColheita.talhao_id ?? ""} onChange={e => setFormColheita(f => ({ ...f, talhao_id: e.target.value }))} style={inpStyle}>
                    <option value="">Todos os talhões</option>
                    {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome} ({fmt(t.area_ha, 1)} ha)</option>)}
                  </select>
                </label>
              </div>

              {/* Produto e Variedade */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <label>
                  <div style={lbStyle}>Produto *</div>
                  <select value={formColheita.produto} onChange={e => setFormColheita(f => ({ ...f, produto: e.target.value }))} style={inpStyle}>
                    {Object.entries(PRODUTOS_PADRAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label>
                  <div style={lbStyle}>Variedade / Cultivar</div>
                  <input value={formColheita.variedade ?? ""} onChange={e => setFormColheita(f => ({ ...f, variedade: e.target.value }))} style={inpStyle} placeholder="Ex: TMG 7063" />
                </label>
              </div>

              {/* Área e Data */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <label>
                  <div style={lbStyle}>Área colhida (ha)</div>
                  <InputMonetario value={formColheita.area_ha ?? ""} onChange={v => setFormColheita(f => ({ ...f, area_ha: v }))} style={inpStyle} min={0} />
                </label>
                <label>
                  <div style={lbStyle}>Data de colheita</div>
                  <input type="date" value={formColheita.data_colheita} onChange={e => setFormColheita(f => ({ ...f, data_colheita: e.target.value }))} style={inpStyle} />
                </label>
              </div>

              {/* Depósito destino */}
              <label>
                <div style={lbStyle}>Depósito / Armazém de destino</div>
                <select value={formColheita.deposito_id ?? ""} onChange={e => setFormColheita(f => ({ ...f, deposito_id: e.target.value }))} style={inpStyle}>
                  <option value="">Selecione o armazém...</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome} ({d.tipo})</option>)}
                </select>
              </label>

              {/* Observação */}
              <label>
                <div style={lbStyle}>Observação</div>
                <textarea value={formColheita.observacao ?? ""} onChange={e => setFormColheita(f => ({ ...f, observacao: e.target.value }))} style={{ ...inpStyle, height: 60, resize: "vertical" }} placeholder="Observações gerais" />
              </label>

              {erro && <div style={{ color: "#E24B4A", fontSize: 13, background: "#FFF5F5", padding: "8px 12px", borderRadius: 7 }}>{erro}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                <button onClick={() => setModalColheita(false)} style={btnCancelStyle}>Cancelar</button>
                <button onClick={salvarColheita} disabled={salvando} style={btnPrimStyle}>
                  {salvando ? "Salvando..." : "Criar Colheita"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          MODAL — Adicionar Romaneio
      ────────────────────────────────────────── */}
      {modalRomaneio && (() => {
        const { cls, pl, d_umid, d_imp, d_avar, avar_pct, classificado, sacas,
                pArd, pMof, pFer, pGer, pEsv, pQue, pCar, pOut, temSub } = calcRom();
        const totalDescKg = d_umid + d_imp + d_avar;
        const pctDesconto = pl > 0 ? (totalDescKg / pl) * 100 : 0;
        const temClassif  = formRomaneio.umidade_pct > 0 || formRomaneio.impureza_pct > 0 || avar_pct > 0;
        const colheitaSel = colheitas.find(c => c.id === modalRomaneio);
        const produto     = colheitaSel?.produto ?? "soja";
        const isSoja      = produto === "soja";
        const isMilho     = produto === "milho" || produto === "milho1" || produto === "milho2";

        const applyPadrao = () => setFormRomaneio(f => ({
          ...f,
          umidade_pct:      cls.umidade_padrao,
          impureza_pct:     cls.impureza_padrao,
          ardidos:          "0",
          mofados:          "0",
          fermentados:      "0",
          germinados:       "0",
          esverdeados:      "0",
          quebrados:        "0",
          carunchados:      "0",
          outros_avariados: "0",
        }));

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setModalRomaneio(null); }}>
            <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "92vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Romaneio de Entrada — Colheita</h2>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                    {PRODUTOS_PADRAO[produto]?.label ?? produto}
                    {colheitaSel?.variedade ? ` — ${colheitaSel.variedade}` : ""}
                    {" · "}Padrão: {cls.umidade_padrao}% umid · {cls.impureza_padrao}% imp · {cls.avariados_padrao}% avar
                  </div>
                </div>
                <button onClick={() => setModalRomaneio(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#444" }}>×</button>
              </div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Seção 1 — Identificação */}
                <div>
                  <div style={secTitle}>Identificação</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <label>
                      <div style={lbStyle}>Nº Romaneio</div>
                      <input value={formRomaneio.numero} onChange={e => setFormRomaneio(f => ({ ...f, numero: e.target.value }))} style={inpStyle} placeholder="001" />
                    </label>
                    <label>
                      <div style={lbStyle}>Placa do Caminhão *</div>
                      <input value={formRomaneio.placa} onChange={e => setFormRomaneio(f => ({ ...f, placa: e.target.value.toUpperCase() }))} style={inpStyle} placeholder="ABC1D234" maxLength={8} />
                    </label>
                    <label>
                      <div style={lbStyle}>Data</div>
                      <input type="date" value={formRomaneio.data} onChange={e => setFormRomaneio(f => ({ ...f, data: e.target.value }))} style={inpStyle} />
                    </label>
                  </div>
                </div>

                {/* Seção 2 — Pesagem */}
                <div>
                  <div style={secTitle}>Pesagem</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <label>
                      <div style={lbStyle}>Peso Bruto (kg) *</div>
                      <input type="number" value={formRomaneio.peso_bruto_kg || ""} onChange={e => setFormRomaneio(f => ({ ...f, peso_bruto_kg: parseFloat(e.target.value) || 0 }))} style={inpStyle} min={0} step={10} placeholder="Ex: 45000" />
                    </label>
                    <label>
                      <div style={lbStyle}>Tara (kg) *</div>
                      <input type="number" value={formRomaneio.tara_kg || ""} onChange={e => setFormRomaneio(f => ({ ...f, tara_kg: parseFloat(e.target.value) || 0 }))} style={inpStyle} min={0} step={10} placeholder="Ex: 14000" />
                    </label>
                    <div>
                      <div style={lbStyle}>Peso Líquido (calculado)</div>
                      <div style={{ ...inpStyle, background: "#F3F6F9", fontWeight: 700, fontSize: 15, color: pl > 0 ? "#1A4870" : "#888", display: "flex", alignItems: "center" }}>
                        {fmt(pl)} kg
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 3 — Classificação do Grão */}
                {pl > 0 && (
                  <div>
                    {/* cabeçalho com botão Class. Padrão */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "0.5px solid #D4DCE8", paddingBottom: 6, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Classificação do Grão</div>
                      <button type="button" onClick={applyPadrao}
                        style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", background: "#D5E8F5", border: "0.5px solid #A8C8E8", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                        ✦ Class. Padrão
                      </button>
                    </div>

                    {/* Umidade + Impureza + PH */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={lbStyle}>Umidade (%)</label>
                        <input style={{ ...inpStyle, color: formRomaneio.umidade_pct > cls.umidade_padrao ? "#E24B4A" : "#1a1a1a" }}
                          type="number" step="0.1" min="0" max="40"
                          placeholder={String(cls.umidade_padrao)}
                          value={formRomaneio.umidade_pct || ""}
                          onChange={e => setFormRomaneio(f => ({ ...f, umidade_pct: parseFloat(e.target.value) || 0 }))} />
                        {d_umid > 0 && <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 2 }}>Desc: −{fmt(d_umid, 1)} kg</div>}
                        {formRomaneio.umidade_pct > 0 && formRomaneio.umidade_pct <= cls.umidade_padrao && <div style={{ fontSize: 10, color: "#16A34A", marginTop: 2 }}>Dentro do padrão ✓</div>}
                      </div>
                      <div>
                        <label style={lbStyle}>Impureza / Mat. Estranhas (%)</label>
                        <input style={{ ...inpStyle, color: formRomaneio.impureza_pct > cls.impureza_padrao ? "#EF9F27" : "#1a1a1a" }}
                          type="number" step="0.1" min="0" max="20"
                          placeholder={String(cls.impureza_padrao)}
                          value={formRomaneio.impureza_pct || ""}
                          onChange={e => setFormRomaneio(f => ({ ...f, impureza_pct: parseFloat(e.target.value) || 0 }))} />
                        {d_imp > 0 && <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 2 }}>Desc: −{fmt(d_imp, 1)} kg</div>}
                        {formRomaneio.impureza_pct > 0 && formRomaneio.impureza_pct <= cls.impureza_padrao && <div style={{ fontSize: 10, color: "#16A34A", marginTop: 2 }}>Dentro do padrão ✓</div>}
                      </div>
                      <div>
                        <label style={lbStyle}>PH — Peso Hectolítrico (kg/hl)</label>
                        <input style={inpStyle} type="number" step="0.1" min="50" max="100"
                          placeholder={isSoja ? "78" : isMilho ? "74" : "—"}
                          value={formRomaneio.ph}
                          onChange={e => setFormRomaneio(f => ({ ...f, ph: e.target.value }))} />
                        {formRomaneio.ph && (
                          <div style={{ fontSize: 10, color: parseFloat(formRomaneio.ph) >= (isSoja ? 78 : 74) ? "#16A34A" : "#EF9F27", marginTop: 2 }}>
                            {parseFloat(formRomaneio.ph) >= (isSoja ? 78 : 74) ? "Dentro do padrão ✓" : "Abaixo do mínimo ↓"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Avariados — detalhamento por commodity */}
                    <div style={{ background: "#F8F9FC", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>Avariados{isSoja ? " — ABIOVE / IN MAPA 11/2007" : isMilho ? " — IN MAPA 60/2011" : ""}</span>
                        {avar_pct > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: avar_pct > cls.avariados_padrao ? "#E24B4A" : "#16A34A" }}>
                            Total: {avar_pct.toFixed(2)}%
                            {avar_pct > cls.avariados_padrao ? ` (desc: −${fmt(d_avar, 1)} kg)` : " ✓"}
                          </span>
                        )}
                      </div>
                      {(isSoja || !isMilho) ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                          {([
                            { key: "ardidos",          label: "Ardidos / Queimados (%)" },
                            { key: "mofados",          label: "Mofados (%)" },
                            { key: "fermentados",      label: "Fermentados (%)" },
                            { key: "germinados",       label: "Germinados (%)" },
                            { key: "esverdeados",      label: "Esverdeados / Imaturos (%)" },
                            { key: "quebrados",        label: "Quebrados / Amassados (%)" },
                            { key: "outros_avariados", label: "Outros Avariados (%)" },
                          ] as { key: keyof typeof formRomaneio; label: string }[]).map(({ key, label }) => (
                            <div key={String(key)}>
                              <label style={{ fontSize: 10, color: "#555", marginBottom: 3, display: "block" }}>{label}</label>
                              <input style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} type="number" step="0.1" min="0" max="100"
                                value={formRomaneio[key] as string}
                                onChange={e => setFormRomaneio(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                          ))}
                          {/* Avariados direto (sem sub-parâmetros) */}
                          {!temSub && (
                            <div>
                              <label style={{ fontSize: 10, color: "#888", marginBottom: 3, display: "block" }}>Total direto (%)</label>
                              <input style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} type="number" step="0.1" min="0" max="100"
                                value={formRomaneio.avariados_pct || ""}
                                onChange={e => setFormRomaneio(f => ({ ...f, avariados_pct: parseFloat(e.target.value) || 0 }))} />
                              <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>somente se não detalhar acima</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                          {([
                            { key: "ardidos",          label: "Ardidos e Brotados (%)" },
                            { key: "mofados",          label: "Mofados (%)" },
                            { key: "fermentados",      label: "Fermentados (%)" },
                            { key: "carunchados",      label: "Carunchados / Atacados por Insetos (%)" },
                            { key: "quebrados",        label: "Quebrados e Abaulados (%)" },
                            { key: "outros_avariados", label: "Outros Avariados (%)" },
                          ] as { key: keyof typeof formRomaneio; label: string }[]).map(({ key, label }) => (
                            <div key={String(key)}>
                              <label style={{ fontSize: 10, color: "#555", marginBottom: 3, display: "block" }}>{label}</label>
                              <input style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} type="number" step="0.1" min="0" max="100"
                                value={formRomaneio[key] as string}
                                onChange={e => setFormRomaneio(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                          ))}
                          {!temSub && (
                            <div>
                              <label style={{ fontSize: 10, color: "#888", marginBottom: 3, display: "block" }}>Total direto (%)</label>
                              <input style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} type="number" step="0.1" min="0" max="100"
                                value={formRomaneio.avariados_pct || ""}
                                onChange={e => setFormRomaneio(f => ({ ...f, avariados_pct: parseFloat(e.target.value) || 0 }))} />
                              <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>somente se não detalhar acima</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Apuração */}
                    <div style={{ background: temClassif && totalDescKg > 0 ? "#FFF3E0" : "#D5E8F5", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#0B2D50", marginBottom: 8 }}>Apuração — Balança de Entrada (Fazenda)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#555" }}>Peso Líquido</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmt(pl)} kg</div>
                        </div>
                        {temClassif && (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#555" }}>Descontos (U+I+A)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#E24B4A" }}>−{fmt(totalDescKg, 1)} kg ({fmt(pctDesconto, 1)}%)</div>
                          </div>
                        )}
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#555" }}>Peso Classificado</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0B2D50" }}>{fmt(temClassif ? classificado : pl, 1)} kg</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#555" }}>Sacas ({cls.kg_saca} kg/sc)</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>{fmt(sacas, 2)} sc</div>
                        </div>
                      </div>
                      {!temClassif && <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>Preencha a classificação para calcular descontos.</div>}
                    </div>
                  </div>
                )}

                {erro && <div style={{ color: "#E24B4A", fontSize: 13, background: "#FFF5F5", padding: "8px 12px", borderRadius: 7 }}>{erro}</div>}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setModalRomaneio(null)} style={btnCancelStyle}>Cancelar</button>
                  <button onClick={salvarRomaneio} disabled={salvando || pl <= 0} style={btnPrimStyle}>
                    {salvando ? "Salvando..." : "Confirmar Romaneio"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ──────────────────────────────────────────
          MODAL — Finalizar Colheita
      ────────────────────────────────────────── */}
      {modalFinalizar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setModalFinalizar(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Finalizar Colheita</h2>
              <button onClick={() => setModalFinalizar(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#444" }}>×</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Resumo */}
              <div style={{ background: "#D5E8F5", borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#0B2D50", marginBottom: 8 }}>
                  {PRODUTOS_PADRAO[modalFinalizar.produto]?.label ?? modalFinalizar.produto}
                  {modalFinalizar.variedade ? ` — ${modalFinalizar.variedade}` : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#555" }}>Peso Líquido</div>
                    <div style={{ fontWeight: 600, color: "#0B2D50" }}>{fmt(modalFinalizar.total_kg_bruto / 1000, 2)} t</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#555" }}>Classificado</div>
                    <div style={{ fontWeight: 600, color: "#0B2D50" }}>{fmt(modalFinalizar.total_kg_classificado / 1000, 2)} t</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#555" }}>Sacas</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#1A4870" }}>{fmt(modalFinalizar.total_sacas, 1)} sc</div>
                  </div>
                </div>
                {modalFinalizar.produtividade_sc_ha && (
                  <div style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: "#0B2D50" }}>
                    Produtividade: <strong>{fmt(modalFinalizar.produtividade_sc_ha, 1)} sc/ha</strong>
                  </div>
                )}
              </div>

              {/* Produto para entrada de estoque */}
              {(() => {
                const ciclo = todosCiclos.find(ci => ci.id === modalFinalizar.ciclo_id);
                const produtoNoCiclo = ciclo?.produto_agricola_id ? insumos.find(i => i.id === ciclo.produto_agricola_id) : null;
                return (
                  <label>
                    <div style={lbStyle}>Produto colhido — entrada no estoque</div>
                    {produtoNoCiclo ? (
                      <div style={{ fontSize: 12, background: "#D5E8F5", color: "#0B2D50", padding: "8px 12px", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        <span>Definido no planejamento do ciclo: <strong>{produtoNoCiclo.nome}</strong></span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, background: "#FBF3E0", color: "#7A5200", padding: "8px 12px", borderRadius: 8, marginBottom: 8 }}>
                        Produto não definido no ciclo. Configure em <strong>Cadastros → Safras → editar o ciclo</strong> e selecione o produto colhido. Ou selecione manualmente abaixo.
                      </div>
                    )}
                    <select value={insumoIdFinal} onChange={e => setInsumoIdFinal(e.target.value)} style={inpStyle}>
                      <option value="">Não lançar no estoque agora</option>
                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                    </select>
                    {insumos.length === 0 && (
                      <div style={{ fontSize: 11, color: "#C9921B", marginTop: 4 }}>
                        Nenhum produto agrícola cadastrado. Crie em Cadastros → Insumos com categoria Produto Agrícola.
                      </div>
                    )}
                    {insumoIdFinal && (
                      <div style={{ fontSize: 11, color: "#1A5C38", marginTop: 4 }}>
                        Vai dar entrada de <strong>{fmt(modalFinalizar.total_sacas, 1)} sc</strong> de <strong>{insumos.find(i => i.id === insumoIdFinal)?.nome}</strong> no estoque.
                      </div>
                    )}
                  </label>
                );
              })()}

              <div style={{ background: "#FFFBF0", border: "0.5px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E" }}>
                ⚠️ Ao finalizar, o status da safra será atualizado para <strong>Colhida</strong> e a produtividade registrada automaticamente.
              </div>

              {erro && <div style={{ color: "#E24B4A", fontSize: 13, background: "#FFF5F5", padding: "8px 12px", borderRadius: 7 }}>{erro}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModalFinalizar(null)} style={btnCancelStyle}>Cancelar</button>
                <button onClick={finalizarColheitaModal} disabled={salvando} style={btnPrimStyle}>
                  {salvando ? "Finalizando..." : "Finalizar Colheita"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos compartilhados ────────────────────────────────────

const inpStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8,
  border: "0.5px solid #d0d0cc", outline: "none", boxSizing: "border-box",
  background: "#fff",
};

const lbStyle: React.CSSProperties = {
  fontSize: 11, color: "#666", marginBottom: 5, fontWeight: 600,
};

const secTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase",
  letterSpacing: "0.05em", marginBottom: 10, paddingBottom: 6,
  borderBottom: "0.5px solid #DEE5EE",
};

const btnPrimStyle: React.CSSProperties = {
  background: "#1A4870", color: "#fff", border: "none", borderRadius: 8,
  padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const btnCancelStyle: React.CSSProperties = {
  background: "#F3F6F9", color: "#666", border: "0.5px solid #d0d0cc", borderRadius: 8,
  padding: "9px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer",
};

// ── Componente auxiliar ────────────────────────────────────────

function DescontoBox({ label, valor }: { label: string; valor: number }) {
  return (
    <div style={{
      background: valor > 0 ? "#FFF5F5" : "#F3F6F9",
      borderRadius: 8, padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, color: valor > 0 ? "#E24B4A" : "#444", fontSize: 13 }}>
        {valor > 0 ? `-${(valor / 1000).toFixed(2)} t` : "—"}
      </div>
    </div>
  );
}
