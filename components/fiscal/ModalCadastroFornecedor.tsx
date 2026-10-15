"use client";
import { useEffect, useState } from "react";
import { criarPessoa } from "../../lib/db";
import type { Pessoa } from "../../lib/supabase";

// Cadastro rápido de fornecedor a partir da NF: o CNPJ/CPF e o nome já vêm da nota; para CNPJ a Receita Federal
// (/api/cadastros/consultar-cnpj) preenche razão social, endereço, telefone e e-mail. O usuário só edita o que precisar.
// CPF não tem consulta pública: abre com o documento e o nome da nota.

const dig = (v: string) => v.replace(/\D/g, "");
const maskCpfCnpj = (v: string) => {
  const d = dig(v);
  if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_m, a, b, c, e) => `${a}.${b}.${c}${e ? "-" + e : ""}`);
  return d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_m, a, b, c, e, f) => `${a}.${b}.${c}/${e}${f ? "-" + f : ""}`);
};
const maskCep = (v: string) => { const d = dig(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const maskPhone = (v: string) => {
  const d = dig(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

async function ibgePorMunicipio(municipio: string, uf: string): Promise<string> {
  if (!municipio.trim() || !uf.trim()) return "";
  try {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
    if (!r.ok) return "";
    const lista = await r.json() as { id: number; nome: string }[];
    const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return String(lista.find(m => n(m.nome) === n(municipio))?.id ?? "");
  } catch { return ""; }
}

const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-input, #fff)", color: "var(--text-1, #111)" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2, #555)", marginBottom: 4 };

export default function ModalCadastroFornecedor({ fazendaId, documento, nome, onClose, onSaved }: {
  fazendaId: string; documento: string; nome: string; onClose: () => void; onSaved: (p: Pessoa) => void;
}) {
  const [f, setF] = useState({
    nome, cpf_cnpj: maskCpfCnpj(documento), inscricao_est: "", email: "", telefone: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", municipio_ibge: "", estado: "",
  });
  const [consultando, setConsultando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);
  const tipo: "pf" | "pj" = dig(f.cpf_cnpj).length === 11 ? "pf" : "pj";

  async function consultar(doc: string) {
    const d = dig(doc);
    if (d.length !== 14) return;
    setConsultando(true); setMsg(""); setErro("");
    try {
      const r = await fetch(`/api/cadastros/consultar-cnpj?cnpj=${d}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j: any = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) { setErro(j?.error || `Não foi possível consultar a Receita (HTTP ${r.status}). Preencha à mão.`); return; }
      const cep = dig(j.cep ?? "");
      let ibge = "";
      if (cep.length === 8) {
        try { const rv = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const dv = await rv.json(); if (!dv.erro && dv.ibge) ibge = dv.ibge; } catch { /* tenta pelo nome */ }
      }
      if (!ibge && j.municipio) ibge = await ibgePorMunicipio(j.municipio, j.uf || "MT");
      const ie = j.inscricao_estadual || (Array.isArray(j.inscricoes_estaduais) && j.inscricoes_estaduais[0]?.numero) || "";
      setF(p => ({
        ...p, nome: j.razao_social || p.nome, inscricao_est: ie || p.inscricao_est, email: j.email || p.email,
        telefone: j.ddd_telefone_1 ? maskPhone(j.ddd_telefone_1) : p.telefone,
        cep: maskCep(j.cep ?? ""), logradouro: j.logradouro || "", numero: j.numero || "", complemento: j.complemento || "",
        bairro: j.bairro || "", municipio: j.municipio || "", municipio_ibge: ibge, estado: j.uf || p.estado,
      }));
      setMsg(`Dados preenchidos pela Receita Federal (${j.fonte ?? "consulta"}). Confira e edite o que precisar.`);
    } catch (e) {
      setErro("Falha ao consultar o CNPJ: " + (e instanceof Error ? e.message : String(e)));
    } finally { setConsultando(false); }
  }

  useEffect(() => { void consultar(documento); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function salvar() {
    setErro("");
    if (!f.nome.trim()) { setErro("Informe o nome / razão social."); return; }
    const d = dig(f.cpf_cnpj);
    if (d.length !== 11 && d.length !== 14) { setErro("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)."); return; }
    setSaving(true);
    try {
      const nova = await criarPessoa({
        fazenda_id: fazendaId, nome: f.nome.trim(), tipo, cliente: false, fornecedor: true, cpf_cnpj: d,
        inscricao_est: f.inscricao_est || undefined, email: f.email || undefined, telefone: f.telefone || undefined,
        cep: f.cep || undefined, logradouro: f.logradouro || undefined, numero: f.numero || undefined, complemento: f.complemento || undefined,
        bairro: f.bairro || undefined, municipio: f.municipio || undefined, municipio_ibge: f.municipio_ibge || undefined, estado: f.estado || undefined,
      } as never);
      onSaved(nova);
    } catch (e) {
      setErro("Erro ao cadastrar fornecedor: " + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  const campo = (k: keyof typeof f, label: string, extra?: { mask?: (v: string) => string; span?: number }) => (
    <div style={{ gridColumn: `span ${extra?.span ?? 1}` }}>
      <label style={lbl}>{label}</label>
      <input style={inp} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: extra?.mask ? extra.mask(e.target.value) : e.target.value }))} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--bg-card, #fff)", borderRadius: 12, padding: 22, width: "min(96vw, 720px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Cadastro de Fornecedor</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3, #666)", marginBottom: 12 }}>
          {tipo === "pj" ? "Os dados vêm da Receita Federal pelo CNPJ da NF; edite só o que precisar." : "CPF não tem consulta pública: o documento e o nome vêm da NF; complete o que precisar."}
        </div>
        {consultando && <div style={{ fontSize: 12, color: "#0B2D50", marginBottom: 10 }}>Consultando CNPJ na Receita Federal…</div>}
        {msg && <div style={{ fontSize: 12, color: "#14532D", background: "#E8F5E9", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>{msg}</div>}
        {erro && <div style={{ fontSize: 12, color: "#791F1F", background: "#FCEBEB", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>{erro}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          {campo("nome", tipo === "pj" ? "Razão social" : "Nome", { span: 4 })}
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>{tipo === "pj" ? "CNPJ" : "CPF"}</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={inp} value={f.cpf_cnpj} onChange={e => setF(p => ({ ...p, cpf_cnpj: maskCpfCnpj(e.target.value) }))} />
              {tipo === "pj" && <button onClick={() => consultar(f.cpf_cnpj)} disabled={consultando} style={{ padding: "0 10px", borderRadius: 8, border: "0.5px solid #1A4870", background: "#1A4870", color: "#fff", fontSize: 11, cursor: "pointer" }}>Consultar</button>}
            </div>
          </div>
          {campo("inscricao_est", "Inscrição Estadual", { span: 2 })}
          {campo("email", "E-mail", { span: 2 })}
          {campo("telefone", "Telefone", { span: 2, mask: maskPhone })}
          {campo("cep", "CEP", { span: 1, mask: maskCep })}
          {campo("logradouro", "Logradouro", { span: 3 })}
          {campo("numero", "Número", { span: 1 })}
          {campo("complemento", "Complemento", { span: 1 })}
          {campo("bairro", "Bairro", { span: 2 })}
          {campo("municipio", "Município", { span: 2 })}
          {campo("estado", "UF", { span: 1 })}
          {campo("municipio_ibge", "Cód. IBGE", { span: 1 })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border-table, #DDE2EE)", background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Salvando…" : "Cadastrar fornecedor"}</button>
        </div>
      </div>
    </div>
  );
}
