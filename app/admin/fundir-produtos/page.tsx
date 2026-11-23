"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Fundir Produtos — só equipe Raccolto (Gestão Arato → Correções), 23/11/2026.
// Junta cadastros repetidos do mesmo produto num só: as NFs, as movimentações de estoque e todo vínculo passam para o
// cadastro que fica; os outros ficam inativos e marcados como fundidos. Só com a mesma unidade e o mesmo tipo.
// Escolhe-se qual cadastro permanece e, campo a campo, de qual cadastro vem cada valor. Tudo ou nada, com desfazer.
// Motor no banco: Seção 461 (fn_mesclar_insumos_escolhendo) sobre a Seção 366 (fn_mesclar_insumos).
// ═══════════════════════════════════════════════════════════════════════════
import { Fragment, useEffect, useMemo, useState } from "react";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { gruposDuplicados } from "../../../lib/estoque/duplicados";
import {
  CAMPOS_FUSAO, camposDivergentes, camposParaGravar, escolhaInicial, previaFusao, problemasFusao, sugerirDestino,
  type CampoFusao, type ProdutoFusao,
} from "../../../lib/estoque/fundir-produtos";

type Fusao = { id: string; created_at: string; feito_por: string | null; desfeita_em: string | null; linhas: number; destino: string; origens: string[] };
type Apoio = Partial<Record<CampoFusao, Record<string, string>>>;

const fmtN = (v: number | null | undefined, d = 3) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const fmtBRL = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 }));
const fmtDt = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a" };
const inp: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 13, background: "#fff" };
const th: React.CSSProperties = { padding: "7px 8px", fontSize: 11, fontWeight: 600, color: "#555", textAlign: "left", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA", position: "sticky", top: 0 };
const td: React.CSSProperties = { padding: "6px 8px", fontSize: 12, borderBottom: "0.5px solid #EEF1F6", color: "#1a1a1a", verticalAlign: "top" };
const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const card: React.CSSProperties = { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12 };

export default function FundirProdutosPage() {
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [contaId, setContaId] = useState("");
  const [produtos, setProdutos] = useState<ProdutoFusao[]>([]);
  const [apoio, setApoio] = useState<Apoio>({});
  const [fusoes, setFusoes] = useState<Fusao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [busca, setBusca] = useState("");
  const [soDuplicados, setSoDuplicados] = useState(true);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [destinoId, setDestinoId] = useState("");
  const [escolhas, setEscolhas] = useState<Partial<Record<CampoFusao, string>>>({});
  const [fundindo, setFundindo] = useState(false);

  useEffect(() => {
    fetch("/api/admin/listar-contas").then(r => r.json()).then((j: unknown) => {
      if (Array.isArray(j)) setContas((j as { id: string; nome: string }[]).map(c => ({ id: c.id, nome: c.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      else setErro((j as { error?: string })?.error ?? "Não foi possível listar os clientes.");
    }).catch(() => setErro("Não foi possível listar os clientes."));
  }, []);

  async function carregar(id = contaId) {
    if (!id) return;
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/admin/mesclar-produtos?conta_id=${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar os produtos.");
      setProdutos(j.produtos ?? []); setApoio(j.apoio ?? {}); setFusoes(j.fusoes ?? []);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setProdutos([]); setFusoes([]); }
    finally { setCarregando(false); }
  }

  function trocarCliente(id: string) {
    setContaId(id); setMarcados([]); setDestinoId(""); setEscolhas({}); setMsg(""); setBusca("");
    void carregar(id);
  }

  // Grupos de possíveis duplicados (mesma regra de Estoque → Possíveis Duplicados)
  const grupos = useMemo(() => gruposDuplicados(produtos.map(p => ({ id: p.id, nome: p.nome, unidade: p.unidade, tipo: p.tipo, categoria: p.categoria, estoque: p.estoque, ativo: p.ativo }))), [produtos]);
  const porId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);
  const termo = semAcento(busca.trim());
  const casaBusca = (p: ProdutoFusao) => !termo || semAcento(`${p.nome} ${p.ncm ?? ""}`).includes(termo);
  const blocos: { titulo: string; itens: ProdutoFusao[] }[] = useMemo(() => {
    if (soDuplicados) {
      return grupos.map(g => ({ titulo: `${g.criterio === "exato" ? "Nome igual" : "Nome parecido"} · ${g.itens.length} cadastros`, itens: g.itens.map(i => porId.get(i.id)).filter((x): x is ProdutoFusao => !!x) }))
        .filter(b => b.itens.some(casaBusca));
    }
    return [{ titulo: "", itens: produtos.filter(casaBusca).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }];
  }, [soDuplicados, grupos, porId, produtos, termo]); // eslint-disable-line react-hooks/exhaustive-deps

  const selecionados = marcados.map(id => porId.get(id)).filter((x): x is ProdutoFusao => !!x);
  const problemas = problemasFusao(selecionados);
  const divergentes = camposDivergentes(selecionados);
  const destinoValido = selecionados.some(s => s.id === destinoId) ? destinoId : (sugerirDestino(selecionados) ?? "");
  const previa = destinoValido ? previaFusao(selecionados, destinoValido) : null;

  function aplicarSelecao(ids: string[]) {
    setMarcados(ids);
    const itens = ids.map(id => porId.get(id)).filter((x): x is ProdutoFusao => !!x);
    const d = sugerirDestino(itens) ?? "";
    setDestinoId(d);
    setEscolhas(d ? escolhaInicial(itens, d) : {});
    setMsg("");
  }
  const alternar = (id: string) => aplicarSelecao(marcados.includes(id) ? marcados.filter(x => x !== id) : [...marcados, id]);
  function trocarDestino(id: string) { setDestinoId(id); setEscolhas(escolhaInicial(selecionados, id)); }

  function valorCampo(p: ProdutoFusao, campo: CampoFusao): string {
    const v = p[campo];
    if (v == null || v === "") return "—";
    if (campo === "foto_url") return "tem foto";
    if (campo === "estoque_minimo") return fmtN(Number(v));
    const nomes = apoio[campo];
    return nomes ? (nomes[String(v)] ?? "(cadastro não encontrado)") : String(v);
  }

  async function fundir() {
    if (!destinoValido || problemas.length) return;
    const destino = porId.get(destinoValido)!;
    const origens = selecionados.filter(s => s.id !== destinoValido);
    const campos = camposParaGravar(selecionados, destinoValido, escolhas);
    const nomeFinal = (campos.nome as string | undefined) ?? destino.nome;
    const ok = await confirmarAcao({
      titulo: `Fundir ${selecionados.length} cadastros em "${nomeFinal}"?`, perigo: true, textoConfirmar: "Fundir cadastros",
      mensagem: `${origens.map(o => o.nome).join(", ")} passam para o cadastro que fica. ${previa?.movimentos ?? 0} movimentações de estoque e ${previa?.itensNf ?? 0} itens de NF mudam de produto; saldo resultante ${fmtN(previa?.saldo)} ${destino.unidade ?? ""}. Os cadastros fundidos ficam inativos. Dá para desfazer na lista de fusões abaixo.`,
    });
    if (!ok) return;
    setFundindo(true); setErro(""); setMsg("");
    try {
      const r = await fetch("/api/admin/mesclar-produtos", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "fundir", destino_id: destinoValido, origem_ids: origens.map(o => o.id), campos }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "A fusão falhou; nada foi alterado.");
      setMsg(`✓ Fundidos em "${nomeFinal}": ${j.linhas_alteradas ?? 0} registros passaram para o cadastro que fica.`);
      aplicarSelecao([]);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setFundindo(false); }
  }

  async function desfazer(f: Fusao) {
    const ok = await confirmarAcao({ titulo: `Desfazer a fusão em "${f.destino}"?`, perigo: true, textoConfirmar: "Desfazer fusão",
      mensagem: `${f.origens.join(", ")} voltam a ser cadastros ativos, com as NFs e movimentações que tinham antes, e o cadastro que ficou volta aos dados anteriores.` });
    if (!ok) return;
    setErro(""); setMsg("");
    const r = await fetch("/api/admin/mesclar-produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "desfazer", mesclagem_id: f.id }) });
    const j = await r.json();
    if (!r.ok) { setErro(j.error ?? "Não foi possível desfazer."); return; }
    setMsg(`✓ Fusão desfeita: ${j.linhas_restauradas ?? 0} registros voltaram ao cadastro de origem.`);
    aplicarSelecao([]);
    await carregar();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <header data-arato-page-heading="true" style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "12px 22px" }}>
        <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Fundir Produtos</h1>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
          Junta cadastros repetidos do mesmo produto: notas fiscais, movimentações de estoque e vínculos passam para o cadastro que fica. Só com a mesma unidade de medida · visível só para a equipe Raccolto
        </div>
      </header>

      <main style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={contaId} onChange={e => trocarCliente(e.target.value)} style={{ ...inp, minWidth: 280 }} aria-label="Cliente">
            <option value="">Escolha o cliente…</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {contaId && <>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto ou NCM" style={{ ...inp, minWidth: 240 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", cursor: "pointer" }}>
              <input type="checkbox" checked={soDuplicados} onChange={e => setSoDuplicados(e.target.checked)} />
              Só possíveis duplicados ({grupos.length} grupos)
            </label>
            <button type="button" style={btn} onClick={() => void carregar()} disabled={carregando}>{carregando ? "Carregando…" : "↻ Recarregar"}</button>
          </>}
        </div>
        {erro && <div role="alert" style={{ padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8 }}>{erro}</div>}
        {msg && <div style={{ padding: 10, background: "#E8F5E9", color: "#166534", borderRadius: 8 }}>{msg}</div>}

        {contaId && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
            {/* Lista de produtos do cliente */}
            <section style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: "0.5px solid #DDE2EE", fontSize: 12, color: "#555" }}>
                {produtos.length} cadastros ativos e não fundidos · marque os que são o mesmo produto
              </div>
              <div style={{ maxHeight: "68vh", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th} /><th style={th}>Produto</th><th style={th}>Un.</th><th style={th}>NCM</th>
                    <th style={{ ...th, textAlign: "right" }}>Saldo</th><th style={{ ...th, textAlign: "right" }}>Custo médio</th>
                    <th style={{ ...th, textAlign: "right" }} title="Movimentações de estoque">Mov.</th><th style={{ ...th, textAlign: "right" }} title="Itens de NF de entrada">NFs</th>
                  </tr></thead>
                  <tbody>
                    {!carregando && blocos.every(b => b.itens.length === 0) && (
                      <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#666", padding: 20 }}>{soDuplicados ? "Nenhum possível duplicado. Desmarque o filtro para ver todos os cadastros." : "Nenhum cadastro encontrado."}</td></tr>
                    )}
                    {blocos.map((b, bi) => (
                      <Fragment key={bi}>
                        {b.titulo && (
                          <tr><td colSpan={8} style={{ ...td, background: "#D5E8F5", color: "#0B2D50", fontWeight: 600 }}>
                            {b.titulo}
                            <button type="button" onClick={() => aplicarSelecao(b.itens.map(i => i.id))} style={{ ...btn, marginLeft: 10, padding: "2px 8px", fontSize: 11 }}>Marcar grupo</button>
                          </td></tr>
                        )}
                        {b.itens.map(p => (
                          <tr key={p.id} onClick={() => alternar(p.id)} style={{ cursor: "pointer", background: marcados.includes(p.id) ? "#FBF3E0" : undefined }}>
                            <td style={td}><input type="checkbox" checked={marcados.includes(p.id)} readOnly aria-label={`Marcar ${p.nome}`} /></td>
                            <td style={{ ...td, fontWeight: 600 }}>{p.nome}<div style={{ fontWeight: 400, color: "#666", fontSize: 11 }}>{[p.tipo === "produto" ? "produto agrícola" : null, p.categoria, apoio.grupo_id?.[p.grupo_id ?? ""]].filter(Boolean).join(" · ")}</div></td>
                            <td style={td}>{p.unidade || "—"}</td>
                            <td style={td}>{p.ncm || "—"}</td>
                            <td style={{ ...num, color: Number(p.estoque ?? 0) < 0 ? "#B42318" : undefined }}>{fmtN(p.estoque)}</td>
                            <td style={num}>{fmtBRL(p.custo_medio)}</td>
                            <td style={num}>{p.movimentos ?? 0}</td>
                            <td style={num}>{p.itensNf ?? 0}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Painel da fusão */}
            <section style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Fusão</div>
              {selecionados.length === 0 && <div style={{ color: "#666", fontSize: 12 }}>Marque na lista os cadastros que são o mesmo produto (ou use &ldquo;Marcar grupo&rdquo;).</div>}
              {selecionados.length > 0 && (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6 }}>Cadastro que permanece</div>
                    {selecionados.map(s => (
                      <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: s.id === destinoValido ? "#D5E8F5" : "transparent", marginBottom: 2 }}>
                        <input type="radio" name="destino" checked={s.id === destinoValido} onChange={() => trocarDestino(s.id)} style={{ marginTop: 2 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>{s.nome}</span>
                          <span style={{ display: "block", fontSize: 11, color: "#666" }}>{s.unidade || "sem unidade"} · saldo {fmtN(s.estoque)} · {s.movimentos ?? 0} mov. · {s.itensNf ?? 0} itens de NF</span>
                        </span>
                        <button type="button" onClick={e => { e.preventDefault(); alternar(s.id); }} title="Tirar da fusão" style={{ ...btn, padding: "1px 7px", fontSize: 11 }}>✕</button>
                      </label>
                    ))}
                  </div>

                  {problemas.length > 0 && <div style={{ padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 12 }}>{problemas.map((p, i) => <div key={i}>{p}</div>)}</div>}

                  {problemas.length === 0 && divergentes.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6 }}>O que fica no cadastro (só os campos que diferem)</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr>
                            <th style={{ ...th, position: "static" }}>Campo</th>
                            {selecionados.map(s => <th key={s.id} style={{ ...th, position: "static", maxWidth: 160, whiteSpace: "normal" }}>{s.id === destinoValido ? "● " : ""}{s.nome}</th>)}
                          </tr></thead>
                          <tbody>
                            {divergentes.map(campo => (
                              <tr key={campo}>
                                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{CAMPOS_FUSAO.find(c => c.campo === campo)?.rotulo}</td>
                                {selecionados.map(s => (
                                  <td key={s.id} style={{ ...td, background: escolhas[campo] === s.id ? "#FBF3E0" : undefined }}>
                                    <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                                      <input type="radio" name={`campo-${campo}`} checked={escolhas[campo] === s.id} onChange={() => setEscolhas(prev => ({ ...prev, [campo]: s.id }))} style={{ marginTop: 2 }} />
                                      <span>{valorCampo(s, campo)}</span>
                                    </label>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {problemas.length === 0 && previa && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, fontSize: 12 }}>
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 8 }}><div style={{ color: "#666", fontSize: 11 }}>Saldo resultante</div><div style={{ fontWeight: 600 }}>{fmtN(previa.saldo)} {porId.get(destinoValido)?.unidade ?? ""}</div></div>
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 8 }}><div style={{ color: "#666", fontSize: 11 }}>Custo médio resultante</div><div style={{ fontWeight: 600 }}>{fmtBRL(previa.custoMedio)}</div></div>
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 8 }}><div style={{ color: "#666", fontSize: 11 }}>Movimentações que mudam de produto</div><div style={{ fontWeight: 600 }}>{previa.movimentos}</div></div>
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 8 }}><div style={{ color: "#666", fontSize: 11 }}>Itens de NF que mudam de produto</div><div style={{ fontWeight: 600 }}>{previa.itensNf}</div></div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#666" }}>Custo médio: média dos cadastros com saldo positivo, pesada pelo saldo. Pedidos, operações, contratos e demais vínculos também passam para o cadastro que fica.</div>

                  <button type="button" onClick={() => void fundir()} disabled={fundindo || problemas.length > 0 || !destinoValido}
                    style={{ ...btn, background: "#1A4870", color: "#fff", border: "none", padding: "9px 16px", fontSize: 13, opacity: fundindo || problemas.length > 0 ? 0.5 : 1 }}>
                    {fundindo ? "Fundindo…" : `Fundir ${selecionados.length} cadastros`}
                  </button>
                </>
              )}
            </section>
          </div>
        )}

        {contaId && (
          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: "0.5px solid #DDE2EE", fontSize: 13, fontWeight: 600 }}>Fusões recentes deste cliente</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, position: "static" }}>Data</th><th style={{ ...th, position: "static" }}>Cadastro que ficou</th><th style={{ ...th, position: "static" }}>Fundidos nele</th><th style={{ ...th, position: "static", textAlign: "right" }}>Registros</th><th style={{ ...th, position: "static" }}>Feita por</th><th style={{ ...th, position: "static" }} /></tr></thead>
              <tbody>
                {fusoes.length === 0 && <tr><td colSpan={6} style={{ ...td, color: "#666", textAlign: "center", padding: 14 }}>Nenhuma fusão registrada.</td></tr>}
                {fusoes.map(f => (
                  <tr key={f.id} style={{ opacity: f.desfeita_em ? 0.55 : 1 }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDt(f.created_at)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{f.destino}</td>
                    <td style={td}>{f.origens.join(" · ")}</td>
                    <td style={num}>{f.linhas}</td>
                    <td style={{ ...td, color: "#666" }}>{f.feito_por ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{f.desfeita_em ? <span style={{ color: "#666" }}>desfeita em {fmtDt(f.desfeita_em)}</span> : <button type="button" onClick={() => void desfazer(f)} style={{ ...btn, color: "#791F1F" }}>↩ Desfazer</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
