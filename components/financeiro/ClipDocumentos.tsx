"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

// Clipe de documentos vinculados a um lançamento de CP/CR. Os documentos só são buscados
// quando o clipe é clicado (uma consulta por linha ao abrir a tela seria N+1). Lista:
// DANFE (quando a NF do lançamento tem chave de acesso), NF, boleto e comprovante anexados.
type Doc = { label: string; url: string };

export default function ClipDocumentos({ origemTabela, lancamentoId, tipo, zIndex = 900 }: {
  origemTabela: "lancamentos" | "empresa_lancamentos";
  lancamentoId: string;
  tipo: "cp" | "cr";
  /** Camada da lista de anexos. Dentro de um popup, passar acima dele (ex.: 1500). */
  zIndex?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [carregando, setCarregando] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);

  async function abrir(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (aberto) { setAberto(false); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 260) });
    setAberto(true);
    setCarregando(true);
    try {
      const { data: lanc } = await supabase.from(origemTabela).select("nf_entrada_id").eq("id", lancamentoId).maybeSingle();
      const nfId = (lanc as { nf_entrada_id?: string | null } | null)?.nf_entrada_id ?? null;

      const lista: Doc[] = [];
      if (nfId) {
        const { data: nf } = await supabase.from("nf_entradas").select("chave_acesso, fazenda_id, numero").eq("id", nfId).maybeSingle();
        if (nf?.chave_acesso) {
          lista.push({
            label: `DANFE — NF ${nf.numero ?? ""}`,
            url: `/api/fiscal/danfe?chave=${encodeURIComponent(nf.chave_acesso)}&fazenda_id=${encodeURIComponent(nf.fazenda_id)}`,
          });
        }
      }

      const kinds: { k: "nf" | "boleto" | "comprovante"; label: string }[] = [
        { k: "nf", label: "Nota Fiscal anexada" },
        { k: "boleto", label: "Boleto / documento de pagamento" },
        { k: "comprovante", label: "Comprovante de pagamento" },
      ];
      for (const { k, label } of kinds) {
        const res = await fetch(`/api/storage/listar?entidade_tipo=lancamento_${tipo}_${k}&entidade_id=${encodeURIComponent(lancamentoId)}`);
        const json = await res.json() as { data?: { url: string | null; nome_original?: string }[] };
        for (const d of json.data ?? []) {
          if (d.url) lista.push({ label: `${label}${d.nome_original ? ` — ${d.nome_original}` : ""}`, url: d.url });
        }
      }
      setDocs(lista);
    } catch {
      setDocs([]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <button onClick={abrir} title="Documentos vinculados"
        style={{ padding: "4px 8px", fontSize: 13, cursor: "pointer", border: "0.5px solid #DDE2EE", borderRadius: 6, background: "#fff" }}>
        📎
      </button>
      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: zIndex }} />
          <div onClick={e => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 260, background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: zIndex + 1, padding: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", padding: "4px 6px 8px" }}>Documentos vinculados</div>
            {carregando && <div style={{ fontSize: 12, color: "#888", padding: "6px" }}>Carregando…</div>}
            {!carregando && docs.length === 0 && <div style={{ fontSize: 12, color: "#888", padding: "6px" }}>Nenhum documento vinculado.</div>}
            {!carregando && docs.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", padding: "7px 8px", fontSize: 12, color: "#0C447C", textDecoration: "none", borderRadius: 6 }}>
                📄 {d.label}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
