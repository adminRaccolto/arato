"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Nota Própria de Outro Sistema (Seção 316) — pedido real do dono 01/10/2026:
// "não estou encontrando local pra efetuar entrada de nota própria — como
// remessas emitidas em outros sistemas, por exemplo".
//
// Buraco real: todo o módulo Fiscal só cobre EMISSÃO (Arato gera e transmite)
// ou ENTRADA DE FORNECEDOR (cliente como destinatário). Essa tela cobre o
// caso que faltava — documento onde o CLIENTE É O EMITENTE, mas autorizado
// em outro sistema (ERP antigo, sistema paralelo).
//
// Escopo definido com o dono: NUNCA gera financeiro (CP/CR) — só pode
// (a) arquivar (XML/chave/DANFE, sem efeito automático) ou (b) também
// movimentar estoque (baixa de saída). Entrada por XML, por chave de
// acesso (consulta SEFAZ) ou manual.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarNotasPropriasExternas, criarNotaPropriaExterna, salvarItensNotaPropriaExterna,
  processarNotaPropriaExterna, estornarNotaPropriaExterna, excluirNotaPropriaExterna,
  listarItensNotaPropriaExterna, listarInsumosParaConta, listarDepositosMulti,
} from "../../../lib/db";
import type { NotaPropriaExterna, Insumo, Deposito } from "../../../lib/supabase";

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const numBR = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-2)" };

const STATUS_META: Record<string, { label: string; bg: string; cl: string }> = {
  registrada: { label: "Registrada", bg: "#E8E8E8", cl: "#0D0D0D" },
  processada: { label: "Processada (estoque baixado)", bg: "#DCFCE7", cl: "#166534" },
  estornada:  { label: "Estornada", bg: "#FBF3E0", cl: "#7A5200" },
  cancelada:  { label: "Cancelada", bg: "#FCEBEB", cl: "#791F1F" },
};

type ItemForm = { key: string; descricao: string; unidade: string; quantidade: string; valor_unitario: string; valor_total: string; insumo_id: string };
const ITEM_VAZIO = (): ItemForm => ({ key: crypto.randomUUID(), descricao: "", unidade: "un", quantidade: "", valor_unitario: "", valor_total: "", insumo_id: "" });

export default function NotasPropriasExternasPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [notas,     setNotas]     = useState<NotaPropriaExterna[]>([]);
  const [insumos,   setInsumos]   = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [erro,      setErro]      = useState("");

  const carregar = async () => {
    const ids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) return;
    setLoading(true);
    const [n, i, d] = await Promise.all([
      listarNotasPropriasExternas(ids),
      listarInsumosParaConta(contaId ?? undefined, fazendaId ?? undefined),
      listarDepositosMulti(ids),
    ]);
    setNotas(n); setInsumos(i); setDepositos(d);
    setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fazendaId, fazendaIds?.join(",")]);

  // ── Wizard: Nova Nota Própria ──────────────────────────────────
  const [wizard, setWizard]   = useState(false);
  const [passo,  setPasso]    = useState<1 | 2>(1);
  const [orig,   setOrig]     = useState<"manual" | "xml" | "chave">("manual");
  const [salvando, setSalvando] = useState(false);
  const [erroWiz,  setErroWiz]  = useState("");

  const CAB_VAZIO = {
    numero: "", serie: "", chave_acesso: "", natureza: "", data_emissao: "",
    cnpj_emitente: "", nome_emitente: "", cnpj_destinatario: "", nome_destinatario: "",
    valor_total: "", movimenta_estoque: false, deposito_origem_id: "", observacao: "",
  };
  const [cab, setCab] = useState(CAB_VAZIO);
  const [itens, setItens] = useState<ItemForm[]>([ITEM_VAZIO()]);
  const [xmlRaw, setXmlRaw] = useState<string | undefined>(undefined);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const [chaveDigitada, setChaveDigitada] = useState("");
  const [consultandoChave, setConsultandoChave] = useState(false);

  function abrirWizard() {
    setErroWiz(""); setOrig("manual"); setPasso(1);
    setCab(CAB_VAZIO); setItens([ITEM_VAZIO()]); setXmlRaw(undefined); setChaveDigitada("");
    setWizard(true);
  }

  function aplicarParsed(d: {
    numero?: string; serie?: string; chave?: string; data_emissao?: string; natureza?: string;
    cnpj_emitente?: string; nome_emitente?: string; cnpj_destinatario?: string; nome_destinatario?: string;
    valor_total?: number; itens?: { descricao: string; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }[];
  }) {
    setCab(p => ({
      ...p,
      numero: d.numero ?? p.numero, serie: d.serie ?? p.serie, chave_acesso: d.chave ?? p.chave_acesso,
      data_emissao: d.data_emissao ?? p.data_emissao, natureza: d.natureza ?? p.natureza,
      cnpj_emitente: d.cnpj_emitente ?? p.cnpj_emitente, nome_emitente: d.nome_emitente ?? p.nome_emitente,
      cnpj_destinatario: d.cnpj_destinatario ?? p.cnpj_destinatario, nome_destinatario: d.nome_destinatario ?? p.nome_destinatario,
      valor_total: d.valor_total != null ? String(d.valor_total) : p.valor_total,
    }));
    if (d.itens?.length) {
      setItens(d.itens.map(it => ({
        key: crypto.randomUUID(), descricao: it.descricao, unidade: it.unidade || "un",
        quantidade: String(it.quantidade), valor_unitario: String(it.valor_unitario), valor_total: String(it.valor_total),
        insumo_id: "",
      })));
    }
  }

  function parsearXmlLocal(xml: string) {
    setXmlRaw(xml);
    // Parse mínimo no client (sem backend) — tags básicas via regex simples,
    // suficiente pro cabeçalho; itens o usuário confere/ajusta manualmente
    // se o XML vier truncado. Pra parse completo (com itens), usa Chave.
    const tag = (t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
    const idMatch = xml.match(/Id=["']NFe(\d{44})["']/);
    setCab(p => ({
      ...p,
      numero: tag("nNF") || p.numero,
      serie: tag("serie") || p.serie,
      chave_acesso: idMatch?.[1] ?? p.chave_acesso,
      data_emissao: (tag("dhEmi") || "").slice(0, 10) || p.data_emissao,
      natureza: tag("natOp") || p.natureza,
      valor_total: tag("vNF") || p.valor_total,
    }));
  }

  async function consultarPorChave() {
    if (!fazendaId) return;
    const chave = chaveDigitada.replace(/\D/g, "");
    if (chave.length !== 44) { setErroWiz("Chave de acesso precisa ter 44 dígitos."); return; }
    setConsultandoChave(true); setErroWiz("");
    try {
      const res = await fetch("/api/fiscal/notas-proprias/consultar-chave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, fazenda_id: fazendaId }),
      });
      const json = await res.json();
      if (!json.ok) { setErroWiz(json.erro || "Não foi possível consultar essa chave."); return; }
      aplicarParsed(json);
      setXmlRaw(json.xml_content);
    } catch (e: unknown) {
      setErroWiz(e instanceof Error ? e.message : "Erro ao consultar a chave.");
    } finally {
      setConsultandoChave(false);
    }
  }

  function setItem(key: string, patch: Partial<ItemForm>) {
    setItens(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it));
  }
  function addItem() { setItens(p => [...p, ITEM_VAZIO()]); }
  function removerItem(key: string) { setItens(p => p.filter(it => it.key !== key)); }

  function avancar() {
    if (!cab.numero.trim() || !cab.data_emissao || !cab.valor_total) {
      setErroWiz("Preencha número, data de emissão e valor total."); return;
    }
    setErroWiz("");
    if (cab.movimenta_estoque) { setPasso(2); return; }
    salvar();
  }

  async function salvar() {
    if (!fazendaId) return;
    if (cab.movimenta_estoque) {
      if (!cab.deposito_origem_id) { setErroWiz("Selecione o depósito de origem da saída."); return; }
      const semInsumo = itens.some(it => it.descricao.trim() && !it.insumo_id);
      if (semInsumo) { setErroWiz("Associe todos os itens a um produto do catálogo, ou remova a linha."); return; }
    }
    setSalvando(true); setErroWiz("");
    try {
      const nota = await criarNotaPropriaExterna({
        fazenda_id: fazendaId, conta_id: contaId ?? undefined,
        numero: cab.numero.trim(), serie: cab.serie.trim() || undefined, chave_acesso: cab.chave_acesso.trim() || undefined,
        natureza: cab.natureza.trim() || undefined, data_emissao: cab.data_emissao,
        cnpj_emitente: cab.cnpj_emitente.trim() || undefined, nome_emitente: cab.nome_emitente.trim() || undefined,
        cnpj_destinatario: cab.cnpj_destinatario.trim() || undefined, nome_destinatario: cab.nome_destinatario.trim() || undefined,
        valor_total: numBR(cab.valor_total), origem_entrada: orig,
        movimenta_estoque: cab.movimenta_estoque, deposito_origem_id: cab.deposito_origem_id || undefined,
        status: "registrada", xml_content: xmlRaw, observacao: cab.observacao.trim() || undefined,
      });
      if (cab.movimenta_estoque) {
        const itensValidos = itens.filter(it => it.descricao.trim() && it.insumo_id);
        await salvarItensNotaPropriaExterna(nota.id, itensValidos.map(it => ({
          insumo_id: it.insumo_id, descricao_produto: it.descricao.trim(), unidade: it.unidade,
          quantidade: numBR(it.quantidade), valor_unitario: numBR(it.valor_unitario), valor_total: numBR(it.valor_total),
        })));
        await processarNotaPropriaExterna(nota.id);
      }
      setWizard(false);
      await carregar();
    } catch (e: unknown) {
      setErroWiz(e instanceof Error ? e.message : "Erro ao salvar nota própria.");
    } finally {
      setSalvando(false);
    }
  }

  async function estornar(n: NotaPropriaExterna) {
    if (!confirm(`Estornar "${n.numero}"? ${n.movimenta_estoque ? "A baixa de estoque será revertida." : ""}`)) return;
    try { await estornarNotaPropriaExterna(n.id); await carregar(); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : "Erro ao estornar."); }
  }
  async function excluir(n: NotaPropriaExterna) {
    if (n.status === "processada") { alert("Nota processada (com baixa de estoque) — estorne primeiro."); return; }
    if (!confirm(`Excluir "${n.numero}"? Essa ação não pode ser desfeita.`)) return;
    try { await excluirNotaPropriaExterna(n.id); await carregar(); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : "Erro ao excluir."); }
  }

  const notasFiltradas = notas.filter(n => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (n.numero ?? "").toLowerCase().includes(q) || (n.nome_destinatario ?? "").toLowerCase().includes(q) || (n.chave_acesso ?? "").includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "var(--text-1)", fontWeight: 600 }}>Nota Própria — Outro Sistema</h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-2)" }}>Documentos onde você é o emitente, mas autorizados fora do Arato (ERP antigo, sistema paralelo). Só registro — nunca gera financeiro.</p>
          </div>
          <button style={btnV} onClick={abrirWizard}>+ Nova Nota Própria</button>
        </header>

        <div style={{ padding: "18px 22px", flex: 1 }}>
          {erro && (
            <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erro}</div>
          )}

          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº, chave, destinatário..."
            style={{ ...inp, maxWidth: 320, marginBottom: 14 }} />

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-2)" }}>Carregando...</div>
          ) : notasFiltradas.length === 0 ? (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--text-2)" }}>
              {notas.length === 0 ? "Nenhuma nota própria registrada ainda." : "Nenhuma nota encontrada para essa busca."}
            </div>
          ) : (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {["Nº / Série", "Emissão", "Destinatário", "Natureza", "Valor", "Estoque?", "Origem", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {notasFiltradas.map(n => {
                    const sm = STATUS_META[n.status] ?? STATUS_META.registrada;
                    return (
                      <tr key={n.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 600 }}>{n.numero}{n.serie ? `/${n.serie}` : ""}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(n.data_emissao)}</td>
                        <td style={{ padding: "7px 10px" }}>{n.nome_destinatario ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{n.natureza ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(n.valor_total)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{n.movimenta_estoque ? "✓" : "—"}</td>
                        <td style={{ padding: "7px 10px", fontSize: 11, color: "var(--text-2)" }}>{n.origem_entrada ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: sm.bg, color: sm.cl, padding: "2px 8px", borderRadius: 8 }}>{sm.label}</span>
                        </td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {n.status === "processada" && <button onClick={() => estornar(n)} style={{ ...btnR, fontSize: 11, padding: "4px 10px" }}>Estornar</button>}
                            {n.status !== "processada" && <button onClick={() => excluir(n)} style={{ ...btnR, fontSize: 11, padding: "4px 10px", color: "#791F1F" }}>Excluir</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ══ WIZARD — Nova Nota Própria ══ */}
      {wizard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setWizard(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 26, width: "min(94vw, 760px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}>
                Nota Própria — Outro Sistema {passo === 2 ? "— Itens / Estoque" : ""}
              </h2>
              <button onClick={() => setWizard(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>

            {passo === 1 && (<>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                {([["manual", "✍ Manual"], ["xml", "📄 XML"], ["chave", "🔑 Chave de Acesso"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setOrig(v)} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: orig === v ? "1.5px solid #1A4870" : "0.5px solid var(--border-table)",
                    background: orig === v ? "#E6F1FB" : "var(--bg-card)", color: orig === v ? "#0C447C" : "var(--text-2)",
                  }}>{label}</button>
                ))}
              </div>

              {orig === "xml" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Arquivo XML</label>
                  <input ref={xmlInputRef} type="file" accept=".xml" onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const reader = new FileReader();
                    reader.onload = ev => parsearXmlLocal(ev.target?.result as string);
                    reader.readAsText(f);
                  }} style={{ display: "block", fontSize: 13 }} />
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Preenche número, série, chave, data, natureza e valor. Itens: confira/complete abaixo se marcar "movimenta estoque".</div>
                </div>
              )}

              {orig === "chave" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Chave de Acesso (44 dígitos)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={chaveDigitada} onChange={e => setChaveDigitada(e.target.value.replace(/\D/g, "").slice(0, 44))}
                      placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000" style={inp} />
                    <button onClick={consultarPorChave} disabled={consultandoChave} style={{ ...btnV, whiteSpace: "nowrap" }}>
                      {consultandoChave ? "Consultando..." : "Consultar"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Consulta a SEFAZ (usa o certificado A1 já configurado) e traz cabeçalho + itens completos.</div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 12 }}>
                <div><label style={lbl}>Número *</label><input value={cab.numero} onChange={e => setCab(p => ({ ...p, numero: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Série</label><input value={cab.serie} onChange={e => setCab(p => ({ ...p, serie: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Chave de Acesso</label><input value={cab.chave_acesso} onChange={e => setCab(p => ({ ...p, chave_acesso: e.target.value }))} style={{ ...inp, fontFamily: "monospace", fontSize: 11 }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><label style={lbl}>Data de Emissão *</label><input type="date" value={cab.data_emissao} onChange={e => setCab(p => ({ ...p, data_emissao: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Natureza da Operação</label><input value={cab.natureza} onChange={e => setCab(p => ({ ...p, natureza: e.target.value }))} placeholder="Ex: Remessa para armazenagem" style={inp} /></div>
                <div><label style={lbl}>Valor Total *</label><input value={cab.valor_total} onChange={e => setCab(p => ({ ...p, valor_total: e.target.value }))} placeholder="0,00" style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><label style={lbl}>CNPJ Emitente (você)</label><input value={cab.cnpj_emitente} onChange={e => setCab(p => ({ ...p, cnpj_emitente: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Nome Emitente</label><input value={cab.nome_emitente} onChange={e => setCab(p => ({ ...p, nome_emitente: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div><label style={lbl}>CNPJ Destinatário</label><input value={cab.cnpj_destinatario} onChange={e => setCab(p => ({ ...p, cnpj_destinatario: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Nome Destinatário</label><input value={cab.nome_destinatario} onChange={e => setCab(p => ({ ...p, nome_destinatario: e.target.value }))} style={inp} /></div>
              </div>

              <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                  <input type="checkbox" checked={cab.movimenta_estoque} onChange={e => setCab(p => ({ ...p, movimenta_estoque: e.target.checked }))} />
                  Essa nota movimenta estoque (baixa de saída)
                </label>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  Desmarcado = só fica arquivada (histórico/consulta). Marcado = no próximo passo você associa os itens ao catálogo e escolhe o depósito — ao salvar, dá baixa automática no estoque. Nunca gera CP/CR.
                </div>
              </div>

              <div>
                <label style={lbl}>Observação</label>
                <input value={cab.observacao} onChange={e => setCab(p => ({ ...p, observacao: e.target.value }))} style={inp} />
              </div>

              {erroWiz && <div style={{ marginTop: 14, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 12px", borderRadius: 6 }}>{erroWiz}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, borderTop: "0.5px solid var(--border-table)", paddingTop: 16 }}>
                <button onClick={() => setWizard(false)} style={btnR}>Cancelar</button>
                <button onClick={avancar} disabled={salvando} style={btnV}>
                  {cab.movimenta_estoque ? "Avançar →" : (salvando ? "Salvando..." : "Salvar Nota Própria")}
                </button>
              </div>
            </>)}

            {passo === 2 && (<>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Depósito de Origem (de onde sai o estoque) *</label>
                <select value={cab.deposito_origem_id} onChange={e => setCab(p => ({ ...p, deposito_origem_id: e.target.value }))} style={inp}>
                  <option value="">Selecionar...</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {["Descrição NF", "Produto (catálogo) *", "Un.", "Qtd.", "Vlr. Unit.", "Vlr. Total", ""].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map(it => (
                    <tr key={it.key}>
                      <td style={{ padding: "4px" }}><input value={it.descricao} onChange={e => setItem(it.key, { descricao: e.target.value })} style={{ ...inp, fontSize: 11 }} /></td>
                      <td style={{ padding: "4px" }}>
                        <select value={it.insumo_id} onChange={e => {
                          const ins = insumos.find(i => i.id === e.target.value);
                          setItem(it.key, { insumo_id: e.target.value, unidade: ins?.unidade ?? it.unidade });
                        }} style={{ ...inp, fontSize: 11, background: it.insumo_id ? "var(--bg-input)" : "#FEE2E2" }}>
                          <option value="">— selecionar —</option>
                          {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "4px" }}><input value={it.unidade} onChange={e => setItem(it.key, { unidade: e.target.value })} style={{ ...inp, fontSize: 11, width: 60 }} /></td>
                      <td style={{ padding: "4px" }}><input value={it.quantidade} onChange={e => setItem(it.key, { quantidade: e.target.value })} style={{ ...inp, fontSize: 11, width: 80, textAlign: "right" }} /></td>
                      <td style={{ padding: "4px" }}><input value={it.valor_unitario} onChange={e => setItem(it.key, { valor_unitario: e.target.value })} style={{ ...inp, fontSize: 11, width: 90, textAlign: "right" }} /></td>
                      <td style={{ padding: "4px" }}><input value={it.valor_total} onChange={e => setItem(it.key, { valor_total: e.target.value })} style={{ ...inp, fontSize: 11, width: 90, textAlign: "right" }} /></td>
                      <td style={{ padding: "4px" }}><button onClick={() => removerItem(it.key)} style={{ background: "none", border: "none", color: "#E24B4A", cursor: "pointer" }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addItem} style={{ ...btnR, fontSize: 12, marginBottom: 16 }}>+ Item</button>

              {erroWiz && <div style={{ marginTop: 4, marginBottom: 14, fontSize: 12, color: "#791F1F", background: "#FCEBEB", padding: "8px 12px", borderRadius: 6 }}>{erroWiz}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20, borderTop: "0.5px solid var(--border-table)", paddingTop: 16 }}>
                <button onClick={() => setPasso(1)} style={btnR}>← Voltar</button>
                <button onClick={salvar} disabled={salvando} style={btnV}>
                  {salvando ? "Salvando e baixando estoque..." : "✓ Salvar e Baixar Estoque"}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
