"use client";
// Folha → Adiantamentos → "Usar como pagamento": escolhe a conta do Contas a Pagar que este adiantamento paga
// (ex.: compra que o produtor fez para o funcionário). A regra que grava é a do banco (Seção 451).
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmarAcao } from "../ConfirmarAcao";
import { TEXTO_MODO, type SituacaoUso } from "../../lib/folha/usar-adiantamento";

type ContaCp = { id: string; descricao: string | null; valor: number; data_vencimento: string | null; status: string;
  fazenda_nome?: string | null; pessoas?: { nome?: string | null } | null };
type Uso = { id: string; valor_aplicado: number; data_aplicacao: string; modo: string | null; descricao: string;
  conta: (ContaCp & { status: string }) | null };
type Resposta = { situacao: SituacaoUso; usos: Uso[]; titulos: ContaCp[]; funcionario_nome: string | null };

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (s: string | null | undefined) => (s ? new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");

export default function ModalUsarAdiantamento({ adiantamento, api, onFechar, onAlterado }: {
  adiantamento: { id: string; funcionario_nome?: string | null; data: string; valor: number };
  api: (body: Record<string, unknown>) => Promise<unknown>;
  onFechar: () => void;
  onAlterado: () => void;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string>("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState(false);
  const requisicao = useRef<{ conta: string; id: string } | null>(null);

  const carregar = useCallback(async (termo: string) => {
    setCarregando(true); setErro("");
    try {
      setDados(await api({ operacao: "titulos_uso_adiantamento", id: adiantamento.id, busca: termo }) as Resposta);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setCarregando(false); }
  }, [api, adiantamento.id]);

  useEffect(() => {
    const t = setTimeout(() => { void carregar(busca); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  const conta = dados?.titulos.find(t => t.id === escolhida) ?? null;

  async function usar() {
    if (!conta || !dados || gravando) return;
    const sobra = Math.round((dados.situacao.disponivel - Number(conta.valor)) * 100) / 100;
    const ok = await confirmarAcao({
      titulo: "Usar adiantamento como pagamento?",
      mensagem: `${moeda(conta.valor)} do adiantamento de ${dados.funcionario_nome ?? "funcionário"} pagam: ${conta.descricao ?? "conta do CP"}.\n\n${TEXTO_MODO[dados.situacao.modo]}\n\nO adiantamento continua a ser descontado na folha.${sobra > 0 ? `\n\nSobram ${moeda(sobra)} do adiantamento para outra conta ou pagamento normal.` : ""}`,
      perigo: false,
    });
    if (!ok) return;
    if (requisicao.current?.conta !== conta.id) requisicao.current = { conta: conta.id, id: crypto.randomUUID() };
    setGravando(true); setErro("");
    try {
      await api({ operacao: "usar_adiantamento", id: adiantamento.id, lancamento_id: conta.id, requisicao_id: requisicao.current.id });
      requisicao.current = null; setEscolhida("");
      onAlterado(); await carregar(busca);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setGravando(false); }
  }

  async function desfazer(u: Uso) {
    if (gravando) return;
    const ok = await confirmarAcao({
      titulo: "Desfazer o uso do adiantamento?",
      mensagem: `A conta "${u.conta?.descricao ?? "do CP"}" volta à Operação Gerencial de antes${u.modo === "quita_conta" ? " e volta a ficar em aberto" : ""}, e os ${moeda(u.valor_aplicado)} voltam ao saldo do adiantamento${u.modo === "abate_adiantamento" ? " (e ao título dele no CP)" : ""}.`,
      perigo: true,
    });
    if (!ok) return;
    setGravando(true); setErro("");
    try {
      await api({ operacao: "desfazer_uso_adiantamento", id: adiantamento.id, aplicacao_id: u.id });
      onAlterado(); await carregar(busca);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setGravando(false); }
  }

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, padding: "6px 8px", borderBottom: "0.5px solid #DDE2EE", position: "sticky", top: 0, background: "#fff" };
  const td: React.CSSProperties = { fontSize: 12, padding: "6px 8px", borderBottom: "0.5px solid #EEF1F6", color: "#1a1a1a" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="usar-adi-titulo" data-folha-dialog="true"
        style={{ background: "#fff", borderRadius: 12, width: "min(96vw,860px)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 id="usar-adi-titulo" data-arato-h2="true" style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Usar adiantamento como pagamento</h2>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
              {adiantamento.funcionario_nome ?? dados?.funcionario_nome ?? "—"} · {data(adiantamento.data)} · {moeda(adiantamento.valor)}
              {dados && <> · disponível para usar: <b style={{ color: "#1A4870" }}>{moeda(dados.situacao.disponivel)}</b></>}
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", fontSize: 18, color: "#666", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "12px 20px", overflow: "auto", flex: 1 }}>
          {erro && <div style={{ background: "#FDECEC", color: "#A32D2D", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>{erro}</div>}

          {dados && dados.usos.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0B2D50", marginBottom: 6 }}>Contas já pagas com este adiantamento</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {dados.usos.map(u => (
                    <tr key={u.id}>
                      <td style={td}>{u.conta?.descricao ?? u.descricao}{u.conta?.pessoas?.nome ? <span style={{ color: "#666" }}> · {u.conta.pessoas.nome}</span> : null}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{data(u.data_aplicacao)}</td>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>{moeda(u.valor_aplicado)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "#555" }}>{u.conta ? (u.conta.status === "baixado" ? "Conta paga" : "Conta em aberto") : "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                        {u.modo
                          ? <button disabled={gravando} onClick={() => desfazer(u)} style={{ background: "none", border: "none", color: "#E24B4A", cursor: "pointer", fontSize: 12 }}>Desfazer</button>
                          : <span style={{ fontSize: 11, color: "#888" }}>feito pela baixa do CP</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dados?.situacao.bloqueio ? (
            <div style={{ background: "#FBF3E0", color: "#7A5A12", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>{dados.situacao.bloqueio}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#555", background: "#F4F6FA", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                {dados ? TEXTO_MODO[dados.situacao.modo] : "Carregando…"} A conta escolhida é usada inteira e passa para a Operação Gerencial Adiantamento para funcionário.
              </div>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pela descrição da conta (fornecedor, NF…)" aria-label="Buscar conta"
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, maxHeight: 340, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}></th><th style={th}>Conta</th><th style={th}>Fornecedor</th><th style={th}>Vencimento</th><th style={{ ...th, textAlign: "right" }}>Valor</th></tr></thead>
                  <tbody>
                    {carregando && <tr><td colSpan={5} style={{ ...td, color: "#888", textAlign: "center", padding: 16 }}>Carregando…</td></tr>}
                    {!carregando && dados?.titulos.length === 0 && (
                      <tr><td colSpan={5} style={{ ...td, color: "#888", textAlign: "center", padding: 16 }}>
                        Nenhuma conta em aberto que caiba no saldo do adiantamento{busca ? " com essa busca" : ""}. Só aparecem contas sem pagamento, fora de borderô, cartão e contrato.
                      </td></tr>
                    )}
                    {!carregando && dados?.titulos.map(t => (
                      <tr key={t.id} onClick={() => setEscolhida(t.id)} style={{ cursor: "pointer", background: escolhida === t.id ? "#D5E8F5" : undefined }}>
                        <td style={{ ...td, width: 28 }}><input type="radio" checked={escolhida === t.id} onChange={() => setEscolhida(t.id)} aria-label={`Escolher ${t.descricao ?? "conta"}`} /></td>
                        <td style={td}>{t.descricao ?? "—"}{t.fazenda_nome ? <div style={{ fontSize: 10, color: "#666" }}>{t.fazenda_nome}</div> : null}</td>
                        <td style={{ ...td, color: "#555" }}>{t.pessoas?.nome ?? "—"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", color: t.status === "vencido" ? "#E24B4A" : "#1a1a1a" }}>{data(t.data_vencimento)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{moeda(t.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onFechar} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#F4F6FA", color: "#555", fontSize: 13, cursor: "pointer" }}>Fechar</button>
          {!dados?.situacao.bloqueio && (
            <button disabled={!conta || gravando} onClick={usar}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: !conta || gravando ? "#9DB4CC" : "#C9921B", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !conta || gravando ? "default" : "pointer" }}>
              {gravando ? "Gravando…" : conta ? `Pagar ${moeda(conta.valor)} com o adiantamento` : "Escolha uma conta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
