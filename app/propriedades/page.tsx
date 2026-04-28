"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import TopNav from "../../components/TopNav";
import { listarFazendas, listarTalhoes } from "../../lib/db";
import type { Fazenda as FazendaDB, Talhao as TalhaoDB } from "../../lib/supabase";

interface TalhaoVM extends TalhaoDB { safraAtiva?: string | null }
interface FazendaVM extends FazendaDB { talhoes: TalhaoVM[] }

const corSafra = (s: string | null | undefined) => {
  if (!s) return { bg: "#F1EFE8", color: "#555" };
  if (s.startsWith("Soja"))    return { bg: "#D5E8F5", color: "#0B2D50" };
  if (s.startsWith("Milho"))   return { bg: "#FAEEDA", color: "#633806" };
  if (s.startsWith("Algodão")) return { bg: "#E6F1FB", color: "#0C447C" };
  return { bg: "#F1EFE8", color: "#555" };
};

export default function Propriedades() {
  const [fazendas, setFazendas]     = useState<FazendaVM[]>([]);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState<string | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro(null);
      const lista = await listarFazendas();
      const comTalhoes: FazendaVM[] = await Promise.all(
        lista.map(async f => ({ ...f, talhoes: await listarTalhoes(f.id) }))
      );
      setFazendas(comTalhoes);
      if (comTalhoes.length > 0) setExpandidas(new Set([comTalhoes[0].id]));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally { setLoading(false); }
  }

  const toggle = (id: string) =>
    setExpandidas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const totalArea    = fazendas.reduce((s, f) => s + (f.area_total_ha ?? 0), 0);
  const totalTalhoes = fazendas.reduce((s, f) => s + f.talhoes.length, 0);
  const comGps       = fazendas.reduce((s, f) => s + f.talhoes.filter(t => t.lat && t.lng).length, 0);
  const areaTalhoes  = fazendas.reduce((s, f) => s + f.talhoes.reduce((st, t) => st + (t.area_ha ?? 0), 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Propriedades e Talhões</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Visão geral das fazendas e talhões cadastrados</p>
          </div>
          <Link href="/cadastros?tab=fazendas"
            style={{ background: "#1A5C38", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            + Nova Fazenda
          </Link>
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {erro && (
            <div style={{ background: "#FDECEA", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#8B1A1A", display: "flex", gap: 8 }}>
              ✕ {erro}
              <button onClick={carregar} style={{ marginLeft: "auto", fontSize: 11, color: "#8B1A1A", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tentar novamente</button>
            </div>
          )}

          {loading && <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando…</div>}

          {!loading && !erro && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Fazendas",         valor: String(fazendas.length),           cor: "#1A4870" },
                  { label: "Área total (ha)",   valor: totalArea.toLocaleString("pt-BR"), cor: "#1A4870" },
                  { label: "Talhões",           valor: String(totalTalhoes),              cor: "#C9921B" },
                  { label: "Georreferenciados", valor: `${comGps}/${totalTalhoes}`,       cor: comGps === totalTalhoes && totalTalhoes > 0 ? "#1A4870" : "#EF9F27" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: s.cor }}>{s.valor}</div>
                  </div>
                ))}
              </div>

              {areaTalhoes < totalArea && totalArea > 0 && (
                <div style={{ background: "#FAEEDA", border: "0.5px solid #EF9F2760", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#633806" }}>
                  ⚠ {(totalArea - areaTalhoes).toLocaleString("pt-BR")} ha sem talhão vinculado.{" "}
                  <Link href="/cadastros?tab=fazendas" style={{ color: "#633806", fontWeight: 600 }}>Cadastrar talhões →</Link>
                </div>
              )}

              {fazendas.length === 0 && (
                <div style={{ textAlign: "center", padding: 48, color: "#444" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⬡</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "#666" }}>Nenhuma fazenda cadastrada</div>
                  <Link href="/cadastros?tab=fazendas" style={{ fontSize: 12, color: "#1A4870", fontWeight: 600 }}>Ir para Cadastros → Fazendas</Link>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {fazendas.map(fazenda => {
                  const exp         = expandidas.has(fazenda.id);
                  const areaMapeada = fazenda.talhoes.reduce((s, t) => s + (t.area_ha ?? 0), 0);
                  const pct         = fazenda.area_total_ha > 0 ? Math.min(100, Math.round(areaMapeada / fazenda.area_total_ha * 100)) : 0;

                  return (
                    <div key={fazenda.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggle(fazenda.id)}>
                        <div style={{ width: 40, height: 40, background: "#D5E8F5", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⬡</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 2 }}>{fazenda.nome}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{fazenda.municipio} · {fazenda.estado} · {(fazenda.area_total_ha ?? 0).toLocaleString("pt-BR")} ha</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {fazenda.car  && <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 7px", borderRadius: 8 }}>CAR ✓</span>}
                          {fazenda.itr  && <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 7px", borderRadius: 8 }}>ITR ✓</span>}
                          {fazenda.nirf && <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 7px", borderRadius: 8 }}>NIRF ✓</span>}
                        </div>
                        <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#1A4870" }}>{fazenda.talhoes.length}</div>
                            <div style={{ fontSize: 10, color: "#444" }}>talhões</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: pct === 100 ? "#1A4870" : "#EF9F27" }}>{pct}%</div>
                            <div style={{ fontSize: 10, color: "#444" }}>mapeado</div>
                          </div>
                        </div>
                        <Link href={`/cadastros?tab=fazendas`} onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, padding: "4px 12px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#666", textDecoration: "none" }}>
                          Editar
                        </Link>
                        <span style={{ color: "#444", fontSize: 11, flexShrink: 0, display: "inline-block", transform: exp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                      </div>

                      {exp && (
                        <div style={{ borderTop: "0.5px solid #DEE5EE" }}>
                          <div style={{ padding: "8px 16px", background: "#F3F6F9", display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 11, color: "#666", borderBottom: "0.5px solid #DEE5EE" }}>
                            <span>CNPJ: <strong style={{ color: "#1a1a1a" }}>{fazenda.cnpj || "—"}</strong></span>
                            <span>CAR: <strong style={{ color: "#1a1a1a" }}>{fazenda.car ? fazenda.car.substring(0, 20) + "…" : "—"}</strong></span>
                            <span>ITR: <strong style={{ color: "#1a1a1a" }}>{fazenda.itr || "—"}</strong></span>
                            <span>NIRF: <strong style={{ color: "#1a1a1a" }}>{fazenda.nirf || "—"}</strong></span>
                          </div>

                          {fazenda.talhoes.length > 0 ? (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#F3F6F9" }}>
                                  {["Talhão", "Área (ha)", "Solo", "Safra Ativa", "GPS"].map((h, i) => (
                                    <th key={i} style={{ padding: "8px 16px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {fazenda.talhoes.map((t, ti) => {
                                  const cs = corSafra(t.safraAtiva);
                                  return (
                                    <tr key={t.id} style={{ borderBottom: ti < fazenda.talhoes.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                      <td style={{ padding: "10px 16px", color: "#1a1a1a", fontWeight: 600 }}>{t.nome}</td>
                                      <td style={{ padding: "10px 16px", textAlign: "center" }}>{(t.area_ha ?? 0).toLocaleString("pt-BR")}</td>
                                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                                        <span style={{ fontSize: 11, background: "#F1EFE8", color: "#555", padding: "2px 8px", borderRadius: 6 }}>{t.tipo_solo || "—"}</span>
                                      </td>
                                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                                        <span style={{ fontSize: 11, background: cs.bg, color: cs.color, padding: "2px 8px", borderRadius: 6 }}>{t.safraAtiva || "Pousio"}</span>
                                      </td>
                                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                                        {t.lat && t.lng
                                          ? <span style={{ color: "#1A4870", fontSize: 11 }}>● {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}</span>
                                          : <span style={{ color: "#EF9F27", fontSize: 11 }}>○ Sem GPS</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ padding: "20px 16px", textAlign: "center", color: "#444", fontSize: 12 }}>
                              Nenhum talhão.{" "}
                              <Link href="/cadastros?tab=fazendas" style={{ color: "#C9921B", fontWeight: 600 }}>Cadastrar em Fazendas →</Link>
                            </div>
                          )}

                          <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 11, color: "#444" }}>
                              {areaMapeada.toLocaleString("pt-BR")} ha mapeados de {(fazenda.area_total_ha ?? 0).toLocaleString("pt-BR")} ha totais
                            </div>
                            <Link href="/cadastros?tab=fazendas"
                              style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "0.5px solid #C9921B", color: "#C9921B", background: "#FBF0D8", textDecoration: "none", fontWeight: 600 }}>
                              + Novo Talhão
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>Arato · menos cliques, mais campo</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
