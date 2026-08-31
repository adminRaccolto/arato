"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";

interface Cliente {
  id: string;         // conta_id
  nome: string;
  status?: string;
  pacote?: string;
  created_at?: string;
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

const FORM_VAZIO: NovoClienteForm = {
  tipo: "pf", nome: "", cpf_cnpj: "", email_cliente: "", municipio_cliente: "", estado_cliente: "MT",
  fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "MT", fazenda_area: "",
  user_nome: "", user_email: "", user_senha: "",
};

export default function BpoAdmin() {
  const { userRole, isBpo } = useAuth();
  const router = useRouter();
  const [clientes,    setClientes]    = useState<Cliente[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [form,        setForm]        = useState<NovoClienteForm>(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [resultado,   setResultado]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [busca,       setBusca]       = useState("");

  useEffect(() => {
    if (userRole === null) return;
    if (!isBpo) { router.push("/"); return; }
    carregarClientes();
  }, [userRole, isBpo, router]);

  async function carregarClientes() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const res = await fetch("/api/fazenda/listar-clientes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items: Cliente[] = (json.clientes ?? []).map((c: { conta_id: string; conta_nome: string; area_total: number; fazendas: unknown[] }) => ({
      id: c.conta_id,
      nome: c.conta_nome,
      fazendas_count: c.fazendas?.length ?? 0,
    }));
    setClientes(items);
    setLoading(false);
  }

  function upd(k: keyof NovoClienteForm, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function salvarNovoCliente(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setResultado(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/novo-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        setResultado({ ok: true, msg: `Cliente cadastrado com sucesso! E-mail: ${json.user_email}` });
        setForm(FORM_VAZIO);
        await carregarClientes();
      } else {
        setResultado({ ok: false, msg: json.error ?? "Erro desconhecido" });
      }
    } catch (err) {
      setResultado({ ok: false, msg: String(err) });
    } finally {
      setSalvando(false);
    }
  }

  const lista = clientes.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FA", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{
        background: "#fff", borderBottom: "0.5px solid #DDE2EE",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1A4870" }}>Arato</span>
          <span style={{ fontSize: 13, color: "#888" }}>Administração BPO</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/bpo/seletor-cliente")}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}
          >
            ← Selecionar cliente
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}
          >
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px" }}>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Clientes ativos", valor: clientes.length },
            { label: "Fazendas geridas", valor: clientes.reduce((s, c) => s + (c.fazendas_count ?? 0), 0) },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "16px 24px", flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1A4870" }}>{k.valor}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => { setModalAberto(true); setResultado(null); }}
              style={{
                background: "#1A4870", color: "#fff", border: "none", borderRadius: 8,
                padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              + Novo cliente
            </button>
          </div>
        </div>

        {/* Lista de clientes */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Meus clientes</span>
            <input
              type="text" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)}
              style={{ marginLeft: "auto", padding: "5px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 12, outline: "none", width: 200 }}
            />
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhum cliente cadastrado ainda.
            </div>
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
                {lista.map(c => (
                  <tr key={c.id} style={{ borderBottom: "0.5px solid #F0F4FA" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>{c.nome}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#666" }}>{c.fazendas_count ?? 0}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => {
                          localStorage.setItem("raccotlo_cliente_conta_id", c.id);
                          router.push("/bpo/seletor-cliente");
                        }}
                        style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "#1A4870" }}
                      >
                        Acessar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal — Novo cliente */}
      {modalAberto && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600,
            maxHeight: "90vh", overflowY: "auto", padding: 28,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Novo cliente</h2>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
            </div>

            {resultado && (
              <div style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: resultado.ok ? "#F0FFF4" : "#FFF0F0",
                border: `0.5px solid ${resultado.ok ? "#16A34A" : "#E24B4A"}`,
                fontSize: 13, color: resultado.ok ? "#16A34A" : "#E24B4A",
              }}>
                {resultado.msg}
              </div>
            )}

            <form onSubmit={salvarNovoCliente}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                {/* Tipo */}
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Tipo de produtor</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["pf", "pj"] as const).map(t => (
                      <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                        <input type="radio" checked={form.tipo === t} onChange={() => upd("tipo", t)} />
                        {t === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome do produtor *</label>
                  <input required value={form.nome} onChange={e => upd("nome", e.target.value)} style={inp} placeholder="Ex: João da Silva" />
                </div>

                <div>
                  <label style={lbl}>{form.tipo === "pf" ? "CPF" : "CNPJ"}</label>
                  <input value={form.cpf_cnpj} onChange={e => upd("cpf_cnpj", e.target.value)} style={inp} placeholder={form.tipo === "pf" ? "000.000.000-00" : "00.000.000/0000-00"} />
                </div>

                <div>
                  <label style={lbl}>E-mail do produtor</label>
                  <input type="email" value={form.email_cliente} onChange={e => upd("email_cliente", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Município</label>
                  <input value={form.municipio_cliente} onChange={e => upd("municipio_cliente", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Estado</label>
                  <input value={form.estado_cliente} onChange={e => upd("estado_cliente", e.target.value)} style={inp} maxLength={2} />
                </div>

                <div style={{ gridColumn: "1/-1", margin: "8px 0 4px", borderTop: "0.5px solid #DDE2EE", paddingTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Fazenda principal</span>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome da fazenda *</label>
                  <input required value={form.fazenda_nome} onChange={e => upd("fazenda_nome", e.target.value)} style={inp} placeholder="Ex: Fazenda Santa Maria" />
                </div>

                <div>
                  <label style={lbl}>Município da fazenda</label>
                  <input value={form.fazenda_municipio} onChange={e => upd("fazenda_municipio", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Estado da fazenda</label>
                  <input value={form.fazenda_estado} onChange={e => upd("fazenda_estado", e.target.value)} style={inp} maxLength={2} />
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Área total (ha)</label>
                  <input type="number" min="0" step="0.01" value={form.fazenda_area} onChange={e => upd("fazenda_area", e.target.value)} style={inp} />
                </div>

                <div style={{ gridColumn: "1/-1", margin: "8px 0 4px", borderTop: "0.5px solid #DDE2EE", paddingTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".05em" }}>Acesso do usuário</span>
                </div>

                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Nome completo *</label>
                  <input required value={form.user_nome} onChange={e => upd("user_nome", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>E-mail de acesso *</label>
                  <input required type="email" value={form.user_email} onChange={e => upd("user_email", e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Senha provisória *</label>
                  <input required value={form.user_senha} onChange={e => upd("user_senha", e.target.value)} style={inp} placeholder="Mínimo 8 caracteres" minLength={8} />
                </div>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setModalAberto(false)}
                  style={{ background: "none", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? .6 : 1 }}>
                  {salvando ? "Salvando..." : "Cadastrar cliente"}
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
