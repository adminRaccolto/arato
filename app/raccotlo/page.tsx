"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";

export default function RaccotloHub() {
  const { userRole, raccotloGestor, nomeUsuario, signOut } = useAuth();
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState("https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logoshttps://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Arato_Nova.png");

  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoUrl(data.publicUrl);
  }, []);

  useEffect(() => {
    if (!userRole) return;
    if (userRole !== "raccotlo") router.replace("/");
  }, [userRole, router]);

  if (!userRole || userRole !== "raccotlo") return null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #071628 0%, #0B2D50 55%, #0F3B68 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", fontFamily: "system-ui, sans-serif",
      padding: "40px 24px",
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <img
          src={logoUrl} alt="Arato"
          style={{ height: 44, filter: "brightness(0) invert(1)", objectFit: "contain" }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div style={{
          marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
        }}>
          Ambiente Interno — Raccotlo
        </div>
      </div>

      {/* Saudação */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>
          Olá{nomeUsuario ? `, ${nomeUsuario.split(" ")[0]}` : ""}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          {raccotloGestor ? "Raccotlo Gestor" : "Raccotlo Operacional"} — escolha a área que deseja acessar
        </p>
      </div>

      {/* Cards de área */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", maxWidth: 680 }}>

        {/* Gestão Arato — somente Gestor */}
        {raccotloGestor && (
          <button
            onClick={() => router.push("/admin")}
            style={{
              width: 300, padding: "32px 28px", background: "rgba(201,146,27,0.12)",
              border: "1px solid rgba(201,146,27,0.40)", borderRadius: 16,
              cursor: "pointer", textAlign: "left", transition: "all 0.18s",
              position: "relative", overflow: "hidden",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,146,27,0.22)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,146,27,0.7)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,146,27,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,146,27,0.40)"; }}
          >
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚙</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FDE9BB", marginBottom: 8 }}>
              Gestão Arato
            </div>
            <div style={{ fontSize: 13, color: "rgba(253,233,187,0.65)", lineHeight: 1.5 }}>
              Clientes, planos, faturamento, identidade e configurações do sistema.
            </div>
            <div style={{
              marginTop: 20, fontSize: 12, fontWeight: 700,
              color: "#C9921B", letterSpacing: "0.05em",
            }}>
              ACESSAR →
            </div>
          </button>
        )}

        {/* Área de Clientes — todos */}
        <button
          onClick={() => router.push("/seletor-cliente")}
          style={{
            width: 300, padding: "32px 28px", background: "rgba(201,146,27,0.12)",
            border: "1px solid rgba(201,146,27,0.40)", borderRadius: 16,
            cursor: "pointer", textAlign: "left", transition: "all 0.18s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,146,27,0.22)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,146,27,0.7)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,146,27,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,146,27,0.40)"; }}
        >
          <div style={{ fontSize: 32, marginBottom: 16 }}>🌱</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Área de Clientes
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
            Selecione a fazenda de um cliente para acessar o sistema como ele.
          </div>
          <div style={{
            marginTop: 20, fontSize: 12, fontWeight: 700,
            color: "#C9921B", letterSpacing: "0.05em",
          }}>
            SELECIONAR CLIENTE →
          </div>
        </button>

      </div>

      {/* Badge perfil */}
      <div style={{
        marginTop: 48, padding: "5px 14px",
        background: raccotloGestor ? "rgba(201,146,27,0.15)" : "var(--border-table)",
        border: `0.5px solid ${raccotloGestor ? "rgba(201,146,27,0.3)" : "var(--border)"}`,
        borderRadius: 20, fontSize: 11, fontWeight: 600,
        color: raccotloGestor ? "#FDE9BB" : "rgba(255,255,255,0.45)",
        letterSpacing: "0.06em",
      }}>
        {raccotloGestor ? "GESTOR — ACESSO TOTAL" : "OPERACIONAL — ÁREA DE CLIENTES"}
      </div>

      {/* Sair */}
      <button
        onClick={signOut}
        style={{
          marginTop: 28, background: "none", border: "0.5px solid var(--border)",
          borderRadius: 8, padding: "8px 20px", cursor: "pointer",
          fontSize: 13, color: "rgba(255,255,255,0.35)",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)"; }}
      >
        Sair
      </button>

    </div>
  );
}
