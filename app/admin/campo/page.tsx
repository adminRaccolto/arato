"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContaSimples {
  id: string;
  nome: string;
}

interface Operador {
  id: string;
  nome: string;
  papel: "gerente_campo" | "operador" | "apontador";
  fazendas_permitidas: string[] | null;
  email: string;
  whatsapp: string | null;
  ativo: boolean;
}

const PAPEL_LABEL: Record<Operador["papel"], string> = {
  gerente_campo: "Gerente Campo",
  operador: "Operador",
  apontador: "Apontador",
};

// ─── Estilos (mesmo padrão de admin/modulos) ─────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "0.5px solid var(--border-table)", borderRadius: 8,
  fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600,
};
const card: React.CSSProperties = {
  background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px",
};

// ─── Página ───────────────────────────────────────────────────────────────────

// Decisão 17/set/2026: esta tela cuida só de assinatura (toggle do módulo)
// e liberação de acesso por conta — gestão de operador (criar, editar,
// resetar PIN) virou self-service, feita pelo próprio gestor da fazenda
// dentro do Arato Web (Configurações > Usuários e Permissões). A lista
// abaixo é só leitura, pra dar suporte ("o cliente diz que não consegue
// logar") sem precisar logar como o cliente.
export default function AdminCampoPage() {
  const [contas, setContas] = useState<ContaSimples[]>([]);
  const [contaId, setContaId] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [salvandoModulo, setSalvandoModulo] = useState(false);

  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [carregandoOps, setCarregandoOps] = useState(false);

  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/listar-contas")
      .then((r) => r.json())
      .then((data: ContaSimples[] | { error: string }) => {
        if (Array.isArray(data)) setContas(data);
      });
  }, []);

  const carregarOperadores = useCallback(async (id: string) => {
    setCarregandoOps(true);
    const res = await fetch(`/api/admin/campo/listar-operadores?conta_id=${id}`);
    const data = (await res.json()) as Operador[] | { error: string };
    if (Array.isArray(data)) setOperadores(data);
    setCarregandoOps(false);
  }, []);

  async function selecionarConta(id: string) {
    setContaId(id);
    setMsg(null);
    if (!id) {
      setOperadores([]);
      return;
    }

    setHabilitado(false);
    fetch(`/api/admin/conta-modulos?conta_id=${id}`)
      .then((r) => r.json())
      .then((data: { modulo: string; habilitado: boolean }[]) => {
        const row = Array.isArray(data) ? data.find((m) => m.modulo === "app_campo") : null;
        setHabilitado(Boolean(row?.habilitado));
      });

    carregarOperadores(id);
  }

  async function alternarModulo() {
    if (!contaId) return;
    setSalvandoModulo(true);
    const novoValor = !habilitado;
    const res = await fetch("/api/admin/conta-modulos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conta_id: contaId, modulos: [{ modulo: "app_campo", habilitado: novoValor }] }),
    });
    if (res.ok) {
      setHabilitado(novoValor);
      setMsg({ tipo: "ok", texto: novoValor ? "App Campo habilitado para esta conta." : "App Campo desativado para esta conta." });
    } else {
      setMsg({ tipo: "erro", texto: "Não foi possível salvar." });
    }
    setSalvandoModulo(false);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
          App Campo
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Ative o produto por conta. Operadores são criados e geridos pelo próprio cliente, em
          Configurações › Usuários e Permissões, dentro do Arato Web.
        </p>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <label style={lbl}>Selecionar conta *</label>
        <select style={inp} value={contaId} onChange={(e) => selecionarConta(e.target.value)}>
          <option value="">— Selecione uma conta —</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        {contaId && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "0.5px solid var(--bg-tag)" }}>
            <div
              onClick={salvandoModulo ? undefined : alternarModulo}
              style={{
                width: 40, height: 22, borderRadius: 11, cursor: salvandoModulo ? "default" : "pointer",
                background: habilitado ? "#16A34A" : "var(--border-table)",
                position: "relative", transition: "background 0.2s", flexShrink: 0, opacity: salvandoModulo ? 0.6 : 1,
              }}
            >
              <div style={{ position: "absolute", top: 3, left: habilitado ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px #0003", transition: "left 0.2s" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                App Campo {habilitado ? "habilitado" : "desativado"} pra esta conta
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Desativar bloqueia o login de todos os operadores, sem apagar cadastro nenhum. Sem
                habilitar, a seção &ldquo;Acesso ao App Campo&rdquo; nem aparece pro cliente em Usuários.
              </div>
            </div>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12,
          background: msg.tipo === "ok" ? "#F0FDF4" : "#FEF2F2",
          color: msg.tipo === "ok" ? "#16A34A" : "#991B1B",
          border: `0.5px solid ${msg.tipo === "ok" ? "#16A34A40" : "#E24B4A40"}` }}>
          {msg.texto}
        </div>
      )}

      {contaId && (
        <div style={card}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1E35", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 14 }}>
            Operadores ({operadores.length}) — somente leitura
          </span>

          {carregandoOps ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-3)" }}>Carregando…</div>
          ) : operadores.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)" }}>Nenhum operador cadastrado ainda.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-table)" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>Nome</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>Papel</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>E-mail</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>WhatsApp</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>Fazendas</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-2)", fontWeight: 600, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {operadores.map((op) => (
                  <tr key={op.id} style={{ borderBottom: "0.5px solid #F3F6F9" }}>
                    <td style={{ padding: "10px 6px", fontWeight: 600 }}>{op.nome}</td>
                    <td style={{ padding: "10px 6px" }}>{PAPEL_LABEL[op.papel]}</td>
                    <td style={{ padding: "10px 6px", fontFamily: "monospace", fontSize: 12 }}>{op.email}</td>
                    <td style={{ padding: "10px 6px", fontFamily: "monospace", fontSize: 12, color: op.whatsapp ? "var(--text-1)" : "var(--text-muted)" }}>
                      {op.whatsapp ? `+${op.whatsapp}` : "—"}
                    </td>
                    <td style={{ padding: "10px 6px", fontSize: 12, color: "var(--text-3)" }}>
                      {op.fazendas_permitidas === null
                        ? "Todas"
                        : op.fazendas_permitidas.length === 0
                          ? "—"
                          : `${op.fazendas_permitidas.length} selecionada(s)`}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                        background: op.ativo ? "#F0FDF4" : "#FEF2F2", color: op.ativo ? "#16A34A" : "#991B1B" }}>
                        {op.ativo ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!contaId && (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
          <div style={{ fontSize: 14, color: "var(--text-3)" }}>Selecione uma conta para gerenciar o App Campo</div>
        </div>
      )}
    </div>
  );
}
