"use client";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalGrid } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import InputData from "../../../components/InputData";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { calcINSS, calcIRRF, vencimentoSalario } from "../../../lib/folha-calculo";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { baixarLancamento, listarContasProdutorDaConta, listarContasPorEmpresa } from "../../../lib/db";
import type { ContaBancaria } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";
import { calcularHorasExtras } from "../../../lib/folha/horas-extras";

// ─── Tipos ────────────────────────────────────────────────────
interface Funcionario {
  id: string;
  fazenda_id: string;
  nome: string;
  funcao?: string;
  cargo?: string;
  salario_base?: number;
  complemento_salarial?: number;
  vale_transporte?: number;
  vale_refeicao?: number;
  outros_beneficios?: number;
  fgts_pct?: number | null;
  inss_empregador_pct?: number | null;
  sat_rat_pct?: number | null;
  sistema_s_pct?: number | null;
  tipo?: string;
  ativo?: boolean;
  empresa_id?: string | null;
  empresa_nome?: string;
  produtor_id?: string | null;
}
interface FolhaFunc {
  id?: string;
  folha_id?: string;
  funcionario_id?: string;
  fazenda_id?: string;
  empresa_id?: string | null;
  produtor_id?: string | null;
  nome_funcionario: string;
  cargo: string;
  salario_base: number;           // base pura (carteira) — base dos encargos
  complemento_salarial: number;   // por fora — sem encargos, sem Livro Caixa
  gratificacao: number;           // bônus do mês
  he_50_horas?: number;           // horas extras 50% no mês
  he_100_horas?: number;          // horas extras 100% (domingos/feriados)
  he_valor?: number;              // valor das horas extras (50% + 100%) — sobre o salário base ÷ 220 h
  he_dsr?: number;                // DSR sobre as horas extras
  _comp?: string;                 // competência da folha (só na tela, para o DSR) — não gravado
  salario_bruto: number;          // base + gratificacao + horas extras + DSR (encargos só sobre isso)
  inss_trabalhador: number;
  irrf: number;
  adiantamento: number;       // soma dos adiantamentos do mês
  outros_descontos: number;
  desc_outros_descontos: string;
  vale_transporte: number;
  vale_refeicao: number;
  outros_beneficios: number;
  inss_patronal: number;
  fgts: number;
  cp_lancamento_id?: string;
  // Percentuais de encargo do cadastro do funcionário (não gravados na folha) — zero no cadastro vale zero aqui
  fgts_pct?: number;
  inss_pat_pct?: number;
  // Cadastro com FGTS, INSS Empregador, SAT/RAT e Sistema S todos zerados = funcionário sem imposto automático
  // (lançamentos manuais): a folha não calcula INSS/IRRF do trabalhador nem FGTS/INSS patronal.
  sem_impostos?: boolean;
}
interface Folha {
  id: string;
  fazenda_id: string;
  empresa_id?: string | null;
  empresa_nome?: string;
  produtor_id?: string | null;
  produtor_nome?: string;
  competencia: string;
  status: "rascunho" | "fechado" | "pago";
  valor_bruto: number;
  valor_liquido: number;
  inss_patronal?: number;
  fgts_total?: number;
  obs?: string;
  data_vencimento?: string | null;   // data de pagamento (vencimento do CP de salário) escolhida ao gerar a folha
  funcionarios?: FolhaFunc[];
}
interface Adiantamento {
  id: string;
  fazenda_id: string;
  funcionario_id: string;
  funcionario_nome?: string;
  data: string;
  valor: number;
  competencia_ref?: string;
  descricao?: string;
  lancamento_id?: string;
  status: "pendente" | "descontado" | "cancelado";
  tipo?: "salario" | "gratificacao" | "devolucao";
  created_at?: string;
}
interface Premiacao {
  id: string;
  funcionario_id: string;
  funcionario_nome?: string;
  fazenda_id: string;
  mes_referencia: string;
  descricao: string;
  valor: number;
  lancado_financeiro: boolean;
  created_at?: string;
}

// ─── Cálculos ────────────────────────────────────────────────
function calcFGTS(b: number) { return Math.round(b * 0.08 * 100) / 100; }
function calcINSSPat(b: number) { return Math.round(b * 0.28 * 100) / 100; }

function liquido(f: FolhaFunc) {
  // Complemento é pago integral — não sofre desconto de INSS/IRRF
  return Math.max(0, Math.round((
    f.salario_bruto
    - f.inss_trabalhador - f.irrf - f.adiantamento - f.outros_descontos
    + f.vale_transporte + f.vale_refeicao + f.outros_beneficios
    + (f.complemento_salarial ?? 0)
  ) * 100) / 100);
}

// Colunas de horas extras (Seção 390): só vão ao banco quando alguma linha da folha tem hora extra — folha sem HE
// salva mesmo sem a Seção. Todas as linhas levam as mesmas colunas (insert em lote).
function camposHE(funcs: FolhaFunc[], f: FolhaFunc) {
  const tem = funcs.some(x => (x.he_valor ?? 0) > 0 || (x.he_50_horas ?? 0) > 0 || (x.he_100_horas ?? 0) > 0);
  return tem ? { he_50_horas: f.he_50_horas ?? 0, he_100_horas: f.he_100_horas ?? 0, he_valor: f.he_valor ?? 0, he_dsr: f.he_dsr ?? 0 } : {};
}

// Percentuais de encargo do cadastro do funcionário. Cadastro sem nenhum percentual salvo usa o padrão antigo (8% / 28%).
function pctsEncargos(cad: { fgts_pct?: number | null; inss_empregador_pct?: number | null; sat_rat_pct?: number | null; sistema_s_pct?: number | null }) {
  const tem = cad.inss_empregador_pct != null || cad.sat_rat_pct != null || cad.sistema_s_pct != null;
  const zerado = (v: number | null | undefined) => v != null && Number(v) === 0;
  return {
    sem_impostos: zerado(cad.fgts_pct) && zerado(cad.inss_empregador_pct) && zerado(cad.sat_rat_pct) && zerado(cad.sistema_s_pct),
    fgts_pct: cad.fgts_pct ?? undefined,
    inss_pat_pct: tem ? (cad.inss_empregador_pct ?? 0) + (cad.sat_rat_pct ?? 0) + (cad.sistema_s_pct ?? 0) : undefined,
  };
}

// INSS Patronal só se aplica a funcionário vinculado a Empresa (empresa_id).
// Vinculado a Produtor Rural (CPF): o empregador PF recolhe Funrural em vez
// de INSS Patronal sobre a folha — não faz sentido gerar/mostrar esse encargo
// aqui (Funrural é calculado sobre a comercialização, fora da folha).
function recalc(f: FolhaFunc): FolhaFunc {
  // Horas extras: valor e DSR refeitos pelo salário base e pelos dias da competência; entram no bruto (com encargos)
  if (f._comp && ((f.he_50_horas ?? 0) > 0 || (f.he_100_horas ?? 0) > 0 || (f.he_valor ?? 0) > 0)) {
    const he = calcularHorasExtras({ salario_base: f.salario_base || 0, horas_50: f.he_50_horas, horas_100: f.he_100_horas, competencia: f._comp });
    f = { ...f, he_valor: he.he_valor, he_dsr: he.he_dsr };
  }
  const bruto = Math.round(((f.salario_base || 0) + (f.gratificacao || 0) + (f.he_valor || 0) + (f.he_dsr || 0)) * 100) / 100;
  if (f.sem_impostos) return { ...f, salario_bruto: bruto, inss_trabalhador: 0, irrf: 0, fgts: 0, inss_patronal: 0 };
  const inss  = calcINSS(bruto);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const fgts = f.fgts_pct == null ? calcFGTS(bruto) : r2(bruto * f.fgts_pct / 100);
  const patronal = f.empresa_id ? (f.inss_pat_pct == null ? calcINSSPat(bruto) : r2(bruto * f.inss_pat_pct / 100)) : 0;
  return { ...f, salario_bruto: bruto, inss_trabalhador: inss, irrf: calcIRRF(bruto, inss), fgts, inss_patronal: patronal };
}

// ─── Helpers ─────────────────────────────────────────────────
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function nomeMes(comp: string) {
  const [ano, mes] = comp.split("-");
  const n = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${n[parseInt(mes)-1]}/${ano}`;
}
function compAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function dataFmt(s?: string) {
  if (!s) return "—";
  return new Date(s + "T12:00").toLocaleDateString("pt-BR");
}

// ─── Estilos ─────────────────────────────────────────────────
const S = {
  page:    { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body:    { maxWidth: 1300, margin: "0 auto", padding: "24px 20px" },
  card:    { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, marginBottom: 16 },
  label:   { fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 },
  inp:     { border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff" } as React.CSSProperties,
  btn:     (bg: string, color = "#fff"): React.CSSProperties => ({ background: bg, color, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  th:      { padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" as const, background: "#F4F6FA" },
  td:      { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #F0F2F7", verticalAlign: "middle" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal:   { background: "#fff", borderRadius: 10, padding: 28, width: "min(96vw,760px)", maxHeight: "92vh", overflowY: "auto" as const, position: "relative" as const },
};

const ST_LABEL: Record<string,string>  = { rascunho:"Rascunho", fechado:"Fechado", pago:"Pago" };
const ST_COLOR: Record<string,string>  = { rascunho:"#888", fechado:"#C9921B", pago:"#16A34A" };
const ADI_LABEL: Record<string,string> = { pendente:"Pendente", descontado:"Descontado", cancelado:"Cancelado" };
const ADI_COLOR: Record<string,string> = { pendente:"#C9921B", descontado:"#16A34A", cancelado:"#888" };

type Aba = "processamento" | "adiantamentos" | "gratificacoes";

// ─── Componente ───────────────────────────────────────────────
export default function FolhaPagamentoPage() {
  const { fazendaId, contaId, fazendaIds = [], podeAcao } = useAuth();
  // Reprocessar folha fechada é rotina liberada por grupo (Configurações → Usuários → Folha de Pagamento → Reprocessar)
  const podeReprocessar = podeAcao("folha", "reprocessar");
  type ItemRep = { tipo: "atualizar" | "criar" | "cancelar" | "sem_mudanca" | "pendencia_pago_maior" | "desconto"; funcionario_id?: string | null; nome: string; antes: number; depois: number; diferenca?: number };
  const [repPlano, setRepPlano] = useState<ItemRep[] | null>(null);
  const [repAdiNovos, setRepAdiNovos] = useState(0);
  const [repDesc, setRepDesc] = useState<Record<string, { valor: string; competencia: string }>>({});
  const [repErro, setRepErro] = useState("");
  const [aba, setAba]             = useState<Aba>("processamento");
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState("");
  const [saving, setSaving]       = useState(false);

  // dados
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folhas,       setFolhas]       = useState<Folha[]>([]);
  const [empresasMap,  setEmpresasMap]  = useState<Record<string, string>>({});
  const [produtoresMap, setProdutoresMap] = useState<Record<string, string>>({});
  const [adiantamentos, setAdiantamentos] = useState<Adiantamento[]>([]);
  const [premiacoes,   setPremiacoes]   = useState<Premiacao[]>([]);

  // filtros processamento
  const [fComp,    setFComp]    = useState(compAtual());
  const [fCompAte, setFCompAte] = useState(compAtual());

  // modal folha
  const [modalFolha,  setModalFolha]  = useState(false);
  const [folhaEdit,   setFolhaEdit]   = useState<Partial<Folha> & { funcionarios: FolhaFunc[] }>({ funcionarios: [] });
  const [abaModal,    setAbaModal]    = useState<"funcionarios"|"resumo">("funcionarios");
  const [funcIdx,     setFuncIdx]     = useState<number|null>(null);
  const [funcExpand,  setFuncExpand]  = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // modal adiantamento
  const [modalAdi,   setModalAdi]   = useState(false);
  const [adiEdit,    setAdiEdit]    = useState<Partial<Adiantamento>>({});
  const [vencCp,     setVencCp]     = useState<Record<string, string>>({});
  // Situação do salário no Contas a Pagar (folha fechada): soma o título e as partes de pagamento parcial (Seção 375)
  const [situacaoCp, setSituacaoCp] = useState<Record<string, { valor: number; pago: number; previsao: boolean; ultimaBaixa: string | null; travado: boolean }>>({});
  const [fGratFunc, setFGratFunc] = useState("");
  // Data de pagamento da folha (vencimento do CP de salário): cada cliente escolhe conforme a sua operação.
  // Padrão: o mesmo dia do mês usado na última folha (ou dia 5), no mês seguinte à competência.
  const [dataPgto, setDataPgto] = useState("");
  const dataPgtoManual = useRef(false);
  const [adiConta,   setAdiConta]   = useState("");
  const [contasAdi,  setContasAdi]  = useState<ContaBancaria[]>([]);

  // Contas bancárias do empregador do funcionário escolhido (empresa → contas da empresa; senão contas do produtor da conta)
  useEffect(() => {
    if (!modalAdi) return;
    const func = funcionarios.find(f => f.id === adiEdit.funcionario_id);
    let ativo = true;
    (async () => {
      try {
        const lista = func?.empresa_id
          ? await listarContasPorEmpresa(func.empresa_id)
          : contaId ? await listarContasProdutorDaConta(contaId) : [];
        if (ativo) { setContasAdi(lista); setAdiConta(c => lista.some(x => x.id === c) ? c : ""); }
      } catch { if (ativo) setContasAdi([]); }
    })();
    return () => { ativo = false; };
  }, [modalAdi, adiEdit.funcionario_id, funcionarios, contaId]);

  // modal premiação
  const [modalPrem,  setModalPrem]  = useState(false);
  const [premEdit,   setPremEdit]   = useState<Partial<Premiacao>>({});

  // modal replicar
  const [modalRep,   setModalRep]   = useState(false);
  const [repFolha,   setRepFolha]   = useState<Folha | null>(null);
  const [repNMeses,  setRepNMeses]  = useState(1);

  // competência interna do modal (nova folha — permite retroativo sem mexer no filtro externo)
  const [modalCompDe,  setModalCompDe]  = useState(compAtual());
  const [modalCompAte, setModalCompAte] = useState(compAtual());

  // ─── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      // Busca folhas via API route (service_role_key — evita qualquer bloqueio de RLS ou JWT)
      const { data: { session } } = await supabase.auth.getSession();
      const tkn = session?.access_token ?? "";

      const apiPost = (body: object) => fetch("/api/folha/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tkn}` },
        body: JSON.stringify(body),
      }).then(r => r.json()).catch(() => ({ ok: false, error: "Erro de rede" }));

      // Escopo por CONTA (todas as fazendas), não só a fazenda ativa no
      // TopNav — senão funcionários/folhas/adiantamentos de outra fazenda
      // da mesma conta "somem" da tela assim que o usuário troca de fazenda.
      const fids = fazendaIds.length ? fazendaIds : fazendaId ? [fazendaId] : [];

      const [
        funcsRes,
        folhasRes,
        adiPremRes,
        { data: emps },
        { data: prods },
      ] = await Promise.all([
        // Busca funcionários de todas as fazendas da conta via fazendaIds (join !inner
        // filtrado por conta_id falha silenciosamente no Supabase JS — usar in() diretamente)
        supabase.from("funcionarios")
          .select("id,fazenda_id,nome,funcao,salario_base,complemento_salarial,vale_transporte,vale_refeicao,outros_beneficios,fgts_pct,inss_empregador_pct,sat_rat_pct,sistema_s_pct,tipo,empresa_id,produtor_id,ativo")
          .in("fazenda_id", fids)
          .eq("ativo", true)
          .order("nome"),
        apiPost({ operacao: "listar_folhas", fazenda_ids: fids }),
        apiPost({ operacao: "listar_adi_prem", fazenda_ids: fids }),
        supabase.from("empresas")
          .select("id,nome_fantasia,razao_social")
          .in("fazenda_id", fids)
          .order("nome_fantasia"),
        contaId
          ? supabase.from("produtores").select("id,nome").eq("conta_id", contaId).order("nome")
          : Promise.resolve({ data: [] }),
      ]);
      const { data: funcs } = funcsRes as { data: any[] | null };

      if (!folhasRes.ok) setMsg(`Erro ao carregar folhas: ${folhasRes.error ?? "desconhecido"}`);
      if (!adiPremRes.ok) setMsg(`Erro ao carregar adiantamentos: ${adiPremRes.error ?? "desconhecido"}`);

      // Mapa empresa_id → nome
      const eMap: Record<string, string> = {};
      (emps ?? []).forEach((e: any) => { eMap[e.id] = e.nome_fantasia || e.razao_social || e.id; });
      setEmpresasMap(eMap);
      // Mapa produtor_id → nome
      const pMap: Record<string, string> = {};
      (prods ?? []).forEach((p: any) => { pMap[p.id] = p.nome; });
      setProdutoresMap(pMap);

      // Todos os funcionários ativos com nome do empregador resolvido
      const funcsLista = (funcs ?? [])
        .filter((f: any) => f.ativo !== false)
        .map((f: any) => ({ ...f, empresa_nome: f.empresa_id ? (eMap[f.empresa_id] ?? "Empresa não encontrada") : undefined }));
      const funcIds = new Set(funcsLista.map((f: any) => f.id));
      setFuncionarios(funcsLista);

      // Folhas via API route (já vêm com num_funcionarios)
      const fols: any[] = folhasRes.data ?? [];
      const folhasComNome = fols.map((f: any) => ({
        ...f,
        empresa_nome: f.empresa_id ? (eMap[f.empresa_id] ?? "Empresa não encontrada") : undefined,
        produtor_nome: f.produtor_id ? (pMap[f.produtor_id] ?? "Produtor não encontrado") : undefined,
      }));
      setFolhas(folhasComNome);

      const adis: any[] = adiPremRes.adis ?? [];
      const prems: any[] = adiPremRes.prems ?? [];
      setAdiantamentos(adis.filter((a: any) => funcIds.has(a.funcionario_id)).map((a: any) => ({ ...a, funcionario_nome: a.funcionarios?.nome })));
      setPremiacoes(prems.filter((p: any) => funcIds.has(p.funcionario_id)).map((p: any) => ({ ...p, funcionario_nome: p.funcionarios?.nome })));
    } catch (e: any) {
      setMsg(`Erro ao carregar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, contaId, fazendaIds.join(",")]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Helpers de intervalo ────────────────────────────────────
  function monthsInRange(from: string, to: string): string[] {
    const months: string[] = [];
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  // ─── Folha — abrir / criar ───────────────────────────────────
  async function abrirFolha(folha?: Folha) {
    if (!fazendaId) return;
    if (folha) {
      // Carregar itens existentes via API route (service_role — bypass RLS)
      const { data: { session } } = await supabase.auth.getSession();
      const tkn = session?.access_token ?? "";
      const res = await fetch("/api/folha/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({ operacao: "listar_funcionarios_folha", folha_id: folha.id }),
      }).then(r => r.json()).catch(() => ({ ok: false, data: [] }));
      const itens: any[] = res.data ?? [];
      const funcsCarregados = itens.map((i: any) => {
        const base: FolhaFunc = {
          ...i,
          salario_base: Math.round(((i.salario_bruto ?? 0) - (i.gratificacao ?? 0) - (i.he_valor ?? 0) - (i.he_dsr ?? 0)) * 100) / 100,
          complemento_salarial: i.complemento_salarial ?? 0,
          gratificacao: i.gratificacao ?? 0,
          he_50_horas: Number(i.he_50_horas ?? 0), he_100_horas: Number(i.he_100_horas ?? 0),
          he_valor: Number(i.he_valor ?? 0), he_dsr: Number(i.he_dsr ?? 0),
          _comp: folha.competencia,
        };
        // Rascunho: a folha salva é uma "foto" de quando foi criada. Se o cadastro mudou depois (salário
        // base, complemento salarial, benefícios), reabrir mostrava valores velhos e o que ia pro CP não
        // batia com o cadastro. Atualiza do cadastro; gratificação e outros descontos são da folha e ficam.
        if (folha.status === "rascunho") {
          const cad = funcionarios.find(x => x.id === i.funcionario_id);
          if (cad) {
            Object.assign(base, recalc({
              ...base,
              ...pctsEncargos(cad),
              salario_base: cad.salario_base ?? base.salario_base,
              complemento_salarial: cad.complemento_salarial ?? 0,
              vale_transporte: cad.vale_transporte ?? 0,
              vale_refeicao: cad.vale_refeicao ?? 0,
              outros_beneficios: cad.outros_beneficios ?? 0,
            }));
          }
        }
        // Para rascunho: herda adiantamentos pendentes — inclui os sem competência_ref
        if (folha.status === "rascunho") {
          const adi = adiantamentos
            .filter(a =>
              (!a.competencia_ref || a.competencia_ref === folha.competencia) &&
              a.status === "pendente" &&
              a.funcionario_id === i.funcionario_id
            )
            .reduce((s, a) => s + a.valor, 0);
          base.adiantamento = adi;  // vem só da aba Adiantamentos (pendentes da competência ou sem competência)
        }
        return base;
      });
      setFolhaEdit({ ...folha, funcionarios: funcsCarregados });
      setSelecionados(new Set(funcsCarregados.map((_, i) => i)));
      dataPgtoManual.current = true;
      setDataPgto(folha.data_vencimento ?? vencimentoSalario(folha.competencia, diaPagamentoPadrao()));
      // Folha fechada: data de pagamento prevista = vencimento real do CP de salário de cada funcionário
      const cpIds = funcsCarregados.map(f => f.cp_lancamento_id).filter(Boolean) as string[];
      if (cpIds.length) {
        const { data: lancs } = await supabase.from("lancamentos").select("id, data_vencimento").in("id", cpIds);
        setVencCp(Object.fromEntries((lancs ?? []).map(l => [l.id as string, l.data_vencimento as string])));
        const { data: partes } = await supabase.from("lancamentos").select("id, titulo_origem_id, valor, valor_pago, status, natureza, data_baixa, lote_id, conciliado")
          .or(`id.in.(${cpIds.join(",")}),titulo_origem_id.in.(${cpIds.join(",")})`).neq("status", "cancelado");
        const sit: Record<string, { valor: number; pago: number; previsao: boolean; ultimaBaixa: string | null; travado: boolean }> = {};
        for (const t of (partes ?? []) as { id: string; titulo_origem_id: string | null; valor: number; valor_pago: number | null; status: string; natureza: string | null; data_baixa: string | null; lote_id: string | null; conciliado: boolean | null }[]) {
          const chave = cpIds.includes(t.id) ? t.id : t.titulo_origem_id;
          if (!chave) continue;
          const atual = sit[chave] ?? { valor: 0, pago: 0, previsao: false, ultimaBaixa: null, travado: false };
          const pago = t.status === "baixado" ? Number(t.valor_pago ?? t.valor) : Number(t.valor_pago ?? 0);
          // Salário já movimentado (pago, parcial, em borderô ou conciliado) não pode mais ser alterado pela folha
          const travado = pago > 0 || !!t.lote_id || !!t.conciliado || t.status === "baixado" || t.status === "parcial";
          sit[chave] = { valor: atual.valor + Number(t.valor), pago: atual.pago + pago, previsao: atual.previsao || t.natureza === "previsao",
            ultimaBaixa: t.data_baixa && (!atual.ultimaBaixa || t.data_baixa > atual.ultimaBaixa) ? t.data_baixa : atual.ultimaBaixa,
            travado: atual.travado || travado };
        }
        setSituacaoCp(sit);
        // Folha fechada: salário ainda não pago que mudou no cadastro (salário base, complemento, benefícios) é
        // atualizado na tela — o ⟳ Reprocessar Folha leva a diferença ao Contas a Pagar. Achado 29/10/2026: o
        // reprocessamento usava a "foto" da folha e ignorava a mudança feita no cadastro. Salário pago fica como está.
        if (folha.status === "fechado") {
          const atualizados: string[] = [];
          const novos = funcsCarregados.map(f => {
            if (f.cp_lancamento_id && sit[f.cp_lancamento_id]?.travado) return f;
            const cad = funcionarios.find(x => x.id === f.funcionario_id);
            if (!cad) return f;
            const dif = (a: unknown, b: unknown) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > 0.005;
            if (!(dif(cad.salario_base ?? f.salario_base, f.salario_base) || dif(cad.complemento_salarial, f.complemento_salarial)
              || dif(cad.vale_transporte, f.vale_transporte) || dif(cad.vale_refeicao, f.vale_refeicao) || dif(cad.outros_beneficios, f.outros_beneficios))) return f;
            atualizados.push(f.nome_funcionario);
            return { ...f, ...recalc({ ...f, ...pctsEncargos(cad), salario_base: cad.salario_base ?? f.salario_base, complemento_salarial: cad.complemento_salarial ?? 0,
              vale_transporte: cad.vale_transporte ?? 0, vale_refeicao: cad.vale_refeicao ?? 0, outros_beneficios: cad.outros_beneficios ?? 0 }) };
          });
          if (atualizados.length) {
            setFolhaEdit({ ...folha, funcionarios: novos });
            setMsg(`Salário atualizado pelo cadastro: ${atualizados.join(", ")}. Clique em ⟳ Reprocessar Folha para levar a diferença ao Contas a Pagar.`);
          }
        }
      } else { setVencCp({}); setSituacaoCp({}); }
    } else {
      setVencCp({}); setSituacaoCp({});
      dataPgtoManual.current = false;
      // Nova folha — pré-preenche com funcionários ativos
      // Inclui adiantamentos sem competência_ref (null) — debitam na próxima folha
      const adisComp = adiantamentos.filter(
        a => (!a.competencia_ref || a.competencia_ref === fComp) && a.status === "pendente"
      );
      const premsComp = premiacoes.filter(p => p.mes_referencia === fComp);
      const funcs: FolhaFunc[] = funcionarios.map(f => {
        const base = f.salario_base ?? 0;
        const grat = premsComp
          .filter(p => p.funcionario_id === f.id)
          .reduce((s, p) => s + p.valor, 0);
        const adi  = adisComp
          .filter(a => a.funcionario_id === f.id)
          .reduce((s, a) => s + a.valor, 0);
        return recalc({
          ...pctsEncargos(f),
          funcionario_id: f.id,
          fazenda_id: f.fazenda_id,
          empresa_id: f.empresa_id ?? null,
          produtor_id: f.produtor_id ?? null,
          nome_funcionario: f.nome,
          cargo: f.funcao ?? "",
          salario_base: base,
          complemento_salarial: (f as any).complemento_salarial ?? 0,
          gratificacao: grat,
          he_50_horas: 0, he_100_horas: 0, he_valor: 0, he_dsr: 0, _comp: fComp,
          salario_bruto: base + grat,
          inss_trabalhador: 0,
          irrf: 0,
          adiantamento: adi,
          outros_descontos: 0, desc_outros_descontos: "",
          vale_transporte: f.vale_transporte ?? 0,
          vale_refeicao: f.vale_refeicao ?? 0,
          outros_beneficios: f.outros_beneficios ?? 0,
          inss_patronal: 0, fgts: 0,
        });
      });
      // Ordena por empregador (nulls por último) para agrupamento visual
      funcs.sort((a, b) => {
        const ea = a.empresa_id ?? "￿";
        const eb = b.empresa_id ?? "￿";
        if (ea !== eb) return ea.localeCompare(eb);
        return a.nome_funcionario.localeCompare(b.nome_funcionario);
      });
      setFolhaEdit({ competencia: fComp, status: "rascunho", funcionarios: funcs });
      setSelecionados(new Set(funcs.map((_, i) => i)));
      setModalCompDe(fComp);
      setModalCompAte(fCompAte);
    }
    setAbaModal("funcionarios");
    setFuncExpand(new Set());
    setModalFolha(true);
  }

  async function salvarFolha() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar folha)", perigo: false }))) return;
    if (!fazendaId) return;
    setSaving(true);
    try {
      // Apenas os funcionários marcados
      const funcs = (folhaEdit.funcionarios ?? []).filter((_, i) => selecionados.has(i));
      if (funcs.length === 0) { setMsg("Selecione ao menos um funcionário."); setSaving(false); return; }

      if (folhaEdit.id) {
        // Edição de folha existente — mantém empregador e fazenda originais
        await salvarFolhaMes(folhaEdit.competencia!, funcs, folhaEdit.empresa_id, folhaEdit.produtor_id, folhaEdit.fazenda_id);
        setMsg("Folha salva.");
      } else {
        // Nova folha — agrupa por fazenda + empregador (empresa ou produtor
        // rural) e gera uma folha por grupo por mês. Produtores diferentes
        // (empresa_id nulo) NÃO podem cair na mesma folha — cada um vira um
        // grupo/folha separado (Seção 261).
        const grupos = new Map<string, { empresaId: string | null; produtorId: string | null; fazendaIdGrupo: string; itens: FolhaFunc[] }>();
        for (const f of funcs) {
          const fazendaIdGrupo = f.fazenda_id ?? fazendaId!;
          const empresaId  = f.empresa_id ?? null;
          const produtorId = empresaId ? null : (f.produtor_id ?? null);
          const key = `${fazendaIdGrupo}|${empresaId ?? ""}|${produtorId ?? ""}`;
          if (!grupos.has(key)) grupos.set(key, { empresaId, produtorId, fazendaIdGrupo, itens: [] });
          grupos.get(key)!.itens.push(f);
        }
        const meses = monthsInRange(modalCompDe, modalCompAte);
        let total = 0;
        for (const comp of meses) {
          for (const { empresaId, produtorId, fazendaIdGrupo, itens } of grupos.values()) {
            await salvarFolhaMes(comp, itens, empresaId, produtorId, fazendaIdGrupo);
            total++;
          }
        }
        const quantGrupos = grupos.size;
        if (total > 1) setMsg(`${total} folhas geradas — ${meses.length} mês(es) × ${quantGrupos} empregador(es)/produtor(es).`);
        else setMsg("Folha salva.");
      }
      setModalFolha(false);
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  function diaPagamentoPadrao(): number {
    const ult = [...folhas].filter(f => f.data_vencimento).sort((a, b) => (b.competencia ?? "").localeCompare(a.competencia ?? ""))[0];
    const d = ult?.data_vencimento ? Number(ult.data_vencimento.slice(8, 10)) : 5;
    return d >= 1 && d <= 31 ? d : 5;
  }
  // Folha nova: acompanha a competência escolhida enquanto o usuário não digitar a data
  useEffect(() => {
    if (!modalFolha || folhaEdit.id || dataPgtoManual.current) return;
    setDataPgto(vencimentoSalario(modalCompDe, diaPagamentoPadrao()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalFolha, folhaEdit.id, modalCompDe, folhas]);

  async function apiFolha(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const res = await fetch("/api/folha/salvar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "Erro na API de folha");
    return json;
  }

  async function salvarFolhaMes(comp: string, funcs: FolhaFunc[], empresaId?: string | null, produtorId?: string | null, fazendaIdGrupo?: string) {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar folha mes)", perigo: false }))) return;
    const fazendaAlvo = fazendaIdGrupo ?? funcs[0]?.fazenda_id ?? fazendaId!;
    const totalBruto   = funcs.reduce((s, f) => s + f.salario_bruto, 0);
    const totalLiq     = funcs.reduce((s, f) => s + liquido(f), 0);
    const totalINSSPat = funcs.reduce((s, f) => s + f.inss_patronal, 0);
    const totalFGTS    = funcs.reduce((s, f) => s + f.fgts, 0);

    // Reutiliza o ID só quando editando a folha existente (mesmo mês, mesma
    // fazenda e mesmo empregador/produtor)
    let folhaId = (
      folhaEdit.id && comp === folhaEdit.competencia
      && (folhaEdit.fazenda_id ?? null) === (fazendaAlvo ?? null)
      && (folhaEdit.empresa_id ?? null) === (empresaId ?? null)
      && (folhaEdit.produtor_id ?? null) === (produtorId ?? null)
    ) ? folhaEdit.id : undefined;

    // Data de pagamento: a informada vale para a competência principal; nas demais (geração em vários meses)
    // repete o mesmo dia no mês seguinte à respectiva competência.
    const compBase = folhaEdit.id ? folhaEdit.competencia : modalCompDe;
    const diaPgto = Number(dataPgto.slice(8, 10)) || diaPagamentoPadrao();
    const data_vencimento = dataPgto && comp === compBase ? dataPgto : vencimentoSalario(comp, diaPgto);
    const dadosFolha = { valor_bruto: totalBruto, valor_liquido: totalLiq, inss_patronal: totalINSSPat, fgts_total: totalFGTS, obs: folhaEdit.obs, data_vencimento };

    if (!folhaId) {
      // Upsert via API route (service_role_key evita RLS 42501)
      const res = await apiFolha({
        operacao: "upsert_folha",
        fazenda_id: fazendaAlvo,
        empresa_id: empresaId ?? null,
        produtor_id: produtorId ?? null,
        competencia: comp,
        ...dadosFolha,
      });
      folhaId = res.id as string;
      if (!res.criou) {
        // Folha existente: limpa funcionários para recriar
        await apiFolha({ operacao: "delete_funcionarios", folha_id: folhaId });
      }
      if (comp === folhaEdit.competencia) setFolhaEdit(p => ({ ...p, id: folhaId, fazenda_id: fazendaAlvo, empresa_id: empresaId ?? null, produtor_id: produtorId ?? null }));
    } else {
      await apiFolha({ operacao: "update_folha", id: folhaId, ...dadosFolha });
      await apiFolha({ operacao: "delete_funcionarios", folha_id: folhaId });
    }

    if (funcs.length) {
      const rows = funcs.map(f => ({
        folha_id: folhaId,
        funcionario_id: f.funcionario_id ?? null,
        empresa_id: f.empresa_id ?? null,
        produtor_id: f.produtor_id ?? null,
        nome_funcionario: f.nome_funcionario,
        cargo: f.cargo,
        salario_bruto: f.salario_bruto,
        complemento_salarial: f.complemento_salarial ?? 0,
        gratificacao: f.gratificacao,
        ...camposHE(funcs, f),
        inss_trabalhador: f.inss_trabalhador,
        irrf: f.irrf,
        adiantamento: f.adiantamento,
        outros_descontos: f.outros_descontos,
        desc_outros_descontos: f.desc_outros_descontos,
        vale_transporte: f.vale_transporte,
        vale_refeicao: f.vale_refeicao,
        outros_beneficios: f.outros_beneficios,
        inss_patronal: f.inss_patronal,
        fgts: f.fgts,
      }));
      await apiFolha({ operacao: "insert_funcionarios", rows });
    }
  }

  async function fecharFolha(folha: Folha) {
    // Verifica adiantamentos pendentes para esta competência que podem não estar na folha
    const adisPendentesComp = adiantamentos.filter(
      a => (!a.competencia_ref || a.competencia_ref === folha.competencia) && a.status === "pendente"
    );
    if (adisPendentesComp.length > 0) {
      const nomes = adisPendentesComp.map(a => `${a.funcionario_nome ?? "funcionário"} (${a.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`).join(", ");
      const ok = confirm(
        `Há ${adisPendentesComp.length} adiantamento(s) pendente(s) para ${nomeMes(folha.competencia)}:\n\n${nomes}\n\nEles serão descontados automaticamente do salário líquido ao fechar a folha, exceto nos títulos cujo valor você editou no Contas a Pagar.\n\nFechar a folha?`
      );
      if (!ok) return;
    } else {
      if (!confirm(`Fechar a folha de ${nomeMes(folha.competencia)}? As previsões do Contas a Pagar viram títulos reais (vale o valor que estiver na previsão).`)) return;
    }
    setSaving(true);
    try {
      // Tudo via API route com service_role_key para evitar RLS 42501
      await apiFolha({
        operacao: "fechar_folha",
        id: folha.id,
        fazenda_id: folha.fazenda_id,
        empresa_id: folha.empresa_id ?? null,
        competencia: folha.competencia,
      });
      setMsg("Folha fechada e CPs gerados.");
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Adiantamento — salvar ────────────────────────────────────
  async function reabrirFolha() {
    if (!folhaEdit.id || !folhaEdit.competencia || !folhaEdit.fazenda_id) return;
    if (!confirm(
      `Reabrir a folha de ${nomeMes(folhaEdit.competencia)}?\n\n` +
      `Isso irá:\n• Excluir os CPs gerados (salários a pagar) e voltá-los a previsão\n` +
      `• Reverter adiantamentos de "Descontado" para "Pendente"\n` +
      `• Colocar a folha de volta em Rascunho para edição\n\n` +
      `Atenção: se algum CP já foi baixado em borderô, a operação será bloqueada.`
    )) return;
    setSaving(true);
    try {
      await apiFolha({
        operacao: "reabrir_folha",
        id: folhaEdit.id,
        fazenda_id: folhaEdit.fazenda_id,
        competencia: folhaEdit.competencia,
      });
      setFolhaEdit(p => ({ ...p, status: "rascunho" }));
      setMsg("Folha reaberta. Edite e feche novamente quando estiver pronto.");
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // Linhas da folha como vão para o banco (mesmo formato do Salvar Folha)
  function linhasDaFolha(funcs: FolhaFunc[]) {
    return funcs.map(f => ({
      funcionario_id: f.funcionario_id ?? null, empresa_id: f.empresa_id ?? null, produtor_id: f.produtor_id ?? null,
      nome_funcionario: f.nome_funcionario, cargo: f.cargo, salario_bruto: f.salario_bruto,
      complemento_salarial: f.complemento_salarial ?? 0, gratificacao: f.gratificacao, ...camposHE(funcs, f),
      inss_trabalhador: f.inss_trabalhador, irrf: f.irrf, adiantamento: f.adiantamento,
      outros_descontos: f.outros_descontos, desc_outros_descontos: f.desc_outros_descontos,
      vale_transporte: f.vale_transporte, vale_refeicao: f.vale_refeicao, outros_beneficios: f.outros_beneficios,
      inss_patronal: f.inss_patronal, fgts: f.fgts,
    }));
  }

  // ⟳ Reprocessar Folha (folha fechada): 1º mostra a prévia do que muda no CP; 2º grava, com os descontos informados
  async function reprocessarFolha(simular: boolean) {
    if (!folhaEdit.id) return;
    const funcs = (folhaEdit.funcionarios ?? []).filter((_, i) => selecionados.has(i));
    setSaving(true); setRepErro("");
    try {
      const descontos = Object.entries(repDesc).map(([funcionario_id, d]) => ({
        funcionario_id, valor: parseFloat(d.valor.replace(/\./g, "").replace(",", ".")) || 0, competencia_ref: d.competencia, data: hojeLocal(),
      }));
      const r = await apiFolha({ operacao: "reprocessar_folha", id: folhaEdit.id, rows: linhasDaFolha(funcs), dadosFolha: { obs: folhaEdit.obs }, simular, descontos });
      if (simular) {
        const plano = r.plano as ItemRep[];
        setRepPlano(plano); setRepAdiNovos(Number(r.adiantamentos_novos ?? 0));
        const prox = (() => { const [a, m] = (folhaEdit.competencia ?? "").split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; })();
        setRepDesc(Object.fromEntries(plano.filter(p => p.tipo === "desconto" && p.funcionario_id).map(p => [String(p.funcionario_id), { valor: (p.diferenca ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), competencia: prox }])));
      } else {
        setRepPlano(null); setRepDesc({});
        setMsg(`Folha reprocessada: ${r.alterados ?? 0} alteração(ões) no Contas a Pagar.`);
        setModalFolha(false);
        carregar();
      }
    } catch (e: any) {
      if (simular) setMsg("Erro: " + e.message); else setRepErro(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function excluirFolha(alvo: Partial<Folha> = folhaEdit) {
    if (!alvo.id || !alvo.competencia) return;
    const fechada = alvo.status === "fechado";
    const mesLabel = nomeMes(alvo.competencia);
    const aviso = fechada
      ? `Excluir a folha de ${mesLabel}?\n\nEsta folha está fechada — isso vai:\n• Excluir os CPs gerados (salário de cada funcionário, FGTS e INSS Patronal)\n• Reverter adiantamentos de "Descontado" para "Pendente"\n• Apagar a folha e todos os funcionários dela\n\nAtenção: se algum CP já foi baixado em borderô, a exclusão será bloqueada — estorne o borderô primeiro.`
      : `Excluir a folha de ${mesLabel} (rascunho)?\n\nA folha, todos os funcionários dela e as previsões lançadas no Contas a Pagar / fluxo de caixa serão apagados.`;
    if (!confirm(aviso)) return;
    setSaving(true);
    try {
      await apiFolha({
        operacao: "delete_folha",
        id: alvo.id,
        fazenda_id: alvo.fazenda_id,
        competencia: alvo.competencia,
      });
      setModalFolha(false);
      setMsg("Folha excluída.");
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // Gratificação lançada x já adiantada, para o funcionário/competência do modal de adiantamento
  const adiGratInfo = (() => {
    const fid = adiEdit.funcionario_id, comp = adiEdit.competencia_ref;
    if (adiEdit.tipo !== "gratificacao" || !fid || !comp) return { lancada: 0, adiantado: 0, disponivel: 0 };
    const lancada = premiacoes.filter(p => p.funcionario_id === fid && String(p.mes_referencia).slice(0, 7) === comp).reduce((s, p) => s + p.valor, 0);
    const adiantado = adiantamentos.filter(a => a.tipo === "gratificacao" && a.funcionario_id === fid && a.competencia_ref === comp && a.status !== "cancelado" && a.id !== adiEdit.id).reduce((s, a) => s + a.valor, 0);
    return { lancada, adiantado, disponivel: Math.max(0, Math.round((lancada - adiantado) * 100) / 100) };
  })();

  async function salvarAdiantamento() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar adiantamento)", perigo: false }))) return;
    if (!fazendaId || !adiEdit.funcionario_id || !adiEdit.valor || !adiEdit.data) {
      setMsg("Preencha funcionário, data e valor."); return;
    }
    if (!adiEdit.id && !adiConta) { setMsg("Selecione a conta bancária de onde saiu o adiantamento (necessária para o fluxo de caixa)."); return; }
    if (adiEdit.tipo === "gratificacao") {
      if (!adiEdit.competencia_ref) { setMsg("Adiantamento de gratificação: informe a competência da gratificação."); return; }
      if (adiGratInfo.lancada <= 0) { setMsg("Não há gratificação lançada para este funcionário nessa competência. Lance antes em Cadastros, Funcionários, aba Premiações."); return; }
      if ((adiEdit.valor ?? 0) > adiGratInfo.disponivel + 0.005) {
        setMsg(`O valor excede a gratificação disponível (${moeda(adiGratInfo.disponivel)}). O excedente deve ser lançado manualmente como empréstimo a terceiros.`); return;
      }
    }
    setSaving(true);
    const funcionario_nome = funcionarios.find(f => f.id === adiEdit.funcionario_id)?.nome ?? "";
    try {
      if (adiEdit.id) {
        // Edição de adiantamento existente
        await apiFolha({
          operacao: "editar_adiantamento",
          tipo: adiEdit.tipo ?? "salario",
          id: adiEdit.id,
          funcionario_id: adiEdit.funcionario_id,
          data: adiEdit.data,
          valor: adiEdit.valor,
          competencia_ref: adiEdit.competencia_ref || null,
          descricao: adiEdit.descricao || null,
          funcionario_nome,
        });
        setMsg("Adiantamento atualizado.");
      } else {
        const r = await apiFolha({
          operacao: "salvar_adiantamento",
          tipo: adiEdit.tipo ?? "salario",
          fazenda_id: fazendaId,
          funcionario_id: adiEdit.funcionario_id,
          data: adiEdit.data,
          valor: adiEdit.valor,
          competencia_ref: adiEdit.competencia_ref || null,
          descricao: adiEdit.descricao || null,
          funcionario_nome,
        }) as { lancamento_id?: string | null };
        // Adiantamento é dinheiro que já saiu: CP nasce baixado, na conta informada (entra no fluxo de caixa)
        if (r?.lancamento_id) {
          try {
            await baixarLancamento(r.lancamento_id, adiEdit.valor, adiEdit.data, adiConta);
            setMsg("Adiantamento registrado, CP gerado e baixado na conta selecionada.");
          } catch (eb: any) {
            setMsg(`Adiantamento registrado e CP gerado, mas a baixa falhou: ${eb.message}. Baixe o CP manualmente em Contas a Pagar.`);
          }
        } else setMsg("Adiantamento registrado e CP gerado.");
      }
      setModalAdi(false);
      setAdiEdit({});
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelarAdiantamento(id: string) {
    if (!confirm("Cancelar este adiantamento?")) return;
    try {
      await apiFolha({ operacao: "cancelar_adiantamento", id });
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    }
  }

  // ─── Premiação — salvar ───────────────────────────────────────
  async function salvarPremiacao() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar premiacao)", perigo: false }))) return;
    if (!fazendaId || !premEdit.funcionario_id || !premEdit.valor || !premEdit.descricao || !premEdit.mes_referencia) {
      setMsg("Preencha todos os campos obrigatórios."); return;
    }
    setSaving(true);
    try {
      if (premEdit.id) {
        // Edição de gratificação existente
        await apiFolha({
          operacao: "editar_premiacao",
          id: premEdit.id,
          funcionario_id: premEdit.funcionario_id,
          mes_referencia: premEdit.mes_referencia,
          descricao: premEdit.descricao,
          valor: premEdit.valor,
        });
        setMsg("Gratificação atualizada.");
      } else {
        await apiFolha({
          operacao: "salvar_premiacao",
          fazenda_id: fazendaId,
          funcionario_id: premEdit.funcionario_id,
          mes_referencia: premEdit.mes_referencia,
          descricao: premEdit.descricao,
          valor: premEdit.valor,
        });
        setMsg("Gratificação registrada.");
      }
      setModalPrem(false);
      setPremEdit({});
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function excluirPremiacao(id: string) {
    if (!confirm("Excluir esta gratificação?")) return;
    try {
      await apiFolha({ operacao: "excluir_premiacao", id });
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    }
  }

  // ─── Campos editáveis na folha ────────────────────────────────
  async function replicarFolha() {
    if (!repFolha || !fazendaId) return;
    setSaving(true);
    try {
      const res = await apiFolha({ operacao: "listar_funcionarios_folha", folha_id: repFolha.id });
      const funcsBase: any[] = (res.data ?? []).map((i: any) => ({
        funcionario_id: i.funcionario_id, empresa_id: i.empresa_id, produtor_id: i.produtor_id,
        nome_funcionario: i.nome_funcionario, cargo: i.cargo,
        salario_bruto: i.salario_bruto, complemento_salarial: i.complemento_salarial ?? 0,
        gratificacao: i.gratificacao, inss_trabalhador: i.inss_trabalhador, irrf: i.irrf,
        ...((res.data ?? []).some((x: { he_valor?: number; he_50_horas?: number; he_100_horas?: number }) => Number(x.he_valor ?? 0) > 0 || Number(x.he_50_horas ?? 0) > 0 || Number(x.he_100_horas ?? 0) > 0)
          ? { he_50_horas: i.he_50_horas ?? 0, he_100_horas: i.he_100_horas ?? 0, he_valor: i.he_valor ?? 0, he_dsr: i.he_dsr ?? 0 } : {}),
        adiantamento: 0, outros_descontos: 0, desc_outros_descontos: "",
        vale_transporte: i.vale_transporte, vale_refeicao: i.vale_refeicao,
        outros_beneficios: i.outros_beneficios, inss_patronal: i.inss_patronal, fgts: i.fgts,
      }));
      const [ano, mes] = repFolha.competencia.split("-").map(Number);
      const criadas: string[] = [];
      for (let i = 1; i <= repNMeses; i++) {
        const dt = new Date(ano, mes - 1 + i, 1);
        const novaComp = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
        const novaRes = await apiFolha({
          operacao: "upsert_folha",
          fazenda_id: fazendaId,
          empresa_id: repFolha.empresa_id ?? null,
          competencia: novaComp,
          valor_bruto: repFolha.valor_bruto, valor_liquido: repFolha.valor_liquido,
          inss_patronal: repFolha.inss_patronal, fgts_total: repFolha.fgts_total,
        });
        if (!novaRes.criou) {
          criadas.push(`${nomeMes(novaComp)} (já existe — atualizada)`);
        } else {
          criadas.push(nomeMes(novaComp));
        }
        await apiFolha({ operacao: "delete_funcionarios", folha_id: novaRes.id });
        if (funcsBase.length) {
          await apiFolha({ operacao: "insert_funcionarios", rows: funcsBase.map((f: any) => ({ ...f, folha_id: novaRes.id })) });
        }
      }
      setMsg(`Replicado para: ${criadas.join(", ")}.`);
      setModalRep(false); carregar();
    } catch (e: any) { setMsg("Erro: " + e.message); }
    finally { setSaving(false); }
  }

  function setFuncField(idx: number, field: keyof FolhaFunc, val: number | string) {
    setFolhaEdit(prev => {
      const funcs = [...prev.funcionarios];
      const f = { ...funcs[idx], [field]: val };
      funcs[idx] = (field === "salario_base" || field === "gratificacao" || field === "he_50_horas" || field === "he_100_horas") ? recalc({ ...f, _comp: f._comp ?? prev.competencia }) : f;
      return { ...prev, funcionarios: funcs };
    });
  }
  function toggleExpand(idx: number) {
    setFuncExpand(prev => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  }

  // ─── Derived ─────────────────────────────────────────────────
  const folhasFiltradas   = folhas.filter(f => f.competencia >= fComp && f.competencia <= fCompAte);
  const folhasForaPeriodo = folhas.filter(f => f.competencia < fComp || f.competencia > fCompAte);
  const totalBrutoFolhaEdit   = folhaEdit.funcionarios?.reduce((s,f)=>s+f.salario_bruto,0)??0;
  const totalLiqFolhaEdit     = folhaEdit.funcionarios?.reduce((s,f)=>s+liquido(f),0)??0;
  const totalINSSPatFolhaEdit  = folhaEdit.funcionarios?.reduce((s,f)=>s+f.inss_patronal,0)??0;

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div data-arato-page="true" style={S.page}>
      <TopNav />
      <div style={S.body}>

        {/* Cabeçalho */}
        <div data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div>
            <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Folha de Pagamento</h1>
          </div>
        </div>

        {msg && (
          <div style={{ background: msg.startsWith("Erro") ? "#FEF2F2" : "#F0FDF4", border: `0.5px solid ${msg.startsWith("Erro") ? "#FECACA" : "#BBF7D0"}`, borderRadius: 6, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: msg.startsWith("Erro") ? "#B91C1C" : "#166534" }}>
            {msg} <OperationalButton data-arato-button="icon" onClick={()=>setMsg("")} style={{ float:"right", background:"none", border:"none", cursor:"pointer", fontSize:15, lineHeight:1 }}>×</OperationalButton>
          </div>
        )}

        {/* Abas */}
        <div data-arato-tabs="true" style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
          {([
            ["processamento","📋 Processamento"],
            ["adiantamentos","💵 Adiantamentos"],
            ["gratificacoes","⭐ Gratificações"],
          ] as [Aba,string][]).map(([k,l]) => (
            <OperationalButton data-arato-tab-active={aba === (k)} data-arato-tab="true" data-arato-button="toggle" key={k} onClick={()=>setAba(k)}
              style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: aba===k ? "2px solid #1A4870" : "2px solid transparent", fontWeight: aba===k ? 700 : 400, color: aba===k ? "#1A4870" : "#666", cursor: "pointer", fontSize: 13 }}>
              {l}
            </OperationalButton>
          ))}
        </div>

        {/* ══════════════════ ABA PROCESSAMENTO ══════════════════ */}
        {aba === "processamento" && (
          <>
            <OperationalFilters data-arato-filters="true" style={{ ...S.card, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div>
                  <label data-arato-label="true" style={S.label}>De</label>
                  <InputData type="month" value={fComp} onChange={e=>{ if (!e.target.value) return; setFComp(e.target.value); if (e.target.value > fCompAte) setFCompAte(e.target.value); }} style={{ ...S.inp, width: 140 }} />
                </div>
                <span style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>até</span>
                <div>
                  <label data-arato-label="true" style={S.label}>Até</label>
                  <InputData type="month" value={fCompAte} onChange={e=>{ if (!e.target.value) return; setFCompAte(e.target.value); }} style={{ ...S.inp, width: 140 }} />
                </div>
                {fCompAte > fComp && (
                  <span style={{ fontSize: 11, color: "#C9921B", background: "#FBF3E0", borderRadius: 4, padding: "3px 8px", marginBottom: 4, fontWeight: 600 }}>
                    {monthsInRange(fComp, fCompAte).length} meses
                  </span>
                )}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <OperationalButton data-arato-button="secondary" onClick={()=>abrirFolha()} style={S.btn("#1A4870")}>
                  {fCompAte > fComp ? `+ Gerar ${monthsInRange(fComp,fCompAte).length} Folhas` : "+ Nova Folha"}
                </OperationalButton>
              </div>
            </OperationalFilters>

            {/* Aviso de folhas fora do período filtrado */}
            {folhasForaPeriodo.length > 0 && (
              <div style={{ background: "#FEF3C7", border: "0.5px solid #F0C060", borderRadius: 8, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>
                  ⚠ {folhasForaPeriodo.length} folha{folhasForaPeriodo.length > 1 ? "s" : ""} fora do período filtrado:
                  {" "}{folhasForaPeriodo.map(f => nomeMes(f.competencia)).join(", ")}
                </span>
                <OperationalButton data-arato-button="secondary" onClick={() => {
                  const todas = folhas.map(f => f.competencia).sort();
                  if (todas.length) { setFComp(todas[0]); setFCompAte(todas[todas.length - 1]); }
                }} style={{ fontSize: 11, color: "#92400E", background: "#FDE68A", border: "0.5px solid #F0C060", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Ver todas
                </OperationalButton>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign:"center", padding:40, color:"#888" }}>Carregando...</div>
            ) : folhasFiltradas.length === 0 ? (
              <div data-arato-statistic="action" style={{ ...S.card, padding: 32, textAlign: "center", color: "#888" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div>Nenhuma folha para {fComp === fCompAte ? nomeMes(fComp) : `${nomeMes(fComp)} – ${nomeMes(fCompAte)}`}.</div>
                {folhasForaPeriodo.length > 0 && <div style={{ fontSize: 12, color: "#C9921B", marginTop: 4 }}>Ajuste o filtro acima para ver as folhas de outros meses.</div>}
                <OperationalButton data-arato-button="secondary" onClick={()=>abrirFolha()} style={{ ...S.btn("#1A4870"), marginTop: 12 }}>Criar Folha</OperationalButton>
              </div>
            ) : (
              <div style={S.card}>
                <OperationalGrid data-arato-grid="true" style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["Competência","Empregador","Funcionários","Bruto Total","Líquido Total","Encargos Patronais","Status",""].map(h=>(
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {folhasFiltradas.map(f => (
                      <tr key={f.id}>
                        <td style={S.td}><span style={{ fontWeight:700, color:"#0B2D50" }}>{nomeMes(f.competencia)}</span></td>
                        <td style={S.td}>
                          {f.empresa_nome
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#1A4870", background:"#D5E8F5", borderRadius:4, padding:"2px 8px" }}>{f.empresa_nome}</span>
                            : f.produtor_nome
                            ? <span style={{ fontSize:12, fontWeight:600, color:"#166534", background:"#DCFCE7", borderRadius:4, padding:"2px 8px" }}>{f.produtor_nome}</span>
                            : <span style={{ fontSize:11, color:"#888" }}>Sem vínculo</span>}
                        </td>
                        <td style={S.td}>{(f as any).num_funcionarios ?? "—"}</td>
                        <td style={{ ...S.td, fontWeight:700, color:"#0B2D50", fontVariantNumeric:"tabular-nums" }}>{moeda(f.valor_bruto)}</td>
                        <td style={{ ...S.td, fontWeight:700, color:"#16A34A", fontVariantNumeric:"tabular-nums" }}>{moeda(f.valor_liquido)}</td>
                        <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums" }}>{moeda(f.inss_patronal??0)}</td>
                        <td style={S.td}>
                          <span style={{ fontSize:11, fontWeight:700, color:ST_COLOR[f.status], background:ST_COLOR[f.status]+"18", borderRadius:4, padding:"2px 8px" }}>
                            {ST_LABEL[f.status]}
                          </span>
                        </td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                          <OperationalButton data-arato-button="secondary" onClick={()=>abrirFolha(f)} style={{ ...S.btn("#F4F6FA","#1A4870"), marginRight:6, fontSize:12 }}>Abrir</OperationalButton>
                          {f.status === "rascunho" && (
                            <OperationalButton data-arato-button="secondary" onClick={()=>fecharFolha(f)} style={{ ...S.btn("#C9921B"), fontSize:12 }} disabled={saving}>Fechar Folha</OperationalButton>
                          )}
                          <OperationalButton data-arato-button="secondary" onClick={()=>excluirFolha(f)} style={{ ...S.btn("#FEE2E2","#B91C1C"), border:"0.5px solid #F5B5B5", fontSize:12, marginLeft:6 }} disabled={saving}>Excluir</OperationalButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </OperationalGrid>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ ABA ADIANTAMENTOS ══════════════════ */}
        {aba === "adiantamentos" && (
          <>
            <div style={{ ...S.card, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize:13, color:"#555" }}>{adiantamentos.filter(a=>a.status==="pendente").length} adiantamentos pendentes</span>
              <div style={{ marginLeft:"auto" }}>
                <OperationalButton data-arato-button="secondary" onClick={()=>{ setAdiEdit({ data: hojeLocal(), competencia_ref: compAtual() }); setModalAdi(true); }} style={S.btn("#1A4870")}>
                  + Novo Adiantamento
                </OperationalButton>
              </div>
            </div>

            {adiantamentos.length === 0 ? (
              <div data-arato-statistic="display" style={{ ...S.card, padding: 32, textAlign:"center", color:"#888" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💵</div>
                <div>Nenhum adiantamento registrado.</div>
              </div>
            ) : (
              <div style={S.card}>
                <OperationalGrid data-arato-grid="true" style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["Funcionário","Data","Valor","Descontar em","Descrição","Status",""].map(h=>(
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adiantamentos.map(a => (
                      <tr key={a.id}>
                        <td style={{ ...S.td, fontWeight:600 }}>{a.funcionario_nome ?? "—"}{a.tipo === "gratificacao" && <div style={{ fontSize:10, fontWeight:600, color:"#7B4A00" }}>Gratificação</div>}{a.tipo === "devolucao" && <div style={{ fontSize:10, fontWeight:600, color:"#1A4870" }}>Desconto de devolução (reprocessamento)</div>}</td>
                        <td style={S.td}>{dataFmt(a.data)}</td>
                        <td style={{ ...S.td, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{moeda(a.valor)}</td>
                        <td style={S.td}>{a.competencia_ref ? nomeMes(a.competencia_ref) : "—"}</td>
                        <td style={{ ...S.td, color:"#888" }}>{a.descricao || "—"}</td>
                        <td style={S.td}>
                          <span style={{ fontSize:11, fontWeight:700, color:ADI_COLOR[a.status], background:ADI_COLOR[a.status]+"18", borderRadius:4, padding:"2px 8px" }}>
                            {ADI_LABEL[a.status]}
                          </span>
                        </td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                          {a.status === "pendente" && (<>
                            <OperationalButton data-arato-button="secondary" onClick={()=>{ setAdiEdit({ id: a.id, tipo: a.tipo ?? "salario", funcionario_id: a.funcionario_id, data: a.data, valor: a.valor, competencia_ref: a.competencia_ref, descricao: a.descricao }); setModalAdi(true); }} style={{ background:"none", border:"none", color:"#1A4870", cursor:"pointer", fontSize:12, marginRight:8 }}>Editar</OperationalButton>
                            <OperationalButton data-arato-button="secondary" onClick={()=>cancelarAdiantamento(a.id)} style={{ background:"none", border:"none", color:"#E24B4A", cursor:"pointer", fontSize:12 }}>Cancelar</OperationalButton>
                          </>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </OperationalGrid>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ ABA GRATIFICAÇÕES ══════════════════ */}
        {aba === "gratificacoes" && (
          <>
            {/* Extrato: gratificação lançada × adiantado sobre ela × saldo a pagar, por funcionário e competência */}
            {(() => {
              const comp7 = (v?: string | null) => String(v ?? "").slice(0, 7);
              const adisGrat = adiantamentos.filter(a => a.tipo === "gratificacao" && a.status !== "cancelado");
              const chaves = new Map<string, { funcionario_id: string; nome: string; comp: string }>();
              for (const p of premiacoes) chaves.set(`${p.funcionario_id}|${comp7(p.mes_referencia)}`, { funcionario_id: p.funcionario_id, nome: p.funcionario_nome ?? "—", comp: comp7(p.mes_referencia) });
              for (const a of adisGrat) if (a.competencia_ref) chaves.set(`${a.funcionario_id}|${comp7(a.competencia_ref)}`, { funcionario_id: a.funcionario_id, nome: a.funcionario_nome ?? chaves.get(`${a.funcionario_id}|${comp7(a.competencia_ref)}`)?.nome ?? "—", comp: comp7(a.competencia_ref) });
              const linhasExt = [...chaves.values()]
                .filter(k => !fGratFunc || k.funcionario_id === fGratFunc)
                .map(k => {
                  const lancada = premiacoes.filter(p => p.funcionario_id === k.funcionario_id && comp7(p.mes_referencia) === k.comp).reduce((t, p) => t + p.valor, 0);
                  const adis = adisGrat.filter(a => a.funcionario_id === k.funcionario_id && comp7(a.competencia_ref) === k.comp).sort((x, y) => x.data.localeCompare(y.data));
                  const adiantado = adis.reduce((t, a) => t + a.valor, 0);
                  return { ...k, lancada, adis, adiantado, saldo: Math.round((lancada - adiantado) * 100) / 100 };
                })
                .sort((x, y) => x.nome.localeCompare(y.nome) || y.comp.localeCompare(x.comp));
              const funcsComGrat = [...new Map([...chaves.values()].map(k => [k.funcionario_id, k.nome])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
              const tot = linhasExt.reduce((t, l) => ({ lancada: t.lancada + l.lancada, adiantado: t.adiantado + l.adiantado, saldo: t.saldo + l.saldo }), { lancada: 0, adiantado: 0, saldo: 0 });
              return (
                <div style={{ ...S.card, marginBottom: 14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", flexWrap:"wrap", borderBottom:"0.5px solid #DDE2EE" }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"#0B2D50" }}>Extrato de adiantamentos de gratificação</span>
                    <select value={fGratFunc} onChange={e => setFGratFunc(e.target.value)} style={{ ...S.inp, width: 260, marginLeft: "auto" }}>
                      <option value="">Todos os funcionários</option>
                      {funcsComGrat.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                    </select>
                  </div>
                  {linhasExt.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhuma gratificação ou adiantamento de gratificação.</div>
                  ) : (
                    <OperationalGrid data-arato-grid="true" style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead><tr>{["Funcionário", "Competência", "Data", "Movimento", "Gratificação", "Adiantado", "Saldo a pagar"].map(h => <th key={h} style={{ ...S.th, textAlign: ["Gratificação","Adiantado","Saldo a pagar"].includes(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {linhasExt.map(l => {
                          let corrente = l.lancada;
                          return [
                            <tr key={`${l.funcionario_id}|${l.comp}`} style={{ background:"#F8FAFD" }}>
                              <td style={{ ...S.td, fontWeight:700 }}>{l.nome}</td>
                              <td style={S.td}>{nomeMes(l.comp)}</td>
                              <td style={S.td}></td>
                              <td style={{ ...S.td, color:"#555" }}>Gratificação lançada</td>
                              <td style={{ ...S.td, textAlign:"right", fontWeight:700, color:"#C9921B", fontVariantNumeric:"tabular-nums" }}>{moeda(l.lancada)}</td>
                              <td style={S.td}></td>
                              <td style={{ ...S.td, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{moeda(l.lancada)}</td>
                            </tr>,
                            ...l.adis.map(a => {
                              corrente = Math.round((corrente - a.valor) * 100) / 100;
                              return (
                                <tr key={a.id}>
                                  <td style={S.td}></td>
                                  <td style={S.td}></td>
                                  <td style={S.td}>{dataFmt(a.data)}</td>
                                  <td style={{ ...S.td, color:"#555" }}>Adiantamento{a.descricao ? ` · ${a.descricao}` : ""}{a.status === "descontado" ? " · descontado na folha" : ""}</td>
                                  <td style={S.td}></td>
                                  <td style={{ ...S.td, textAlign:"right", color:"#B91C1C", fontVariantNumeric:"tabular-nums" }}>−{moeda(a.valor)}</td>
                                  <td style={{ ...S.td, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{moeda(corrente)}</td>
                                </tr>
                              );
                            }),
                            <tr key={`${l.funcionario_id}|${l.comp}|s`}>
                              <td style={S.td}></td><td style={S.td}></td><td style={S.td}></td>
                              <td style={{ ...S.td, fontWeight:700 }}>Saldo da competência</td>
                              <td style={S.td}></td>
                              <td style={{ ...S.td, textAlign:"right", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{l.adiantado ? `−${moeda(l.adiantado)}` : "—"}</td>
                              <td style={{ ...S.td, textAlign:"right", fontWeight:700, color: l.saldo < 0 ? "#B91C1C" : "#166534", fontVariantNumeric:"tabular-nums" }}>{moeda(l.saldo)}</td>
                            </tr>,
                          ];
                        })}
                        <tr>
                          <td style={{ ...S.td, fontWeight:700 }} colSpan={4}>Total</td>
                          <td style={{ ...S.td, textAlign:"right", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{moeda(tot.lancada)}</td>
                          <td style={{ ...S.td, textAlign:"right", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>−{moeda(tot.adiantado)}</td>
                          <td style={{ ...S.td, textAlign:"right", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{moeda(tot.saldo)}</td>
                        </tr>
                      </tbody>
                    </OperationalGrid>
                  )}
                </div>
              );
            })()}
            <div style={{ ...S.card, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize:13, color:"#555" }}>{premiacoes.length} gratificação(ões) registradas</span>
              <div style={{ marginLeft:"auto" }}>
                <OperationalButton data-arato-button="secondary" onClick={()=>{ setPremEdit({ mes_referencia: compAtual() }); setModalPrem(true); }} style={S.btn("#C9921B")}>
                  + Nova Gratificação
                </OperationalButton>
              </div>
            </div>

            {premiacoes.length === 0 ? (
              <div data-arato-statistic="display" style={{ ...S.card, padding: 32, textAlign:"center", color:"#888" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>⭐</div>
                <div>Nenhuma gratificação registrada.</div>
              </div>
            ) : (
              <div style={S.card}>
                <OperationalGrid data-arato-grid="true" style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["Funcionário","Mês Ref.","Descrição","Valor","Incluída na Folha",""].map(h=>(
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {premiacoes.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...S.td, fontWeight:600 }}>{p.funcionario_nome ?? "—"}</td>
                        <td style={S.td}>{nomeMes(p.mes_referencia)}</td>
                        <td style={S.td}>{p.descricao}</td>
                        <td style={{ ...S.td, fontWeight:700, color:"#C9921B", fontVariantNumeric:"tabular-nums" }}>{moeda(p.valor)}</td>
                        <td style={S.td}>
                          {p.lancado_financeiro
                            ? <span style={{ fontSize:11, color:"#16A34A", fontWeight:700 }}>✓ Sim</span>
                            : <span style={{ fontSize:11, color:"#888" }}>Pendente</span>}
                        </td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                          {!p.lancado_financeiro && (<>
                            <OperationalButton data-arato-button="secondary" onClick={()=>{ setPremEdit({ id: p.id, funcionario_id: p.funcionario_id, mes_referencia: p.mes_referencia, descricao: p.descricao, valor: p.valor }); setModalPrem(true); }} style={{ background:"none", border:"none", color:"#1A4870", cursor:"pointer", fontSize:12, marginRight:8 }}>Editar</OperationalButton>
                            <OperationalButton data-arato-button="secondary" onClick={()=>excluirPremiacao(p.id)} style={{ background:"none", border:"none", color:"#E24B4A", cursor:"pointer", fontSize:12 }}>Excluir</OperationalButton>
                          </>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </OperationalGrid>
              </div>
            )}
          </>
        )}

      </div>

      {/* ══════════════ MODAL FOLHA ══════════════ */}
      {modalFolha && (
        <div style={S.overlay} onClick={()=>setModalFolha(false)}>
          <div style={{ ...S.modal, width: "min(99vw,1600px)", padding: "20px 20px 28px" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h2 data-arato-h2="true" style={{ margin:0, fontSize:17, color:"#0B2D50" }}>
                {folhaEdit.id
                  ? `Folha — ${nomeMes(folhaEdit.competencia ?? "")}${folhaEdit.empresa_id ? ` · ${empresasMap[folhaEdit.empresa_id] ?? ""}` : folhaEdit.produtor_id ? ` · ${produtoresMap[folhaEdit.produtor_id] ?? ""}` : " · Sem vínculo"}`
                  : fCompAte > fComp
                    ? `Gerar Folhas — ${nomeMes(fComp)} → ${nomeMes(fCompAte)}`
                    : `Folha — ${nomeMes(fComp)}`
                }
                {folhaEdit.status && <span style={{ marginLeft:10, fontSize:12, fontWeight:700, color:ST_COLOR[folhaEdit.status], background:ST_COLOR[folhaEdit.status]+"18", borderRadius:4, padding:"2px 8px" }}>{ST_LABEL[folhaEdit.status]}</span>}
                {!folhaEdit.id && fCompAte > fComp && (
                  <span style={{ marginLeft:8, fontSize:11, fontWeight:700, color:"#C9921B", background:"#FBF3E0", borderRadius:4, padding:"2px 8px" }}>
                    {monthsInRange(fComp, fCompAte).length} meses
                  </span>
                )}
              </h2>
              <OperationalButton data-arato-button="icon" onClick={()=>setModalFolha(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</OperationalButton>
            </div>

            {folhaEdit.status === "fechado" && (
              <div style={{ background:"#FBF3E0", border:"0.5px solid #C9921B", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#7A4300" }}>
                {podeReprocessar
                  ? <>Folha fechada: salários já pagos no Contas a Pagar ficam travados (em cinza). Nos salários em aberto, ajuste gratificação e outros descontos e clique em <strong>⟳ Reprocessar Folha</strong>: o Contas a Pagar é atualizado só onde o valor mudou.</>
                  : <>🔒 Folha fechada: seu grupo de usuário não tem a rotina Reprocessar Folha (Configurações → Usuários e Permissões). Peça a quem tem a permissão, ou reabra a folha.</>}
              </div>
            )}
            {/* Folha fechada sem a permissão de reprocessar: todos os campos ficam travados */}
            <fieldset disabled={folhaEdit.status === "fechado" && !podeReprocessar} style={{ border:"none", padding:0, margin:0, minWidth:0 }}>
            {/* Competência — editável para nova folha (retroativa), somente leitura para existente) */}
            <div data-arato-panel="true" style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14, padding:"10px 14px", background:"#F8FAFD", borderRadius:8, border:"0.5px solid #DDE2EE" }}>
              {folhaEdit.id ? (
                <>
                  <div>
                    <div style={{ ...S.label, marginBottom:2 }}>Competência</div>
                    <span style={{ fontSize:14, fontWeight:700, color:"#0B2D50" }}>{nomeMes(folhaEdit.competencia ?? "")}</span>
                  </div>
                  {folhaEdit.empresa_id && (
                    <div>
                      <div style={{ ...S.label, marginBottom:2 }}>Empregador</div>
                      <span style={{ fontSize:13, color:"#555" }}>{empresasMap[folhaEdit.empresa_id] ?? "—"}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <div style={{ ...S.label, marginBottom:2 }}>Competência — de</div>
                    <InputData type="month" value={modalCompDe} onChange={e => { setModalCompDe(e.target.value); if (e.target.value > modalCompAte) setModalCompAte(e.target.value); }} style={{ ...S.inp, fontSize:13 }} />
                  </div>
                  <div>
                    <div style={{ ...S.label, marginBottom:2 }}>Até</div>
                    <InputData type="month" value={modalCompAte} min={modalCompDe} onChange={e => setModalCompAte(e.target.value)} style={{ ...S.inp, fontSize:13 }} />
                  </div>
                  {modalCompAte > modalCompDe && (
                    <span style={{ fontSize:11, fontWeight:700, color:"#C9921B", background:"#FBF3E0", borderRadius:4, padding:"3px 10px", marginTop:16 }}>
                      {monthsInRange(modalCompDe, modalCompAte).length} meses
                    </span>
                  )}
                </>
              )}
              <div title="Data em que o salário será pago: vira o vencimento do CP de cada funcionário ao fechar a folha">
                <div style={{ ...S.label, marginBottom:2 }}>Data de pagamento (vencimento)</div>
                <InputData type="date" value={dataPgto} disabled={folhaEdit.status === "fechado"}
                  onChange={e => { dataPgtoManual.current = true; setDataPgto(e.target.value); }} style={{ ...S.inp, fontSize:13 }} />
              </div>
              {folhaEdit.status && <span style={{ fontSize:11, fontWeight:700, color:ST_COLOR[folhaEdit.status], background:ST_COLOR[folhaEdit.status]+"18", borderRadius:4, padding:"3px 10px", marginTop: folhaEdit.id ? 0 : 16 }}>{ST_LABEL[folhaEdit.status]}</span>}
            </div>

            {/* Sub-abas */}
            <div data-arato-tabs="true" style={{ display:"flex", gap:0, borderBottom:"0.5px solid #DDE2EE", marginBottom:16 }}>
              {([["funcionarios","Funcionários"],["resumo","Resumo"]] as const).map(([k,l])=>(
                <OperationalButton data-arato-tab-active={abaModal === (k)} data-arato-tab="true" data-arato-button="toggle" key={k} onClick={()=>setAbaModal(k)}
                  style={{ padding:"8px 18px", background:"none", border:"none", borderBottom:abaModal===k?"2px solid #1A4870":"2px solid transparent", fontWeight:abaModal===k?700:400, color:abaModal===k?"#1A4870":"#666", cursor:"pointer", fontSize:13 }}>
                  {l}
                </OperationalButton>
              ))}
            </div>

            {/* Sub-aba: Funcionários */}
            {abaModal === "funcionarios" && (
              <div>
                {/* Salários desta folha no Contas a Pagar: pago × em aberto */}
                {Object.keys(situacaoCp).length > 0 && (() => {
                  const vals = Object.values(situacaoCp).filter(v => !v.previsao);
                  const pago = vals.reduce((t, v) => t + v.pago, 0);
                  const aberto = vals.reduce((t, v) => t + Math.max(0, v.valor - v.pago), 0);
                  const qPagos = vals.filter(v => v.valor - v.pago <= 0.005).length;
                  return (
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:10, padding:"8px 12px", background:"#F4F6FA", borderRadius:8, fontSize:12, color:"#555" }}>
                      <span><strong>Salários no Contas a Pagar:</strong> {qPagos} de {vals.length} pagos</span>
                      <span>Pago <strong style={{ color:"#166534" }}>{moeda(pago)}</strong></span>
                      <span>Aberto <strong style={{ color: aberto > 0.005 ? "#B91C1C" : "#555" }}>{moeda(aberto)}</strong></span>
                    </div>
                  );
                })()}
                {/* Contador de seleção */}
                {(folhaEdit.funcionarios ?? []).length > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, fontSize:12, color:"#555" }}>
                    <label data-arato-label="true" style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontWeight:600 }}>
                      <input type="checkbox"
                        checked={selecionados.size === (folhaEdit.funcionarios ?? []).length && selecionados.size > 0}
                        ref={el => { if (el) el.indeterminate = selecionados.size > 0 && selecionados.size < (folhaEdit.funcionarios ?? []).length; }}
                        onChange={() => {
                          const total = (folhaEdit.funcionarios ?? []).length;
                          setSelecionados(selecionados.size === total ? new Set() : new Set(Array.from({length: total}, (_, i) => i)));
                        }}
                      />
                      Selecionar todos
                    </label>
                    <span style={{ color:"#1A4870", fontWeight:700 }}>
                      {selecionados.size} de {(folhaEdit.funcionarios ?? []).length} selecionados
                    </span>
                  </div>
                )}
                {(folhaEdit.funcionarios ?? []).length === 0 ? (
                  <div style={{ textAlign:"center", padding:24, color:"#888" }}>Nenhum funcionário. Adicione manualmente abaixo.</div>
                ) : (
                  <div data-arato-grid-container="true" style={{ overflowX:"auto" }}>
                    <OperationalGrid data-arato-grid="true" style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead>
                        <tr>
                          {["☑","","Empregador","Funcionário","Salário Base","Gratificação","Horas Extras","Bruto","INSS","IRRF","Complemento","Outros Desc.","Benefícios","Sal. Líquido","Pgto. / CP"].map(h=>(
                            <th key={h} style={{ ...S.th, padding: "6px 8px", fontSize: 10 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(folhaEdit.funcionarios ?? []).map((f, idx) => {
                          const liq = liquido(f);
                          const expanded = funcExpand.has(idx);
                          const sel = selecionados.has(idx);
                          const isFechado = folhaEdit.status === "fechado";
                          // Folha fechada: salário já pago (ou em borderô/conciliado) fica travado; em aberto continua editável e o
                          // Reprocessar Folha atualiza o Contas a Pagar
                          const travado = isFechado && !!f.cp_lancamento_id && !!situacaoCp[f.cp_lancamento_id]?.travado;
                          const editavel = !isFechado || !travado;
                          return (
                            <>
                              <tr key={idx} title={travado ? "Salário já pago no Contas a Pagar — não pode ser alterado" : undefined}
                                style={{ background: travado ? "#F1F2F4" : !sel ? "#F9F9F9" : idx%2===0?"#fff":"#FAFBFD", opacity: sel ? (travado ? 0.7 : 1) : 0.45, color: travado ? "#888" : undefined }}>
                                <td style={{ ...S.td, width:24, padding:"4px 6px" }}>
                                  <input type="checkbox" checked={sel} disabled={travado} onChange={() => setSelecionados(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; })} style={{ cursor: travado ? "not-allowed" : "pointer" }} />
                                </td>
                                <td style={{ ...S.td, width:24, padding:"4px 4px" }}>
                                  <OperationalButton data-arato-button="secondary" onClick={()=>toggleExpand(idx)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#1A4870", padding:"0 2px" }}>{expanded?"▾":"▸"}</OperationalButton>
                                </td>
                                <td style={{ ...S.td, minWidth:110, padding:"4px 8px" }}>
                                  {f.empresa_id
                                    ? <span style={{ fontSize:11, fontWeight:600, color:"#1A4870", background:"#D5E8F5", borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap" }}>{empresasMap[f.empresa_id] ?? "Empresa"}</span>
                                    : f.produtor_id
                                      ? <span style={{ fontSize:11, fontWeight:600, color:"#16A34A", background:"#DCFCE7", borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap" }}>{produtoresMap[f.produtor_id] ?? "Produtor"}</span>
                                      : <span style={{ fontSize:11, color:"#aaa" }}>Sem vínculo</span>}
                                </td>
                                <td style={{ ...S.td, fontWeight:600, minWidth:140, padding:"4px 8px" }}>{f.nome_funcionario}</td>
                                <td style={{ ...S.td, fontVariantNumeric:"tabular-nums", color:"#555", textAlign:"right", padding:"4px 8px", whiteSpace:"nowrap" }}>
                                  {moeda(f.salario_base)}
                                </td>
                                <td style={{ ...S.td, padding:"4px 6px" }}>
                                  <input type="number" value={f.gratificacao} disabled={!editavel} onChange={e=>setFuncField(idx,"gratificacao",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:80, textAlign:"right", borderColor: f.gratificacao > 0 ? "#C9921B" : "#DDE2EE", fontSize:12, ...(!editavel ? { background:"#F1F2F4", color:"#888" } : {}) }} />
                                </td>
                                {/* ── Horas extras: horas 50% e 100%; valor (salário ÷ 220 h) + DSR entram no bruto ── */}
                                <td style={{ ...S.td, padding:"4px 6px", whiteSpace:"nowrap" }}>
                                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                                    <input type="number" min="0" step="0.5" value={f.he_50_horas || ""} placeholder="50%" disabled={!editavel} title="Horas extras 50% no mês"
                                      onChange={e=>setFuncField(idx,"he_50_horas",Math.max(0, parseFloat(e.target.value)||0))}
                                      style={{ ...S.inp, width:52, textAlign:"right", fontSize:12, borderColor: (f.he_50_horas ?? 0) > 0 ? "#C9921B" : "#DDE2EE", ...(!editavel ? { background:"#F1F2F4", color:"#888" } : {}) }} />
                                    <input type="number" min="0" step="0.5" value={f.he_100_horas || ""} placeholder="100%" disabled={!editavel} title="Horas extras 100% (domingos e feriados) no mês"
                                      onChange={e=>setFuncField(idx,"he_100_horas",Math.max(0, parseFloat(e.target.value)||0))}
                                      style={{ ...S.inp, width:52, textAlign:"right", fontSize:12, borderColor: (f.he_100_horas ?? 0) > 0 ? "#C9921B" : "#DDE2EE", ...(!editavel ? { background:"#F1F2F4", color:"#888" } : {}) }} />
                                  </div>
                                  {((f.he_valor ?? 0) + (f.he_dsr ?? 0)) > 0 && (
                                    <div style={{ fontSize:10, color:"#555", marginTop:2 }} title="Valor da hora = salário base ÷ 220 h · DSR = horas extras ÷ dias úteis × domingos e feriados">
                                      {moeda(f.he_valor ?? 0)} + DSR {moeda(f.he_dsr ?? 0)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...S.td, fontWeight:700, fontVariantNumeric:"tabular-nums", padding:"4px 8px", whiteSpace:"nowrap" }}>{moeda(f.salario_bruto)}</td>
                                <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums", padding:"4px 8px", whiteSpace:"nowrap" }}>{moeda(f.inss_trabalhador)}</td>
                                <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums", padding:"4px 8px", whiteSpace:"nowrap" }}>{moeda(f.irrf)}</td>
                                <td style={{ ...S.td, fontVariantNumeric:"tabular-nums", padding:"4px 8px", whiteSpace:"nowrap", color: (f.complemento_salarial ?? 0) > 0 ? "#1A4870" : "#888", fontWeight: (f.complemento_salarial ?? 0) > 0 ? 600 : 400 }}>{moeda(f.complemento_salarial ?? 0)}</td>
                                {/* ── Outros Descontos — com justificativa inline ── */}
                                <td style={{ ...S.td, padding:"4px 6px" }}>
                                  {!editavel ? (
                                    <div>
                                      <span style={{ fontVariantNumeric:"tabular-nums", color:"#555" }}>{moeda(f.outros_descontos)}</span>
                                      {f.desc_outros_descontos && <div style={{ fontSize:9, color:"#888", marginTop:1 }}>{f.desc_outros_descontos}</div>}
                                    </div>
                                  ) : (
                                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                                      <input type="number" value={f.outros_descontos} onChange={e=>setFuncField(idx,"outros_descontos",parseFloat(e.target.value)||0)}
                                        style={{ ...S.inp, width:80, textAlign:"right" }} />
                                      <input type="text" value={f.desc_outros_descontos} onChange={e=>setFuncField(idx,"desc_outros_descontos",e.target.value)}
                                        placeholder={f.outros_descontos > 0 ? "Observação do desconto" : "Observação"} title="Observação do desconto — vai para o título do salário no Contas a Pagar"
                                        style={{ ...S.inp, width:150, fontSize:11, padding:"2px 5px", ...(f.outros_descontos > 0 && !f.desc_outros_descontos.trim() ? { borderColor:"#C9921B", background:"#FBF3E0" } : {}) }} />
                                    </div>
                                  )}
                                </td>
                                {/* ── Benefícios — vem do cadastro do funcionário ── */}
                                <td style={{ ...S.td, padding:"4px 8px" }}>
                                  <div style={{ fontVariantNumeric:"tabular-nums", color:"#16A34A", fontWeight:600, whiteSpace:"nowrap" }}>
                                    {moeda(f.vale_transporte + f.vale_refeicao + f.outros_beneficios)}
                                  </div>
                                  {!isFechado && (
                                    <div style={{ fontSize:9, color:"#888", marginTop:1 }}>do cadastro</div>
                                  )}
                                </td>
                                <td style={{ ...S.td, fontWeight:700, color: liq >= 0 ? "#16A34A" : "#E24B4A", fontVariantNumeric:"tabular-nums", padding:"4px 8px", whiteSpace:"nowrap" }}>{moeda(liq)}{f.adiantamento > 0 && <div style={{ fontSize:9, fontWeight:400, color:"#C9921B" }}>já desconta adiant. {moeda(f.adiantamento)}</div>}</td>
                                {/* Data prevista do pagamento: folha fechada = vencimento real do CP; rascunho = dia 05 da competência (padrão do fechamento) */}
                                <td style={{ ...S.td, padding:"4px 8px", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums", color:"var(--text-2)" }}>
                                  {dataFmt((f.cp_lancamento_id && vencCp[f.cp_lancamento_id]) || (folhaEdit.competencia ? (dataPgto || vencimentoSalario(folhaEdit.competencia)) : undefined))}
                                  {(() => {
                                    const sc = f.cp_lancamento_id ? situacaoCp[f.cp_lancamento_id] : undefined;
                                    if (!sc) return null;
                                    const aberto = Math.max(0, Math.round((sc.valor - sc.pago) * 100) / 100);
                                    const [txt, cor, bg] = sc.previsao ? ["Previsão", "#555", "#EEF0F4"]
                                      : aberto <= 0.005 ? [`Pago${sc.ultimaBaixa ? ` ${dataFmt(sc.ultimaBaixa)}` : ""}`, "#166534", "#DCFCE7"]
                                      : sc.pago > 0 ? [`Parcial · falta ${moeda(aberto)}`, "#7A5200", "#FBF3E0"]
                                      : ["Aberto no CP", "#B91C1C", "#FEF2F2"];
                                    return <div style={{ marginTop: 2 }}><span style={{ fontSize: 10, fontWeight: 700, color: cor, background: bg, padding: "1px 6px", borderRadius: 6 }}>{txt}</span></div>;
                                  })()}
                                </td>
                              </tr>
                              {expanded && (
                                <tr key={`${idx}-detail`} style={{ background:"#F8FAFD" }}>
                                  <td colSpan={15} style={{ padding:"12px 16px 16px 44px" }}>
                                    <div data-arato-fields="true" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"10px 20px", fontSize:12 }}>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>Vale Transporte <span style={{ color:"#888", fontWeight:400 }}>(do cadastro)</span></label>
                                        <span style={{ fontSize:13, color:"#16A34A", fontWeight:600 }}>{moeda(f.vale_transporte)}</span>
                                      </div>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>Vale Refeição <span style={{ color:"#888", fontWeight:400 }}>(do cadastro)</span></label>
                                        <span style={{ fontSize:13, color:"#16A34A", fontWeight:600 }}>{moeda(f.vale_refeicao)}</span>
                                      </div>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>Outros Benefícios <span style={{ color:"#888", fontWeight:400 }}>(do cadastro)</span></label>
                                        <span style={{ fontSize:13, color:"#16A34A", fontWeight:600 }}>{moeda(f.outros_beneficios)}</span>
                                      </div>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>Observação dos outros descontos</label>
                                        {!editavel
                                          ? <span style={{ fontSize:13, color:"#555" }}>{f.desc_outros_descontos || "—"}</span>
                                          : <input type="text" value={f.desc_outros_descontos} onChange={e=>setFuncField(idx,"desc_outros_descontos",e.target.value)} style={{ ...S.inp, width:"100%" }} placeholder="Ex.: farmácia, dias não trabalhados, empréstimo..." />
                                        }
                                      </div>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>INSS Patronal</label>
                                        <span style={{ fontSize:13, color:"#888" }}>{moeda(f.inss_patronal)}</span>
                                      </div>
                                      <div>
                                        <label data-arato-label="true" style={S.label}>FGTS</label>
                                        <span style={{ fontSize:13, color:"#888" }}>{moeda(f.fgts)}</span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </OperationalGrid>
                  </div>
                )}
              </div>
            )}

            {/* Sub-aba: Resumo */}
            {abaModal === "resumo" && (
              <div data-arato-fields="true" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div style={{ border:"0.5px solid #DDE2EE", borderRadius:8, padding:16 }}>
                  <div style={{ fontSize:12, color:"#888", marginBottom:12, fontWeight:700 }}>CUSTO DO TRABALHADOR</div>
                  {[
                    ["Total Bruto", moeda(totalBrutoFolhaEdit), "#0B2D50"],
                    ["(−) INSS Trabalhador", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.inss_trabalhador,0)??0), "#888"],
                    ["(−) IRRF", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.irrf,0)??0), "#888"],
                    ["(−) Adiantamentos", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.adiantamento,0)??0), "#EF9F27"],
                    ["(−) Outros Descontos", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.outros_descontos,0)??0), "#888"],
                    ["(+) Benefícios", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.vale_transporte+f.vale_refeicao+f.outros_beneficios,0)??0), "#16A34A"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #F0F2F7", fontSize:13 }}>
                      <span style={{ color:"#555" }}>{l}</span>
                      <span style={{ fontWeight:600, color:c, fontVariantNumeric:"tabular-nums" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 0", fontSize:14, fontWeight:700 }}>
                    <span>Líquido a Pagar</span>
                    <span style={{ color:"#16A34A", fontVariantNumeric:"tabular-nums" }}>{moeda(totalLiqFolhaEdit)}</span>
                  </div>
                </div>
                <div style={{ border:"0.5px solid #DDE2EE", borderRadius:8, padding:16 }}>
                  <div style={{ fontSize:12, color:"#888", marginBottom:12, fontWeight:700 }}>ENCARGOS PATRONAIS</div>
                  {[
                    ["INSS Patronal (28%)", moeda(totalINSSPatFolhaEdit), "#0B2D50"],
                    ["FGTS (8%)", moeda(folhaEdit.funcionarios?.reduce((s,f)=>s+f.fgts,0)??0), "#0B2D50"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #F0F2F7", fontSize:13 }}>
                      <span style={{ color:"#555" }}>{l}</span>
                      <span style={{ fontWeight:600, color:c, fontVariantNumeric:"tabular-nums" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 0", fontSize:14, fontWeight:700 }}>
                    <span>Custo Total Empresa</span>
                    <span style={{ color:"#E24B4A", fontVariantNumeric:"tabular-nums" }}>{moeda(totalBrutoFolhaEdit + totalINSSPatFolhaEdit)}</span>
                  </div>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label data-arato-label="true" style={S.label}>Observações da Folha</label>
                  <textarea rows={3} value={folhaEdit.obs??""} onChange={e=>setFolhaEdit(p=>({...p,obs:e.target.value}))}
                    style={{ ...S.inp, width:"100%", resize:"vertical" }} />
                </div>
              </div>
            )}

            </fieldset>

            {repPlano && (
              <div style={S.overlay} onClick={() => !saving && setRepPlano(null)}>
                <div style={{ ...S.modal, width: "min(96vw,900px)" }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#0B2D50" }}>Reprocessar folha de {nomeMes(folhaEdit.competencia ?? "")}</h3>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>
                    Confira o que vai mudar no Contas a Pagar. Títulos com valor igual não são mexidos.{repAdiNovos > 0 ? ` ${repAdiNovos} adiantamento(s) lançado(s) depois do fechamento serão descontados.` : ""}
                  </div>
                  {(() => {
                    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    const muda = repPlano.filter(p => p.tipo !== "sem_mudanca");
                    const ROT: Record<string, { t: string; c: string; bg: string }> = {
                      atualizar: { t: "Atualiza o título", c: "#0B2D50", bg: "#D5E8F5" },
                      criar: { t: "Cria título", c: "#166534", bg: "#DCFCE7" },
                      cancelar: { t: "Cancela título (em aberto)", c: "#6B21A8", bg: "#F3E8FF" },
                      pendencia_pago_maior: { t: "Título já pago — não muda", c: "#9A3412", bg: "#FFEDD5" },
                      desconto: { t: "Recebeu a mais — desconto", c: "#7A4300", bg: "#FBF3E0" },
                    };
                    if (!muda.length) return <div style={{ padding: 16, background: "#F4F6FA", borderRadius: 8, fontSize: 13 }}>Nada muda no Contas a Pagar: os valores recalculados são iguais aos títulos atuais.</div>;
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr>{["Funcionário / título", "O que acontece", "Antes", "Depois", ""].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i >= 2 && i <= 3 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {muda.map((p, i) => (
                            <tr key={i}>
                              <td style={S.td}>{p.nome}</td>
                              <td style={S.td}><span style={{ fontSize: 11, fontWeight: 700, color: ROT[p.tipo].c, background: ROT[p.tipo].bg, borderRadius: 4, padding: "2px 7px" }}>{ROT[p.tipo].t}</span>
                                {p.tipo === "pendencia_pago_maior" && <div style={{ fontSize: 11, color: "#9A3412", marginTop: 3 }}>Falta pagar {fmt(p.diferenca ?? 0)}: reabra (estorne) o título no Contas a Pagar e reprocesse.</div>}
                              </td>
                              <td style={{ ...S.td, textAlign: "right" }}>{fmt(p.antes)}</td>
                              <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{fmt(p.depois)}</td>
                              <td style={S.td}>
                                {p.tipo === "desconto" && p.funcionario_id && repDesc[String(p.funcionario_id)] && (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#555" }}>Descontar</span>
                                    <input value={repDesc[String(p.funcionario_id)].valor} onChange={e => setRepDesc(d => ({ ...d, [String(p.funcionario_id)]: { ...d[String(p.funcionario_id)], valor: e.target.value } }))}
                                      style={{ ...S.inp, width: 100, textAlign: "right" }} />
                                    <span style={{ fontSize: 11, color: "#555" }}>na folha de</span>
                                    <InputData type="month" value={repDesc[String(p.funcionario_id)].competencia} onChange={e => setRepDesc(d => ({ ...d, [String(p.funcionario_id)]: { ...d[String(p.funcionario_id)], competencia: e.target.value } }))}
                                      style={{ ...S.inp, width: 140 }} />
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                  {repErro && <div style={{ background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginTop: 12 }}>{repErro}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <OperationalButton data-arato-button="secondary" onClick={() => setRepPlano(null)} style={S.btn("#F4F6FA", "#555")} disabled={saving}>Voltar</OperationalButton>
                    <OperationalButton data-arato-button="primary" onClick={() => reprocessarFolha(false)} style={S.btn("#1A4870")} disabled={saving}>{saving ? "Reprocessando..." : "Confirmar reprocessamento"}</OperationalButton>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <div style={{ display:"flex", gap:8 }}>
                {folhaEdit.id && folhaEdit.status === "fechado" && (
                  <OperationalButton data-arato-button="secondary" onClick={reabrirFolha} title="Volta a folha inteira para rascunho: apaga os títulos reais e relança como previsão. Use só para refazer do zero."
                    style={{ ...S.btn("#F4F6FA","#555"), border:"0.5px solid #DDE2EE", fontSize:12 }} disabled={saving}>
                    {saving ? "Abrindo..." : "↩ Reabrir (refazer do zero)"}
                  </OperationalButton>
                )}
                {folhaEdit.id && (
                  <OperationalButton data-arato-button="secondary" onClick={()=>{ setRepFolha(folhaEdit as Folha); setRepNMeses(1); setModalFolha(false); setModalRep(true); }} style={{ ...S.btn("#F4F6FA","#555"), border:"0.5px solid #DDE2EE" }}>
                    ↻ Replicar Folha
                  </OperationalButton>
                )}
                {folhaEdit.id && (
                  <OperationalButton data-arato-button="secondary" onClick={() => excluirFolha()} style={{ ...S.btn("#FEE2E2","#B91C1C"), border:"0.5px solid #F5B5B5" }} disabled={saving}>
                    🗑 Excluir Folha
                  </OperationalButton>
                )}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <OperationalButton data-arato-button="secondary" onClick={()=>setModalFolha(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</OperationalButton>
                {folhaEdit.status !== "fechado" && (
                  <OperationalButton data-arato-button="secondary" onClick={salvarFolha} style={S.btn("#1A4870")} disabled={saving}>{saving ? "Salvando..." : "Salvar Folha"}</OperationalButton>
                )}
                {folhaEdit.id && folhaEdit.status === "fechado" && podeReprocessar && (
                  <OperationalButton data-arato-button="primary" onClick={() => reprocessarFolha(true)} style={S.btn("#1A4870")} disabled={saving}>{saving ? "Calculando..." : "⟳ Reprocessar Folha"}</OperationalButton>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL REPLICAR ══════════════ */}
      {modalRep && repFolha && (
        <div style={S.overlay} onClick={()=>setModalRep(false)}>
          <div style={{ ...S.modal, width:"min(96vw,440px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 data-arato-h2="true" style={{ margin:0, fontSize:16, color:"#0B2D50" }}>Replicar Folha</h2>
              <OperationalButton data-arato-button="icon" onClick={()=>setModalRep(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</OperationalButton>
            </div>
            <p style={{ fontSize:13, color:"#555", marginTop:-8, marginBottom:16 }}>
              Copia a estrutura da folha de <strong>{nomeMes(repFolha.competencia)}</strong>{repFolha.empresa_id ? ` (${empresasMap[repFolha.empresa_id] ?? "empresa"})` : ""} para as próximas competências como rascunho. Adiantamentos zerados.
            </p>
            <div style={{ marginBottom:20 }}>
              <label data-arato-label="true" style={S.label}>Replicar para as próximas</label>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <input type="number" min={1} max={12} value={repNMeses} onChange={e=>setRepNMeses(Math.min(12,Math.max(1,parseInt(e.target.value)||1)))} style={{ ...S.inp, width:80, textAlign:"center", fontSize:16, fontWeight:700 }} />
                <span style={{ fontSize:13, color:"#555" }}>competência{repNMeses>1?"s":""}</span>
              </div>
            </div>
            {repNMeses > 0 && (() => {
              const [ano, mes] = repFolha.competencia.split("-").map(Number);
              const meses = Array.from({ length: repNMeses }, (_, i) => {
                const dt = new Date(ano, mes - 1 + i + 1, 1);
                return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
              });
              return (
                <div style={{ background:"#F0F7FF", borderRadius:8, padding:"10px 14px", marginBottom:20, border:"0.5px solid #C5DCF5" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#1A4870", marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Competências que serão criadas</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {meses.map(m => <span key={m} style={{ fontSize:12, fontWeight:600, background:"#1A4870", color:"#fff", borderRadius:4, padding:"3px 10px" }}>{nomeMes(m)}</span>)}
                  </div>
                </div>
              );
            })()}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <OperationalButton data-arato-button="secondary" onClick={()=>setModalRep(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="secondary" onClick={replicarFolha} style={S.btn("#1A4870")} disabled={saving}>{saving?"Replicando...":"Replicar"}</OperationalButton>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL ADIANTAMENTO ══════════════ */}
      {modalAdi && (
        <div style={S.overlay} onClick={()=>setModalAdi(false)}>
          <div style={{ ...S.modal, width: "min(96vw,480px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 data-arato-h2="true" style={{ margin:0, fontSize:16, color:"#0B2D50" }}>{adiEdit.id ? "Editar Adiantamento" : "Novo Adiantamento Salarial"}</h2>
              <OperationalButton data-arato-button="icon" onClick={()=>setModalAdi(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</OperationalButton>
            </div>
            <p style={{ fontSize:12, color:"#888", marginTop:-12, marginBottom:16 }}>O CP é gerado na hora, já baixado na conta escolhida.</p>

            <div data-arato-fields="true" style={{ display:"grid", gap:14 }}>
              <div>
                <label data-arato-label="true" style={S.label}>Funcionário *</label>
                <SelectField value={adiEdit.funcionario_id??""} onChange={e=>setAdiEdit(p=>({...p,funcionario_id:e.target.value}))} style={{ ...S.inp, width:"100%" }}>
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
                </SelectField>
              </div>
              <div data-arato-fields="true" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label data-arato-label="true" style={S.label}>Data *</label>
                  <InputData type="date" value={adiEdit.data??""} onChange={e=>setAdiEdit(p=>({...p,data:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                </div>
                <div>
                  <label data-arato-label="true" style={S.label}>Valor (R$) *</label>
                  <input type="number" value={adiEdit.valor??""} onChange={e=>setAdiEdit(p=>({...p,valor:parseFloat(e.target.value)||0}))} style={{ ...S.inp, width:"100%" }} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label data-arato-label="true" style={S.label}>{adiEdit.tipo === "gratificacao" ? "Competência da gratificação *" : "Descontar na competência"}</label>
                <InputData type="month" value={adiEdit.competencia_ref??""} onChange={e=>setAdiEdit(p=>({...p,competencia_ref:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                <span style={{ fontSize:11, color:"#888" }}>{adiEdit.tipo === "gratificacao" ? "Mês da gratificação adiantada; o valor é descontado na folha desse mês" : "Mês onde o valor será descontado do salário"}</span>
                {adiEdit.tipo === "gratificacao" && adiEdit.funcionario_id && adiEdit.competencia_ref && (
                  <div style={{ marginTop:6, fontSize:11, color: adiGratInfo.lancada > 0 ? "#0B2D50" : "#791F1F" }}>
                    {adiGratInfo.lancada > 0
                      ? `Gratificação lançada: ${moeda(adiGratInfo.lancada)} · já adiantado: ${moeda(adiGratInfo.adiantado)} · disponível: ${moeda(adiGratInfo.disponivel)}`
                      : "Nenhuma gratificação lançada para este funcionário nessa competência (Cadastros, Funcionários, aba Premiações)."}
                    {(adiEdit.valor ?? 0) > adiGratInfo.disponivel + 0.005 && adiGratInfo.lancada > 0 && <div style={{ color:"#791F1F" }}>Excede o disponível: lance o excedente manualmente como empréstimo a terceiros.</div>}
                  </div>
                )}
              </div>
              <div>
                <label style={S.label}>Tipo de adiantamento</label>
                <select value={adiEdit.tipo ?? "salario"} onChange={e=>setAdiEdit(p=>({...p,tipo:e.target.value as "salario"|"gratificacao"}))} style={{ ...S.inp, width:"100%" }}>
                  <option value="salario">Salário</option>
                  <option value="gratificacao">Gratificação (de uma competência lançada)</option>
                </select>
              </div>
              {!adiEdit.id && (
                <div>
                  <label data-arato-label="true" style={S.label}>Conta bancária (de onde saiu o dinheiro) *</label>
                  <SelectField value={adiConta} onChange={e=>setAdiConta(e.target.value)} style={{ ...S.inp, width:"100%" }}>
                    <option value="">{adiEdit.funcionario_id ? "Selecionar..." : "Escolha o funcionário primeiro"}</option>
                    {contasAdi.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </SelectField>
                  <span style={{ fontSize:11, color:"#888" }}>O adiantamento entra no CP já baixado nesta conta, na data informada.</span>
                </div>
              )}
              <div>
                <label data-arato-label="true" style={S.label}>Descrição / Motivo</label>
                <input type="text" value={adiEdit.descricao??""} onChange={e=>setAdiEdit(p=>({...p,descricao:e.target.value}))} style={{ ...S.inp, width:"100%" }} placeholder="Ex: Adiantamento quinzenal" />
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <OperationalButton data-arato-button="secondary" onClick={()=>setModalAdi(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="secondary" onClick={salvarAdiantamento} style={S.btn("#1A4870")} disabled={saving}>{saving ? "Salvando..." : adiEdit.id ? "Salvar Alterações" : "Registrar, Gerar CP e Baixar"}</OperationalButton>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL GRATIFICAÇÃO ══════════════ */}
      {modalPrem && (
        <div style={S.overlay} onClick={()=>setModalPrem(false)}>
          <div style={{ ...S.modal, width: "min(96vw,480px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 data-arato-h2="true" style={{ margin:0, fontSize:16, color:"#0B2D50" }}>{premEdit.id ? "Editar Gratificação" : "Nova Gratificação"}</h2>
              <OperationalButton data-arato-button="icon" onClick={()=>setModalPrem(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</OperationalButton>
            </div>
            <p style={{ fontSize:12, color:"#888", marginTop:-12, marginBottom:16 }}>A gratificação é incluída no bruto do mês de referência e será carregada ao criar a folha.</p>

            <div data-arato-fields="true" style={{ display:"grid", gap:14 }}>
              <div>
                <label data-arato-label="true" style={S.label}>Funcionário *</label>
                <SelectField value={premEdit.funcionario_id??""} onChange={e=>setPremEdit(p=>({...p,funcionario_id:e.target.value}))} style={{ ...S.inp, width:"100%" }}>
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
                </SelectField>
              </div>
              <div data-arato-fields="true" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label data-arato-label="true" style={S.label}>Mês de referência *</label>
                  <InputData type="month" value={premEdit.mes_referencia??""} onChange={e=>setPremEdit(p=>({...p,mes_referencia:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                </div>
                <div>
                  <label data-arato-label="true" style={S.label}>Valor (R$) *</label>
                  <input type="number" value={premEdit.valor??""} onChange={e=>setPremEdit(p=>({...p,valor:parseFloat(e.target.value)||0}))} style={{ ...S.inp, width:"100%" }} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label data-arato-label="true" style={S.label}>Descrição *</label>
                <input type="text" value={premEdit.descricao??""} onChange={e=>setPremEdit(p=>({...p,descricao:e.target.value}))} style={{ ...S.inp, width:"100%" }} placeholder="Ex: Gratificação de produtividade, Bônus colheita..." />
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <OperationalButton data-arato-button="secondary" onClick={()=>setModalPrem(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="secondary" onClick={salvarPremiacao} style={S.btn("#C9921B")} disabled={saving}>{saving ? "Salvando..." : premEdit.id ? "Salvar Alterações" : "Salvar Gratificação"}</OperationalButton>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
