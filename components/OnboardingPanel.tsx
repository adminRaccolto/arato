"use client";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS, TOTAL_STEPS } from "../lib/onboarding";
import { useAuth } from "./AuthProvider";

export default function OnboardingPanel() {
  const { stepsCompletos, refetchOnboarding } = useAuth();
  const router = useRouter();

  const pct = Math.round((stepsCompletos / TOTAL_STEPS) * 100);
  const stepAtual = ONBOARDING_STEPS[stepsCompletos] ?? null; // próximo a fazer
  const todosCompletos = stepsCompletos >= TOTAL_STEPS;

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid #DDE2EE",
      borderRadius: 12,
      padding: "24px 28px",
      marginBottom: 24,
    }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>
            {todosCompletos ? "Implantação concluída!" : "Implantação do sistema"}
          </div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
            {todosCompletos
              ? "Todos os cadastros iniciais foram realizados. O sistema está pronto para uso."
              : `Etapa ${stepsCompletos + 1} de ${TOTAL_STEPS} — complete as etapas para liberar todos os módulos`}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A4870" }}>{pct}%</div>
      </div>

      {/* Barra de progresso */}
      <div style={{ background: "#D5E8F5", borderRadius: 99, height: 8, marginBottom: 24 }}>
        <div style={{
          background: "#1A4870",
          borderRadius: 99,
          height: 8,
          width: `${pct}%`,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ONBOARDING_STEPS.map((step, i) => {
          const completo = i < stepsCompletos;
          const atual    = i === stepsCompletos;
          const futuro   = i > stepsCompletos;

          return (
            <div key={step.id} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "14px 16px",
              borderRadius: 8,
              border: `0.5px solid ${atual ? "#1A4870" : "#DDE2EE"}`,
              background: atual ? "#D5E8F5" : completo ? "#F4F6FA" : "#fff",
              opacity: futuro ? 0.45 : 1,
            }}>
              {/* Ícone */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: completo ? "#1A4870" : atual ? "#1A5CB8" : "#DDE2EE",
                color: completo || atual ? "#fff" : "#888",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
                marginTop: 1,
              }}>
                {completo ? "✓" : step.id}
              </div>

              {/* Texto */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{step.titulo}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{step.subtitulo}</div>

                {/* Instruções expandidas só no step atual */}
                {atual && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#0B2D50", fontWeight: 600, marginBottom: 6 }}>
                      Como fazer:
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {step.instrucoes.map((inst, j) => (
                        <li key={j} style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{inst}</li>
                      ))}
                    </ol>
                    <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                      <button
                        onClick={() => router.push(step.path)}
                        style={{
                          background: "#1A4870",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "7px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {step.pathLabel}
                      </button>
                      <button
                        onClick={refetchOnboarding}
                        style={{
                          background: "transparent",
                          color: "#1A4870",
                          border: "0.5px solid #1A4870",
                          borderRadius: 6,
                          padding: "7px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Já fiz isso ↺
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Badge */}
              {completo && (
                <div style={{
                  fontSize: 11,
                  background: "#D5E8F5",
                  color: "#0B2D50",
                  borderRadius: 99,
                  padding: "2px 10px",
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  Concluído
                </div>
              )}
              {futuro && (
                <div style={{
                  fontSize: 11,
                  background: "#F4F6FA",
                  color: "#888",
                  borderRadius: 99,
                  padding: "2px 10px",
                  flexShrink: 0,
                }}>
                  Bloqueado
                </div>
              )}
            </div>
          );
        })}
      </div>

      {todosCompletos && (
        <div style={{
          marginTop: 20,
          padding: "14px 18px",
          background: "#D5E8F5",
          borderRadius: 8,
          fontSize: 13,
          color: "#0B2D50",
          fontWeight: 600,
          textAlign: "center",
        }}>
          ✓ Todos os módulos estão liberados. Bem-vindo ao RacTech!
        </div>
      )}
    </div>
  );
}
