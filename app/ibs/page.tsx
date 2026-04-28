"use client";
import { useState } from "react";
import TopNav from "../../components/TopNav";

// ─────────────────────────────────────────────────────────────
// Cronograma de transição — LC 214/2024
// ─────────────────────────────────────────────────────────────
const CRONOGRAMA = [
  { ano: 2026, cbs: 0.9,  ibs: 0.1,  desc: "Teste e adaptação — alíquotas simbólicas" },
  { ano: 2027, cbs: 7.6,  ibs: 0.1,  desc: "Início da cobrança real do CBS" },
  { ano: 2028, cbs: 7.6,  ibs: 0.1,  desc: "Manutenção" },
  { ano: 2029, cbs: 7.6,  ibs: 10.0, desc: "IBS começa a elevar" },
  { ano: 2030, cbs: 7.6,  ibs: 20.0, desc: "Aumento progressivo IBS" },
  { ano: 2031, cbs: 7.6,  ibs: 40.0, desc: "Aumento progressivo IBS" },
  { ano: 2032, cbs: 7.6,  ibs: 60.0, desc: "Aumento progressivo IBS" },
  { ano: 2033, cbs: 7.6,  ibs: 80.0, desc: "Aumento progressivo IBS" },
  { ano: 2034, cbs: 7.6,  ibs: 100.0,desc: "Extinção total ICMS/ISS/PIS/COFINS" },
];

// Produtos agrícolas com redução de alíquota
const REDUCOES_AGRO = [
  { ncm: "1201.10",   produto: "Soja em grão",              reducao: 60, obs: "Produto básico · redutor social" },
  { ncm: "1005.90",   produto: "Milho em grão",             reducao: 60, obs: "Produto básico · redutor social" },
  { ncm: "5201.00",   produto: "Algodão não cardado",       reducao: 60, obs: "Matéria-prima agro" },
  { ncm: "1001.99",   produto: "Trigo",                     reducao: 60, obs: "Produto básico" },
  { ncm: "3101.00",   produto: "Adubos orgânicos",          reducao: 100, obs: "Insumo agropecuário — alíquota zero" },
  { ncm: "3105.20",   produto: "Fertilizantes N-P-K",       reducao: 100, obs: "Insumo agropecuário — alíquota zero" },
  { ncm: "3808.91",   produto: "Defensivos agrícolas",      reducao: 100, obs: "Insumo agropecuário — alíquota zero" },
  { ncm: "1209.91",   produto: "Sementes para semeadura",   reducao: 100, obs: "Insumo agropecuário — alíquota zero" },
  { ncm: "8432.00",   produto: "Máquinas agrícolas",        reducao: 100, obs: "Bem de capital agropecuário — alíquota zero" },
];

const diasAte2027 = Math.max(0, Math.ceil((new Date("2027-01-01").getTime() - new Date().getTime()) / 86400000));

type Aba = "visao" | "calculo" | "impacto" | "cronograma";

export default function IBSCBS() {
  const [aba, setAba] = useState<Aba>("visao");

  // Configuração de alíquotas (simulação)
  const [aliqCBS,    setAliqCBS]    = useState(8.8);
  const [aliqIBSest, setAliqIBSest] = useState(4.95);
  const [aliqIBSmun, setAliqIBSmun] = useState(0.55);
  const [receitaAnual, setReceitaAnual] = useState(0);
  const [creditosInsumos, setCreditosInsumos] = useState(0);

  const aliqIBS   = aliqIBSest + aliqIBSmun;
  const aliqTotal = aliqCBS + aliqIBS;
  const tribBruto = receitaAnual * aliqTotal / 100;
  const creditos  = creditosInsumos * aliqTotal / 100;
  const tribLiq   = Math.max(0, tribBruto - creditos);
  const economia  = tribBruto - tribLiq;

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>IBS / CBS — Reforma Tributária 2027</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Lei Complementar nº 214/2024 · Emenda Constitucional nº 132/2023</p>
          </div>
          <div style={{ background: diasAte2027 <= 180 ? "#FCEBEB" : "#FBF3E0", border: `0.5px solid ${diasAte2027 <= 180 ? "#E24B4A" : "#C9921B"}40`, borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: diasAte2027 <= 180 ? "#E24B4A" : "#C9921B" }}>{diasAte2027.toLocaleString("pt-BR")}</div>
            <div style={{ fontSize: 10, color: "#555" }}>dias até 01/01/2027</div>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {/* Abas */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "0.5px solid #D4DCE8" }}>
              {([
                ["visao",      "Visão Geral"],
                ["calculo",    "Calculadora"],
                ["impacto",    "Agro — Reduções"],
                ["cronograma", "Cronograma"],
              ] as [Aba, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setAba(key)} style={{
                  padding: "10px 20px", border: "none",
                  background: aba === key ? "#fff" : "#F8FAFD",
                  borderBottom: aba === key ? "2px solid #1A5C38" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13,
                  fontWeight: aba === key ? 600 : 400,
                  color: aba === key ? "#1A5C38" : "#555",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── ABA: VISÃO GERAL ── */}
            {aba === "visao" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

                  {/* O que muda */}
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>O que muda com a Reforma</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { de: "PIS + COFINS (federal)", para: "CBS — Contribuição sobre Bens e Serviços", cor: "#1A4870" },
                        { de: "ICMS (estadual)",        para: "IBS — estadual",                          cor: "#1A5C38" },
                        { de: "ISS (municipal)",        para: "IBS — municipal",                         cor: "#1A5C38" },
                        { de: "IPI (federal)",          para: "IS — Imposto Seletivo (bens nocivos)",    cor: "#C9921B" },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F8FAFD", borderRadius: 8, padding: "10px 12px", border: "0.5px solid #DEE5EE" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: "#888", textDecoration: "line-through" }}>{r.de}</div>
                          </div>
                          <div style={{ fontSize: 14, color: "#bbb" }}>→</div>
                          <div style={{ flex: 1.5 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: r.cor }}>{r.para}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Princípios fundamentais</div>
                      {[
                        { icon: "◈", titulo: "Não-cumulatividade plena", desc: "Crédito total sobre todos os insumos, bens de capital e serviços adquiridos na atividade rural." },
                        { icon: "▦", titulo: "Princípio de destino",     desc: "O imposto fica no estado/município onde o produto é consumido, não onde é produzido." },
                        { icon: "⟳", titulo: "Split payment",            desc: "O imposto é retido automaticamente pelo sistema financeiro no momento do pagamento." },
                        { icon: "◉", titulo: "Alíquota de referência",   desc: "Alíquota única nacional com ajustes estaduais/municipais dentro de bandas definidas." },
                      ].map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                          <span style={{ fontSize: 16, color: "#1A5C38", flexShrink: 0 }}>{p.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: "#1a1a1a" }}>{p.titulo}</div>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{p.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Alíquotas */}
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Alíquotas de referência (2027)</div>
                    <div style={{ background: "#F8FAFD", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
                      {[
                        { label: "CBS — federal",         val: `${aliqCBS.toFixed(1)}%`,      cor: "#1A4870", sub: "Substitui PIS + COFINS" },
                        { label: "IBS — estadual (MT)",   val: `~${aliqIBSest.toFixed(2)}%`,  cor: "#1A5C38", sub: "Estimativa — a definir pelos estados" },
                        { label: "IBS — municipal",       val: `~${aliqIBSmun.toFixed(2)}%`,  cor: "#1A5C38", sub: "Estimativa — a definir pelos municípios" },
                        { label: "TOTAL estimado",        val: `~${aliqTotal.toFixed(2)}%`,   cor: "#1a1a1a", sub: "Sobre receita bruta, com crédito pleno", bold: true },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: r.bold ? 700 : 500, color: r.cor }}>{r.label}</div>
                            <div style={{ fontSize: 10, color: "#888" }}>{r.sub}</div>
                          </div>
                          <div style={{ fontSize: r.bold ? 18 : 15, fontWeight: r.bold ? 800 : 600, color: r.cor }}>{r.val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: "#EAF3DE", border: "0.5px solid #1A5C3840", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#1A5C38", marginBottom: 8, fontSize: 13 }}>✓ Vantagens para o agronegócio</div>
                      {[
                        "Insumos (fertilizantes, defensivos, sementes) com alíquota zero",
                        "Máquinas e equipamentos agrícolas com alíquota zero",
                        "Grãos (soja, milho, algodão, trigo) com redução de 60%",
                        "Crédito pleno sobre todos os insumos da cadeia",
                        "Devolução de créditos acumulados em 60 dias (prazo legal)",
                      ].map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#1A5C38", flexShrink: 0 }}>✓</span>
                          <span style={{ color: "#1a1a1a" }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA: CALCULADORA ── */}
            {aba === "calculo" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>Simulação IBS/CBS — sua propriedade</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 5 }}>Receita bruta anual estimada (R$)</label>
                        <input type="number" value={receitaAnual || ""} onChange={e => setReceitaAnual(Number(e.target.value))} placeholder="Ex: 5.000.000" style={{ width: "100%", padding: "10px 12px", border: "1px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 5 }}>Total de insumos e serviços comprados com nota (R$)</label>
                        <input type="number" value={creditosInsumos || ""} onChange={e => setCreditosInsumos(Number(e.target.value))} placeholder="Ex: 2.000.000" style={{ width: "100%", padding: "10px 12px", border: "1px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", boxSizing: "border-box" }} />
                      </div>

                      <div style={{ borderTop: "0.5px solid #DEE5EE", paddingTop: 14 }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>Ajuste as alíquotas estimadas</div>
                        {[
                          { label: "CBS (federal)", val: aliqCBS, set: setAliqCBS },
                          { label: "IBS estadual", val: aliqIBSest, set: setAliqIBSest },
                          { label: "IBS municipal", val: aliqIBSmun, set: setAliqIBSmun },
                        ].map((r, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <label style={{ fontSize: 12, color: "#555", width: 130, flexShrink: 0 }}>{r.label}</label>
                            <input type="number" step="0.01" value={r.val} onChange={e => r.set(Number(e.target.value))} style={{ width: 80, padding: "5px 8px", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 12, color: "#1a1a1a" }} />
                            <span style={{ fontSize: 11, color: "#888" }}>%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>Resultado da simulação</div>
                    {receitaAnual === 0 ? (
                      <div style={{ background: "#F3F6F9", borderRadius: 12, padding: 24, textAlign: "center", color: "#888", fontSize: 12 }}>
                        Informe a receita anual para simular
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[
                          { label: "Receita bruta",        val: receitaAnual,  cor: "#1a1a1a" },
                          { label: `IBS/CBS bruto (${aliqTotal.toFixed(2)}%)`, val: tribBruto, cor: "#E24B4A" },
                          { label: `(-) Créditos insumos`, val: -creditos,     cor: "#1A5C38" },
                          { label: "IBS/CBS líquido",      val: tribLiq,       cor: "#E24B4A", bold: true },
                          { label: "Economia com créditos",val: economia,      cor: "#1A5C38", bold: true },
                          { label: "Carga efetiva",        val: receitaAnual > 0 ? tribLiq / receitaAnual * 100 : 0, pct: true, cor: "#1a1a1a" },
                        ].map((l, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: l.bold ? "#F3F6F9" : "#fff", border: "0.5px solid #DEE5EE", borderRadius: 8 }}>
                            <span style={{ fontSize: 12, color: "#555" }}>{l.label}</span>
                            <span style={{ fontSize: l.bold ? 16 : 13, fontWeight: l.bold ? 700 : 500, color: l.cor }}>
                              {l.pct ? `${(l.val as number).toFixed(2)}%` : fmtBRL(Math.abs(l.val as number))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA: REDUÇÕES AGRO ── */}
            {aba === "impacto" && (
              <div style={{ padding: 24 }}>
                <div style={{ marginBottom: 14, fontSize: 12, color: "#555", background: "#EAF3DE", border: "0.5px solid #1A5C3840", borderRadius: 8, padding: "10px 14px" }}>
                  <strong style={{ color: "#1A5C38" }}>Agronegócio beneficiado:</strong> A Reforma Tributária manteve tratamento favorecido para insumos agropecuários (alíquota zero) e grãos (redução de 60%). Isso representa grande vantagem competitiva para o produtor rural.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F6F9" }}>
                      {["NCM", "Produto / Insumo", "Redução", "Alíquota efetiva", "Observação"].map((h, i) => (
                        <th key={i} style={{ padding: "8px 14px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {REDUCOES_AGRO.map((r, i) => {
                      const efetiva = aliqTotal * (1 - r.reducao / 100);
                      return (
                        <tr key={i} style={{ borderBottom: i < REDUCOES_AGRO.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "9px 14px", color: "#1a1a1a", fontFamily: "monospace", fontSize: 12 }}>{r.ncm}</td>
                          <td style={{ padding: "9px 14px", color: "#1a1a1a", fontWeight: 600 }}>{r.produto}</td>
                          <td style={{ padding: "9px 14px", textAlign: "center" }}>
                            <span style={{ background: r.reducao === 100 ? "#EAF3DE" : "#FBF3E0", color: r.reducao === 100 ? "#1A5C38" : "#7A5A12", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                              {r.reducao}%
                            </span>
                          </td>
                          <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 700, color: r.reducao === 100 ? "#1A5C38" : "#C9921B" }}>
                            {r.reducao === 100 ? "Zero" : `~${efetiva.toFixed(2)}%`}
                          </td>
                          <td style={{ padding: "9px 14px", color: "#555", fontSize: 11 }}>{r.obs}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── ABA: CRONOGRAMA ── */}
            {aba === "cronograma" && (
              <div style={{ padding: 24 }}>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>Calendário de transição — 2026 a 2034</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CRONOGRAMA.map((c, i) => {
                    const passado   = c.ano < new Date().getFullYear();
                    const corrente  = c.ano === new Date().getFullYear();
                    const pctTotal  = c.cbs + (c.ibs / 100) * (c.cbs + 13.45);
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 16,
                        padding: "12px 16px", borderRadius: 10,
                        background: corrente ? "#EAF3DE" : passado ? "#F8FAFD" : "#fff",
                        border: `0.5px solid ${corrente ? "#1A5C38" : "#D4DCE8"}`,
                        opacity: passado ? 0.7 : 1,
                      }}>
                        <div style={{ width: 54, textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: corrente ? "#1A5C38" : "#1a1a1a" }}>{c.ano}</div>
                          {corrente && <div style={{ fontSize: 9, color: "#1A5C38", fontWeight: 600 }}>ATUAL</div>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{c.desc}</div>
                          <div style={{ display: "flex", gap: 12 }}>
                            <span style={{ fontSize: 11, color: "#1A4870" }}>CBS: <strong>{c.cbs}%</strong></span>
                            <span style={{ fontSize: 11, color: "#1A5C38" }}>IBS: <strong>{c.ibs}% do total</strong></span>
                          </div>
                        </div>
                        <div style={{ width: 200, flexShrink: 0 }}>
                          <div style={{ height: 8, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${c.ibs}%`, background: "#1A5C38", borderRadius: 4, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "#888", marginTop: 2, textAlign: "right" }}>IBS {c.ibs}% implementado</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 20, background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 10, padding: "14px 16px", fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: "#C9921B", marginBottom: 8 }}>⚠ O que o Arato irá adaptar automaticamente</div>
                  {[
                    "Campos IBS e CBS nos documentos fiscais (NF-e) a partir de 2027",
                    "Apuração de créditos de IBS/CBS sobre compras de insumos",
                    "Relatório mensal de apuração IBS/CBS para entrega ao fisco",
                    "Controle de devolução de créditos acumulados (prazo 60 dias)",
                    "Split payment: conciliação automática do imposto retido na fonte",
                    "Atualização das alíquotas conforme calendário de transição anual",
                  ].map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
                      <span style={{ color: "#C9921B" }}>→</span>
                      <span style={{ color: "#1a1a1a" }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
