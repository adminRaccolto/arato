"use client";
// Rastreabilidade de item: o caminho do produto no período — origens (NF de fornecedor, saldo anterior, ajustes,
// produção) → depósitos (com as transferências e remessas entre eles) → destinos (consumo por ciclo/operação, perdas,
// devoluções) e o saldo final em cada depósito. Regra em lib/estoque/rastreio-fluxo.ts (testada). Só leitura.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import InputData from "../../../components/InputData";
import SelectBusca from "../../../components/SelectBusca";
import Sankey, { type SankeyNo } from "../../../components/graficos/Sankey";
import { OperationalHeading } from "../../../components/OperationalUI";
import { supabase } from "../../../lib/supabase";
import { hojeLocal } from "../../../lib/data-local";
import { listarInsumosParaConta, listarSaldoPorDeposito, insumoAtivo } from "../../../lib/db";
import type { Insumo } from "../../../lib/supabase";
import { montarFluxo, type MovRastreio } from "../../../lib/estoque/rastreio-fluxo";

const COR = { origem: "#378ADD", deposito: "#1A4870", destino: "#C9921B", saldo: "#16A34A", perda: "#E24B4A" };
const inp: CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)" };
const lbl: CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" };
const th: CSSProperties = { padding: "7px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "right", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)" };
const td: CSSProperties = { padding: "6px 10px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: "0.5px solid var(--border-table)" };
const fmtQ = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const inicioAno = () => `${new Date().getFullYear()}-01-01`;

type MovBanco = { id: string; tipo: string; quantidade: number; data: string; created_at: string; motivo: string | null; observacao: string | null;
  deposito_id: string | null; nf_entrada_id: string | null; ciclo_id: string | null; operacao: string | null; romaneio_entrada_id: string | null; fazenda_id: string };

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function RastreabilidadeItem() {
  const { fazendaIds, fazendaId, contaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [insumoId, setInsumoId] = useState("");
  const [de, setDe] = useState(inicioAno());
  const [ate, setAte] = useState(hojeLocal());
  const [movs, setMovs] = useState<MovRastreio[]>([]);
  const [anteriores, setAnteriores] = useState<MovRastreio[]>([]);
  const [depNomes, setDepNomes] = useState<Map<string, string>>(new Map());
  const [saldoSistema, setSaldoSistema] = useState<Map<string, number>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!contaId && !ids.length) return;
    listarInsumosParaConta(contaId ?? null, ids[0]).then(l => setInsumos(l.filter(insumoAtivo))).catch(() => setInsumos([]));
    // Depósitos com o nome da fazenda (o mesmo nome pode existir em duas fazendas)
    (async () => {
      const [{ data: deps }, { data: fz }] = await Promise.all([
        supabase.from("depositos").select("id, nome, fazenda_id").in("fazenda_id", ids),
        supabase.from("fazendas").select("id, nome").in("id", ids),
      ]);
      const nomeFaz = new Map((fz ?? []).map(f => [f.id as string, f.nome as string]));
      setDepNomes(new Map((deps ?? []).map(d => [d.id as string, ids.length > 1 ? `${d.nome} (${nomeFaz.get(d.fazenda_id as string) ?? ""})` : (d.nome as string)])));
    })();
  }, [contaId, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!insumoId || !ids.length) { setMovs([]); setAnteriores([]); return; }
    (async () => {
      setCarregando(true); setErro("");
      try {
        const brutos = await todas<MovBanco>((a, b) => supabase.from("movimentacoes_estoque")
          .select("id, tipo, quantidade, data, created_at, motivo, observacao, deposito_id, nf_entrada_id, ciclo_id, operacao, romaneio_entrada_id, fazenda_id")
          .eq("insumo_id", insumoId).in("fazenda_id", ids).lte("data", ate).order("id").range(a, b));
        const nfIds = [...new Set(brutos.map(m => m.nf_entrada_id).filter((x): x is string => !!x))];
        const cicloIds = [...new Set(brutos.map(m => m.ciclo_id).filter((x): x is string => !!x))];
        const nfs = new Map<string, { numero: string; emitente_nome: string }>();
        for (let k = 0; k < nfIds.length; k += 200) {
          const { data } = await supabase.from("nf_entradas").select("id, numero, emitente_nome").in("id", nfIds.slice(k, k + 200));
          for (const n of data ?? []) nfs.set(n.id as string, { numero: n.numero as string, emitente_nome: n.emitente_nome as string });
        }
        const ciclos = new Map<string, string>();
        for (let k = 0; k < cicloIds.length; k += 200) {
          const { data } = await supabase.from("ciclos").select("id, descricao, cultura").in("id", cicloIds.slice(k, k + 200));
          for (const c of data ?? []) ciclos.set(c.id as string, (c.descricao as string) || (c.cultura as string) || "Ciclo");
        }
        const conv = (m: MovBanco): MovRastreio => ({
          ...m, quantidade: Number(m.quantidade ?? 0), deposito_nome: m.deposito_id ? depNomes.get(m.deposito_id) ?? null : null,
          emitente_nome: m.nf_entrada_id ? nfs.get(m.nf_entrada_id)?.emitente_nome ?? null : null, nf_numero: m.nf_entrada_id ? nfs.get(m.nf_entrada_id)?.numero ?? null : null,
          ciclo_descricao: m.ciclo_id ? ciclos.get(m.ciclo_id) ?? null : null,
        });
        setAnteriores(brutos.filter(m => m.data < de).map(conv));
        setMovs(brutos.filter(m => m.data >= de).map(conv));
        const saldos = await listarSaldoPorDeposito(ids);
        // A view separa o saldo por fazenda dona do produto: um depósito pode ter várias linhas — soma
        const porDep = new Map<string, number>();
        for (const r of saldos) if (r.insumo_id === insumoId) { const k = r.deposito_id ?? "__sem_deposito"; porDep.set(k, (porDep.get(k) ?? 0) + Number(r.saldo)); }
        setSaldoSistema(porDep);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setCarregando(false);
      }
    })();
  }, [insumoId, de, ate, ids.join(","), depNomes]); // eslint-disable-line react-hooks/exhaustive-deps

  const fluxo = useMemo(() => montarFluxo(movs, anteriores, id => (id ? depNomes.get(id) : null) ?? "Depósito"), [movs, anteriores, depNomes]);
  const ins = insumos.find(i => i.id === insumoId);
  const nosSankey: SankeyNo[] = fluxo.nos.map(n => ({
    id: n.id, rotulo: n.rotulo,
    cor: n.tipo === "origem" ? COR.origem : n.tipo === "deposito" ? COR.deposito : n.tipo === "saldo" ? COR.saldo : /perda|ajuste|devolu/i.test(n.rotulo) ? COR.perda : COR.destino,
    coluna: n.tipo === "origem" ? 0 : undefined,
  }));
  // Saldos e destinos ficam todos na última coluna
  const colDeps = (() => {
    const deps = fluxo.nos.filter(n => n.tipo === "deposito").map(n => n.id);
    const col = new Map(deps.map(d => [d, 1]));
    for (let i = 0; i < deps.length; i++) for (const e of fluxo.elos) if (col.has(e.de) && col.has(e.para) && col.get(e.para)! <= col.get(e.de)! && col.get(e.de)! < deps.length) col.set(e.para, col.get(e.de)! + 1);
    return col;
  })();
  const ultima = Math.max(1, ...colDeps.values()) + 1;
  for (const n of nosSankey) {
    if (colDeps.has(n.id)) n.coluna = colDeps.get(n.id);
    else if (n.coluna == null) n.coluna = ultima;
  }
  const comparaSistema = ate >= hojeLocal();
  const total = fluxo.saldos.reduce((a, s) => ({ anterior: a.anterior + s.anterior, entradas: a.entradas + s.entradas, saidas: a.saidas + s.saidas, final: a.final + s.final }), { anterior: 0, entradas: 0, saidas: 0, final: 0 });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ padding: "14px 20px" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ marginBottom: 10 }}>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Rastreabilidade do Item</h1>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>De onde o produto veio, por quais depósitos passou e para onde foi — e quanto ficou em cada depósito.</div>
        </OperationalHeading>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ flex: "2 1 320px" }}>
            <label style={lbl}>Item *</label>
            <SelectBusca value={insumoId} onChange={setInsumoId} style={{ ...inp, width: "100%" }} placeholder="Escolha o insumo"
              options={insumos.map(i => ({ value: i.id, label: `${i.nome} (${i.unidade})` }))} />
          </div>
          <div><label style={lbl}>De</label><InputData type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Até</label><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-2)", paddingBottom: 8, flexWrap: "wrap" }}>
            {([["Origem", COR.origem], ["Depósito", COR.deposito], ["Consumo / saída", COR.destino], ["Perda / ajuste", COR.perda], ["Saldo final", COR.saldo]] as const).map(([r, c]) =>
              <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{r}</span>)}
          </div>
        </div>

        {erro && <div style={{ padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{erro}</div>}

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 14, marginBottom: 10 }}>
          {!insumoId ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Escolha um item para ver o caminho dele.</div>
            : carregando ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Montando o caminho…</div>
            : !fluxo.elos.length ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhuma movimentação deste item até {ate.split("-").reverse().join("/")}.</div>
            : <Sankey nos={nosSankey} elos={fluxo.elos.map(e => ({ de: e.de, para: e.para, valor: e.quantidade }))} formatar={fmtQ} unidade={ins?.unidade ?? ""} />}
        </div>

        {insumoId && fluxo.saldos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 10, alignItems: "start" }}>
            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto" }}>
              <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#0B2D50" }}>Saldo por depósito ({ins?.unidade})</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>Depósito</th><th style={th}>Saldo em {de.split("-").reverse().join("/")}</th><th style={th}>Entradas</th><th style={th}>Saídas</th><th style={th}>Saldo pelo caminho</th>
                  {comparaSistema && <th style={th}>Saldo do sistema</th>}
                </tr></thead>
                <tbody>
                  {fluxo.saldos.map(s => {
                    const sis = saldoSistema.get(s.deposito_id) ?? 0;
                    const dif = comparaSistema && Math.abs(sis - s.final) > 0.0005;
                    return (
                      <tr key={s.deposito_id}>
                        <td style={{ ...td, textAlign: "left" }}>{s.nome}</td>
                        <td style={td}>{fmtQ(s.anterior)}</td><td style={td}>{fmtQ(s.entradas)}</td><td style={td}>{fmtQ(s.saidas)}</td>
                        <td style={{ ...td, fontWeight: 600, color: s.final < -0.0005 ? "#B91C1C" : "var(--text-1)" }}>{fmtQ(s.final)}</td>
                        {comparaSistema && <td style={{ ...td, color: dif ? "#B91C1C" : "var(--text-2)" }} title={dif ? "Diferente do saldo por depósito do sistema" : ""}>{fmtQ(sis)}</td>}
                      </tr>
                    );
                  })}
                  <tr style={{ background: "var(--bg-page)", fontWeight: 600 }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>Total</td>
                    <td style={td}>{fmtQ(total.anterior)}</td><td style={td}>{fmtQ(total.entradas)}</td><td style={td}>{fmtQ(total.saidas)}</td><td style={{ ...td, fontWeight: 700 }}>{fmtQ(total.final)}</td>
                    {comparaSistema && <td style={td}>{fmtQ([...saldoSistema.values()].reduce((a, b) => a + b, 0))}</td>}
                  </tr>
                </tbody>
              </table>
              <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)" }}>Entradas e saídas incluem as transferências entre depósitos. Saldo negativo em vermelho indica saída lançada num depósito que não tinha o produto.</div>
            </div>
            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: 420 }}>
              <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#0B2D50" }}>Caminho ({fluxo.elos.length} trechos)</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>De</th><th style={{ ...th, textAlign: "left" }}>Para</th><th style={th}>Quantidade</th></tr></thead>
                <tbody>
                  {fluxo.elos.map(e => (
                    <tr key={`${e.de}→${e.para}`}>
                      <td style={{ ...td, textAlign: "left" }}>{fluxo.nos.find(n => n.id === e.de)?.rotulo}</td>
                      <td style={{ ...td, textAlign: "left" }}>{fluxo.nos.find(n => n.id === e.para)?.rotulo}</td>
                      <td style={td}>{fmtQ(e.quantidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
