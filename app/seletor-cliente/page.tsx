"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";

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
  fazendas: FazendaResumida[];
  area_total: number;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };

function initiais(s: string) {
  const partes = s.trim().split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return s.substring(0, 2).toUpperCase();
}

export default function SeletorCliente() {
  const { userRole, selectFazenda } = useAuth();
  const router = useRouter();
  const [clientes,  setClientes]  = useState<ClienteItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [expandido, setExpandido] = useState<string | null>(null); // conta_id com fazendas expandidas
  const [menuAberto, setMenuAberto] = useState<string | null>(null); // conta_id com menu ⋯ aberto
  const [removendo,  setRemovendoId] = useState<string | null>(null);
  const [logoUrl,   setLogoUrl]   = useState("/Logo_Arato.png");

  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoUrl(data.publicUrl);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const handler = () => setMenuAberto(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuAberto]);

  // ── Modal Criar Novo Cliente ─────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false);
  const [criando,     setCriando]     = useState(false);
  const [resultado,   setResultado]   = useState<{ ok: boolean; email?: string; erro?: string } | null>(null);
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
        carregarClientes();
      } else {
        setResultado({ ok: false, erro: json.error ?? "Erro desconhecido" });
      }
    } catch (e) {
      setResultado({ ok: false, erro: String(e) });
    }
    setCriando(false);
  }

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
    if (userRole !== "raccotlo") { router.push("/"); return; }
    carregarClientes();
  }, [userRole, router]);

  const lista = clientes.filter(c => {
    const q = busca.toLowerCase();
    if (!q) return true;
    if ((c.produtor_nome ?? "").toLowerCase().includes(q)) return true;
    if (c.conta_nome.toLowerCase().includes(q)) return true;
    if (c.fazendas.some(f =>
      f.nome.toLowerCase().includes(q) ||
      (f.municipio ?? "").toLowerCase().includes(q) ||
      (f.estado ?? "").toLowerCase().includes(q)
    )) return true;
    return false;
  });

  async function removerDoSeletor(c: ClienteItem) {
    if (!confirm(`Remover "${c.produtor_nome ?? c.conta_nome}" do seletor?\n\nOs dados NÃO serão excluídos — apenas o acesso Raccolto será revogado.`)) return;
    setRemovendoId(c.conta_id);
    setMenuAberto(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    try {
      await Promise.all(c.fazendas.map(f =>
        fetch("/api/fazenda/raccolto-acesso", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fazenda_id: f.id, ativo: false }),
        })
      ));
      setClientes(p => p.filter(x => x.conta_id !== c.conta_id));
    } finally {
      setRemovendoId(null);
    }
  }

  function acessar(c: ClienteItem, f: FazendaResumida) {
    selectFazenda(f.id, f.nome, c.produtor_nome);
  }

  function clicarCard(c: ClienteItem) {
    if (c.fazendas.length === 1) {
      acessar(c, c.fazendas[0]);
    } else {
      setExpandido(prev => prev === c.conta_id ? null : c.conta_id);
    }
  }

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
          <button onClick={abrirModal} style={{ background: "#16A34A", border: "none", borderRadius: 7, padding: "7px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff" }}>
            + Novo Cliente
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "#555" }}>
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
          Selecionar cliente
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 28px" }}>
          {lista.length} cliente{lista.length !== 1 ? "s" : ""} com acesso Raccolto ativo
        </p>

        <input
          type="text"
          placeholder="Buscar por nome, fazenda ou município..."
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {lista.map(c => {
              const nomeExibido = c.produtor_nome ?? c.conta_nome;
              const multiFazendas = c.fazendas.length > 1;
              const aberto = expandido === c.conta_id;

              return (
                <div
                  key={c.conta_id}
                  style={{
                    background: "#fff",
                    border: `0.5px solid ${aberto ? "#1A5C38" : "#DDE2EE"}`,
                    borderRadius: 12,
                    overflow: "visible",
                    boxShadow: aberto ? "0 4px 16px rgba(26,92,56,0.12)" : "0 1px 4px rgba(0,0,0,0.05)",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                    position: "relative",
                  }}
                >
                  {/* Botão ⋯ de opções (raccotlo) */}
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuAberto(menuAberto === c.conta_id ? null : c.conta_id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16, padding: "2px 6px", borderRadius: 5, lineHeight: 1 }}
                      title="Opções"
                    >⋯</button>
                    {menuAberto === c.conta_id && (
                      <div style={{ position: "absolute", right: 0, top: 24, background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.12)", minWidth: 180, zIndex: 20 }}>
                        <button
                          onClick={e => { e.stopPropagation(); removerDoSeletor(c); }}
                          disabled={removendo === c.conta_id}
                          style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#E24B4A", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
                        >
                          {removendo === c.conta_id ? "⟳ Removendo…" : "✕  Remover do seletor"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cabeçalho do card — clicável */}
                  <button
                    onClick={() => clicarCard(c)}
                    style={{ width: "100%", padding: "14px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Avatar */}
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#D5E8F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#1A4870", flexShrink: 0 }}>
                        {initiais(nomeExibido)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Nome principal */}
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {nomeExibido}
                        </div>
                        {/* Resumo de fazendas */}
                        {multiFazendas ? (
                          <div style={{ fontSize: 11, color: "#666" }}>
                            {c.fazendas.length} fazendas · {c.area_total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ha
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.fazendas[0].nome}
                            {(c.fazendas[0].municipio || c.fazendas[0].estado) ? ` · ${[c.fazendas[0].municipio, c.fazendas[0].estado].filter(Boolean).join("/")}` : ""}
                            {c.fazendas[0].area_total_ha ? ` · ${c.fazendas[0].area_total_ha.toLocaleString("pt-BR")} ha` : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rodapé do card */}
                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: "#1A5C38", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {multiFazendas
                        ? <span>{aberto ? "Fechar ▲" : "Selecionar fazenda ▼"}</span>
                        : <span>Acessar →</span>
                      }
                      {multiFazendas && (
                        <span style={{ fontSize: 10, background: "#D5E8F5", color: "#1A4870", borderRadius: 99, padding: "2px 7px", fontWeight: 700 }}>
                          {c.fazendas.length}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Lista de fazendas expandida (apenas multi-fazenda) */}
                  {multiFazendas && aberto && (
                    <div style={{ borderTop: "0.5px solid #E8EDF5", background: "#F8FAFC" }}>
                      {c.fazendas.map((f, i) => (
                        <button
                          key={f.id}
                          onClick={() => acessar(c, f)}
                          style={{
                            width: "100%",
                            padding: "9px 16px",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            borderTop: i > 0 ? "0.5px solid #E8EDF5" : "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#EEF5FF")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{f.nome}</div>
                            <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                              {[f.municipio, f.estado].filter(Boolean).join(" · ")}
                              {f.area_total_ha ? ` · ${f.area_total_ha.toLocaleString("pt-BR")} ha` : ""}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#1A5C38", flexShrink: 0 }}>Acessar →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Criar Novo Cliente ── */}
      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalAberto(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 740, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>+ Novo Cliente</span>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
            </div>

            {resultado ? (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                {resultado.ok ? (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>Cliente criado com sucesso!</div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
                      Usuário <strong>{resultado.email}</strong> criado. O cliente receberá o e-mail com as credenciais de acesso.
                    </div>
                    <button onClick={() => setModalAberto(false)} style={{ padding: "10px 28px", background: "#16A34A", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
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
                    <button onClick={() => setResultado(null)} style={{ padding: "9px 20px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer" }}>
                      Tentar novamente
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>

                {/* Produtor */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Produtor / Empresa</div>
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
                    <div><label style={lbl}>CPF / CNPJ</label><input style={inp} value={fCliente.cpf_cnpj} onChange={e => setFCliente(p => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="00.000.000/0001-00" /></div>
                    <div><label style={lbl}>E-mail</label><input style={inp} type="email" value={fCliente.email_cliente} onChange={e => setFCliente(p => ({ ...p, email_cliente: e.target.value }))} placeholder="produtor@fazenda.com" /></div>
                    <div><label style={lbl}>Telefone</label><input style={inp} value={fCliente.telefone} onChange={e => setFCliente(p => ({ ...p, telefone: e.target.value }))} placeholder="(65) 99999-0000" /></div>
                    <div><label style={lbl}>Município</label><input style={inp} value={fCliente.municipio_cliente} onChange={e => setFCliente(p => ({ ...p, municipio_cliente: e.target.value }))} placeholder="Nova Mutum" /></div>
                    <div><label style={lbl}>Estado</label><input style={inp} value={fCliente.estado_cliente} onChange={e => setFCliente(p => ({ ...p, estado_cliente: e.target.value }))} placeholder="MT" maxLength={2} /></div>
                  </div>
                </div>

                {/* Fazenda */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Fazenda</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}><label style={lbl}>Nome da Fazenda *</label><input style={inp} value={fCliente.fazenda_nome} onChange={e => setFCliente(p => ({ ...p, fazenda_nome: e.target.value }))} placeholder="Fazenda Santa Cruz" /></div>
                    <div><label style={lbl}>Estado</label><input style={inp} value={fCliente.fazenda_estado} onChange={e => setFCliente(p => ({ ...p, fazenda_estado: e.target.value }))} placeholder="MT" maxLength={2} /></div>
                    <div><label style={lbl}>Área (ha)</label><input style={inp} type="number" value={fCliente.fazenda_area} onChange={e => setFCliente(p => ({ ...p, fazenda_area: e.target.value }))} placeholder="1500" /></div>
                    <div style={{ gridColumn: "span 2" }}><label style={lbl}>Município da Fazenda</label><input style={inp} value={fCliente.fazenda_municipio} onChange={e => setFCliente(p => ({ ...p, fazenda_municipio: e.target.value }))} placeholder="Sorriso" /></div>
                  </div>
                </div>

                {/* Usuário */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Usuário de Acesso ao Arato</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div><label style={lbl}>Nome do usuário *</label><input style={inp} value={fCliente.user_nome} onChange={e => setFCliente(p => ({ ...p, user_nome: e.target.value }))} placeholder="João da Silva" /></div>
                    <div><label style={lbl}>E-mail de login *</label><input style={inp} type="email" value={fCliente.user_email} onChange={e => setFCliente(p => ({ ...p, user_email: e.target.value }))} placeholder="joao@fazenda.com" /></div>
                    <div><label style={lbl}>Senha provisória *</label><input style={inp} value={fCliente.user_senha} onChange={e => setFCliente(p => ({ ...p, user_senha: e.target.value }))} placeholder="Arato@123" /></div>
                  </div>
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#FBF3E0", borderRadius: 8, fontSize: 11, color: "#7A5A12" }}>
                    O cliente receberá um e-mail com as credenciais e será obrigado a criar uma nova senha no primeiro acesso.
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4, paddingBottom: 4 }}>
                  <button onClick={() => setModalAberto(false)} style={{ padding: "9px 20px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer" }}>Cancelar</button>
                  <button onClick={criarCliente} disabled={!podeSubmeter} style={{ padding: "9px 24px", background: podeSubmeter ? "#16A34A" : "#DDE2EE", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: podeSubmeter ? "pointer" : "default" }}>
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
