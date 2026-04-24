"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";

interface FazendaItem {
  id: string;
  nome: string;
  municipio?: string;
  estado?: string;
  area_total_ha?: number;
}

export default function SeletorCliente() {
  const { userRole, selectFazenda } = useAuth();
  const router = useRouter();
  const [fazendas, setFazendas]   = useState<FazendaItem[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [busca,    setBusca]      = useState("");

  useEffect(() => {
    if (userRole === null) return; // ainda carregando
    if (userRole !== "raccotlo") {
      router.push("/");
      return;
    }
    supabase
      .from("fazendas")
      .select("id, nome, municipio, estado, area_total_ha")
      .eq("raccolto_acesso", true)
      .order("nome", { ascending: true })
      .then(({ data }) => {
        setFazendas(data ?? []);
        setLoading(false);
      });
  }, [userRole, router]);

  const lista = fazendas.filter(f =>
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.municipio ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#F0F4FA",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* Cabeçalho */}
      <div style={{
        background: "#fff", borderBottom: "0.5px solid #DDE2EE",
        padding: "14px 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/Logo_Arato.png" alt="Arato" style={{ height: 32 }} />
          <span style={{ fontSize: 13, color: "#888", fontWeight: 400 }}>
            Acesso interno Raccolto
          </span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            background: "none", border: "0.5px solid #D4DCE8",
            borderRadius: 6, padding: "5px 14px", cursor: "pointer",
            fontSize: 12, color: "#555",
          }}
        >
          Sair
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
          Selecionar cliente
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 28px" }}>
          Clientes que autorizaram o acesso da Raccolto
        </p>

        <input
          type="text"
          placeholder="Buscar por nome ou município..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", marginBottom: 24,
            border: "0.5px solid #D4DCE8", borderRadius: 8,
            fontSize: 13, outline: "none", boxSizing: "border-box",
            background: "#fff",
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
            {busca ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente autorizou o acesso ainda."}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}>
            {lista.map(f => (
              <button
                key={f.id}
                onClick={() => selectFazenda(f.id, f.nome)}
                style={{
                  background: "#fff", border: "0.5px solid #DDE2EE",
                  borderRadius: 12, padding: "20px 22px", cursor: "pointer",
                  textAlign: "left", transition: "box-shadow 0.15s, border-color 0.15s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(26,92,56,0.12)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#1A5C38";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#DDE2EE";
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "#D5E8F5", display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 12,
                  fontSize: 16, fontWeight: 700, color: "#1A4870",
                }}>
                  {f.nome.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
                  {f.nome}
                </div>
                {(f.municipio || f.estado) && (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {[f.municipio, f.estado].filter(Boolean).join(" — ")}
                  </div>
                )}
                {f.area_total_ha ? (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    {f.area_total_ha.toLocaleString("pt-BR")} ha
                  </div>
                ) : null}
                <div style={{
                  marginTop: 14, fontSize: 11, fontWeight: 600,
                  color: "#1A5C38", display: "flex", alignItems: "center", gap: 4,
                }}>
                  Acessar →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
