"use client";
// Retornos — tela própria para a NF de RETORNO de mercadoria remetida (armazém geral, depósito, condomínio logístico:
// ex. LUFT devolvendo o que foi remetido para armazenagem). Diretriz do dono 27/10/2026: processamento de compra,
// remessa e retorno em telas separadas, cada uma com as suas variáveis (a NF de retorno era tratada como compra: pedido
// de compra, CP). Aqui: liga à remessa, associa os itens ao cadastro, escolhe o depósito e processa — os itens voltam ao
// estoque, sem Contas a Pagar (CFOP de retorno não gera título, lib/cfop-imobilizado CFOPS_RETORNO_ARMAZENAGEM).
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import SelectBusca from "../../../components/SelectBusca";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { supabase } from "../../../lib/supabase";
import type { Deposito, Insumo, NfEntrada, NfEntradaItem, NfRemessaLogistica } from "../../../lib/supabase";
import {
  listarInsumosParaConta, listarDepositosMulti, listarNfRemessasLogisticas, listarNfEntradaItens,
  atualizarNfEntrada, atualizarNfRemessaLogistica, processarNfEntrada, insumoAtivo,
} from "../../../lib/db";
import { CFOPS_RETORNO_ARMAZENAGEM } from "../../../lib/cfop-imobilizado";
import { fatorUnidade } from "../../../lib/estoque/unidades";
import { hojeLocal } from "../../../lib/data-local";

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const fmtQtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dig = (s?: string | null) => String(s ?? "").replace(/\D/g, "");
const ehRetorno = (cfop?: string | null) => CFOPS_RETORNO_ARMAZENAGEM.has(dig(cfop));

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600 };
const th: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12, borderBottom: "0.5px solid var(--border-row)", verticalAlign: "top" };

type ItemEdit = { item: NfEntradaItem; insumo_id: string; qtd: string };

// Valor remetido: soma dos itens da remessa (o cabeçalho pode ter sido digitado errado); sem itens, o total da remessa
const valorRemetido = (r: NfRemessaLogistica) => {
  const its = Array.isArray(r.itens_json) ? (r.itens_json as { valor_total?: number }[]) : [];
  const soma = its.reduce((s, i) => s + Number(i.valor_total ?? 0), 0);
  return soma > 0 ? soma : Number(r.valor_total ?? 0);
};
const saldoRemessa = (r: NfRemessaLogistica) => Math.max(0, Math.round((valorRemetido(r) - Number(r.valor_retornado ?? 0)) * 100) / 100);

function RetornosConteudo() {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();
  const params = useSearchParams();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);

  const [nfs, setNfs] = useState<NfEntrada[]>([]);
  const [remessas, setRemessas] = useState<NfRemessaLogistica[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // NF em processamento
  const [nfSel, setNfSel] = useState<NfEntrada | null>(null);
  const [itens, setItens] = useState<ItemEdit[]>([]);
  const [remessaId, setRemessaId] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!ids.length || !contaId) return;
    setLoading(true);
    const [{ data: n }, rem, ins, dep] = await Promise.all([
      supabase.from("nf_entradas").select("*").in("fazenda_id", ids).in("status", ["pendente", "digitando"]).order("data_emissao", { ascending: false }).limit(2000),
      listarNfRemessasLogisticas(contaId),
      listarInsumosParaConta(contaId, fazendaId ?? undefined),
      listarDepositosMulti(ids),
    ]);
    setNfs(((n ?? []) as NfEntrada[]).filter(x => ehRetorno(x.cfop)));
    setRemessas(rem);
    setInsumos(ins.filter(insumoAtivo));
    setDepositos(dep);
    setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids.join(","), contaId]);

  const abertas = remessas.filter(r => r.status === "emitida");
  const insumoPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);

  async function abrir(nf: NfEntrada) {
    setErro(""); setMsg(""); setNfSel(nf);
    const its = await listarNfEntradaItens(nf.id);
    setItens(its.map(it => ({ item: it, insumo_id: it.insumo_id ?? "", qtd: String(it.qtd_nf ?? it.quantidade ?? 0) })));
    // remessa sugerida: a referenciada no XML; senão a única aberta do mesmo armazém
    const ref = (nf as unknown as { xml_content?: string }).xml_content?.match(/<refNFe>(\d{44})<\/refNFe>/)?.[1];
    const nome = (nf.emitente_nome ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
    const porNome = abertas.filter(r => nome && r.destinatario_nome.toUpperCase().includes(nome));
    setRemessaId((ref && abertas.find(r => r.nf_remessa_chave === ref)?.id) || (porNome.length === 1 ? porNome[0].id : ""));
    setDepositoId(depositos.find(d => d.fazenda_id === nf.fazenda_id && !["terceiro", "armazem_terceiro"].includes(d.tipo))?.id ?? "");
  }
  useEffect(() => {
    const id = params.get("nf");
    if (id && !nfSel && nfs.length) { const nf = nfs.find(x => x.id === id); if (nf) abrir(nf); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfs]);

  // Quantidade no cadastro: conversão segura (t→kg, lt→L); sem ela, o usuário informa a quantidade na unidade do cadastro
  function sugerirQtd(e: ItemEdit, insumoId: string): string {
    const ins = insumoPorId.get(insumoId);
    const qNf = Number(e.item.qtd_nf ?? e.item.quantidade ?? 0);
    const f = ins ? fatorUnidade(e.item.unidade_nf ?? e.item.unidade, ins.unidade) : 1;
    return f == null ? "" : String(Math.round(qNf * f * 10000) / 10000);
  }

  async function processar() {
    if (!nfSel) return;
    const semInsumo = itens.filter(e => !e.insumo_id);
    if (semInsumo.length) { setErro("Associe todos os itens a um produto do cadastro."); return; }
    if (!depositoId) { setErro("Escolha o depósito para onde a mercadoria volta."); return; }
    const semQtd = itens.find(e => !(parseFloat(e.qtd.replace(",", ".")) > 0));
    if (semQtd) { setErro(`Informe a quantidade, na unidade do cadastro, de "${semQtd.item.descricao_nf ?? semQtd.item.descricao_produto}".`); return; }
    const rem = abertas.find(r => r.id === remessaId);
    if (rem && !("valor_retornado" in rem)) { setErro("Para ligar o retorno à remessa, rode antes a Seção 377 do supabase_migrations.sql (retorno parcial)."); return; }
    const valorNf = Number(nfSel.valor_total ?? 0);
    const fecha = rem ? valorNf >= saldoRemessa(rem) - 0.01 : false;
    if (!(await confirmarAcao({ titulo: "Processar retorno?", perigo: false,
      mensagem: `A NF ${nfSel.numero} de ${nfSel.emitente_nome} volta ao estoque (${depositos.find(d => d.id === depositoId)?.nome ?? ""}), sem Contas a Pagar.${rem ? (fecha ? ` A remessa NF ${rem.nf_remessa_numero} passa a Retornada.` : ` Retorno parcial da remessa NF ${rem.nf_remessa_numero}: depois deste, ainda falta ${fmtBRL(saldoRemessa(rem) - valorNf)} voltar.`) : " Nenhuma remessa vinculada."}` }))) return;
    setSalvando(true); setErro("");
    try {
      // itens: cadastro, depósito e quantidade na unidade do cadastro (estoque)
      for (const e of itens) {
        const ins = insumoPorId.get(e.insumo_id)!;
        const qtd = parseFloat(e.qtd.replace(",", "."));
        const qNf = Number(e.item.qtd_nf ?? e.item.quantidade ?? 0);
        const { error } = await supabase.from("nf_entrada_itens").update({
          insumo_id: e.insumo_id, deposito_id: depositoId, tipo_apropiacao: "estoque",
          descricao_produto: ins.nome, unidade: ins.unidade, quantidade: qtd,
          qtd_nf: qNf, unidade_nf: e.item.unidade_nf ?? e.item.unidade, fator_conversao: qNf > 0 ? qtd / qNf : 1,
        }).eq("id", e.item.id);
        if (error) throw error;
      }
      const itensDB = await listarNfEntradaItens(nfSel.id);
      await processarNfEntrada(nfSel.id, nfSel.fazenda_id, itensDB, Number(nfSel.valor_total ?? 0), nfSel.emitente_nome,
        nfSel.data_entrada ?? nfSel.data_emissao, nfSel.emitente_cnpj, { nfeNumero: nfSel.numero, tipoEntrada: "insumos", anoSafraId: nfSel.ano_safra_id, cicloId: nfSel.ciclo_id });
      await atualizarNfEntrada(nfSel.id, { status: "processada", processado_por: nomeUsuario ?? undefined });
      if (rem) {
        // Retorno parcial: acumula; a remessa só fica Retornada quando volta tudo (Seção 377)
        const retornos = [...(rem.retornos ?? []), { numero: nfSel.numero, chave: nfSel.chave_acesso ?? null, data: nfSel.data_emissao ?? null, valor: valorNf, emitente: nfSel.emitente_nome }];
        await atualizarNfRemessaLogistica(rem.id, {
          ...(fecha ? { status: "retornada" as const } : {}),
          valor_retornado: Math.round((Number(rem.valor_retornado ?? 0) + valorNf) * 100) / 100, retornos,
          nf_retorno_chave: nfSel.chave_acesso || undefined, nf_retorno_numero: nfSel.numero,
          nf_retorno_data: nfSel.data_emissao || hojeLocal(),
          observacao: [rem.observacao, `Retorno${fecha ? "" : " parcial"}: NF ${nfSel.numero} recebida de ${nfSel.emitente_nome} (${fmtBRL(valorNf)})`].filter(Boolean).join(" | "),
        });
      }
      setMsg(`✓ NF ${nfSel.numero} processada: mercadoria de volta ao estoque${rem ? ` e remessa NF ${rem.nf_remessa_numero} retornada` : ""}.`);
      setNfSel(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao processar o retorno.");
    } finally {
      setSalvando(false);
    }
  }

  const depositosProprios = depositos.filter(d => !nfSel || d.fazenda_id === nfSel.fazenda_id);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <main style={{ padding: "16px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Retornos</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>NF de retorno de mercadoria remetida (armazém geral, depósito, condomínio logístico). Volta ao estoque, ligada à remessa, sem Contas a Pagar.</div>
          </div>
        </OperationalHeading>

        {msg && <div style={{ marginTop: 12, padding: 10, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 13 }}>{msg}</div>}

        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>NF de retorno recebidas, a processar <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· CFOP 5906/6906/5907/6907/1906/2906… chegadas pelo SIEG, XML ou digitadas</span></h2>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["Nº", "Emissão", "Emitente", "CFOP", "Natureza", "Valor", ""].map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 20 }}>Carregando…</td></tr>}
                {!loading && nfs.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 20 }}>Nenhuma NF de retorno pendente.</td></tr>}
                {nfs.map(n => (
                  <tr key={n.id} style={{ background: nfSel?.id === n.id ? "#D5E8F5" : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>{n.numero}{n.serie ? `/${n.serie}` : ""}</td>
                    <td style={td}>{fmtData(n.data_emissao)}</td>
                    <td style={td}>{n.emitente_nome}<div style={{ fontSize: 11, color: "var(--text-3)" }}>{n.emitente_cnpj}</div></td>
                    <td style={td}>{n.cfop}</td>
                    <td style={td}>{n.natureza ?? "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(n.valor_total)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <OperationalButton data-arato-button="primary" onClick={() => abrir(n)} style={{ padding: "5px 12px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Processar retorno</OperationalButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {nfSel && (
          <section style={{ marginTop: 16, background: "var(--bg-card)", border: "1px solid #1A4870", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Retorno — NF {nfSel.numero} · {nfSel.emitente_nome} · {fmtBRL(nfSel.valor_total)}</h2>
              <button type="button" onClick={() => setNfSel(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Remessa que está retornando</label>
                <select value={remessaId} onChange={e => setRemessaId(e.target.value)} style={inp}>
                  <option value="">— não vincular a nenhuma remessa —</option>
                  {abertas.map(r => (
                    <option key={r.id} value={r.id}>NF {r.nf_remessa_numero ?? "s/nº"}{r.nf_remessa_data ? ` de ${fmtData(r.nf_remessa_data)}` : ""} · {r.destinatario_nome} · CFOP {r.cfop_remessa} · falta voltar {fmtBRL(saldoRemessa(r))}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>{abertas.length === 0 ? "Nenhuma remessa aguardando retorno." : "Ao processar, a remessa escolhida passa a Retornada com os dados desta NF."}</div>
              </div>
              <div>
                <label style={lbl}>Depósito para onde a mercadoria volta</label>
                <select value={depositoId} onChange={e => setDepositoId(e.target.value)} style={inp}>
                  <option value="">Selecionar…</option>
                  {depositosProprios.map(d => <option key={d.id} value={d.id}>{d.nome}{["terceiro", "armazem_terceiro"].includes(d.tipo) ? " (terceiro)" : ""}</option>)}
                </select>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Item da NF", "Qtd na NF", "Produto do cadastro", "Qtd no cadastro", "Valor"].map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {itens.map((e, i) => {
                  const ins = insumoPorId.get(e.insumo_id);
                  return (
                    <tr key={e.item.id}>
                      <td style={td}>{e.item.descricao_nf ?? e.item.descricao_produto}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtQtd(Number(e.item.qtd_nf ?? e.item.quantidade ?? 0))} {e.item.unidade_nf ?? e.item.unidade}</td>
                      <td style={{ ...td, minWidth: 280 }}>
                        <SelectBusca value={e.insumo_id} placeholder="Associar ao cadastro…"
                          onChange={v => setItens(p => p.map((x, j) => j === i ? { ...x, insumo_id: v, qtd: sugerirQtd(x, v) } : x))}
                          options={insumos.map(s => ({ value: s.id, label: `${s.nome} (${s.unidade})` }))} />
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <input value={e.qtd} onChange={ev => setItens(p => p.map((x, j) => j === i ? { ...x, qtd: ev.target.value } : x))} style={{ ...inp, width: 110, display: "inline-block" }} />
                        <span style={{ marginLeft: 6, fontSize: 12, color: "var(--text-3)" }}>{ins?.unidade ?? ""}</span>
                        {ins && !e.qtd && <div style={{ fontSize: 10, color: "#B45309" }}>Sem conversão de {e.item.unidade_nf ?? e.item.unidade} para {ins.unidade}: informe</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(e.item.valor_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {erro && <div style={{ marginTop: 12, padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{erro}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <OperationalButton data-arato-button="secondary" onClick={() => setNfSel(null)} style={{ padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, cursor: "pointer" }}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={processar} disabled={salvando} style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{salvando ? "Processando…" : "Processar retorno"}</OperationalButton>
            </div>
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>Remessas aguardando retorno <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· para emitir o retorno pelo Arato ou registrar um retorno emitido fora, use Retorno de Insumo</span></h2>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr>{["NF remessa", "Data", "Destinatário", "CFOP", "Remetido", "Já voltou", "Falta voltar"].map(h => <th key={h} style={{ ...th, textAlign: ["Remetido", "Já voltou", "Falta voltar"].includes(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {abertas.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 16 }}>Nenhuma remessa aguardando retorno.</td></tr>}
                {abertas.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.nf_remessa_numero ?? "—"}</td>
                    <td style={td}>{fmtData(r.nf_remessa_data)}</td>
                    <td style={td}>{r.destinatario_nome}</td>
                    <td style={td}>{r.cfop_remessa}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(valorRemetido(r))}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(r.valor_retornado ?? 0)}{(r.retornos?.length ?? 0) > 0 && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.retornos!.map(x => `NF ${x.numero}`).join(", ")}</div>}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBRL(saldoRemessa(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function RetornosPage() {
  return <Suspense fallback={null}><RetornosConteudo /></Suspense>;
}
