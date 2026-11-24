"use client";
// Fiscal → Certidões (CND): controle de vencimento das certidões negativas de todos os produtores do cliente
// e do certificado digital A1. Os vencimentos aparecem no Quadro de Avisos da tela inicial.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarProdutoresDaConta } from "../../../lib/db";
import type { Produtor } from "../../../lib/supabase";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalHeading } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import SelectBusca from "../../../components/SelectBusca";
import InputData from "../../../components/InputData";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import {
  TIPOS_CERTIDAO, ROTULO_SITUACAO, certidoesVigentes, diasAteData, ehSubstituida, rotuloTipoCertidao, semCndFederal, situacaoVenc, textoDias,
  type Certidao, type CertificadoA1, type SituacaoVenc, type TipoCertidao,
} from "../../../lib/fiscal/certidoes";

const COR: Record<SituacaoVenc, { fg: string; bg: string }> = {
  vencida:  { fg: "#991B1B", bg: "#FEE2E2" },
  vence_15: { fg: "#9A3412", bg: "#FFEDD5" },
  vence_30: { fg: "#854D0E", bg: "#FEF9C3" },
  em_dia:   { fg: "#166534", bg: "#DCFCE7" },
};
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-input, #D4DCE8)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", color: "var(--text-1)", boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 4, fontWeight: 600 };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "14px 16px" };

type Form = { id?: string; produtor_id: string; tipo: TipoCertidao; orgao: string; numero: string; codigo_autenticacao: string;
  data_emissao: string; data_validade: string; positiva_efeito_negativa: boolean; observacao: string };
const formVazio = (produtor_id = "", tipo: TipoCertidao = "federal"): Form => ({ produtor_id, tipo, orgao: TIPOS_CERTIDAO.find(t => t.id === tipo)?.orgao ?? "",
  numero: "", codigo_autenticacao: "", data_emissao: hojeLocal(), data_validade: "", positiva_efeito_negativa: false, observacao: "" });

/** Texto pronto para colar no campo CND do emitente (Parâmetros do Sistema → Fiscal). */
function textoNfe(c: Form): string {
  const partes = [`${c.positiva_efeito_negativa ? "CPEND" : "CND"} Nº ${c.numero || "—"}`];
  if (c.codigo_autenticacao) partes.push(`Número de Autenticação: ${c.codigo_autenticacao}`);
  return `REMETENTE: ${partes.join(" / ")}; Certidão válida até: ${fmtData(c.data_validade)}.`;
}

export default function CertidoesPage() {
  const { contaId, fazendaIds } = useAuth();
  const hoje = hojeLocal();
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [certidoes, setCertidoes] = useState<Certidao[]>([]);
  const [certificados, setCertificados] = useState<CertificadoA1[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [fProdutor, setFProdutor] = useState("");
  const [fSituacao, setFSituacao] = useState<"" | SituacaoVenc>("");
  const [fTipo, setFTipo] = useState("");
  const [historico, setHistorico] = useState(false);
  const [modal, setModal] = useState<{ form: Form; somenteLeitura: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function carregar() {
    if (!contaId) return;
    setCarregando(true); setErro("");
    try {
      const [prods, cert] = await Promise.all([
        listarProdutoresDaConta(contaId),
        supabase.from("produtor_certidoes").select("*").eq("conta_id", contaId).order("data_validade", { ascending: false }).order("id").range(0, 4999),
      ]);
      if (cert.error) throw new Error(cert.error.message.includes("produtor_certidoes") ? "Tabela de certidões ainda não criada — rode a Seção 462 no Supabase." : cert.error.message);
      setProdutores([...prods].sort((a, b) => a.nome.localeCompare(b.nome)));
      setCertidoes((cert.data ?? []) as Certidao[]);
    } catch (e) { setErro((e as Error).message); }
    setCarregando(false);
  }

  useEffect(() => { void carregar(); }, [contaId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fazendaIds?.length) return;
    fetch(`/api/cert-meta?fazenda_ids=${fazendaIds.join(",")}`).then(r => r.json()).then(j => setCertificados(j.certs ?? [])).catch(() => setCertificados([]));
  }, [fazendaIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Link do Quadro de Avisos: ?produtor=<id>
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("produtor");
    if (p) setFProdutor(p);
  }, []);

  const nome = (id: string) => produtores.find(p => p.id === id)?.nome ?? "Produtor removido";
  const doc = (id: string) => produtores.find(p => p.id === id)?.cpf_cnpj ?? "";
  const vigentes = useMemo(() => certidoesVigentes(certidoes), [certidoes]);
  const semFederal = useMemo(() => semCndFederal(produtores.map(p => p.id), certidoes), [produtores, certidoes]);
  const contagem = useMemo(() => {
    const c: Record<SituacaoVenc, number> = { vencida: 0, vence_15: 0, vence_30: 0, em_dia: 0 };
    for (const v of vigentes) c[situacaoVenc(v.data_validade, hoje)]++;
    return c;
  }, [vigentes, hoje]);

  const linhas = (historico ? certidoes : vigentes)
    .filter(c => !fProdutor || c.produtor_id === fProdutor)
    .filter(c => !fTipo || c.tipo === fTipo)
    .filter(c => !fSituacao || situacaoVenc(c.data_validade, hoje) === fSituacao)
    .sort((a, b) => nome(a.produtor_id).localeCompare(nome(b.produtor_id)) || a.tipo.localeCompare(b.tipo) || b.data_validade.localeCompare(a.data_validade));

  const certsFiltrados = certificados.filter(c => !fProdutor || c.produtor_id === fProdutor).filter(c => c.data_vencimento);

  function abrir(c: Certidao) {
    setCopiado(false);
    setModal({ somenteLeitura: true, form: { id: c.id, produtor_id: c.produtor_id, tipo: c.tipo, orgao: c.orgao ?? "", numero: c.numero ?? "",
      codigo_autenticacao: c.codigo_autenticacao ?? "", data_emissao: c.data_emissao ?? "", data_validade: c.data_validade,
      positiva_efeito_negativa: !!c.positiva_efeito_negativa, observacao: c.observacao ?? "" } });
  }
  function nova(produtor_id = fProdutor, tipo: TipoCertidao = "federal") { setCopiado(false); setModal({ somenteLeitura: false, form: formVazio(produtor_id, tipo) }); }

  async function salvar() {
    if (!modal || !contaId) return;
    const f = modal.form;
    if (!f.produtor_id) { alert("Escolha o produtor."); return; }
    if (!f.data_validade) { alert("Informe a data de validade da certidão."); return; }
    if (f.data_emissao && f.data_emissao > f.data_validade) { alert("A emissão não pode ser depois da validade."); return; }
    setSalvando(true);
    const payload = { conta_id: contaId, produtor_id: f.produtor_id, tipo: f.tipo, orgao: f.orgao.trim() || null, numero: f.numero.trim() || null,
      codigo_autenticacao: f.codigo_autenticacao.trim() || null, data_emissao: f.data_emissao || null, data_validade: f.data_validade,
      positiva_efeito_negativa: f.positiva_efeito_negativa, observacao: f.observacao.trim() || null, updated_at: new Date().toISOString() };
    const r = f.id ? await supabase.from("produtor_certidoes").update(payload).eq("id", f.id) : await supabase.from("produtor_certidoes").insert(payload);
    setSalvando(false);
    if (r.error) { alert("Não foi possível salvar: " + r.error.message); return; }
    setModal(null); void carregar();
  }

  async function excluir() {
    if (!modal?.form.id) return;
    if (!(await confirmarAcao({ titulo: "Excluir certidão", mensagem: "A certidão será apagada do controle. Para registrar uma certidão nova, use Renovar — a antiga fica no histórico.", perigo: true }))) return;
    const r = await supabase.from("produtor_certidoes").delete().eq("id", modal.form.id);
    if (r.error) { alert("Não foi possível excluir: " + r.error.message); return; }
    setModal(null); void carregar();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setModal(m => m && ({ ...m, form: { ...m.form, [k]: v } }));
  const ro = modal?.somenteLeitura ?? false;

  return (
    <div data-arato-page="true" style={{ minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Certidões (CND)</h1>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>Vencimento das certidões de todos os produtores do cliente. Vencidas e as que vencem em até 30 dias aparecem no Quadro de Avisos do Início.</p>
          </div>
          <OperationalButton data-arato-button="primary" onClick={() => nova()} style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Nova certidão
          </OperationalButton>
        </OperationalHeading>

        {erro && <div role="alert" style={{ ...card, borderColor: "#E24B4A", color: "#991B1B", marginBottom: 16, fontSize: 13 }}>{erro}</div>}

        <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
          {([
            { k: "vencida" as const, label: "Vencidas", n: contagem.vencida },
            { k: "vence_15" as const, label: "Vencem em até 15 dias", n: contagem.vence_15 },
            { k: "vence_30" as const, label: "Vencem em 16 a 30 dias", n: contagem.vence_30 },
            { k: "em_dia" as const, label: "Em dia", n: contagem.em_dia },
          ]).map(x => (
            <button key={x.k} type="button" onClick={() => setFSituacao(fSituacao === x.k ? "" : x.k)}
              style={{ ...card, textAlign: "left", cursor: "pointer", background: COR[x.k].bg, borderColor: fSituacao === x.k ? COR[x.k].fg : "transparent" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COR[x.k].fg }}>{x.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: COR[x.k].fg }}>{carregando ? "…" : x.n}</div>
            </button>
          ))}
          <div style={{ ...card }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>Produtores sem CND Federal</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: semFederal.length ? "#C9921B" : "var(--text-1)" }}>{carregando ? "…" : semFederal.length}</div>
          </div>
        </div>

        <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ minWidth: 260 }}>
            <span style={lbl}>Produtor</span>
            <SelectBusca value={fProdutor} onChange={setFProdutor} placeholder="Todos os produtores"
              options={[{ value: "", label: "Todos os produtores" }, ...produtores.map(p => ({ value: p.id, label: p.nome, aliases: [p.cpf_cnpj ?? "", (p.cpf_cnpj ?? "").replace(/\D/g, "")] }))]} />
          </div>
          <div>
            <span style={lbl}>Certidão</span>
            <SelectField value={fTipo} onChange={e => setFTipo(e.target.value)} style={{ ...inp, width: 190 }}>
              <option value="">Todas</option>
              {TIPOS_CERTIDAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </SelectField>
          </div>
          <div>
            <span style={lbl}>Situação</span>
            <SelectField value={fSituacao} onChange={e => setFSituacao(e.target.value as "" | SituacaoVenc)} style={{ ...inp, width: 200 }}>
              <option value="">Todas</option>
              {(Object.keys(ROTULO_SITUACAO) as SituacaoVenc[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
            </SelectField>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", paddingBottom: 8 }}>
            <input type="checkbox" checked={historico} onChange={e => setHistorico(e.target.checked)} /> Mostrar certidões antigas (histórico)
          </label>
        </OperationalFilters>

        <div style={{ ...card, padding: 0, overflowX: "auto", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-page)", textAlign: "left" }}>
                {["Produtor", "Certidão", "Número", "Emissão", "Validade", "Situação", ""].map(h => <th key={h} style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-2)", fontWeight: 600, borderBottom: "0.5px solid var(--border)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {carregando ? <tr><td colSpan={7} style={{ padding: 16, color: "var(--text-3)" }}>Carregando…</td></tr>
                : linhas.length === 0 ? <tr><td colSpan={7} style={{ padding: 16, color: "var(--text-3)" }}>Nenhuma certidão {fProdutor || fTipo || fSituacao ? "com esses filtros" : "cadastrada ainda — use + Nova certidão"}.</td></tr>
                : linhas.map(c => {
                  const s = situacaoVenc(c.data_validade, hoje); const antiga = ehSubstituida(c, certidoes);
                  return (
                    <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border-table)", opacity: antiga ? 0.55 : 1 }}>
                      <td style={{ padding: "9px 12px" }}><div style={{ fontWeight: 600, color: "var(--text-1)" }}>{nome(c.produtor_id)}</div><div style={{ fontSize: 11, color: "var(--text-3)" }}>{doc(c.produtor_id)}</div></td>
                      <td style={{ padding: "9px 12px" }}>{rotuloTipoCertidao(c.tipo)}{c.positiva_efeito_negativa ? <span style={{ fontSize: 10, color: "var(--text-3)" }}> · positiva c/ efeito de negativa</span> : null}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{c.numero || "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{fmtData(c.data_emissao)}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{fmtData(c.data_validade)}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {antiga ? <span style={{ fontSize: 11, color: "var(--text-3)" }}>Substituída</span>
                          : <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: COR[s].bg, color: COR[s].fg, whiteSpace: "nowrap" }}>{s === "em_dia" ? "Em dia" : textoDias(diasAteData(c.data_validade, hoje))}</span>}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {!antiga && s !== "em_dia" && <OperationalButton data-arato-button="secondary" onClick={() => nova(c.produtor_id, c.tipo)} style={{ padding: "4px 10px", marginRight: 6, background: "#FBF3E0", color: "#8A6212", border: "0.5px solid #E9D29A", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Renovar</OperationalButton>}
                        <OperationalButton data-arato-button="secondary" onClick={() => abrir(c)} style={{ padding: "4px 10px", background: "var(--bg-card)", color: "var(--text-1)", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Abrir</OperationalButton>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {semFederal.length > 0 && !fProdutor && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Produtores sem CND Federal cadastrada</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {semFederal.map(id => (
                <OperationalButton key={id} data-arato-button="secondary" onClick={() => nova(id, "federal")} style={{ padding: "5px 10px", background: "#FBF3E0", color: "#8A6212", border: "0.5px solid #E9D29A", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  + {nome(id)}
                </OperationalButton>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Certificado digital A1</span>
            <Link href="/fiscal?aba=certificado" style={{ fontSize: 12, color: "#1A4870", fontWeight: 600, textDecoration: "none" }}>Gerenciar certificados →</Link>
          </div>
          {certsFiltrados.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhum certificado enviado{fProdutor ? " para este produtor" : ""}.</div>
            : certsFiltrados.map((c, i) => {
              const v = String(c.data_vencimento).slice(0, 10); const s = situacaoVenc(v, hoje);
              return (
                <div key={(c.produtor_id ?? "") + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderTop: i ? "0.5px solid var(--border-table)" : "none", fontSize: 13 }}>
                  <span style={{ flex: 1, color: "var(--text-1)" }}>{(c.produtor_id && produtores.some(p => p.id === c.produtor_id) ? nome(c.produtor_id) : c.produtor_nome) || c.cpf_cnpj}</span>
                  <span style={{ color: "var(--text-2)" }}>válido até {fmtData(v)}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: COR[s].bg, color: COR[s].fg }}>{s === "em_dia" ? "Em dia" : textoDias(diasAteData(v, hoje))}</span>
                </div>
              );
            })}
        </div>
      </div>

      {modal && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
          <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div data-arato-dialog-heading="true" style={{ padding: "16px 24px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{!modal.form.id ? "Nova certidão" : ro ? "Certidão" : "Editar certidão"}</span>
              <OperationalButton data-arato-button="icon" onClick={() => setModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>✕</OperationalButton>
            </div>
            <div data-arato-fields="true" style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <span style={lbl}>Produtor *</span>
                <SelectBusca value={modal.form.produtor_id} onChange={v => set("produtor_id", v)} disabled={ro}
                  options={produtores.map(p => ({ value: p.id, label: `${p.nome}${p.cpf_cnpj ? " — " + p.cpf_cnpj : ""}`, aliases: [(p.cpf_cnpj ?? "").replace(/\D/g, "")] }))} />
              </div>
              <div>
                <span style={lbl}>Certidão *</span>
                <SelectField value={modal.form.tipo} disabled={ro} style={inp}
                  onChange={e => { const t = e.target.value as TipoCertidao; set("tipo", t); set("orgao", TIPOS_CERTIDAO.find(x => x.id === t)?.orgao ?? ""); }}>
                  {TIPOS_CERTIDAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </SelectField>
              </div>
              <div><span style={lbl}>Órgão emissor</span><input value={modal.form.orgao} readOnly={ro} onChange={e => set("orgao", e.target.value)} style={inp} /></div>
              <div><span style={lbl}>Número da certidão</span><input value={modal.form.numero} readOnly={ro} onChange={e => set("numero", e.target.value)} style={inp} /></div>
              <div><span style={lbl}>Código de autenticação</span><input value={modal.form.codigo_autenticacao} readOnly={ro} onChange={e => set("codigo_autenticacao", e.target.value)} style={inp} /></div>
              <div><span style={lbl}>Emissão</span><InputData type="date" value={modal.form.data_emissao} readOnly={ro} disabled={ro} onChange={e => set("data_emissao", e.target.value)} style={inp} /></div>
              <div><span style={lbl}>Válida até *</span><InputData type="date" value={modal.form.data_validade} readOnly={ro} disabled={ro} onChange={e => set("data_validade", e.target.value)} style={inp} /></div>
              <label style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                <input type="checkbox" checked={modal.form.positiva_efeito_negativa} disabled={ro} onChange={e => set("positiva_efeito_negativa", e.target.checked)} />
                Positiva com efeito de negativa (CPEND)
              </label>
              <div style={{ gridColumn: "1/-1" }}><span style={lbl}>Observação</span><textarea value={modal.form.observacao} readOnly={ro} rows={2} onChange={e => set("observacao", e.target.value)} style={{ ...inp, resize: "vertical" }} /></div>
              {modal.form.tipo === "federal" && modal.form.data_validade && (
                <div style={{ gridColumn: "1/-1", background: "var(--bg-page)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>Texto para a NF-e (campo CND em Parâmetros do Sistema → Fiscal)</div>
                  <div style={{ fontSize: 12, color: "var(--text-1)", marginBottom: 6 }}>{textoNfe(modal.form)}</div>
                  <OperationalButton data-arato-button="secondary" onClick={() => { void navigator.clipboard?.writeText(textoNfe(modal.form)); setCopiado(true); }}
                    style={{ padding: "4px 10px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                    {copiado ? "✓ Copiado" : "Copiar texto"}
                  </OperationalButton>
                </div>
              )}
            </div>
            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                {modal.form.id && !ro && <OperationalButton data-arato-button="danger" onClick={excluir} style={{ padding: "8px 14px", background: "none", color: "#E24B4A", border: "0.5px solid #E24B4A", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Excluir</OperationalButton>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {ro && <OperationalButton data-arato-button="secondary" onClick={() => nova(modal.form.produtor_id, modal.form.tipo)} style={{ padding: "8px 14px", background: "#FBF3E0", color: "#8A6212", border: "0.5px solid #E9D29A", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Renovar</OperationalButton>}
                {ro && <OperationalButton data-arato-button="secondary" onClick={() => setModal(m => m && ({ ...m, somenteLeitura: false }))} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>✏ Editar</OperationalButton>}
                <OperationalButton data-arato-button="secondary" onClick={() => setModal(null)} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>{ro ? "Fechar" : "Cancelar"}</OperationalButton>
                {!ro && <OperationalButton data-arato-button="primary" onClick={salvar} disabled={salvando} style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{salvando ? "Salvando…" : "Salvar"}</OperationalButton>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
