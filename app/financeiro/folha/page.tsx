"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────
interface Funcionario {
  id: string;
  nome: string;
  funcao?: string;
  cargo?: string;
  salario_base?: number;
  tipo?: string;
  ativo?: boolean;
  empresa_id?: string | null;
  empresa_nome?: string;
}
interface FolhaFunc {
  id?: string;
  folha_id?: string;
  funcionario_id?: string;
  empresa_id?: string | null;
  nome_funcionario: string;
  cargo: string;
  salario_base: number;           // base pura (carteira) — base dos encargos
  complemento_salarial: number;   // por fora — sem encargos, sem Livro Caixa
  gratificacao: number;           // bônus do mês
  salario_bruto: number;          // base + gratificacao (encargos só sobre isso)
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
}
interface Folha {
  id: string;
  fazenda_id: string;
  empresa_id?: string | null;
  empresa_nome?: string;
  competencia: string;
  status: "rascunho" | "fechado" | "pago";
  valor_bruto: number;
  valor_liquido: number;
  inss_patronal?: number;
  fgts_total?: number;
  obs?: string;
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
function calcINSS(bruto: number): number {
  const faixas = [
    { limite: 1518.00, a: 0.075 },
    { limite: 2793.88, a: 0.09  },
    { limite: 4190.83, a: 0.12  },
    { limite: 8157.41, a: 0.14  },
  ];
  let inss = 0, anterior = 0;
  for (const f of faixas) {
    if (bruto <= anterior) break;
    inss += (Math.min(bruto, f.limite) - anterior) * f.a;
    anterior = f.limite;
    if (bruto <= f.limite) break;
  }
  return Math.round(inss * 100) / 100;
}
function calcIRRF(bruto: number, inss: number): number {
  const base = bruto - inss;
  const faixas = [
    { lim: 2259.20, a: 0,     ded: 0       },
    { lim: 2826.65, a: 0.075, ded: 169.44  },
    { lim: 3751.05, a: 0.15,  ded: 381.44  },
    { lim: 4664.68, a: 0.225, ded: 662.77  },
    { lim: Infinity,a: 0.275, ded: 896.00  },
  ];
  for (const f of faixas) {
    if (base <= f.lim) return Math.max(0, Math.round((base * f.a - f.ded) * 100) / 100);
  }
  return 0;
}
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

function recalc(f: FolhaFunc): FolhaFunc {
  const bruto = (f.salario_base || 0) + (f.gratificacao || 0);
  const inss  = calcINSS(bruto);
  return { ...f, salario_bruto: bruto, inss_trabalhador: inss, irrf: calcIRRF(bruto, inss), fgts: calcFGTS(bruto), inss_patronal: calcINSSPat(bruto) };
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
  const { fazendaId } = useAuth();
  const [aba, setAba]             = useState<Aba>("processamento");
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState("");
  const [saving, setSaving]       = useState(false);

  // dados
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folhas,       setFolhas]       = useState<Folha[]>([]);
  const [empresasMap,  setEmpresasMap]  = useState<Record<string, string>>({});
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

  // modal premiação
  const [modalPrem,  setModalPrem]  = useState(false);
  const [premEdit,   setPremEdit]   = useState<Partial<Premiacao>>({});

  // ─── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [
        { data: funcs },
        { data: fols },
        { data: adis },
        { data: prems },
        { data: emps },
      ] = await Promise.all([
        supabase.from("funcionarios")
          .select("id,nome,funcao,salario_base,tipo,empresa_id,ativo")
          .eq("fazenda_id", fazendaId)
          .order("nome"),
        supabase.from("folha_pagamento")
          .select("*")
          .eq("fazenda_id", fazendaId)
          .order("competencia", { ascending: false }),
        supabase.from("adiantamentos_salario")
          .select("*, funcionarios(nome)")
          .eq("fazenda_id", fazendaId)
          .order("data", { ascending: false }),
        supabase.from("funcionarios_premiacoes")
          .select("*, funcionarios(nome)")
          .eq("fazenda_id", fazendaId),
        supabase.from("empresas")
          .select("id,nome_fantasia,razao_social")
          .eq("fazenda_id", fazendaId)
          .order("nome_fantasia"),
      ]);
      // Mapa empresa_id → nome
      const eMap: Record<string, string> = {};
      (emps ?? []).forEach((e: any) => { eMap[e.id] = e.nome_fantasia || e.razao_social || e.id; });
      setEmpresasMap(eMap);

      // Todos os funcionários ativos com nome do empregador resolvido
      const funcsLista = (funcs ?? [])
        .filter((f: any) => f.ativo !== false)
        .map((f: any) => ({ ...f, empresa_nome: f.empresa_id ? (eMap[f.empresa_id] ?? "Empresa não encontrada") : undefined }));
      const funcIds = new Set(funcsLista.map((f: any) => f.id));
      setFuncionarios(funcsLista);

      // Folhas com nome do empregador resolvido
      const folhasComNome = (fols ?? []).map((f: any) => ({
        ...f,
        empresa_nome: f.empresa_id ? (eMap[f.empresa_id] ?? "Empresa não encontrada") : undefined,
      }));
      setFolhas(folhasComNome);
      setAdiantamentos((adis ?? []).filter((a: any) => funcIds.has(a.funcionario_id)).map((a: any) => ({ ...a, funcionario_nome: a.funcionarios?.nome })));
      setPremiacoes((prems ?? []).filter((p: any) => funcIds.has(p.funcionario_id)).map((p: any) => ({ ...p, funcionario_nome: p.funcionarios?.nome })));
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

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
      // Carregar itens existentes
      const { data: itens } = await supabase
        .from("folha_funcionarios")
        .select("*")
        .eq("folha_id", folha.id)
        .order("nome_funcionario");
      const funcsCarregados = (itens ?? []).map((i: any) => ({
        ...i,
        salario_base: (i.salario_bruto ?? 0) - (i.gratificacao ?? 0),
        complemento_salarial: i.complemento_salarial ?? 0,
        gratificacao: i.gratificacao ?? 0,
      }));
      setFolhaEdit({ ...folha, funcionarios: funcsCarregados });
      setSelecionados(new Set(funcsCarregados.map((_, i) => i)));
    } else {
      // Nova folha — pré-preenche com funcionários ativos
      const adisComp = adiantamentos.filter(a => a.competencia_ref === fComp && a.status === "pendente");
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
          funcionario_id: f.id,
          empresa_id: f.empresa_id ?? null,
          nome_funcionario: f.nome,
          cargo: f.funcao ?? "",
          salario_base: base,
          complemento_salarial: (f as any).complemento_salarial ?? 0,
          gratificacao: grat,
          salario_bruto: base + grat,
          inss_trabalhador: 0,
          irrf: 0,
          adiantamento: adi,
          outros_descontos: 0, desc_outros_descontos: "",
          vale_transporte: 0, vale_refeicao: 0, outros_beneficios: 0,
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
    }
    setAbaModal("funcionarios");
    setFuncExpand(new Set());
    setModalFolha(true);
  }

  async function salvarFolha() {
    if (!fazendaId) return;
    setSaving(true);
    try {
      // Apenas os funcionários marcados
      const funcs = (folhaEdit.funcionarios ?? []).filter((_, i) => selecionados.has(i));
      if (funcs.length === 0) { setMsg("Selecione ao menos um funcionário."); setSaving(false); return; }

      if (folhaEdit.id) {
        // Edição de folha existente — mantém empresa original
        await salvarFolhaMes(folhaEdit.competencia!, funcs, folhaEdit.empresa_id);
        setMsg("Folha salva.");
      } else {
        // Nova folha — agrupa por empregador e gera uma folha por empresa por mês
        const grupos = new Map<string | null, FolhaFunc[]>();
        for (const f of funcs) {
          const key = f.empresa_id ?? null;
          if (!grupos.has(key)) grupos.set(key, []);
          grupos.get(key)!.push(f);
        }
        const meses = monthsInRange(fComp, fCompAte);
        let total = 0;
        for (const comp of meses) {
          for (const [empresaId, gFuncs] of grupos) {
            await salvarFolhaMes(comp, gFuncs, empresaId);
            total++;
          }
        }
        const quantEmpresas = grupos.size;
        if (total > 1) setMsg(`${total} folhas geradas — ${meses.length} mês(es) × ${quantEmpresas} empregador(es).`);
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

  async function salvarFolhaMes(comp: string, funcs: FolhaFunc[], empresaId?: string | null) {
    const totalBruto   = funcs.reduce((s, f) => s + f.salario_bruto, 0);
    const totalLiq     = funcs.reduce((s, f) => s + liquido(f), 0);
    const totalINSSPat = funcs.reduce((s, f) => s + f.inss_patronal, 0);
    const totalFGTS    = funcs.reduce((s, f) => s + f.fgts, 0);

    // Reutiliza o ID só quando editando a folha existente (mesmo mês e mesma empresa)
    let folhaId = (folhaEdit.id && comp === folhaEdit.competencia && (folhaEdit.empresa_id ?? null) === (empresaId ?? null))
      ? folhaEdit.id
      : undefined;

    const dadosFolha = { valor_bruto: totalBruto, valor_liquido: totalLiq, inss_patronal: totalINSSPat, fgts_total: totalFGTS, obs: folhaEdit.obs };

    if (!folhaId) {
      // Upsert via API route (service_role_key evita RLS 42501)
      const res = await apiFolha({
        operacao: "upsert_folha",
        fazenda_id: fazendaId,
        empresa_id: empresaId ?? null,
        competencia: comp,
        ...dadosFolha,
      });
      folhaId = res.id as string;
      if (!res.criou) {
        // Folha existente: limpa funcionários para recriar
        await apiFolha({ operacao: "delete_funcionarios", folha_id: folhaId });
      }
      if (comp === folhaEdit.competencia) setFolhaEdit(p => ({ ...p, id: folhaId, empresa_id: empresaId ?? null }));
    } else {
      await apiFolha({ operacao: "update_folha", id: folhaId, ...dadosFolha });
      await apiFolha({ operacao: "delete_funcionarios", folha_id: folhaId });
    }

    if (funcs.length) {
      const rows = funcs.map(f => ({
        folha_id: folhaId,
        funcionario_id: f.funcionario_id ?? null,
        nome_funcionario: f.nome_funcionario,
        cargo: f.cargo,
        salario_bruto: f.salario_bruto,
        complemento_salarial: f.complemento_salarial ?? 0,
        gratificacao: f.gratificacao,
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
    if (!confirm(`Fechar a folha de ${nomeMes(folha.competencia)}? Isso irá gerar os lançamentos de CP.`)) return;
    setSaving(true);
    try {
      // Busca itens
      const { data: itens } = await supabase
        .from("folha_funcionarios").select("*").eq("folha_id", folha.id);
      // Gera CP por funcionário
      for (const it of (itens ?? [])) {
        const liq = Math.max(0,
          it.salario_bruto - it.inss_trabalhador - it.irrf - it.adiantamento
          - it.outros_descontos + it.vale_transporte + it.vale_refeicao + it.outros_beneficios
        );
        const { data: lancamento } = await supabase.from("lancamentos").insert({
          fazenda_id: fazendaId,
          empresa_id: folha.empresa_id ?? null,
          tipo: "pagar",
          descricao: `Salário ${nomeMes(folha.competencia)} — ${it.nome_funcionario}`,
          valor: liq,
          moeda: "BRL",
          status: "em_aberto",
          categoria: "Pessoal / Salários",
          data_vencimento: `${folha.competencia}-05`,
          data_lancamento: new Date().toISOString().slice(0,10),
        }).select("id").single();
        if (lancamento?.id) {
          await supabase.from("folha_funcionarios").update({ cp_lancamento_id: lancamento.id }).eq("id", it.id);
        }
      }
      // Marca adiantamentos do mês como descontados
      await supabase.from("adiantamentos_salario")
        .update({ status: "descontado" })
        .eq("fazenda_id", fazendaId)
        .eq("competencia_ref", folha.competencia)
        .eq("status", "pendente");

      await apiFolha({ operacao: "fechar_folha", id: folha.id });
      setMsg("Folha fechada e CPs gerados.");
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Adiantamento — salvar ────────────────────────────────────
  async function salvarAdiantamento() {
    if (!fazendaId || !adiEdit.funcionario_id || !adiEdit.valor || !adiEdit.data) {
      setMsg("Preencha funcionário, data e valor."); return;
    }
    setSaving(true);
    try {
      // Gera CP imediato
      const { data: lanc } = await supabase.from("lancamentos").insert({
        fazenda_id: fazendaId,
        tipo: "pagar",
        descricao: `Adiantamento — ${funcionarios.find(f=>f.id===adiEdit.funcionario_id)?.nome ?? ""}${adiEdit.descricao ? ` — ${adiEdit.descricao}` : ""}`,
        valor: adiEdit.valor,
        moeda: "BRL",
        status: "em_aberto",
        categoria: "Pessoal / Adiantamentos",
        data_vencimento: adiEdit.data,
        data_lancamento: adiEdit.data,
      }).select("id").single();

      await supabase.from("adiantamentos_salario").insert({
        fazenda_id: fazendaId,
        funcionario_id: adiEdit.funcionario_id,
        data: adiEdit.data,
        valor: adiEdit.valor,
        competencia_ref: adiEdit.competencia_ref || null,
        descricao: adiEdit.descricao || null,
        lancamento_id: lanc?.id ?? null,
        status: "pendente",
      });

      setMsg("Adiantamento registrado e CP gerado.");
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
    await supabase.from("adiantamentos_salario").update({ status: "cancelado" }).eq("id", id);
    carregar();
  }

  // ─── Premiação — salvar ───────────────────────────────────────
  async function salvarPremiacao() {
    if (!fazendaId || !premEdit.funcionario_id || !premEdit.valor || !premEdit.descricao || !premEdit.mes_referencia) {
      setMsg("Preencha todos os campos obrigatórios."); return;
    }
    setSaving(true);
    try {
      await supabase.from("funcionarios_premiacoes").insert({
        fazenda_id: fazendaId,
        funcionario_id: premEdit.funcionario_id,
        mes_referencia: premEdit.mes_referencia,
        descricao: premEdit.descricao,
        valor: premEdit.valor,
        lancado_financeiro: false,
      });
      setMsg("Gratificação registrada.");
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
    await supabase.from("funcionarios_premiacoes").delete().eq("id", id);
    carregar();
  }

  // ─── Campos editáveis na folha ────────────────────────────────
  function setFuncField(idx: number, field: keyof FolhaFunc, val: number | string) {
    setFolhaEdit(prev => {
      const funcs = [...prev.funcionarios];
      const f = { ...funcs[idx], [field]: val };
      funcs[idx] = (field === "salario_base" || field === "gratificacao") ? recalc(f) : f;
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
  const folhasFiltradas = folhas.filter(f => f.competencia >= fComp && f.competencia <= fCompAte);
  const totalBrutoFolhaEdit   = folhaEdit.funcionarios?.reduce((s,f)=>s+f.salario_bruto,0)??0;
  const totalLiqFolhaEdit     = folhaEdit.funcionarios?.reduce((s,f)=>s+liquido(f),0)??0;
  const totalINSSPatFolhaEdit  = folhaEdit.funcionarios?.reduce((s,f)=>s+f.inss_patronal,0)??0;

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <TopNav />
      <div style={S.body}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Folha de Pagamento</h1>
            <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>Processamento mensal, adiantamentos e gratificações</p>
          </div>
        </div>

        {msg && (
          <div style={{ background: msg.startsWith("Erro") ? "#FEF2F2" : "#F0FDF4", border: `0.5px solid ${msg.startsWith("Erro") ? "#FECACA" : "#BBF7D0"}`, borderRadius: 6, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: msg.startsWith("Erro") ? "#B91C1C" : "#166534" }}>
            {msg} <button onClick={()=>setMsg("")} style={{ float:"right", background:"none", border:"none", cursor:"pointer", fontSize:15, lineHeight:1 }}>×</button>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
          {([
            ["processamento","📋 Processamento"],
            ["adiantamentos","💵 Adiantamentos"],
            ["gratificacoes","⭐ Gratificações"],
          ] as [Aba,string][]).map(([k,l]) => (
            <button key={k} onClick={()=>setAba(k)}
              style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: aba===k ? "2px solid #1A4870" : "2px solid transparent", fontWeight: aba===k ? 700 : 400, color: aba===k ? "#1A4870" : "#666", cursor: "pointer", fontSize: 13 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ══════════════════ ABA PROCESSAMENTO ══════════════════ */}
        {aba === "processamento" && (
          <>
            <div style={{ ...S.card, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div>
                  <label style={S.label}>De</label>
                  <input type="month" value={fComp} onChange={e=>{ setFComp(e.target.value); if (e.target.value > fCompAte) setFCompAte(e.target.value); }} style={{ ...S.inp, width: 140 }} />
                </div>
                <span style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>até</span>
                <div>
                  <label style={S.label}>Até</label>
                  <input type="month" value={fCompAte} onChange={e=>setFCompAte(e.target.value < fComp ? fComp : e.target.value)} style={{ ...S.inp, width: 140 }} />
                </div>
                {fCompAte > fComp && (
                  <span style={{ fontSize: 11, color: "#C9921B", background: "#FBF3E0", borderRadius: 4, padding: "3px 8px", marginBottom: 4, fontWeight: 600 }}>
                    {monthsInRange(fComp, fCompAte).length} meses
                  </span>
                )}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={()=>abrirFolha()} style={S.btn("#1A4870")}>
                  {fCompAte > fComp ? `+ Gerar ${monthsInRange(fComp,fCompAte).length} Folhas` : "+ Nova Folha"}
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign:"center", padding:40, color:"#888" }}>Carregando...</div>
            ) : folhasFiltradas.length === 0 ? (
              <div style={{ ...S.card, padding: 32, textAlign: "center", color: "#888" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div>Nenhuma folha para {fComp === fCompAte ? nomeMes(fComp) : `${nomeMes(fComp)} – ${nomeMes(fCompAte)}`}.</div>
                <button onClick={()=>abrirFolha()} style={{ ...S.btn("#1A4870"), marginTop: 12 }}>Criar Folha</button>
              </div>
            ) : (
              <div style={S.card}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
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
                            : <span style={{ fontSize:11, color:"#888" }}>Sem empregador</span>}
                        </td>
                        <td style={S.td}>{f.funcionarios?.length ?? "—"}</td>
                        <td style={{ ...S.td, fontWeight:700, color:"#0B2D50", fontVariantNumeric:"tabular-nums" }}>{moeda(f.valor_bruto)}</td>
                        <td style={{ ...S.td, fontWeight:700, color:"#16A34A", fontVariantNumeric:"tabular-nums" }}>{moeda(f.valor_liquido)}</td>
                        <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums" }}>{moeda(f.inss_patronal??0)}</td>
                        <td style={S.td}>
                          <span style={{ fontSize:11, fontWeight:700, color:ST_COLOR[f.status], background:ST_COLOR[f.status]+"18", borderRadius:4, padding:"2px 8px" }}>
                            {ST_LABEL[f.status]}
                          </span>
                        </td>
                        <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                          <button onClick={()=>abrirFolha(f)} style={{ ...S.btn("#F4F6FA","#1A4870"), marginRight:6, fontSize:12 }}>Abrir</button>
                          {f.status === "rascunho" && (
                            <button onClick={()=>fecharFolha(f)} style={{ ...S.btn("#C9921B"), fontSize:12 }} disabled={saving}>Fechar Folha</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <button onClick={()=>{ setAdiEdit({ data: new Date().toISOString().slice(0,10), competencia_ref: compAtual() }); setModalAdi(true); }} style={S.btn("#1A4870")}>
                  + Novo Adiantamento
                </button>
              </div>
            </div>

            {adiantamentos.length === 0 ? (
              <div style={{ ...S.card, padding: 32, textAlign:"center", color:"#888" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💵</div>
                <div>Nenhum adiantamento registrado.</div>
              </div>
            ) : (
              <div style={S.card}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
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
                        <td style={{ ...S.td, fontWeight:600 }}>{a.funcionario_nome ?? "—"}</td>
                        <td style={S.td}>{dataFmt(a.data)}</td>
                        <td style={{ ...S.td, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{moeda(a.valor)}</td>
                        <td style={S.td}>{a.competencia_ref ? nomeMes(a.competencia_ref) : "—"}</td>
                        <td style={{ ...S.td, color:"#888" }}>{a.descricao || "—"}</td>
                        <td style={S.td}>
                          <span style={{ fontSize:11, fontWeight:700, color:ADI_COLOR[a.status], background:ADI_COLOR[a.status]+"18", borderRadius:4, padding:"2px 8px" }}>
                            {ADI_LABEL[a.status]}
                          </span>
                        </td>
                        <td style={S.td}>
                          {a.status === "pendente" && (
                            <button onClick={()=>cancelarAdiantamento(a.id)} style={{ background:"none", border:"none", color:"#E24B4A", cursor:"pointer", fontSize:12 }}>Cancelar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ ABA GRATIFICAÇÕES ══════════════════ */}
        {aba === "gratificacoes" && (
          <>
            <div style={{ ...S.card, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize:13, color:"#555" }}>{premiacoes.length} gratificação(ões) registradas</span>
              <div style={{ marginLeft:"auto" }}>
                <button onClick={()=>{ setPremEdit({ mes_referencia: compAtual() }); setModalPrem(true); }} style={S.btn("#C9921B")}>
                  + Nova Gratificação
                </button>
              </div>
            </div>

            {premiacoes.length === 0 ? (
              <div style={{ ...S.card, padding: 32, textAlign:"center", color:"#888" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>⭐</div>
                <div>Nenhuma gratificação registrada.</div>
              </div>
            ) : (
              <div style={S.card}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
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
                        <td style={S.td}>
                          {!p.lancado_financeiro && (
                            <button onClick={()=>excluirPremiacao(p.id)} style={{ background:"none", border:"none", color:"#E24B4A", cursor:"pointer", fontSize:12 }}>Excluir</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>

      {/* ══════════════ MODAL FOLHA ══════════════ */}
      {modalFolha && (
        <div style={S.overlay} onClick={()=>setModalFolha(false)}>
          <div style={{ ...S.modal, width: "min(96vw,1100px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h2 style={{ margin:0, fontSize:17, color:"#0B2D50" }}>
                {folhaEdit.id
                  ? `Folha — ${nomeMes(folhaEdit.competencia ?? "")}${folhaEdit.empresa_id ? ` · ${empresasMap[folhaEdit.empresa_id] ?? ""}` : " · Sem empregador"}`
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
              <button onClick={()=>setModalFolha(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>

            {/* Sub-abas */}
            <div style={{ display:"flex", gap:0, borderBottom:"0.5px solid #DDE2EE", marginBottom:16 }}>
              {([["funcionarios","Funcionários"],["resumo","Resumo"]] as const).map(([k,l])=>(
                <button key={k} onClick={()=>setAbaModal(k)}
                  style={{ padding:"8px 18px", background:"none", border:"none", borderBottom:abaModal===k?"2px solid #1A4870":"2px solid transparent", fontWeight:abaModal===k?700:400, color:abaModal===k?"#1A4870":"#666", cursor:"pointer", fontSize:13 }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Sub-aba: Funcionários */}
            {abaModal === "funcionarios" && (
              <div>
                {/* Contador de seleção */}
                {(folhaEdit.funcionarios ?? []).length > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, fontSize:12, color:"#555" }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontWeight:600 }}>
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
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr>
                          {["☑","","Empregador","Funcionário","Salário Base","Gratificação","Bruto","INSS","IRRF","Adiantamento","Outros Desc.","Benefícios","Líquido"].map(h=>(
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(folhaEdit.funcionarios ?? []).map((f, idx) => {
                          const liq = liquido(f);
                          const expanded = funcExpand.has(idx);
                          const sel = selecionados.has(idx);
                          return (
                            <>
                              <tr key={idx} style={{ background: !sel ? "#F9F9F9" : idx%2===0?"#fff":"#FAFBFD", opacity: sel ? 1 : 0.45 }}>
                                <td style={{ ...S.td, width:28 }}>
                                  <input type="checkbox" checked={sel} onChange={() => setSelecionados(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; })} style={{ cursor:"pointer" }} />
                                </td>
                                <td style={{ ...S.td, width:28 }}>
                                  <button onClick={()=>toggleExpand(idx)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#1A4870", padding:"0 4px" }}>{expanded?"▾":"▸"}</button>
                                </td>
                                <td style={{ ...S.td, minWidth:120 }}>
                                  {f.empresa_id
                                    ? <span style={{ fontSize:11, fontWeight:600, color:"#1A4870", background:"#D5E8F5", borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap" }}>{empresasMap[f.empresa_id] ?? "Empresa"}</span>
                                    : <span style={{ fontSize:11, color:"#aaa" }}>Sem vínculo</span>}
                                </td>
                                <td style={{ ...S.td, fontWeight:600, minWidth:160 }}>{f.nome_funcionario}</td>
                                <td style={S.td}>
                                  <input type="number" value={f.salario_base} onChange={e=>setFuncField(idx,"salario_base",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:100, textAlign:"right" }} />
                                </td>
                                <td style={S.td}>
                                  <input type="number" value={f.gratificacao} onChange={e=>setFuncField(idx,"gratificacao",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:90, textAlign:"right", borderColor: f.gratificacao > 0 ? "#C9921B" : "#DDE2EE" }} />
                                </td>
                                <td style={{ ...S.td, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{moeda(f.salario_bruto)}</td>
                                <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums" }}>{moeda(f.inss_trabalhador)}</td>
                                <td style={{ ...S.td, color:"#888", fontVariantNumeric:"tabular-nums" }}>{moeda(f.irrf)}</td>
                                <td style={S.td}>
                                  <input type="number" value={f.adiantamento} onChange={e=>setFuncField(idx,"adiantamento",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:90, textAlign:"right", borderColor: f.adiantamento > 0 ? "#EF9F27" : "#DDE2EE" }} />
                                </td>
                                <td style={S.td}>
                                  <input type="number" value={f.outros_descontos} onChange={e=>setFuncField(idx,"outros_descontos",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:80, textAlign:"right" }} />
                                </td>
                                <td style={S.td}>
                                  <input type="number" value={f.vale_transporte+f.vale_refeicao+f.outros_beneficios}
                                    onChange={e=>setFuncField(idx,"vale_transporte",parseFloat(e.target.value)||0)}
                                    style={{ ...S.inp, width:80, textAlign:"right" }} />
                                </td>
                                <td style={{ ...S.td, fontWeight:700, color: liq >= 0 ? "#16A34A" : "#E24B4A", fontVariantNumeric:"tabular-nums" }}>{moeda(liq)}</td>
                              </tr>
                              {expanded && (
                                <tr key={`${idx}-detail`} style={{ background:"#F8FAFD" }}>
                                  <td colSpan={13} style={{ padding:"12px 16px 16px 44px" }}>
                                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"10px 20px", fontSize:12 }}>
                                      <div>
                                        <label style={S.label}>Vale Transporte</label>
                                        <input type="number" value={f.vale_transporte} onChange={e=>setFuncField(idx,"vale_transporte",parseFloat(e.target.value)||0)} style={{ ...S.inp, width:"100%" }} />
                                      </div>
                                      <div>
                                        <label style={S.label}>Vale Refeição</label>
                                        <input type="number" value={f.vale_refeicao} onChange={e=>setFuncField(idx,"vale_refeicao",parseFloat(e.target.value)||0)} style={{ ...S.inp, width:"100%" }} />
                                      </div>
                                      <div>
                                        <label style={S.label}>Outros Benefícios</label>
                                        <input type="number" value={f.outros_beneficios} onChange={e=>setFuncField(idx,"outros_beneficios",parseFloat(e.target.value)||0)} style={{ ...S.inp, width:"100%" }} />
                                      </div>
                                      <div>
                                        <label style={S.label}>Outros Descontos (descrição)</label>
                                        <input type="text" value={f.desc_outros_descontos} onChange={e=>setFuncField(idx,"desc_outros_descontos",e.target.value)} style={{ ...S.inp, width:"100%" }} placeholder="Descrição..." />
                                      </div>
                                      <div>
                                        <label style={S.label}>INSS Patronal</label>
                                        <span style={{ fontSize:13, color:"#888" }}>{moeda(f.inss_patronal)}</span>
                                      </div>
                                      <div>
                                        <label style={S.label}>FGTS</label>
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
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-aba: Resumo */}
            {abaModal === "resumo" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
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
                  <label style={S.label}>Observações da Folha</label>
                  <textarea rows={3} value={folhaEdit.obs??""} onChange={e=>setFolhaEdit(p=>({...p,obs:e.target.value}))}
                    style={{ ...S.inp, width:"100%", resize:"vertical" }} />
                </div>
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <button onClick={()=>setModalFolha(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</button>
              <button onClick={salvarFolha} style={S.btn("#1A4870")} disabled={saving}>{saving ? "Salvando..." : "Salvar Folha"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL ADIANTAMENTO ══════════════ */}
      {modalAdi && (
        <div style={S.overlay} onClick={()=>setModalAdi(false)}>
          <div style={{ ...S.modal, width: "min(96vw,480px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:16, color:"#0B2D50" }}>Novo Adiantamento Salarial</h2>
              <button onClick={()=>setModalAdi(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            <p style={{ fontSize:12, color:"#888", marginTop:-12, marginBottom:16 }}>O CP é gerado automaticamente na data do adiantamento.</p>

            <div style={{ display:"grid", gap:14 }}>
              <div>
                <label style={S.label}>Funcionário *</label>
                <select value={adiEdit.funcionario_id??""} onChange={e=>setAdiEdit(p=>({...p,funcionario_id:e.target.value}))} style={{ ...S.inp, width:"100%" }}>
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={S.label}>Data *</label>
                  <input type="date" value={adiEdit.data??""} onChange={e=>setAdiEdit(p=>({...p,data:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                </div>
                <div>
                  <label style={S.label}>Valor (R$) *</label>
                  <input type="number" value={adiEdit.valor??""} onChange={e=>setAdiEdit(p=>({...p,valor:parseFloat(e.target.value)||0}))} style={{ ...S.inp, width:"100%" }} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label style={S.label}>Descontar na competência</label>
                <input type="month" value={adiEdit.competencia_ref??""} onChange={e=>setAdiEdit(p=>({...p,competencia_ref:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                <span style={{ fontSize:11, color:"#888" }}>Mês onde o valor será descontado do salário</span>
              </div>
              <div>
                <label style={S.label}>Descrição / Motivo</label>
                <input type="text" value={adiEdit.descricao??""} onChange={e=>setAdiEdit(p=>({...p,descricao:e.target.value}))} style={{ ...S.inp, width:"100%" }} placeholder="Ex: Adiantamento quinzenal" />
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <button onClick={()=>setModalAdi(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</button>
              <button onClick={salvarAdiantamento} style={S.btn("#1A4870")} disabled={saving}>{saving?"Salvando...":"Registrar e Gerar CP"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL GRATIFICAÇÃO ══════════════ */}
      {modalPrem && (
        <div style={S.overlay} onClick={()=>setModalPrem(false)}>
          <div style={{ ...S.modal, width: "min(96vw,480px)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:16, color:"#0B2D50" }}>Nova Gratificação</h2>
              <button onClick={()=>setModalPrem(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            <p style={{ fontSize:12, color:"#888", marginTop:-12, marginBottom:16 }}>A gratificação é incluída no bruto do mês de referência e será carregada ao criar a folha.</p>

            <div style={{ display:"grid", gap:14 }}>
              <div>
                <label style={S.label}>Funcionário *</label>
                <select value={premEdit.funcionario_id??""} onChange={e=>setPremEdit(p=>({...p,funcionario_id:e.target.value}))} style={{ ...S.inp, width:"100%" }}>
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={S.label}>Mês de referência *</label>
                  <input type="month" value={premEdit.mes_referencia??""} onChange={e=>setPremEdit(p=>({...p,mes_referencia:e.target.value}))} style={{ ...S.inp, width:"100%" }} />
                </div>
                <div>
                  <label style={S.label}>Valor (R$) *</label>
                  <input type="number" value={premEdit.valor??""} onChange={e=>setPremEdit(p=>({...p,valor:parseFloat(e.target.value)||0}))} style={{ ...S.inp, width:"100%" }} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label style={S.label}>Descrição *</label>
                <input type="text" value={premEdit.descricao??""} onChange={e=>setPremEdit(p=>({...p,descricao:e.target.value}))} style={{ ...S.inp, width:"100%" }} placeholder="Ex: Gratificação de produtividade, Bônus colheita..." />
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20, borderTop:"0.5px solid #DDE2EE", paddingTop:16 }}>
              <button onClick={()=>setModalPrem(false)} style={S.btn("#F4F6FA","#555")}>Cancelar</button>
              <button onClick={salvarPremiacao} style={S.btn("#C9921B")} disabled={saving}>{saving?"Salvando...":"Salvar Gratificação"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
