"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../../components/TopNav";
import { useAuth } from "../../../../components/AuthProvider";
import { supabase } from "../../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };

interface OpTesoura {
  id: string; fazenda_id: string; nome: string;
  tipo: "entrada" | "saida" | "ambos" | "transferencia" | "ajuste";
  categoria?: string; observacao?: string; ativo: boolean;
}

const TIPOS_OP_PADRAO = [
  { id: "__mutuo__",         nome: "Mútuo entre Empresas",      tipo: "ambos",         desc: "Empréstimos entre empresas do grupo" },
  { id: "__seguro__",        nome: "Seguros",                    tipo: "saida",         desc: "Prêmios e parcelas de apólices de seguro" },
  { id: "__consorcio__",     nome: "Consórcio",                  tipo: "saida",         desc: "Parcelas mensais de consórcio" },
  { id: "__ajuste__",        nome: "Ajuste de Saldo",           tipo: "ajuste",        desc: "Correção de divergência entre saldo real e sistema" },
  { id: "__transferencia__", nome: "Transferência entre Contas", tipo: "transferencia", desc: "Movimentação entre contas bancárias próprias" },
  { id: "__taxa__",          nome: "Taxa Bancária",              tipo: "saida",         desc: "TED, DOC, boletos, tarifas de manutenção, IOF" },
  { id: "__aplicacao__",     nome: "Aplicação Financeira",       tipo: "saida",         desc: "Investimento em CDB, LCA, tesouro direto, etc." },
  { id: "__resgate__",       nome: "Resgate de Aplicação",       tipo: "entrada",       desc: "Resgate de investimentos financeiros" },
  { id: "__outros__",        nome: "Outros",                     tipo: "ambos",         desc: "Operações financeiras diversas não classificadas" },
] as const;

const TIPO_META: Record<string, { label: string; bg: string; cl: string }> = {
  entrada:       { label: "Entrada",        bg: "#DCFCE7", cl: "#166534" },
  saida:         { label: "Saída",          bg: "#FCEBEB", cl: "#791F1F" },
  ambos:         { label: "Entrada/Saída",  bg: "#D5E8F5", cl: "#0B2D50" },
  transferencia: { label: "Transferência",  bg: "#EEE6F8", cl: "#4A1A7A" },
  ajuste:        { label: "Ajuste",         bg: "#FBF3E0", cl: "#7A4300" },
};

export default function OperacoesTesourariaPage() {
  const { fazendaId } = useAuth();

  const [ops, setOps]         = useState<OpTesoura[]>([]);
  const [modalOp, setModalOp] = useState(false);
  const [opEdit, setOpEdit]   = useState<OpTesoura | null>(null);
  const [form, setForm]       = useState({ nome: "", tipo: "saida" as OpTesoura["tipo"], categoria: "", observacao: "" });
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const { data } = await supabase.from("operacoes_tesouraria").select("*").eq("fazenda_id", fazendaId).order("nome");
    setOps(data ?? []);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNova() {
    setOpEdit(null);
    setForm({ nome: "", tipo: "saida", categoria: "", observacao: "" });
    setErr("");
    setModalOp(true);
  }

  function abrirEditar(op: OpTesoura) {
    setOpEdit(op);
    setForm({ nome: op.nome, tipo: op.tipo, categoria: op.categoria ?? "", observacao: op.observacao ?? "" });
    setErr("");
    setModalOp(true);
  }

  async function salvar() {
    if (!fazendaId || !form.nome.trim()) { setErr("Informe o nome da operação."); return; }
    setSaving(true); setErr("");
    try {
      const payload = { fazenda_id: fazendaId, nome: form.nome.trim(), tipo: form.tipo, categoria: form.categoria || null, observacao: form.observacao || null, ativo: true };
      if (opEdit) { await supabase.from("operacoes_tesouraria").update(payload).eq("id", opEdit.id); }
      else { await supabase.from("operacoes_tesouraria").insert(payload); }
      await carregar();
      setModalOp(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta operação?")) return;
    await supabase.from("operacoes_tesouraria").delete().eq("id", id);
    await carregar();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Operações de Tesouraria</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Gerencie os tipos de operações disponíveis ao registrar lançamentos de tesouraria.
          </p>
        </div>

        {/* Operações padrão do sistema */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "12px 18px", background: "#F3F6F9", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Operações padrão do sistema</span>
            <span style={{ fontSize: 11, color: "#888" }}>Não editáveis</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {["Operação", "Tipo", "Descrição"].map(h => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIPOS_OP_PADRAO.map((op, i) => {
                const tm = TIPO_META[op.tipo] ?? TIPO_META.ambos;
                return (
                  <tr key={op.id} style={{ borderBottom: i < TIPOS_OP_PADRAO.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{op.nome}</td>
                    <td style={{ padding: "9px 16px" }}>
                      <span style={{ fontSize: 10, background: tm.bg, color: tm.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{tm.label}</span>
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#555" }}>{op.desc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Operações personalizadas */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", background: "#F3F6F9", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Operações personalizadas da fazenda</span>
            <button onClick={abrirNova} style={btnV}>+ Nova Operação</button>
          </div>

          {ops.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhuma operação personalizada cadastrada ainda.<br />
              <span style={{ fontSize: 12, color: "#aaa" }}>Crie operações específicas da sua fazenda que não estão na lista padrão acima.</span>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  {["Operação", "Tipo", "Categoria", ""].map(h => (
                    <th key={h} style={{ padding: "8px 16px", textAlign: h === "" ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.map((op, i) => {
                  const tm = TIPO_META[op.tipo] ?? TIPO_META.ambos;
                  return (
                    <tr key={op.id} style={{ borderBottom: i < ops.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                      <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{op.nome}</td>
                      <td style={{ padding: "9px 16px" }}>
                        <span style={{ fontSize: 10, background: tm.bg, color: tm.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{tm.label}</span>
                      </td>
                      <td style={{ padding: "9px 16px", fontSize: 12, color: "#555" }}>{op.categoria ?? "—"}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(op)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>Editar</button>
                          <button onClick={() => excluir(op.id)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A40", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal */}
      {modalOp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 460, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{opEdit ? "Editar Operação" : "Nova Operação de Tesouraria"}</div>
              <button onClick={() => setModalOp(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{err}</div>}
              <div>
                <label style={lbl}>Nome da Operação *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inp} placeholder="Ex.: Resgate Tesouro Direto" />
              </div>
              <div>
                <label style={lbl}>Tipo *</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as OpTesoura["tipo"] }))} style={inp}>
                  <option value="entrada">Entrada (crédito)</option>
                  <option value="saida">Saída (débito)</option>
                  <option value="ambos">Ambos (entrada ou saída)</option>
                  <option value="transferencia">Transferência entre Contas</option>
                  <option value="ajuste">Ajuste de Saldo</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Categoria</label>
                <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inp} placeholder="Ex.: Investimentos" />
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalOp(false)}>Cancelar</button>
              <button onClick={salvar} disabled={saving} style={{ ...btnV, background: saving ? "#aaa" : "#1A4870", cursor: saving ? "default" : "pointer" }}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
