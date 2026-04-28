"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { ConfigContabilidade } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "24px 28px", marginBottom: 20 };
const secTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #E8EEF5" };

const ESCRITURACAO_LABELS: Record<string, string> = {
  G: "G — Diário Geral",
  R: "R — Razão Auxiliar",
  B: "B — Balancete de Verificação",
};

const TIPO_LIVRO_LABELS: Record<string, string> = {
  "1": "1 — Diário e Balancete",
  "2": "2 — Razão Auxiliar",
  "3": "3 — Razão Auxiliar com Balancete",
};

const SIT_INI_LABELS: Record<string, string> = {
  "0": "0 — Regular (exercício normal)",
  "1": "1 — Abertura",
  "2": "2 — Cisão",
  "3": "3 — Fusão",
  "4": "4 — Incorporação",
};

const VAZIO_CONFIG = (entidade: "pf" | "pj"): Omit<ConfigContabilidade, "id" | "fazenda_id" | "created_at"> => ({
  entidade,
  tipo_escrituracao: "G",
  nome_empresarial: "",
  cnpj: "",
  cpf: "",
  uf: "",
  cod_municipio_ibge: "",
  nome_municipio: "",
  ie: "",
  nire: "",
  nr_livro: "1",
  nome_livro: entidade === "pf" ? "Livro Diário — Produtor Rural" : "Livro Diário — Pessoa Jurídica",
  nr_tipo_livro: "1",
  ind_sit_ini: "0",
  resp_nome: "",
  resp_cpf: "",
  resp_crc: "",
  resp_email: "",
  termo_abertura: "",
  termo_encerramento: "",
  ativo: true,
});

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export default function ContabilidadePage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"pf" | "pj">("pf");
  const [configs, setConfigs] = useState<Record<"pf"|"pj", ConfigContabilidade | null>>({ pf: null, pj: null });
  const [form, setForm] = useState<Omit<ConfigContabilidade, "id" | "fazenda_id" | "created_at">>(VAZIO_CONFIG("pf"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("config_contabilidade")
      .select("*")
      .eq("fazenda_id", fazendaId);
    const mapa: Record<"pf"|"pj", ConfigContabilidade | null> = { pf: null, pj: null };
    for (const c of (data ?? []) as ConfigContabilidade[]) {
      if (c.entidade === "pf" || c.entidade === "pj") mapa[c.entidade] = c;
    }
    setConfigs(mapa);
    const atual = mapa[aba];
    if (atual) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, fazenda_id, created_at, ...rest } = atual;
      setForm(rest);
    } else {
      setForm(VAZIO_CONFIG(aba));
    }
  }, [fazendaId, aba]);

  useEffect(() => { carregar(); }, [carregar]);

  function mudarAba(nova: "pf" | "pj") {
    setAba(nova);
    const existente = configs[nova];
    if (existente) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, fazenda_id, created_at, ...rest } = existente;
      setForm(rest);
    } else {
      setForm(VAZIO_CONFIG(nova));
    }
    setSaved(false);
    setErr("");
  }

  function set(field: string, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function salvar() {
    if (!fazendaId) return;
    setSaving(true);
    setErr("");
    try {
      const existente = configs[aba];
      if (existente) {
        const { error } = await supabase
          .from("config_contabilidade")
          .update({ ...form })
          .eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("config_contabilidade")
          .insert({ fazenda_id: fazendaId, ...form });
        if (error) throw error;
      }
      await carregar();
      setSaved(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const ABA_LABELS = { pf: "Produtor / Pessoa Física", pj: "Empresa / Pessoa Jurídica" };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", margin: 0 }}>Configuração Contábil</h1>
          <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
            Parâmetros para geração do SPED ECD (Escrituração Contábil Digital).
            Cada entidade — Produtor Rural (PF) e Empresa (PJ) — tem seu próprio livro contábil.
          </p>
        </div>

        {/* Info box */}
        <div style={{ background: "#D5E8F5", border: "0.5px solid #A8CDE8", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#0B2D50", display: "flex", gap: 10 }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <div>
            <strong>Responsabilidade técnica:</strong> a definição do método de escrituração (G, R ou B)
            e o preenchimento dos termos de abertura e encerramento é responsabilidade do contador habilitado.
            Consulte seu contador antes de gerar o SPED ECD.
          </div>
        </div>

        {/* Abas PF / PJ */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
          {(["pf","pj"] as const).map(e => (
            <button
              key={e}
              onClick={() => mudarAba(e)}
              style={{
                padding: "10px 24px", border: "none", borderRadius: "8px 8px 0 0",
                background: aba === e ? "#1A5CB8" : "#E8EEF5",
                color: aba === e ? "#fff" : "#555",
                fontWeight: aba === e ? 700 : 400, cursor: "pointer", fontSize: 13,
              }}
            >
              {ABA_LABELS[e]}
              {configs[e] && <span style={{ marginLeft: 6, fontSize: 10, background: aba === e ? "rgba(255,255,255,0.25)" : "#1A5CB820", padding: "1px 6px", borderRadius: 8 }}>Configurado</span>}
            </button>
          ))}
        </div>

        {/* ── Identificação da Entidade ── */}
        <div style={card}>
          <div style={secTitle}>Identificação da Entidade</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 20px" }}>
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>Nome / Razão Social</label>
              <input style={inp} value={form.nome_empresarial} onChange={e => set("nome_empresarial", e.target.value)} placeholder={aba === "pf" ? "Nome completo do produtor" : "Razão social da empresa"} />
            </div>
            <div>
              <label style={lbl}>Situação Inicial</label>
              <select style={inp} value={form.ind_sit_ini ?? "0"} onChange={e => set("ind_sit_ini", e.target.value)}>
                {Object.entries(SIT_INI_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {aba === "pj" ? (
              <div>
                <label style={lbl}>CNPJ</label>
                <input style={inp} value={form.cnpj ?? ""} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
            ) : (
              <div>
                <label style={lbl}>CPF</label>
                <input style={inp} value={form.cpf ?? ""} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" />
              </div>
            )}
            <div>
              <label style={lbl}>Inscrição Estadual</label>
              <input style={inp} value={form.ie ?? ""} onChange={e => set("ie", e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label style={lbl}>NIRE</label>
              <input style={inp} value={form.nire ?? ""} onChange={e => set("nire", e.target.value)} placeholder="Opcional (Junta Comercial)" />
            </div>

            <div>
              <label style={lbl}>UF</label>
              <select style={inp} value={form.uf ?? ""} onChange={e => set("uf", e.target.value)}>
                <option value="">Selecione</option>
                {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Município</label>
              <input style={inp} value={form.nome_municipio ?? ""} onChange={e => set("nome_municipio", e.target.value)} placeholder="Ex: Nova Mutum" />
            </div>
            <div>
              <label style={lbl}>Código IBGE do Município</label>
              <input style={inp} value={form.cod_municipio_ibge ?? ""} onChange={e => set("cod_municipio_ibge", e.target.value)} placeholder="7 dígitos — ex: 5106224" />
            </div>
          </div>
        </div>

        {/* ── Livro Contábil ── */}
        <div style={card}>
          <div style={secTitle}>Livro Contábil</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 20px" }}>
            <div>
              <label style={lbl}>Método de Escrituração</label>
              <select style={inp} value={form.tipo_escrituracao} onChange={e => set("tipo_escrituracao", e.target.value)}>
                {Object.entries(ESCRITURACAO_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Nº do Livro</label>
              <input style={inp} value={form.nr_livro ?? ""} onChange={e => set("nr_livro", e.target.value)} placeholder="Ex: 1" />
            </div>
            <div>
              <label style={lbl}>Tipo do Livro</label>
              <select style={inp} value={form.nr_tipo_livro ?? "1"} onChange={e => set("nr_tipo_livro", e.target.value)}>
                {Object.entries(TIPO_LIVRO_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / 4" }}>
              <label style={lbl}>Nome do Livro</label>
              <input style={inp} value={form.nome_livro ?? ""} onChange={e => set("nome_livro", e.target.value)} placeholder="Ex: Livro Diário — Produtor Rural — Exercício 2025" />
            </div>
          </div>

          {/* Aviso método */}
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#FBF3E0", border: "0.5px solid #C9921B50", borderRadius: 8, fontSize: 12, color: "#7B4A00" }}>
            <strong>Sobre o método de escrituração:</strong> G (Diário Geral) é o mais comum — lançamentos a débito e crédito.
            R (Razão Auxiliar) detalha uma conta do Diário. B (Balancete) é para fins de comparação.
            Seu contador definirá o método correto.
          </div>
        </div>

        {/* ── Responsável Técnico ── */}
        <div style={card}>
          <div style={secTitle}>Responsável Técnico (Contador)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px 20px" }}>
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>Nome Completo do Contador</label>
              <input style={inp} value={form.resp_nome ?? ""} onChange={e => set("resp_nome", e.target.value)} placeholder="Nome do contador responsável" />
            </div>
            <div>
              <label style={lbl}>CPF do Contador</label>
              <input style={inp} value={form.resp_cpf ?? ""} onChange={e => set("resp_cpf", e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <label style={lbl}>CRC</label>
              <input style={inp} value={form.resp_crc ?? ""} onChange={e => set("resp_crc", e.target.value)} placeholder="Ex: MT-012345/O-8" />
            </div>
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>E-mail do Contador</label>
              <input style={inp} type="email" value={form.resp_email ?? ""} onChange={e => set("resp_email", e.target.value)} placeholder="contador@escritorio.com.br" />
            </div>
          </div>
        </div>

        {/* ── Termos ── */}
        <div style={card}>
          <div style={secTitle}>Termos do Livro</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
            Os termos de abertura e encerramento são incluídos no arquivo SPED ECD.
            Se deixados em branco, será gerado um termo padrão com os dados acima.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
            <div>
              <label style={lbl}>Termo de Abertura</label>
              <textarea
                style={{ ...inp, height: 120, resize: "vertical" as const }}
                value={form.termo_abertura ?? ""}
                onChange={e => set("termo_abertura", e.target.value)}
                placeholder="Deixe em branco para gerar automaticamente com os dados acima."
              />
            </div>
            <div>
              <label style={lbl}>Termo de Encerramento</label>
              <textarea
                style={{ ...inp, height: 120, resize: "vertical" as const }}
                value={form.termo_encerramento ?? ""}
                onChange={e => set("termo_encerramento", e.target.value)}
                placeholder="Deixe em branco para gerar automaticamente com os dados acima."
              />
            </div>
          </div>
        </div>

        {/* Rodapé de ação */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={salvar}
            disabled={saving}
            style={{ padding: "10px 28px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            {saving ? "Salvando..." : `Salvar Configuração ${aba.toUpperCase()}`}
          </button>
          {saved && <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>✓ Configuração salva</span>}
          {err && <span style={{ fontSize: 13, color: "#E24B4A" }}>{err}</span>}
          <div style={{ flex: 1 }} />
          <a
            href="/fiscal/sped-contabil"
            style={{ padding: "10px 20px", background: "#F4F6FA", border: "0.5px solid #1A5CB8", color: "#1A5CB8", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, textDecoration: "none" }}
          >
            Gerar SPED ECD →
          </a>
        </div>
      </div>
    </div>
  );
}
