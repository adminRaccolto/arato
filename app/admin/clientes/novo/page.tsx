"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TipoConta = "pf" | "pj" | "grupo";
type StatusInicial = "trial" | "ativo";
type Pacote = "essencial" | "gestao" | "performance";

interface FormData {
  // Dados do cliente
  tipo:          TipoConta;
  nome:          string;
  cpf_cnpj:      string;
  email_cliente: string;
  telefone:      string;
  // Fazenda
  fazenda_nome:   string;
  fazenda_municipio: string;
  fazenda_estado: string;
  // Acesso
  user_senha:       string;
  user_senha_conf:  string;
  plano:            Pacote | "";
  status:           StatusInicial;
  data_inicio:      string;
  data_vencimento:  string;
  observacao:       string;
}

interface ResultadoCriacao {
  fazenda_id: string;
  conta_id: string;
  user_email: string;
  link?: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const PLANOS_CFG: Record<Pacote, { label: string; preco: number }> = {
  essencial:   { label: "Essencial — R$ 387/mês",   preco: 387   },
  gestao:      { label: "Gestão — R$ 1.197/mês",    preco: 1197  },
  performance: { label: "Performance — R$ 1.787/mês", preco: 1787 },
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px",
  border: "0.5px solid var(--border-table)", borderRadius: 8,
  fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "var(--text-2)", marginBottom: 5, display: "block", fontWeight: 600,
};

const secTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#0B1E35", marginBottom: 16,
  paddingBottom: 10, borderBottom: "0.5px solid var(--bg-tag)",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 28px", background: "#0B1E35", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 22px", background: "var(--bg-card)", color: "var(--text-2)",
  border: "0.5px solid var(--border-table)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function NovoClientePage() {
  const [salvando, setSalvando]         = useState(false);
  const [erro, setErro]                 = useState("");
  const [resultado, setResultado]       = useState<ResultadoCriacao | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [form, setForm] = useState<FormData>({
    tipo:            "pf",
    nome:            "",
    cpf_cnpj:        "",
    email_cliente:   "",
    telefone:        "",
    fazenda_nome:    "",
    fazenda_municipio: "",
    fazenda_estado:  "MT",
    user_senha:      "",
    user_senha_conf: "",
    plano:           "gestao",
    status:          "trial",
    data_inicio:     new Date().toISOString().split("T")[0],
    data_vencimento: (() => {
      const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split("T")[0];
    })(),
    observacao: "",
  });

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function criar() {
    setErro("");

    // Validações básicas
    if (!form.nome.trim())          { setErro("Nome do cliente é obrigatório."); return; }
    if (!form.email_cliente.trim()) { setErro("E-mail é obrigatório."); return; }
    if (!form.fazenda_nome.trim())  { setErro("Nome da fazenda é obrigatório."); return; }
    if (!form.user_senha.trim())    { setErro("Senha é obrigatória."); return; }
    if (form.user_senha !== form.user_senha_conf) { setErro("As senhas não coincidem."); return; }
    if (form.user_senha.length < 8) { setErro("A senha deve ter pelo menos 8 caracteres."); return; }

    setSalvando(true);

    const payload = {
      tipo:              form.tipo,
      nome:              form.nome.trim(),
      cpf_cnpj:          form.cpf_cnpj.trim(),
      email_cliente:     form.email_cliente.trim().toLowerCase(),
      telefone:          form.telefone.trim(),
      fazenda_nome:      form.fazenda_nome.trim(),
      fazenda_municipio: form.fazenda_municipio.trim(),
      fazenda_estado:    form.fazenda_estado,
      user_nome:         form.nome.trim(),
      user_email:        form.email_cliente.trim().toLowerCase(),
      user_senha:        form.user_senha,
      onboarding_ativo:  true,
      plano:             form.plano || undefined,
      status:            form.status,
      data_inicio:       form.data_inicio || undefined,
      data_vencimento:   form.data_vencimento || undefined,
      observacao:        form.observacao || undefined,
    };

    try {
      // Busca token fresco — getSession() faz refresh automático se expirado
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/admin/novo-cliente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setErro(json.error ?? json.message ?? `Erro ${res.status}`);
        return;
      }

      setResultado({
        fazenda_id: json.fazenda_id ?? json.fazendaId ?? "—",
        conta_id:   json.conta_id   ?? json.contaId   ?? "—",
        user_email: payload.user_email,
        link:       json.link ?? `https://arato.agr.br/login?email=${encodeURIComponent(payload.user_email)}`,
      });
    } catch (e) {
      setErro(`Erro de conexão: ${String(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  function criarOutro() {
    setResultado(null);
    setErro("");
    setForm(prev => ({
      ...prev,
      nome: "", cpf_cnpj: "", email_cliente: "", telefone: "",
      fazenda_nome: "", fazenda_municipio: "",
      user_senha: "", user_senha_conf: "", observacao: "",
    }));
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, maxWidth: 640 }}>
        <div style={{ background: "#F0FDF4", border: "0.5px solid #16A34A40", borderRadius: 14, padding: "28px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#16A34A", marginBottom: 6 }}>
            Cliente criado com sucesso!
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 24 }}>
            O acesso foi configurado e o cliente já pode fazer login.
          </div>

          <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "18px 20px", textAlign: "left", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1E35", marginBottom: 14, borderBottom: "0.5px solid var(--bg-tag)", paddingBottom: 10 }}>
              Dados da conta criada
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Conta ID</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "#333", background: "var(--bg-page)", padding: "4px 8px", borderRadius: 6 }}>{resultado.conta_id}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Fazenda ID</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "#333", background: "var(--bg-page)", padding: "4px 8px", borderRadius: 6 }}>{resultado.fazenda_id}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>E-mail de acesso</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1E35" }}>{resultado.user_email}</div>
              </div>
              {resultado.link && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Link de acesso</div>
                  <a href={resultado.link} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#378ADD", wordBreak: "break-all", textDecoration: "none" }}>
                    {resultado.link} ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <a href={`/admin/clientes`}
              style={{ ...btnSecondary, textDecoration: "none", display: "inline-block" }}>
              ← Ver todos os clientes
            </a>
            <button style={btnPrimary} onClick={criarOutro}>
              + Criar outro cliente
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
            Novo Cliente
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
            Criação manual de conta pelo painel admin
          </p>
        </div>
        <a href="/admin/clientes" style={{ ...btnSecondary, textDecoration: "none", display: "inline-block" }}>
          ← Voltar
        </a>
      </div>

      {/* Formulário principal */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Linha 1 — Dados do cliente + Fazenda (lado a lado) */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>

          {/* Seção 1 — Dados do cliente */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
            <div style={secTitle}>Identificação do Cliente</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>Tipo de conta *</label>
                <select style={inp} value={form.tipo} onChange={e => set("tipo", e.target.value as TipoConta)}>
                  <option value="pf">Pessoa Física</option>
                  <option value="pj">Pessoa Jurídica</option>
                  <option value="grupo">Grupo / Holding</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{form.tipo === "pf" ? "CPF" : "CNPJ"}</label>
                <input style={inp} placeholder={form.tipo === "pf" ? "000.000.000-00" : "00.000.000/0001-00"}
                  value={form.cpf_cnpj} onChange={e => set("cpf_cnpj", e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Nome completo / Razão Social *</label>
                <input style={inp} placeholder="Ex: João Silva ou Fazenda São João Ltda"
                  value={form.nome} onChange={e => set("nome", e.target.value)} />
              </div>
              <div>
                <label style={lbl}>E-mail *</label>
                <input style={inp} type="email" placeholder="cliente@email.com"
                  value={form.email_cliente} onChange={e => set("email_cliente", e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Telefone / WhatsApp</label>
                <input style={inp} placeholder="(65) 99999-0000"
                  value={form.telefone} onChange={e => set("telefone", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Seção 2 — Fazenda */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
            <div style={secTitle}>Fazenda Principal</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Nome da fazenda *</label>
                <input style={inp} placeholder="Ex: Fazenda Santa Rosa"
                  value={form.fazenda_nome} onChange={e => set("fazenda_nome", e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Município</label>
                <input style={inp} placeholder="Ex: Nova Mutum"
                  value={form.fazenda_municipio} onChange={e => set("fazenda_municipio", e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Estado</label>
                <select style={inp} value={form.fazenda_estado} onChange={e => set("fazenda_estado", e.target.value)}>
                  {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Linha 2 — Acesso & Assinatura (largura total) */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
          <div style={secTitle}>Acesso & Assinatura</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>Senha inicial *</label>
              <input style={inp} type="password" placeholder="Mín. 8 caracteres"
                value={form.user_senha} onChange={e => set("user_senha", e.target.value)} />
            </div>
            <div style={{ gridColumn: "3 / 5" }}>
              <label style={lbl}>Confirmar senha *</label>
              <input style={inp} type="password" placeholder="Repita a senha"
                value={form.user_senha_conf} onChange={e => set("user_senha_conf", e.target.value)} />
            </div>
            <div style={{ gridColumn: "5 / 7" }}>
              <label style={lbl}>Plano</label>
              <select style={inp} value={form.plano} onChange={e => set("plano", e.target.value as Pacote | "")}>
                <option value="">— Sem plano —</option>
                {(Object.keys(PLANOS_CFG) as Pacote[]).map(p => (
                  <option key={p} value={p}>{PLANOS_CFG[p].label}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / 3" }}>
              <label style={lbl}>Status inicial</label>
              <select style={inp} value={form.status} onChange={e => set("status", e.target.value as StatusInicial)}>
                <option value="trial">Trial (14 dias)</option>
                <option value="ativo">Ativo</option>
              </select>
            </div>
            <div style={{ gridColumn: "3 / 5" }}>
              <label style={lbl}>Data de início</label>
              <input style={inp} type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} />
            </div>
            <div style={{ gridColumn: "5 / 7" }}>
              <label style={lbl}>Data de vencimento</label>
              <input style={inp} type="date" value={form.data_vencimento} onChange={e => set("data_vencimento", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Observação interna</label>
              <textarea style={{ ...inp, height: 70, resize: "vertical" } as React.CSSProperties}
                placeholder="Ex: cliente indicado por fulano, acordou desconto por 3 meses..."
                value={form.observacao} onChange={e => set("observacao", e.target.value)} />
            </div>
          </div>
        </div>

      </div>

      {/* Erro */}
      {erro && (
        <div style={{ padding: "12px 16px", background: "#FEF2F2", border: "0.5px solid #E24B4A40", borderRadius: 8, color: "#991B1B", fontSize: 13, marginTop: 16, fontWeight: 500 }}>
          {erro}
        </div>
      )}

      {/* Botão criar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
        <a href="/admin/clientes" style={{ ...btnSecondary, textDecoration: "none", display: "inline-block" }}>
          Cancelar
        </a>
        <button style={btnPrimary} onClick={criar} disabled={salvando}>
          {salvando ? "Criando cliente…" : "Criar Cliente"}
        </button>
      </div>

      {/* Info extra */}
      <div style={{ marginTop: 16, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, border: "0.5px solid #378ADD40", fontSize: 11, color: "#1A4870", lineHeight: 1.7 }}>
        <strong>O que será criado:</strong> Uma conta SaaS ({"{"}conta{"}"}), uma fazenda vinculada, um usuário com e-mail/senha informados e um perfil com role de produtor.
        O cliente receberá acesso imediato ao Arato com os módulos do plano selecionado.
      </div>
    </div>
  );
}
