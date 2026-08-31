"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import type { Parceiro } from "../../../lib/supabase";

interface ParceiroComStats extends Parceiro {
  clientes_count?: number;
}

interface NovoParcForm {
  nome: string;
  cnpj: string;
  email_admin: string;
  obs: string;
}

const FORM_VAZIO: NovoParcForm = { nome: "", cnpj: "", email_admin: "", obs: "" };

interface UsuarioBpoForm {
  nome: string;
  email: string;
  senha: string;
  parceiro_id: string;
}

export default function AdminParceiros() {
  const { userRole, raccotloGestor } = useAuth();
  const router = useRouter();
  const [parceiros,   setParceiros]   = useState<ParceiroComStats[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState<"parceiro" | "usuario" | null>(null);
  const [editando,    setEditando]    = useState<Parceiro | null>(null);
  const [form,        setForm]        = useState<NovoParcForm>(FORM_VAZIO);
  const [uForm,       setUForm]       = useState<UsuarioBpoForm>({ nome: "", email: "", senha: "", parceiro_id: "" });
  const [salvando,    setSalvando]    = useState(false);
  const [msg,         setMsg]         = useState<{ ok: boolean; txt: string } | null>(null);

  useEffect(() => {
    if (userRole === null) return;
    if (!raccotloGestor) { router.push("/"); return; }
    carregar();
  }, [userRole, raccotloGestor, router]);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from("parceiros").select("*").order("nome");
    const parcs = (data ?? []) as Parceiro[];

    // Conta clientes por parceiro
    const parcIds = parcs.map(p => p.id);
    let contaMap: Record<string, number> = {};
    if (parcIds.length > 0) {
      const { data: contas } = await supabase
        .from("contas").select("parceiro_id")
        .in("parceiro_id", parcIds);
      (contas ?? []).forEach((c: { parceiro_id: string }) => {
        contaMap[c.parceiro_id] = (contaMap[c.parceiro_id] ?? 0) + 1;
      });
    }

    setParceiros(parcs.map(p => ({ ...p, clientes_count: contaMap[p.id] ?? 0 })));
    setLoading(false);
  }

  function upd(k: keyof NovoParcForm, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function updU(k: keyof UsuarioBpoForm, v: string) { setUForm(f => ({ ...f, [k]: v })); }

  async function salvarParceiro(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg(null);
    try {
      const payload = { nome: form.nome, cnpj: form.cnpj || null, email_admin: form.email_admin || null, obs: form.obs || null };
      const { error } = editando
        ? await supabase.from("parceiros").update(payload).eq("id", editando.id)
        : await supabase.from("parceiros").insert({ ...payload, ativo: true });
      if (error) throw error;
      setMsg({ ok: true, txt: editando ? "Parceiro atualizado." : "Parceiro criado com sucesso!" });
      setForm(FORM_VAZIO);
      setEditando(null);
      await carregar();
    } catch (err) {
      const e = err as Error;
      setMsg({ ok: false, txt: e.message ?? String(err) });
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(p: ParceiroComStats) {
    await supabase.from("parceiros").update({ ativo: !p.ativo }).eq("id", p.id);
    await carregar();
  }

  async function criarUsuarioBpo(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg(null);
    try {
      // 1. Criar usuário no Auth
      const { data: { user }, error: authErr } = await supabase.auth.admin.createUser({
        email: uForm.email,
        password: uForm.senha,
        email_confirm: true,
        user_metadata: { nome: uForm.nome, must_change_password: true },
      });
      if (authErr || !user) throw new Error(authErr?.message ?? "Falha ao criar usuário");

      // 2. Criar perfil com role bpo + parceiro_id
      const { error: perfErr } = await supabase.from("perfis").upsert({
        user_id:     user.id,
        nome:        uForm.nome,
        role:        "bpo",
        parceiro_id: uForm.parceiro_id,
      }, { onConflict: "user_id" });
      if (perfErr) throw perfErr;

      setMsg({ ok: true, txt: `Usuário BPO criado: ${uForm.email}` });
      setUForm({ nome: "", email: "", senha: "", parceiro_id: "" });
    } catch (err) {
      const e = err as Error;
      setMsg({ ok: false, txt: e.message ?? String(err) });
    } finally {
      setSalvando(false);
    }
  }

  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" };
  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ padding: "24px 32px", fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Parceiros BPO</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            Empresas de BPO que gerenciam clientes no Arato sob sua própria identidade.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setModal("usuario"); setMsg(null); }}
            style={{ background: "#fff", border: "0.5px solid #1A4870", color: "#1A4870", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            + Usuário BPO
          </button>
          <button onClick={() => { setModal("parceiro"); setEditando(null); setForm(FORM_VAZIO); setMsg(null); }}
            style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            + Novo parceiro
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
        ) : parceiros.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhum parceiro BPO cadastrado.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFD" }}>
                {["Empresa", "CNPJ", "E-mail admin", "Clientes", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parceiros.map(p => (
                <tr key={p.id} style={{ borderBottom: "0.5px solid #F0F4FA" }}>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{p.nome}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{p.cnpj ?? "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{p.email_admin ?? "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{p.clientes_count ?? 0}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                      background: p.ativo ? "#F0FFF4" : "#FFF0F0",
                      color: p.ativo ? "#16A34A" : "#E24B4A",
                      border: `0.5px solid ${p.ativo ? "#16A34A" : "#E24B4A"}`,
                    }}>
                      {p.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => { setEditando(p); setForm({ nome: p.nome, cnpj: p.cnpj ?? "", email_admin: p.email_admin ?? "", obs: p.obs ?? "" }); setModal("parceiro"); setMsg(null); }}
                      style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "#555" }}>
                      Editar
                    </button>
                    <button onClick={() => toggleAtivo(p)}
                      style={{ background: "none", border: `0.5px solid ${p.ativo ? "#E24B4A" : "#16A34A"}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: p.ativo ? "#E24B4A" : "#16A34A" }}>
                      {p.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — Parceiro */}
      {modal === "parceiro" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editando ? "Editar parceiro" : "Novo parceiro BPO"}</h2>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
            </div>
            {msg && <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 14, background: msg.ok ? "#F0FFF4" : "#FFF0F0", border: `0.5px solid ${msg.ok ? "#16A34A" : "#E24B4A"}`, fontSize: 13, color: msg.ok ? "#16A34A" : "#E24B4A" }}>{msg.txt}</div>}
            <form onSubmit={salvarParceiro} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Nome da empresa *</label>
                <input required value={form.nome} onChange={e => upd("nome", e.target.value)} style={inp} placeholder="Ex: ABC Agro Consultoria" />
              </div>
              <div>
                <label style={lbl}>CNPJ</label>
                <input value={form.cnpj} onChange={e => upd("cnpj", e.target.value)} style={inp} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label style={lbl}>E-mail do administrador BPO</label>
                <input type="email" value={form.email_admin} onChange={e => upd("email_admin", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Observações</label>
                <textarea value={form.obs} onChange={e => upd("obs", e.target.value)} style={{ ...inp, height: 60, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setModal(null)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button type="submit" disabled={salvando} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? .6 : 1 }}>
                  {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar parceiro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Usuário BPO */}
      {modal === "usuario" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Novo usuário BPO</h2>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 16 }}>
              Cria um usuário com acesso ao Portal do Parceiro BPO. Ele verá apenas os clientes vinculados ao parceiro selecionado.
            </p>
            {msg && <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 14, background: msg.ok ? "#F0FFF4" : "#FFF0F0", border: `0.5px solid ${msg.ok ? "#16A34A" : "#E24B4A"}`, fontSize: 13, color: msg.ok ? "#16A34A" : "#E24B4A" }}>{msg.txt}</div>}
            <form onSubmit={criarUsuarioBpo} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Parceiro BPO *</label>
                <select required value={uForm.parceiro_id} onChange={e => updU("parceiro_id", e.target.value)} style={inp}>
                  <option value="">Selecione...</option>
                  {parceiros.filter(p => p.ativo).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Nome completo *</label>
                <input required value={uForm.nome} onChange={e => updU("nome", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>E-mail de acesso *</label>
                <input required type="email" value={uForm.email} onChange={e => updU("email", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Senha provisória *</label>
                <input required value={uForm.senha} onChange={e => updU("senha", e.target.value)} style={inp} minLength={8} placeholder="Mínimo 8 caracteres" />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setModal(null)} style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button type="submit" disabled={salvando} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? .6 : 1 }}>
                  {salvando ? "Criando..." : "Criar usuário BPO"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
