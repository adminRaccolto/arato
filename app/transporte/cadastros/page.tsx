"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Transportadora {
  id: string; fazenda_id: string;
  razao_social: string; nome_fantasia?: string;
  cnpj?: string; cpf?: string; ie?: string;
  rntrc?: string;
  cep?: string; logradouro?: string; numero?: string; bairro?: string;
  municipio?: string; uf?: string;
  telefone?: string; email?: string;
  ativa: boolean; obs?: string;
}
interface Veiculo {
  id: string; fazenda_id: string;
  placa: string; uf_placa?: string;
  renavam?: string;
  tipo: string;            // truck, bitrem, rodotrem, carreta, toco, vanderleia, etc.
  tipo_carroceria?: string; // graneleiro, basculante, plataforma, baú, tanque
  tara_kg?: number; cap_kg?: number;
  marca?: string; modelo?: string; ano_fab?: number; cor?: string;
  rntrc?: string;          // se TAC (transportador autônomo)
  transportadora_id?: string;
  motorista_habitual_id?: string;
  ativo: boolean; obs?: string;
}
interface Motorista {
  id: string; fazenda_id: string;
  nome: string; cpf?: string;
  cnh_numero?: string; cnh_categoria?: string; cnh_uf?: string; cnh_validade?: string;
  transportadora_id?: string;
  telefone?: string; email?: string;
  ativo: boolean; obs?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #CDD5E0", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 4 };
const btnV: React.CSSProperties = { background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnR: React.CSSProperties = { background: "#F0F4FA", color: "#444", border: "0.5px solid #CDD5E0", borderRadius: 7, padding: "8px 18px", fontSize: 13, cursor: "pointer" };

type Aba = "transportadoras" | "veiculos" | "motoristas";

const TIPOS_VEICULO = [
  "Toco", "Truck", "Bitruck", "Carreta Simples", "Carreta LS", "Bitrem", "Rodotrem", "Vanderleia",
  "Romeu & Julieta", "Tritrem", "Utilitário", "Outro",
];
const TIPOS_CARROCERIA = ["Graneleiro", "Basculante", "Plataforma", "Baú", "Tanque", "Frigorífico", "Sider", "Outro"];
const CNH_CATS = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function diasParaVencerCnh(val?: string): number | null {
  if (!val) return null;
  return Math.floor((new Date(val).getTime() - Date.now()) / 86400000);
}

// ── Modal genérico ────────────────────────────────────────────────────────────
function Modal({ titulo, onClose, children, width = 720 }: { titulo: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{titulo}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Campo auxiliar ─────────────────────────────────────────────────────────────
function Campo({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={lbl}>{label}{required && <span style={{ color: "#E24B4A" }}> *</span>}</label>
      {children}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function TransporteCadastrosPage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<Aba>("transportadoras");

  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [veiculos,        setVeiculos]        = useState<Veiculo[]>([]);
  const [motoristas,      setMotoristas]      = useState<Motorista[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(true);

  // Modais
  const [modalT, setModalT] = useState<Partial<Transportadora> | null>(null);
  const [modalV, setModalV] = useState<Partial<Veiculo> | null>(null);
  const [modalM, setModalM] = useState<Partial<Motorista> | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from("transportadoras").select("*").eq("fazenda_id", fazendaId).order("razao_social"),
      supabase.from("veiculos").select("*").eq("fazenda_id", fazendaId).order("placa"),
      supabase.from("motoristas").select("*").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    if (r1.data) setTransportadoras(r1.data);
    if (r2.data) setVeiculos(r2.data);
    if (r3.data) setMotoristas(r3.data);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── CEP lookup ──────────────────────────────────────────────────────────────
  const buscarCep = async (cep: string, setter: (fn: (p: Partial<Transportadora>) => Partial<Transportadora>) => void) => {
    const c = cep.replace(/\D/g, "");
    if (c.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const d = await r.json();
      if (d.erro) return;
      setter(p => ({ ...p, logradouro: d.logradouro, bairro: d.bairro, municipio: d.localidade, uf: d.uf }));
    } catch { /* ignora */ }
  };

  // ── Salvar Transportadora ───────────────────────────────────────────────────
  const salvarT = async () => {
    if (!fazendaId || !modalT?.razao_social?.trim()) { alert("Razão Social é obrigatória."); return; }
    setSalvando(true);
    const pay = { ...modalT, fazenda_id: fazendaId, ativa: modalT.ativa ?? true };
    if (pay.id) {
      await supabase.from("transportadoras").update(pay).eq("id", pay.id);
    } else {
      await supabase.from("transportadoras").insert(pay);
    }
    await carregar();
    setModalT(null);
    setSalvando(false);
  };

  // ── Salvar Veículo ──────────────────────────────────────────────────────────
  const salvarV = async () => {
    if (!fazendaId || !modalV?.placa?.trim()) { alert("Placa é obrigatória."); return; }
    setSalvando(true);
    const pay = { ...modalV, fazenda_id: fazendaId, ativo: modalV.ativo ?? true, placa: (modalV.placa ?? "").toUpperCase() };
    if (pay.id) {
      await supabase.from("veiculos").update(pay).eq("id", pay.id);
    } else {
      await supabase.from("veiculos").insert(pay);
    }
    await carregar();
    setModalV(null);
    setSalvando(false);
  };

  // ── Salvar Motorista ────────────────────────────────────────────────────────
  const salvarM = async () => {
    if (!fazendaId || !modalM?.nome?.trim()) { alert("Nome é obrigatório."); return; }
    setSalvando(true);
    const pay = { ...modalM, fazenda_id: fazendaId, ativo: modalM.ativo ?? true };
    if (pay.id) {
      await supabase.from("motoristas").update(pay).eq("id", pay.id);
    } else {
      await supabase.from("motoristas").insert(pay);
    }
    await carregar();
    setModalM(null);
    setSalvando(false);
  };

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const buscaL = busca.toLowerCase();
  const transFilt = transportadoras
    .filter(t => !soAtivos || t.ativa)
    .filter(t => !buscaL || t.razao_social.toLowerCase().includes(buscaL) || (t.cnpj ?? "").includes(buscaL));
  const veicFilt = veiculos
    .filter(v => !soAtivos || v.ativo)
    .filter(v => !buscaL || v.placa.toLowerCase().includes(buscaL) || (v.tipo ?? "").toLowerCase().includes(buscaL));
  const motorFilt = motoristas
    .filter(m => !soAtivos || m.ativo)
    .filter(m => !buscaL || m.nome.toLowerCase().includes(buscaL) || (m.cnh_numero ?? "").includes(buscaL));

  // ── Helpers UI ───────────────────────────────────────────────────────────────
  const transNome = (id?: string) => transportadoras.find(t => t.id === id)?.razao_social ?? "—";
  const alertaCnh = (val?: string) => {
    const d = diasParaVencerCnh(val);
    if (d === null) return null;
    if (d < 0) return { cor: "#E24B4A", bg: "#FEF2F2", texto: "CNH VENCIDA" };
    if (d <= 30) return { cor: "#C9921B", bg: "#FBF3E0", texto: `Vence em ${d}d` };
    if (d <= 90) return { cor: "#EF9F27", bg: "#FFF8EC", texto: `Vence em ${d}d` };
    return null;
  };

  if (loading) return (<><TopNav /><div style={{ padding: 40, textAlign: "center", color: "#555" }}>Carregando…</div></>);

  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 28px", background: "#F4F6FA", minHeight: "100vh" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Cadastros de Transporte</h1>
            <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Transportadoras, veículos e motoristas — usados em NF-e, CT-e e MDF-e</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
              style={{ ...inp, width: 180 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "#555" }}>
              <input type="checkbox" checked={soAtivos} onChange={e => setSoAtivos(e.target.checked)} />
              Só ativos
            </label>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid #DDE2EE" }}>
          {([
            ["transportadoras", `Transportadoras (${transFilt.length})`],
            ["veiculos",        `Veículos / Caminhões (${veicFilt.length})`],
            ["motoristas",      `Motoristas (${motorFilt.length})`],
          ] as [Aba, string][]).map(([a, l]) => (
            <button key={a} onClick={() => { setAba(a); setBusca(""); }}
              style={{ padding: "10px 20px", border: "none", borderBottom: aba === a ? "2px solid #1A5CB8" : "2px solid transparent",
                background: "transparent", fontSize: 13, fontWeight: aba === a ? 700 : 400, color: aba === a ? "#1A5CB8" : "#555", cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── Transportadoras ── */}
        {aba === "transportadoras" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button style={btnV} onClick={() => setModalT({ ativa: true })}>+ Nova Transportadora</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6FB" }}>
                    {["Razão Social / Nome Fantasia", "CNPJ / CPF", "IE", "RNTRC", "Município / UF", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transFilt.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                      Nenhuma transportadora cadastrada. Clique em "+ Nova Transportadora".
                    </td></tr>
                  ) : transFilt.map((t, i) => (
                    <tr key={t.id} style={{ borderBottom: i < transFilt.length - 1 ? "0.5px solid #EEF1F7" : "none" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{t.razao_social}</div>
                        {t.nome_fantasia && <div style={{ fontSize: 11, color: "#666" }}>{t.nome_fantasia}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{t.cnpj ?? t.cpf ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{t.ie ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{t.rntrc ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{t.municipio ? `${t.municipio} - ${t.uf}` : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                          background: t.ativa ? "#ECFDF5" : "#F4F6FA", color: t.ativa ? "#16A34A" : "#888" }}>
                          {t.ativa ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ ...btnR, padding: "4px 12px", fontSize: 11 }} onClick={() => setModalT(t)}>Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Veículos ── */}
        {aba === "veiculos" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button style={btnV} onClick={() => setModalV({ ativo: true })}>+ Novo Veículo</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6FB" }}>
                    {["Placa", "Tipo", "Carroceria", "Tara / Cap.", "RENAVAM", "Transportadora", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {veicFilt.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                      Nenhum veículo cadastrado. Clique em "+ Novo Veículo".
                    </td></tr>
                  ) : veicFilt.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: i < veicFilt.length - 1 ? "0.5px solid #EEF1F7" : "none" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "monospace", letterSpacing: 1 }}>{v.placa}</div>
                        {v.uf_placa && <div style={{ fontSize: 10, color: "#666" }}>{v.uf_placa} · {v.marca ?? ""} {v.modelo ?? ""} {v.ano_fab ?? ""}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{v.tipo}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{v.tipo_carroceria ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        {v.tara_kg ? `${(v.tara_kg / 1000).toFixed(1)} t` : "—"}
                        {v.cap_kg  ? <span style={{ color: "#666" }}> / {(v.cap_kg / 1000).toFixed(0)} t</span> : ""}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{v.renavam ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{transNome(v.transportadora_id)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                          background: v.ativo ? "#ECFDF5" : "#F4F6FA", color: v.ativo ? "#16A34A" : "#888" }}>
                          {v.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ ...btnR, padding: "4px 12px", fontSize: 11 }} onClick={() => setModalV(v)}>Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Motoristas ── */}
        {aba === "motoristas" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button style={btnV} onClick={() => setModalM({ ativo: true })}>+ Novo Motorista</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6FB" }}>
                    {["Nome", "CPF", "CNH / Categoria / UF", "Validade CNH", "Transportadora", "Telefone", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {motorFilt.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                      Nenhum motorista cadastrado. Clique em "+ Novo Motorista".
                    </td></tr>
                  ) : motorFilt.map((m, i) => {
                    const alerta = alertaCnh(m.cnh_validade);
                    return (
                      <tr key={m.id} style={{ borderBottom: i < motorFilt.length - 1 ? "0.5px solid #EEF1F7" : "none" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{m.nome}</div>
                          {m.email && <div style={{ fontSize: 11, color: "#666" }}>{m.email}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{m.cpf ?? "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>
                          <span style={{ fontFamily: "monospace" }}>{m.cnh_numero ?? "—"}</span>
                          {m.cnh_categoria && <span style={{ marginLeft: 6, background: "#EBF3FF", color: "#1A5CB8", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{m.cnh_categoria}</span>}
                          {m.cnh_uf && <span style={{ marginLeft: 4, fontSize: 10, color: "#666" }}>{m.cnh_uf}</span>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {m.cnh_validade ? (
                            <div>
                              <div style={{ fontSize: 12 }}>{m.cnh_validade.split("-").reverse().join("/")}</div>
                              {alerta && (
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600, background: alerta.bg, color: alerta.cor }}>
                                  {alerta.texto}
                                </span>
                              )}
                            </div>
                          ) : <span style={{ fontSize: 12, color: "#aaa" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>{transNome(m.transportadora_id)}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>{m.telefone ?? "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                            background: m.ativo ? "#ECFDF5" : "#F4F6FA", color: m.ativo ? "#16A34A" : "#888" }}>
                            {m.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <button style={{ ...btnR, padding: "4px 12px", fontSize: 11 }} onClick={() => setModalM(m)}>Editar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══ MODAL TRANSPORTADORA ══ */}
      {modalT && (
        <Modal titulo={modalT.id ? "Editar Transportadora" : "Nova Transportadora"} onClose={() => setModalT(null)} width={800}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <Campo label="Razão Social" required>
                <input style={inp} value={modalT.razao_social ?? ""} onChange={e => setModalT(p => ({ ...p!, razao_social: e.target.value }))} placeholder="Transportes XYZ Ltda" />
              </Campo>
              <Campo label="Nome Fantasia">
                <input style={inp} value={modalT.nome_fantasia ?? ""} onChange={e => setModalT(p => ({ ...p!, nome_fantasia: e.target.value }))} />
              </Campo>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Campo label="CNPJ">
                <input style={inp} value={modalT.cnpj ?? ""} onChange={e => setModalT(p => ({ ...p!, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
              </Campo>
              <Campo label="CPF (autônomo)">
                <input style={inp} value={modalT.cpf ?? ""} onChange={e => setModalT(p => ({ ...p!, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </Campo>
              <Campo label="Inscrição Estadual">
                <input style={inp} value={modalT.ie ?? ""} onChange={e => setModalT(p => ({ ...p!, ie: e.target.value }))} placeholder="IE" />
              </Campo>
              <Campo label="RNTRC">
                <input style={inp} value={modalT.rntrc ?? ""} onChange={e => setModalT(p => ({ ...p!, rntrc: e.target.value }))} placeholder="12345678" />
              </Campo>
            </div>

            <div style={{ padding: "12px 16px", background: "#F4F6FA", borderRadius: 8, border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Endereço</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Campo label="CEP">
                  <input style={inp} value={modalT.cep ?? ""} onChange={e => setModalT(p => ({ ...p!, cep: e.target.value }))}
                    onBlur={e => buscarCep(e.target.value, setModalT as never)} placeholder="00000-000" />
                </Campo>
                <Campo label="Logradouro">
                  <input style={inp} value={modalT.logradouro ?? ""} onChange={e => setModalT(p => ({ ...p!, logradouro: e.target.value }))} />
                </Campo>
                <Campo label="Número">
                  <input style={inp} value={modalT.numero ?? ""} onChange={e => setModalT(p => ({ ...p!, numero: e.target.value }))} />
                </Campo>
                <Campo label="Bairro">
                  <input style={inp} value={modalT.bairro ?? ""} onChange={e => setModalT(p => ({ ...p!, bairro: e.target.value }))} />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
                <Campo label="Município">
                  <input style={inp} value={modalT.municipio ?? ""} onChange={e => setModalT(p => ({ ...p!, municipio: e.target.value }))} />
                </Campo>
                <Campo label="UF">
                  <select style={inp} value={modalT.uf ?? ""} onChange={e => setModalT(p => ({ ...p!, uf: e.target.value }))}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
                <Campo label="Telefone">
                  <input style={inp} value={modalT.telefone ?? ""} onChange={e => setModalT(p => ({ ...p!, telefone: e.target.value }))} placeholder="(65) 99999-9999" />
                </Campo>
                <Campo label="E-mail">
                  <input style={inp} value={modalT.email ?? ""} onChange={e => setModalT(p => ({ ...p!, email: e.target.value }))} />
                </Campo>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={modalT.ativa ?? true} onChange={e => setModalT(p => ({ ...p!, ativa: e.target.checked }))} />
                Ativa
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnR} onClick={() => setModalT(null)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarT}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL VEÍCULO ══ */}
      {modalV && (
        <Modal titulo={modalV.id ? "Editar Veículo" : "Novo Veículo"} onClose={() => setModalV(null)} width={800}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
              <Campo label="Placa" required>
                <input style={{ ...inp, fontFamily: "monospace", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}
                  value={modalV.placa ?? ""} onChange={e => setModalV(p => ({ ...p!, placa: e.target.value.toUpperCase() }))} placeholder="ABC1D23" maxLength={8} />
              </Campo>
              <Campo label="UF Placa">
                <select style={inp} value={modalV.uf_placa ?? ""} onChange={e => setModalV(p => ({ ...p!, uf_placa: e.target.value }))}>
                  <option value="">—</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Campo>
              <Campo label="RENAVAM">
                <input style={inp} value={modalV.renavam ?? ""} onChange={e => setModalV(p => ({ ...p!, renavam: e.target.value }))} placeholder="00000000000" maxLength={11} />
              </Campo>
              <Campo label="RNTRC (se TAC)">
                <input style={inp} value={modalV.rntrc ?? ""} onChange={e => setModalV(p => ({ ...p!, rntrc: e.target.value }))} placeholder="12345678" />
              </Campo>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={modalV.ativo ?? true} onChange={e => setModalV(p => ({ ...p!, ativo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Campo label="Tipo de Veículo">
                <select style={inp} value={modalV.tipo ?? ""} onChange={e => setModalV(p => ({ ...p!, tipo: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {TIPOS_VEICULO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Tipo de Carroceria">
                <select style={inp} value={modalV.tipo_carroceria ?? ""} onChange={e => setModalV(p => ({ ...p!, tipo_carroceria: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {TIPOS_CARROCERIA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Tara (kg)">
                <input style={inp} type="number" min={0} value={modalV.tara_kg ?? ""} onChange={e => setModalV(p => ({ ...p!, tara_kg: parseFloat(e.target.value) || undefined }))} placeholder="Ex: 14000" />
              </Campo>
              <Campo label="Cap. de Carga (kg)">
                <input style={inp} type="number" min={0} value={modalV.cap_kg ?? ""} onChange={e => setModalV(p => ({ ...p!, cap_kg: parseFloat(e.target.value) || undefined }))} placeholder="Ex: 30000" />
              </Campo>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Campo label="Marca">
                <input style={inp} value={modalV.marca ?? ""} onChange={e => setModalV(p => ({ ...p!, marca: e.target.value }))} placeholder="Scania, Volvo, Mercedes…" />
              </Campo>
              <Campo label="Modelo">
                <input style={inp} value={modalV.modelo ?? ""} onChange={e => setModalV(p => ({ ...p!, modelo: e.target.value }))} placeholder="R 450, FH 540…" />
              </Campo>
              <Campo label="Ano Fab.">
                <input style={inp} type="number" min={1990} max={2030} value={modalV.ano_fab ?? ""} onChange={e => setModalV(p => ({ ...p!, ano_fab: parseInt(e.target.value) || undefined }))} />
              </Campo>
              <Campo label="Cor">
                <input style={inp} value={modalV.cor ?? ""} onChange={e => setModalV(p => ({ ...p!, cor: e.target.value }))} placeholder="Branco, Vermelho…" />
              </Campo>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo label="Transportadora proprietária">
                <select style={inp} value={modalV.transportadora_id ?? ""} onChange={e => setModalV(p => ({ ...p!, transportadora_id: e.target.value || undefined }))}>
                  <option value="">— proprietário autônomo —</option>
                  {transportadoras.filter(t => t.ativa).map(t => <option key={t.id} value={t.id}>{t.razao_social}</option>)}
                </select>
              </Campo>
              <Campo label="Motorista habitual">
                <select style={inp} value={modalV.motorista_habitual_id ?? ""} onChange={e => setModalV(p => ({ ...p!, motorista_habitual_id: e.target.value || undefined }))}>
                  <option value="">— nenhum —</option>
                  {motoristas.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </Campo>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnR} onClick={() => setModalV(null)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarV}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL MOTORISTA ══ */}
      {modalM && (
        <Modal titulo={modalM.id ? "Editar Motorista" : "Novo Motorista"} onClose={() => setModalM(null)} width={720}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <Campo label="Nome completo" required>
                <input style={inp} value={modalM.nome ?? ""} onChange={e => setModalM(p => ({ ...p!, nome: e.target.value }))} placeholder="João da Silva" />
              </Campo>
              <Campo label="CPF">
                <input style={inp} value={modalM.cpf ?? ""} onChange={e => setModalM(p => ({ ...p!, cpf: e.target.value }))} placeholder="000.000.000-00" maxLength={14} />
              </Campo>
            </div>

            <div style={{ padding: "12px 16px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #F0D888" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A5A12", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>CNH — Carteira Nacional de Habilitação</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
                <Campo label="Nº da CNH">
                  <input style={inp} value={modalM.cnh_numero ?? ""} onChange={e => setModalM(p => ({ ...p!, cnh_numero: e.target.value }))} placeholder="00000000000" maxLength={11} />
                </Campo>
                <Campo label="Categoria">
                  <select style={inp} value={modalM.cnh_categoria ?? ""} onChange={e => setModalM(p => ({ ...p!, cnh_categoria: e.target.value }))}>
                    <option value="">—</option>
                    {CNH_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Campo>
                <Campo label="UF Emissão">
                  <select style={inp} value={modalM.cnh_uf ?? ""} onChange={e => setModalM(p => ({ ...p!, cnh_uf: e.target.value }))}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
                <Campo label="Validade">
                  <input style={inp} type="date" value={modalM.cnh_validade ?? ""} onChange={e => setModalM(p => ({ ...p!, cnh_validade: e.target.value }))} />
                  {modalM.cnh_validade && (() => {
                    const a = alertaCnh(modalM.cnh_validade);
                    return a ? <div style={{ fontSize: 10, marginTop: 4, color: a.cor, fontWeight: 600 }}>{a.texto}</div> : null;
                  })()}
                </Campo>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
              <Campo label="Transportadora (CLT)">
                <select style={inp} value={modalM.transportadora_id ?? ""} onChange={e => setModalM(p => ({ ...p!, transportadora_id: e.target.value || undefined }))}>
                  <option value="">— autônomo —</option>
                  {transportadoras.filter(t => t.ativa).map(t => <option key={t.id} value={t.id}>{t.razao_social}</option>)}
                </select>
              </Campo>
              <Campo label="Telefone">
                <input style={inp} value={modalM.telefone ?? ""} onChange={e => setModalM(p => ({ ...p!, telefone: e.target.value }))} placeholder="(65) 99999-9999" />
              </Campo>
              <Campo label="E-mail">
                <input style={inp} value={modalM.email ?? ""} onChange={e => setModalM(p => ({ ...p!, email: e.target.value }))} />
              </Campo>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={modalM.ativo ?? true} onChange={e => setModalM(p => ({ ...p!, ativo: e.target.checked }))} />
                Ativo
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnR} onClick={() => setModalM(null)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarM}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
