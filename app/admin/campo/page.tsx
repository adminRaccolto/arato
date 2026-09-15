"use client";
import { useState, useEffect, useCallback, Fragment } from "react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FazendaSimples {
  id: string;
  nome: string;
  municipio?: string;
  estado?: string;
}

interface ContaSimples {
  id: string;
  nome: string;
  fazendas?: FazendaSimples[];
}

interface Operador {
  id: string;
  user_id: string;
  nome: string;
  papel: "gerente_campo" | "operador" | "apontador";
  fazendas_permitidas: string[] | null;
  fazenda_id: string | null;
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
const btnPrimary: React.CSSProperties = {
  padding: "9px 22px", background: "#0B1E35", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};
const btnSecondary: React.CSSProperties = {
  padding: "7px 14px", background: "var(--bg-card)", color: "var(--text-2)",
  border: "0.5px solid var(--border-table)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12,
};
const card: React.CSSProperties = {
  background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px",
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminCampoPage() {
  const [contas, setContas] = useState<ContaSimples[]>([]);
  const [contaId, setContaId] = useState("");
  const [contaSel, setContaSel] = useState<ContaSimples | null>(null);
  const [habilitado, setHabilitado] = useState(false);
  const [salvandoModulo, setSalvandoModulo] = useState(false);

  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [carregandoOps, setCarregandoOps] = useState(false);

  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Formulário de novo operador
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoPapel, setNovoPapel] = useState<Operador["papel"]>("operador");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");
  const [novasFazendas, setNovasFazendas] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);
  const [credenciaisCriadas, setCredenciaisCriadas] = useState<{ email: string; pin: string } | null>(null);

  // Reset de PIN
  const [pinResetado, setPinResetado] = useState<{ nome: string; email: string; pin: string } | null>(null);

  // Edição de operador existente (inclui telefone — pode ter sido criado
  // antes do campo existir, ou o número mudou)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPapel, setEditPapel] = useState<Operador["papel"]>("operador");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editFazendas, setEditFazendas] = useState<Set<string>>(new Set());
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

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
    setContaSel(contas.find((c) => c.id === id) ?? null);
    setMostrarNovo(false);
    setCredenciaisCriadas(null);
    setPinResetado(null);
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

  function alternarFazendaNova(id: string) {
    setNovasFazendas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function criarOperador() {
    if (!contaId || !novoNome.trim()) {
      setMsg({ tipo: "erro", texto: "Informe o nome do operador." });
      return;
    }
    setCriando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/campo/operador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conta_id: contaId,
          fazenda_id: contaSel?.fazendas?.[0]?.id ?? null,
          nome: novoNome.trim(),
          papel: novoPapel,
          whatsapp: novoWhatsapp.trim() || null,
          fazendas_permitidas: novasFazendas.size > 0 ? Array.from(novasFazendas) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar operador");
      setCredenciaisCriadas({ email: data.email, pin: data.pin });
      setNovoNome("");
      setNovoPapel("operador");
      setNovoWhatsapp("");
      setNovasFazendas(new Set());
      setMostrarNovo(false);
      carregarOperadores(contaId);
    } catch (e) {
      setMsg({ tipo: "erro", texto: String(e) });
    } finally {
      setCriando(false);
    }
  }

  async function resetarPin(op: Operador) {
    if (!confirm(`Gerar um novo PIN para ${op.nome}? O PIN antigo deixa de funcionar.`)) return;
    const res = await fetch("/api/admin/campo/operador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfil_id: op.id, resetar_pin: true }),
    });
    const data = await res.json();
    if (res.ok) setPinResetado({ nome: op.nome, email: op.email, pin: data.pin });
    else setMsg({ tipo: "erro", texto: data.error ?? "Erro ao resetar PIN" });
  }

  async function alternarAtivo(op: Operador) {
    const acao = op.ativo ? "desativar" : "reativar";
    if (!confirm(`Confirma ${acao} o acesso de ${op.nome} ao App Campo?`)) return;
    const res = await fetch("/api/admin/campo/operador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfil_id: op.id, ativo: !op.ativo, fazendas_permitidas: op.fazendas_permitidas }),
    });
    if (res.ok) carregarOperadores(contaId);
    else setMsg({ tipo: "erro", texto: "Erro ao atualizar" });
  }

  function iniciarEdicao(op: Operador) {
    setEditandoId(op.id);
    setEditNome(op.nome);
    setEditPapel(op.papel);
    setEditWhatsapp(op.whatsapp ?? "");
    setEditFazendas(new Set(op.fazendas_permitidas ?? []));
  }

  function alternarFazendaEdicao(id: string) {
    setEditFazendas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function salvarEdicao() {
    if (!editandoId || !editNome.trim()) return;
    setSalvandoEdicao(true);
    try {
      const res = await fetch("/api/admin/campo/operador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfil_id: editandoId,
          nome: editNome.trim(),
          papel: editPapel,
          whatsapp: editWhatsapp.trim() || null,
          fazendas_permitidas: editFazendas.size > 0 ? Array.from(editFazendas) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      setEditandoId(null);
      carregarOperadores(contaId);
    } catch (e) {
      setMsg({ tipo: "erro", texto: String(e) });
    } finally {
      setSalvandoEdicao(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
          App Campo
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Ative o produto por conta e gerencie operadores (login sintético + PIN)
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
                Desativar bloqueia o login de todos os operadores, sem apagar cadastro nenhum.
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

      {credenciaisCriadas && (
        <div style={{ padding: "14px 18px", background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#7A5A12" }}>Operador criado — anote agora, não é mostrado de novo:</p>
          <p style={{ margin: 0, fontSize: 13, color: "#7A5A12" }}>
            E-mail: <strong style={{ fontFamily: "monospace" }}>{credenciaisCriadas.email}</strong>
            {"  ·  "}
            PIN: <strong style={{ fontFamily: "monospace", fontSize: 15 }}>{credenciaisCriadas.pin}</strong>
          </p>
        </div>
      )}
      {pinResetado && (
        <div style={{ padding: "14px 18px", background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#7A5A12" }}>PIN de {pinResetado.nome} redefinido — anote agora:</p>
          <p style={{ margin: 0, fontSize: 13, color: "#7A5A12" }}>
            E-mail: <strong style={{ fontFamily: "monospace" }}>{pinResetado.email}</strong>
            {"  ·  "}
            Novo PIN: <strong style={{ fontFamily: "monospace", fontSize: 15 }}>{pinResetado.pin}</strong>
          </p>
        </div>
      )}

      {contaId && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1E35", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Operadores ({operadores.length})
            </span>
            <button style={btnPrimary} onClick={() => setMostrarNovo((v) => !v)}>
              {mostrarNovo ? "Cancelar" : "+ Novo operador"}
            </button>
          </div>

          {mostrarNovo && (
            <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: 8, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={lbl}>Nome</label>
                <input style={inp} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: João Silva" />
              </div>
              <div>
                <label style={lbl}>Papel</label>
                <select style={inp} value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as Operador["papel"])}>
                  <option value="gerente_campo">Gerente Campo — aprova lançamentos</option>
                  <option value="operador">Operador — lança e executa tarefas</option>
                  <option value="apontador">Apontador</option>
                </select>
              </div>
              <div>
                <label style={lbl}>WhatsApp (opcional — recebe aviso automático de pendência/aprovação)</label>
                <input
                  style={inp} type="tel" value={novoWhatsapp} maxLength={15}
                  onChange={(e) => setNovoWhatsapp(e.target.value.replace(/\D/g, ""))}
                  placeholder="5565999990000"
                />
              </div>
              <div>
                <label style={lbl}>Fazendas liberadas (nenhuma marcada = todas as fazendas da conta)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: 8 }}>
                  {(contaSel?.fazendas ?? []).map((f) => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={novasFazendas.has(f.id)} onChange={() => alternarFazendaNova(f.id)} />
                      {f.nome}
                    </label>
                  ))}
                  {(contaSel?.fazendas ?? []).length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Esta conta não tem fazenda cadastrada ainda.</span>
                  )}
                </div>
              </div>
              <button style={btnPrimary} onClick={criarOperador} disabled={criando}>
                {criando ? "Criando..." : "Criar operador"}
              </button>
            </div>
          )}

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
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {operadores.map((op) => (
                  <Fragment key={op.id}>
                    <tr style={{ borderBottom: editandoId === op.id ? "none" : "0.5px solid #F3F6F9" }}>
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
                      <td style={{ padding: "10px 6px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button style={btnSecondary} onClick={() => (editandoId === op.id ? setEditandoId(null) : iniciarEdicao(op))}>
                          {editandoId === op.id ? "Fechar" : "Editar"}
                        </button>
                        <button style={btnSecondary} onClick={() => resetarPin(op)}>Resetar PIN</button>
                        <button style={btnSecondary} onClick={() => alternarAtivo(op)}>
                          {op.ativo ? "Bloquear" : "Reativar"}
                        </button>
                      </td>
                    </tr>
                    {editandoId === op.id && (
                      <tr style={{ borderBottom: "0.5px solid #F3F6F9" }}>
                        <td colSpan={7} style={{ padding: "0 6px 14px" }}>
                          <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 10 }}>
                              <div style={{ flex: 1 }}>
                                <label style={lbl}>Nome</label>
                                <input style={inp} value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={lbl}>Papel</label>
                                <select style={inp} value={editPapel} onChange={(e) => setEditPapel(e.target.value as Operador["papel"])}>
                                  <option value="gerente_campo">Gerente Campo</option>
                                  <option value="operador">Operador</option>
                                  <option value="apontador">Apontador</option>
                                </select>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={lbl}>WhatsApp</label>
                                <input
                                  style={inp} type="tel" value={editWhatsapp} maxLength={15}
                                  onChange={(e) => setEditWhatsapp(e.target.value.replace(/\D/g, ""))}
                                  placeholder="5565999990000"
                                />
                              </div>
                            </div>
                            <div>
                              <label style={lbl}>Fazendas liberadas (nenhuma marcada = todas as fazendas da conta)</label>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: 8, background: "var(--bg-card)" }}>
                                {(contaSel?.fazendas ?? []).map((f) => (
                                  <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                                    <input type="checkbox" checked={editFazendas.has(f.id)} onChange={() => alternarFazendaEdicao(f.id)} />
                                    {f.nome}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button style={btnPrimary} onClick={salvarEdicao} disabled={salvandoEdicao}>
                                {salvandoEdicao ? "Salvando..." : "Salvar"}
                              </button>
                              <button style={btnSecondary} onClick={() => setEditandoId(null)}>Cancelar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
