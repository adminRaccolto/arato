"use client";
// Lança um CT-e recebido (frete contratado) que não veio do SIEG: pelo arquivo XML (lido como na importação do SIEG)
// ou digitado. Entra pendente em cte_entradas e abre o mesmo processamento (ModalCteEntrada) que gera o CP.
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import InputData from "../InputData";
import { OperationalButton } from "../OperationalUI";

const inp: CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
const lbl: CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const dig = (v: string) => v.replace(/\D/g, "");
const numBR = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const fmtCnpj = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;

const VAZIO = {
  chave: "", numero: "", serie: "", data_emissao: new Date().toISOString().slice(0, 10), emitente_nome: "", emitente_uf: "",
  municipio_origem: "", uf_origem: "", municipio_destino: "", uf_destino: "", produto_descricao: "", peso_kg: "", valor_prestacao: "", nfe_chaves: "",
};

export default function ModalCteEntradaNovo({ fazendaIds, fazendaPadrao, onClose, onCriado }: {
  fazendaIds: string[]; fazendaPadrao: string | null; onClose: () => void; onCriado: (id: string) => void;
}) {
  const [modo, setModo] = useState<"xml" | "digitar">("xml");
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);
  const [fazenda, setFazenda] = useState(fazendaPadrao ?? "");
  const [arquivo, setArquivo] = useState<{ nome: string; xml: string } | null>(null);
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState("");
  const [existente, setExistente] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!fazendaIds.length) return;
    supabase.from("fazendas").select("id, nome").in("id", fazendaIds).order("nome").then(({ data }) => {
      const lista = (data ?? []) as { id: string; nome: string }[];
      setFazendas(lista);
      if (!fazenda && lista.length === 1) setFazenda(lista[0].id);
    });
  }, [fazendaIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const chave = dig(f.chave);
  // Número, série e CNPJ da transportadora vêm da própria chave de acesso
  const daChave = chave.length === 44 ? { numero: chave.slice(25, 34).replace(/^0+/, ""), serie: chave.slice(22, 25).replace(/^0+/, "") || "0", cnpj: chave.slice(6, 20) } : null;
  const set = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  // Número e série vêm preenchidos pela chave (podem ser corrigidos)
  const setChave = (v: string) => setF(p => {
    const d = dig(v);
    return d.length === 44 ? { ...p, chave: v, numero: d.slice(25, 34).replace(/^0+/, ""), serie: d.slice(22, 25).replace(/^0+/, "") || "0" } : { ...p, chave: v };
  });

  async function lerArquivo(file: File | undefined) {
    setErro(""); setExistente(null);
    if (!file) { setArquivo(null); return; }
    const xml = await file.text();
    if (!/<(\w+:)?infCte\b/.test(xml)) { setArquivo(null); setErro("Esse arquivo não é o XML de um CT-e."); return; }
    setArquivo({ nome: file.name, xml });
  }

  async function salvar() {
    setErro(""); setExistente(null);
    if (!fazenda) { setErro("Escolha a fazenda."); return; }
    if (modo === "xml" && !arquivo) { setErro("Escolha o arquivo XML do CT-e."); return; }
    if (modo === "digitar") {
      if (chave.length !== 44) { setErro("A chave de acesso tem 44 dígitos."); return; }
      if (!dig(f.numero)) { setErro("Informe o número do CT-e."); return; }
      if (!f.emitente_nome.trim()) { setErro("Informe a transportadora."); return; }
      if (!(numBR(f.valor_prestacao) ?? 0)) { setErro("Informe o valor do frete."); return; }
    }
    setSalvando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/fiscal/cte-entrada", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(modo === "xml" ? { acao: "criar", fazenda_id: fazenda, xml: arquivo!.xml } : {
          acao: "criar", fazenda_id: fazenda, digitado: {
            chave, numero: f.numero, serie: f.serie, data_emissao: f.data_emissao, emitente_nome: f.emitente_nome, emitente_uf: f.emitente_uf,
            municipio_origem: f.municipio_origem, uf_origem: f.uf_origem, municipio_destino: f.municipio_destino, uf_destino: f.uf_destino,
            produto_descricao: f.produto_descricao, peso_kg: numBR(f.peso_kg), valor_prestacao: numBR(f.valor_prestacao) ?? 0,
            nfe_chaves: f.nfe_chaves.split(/[\s,;]+/).map(dig).filter(k => k.length === 44),
          },
        }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as { ok: boolean; id?: string; error?: string; existente_id?: string };
      if (!j.ok || !j.id) { setErro(j.error ?? "Erro ao lançar."); setExistente(j.existente_id ?? null); return; }
      onCriado(j.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  const aba = (v: "xml" | "digitar", rot: string) => (
    <button type="button" onClick={() => { setModo(v); setErro(""); setExistente(null); }}
      style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: modo === v ? 600 : 400,
        border: modo === v ? "0.5px solid #1A4870" : "0.5px solid var(--border-table)", background: modo === v ? "#D5E8F5" : "transparent", color: modo === v ? "#0B2D50" : "var(--text-2)" }}>{rot}</button>
  );

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div data-arato-dialog="page" style={{ background: "var(--bg-card, #fff)", borderRadius: 12, width: "min(96vw, 760px)", maxHeight: "92vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h2 data-arato-h2="true" style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Lançar CT-e de frete contratado</h2>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>CT-e que não veio do SIEG. Depois de lançado, é processado como os demais: gera o Contas a Pagar para a transportadora.</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>{aba("xml", "Importar XML")}{aba("digitar", "Digitar dados")}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Fazenda *</label>
            <select value={fazenda} onChange={e => setFazenda(e.target.value)} style={inp}>
              <option value="">— Escolha —</option>
              {fazendas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>

          {modo === "xml" ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Arquivo XML do CT-e *</label>
              <input type="file" accept=".xml,text/xml,application/xml" onChange={e => lerArquivo(e.target.files?.[0])} style={{ ...inp, padding: 7 }} />
              {arquivo && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>{arquivo.nome} — os dados (transportadora, rota, carga, valores e NF-e) são lidos do arquivo.</div>}
            </div>
          ) : <>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Chave de acesso (44 dígitos) *</label>
              <input value={f.chave} onChange={e => setChave(e.target.value)} maxLength={60} style={{ ...inp, fontFamily: "monospace" }} placeholder="ex.: 5126 1021 0169 5900 0195 5700 2000 0035 2517 7521 6766" />
              {daChave && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>Transportadora CNPJ {fmtCnpj(daChave.cnpj)}</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
              <div><label style={lbl}>Nº do CT-e *</label><input value={f.numero} onChange={e => setF(p => ({ ...p, numero: dig(e.target.value) }))} inputMode="numeric" style={inp} placeholder="pela chave" /></div>
              <div><label style={lbl}>Série</label><input value={f.serie} onChange={e => setF(p => ({ ...p, serie: dig(e.target.value) }))} inputMode="numeric" style={inp} /></div>
            </div>
            <div />
            <div>
              <label style={lbl}>Transportadora (nome) *</label>
              <input value={f.emitente_nome} onChange={set("emitente_nome")} style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
              <div><label style={lbl}>Emissão *</label><InputData type="date" value={f.data_emissao} onChange={e => setF(p => ({ ...p, data_emissao: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>UF transp.</label><select value={f.emitente_uf} onChange={set("emitente_uf")} style={inp}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
              <div><label style={lbl}>Município de origem</label><input value={f.municipio_origem} onChange={set("municipio_origem")} style={inp} /></div>
              <div><label style={lbl}>UF</label><select value={f.uf_origem} onChange={set("uf_origem")} style={inp}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
              <div><label style={lbl}>Município de destino</label><input value={f.municipio_destino} onChange={set("municipio_destino")} style={inp} /></div>
              <div><label style={lbl}>UF</label><select value={f.uf_destino} onChange={set("uf_destino")} style={inp}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div>
              <label style={lbl}>Carga (produto)</label>
              <input value={f.produto_descricao} onChange={set("produto_descricao")} style={inp} placeholder="ex.: SOJA EM GRÃOS" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label style={lbl}>Peso (kg)</label><input value={f.peso_kg} onChange={set("peso_kg")} inputMode="decimal" style={inp} /></div>
              <div><label style={lbl}>Valor do frete (R$) *</label><input value={f.valor_prestacao} onChange={set("valor_prestacao")} inputMode="decimal" style={inp} placeholder="0,00" /></div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Chaves das NF-e transportadas (opcional)</label>
              <input value={f.nfe_chaves} onChange={set("nfe_chaves")} style={{ ...inp, fontFamily: "monospace" }} placeholder="uma ou mais chaves de 44 dígitos, separadas por vírgula" />
            </div>
          </>}
        </div>

        {erro && (
          <div style={{ marginTop: 12, padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12 }}>
            {erro}
            {existente && <button type="button" onClick={() => onCriado(existente)} style={{ marginLeft: 8, border: "none", background: "none", color: "#0C447C", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Abrir o CT-e já lançado</button>}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <OperationalButton data-arato-button="secondary" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</OperationalButton>
          <OperationalButton data-arato-button="primary" disabled={salvando} onClick={salvar} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{salvando ? "Lançando…" : "Lançar CT-e"}</OperationalButton>
        </div>
      </div>
    </div>
  );
}
