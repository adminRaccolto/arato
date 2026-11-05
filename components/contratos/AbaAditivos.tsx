"use client";
import { useCallback, useEffect, useState } from "react";
import { hojeLocal } from "../../lib/data-local";
import InputData from "../InputData";
import InputNumerico from "../InputNumerico";
import InputMonetario from "../InputMonetario";
import { confirmarAcao } from "../ConfirmarAcao";
import { TIPO_ADITIVO_LABEL, pisoQuantidade, valorDoContrato, type TipoAditivo } from "../../lib/contratos/aditivos";

type Aditivo = { id: string; numero: number; data_aditivo: string; tipo: TipoAditivo; descricao: string; pdf_url?: string | null; pdf_nome?: string | null; usuario_nome?: string | null; novo_contrato_id?: string | null };
type Pessoa = { id: string; nome: string };
type ContratoAba = { id: string; numero: string; status?: string; confirmado?: boolean; preco?: number; quantidade_sc?: number; entregue_sc?: number; moeda?: string; valor_ajuste_aditivo?: number | null; data_entrega?: string; data_pagamento?: string | null; a_fixar?: boolean };

const TIPOS: TipoAditivo[] = ["quantidade", "preco", "prazo_entrega", "pagamento", "local_entrega", "comprador", "outros"];
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", color: "var(--text-1)", boxSizing: "border-box", outline: "none" };
const fmtData = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const fmtSc = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function AbaAditivos({ contrato, pessoas, podeLancar, usuarioNome, enviarPdf, aoAlterar, aoNovoContrato }: {
  contrato: ContratoAba;
  pessoas: Pessoa[];
  podeLancar: boolean;
  usuarioNome?: string | null;
  enviarPdf: (arquivo: File) => Promise<{ url: string; nome: string }>;
  aoAlterar: () => Promise<void> | void;
  aoNovoContrato: () => void;
}) {
  const [aditivos, setAditivos] = useState<Aditivo[]>([]);
  const [faturado, setFaturado] = useState(0);
  const [semMigracao, setSemMigracao] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const vazio = { tipo: "quantidade" as TipoAditivo, data_aditivo: hojeLocal(), descricao: "", quantidade: 0, preco: 0, data: "", pessoa_id: "" };
  const [f, setF] = useState(vazio);
  const [pdf, setPdf] = useState<File | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/contratos/aditivos?contrato_id=${contrato.id}`);
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${r.status}`);
      setAditivos(j.aditivos ?? []); setFaturado(Number(j.faturado_sc) || 0); setSemMigracao(!!j.sem_migracao);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }, [contrato.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  const quantidade = Number(contrato.quantidade_sc) || 0;
  const preco = Number(contrato.preco) || 0;
  const piso = pisoQuantidade(contrato, faturado);
  const saldoSemNf = Math.max(0, quantidade - faturado);
  const moeda = contrato.moeda === "USD" ? "USD" : "BRL";
  const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  const aberto = contrato.status !== "cancelado";

  async function registrar() {
    if (!(await confirmarAcao({ titulo: "Registrar aditivo", mensagem: "O aditivo altera o contrato e o título a receber em aberto. Confira os dados antes de confirmar.", perigo: false }))) return;
    setSalvando(true); setErro(""); setAviso("");
    try {
      const anexo = pdf ? await enviarPdf(pdf) : null;
      const r = await fetch("/api/contratos/aditivos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato_id: contrato.id, tipo: f.tipo, data_aditivo: f.data_aditivo, descricao: f.descricao,
          quantidade_sc: f.quantidade || undefined, preco: f.preco || undefined, data: f.data || undefined, pessoa_id: f.pessoa_id || undefined,
          pdf_url: anexo?.url, pdf_nome: anexo?.nome, usuario_nome: usuarioNome ?? undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${r.status}`);
      setF(vazio); setPdf(null);
      if (j.avisos?.length) setAviso(j.avisos.join(" "));
      await aoAlterar();
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }

  const resumo: [string, string][] = [
    ["Quantidade", `${fmtSc(quantidade)} sc`],
    ["Entregue", `${fmtSc(Number(contrato.entregue_sc) || 0)} sc`],
    ["Com NF", `${fmtSc(faturado)} sc`],
    ["Preço atual", `${dinheiro(preco)}/sc`],
    ["Valor com aditivos", dinheiro(valorDoContrato(contrato))],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12, color: "var(--text-2)" }}>
        {resumo.map(([k, v]) => <span key={k}>{k}: <strong style={{ color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{v}</strong></span>)}
      </div>

      {semMigracao && <div style={{ fontSize: 13, color: "#A93226" }}>Execute a Seção 418 no Supabase para usar os aditivos.</div>}
      {!contrato.confirmado && <div style={{ fontSize: 13, color: "var(--text-2)" }}>Contrato ainda não confirmado: altere direto na aba Principal.</div>}

      {contrato.confirmado && aberto && podeLancar && !semMigracao && (
        <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Novo aditivo</div>
          <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <div>
              <label data-arato-label="true" style={lbl}>Tipo *</label>
              <select style={inp} value={f.tipo} onChange={e => setF(p => ({ ...p, tipo: e.target.value as TipoAditivo }))}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_ADITIVO_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label data-arato-label="true" style={lbl}>Data do aditivo *</label>
              <InputData style={inp} type="date" value={f.data_aditivo} onChange={e => setF(p => ({ ...p, data_aditivo: e.target.value }))} />
            </div>
            {f.tipo === "quantidade" && (
              <div>
                <label data-arato-label="true" style={lbl}>Nova quantidade (sc) *</label>
                <InputNumerico style={inp} decimais={3} min="0" value={f.quantidade || ""} onChange={v => setF(p => ({ ...p, quantidade: Number(v) || 0 }))} placeholder={`mínimo ${fmtSc(piso)}`} />
              </div>
            )}
            {f.tipo === "preco" && (
              <div>
                <label data-arato-label="true" style={lbl}>Novo preço por saca *</label>
                <InputMonetario style={inp} decimais={4} min="0" value={f.preco || ""} onChange={v => setF(p => ({ ...p, preco: Number(v) || 0 }))} />
              </div>
            )}
            {(f.tipo === "prazo_entrega" || f.tipo === "pagamento") && (
              <div>
                <label data-arato-label="true" style={lbl}>{f.tipo === "pagamento" ? `Nova data de pagamento * (hoje ${fmtData(contrato.data_pagamento)})` : `Nova data de entrega * (hoje ${fmtData(contrato.data_entrega)})`}</label>
                <InputData style={inp} type="date" value={f.data} onChange={e => setF(p => ({ ...p, data: e.target.value }))} />
              </div>
            )}
            {(f.tipo === "comprador" || f.tipo === "local_entrega") && (
              <div>
                <label data-arato-label="true" style={lbl}>{f.tipo === "comprador" ? "Novo comprador *" : "Novo local de entrega *"}</label>
                <select style={inp} value={f.pessoa_id} onChange={e => setF(p => ({ ...p, pessoa_id: e.target.value }))}>
                  <option value="">Selecione</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <label data-arato-label="true" style={lbl}>PDF do aditivo</label>
              <input type="file" accept="application/pdf" style={{ ...inp, padding: "5px 8px" }} onChange={e => setPdf(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label data-arato-label="true" style={lbl}>{f.tipo === "outros" ? "Descrição *" : "Observação"}</label>
            <input style={inp} value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} />
          </div>

          {f.tipo === "preco" && f.preco > 0 && f.preco !== preco && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)" }}>
              Vale para {fmtSc(saldoSemNf)} sc ainda sem NF. O título a receber muda em {dinheiro((f.preco - preco) * saldoSemNf)}. NF já emitida não muda; correção nela é por NF complementar.
            </div>
          )}
          {f.tipo === "quantidade" && f.quantidade > 0 && f.quantidade >= piso && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)" }}>O título a receber muda em {dinheiro((f.quantidade - quantidade) * preco)}.</div>
          )}
          {(f.tipo === "quantidade" || f.tipo === "preco" || f.tipo === "comprador") && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>{f.tipo === "comprador" ? "Já tem entrega ou NF?" : "Mudou volume e preço juntos?"} O saldo de {fmtSc(Math.max(0, quantidade - piso))} sc vai para um contrato novo.</span>
              <button data-arato-button="secondary" type="button" disabled={piso >= quantidade} onClick={aoNovoContrato}
                style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid #1A4870", background: "transparent", color: "#1A4870", fontSize: 12, fontWeight: 600, cursor: piso >= quantidade ? "not-allowed" : "pointer" }}>
                Novo contrato pelo saldo
              </button>
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button data-arato-button="primary" type="button" disabled={salvando} onClick={registrar}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
              {salvando ? "Registrando…" : "Registrar aditivo"}
            </button>
          </div>
        </div>
      )}

      {erro && <div style={{ fontSize: 13, color: "#A93226" }}>{erro}</div>}
      {aviso && <div style={{ fontSize: 13, color: "#7A5200" }}>{aviso}</div>}

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Histórico</div>
        {carregando ? <div style={{ fontSize: 13, color: "var(--text-3)" }}>Carregando…</div>
          : aditivos.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)" }}>Nenhum aditivo neste contrato.</div>
          : (
            <table data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["Nº", "Data", "Tipo", "O que mudou", "Lançado por", "PDF"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {aditivos.map(a => (
                  <tr key={a.id}>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)" }}>{a.numero}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)", whiteSpace: "nowrap" }}>{fmtData(a.data_aditivo)}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)", whiteSpace: "nowrap" }}>{TIPO_ADITIVO_LABEL[a.tipo] ?? a.tipo}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)" }}>{a.descricao}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)" }}>{a.usuario_nome ?? "—"}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--bg-tag)" }}>{a.pdf_url ? <a href={a.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: "#1A4870" }}>{a.pdf_nome ?? "Abrir"}</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
