"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Pendente = { nome: string; cpf_cnpj: string; situacao?: string; motivo?: string };
type Situacao = {
  rotina: { ativa: boolean; ultima_execucao?: string | null; ultimo_resultado?: { ibge?: number; receita?: number; fonte_indisponivel?: boolean } | null };
  total: number; sem_ibge: number; pendente_ibge: number; pendente_receita: number; sem_como_resolver: number;
  nao_ativas: Pendente[]; divergentes: Pendente[];
};
type Previa = { ibge: number; receita: number; receita_sem_mudanca: number; divergentes: number; fonte_indisponivel: boolean; exemplos: { nome: string; origem: string; campos: Record<string, unknown> }[] };

async function chamar(metodo: "GET" | "POST", corpo?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/completar-pessoas", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const celula: React.CSSProperties = { padding: "6px 10px", borderBottom: "0.5px solid var(--border)", textAlign: "left", verticalAlign: "top" };
const ORIGEM: Record<string, string> = { cep: "CEP", cidade: "Cidade", receita: "Receita" };

export default function CompletarPessoas() {
  const [sit, setSit] = useState<Situacao | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try { setSit(await chamar("GET")); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function acao(fn: () => Promise<void>) {
    setOcupado(true); setErro("");
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  }
  const botao = (primario: boolean): React.CSSProperties => ({
    whiteSpace: "nowrap", padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: ocupado ? "not-allowed" : "pointer", opacity: ocupado ? 0.6 : 1,
    border: primario ? "none" : "0.5px solid var(--border)", background: primario ? "#1A4870" : "var(--bg-card)", color: primario ? "#fff" : "var(--text-1)",
  });

  return (
    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)", marginBottom: 6 }}>Completar cadastros de pessoas</div>
      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, maxWidth: 760 }}>
        Faz em todos os clientes o mesmo que o botão Buscar: código IBGE pelo CEP ou pela cidade e, para CNPJ, os dados da Receita.
        Só preenche campo vazio. A situação cadastral acompanha a Receita. Cadastro novo é completado sozinho; os antigos entram quando a rotina é ligada, em lotes a cada 15 minutos.
      </div>

      {erro && <div style={{ marginTop: 12, fontSize: 13, color: "#A93226" }}>{erro}</div>}

      {sit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 16, fontSize: 13, color: "var(--text-2)" }}>
          <span>Cadastros: <strong>{sit.total}</strong></span>
          <span>Sem IBGE: <strong>{sit.sem_ibge}</strong></span>
          <span>IBGE a tentar: <strong>{sit.pendente_ibge}</strong></span>
          <span>CNPJs a consultar: <strong>{sit.pendente_receita}</strong></span>
          <span>Sem CEP, cidade ou CNPJ: <strong>{sit.sem_como_resolver}</strong></span>
        </div>
      )}
      {sit && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
          Rotina {sit.rotina.ativa ? "ligada" : "desligada"}
          {sit.rotina.ultima_execucao ? ` · último lote em ${new Date(sit.rotina.ultima_execucao).toLocaleString("pt-BR")}: ${sit.rotina.ultimo_resultado?.ibge ?? 0} IBGE, ${sit.rotina.ultimo_resultado?.receita ?? 0} pela Receita` : ""}
          {sit.rotina.ultimo_resultado?.fonte_indisponivel ? " · consulta de CNPJ pausada até o próximo lote" : ""}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button data-arato-button="secondary" disabled={ocupado} style={botao(false)} onClick={() => acao(async () => { setPrevia(await chamar("POST", { acao: "previa" })); })}>
          {ocupado ? "Consultando…" : "Ver prévia"}
        </button>
        {sit?.rotina.ativa ? (
          <button data-arato-button="secondary" disabled={ocupado} style={botao(false)} onClick={() => acao(async () => { await chamar("POST", { acao: "parar" }); await carregar(); })}>Parar rotina</button>
        ) : (
          <button data-arato-button="primary" disabled={ocupado || !previa} title={previa ? undefined : "Veja a prévia primeiro"} style={botao(true)}
            onClick={() => acao(async () => { if (!window.confirm("Ligar a rotina para os cadastros antigos? Ela grava só campos vazios, em lotes a cada 15 minutos.")) return; await chamar("POST", { acao: "iniciar" }); await carregar(); })}>
            Ligar rotina
          </button>
        )}
        <button data-arato-button="secondary" disabled={ocupado} style={botao(false)} onClick={() => acao(carregar)}>↻ Atualizar</button>
      </div>

      {previa && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>
            Prévia em amostra, nada foi gravado: {previa.ibge} com IBGE, {previa.receita} com dados da Receita, {previa.receita_sem_mudanca} sem nada a preencher, {previa.divergentes} com CEP de outra cidade{previa.fonte_indisponivel ? ". A consulta de CNPJ ficou indisponível durante a amostra" : ""}.
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", border: "0.5px solid var(--border)", borderRadius: 8 }}>
            <table data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["Pessoa", "Fonte", "O que preenche"].map(h => <th key={h} style={{ ...celula, fontWeight: 600, color: "var(--text-2)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {previa.exemplos.map((x, i) => (
                  <tr key={i}>
                    <td style={celula}>{x.nome}</td>
                    <td style={celula}>{ORIGEM[x.origem] ?? x.origem}</td>
                    <td style={celula}>{Object.entries(x.campos).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sit && sit.nao_ativas.length > 0 && (
        <details style={{ marginTop: 16, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text-1)" }}>Empresas não ativas na Receita ({sit.nao_ativas.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-2)" }}>
            {sit.nao_ativas.map((p, i) => <li key={i}>{p.nome} · {p.cpf_cnpj} · {p.situacao}</li>)}
          </ul>
        </details>
      )}
      {sit && sit.divergentes.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text-1)" }}>CEP de outra cidade, para conferir ({sit.divergentes.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-2)" }}>
            {sit.divergentes.map((p, i) => <li key={i}>{p.nome} · {p.cpf_cnpj} · {p.motivo}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
