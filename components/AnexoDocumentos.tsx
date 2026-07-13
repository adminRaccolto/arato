"use client";
import { useState, useEffect, useRef } from "react";

interface Anexo {
  id: string;
  nome_original: string;
  storage_path: string;
  tamanho_bytes: number;
  mime_type: string | null;
  created_at: string;
  url: string | null;
}

interface Props {
  entidade_tipo: string;
  entidade_id: string;
  fazenda_id: string;
  label?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

function fmtSize(b: number) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function fmtStorage(b: number) {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (b >= 1024 * 1024)        return `${(b / 1024 / 1024).toFixed(0)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function iconeMime(mime: string | null) {
  if (!mime) return "📄";
  if (mime.startsWith("image/"))       return "🖼️";
  if (mime === "application/pdf")       return "📕";
  if (mime.includes("word"))            return "📝";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "📊";
  return "📄";
}

export default function AnexoDocumentos({ entidade_tipo, entidade_id, fazenda_id, label = "Documentos" }: Props) {
  const [anexos, setAnexos]         = useState<Anexo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [usadoBytes, setUsado]      = useState(0);
  const [cotaBytes, setCota]        = useState(0);
  const [planId, setPlanId]         = useState("essencial");
  const [uploading, setUploading]   = useState(false);
  const [erro, setErro]             = useState<string | null>(null);
  const [excluindo, setExcluindo]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/storage/listar?entidade_tipo=${encodeURIComponent(entidade_tipo)}&entidade_id=${encodeURIComponent(entidade_id)}`
      );
      const j = await r.json();
      if (j.data) {
        setAnexos(j.data);
        setUsado(j.usado_bytes ?? 0);
        setCota(j.cota_bytes ?? 0);
        setPlanId(j.plano_id ?? "essencial");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (entidade_id) carregar(); }, [entidade_id]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErro(`Arquivo muito grande: ${fmtSize(file.size)}. Máximo: 5 MB.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setErro(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file",          file);
      fd.append("entidade_tipo", entidade_tipo);
      fd.append("entidade_id",   entidade_id);
      fd.append("fazenda_id",    fazenda_id);
      const r = await fetch("/api/storage/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.erro ?? "Erro no upload");
      } else {
        await carregar();
      }
    } catch {
      setErro("Erro de rede ao enviar arquivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleExcluir(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    setExcluindo(id);
    try {
      const r = await fetch(`/api/storage/excluir?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) setErro(j.erro ?? "Erro ao excluir");
      else await carregar();
    } finally {
      setExcluindo(null);
    }
  }

  const semStorage = planId === "essencial";
  const cotaPct    = cotaBytes > 0 ? Math.min(100, (usadoBytes / cotaBytes) * 100) : 0;
  const cotaCheia  = cotaBytes > 0 && usadoBytes >= cotaBytes;

  const barColor = cotaPct >= 90 ? "#E24B4A" : cotaPct >= 70 ? "#EF9F27" : "#1A4870";

  return (
    <div style={{ padding: "4px 0" }}>

      {/* Barra de uso */}
      {!semStorage && cotaBytes > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#888" }}>Armazenamento usado</span>
            <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>
              {fmtStorage(usadoBytes)} / {fmtStorage(cotaBytes)}
            </span>
          </div>
          <div style={{ background: "#DDE2EE", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{ background: barColor, height: "100%", width: `${cotaPct}%`, transition: "width .3s" }} />
          </div>
        </div>
      )}

      {/* Aviso plano sem storage */}
      {semStorage && (
        <div style={{
          background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8,
          padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#7A5A12"
        }}>
          <strong>Plano Essencial</strong> não inclui armazenamento de documentos.<br />
          Faça upgrade para o plano <strong>Gestão</strong> (1 GB) ou <strong>Performance</strong> (3 GB).
        </div>
      )}

      {/* Aviso cota esgotada */}
      {!semStorage && cotaCheia && (
        <div style={{
          background: "#FEF2F2", border: "0.5px solid #E24B4A", borderRadius: 8,
          padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#991B1B"
        }}>
          <strong>Cota esgotada.</strong> Entre em contato com a Raccolto para ampliar o espaço disponível.
        </div>
      )}

      {/* Erro de upload */}
      {erro && (
        <div style={{
          background: "#FEF2F2", border: "0.5px solid #E24B4A", borderRadius: 8,
          padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#991B1B",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          {erro}
          <button onClick={() => setErro(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#991B1B", fontSize: 14, padding: 0 }}>×</button>
        </div>
      )}

      {/* Botão de upload */}
      {!semStorage && !cotaCheia && (
        <div style={{ marginBottom: 14 }}>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleUpload}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.xml" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              background: uploading ? "#DDE2EE" : "#1A4870", color: "#fff",
              border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 12,
              fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer"
            }}
          >
            {uploading ? "Enviando…" : "↑ Anexar arquivo"}
          </button>
          <span style={{ fontSize: 11, color: "#888", marginLeft: 10 }}>
            PDF, Word, Excel, imagens — máx. 5 MB por arquivo
          </span>
        </div>
      )}

      {/* Lista de anexos */}
      {loading ? (
        <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>Carregando…</div>
      ) : anexos.length === 0 ? (
        <div style={{ fontSize: 12, color: "#aaa", padding: "12px 0", textAlign: "center", background: "#F4F6FA", borderRadius: 8 }}>
          {semStorage ? "Nenhum documento disponível" : "Nenhum documento anexado"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {anexos.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#F4F6FA", borderRadius: 8, padding: "8px 12px",
              border: "0.5px solid #DDE2EE"
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{iconeMime(a.mime_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.nome_original}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {fmtSize(a.tamanho_bytes)} · {new Date(a.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11, fontWeight: 600, color: "#1A4870",
                      background: "#D5E8F5", border: "none", borderRadius: 5,
                      padding: "4px 10px", textDecoration: "none", cursor: "pointer"
                    }}
                  >
                    Abrir
                  </a>
                )}
                <button
                  onClick={() => handleExcluir(a.id, a.nome_original)}
                  disabled={excluindo === a.id}
                  style={{
                    fontSize: 11, fontWeight: 600, color: "#E24B4A",
                    background: "#FEF2F2", border: "none", borderRadius: 5,
                    padding: "4px 10px", cursor: excluindo === a.id ? "not-allowed" : "pointer"
                  }}
                >
                  {excluindo === a.id ? "…" : "Excluir"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
