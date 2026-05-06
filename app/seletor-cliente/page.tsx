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

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };

export default function SeletorCliente() {
  const { userRole, selectFazenda } = useAuth();
  const router = useRouter();
  const [fazendas, setFazendas] = useState<FazendaItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busca,    setBusca]    = useState("");
  const [logoUrl,  setLogoUrl]  = useState("/Logo_Arato.png");

  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoUrl(data.publicUrl);
  }, []);

  // ── Modal Criar Novo Cliente ─────────────────────────────────────────────
  const [modalAberto,    setModalAberto]    = useState(false);
  const [criando,        setCriando]        = useState(false);
  const [resultado,      setResultado]      = useState<{ ok: boolean; email?: string; erro?: string } | null>(null);
  const [fCliente, setFCliente] = useState({
    tipo: "pj", nome: "", cpf_cnpj: "", email_cliente: "", telefone: "",
    municipio_cliente: "", estado_cliente: "",
    fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "", fazenda_area: "",
    user_nome: "", user_email: "", user_senha: "Arato@123",
  });

  function abrirModal() {
    setFCliente({ tipo: "pj", nome: "", cpf_cnpj: "", email_cliente: "", telefone: "", municipio_cliente: "", estado_cliente: "", fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "", fazenda_area: "", user_nome: "", user_email: "", user_senha: "Arato@123" });
    setResultado(null);
    setModalAberto(true);
  }

  async function criarCliente() {
    setCriando(true); setResultado(null);
    try {
      const res = await fetch("/api/admin/criar-cliente-interno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fCliente, onboarding_ativo: true }),
      });
      const json = await res.json();
      if (json.ok) {
        setResultado({ ok: true, email: fCliente.user_email });
        // Recarregar lista de fazendas após criar
        supabase.from("fazendas").select("id, nome, municipio, estado, area_total_ha")
          .eq("raccolto_acesso", true).order("nome")
          .then(({ data }) => setFazendas(data ?? []));
      } else {
        setResultado({ ok: false, erro: json.error ?? "Erro desconhecido" });
      }
    } catch (e) {
      setResultado({ ok: false, erro: String(e) });
    }
    setCriando(false);
  }

  // ── Carregar fazendas ────────────────────────────────────────────────────
  useEffect(() => {
    if (userRole === null) return;
    if (userRole !== "raccotlo") { router.push("/"); return; }
    supabase
      .from("fazendas")
      .select("id, nome, municipio, estado, area_total_ha")
      .eq("raccolto_acesso", true)
      .order("nome", { ascending: true })
      .then(({ data }) => { setFazendas(data ?? []); setLoading(false); });
  }, [userRole, router]);

  const lista = fazendas.filter(f =>
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.municipio ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const podeSubmeter = !criando && fCliente.nome.trim() && fCliente.fazenda_nome.trim() && fCliente.user_email.trim() && fCliente.user_senha.trim();

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FA", fontFamily: "system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #DDE2EE", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoUrl} alt="Arato" style={{ height: 32 }} />
          <span style={{ fontSize: 13, color: "#888", fontWeight: 400 }}>Acesso interno Raccolto</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={abrirModal}
            style={{ background: "#16A34A", border: "none", borderRadius: 7, padding: "7px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff" }}
          >
            + Novo Cliente
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
          style={{ width: "100%", padding: "10px 14px", marginBottom: 24, border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}
        />

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>
            Carregando clientes...
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
            {busca ? "Nenhum cliente encontrado para essa busca." : (
              <>
                Nenhum cliente autorizou o acesso ainda.{" "}
                <button onClick={abrirModal} style={{ background: "none", border: "none", color: "#16A34A", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                  Criar o primeiro →
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {lista.map(f => (
              <button
                key={f.id}
                onClick={() => selectFazenda(f.id, f.nome)}
                style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "20px 22px", cursor: "pointer", textAlign: "left", transition: "box-shadow 0.15s, border-color 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(26,92,56,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1A5C38"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#DDE2EE"; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#D5E8F5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 16, fontWeight: 700, color: "#1A4870" }}>
                  {f.nome.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{f.nome}</div>
                {(f.municipio || f.estado) && (
                  <div style={{ fontSize: 12, color: "#666" }}>{[f.municipio, f.estado].filter(Boolean).join(" — ")}</div>
                )}
                {f.area_total_ha ? (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{f.area_total_ha.toLocaleString("pt-BR")} ha</div>
                ) : null}
                <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: "#1A5C38", display: "flex", alignItems: "center", gap: 4 }}>
                  Acessar →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Criar Novo Cliente ── */}
      {modalAberto && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalAberto(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 740, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            {/* Header do modal */}
            <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>+ Novo Cliente</span>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
            </div>

            {resultado ? (
              /* ── Resultado ── */
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                {resultado.ok ? (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>Cliente criado com sucesso!</div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
                      Usuário <strong>{resultado.email}</strong> criado. O cliente receberá o e-mail com as credenciais de acesso.
                    </div>
                    <button
                      onClick={() => setModalAberto(false)}
                      style={{ padding: "10px 28px", background: "#16A34A", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                    >
                      Fechar
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>❌</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#E24B4A", marginBottom: 8 }}>Falha ao criar cliente</div>
                    <div style={{ fontSize: 12, color: "#791F1F", background: "#FFF0F0", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "12px 16px", marginBottom: 20, textAlign: "left", wordBreak: "break-word", lineHeight: 1.6 }}>
                      {resultado.erro}
                    </div>
                    <button
                      onClick={() => setResultado(null)}
                      style={{ padding: "9px 20px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer" }}
                    >
                      Tentar novamente
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* ── Formulário ── */
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>

                {/* Produtor */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>
                    Produtor / Empresa
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div>
                      <label style={lbl}>Tipo *</label>
                      <select value={fCliente.tipo} onChange={e => setFCliente(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                        <option value="pf">Pessoa Física</option>
                        <option value="pj">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Nome / Razão Social *</label>
                      <input style={inp} value={fCliente.nome} onChange={e => setFCliente(p => ({ ...p, nome: e.target.value }))} placeholder="Fazenda São João Ltda" />
                    </div>
                    <div>
                      <label style={lbl}>CPF / CNPJ</label>
                      <input style={inp} value={fCliente.cpf_cnpj} onChange={e => setFCliente(p => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
                    </div>
                    <div>
                      <label style={lbl}>E-mail</label>
                      <input style={inp} type="email" value={fCliente.email_cliente} onChange={e => setFCliente(p => ({ ...p, email_cliente: e.target.value }))} placeholder="produtor@fazenda.com" />
                    </div>
                    <div>
                      <label style={lbl}>Telefone</label>
                      <input style={inp} value={fCliente.telefone} onChange={e => setFCliente(p => ({ ...p, telefone: e.target.value }))} placeholder="(65) 99999-0000" />
                    </div>
                    <div>
                      <label style={lbl}>Município</label>
                      <input style={inp} value={fCliente.municipio_cliente} onChange={e => setFCliente(p => ({ ...p, municipio_cliente: e.target.value }))} placeholder="Nova Mutum" />
                    </div>
                    <div>
                      <label style={lbl}>Estado</label>
                      <input style={inp} value={fCliente.estado_cliente} onChange={e => setFCliente(p => ({ ...p, estado_cliente: e.target.value }))} placeholder="MT" maxLength={2} />
                    </div>
                  </div>
                </div>

                {/* Fazenda */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>
                    Fazenda
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Nome da Fazenda *</label>
                      <input style={inp} value={fCliente.fazenda_nome} onChange={e => setFCliente(p => ({ ...p, fazenda_nome: e.target.value }))} placeholder="Fazenda Santa Cruz" />
                    </div>
                    <div>
                      <label style={lbl}>Estado</label>
                      <input style={inp} value={fCliente.fazenda_estado} onChange={e => setFCliente(p => ({ ...p, fazenda_estado: e.target.value }))} placeholder="MT" maxLength={2} />
                    </div>
                    <div>
                      <label style={lbl}>Área (ha)</label>
                      <input style={inp} type="number" value={fCliente.fazenda_area} onChange={e => setFCliente(p => ({ ...p, fazenda_area: e.target.value }))} placeholder="1500" />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Município da Fazenda</label>
                      <input style={inp} value={fCliente.fazenda_municipio} onChange={e => setFCliente(p => ({ ...p, fazenda_municipio: e.target.value }))} placeholder="Sorriso" />
                    </div>
                  </div>
                </div>

                {/* Usuário */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>
                    Usuário de Acesso ao Arato
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div>
                      <label style={lbl}>Nome do usuário *</label>
                      <input style={inp} value={fCliente.user_nome} onChange={e => setFCliente(p => ({ ...p, user_nome: e.target.value }))} placeholder="João da Silva" />
                    </div>
                    <div>
                      <label style={lbl}>E-mail de login *</label>
                      <input style={inp} type="email" value={fCliente.user_email} onChange={e => setFCliente(p => ({ ...p, user_email: e.target.value }))} placeholder="joao@fazenda.com" />
                    </div>
                    <div>
                      <label style={lbl}>Senha provisória *</label>
                      <input style={inp} value={fCliente.user_senha} onChange={e => setFCliente(p => ({ ...p, user_senha: e.target.value }))} placeholder="Arato@123" />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#FBF3E0", borderRadius: 8, fontSize: 11, color: "#7A5A12" }}>
                    O cliente receberá um e-mail com as credenciais e será obrigado a criar uma nova senha no primeiro acesso.
                  </div>
                </div>

                {/* Botões */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4, paddingBottom: 4 }}>
                  <button
                    onClick={() => setModalAberto(false)}
                    style={{ padding: "9px 20px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={criarCliente}
                    disabled={!podeSubmeter}
                    style={{ padding: "9px 24px", background: podeSubmeter ? "#16A34A" : "#DDE2EE", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: podeSubmeter ? "pointer" : "default" }}
                  >
                    {criando ? "Criando..." : "Criar Cliente"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
