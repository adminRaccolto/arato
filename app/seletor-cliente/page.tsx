"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";

interface FazendaResumida {
  id: string;
  nome: string;
  municipio?: string;
  estado?: string;
  area_total_ha?: number;
}

interface ClienteItem {
  conta_id: string;
  conta_nome: string;
  produtor_nome: string | null;
  logo_url?: string;
  fazendas: FazendaResumida[];
  area_total: number;
}

function initiais(s: string) {
  const partes = s.trim().split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return s.substring(0, 2).toUpperCase();
}

export default function SeletorCliente() {
  const { userRole, selectFazenda } = useAuth();
  const router = useRouter();
  const [clientes,  setClientes]  = useState<ClienteItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [logoUrl,   setLogoUrl]   = useState("/logo_Arato_Nova.png");

  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoUrl(data.publicUrl);
  }, []);

  async function carregarClientes() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const res = await fetch("/api/fazenda/listar-clientes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setClientes(json.clientes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (userRole === null) return;
    if (userRole !== "raccotlo") { router.push("/"); return; }
    carregarClientes();
  }, [userRole, router]);

  const lista = clientes.filter(c => {
    const q = busca.toLowerCase();
    if (!q) return true;
    if ((c.produtor_nome ?? "").toLowerCase().includes(q)) return true;
    if (c.conta_nome.toLowerCase().includes(q)) return true;
    if (c.fazendas.some(f =>
      f.nome.toLowerCase().includes(q) ||
      (f.municipio ?? "").toLowerCase().includes(q) ||
      (f.estado ?? "").toLowerCase().includes(q)
    )) return true;
    return false;
  });

  // Clica no cliente → entra no contexto do cliente (conta_id)
  // A primeira fazenda é usada apenas como âncora inicial para compatibilidade
  function acessarCliente(c: ClienteItem) {
    if (c.fazendas.length === 0) return;
    const f = c.fazendas[0];
    if (c.logo_url) localStorage.setItem("raccotlo_cliente_logo", c.logo_url);
    else            localStorage.removeItem("raccotlo_cliente_logo");
    // Guarda conta_id do cliente para que o sistema exiba dados de TODAS as fazendas
    if (c.conta_id) localStorage.setItem("raccotlo_cliente_conta_id", c.conta_id);
    else            localStorage.removeItem("raccotlo_cliente_conta_id");
    selectFazenda(f.id, f.nome, c.produtor_nome);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FA", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{
        background: "#fff", borderBottom: "0.5px solid #DDE2EE",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoUrl} alt="Arato" style={{ height: 32 }} />
          <span style={{ fontSize: 13, color: "#888" }}>Acesso interno Raccolto</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/admin/clientes")}
            style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#1A4870", fontWeight: 600 }}
          >
            Gestão Arato →
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}
          >
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
          Selecionar cliente
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 24px" }}>
          {lista.length} cliente{lista.length !== 1 ? "s" : ""} com acesso Raccolto ativo
        </p>

        <input
          type="text"
          placeholder="Buscar por nome, fazenda ou município..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", marginBottom: 24,
            border: "0.5px solid #D4DCE8", borderRadius: 8,
            fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff",
          }}
        />

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>
            Carregando clientes...
          </div>
        ) : lista.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 60, color: "#888", fontSize: 13,
            background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE",
          }}>
            {busca
              ? "Nenhum cliente encontrado para essa busca."
              : <>Nenhum cliente com acesso ativo. <button onClick={() => router.push("/admin/clientes")} style={{ background: "none", border: "none", color: "#1A4870", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Ir para Gestão Arato →</button></>
            }
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {lista.map(c => {
              const nomeExibido = c.produtor_nome ?? c.conta_nome;
              const multiFazendas = c.fazendas.length > 1;

              return (
                <button
                  key={c.conta_id}
                  onClick={() => acessarCliente(c)}
                  style={{
                    background: "#fff",
                    border: "0.5px solid #DDE2EE",
                    borderRadius: 12,
                    padding: "16px",
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
                    width: "100%",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(26,92,56,0.12)";
                    e.currentTarget.style.borderColor = "#1A5C38";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                    e.currentTarget.style.borderColor = "#DDE2EE";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {/* Avatar + nome */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: "#D5E8F5", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#1A4870",
                    }}>
                      {initiais(nomeExibido)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {nomeExibido}
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {multiFazendas
                          ? `${c.fazendas.length} fazendas · ${c.area_total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ha`
                          : `${c.fazendas[0]?.nome ?? ""}${c.fazendas[0]?.municipio ? ` · ${c.fazendas[0].municipio}/${c.fazendas[0].estado ?? ""}` : ""}`
                        }
                      </div>
                    </div>
                  </div>

                  {/* Fazendas — pills */}
                  {multiFazendas && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                      {c.fazendas.slice(0, 3).map(f => (
                        <span key={f.id} style={{
                          fontSize: 10, padding: "2px 7px",
                          background: "#F4F6FA", color: "#555",
                          borderRadius: 99, border: "0.5px solid #DDE2EE",
                        }}>{f.nome}</span>
                      ))}
                      {c.fazendas.length > 3 && (
                        <span style={{ fontSize: 10, padding: "2px 7px", background: "#EEF3FA", color: "#1A4870", borderRadius: 99 }}>
                          +{c.fazendas.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1A5C38" }}>
                    Acessar →
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
