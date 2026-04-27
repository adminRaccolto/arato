"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/components/AuthProvider";
import { listarProdutores } from "@/lib/db";
import type { Produtor } from "@/lib/supabase";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type TipoDoc   = "NFe" | "CTe" | "NFSe";
type Situacao  = "pendente" | "ciencia" | "confirmado" | "desconhecido" | "nao_realizada" | "importada";

interface NFeItem {
  id:           string;
  chave:        string;
  numero:       number;
  serie:        string;
  tipo:         TipoDoc;
  fornecedor:   string;
  cnpj_cpf:     string;
  ie:           string;
  data_emissao: string;
  valor:        number;
  nsu:          number;
  situacao:     Situacao;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
function gerarMock(cpf_cnpj: string): NFeItem[] {
  const doc = cpf_cnpj.replace(/\D/g, "");
  return [
    { id:"1", chave:`5126040${doc.slice(0,7)}001395500100004605410026`, numero:46054, serie:"1", tipo:"NFe", fornecedor:"T R DA COSTA LEITE LTDA",            cnpj_cpf:"34.703.826/0001-39", ie:"137818300", data_emissao:"02/04/2026", valor:466.45,    nsu:45908, situacao:"importada"   },
    { id:"2", chave:`5126040${doc.slice(0,7)}001395500100004622100261`, numero:46221, serie:"1", tipo:"NFe", fornecedor:"T R DA COSTA LEITE LTDA",            cnpj_cpf:"34.703.826/0001-39", ie:"137818300", data_emissao:"07/04/2026", valor:1055.31,   nsu:45923, situacao:"importada"   },
    { id:"3", chave:`5126040${doc.slice(0,7)}001395500100004667210026`, numero:46672, serie:"1", tipo:"NFe", fornecedor:"T R DA COSTA LEITE LTDA",            cnpj_cpf:"34.703.826/0001-39", ie:"137818300", data_emissao:"17/04/2026", valor:84.77,     nsu:46020, situacao:"importada"   },
    { id:"4", chave:`5126040${doc.slice(0,7)}007654975000182655500100`, numero:49774, serie:"1", tipo:"NFe", fornecedor:"ECODIESEL COMERCIO DE COMBUSTIVEIS", cnpj_cpf:"07.654.975/0001-82", ie:"137149220", data_emissao:"11/04/2026", valor:34700.00,  nsu:45989, situacao:"importada"   },
    { id:"5", chave:`5126030${doc.slice(0,7)}050209860002665500100005`, numero:51771, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"31/03/2026", valor:169.97,    nsu:45892, situacao:"importada"   },
    { id:"6", chave:`5126030${doc.slice(0,7)}050209860002665500100005`, numero:51780, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"31/03/2026", valor:1.53,      nsu:45907, situacao:"importada"   },
    { id:"7", chave:`5126080${doc.slice(0,7)}050209860002665500100005`, numero:52329, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"08/04/2026", valor:3661.67,   nsu:45983, situacao:"ciencia"     },
    { id:"8", chave:`5126040${doc.slice(0,7)}050209860002665500100005`, numero:52456, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"09/04/2026", valor:3661.67,   nsu:46001, situacao:"ciencia"     },
    { id:"9", chave:`5126100${doc.slice(0,7)}050209860002665500100005`, numero:52517, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"10/04/2026", valor:660.58,    nsu:45993, situacao:"pendente"    },
    { id:"10",chave:`5126140${doc.slice(0,7)}050209860002665500100005`, numero:52757, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"14/04/2026", valor:84.64,     nsu:45999, situacao:"pendente"    },
    { id:"11",chave:`5126160${doc.slice(0,7)}050209860002665500100005`, numero:52955, serie:"1", tipo:"NFe", fornecedor:"DECORFIOS COMERCIO DE MATERIAIS",    cnpj_cpf:"05.020.986/0002-66", ie:"136372112", data_emissao:"16/04/2026", valor:953.32,    nsu:46023, situacao:"pendente"    },
    { id:"12",chave:`5126300${doc.slice(0,7)}100372220001715500100005`, numero:56445, serie:"1", tipo:"NFe", fornecedor:"KNC MATERIAIS DE CONSTRUCAO LT",     cnpj_cpf:"00.103.722/0001-71", ie:"131545868", data_emissao:"30/03/2026", valor:414.72,    nsu:45894, situacao:"importada"   },
    { id:"13",chave:`5126140${doc.slice(0,7)}100372220001715500100005`, numero:56553, serie:"1", tipo:"NFe", fornecedor:"KNC MATERIAIS DE CONSTRUCAO LT",     cnpj_cpf:"00.103.722/0001-71", ie:"131545868", data_emissao:"14/04/2026", valor:220.00,    nsu:45994, situacao:"importada"   },
    { id:"14",chave:`5126060${doc.slice(0,7)}249787770001395500100006`, numero:62957, serie:"1", tipo:"NFe", fornecedor:"FACCIO E FACCIO LTDA",               cnpj_cpf:"24.978.777/0001-93", ie:"130574155", data_emissao:"06/04/2026", valor:60.00,     nsu:45925, situacao:"pendente"    },
    { id:"15",chave:`5126130${doc.slice(0,7)}083360020001685500900007`, numero:74931, serie:"9", tipo:"NFe", fornecedor:"9 - NOVA MUTUM COM ARTEF BORRACHA", cnpj_cpf:"08.336.002/0001-68", ie:"133263487", data_emissao:"13/04/2026", valor:425.08,    nsu:45992, situacao:"pendente"    },
    { id:"16",chave:`5126170${doc.slice(0,7)}134296710001505500100008`, numero:81946, serie:"1", tipo:"NFe", fornecedor:"M.M. COMERCIO DE FERRO E ACO LT",   cnpj_cpf:"13.429.671/0001-50", ie:"134296710", data_emissao:"17/04/2026", valor:5600.00,   nsu:46015, situacao:"pendente"    },
    { id:"17",chave:`5126100${doc.slice(0,7)}113579210001225500100011`, numero:89264, serie:"1", tipo:"NFe", fornecedor:"FN COM. DE PECAS E IMP. AGRICOLA",  cnpj_cpf:"11.357.921/0001-22", ie:"133807282", data_emissao:"10/04/2026", valor:7220.00,   nsu:45928, situacao:"pendente"    },
    { id:"18",chave:`5126100${doc.slice(0,7)}113579210001225500100011`, numero:89385, serie:"1", tipo:"NFe", fornecedor:"FN COM. DE PECAS E IMP. AGRICOLA",  cnpj_cpf:"11.357.921/0001-22", ie:"133807282", data_emissao:"10/04/2026", valor:2350.00,   nsu:45996, situacao:"pendente"    },
    { id:"19",chave:`5126140${doc.slice(0,7)}113579210001225500100011`, numero:89421, serie:"1", tipo:"NFe", fornecedor:"FN COM. DE PECAS E IMP. AGRICOLA",  cnpj_cpf:"11.357.921/0001-22", ie:"133807282", data_emissao:"14/04/2026", valor:1600.00,   nsu:45985, situacao:"pendente"    },
    { id:"20",chave:`5126170${doc.slice(0,7)}113579210001225500100011`, numero:89535, serie:"1", tipo:"NFe", fornecedor:"FN COM. DE PECAS E IMP. AGRICOLA",  cnpj_cpf:"11.357.921/0001-22", ie:"133807282", data_emissao:"17/04/2026", valor:2035.00,   nsu:46018, situacao:"pendente"    },
    { id:"21",chave:`5126070${doc.slice(0,7)}031302050000180096611100`, numero:96611, serie:"1", tipo:"NFe", fornecedor:"CENCI E GREGORY LTDA - ME",          cnpj_cpf:"03.130.205/0000-18", ie:"131832237", data_emissao:"07/04/2026", valor:178.00,    nsu:45991, situacao:"pendente"    },
    { id:"22",chave:`5126070${doc.slice(0,7)}010444140000639550010001`, numero:122235,serie:"1", tipo:"NFe", fornecedor:"S.R. PECAS AGRICOLAS LTDA",          cnpj_cpf:"01.044.414/0000-63", ie:"136619061", data_emissao:"07/04/2026", valor:502.00,    nsu:45924, situacao:"pendente"    },
    { id:"23",chave:`5126170${doc.slice(0,7)}825633210001695500400001`, numero:166109,serie:"4", tipo:"NFe", fornecedor:"INDUSTRIAL PAGE LTDA",               cnpj_cpf:"82.563.321/0001-69", ie:"250259548", data_emissao:"17/04/2026", valor:90000.00,  nsu:46022, situacao:"pendente"    },
    { id:"24",chave:`5126300${doc.slice(0,7)}169681900052155001000044`, numero:440158,serie:"1", tipo:"NFe", fornecedor:"AGRO BAGGIO MAQUINAS AGRICOLA",      cnpj_cpf:"16.968.190/0052-15", ie:"133640337", data_emissao:"30/03/2026", valor:370.56,    nsu:45897, situacao:"importada"   },
    { id:"25",chave:`5126300${doc.slice(0,7)}169681900052155001000044`, numero:440201,serie:"1", tipo:"NFe", fornecedor:"AGRO BAGGIO MAQUINAS AGRICOLA",      cnpj_cpf:"16.968.190/0052-15", ie:"133640337", data_emissao:"30/03/2026", valor:4238.19,   nsu:45900, situacao:"importada"   },
    { id:"26",chave:`5126060${doc.slice(0,7)}265526870001335500100007`, numero:755775,serie:"1", tipo:"NFe", fornecedor:"CADORE, BIDOIA E CIA LTDA",           cnpj_cpf:"26.552.687/0001-33", ie:"133802078", data_emissao:"06/04/2026", valor:143.00,    nsu:45929, situacao:"pendente"    },
    { id:"27",chave:`5126170${doc.slice(0,7)}265526870001335500100007`, numero:755775,serie:"1", tipo:"CTe", fornecedor:"TRANSPORTADORA ROCHA LTDA",           cnpj_cpf:"12.345.678/0001-90", ie:"",          data_emissao:"15/04/2026", valor:1850.00,   nsu:46030, situacao:"pendente"    },
    { id:"28",chave:`5126220${doc.slice(0,7)}265526870001335500100007`, numero:89002, serie:"1", tipo:"NFSe",fornecedor:"CONSULTORIA AGRO DIGITAL ME",         cnpj_cpf:"98.765.432/0001-10", ie:"",          data_emissao:"22/04/2026", valor:3500.00,   nsu:46055, situacao:"pendente"    },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const COR_SITUACAO: Record<Situacao, { bg: string; color: string; label: string }> = {
  pendente:      { bg: "#FFF3CD", color: "#856404",  label: "Pendente"        },
  ciencia:       { bg: "#D1ECF1", color: "#0C5460",  label: "Ciência"         },
  confirmado:    { bg: "#D4EDDA", color: "#155724",  label: "Confirmado"      },
  desconhecido:  { bg: "#F8D7DA", color: "#721C24",  label: "Desconhecido"    },
  nao_realizada: { bg: "#E2E3E5", color: "#383D41",  label: "Op. Não Real."   },
  importada:     { bg: "#D5E8F5", color: "#1A4870",  label: "Importada"       },
};

function formatDoc(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ManifestacaoPage() {
  const { fazendaId } = useAuth();

  // Produtores
  const [produtores,        setProdutores]        = useState<Produtor[]>([]);
  const [produtorSelecionado, setProdutorSelecionado] = useState<Produtor | null>(null);
  const [showSeletor,       setShowSeletor]       = useState(false);

  // Notas
  const [notas,    setNotas]    = useState<NFeItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  // Filtros
  const [dtInicio, setDtInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dtFim,    setDtFim]    = useState(() => new Date().toISOString().slice(0, 10));
  const [filtroTipo, setFiltroTipo]     = useState<"" | TipoDoc>("");
  const [filtroSit,  setFiltroSit]      = useState<"" | Situacao>("");
  const [busca,      setBusca]          = useState("");

  // Modal importar
  const [notaImportar, setNotaImportar] = useState<NFeItem | null>(null);

  // ── Carregar produtores ──────────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    listarProdutores(fazendaId).then(data => {
      setProdutores(data);
      if (data.length === 1) {
        setProdutorSelecionado(data[0]);
      } else if (data.length > 1) {
        setShowSeletor(true);
      }
    }).catch(() => {});
  }, [fazendaId]);

  // ── Buscar notas (mock SIEG) ─────────────────────────────────────────────
  const buscarNotas = useCallback(() => {
    if (!produtorSelecionado) return;
    setLoading(true);
    setTimeout(() => {
      setNotas(gerarMock(produtorSelecionado.cpf_cnpj ?? "00000000000000"));
      setSelecionadas(new Set());
      setLoading(false);
    }, 800);
  }, [produtorSelecionado]);

  useEffect(() => {
    if (produtorSelecionado) buscarNotas();
  }, [produtorSelecionado, buscarNotas]);

  // ── Filtros aplicados ────────────────────────────────────────────────────
  const notasFiltradas = notas.filter(n => {
    if (filtroTipo && n.tipo !== filtroTipo) return false;
    if (filtroSit  && n.situacao !== filtroSit) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!n.fornecedor.toLowerCase().includes(q) &&
          !n.cnpj_cpf.includes(q) &&
          !String(n.numero).includes(q) &&
          !n.chave.includes(q)) return false;
    }
    return true;
  });

  // ── Ação de manifestação ─────────────────────────────────────────────────
  function manifestar(ids: string[], situacao: Situacao) {
    setNotas(prev => prev.map(n => ids.includes(n.id) ? { ...n, situacao } : n));
    setSelecionadas(new Set());
  }

  function toggleSelecionada(id: string) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTodas() {
    if (selecionadas.size === notasFiltradas.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(notasFiltradas.map(n => n.id)));
    }
  }

  // ── Contadores ───────────────────────────────────────────────────────────
  const counts = notas.reduce((acc, n) => {
    acc[n.situacao] = (acc[n.situacao] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalPendente = (counts.pendente ?? 0) + (counts.ciencia ?? 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />

      {/* ── Modal seletor de produtor ── */}
      {showSeletor && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 32, width: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
              Selecionar Produtor
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
              Esta fazenda possui mais de um produtor. Selecione qual CPF/CNPJ será consultado no SIEG.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {produtores.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProdutorSelecionado(p); setShowSeletor(false); }}
                  style={{
                    background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 10,
                    padding: "14px 18px", cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 14,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A4870")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#DDE2EE")}
                >
                  <div style={{
                    width: 40, height: 40, background: "#D5E8F5", borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: "#1A4870", flexShrink: 0,
                  }}>
                    {p.tipo === "pf" ? "PF" : "PJ"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{p.nome}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {p.tipo === "pf" ? "CPF" : "CNPJ"}: {formatDoc(p.cpf_cnpj ?? "—")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal importar ── */}
      {notaImportar && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 32, width: 520, boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 20 }}>
              Importar NF para o Sistema
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                ["Fornecedor",  notaImportar.fornecedor],
                ["CNPJ/CPF",   formatDoc(notaImportar.cnpj_cpf)],
                ["Nº Nota",    `${notaImportar.numero} / Série ${notaImportar.serie}`],
                ["Emissão",    notaImportar.data_emissao],
                ["Tipo",       notaImportar.tipo],
                ["Valor Total",formatMoeda(notaImportar.valor)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Chave de Acesso</div>
              <div style={{
                background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 6,
                padding: "8px 10px", fontSize: 11, color: "#555",
                wordBreak: "break-all", lineHeight: 1.6,
              }}>
                {notaImportar.chave}
              </div>
            </div>

            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#7D5A10" }}>
              A importação irá criar uma <strong>NF de Entrada</strong> em Compras & Estoque com os dados desta nota.
              Você poderá revisar e ajustar antes de processar.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setNotaImportar(null)}
                style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "9px 20px", fontSize: 13, cursor: "pointer", color: "#555" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  manifestar([notaImportar.id], "importada");
                  setNotaImportar(null);
                }}
                style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Confirmar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Manifestação do Destinatário
            </h1>
            {produtorSelecionado && (
              <div style={{ fontSize: 13, color: "#666", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{produtorSelecionado.nome}</span>
                <span style={{ color: "#ccc" }}>·</span>
                <span>{produtorSelecionado.tipo === "pf" ? "CPF" : "CNPJ"}: {formatDoc(produtorSelecionado.cpf_cnpj ?? "—")}</span>
                {produtores.length > 1 && (
                  <button
                    onClick={() => setShowSeletor(true)}
                    style={{ background: "none", border: "none", color: "#1A4870", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >
                    trocar
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={buscarNotas}
              disabled={!produtorSelecionado || loading}
              style={{
                background: "#1A4870", color: "#fff", border: "none", borderRadius: 8,
                padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                opacity: (!produtorSelecionado || loading) ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {loading ? "Consultando..." : "↻ Verificar Novas Notas SIEG"}
            </button>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
          {(["pendente","ciencia","confirmado","desconhecido","nao_realizada","importada"] as Situacao[]).map(s => {
            const c = COR_SITUACAO[s];
            return (
              <div
                key={s}
                onClick={() => setFiltroSit(filtroSit === s ? "" : s)}
                style={{
                  background: filtroSit === s ? c.bg : "#fff",
                  border: `0.5px solid ${filtroSit === s ? c.color : "#DDE2EE"}`,
                  borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{counts[s] ?? 0}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{c.label}</div>
              </div>
            );
          })}
        </div>

        {/* ── Alerta pendentes ── */}
        {totalPendente > 0 && (
          <div style={{
            background: "#FFF3CD", border: "0.5px solid #C9921B", borderRadius: 8,
            padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#856404",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            ⚠️ <strong>{totalPendente} nota{totalPendente > 1 ? "s" : ""}</strong> aguardando manifestação.
            O prazo legal para manifestação é de <strong>30 dias</strong> após a emissão.
          </div>
        )}

        {/* ── Ações em lote ── */}
        {selecionadas.size > 0 && (
          <div style={{
            background: "#fff", border: "0.5px solid #1A4870", borderRadius: 10,
            padding: "12px 16px", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1A4870", marginRight: 4 }}>
              {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}:
            </span>
            {[
              { sit: "ciencia"      as Situacao, label: "Ciência",          bg: "#D1ECF1", color: "#0C5460" },
              { sit: "confirmado"   as Situacao, label: "Confirmação",      bg: "#D4EDDA", color: "#155724" },
              { sit: "desconhecido" as Situacao, label: "Desconhecimento",  bg: "#F8D7DA", color: "#721C24" },
              { sit: "nao_realizada"as Situacao, label: "Op. Não Realizada",bg: "#E2E3E5", color: "#383D41" },
            ].map(a => (
              <button
                key={a.sit}
                onClick={() => manifestar([...selecionadas], a.sit)}
                style={{
                  background: a.bg, color: a.color, border: "none", borderRadius: 6,
                  padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => setSelecionadas(new Set())}
              style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 12, marginLeft: "auto" }}
            >
              Limpar seleção
            </button>
          </div>
        )}

        {/* ── Filtros ── */}
        <div style={{
          background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10,
          padding: "14px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>De</span>
            <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none" }} />
            <span style={{ fontSize: 12, color: "#666" }}>até</span>
            <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none" }} />
          </div>

          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as "" | TipoDoc)}
            style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 10px", fontSize: 12, outline: "none", color: "#555" }}>
            <option value="">Todos os tipos</option>
            <option value="NFe">NF-e</option>
            <option value="CTe">CT-e</option>
            <option value="NFSe">NFS-e</option>
          </select>

          <select value={filtroSit} onChange={e => setFiltroSit(e.target.value as "" | Situacao)}
            style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 10px", fontSize: 12, outline: "none", color: "#555" }}>
            <option value="">Todas as situações</option>
            <option value="pendente">Pendente</option>
            <option value="ciencia">Ciência</option>
            <option value="confirmado">Confirmado</option>
            <option value="desconhecido">Desconhecido</option>
            <option value="nao_realizada">Op. Não Realizada</option>
            <option value="importada">Importada</option>
          </select>

          <input
            type="text" placeholder="Buscar fornecedor, CNPJ ou chave..." value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 12px", fontSize: 12, outline: "none", flex: 1, minWidth: 240 }}
          />

          {(filtroTipo || filtroSit || busca) && (
            <button onClick={() => { setFiltroTipo(""); setFiltroSit(""); setBusca(""); }}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12 }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>

        {/* ── Tabela ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: "#999", fontSize: 13 }}>
              Consultando notas no SIEG...
            </div>
          ) : !produtorSelecionado ? (
            <div style={{ padding: 60, textAlign: "center", color: "#999", fontSize: 13 }}>
              Selecione um produtor para consultar as notas.
            </div>
          ) : notasFiltradas.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "#999", fontSize: 13 }}>
              Nenhuma nota encontrada para os filtros aplicados.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE" }}>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: 36 }}>
                    <input type="checkbox"
                      checked={selecionadas.size === notasFiltradas.length && notasFiltradas.length > 0}
                      onChange={toggleTodas}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {["Situação","Tipo","Nota","Sér.","Fornecedor","CNPJ/CPF","Emissão","Valor Total","NSU","Ações"].map(h => (
                    <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.map((n, i) => {
                  const c = COR_SITUACAO[n.situacao];
                  const sel = selecionadas.has(n.id);
                  return (
                    <tr
                      key={n.id}
                      style={{
                        borderBottom: "0.5px solid #f0f0f0",
                        background: sel ? "#EEF4FF" : (i % 2 === 0 ? "#fff" : "#FAFBFC"),
                      }}
                    >
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleSelecionada(n.id)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          background: c.bg, color: c.color, borderRadius: 99,
                          padding: "3px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                        }}>
                          {c.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          background: n.tipo === "NFe" ? "#D5E8F5" : n.tipo === "CTe" ? "#FBF3E0" : "#F0E6FF",
                          color:      n.tipo === "NFe" ? "#1A4870" : n.tipo === "CTe" ? "#7D5A10" : "#5B2D8E",
                          borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700,
                        }}>
                          {n.tipo}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1a1a" }}>{n.numero}</td>
                      <td style={{ padding: "8px 10px", color: "#555" }}>{n.serie}</td>
                      <td style={{ padding: "8px 10px", maxWidth: 220 }}>
                        <div style={{ fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {n.fornecedor}
                        </div>
                        {n.ie && <div style={{ fontSize: 11, color: "#888" }}>IE: {n.ie}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#555", whiteSpace: "nowrap" }}>{formatDoc(n.cnpj_cpf)}</td>
                      <td style={{ padding: "8px 10px", color: "#555", whiteSpace: "nowrap" }}>{n.data_emissao}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                        {formatMoeda(n.valor)}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#888", fontSize: 11 }}>{n.nsu}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                          {n.situacao === "pendente" && (
                            <button
                              onClick={() => manifestar([n.id], "ciencia")}
                              title="Ciência da Operação"
                              style={{ background: "#D1ECF1", color: "#0C5460", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              Ciência
                            </button>
                          )}
                          {(n.situacao === "pendente" || n.situacao === "ciencia") && (
                            <>
                              <button
                                onClick={() => manifestar([n.id], "confirmado")}
                                title="Confirmação da Operação"
                                style={{ background: "#D4EDDA", color: "#155724", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => manifestar([n.id], "desconhecido")}
                                title="Desconhecimento da Operação"
                                style={{ background: "#F8D7DA", color: "#721C24", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                Desc.
                              </button>
                              <button
                                onClick={() => manifestar([n.id], "nao_realizada")}
                                title="Operação Não Realizada"
                                style={{ background: "#E2E3E5", color: "#383D41", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                N/R
                              </button>
                            </>
                          )}
                          {(n.situacao === "confirmado" || n.situacao === "ciencia") && n.situacao !== "importada" && (
                            <button
                              onClick={() => setNotaImportar(n)}
                              title="Importar para o sistema"
                              style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              Importar
                            </button>
                          )}
                          {n.situacao === "importada" && (
                            <span style={{ fontSize: 11, color: "#1A4870", fontWeight: 600 }}>✓ No sistema</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Footer da tabela */}
          {notasFiltradas.length > 0 && (
            <div style={{
              padding: "10px 16px", borderTop: "0.5px solid #DDE2EE",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 12, color: "#666", background: "#FAFBFC",
            }}>
              <span>{notasFiltradas.length} nota{notasFiltradas.length > 1 ? "s" : ""} exibida{notasFiltradas.length > 1 ? "s" : ""}</span>
              <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
                Total: {formatMoeda(notasFiltradas.reduce((s, n) => s + n.valor, 0))}
              </span>
            </div>
          )}
        </div>

        {/* Nota SIEG */}
        <div style={{ marginTop: 12, fontSize: 11, color: "#aaa", textAlign: "center" }}>
          Dados simulados — integração SIEG em desenvolvimento. NSU e chaves são exemplos.
        </div>
      </div>
    </div>
  );
}
