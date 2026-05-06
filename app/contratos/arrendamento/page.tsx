"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarAnosSafra, criarLancamento, listarProdutores } from "../../../lib/db";
import type { AnoSafra } from "../../../lib/supabase";

// ── tipos ─────────────────────────────────────────────────
type FormaPage = "sc_soja" | "sc_milho" | "sc_soja_milho" | "brl";
type StatusPag  = "pendente" | "pago" | "parcial" | "cancelado";

interface Arrendamento {
  id: string; fazenda_id: string;
  proprietario_id?: string | null; proprietario_nome?: string | null;
  area_ha: number; forma_pagamento: FormaPage;
  sc_ha?: number | null;       // soja sc/ha (ou único para sc_soja/sc_milho)
  sc_milho_ha?: number | null; // milho sc/ha — só usado em sc_soja_milho
  valor_brl?: number | null;
  ano_safra_id?: string | null; inicio?: string | null; vencimento?: string | null;
  renovacao_auto?: boolean; observacao?: string | null;
  produtor_id?: string | null;   // agricultor principal (locatário)
  produtor_id_2?: string | null; // segundo agricultor — contrato conjunto 50/50
}
interface Produtor { id: string; nome: string; }
interface Pagamento {
  id: string; arrendamento_id: string; fazenda_id: string;
  ano_safra_id?: string | null; data_vencimento: string;
  data_pagamento?: string | null;
  sacas_previstas?: number | null; sacas_pagas?: number | null;
  commodity?: string | null; preco_sc_referencia?: number | null;
  valor_previsto?: number | null; valor_pago?: number | null;
  status: StatusPag; observacao?: string | null;
  lancamento_id?: string | null; // link para lancamentos (BRL)
}
// config por safra no modal gerador
interface ConfigSafra {
  ano_safra_id: string;
  descricao: string;
  anoFim: number;
  incluir: boolean;
  // sacas
  sc_soja_ha: string;   // sc/ha para soja (editável)
  sc_milho_ha: string;  // sc/ha para milho (editável)
  preco_soja: string;   // R$/sc referência
  preco_milho: string;  // R$/sc referência
  dt_venc_soja: string; // padrão 30/04/anoFim
  dt_venc_milho: string;// padrão 31/07/anoFim
  // brl
  valor_brl: string;    // R$ do arrendamento anual
  dt_venc_brl: string;  // padrão 31/05/anoFim (pós-colheita)
}

// ── helpers ───────────────────────────────────────────────
const fmtR   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN   = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDt  = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const hoje   = () => new Date().toISOString().slice(0, 10);
const FORMA_LABEL: Record<FormaPage, string> = {
  sc_soja:       "Sacas de Soja",
  sc_milho:      "Sacas de Milho",
  sc_soja_milho: "Sacas Soja + Milho",
  brl:           "R$ (Real)",
};
const STATUS_PAG: Record<StatusPag, { label: string; bg: string; color: string }> = {
  pendente:  { label: "Pendente",  bg: "#FBF3E0", color: "#7A5A12" },
  pago:      { label: "Pago",      bg: "#ECFDF5", color: "#14532D" },
  parcial:   { label: "Parcial",   bg: "#EBF3FC", color: "#0C447C" },
  cancelado: { label: "Cancelado", bg: "#F4F6FA", color: "#888"    },
};

function extrairAnoFim(descricao: string): number {
  const parts = descricao.split("/");
  return parseInt(parts[parts.length - 1]) || new Date().getFullYear();
}

function isoData(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
}

// ── estilos ───────────────────────────────────────────────
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const inpSm: React.CSSProperties = { ...inp, padding: "5px 8px", fontSize: 12 };
const lbl: React.CSSProperties  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };

function Modal({ titulo, subtitulo, onClose, width = 760, children }: {
  titulo: string; subtitulo?: string; onClose: () => void; width?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>;
}

interface Pessoa  { id: string; nome: string; }
interface Fazenda { id: string; nome: string; }

// ── componente principal ───────────────────────────────────
type Aba = "lista" | "pagamentos" | "calendario";

const initFC = () => ({
  fazenda_id: "", proprietario_id: "", proprietario_nome: "",
  area_ha: "", forma_pagamento: "sc_soja" as FormaPage,
  sc_soja_ha: "", sc_milho_ha: "", valor_brl: "",
  inicio: "", vencimento: "", renovacao_auto: false, observacao: "",
  produtor_id: "", produtor_id_2: "",
});

export default function Arrendamentos() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<Aba>("lista");

  const [arrendamentos, setArrendamentos] = useState<Arrendamento[]>([]);
  const [pagamentos,    setPagamentos]    = useState<Pagamento[]>([]);
  const [anosSafra,     setAnosSafra]     = useState<AnoSafra[]>([]);
  const [pessoas,       setPessoas]       = useState<Pessoa[]>([]);
  const [produtores,    setProdutores]    = useState<Produtor[]>([]);
  const [_fazendas,     setFazendas]      = useState<Fazenda[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [salvando,      setSalvando]      = useState(false);

  // modal novo contrato
  const [modalContrato, setModalContrato] = useState(false);
  const [editContrato,  setEditContrato]  = useState<Arrendamento | null>(null);
  const [fC, setFC] = useState(initFC());

  // filtros
  const [filtroAno,    setFiltroAno]    = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusPag | "todos">("todos");
  const [expandedArr,  setExpandedArr]  = useState<Set<string>>(new Set());
  const [pagsByArr,    setPagsByArr]    = useState<Record<string, Pagamento[]>>({});

  // modal pagamento manual
  const [modalPag,  setModalPag]  = useState(false);
  const [editPag,   setEditPag]   = useState<Pagamento | null>(null);
  const [selArr,    setSelArr]    = useState<Arrendamento | null>(null);
  const initFP = () => ({
    ano_safra_id: "", data_vencimento: hoje(), data_pagamento: "",
    sacas_previstas: "", sacas_pagas: "", commodity: "Soja",
    preco_sc_referencia: "", valor_previsto: "", valor_pago: "",
    status: "pendente" as StatusPag, observacao: "",
  });
  const [fP, setFP] = useState(initFP());

  // modal gerador de parcelas (novo — por safra)
  const [modalGerador,    setModalGerador]    = useState(false);
  const [selArrGerador,   setSelArrGerador]   = useState<Arrendamento | null>(null);
  const [configSafras,    setConfigSafras]    = useState<ConfigSafra[]>([]);

  // ── carga inicial ──────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);
    Promise.all([
      supabase.from("arrendamentos").select("*").eq("fazenda_id", fazendaId).order("proprietario_nome"),
      supabase.from("arrendamento_pagamentos").select("*").eq("fazenda_id", fazendaId).order("data_vencimento"),
      listarAnosSafra(fazendaId),
      supabase.from("pessoas").select("id,nome").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("fazendas").select("id,nome").eq("id", fazendaId),
      listarProdutores(fazendaId),
    ]).then(([arrR, pagR, anos, pesR, fazR, prods]) => {
      setArrendamentos((arrR.data ?? []) as Arrendamento[]);
      setPagamentos((pagR.data ?? []) as Pagamento[]);
      setAnosSafra(anos);
      setPessoas((pesR.data ?? []) as Pessoa[]);
      setFazendas((fazR.data ?? []) as Fazenda[]);
      setProdutores(prods as Produtor[]);
    }).finally(() => setLoading(false));
  }, [fazendaId]);

  // ── pagamentos por arrendamento ─────────────────────────
  useEffect(() => {
    const map: Record<string, Pagamento[]> = {};
    for (const p of pagamentos) {
      if (!map[p.arrendamento_id]) map[p.arrendamento_id] = [];
      map[p.arrendamento_id].push(p);
    }
    setPagsByArr(map);
  }, [pagamentos]);

  // ── toggle expandir arrendamento ────────────────────────
  async function toggleArr(id: string) {
    setExpandedArr(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    if (!pagsByArr[id]) {
      const { data } = await supabase.from("arrendamento_pagamentos").select("*").eq("arrendamento_id", id).order("data_vencimento");
      setPagamentos(prev => {
        const ids = new Set(prev.map(p => p.id));
        const novos = (data ?? []).filter((p: Pagamento) => !ids.has(p.id));
        return [...prev, ...novos as Pagamento[]];
      });
    }
  }

  // ── salvar contrato ─────────────────────────────────────
  async function salvarContrato() {
    if (!fazendaId) return;
    setSalvando(true);
    try {
      const pessoa = pessoas.find(p => p.id === fC.proprietario_id);
      const payload = {
        fazenda_id: fazendaId,
        proprietario_id: fC.proprietario_id || null,
        proprietario_nome: fC.proprietario_nome || pessoa?.nome || null,
        area_ha: parseFloat(fC.area_ha) || 0,
        forma_pagamento: fC.forma_pagamento,
        // brl também guarda sc/ha como referência de cálculo
        sc_ha:       fC.sc_soja_ha ? parseFloat(fC.sc_soja_ha) : null,
        sc_milho_ha: (fC.forma_pagamento === "sc_soja_milho" || fC.forma_pagamento === "brl") && fC.sc_milho_ha ? parseFloat(fC.sc_milho_ha) : null,
        valor_brl:   fC.forma_pagamento === "brl" && fC.valor_brl ? parseFloat(fC.valor_brl) : null,
        inicio:     fC.inicio     || null,
        vencimento: fC.vencimento || null,
        renovacao_auto: fC.renovacao_auto,
        observacao: fC.observacao || null,
        produtor_id:   fC.produtor_id   || null,
        produtor_id_2: fC.produtor_id_2 || null,
      };
      if (editContrato) {
        const { data, error } = await supabase.from("arrendamentos").update(payload).eq("id", editContrato.id).select().single();
        if (error) throw error;
        setArrendamentos(prev => prev.map(a => a.id === editContrato.id ? data as Arrendamento : a));
      } else {
        const { data, error } = await supabase.from("arrendamentos").insert(payload).select().single();
        if (error) throw error;
        setArrendamentos(prev => [...prev, data as Arrendamento]);
      }
      setModalContrato(false); setEditContrato(null); setFC(initFC());
    } catch (e) {
      console.error("Erro ao salvar arrendamento:", e);
      alert((e as { message?: string })?.message ?? "Erro ao salvar contrato");
    }
    finally { setSalvando(false); }
  }

  // ── abrir modal gerador ─────────────────────────────────
  function abrirGerador(arr: Arrendamento) {
    setSelArrGerador(arr);

    // sc/ha por commodity — brl também usa sc/ha como referência
    const scSojaHa  = arr.forma_pagamento === "sc_milho" ? 0 : (arr.sc_ha ?? 0);
    const scMilhoHa = (arr.forma_pagamento === "sc_soja_milho" || arr.forma_pagamento === "brl")
      ? (arr.sc_milho_ha ?? 0)
      : arr.forma_pagamento === "sc_milho" ? (arr.sc_ha ?? 0) : 0;

    // Calcular todos os anos do contrato, independente de estarem cadastrados
    const anoAtual = new Date().getFullYear();
    const ini = arr.inicio ? new Date(arr.inicio + "T12:00:00") : new Date();
    const fim = arr.vencimento ? new Date(arr.vencimento + "T12:00:00") : null;

    // Ano-safra começa pelo ano em que cai o início do contrato
    const anoIni = ini.getFullYear();
    // Ano-safra final: ano do vencimento +1 (pega safra que termina no ano do vencimento)
    const anoFimContrato = fim ? fim.getFullYear() : anoAtual + 1;

    // Gera uma entrada para cada ano-safra no período
    const configs: ConfigSafra[] = [];
    for (let anoFim = anoIni; anoFim <= anoFimContrato + 1; anoFim++) {
      // Verificar se a safra cai dentro do contrato
      const dtVencSoja  = new Date(`${anoFim}-04-30`);
      const dtVencMilho = new Date(`${anoFim}-07-31`);
      // Pular se o primeiro vencimento relevante é antes do início do contrato
      const primVenc = arr.forma_pagamento === "sc_milho" ? dtVencMilho : dtVencSoja;
      if (primVenc < ini) continue;
      // Pular se todos os vencimentos são após o fim do contrato
      if (fim) {
        const ultimoVenc = arr.forma_pagamento === "sc_soja" ? dtVencSoja
          : arr.forma_pagamento === "sc_milho" ? dtVencMilho
          : dtVencMilho; // milho vence depois
        if (ultimoVenc > fim) break;
      }

      const descricao = `${anoFim - 1}/${anoFim}`;
      // Procura safra já cadastrada para este ano
      const safraExistente = anosSafra.find(as => extrairAnoFim(as.descricao) === anoFim);

      configs.push({
        ano_safra_id: safraExistente?.id ?? "",
        descricao:    safraExistente?.descricao ?? descricao,
        anoFim,
        incluir:      true,
        sc_soja_ha:   scSojaHa  > 0 ? String(scSojaHa)  : "",
        sc_milho_ha:  scMilhoHa > 0 ? String(scMilhoHa) : "",
        preco_soja:   "",
        preco_milho:  "",
        dt_venc_soja: isoData(anoFim, 4, 30),
        dt_venc_milho:isoData(anoFim, 7, 31),
        valor_brl:    arr.valor_brl ? String(arr.valor_brl) : "",
        dt_venc_brl:  isoData(anoFim, 5, 31),
      });
    }

    // Fallback se não calculou nada
    if (configs.length === 0) {
      configs.push({
        ano_safra_id: "", descricao: `${anoAtual - 1}/${anoAtual}`, anoFim: anoAtual, incluir: true,
        sc_soja_ha: scSojaHa > 0 ? String(scSojaHa) : "",
        sc_milho_ha: scMilhoHa > 0 ? String(scMilhoHa) : "",
        preco_soja: "", preco_milho: "",
        dt_venc_soja: isoData(anoAtual, 4, 30),
        dt_venc_milho: isoData(anoAtual, 7, 31),
        valor_brl: arr.valor_brl ? String(arr.valor_brl) : "",
        dt_venc_brl: isoData(anoAtual, 5, 31),
      });
    }

    setConfigSafras(configs);
    setModalGerador(true);
  }

  // ── gerador de parcelas (novo) ──────────────────────────
  async function gerarParcelas() {
    if (!fazendaId || !selArrGerador) return;
    setSalvando(true);
    try {
      const arr = selArrGerador;
      const ehSoja  = arr.forma_pagamento === "sc_soja"  || arr.forma_pagamento === "sc_soja_milho";
      const ehMilho = arr.forma_pagamento === "sc_milho" || arr.forma_pagamento === "sc_soja_milho";
      const ehBrl   = arr.forma_pagamento === "brl";

      const novosPagamentos: Omit<Pagamento, "id">[] = [];

      for (const cfg of configSafras) {
        if (!cfg.incluir) continue;

        if (ehSoja) {
          const scHa   = parseFloat(cfg.sc_soja_ha.replace(",", ".")) || 0;
          const sacas  = parseFloat((arr.area_ha * scHa).toFixed(4));
          const preco  = parseFloat(cfg.preco_soja.replace(",", ".")) || null;
          novosPagamentos.push({
            arrendamento_id: arr.id,
            fazenda_id: fazendaId,
            ano_safra_id: cfg.ano_safra_id || null,
            data_vencimento: cfg.dt_venc_soja,
            sacas_previstas: sacas > 0 ? sacas : null,
            commodity: "Soja",
            preco_sc_referencia: preco,
            valor_previsto: sacas > 0 && preco ? parseFloat((sacas * preco).toFixed(2)) : null,
            status: "pendente",
            observacao: arr.forma_pagamento === "sc_soja_milho" ? "sc_soja_milho:soja" : null,
          });
        }

        if (ehMilho) {
          const scHa   = parseFloat(cfg.sc_milho_ha.replace(",", ".")) || 0;
          const sacas  = parseFloat((arr.area_ha * scHa).toFixed(4));
          const preco  = parseFloat(cfg.preco_milho.replace(",", ".")) || null;
          novosPagamentos.push({
            arrendamento_id: arr.id,
            fazenda_id: fazendaId,
            ano_safra_id: cfg.ano_safra_id || null,
            data_vencimento: cfg.dt_venc_milho,
            sacas_previstas: sacas > 0 ? sacas : null,
            commodity: "Milho",
            preco_sc_referencia: preco,
            valor_previsto: sacas > 0 && preco ? parseFloat((sacas * preco).toFixed(2)) : null,
            status: "pendente",
            observacao: arr.forma_pagamento === "sc_soja_milho" ? "sc_soja_milho:milho" : null,
          });
        }

        if (ehBrl) {
          // Um lançamento por commodity — soja usa dt_venc_soja, milho usa dt_venc_milho
          const scSojaHaNum  = parseFloat(cfg.sc_soja_ha.replace(",",  ".")) || 0;
          const scMilhoHaNum = parseFloat(cfg.sc_milho_ha.replace(",", ".")) || 0;
          const precoSojaNum  = parseFloat(cfg.preco_soja.replace(",",  ".")) || 0;
          const precoMilhoNum = parseFloat(cfg.preco_milho.replace(",", ".")) || 0;
          const propNome  = arr.proprietario_nome ?? "Proprietário";
          const prodId1   = arr.produtor_id || undefined;

          // helper: cria um único lancamento para o produtor responsável
          const criarLancArr = async (
            descricao: string, data_vencimento: string,
            valor: number, obs: string,
          ): Promise<string | null> => {
            try {
              const lanc = await criarLancamento({
                fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
                descricao, categoria: "Arrendamento de Terra",
                data_lancamento: hoje(), data_vencimento,
                valor, status: "em_aberto", auto: true,
                observacao: obs,
                produtor_id: prodId1,
                ano_safra_id: cfg.ano_safra_id || undefined,
              } as Parameters<typeof criarLancamento>[0]);
              return lanc.id;
            } catch { return null; }
          };

          // Lançamento SOJA (se sc/ha soja preenchido)
          if (scSojaHaNum > 0) {
            const sacasSoja = parseFloat((arr.area_ha * scSojaHaNum).toFixed(4));
            const valorSoja = precoSojaNum > 0
              ? parseFloat((sacasSoja * precoSojaNum).toFixed(2))
              : parseFloat(cfg.valor_brl.replace(",", ".")) || 0;
            if (valorSoja > 0) {
              const obsSoja = `Soja: ${fmtN(scSojaHaNum,4)} sc/ha × ${fmtN(arr.area_ha)} ha = ${fmtN(sacasSoja,1)} sc @ R$${fmtN(precoSojaNum,2)}/sc`;
              const descSoja = `Arrendamento Soja — ${propNome} (${cfg.descricao})`;
              const lancIdSoja = await criarLancArr(descSoja, cfg.dt_venc_soja, valorSoja, `Gerado automaticamente. ${obsSoja}`);
              novosPagamentos.push({
                arrendamento_id: arr.id, fazenda_id: fazendaId,
                ano_safra_id: cfg.ano_safra_id || null,
                data_vencimento: cfg.dt_venc_soja,
                valor_previsto: valorSoja, status: "pendente",
                lancamento_id: lancIdSoja,
                sacas_previstas: sacasSoja, commodity: "Soja ref.",
                preco_sc_referencia: precoSojaNum || null,
                observacao: obsSoja,
              } as Omit<Pagamento, "id">);
            }
          }

          // Lançamento MILHO (se sc/ha milho preenchido)
          if (scMilhoHaNum > 0) {
            const sacasMilho = parseFloat((arr.area_ha * scMilhoHaNum).toFixed(4));
            const valorMilho = precoMilhoNum > 0
              ? parseFloat((sacasMilho * precoMilhoNum).toFixed(2))
              : 0;
            if (valorMilho > 0) {
              const obsMilho = `Milho: ${fmtN(scMilhoHaNum,4)} sc/ha × ${fmtN(arr.area_ha)} ha = ${fmtN(sacasMilho,1)} sc @ R$${fmtN(precoMilhoNum,2)}/sc`;
              const descMilho = `Arrendamento Milho — ${propNome} (${cfg.descricao})`;
              const lancIdMilho = await criarLancArr(descMilho, cfg.dt_venc_milho, valorMilho, `Gerado automaticamente. ${obsMilho}`);
              novosPagamentos.push({
                arrendamento_id: arr.id, fazenda_id: fazendaId,
                ano_safra_id: cfg.ano_safra_id || null,
                data_vencimento: cfg.dt_venc_milho,
                valor_previsto: valorMilho, status: "pendente",
                lancamento_id: lancIdMilho,
                sacas_previstas: sacasMilho, commodity: "Milho ref.",
                preco_sc_referencia: precoMilhoNum || null,
                observacao: obsMilho,
              } as Omit<Pagamento, "id">);
            }
          }

          // Fallback: valor manual único se não tiver sc/ha preenchido
          if (scSojaHaNum === 0 && scMilhoHaNum === 0) {
            const valorManual = parseFloat(cfg.valor_brl.replace(",", ".")) || 0;
            if (valorManual > 0) {
              const obsManual = `Gerado automaticamente pelo módulo de arrendamentos.`;
              const descManual = `Arrendamento — ${propNome} (${cfg.descricao})`;
              const lancId = await criarLancArr(descManual, cfg.dt_venc_brl, valorManual, obsManual);
              novosPagamentos.push({
                arrendamento_id: arr.id, fazenda_id: fazendaId,
                ano_safra_id: cfg.ano_safra_id || null,
                data_vencimento: cfg.dt_venc_brl,
                valor_previsto: valorManual, status: "pendente",
                lancamento_id: lancId,
              } as Omit<Pagamento, "id">);
            }
          }
        }
      }

      if (novosPagamentos.length === 0) {
        alert("Nenhuma parcela configurada para gerar.");
        setSalvando(false);
        return;
      }

      // ── Auto-criar anos_safra ausentes ──────────────────
      const anosSafraAtualizado = [...anosSafra];
      for (const cfg of configSafras) {
        if (!cfg.incluir || cfg.ano_safra_id) continue;
        try {
          const { data: novoAs } = await supabase.from("anos_safra")
            .insert({ fazenda_id: fazendaId, descricao: cfg.descricao })
            .select().single();
          if (novoAs) {
            cfg.ano_safra_id = novoAs.id;
            anosSafraAtualizado.push(novoAs as AnoSafra);
          }
        } catch { /* ignora se já existe */ }
      }
      setAnosSafra(anosSafraAtualizado);

      // Atualizar ano_safra_id nos pagamentos com o id recém-criado
      for (const p of novosPagamentos) {
        if (!p.ano_safra_id) {
          const cfgMatch = configSafras.find(c =>
            c.dt_venc_soja === p.data_vencimento || c.dt_venc_milho === p.data_vencimento || c.dt_venc_brl === p.data_vencimento
          );
          if (cfgMatch?.ano_safra_id) p.ano_safra_id = cfgMatch.ano_safra_id;
        }
      }

      // ── Inserir pagamentos ──────────────────────────────
      const { data } = await supabase.from("arrendamento_pagamentos").insert(novosPagamentos).select();
      setPagamentos(prev => [...prev, ...(data ?? []) as Pagamento[]]);

      // ── Criar contratos de grãos para TODAS as safras selecionadas ──
      const errosContrato: string[] = [];

      if (!ehBrl) {
        for (const cfg of configSafras) {
          if (!cfg.incluir) continue;

          const anoSafraId   = cfg.ano_safra_id || null;
          const propNome     = arr.proprietario_nome ?? "Arrendante";
          const descContrato = `Comprometimento arrendamento — ${propNome} · ${fmtN(arr.area_ha)} ha · Safra ${cfg.descricao}`;

          const criarContrato = async (payload: Record<string, unknown>) => {
            const { error } = await supabase.from("contratos").insert(payload);
            if (error) errosContrato.push(`${cfg.descricao}: ${error.message}`);
          };

          if (ehSoja) {
            const scHa  = parseFloat(cfg.sc_soja_ha) || 0;
            const sacas = parseFloat((arr.area_ha * scHa).toFixed(4));
            if (sacas > 0) {
              await criarContrato({
                fazenda_id:      fazendaId,
                numero:          `ARR-SOJ-${cfg.anoFim}-${arr.id.slice(-4).toUpperCase()}`,
                safra:           cfg.descricao,
                comprador:       propNome,
                produto:         "Soja",
                modalidade:      "fixo",
                moeda:           "BRL",
                preco:           0,
                quantidade_sc:   sacas,
                entregue_sc:     0,
                ano_safra_id:    anoSafraId,
                data_contrato:   hoje(),
                data_entrega:    cfg.dt_venc_soja,
                status:          "aberto",
                is_arrendamento: true,
                arrendamento_id: arr.id,
                observacao:      descContrato,
              });
            } else {
              errosContrato.push(`Soja ${cfg.descricao}: sc/ha não preenchido — contrato não criado.`);
            }
          }

          if (ehMilho) {
            const scHa  = parseFloat(cfg.sc_milho_ha) || 0;
            const sacas = parseFloat((arr.area_ha * scHa).toFixed(4));
            if (sacas > 0) {
              await criarContrato({
                fazenda_id:      fazendaId,
                numero:          `ARR-MIL-${cfg.anoFim}-${arr.id.slice(-4).toUpperCase()}`,
                safra:           cfg.descricao,
                comprador:       propNome,
                produto:         "Milho",
                modalidade:      "fixo",
                moeda:           "BRL",
                preco:           0,
                quantidade_sc:   sacas,
                entregue_sc:     0,
                ano_safra_id:    anoSafraId,
                data_contrato:   hoje(),
                data_entrega:    cfg.dt_venc_milho,
                status:          "aberto",
                is_arrendamento: true,
                arrendamento_id: arr.id,
                observacao:      descContrato,
              });
            } else {
              errosContrato.push(`Milho ${cfg.descricao}: sc/ha não preenchido — contrato não criado.`);
            }
          }
        }
      }

      setModalGerador(false);

      if (errosContrato.length > 0) {
        alert(
          `Parcelas geradas com sucesso.\n\n` +
          `⚠️ Contrato(s) de grãos não criado(s):\n${errosContrato.join("\n")}\n\n` +
          `Verifique se as Migrations 34 e 35 foram executadas no Supabase SQL Editor e se o sc/ha está preenchido no contrato.`
        );
      }
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro ao gerar parcelas"); }
    finally { setSalvando(false); }
  }

  // ── salvar pagamento manual ─────────────────────────────
  async function salvarPagamento() {
    if (!fazendaId || !selArr) return;
    setSalvando(true);
    try {
      const ehSc = selArr.forma_pagamento !== "brl";
      const payload = {
        arrendamento_id: selArr.id, fazenda_id: fazendaId,
        ano_safra_id: fP.ano_safra_id || null,
        data_vencimento: fP.data_vencimento,
        data_pagamento: fP.data_pagamento || null,
        sacas_previstas: ehSc && fP.sacas_previstas ? parseFloat(fP.sacas_previstas) : null,
        sacas_pagas:     ehSc && fP.sacas_pagas    ? parseFloat(fP.sacas_pagas)    : null,
        commodity:       ehSc ? fP.commodity : null,
        preco_sc_referencia: ehSc && fP.preco_sc_referencia ? parseFloat(fP.preco_sc_referencia) : null,
        valor_previsto: fP.valor_previsto ? parseFloat(fP.valor_previsto) : null,
        valor_pago:     fP.valor_pago     ? parseFloat(fP.valor_pago)     : null,
        status: fP.status,
        observacao: fP.observacao || null,
      };
      if (editPag) {
        const { data } = await supabase.from("arrendamento_pagamentos").update(payload).eq("id", editPag.id).select().single();
        setPagamentos(prev => prev.map(p => p.id === editPag.id ? data as Pagamento : p));
      } else {
        const { data } = await supabase.from("arrendamento_pagamentos").insert(payload).select().single();
        setPagamentos(prev => [...prev, data as Pagamento]);
      }
      setModalPag(false); setEditPag(null); setFP(initFP());
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  // ── baixar pagamento ────────────────────────────────────
  async function baixarPagamento(p: Pagamento) {
    const dtPag = prompt("Data do pagamento (AAAA-MM-DD):", hoje());
    if (!dtPag) return;
    const arr = arrendamentos.find(a => a.id === p.arrendamento_id);
    const ehSc = arr?.forma_pagamento !== "brl";
    let sacasPagas = p.sacas_previstas;
    let valorPago  = p.valor_previsto;
    if (ehSc) {
      const scStr = prompt("Sacas efetivamente entregues:", String(p.sacas_previstas ?? ""));
      sacasPagas = scStr ? parseFloat(scStr) : p.sacas_previstas;
      const precStr = prompt("Preço R$/sc utilizado:", String(p.preco_sc_referencia ?? ""));
      const prec = precStr ? parseFloat(precStr) : (p.preco_sc_referencia ?? 0);
      valorPago = sacasPagas ? parseFloat((sacasPagas * prec).toFixed(2)) : null;
    } else {
      const vStr = prompt("Valor efetivamente pago (R$):", String(p.valor_previsto ?? ""));
      valorPago = vStr ? parseFloat(vStr) : p.valor_previsto;
    }
    const patch = { status: "pago" as StatusPag, data_pagamento: dtPag, sacas_pagas: sacasPagas, valor_pago: valorPago };
    await supabase.from("arrendamento_pagamentos").update(patch).eq("id", p.id);
    setPagamentos(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x));

    // atualiza lancamento BRL se existir
    if (p.lancamento_id && !ehSc) {
      await supabase.from("lancamentos").update({ status: "baixado", data_baixa: dtPag, valor_pago: valorPago }).eq("id", p.lancamento_id);
    }
  }

  // ── excluir parcelas com verificação de embarque ────────────
  async function excluirParcelasComVerificacao(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const contratoIds: string[] = [];
    for (const id of ids) {
      const pag = pagamentos.find(p => p.id === id);
      if (!pag || !pag.ano_safra_id) continue;
      const produto = pag.commodity === "Milho" ? "Milho" : "Soja";
      const { data: cts } = await supabase
        .from("contratos").select("id")
        .eq("arrendamento_id", pag.arrendamento_id)
        .eq("is_arrendamento", true)
        .eq("ano_safra_id", pag.ano_safra_id)
        .eq("produto", produto);
      (cts ?? []).forEach((c: { id: string }) => contratoIds.push(c.id));
    }
    if (contratoIds.length > 0) {
      const { data: cargas } = await supabase
        .from("cargas_expedicao").select("id,status")
        .in("contrato_id", contratoIds).neq("status", "rascunho");
      if (cargas && cargas.length > 0) {
        alert("Embarque já iniciado para este contrato de arrendamento. Não é possível excluir a parcela.");
        return false;
      }
      await supabase.from("cargas_expedicao").delete().in("contrato_id", contratoIds);
      await supabase.from("contratos").delete().in("id", contratoIds);
    }
    for (const id of ids) await supabase.from("arrendamento_pagamentos").delete().eq("id", id);
    setPagamentos(prev => prev.filter(p => !ids.includes(p.id)));
    return true;
  }

  // ── excluir arrendamento com verificação de embarque ────────
  async function excluirArrendamentoComVerificacao(arr: Arrendamento): Promise<boolean> {
    const { data: cts } = await supabase
      .from("contratos").select("id")
      .eq("arrendamento_id", arr.id).eq("is_arrendamento", true);
    const contratoIds = (cts ?? []).map((c: { id: string }) => c.id);
    if (contratoIds.length > 0) {
      const { data: cargas } = await supabase
        .from("cargas_expedicao").select("id,status")
        .in("contrato_id", contratoIds).neq("status", "rascunho");
      if (cargas && cargas.length > 0) {
        alert("Embarque já iniciado em contrato vinculado a este arrendamento. Não é possível excluí-lo.");
        return false;
      }
      await supabase.from("cargas_expedicao").delete().in("contrato_id", contratoIds);
      await supabase.from("contratos").delete().in("id", contratoIds);
    }
    await supabase.from("arrendamento_pagamentos").delete().eq("arrendamento_id", arr.id);
    await supabase.from("arrendamentos").delete().eq("id", arr.id);
    setArrendamentos(prev => prev.filter(a => a.id !== arr.id));
    setPagamentos(prev => prev.filter(p => p.arrendamento_id !== arr.id));
    return true;
  }

  // ── stats ────────────────────────────────────────────────
  const totalArea  = arrendamentos.reduce((s, a) => s + a.area_ha, 0);
  const pagPend    = pagamentos.filter(p => p.status === "pendente").length;
  const pagAtras   = pagamentos.filter(p => p.status === "pendente" && p.data_vencimento < hoje()).length;

  // ── pagamentos filtrados (aba pagamentos) ────────────────
  const pagsFiltrados = pagamentos.filter(p => {
    if (filtroAno && p.ano_safra_id !== filtroAno) return false;
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    return true;
  }).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  function nomeArr(id: string) {
    const a = arrendamentos.find(x => x.id === id);
    return a ? (a.proprietario_nome ?? "—") + ` (${fmtN(a.area_ha)} ha)` : id;
  }

  // ── calendário de vencimentos (próximos 12 meses) ────────
  const hoje12 = new Date(); hoje12.setFullYear(hoje12.getFullYear() + 1);
  const proximos = pagamentos
    .filter(p => p.status === "pendente" && p.data_vencimento >= hoje() && p.data_vencimento <= hoje12.toISOString().slice(0, 10))
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  const ABAS: { key: Aba; label: string }[] = [
    { key: "lista",      label: "Contratos" },
    { key: "pagamentos", label: `Pagamentos${pagPend > 0 ? ` (${pagPend})` : ""}` },
    { key: "calendario", label: "Próximos Vencimentos" },
  ];

  // ── agrupamento de pagamentos por safra (para sc_soja_milho) ─
  function agruparPorSafra(pags: Pagamento[]) {
    const grupos: Record<string, { soja?: Pagamento; milho?: Pagamento; outro?: Pagamento }> = {};
    for (const p of pags) {
      const key = p.ano_safra_id ?? `noSafra_${p.id}`;
      if (!grupos[key]) grupos[key] = {};
      const obs = p.observacao ?? "";
      if (obs.includes("sc_soja_milho:soja") || p.commodity === "Soja") {
        grupos[key].soja  = grupos[key].soja ?? p;
      } else if (obs.includes("sc_soja_milho:milho") || p.commodity === "Milho") {
        grupos[key].milho = grupos[key].milho ?? p;
      } else {
        grupos[key].outro = p;
      }
    }
    return grupos;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ padding: "28px 32px" }}>

        {/* cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Contratos de Arrendamento</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Gestão de contratos, parcelas automáticas por safra e calendário de vencimentos</p>
          </div>
          <button style={btnV} onClick={() => { setEditContrato(null); setFC(initFC()); setModalContrato(true); }}>
            + Novo Contrato
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Área Arrendada",       valor: `${fmtN(totalArea)} ha`, bg: "#EBF3FC", color: "#0C447C" },
            { label: "Contratos Ativos",     valor: arrendamentos.length,    bg: "#D5E8F5", color: "#0B2D50" },
            { label: "Parcelas Pendentes",   valor: pagPend,                 bg: "#FBF3E0", color: "#7A5A12" },
            { label: "Vencidas (atrasadas)", valor: pagAtras, bg: pagAtras > 0 ? "#FCEBEB" : "#F4F6FA", color: pagAtras > 0 ? "#791F1F" : "#888" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.valor}</div>
            </div>
          ))}
        </div>

        {/* abas */}
        <div style={{ display: "flex", marginBottom: 20, borderBottom: "0.5px solid #DDE2EE" }}>
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "9px 22px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: aba === a.key ? 700 : 400,
              color: aba === a.key ? "#1A4870" : "#666",
              borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
            }}>{a.label}</button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Carregando...</div>}

        {/* ═══════════ ABA LISTA ═══════════ */}
        {!loading && aba === "lista" && (
          <div>
            {arrendamentos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 34, marginBottom: 12 }}>◻</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Nenhum contrato cadastrado</div>
                <div style={{ fontSize: 13, color: "#888" }}>Cadastre os contratos em Cadastros → Fazendas → aba Arrendamentos</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {arrendamentos.map(arr => {
                  const pags    = pagsByArr[arr.id] ?? [];
                  const pend    = pags.filter(p => p.status === "pendente").length;
                  const atras   = pags.filter(p => p.status === "pendente" && p.data_vencimento < hoje()).length;
                  const pagos   = pags.filter(p => p.status === "pago").length;
                  const expanded= expandedArr.has(arr.id);
                  const ehSc    = arr.forma_pagamento !== "brl";
                  const ehMisto = arr.forma_pagamento === "sc_soja_milho";

                  return (
                    <div key={arr.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                      {/* cabeçalho do contrato */}
                      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                        onClick={() => toggleArr(arr.id)}>
                        <div style={{ fontSize: 18, color: expanded ? "#1A4870" : "#888" }}>{expanded ? "▼" : "▶"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{arr.proprietario_nome ?? "Proprietário não informado"}</span>
                            <Badge label={FORMA_LABEL[arr.forma_pagamento]} bg="#EBF3FC" color="#0C447C" />
                            {atras > 0 && <Badge label={`${atras} vencido${atras > 1 ? "s" : ""}`} bg="#FCEBEB" color="#791F1F" />}
                            {pend > 0 && atras === 0 && <Badge label={`${pend} pendente${pend > 1 ? "s" : ""}`} bg="#FBF3E0" color="#7A5A12" />}
                            {pagos > 0 && pend === 0 && <Badge label="Em dia" bg="#ECFDF5" color="#14532D" />}
                          </div>
                          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#666", flexWrap: "wrap" }}>
                            <span><strong>{fmtN(arr.area_ha)} ha</strong></span>
                            {arr.produtor_id && (() => {
                              const p1 = produtores.find(p => p.id === arr.produtor_id);
                              const p2 = arr.produtor_id_2 ? produtores.find(p => p.id === arr.produtor_id_2) : null;
                              if (!p1) return null;
                              return <span style={{ color: "#1A4870" }}>{p1.nome}{p2 ? ` + ${p2.nome}` : ""}</span>;
                            })()}
                            {arr.forma_pagamento === "sc_soja_milho" && (arr.sc_ha || arr.sc_milho_ha) && (
                              <span>
                                {arr.sc_ha ? `${fmtN(arr.sc_ha, 4)} sc soja/ha` : ""}
                                {arr.sc_ha && arr.sc_milho_ha ? " + " : ""}
                                {arr.sc_milho_ha ? `${fmtN(arr.sc_milho_ha, 4)} sc milho/ha` : ""}
                              </span>
                            )}
                            {(arr.forma_pagamento === "sc_soja" || arr.forma_pagamento === "sc_milho") && arr.sc_ha && (
                              <span>{fmtN(arr.sc_ha, 4)} sc/ha/ano</span>
                            )}
                            {!ehSc && arr.valor_brl && <span>{fmtR(arr.valor_brl)}/ano</span>}
                            {arr.inicio     && <span>Início: {fmtDt(arr.inicio)}</span>}
                            {arr.vencimento && <span>Vencimento: {fmtDt(arr.vencimento)}</span>}
                            {arr.renovacao_auto && <Badge label="Renovação automática" bg="#ECFDF5" color="#14532D" />}
                          </div>
                        </div>
                        <button style={{ ...btnV, fontSize: 12, padding: "6px 14px" }}
                          onClick={e => { e.stopPropagation(); setSelArr(arr); setFP({ ...initFP(), commodity: arr.forma_pagamento === "sc_milho" ? "Milho" : "Soja" }); setEditPag(null); setModalPag(true); }}>
                          + Parcela Manual
                        </button>
                        <button style={{ ...btnR, fontSize: 12, padding: "6px 14px" }}
                          onClick={e => { e.stopPropagation(); abrirGerador(arr); }}>
                          Gerar por Safra
                        </button>
                        <button style={{ ...btnE, fontSize: 12, padding: "6px 12px" }}
                          onClick={e => {
                            e.stopPropagation();
                            setEditContrato(arr);
                            setFC({
                              fazenda_id: arr.fazenda_id,
                              proprietario_id: arr.proprietario_id ?? "",
                              proprietario_nome: arr.proprietario_nome ?? "",
                              area_ha: String(arr.area_ha),
                              forma_pagamento: arr.forma_pagamento,
                              sc_soja_ha:  arr.sc_ha       != null ? String(arr.sc_ha)       : "",
                              sc_milho_ha: arr.sc_milho_ha != null ? String(arr.sc_milho_ha) : "",
                              valor_brl:   arr.valor_brl   != null ? String(arr.valor_brl)   : "",
                              inicio: arr.inicio ?? "",
                              vencimento: arr.vencimento ?? "",
                              renovacao_auto: arr.renovacao_auto ?? false,
                              observacao: arr.observacao ?? "",
                              produtor_id:   arr.produtor_id   ?? "",
                              produtor_id_2: arr.produtor_id_2 ?? "",
                            });
                            setModalContrato(true);
                          }}>
                          Editar
                        </button>
                        <button style={{ ...btnX, fontSize: 12, padding: "6px 12px" }}
                          onClick={async e => {
                            e.stopPropagation();
                            const qtdPags = (pagsByArr[arr.id] ?? []).length;
                            const msg = qtdPags > 0
                              ? `Excluir este contrato e suas ${qtdPags} parcela(s)? Esta ação não pode ser desfeita.`
                              : "Excluir este contrato? Esta ação não pode ser desfeita.";
                            if (!confirm(msg)) return;
                            await excluirArrendamentoComVerificacao(arr);
                          }}>
                          Excluir
                        </button>
                      </div>

                      {/* tabela de pagamentos expandida */}
                      {expanded && (
                        <div style={{ borderTop: "0.5px solid #EEF1F6" }}>
                          {pags.length === 0 ? (
                            <div style={{ padding: "20px 24px", textAlign: "center", color: "#888", fontSize: 12 }}>
                              Nenhuma parcela registrada — use "Gerar por Safra" ou "+ Parcela Manual"
                            </div>
                          ) : ehMisto ? (
                            /* TABELA ESPECIAL sc_soja_milho — 1 linha por safra com 2 grupos de colunas */
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#F8FAFD" }}>
                                  <th rowSpan={2} style={{ padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", verticalAlign: "bottom" }}>Ano Safra</th>
                                  <th colSpan={4} style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #C6E8D9", borderLeft: "0.5px solid #C6E8D9", background: "#F0FDF7" }}>Soja — venc. 30/Abr</th>
                                  <th colSpan={4} style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #C5D9F1", borderLeft: "0.5px solid #C5D9F1", background: "#EBF3FC" }}>Milho — venc. 31/Jul</th>
                                  <th rowSpan={2} style={{ padding: "7px 12px", fontSize: 11, borderBottom: "0.5px solid #EEF1F6" }}></th>
                                </tr>
                                <tr style={{ background: "#F8FAFD" }}>
                                  {/* soja */}
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", borderLeft: "0.5px solid #C6E8D9", background: "#F0FDF7" }}>Prev.</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#F0FDF7" }}>Entregue</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#F0FDF7" }}>Venc.</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#F0FDF7" }}>Status</th>
                                  {/* milho */}
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", borderLeft: "0.5px solid #C5D9F1", background: "#EBF3FC" }}>Prev.</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#EBF3FC" }}>Entregue</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#EBF3FC" }}>Venc.</th>
                                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6", background: "#EBF3FC" }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const grupos = agruparPorSafra(pags);
                                  return Object.entries(grupos).map(([key, g], gi, arr2) => {
                                    const sojaP = g.soja; const milhoP = g.milho;
                                    const anoDesc = anosSafra.find(a => a.id === (sojaP?.ano_safra_id ?? milhoP?.ano_safra_id))?.descricao ?? "—";
                                    const sojaAtras = sojaP?.status === "pendente" && (sojaP?.data_vencimento ?? "") < hoje();
                                    const milhoAtras= milhoP?.status === "pendente" && (milhoP?.data_vencimento ?? "") < hoje();
                                    const rep = sojaP ?? milhoP;
                                    return (
                                      <tr key={key} style={{ borderBottom: gi < arr2.length - 1 ? "0.5px solid #F0F3F8" : "none", background: (sojaAtras || milhoAtras) ? "#FFFBF5" : "transparent" }}>
                                        <td style={{ padding: "8px 12px", fontSize: 12, color: "#555" }}>{anoDesc}</td>
                                        {/* soja */}
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, borderLeft: "0.5px solid #E8F4EF" }}>{sojaP?.sacas_previstas != null ? `${fmtN(sojaP.sacas_previstas)} sc` : "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12 }}>{sojaP?.sacas_pagas != null ? `${fmtN(sojaP.sacas_pagas)} sc` : "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: sojaAtras ? "#791F1F" : "#1a1a1a", fontWeight: sojaAtras ? 600 : 400 }}>{fmtDt(sojaP?.data_vencimento)}{sojaAtras && " ⚠"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{sojaP ? <Badge label={STATUS_PAG[sojaP.status].label} bg={STATUS_PAG[sojaP.status].bg} color={STATUS_PAG[sojaP.status].color} /> : <span style={{ color: "#bbb", fontSize: 11 }}>—</span>}</td>
                                        {/* milho */}
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, borderLeft: "0.5px solid #D5E8F5" }}>{milhoP?.sacas_previstas != null ? `${fmtN(milhoP.sacas_previstas)} sc` : "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12 }}>{milhoP?.sacas_pagas != null ? `${fmtN(milhoP.sacas_pagas)} sc` : "—"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: milhoAtras ? "#791F1F" : "#1a1a1a", fontWeight: milhoAtras ? 600 : 400 }}>{fmtDt(milhoP?.data_vencimento)}{milhoAtras && " ⚠"}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{milhoP ? <Badge label={STATUS_PAG[milhoP.status].label} bg={STATUS_PAG[milhoP.status].bg} color={STATUS_PAG[milhoP.status].color} /> : <span style={{ color: "#bbb", fontSize: 11 }}>—</span>}</td>
                                        {/* ações */}
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                          <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
                                            {sojaP?.status === "pendente" && (
                                              <button style={{ ...btnE, background: "#F0FDF7", color: "#14532D", border: "0.5px solid #16A34A40", fontSize: 10 }}
                                                onClick={() => baixarPagamento(sojaP)}>✓ Soja</button>
                                            )}
                                            {milhoP?.status === "pendente" && (
                                              <button style={{ ...btnE, background: "#EBF3FC", color: "#0C447C", border: "0.5px solid #1A487040", fontSize: 10 }}
                                                onClick={() => baixarPagamento(milhoP)}>✓ Milho</button>
                                            )}
                                            {sojaP && <button style={{ ...btnE, fontSize: 10 }} onClick={() => {
                                              setSelArr(arr); setEditPag(sojaP);
                                              setFP({ ano_safra_id: sojaP.ano_safra_id ?? "", data_vencimento: sojaP.data_vencimento, data_pagamento: sojaP.data_pagamento ?? "", sacas_previstas: sojaP.sacas_previstas != null ? String(sojaP.sacas_previstas) : "", sacas_pagas: sojaP.sacas_pagas != null ? String(sojaP.sacas_pagas) : "", commodity: "Soja", preco_sc_referencia: sojaP.preco_sc_referencia != null ? String(sojaP.preco_sc_referencia) : "", valor_previsto: "", valor_pago: "", status: sojaP.status, observacao: sojaP.observacao ?? "" });
                                              setModalPag(true);
                                            }}>Ed S</button>}
                                            {milhoP && <button style={{ ...btnE, fontSize: 10 }} onClick={() => {
                                              setSelArr(arr); setEditPag(milhoP);
                                              setFP({ ano_safra_id: milhoP.ano_safra_id ?? "", data_vencimento: milhoP.data_vencimento, data_pagamento: milhoP.data_pagamento ?? "", sacas_previstas: milhoP.sacas_previstas != null ? String(milhoP.sacas_previstas) : "", sacas_pagas: milhoP.sacas_pagas != null ? String(milhoP.sacas_pagas) : "", commodity: "Milho", preco_sc_referencia: milhoP.preco_sc_referencia != null ? String(milhoP.preco_sc_referencia) : "", valor_previsto: "", valor_pago: "", status: milhoP.status, observacao: milhoP.observacao ?? "" });
                                              setModalPag(true);
                                            }}>Ed M</button>}
                                            {rep && <button style={{ ...btnX, fontSize: 10 }} onClick={async () => {
                                              if (!confirm("Excluir parcela(s) desta safra?")) return;
                                              const ids = [sojaP?.id, milhoP?.id].filter(Boolean) as string[];
                                              await excluirParcelasComVerificacao(ids);
                                            }}>✕</button>}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          ) : (
                            /* TABELA PADRÃO (sc_soja, sc_milho, brl) */
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#F8FAFD" }}>
                                  {["Ano Safra", "Vencimento", ehSc ? "Sacas Prev." : "Valor Prev.", ehSc ? "Sacas Entregues" : "Valor Pago", ehSc ? "Equiv. R$" : "Diff.", "Pgto", "Status", ""].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 12px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {pags.map((p, pi, arr2) => {
                                  const st = STATUS_PAG[p.status];
                                  const atrasado = p.status === "pendente" && p.data_vencimento < hoje();
                                  const valorRef = ehSc && p.sacas_previstas && p.preco_sc_referencia
                                    ? p.sacas_previstas * p.preco_sc_referencia : null;
                                  return (
                                    <tr key={p.id} style={{ borderBottom: pi < arr2.length - 1 ? "0.5px solid #F0F3F8" : "none", background: atrasado ? "#FFFBF5" : "transparent" }}>
                                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#555" }}>
                                        {anosSafra.find(a => a.id === p.ano_safra_id)?.descricao ?? "—"}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: atrasado ? "#791F1F" : "#1a1a1a", fontWeight: atrasado ? 600 : 400 }}>
                                        {fmtDt(p.data_vencimento)}{atrasado && " ⚠"}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>
                                        {ehSc ? (p.sacas_previstas != null ? `${fmtN(p.sacas_previstas)} sc` : "—") : (p.valor_previsto != null ? fmtR(p.valor_previsto) : "—")}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>
                                        {ehSc ? (p.sacas_pagas != null ? `${fmtN(p.sacas_pagas)} sc` : "—") : (p.valor_pago != null ? fmtR(p.valor_pago) : "—")}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>
                                        {ehSc ? (valorRef != null ? fmtR(valorRef) : "—") : (p.valor_previsto != null && p.valor_pago != null ? fmtR(p.valor_pago - p.valor_previsto) : "—")}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "#555" }}>{fmtDt(p.data_pagamento)}</td>
                                      <td style={{ padding: "8px 12px", textAlign: "right" }}><Badge label={st.label} bg={st.bg} color={st.color} /></td>
                                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                          {p.status === "pendente" && (
                                            <button style={{ ...btnE, background: "#ECFDF5", color: "#14532D", border: "0.5px solid #16A34A40", fontSize: 10 }}
                                              onClick={() => baixarPagamento(p)}>✓ Baixar</button>
                                          )}
                                          <button style={{ ...btnE, fontSize: 10 }} onClick={() => {
                                            setSelArr(arr);
                                            setEditPag(p);
                                            setFP({
                                              ano_safra_id: p.ano_safra_id ?? "", data_vencimento: p.data_vencimento,
                                              data_pagamento: p.data_pagamento ?? "",
                                              sacas_previstas: p.sacas_previstas != null ? String(p.sacas_previstas) : "",
                                              sacas_pagas: p.sacas_pagas != null ? String(p.sacas_pagas) : "",
                                              commodity: p.commodity ?? "Soja",
                                              preco_sc_referencia: p.preco_sc_referencia != null ? String(p.preco_sc_referencia) : "",
                                              valor_previsto: p.valor_previsto != null ? String(p.valor_previsto) : "",
                                              valor_pago: p.valor_pago != null ? String(p.valor_pago) : "",
                                              status: p.status, observacao: p.observacao ?? "",
                                            });
                                            setModalPag(true);
                                          }}>Ed</button>
                                          <button style={{ ...btnX, fontSize: 10 }} onClick={async () => {
                                            if (!confirm("Excluir parcela?")) return;
                                            await excluirParcelasComVerificacao([p.id]);
                                          }}>✕</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ ABA PAGAMENTOS ═══════════ */}
        {!loading && aba === "pagamentos" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <select style={{ ...inp, width: 200 }} value={filtroAno} onChange={e => setFiltroAno(e.target.value)}>
                <option value="">Todos os anos safra</option>
                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
              <select style={{ ...inp, width: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="parcial">Parcial</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Proprietário / Contrato", "Commodity", "Ano Safra", "Vencimento", "Previsto", "Pago", "Pgto", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "9px 14px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagsFiltrados.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhuma parcela encontrada</td></tr>
                  )}
                  {pagsFiltrados.map((p, pi) => {
                    const arr = arrendamentos.find(a => a.id === p.arrendamento_id);
                    const ehSc = arr?.forma_pagamento !== "brl";
                    const st   = STATUS_PAG[p.status];
                    const atrasado = p.status === "pendente" && p.data_vencimento < hoje();
                    const prevStr = ehSc ? (p.sacas_previstas != null ? `${fmtN(p.sacas_previstas)} sc` : "—") : (p.valor_previsto != null ? fmtR(p.valor_previsto) : "—");
                    const pagoStr = ehSc ? (p.sacas_pagas != null ? `${fmtN(p.sacas_pagas)} sc` : "—") : (p.valor_pago != null ? fmtR(p.valor_pago) : "—");
                    return (
                      <tr key={p.id} style={{ borderBottom: pi < pagsFiltrados.length - 1 ? "0.5px solid #EEF1F6" : "none", background: atrasado ? "#FFFBF5" : "transparent" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{nomeArr(p.arrendamento_id)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12, color: "#555" }}>{p.commodity ?? (arr?.forma_pagamento === "brl" ? "R$" : "—")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12, color: "#555" }}>{anosSafra.find(a => a.id === p.ano_safra_id)?.descricao ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: atrasado ? "#791F1F" : "#1a1a1a", fontWeight: atrasado ? 600 : 400 }}>
                          {fmtDt(p.data_vencimento)}{atrasado && " ⚠"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13 }}>{prevStr}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13 }}>{pagoStr}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12, color: "#555" }}>{fmtDt(p.data_pagamento)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}><Badge label={st.label} bg={st.bg} color={st.color} /></td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {p.status === "pendente" && arr && (
                            <button style={{ ...btnE, background: "#ECFDF5", color: "#14532D", border: "0.5px solid #16A34A40" }}
                              onClick={() => baixarPagamento(p)}>✓ Baixar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════ ABA CALENDÁRIO ═══════════ */}
        {!loading && aba === "calendario" && (
          <div>
            {proximos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", color: "#888", fontSize: 13 }}>
                Nenhum vencimento nos próximos 12 meses
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {proximos.map(p => {
                  const arr = arrendamentos.find(a => a.id === p.arrendamento_id);
                  const ehSc = arr?.forma_pagamento !== "brl";
                  const st   = STATUS_PAG[p.status];
                  const dt   = new Date(p.data_vencimento + "T12:00:00");
                  const dias = Math.round((dt.getTime() - new Date().getTime()) / 86400000);
                  const urgente  = dias <= 15;
                  const valorRef = ehSc && p.sacas_previstas && p.preco_sc_referencia
                    ? p.sacas_previstas * p.preco_sc_referencia : null;
                  const commLabel = p.commodity ?? (arr?.forma_pagamento === "brl" ? "R$" : "");

                  return (
                    <div key={p.id} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: `0.5px solid ${urgente ? "#E24B4A50" : "#DDE2EE"}`, display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 52, textAlign: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: urgente ? "#E24B4A" : "#1A4870" }}>{dt.getDate()}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{dt.toLocaleString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()} {dt.getFullYear()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 3 }}>{arr?.proprietario_nome ?? "—"}</div>
                        <div style={{ fontSize: 12, color: "#666", display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <span>{fmtN(arr?.area_ha ?? 0)} ha</span>
                          {commLabel && <Badge label={commLabel} bg="#EBF3FC" color="#0C447C" />}
                          {ehSc && p.sacas_previstas && <span>{fmtN(p.sacas_previstas)} sc</span>}
                          {!ehSc && p.valor_previsto && <span>{fmtR(p.valor_previsto)}</span>}
                          {valorRef && <span>≈ {fmtR(valorRef)}</span>}
                          <Badge label={st.label} bg={st.bg} color={st.color} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: urgente ? "#E24B4A" : "#555" }}>
                          {dias === 0 ? "Hoje" : `em ${dias} dias`}
                        </div>
                        <button style={{ ...btnE, marginTop: 6, background: "#ECFDF5", color: "#14532D", border: "0.5px solid #16A34A40", fontSize: 11 }}
                          onClick={() => baixarPagamento(p)}>✓ Baixar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════ MODAL NOVO / EDITAR CONTRATO ══════ */}
      {modalContrato && (
        <Modal
          titulo={editContrato ? "Editar Contrato de Arrendamento" : "Novo Contrato de Arrendamento"}
          onClose={() => { setModalContrato(false); setEditContrato(null); setFC(initFC()); }}
          width={820}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

            {/* Proprietário */}
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>Proprietário *</label>
              <select style={inp} value={fC.proprietario_id}
                onChange={e => {
                  const p = pessoas.find(x => x.id === e.target.value);
                  setFC(f => ({ ...f, proprietario_id: e.target.value, proprietario_nome: p?.nome ?? f.proprietario_nome }));
                }}>
                <option value="">Selecionar de Pessoas cadastradas…</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Nome (se não cadastrado)</label>
              <input style={inp} value={fC.proprietario_nome}
                onChange={e => setFC(f => ({ ...f, proprietario_nome: e.target.value }))}
                placeholder="Nome livre" />
            </div>

            {/* Área e forma */}
            <div>
              <label style={lbl}>Área Arrendada (ha) *</label>
              <input style={inp} type="number" step="0.01" value={fC.area_ha}
                onChange={e => setFC(f => ({ ...f, area_ha: e.target.value }))}
                placeholder="Ex: 250,00" />
            </div>
            <div>
              <label style={lbl}>Forma de Pagamento *</label>
              <select style={inp} value={fC.forma_pagamento}
                onChange={e => setFC(f => ({ ...f, forma_pagamento: e.target.value as FormaPage }))}>
                <option value="sc_soja">Sacas de Soja</option>
                <option value="sc_milho">Sacas de Milho</option>
                <option value="sc_soja_milho">Sacas Soja + Milho</option>
                <option value="brl">R$ (Real)</option>
              </select>
            </div>

            {/* Valor conforme forma */}
            {fC.forma_pagamento === "sc_soja" && (
              <div>
                <label style={lbl}>sc/ha/ano (Soja)</label>
                <input style={inp} type="number" step="0.0001" value={fC.sc_soja_ha}
                  onChange={e => setFC(f => ({ ...f, sc_soja_ha: e.target.value }))}
                  placeholder="Ex: 10,0000" />
              </div>
            )}
            {fC.forma_pagamento === "sc_milho" && (
              <div>
                <label style={lbl}>sc/ha/ano (Milho)</label>
                <input style={inp} type="number" step="0.0001" value={fC.sc_soja_ha}
                  onChange={e => setFC(f => ({ ...f, sc_soja_ha: e.target.value }))}
                  placeholder="Ex: 10,0000" />
              </div>
            )}
            {fC.forma_pagamento === "brl" && (
              <>
                <div>
                  <label style={lbl}>Soja — sc/ha/ano (referência de cálculo)</label>
                  <input style={inp} type="number" step="0.0001" value={fC.sc_soja_ha}
                    onChange={e => setFC(f => ({ ...f, sc_soja_ha: e.target.value }))}
                    placeholder="Ex: 18,0000" />
                </div>
                <div>
                  <label style={lbl}>Milho — sc/ha/ano (referência de cálculo)</label>
                  <input style={inp} type="number" step="0.0001" value={fC.sc_milho_ha}
                    onChange={e => setFC(f => ({ ...f, sc_milho_ha: e.target.value }))}
                    placeholder="Ex: 4,0000" />
                </div>
                <div>
                  <label style={lbl}>Valor R$/ano base (opcional — calculado nas parcelas)</label>
                  <input style={inp} type="number" step="0.01" value={fC.valor_brl}
                    onChange={e => setFC(f => ({ ...f, valor_brl: e.target.value }))}
                    placeholder="Calculado automaticamente via cotação nas parcelas" />
                </div>
              </>
            )}

            {/* Soja + Milho — dois campos separados, ocupa a linha toda */}
            {fC.forma_pagamento === "sc_soja_milho" && (
              <>
                <div>
                  <label style={lbl}>Soja — sc/ha/ano</label>
                  <input style={inp} type="number" step="0.0001" value={fC.sc_soja_ha}
                    onChange={e => setFC(f => ({ ...f, sc_soja_ha: e.target.value }))}
                    placeholder="Ex: 11,0000" />
                </div>
                <div>
                  <label style={lbl}>Milho — sc/ha/ano</label>
                  <input style={inp} type="number" step="0.0001" value={fC.sc_milho_ha}
                    onChange={e => setFC(f => ({ ...f, sc_milho_ha: e.target.value }))}
                    placeholder="Ex: 20,0000" />
                </div>
              </>
            )}

            {/* Preview sacas */}
            {fC.forma_pagamento === "sc_soja_milho" && fC.area_ha && (fC.sc_soja_ha || fC.sc_milho_ha) && (
              <div style={{ gridColumn: "1/-1", background: "#EBF3FC", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                {fC.sc_soja_ha && <span style={{ color: "#14532D", marginRight: 20 }}>
                  <strong>{(parseFloat(fC.area_ha) * parseFloat(fC.sc_soja_ha)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} sc soja/ano</strong>
                  <span style={{ color: "#555" }}> ({fC.sc_soja_ha} sc/ha)</span>
                </span>}
                {fC.sc_milho_ha && <span style={{ color: "#0C447C" }}>
                  <strong>{(parseFloat(fC.area_ha) * parseFloat(fC.sc_milho_ha)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} sc milho/ano</strong>
                  <span style={{ color: "#555" }}> ({fC.sc_milho_ha} sc/ha)</span>
                </span>}
              </div>
            )}
            {(fC.forma_pagamento === "sc_soja" || fC.forma_pagamento === "sc_milho") && fC.area_ha && fC.sc_soja_ha && (
              <div style={{ gridColumn: "1/-1", background: "#EBF3FC", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ color: "#555" }}>Total: </span>
                <strong style={{ color: "#0C447C" }}>
                  {(parseFloat(fC.area_ha) * parseFloat(fC.sc_soja_ha)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} sc/ano
                </strong>
              </div>
            )}

            {/* Vigência */}
            <div>
              <label style={lbl}>Início do Contrato</label>
              <input style={inp} type="date" value={fC.inicio}
                onChange={e => setFC(f => ({ ...f, inicio: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Vencimento do Contrato</label>
              <input style={inp} type="date" value={fC.vencimento}
                onChange={e => setFC(f => ({ ...f, vencimento: e.target.value }))} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
              <input type="checkbox" id="renovAuto" checked={fC.renovacao_auto}
                onChange={e => setFC(f => ({ ...f, renovacao_auto: e.target.checked }))} />
              <label htmlFor="renovAuto" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>Renovação automática</label>
            </div>

            {/* Agricultor(es) responsável(is) — impacta LCDPR */}
            <div>
              <label style={lbl}>Agricultor Responsável (LCDPR)</label>
              <select style={inp} value={fC.produtor_id}
                onChange={e => setFC(f => ({ ...f, produtor_id: e.target.value }))}>
                <option value="">Não especificado</option>
                {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>2º Agricultor (contrato conjunto)</label>
              <select style={inp} value={fC.produtor_id_2}
                onChange={e => setFC(f => ({ ...f, produtor_id_2: e.target.value }))}>
                <option value="">—</option>
                {produtores.filter(p => p.id !== fC.produtor_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              {fC.produtor_id_2 && (
                <div style={{ fontSize: 11, color: "#555", background: "#FBF3E0", borderRadius: 6, padding: "6px 10px", lineHeight: 1.4 }}>
                  Contrato conjunto — um único lançamento por commodity, vinculado ao agricultor principal para o LCDPR.
                </div>
              )}
            </div>

            {/* Observação */}
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Observação</label>
              <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={fC.observacao}
                onChange={e => setFC(f => ({ ...f, observacao: e.target.value }))}
                placeholder="Condições especiais, cláusulas relevantes…" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => { setModalContrato(false); setEditContrato(null); setFC(initFC()); }}>Cancelar</button>
            <button
              style={{ ...btnV, opacity: salvando || !fC.area_ha || (!fC.proprietario_id && !fC.proprietario_nome) ? 0.5 : 1 }}
              disabled={salvando || !fC.area_ha || (!fC.proprietario_id && !fC.proprietario_nome)}
              onClick={salvarContrato}>
              {salvando ? "Salvando…" : editContrato ? "Salvar Alterações" : "Criar Contrato"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════ MODAL PAGAMENTO MANUAL ══════ */}
      {modalPag && selArr && (
        <Modal titulo={editPag ? "Editar Parcela" : "Registrar Parcela Manual"}
          subtitulo={`${selArr.proprietario_nome ?? "—"} · ${fmtN(selArr.area_ha)} ha · ${FORMA_LABEL[selArr.forma_pagamento]}`}
          onClose={() => { setModalPag(false); setEditPag(null); setFP(initFP()); }} width={760}>
          {(() => {
            const ehSc = selArr.forma_pagamento !== "brl";
            const total = ehSc && fP.sacas_previstas && fP.preco_sc_referencia
              ? parseFloat(fP.sacas_previstas) * parseFloat(fP.preco_sc_referencia) : null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Ano Safra</label>
                  <select style={inp} value={fP.ano_safra_id} onChange={e => setFP(p => ({ ...p, ano_safra_id: e.target.value }))}>
                    <option value="">—</option>
                    {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data de Vencimento *</label>
                  <input style={inp} type="date" value={fP.data_vencimento} onChange={e => setFP(p => ({ ...p, data_vencimento: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Data de Pagamento</label>
                  <input style={inp} type="date" value={fP.data_pagamento} onChange={e => setFP(p => ({ ...p, data_pagamento: e.target.value }))} />
                </div>
                {ehSc && <>
                  <div>
                    <label style={lbl}>Commodity</label>
                    <select style={inp} value={fP.commodity} onChange={e => setFP(p => ({ ...p, commodity: e.target.value }))}>
                      <option value="Soja">Soja</option>
                      <option value="Milho">Milho</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Sacas Previstas</label>
                    <input style={inp} type="number" step="0.001" value={fP.sacas_previstas} onChange={e => setFP(p => ({ ...p, sacas_previstas: e.target.value }))}
                      placeholder={selArr.sc_ha ? `${fmtN(selArr.area_ha * selArr.sc_ha)} sc` : "0"} />
                  </div>
                  <div>
                    <label style={lbl}>Preço R$/sc (referência)</label>
                    <input style={inp} type="number" step="0.01" value={fP.preco_sc_referencia} onChange={e => setFP(p => ({ ...p, preco_sc_referencia: e.target.value }))} placeholder="Ex: 130,00" />
                  </div>
                  <div>
                    <label style={lbl}>Sacas Efetivamente Entregues</label>
                    <input style={inp} type="number" step="0.001" value={fP.sacas_pagas} onChange={e => setFP(p => ({ ...p, sacas_pagas: e.target.value }))} />
                  </div>
                </>}
                {!ehSc && <>
                  <div>
                    <label style={lbl}>Valor Previsto (R$)</label>
                    <input style={inp} type="number" step="0.01" value={fP.valor_previsto} onChange={e => setFP(p => ({ ...p, valor_previsto: e.target.value }))}
                      placeholder={selArr.valor_brl ? String(selArr.valor_brl) : "0,00"} />
                  </div>
                  <div>
                    <label style={lbl}>Valor Pago (R$)</label>
                    <input style={inp} type="number" step="0.01" value={fP.valor_pago} onChange={e => setFP(p => ({ ...p, valor_pago: e.target.value }))} />
                  </div>
                </>}
                <div>
                  <label style={lbl}>Status</label>
                  <select style={inp} value={fP.status} onChange={e => setFP(p => ({ ...p, status: e.target.value as StatusPag }))}>
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="parcial">Parcial</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                {total != null && (
                  <div style={{ gridColumn: "1/-1", background: "#EBF3FC", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                    <span style={{ color: "#555" }}>Valor equivalente: </span>
                    <span style={{ fontWeight: 700, color: "#0C447C" }}>{fmtR(total)}</span>
                    <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({fP.sacas_previstas} sc × R$ {fP.preco_sc_referencia}/sc)</span>
                  </div>
                )}
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Observação</label>
                  <input style={inp} value={fP.observacao} onChange={e => setFP(p => ({ ...p, observacao: e.target.value }))} />
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => { setModalPag(false); setEditPag(null); setFP(initFP()); }}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fP.data_vencimento ? 0.5 : 1 }} disabled={salvando || !fP.data_vencimento} onClick={salvarPagamento}>
              {salvando ? "Salvando…" : editPag ? "Salvar" : "Registrar"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════ MODAL GERAR PARCELAS POR SAFRA ══════ */}
      {modalGerador && selArrGerador && (
        <Modal titulo="Gerar Parcelas por Safra"
          subtitulo={`${selArrGerador.proprietario_nome ?? "—"} · ${fmtN(selArrGerador.area_ha)} ha · ${FORMA_LABEL[selArrGerador.forma_pagamento]}`}
          onClose={() => setModalGerador(false)} width={selArrGerador.forma_pagamento === "sc_soja_milho" || selArrGerador.forma_pagamento === "brl" ? 1100 : 860}>

          {/* aviso */}
          <div style={{ background: "#EBF3FC", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#0B2D50" }}>
            {selArrGerador.forma_pagamento === "brl"
              ? <>Pagamento em R$ conforme cotação do dia. Informe as referências em sc/ha e a cotação esperada para calcular o valor previsto.<br />
                  <strong>Não compromete estoque de grãos</strong> — gera apenas lançamento em Contas a Pagar com a referência de sacas na observação.</>
              : <>
                  Parcelas em sacas criam registros na aba de parcelas e <strong>comprometem estoque de grãos</strong>.<br />
                  Um contrato de grãos é gerado por safra para rastrear a expedição no módulo de Expedição.
                </>}
          </div>

          {configSafras.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>
              Nenhum ano-safra cadastrado no período do contrato. Cadastre anos safra em Cadastros.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#F3F6F9" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left",   fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE", width: 30 }}>
                    <input type="checkbox" checked={configSafras.every(c => c.incluir)}
                      onChange={e => setConfigSafras(cs => cs.map(c => ({ ...c, incluir: e.target.checked })))} />
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "left",   fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>Ano Safra</th>
                  {(selArrGerador.forma_pagamento === "sc_soja" || selArrGerador.forma_pagamento === "sc_soja_milho") && <>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Soja sc/ha</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Total Soja</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Preço R$/sc</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Venc. Soja</th>
                  </>}
                  {(selArrGerador.forma_pagamento === "sc_milho" || selArrGerador.forma_pagamento === "sc_soja_milho") && <>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Milho sc/ha</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Total Milho</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Preço R$/sc</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Venc. Milho</th>
                  </>}
                  {selArrGerador.forma_pagamento === "brl" && <>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Soja sc/ha</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Cotação soja</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Valor Soja</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#14532D", borderBottom: "0.5px solid #DDE2EE", background: "#F0FDF7" }}>Venc. Soja</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Milho sc/ha</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Cotação milho</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Valor Milho</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#0C447C", borderBottom: "0.5px solid #DDE2EE", background: "#EBF3FC" }}>Venc. Milho</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {configSafras.map((cfg, i) => {
                  const scSoja  = parseFloat(cfg.sc_soja_ha.replace(",", ".")) || 0;
                  const scMilho = parseFloat(cfg.sc_milho_ha.replace(",", ".")) || 0;
                  const totalSoja  = scSoja  > 0 ? selArrGerador.area_ha * scSoja  : 0;
                  const totalMilho = scMilho > 0 ? selArrGerador.area_ha * scMilho : 0;
                  const precoSojaN  = parseFloat(cfg.preco_soja.replace(",", ".")) || 0;
                  const precoMilhoN = parseFloat(cfg.preco_milho.replace(",", ".")) || 0;
                  return (
                    <tr key={cfg.ano_safra_id || i} style={{ borderBottom: "0.5px solid #EEF1F6", opacity: cfg.incluir ? 1 : 0.4 }}>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>
                        <input type="checkbox" checked={cfg.incluir}
                          onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, incluir: e.target.checked } : c))} />
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{cfg.descricao}</td>

                      {(selArrGerador.forma_pagamento === "sc_soja" || selArrGerador.forma_pagamento === "sc_soja_milho") && <>
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="number" step="0.0001" value={cfg.sc_soja_ha}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, sc_soja_ha: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, color: "#14532D", background: "#FAFEF8" }}>
                          {totalSoja > 0 ? `${fmtN(totalSoja, 1)} sc` : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="number" step="0.01" placeholder="R$/sc" value={cfg.preco_soja}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, preco_soja: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="date" value={cfg.dt_venc_soja}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, dt_venc_soja: e.target.value } : c))} />
                        </td>
                      </>}

                      {(selArrGerador.forma_pagamento === "sc_milho" || selArrGerador.forma_pagamento === "sc_soja_milho") && <>
                        <td style={{ padding: "6px 8px", background: "#F0F6FE" }}>
                          <input style={inpSm} type="number" step="0.0001" value={cfg.sc_milho_ha}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, sc_milho_ha: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, color: "#0C447C", background: "#F0F6FE" }}>
                          {totalMilho > 0 ? `${fmtN(totalMilho, 1)} sc` : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", background: "#F0F6FE" }}>
                          <input style={inpSm} type="number" step="0.01" placeholder="R$/sc" value={cfg.preco_milho}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, preco_milho: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", background: "#F0F6FE" }}>
                          <input style={inpSm} type="date" value={cfg.dt_venc_milho}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, dt_venc_milho: e.target.value } : c))} />
                        </td>
                      </>}

                      {selArrGerador.forma_pagamento === "brl" && <>
                        {/* Bloco Soja */}
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="number" step="0.0001" placeholder="0" value={cfg.sc_soja_ha}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, sc_soja_ha: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="number" step="0.01" placeholder="R$/sc" value={cfg.preco_soja}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, preco_soja: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", background: "#FAFEF8" }}>
                          {totalSoja > 0 && precoSojaN > 0
                            ? <span style={{ fontWeight: 600, fontSize: 12, color: "#14532D" }}>{fmtR(totalSoja * precoSojaN)}</span>
                            : <span style={{ color: "#aaa", fontSize: 11 }}>{totalSoja > 0 ? `${fmtN(totalSoja,1)} sc` : "—"}</span>}
                        </td>
                        <td style={{ padding: "6px 8px", background: "#FAFEF8" }}>
                          <input style={inpSm} type="date" value={cfg.dt_venc_soja}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, dt_venc_soja: e.target.value } : c))} />
                        </td>
                        {/* Bloco Milho */}
                        <td style={{ padding: "6px 8px", background: "#EBF3FC" }}>
                          <input style={inpSm} type="number" step="0.0001" placeholder="0" value={cfg.sc_milho_ha}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, sc_milho_ha: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", background: "#EBF3FC" }}>
                          <input style={inpSm} type="number" step="0.01" placeholder="R$/sc" value={cfg.preco_milho}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, preco_milho: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", background: "#EBF3FC" }}>
                          {totalMilho > 0 && precoMilhoN > 0
                            ? <span style={{ fontWeight: 600, fontSize: 12, color: "#0C447C" }}>{fmtR(totalMilho * precoMilhoN)}</span>
                            : <span style={{ color: "#aaa", fontSize: 11 }}>{totalMilho > 0 ? `${fmtN(totalMilho,1)} sc` : "—"}</span>}
                        </td>
                        <td style={{ padding: "6px 8px", background: "#EBF3FC" }}>
                          <input style={inpSm} type="date" value={cfg.dt_venc_milho}
                            onChange={e => setConfigSafras(cs => cs.map((c, j) => j === i ? { ...c, dt_venc_milho: e.target.value } : c))} />
                        </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btnR} onClick={() => setModalGerador(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || configSafras.every(c => !c.incluir) ? 0.5 : 1 }}
              disabled={salvando || configSafras.every(c => !c.incluir)} onClick={gerarParcelas}>
              {salvando ? "Gerando…" : `Gerar ${configSafras.filter(c => c.incluir).length} Safra${configSafras.filter(c => c.incluir).length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
