"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { FASES, porcentagemConcluida, totalLicoes, type Licao, type Modulo, type Fase } from "@/lib/learning-content";
import { listarProgressoLearning, marcarLicaoConcluida, desmarcarLicao } from "@/lib/db";

export default function LearningPage() {
  const { fazendaId } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [faseAberta, setFaseAberta] = useState<string>("fase-0");
  const [licaoAtiva, setLicaoAtiva] = useState<{ licao: Licao; modulo: Modulo; fase: Fase } | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  const carregarProgresso = useCallback(async () => {
    if (!fazendaId || !userId) return;
    try {
      const prog = await listarProgressoLearning(fazendaId, userId);
      const ids = new Set(prog.filter(p => p.completed).map(p => p.lesson_id));
      setCompletedIds(ids);
    } catch (_) { /* ignora */ }
    finally { setLoading(false); }
  }, [fazendaId, userId]);

  useEffect(() => { carregarProgresso(); }, [carregarProgresso]);

  // Abrir primeira lição da fase aberta automaticamente
  useEffect(() => {
    const fase = FASES.find(f => f.id === faseAberta);
    if (fase && fase.modulos.length > 0 && fase.modulos[0].licoes.length > 0 && !licaoAtiva) {
      const l = fase.modulos[0].licoes[0];
      setLicaoAtiva({ licao: l, modulo: fase.modulos[0], fase });
    }
  }, [faseAberta, licaoAtiva]);

  async function toggleConcluida(lesson_id: string) {
    if (!fazendaId || !userId) return;
    setSalvando(true);
    try {
      if (completedIds.has(lesson_id)) {
        await desmarcarLicao(fazendaId, userId, lesson_id);
        setCompletedIds(prev => { const n = new Set(prev); n.delete(lesson_id); return n; });
      } else {
        await marcarLicaoConcluida(fazendaId, userId, lesson_id);
        setCompletedIds(prev => new Set([...prev, lesson_id]));
      }
    } catch (_) { /* ignora */ }
    finally { setSalvando(false); }
  }

  const pct = porcentagemConcluida(completedIds);
  const total = totalLicoes();

  const iconeTipo = (tipo: Licao["tipo"]) => {
    if (tipo === "video") return "▶";
    if (tipo === "pratica") return "⚡";
    if (tipo === "quiz") return "❓";
    return "📖";
  };

  const corTipo = (tipo: Licao["tipo"]) => {
    if (tipo === "video") return "#E24B4A";
    if (tipo === "pratica") return "#C9921B";
    if (tipo === "quiz") return "#378ADD";
    return "#555";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header com progresso */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 20, border: "0.5px solid #DDE2EE" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1A4870", margin: 0 }}>Arato Academy</h1>
              <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
                Aprenda a operar o Arato no seu ritmo — do básico ao avançado
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: pct === 100 ? "#16A34A" : "#1A4870" }}>{pct}%</div>
              <div style={{ fontSize: 12, color: "#888" }}>{completedIds.size} de {total} lições concluídas</div>
            </div>
          </div>
          {/* Barra de progresso */}
          <div style={{ marginTop: 16, background: "#f0f0f0", borderRadius: 99, height: 8, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              background: pct === 100 ? "#16A34A" : "linear-gradient(90deg, #1A4870, #378ADD)",
              borderRadius: 99,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

          {/* Sidebar — índice de fases e módulos */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "#1A4870", color: "#fff" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Conteúdo do Curso</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{FASES.length} fases • {total} lições</div>
            </div>

            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>Carregando...</div>
            ) : (
              FASES.map(fase => {
                const licoesDaFase = fase.modulos.flatMap(m => m.licoes);
                const concluidasFase = licoesDaFase.filter(l => completedIds.has(l.id)).length;
                const aberta = faseAberta === fase.id;

                return (
                  <div key={fase.id} style={{ borderBottom: "0.5px solid #DDE2EE" }}>
                    {/* Cabeçalho da fase */}
                    <button
                      onClick={() => { setFaseAberta(aberta ? "" : fase.id); setLicaoAtiva(null); }}
                      style={{
                        width: "100%", textAlign: "left", background: aberta ? "#D5E8F5" : "transparent",
                        border: "none", padding: "10px 16px", cursor: "pointer", display: "flex",
                        alignItems: "center", gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, color: aberta ? "#1A4870" : "#999", transition: "transform 0.2s", display: "inline-block", transform: aberta ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870" }}>
                          Fase {fase.numero} — {fase.titulo}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                          {concluidasFase}/{licoesDaFase.length} lições
                        </div>
                      </div>
                      {concluidasFase === licoesDaFase.length && licoesDaFase.length > 0 && (
                        <span style={{ fontSize: 14, color: "#16A34A" }}>✓</span>
                      )}
                    </button>

                    {/* Módulos e lições */}
                    {aberta && fase.modulos.map(mod => (
                      <div key={mod.id} style={{ background: "#fafbfc" }}>
                        <div style={{ padding: "6px 16px 4px 28px", fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {mod.icone} {mod.titulo}
                        </div>
                        {mod.licoes.map(lic => {
                          const concluida = completedIds.has(lic.id);
                          const ativa = licaoAtiva?.licao.id === lic.id;
                          return (
                            <button
                              key={lic.id}
                              onClick={() => setLicaoAtiva({ licao: lic, modulo: mod, fase })}
                              style={{
                                width: "100%", textAlign: "left", border: "none",
                                background: ativa ? "#D5E8F5" : "transparent",
                                borderLeft: ativa ? "3px solid #1A4870" : "3px solid transparent",
                                padding: "8px 12px 8px 28px", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 8,
                              }}
                            >
                              <span style={{ fontSize: 12, color: concluida ? "#16A34A" : "#ccc", flexShrink: 0 }}>
                                {concluida ? "✓" : "○"}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 12, color: ativa ? "#1A4870" : "#333",
                                  fontWeight: ativa ? 600 : 400,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {lic.titulo}
                                </div>
                                <div style={{ fontSize: 11, color: "#aaa", display: "flex", gap: 6, marginTop: 1 }}>
                                  <span style={{ color: corTipo(lic.tipo) }}>{iconeTipo(lic.tipo)}</span>
                                  <span>{lic.duracao}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Área de conteúdo */}
          <div>
            {licaoAtiva ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                {/* Cabeçalho da lição */}
                <div style={{ padding: "20px 24px", borderBottom: "0.5px solid #DDE2EE" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
                      background: "#D5E8F5", color: "#1A4870", padding: "2px 8px", borderRadius: 99,
                    }}>
                      {licaoAtiva.fase.titulo}
                    </span>
                    <span style={{ color: "#ccc" }}>›</span>
                    <span style={{ fontSize: 11, color: "#888" }}>{licaoAtiva.modulo.titulo}</span>
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                    {licaoAtiva.licao.titulo}
                  </h2>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: corTipo(licaoAtiva.licao.tipo) }}>
                      {iconeTipo(licaoAtiva.licao.tipo)} {licaoAtiva.licao.tipo.charAt(0).toUpperCase() + licaoAtiva.licao.tipo.slice(1)}
                    </span>
                    <span style={{ fontSize: 12, color: "#888" }}>⏱ {licaoAtiva.licao.duracao}</span>
                    {completedIds.has(licaoAtiva.licao.id) && (
                      <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>✓ Concluída</span>
                    )}
                  </div>
                </div>

                {/* Conteúdo */}
                <div style={{ padding: "24px", lineHeight: 1.7 }}>
                  <div
                    className="learning-content"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(licaoAtiva.licao.conteudo) }}
                    style={{ color: "#333", fontSize: 14 }}
                  />
                </div>

                {/* Dica */}
                {licaoAtiva.licao.dica && (
                  <div style={{ margin: "0 24px 24px", background: "#FBF3E0", border: "0.5px solid #FDE9BB", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#C9921B", marginBottom: 2 }}>DICA</div>
                      <div style={{ fontSize: 13, color: "#6B4A00" }}>{licaoAtiva.licao.dica}</div>
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div style={{ padding: "16px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {/* Navegação */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <LicaoNavButton
                      licaoAtiva={licaoAtiva}
                      direcao="anterior"
                      onSelect={setLicaoAtiva}
                      onFaseAberta={setFaseAberta}
                    />
                    <LicaoNavButton
                      licaoAtiva={licaoAtiva}
                      direcao="proxima"
                      onSelect={setLicaoAtiva}
                      onFaseAberta={setFaseAberta}
                    />
                  </div>

                  {/* Marcar como concluída */}
                  <button
                    onClick={() => toggleConcluida(licaoAtiva.licao.id)}
                    disabled={salvando}
                    style={{
                      background: completedIds.has(licaoAtiva.licao.id) ? "#f0fdf4" : "#1A4870",
                      color: completedIds.has(licaoAtiva.licao.id) ? "#16A34A" : "#fff",
                      border: completedIds.has(licaoAtiva.licao.id) ? "0.5px solid #16A34A" : "none",
                      borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600,
                      cursor: salvando ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {completedIds.has(licaoAtiva.licao.id) ? "✓ Concluída" : "Marcar como concluída"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#1A4870", marginBottom: 8 }}>Bem-vindo ao Arato Academy</div>
                <div style={{ fontSize: 14, color: "#666", maxWidth: 400, margin: "0 auto" }}>
                  Selecione uma lição no menu à esquerda para começar. Recomendamos iniciar pela Fase 0.
                </div>
              </div>
            )}

            {/* Cards de fases */}
            {!licaoAtiva && (
              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {FASES.map(fase => {
                  const licoesDaFase = fase.modulos.flatMap(m => m.licoes);
                  const concluidasFase = licoesDaFase.filter(l => completedIds.has(l.id)).length;
                  const pctFase = licoesDaFase.length ? Math.round((concluidasFase / licoesDaFase.length) * 100) : 0;
                  return (
                    <button
                      key={fase.id}
                      onClick={() => { setFaseAberta(fase.id); }}
                      style={{
                        background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10,
                        padding: "16px", textAlign: "left", cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Fase {fase.numero}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{fase.titulo}</div>
                      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>{fase.subtitulo}</div>
                      <div style={{ background: "#f0f0f0", borderRadius: 99, height: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctFase}%`, background: pctFase === 100 ? "#16A34A" : "#1A4870", borderRadius: 99 }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{concluidasFase}/{licoesDaFase.length} lições</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .learning-content h2 { font-size: 18px; font-weight: 700; color: #1A4870; margin: 24px 0 12px; border-bottom: 0.5px solid #DDE2EE; padding-bottom: 8px; }
        .learning-content h3 { font-size: 15px; font-weight: 600; color: #333; margin: 20px 0 8px; }
        .learning-content p { margin: 0 0 12px; }
        .learning-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        .learning-content th { background: #1A4870; color: #fff; padding: 8px 12px; text-align: left; font-weight: 600; }
        .learning-content td { padding: 7px 12px; border-bottom: 0.5px solid #DDE2EE; }
        .learning-content tr:nth-child(even) td { background: #F4F6FA; }
        .learning-content code { background: #F4F6FA; border: 0.5px solid #DDE2EE; border-radius: 4px; padding: 1px 5px; font-size: 12px; font-family: monospace; }
        .learning-content pre { background: #1a1a2e; color: #e2e8f0; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; overflow-x: auto; line-height: 1.6; }
        .learning-content ul, .learning-content ol { margin: 8px 0 12px 20px; }
        .learning-content li { margin: 4px 0; }
        .learning-content blockquote { border-left: 3px solid #C9921B; background: #FBF3E0; margin: 12px 0; padding: 10px 16px; border-radius: 0 8px 8px 0; }
        .learning-content strong { font-weight: 600; color: #1A4870; }
      `}</style>
    </div>
  );
}

// ── Componente de navegação entre lições ─────────────────────
function LicaoNavButton({
  licaoAtiva, direcao, onSelect, onFaseAberta,
}: {
  licaoAtiva: { licao: Licao; modulo: Modulo; fase: Fase };
  direcao: "anterior" | "proxima";
  onSelect: (l: { licao: Licao; modulo: Modulo; fase: Fase }) => void;
  onFaseAberta: (id: string) => void;
}) {
  const todasLicoes: { licao: Licao; modulo: Modulo; fase: Fase }[] = [];
  for (const fase of FASES) {
    for (const modulo of fase.modulos) {
      for (const licao of modulo.licoes) {
        todasLicoes.push({ licao, modulo, fase });
      }
    }
  }
  const idx = todasLicoes.findIndex(l => l.licao.id === licaoAtiva.licao.id);
  const alvo = direcao === "anterior" ? todasLicoes[idx - 1] : todasLicoes[idx + 1];
  if (!alvo) return null;

  return (
    <button
      onClick={() => { onFaseAberta(alvo.fase.id); onSelect(alvo); }}
      style={{
        background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8,
        padding: "7px 14px", fontSize: 12, color: "#555", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {direcao === "anterior" ? "← Anterior" : "Próxima →"}
    </button>
  );
}

// ── Markdown simplificado para HTML ─────────────────────────
function markdownToHtml(md: string): string {
  return md
    .replace(/^\s*/, "")
    // code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    // bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // blockquote
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // tables
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (_m, header, rows) => {
      const ths = header.split("|").filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join("");
      const trs = rows.trim().split("\n").map((row: string) => {
        const tds = row.split("|").filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })
    // unordered list
    .replace(/((?:^- .+\n?)+)/gm, (block) => {
      const items = block.trim().split("\n").map((l: string) => `<li>${l.replace(/^- /, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    })
    // paragraphs (double newline → p)
    .replace(/\n\n([^<\n].+)/g, "<p>$1</p>")
    .replace(/\n/g, " ");
}
