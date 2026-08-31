"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";

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

export default function BpoSeletorCliente() {
  const { userRole, isBpo, selectFazenda } = useAuth();
  const router = useRouter();
  const [clientes,  setClientes]  = useState<ClienteItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [logoUrl,   setLogoUrl]   = useState("");

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
    if (!isBpo) { router.push("/"); return; }
    carregarClientes();
  }, [userRole, isBpo, router]);

  const lista = clientes.filter(c => {
    const q = busca.toLowerCase();
    if (!q) return true;
    if ((c.produtor_nome ?? "").toLowerCase().includes(q)) return true;
    if (c.conta_nome.toLowerCase().includes(q)) return true;
    if (c.fazendas.some(f =>
      f.nome.toLowerCase().includes(q) ||
      (f.municipio ?? "").toLowerCase().includes(q)
    )) return true;
    return false;
  });

  function acessarCliente(c: ClienteItem) {
    if (c.fazendas.length === 0) return;
    const f = c.fazendas[0];
    if (c.logo_url) localStorage.setItem("raccotlo_cliente_logo", c.logo_url);
    else            localStorage.removeItem("raccotlo_cliente_logo");
    if (c.conta_id) localStorage.setItem("raccotlo_cliente_conta_id", c.conta_id);
    else            localStorage.removeItem("raccotlo_cliente_conta_id");
    selectFazenda(f.id, f.nome, c.produtor_nome ?? c.conta_nome);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FA", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{
        background: "#fff", borderBottom: "0.5px solid #DDE2EE",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {logoUrl && <img src={logoUrl} alt="Arato" style={{ height: 32 }} />}
          <span style={{ fontSize: 13, color: "#888" }}>Portal do Parceiro</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/bpo/admin")}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#111", fontWeight: 600 }}
          >
            Administração →
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}
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
          {lista.length} cliente{lista.length !== 1 ? "s" : ""} na sua carteira
        </p>

        <input
          type="text"
          placeholder="Buscar por nome, fazenda ou município..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", marginBottom: 24,
            border: "0.5px solid #DDE2EE", borderRadius: 8,
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
              : <span>Nenhum cliente cadastrado. <button onClick={() => router.push("/bpo/admin")} style={{ background: "none", border: "none", color: "#1A4870", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cadastrar →</button></span>
            }
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {lista.map(c => {
              const nomeExibido = c.produtor_nome ?? c.conta_nome;
              const multiFazendas = c.fazendas.length > 1;

              return (
                <div
                  key={c.conta_id}
                  onClick={() => acessarCliente(c)}
                  style={{
                    background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12,
                    padding: "20px", cursor: "pointer", transition: "box-shadow .15s, border-color .15s",
                    display: "flex", flexDirection: "column", gap: 12,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,.08)";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#1A4870";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLDivElement).style.borderColor = "#DDE2EE";
                  }}
                >
                  {/* Avatar ou logo */}
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={nomeExibido} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 8, background: "#D5E8F5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 700, color: "#1A4870",
                    }}>
                      {initiais(nomeExibido)}
                    </div>
                  )}

                  {/* Nome */}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>
                      {nomeExibido}
                    </div>
                    {c.produtor_nome && c.conta_nome !== c.produtor_nome && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.conta_nome}</div>
                    )}
                  </div>

                  {/* Fazendas */}
                  <div style={{ fontSize: 12, color: "#555" }}>
                    {multiFazendas
                      ? `${c.fazendas.length} fazendas · ${c.area_total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ha`
                      : `${c.fazendas[0]?.nome} · ${(c.fazendas[0]?.area_total_ha ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ha`
                    }
                  </div>

                  {/* Município */}
                  {c.fazendas[0]?.municipio && (
                    <div style={{ fontSize: 11, color: "#888" }}>
                      {c.fazendas[0].municipio}{c.fazendas[0].estado ? ` — ${c.fazendas[0].estado}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
