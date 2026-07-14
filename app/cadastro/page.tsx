"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PLANOS_DEFAULT, fmtPreco } from "../../lib/planos";
import type { PlanoId } from "../../lib/planos";

const ORDEM: PlanoId[] = ["essencial", "gestao", "performance"];

const COR_PLANO: Record<PlanoId, { borda: string; badge: string; btn: string }> = {
  essencial:   { borda: "var(--border-table)", badge: "#F3F6F9", btn: "#1A4870" },
  gestao:      { borda: "#1A4870", badge: "#1A4870", btn: "#1A4870" },
  performance: { borda: "#C9921B", badge: "#C9921B", btn: "#C9921B" },
};

function mascaraCpfCnpj(v: string) {
  const n = v.replace(/\D/g, "");
  if (n.length <= 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").replace(/(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3").replace(/(\d{3})(\d{1,3})$/, "$1.$2");
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})$/, "$1.$2.$3/$4").replace(/(\d{2})(\d{3})(\d{1,3})$/, "$1.$2.$3").replace(/(\d{2})(\d{1,3})$/, "$1.$2");
}

function mascaraTelefone(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length === 0)  return "";
  if (n.length <= 2)   return `(${n}`;
  if (n.length <= 6)   return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10)  return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function CadastroInner() {
  const params = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [plano, setPlano] = useState<PlanoId>((params.get("plano") as PlanoId) || "gestao");

  const [form, setForm] = useState({
    nome: "", email: "", senha: "", confirmaSenha: "",
    cpf_cnpj: "", telefone: "",
    nome_fazenda: "", cidade: "", estado: "MT",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    ok: boolean; conta_id?: string; trial_dias?: number; trial_fim?: string;
    invoice_url?: string | null; pix_payload?: string | null; error?: string;
  } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);

  const p = PLANOS_DEFAULT[plano];
  const c = COR_PLANO[plano];

  function setF(campo: string, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErros(prev => { const e = { ...prev }; delete e[campo]; return e; });
  }

  function validarStep2() {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome obrigatório";
    if (!form.email.trim() || !form.email.includes("@")) e.email = "E-mail inválido";
    if (form.senha.length < 8) e.senha = "Mínimo 8 caracteres";
    if (form.senha !== form.confirmaSenha) e.confirmaSenha = "Senhas não conferem";
    const cpfLimpo = form.cpf_cnpj.replace(/\D/g, "");
    if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) e.cpf_cnpj = "CPF (11 dígitos) ou CNPJ (14 dígitos)";
    if (!form.nome_fazenda.trim()) e.nome_fazenda = "Nome da fazenda obrigatório";
    return e;
  }

  async function enviar() {
    const e = validarStep2();
    if (Object.keys(e).length) { setErros(e); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plano_id: plano }),
      });
      const data = await res.json();
      setResultado(data);
      if (data.ok) setStep(3);
      else setErros({ geral: data.error ?? "Erro ao criar conta" });
    } catch {
      setErros({ geral: "Erro de conexão. Tente novamente." });
    } finally {
      setLoading(false);
    }
  }

  function copiarPix() {
    if (resultado?.pix_payload) {
      navigator.clipboard.writeText(resultado.pix_payload);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 3000);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "var(--bg-page)", minHeight: "100vh" }}>

      {/* Navbar */}
      <nav style={{
        background: "var(--bg-card)", borderBottom: "0.5px solid #D4DCE8",
        padding: "0 32px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <Link href="/planos">
          <Image src="https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logoshttps://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Arato_Nova.png" alt="Arato" width={82} height={34} priority style={{ objectFit: "contain", cursor: "pointer" }} />
        </Link>
        <Link href="/login" style={{ fontSize: 13, color: "var(--text-2)", textDecoration: "none", padding: "7px 16px", border: "0.5px solid #D4DCE8", borderRadius: 8 }}>
          Já tenho conta
        </Link>
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 36 }}>
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: s < 3 ? 1 : undefined }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: step > s ? "#16A34A" : step === s ? "#1A4870" : "#E4EAF3",
                color: step >= s ? "#fff" : "var(--text-3)",
              }}>
                {step > s ? "✓" : s}
              </div>
              {i < 2 && (
                <div style={{ flex: 1, height: 2, background: step > s ? "#16A34A" : "#E4EAF3", margin: "0 4px" }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: -28, marginBottom: 32, padding: "0 0" }}>
          <span style={{ fontSize: 11, color: step === 1 ? "#1A4870" : "var(--text-3)", fontWeight: step === 1 ? 700 : 400 }}>Plano</span>
          <span style={{ fontSize: 11, color: step === 2 ? "#1A4870" : "var(--text-3)", fontWeight: step === 2 ? 700 : 400 }}>Seus dados</span>
          <span style={{ fontSize: 11, color: step === 3 ? "#1A4870" : "var(--text-3)", fontWeight: step === 3 ? 700 : 400 }}>Confirmação</span>
        </div>

        {/* ── PASSO 1 — Seleção de plano ── */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 6px" }}>Escolha seu plano</h1>
            <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 24px" }}>14 dias grátis, sem cartão de crédito</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ORDEM.map(pid => {
                const pp = PLANOS_DEFAULT[pid];
                const cc = COR_PLANO[pid];
                const selecionado = plano === pid;
                return (
                  <div key={pid} onClick={() => setPlano(pid)} style={{
                    border: `${selecionado ? "2px" : "0.5px"} solid ${selecionado ? cc.borda : "var(--border-table)"}`,
                    borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                    background: selecionado ? (pid === "gestao" ? "#F0F7FF" : pid === "performance" ? "#FEFCF5" : "#F8FAFF") : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    transition: "all 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: `2px solid ${selecionado ? cc.btn : "var(--border-table)"}`,
                        background: selecionado ? cc.btn : "var(--bg-card)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {selecionado && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bg-card)" }} />}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50" }}>{pp.nome}</span>
                          {pid === "gestao" && <span style={{ fontSize: 10, background: "#1A4870", color: "#fff", borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>Popular</span>}
                          {pid === "performance" && <span style={{ fontSize: 10, background: "#C9921B", color: "#fff", borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>Completo</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{pp.descricao}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#0B2D50" }}>{fmtPreco(pp.preco_mensal)}<span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>/mês</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setStep(2)}
              style={{
                width: "100%", marginTop: 24, padding: "14px 0",
                background: c.btn, color: "#fff", border: "none",
                borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Continuar com {p.nome} →
            </button>

            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", marginTop: 12 }}>
              14 dias grátis · sem cartão · cancele quando quiser
            </p>
          </div>
        )}

        {/* ── PASSO 2 — Dados da conta ── */}
        {step === 2 && (
          <div>
            {/* Resumo do plano */}
            <div style={{ background: "#F0F7FF", border: "0.5px solid #1A4870", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>Plano selecionado: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>{p.nome}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50" }}>{fmtPreco(p.preco_mensal)}/mês</span>
                <button onClick={() => setStep(1)} style={{ fontSize: 12, color: "#1A4870", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Trocar</button>
              </div>
            </div>

            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 6px" }}>Seus dados</h1>
            <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 24px" }}>Crie sua conta — leva menos de 2 minutos</p>

            {erros.geral && (
              <div style={{ background: "#FEF2F2", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B91C1C" }}>
                {erros.geral}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Campo label="Seu nome completo *" erro={erros.nome}>
                  <input value={form.nome} onChange={e => setF("nome", e.target.value)}
                    placeholder="João Silva" style={inputStyle(!!erros.nome)} />
                </Campo>
                <Campo label="E-mail *" erro={erros.email}>
                  <input type="email" value={form.email} onChange={e => setF("email", e.target.value)}
                    placeholder="joao@fazenda.com.br" style={inputStyle(!!erros.email)} />
                </Campo>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Campo label="Senha *" erro={erros.senha}>
                  <input type="password" value={form.senha} onChange={e => setF("senha", e.target.value)}
                    placeholder="Mínimo 8 caracteres" style={inputStyle(!!erros.senha)} />
                </Campo>
                <Campo label="Confirmar senha *" erro={erros.confirmaSenha}>
                  <input type="password" value={form.confirmaSenha} onChange={e => setF("confirmaSenha", e.target.value)}
                    placeholder="Repita a senha" style={inputStyle(!!erros.confirmaSenha)} />
                </Campo>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Campo label="CPF ou CNPJ *" erro={erros.cpf_cnpj}>
                  <input value={form.cpf_cnpj}
                    onChange={e => setF("cpf_cnpj", mascaraCpfCnpj(e.target.value))}
                    maxLength={18}
                    placeholder="000.000.000-00" style={inputStyle(!!erros.cpf_cnpj)} />
                </Campo>
                <Campo label="Telefone / WhatsApp">
                  <input value={form.telefone}
                    onChange={e => setF("telefone", mascaraTelefone(e.target.value))}
                    maxLength={15}
                    placeholder="(66) 99999-9999" style={inputStyle(false)} />
                </Campo>
              </div>

              <div style={{ height: 1, background: "var(--bg-tag)" }} />

              <Campo label="Nome da fazenda *" erro={erros.nome_fazenda}>
                <input value={form.nome_fazenda} onChange={e => setF("nome_fazenda", e.target.value)}
                  placeholder="Fazenda Santa Fé" style={inputStyle(!!erros.nome_fazenda)} />
              </Campo>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 12 }}>
                <Campo label="Cidade">
                  <input value={form.cidade} onChange={e => setF("cidade", e.target.value)}
                    placeholder="Nova Mutum" style={inputStyle(false)} />
                </Campo>
                <Campo label="Estado">
                  <select value={form.estado} onChange={e => setF("estado", e.target.value)} style={{ ...inputStyle(false), appearance: "none" }}>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </Campo>
              </div>

            </div>

            <button
              onClick={enviar}
              disabled={loading}
              style={{
                width: "100%", marginTop: 24, padding: "14px 0",
                background: loading ? "#9BB5CC" : c.btn, color: "#fff", border: "none",
                borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Criando sua conta..." : "Criar conta grátis →"}
            </button>

            <p style={{ textAlign: "center", fontSize: 11, color: "#999", marginTop: 12, lineHeight: 1.6 }}>
              Ao criar sua conta você concorda com os Termos de Uso.<br />
              Sem cartão de crédito. Trial de {p.trial_dias} dias.
            </p>
          </div>
        )}

        {/* ── PASSO 3 — Confirmação / PIX ── */}
        {step === 3 && resultado?.ok && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>
                ✓
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 8px" }}>Conta criada com sucesso!</h1>
              <p style={{ fontSize: 14, color: "var(--text-2)", margin: 0 }}>
                Seu trial de <strong>{resultado.trial_dias} dias</strong> começa agora.
                {resultado.trial_fim && ` Vence em ${new Date(resultado.trial_fim + "T12:00:00").toLocaleDateString("pt-BR")}.`}
              </p>
            </div>

            {/* PIX */}
            {resultado.pix_payload ? (
              <div style={{ background: "var(--bg-card)", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50" }}>Primeira mensalidade — PIX</div>
                    <div style={{ fontSize: 12, color: "#666" }}>Vence ao final do trial · {fmtPreco(p.preco_mensal)}/mês</div>
                  </div>
                </div>
                <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 12px", fontSize: 11, fontFamily: "monospace", color: "#333", wordBreak: "break-all", marginBottom: 10, lineHeight: 1.5 }}>
                  {resultado.pix_payload}
                </div>
                <button onClick={copiarPix} style={{
                  width: "100%", padding: "10px 0",
                  background: pixCopiado ? "#16A34A" : "#1A4870",
                  color: "#fff", border: "none", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                  {pixCopiado ? "✓ Copiado!" : "Copiar código PIX"}
                </button>
              </div>
            ) : resultado.invoice_url ? (
              <div style={{ background: "var(--bg-card)", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50", marginBottom: 8 }}>Link de pagamento</div>
                <a href={resultado.invoice_url} target="_blank" rel="noreferrer"
                  style={{ display: "block", textAlign: "center", padding: "10px 0", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                  Acessar link de pagamento →
                </a>
              </div>
            ) : (
              <div style={{ background: "#FFF9F0", border: "0.5px solid #C9921B", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 13, color: "#92400E" }}>
                O link de pagamento será enviado por e-mail para <strong>{form.email}</strong>.
              </div>
            )}

            <div style={{ background: "#F0F7FF", border: "0.5px solid #D5E8F5", borderRadius: 10, padding: "14px 16px", marginBottom: 24, fontSize: 13, color: "#1A4870" }}>
              <strong>O que acontece agora?</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.8, color: "var(--text-2)" }}>
                <li>Você tem <strong>{resultado.trial_dias} dias</strong> para usar o Arato sem restrições</li>
                <li>Ao final do trial, o pagamento ativa sua assinatura automaticamente</li>
                <li>Sem pagamento: conta entra em modo somente leitura</li>
                <li>Nossa equipe entrará em contato para ajudar no onboarding</li>
              </ul>
            </div>

            <button
              onClick={() => router.push("/login")}
              style={{
                width: "100%", padding: "14px 0",
                background: c.btn, color: "#fff", border: "none",
                borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}
            >
              Entrar no Arato →
            </button>
          </div>
        )}

      </main>

      <footer style={{ textAlign: "center", padding: "20px", fontSize: 12, color: "var(--text-muted)", borderTop: "0.5px solid #D4DCE8", background: "var(--bg-card)" }}>
        © {new Date().getFullYear()} Arato — Gestão Agrícola
      </footer>
    </div>
  );
}

export default function CadastroPage() {
  return <Suspense><CadastroInner /></Suspense>;
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 5 }}>{label}</label>
      {children}
      {erro && <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 3 }}>{erro}</div>}
    </div>
  );
}

function inputStyle(erro: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `0.5px solid ${erro ? "#E24B4A" : "var(--border-table)"}`,
    fontSize: 13, outline: "none", background: "var(--bg-card)",
    boxSizing: "border-box",
  };
}
