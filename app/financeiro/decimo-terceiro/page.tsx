"use client";
// 13º Salário — controle por funcionário e ano: avos, base, bruto, 1ª parcela (metade, sem descontos) e 2ª parcela
// (bruto − INSS − IRRF − 1ª). Cada parcela é lançada no Contas a Pagar no nome do funcionário (Seção 386,
// /api/folha/decimo-terceiro). Regra de cálculo em lib/folha/decimo-terceiro.ts (testada).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import InputData from "../../../components/InputData";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { supabase } from "../../../lib/supabase";
import { avosDecimo, calcularDecimo } from "../../../lib/folha/decimo-terceiro";

type Func = { id: string; nome: string; fazenda_id: string; data_admissao: string | null; data_demissao: string | null; salario_base: number | null; area_trabalho: string | null; funcao?: string | null; ativo: boolean };
type Reg = { id: string; funcionario_id: string; avos: number; base: number; bruto: number; inss: number; irrf: number; parcela1_valor: number | null; parcela1_vencimento: string | null; parcela1_lancamento_id: string | null; parcela2_valor: number | null; parcela2_vencimento: string | null; parcela2_lancamento_id: string | null };
type StatusTit = { status: string; valor_pago: number | null };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const numBR = (v: string) => parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const th: CSSProperties = { padding: "7px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)" };
const td: CSSProperties = { padding: "6px 8px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: "0.5px solid var(--border-row)", verticalAlign: "top" };
const inp: CSSProperties = { padding: "6px 9px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-input)", color: "var(--text-1)" };
const SIT: Record<string, { rot: string; bg: string; cor: string }> = {
  lancar: { rot: "A lançar", bg: "#F4F6FA", cor: "var(--text-3)" },
  aberto: { rot: "Aberto", bg: "#D5E8F5", cor: "#0B2D50" },
  pago: { rot: "Pago", bg: "#DCFCE7", cor: "#166534" },
  parcial: { rot: "Parcial", bg: "#FBF3E0", cor: "#7A5200" },
};

export default function DecimoTerceiroPage() {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [regs, setRegs] = useState<Map<string, Reg>>(new Map());
  const [tits, setTits] = useState<Map<string, StatusTit>>(new Map());
  const [fazendas, setFazendas] = useState<Map<string, string>>(new Map());
  const [bases, setBases] = useState<Record<string, string>>({});
  const [avosEd, setAvosEd] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [venc1, setVenc1] = useState(`${anoAtual}-11-30`);
  const [venc2, setVenc2] = useState(`${anoAtual}-12-20`);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function carregar() {
    if (!ids.length) return;
    setCarregando(true); setErro("");
    try {
      const [{ data: fs, error: eF }, { data: fz }] = await Promise.all([
        supabase.from("funcionarios").select("id, nome, fazenda_id, data_admissao, data_demissao, salario_base, area_trabalho, funcao, ativo").in("fazenda_id", ids).order("nome"),
        supabase.from("fazendas").select("id, nome").in("id", ids),
      ]);
      if (eF) throw eF;
      setFazendas(new Map((fz ?? []).map(f => [f.id as string, f.nome as string])));
      // Ativos no ano; quem saiu antes de 31/12 recebe o 13º proporcional na rescisão
      const lista = ((fs ?? []) as Func[]).filter(f => f.ativo !== false && !f.data_demissao && avosDecimo(f.data_admissao, null, ano) > 0);
      setFuncs(lista);
      const { data: rs, error: eR } = await supabase.from("decimo_terceiro").select("*").eq("ano", ano).in("fazenda_id", ids);
      if (eR && eR.code !== "42P01" && eR.code !== "PGRST205") throw eR;
      if (eR) setErro("Rode a Seção 386 do supabase_migrations.sql para gravar o controle do 13º.");
      const mapa = new Map(((rs ?? []) as Reg[]).map(r => [r.funcionario_id, r]));
      setRegs(mapa);
      const idsT = [...mapa.values()].flatMap(r => [r.parcela1_lancamento_id, r.parcela2_lancamento_id]).filter((x): x is string => !!x);
      const { data: ts } = idsT.length ? await supabase.from("lancamentos").select("id, status, valor_pago").in("id", idsT) : { data: [] };
      setTits(new Map((ts ?? []).map(t => [t.id as string, { status: t.status as string, valor_pago: t.valor_pago as number | null }])));
      setBases(Object.fromEntries(lista.map(f => [f.id, (Number(mapa.get(f.id)?.base ?? f.salario_base ?? 0)).toFixed(2).replace(".", ",")])));
      setAvosEd(Object.fromEntries(lista.map(f => [f.id, String(mapa.get(f.id)?.avos || avosDecimo(f.data_admissao, null, ano))])));
      setSel(new Set());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); setVenc1(`${ano}-11-30`); setVenc2(`${ano}-12-20`); }, [ids.join(","), ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const situacao = (lancId: string | null | undefined) => {
    if (!lancId) return "lancar";
    const t = tits.get(lancId);
    if (!t) return "lancar";   // título apagado no CP: a parcela volta a "a lançar"
    return t.status === "baixado" ? "pago" : t.status === "parcial" || Number(t.valor_pago ?? 0) > 0 ? "parcial" : "aberto";
  };
  const linhas = funcs.filter(f => !busca.trim() || f.nome.toLowerCase().includes(busca.trim().toLowerCase())).map(f => {
    const reg = regs.get(f.id);
    const avos = Math.max(0, Math.min(12, parseInt(avosEd[f.id] ?? "0") || 0));
    const base = numBR(bases[f.id] ?? "0");
    const c = calcularDecimo(base, avos);
    const s1 = situacao(reg?.parcela1_lancamento_id), s2 = situacao(reg?.parcela2_lancamento_id);
    // 2ª parcela desconta o que foi lançado na 1ª (se já lançada, o valor gravado)
    const p1 = s1 !== "lancar" ? Number(reg?.parcela1_valor ?? c.parcela1) : c.parcela1;
    const p2 = s2 !== "lancar" ? Number(reg?.parcela2_valor ?? 0) : Math.max(0, Math.round((c.bruto - c.inss - c.irrf - p1) * 100) / 100);
    return { f, reg, avos, base, c, s1, s2, p1, p2 };
  });
  const tot = linhas.reduce((t, l) => ({ bruto: t.bruto + l.c.bruto, p1: t.p1 + l.p1, inss: t.inss + l.c.inss, irrf: t.irrf + l.c.irrf, p2: t.p2 + l.p2 }), { bruto: 0, p1: 0, inss: 0, irrf: 0, p2: 0 });

  async function lancar(parcela: 1 | 2) {
    const alvo = linhas.filter(l => (sel.size ? sel.has(l.f.id) : true) && (parcela === 1 ? l.s1 === "lancar" : l.s2 === "lancar") && (parcela === 1 ? l.p1 : l.p2) > 0);
    if (!alvo.length) { setErro(`Nenhum funcionário${sel.size ? " marcado" : ""} com a ${parcela}ª parcela a lançar.`); return; }
    const venc = parcela === 1 ? venc1 : venc2;
    const total = alvo.reduce((t, l) => t + (parcela === 1 ? l.p1 : l.p2), 0);
    if (!(await confirmarAcao({ titulo: `Lançar ${parcela}ª parcela do 13º?`, perigo: false, textoConfirmar: "Lançar no Contas a Pagar",
      mensagem: `${alvo.length} funcionário(s), total ${fmtBRL(total)}, vencimento ${fmtData(venc)}. Cada um vira um título no Contas a Pagar no nome do funcionário (operação 13º Salário).` }))) return;
    setErro(""); setMsg("");
    const r = await fetch("/api/folha/decimo-terceiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      acao: "lancar", ano, parcela, vencimento: venc,
      itens: alvo.map(l => ({ funcionario_id: l.f.id, avos: l.avos, base: l.base, bruto: l.c.bruto, inss: l.c.inss, irrf: l.c.irrf, valor: parcela === 1 ? l.p1 : l.p2 })),
    }) });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; lancados?: number; avisos?: string[] };
    if (!j.ok) { setErro(j.error ?? `Erro HTTP ${r.status}`); return; }
    setMsg(`✓ ${j.lancados} título(s) da ${parcela}ª parcela lançados no Contas a Pagar.${j.avisos?.length ? ` Avisos: ${j.avisos.join("; ")}` : ""}`);
    await carregar();
  }

  async function estornar(f: Func, parcela: 1 | 2) {
    if (!(await confirmarAcao({ titulo: `Estornar a ${parcela}ª parcela de ${f.nome}?`, perigo: true, textoConfirmar: "Estornar",
      mensagem: "O título do Contas a Pagar é apagado (só se ainda não foi pago, conciliado nem posto em borderô) e a parcela volta a \"a lançar\"." }))) return;
    const r = await fetch("/api/folha/decimo-terceiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "estornar", ano, parcela, funcionario_id: f.id }) });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!j.ok) { setErro(j.error ?? `Erro HTTP ${r.status}`); return; }
    setMsg(`✓ ${parcela}ª parcela de ${f.nome} estornada.`);
    await carregar();
  }

  const chip = (s: string, venc?: string | null) => (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 7, background: SIT[s].bg, color: SIT[s].cor }}>{SIT[s].rot}{venc && s !== "lancar" ? ` · ${fmtData(venc)}` : ""}</span>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ padding: "14px 20px" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ marginBottom: 10 }}>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>13º Salário</h1>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Avos de cada funcionário no ano, 1ª parcela (metade, sem descontos, até 30/11) e 2ª parcela (com INSS e IRRF, até 20/12) lançadas no Contas a Pagar.</div>
        </OperationalHeading>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Ano</div>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={inp}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select></div>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Funcionário</div>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Vencimento 1ª parcela</div><InputData type="date" value={venc1} onChange={e => setVenc1(e.target.value)} style={inp} /></div>
            <OperationalButton data-arato-button="primary" onClick={() => lancar(1)} style={{ ...inp, background: "#1A4870", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Lançar 1ª parcela</OperationalButton>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Vencimento 2ª parcela</div><InputData type="date" value={venc2} onChange={e => setVenc2(e.target.value)} style={inp} /></div>
            <OperationalButton data-arato-button="primary" onClick={() => lancar(2)} style={{ ...inp, background: "#1A4870", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Lançar 2ª parcela</OperationalButton>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{sel.size ? `${sel.size} funcionário(s) marcado(s) — os botões lançam só os marcados.` : "Sem marcação, os botões lançam todos os que ainda não têm a parcela."} A base vem do salário da carteira e pode ser ajustada (ex.: média de horas extras e variáveis) antes de lançar. INSS e IRRF são estimativa pela tabela da folha — confira com o contador.</div>

        {msg && <div style={{ padding: 10, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
        {erro && <div style={{ padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{erro}</div>}

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "center", width: 30 }}><input type="checkbox" checked={linhas.length > 0 && sel.size === linhas.length} onChange={e => setSel(e.target.checked ? new Set(linhas.map(l => l.f.id)) : new Set())} /></th>
              <th style={{ ...th, textAlign: "left" }}>Funcionário</th><th style={{ ...th, textAlign: "left" }}>Admissão</th>
              <th style={th}>Avos</th><th style={th}>Base</th><th style={th}>13º bruto</th>
              <th style={th}>1ª parcela</th><th style={th}>INSS</th><th style={th}>IRRF</th><th style={th}>2ª parcela</th>
            </tr></thead>
            <tbody>
              {carregando ? <tr><td colSpan={10} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>Carregando…</td></tr>
                : !linhas.length ? <tr><td colSpan={10} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>Nenhum funcionário ativo em {ano}.</td></tr>
                : linhas.map(l => {
                  const travado = l.s1 !== "lancar";
                  return (
                    <tr key={l.f.id} style={{ background: sel.has(l.f.id) ? "#F4F6FA" : undefined }}>
                      <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={sel.has(l.f.id)} onChange={() => setSel(p => { const n = new Set(p); if (n.has(l.f.id)) n.delete(l.f.id); else n.add(l.f.id); return n; })} /></td>
                      <td style={{ ...td, textAlign: "left" }}><div style={{ fontWeight: 600, color: "var(--text-1)" }}>{l.f.nome}</div><div style={{ fontSize: 11, color: "var(--text-3)" }}>{[l.f.funcao, l.f.area_trabalho === "administrativo" ? "ADM" : "Fazenda", fazendas.get(l.f.fazenda_id)].filter(Boolean).join(" · ")}</div></td>
                      <td style={{ ...td, textAlign: "left" }}>{fmtData(l.f.data_admissao)}</td>
                      <td style={td}><input value={avosEd[l.f.id] ?? ""} disabled={travado} onChange={e => setAvosEd(p => ({ ...p, [l.f.id]: e.target.value.replace(/\D/g, "").slice(0, 2) }))} style={{ ...inp, width: 44, textAlign: "right" }} title="Meses com 15 dias ou mais trabalhados no ano" />/12</td>
                      <td style={td}><input value={bases[l.f.id] ?? ""} disabled={travado} onChange={e => setBases(p => ({ ...p, [l.f.id]: e.target.value }))} style={{ ...inp, width: 100, textAlign: "right" }} /></td>
                      <td style={{ ...td, fontWeight: 600 }}>{fmtBRL(l.c.bruto)}</td>
                      <td style={td}>{fmtBRL(l.p1)}<div>{chip(l.s1, l.reg?.parcela1_vencimento)}{l.s1 === "aberto" && <button type="button" onClick={() => estornar(l.f, 1)} style={{ marginLeft: 4, border: "none", background: "none", color: "#B91C1C", fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>estornar</button>}</div></td>
                      <td style={{ ...td, color: "var(--text-2)" }}>{fmtBRL(l.c.inss)}</td>
                      <td style={{ ...td, color: "var(--text-2)" }}>{fmtBRL(l.c.irrf)}</td>
                      <td style={td}>{fmtBRL(l.p2)}<div>{chip(l.s2, l.reg?.parcela2_vencimento)}{l.s2 === "aberto" && <button type="button" onClick={() => estornar(l.f, 2)} style={{ marginLeft: 4, border: "none", background: "none", color: "#B91C1C", fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>estornar</button>}</div></td>
                    </tr>
                  );
                })}
              {linhas.length > 0 && (
                <tr style={{ background: "var(--bg-page)", fontWeight: 700 }}>
                  <td colSpan={5} style={{ ...td, textAlign: "left", fontWeight: 700 }}>Total · {linhas.length} funcionário(s)</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmtBRL(tot.bruto)}</td><td style={{ ...td, fontWeight: 700 }}>{fmtBRL(tot.p1)}</td>
                  <td style={td}>{fmtBRL(tot.inss)}</td><td style={td}>{fmtBRL(tot.irrf)}</td><td style={{ ...td, fontWeight: 700 }}>{fmtBRL(tot.p2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
