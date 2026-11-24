"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Relatório "Compras por Produto" (19/11/2026, pedido do dono): só o movimento de entrada fiscal de compra,
// agrupado por produto. Regras do que é compra em lib/relatorios/compras-produto.ts (NF processada + CFOP de compra;
// fora remessa, retorno, transferência, devolução, bonificação e simples faturamento de entrega futura).
// Produto = item do cadastro quando a NF foi associada; sem associação (apropriação direta), a descrição da NF.
// Só leitura, por cliente (todas as fazendas da conta), com filtro opcional de fazenda.
// ═══════════════════════════════════════════════════════════════════════════
import { Fragment, useEffect, useMemo, useState } from "react";
import TopNav from "../../../components/TopNav";
import PlanoGate from "../../../components/PlanoGate";
import InputData from "../../../components/InputData";
import SelectField from "../../../components/SelectField";
import BotoesExportar from "../../../components/relatorios/BotoesExportar";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { hojeLocal } from "../../../lib/data-local";
import { listarGruposInsumoDaConta, listarInsumosParaConta } from "../../../lib/db";
import type { RelatorioExport } from "../../../lib/relatorios/tabela-exportavel";
import {
  APROPRIACAO_ROTULO, montarComprasPorProduto,
  type Abrangencia, type InsumoInfo, type ItemCompra, type NfCompra, type ProdutoCompra,
} from "../../../lib/relatorios/compras-produto";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (v: number, d = 3) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtUnit = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtData = (s: string) => (s ? s.split("-").reverse().join("/") : "—");

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", width: "100%", boxSizing: "border-box", minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", fontWeight: 600, display: "block", marginBottom: 4 };
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "left", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap", background: "var(--bg-page)" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderBottom: "0.5px solid var(--border-table)", color: "var(--text-1)" };
const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function inicioDoAno(): string { return `${hojeLocal().slice(0, 4)}-01-01`; }

/** Lê tudo, 1.000 linhas por vez, com ordem única por id (sem ela a paginação repete/pula linhas). */
async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export default function ComprasPorProdutoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();
  const idsConta = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);

  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [insumos, setInsumos] = useState<Map<string, InsumoInfo>>(new Map());

  const [de, setDe] = useState(inicioDoAno());
  const [ate, setAte] = useState(hojeLocal());
  const [fFazenda, setFFazenda] = useState("");
  const [fProduto, setFProduto] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fApropriacao, setFApropriacao] = useState("");
  const [soCadastro, setSoCadastro] = useState(false);
  const [visao, setVisao] = useState<"sintetico" | "analitico">("sintetico");
  // 24/11/2026: "entradas" = toda entrada fiscal (regra da coluna Fiscal do Auditor de Estoque); "compras" = só CFOP de compra
  const [abrangencia, setAbrangencia] = useState<Abrangencia>("entradas");
  // Vindo do Auditor de Estoque (clique no Fiscal): um item, posição até a data do Auditor, nota a nota
  const [fInsumoId, setFInsumoId] = useState("");
  const [gerarAoAbrir, setGerarAoAbrir] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const insumo = q.get("insumo");
    if (!insumo) return;
    setFInsumoId(insumo);
    setDe(q.get("de") || "2000-01-01");
    if (q.get("ate")) setAte(q.get("ate")!);
    if (q.get("fazenda")) setFFazenda(q.get("fazenda")!);
    setAbrangencia(q.get("abrangencia") === "compras" ? "compras" : "entradas");
    setVisao("analitico");
    setGerarAoAbrir(true);
  }, []);

  const [dados, setDados] = useState<{ nfs: NfCompra[]; itens: ItemCompra[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!idsConta.length) return;
    let vivo = true;
    (async () => {
      const [{ data: fz }, ins, grs] = await Promise.all([
        supabase.from("fazendas").select("id, nome").in("id", idsConta).order("nome"),
        listarInsumosParaConta(contaId, fazendaId ?? undefined).catch(() => []),
        listarGruposInsumoDaConta(fazendaId).catch(() => []),
      ]);
      if (!vivo) return;
      const nomeGrupo = new Map(grs.map(g => [g.id, g.nome]));
      setFazendas((fz ?? []) as { id: string; nome: string }[]);
      setGrupos([...new Set(grs.map(g => g.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")));
      setInsumos(new Map(ins.map(i => [i.id, { nome: i.nome, unidade: i.unidade ?? null, grupo: (i.grupo_id && nomeGrupo.get(i.grupo_id)) || null }])));
    })();
    return () => { vivo = false; };
  }, [idsConta, contaId, fazendaId]);

  async function gerar() {
    setErro("");
    if (!de || !ate || de > ate) { setErro("Informe um período válido."); return; }
    const fids = fFazenda ? [fFazenda] : idsConta;
    if (!fids.length) { setErro("Nenhuma fazenda do cliente encontrada."); return; }
    setCarregando(true);
    try {
      // Data do movimento = data de entrada; sem ela, a de emissão
      const periodo = `and(data_entrada.gte.${de},data_entrada.lte.${ate}),and(data_entrada.is.null,data_emissao.gte.${de},data_emissao.lte.${ate})`;
      const nfs = await lerTudo<NfCompra>((a, b) => supabase.from("nf_entradas")
        .select("id, fazenda_id, numero, serie, emitente_nome, data_emissao, data_entrada, status, tipo_entrada, cfop")
        .in("fazenda_id", fids).eq("status", "processada").or(periodo).order("id").range(a, b));
      const ids = nfs.map(n => n.id);
      const itens: ItemCompra[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const lote = ids.slice(i, i + 150);
        itens.push(...await lerTudo<ItemCompra>((a, b) => supabase.from("nf_entrada_itens")
          .select("id, nf_entrada_id, insumo_id, descricao_produto, unidade, quantidade, valor_total, cfop, tipo_apropiacao")
          .in("nf_entrada_id", lote).order("id").range(a, b)));
      }
      setDados({ nfs, itens });
      setAberto(new Set());
    } catch (e) {
      setErro(`Não foi possível carregar as notas: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setCarregando(false); }
  }

  useEffect(() => {
    if (!gerarAoAbrir || !idsConta.length) return;
    setGerarAoAbrir(false);
    void gerar();
  }, [gerarAoAbrir, idsConta]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeFazenda = useMemo(() => new Map(fazendas.map(f => [f.id, f.nome])), [fazendas]);
  const produtos: ProdutoCompra[] = useMemo(() => dados ? montarComprasPorProduto({
    nfs: dados.nfs, itens: dados.itens, insumos, fazendas: nomeFazenda,
    filtroProduto: fProduto, filtroFornecedor: fFornecedor, filtroGrupo: fGrupo, filtroApropriacao: fApropriacao, soCadastro,
    abrangencia, filtroInsumoId: fInsumoId || undefined,
  }) : [], [dados, insumos, nomeFazenda, fProduto, fFornecedor, fGrupo, fApropriacao, soCadastro, abrangencia, fInsumoId]);

  const totalValor = produtos.reduce((s, p) => s + p.valorTotal, 0);
  const totalNfs = new Set(produtos.flatMap(p => p.movimentos.map(m => `${m.nf}|${m.fornecedor}`))).size;

  const alternar = (k: string) => setAberto(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function filtrosAplicados() {
    return [
      { rotulo: "Período", valor: `${fmtData(de)} a ${fmtData(ate)}` },
      { rotulo: "Entradas", valor: abrangencia === "entradas" ? "Todas as entradas fiscais" : "Somente compras" },
      { rotulo: "Item (do Auditor de Estoque)", valor: fInsumoId ? insumos.get(fInsumoId)?.nome ?? fInsumoId : "" },
      { rotulo: "Fazenda", valor: fFazenda ? nomeFazenda.get(fFazenda) ?? "" : "Todas" },
      { rotulo: "Produto", valor: fProduto },
      { rotulo: "Fornecedor", valor: fFornecedor },
      { rotulo: "Grupo", valor: fGrupo },
      { rotulo: "Apropriação", valor: fApropriacao ? APROPRIACAO_ROTULO[fApropriacao] : "" },
      { rotulo: "Somente produtos do cadastro", valor: soCadastro ? "Sim" : "" },
      { rotulo: "Visão", valor: visao === "sintetico" ? "Sintético" : "Analítico" },
    ];
  }

  const titulo = abrangencia === "entradas" ? "Entradas Fiscais por Produto" : "Compras por Produto";
  const rotuloValor = abrangencia === "entradas" ? "Valor das entradas" : "Valor comprado";

  function exportar(): RelatorioExport {
    const resumo = [
      { rotulo: "Produtos", valor: String(produtos.length) },
      { rotulo: "Notas fiscais", valor: String(totalNfs) },
      { rotulo: rotuloValor, valor: fmtBRL(totalValor) },
    ];
    const sintetico = {
      titulo: abrangencia === "entradas" ? "Entradas fiscais por produto" : "Compras por produto",
      colunas: [
        { rotulo: "Produto" }, { rotulo: "Grupo" }, { rotulo: "Un." },
        { rotulo: "Quantidade", tipo: "numero" as const }, { rotulo: "Valor total", tipo: "moeda" as const },
        { rotulo: "Preço médio", tipo: "moeda" as const }, { rotulo: "Último preço", tipo: "moeda" as const },
        { rotulo: abrangencia === "entradas" ? "Última entrada" : "Última compra", tipo: "data" as const }, { rotulo: "NFs", tipo: "numero" as const }, { rotulo: "Fornecedores", tipo: "numero" as const },
      ],
      linhas: produtos.map(p => [p.produto, p.grupo || (p.doCadastro ? "" : "Sem cadastro"), p.unidade, p.quantidade, p.valorTotal,
        Math.round(p.precoMedio * 10000) / 10000, Math.round(p.ultimoPreco * 10000) / 10000, p.ultimaData, p.nfs, p.fornecedores]),
      total: ["Total", "", "", null, Math.round(totalValor * 100) / 100, null, null, "", totalNfs, null],
    };
    const analitico = {
      titulo: "Movimento de entrada por produto",
      colunas: [
        { rotulo: "Produto" }, { rotulo: "Data entrada", tipo: "data" as const }, { rotulo: "NF" }, { rotulo: "Fornecedor" }, { rotulo: "Fazenda" },
        { rotulo: "CFOP" }, { rotulo: "Apropriação" }, { rotulo: "Un." }, { rotulo: "Quantidade", tipo: "numero" as const },
        { rotulo: "Valor unitário", tipo: "moeda" as const }, { rotulo: "Valor total", tipo: "moeda" as const },
      ],
      linhas: produtos.flatMap(p => p.movimentos.map(m => [p.produto, m.data, m.nf, m.fornecedor, m.fazenda, m.cfop, m.apropriacao, m.unidade,
        m.quantidade, Math.round(m.valorUnitario * 10000) / 10000, m.valorTotal])),
      total: ["Total", "", "", "", "", "", "", "", null, null, Math.round(totalValor * 100) / 100],
    };
    return {
      titulo, tipoArquivo: abrangencia === "entradas" ? "ENTRADAS FISCAIS POR PRODUTO" : "COMPRAS POR PRODUTO", filtros: filtrosAplicados(), orientacao: "landscape", resumo,
      secoes: [visao === "sintetico" ? sintetico : analitico],
      planilhas: [{ ...sintetico, nome: "Por produto" }, { ...analitico, nome: "Movimento" }],
    };
  }

  return (
    <div data-arato-page="true" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <PlanoGate modulo="compras">
          <OperationalHeading as="header" data-arato-page-heading="true" style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px" }}>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>{titulo}</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {abrangencia === "entradas"
                ? "Todas as NFs de entrada processadas, nota a nota por produto — a mesma base da coluna Fiscal do Auditor de Estoque. Só o retorno/remessa de armazém fica de fora."
                : "Só compras (NF processada com CFOP de compra). Remessa, retorno, transferência, devolução, bonificação e simples faturamento de entrega futura ficam de fora."}
            </div>
          </OperationalHeading>

          <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <section style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                <div><label style={lbl}>Entradas</label>
                  <SelectField value={abrangencia} onChange={e => setAbrangencia(e.target.value as Abrangencia)} style={inp}>
                    <option value="entradas">Todas as entradas fiscais</option>
                    <option value="compras">Somente compras</option>
                  </SelectField>
                </div>
                <div><label style={lbl}>Entrada de</label><InputData value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Até</label><InputData value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Fazenda</label>
                  <SelectField value={fFazenda} onChange={e => setFFazenda(e.target.value)} style={inp}>
                    <option value="">Todas do cliente</option>
                    {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </SelectField>
                </div>
                <div><label style={lbl}>Produto</label>
                  {fInsumoId ? (
                    <div style={{ ...inp, display: "flex", alignItems: "center", gap: 6, background: "#D5E8F5" }} title="Item aberto pelo Auditor de Estoque">
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{insumos.get(fInsumoId)?.nome ?? "Item do Auditor"}</span>
                      <button type="button" onClick={() => setFInsumoId("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#0B2D50" }} aria-label="Tirar filtro do item">✕</button>
                    </div>
                  ) : <input value={fProduto} onChange={e => setFProduto(e.target.value)} placeholder="Nome ou descrição da NF" style={inp} />}
                </div>
                <div><label style={lbl}>Fornecedor</label><input value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} placeholder="Nome do emitente" style={inp} /></div>
                <div><label style={lbl}>Grupo</label>
                  <SelectField value={fGrupo} onChange={e => setFGrupo(e.target.value)} style={inp}>
                    <option value="">Todos</option>
                    {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                  </SelectField>
                </div>
                <div><label style={lbl}>Apropriação</label>
                  <SelectField value={fApropriacao} onChange={e => setFApropriacao(e.target.value)} style={inp}>
                    <option value="">Todas</option>
                    {Object.entries(APROPRIACAO_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                </div>
                <div><label style={lbl}>Visão</label>
                  <SelectField value={visao} onChange={e => setVisao(e.target.value as "sintetico" | "analitico")} style={inp}>
                    <option value="sintetico">Sintético (por produto)</option>
                    <option value="analitico">Analítico (nota a nota)</option>
                  </SelectField>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={soCadastro} onChange={e => setSoCadastro(e.target.checked)} />
                  Somente produtos do cadastro (itens associados na NF)
                </label>
                <OperationalButton data-arato-button="primary" onClick={() => void gerar()} disabled={carregando}
                  style={{ marginLeft: "auto", padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, opacity: carregando ? 0.6 : 1 }}>
                  {carregando ? "Carregando…" : "Gerar relatório"}
                </OperationalButton>
              </div>
              {erro && <div style={{ marginTop: 10, color: "#B42318", fontSize: 12 }}>{erro}</div>}
            </section>

            {dados && (
              <section style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 14px", borderBottom: "0.5px solid var(--border-table)", flexWrap: "wrap" }}>
                  <div><div style={{ fontSize: 11, color: "var(--text-3)" }}>Produtos</div><div style={{ fontSize: 16, fontWeight: 600 }}>{produtos.length}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--text-3)" }}>Notas fiscais</div><div style={{ fontSize: 16, fontWeight: 600 }}>{totalNfs}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--text-3)" }}>{rotuloValor}</div><div style={{ fontSize: 16, fontWeight: 600 }}>{fmtBRL(totalValor)}</div></div>
                  <div style={{ marginLeft: "auto" }}><BotoesExportar disabled={produtos.length === 0} gerar={exportar} /></div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  {visao === "sintetico" ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>
                        <th style={th}>Produto</th><th style={th}>Grupo</th><th style={th}>Un.</th>
                        <th style={{ ...th, textAlign: "right" }}>Quantidade</th><th style={{ ...th, textAlign: "right" }}>Valor total</th>
                        <th style={{ ...th, textAlign: "right" }}>Preço médio</th><th style={{ ...th, textAlign: "right" }}>Último preço</th>
                        <th style={th}>{abrangencia === "entradas" ? "Última entrada" : "Última compra"}</th><th style={{ ...th, textAlign: "right" }}>NFs</th><th style={{ ...th, textAlign: "right" }}>Fornecedores</th>
                      </tr></thead>
                      <tbody>
                        {produtos.length === 0 && <tr><td colSpan={10} style={{ ...td, color: "var(--text-3)", textAlign: "center", padding: 20 }}>Nenhuma entrada no período com esses filtros.</td></tr>}
                        {produtos.map(p => (
                          <Fragment key={p.chave}>
                            <tr onClick={() => alternar(p.chave)} style={{ cursor: "pointer" }} title="Ver as notas deste produto">
                              <td style={{ ...td, fontWeight: 600 }}>
                                <span style={{ color: "#1A4870", fontSize: 10, marginRight: 6 }}>{aberto.has(p.chave) ? "▼" : "▶"}</span>
                                {p.produto}
                              </td>
                              <td style={td}>{p.grupo || (p.doCadastro ? "—" : <span style={{ fontSize: 11, color: "#7A5200", background: "#FBF3E0", borderRadius: 4, padding: "1px 6px" }}>Sem cadastro</span>)}</td>
                              <td style={td}>{p.unidade || "—"}</td>
                              <td style={num}>{fmtN(p.quantidade)}</td>
                              <td style={{ ...num, fontWeight: 600 }}>{fmtBRL(p.valorTotal)}</td>
                              <td style={num}>{fmtUnit(p.precoMedio)}</td>
                              <td style={num}>{fmtUnit(p.ultimoPreco)}</td>
                              <td style={td}>{fmtData(p.ultimaData)}</td>
                              <td style={num}>{p.nfs}</td>
                              <td style={num}>{p.fornecedores}</td>
                            </tr>
                            {aberto.has(p.chave) && p.movimentos.map((m, i) => (
                              <tr key={i} style={{ background: "var(--bg-page)" }}>
                                <td style={{ ...td, paddingLeft: 30, fontSize: 12, color: "var(--text-2)" }} colSpan={2}>{fmtData(m.data)} · NF {m.nf} · {m.fornecedor}</td>
                                <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }}>{m.fazenda}</td>
                                <td style={{ ...num, fontSize: 12 }}>{fmtN(m.quantidade)}</td>
                                <td style={{ ...num, fontSize: 12 }}>{fmtBRL(m.valorTotal)}</td>
                                <td style={{ ...num, fontSize: 12 }}>{fmtUnit(m.valorUnitario)}</td>
                                <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }} colSpan={4}>CFOP {m.cfop || "—"} · {m.apropriacao}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                      {produtos.length > 0 && <tfoot><tr>
                        <td style={{ ...td, fontWeight: 600 }} colSpan={4}>Total</td>
                        <td style={{ ...num, fontWeight: 600 }}>{fmtBRL(totalValor)}</td>
                        <td style={td} colSpan={5} />
                      </tr></tfoot>}
                    </table>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>
                        <th style={th}>Data entrada</th><th style={th}>NF</th><th style={th}>Fornecedor</th><th style={th}>Fazenda</th>
                        <th style={th}>CFOP</th><th style={th}>Apropriação</th><th style={th}>Un.</th>
                        <th style={{ ...th, textAlign: "right" }}>Quantidade</th><th style={{ ...th, textAlign: "right" }}>Valor unitário</th><th style={{ ...th, textAlign: "right" }}>Valor total</th>
                      </tr></thead>
                      <tbody>
                        {produtos.length === 0 && <tr><td colSpan={10} style={{ ...td, color: "var(--text-3)", textAlign: "center", padding: 20 }}>Nenhuma entrada no período com esses filtros.</td></tr>}
                        {produtos.map(p => (
                          <Fragment key={p.chave}>
                            <tr style={{ background: "#D5E8F5" }}>
                              <td style={{ ...td, fontWeight: 600, color: "#0B2D50" }} colSpan={7}>{p.produto}{p.grupo ? ` · ${p.grupo}` : p.doCadastro ? "" : " · sem cadastro"}</td>
                              <td style={{ ...num, fontWeight: 600, color: "#0B2D50" }}>{fmtN(p.quantidade)} {p.unidade}</td>
                              <td style={{ ...num, fontWeight: 600, color: "#0B2D50" }}>{fmtUnit(p.precoMedio)}</td>
                              <td style={{ ...num, fontWeight: 600, color: "#0B2D50" }}>{fmtBRL(p.valorTotal)}</td>
                            </tr>
                            {p.movimentos.map((m, i) => (
                              <tr key={i}>
                                <td style={td}>{fmtData(m.data)}</td><td style={td}>{m.nf}</td><td style={td}>{m.fornecedor}</td><td style={td}>{m.fazenda}</td>
                                <td style={td}>{m.cfop || "—"}</td><td style={td}>{m.apropriacao}</td><td style={td}>{m.unidade || "—"}</td>
                                <td style={num}>{fmtN(m.quantidade)}</td><td style={num}>{fmtUnit(m.valorUnitario)}</td><td style={num}>{fmtBRL(m.valorTotal)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                      {produtos.length > 0 && <tfoot><tr>
                        <td style={{ ...td, fontWeight: 600 }} colSpan={9}>Total</td>
                        <td style={{ ...num, fontWeight: 600 }}>{fmtBRL(totalValor)}</td>
                      </tr></tfoot>}
                    </table>
                  )}
                </div>
              </section>
            )}
          </div>
        </PlanoGate>
      </main>
    </div>
  );
}
