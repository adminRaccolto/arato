"use client";
// Lançamento de Mútuo (Tesouraria) — 31/10/2026. Novo mútuo: quem empresta e quem recebe (produtor, empresa do cliente
// ou pessoa do cadastro), com a conta de cada lado do cliente; os dois lados nascem já pagos. Devolução: escolhe o mútuo
// em aberto e faz o encontro de contas (abate o saldo, quita quando zera). O painel lista os mútuos e as devoluções.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { hojeLocal } from "../../lib/data-local";
import { listarPessoasDaConta } from "../../lib/db";
import SelectBusca from "../SelectBusca";
import SelectField from "../SelectField";
import InputData from "../InputData";
import InputMonetario from "../InputMonetario";
import { OperationalButton } from "../OperationalUI";

type TipoParte = "produtor" | "empresa" | "pessoa";
type Parte = { tipo: TipoParte; id: string; nome: string };
type Ref = { tabela: string; id: string };
export type Mutuo = {
  id: string; credor_tipo: TipoParte | null; credor_id: string | null; credor_nome: string | null; devedor_tipo: TipoParte | null;
  devedor_id: string | null; devedor_nome: string | null; contraparte: string; valor_principal: number; saldo_devedor: number;
  data_inicio: string; data_vencimento: string | null; status: string; observacao: string | null; lancamentos: Ref[];
};
type Pagamento = { id: string; mutuo_id: string; data_pagamento: string; valor_total: number; observacao: string | null };
type Conta = { id: string; nome?: string | null; banco?: string | null; agencia?: string | null; conta?: string | null };

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const fmtBRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const rotuloTipo: Record<TipoParte, string> = { produtor: "Produtor", empresa: "Empresa", pessoa: "Fornecedor / Pessoa" };
const nomeConta = (c: Conta) => c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag. ${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim() || c.id;

async function api(body: Record<string, unknown>) {
  const r = await fetch("/api/financeiro/mutuos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (!j.ok) throw new Error(j.error ?? `Erro HTTP ${r.status}`);
  return j;
}

/** Dados do cliente para o mútuo: partes (produtores, empresas, pessoas), contas bancárias e mútuos. */
export function useMutuos(fazendaId: string, fazendaIds: string[], contaId: string | null) {
  const [partes, setPartes] = useState<Parte[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [mutuos, setMutuos] = useState<Mutuo[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [erro, setErro] = useState("");
  const chaveFazendas = fazendaIds.join(",");
  const carregar = useCallback(async () => {
    if (!fazendaId || !contaId) return;
    const ids = chaveFazendas ? chaveFazendas.split(",") : [fazendaId];
    const [{ data: prods }, { data: emps }, pessoas, { data: cbs }] = await Promise.all([
      supabase.from("produtores").select("id, nome").eq("conta_id", contaId).order("nome"),
      supabase.from("empresas").select("id, nome, razao_social").or(`conta_id.eq.${contaId},fazenda_id.in.(${ids.join(",")})`).order("nome"),
      listarPessoasDaConta(fazendaId).catch(() => []),
      supabase.from("contas_bancarias").select("id, nome, banco, agencia, conta").in("fazenda_id", ids),
    ]);
    setPartes([
      ...(prods ?? []).map(p => ({ tipo: "produtor" as const, id: p.id as string, nome: p.nome as string })),
      ...(emps ?? []).map(e => ({ tipo: "empresa" as const, id: e.id as string, nome: (e.nome || e.razao_social) as string })),
      ...pessoas.map(p => ({ tipo: "pessoa" as const, id: p.id, nome: p.nome })),
    ]);
    setContas((cbs ?? []) as Conta[]);
    try {
      const j = await api({ acao: "listar", fazenda_id: fazendaId }) as { mutuos: Mutuo[]; pagamentos: Pagamento[] };
      setMutuos(j.mutuos); setPagamentos(j.pagamentos); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }, [fazendaId, contaId, chaveFazendas]);
  // Carga inicial e quando o cliente/fazendas mudam (os setState acontecem depois do await, fora do corpo do efeito)
  useEffect(() => { const t = setTimeout(() => { void carregar(); }, 0); return () => clearTimeout(t); }, [carregar]);
  return { partes, contas, mutuos, pagamentos, erro, carregar };
}

export function ModalLancamentoMutuo({ fazendaId, dados, onClose, onSalvo, mutuoInicial }: {
  fazendaId: string; dados: ReturnType<typeof useMutuos>; onClose: () => void; onSalvo: () => void; mutuoInicial?: string;
}) {
  const { partes, contas, mutuos } = dados;
  const [modo, setModo] = useState<"novo" | "devolver">(mutuoInicial ? "devolver" : "novo");
  const [credor, setCredor] = useState(""); const [devedor, setDevedor] = useState("");
  const [contaCredor, setContaCredor] = useState(""); const [contaDevedor, setContaDevedor] = useState("");
  const [valor, setValor] = useState(0); const [data, setData] = useState(hojeLocal()); const [venc, setVenc] = useState("");
  const [taxa, setTaxa] = useState(""); const [obs, setObs] = useState("");
  const [mutuoId, setMutuoId] = useState(mutuoInicial ?? "");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  const abertos = mutuos.filter(m => m.status !== "quitado" && Number(m.saldo_devedor) > 0.009);
  const mSel = abertos.find(m => m.id === mutuoId);
  useEffect(() => { if (mSel) setValor(Number(mSel.saldo_devedor)); }, [mutuoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parte = (v: string): Parte | undefined => partes.find(p => `${p.tipo}:${p.id}` === v);
  const pC = modo === "novo" ? parte(credor) : mSel ? { tipo: mSel.credor_tipo!, id: mSel.credor_id!, nome: mSel.credor_nome! } : undefined;
  const pD = modo === "novo" ? parte(devedor) : mSel ? { tipo: mSel.devedor_tipo!, id: mSel.devedor_id!, nome: mSel.devedor_nome! } : undefined;
  const interna = (p?: Parte) => !!p && (p.tipo === "produtor" || p.tipo === "empresa");
  const opcoesPartes = partes.map(p => ({ value: `${p.tipo}:${p.id}`, label: p.nome, group: rotuloTipo[p.tipo] }));
  const selConta = (v: string, set: (s: string) => void) => (
    <SelectField style={inp} value={v} onChange={e => set(e.target.value)}>
      <option value="">— Conta bancária —</option>
      {contas.map(c => <option key={c.id} value={c.id}>{nomeConta(c)}</option>)}
    </SelectField>
  );

  async function salvar() {
    setErro(""); setSalvando(true);
    try {
      if (modo === "novo") {
        if (!pC || !pD) throw new Error("Escolha quem empresta e quem recebe.");
        await api({ acao: "criar", fazenda_id: fazendaId, credor: pC, devedor: pD, valor, data, vencimento: venc || null, taxa_mensal: Number(taxa.replace(",", ".")) || 0, conta_credor: contaCredor || null, conta_devedor: contaDevedor || null, observacao: obs || null });
      } else {
        if (!mSel) throw new Error("Escolha o mútuo que está sendo devolvido.");
        await api({ acao: "devolver", mutuo_id: mSel.id, valor, data, conta_devedor: contaDevedor || null, conta_credor: contaCredor || null, observacao: obs || null });
      }
      onSalvo();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  }

  const aba = (k: typeof modo, t: string) => (
    <button type="button" onClick={() => { setModo(k); setErro(""); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: modo === k ? "1.5px solid #111" : "0.5px solid var(--border-table)", background: modo === k ? "#EFEFEF" : "transparent", color: "var(--text-1)" }}>{t}</button>
  );
  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "24px 0" }}>
      <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 640, margin: "0 20px" }}>
        <div data-arato-dialog-heading="true" style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Lançamento de Mútuo</div>
          <OperationalButton data-arato-button="icon" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</OperationalButton>
        </div>
        <div data-arato-dialog-body="true" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {erro && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{erro}</div>}
          <div style={{ display: "flex", gap: 10 }}>{aba("novo", "Novo mútuo")}{aba("devolver", "Devolução (encontro de contas)")}</div>

          {modo === "novo" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Quem empresta</label><SelectBusca style={inp} value={credor} onChange={setCredor} options={opcoesPartes} placeholder="— Produtor, empresa ou pessoa —" /></div>
                <div><label style={lbl}>Quem recebe</label><SelectBusca style={inp} value={devedor} onChange={setDevedor} options={opcoesPartes} placeholder="— Produtor, empresa ou pessoa —" /></div>
                <div>{interna(pC) ? <><label style={lbl}>Conta de onde sai ({pC!.nome})</label>{selConta(contaCredor, setContaCredor)}</> : <div style={{ fontSize: 11, color: "var(--text-3)", paddingTop: 18 }}>Quem empresta é de fora: só o lado de quem recebe entra no caixa.</div>}</div>
                <div>{interna(pD) ? <><label style={lbl}>Conta em que entra ({pD!.nome})</label>{selConta(contaDevedor, setContaDevedor)}</> : <div style={{ fontSize: 11, color: "var(--text-3)", paddingTop: 18 }}>Quem recebe é de fora: só o lado de quem empresta entra no caixa.</div>}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Valor (R$)</label><InputMonetario style={inp} value={valor} onChange={setValor} /></div>
                <div><label style={lbl}>Data</label><InputData type="date" style={inp} value={data} onChange={e => setData(e.target.value)} /></div>
                <div><label style={lbl}>Vencimento previsto</label><InputData type="date" style={inp} value={venc} onChange={e => setVenc(e.target.value)} /></div>
                <div><label style={lbl}>Juros % a.m. (opcional)</label><input style={inp} value={taxa} onChange={e => setTaxa(e.target.value)} placeholder="0,00" /></div>
              </div>
            </>
          ) : (
            <>
              <div><label style={lbl}>Mútuo em aberto</label>
                <SelectBusca style={inp} value={mutuoId} onChange={setMutuoId} placeholder={abertos.length ? "— Escolha o mútuo —" : "Nenhum mútuo em aberto"}
                  options={abertos.map(m => ({ value: m.id, label: `${m.credor_nome ?? "?"} → ${m.devedor_nome ?? "?"} | ${fmtData(m.data_inicio)} | ${fmtBRL(m.valor_principal)} | saldo ${fmtBRL(m.saldo_devedor)}` }))} />
              </div>
              {mSel && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>{interna(pD) ? <><label style={lbl}>Conta de onde sai a devolução ({pD!.nome})</label>{selConta(contaDevedor, setContaDevedor)}</> : <div style={{ fontSize: 11, color: "var(--text-3)", paddingTop: 18 }}>{pD?.nome} é de fora: só a entrada de {pC?.nome} é lançada.</div>}</div>
                  <div>{interna(pC) ? <><label style={lbl}>Conta em que entra ({pC!.nome})</label>{selConta(contaCredor, setContaCredor)}</> : <div style={{ fontSize: 11, color: "var(--text-3)", paddingTop: 18 }}>{pC?.nome} é de fora: só a saída de {pD?.nome} é lançada.</div>}</div>
                  <div><label style={lbl}>Valor devolvido (saldo {fmtBRL(mSel.saldo_devedor)})</label><InputMonetario style={inp} value={valor} onChange={setValor} /></div>
                  <div><label style={lbl}>Data</label><InputData type="date" style={inp} value={data} onChange={e => setData(e.target.value)} /></div>
                </div>
              )}
            </>
          )}
          <div><label style={lbl}>Observação</label><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Mútuo não é receita nem despesa: os títulos entram já pagos, na categoria Mútuo, fora do LCDPR.</div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <OperationalButton data-arato-button="secondary" onClick={onClose} style={btnR}>Cancelar</OperationalButton>
          <OperationalButton data-arato-button="primary" onClick={salvar} disabled={salvando} style={{ ...btnV, opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvando…" : modo === "novo" ? "Lançar mútuo" : "Lançar devolução"}</OperationalButton>
        </div>
      </div>
    </div>
  );
}

/** Quadro dos mútuos do cliente: quem deve a quem, devoluções e saldo. */
export function PainelMutuos({ dados, onDevolver }: { dados: ReturnType<typeof useMutuos>; onDevolver: (mutuoId: string) => void }) {
  const { mutuos, pagamentos, erro, carregar } = dados;
  const [aberto, setAberto] = useState<string | null>(null);
  const [verQuitados, setVerQuitados] = useState(false);
  const lista = mutuos.filter(m => verQuitados || m.status !== "quitado");
  if (erro) return <div style={{ fontSize: 12, color: "#791F1F", marginTop: 14 }}>Mútuos: {erro}</div>;
  if (!mutuos.length) return null;
  const totalAberto = mutuos.filter(m => m.status !== "quitado").reduce((s, m) => s + Number(m.saldo_devedor), 0);
  async function acao(body: Record<string, unknown>, pergunta: string) {
    if (!confirm(pergunta)) return;
    try { await api(body); await carregar(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", marginTop: 18, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "0.5px solid var(--border-table)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Mútuos {verQuitados ? "" : "em aberto"}</div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>Saldo em aberto: <strong>{fmtBRL(totalAberto)}</strong></div>
        <label style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={verQuitados} onChange={e => setVerQuitados(e.target.checked)} /> mostrar quitados
        </label>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "var(--bg-page)" }}>
          {["", "Quem emprestou", "Quem recebeu", "Data", "Valor", "Devolvido", "Saldo", "Status", ""].map((h, i) => <th key={i} style={{ padding: "8px 10px", textAlign: i >= 4 && i <= 6 ? "right" : "left", fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {lista.map(m => {
            const devs = pagamentos.filter(p => p.mutuo_id === m.id);
            const devolvido = devs.reduce((s, p) => s + Number(p.valor_total), 0);
            return [
              <tr key={m.id} style={{ borderTop: "0.5px solid var(--border-row)" }}>
                <td style={{ padding: "8px 10px", width: 20 }}>{devs.length > 0 && <button type="button" onClick={() => setAberto(a => a === m.id ? null : m.id)} style={{ background: "none", border: "none", cursor: "pointer" }}>{aberto === m.id ? "▾" : "▸"}</button>}</td>
                <td style={{ padding: "8px 10px" }}>{m.credor_nome ?? m.contraparte}</td>
                <td style={{ padding: "8px 10px" }}>{m.devedor_nome ?? "—"}</td>
                <td style={{ padding: "8px 10px" }}>{fmtData(m.data_inicio)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(m.valor_principal)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(devolvido)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{fmtBRL(m.saldo_devedor)}</td>
                <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: m.status === "quitado" ? "#DCFCE7" : "#E6F1FB", color: m.status === "quitado" ? "#166534" : "#0C447C" }}>{m.status === "quitado" ? "Quitado" : "Em aberto"}</span></td>
                <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {m.status !== "quitado" && <button type="button" onClick={() => onDevolver(m.id)} style={{ fontSize: 11, color: "#1A4870", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Devolução</button>}
                  {devs.length === 0 && <button type="button" onClick={() => acao({ acao: "excluir", mutuo_id: m.id }, "Excluir este mútuo? Os títulos dele (saída e entrada) também são apagados.")} style={{ fontSize: 11, color: "#791F1F", background: "none", border: "none", cursor: "pointer", marginLeft: 8 }}>Excluir</button>}
                </td>
              </tr>,
              aberto === m.id && devs.map(p => (
                <tr key={p.id} style={{ background: "var(--bg-page)" }}>
                  <td /><td colSpan={2} style={{ padding: "6px 10px", color: "var(--text-2)" }}>↳ Devolução{p.observacao ? ` — ${p.observacao}` : ""}</td>
                  <td style={{ padding: "6px 10px" }}>{fmtData(p.data_pagamento)}</td><td />
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(p.valor_total)}</td><td colSpan={2} />
                  <td style={{ padding: "6px 10px", textAlign: "right" }}><button type="button" onClick={() => acao({ acao: "desfazer_devolucao", pagamento_id: p.id }, "Desfazer esta devolução? Os títulos dela são apagados e o saldo do mútuo volta.")} style={{ fontSize: 11, color: "#791F1F", background: "none", border: "none", cursor: "pointer" }}>Desfazer</button></td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
