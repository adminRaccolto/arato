"use client";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarRomaneiosEntradaDaConta, criarRomaneioEntrada, atualizarRomaneioEntrada,
  excluirRomaneioEntrada, confirmarRomaneioEntrada,
  listarDepositos, listarPessoasDaConta, listarAnosSafra, listarTodosCiclos, listarInsumos,
  listarContratosDaConta, listarFazendas,
} from "../../../lib/db";
import type { RomaneioEntrada, Deposito, Pessoa, AnoSafra, Ciclo, Insumo, Contrato } from "../../../lib/supabase";

const TODAY = new Date().toISOString().slice(0, 10);
const fmt   = (n?: number | null, d = 2) => (n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

// ── Classificação ────────────────────────────────────────────────────────────
type CommodityClass = { umidade_padrao: number; impureza_padrao: number; avariados_padrao: number; kg_saca: number };
const CLASSE: Record<string, CommodityClass> = {
  soja:    { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 8.0, kg_saca: 60 },
  milho:   { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  algodao: { umidade_padrao: 12.0, impureza_padrao: 1.5, avariados_padrao: 0.0, kg_saca: 15 },
  trigo:   { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 2.0, kg_saca: 60 },
  sorgo:   { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
};
const getClasse = (nome: string): CommodityClass => {
  const n = (nome ?? "").toLowerCase();
  for (const k of Object.keys(CLASSE)) if (n.includes(k)) return CLASSE[k];
  return CLASSE.soja;
};
const calcDescUmid  = (pl: number, u: number, uPad: number) => u > uPad ? +(pl * (u - uPad) / (100 - uPad)).toFixed(2) : 0;
const calcDescImp   = (pl: number, i: number, iPad: number) => i > iPad ? +(pl * (i - iPad) / 100).toFixed(2)          : 0;
const calcDescAvar  = (pl: number, a: number, aPad: number) => a > aPad ? +(pl * (a - aPad) / 100).toFixed(2)          : 0;

// ── Tipos internos ───────────────────────────────────────────────────────────
type Modo = "proprio" | "terceiro";
type FormRom = {
  fazenda_id: string;
  tipo: Modo; data: string; placa: string; motorista: string;
  insumo_id: string; ciclo_id: string; contrato_id: string;
  peso_bruto: string; tara: string;
  umidade: string; impureza: string;
  ardidos: string; mofados: string; fermentados: string; germinados: string;
  esverdeados: string; quebrados: string; carunchados: string; outros_avariados: string;
  avariados_manual: string; usar_sub: boolean;
  ph: string;
  deposito_id: string;
  ticket_interno: string;
  // para terceiro:
  pessoa_id: string; emitido_por: string; ticket_terceiro: string;
  obs: string;
};

const FORM_VAZIO: FormRom = {
  fazenda_id: "",
  tipo: "proprio", data: TODAY, placa: "", motorista: "",
  insumo_id: "", ciclo_id: "", contrato_id: "",
  peso_bruto: "", tara: "",
  umidade: "", impureza: "",
  ardidos: "", mofados: "", fermentados: "", germinados: "",
  esverdeados: "", quebrados: "", carunchados: "", outros_avariados: "",
  avariados_manual: "", usar_sub: false,
  ph: "", deposito_id: "", ticket_interno: "",
  pessoa_id: "", emitido_por: "", ticket_terceiro: "", obs: "",
};

// ── Estilos ──────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #CDD5E0", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 4 };
const btnV: React.CSSProperties = { background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnR: React.CSSProperties = { background: "#F0F4FA", color: "#444", border: "0.5px solid #CDD5E0", borderRadius: 7, padding: "8px 18px", fontSize: 13, cursor: "pointer" };
const btnG: React.CSSProperties = { background: "#16A34A", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };

// ── Modal overlay ─────────────────────────────────────────────────────────────
function Modal({ titulo, onClose, children, width = 800 }: { titulo: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{titulo}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function RomaneioEntradaPage() {
  const { fazendaId, contaId } = useAuth();

  const [fazendas,      setFazendas]      = useState<{ id: string; nome: string }[]>([]);
  const [fazendaFiltro, setFazendaFiltro] = useState("");

  const [romaneios,  setRomaneios]  = useState<RomaneioEntrada[]>([]);
  const [depositos,  setDepositos]  = useState<Deposito[]>([]);
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([]);
  const [anos,       setAnos]       = useState<AnoSafra[]>([]);
  const [ciclos,     setCiclos]     = useState<Ciclo[]>([]);
  const [insumos,    setInsumos]    = useState<Insumo[]>([]);
  const [contratos,  setContratos]  = useState<Contrato[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);

  // Filtros lista
  const [fTipo,    setFTipo]    = useState<"" | "proprio" | "terceiro">("");
  const [fStatus,  setFStatus]  = useState<"" | "rascunho" | "confirmado">("");
  const [fDe,      setFDe]      = useState("");
  const [fAte,     setFAte]     = useState("");
  const [fBusca,   setFBusca]   = useState("");

  // Modal
  const [modal,    setModal]    = useState(false);
  const [editRom,  setEditRom]  = useState<RomaneioEntrada | null>(null);
  const [form,     setForm]     = useState<FormRom>(FORM_VAZIO);
  const [anoSel,   setAnoSel]   = useState("");

  useEffect(() => {
    if (!fazendaId) return;
    const fid = fazendaId;
    listarFazendas(fid).then(f => setFazendas(f as { id: string; nome: string }[])).catch(() => {});
    Promise.all([
      listarRomaneiosEntradaDaConta(fid),
      listarDepositos(fid),
      listarPessoasDaConta(fid),
      listarAnosSafra(fid),
      listarTodosCiclos(fid),
      listarInsumos(fid),
      listarContratosDaConta(contaId ?? "", fid),
    ]).then(([r, d, p, a, c, i, ct]) => {
      setRomaneios(r);
      setDepositos(d.filter(x => x.ativo));
      setPessoas(p);
      setAnos(a);
      setCiclos(c);
      setInsumos(i.filter(x => x.categoria === "produto_agricola"));
      setContratos(ct);
    }).catch(console.error).finally(() => setLoading(false));
  }, [fazendaId, contaId]);

  // Ciclos filtrados pelo ano selecionado no modal
  const ciclosFiltro = useMemo(() =>
    anoSel ? ciclos.filter(c => c.ano_safra_id === anoSel) : ciclos,
  [ciclos, anoSel]);

  // ── Cálculo classificação ────────────────────────────────────────────────
  const calc = useMemo(() => {
    const bruto = parseFloat(form.peso_bruto) || 0;
    const tara  = parseFloat(form.tara) || 0;
    const pl    = Math.max(0, bruto - tara);
    const insumoNome = insumos.find(i => i.id === form.insumo_id)?.nome ?? "soja";
    const cls   = getClasse(insumoNome);

    const pArd = parseFloat(form.ardidos)          || 0;
    const pMof = parseFloat(form.mofados)          || 0;
    const pFer = parseFloat(form.fermentados)      || 0;
    const pGer = parseFloat(form.germinados)       || 0;
    const pEsv = parseFloat(form.esverdeados)      || 0;
    const pQue = parseFloat(form.quebrados)        || 0;
    const pCar = parseFloat(form.carunchados)      || 0;
    const pOut = parseFloat(form.outros_avariados) || 0;
    const temSub = form.usar_sub && (pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut) > 0;
    const avar  = temSub
      ? +(pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut).toFixed(2)
      : (parseFloat(form.avariados_manual) || 0);
    const umid  = parseFloat(form.umidade)  || 0;
    const imp   = parseFloat(form.impureza) || 0;

    const dUmid = calcDescUmid(pl, umid, cls.umidade_padrao);
    const dImp  = calcDescImp(pl,  imp,  cls.impureza_padrao);
    const dAvar = calcDescAvar(pl, avar, cls.avariados_padrao);
    const class_ = Math.max(0, pl - dUmid - dImp - dAvar);
    const sacas  = +(class_ / cls.kg_saca).toFixed(3);

    return { pl, cls, umid, imp, avar, dUmid, dImp, dAvar, class_, sacas, temSub,
             pArd, pMof, pFer, pGer, pEsv, pQue, pCar, pOut };
  }, [form, insumos]);

  // ── Abrir modal ──────────────────────────────────────────────────────────
  const abrirNovo = () => {
    setEditRom(null);
    setAnoSel("");
    setForm(FORM_VAZIO);
    setModal(true);
  };
  const abrirEditar = (r: RomaneioEntrada) => {
    setEditRom(r);
    const ciclo = ciclos.find(c => c.id === r.ciclo_id);
    setAnoSel(ciclo?.ano_safra_id ?? "");
    setForm({
      fazenda_id: r.fazenda_id ?? "",
      tipo: r.tipo, data: r.data, placa: r.placa ?? "", motorista: r.motorista ?? "",
      insumo_id: r.insumo_id ?? "", ciclo_id: r.ciclo_id ?? "", contrato_id: r.contrato_id ?? "",
      peso_bruto: String(r.peso_bruto_kg ?? ""), tara: String(r.tara_kg ?? ""),
      umidade: String(r.umidade_pct ?? ""), impureza: String(r.impureza_pct ?? ""),
      ardidos: String(r.ardidos_pct ?? ""), mofados: String(r.mofados_pct ?? ""),
      fermentados: String(r.fermentados_pct ?? ""), germinados: String(r.germinados_pct ?? ""),
      esverdeados: String(r.esverdeados_pct ?? ""), quebrados: String(r.quebrados_pct ?? ""),
      carunchados: String(r.carunchados_pct ?? ""), outros_avariados: String(r.outros_avariados_pct ?? ""),
      avariados_manual: String(r.avariados_pct ?? ""), usar_sub: !!(r.ardidos_pct || r.mofados_pct),
      ph: String(r.ph_hl ?? ""),
      deposito_id: r.deposito_id ?? "", ticket_interno: r.ticket_numero ?? "",
      pessoa_id: r.pessoa_id ?? "", emitido_por: r.emitido_por ?? "",
      ticket_terceiro: r.ticket_terceiro ?? "", obs: r.obs ?? "",
    });
    setModal(true);
  };

  // ── Salvar ───────────────────────────────────────────────────────────────
  const salvar = async (confirmar = false) => {
    if (!fazendaId) return;
    if (!form.peso_bruto || parseFloat(form.peso_bruto) <= 0) { alert("Informe o peso bruto."); return; }
    if (confirmar && form.tipo === "proprio" && !form.deposito_id) { alert("Selecione o depósito de destino."); return; }
    setSalvando(true);
    try {
      const { pl, cls, umid, imp, avar, dUmid, dImp, dAvar, class_, sacas,
              temSub, pArd, pMof, pFer, pGer, pEsv, pQue, pCar, pOut } = calc;
      const temClassif = umid > 0 || imp > 0 || avar > 0;
      const insumoNome = insumos.find(i => i.id === form.insumo_id)?.nome ?? undefined;

      const fidRom = form.fazenda_id || fazendaId!;
      const payload: Omit<RomaneioEntrada, "id" | "created_at" | "peso_liquido_kg"> = {
        fazenda_id:           fidRom,
        tipo:                 form.tipo,
        data:                 form.data,
        placa:                form.placa.toUpperCase() || null,
        motorista:            form.motorista || null,
        ticket_numero:        form.ticket_interno || null,
        insumo_id:            form.insumo_id || null,
        produto_nome:         insumoNome ?? null,
        ciclo_id:             form.ciclo_id || null,
        contrato_id:          form.contrato_id || null,
        peso_bruto_kg:        parseFloat(form.peso_bruto) || 0,
        tara_kg:              parseFloat(form.tara) || 0,
        umidade_pct:          umid || null,
        umidade_padrao_pct:   temClassif ? cls.umidade_padrao : null,
        desconto_umidade_kg:  dUmid || null,
        impureza_pct:         imp || null,
        impureza_padrao_pct:  temClassif ? cls.impureza_padrao : null,
        desconto_impureza_kg: dImp || null,
        avariados_pct:        avar || null,
        avariados_padrao_pct: temClassif ? cls.avariados_padrao : null,
        desconto_avariados_kg: dAvar || null,
        ardidos_pct:          temSub ? pArd || null : null,
        mofados_pct:          temSub ? pMof || null : null,
        fermentados_pct:      temSub ? pFer || null : null,
        germinados_pct:       temSub ? pGer || null : null,
        esverdeados_pct:      temSub ? pEsv || null : null,
        quebrados_pct:        temSub ? pQue || null : null,
        carunchados_pct:      temSub ? pCar || null : null,
        outros_avariados_pct: temSub ? pOut || null : null,
        ph_hl:                parseFloat(form.ph) || null,
        peso_classificado_kg: class_,
        sacas,
        deposito_id:          form.deposito_id || null,
        pessoa_id:            form.tipo === "terceiro" ? form.pessoa_id || null : null,
        emitido_por:          form.tipo === "terceiro" ? form.emitido_por || null : null,
        ticket_terceiro:      form.tipo === "terceiro" ? form.ticket_terceiro || null : null,
        obs:                  form.obs || null,
        status:               confirmar ? "confirmado" : "rascunho",
        entrada_estoque:      false,
      };

      let rom: RomaneioEntrada;
      if (editRom) {
        await atualizarRomaneioEntrada(editRom.id, payload);
        rom = { ...editRom, ...payload };
      } else {
        rom = await criarRomaneioEntrada(payload);
      }

      if (confirmar && !rom.entrada_estoque) {
        await confirmarRomaneioEntrada(rom, fidRom);
        rom = { ...rom, status: "confirmado", entrada_estoque: true };
      }

      setRomaneios(prev => editRom
        ? prev.map(r => r.id === editRom.id ? rom : r)
        : [rom, ...prev]
      );
      setModal(false);
    } catch (e) {
      alert("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  };

  // ── Confirmar rascunho existente ─────────────────────────────────────────
  const confirmarExistente = async (r: RomaneioEntrada) => {
    if (!fazendaId) return;
    if (r.tipo === "proprio" && !r.deposito_id) { alert("Edite o romaneio e selecione o depósito de destino antes de confirmar."); return; }
    if (!confirm(`Confirmar romaneio ${r.ticket_numero ?? r.id.slice(0, 8)}? Isso gerará entrada no estoque.`)) return;
    try {
      await confirmarRomaneioEntrada(r, fazendaId);
      setRomaneios(prev => prev.map(x => x.id === r.id ? { ...x, status: "confirmado", entrada_estoque: true } : x));
    } catch (e) {
      alert("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // ── Filtros lista ────────────────────────────────────────────────────────
  const filtrados = useMemo(() => romaneios.filter(r => {
    if (fazendaFiltro && r.fazenda_id !== fazendaFiltro) return false;
    if (fTipo   && r.tipo !== fTipo)     return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fDe     && r.data < fDe)         return false;
    if (fAte    && r.data > fAte)         return false;
    if (fBusca) {
      const b = fBusca.toLowerCase();
      const match = (r.produto_nome ?? "").toLowerCase().includes(b)
        || (r.placa ?? "").toLowerCase().includes(b)
        || (r.motorista ?? "").toLowerCase().includes(b)
        || (r.ticket_numero ?? "").toLowerCase().includes(b)
        || (r.ticket_terceiro ?? "").toLowerCase().includes(b)
        || (r.emitido_por ?? "").toLowerCase().includes(b);
      if (!match) return false;
    }
    return true;
  }), [romaneios, fazendaFiltro, fTipo, fStatus, fDe, fAte, fBusca]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const sacasTotal    = filtrados.reduce((s, r) => s + (r.sacas ?? 0), 0);
  const pesoTotal     = filtrados.reduce((s, r) => s + (r.peso_classificado_kg ?? r.peso_bruto_kg - r.tara_kg), 0);
  const qRascunho     = filtrados.filter(r => r.status === "rascunho").length;
  const qConfirmado   = filtrados.filter(r => r.status === "confirmado").length;

  // ── Render ───────────────────────────────────────────────────────────────
  const deposArmazem = depositos.filter(d => d.tipo === "armazem_fazenda");

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Carregando…</div>;

  return (
    <div style={{ padding: "24px 28px", background: "#F4F6FA", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Romaneio de Entrada</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Recebimento de grãos — pesagem própria ou ticket de terceiros</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {fazendas.length > 1 && (
            <select value={fazendaFiltro} onChange={e => setFazendaFiltro(e.target.value)}
              style={{ padding: "8px 12px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", minWidth: 160 }}>
              <option value="">Todas as fazendas</option>
              {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}</option>)}
            </select>
          )}
          <button style={btnV} onClick={abrirNovo}>+ Novo Romaneio</button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Romaneios",      value: String(filtrados.length),           color: "#1A5CB8", bg: "#EBF3FF" },
          { label: "Sacas (filtro)", value: fmt(sacasTotal, 0) + " sc",          color: "#16A34A", bg: "#ECFDF5" },
          { label: "Peso Classif.", value: fmt(pesoTotal / 1000, 1) + " t",      color: "#7C3AED", bg: "#F5F3FF" },
          { label: "Em Rascunho",   value: String(qRascunho) + " / " + String(qConfirmado) + " conf.", color: "#C9921B", bg: "#FBF3E0" },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: `0.5px solid ${k.bg === "#fff" ? "#DDE2EE" : k.bg}` }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...inp, width: 180 }} placeholder="Buscar placa, ticket, produto…" value={fBusca} onChange={e => setFBusca(e.target.value)} />
        <select style={{ ...inp, width: 160 }} value={fTipo} onChange={e => setFTipo(e.target.value as typeof fTipo)}>
          <option value="">Todos os tipos</option>
          <option value="proprio">Pesagem Própria</option>
          <option value="terceiro">Romaneio Terceiro</option>
        </select>
        <select style={{ ...inp, width: 150 }} value={fStatus} onChange={e => setFStatus(e.target.value as typeof fStatus)}>
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="confirmado">Confirmado</option>
        </select>
        <input type="date" style={{ ...inp, width: 150 }} value={fDe}  onChange={e => setFDe(e.target.value)}  placeholder="De" />
        <input type="date" style={{ ...inp, width: 150 }} value={fAte} onChange={e => setFAte(e.target.value)} placeholder="Até" />
        {(fBusca || fTipo || fStatus || fDe || fAte) && (
          <button style={btnR} onClick={() => { setFBusca(""); setFTipo(""); setFStatus(""); setFDe(""); setFAte(""); }}>Limpar</button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{filtrados.length} registro{filtrados.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F3F6FB" }}>
              {["Ticket / Data", "Tipo", "Produto / Ciclo", "Origem / Emissor", "Placa", "Peso Líq.", "Sacas", "Status", ""].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum romaneio de entrada encontrado. Clique em "+ Novo Romaneio" para registrar.
              </td></tr>
            ) : filtrados.map((r, ri) => {
              const cicloNome = ciclos.find(c => c.id === r.ciclo_id)?.descricao;
              const deposNome = depositos.find(d => d.id === r.deposito_id)?.nome;
              const pessNome  = pessoas.find(p => p.id === r.pessoa_id)?.nome;
              const pl = (r.peso_bruto_kg ?? 0) - (r.tara_kg ?? 0);
              return (
                <tr key={r.id} style={{ borderBottom: ri < filtrados.length - 1 ? "0.5px solid #EEF1F7" : "none" }}>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                      {r.ticket_numero ?? <span style={{ color: "#aaa" }}>s/nº</span>}
                      {r.ticket_terceiro && <span style={{ fontSize: 10, color: "#555", display: "block" }}>Terceiro: {r.ticket_terceiro}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>{fmtData(r.data)}</div>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 600,
                      background: r.tipo === "proprio" ? "#EBF3FF" : "#F5F3FF",
                      color:      r.tipo === "proprio" ? "#1A5CB8" : "#7C3AED" }}>
                      {r.tipo === "proprio" ? "Própria" : "Terceiro"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{r.produto_nome ?? "—"}</div>
                    {cicloNome && <div style={{ fontSize: 10, color: "#555" }}>{cicloNome}</div>}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#444" }}>
                    {r.tipo === "proprio"
                      ? (deposNome ?? "—")
                      : (r.emitido_por ?? pessNome ?? "—")}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#444" }}>{r.placa ?? "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#1a1a1a", fontWeight: 600, textAlign: "right" }}>
                    {fmt(r.peso_classificado_kg ?? pl, 0)} kg
                    {r.peso_classificado_kg && r.peso_classificado_kg < pl - 1 && (
                      <div style={{ fontSize: 10, color: "#E24B4A" }}>−{fmt(pl - r.peso_classificado_kg, 0)} desc.</div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, color: "#16A34A", textAlign: "right" }}>
                    {fmt(r.sacas ?? pl / 60, 3)} sc
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                      background: r.status === "confirmado" ? "#ECFDF5" : "#FBF3E0",
                      color:      r.status === "confirmado" ? "#16A34A" : "#C9921B" }}>
                      {r.status === "confirmado" ? "Confirmado" : "Rascunho"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={{ ...btnR, padding: "4px 10px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                      {r.status === "rascunho" && (
                        <button style={{ ...btnG, padding: "4px 10px", fontSize: 11 }} onClick={() => confirmarExistente(r)}>Confirmar</button>
                      )}
                      {r.status === "rascunho" && (
                        <button
                          style={{ background: "#FEF2F2", color: "#E24B4A", border: "0.5px solid #FECACA", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                          onClick={() => { if (confirm("Excluir?")) excluirRomaneioEntrada(r.id).then(() => setRomaneios(p => p.filter(x => x.id !== r.id))); }}
                        >✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal Novo / Editar ─────────────────────────────────────────────── */}
      {modal && (
        <Modal titulo={editRom ? "Editar Romaneio de Entrada" : "Novo Romaneio de Entrada"} onClose={() => setModal(false)} width={860}>

          {/* Fazenda — seletor explícito */}
          {fazendas.length > 1 && (
            <div style={{ background:"#EFF6FF", border:"0.5px solid #B8D4F0", borderRadius:10, padding:"10px 16px", marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#1A4870", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Este romaneio pertence a</div>
              <select style={{ width:"100%", padding:"7px 10px", borderRadius:6, border:"0.5px solid #DDE2EE", fontSize:13, background:"#fff" }}
                value={form.fazenda_id || fazendaId || ""}
                onChange={e => setForm(p => ({ ...p, fazenda_id: e.target.value }))}>
                <option value="">— Selecionar fazenda —</option>
                {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}</option>)}
              </select>
            </div>
          )}

          {/* Toggle tipo */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "0.5px solid #CDD5E0", borderRadius: 8, overflow: "hidden" }}>
            {([["proprio", "Pesagem Própria", "#1A5CB8"], ["terceiro", "Romaneio de Terceiro", "#7C3AED"]] as const).map(([v, l, c]) => (
              <button key={v} disabled={editRom?.status === "confirmado"} onClick={() => setForm(p => ({ ...p, tipo: v }))} style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: form.tipo === v ? c : "#F8FAFD",
                color:      form.tipo === v ? "#fff" : "#555",
                transition: "background .15s",
              }}>{l}</button>
            ))}
          </div>

          {/* Info contextual */}
          {form.tipo === "proprio" ? (
            <div style={{ background: "#EBF3FF", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#0B2D50", marginBottom: 18 }}>
              <strong>Pesagem Própria</strong> — você tem balança. Pese o caminhão, informe bruto e tara. O peso líquido e as sacas serão calculados automaticamente.
            </div>
          ) : (
            <div style={{ background: "#F5F3FF", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#4C1D95", marginBottom: 18 }}>
              <strong>Romaneio de Terceiro</strong> — o comprador/armazém emitiu o ticket. Registre os dados do documento recebido para conferência e controle de contrato.
            </div>
          )}

          {/* Dados básicos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Data *</label>
              <input style={inp} type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} disabled={editRom?.status === "confirmado"} />
            </div>
            <div>
              <label style={lbl}>Ticket Interno</label>
              <input style={inp} placeholder="Ex: 001" value={form.ticket_interno} onChange={e => setForm(p => ({ ...p, ticket_interno: e.target.value }))} disabled={editRom?.status === "confirmado"} />
            </div>
            {form.tipo === "terceiro" && (
              <div>
                <label style={lbl}>Ticket do Terceiro</label>
                <input style={inp} placeholder="Nº do ticket/romaneio deles" value={form.ticket_terceiro} onChange={e => setForm(p => ({ ...p, ticket_terceiro: e.target.value }))} disabled={editRom?.status === "confirmado"} />
              </div>
            )}
          </div>

          {/* Emissor (apenas terceiro) */}
          {form.tipo === "terceiro" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, padding: "12px 14px", background: "#FAFAFA", borderRadius: 8, border: "0.5px solid #E2E8F0" }}>
              <div>
                <label style={lbl}>Emitido por (empresa) *</label>
                <input style={inp} placeholder="Ex: Bunge Alimentos, Cooperativa…" value={form.emitido_por} onChange={e => setForm(p => ({ ...p, emitido_por: e.target.value }))} disabled={editRom?.status === "confirmado"} />
              </div>
              <div>
                <label style={lbl}>Vínculo Cadastro (Pessoas)</label>
                <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))} disabled={editRom?.status === "confirmado"}>
                  <option value="">— sem vínculo —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Contrato Relacionado (opcional — para conferência)</label>
                <select style={inp} value={form.contrato_id} onChange={e => setForm(p => ({ ...p, contrato_id: e.target.value }))} disabled={editRom?.status === "confirmado"}>
                  <option value="">— sem vínculo —</option>
                  {contratos.filter(c => c.status !== "cancelado").map(c => (
                    <option key={c.id} value={c.id}>{c.numero} — {c.produto ?? c.tipo} ({c.quantidade_sc ? fmt(c.quantidade_sc, 0) + " sc" : ""})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Produto e Ciclo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Produto</label>
              <select style={inp} value={form.insumo_id} onChange={e => setForm(p => ({ ...p, insumo_id: e.target.value }))} disabled={editRom?.status === "confirmado"}>
                <option value="">— selecione —</option>
                {insumos.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ano Safra</label>
              <select style={inp} value={anoSel} onChange={e => { setAnoSel(e.target.value); setForm(p => ({ ...p, ciclo_id: "" })); }} disabled={editRom?.status === "confirmado"}>
                <option value="">— selecione —</option>
                {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ciclo / Empreendimento</label>
              <select style={inp} value={form.ciclo_id} onChange={e => setForm(p => ({ ...p, ciclo_id: e.target.value }))} disabled={editRom?.status === "confirmado" || !anoSel}>
                <option value="">— selecione —</option>
                {ciclosFiltro.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
            </div>
          </div>

          {/* Transporte */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Placa do Veículo</label>
              <input style={inp} placeholder="ABC-1234" value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))} disabled={editRom?.status === "confirmado"} />
            </div>
            <div>
              <label style={lbl}>Motorista</label>
              <input style={inp} value={form.motorista} onChange={e => setForm(p => ({ ...p, motorista: e.target.value }))} disabled={editRom?.status === "confirmado"} />
            </div>
          </div>

          {/* Pesagem */}
          <div style={{ background: "#F8FAFD", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 12 }}>Pesagem</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Peso Bruto (kg) *</label>
                <input style={inp} type="number" min="0" step="0.01" placeholder="Ex: 45000" value={form.peso_bruto}
                  onChange={e => setForm(p => ({ ...p, peso_bruto: e.target.value }))} disabled={editRom?.status === "confirmado"} />
              </div>
              <div>
                <label style={lbl}>Tara (kg) *</label>
                <input style={inp} type="number" min="0" step="0.01" placeholder="Ex: 13500 (peso do caminhão vazio)" value={form.tara}
                  onChange={e => setForm(p => ({ ...p, tara: e.target.value }))} disabled={editRom?.status === "confirmado"} />
              </div>
              <div>
                <label style={lbl}>Peso Líquido (calculado)</label>
                <div style={{ ...inp, background: "#F0F4FA", color: "#1A5CB8", fontWeight: 700, fontSize: 14 }}>
                  {fmt(calc.pl, 0)} kg
                </div>
              </div>
            </div>
          </div>

          {/* Classificação */}
          <div style={{ background: "#FAFAFA", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 12 }}>
              Classificação do Grão
              <span style={{ fontSize: 11, fontWeight: 400, color: "#666", marginLeft: 8 }}>
                (padrão: umidade {fmt(calc.cls.umidade_padrao, 1)}% · impureza {fmt(calc.cls.impureza_padrao, 1)}% · avariados {fmt(calc.cls.avariados_padrao, 1)}%)
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                { label: "Umidade (%)", key: "umidade" as const },
                { label: "Impureza (%)", key: "impureza" as const },
                { label: "PH (kg/hl)", key: "ph" as const },
              ].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input style={inp} type="number" step="0.01" min="0" placeholder="0,00"
                    value={(form as unknown as Record<string, string>)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    disabled={editRom?.status === "confirmado"} />
                </div>
              ))}
            </div>

            {/* Avariados */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#444" }}>Avariados</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.usar_sub} disabled={editRom?.status === "confirmado"}
                    onChange={e => setForm(p => ({ ...p, usar_sub: e.target.checked }))} />
                  Detalhar sub-parâmetros
                </label>
              </div>
              {!form.usar_sub ? (
                <div style={{ maxWidth: 200 }}>
                  <label style={lbl}>Total avariados (%)</label>
                  <input style={inp} type="number" step="0.01" min="0" placeholder="0,00"
                    value={form.avariados_manual}
                    onChange={e => setForm(p => ({ ...p, avariados_manual: e.target.value }))}
                    disabled={editRom?.status === "confirmado"} />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[
                    { label: "Ardidos (%)",    key: "ardidos" as const },
                    { label: "Mofados (%)",    key: "mofados" as const },
                    { label: "Fermentados (%)", key: "fermentados" as const },
                    { label: "Germinados (%)", key: "germinados" as const },
                    { label: "Esverdeados (%)", key: "esverdeados" as const },
                    { label: "Quebrados (%)",  key: "quebrados" as const },
                    { label: "Carunchados (%)", key: "carunchados" as const },
                    { label: "Outros (%)",     key: "outros_avariados" as const },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ ...lbl, fontSize: 10 }}>{f.label}</label>
                      <input style={inp} type="number" step="0.01" min="0" placeholder="0,00"
                        value={(form as unknown as Record<string, string>)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        disabled={editRom?.status === "confirmado"} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resultado da classificação */}
            {calc.pl > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12, padding: "12px 14px", background: "#EBF3FF", borderRadius: 8 }}>
                {[
                  { label: "Desc. Umidade",   value: calc.dUmid > 0 ? `−${fmt(calc.dUmid, 0)} kg` : "—", color: calc.dUmid > 0 ? "#E24B4A" : "#555" },
                  { label: "Desc. Impureza",  value: calc.dImp  > 0 ? `−${fmt(calc.dImp,  0)} kg` : "—", color: calc.dImp > 0 ? "#E24B4A" : "#555" },
                  { label: "Desc. Avariados", value: calc.dAvar > 0 ? `−${fmt(calc.dAvar, 0)} kg` : "—", color: calc.dAvar > 0 ? "#E24B4A" : "#555" },
                  { label: "Peso Classificado", value: `${fmt(calc.class_, 0)} kg`, color: "#1A5CB8" },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sacas */}
            {calc.class_ > 0 && (
              <div style={{ marginTop: 10, textAlign: "center", padding: "10px", background: "#ECFDF5", borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: "#555" }}>Total em sacas: </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#16A34A" }}>{fmt(calc.sacas, 3)}</span>
                <span style={{ fontSize: 12, color: "#555" }}> sc ({calc.cls.kg_saca} kg/sc)</span>
              </div>
            )}
          </div>

          {/* Destino (apenas para próprio) */}
          {form.tipo === "proprio" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Depósito / Armazém de Destino *</label>
                <select style={inp} value={form.deposito_id} onChange={e => setForm(p => ({ ...p, deposito_id: e.target.value }))} disabled={editRom?.status === "confirmado"}>
                  <option value="">— selecione —</option>
                  {deposArmazem.length > 0 ? (
                    deposArmazem.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)
                  ) : depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
                {deposArmazem.length === 0 && <div style={{ fontSize: 11, color: "#C9921B", marginTop: 4 }}>Nenhum armazém cadastrado. Vá em Cadastros → Depósitos.</div>}
              </div>
            </div>
          )}

          {/* Observações */}
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Observações</label>
            <textarea style={{ ...inp, height: 56, resize: "vertical" }} value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} disabled={editRom?.status === "confirmado"} />
          </div>

          {/* Botões */}
          {editRom?.status === "confirmado" ? (
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, marginRight: 12 }}>✓ Romaneio confirmado — apenas leitura</span>
              <button style={btnR} onClick={() => setModal(false)}>Fechar</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
              <button style={{ ...btnR, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={() => salvar(false)}>
                {salvando ? "Salvando…" : "Salvar Rascunho"}
              </button>
              <button style={{ ...btnG, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={() => salvar(true)}>
                {salvando ? "Confirmando…" : "✓ Confirmar e Dar Entrada no Estoque"}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
