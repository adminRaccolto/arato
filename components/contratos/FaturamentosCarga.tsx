"use client";
// Faturamentos por carga do contrato de venda (Seção 388): NF-es de venda vinculadas ao contrato, cada uma com seu CR,
// e quanto abateram do CR do contrato. Permite vincular NF-e emitida fora do Faturamento (importada / nota própria)
// e desvincular (apaga o CR da carga, se não recebido, e devolve o valor ao CR do contrato).
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import SelectBusca from "../SelectBusca";
import { confirmarAcao } from "../ConfirmarAcao";

type Fat = { id: string; nota_fiscal_id: string; quantidade_sc: number | null; valor_nf: number; valor_abatido: number; cr_lancamento_id: string | null; created_at: string };
type Nota = { id: string; numero: string; serie: string | null; data_emissao: string | null; destinatario: string | null; cnpj_destinatario: string | null; valor_total: number; cfop: string | null };
type Cr = { id: string; status: string; data_vencimento: string; valor_pago: number | null };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const numBR = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

export default function FaturamentosCarga({ contratoId, fazendaId, contaId, cnpjComprador, moeda }: {
  contratoId: string; fazendaId: string | null; contaId: string | null; cnpjComprador: string | null; moeda?: string | null;
}) {
  const [fats, setFats] = useState<Fat[]>([]);
  const [notas, setNotas] = useState<Map<string, Nota>>(new Map());
  const [crs, setCrs] = useState<Map<string, Cr>>(new Map());
  const [livres, setLivres] = useState<Nota[]>([]);
  const [todas, setTodas] = useState(false);
  const [sel, setSel] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    setErro("");
    const { data: fs, error } = await supabase.from("contrato_faturamentos").select("*").eq("contrato_id", contratoId).order("created_at");
    if (error) { setErro(error.code === "42P01" || error.code === "PGRST205" ? "Rode a Seção 388 do supabase_migrations.sql para usar o recebimento por carga." : error.message); return; }
    const lista = (fs ?? []) as Fat[];
    setFats(lista);
    // NF-es de saída autorizadas das fazendas do cliente (as já vinculadas a qualquer contrato ficam de fora da escolha)
    const { data: fz } = contaId ? await supabase.from("fazendas").select("id").eq("conta_id", contaId) : { data: fazendaId ? [{ id: fazendaId }] : [] };
    const ids = (fz ?? []).map(f => f.id as string);
    const { data: ns } = ids.length ? await supabase.from("notas_fiscais")
      .select("id, numero, serie, data_emissao, destinatario, cnpj_destinatario, valor_total, cfop")
      .in("fazenda_id", ids).eq("tipo", "saida").eq("status", "autorizada").order("data_emissao", { ascending: false }).limit(1000) : { data: [] };
    const todasNotas = (ns ?? []) as Nota[];
    const { data: usadas } = todasNotas.length ? await supabase.from("contrato_faturamentos").select("nota_fiscal_id").in("nota_fiscal_id", todasNotas.map(n => n.id)) : { data: [] };
    const usadasSet = new Set((usadas ?? []).map(u => u.nota_fiscal_id as string));
    const faltam = lista.filter(f => !todasNotas.some(n => n.id === f.nota_fiscal_id)).map(f => f.nota_fiscal_id);
    const { data: extras } = faltam.length ? await supabase.from("notas_fiscais").select("id, numero, serie, data_emissao, destinatario, cnpj_destinatario, valor_total, cfop").in("id", faltam) : { data: [] };
    setNotas(new Map([...todasNotas, ...((extras ?? []) as Nota[])].map(n => [n.id, n])));
    setLivres(todasNotas.filter(n => !usadasSet.has(n.id)));
    const idsCr = lista.map(f => f.cr_lancamento_id).filter((x): x is string => !!x);
    const { data: cs } = idsCr.length ? await supabase.from("lancamentos").select("id, status, data_vencimento, valor_pago").in("id", idsCr) : { data: [] };
    setCrs(new Map(((cs ?? []) as Cr[]).map(c => [c.id, c])));
  }
  useEffect(() => { carregar(); }, [contratoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = dig(cnpjComprador);
  const opcoes = livres.filter(n => todas || !doc || dig(n.cnpj_destinatario) === doc).map(n => ({
    value: n.id, label: `NF ${n.numero}${n.serie ? `/${n.serie}` : ""} · ${fmtData(n.data_emissao)} · ${n.destinatario ?? ""} · ${fmtBRL(Number(n.valor_total))}${n.cfop ? ` · CFOP ${n.cfop}` : ""}`,
  }));

  async function chamar(corpo: Record<string, unknown>) {
    setOcupado(true); setErro(""); setMsg("");
    try {
      const r = await fetch("/api/contratos/faturar-carga", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; aviso?: string; mensagem?: string; abatido?: number };
      if (!j.ok) { setErro(j.error ?? j.mensagem ?? `Erro HTTP ${r.status}`); return false; }
      setMsg(j.mensagem ?? `✓ CR da carga criado; abatido do contrato: ${Number(j.abatido ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${moeda ?? "BRL"}.${j.aviso ? ` Atenção: ${j.aviso}` : ""}`);
      await carregar();
      return true;
    } finally { setOcupado(false); }
  }

  async function vincular() {
    if (!sel) return;
    const ok = await chamar({ acao: "vincular", contrato_id: contratoId, nota_fiscal_id: sel, valor_abatido: valorManual.trim() ? numBR(valorManual) : null });
    if (ok) { setSel(""); setValorManual(""); }
  }
  async function desvincular(f: Fat) {
    const n = notas.get(f.nota_fiscal_id);
    if (!(await confirmarAcao({ titulo: `Desvincular a NF ${n?.numero ?? ""} do contrato?`, perigo: true, textoConfirmar: "Desvincular",
      mensagem: "O CR desta carga é apagado (só se ainda não foi recebido) e o valor abatido volta para o CR do contrato." }))) return;
    await chamar({ acao: "desvincular", nota_fiscal_id: f.nota_fiscal_id });
  }

  const totNf = fats.reduce((t, f) => t + Number(f.valor_nf), 0);
  const totAb = fats.reduce((t, f) => t + Number(f.valor_abatido), 0);
  const totSc = fats.reduce((t, f) => t + Number(f.quantidade_sc ?? 0), 0);
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, padding: "4px 6px", borderBottom: "0.5px solid #DDE2EE" };
  const td: React.CSSProperties = { fontSize: 12, padding: "4px 6px", borderBottom: "0.5px solid #EEF1F6" };
  const inp: React.CSSProperties = { fontSize: 12, padding: "5px 8px", border: "0.5px solid #DDE2EE", borderRadius: 8 };

  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0B2D50", marginBottom: 6 }}>Faturamentos por carga</div>
      {erro && <div style={{ padding: 8, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 6 }}>{erro}</div>}
      {msg && <div style={{ padding: 8, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 12, marginBottom: 6 }}>{msg}</div>}
      {fats.length === 0 ? (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Nenhuma NF-e vinculada ainda. As NF-es emitidas pelo Faturamento a partir deste contrato entram sozinhas; as emitidas fora (importadas) vincule abaixo.</div>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead><tr><th style={th}>NF</th><th style={th}>Emissão</th><th style={{ ...th, textAlign: "right" }}>Sacas</th><th style={{ ...th, textAlign: "right" }}>Valor NF (CR)</th><th style={{ ...th, textAlign: "right" }}>Abatido do contrato</th><th style={th}>Vencimento CR</th><th style={th}>Situação</th><th style={th} /></tr></thead>
            <tbody>
              {fats.map(f => {
                const n = notas.get(f.nota_fiscal_id); const c = f.cr_lancamento_id ? crs.get(f.cr_lancamento_id) : undefined;
                const pago = c && (c.status === "baixado" || Number(c.valor_pago) > 0);
                return (
                  <tr key={f.id}>
                    <td style={td}>{n?.numero ?? "—"}</td>
                    <td style={td}>{fmtData(n?.data_emissao)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{f.quantidade_sc != null ? Number(f.quantidade_sc).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmtBRL(Number(f.valor_nf))}</td>
                    <td style={{ ...td, textAlign: "right" }}>{Number(f.valor_abatido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {moeda ?? "BRL"}</td>
                    <td style={td}>{fmtData(c?.data_vencimento)}</td>
                    <td style={td}>{!c ? "CR apagado" : c.status === "baixado" ? "Recebido" : Number(c.valor_pago) > 0 ? "Parcial" : "Aberto"}</td>
                    <td style={td}>{!pago && <button type="button" disabled={ocupado} onClick={() => desvincular(f)} style={{ fontSize: 11, border: "0.5px solid #E24B4A", color: "#B91C1C", background: "#fff", borderRadius: 8, padding: "2px 8px", cursor: "pointer" }}>Desvincular</button>}</td>
                  </tr>
                );
              })}
              <tr><td style={{ ...td, fontWeight: 600 }} colSpan={2}>Total</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{totSc.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtBRL(totNf)}</td><td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{totAb.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {moeda ?? "BRL"}</td><td style={td} colSpan={3} /></tr>
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px" }}>
          <SelectBusca value={sel} onChange={setSel} options={opcoes} placeholder={opcoes.length ? "— vincular NF-e de venda —" : "— nenhuma NF-e livre —"} style={{ ...inp, width: "100%" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
          <input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> outros destinatários
        </label>
        <input value={valorManual} onChange={e => setValorManual(e.target.value)} placeholder={`abater (${moeda ?? "BRL"}) — opcional`} style={{ ...inp, width: 150 }} />
        <button type="button" disabled={!sel || ocupado} onClick={vincular} style={{ ...inp, background: sel ? "#1A4870" : "#9AA9BC", color: "#fff", border: "none", fontWeight: 600, cursor: sel ? "pointer" : "default" }}>Vincular</button>
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>O abatimento é calculado pelas sacas da NF × preço do contrato; informe o valor só se a NF não tiver unidade em kg/sc/t (obrigatório em contrato em US$ nesse caso).</div>
    </div>
  );
}
