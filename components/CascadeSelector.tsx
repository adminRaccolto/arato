"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Hierarquia: Conta → Produtor → IE → Fazenda → Ano Safra → Ciclo → Talhão

export interface CascadeValues {
  produtorId: string;
  ieId?:      string;   // Inscrição Estadual — opcional, só quando level "ie" está ativo
  fazendaId:  string;
  anoSafraId: string;
  cicloId:    string;
  talhaoId:   string;
}

interface Row    { id: string; nome: string }
interface IeRow  { id: string; inscricao_estadual: string; estado: string; fazenda_id?: string | null; ativa: boolean }
interface CicloRow extends Row { ano_safra_id: string; cultura?: string; descricao?: string }

interface Props {
  contaId:           string | null;
  fazendaIdFallback?: string | null;
  values:     Partial<CascadeValues>;
  onChange:   (next: Partial<CascadeValues>) => void;
  /** Quais níveis exibir. Padrão: todos sem "ie". Adicione "ie" para ativar o seletor de IE. */
  levels?:    Array<"produtor" | "ie" | "fazenda" | "anoSafra" | "ciclo" | "talhao">;
  /** Remove o asterisco de obrigatório do campo Fazenda. Padrão: true */
  fazendaRequired?: boolean;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", border: "0.5px solid #C8D6E8",
  borderRadius: 6, fontSize: 13, background: "var(--bg-card)",
  boxSizing: "border-box" as const, color: "var(--text-1)",
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#111111",
  textTransform: "uppercase" as const, letterSpacing: "0.05em",
  display: "block", marginBottom: 4,
};

const CULTURAS: Record<string, string> = {
  soja: "Soja", milho_1: "Milho 1ª", milho_2: "Milho 2ª (Safrinha)",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo", outro: "Outro",
};

export default function CascadeSelector({ contaId, fazendaIdFallback, values, onChange, levels, fazendaRequired = true }: Props) {
  const show = levels ?? ["produtor", "fazenda", "anoSafra", "ciclo", "talhao"];
  const useIE = show.includes("ie");

  const [produtores, setProdutores] = useState<Row[]>([]);
  const [ies,        setIes]        = useState<IeRow[]>([]);
  const [fazendas,   setFazendas]   = useState<Row[]>([]);
  const [anosSafra,  setAnosSafra]  = useState<Row[]>([]);
  const [ciclos,     setCiclos]     = useState<CicloRow[]>([]);
  const [talhoes,    setTalhoes]    = useState<Row[]>([]);

  // 1. Produtores — quando "ie" está ativo, filtra apenas os que têm IE cadastrada
  useEffect(() => {
    const params = new URLSearchParams();
    if (contaId && !contaId.startsWith("sem_conta_")) {
      params.set("conta_id", contaId);
    } else if (fazendaIdFallback) {
      params.set("fazenda_id", fazendaIdFallback);
    } else {
      setProdutores([]);
      return;
    }
    if (useIE) params.set("apenas_com_ie", "true");

    fetch(`/api/produtores/listar?${params}`)
      .then(r => r.ok ? r.json() : { produtores: [] })
      .then(json => setProdutores((json.produtores ?? []).map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))))
      .catch(() => setProdutores([]));
  }, [contaId, fazendaIdFallback, useIE]);

  // 2. IEs do Produtor selecionado (só quando nível "ie" está ativo)
  useEffect(() => {
    if (!useIE || !values.produtorId) { setIes([]); return; }
    supabase
      .from("produtor_inscricoes_estaduais")
      .select("id, inscricao_estadual, estado, fazenda_id, ativa")
      .eq("produtor_id", values.produtorId)
      .eq("ativa", true)
      .order("estado")
      .then(({ data }) => {
        const lista = (data ?? []) as IeRow[];
        setIes(lista);
        // Auto-seleciona se houver apenas 1 IE
        if (lista.length === 1 && !values.ieId) {
          const ie = lista[0];
          onChange({ ...values, ieId: ie.id, fazendaId: ie.fazenda_id ?? values.fazendaId ?? "" });
        }
      });
  }, [values.produtorId, useIE]);

  // 3. Fazendas
  useEffect(() => {
    const cidReal = contaId && !contaId.startsWith("sem_conta_") ? contaId : null;
    if (!cidReal && !fazendaIdFallback) { setFazendas([]); return; }

    fetch("/api/fazenda/da-conta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conta_id: cidReal, fazenda_id: fazendaIdFallback }),
    })
      .then(r => r.ok ? r.json() : { fazendas: [] })
      .then(json => {
        let fzs: Row[] = (json.fazendas ?? []).map((f: { id: string; nome: string }) => ({ id: f.id, nome: f.nome }));

        // Filtra por produtor_id se houver vínculo direto
        if (values.produtorId) {
          const comProdutor = (json.fazendas ?? []).filter((f: { produtor_id?: string }) => f.produtor_id === values.produtorId);
          if (comProdutor.length > 0) {
            fzs = comProdutor.map((f: { id: string; nome: string }) => ({ id: f.id, nome: f.nome }));
          }
        }

        fzs.sort((a, b) => a.nome.localeCompare(b.nome));
        setFazendas(fzs);
      })
      .catch(() => setFazendas([]));
  }, [values.produtorId, contaId, fazendaIdFallback]);

  // 4. Anos Safra e Talhões quando Fazenda muda
  useEffect(() => {
    if (!values.fazendaId) { setAnosSafra([]); setCiclos([]); setTalhoes([]); return; }
    supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", values.fazendaId).order("descricao", { ascending: false })
      .then(({ data }) => setAnosSafra((data ?? []).map(r => ({ id: r.id, nome: r.descricao }))));
    supabase.from("talhoes").select("id, nome").eq("fazenda_id", values.fazendaId).order("nome")
      .then(({ data }) => setTalhoes(data ?? []));
  }, [values.fazendaId]);

  // 5. Ciclos quando Fazenda ou Ano Safra muda
  useEffect(() => {
    if (!values.fazendaId) { setCiclos([]); return; }
    let q = supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id").eq("fazenda_id", values.fazendaId);
    if (values.anoSafraId) q = q.eq("ano_safra_id", values.anoSafraId);
    q.order("descricao").then(({ data }) => setCiclos((data ?? []).map(r => ({ id: r.id, nome: r.descricao ?? "", ano_safra_id: r.ano_safra_id, cultura: r.cultura }))));
  }, [values.fazendaId, values.anoSafraId]);

  function sel(field: keyof CascadeValues, id: string) {
    const reset: Partial<CascadeValues> = {};
    // Ao trocar o produtor, não zera a fazenda — ela continua válida para o lançamento.
    // Ciclo e safra são zerados porque dependem da combinação fazenda+produtor.
    if (field === "produtorId") { reset.ieId = ""; reset.anoSafraId = ""; reset.cicloId = ""; reset.talhaoId = ""; }
    if (field === "ieId") {
      // Auto-preenche fazendaId a partir da IE selecionada
      const ie = ies.find(i => i.id === id);
      reset.fazendaId = ie?.fazenda_id ?? "";
      reset.anoSafraId = ""; reset.cicloId = ""; reset.talhaoId = "";
    }
    if (field === "fazendaId")  { reset.anoSafraId = ""; reset.cicloId = ""; reset.talhaoId = ""; }
    if (field === "anoSafraId") { reset.cicloId = ""; }
    onChange({ ...values, [field]: id, ...reset });
  }

  const ciclosFiltrados = values.anoSafraId
    ? ciclos.filter(c => c.ano_safra_id === values.anoSafraId)
    : ciclos;

  // ── Colunas da linha 1 (Produtor · IE · Fazenda) ──────────────────────────
  const row1Cols = [
    show.includes("produtor"),
    show.includes("ie") && show.includes("produtor"),  // IE só aparece se Produtor também está
    show.includes("fazenda"),
  ].filter(Boolean).length;

  const row1Grid = `repeat(${row1Cols}, 1fr)`;

  return (
    <div style={{ background: "#F2F2F2", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#111111", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        Este lançamento pertence a
      </div>

      {/* Linha 1: Produtor | IE | Fazenda */}
      {(show.includes("produtor") || show.includes("fazenda")) && (
        <div style={{ display: "grid", gridTemplateColumns: row1Grid, gap: 12, marginBottom: (show.includes("anoSafra") || show.includes("ciclo") || show.includes("talhao")) ? 10 : 0 }}>

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

          {/* IE — só exibe quando o level "ie" está ativo e o Produtor foi selecionado */}
          {show.includes("ie") && show.includes("produtor") && (
            <div>
              <label style={lbl}>IE <span style={{ color: "#E24B4A" }}>*</span></label>
              <select style={inp} value={values.ieId ?? ""}
                onChange={e => sel("ieId", e.target.value)}
                disabled={!values.produtorId}>
                <option value="">— Selecionar —</option>
                {ies.map(ie => (
                  <option key={ie.id} value={ie.id}>
                    {ie.inscricao_estadual} — {ie.estado}
                  </option>
                ))}
              </select>
            </div>
          )}

          {show.includes("fazenda") && (
            <div>
              <label style={lbl}>Fazenda {fazendaRequired && <span style={{ color: "#E24B4A" }}>*</span>}</label>
              <select style={inp} value={values.fazendaId ?? ""}
                onChange={e => sel("fazendaId", e.target.value)}
                disabled={useIE && show.includes("produtor") && !values.ieId}>
                <option value="">— Selecionar —</option>
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
