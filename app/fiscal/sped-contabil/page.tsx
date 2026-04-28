"use client";
import { useState, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { ConfigContabilidade, Lancamento, OperacaoGerencial } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Helpers de formatação para SPED
// ─────────────────────────────────────────────────────────────
function dtSped(s: string): string {
  // "YYYY-MM-DD" → "DDMMYYYY"
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}${m}${y}`;
}

function fmtValorSped(v: number): string {
  // SPED usa ponto decimal, 2 casas
  return v.toFixed(2);
}

function limpar(s: string | undefined): string {
  return (s ?? "").replace(/[|]/g, " ").trim();
}

function seq(n: number): string {
  return String(n).padStart(9, "0");
}

// ─────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────
interface LancamentoContabil {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  conta_debito: string;
  conta_credito: string;
  entidade: "pf" | "pj";
  vinculo: string;
  doc_ref?: string;
}

interface ContaResumo {
  codigo: string;
  descricao: string;
  nivel: number;
  tipo: "S" | "A"; // S=Sintética, A=Analítica
  natureza: "D" | "C"; // D=Devedora, C=Credora
}

// ─────────────────────────────────────────────────────────────
// Geração do arquivo SPED ECD (Leiaute 10)
// ─────────────────────────────────────────────────────────────
function gerarSpedEcd(
  cfg: ConfigContabilidade,
  lancamentos: LancamentoContabil[],
  contas: ContaResumo[],
  anoExercicio: string,
): string {
  const dtIni = `01/01/${anoExercicio}`;
  const dtFin = `31/12/${anoExercicio}`;
  const dtIniSped = `0101${anoExercicio}`;
  const dtFinSped = `3112${anoExercicio}`;
  const linhas: string[] = [];
  let nrSeq = 1;

  const L = (...campos: string[]) => {
    linhas.push("|" + campos.join("|") + "|");
    nrSeq++;
  };

  // ─── Bloco 0 — Abertura ────────────────────────────────────
  L("0000",
    "10",             // leiaute
    dtIniSped,
    dtFinSped,
    limpar(cfg.nome_empresarial),
    cfg.entidade === "pj" ? limpar(cfg.cnpj ?? "") : "",
    cfg.entidade === "pf" ? limpar(cfg.cpf ?? "") : "",
    limpar(cfg.uf ?? "MT"),
    limpar(cfg.ie ?? ""),
    limpar(cfg.cod_municipio_ibge ?? ""),
    limpar(cfg.nire ?? ""),
    limpar(cfg.ind_sit_ini ?? "0"),
    "",               // ind_sit_esp
  );

  // 0001 — indicador de movimento (1 = sem dados, 0 = com dados)
  L("0001", lancamentos.length === 0 ? "1" : "0");

  // 0007 — participantes (SCP) — opcional, omitido
  // 0035 — identificação da SCP — opcional, omitido

  // 0150 — participantes (emitentes/destinatários) — opcional; gera um registro para a própria entidade
  L("0150",
    "0001",   // cod_part
    limpar(cfg.nome_empresarial),
    "1058",   // cod_pais: Brasil
    cfg.entidade === "pj" ? limpar(cfg.cnpj ?? "") : "",
    cfg.entidade === "pf" ? limpar(cfg.cpf ?? "") : "",
    limpar(cfg.ie ?? ""),
    limpar(cfg.cod_municipio_ibge ?? ""),
    "",       // suframa
    "",       // ddd
    "",       // tel
  );

  // 0990 — encerramento bloco 0
  L("0990", String(nrSeq));
  nrSeq = 1;

  // ─── Bloco I — Lançamentos ────────────────────────────────
  L("I001", lancamentos.length === 0 ? "1" : "0");

  // I010 — identificação do livro
  L("I010",
    limpar(cfg.tipo_escrituracao ?? "G"),   // ident_med
    "S",                                    // ind_ccusto: S=Sim
    limpar(cfg.nome_livro ?? "Livro Diário"),
    "",                                     // cod_agl
  );

  // I012 — identificação das demonstrações contábeis
  L("I012",
    limpar(cfg.nr_livro ?? "1"),   // num_ord
    dtIniSped,
    limpar(cfg.nome_livro ?? "Livro Diário"),
    "",   // hash_ord
  );

  // I020 — identificação de documentos auxiliares
  // Omitido para simplificar — a validação aceita sem ele

  // I050 — plano de contas
  // Gera uma linha por conta encontrada nos lançamentos
  const contasUsadas = new Map<string, ContaResumo>();
  for (const c of contas) contasUsadas.set(c.codigo, c);

  // Adiciona contas sintéticas derivadas (a partir dos códigos dos lançamentos)
  for (const lc of lancamentos) {
    for (const cod of [lc.conta_debito, lc.conta_credito]) {
      if (!cod || contasUsadas.has(cod)) continue;
      // Infere nível pelo número de segmentos
      const partes = cod.split(".");
      contasUsadas.set(cod, {
        codigo: cod,
        descricao: `Conta ${cod}`,
        nivel: partes.length,
        tipo: partes.length >= 4 ? "A" : "S",
        natureza: partes[0] <= "2" ? "D" : "C",
      });
    }
  }

  for (const [, conta] of contasUsadas) {
    L("I050",
      limpar(conta.codigo),  // cod_cta
      "",                    // ccus_plano
      "",                    // cod_plano (padrão BRGAAP ou IFRS — deixar em branco)
      "S",                   // ind_eng: S=Sim (escrituracao)
      limpar(conta.descricao),
      String(conta.nivel),
      "",                    // cod_cta_sup
      "",                    // ind_ctareferencialntercado
      conta.tipo,            // ind_cta: A=Analítica, S=Sintética
      "",                    // vl_cta_ini (saldo inicial)
      "",                    // dt_alt
    );
  }

  // I100 — saldo inicial/final das contas (simplificado — omitido pois requer cálculo de balanço)
  // I150 — cabeçalho dos lançamentos contábeis
  // I155 — partidas do lançamento

  for (const lc of lancamentos) {
    // I150 — cabeçalho
    L("I150",
      limpar(lc.id.substring(0, 20)),   // num_lcto
      dtSped(lc.data),
      fmtValorSped(lc.valor),
      "",                                // ind_lcto (reservado)
    );
    // I155 — partida débito
    L("I155",
      "1",                              // num_li_lcto
      limpar(lc.conta_debito),          // cod_cta
      "",                               // cod_ccus
      fmtValorSped(lc.valor),           // vl_dc
      "D",                              // ind_dc
      "",                               // num_arql
      limpar(lc.descricao),             // ds_doc
    );
    // I155 — partida crédito
    L("I155",
      "2",
      limpar(lc.conta_credito),
      "",
      fmtValorSped(lc.valor),
      "C",
      "",
      limpar(lc.descricao),
    );
  }

  // I990 — encerramento bloco I
  L("I990", String(nrSeq));
  nrSeq = 1;

  // ─── Bloco J — Demonstrações (simplificado) ───────────────
  L("J001", "1");  // sem demonstrações neste arquivo — apenas marcador
  L("J990", String(nrSeq));
  nrSeq = 1;

  // ─── Bloco 9 — Encerramento ────────────────────────────────
  L("9001", "0");
  // 9900 — quantidade de registros por tipo
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const reg = linha.split("|")[1];
    contagem.set(reg, (contagem.get(reg) ?? 0) + 1);
  }
  for (const [reg, qtd] of contagem) {
    L("9900", reg, String(qtd));
  }
  L("9990", String(nrSeq));
  L("9999", String(linhas.length + 1));

  return linhas.join("\r\n") + "\r\n";
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "20px 24px", marginBottom: 20 };

export default function SpedContabilPage() {
  const { fazendaId } = useAuth();
  const [entidade, setEntidade] = useState<"pf" | "pj">("pf");
  const [anoExercicio, setAnoExercicio] = useState(new Date().getFullYear() - 1 + "");
  const [vinculos, setVinculos] = useState<string[]>(["rural", "pessoa_fisica", "investimento"]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ total: number; erros: string[] } | null>(null);
  const [err, setErr] = useState("");

  function toggleVinculo(v: string) {
    setVinculos(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  }

  const gerar = useCallback(async (baixar: boolean) => {
    if (!fazendaId) return;
    setLoading(true);
    setErr("");
    setPreview(null);

    try {
      // 1. Busca configuração contábil da entidade
      const { data: cfgData } = await supabase
        .from("config_contabilidade")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .eq("entidade", entidade)
        .single();

      if (!cfgData) {
        setErr(`Configure os dados da entidade ${entidade.toUpperCase()} em Configurações → Configuração Contábil antes de gerar o SPED.`);
        setLoading(false);
        return;
      }

      const cfg = cfgData as ConfigContabilidade;

      // 2. Busca lançamentos do exercício com vinculo_atividade filtrado
      const dtIni = `${anoExercicio}-01-01`;
      const dtFin = `${anoExercicio}-12-31`;

      let query = supabase
        .from("lancamentos")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .eq("entidade_contabil", entidade)
        .gte("data_lancamento", dtIni)
        .lte("data_lancamento", dtFin)
        .neq("status", "em_aberto"); // apenas liquidados

      if (vinculos.length > 0) {
        query = query.in("vinculo_atividade", vinculos);
      }

      const { data: lancsData } = await query;
      const lancs = (lancsData ?? []) as Lancamento[];

      // 3. Busca operações gerenciais (plano de contas) para obter conta_debito/conta_credito
      const { data: opsData } = await supabase
        .from("operacoes_gerenciais")
        .select("id, classificacao, descricao, conta_debito, conta_credito, tipo")
        .eq("fazenda_id", fazendaId);

      const ops = (opsData ?? []) as Pick<OperacaoGerencial, "id" | "classificacao" | "descricao" | "conta_debito" | "conta_credito" | "tipo">[];
      const opMap = new Map(ops.map(o => [o.id, o]));

      const erros: string[] = [];
      const lancContabeis: LancamentoContabil[] = [];
      const contasSet = new Map<string, ContaResumo>();

      for (const lc of lancs) {
        if (!lc.operacao_id) {
          erros.push(`Lançamento "${lc.descricao}" (${lc.data_lancamento}) sem operação gerencial — ignorado.`);
          continue;
        }
        const op = opMap.get(lc.operacao_id);
        if (!op) {
          erros.push(`Operação gerencial não encontrada para: "${lc.descricao}" — ignorado.`);
          continue;
        }
        if (!op.conta_debito || !op.conta_credito) {
          erros.push(`Operação "${op.descricao}" sem contas contábeis configuradas — configure em Operações Gerenciais.`);
          continue;
        }

        lancContabeis.push({
          id: lc.id,
          data: lc.data_baixa ?? lc.data_lancamento,
          descricao: lc.descricao,
          valor: lc.valor_pago ?? lc.valor,
          conta_debito: op.conta_debito,
          conta_credito: op.conta_credito,
          entidade,
          vinculo: lc.vinculo_atividade ?? "rural",
          doc_ref: lc.nfe_numero,
        });

        // Registra contas usadas
        for (const [cod, tipo] of [[op.conta_debito, "D"], [op.conta_credito, "C"]] as [string, "D"|"C"][]) {
          if (!contasSet.has(cod)) {
            const partes = cod.split(".");
            contasSet.set(cod, {
              codigo: cod,
              descricao: op.descricao,
              nivel: partes.length,
              tipo: partes.length >= 4 ? "A" : "S",
              natureza: tipo,
            });
          }
        }
      }

      setPreview({ total: lancContabeis.length, erros });

      if (!baixar) {
        setLoading(false);
        return;
      }

      // 4. Gera o arquivo
      const conteudo = gerarSpedEcd(cfg, lancContabeis, [...contasSet.values()], anoExercicio);

      // 5. Download
      const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomeEntidade = (cfg.nome_empresarial || entidade.toUpperCase()).substring(0, 20).replace(/\s+/g, "_");
      a.href = url;
      a.download = `SPED_ECD_${nomeEntidade}_${anoExercicio}.txt`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar SPED ECD");
    } finally {
      setLoading(false);
    }
  }, [fazendaId, entidade, anoExercicio, vinculos]);

  const VINCULOS_DISPONIVEIS = [
    { id: "rural",           label: "Atividade Rural",       cor: "#16A34A", bg: "#E8F5E9" },
    { id: "pessoa_fisica",   label: "Pessoa Física (não rural)", cor: "#1A5CB8", bg: "#D5E8F5" },
    { id: "investimento",    label: "Investimentos",         cor: "#C9921B", bg: "#FBF3E0" },
    { id: "nao_tributavel",  label: "Não Tributável",        cor: "#888",    bg: "#F4F6FA" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", margin: 0 }}>SPED ECD — Escrituração Contábil Digital</h1>
              <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
                Gera o arquivo de transmissão no formato aceito pelo Domínio e pela Receita Federal (Leiaute 10).
              </p>
            </div>
            <a
              href="/configuracoes/contabilidade"
              style={{ fontSize: 12, color: "#1A5CB8", textDecoration: "none", whiteSpace: "nowrap" as const }}
            >
              ⚙ Configurar dados contábeis →
            </a>
          </div>
        </div>

        {/* Como funciona */}
        <div style={{ background: "#D5E8F5", border: "0.5px solid #A8CDE8", borderRadius: 10, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "#0B2D50" }}>
          <strong>Como funciona:</strong> os lançamentos contábeis são derivados automaticamente dos lançamentos gerenciais.
          Cada operação gerencial tem <em>conta_débito</em> e <em>conta_crédito</em> configuradas — essa é a ponte.
          Configure as contas em{" "}
          <a href="/cadastros?tab=operacoes_gerenciais" style={{ color: "#1A5CB8" }}>Cadastros → Operações Gerenciais</a>.
        </div>

        {/* Parâmetros */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #E8EEF5" }}>
            Parâmetros de Geração
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
            <div>
              <label style={lbl}>Entidade Contábil</label>
              <div style={{ display: "flex", gap: 8 }}>
                {([["pf", "Produtor / PF"], ["pj", "Empresa / PJ"]] as [string, string][]).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setEntidade(v as "pf" | "pj")}
                    style={{
                      flex: 1, padding: "9px 0", border: entidade === v ? "none" : "0.5px solid #D4DCE8",
                      borderRadius: 8, background: entidade === v ? "#1A5CB8" : "#fff",
                      color: entidade === v ? "#fff" : "#555", fontWeight: entidade === v ? 700 : 400,
                      cursor: "pointer", fontSize: 13,
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Exercício (Ano)</label>
              <input
                style={inp}
                value={anoExercicio}
                onChange={e => setAnoExercicio(e.target.value)}
                placeholder="YYYY"
                maxLength={4}
              />
            </div>
          </div>

          {/* Vínculos de atividade */}
          <div style={{ marginTop: 20 }}>
            <label style={{ ...lbl, marginBottom: 10 }}>Vínculos de Atividade a incluir</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {VINCULOS_DISPONIVEIS.map(vd => (
                <button
                  key={vd.id}
                  onClick={() => toggleVinculo(vd.id)}
                  style={{
                    padding: "6px 14px", border: `0.5px solid ${vinculos.includes(vd.id) ? vd.cor : "#D4DCE8"}`,
                    borderRadius: 8, background: vinculos.includes(vd.id) ? vd.bg : "#fff",
                    color: vinculos.includes(vd.id) ? vd.cor : "#888",
                    cursor: "pointer", fontSize: 12, fontWeight: vinculos.includes(vd.id) ? 700 : 400,
                  }}
                >
                  {vinculos.includes(vd.id) ? "✓ " : ""}{vd.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
              Selecione quais vínculos devem integrar este livro.
              Lançamentos sem vínculo definido <strong>não serão incluídos</strong>.
            </p>
          </div>
        </div>

        {/* Preview / resultado */}
        {preview && (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #E8EEF5" }}>
              Resultado da Análise
            </div>
            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div style={{ background: "#E8F5E9", border: "0.5px solid #16A34A40", borderRadius: 10, padding: "12px 20px", flex: 1, textAlign: "center" as const }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#16A34A" }}>{preview.total}</div>
                <div style={{ fontSize: 11, color: "#555" }}>lançamentos contábeis</div>
              </div>
              <div style={{ background: preview.erros.length > 0 ? "#FCEBEB" : "#E8F5E9", border: `0.5px solid ${preview.erros.length > 0 ? "#E24B4A40" : "#16A34A40"}`, borderRadius: 10, padding: "12px 20px", flex: 1, textAlign: "center" as const }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: preview.erros.length > 0 ? "#E24B4A" : "#16A34A" }}>{preview.erros.length}</div>
                <div style={{ fontSize: 11, color: "#555" }}>ignorados (sem conta)</div>
              </div>
            </div>

            {preview.erros.length > 0 && (
              <div style={{ background: "#FFF8E8", border: "0.5px solid #C9921B50", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7B4A00", marginBottom: 8 }}>Lançamentos ignorados — configure a conta contábil nas Operações Gerenciais:</div>
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 160, overflowY: "auto" as const }}>
                  {preview.erros.slice(0, 20).map((e, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#7B4A00", marginBottom: 4 }}>{e}</li>
                  ))}
                  {preview.erros.length > 20 && <li style={{ fontSize: 12, color: "#888" }}>... e mais {preview.erros.length - 20}</li>}
                </ul>
              </div>
            )}

            {preview.total === 0 && (
              <div style={{ fontSize: 13, color: "#E24B4A", fontWeight: 600, textAlign: "center" as const, padding: "8px 0" }}>
                Nenhum lançamento contábil encontrado para os filtros selecionados.
              </div>
            )}
          </div>
        )}

        {err && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#E24B4A" }}>
            {err}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => gerar(false)}
            disabled={loading}
            style={{ padding: "10px 24px", background: "#F4F6FA", border: "0.5px solid #1A5CB8", color: "#1A5CB8", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
          >
            {loading ? "Analisando..." : "Analisar (sem baixar)"}
          </button>
          <button
            onClick={() => gerar(true)}
            disabled={loading || (preview !== null && preview.total === 0)}
            style={{
              padding: "10px 28px",
              background: loading || (preview !== null && preview.total === 0) ? "#ccc" : "#1A5CB8",
              color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14,
            }}
          >
            {loading ? "Gerando..." : "Baixar SPED ECD (.txt)"}
          </button>
        </div>

        {/* Nota rodapé */}
        <div style={{ marginTop: 32, padding: "14px 18px", background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          <strong style={{ color: "#1A4870" }}>Sobre o arquivo gerado:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Formato: texto plano, separado por pipe <code style={{ background: "#F4F6FA", padding: "1px 4px", borderRadius: 4 }}>|</code>, CRLF, codificação UTF-8</li>
            <li>Leiaute: SPED ECD Leiaute 10 (vigente desde 2022)</li>
            <li>Transmissão: via <strong>PGE (Programa Gerador ECD)</strong> disponível no site da Receita Federal</li>
            <li>Compatibilidade: aceito pelo <strong>Domínio Sistemas</strong> para importação e pela Receita Federal para transmissão direta</li>
            <li>Este arquivo contém apenas os lançamentos <strong>baixados/liquidados</strong> — lançamentos em aberto não são incluídos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
