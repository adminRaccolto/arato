"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";

/* ────────────────────── tipos ────────────────────── */

interface Cliente {
  id: string;
  nome: string;
  fazendas_count?: number;
}

interface NovoClienteForm {
  tipo: "pf" | "pj";
  nome: string;
  cpf_cnpj: string;
  email_cliente: string;
  municipio_cliente: string;
  estado_cliente: string;
  fazenda_nome: string;
  fazenda_municipio: string;
  fazenda_estado: string;
  fazenda_area: string;
  user_nome: string;
  user_email: string;
  user_senha: string;
}

interface UsuarioBpo {
  user_id: string;
  nome: string;
  email: string;
  bpo_nivel: "admin" | "operacional" | "consultor";
  ativo: boolean;
}

interface NovoUsuarioForm {
  nome: string;
  email: string;
  senha: string;
  bpo_nivel: "admin" | "operacional" | "consultor";
}

/* ────────────────────── constantes ────────────────────── */

const FORM_CLIENTE_VAZIO: NovoClienteForm = {
  tipo: "pf", nome: "", cpf_cnpj: "", email_cliente: "", municipio_cliente: "", estado_cliente: "MT",
  fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "MT", fazenda_area: "",
  user_nome: "", user_email: "", user_senha: "",
};

const FORM_USUARIO_VAZIO: NovoUsuarioForm = {
  nome: "", email: "", senha: "", bpo_nivel: "operacional",
};

const NIVEL_LABEL: Record<string, string> = {
  admin: "Administrador",
  operacional: "Operacional",
  consultor: "Consultor",
};

const NIVEL_DESC: Record<string, string> = {
  admin: "Acesso total ao painel BPO + gerenciamento de usuários",
  operacional: "Lançamentos, contratos, estoque — sem módulos exclusivos Raccolto",
  consultor: "Somente leitura e relatórios",
};

/* ────────────────────── componente ────────────────────── */

export default function BpoAdmin() {
  const { userRole, isBpo } = useAuth();
  const router = useRouter();

  // navegação entre abas
  const [aba, setAba] = useState<"clientes" | "usuarios">("clientes");

  // ---- aba clientes ----
  const [clientes,      setClientes]      = useState<Cliente[]>([]);
  const [loadingCli,    setLoadingCli]    = useState(true);
  const [modalCliente,  setModalCliente]  = useState(false);
  const [formCliente,   setFormCliente]   = useState<NovoClienteForm>(FORM_CLIENTE_VAZIO);
  const [salvandoCli,   setSalvandoCli]   = useState(false);
  const [resultadoCli,  setResultadoCli]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [buscaCli,      setBuscaCli]      = useState("");

  // ---- aba usuários ----
  const [usuarios,      setUsuarios]      = useState<UsuarioBpo[]>([]);
  const [loadingUsr,    setLoadingUsr]    = useState(false);
  const [modalUsuario,  setModalUsuario]  = useState(false);
  const [formUsuario,   setFormUsuario]   = useState<NovoUsuarioForm>(FORM_USUARIO_VAZIO);
  const [salvandoUsr,   setSalvandoUsr]   = useState(false);
  const [resultadoUsr,  setResultadoUsr]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [togglingUsr,   setTogglingUsr]   = useState<string | null>(null);

  /* guarda monta */
  useEffect(() => {
    if (userRole === null) return;
    if (!isBpo) { router.push("/"); return; }
    carregarClientes();
  }, [userRole, isBpo, router]);

  useEffect(() => {
    if (aba === "usuarios" && usuarios.length === 0) carregarUsuarios();
  }, [aba]);

  /* ────────── helpers de token ────────── */
  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  /* ────────── clientes ────────── */
  async function carregarClientes() {
    setLoadingCli(true);
    const res = await fetch("/api/fazenda/listar-clientes", {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    const json = await res.json();
    const items: Cliente[] = (json.clientes ?? []).map((c: { conta_id: string; conta_nome: string; fazendas: unknown[] }) => ({
      id: c.conta_id,
      nome: c.conta_nome,
      fazendas_count: c.fazendas?.length ?? 0,
    }));
    setClientes(items);
    setLoadingCli(false);
  }

  function updCliente(k: keyof NovoClienteForm, v: string) {
    setFormCliente(f => ({ ...f, [k]: v }));
  }

  async function salvarNovoCliente(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoCli(true);
    setResultadoCli(null);
    try {
      const res = await fetch("/api/admin/novo-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify(formCliente),
      });
      const json = await res.json();
      if (json.ok) {
        setResultadoCli({ ok: true, msg: `Cliente cadastrado! E-mail: ${json.user_email}` });
        setFormCliente(FORM_CLIENTE_VAZIO);
        await carregarClientes();
      } else {
        setResultadoCli({ ok: false, msg: json.error ?? "Erro desconhecido" });
      }
    } catch (err) {
      setResultadoCli({ ok: false, msg: String(err) });
    } finally {
      setSalvandoCli(false);
    }
  }

  /* ────────── usuários ────────── */
  async function carregarUsuarios() {
    setLoadingUsr(true);
    const res = await fetch("/api/bpo/usuarios", {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    const json = await res.json();
    setUsuarios(json.usuarios ?? []);
    setLoadingUsr(false);
  }

  function updUsuario(k: keyof NovoUsuarioForm, v: string) {
    setFormUsuario(f => ({ ...f, [k]: v }));
  }

  async function salvarNovoUsuario(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoUsr(true);
    setResultadoUsr(null);
    try {
      const res = await fetch("/api/bpo/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify(formUsuario),
      });
      const json = await res.json();
      if (json.ok) {
        setResultadoUsr({ ok: true, msg: `Usuário criado! E-mail: ${json.email}` });
        setFormUsuario(FORM_USUARIO_VAZIO);
        await carregarUsuarios();
      } else {
        setResultadoUsr({ ok: false, msg: json.error ?? "Erro desconhecido" });
      }
    } catch (err) {
      setResultadoUsr({ ok: false, msg: String(err) });
    } finally {
      setSalvandoUsr(false);
    }
  }

  async function toggleAtivo(u: UsuarioBpo) {
    setTogglingUsr(u.user_id);
    try {
      const res = await fetch("/api/bpo/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ user_id: u.user_id, ativo: !u.ativo }),
      });
      const json = await res.json();
      if (json.ok) {
        setUsuarios(prev => prev.map(x => x.user_id === u.user_id ? { ...x, ativo: !u.ativo } : x));
      } else {
        alert(json.error ?? "Erro ao alterar status");
      }
    } catch {
      alert("Erro de conexão");
    } finally {
      setTogglingUsr(null);
    }
  }

  const listaCli = clientes.filter(c => !buscaCli || c.nome.toLowerCase().includes(buscaCli.toLowerCase()));

  /* ────────── render ────────── */
  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FA", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #DDE2EE", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1A4870" }}>Arato</span>
          <span style={{ fontSize: 13, color: "#888" }}>Administração BPO</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/bpo/seletor-cliente")}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}>
            ← Selecionar cliente
          </button>
          <button onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Clientes ativos", valor: clientes.length },
            { label: "Fazendas geridas", valor: clientes.reduce((s, c) => s + (c.fazendas_count ?? 0), 0) },
            { label: "Usuários BPO", valor: usuarios.filter(u => u.ativo).length || "—" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "16px 24px", flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1A4870" }}>{k.valor}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
          {(["clientes", "usuarios"] as const).map(t => (
            <button key={t} onClick={() => setAba(t)}
              style={{
                background: "none", border: "none", borderBottom: aba === t ? "2px solid #1A4870" : "2px solid transparent",
                padding: "10px 20px", cursor: "pointer", fontSize: 13,
                fontWeight: aba === t ? 700 : 400,
                color: aba === t ? "#1A4870" : "#555",
              }}>
              {t === "clientes" ? "Meus clientes" : "Usuários BPO"}
            </button>
          ))}
        </div>

        {/* ──── ABA CLIENTES ──── */}
        {aba === "clientes" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => { setModalCliente(true); setResultadoCli(null); }}
                style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                + Novo cliente
              </button>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Clientes</span>
                <input type="text" placeholder="Buscar..." value={buscaCli} onChange={e => setBuscaCli(e.target.value)}
                  style={{ marginLeft: "auto", padding: "5px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 12, outline: "none", width: 200 }} />
              </div>
              {loadingCli ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
              ) : listaCli.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhum cliente cadastrado ainda.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFD" }}>
                      {["Cliente", "Fazendas", ""].map(h => (
                        <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaCli.map(c => (
                      <tr key={c.id} style={{ borderBottom: "0.5px solid #F0F4FA" }}>
                        <td style={{ padding: "10px 16px", fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>{c.nome}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#666" }}>{c.fazendas_count ?? 0}</td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          <button onClick={() => { localStorage.setItem("raccotlo_cliente_conta_id", c.id); router.push("/bpo/seletor-cliente"); }}
                            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "#1A4870" }}>
                            Acessar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ──── ABA USUÁRIOS ──── */}
        {aba === "usuarios" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => { setModalUsuario(true); setResultadoUsr(null); setFormUsuario(FORM_USUARIO_VAZIO); }}
                style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                + Novo usuário
              </button>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DDE2EE" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Usuários da equipe BPO</span>
                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>Apenas usuários vinculados ao seu parceiro</span>
              </div>
              {loadingUsr ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
              ) : usuarios.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                  Nenhum usuário cadastrado ainda. Use o botão "+ Novo usuário" para adicionar.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFD" }}>
                      {["Nome", "E-mail", "Perfil", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => (
                      <tr key={u.user_id} style={{ borderBottom: "0.5px solid #F0F4FA", opacity: u.ativo ? 1 : 0.55 }}>
                        <td style={{ padding: "10px 16px", fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>{u.nome}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#555" }}>{u.email}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{
                            fontSize: 11, borderRadius: 20, padding: "2px 10px", fontWeight: 600,
                            background: u.bpo_nivel === "admin" ? "#EFF6FF" : u.bpo_nivel === "consultor" ? "#F5F3FF" : "#F0FDF4",
                            color: u.bpo_nivel === "admin" ? "#1D4ED8" : u.bpo_nivel === "consultor" ? "#7C3AED" : "#16A34A",
                          }}>
                            {NIVEL_LABEL[u.bpo_nivel] ?? u.bpo_nivel}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{
                            fontSize: 11, borderRadius: 20, padding: "2px 10px", fontWeight: 600,
                            background: u.ativo ? "#F0FDF4" : "#FEF2F2",
                            color: u.ativo ? "#16A34A" : "#DC2626",
                          }}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          <button
                            onClick={() => toggleAtivo(u)}
                            disabled={togglingUsr === u.user_id}
                            style={{
                              background: "none",
                              border: `0.5px solid ${u.ativo ? "#E24B4A60" : "#22C55E60"}`,
                              color: u.ativo ? "#E24B4A" : "#16A34A",
                              borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12,
                              opacity: togglingUsr === u.user_id ? 0.5 : 1,
                            }}>
                            {togglingUsr === u.user_id ? "..." : u.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* ──── Modal Novo Cliente ──── */}
      {modalCliente && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Novo cliente</h2>
              <button onClick={() => setModalCliente(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
            </div>

            {resultadoCli && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: resultadoCli.ok ? "#F0FFF4" : "#FFF0F0", border: `0.5px solid ${resultadoCli.ok ? "#16A34A" : "#E24B4A"}`, fontSize: 13, color: resultadoCli.ok ? "#16A34A" : "#E24B4A" }}>
                {resultadoCli.msg}
              </div>
            )}

            <form onSubmit={salvarNovoCliente}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Tipo de produtor</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["pf", "pj"] as const).map(t => (
                      <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                        <input type="radio" checked={formCliente.tipo === t} onChange={() => updCliente("tipo", t)} />
                        {t === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome do produtor *</label>
                  <input required value={formCliente.nome} onChange={e => updCliente("nome", e.target.value)} style={inp} placeholder="Ex: João da Silva" />
                </div>

                <div>
                  <label style={lbl}>{formCliente.tipo === "pf" ? "CPF" : "CNPJ"}</label>
                  <input value={formCliente.cpf_cnpj} onChange={e => updCliente("cpf_cnpj", e.target.value)} style={inp} placeholder={formCliente.tipo === "pf" ? "000.000.000-00" : "00.000.000/0000-00"} />
                </div>

                <div>
                  <label style={lbl}>E-mail do produtor</label>
                  <input type="email" value={formCliente.email_cliente} onChange={e => updCliente("email_cliente", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Município</label>
                  <input value={formCliente.municipio_cliente} onChange={e => updCliente("municipio_cliente", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Estado</label>
                  <input value={formCliente.estado_cliente} onChange={e => updCliente("estado_cliente", e.target.value)} style={inp} maxLength={2} />
                </div>

                <div style={{ gridColumn: "1/-1", margin: "8px 0 4px", borderTop: "0.5px solid #DDE2EE", paddingTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Fazenda principal</span>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome da fazenda *</label>
                  <input required value={formCliente.fazenda_nome} onChange={e => updCliente("fazenda_nome", e.target.value)} style={inp} placeholder="Ex: Fazenda Santa Maria" />
                </div>

                <div>
                  <label style={lbl}>Município da fazenda</label>
                  <input value={formCliente.fazenda_municipio} onChange={e => updCliente("fazenda_municipio", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Estado da fazenda</label>
                  <input value={formCliente.fazenda_estado} onChange={e => updCliente("fazenda_estado", e.target.value)} style={inp} maxLength={2} />
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Área total (ha)</label>
                  <input type="number" min="0" step="0.01" value={formCliente.fazenda_area} onChange={e => updCliente("fazenda_area", e.target.value)} style={inp} />
                </div>

                <div style={{ gridColumn: "1/-1", margin: "8px 0 4px", borderTop: "0.5px solid #DDE2EE", paddingTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Acesso do usuário</span>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome completo *</label>
                  <input required value={formCliente.user_nome} onChange={e => updCliente("user_nome", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>E-mail de acesso *</label>
                  <input required type="email" value={formCliente.user_email} onChange={e => updCliente("user_email", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Senha provisória *</label>
                  <input required value={formCliente.user_senha} onChange={e => updCliente("user_senha", e.target.value)} style={inp} placeholder="Mínimo 8 caracteres" minLength={8} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setModalCliente(false)}
                  style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={salvandoCli}
                  style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvandoCli ? .6 : 1 }}>
                  {salvandoCli ? "Salvando..." : "Cadastrar cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──── Modal Novo Usuário BPO ──── */}
      {modalUsuario && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Novo usuário BPO</h2>
              <button onClick={() => setModalUsuario(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
            </div>

            {resultadoUsr && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: resultadoUsr.ok ? "#F0FFF4" : "#FFF0F0", border: `0.5px solid ${resultadoUsr.ok ? "#16A34A" : "#E24B4A"}`, fontSize: 13, color: resultadoUsr.ok ? "#16A34A" : "#E24B4A" }}>
                {resultadoUsr.msg}
              </div>
            )}

            <form onSubmit={salvarNovoUsuario}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                <div>
                  <label style={lbl}>Nome completo *</label>
                  <input required value={formUsuario.nome} onChange={e => updUsuario("nome", e.target.value)} style={inp} placeholder="Ex: Maria Oliveira" />
                </div>

                <div>
                  <label style={lbl}>E-mail de acesso *</label>
                  <input required type="email" value={formUsuario.email} onChange={e => updUsuario("email", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Senha provisória *</label>
                  <input required value={formUsuario.senha} onChange={e => updUsuario("senha", e.target.value)} style={inp} placeholder="Mínimo 8 caracteres" minLength={8} />
                </div>

                <div>
                  <label style={lbl}>Perfil de acesso *</label>
                  <select value={formUsuario.bpo_nivel} onChange={e => updUsuario("bpo_nivel", e.target.value)} style={{ ...inp, appearance: "auto" }}>
                    {(["admin", "operacional", "consultor"] as const).map(n => (
                      <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    {NIVEL_DESC[formUsuario.bpo_nivel]}
                  </div>
                </div>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                <button type="button" onClick={() => setModalUsuario(false)}
                  style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={salvandoUsr}
                  style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvandoUsr ? .6 : 1 }}>
                  {salvandoUsr ? "Criando..." : "Criar usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" };
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
