"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "@/components/AuthProvider";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Contrato {
  id: string; numero: string; comprador: string; produto: string;
  quantidade_sc: number; entregue_sc: number; status: string; safra?: string;
  ano_safra_id?: string;
}
interface Romaneio {
  id: string; contrato_id: string; numero: string; data: string;
  peso_bruto_kg: number; tara_kg: number; peso_liquido_kg?: number;
  sacas?: number; nfe_numero?: string; nfe_status?: string; nfe_chave?: string;
  obs_divergencia?: string;
}
interface MigracaoLog {
  id: string; romaneio_id: string; romaneio_numero: string; nfe_numero?: string;
  contrato_origem_id: string; contrato_origem_numero: string;
  contrato_destino_id: string; contrato_destino_numero: string;
  sacas: number; usuario: string; motivo?: string; created_at: string;
}

const fmtN   = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtData = (s: string) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";

export default function MigrarNF() {
  const { fazendaId } = useAuth();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [logs, setLogs] = useState<MigracaoLog[]>([]);
  const [loadLogs, setLoadLogs] = useState(true);

  // Wizard state
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [contratoOrigemId, setContratoOrigemId] = useState("");
  const [romaneioId, setRomaneioId] = useState("");
  const [contratoDestinoId, setContratoDestinoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [romaneiosOrigem, setRomaneiosOrigem] = useState<Romaneio[]>([]);
  const [loadRoms, setLoadRoms] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: cts }, { data: lg }] = await Promise.all([
      supabase.from("contratos").select("id,numero,comprador,produto,quantidade_sc,entregue_sc,status,safra,ano_safra_id")
        .eq("fazenda_id", fazendaId).order("numero", { ascending: false }),
      supabase.from("migracoes_nf").select("*").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (cts) setContratos(cts as Contrato[]);
    if (lg) setLogs(lg as MigracaoLog[]);
    setLoadLogs(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Ao selecionar contrato origem, carrega romaneios com NF emitida
  useEffect(() => {
    if (!contratoOrigemId) { setRomaneiosOrigem([]); return; }
    setLoadRoms(true);
    supabase.from("romaneios")
      .select("id,contrato_id,numero,data,peso_bruto_kg,tara_kg,peso_liquido_kg,sacas,nfe_numero,nfe_status,nfe_chave,obs_divergencia")
      .eq("contrato_id", contratoOrigemId)
      .in("nfe_status", ["autorizada", "cancelada"])
      .order("data")
      .then(({ data }) => {
        setRomaneiosOrigem((data ?? []) as Romaneio[]);
        setLoadRoms(false);
      });
  }, [contratoOrigemId]);

  const contratoOrigem  = contratos.find(c => c.id === contratoOrigemId);
  const contratoDestino = contratos.find(c => c.id === contratoDestinoId);
  const romaneioSel     = romaneiosOrigem.find(r => r.id === romaneioId);
  const sacas           = romaneioSel?.sacas ?? 0;

  // Contratos destino: mesmo comprador, mesmo produto, diferente do origem
  const contratosDestino = contratos.filter(c =>
    c.id !== contratoOrigemId &&
    c.comprador === contratoOrigem?.comprador &&
    c.produto === contratoOrigem?.produto &&
    c.status !== "cancelado"
  );

  async function executarMigracao() {
    if (!fazendaId || !romaneioSel || !contratoOrigem || !contratoDestino) return;
    setExecutando(true);
    try {
      // 1. Atualiza contrato_id do romaneio
      const { error: e1 } = await supabase.from("romaneios")
        .update({ contrato_id: contratoDestinoId })
        .eq("id", romaneioId);
      if (e1) throw e1;

      // 2. Atualiza entregue_sc nos dois contratos
      const novoEntOrigem  = Math.max(0, (contratoOrigem.entregue_sc  ?? 0) - sacas);
      const novoEntDestino =              (contratoDestino.entregue_sc ?? 0) + sacas;
      await Promise.all([
        supabase.from("contratos").update({ entregue_sc: novoEntOrigem  }).eq("id", contratoOrigemId),
        supabase.from("contratos").update({ entregue_sc: novoEntDestino }).eq("id", contratoDestinoId),
      ]);

      // 3. Atualiza CR vinculado (se houver) — busca lançamentos cujo romaneio_id = romaneioId
      await supabase.from("lancamentos")
        .update({ observacao: `[MIGRAÇÃO NF] Movido do contrato ${contratoOrigem.numero} para ${contratoDestino.numero}. ${motivo}`.trim() })
        .eq("fazenda_id", fazendaId)
        .or(`observacao.ilike.%romaneio ${romaneioSel.numero}%,descricao.ilike.%${romaneioSel.numero}%`);

      // 4. Grava log de auditoria
      await supabase.from("migracoes_nf").insert({
        fazenda_id: fazendaId,
        romaneio_id: romaneioId,
        romaneio_numero: romaneioSel.numero,
        nfe_numero: romaneioSel.nfe_numero ?? null,
        nfe_chave: romaneioSel.nfe_chave ?? null,
        contrato_origem_id: contratoOrigemId,
        contrato_origem_numero: contratoOrigem.numero,
        contrato_destino_id: contratoDestinoId,
        contrato_destino_numero: contratoDestino.numero,
        sacas,
        usuario: (await supabase.auth.getUser()).data.user?.email ?? "sistema",
        motivo: motivo || null,
      });

      setSucesso(true);
      await carregar();
    } catch {
      alert("Erro ao executar migração. Tente novamente.");
    } finally {
      setExecutando(false);
    }
  }

  function reiniciar() {
    setPasso(1); setContratoOrigemId(""); setRomaneioId("");
    setContratoDestinoId(""); setMotivo(""); setSucesso(false);
  }

  const inp: React.CSSProperties = { padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", width: "100%", boxSizing: "border-box" };
  const btn = (active: boolean): React.CSSProperties => ({
    padding: "10px 24px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: active ? "#1A4870" : "#EEE", color: active ? "#fff" : "#999",
  });

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg-page)", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Migração de NF entre Contratos</h1>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Transfere romaneios e NFs emitidas de um contrato para outro, recalculando os saldos</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
        {/* ── Wizard ── */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
          {/* Steps header */}
          <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", gap: 0 }}>
            {[
              { n: 1, label: "Contrato Origem" },
              { n: 2, label: "Selecionar NF" },
              { n: 3, label: "Contrato Destino" },
              { n: 4, label: "Confirmar" },
            ].map((s, i) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                  background: passo > s.n ? "#16A34A" : passo === s.n ? "#1A4870" : "#EEE",
                  color: passo >= s.n ? "#fff" : "var(--text-3)",
                }}>
                  {passo > s.n ? "✓" : s.n}
                </div>
                <span style={{ fontSize: 12, fontWeight: passo === s.n ? 700 : 400, color: passo === s.n ? "#1A4870" : "var(--text-3)", marginLeft: 8, whiteSpace: "nowrap" }}>
                  {s.label}
                </span>
                {i < 3 && <div style={{ flex: 1, height: 1, background: passo > s.n ? "#16A34A" : "var(--border)", margin: "0 10px" }} />}
              </div>
            ))}
          </div>

          {sucesso ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>Migração concluída com sucesso!</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>
                Romaneio {romaneioSel?.numero} — NF-e {romaneioSel?.nfe_numero ?? "s/n"} foi migrado de{" "}
                <strong>{contratoOrigem?.numero}</strong> para <strong>{contratoDestino?.numero}</strong>.
              </div>
              <button onClick={reiniciar} style={btn(true)}>Nova Migração</button>
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              {/* Passo 1: Contrato Origem */}
              {passo === 1 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-1)" }}>Qual contrato contém a NF a migrar?</div>
                  <select value={contratoOrigemId} onChange={e => setContratoOrigemId(e.target.value)} style={inp}>
                    <option value="">— selecione —</option>
                    {contratos.filter(c => c.status !== "cancelado").map(c => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.comprador} · {c.produto} · {fmtN(c.entregue_sc, 0)}/{fmtN(c.quantidade_sc, 0)} sc {c.safra ? `(${c.safra})` : ""}
                      </option>
                    ))}
                  </select>
                  {contratoOrigemId && (
                    <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg-page)", borderRadius: 10 }}>
                      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Contrato selecionado</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{contratoOrigem?.numero} — {contratoOrigem?.comprador}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                        {contratoOrigem?.produto} · Entregue: {fmtN(contratoOrigem?.entregue_sc ?? 0, 0)} sc / {fmtN(contratoOrigem?.quantidade_sc ?? 0, 0)} sc
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setPasso(2)} style={btn(!!contratoOrigemId)} disabled={!contratoOrigemId}>
                      Próximo →
                    </button>
                  </div>
                </div>
              )}

              {/* Passo 2: Selecionar NF/Romaneio */}
              {passo === 2 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-1)" }}>Selecione o romaneio / NF-e a migrar</div>
                  {loadRoms ? (
                    <div style={{ color: "var(--text-3)", textAlign: "center", padding: 20 }}>Carregando romaneios...</div>
                  ) : romaneiosOrigem.length === 0 ? (
                    <div style={{ padding: 20, background: "#FEE2E2", borderRadius: 10, color: "#7F1D1D", fontSize: 13 }}>
                      Nenhum romaneio com NF autorizada encontrado neste contrato.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {romaneiosOrigem.map(r => (
                        <label key={r.id} style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                          border: `0.5px solid ${romaneioId === r.id ? "#1A4870" : "var(--border)"}`,
                          background: romaneioId === r.id ? "#F0F5FA" : "var(--bg-card)",
                          borderRadius: 10, cursor: "pointer",
                        }}>
                          <input type="radio" name="rom" value={r.id} checked={romaneioId === r.id}
                            onChange={() => setRomaneioId(r.id)} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              Romaneio {r.numero}
                              {r.nfe_numero && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 8px", background: "#D5E8F5", color: "#1A4870", borderRadius: 8, fontWeight: 700 }}>NF-e {r.nfe_numero}</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                              {fmtData(r.data)} · {fmtN(r.sacas ?? 0, 3)} sc · PL: {fmtN((r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg)) / 1000, 3)} t
                            </div>
                          </div>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700,
                            background: r.nfe_status === "autorizada" ? "#DCFCE7" : "#FEE2E2",
                            color: r.nfe_status === "autorizada" ? "#16A34A" : "#E24B4A",
                          }}>
                            {r.nfe_status === "autorizada" ? "AUTORIZADA" : r.nfe_status?.toUpperCase()}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
                    <button onClick={() => setPasso(1)} style={{ ...btn(true), background: "#EEE", color: "var(--text-2)" }}>← Voltar</button>
                    <button onClick={() => setPasso(3)} style={btn(!!romaneioId)} disabled={!romaneioId}>Próximo →</button>
                  </div>
                </div>
              )}

              {/* Passo 3: Contrato Destino */}
              {passo === 3 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-1)" }}>Para qual contrato migrar?</div>
                  {contratosDestino.length === 0 ? (
                    <div style={{ padding: 16, background: "#FBF3E0", borderRadius: 10, color: "#7A4300", fontSize: 13 }}>
                      Nenhum outro contrato ativo com mesmo comprador e produto encontrado.
                      Certifique-se de que o contrato destino está cadastrado com o mesmo comprador e produto.
                    </div>
                  ) : (
                    <select value={contratoDestinoId} onChange={e => setContratoDestinoId(e.target.value)} style={inp}>
                      <option value="">— selecione o contrato destino —</option>
                      {contratosDestino.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.numero} · {c.comprador} · {fmtN(c.entregue_sc, 0)}/{fmtN(c.quantidade_sc, 0)} sc {c.safra ? `(${c.safra})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {contratoDestinoId && (
                    <div style={{ marginTop: 12, padding: "12px 16px", background: "#F0FFF4", borderRadius: 10, border: "0.5px solid #86EFAC" }}>
                      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Destino selecionado</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{contratoDestino?.numero} — {contratoDestino?.comprador}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                        Entregue: {fmtN(contratoDestino?.entregue_sc ?? 0, 0)} sc / {fmtN(contratoDestino?.quantidade_sc ?? 0, 0)} sc ·
                        Saldo: {fmtN((contratoDestino?.quantidade_sc ?? 0) - (contratoDestino?.entregue_sc ?? 0), 0)} sc
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-2)", fontWeight: 600, marginBottom: 4 }}>
                      Motivo da migração
                    </label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
                      placeholder="Ex: NF lançada no contrato errado. Comprador Bunge tem 2 contratos ativos safra 25/26."
                      rows={3}
                      style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
                    <button onClick={() => setPasso(2)} style={{ ...btn(true), background: "#EEE", color: "var(--text-2)" }}>← Voltar</button>
                    <button onClick={() => setPasso(4)} style={btn(!!contratoDestinoId)} disabled={!contratoDestinoId}>Revisar →</button>
                  </div>
                </div>
              )}

              {/* Passo 4: Confirmação */}
              {passo === 4 && romaneioSel && contratoOrigem && contratoDestino && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-1)" }}>Revisar e confirmar migração</div>

                  {/* Resumo da migração */}
                  <div style={{ padding: "14px 18px", background: "#F8FAFF", border: "0.5px solid #D5E8F5", borderRadius: 10, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 8 }}>ROMANEIO A MIGRAR</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                      <div><span style={{ color: "var(--text-3)" }}>Romaneio: </span><strong>{romaneioSel.numero}</strong></div>
                      <div><span style={{ color: "var(--text-3)" }}>NF-e: </span><strong>{romaneioSel.nfe_numero ?? "—"}</strong></div>
                      <div><span style={{ color: "var(--text-3)" }}>Data: </span><strong>{fmtData(romaneioSel.data)}</strong></div>
                      <div><span style={{ color: "var(--text-3)" }}>Sacas: </span><strong>{fmtN(sacas, 3)} sc</strong></div>
                    </div>
                  </div>

                  {/* Impacto nos contratos */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    {/* Origem */}
                    <div style={{ padding: 14, background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#E24B4A", marginBottom: 8 }}>CONTRATO ORIGEM (perderá)</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{contratoOrigem.numero}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{contratoOrigem.comprador}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "var(--text-3)" }}>Antes:</span>
                        <span style={{ fontWeight: 600 }}>{fmtN(contratoOrigem.entregue_sc, 3)} sc</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#E24B4A" }}>
                        <span>Depois:</span>
                        <span style={{ fontWeight: 700 }}>{fmtN(Math.max(0, contratoOrigem.entregue_sc - sacas), 3)} sc</span>
                      </div>
                    </div>
                    {/* Destino */}
                    <div style={{ padding: 14, background: "#F0FFF4", border: "0.5px solid #86EFAC", borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>CONTRATO DESTINO (receberá)</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{contratoDestino.numero}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{contratoDestino.comprador}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "var(--text-3)" }}>Antes:</span>
                        <span style={{ fontWeight: 600 }}>{fmtN(contratoDestino.entregue_sc, 3)} sc</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#16A34A" }}>
                        <span>Depois:</span>
                        <span style={{ fontWeight: 700 }}>{fmtN(contratoDestino.entregue_sc + sacas, 3)} sc</span>
                      </div>
                    </div>
                  </div>

                  {motivo && (
                    <div style={{ padding: "10px 14px", background: "#FFFDF7", border: "0.5px solid #FDE9BB", borderRadius: 8, fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>
                      <strong>Motivo registrado:</strong> {motivo}
                    </div>
                  )}

                  <div style={{ padding: "10px 14px", background: "#FBF3E0", border: "0.5px solid #EF9F27", borderRadius: 8, fontSize: 12, color: "#7A4300", marginBottom: 20 }}>
                    ⚠ Esta operação é irreversível. Os saldos dos contratos serão recalculados e a migração será registrada no log de auditoria.
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button onClick={() => setPasso(3)} style={{ ...btn(true), background: "#EEE", color: "var(--text-2)" }}>← Voltar</button>
                    <button onClick={executarMigracao} disabled={executando} style={{ ...btn(true), background: "#16A34A", opacity: executando ? 0.7 : 1 }}>
                      {executando ? "Migrando…" : "✓ Confirmar Migração"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Log de Auditoria ── */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Log de Auditoria</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{logs.length} migração{logs.length !== 1 ? "ões" : ""}</span>
          </div>
          {loadLogs ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>Carregando...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
              Nenhuma migração realizada ainda.
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {logs.map((l, i) => (
                <div key={l.id} style={{ padding: "12px 16px", borderBottom: "0.5px solid #F3F5F9", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>
                      Romaneio {l.romaneio_numero}
                      {l.nfe_numero && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", background: "#D5E8F5", color: "#1A4870", borderRadius: 6 }}>NF-e {l.nfe_numero}</span>}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtData(l.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                    <span style={{ color: "#E24B4A" }}>{l.contrato_origem_numero}</span>
                    {" → "}
                    <span style={{ color: "#16A34A" }}>{l.contrato_destino_numero}</span>
                    <span style={{ marginLeft: 8, color: "var(--text-3)" }}>{fmtN(l.sacas, 3)} sc</span>
                  </div>
                  {l.motivo && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>{l.motivo}</div>}
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>por {l.usuario}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
