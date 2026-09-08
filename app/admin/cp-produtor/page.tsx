"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase as sb } from "../../../lib/supabase";

type Conta = { id: string; nome: string; tipo: string };
type Produtor = { id: string; nome: string; cpf_cnpj?: string; fazenda_id: string; fazenda_nome?: string };
type Lancamento = {
  id: string;
  fazenda_id: string;
  fazenda_nome?: string;
  descricao: string;
  categoria: string;
  data_vencimento: string;
  data_lancamento: string;
  valor: number;
  nfe_numero?: string;
  pessoa_id?: string;
  fornecedor_nome?: string;
};

type Sugestao = {
  lancamento_id: string;
  produtor_id: string | null;
  confianca: "alta" | "media" | "baixa" | "indeterminado";
  motivo: string;
};

type LancamentoComSugestao = Lancamento & {
  sugestao?: Sugestao;
  selecionado: string | null;
  confirmado: boolean;
};

const COR_CONFIANCA: Record<string, string> = {
  alta:          "#166534",
  media:         "#92400E",
  baixa:         "#991B1B",
  indeterminado: "#374151",
};

const BG_CONFIANCA: Record<string, string> = {
  alta:          "#F0FDF4",
  media:         "#FFFBEB",
  baixa:         "#FEF2F2",
  indeterminado: "#F9FAFB",
};

export default function CpProdutorPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState("");
  const [fazendaNomes, setFazendaNomes] = useState<Record<string, string>>({});
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoComSugestao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [processandoAuto, setProcessandoAuto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [pagina, setPagina] = useState(0);
  const TAMANHO_LOTE = 50;

  // Carrega contas (clientes)
  useEffect(() => {
    sb.from("contas").select("id, nome, tipo").order("nome")
      .then(({ data }) => setContas((data ?? []) as Conta[]));
  }, []);

  const carregarDados = useCallback(async (cid: string) => {
    if (!cid) return;
    setCarregando(true);
    setLancamentos([]);
    setMsg("");
    setPagina(0);

    // Fazendas da conta
    const { data: fazendas } = await sb
      .from("fazendas")
      .select("id, nome")
      .eq("conta_id", cid)
      .order("nome");

    const fMap: Record<string, string> = {};
    (fazendas ?? []).forEach((f: { id: string; nome: string }) => { fMap[f.id] = f.nome; });
    setFazendaNomes(fMap);
    const fazIds = Object.keys(fMap);

    if (!fazIds.length) {
      setMsg("Nenhuma fazenda encontrada para esta conta.");
      setCarregando(false);
      return;
    }

    // Produtores da conta
    const { data: prods } = await sb
      .from("produtores")
      .select("id, nome, cpf_cnpj, fazenda_id")
      .eq("conta_id", cid)
      .order("nome");

    setProdutores(
      (prods ?? []).map(p => ({ ...p, fazenda_nome: fMap[p.fazenda_id] }))
    );

    // CP sem produtor em qualquer fazenda da conta
    const { data: lancs, count } = await sb
      .from("lancamentos")
      .select(`
        id, fazenda_id, descricao, categoria,
        data_vencimento, data_lancamento,
        valor, nfe_numero, pessoa_id,
        pessoas:pessoa_id ( nome )
      `, { count: "exact" })
      .in("fazenda_id", fazIds)
      .eq("tipo", "pagar")
      .is("produtor_id", null)
      .order("data_vencimento", { ascending: false })
      .limit(500);

    const lista: LancamentoComSugestao[] = (lancs ?? []).map((l: Record<string, unknown>) => ({
      id: l.id as string,
      fazenda_id: l.fazenda_id as string,
      fazenda_nome: fMap[l.fazenda_id as string],
      descricao: l.descricao as string,
      categoria: l.categoria as string,
      data_vencimento: l.data_vencimento as string,
      data_lancamento: l.data_lancamento as string,
      valor: l.valor as number,
      nfe_numero: l.nfe_numero as string | undefined,
      pessoa_id: l.pessoa_id as string | undefined,
      fornecedor_nome: (l.pessoas as { nome?: string } | null)?.nome,
      selecionado: null,
      confirmado: false,
    }));

    setLancamentos(lista);
    setMsg(`${count ?? lista.length} lançamentos CP sem produtor nesta conta.`);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (contaId) carregarDados(contaId);
  }, [contaId, carregarDados]);

  async function processarTudoAuto() {
    if (!contaId) return;
    setProcessandoAuto(true);
    setMsg("🤖 IA vasculhando NF a NF e aplicando UPDATEs automaticamente... aguarde.");
    try {
      const res = await fetch("/api/admin/cp-produtor/processar-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conta_id: contaId }),
      });
      const data = await res.json();
      if (data.erro) throw new Error(data.erro);
      setMsg(
        `✅ Concluído — ${data.total_processados} CP processados | ` +
        `${data.atualizados} atualizados | ` +
        `${data.indeterminados} indeterminados pela IA` +
        (data.erros_count ? ` | ⚠️ ${data.erros_count} erros` : "")
      );
      // Recarrega lista
      await carregarDados(contaId);
    } catch (err) {
      setMsg(`Erro: ${err instanceof Error ? err.message : "falha"}`);
    } finally {
      setProcessandoAuto(false);
    }
  }

  async function processarLoteIA() {
    const inicio = pagina * TAMANHO_LOTE;
    const lote = lancamentos.slice(inicio, inicio + TAMANHO_LOTE);
    if (!lote.length) return;

    setProcessando(true);
    setMsg(`Consultando Arato IA para ${lote.length} lançamentos...`);

    try {
      const conta = contas.find(c => c.id === contaId);
      const res = await fetch("/api/admin/cp-produtor/sugerir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_nome: conta?.nome ?? "",
          lancamentos: lote.map(l => ({
            id: l.id,
            descricao: l.descricao,
            categoria: l.categoria,
            data_vencimento: l.data_vencimento,
            data_lancamento: l.data_lancamento,
            valor: l.valor,
            fornecedor_nome: l.fornecedor_nome,
            nfe_numero: l.nfe_numero,
            fazenda_nome: l.fazenda_nome,
          })),
          produtores: produtores.map(p => ({
            id: p.id,
            nome: p.nome,
            cpf_cnpj: p.cpf_cnpj,
            fazenda_id: p.fazenda_id,
            fazenda_nome: p.fazenda_nome,
          })),
        }),
      });

      const { sugestoes, error } = await res.json();
      if (error) throw new Error(error);

      setLancamentos(prev =>
        prev.map(l => {
          const s = (sugestoes as Sugestao[]).find(sg => sg.lancamento_id === l.id);
          if (!s) return l;
          return { ...l, sugestao: s, selecionado: s.produtor_id };
        })
      );
      setMsg(`IA processou ${lote.length} lançamentos. Revise e confirme abaixo.`);
    } catch (err) {
      setMsg(`Erro: ${err instanceof Error ? err.message : "falha na IA"}`);
    } finally {
      setProcessando(false);
    }
  }

  function confirmarTodos() {
    setLancamentos(prev =>
      prev.map(l => (l.sugestao && l.selecionado ? { ...l, confirmado: true } : l))
    );
  }

  function alterarProdutor(lancId: string, prodId: string) {
    setLancamentos(prev =>
      prev.map(l => l.id === lancId ? { ...l, selecionado: prodId, confirmado: false } : l)
    );
  }

  function confirmarIndividual(lancId: string) {
    setLancamentos(prev =>
      prev.map(l => l.id === lancId && l.selecionado ? { ...l, confirmado: true } : l)
    );
  }

  async function salvarConfirmados() {
    const confirmados = lancamentos.filter(l => l.confirmado && l.selecionado);
    if (!confirmados.length) { setMsg("Nenhum lançamento confirmado para salvar."); return; }

    setSalvando(true);
    setMsg(`Salvando ${confirmados.length} atualizações...`);

    try {
      const res = await fetch("/api/admin/cp-produtor/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atualizacoes: confirmados.map(l => ({
            lancamento_id: l.id,
            produtor_id: l.selecionado!,
          })),
        }),
      });

      const { atualizados, erros } = await res.json();
      setMsg(`✅ ${atualizados} lançamentos atualizados.${erros?.length ? ` ⚠️ ${erros.length} erros.` : ""}`);

      const salvoIds = new Set(confirmados.map(l => l.id));
      setLancamentos(prev => prev.filter(l => !salvoIds.has(l.id)));
    } catch (err) {
      setMsg(`Erro ao salvar: ${err instanceof Error ? err.message : "falha"}`);
    } finally {
      setSalvando(false);
    }
  }

  const loteAtual = lancamentos.slice(pagina * TAMANHO_LOTE, (pagina + 1) * TAMANHO_LOTE);
  const comSugestao = loteAtual.filter(l => l.sugestao).length;
  const confirmados = lancamentos.filter(l => l.confirmado).length;
  const totalPaginas = Math.ceil(lancamentos.length / TAMANHO_LOTE);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>CP sem Produtor — Atribuição por IA</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Selecione o cliente (conta), processe lotes com a IA, revise as sugestões e salve.
        </div>
      </div>

      {/* Seletor de conta */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select
          value={contaId}
          onChange={e => setContaId(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDE2EE", fontSize: 13, minWidth: 300 }}
        >
          <option value="">Selecione o cliente (conta)...</option>
          {contas.map(c => (
            <option key={c.id} value={c.id}>{c.nome} — {c.tipo.toUpperCase()}</option>
          ))}
        </select>

        {contaId && !carregando && lancamentos.length > 0 && (
          <>
            <button
              onClick={processarTudoAuto}
              disabled={processandoAuto || processando}
              style={{ padding: "8px 18px", background: "#7C2D12", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: (processandoAuto || processando) ? "not-allowed" : "pointer", opacity: (processandoAuto || processando) ? 0.7 : 1 }}
            >
              {processandoAuto ? "⏳ Processando tudo..." : `🤖 Processar tudo automaticamente (${lancamentos.length})`}
            </button>

            <button
              onClick={processarLoteIA}
              disabled={processando}
              style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: processando ? "not-allowed" : "pointer", opacity: processando ? 0.7 : 1 }}
            >
              {processando ? "Processando..." : `🤖 IA — Lote ${pagina + 1}/${totalPaginas} (${loteAtual.length} itens)`}
            </button>

            {comSugestao > 0 && (
              <button
                onClick={confirmarTodos}
                style={{ padding: "8px 18px", background: "#166534", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
              >
                ✓ Confirmar todos do lote
              </button>
            )}

            {confirmados > 0 && (
              <button
                onClick={salvarConfirmados}
                disabled={salvando}
                style={{ padding: "8px 18px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: salvando ? "not-allowed" : "pointer", opacity: salvando ? 0.7 : 1 }}
              >
                {salvando ? "Salvando..." : `💾 Salvar ${confirmados} confirmados`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Paginação de lotes */}
      {totalPaginas > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {Array.from({ length: totalPaginas }, (_, i) => (
            <button
              key={i}
              onClick={() => setPagina(i)}
              style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 12,
                border: i === pagina ? "1.5px solid #1A4870" : "1px solid #DDE2EE",
                background: i === pagina ? "#D5E8F5" : "#fff",
                color: i === pagina ? "#1A4870" : "#555",
                cursor: "pointer",
              }}
            >
              Lote {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Status */}
      {msg && (
        <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#333", marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {carregando && <div style={{ color: "#555", fontSize: 13, padding: "20px 0" }}>Carregando...</div>}

      {/* Tabela */}
      {loteAtual.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F4F6FA", borderBottom: "1.5px solid #DDE2EE" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Data</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Fazenda</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Descrição / Fornecedor</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Categoria</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#555" }}>Valor</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Sugestão IA</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>Produtor</th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#555" }}>OK</th>
              </tr>
            </thead>
            <tbody>
              {loteAtual.map((l, idx) => (
                <tr
                  key={l.id}
                  style={{
                    background: l.confirmado ? "#F0FDF4" : idx % 2 === 0 ? "#fff" : "#FAFAFA",
                    borderBottom: "0.5px solid #EEE",
                  }}
                >
                  <td style={{ padding: "9px 12px", color: "#555", whiteSpace: "nowrap" }}>
                    {new Date(l.data_vencimento).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#555", whiteSpace: "nowrap", fontSize: 11 }}>
                    {l.fazenda_nome ?? "—"}
                  </td>
                  <td style={{ padding: "9px 12px", maxWidth: 200 }}>
                    <div style={{ fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.descricao}
                    </div>
                    {l.fornecedor_nome && (
                      <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{l.fornecedor_nome}</div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#555" }}>{l.categoria}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "#111", whiteSpace: "nowrap" }}>
                    {l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td style={{ padding: "9px 12px", maxWidth: 180 }}>
                    {l.sugestao ? (
                      <div>
                        <span style={{
                          display: "inline-block", fontSize: 10, fontWeight: 700,
                          padding: "2px 6px", borderRadius: 4,
                          color: COR_CONFIANCA[l.sugestao.confianca],
                          background: BG_CONFIANCA[l.sugestao.confianca],
                          marginBottom: 3,
                        }}>
                          {l.sugestao.confianca.toUpperCase()}
                        </span>
                        <div style={{ fontSize: 11, color: "#666", lineHeight: 1.3 }}>{l.sugestao.motivo}</div>
                      </div>
                    ) : (
                      <span style={{ color: "#CCC" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <select
                      value={l.selecionado ?? ""}
                      onChange={e => alterarProdutor(l.id, e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #DDE2EE", fontSize: 12, width: "100%", minWidth: 150 }}
                    >
                      <option value="">— selecione —</option>
                      {produtores.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nome}{p.fazenda_nome ? ` (${p.fazenda_nome})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>
                    {l.confirmado ? (
                      <span style={{ color: "#166534", fontWeight: 700, fontSize: 16 }}>✓</span>
                    ) : (
                      <button
                        onClick={() => confirmarIndividual(l.id)}
                        disabled={!l.selecionado}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          border: "1px solid #DDE2EE",
                          background: l.selecionado ? "#1A4870" : "#EEE",
                          color: l.selecionado ? "#fff" : "#AAA",
                          fontSize: 11, cursor: l.selecionado ? "pointer" : "not-allowed",
                        }}
                      >
                        OK
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!carregando && contaId && lancamentos.length === 0 && (
        <div style={{ color: "#166534", fontSize: 14, padding: "20px 0" }}>
          ✅ Todos os lançamentos desta conta já têm produtor vinculado.
        </div>
      )}
    </div>
  );
}
