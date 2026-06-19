"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Hierarquia: Conta → Produtor → Fazenda → Ano Safra → Ciclo → Talhão

export interface CascadeValues {
  produtorId: string;
  fazendaId:  string;
  anoSafraId: string;
  cicloId:    string;
  talhaoId:   string;
}

interface Row { id: string; nome: string }
interface CicloRow extends Row { ano_safra_id: string; cultura?: string; descricao?: string }

interface Props {
  contaId:    string | null;
  values:     Partial<CascadeValues>;
  onChange:   (next: Partial<CascadeValues>) => void;
  /** Quais níveis exibir. Padrão: todos os 5 */
  levels?:    Array<"produtor" | "fazenda" | "anoSafra" | "ciclo" | "talhao">;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", border: "0.5px solid #C8D6E8",
  borderRadius: 6, fontSize: 13, background: "#fff",
  boxSizing: "border-box" as const, color: "#1a1a1a",
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#1A4870",
  textTransform: "uppercase" as const, letterSpacing: "0.05em",
  display: "block", marginBottom: 4,
};

const CULTURAS: Record<string, string> = {
  soja: "Soja", milho_1: "Milho 1ª", milho_2: "Milho 2ª (Safrinha)",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo", outro: "Outro",
};

export default function CascadeSelector({ contaId, values, onChange, levels }: Props) {
  const show = levels ?? ["produtor", "fazenda", "anoSafra", "ciclo", "talhao"];

  const [produtores, setProdutores] = useState<Row[]>([]);
  const [fazendas,   setFazendas]   = useState<Row[]>([]);
  const [anosSafra,  setAnosSafra]  = useState<Row[]>([]);
  const [ciclos,     setCiclos]     = useState<CicloRow[]>([]);
  const [talhoes,    setTalhoes]    = useState<Row[]>([]);

  // 1. Carrega produtores da conta
  useEffect(() => {
    if (!contaId) return;
    supabase.from("produtores").select("id, nome").eq("conta_id", contaId).order("nome")
      .then(({ data }) => setProdutores(data ?? []));
  }, [contaId]);

  // 2. Carrega fazendas quando Produtor muda
  useEffect(() => {
    if (!values.produtorId) { setFazendas([]); return; }
    supabase.from("fazendas").select("id, nome")
      .eq("conta_id", contaId ?? "")
      .eq("produtor_id", values.produtorId)
      .order("nome")
      .then(({ data }) => setFazendas(data ?? []));
  }, [values.produtorId, contaId]);

  // 3. Carrega Anos Safra quando Fazenda muda
  useEffect(() => {
    if (!values.fazendaId) { setAnosSafra([]); setCiclos([]); setTalhoes([]); return; }
    supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", values.fazendaId).order("descricao", { ascending: false })
      .then(({ data }) => setAnosSafra((data ?? []).map(r => ({ id: r.id, nome: r.descricao }))));
    supabase.from("talhoes").select("id, nome").eq("fazenda_id", values.fazendaId).order("nome")
      .then(({ data }) => setTalhoes(data ?? []));
  }, [values.fazendaId]);

  // 4. Carrega Ciclos quando Fazenda ou Ano Safra muda
  useEffect(() => {
    if (!values.fazendaId) { setCiclos([]); return; }
    let q = supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id").eq("fazenda_id", values.fazendaId);
    if (values.anoSafraId) q = q.eq("ano_safra_id", values.anoSafraId);
    q.order("descricao").then(({ data }) => setCiclos((data ?? []).map(r => ({ id: r.id, nome: r.descricao ?? "", ano_safra_id: r.ano_safra_id, cultura: r.cultura }))));
  }, [values.fazendaId, values.anoSafraId]);

  function sel(field: keyof CascadeValues, id: string) {
    // Ao mudar um nível, limpa os níveis abaixo
    const reset: Partial<CascadeValues> = {};
    if (field === "produtorId") { reset.fazendaId = ""; reset.anoSafraId = ""; reset.cicloId = ""; reset.talhaoId = ""; }
    if (field === "fazendaId")  { reset.anoSafraId = ""; reset.cicloId = ""; reset.talhaoId = ""; }
    if (field === "anoSafraId") { reset.cicloId = ""; }
    onChange({ ...values, [field]: id, ...reset });
  }

  const ciclosFiltrados = values.anoSafraId
    ? ciclos.filter(c => c.ano_safra_id === values.anoSafraId)
    : ciclos;

  return (
    <div style={{ background: "#EFF6FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        Este lançamento pertence a
      </div>

      {/* Linha 1: Produtor | Fazenda */}
      {(show.includes("produtor") || show.includes("fazenda")) && (
        <div style={{ display: "grid", gridTemplateColumns: show.includes("produtor") && show.includes("fazenda") ? "1fr 1fr" : "1fr", gap: 12, marginBottom: (show.includes("anoSafra") || show.includes("ciclo") || show.includes("talhao")) ? 10 : 0 }}>
          {show.includes("produtor") && (
            <div>
              <label style={lbl}>Produtor <span style={{ color: "#E24B4A" }}>*</span></label>
              <select style={inp} value={values.produtorId ?? ""}
                onChange={e => sel("produtorId", e.target.value)}>
                <option value="">— Selecionar —</option>
                {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
          {show.includes("fazenda") && (
            <div>
              <label style={lbl}>Fazenda <span style={{ color: "#E24B4A" }}>*</span></label>
              <select style={inp} value={values.fazendaId ?? ""}
                onChange={e => sel("fazendaId", e.target.value)}
                disabled={!values.produtorId}>
                <option value="">{values.produtorId ? "— Selecionar —" : "← Selecione o produtor"}</option>
                {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Linha 2: Ano Safra | Ciclo | Talhão */}
      {(show.includes("anoSafra") || show.includes("ciclo") || show.includes("talhao")) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {show.includes("anoSafra") && (
            <div>
              <label style={lbl}>Ano Safra</label>
              <select style={inp} value={values.anoSafraId ?? ""}
                onChange={e => sel("anoSafraId", e.target.value)}
                disabled={!values.fazendaId}>
                <option value="">— Selecionar —</option>
                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          )}
          {show.includes("ciclo") && (
            <div>
              <label style={lbl}>Ciclo / Cultura</label>
              <select style={inp} value={values.cicloId ?? ""}
                onChange={e => sel("cicloId", e.target.value)}
                disabled={!values.fazendaId}>
                <option value="">— Selecionar —</option>
                {ciclosFiltrados.map(c => (
                  <option key={c.id} value={c.id}>
                    {CULTURAS[c.cultura ?? ""] ?? c.cultura ?? ""}{c.descricao ? ` · ${c.descricao}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {show.includes("talhao") && (
            <div>
              <label style={lbl}>Talhão</label>
              <select style={inp} value={values.talhaoId ?? ""}
                onChange={e => sel("talhaoId", e.target.value)}
                disabled={!values.fazendaId}>
                <option value="">— Selecionar —</option>
                {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
