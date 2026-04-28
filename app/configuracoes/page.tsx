"use client";
import { useState, useEffect, useRef } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { type ContaContabil, planoContasPadrao, LCDPR_OPCOES, LCDPR_LABELS } from "../../lib/planoContas";
import { listarProdutores } from "../../lib/db";
import type { Produtor } from "../../lib/supabase";

// ————————————————————————————————————————
// Tipos locais
// ————————————————————————————————————————

// Abas visíveis ao cliente. "identidade" (Arato branding) fica em /admin
type AbaConf = "plano_contas" | "certificado" | "automacoes" | "usuarios";

interface Automacao {
  id: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  horario?: string;
  ultimaExec?: string;
  proxExec?: string;
  icone: string;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: "proprietario" | "gestor" | "operador" | "visualizador";
  ativo: boolean;
  ultimoAcesso?: string;
}

// ————————————————————————————————————————
// Dados mock
// ————————————————————————————————————————


const automacoesConfig: Automacao[] = [
  { id: "nfe_auto",       nome: "NF-e automática pós-romaneio",     descricao: "Gera, assina e transmite NF-e ao SEFAZ automaticamente após confirmação do romaneio",        ativa: true,  icone: "◉", ultimaExec: undefined, proxExec: "ao próximo romaneio" },
  { id: "concil_ofx",    nome: "Conciliação bancária OFX",          descricao: "Importa extrato bancário às 8h e concilia lançamentos CP/CR automaticamente",                ativa: true,  icone: "⟳", horario: "08:00", ultimaExec: undefined, proxExec: "diariamente 08:00" },
  { id: "alert_venc",    nome: "Alertas de vencimento",             descricao: "Envia notificação 7, 3 e 1 dia antes do vencimento de CP/CR",                                ativa: true,  icone: "⚠", horario: "07:00", ultimaExec: undefined, proxExec: "diariamente 07:00" },
  { id: "preco_mercado", nome: "Atualização de preços de mercado",  descricao: "Busca cotações CBOT/B3/câmbio às 7h via API e atualiza o dashboard",                         ativa: true,  icone: "▦", horario: "07:00", ultimaExec: undefined, proxExec: "diariamente 07:00" },
  { id: "rel_semanal",   nome: "Relatório semanal automático",      descricao: "Gera PDF com DRE semanal e envia por e-mail toda segunda-feira às 7h",                        ativa: true,  icone: "▤", horario: "seg 07:00", ultimaExec: undefined, proxExec: "segunda-feira 07:00" },
  { id: "alert_cert",    nome: "Alerta de certificado A1",          descricao: "Notifica 30, 15, 7 e 1 dia antes do vencimento do certificado digital",                      ativa: true,  icone: "◉", ultimaExec: undefined, proxExec: "diariamente 07:00" },
  { id: "cronograma",    nome: "Cronograma automático de safra",    descricao: "Ao cadastrar nova safra, gera cronograma completo de operações com datas e insumos estimados", ativa: true,  icone: "❧", ultimaExec: undefined, proxExec: "ao cadastrar safra" },
  { id: "funrural_auto", nome: "Lançamento automático Funrural",    descricao: "Calcula e lança CP de Funrural automaticamente após emissão de NF-e de venda",               ativa: true,  icone: "◈", ultimaExec: undefined, proxExec: "ao próximo NF-e" },
  { id: "backup_dados",  nome: "Backup automático de dados",        descricao: "Exporta dados críticos para armazenamento seguro diariamente às 2h",                         ativa: true,  icone: "▣", horario: "02:00", ultimaExec: undefined, proxExec: "diariamente 02:00" },
  { id: "alert_estoque", nome: "Alerta de estoque mínimo",          descricao: "Notifica quando o estoque de qualquer insumo cai abaixo do mínimo cadastrado",               ativa: false, icone: "▣", ultimaExec: undefined, proxExec: "desativado" },
];

const usuariosConfig: Usuario[] = [];

const fluxoVenda = [
  { label: "Contrato de venda", icone: "◈", auto: false },
  { label: "NF-e gerada",       icone: "◉", auto: true  },
  { label: "Transmissão SEFAZ", icone: "→", auto: true  },
  { label: "Receita lançada",   icone: "◈", auto: true  },
  { label: "XML arquivado",     icone: "▣", auto: true  },
];

interface BasisConfig { soja: number; milho: number; algodao: number; praca: string }
const BASIS_DEFAULT: BasisConfig = { soja: 0, milho: 0, algodao: 0, praca: "" };

// ————————————————————————————————————————
// Helpers
// ————————————————————————————————————————

const corTipoConta = (t: ContaContabil["tipo"]) => ({
  ativo:   { bg: "#EAF3DE", color: "#1A5C38", label: "ATIVO"    },
  passivo: { bg: "#FCEBEB", color: "#791F1F", label: "PASSIVO"  },
  pl:      { bg: "#F0EAF8", color: "#4B1A8A", label: "PL"       },
  receita: { bg: "#D5E8F5", color: "#0B2D50", label: "RECEITA"  },
  custo:   { bg: "#FAEEDA", color: "#633806", label: "CUSTO"    },
  despesa: { bg: "#FBF3E0", color: "#8B5E14", label: "DESPESA"  },
}[t]);

const corPerfil = (p: Usuario["perfil"]) => ({
  proprietario: { bg: "#D5E8F5", color: "#0B2D50", label: "Proprietário" },
  gestor:       { bg: "#E6F1FB", color: "#0C447C", label: "Gestor"       },
  operador:     { bg: "#FAEEDA", color: "#633806", label: "Operador"     },
  visualizador: { bg: "#F1EFE8", color: "#555",    label: "Visualizador" },
}[p]);

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

const formatarData = (s: string) => {
  if (s.includes("T") || s.includes(" ")) {
    const [data, hora] = s.split(/T| /);
    const [y, m, d] = data.split("-");
    return `${d}/${m} ${hora?.slice(0, 5)}`;
  }
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

interface CertInfo {
  modulo: string;
  arquivo_nome: string;
  storage_path: string;
  produtor_id?: string | null;
  produtor_nome: string;
  cpf_cnpj: string;
  data_vencimento?: string | null;
}

// ————————————————————————————————————————

const contaVazia: ContaContabil = { codigo: "", nome: "", tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: null };

// LCDPR_OPCOES e LCDPR_LABELS importados de lib/planoContas.ts

export default function Configuracoes() {
  const { fazendaId } = useAuth();
  const abaInicial = (): AbaConf => {
    if (typeof window === "undefined") return "plano_contas";
    const t = new URLSearchParams(window.location.search).get("tab") as AbaConf | null;
    const validas: AbaConf[] = ["plano_contas", "certificado", "automacoes", "usuarios"];
    return t && validas.includes(t) ? t : "plano_contas";
  };
  const [aba, setAba] = useState<AbaConf>(abaInicial);
  const [automacoes, setAutomacoes] = useState<Automacao[]>(automacoesConfig);
  const [usuarios, setUsuarios]     = useState<Usuario[]>(usuariosConfig);

  // ── Acesso Raccolto (LGPD) ─────────────────────────────────
  const [raccoltoAcesso,   setRaccoltoAcesso]   = useState<boolean>(false);
  const [salvandoRaccolto, setSalvandoRaccolto] = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("raccolto_acesso").eq("id", fazendaId).single()
      .then(({ data }) => {
        if (data) setRaccoltoAcesso(!!(data as { raccolto_acesso?: boolean }).raccolto_acesso);
      });
    listarProdutores(fazendaId).then(data => {
      setProdutores(data);
      if (data.length === 1) setCertProdutorId(data[0].id);
    }).catch(() => {});
    // Carrega todos os certificados da fazenda via API (service role — sem RLS)
    void fetch(`/api/cert-meta?fazenda_id=${fazendaId}`)
      .then(r => r.json())
      .then((d: { certs?: CertInfo[] }) => { if (d.certs) setCerts(d.certs); })
      .catch(() => {});
  }, [fazendaId]);

  async function toggleRaccolto() {
    if (!fazendaId) return;
    setSalvandoRaccolto(true);
    const novoValor = !raccoltoAcesso;
    const { error } = await supabase.from("fazendas").update({ raccolto_acesso: novoValor }).eq("id", fazendaId);
    if (!error) setRaccoltoAcesso(novoValor);
    setSalvandoRaccolto(false);
  }
  const [contas, setContas]         = useState<ContaContabil[]>(planoContasPadrao);
  const [filtroContas, setFiltroContas] = useState<"todos" | "ativo" | "passivo" | "pl" | "receita" | "custo" | "despesa">("todos");
  const [produtores,     setProdutores]     = useState<Produtor[]>([]);
  const [certProdutorId, setCertProdutorId] = useState<string>("");
  const [certFile,       setCertFile]       = useState<File | null>(null);
  const [certSenha,      setCertSenha]      = useState("");
  const [certDataVenc,   setCertDataVenc]   = useState("");
  const [certArrastando, setCertArrastando] = useState(false);
  const [certCarregando, setCertCarregando] = useState(false);
  const [certSucesso,    setCertSucesso]    = useState(false);
  const certInputRef = useRef<HTMLInputElement>(null);
  const [modalCert, setModalCert]   = useState(false);

  // Lista de certificados (um por produtor)
  const [certs, setCerts] = useState<CertInfo[]>([]);

  function fecharModalCert() {
    setModalCert(false);
    setCertFile(null);
    setCertSenha("");
    setCertDataVenc("");
    setCertArrastando(false);
    setCertCarregando(false);
    setCertSucesso(false);
  }

  async function carregarCertificado() {
    if (!certFile || !certSenha.trim()) return;
    if (produtores.length > 1 && !certProdutorId) {
      alert("Selecione o produtor titular do certificado.");
      return;
    }
    setCertCarregando(true);
    try {
      const produtor = produtores.find(p => p.id === certProdutorId) ?? produtores[0];

      // Upload + extração de data + salvamento em banco via API (service role)
      const form = new FormData();
      form.append("file",          certFile);
      form.append("senha",         certSenha);
      form.append("fazenda_id",    fazendaId!);
      form.append("produtor_id",   produtor?.id        ?? "");
      form.append("produtor_nome", produtor?.nome      ?? "");
      form.append("cpf_cnpj",      produtor?.cpf_cnpj  ?? "");

      const res = await fetch("/api/cert-upload", { method: "POST", body: form });
      const json = await res.json() as {
        ok?: boolean; error?: string;
        arquivo_nome?: string; storage_path?: string;
        produtor_nome?: string; cpf_cnpj?: string; data_vencimento?: string | null;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro no upload");

      const novo: CertInfo = {
        modulo:          `certificado_a1_${produtor?.id ?? "geral"}`,
        arquivo_nome:    json.arquivo_nome    ?? "",
        storage_path:    json.storage_path    ?? "",
        produtor_id:     produtor?.id         ?? null,
        produtor_nome:   json.produtor_nome   ?? "",
        cpf_cnpj:        json.cpf_cnpj        ?? "",
        data_vencimento: json.data_vencimento ?? null,
      };
      setCerts(prev => {
        const outros = prev.filter(c => c.modulo !== novo.modulo);
        return [...outros, novo];
      });
      setCertSucesso(true);
      setTimeout(() => fecharModalCert(), 1800);
    } catch (e: unknown) {
      alert("Erro ao salvar certificado: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCertCarregando(false);
    }
  }
  const [modalUsuario, setModalUsuario] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState({ nome: "", email: "", perfil: "operador" as Usuario["perfil"] });
  const [modalConta, setModalConta] = useState(false);
  const [contaEditandoCodigo, setContaEditandoCodigo] = useState<string | null>(null);
  const [formConta, setFormConta]   = useState<ContaContabil>(contaVazia);
  const [basis, setBasis] = useState<BasisConfig>(() => {
    try { const b = localStorage.getItem("ractech_basis"); return b ? JSON.parse(b) : BASIS_DEFAULT; } catch { return BASIS_DEFAULT; }
  });
  const [basisSalvo, setBasisSalvo] = useState(false);

  const salvarBasis = () => {
    try { localStorage.setItem("ractech_basis", JSON.stringify(basis)); setBasisSalvo(true); setTimeout(() => setBasisSalvo(false), 2000); } catch { /* ignore */ }
  };

  const calcDias = (d?: string | null): number | null => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  };
  const diasCert: number | null = (() => {
    const dias = certs.map(c => calcDias(c.data_vencimento)).filter((d): d is number => d !== null);
    return dias.length > 0 ? Math.min(...dias) : null;
  })();



  const contasFiltradas = contas.filter(c =>
    filtroContas === "todos" ? true : c.tipo === filtroContas
  );

  function abrirNovaConta() {
    setContaEditandoCodigo(null);
    setFormConta({ ...contaVazia });
    setModalConta(true);
  }

  function abrirEditarConta(codigo: string) {
    const c = contas.find(x => x.codigo === codigo);
    if (!c) return;
    setContaEditandoCodigo(codigo);
    setFormConta({ ...c });
    setModalConta(true);
  }

  function salvarConta() {
    if (!formConta.codigo.trim() || !formConta.nome.trim()) return;
    const dados = { ...formConta, lcdpr: formConta.lcdpr || null };
    if (contaEditandoCodigo !== null) {
      setContas(prev => prev.map(c => c.codigo === contaEditandoCodigo ? dados : c));
    } else {
      if (contas.some(c => c.codigo === dados.codigo)) {
        alert("Já existe uma conta com este código.");
        return;
      }
      setContas(prev => [...prev, dados]);
    }
    setModalConta(false);
  }

  function excluirConta(codigo: string) {
    if (!confirm("Excluir esta conta do plano?")) return;
    setContas(prev => prev.filter(c => c.codigo !== codigo));
  }

  const toggleAutomacao = (id: string) => {
    setAutomacoes(prev => prev.map(a => a.id === id ? { ...a, ativa: !a.ativa } : a));
  };

  const salvarUsuario = () => {
    if (!novoUsuario.nome || !novoUsuario.email) return;
    setUsuarios(prev => [...prev, {
      id: Date.now(), nome: novoUsuario.nome, email: novoUsuario.email,
      perfil: novoUsuario.perfil, ativo: true,
    }]);
    setNovoUsuario({ nome: "", email: "", perfil: "operador" });
    setModalUsuario(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Configurações</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Empresa, plano de contas, certificado digital, automações e usuários</p>
          </div>
          {diasCert !== null && diasCert <= 30 && (
            <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠</span>
              <span>Certificado A1 vence em <strong>{diasCert} dias</strong></span>
              <button onClick={() => { setAba("certificado"); setModalCert(true); }} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "0.5px solid #E24B4A", background: "transparent", color: "#791F1F", cursor: "pointer", fontWeight: 600 }}>
                Renovar
              </button>
            </div>
          )}
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {/* Card de acesso rápido a Empresas */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>Cadastro de Empresas</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>CNPJ, IE, Regime Tributário, Registros Rurais (CAR, NIRF, ITR) e contatos estão em Cadastros → Gerais → Empresas</div>
            </div>
            <a href="/cadastros?tab=empresas" style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
              Ir para Empresas →
            </a>
          </div>

          {/* Abas */}
          <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8" }}>
            {([
              { key: "plano_contas", label: "Plano de Contas"  },
              { key: "certificado",  label: "Certificado A1"   },
              { key: "automacoes",   label: "Automações"       },
              { key: "usuarios",     label: "Usuários"         },
            ] as { key: AbaConf; label: string }[]).map(a => (
              <button key={a.key} onClick={() => setAba(a.key)} style={{
                padding: "11px 20px", border: "none", background: "transparent", cursor: "pointer",
                fontWeight: aba === a.key ? 600 : 400, fontSize: 13,
                color: aba === a.key ? "#1a1a1a" : "#555",
                borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
              }}>
                {a.label}
                {a.key === "certificado" && diasCert !== null && diasCert <= 30 && (
                  <span style={{ marginLeft: 6, fontSize: 10, background: "#FCEBEB", color: "#791F1F", padding: "1px 6px", borderRadius: 8 }}>{diasCert}d</span>
                )}
                {a.key === "automacoes" && (
                  <span style={{ marginLeft: 6, fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 8 }}>
                    {automacoes.filter(a => a.ativa).length} ativas
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ——— ABA: Plano de Contas ——— */}
          {aba === "plano_contas" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
              {/* Filtros */}
              {/* Filtros */}
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { key: "todos",   label: "Todos",    count: contas.length },
                    { key: "ativo",   label: "Ativo",    count: contas.filter(c => c.tipo === "ativo").length },
                    { key: "passivo", label: "Passivo",  count: contas.filter(c => c.tipo === "passivo").length },
                    { key: "pl",      label: "PL",       count: contas.filter(c => c.tipo === "pl").length },
                    { key: "receita", label: "Receitas", count: contas.filter(c => c.tipo === "receita").length },
                    { key: "custo",   label: "Custos",   count: contas.filter(c => c.tipo === "custo").length },
                    { key: "despesa", label: "Despesas", count: contas.filter(c => c.tipo === "despesa").length },
                  ] as { key: typeof filtroContas; label: string; count: number }[]).map(f => (
                    <button key={f.key} onClick={() => setFiltroContas(f.key)} style={{
                      padding: "5px 12px", borderRadius: 20, border: "0.5px solid",
                      borderColor: filtroContas === f.key ? "#1A4870" : "#D4DCE8",
                      background: filtroContas === f.key ? "#D5E8F5" : "transparent",
                      color: filtroContas === f.key ? "#0B2D50" : "#666",
                      fontWeight: filtroContas === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                    }}>
                      {f.label} <span style={{ fontSize: 10, marginLeft: 4, background: filtroContas === f.key ? "#1A4870" : "#DEE5EE", color: filtroContas === f.key ? "#fff" : "#555", padding: "1px 5px", borderRadius: 6 }}>{f.count}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>
                    <span style={{ background: "#EAF3DE", color: "#1A5C38", padding: "1px 6px", borderRadius: 5, fontWeight: 600, marginRight: 4 }}>{contas.filter(c => c.lcdpr).length}</span>
                    contas vinculadas ao LCDPR
                  </span>
                  <button onClick={abrirNovaConta} style={{ fontSize: 11, padding: "5px 12px", border: "0.5px solid #1A5C38", borderRadius: 8, background: "#EAF3DE", color: "#1A5C38", cursor: "pointer", fontWeight: 600 }}>
                    + Nova conta
                  </button>
                </div>
              </div>

              {/* Tabela */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Código", "Nome da conta", "Tipo", "Natureza", "Operacional", "LCDPR", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 16px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contasFiltradas.map((c, ci) => {
                    const ct = corTipoConta(c.tipo);
                    const isGrupo = c.nivel === 0;
                    const lcdprCods: Record<string, string> = {
                      "101": "101 — Venda rural",
                      "102": "102 — Serviços rurais",
                      "103": "103 — Financiamento",
                      "104": "104 — Ressarcimento ITR",
                      "199": "199 — Outras receitas",
                      "201": "201 — Custeio rural",
                      "202": "202 — Investimento",
                      "203": "203 — Amortização",
                      "204": "204 — ITR",
                      "299": "299 — Outras despesas",
                    };
                    return (
                      <tr key={ci} style={{ borderBottom: "0.5px solid #DEE5EE", background: isGrupo ? "#F8FAFD" : c.transitoria ? "#FFFDF5" : "transparent" }}>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 12, color: "#1a1a1a", width: 90 }}>{c.codigo}</td>
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ paddingLeft: c.nivel * 14, fontSize: isGrupo ? 13 : 12, fontWeight: isGrupo ? 700 : 400, color: "#1a1a1a" }}>
                              {c.nome}
                            </span>
                            {c.transitoria && (
                              <span style={{ fontSize: 9, background: "#FBF3E0", color: "#8B5E14", padding: "1px 5px", borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>TRANSITÓRIA</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          {ct && (
                            <span style={{ fontSize: 10, background: ct.bg, color: ct.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
                              {ct.label}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          {c.natureza ? (
                            <span style={{ fontSize: 10, color: c.natureza === "devedora" ? "#0B2D50" : "#791F1F", background: c.natureza === "devedora" ? "#D5E8F5" : "#FCEBEB", padding: "2px 7px", borderRadius: 6 }}>
                              {c.natureza === "devedora" ? "Devedora" : "Credora"}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          {c.nivel > 0 && (
                            c.operacional
                              ? <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>Sim</span>
                              : <span style={{ fontSize: 10, color: "#bbb" }}>back-office</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          {c.lcdpr ? (
                            <span style={{ fontSize: 10, background: c.lcdpr.startsWith("1") ? "#EAF3DE" : "#FAEEDA", color: c.lcdpr.startsWith("1") ? "#1A5C38" : "#633806", padding: "2px 8px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                              {lcdprCods[c.lcdpr] ?? c.lcdpr}
                            </span>
                          ) : c.nivel > 0 ? (
                            <span style={{ fontSize: 10, color: "#bbb" }}>— não entra</span>
                          ) : null}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <button onClick={() => abrirEditarConta(c.codigo)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#555", cursor: "pointer", marginRight: 4 }}>
                            Editar
                          </button>
                          <button onClick={() => excluirConta(c.codigo)} style={{ fontSize: 11, padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "transparent", color: "#E24B4A", cursor: "pointer" }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", fontSize: 11, color: "#444" }}>
                Plano de contas padrão Arato para produtor rural. Contas marcadas com código LCDPR são incluídas automaticamente no Livro Caixa Digital do Produtor Rural.
              </div>
            </div>
          )}

          {/* ——— ABA: Certificado A1 ——— */}
          {aba === "certificado" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "24px" }}>

              {/* Cabeçalho da lista */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                    Certificados A1 cadastrados
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    {certs.length === 0 ? "Nenhum certificado configurado" : `${certs.length} certificado${certs.length > 1 ? "s" : ""} — um por produtor/titular`}
                  </div>
                </div>
                <button
                  onClick={() => { setCertProdutorId(produtores.length === 1 ? produtores[0].id : ""); setModalCert(true); }}
                  style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  + Adicionar certificado
                </button>
              </div>

              {/* Lista de certificados */}
              {certs.length === 0 ? (
                <div style={{ border: "0.5px dashed #1A4870", borderRadius: 12, padding: "36px", textAlign: "center", background: "#F5F9FF", marginBottom: 16 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>◉</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>Nenhum certificado configurado</div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Carregue um arquivo .pfx ou .p12 para assinar NF-e automaticamente
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                  {certs.map(cert => {
                    const dias = calcDias(cert.data_vencimento);
                    const corDias = dias !== null && dias <= 7 ? "#E24B4A" : dias !== null && dias <= 15 ? "#EF9F27" : "#1A5C38";
                    const bgCard = dias !== null && dias <= 7 ? "#FFFBFB" : dias !== null && dias <= 15 ? "#FFFDF5" : "#F7FDFA";
                    const borderCard = dias !== null && dias <= 7 ? "#E24B4A" : dias !== null && dias <= 15 ? "#EF9F27" : "#D4DCE8";
                    return (
                      <div key={cert.modulo} style={{ border: `1px solid ${borderCard}`, borderRadius: 12, padding: "16px 20px", background: bgCard, display: "flex", alignItems: "center", gap: 20 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{cert.produtor_nome || "Titular não informado"}</span>
                            {cert.cpf_cnpj && <span style={{ fontSize: 11, color: "#888" }}>CNPJ/CPF: {cert.cpf_cnpj}</span>}
                            <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 5 }}>A1 — .pfx</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>📄 {cert.arquivo_nome}</div>
                          {cert.data_vencimento ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <div>
                                <span style={{ fontSize: 11, color: "#555" }}>Vence em: </span>
                                <span style={{ fontWeight: 600, fontSize: 12, color: corDias }}>
                                  {cert.data_vencimento.split("-").reverse().join("/")}
                                </span>
                                <span style={{ marginLeft: 7, fontSize: 11, background: dias !== null && dias <= 7 ? "#FCEBEB" : dias !== null && dias <= 15 ? "#FFF3CD" : "#EAF3DE", color: corDias, padding: "1px 7px", borderRadius: 6, fontWeight: 600 }}>
                                  {dias !== null ? `${dias}d` : "—"}
                                </span>
                              </div>
                              <div style={{ flex: 1, maxWidth: 160 }}>
                                <div style={{ height: 5, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, ((dias ?? 0) / 365) * 100))}%`, background: corDias, borderRadius: 4 }} />
                                </div>
                                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{dias ?? "—"} dias restantes de 365</div>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#EF9F27" }}>⚠ Vencimento não informado — atualize o certificado</span>
                          )}
                        </div>
                        <button
                          onClick={() => { setCertProdutorId(cert.produtor_id ?? ""); setModalCert(true); }}
                          style={{ padding: "7px 16px", border: "0.5px solid #1A4870", borderRadius: 8, background: "transparent", color: "#1A4870", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                        >
                          Atualizar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487030", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#0B2D50" }}>
                ⟳ O sistema verifica automaticamente a validade do certificado diariamente e envia alertas 30, 15, 7 e 1 dia antes do vencimento.
              </div>
            </div>
          )}

          {/* ——— ABA: Automações ——— */}
          {aba === "automacoes" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>

              {/* Fluxo de venda automatizado */}
              <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 12 }}>
                  Fluxo de venda automatizado
                  <span style={{ marginLeft: 8, fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 8 }}>4 de 5 etapas automáticas</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {fluxoVenda.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", flex: i < fluxoVenda.length - 1 ? "auto" : "none" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%",
                          background: f.auto ? "#D5E8F5" : "#FBF0D8",
                          border: `1.5px solid ${f.auto ? "#1A4870" : "#C9921B"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, color: f.auto ? "#1A4870" : "#C9921B",
                          margin: "0 auto 4px",
                        }}>
                          {f.icone}
                        </div>
                        <div style={{ fontSize: 9, color: "#555", maxWidth: 62, textAlign: "center", lineHeight: 1.3 }}>{f.label}</div>
                        <div style={{ fontSize: 9, marginTop: 2, color: f.auto ? "#1A4870" : "#C9921B", fontWeight: 600 }}>{f.auto ? "auto" : "manual"}</div>
                      </div>
                      {i < fluxoVenda.length - 1 && (
                        <div style={{ flex: 1, height: 1.5, background: "#1A487040", margin: "0 4px", marginBottom: 20 }} />
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>
                  Azul = sistema executa automaticamente · Mostarda = ação do usuário
                </div>
              </div>

              {/* Lista de automações */}
              <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: "#555" }}>
                  <strong style={{ color: "#1A4870" }}>{automacoes.filter(a => a.ativa).length}</strong> de {automacoes.length} automações ativas
                </div>
                <div style={{ fontSize: 11, color: "#444" }}>
                  ⟳ = cron diário · ◈ = disparado por evento
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {automacoes.map((a, ai) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", borderBottom: ai < automacoes.length - 1 ? "0.5px solid #DEE5EE" : "none", background: !a.ativa ? "#F8FAFD" : "transparent" }}>
                    <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0, color: a.ativa ? "#1A4870" : "#666" }}>{a.icone}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: a.ativa ? "#1a1a1a" : "#444", marginBottom: 2 }}>{a.nome}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{a.descricao}</div>
                      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                        {a.horario && <span style={{ fontSize: 10, color: "#444" }}>⏱ {a.horario}</span>}
                        {a.ultimaExec && <span style={{ fontSize: 10, color: "#444" }}>Última: {formatarData(a.ultimaExec)}</span>}
                        {a.proxExec && <span style={{ fontSize: 10, color: a.ativa ? "#1A4870" : "#666" }}>Próxima: {a.proxExec.includes("-") ? formatarData(a.proxExec) : a.proxExec}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleAutomacao(a.id)}
                      style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: a.ativa ? "#1A4870" : "#e0e0e0", position: "relative", flexShrink: 0, transition: "background 0.2s" }}
                    >
                      <span style={{ position: "absolute", top: 2, left: a.ativa ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", display: "block" }} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ padding: "8px 16px", borderTop: "0.5px solid #DEE5EE", fontSize: 10, color: "#666" }}>
                Automações são executadas nos horários definidos pelo servidor Vercel Cron. Desativar não cancela execuções já agendadas no ciclo atual.
              </div>

              {/* Cotação e Basis */}
              <div style={{ borderTop: "0.5px solid #D4DCE8", padding: "18px 20px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 4 }}>Cotação e Basis</div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 14 }}>
                  O basis é a diferença entre o preço local da sua praça e a referência de mercado (CBOT/B3).
                  Negativo = preço local menor. Exemplo: Soja CBOT R$ 129/sc + Basis −3,50 = preço local R$ 125,50/sc.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#555", marginBottom: 4, display: "block" }}>Praça de referência</label>
                    <input
                      value={basis.praca}
                      onChange={e => setBasis(b => ({ ...b, praca: e.target.value }))}
                      placeholder="ex: Nova Mutum - MT"
                      style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#555", marginBottom: 4, display: "block" }}>Basis Soja (R$/sc)</label>
                    <input
                      type="number" step="0.50"
                      value={basis.soja}
                      onChange={e => setBasis(b => ({ ...b, soja: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#555", marginBottom: 4, display: "block" }}>Basis Milho (R$/sc)</label>
                    <input
                      type="number" step="0.50"
                      value={basis.milho}
                      onChange={e => setBasis(b => ({ ...b, milho: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#555", marginBottom: 4, display: "block" }}>Basis Algodão (R$/@)</label>
                    <input
                      type="number" step="0.50"
                      value={basis.algodao}
                      onChange={e => setBasis(b => ({ ...b, algodao: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={salvarBasis}
                    style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                  >
                    Salvar configurações
                  </button>
                  {basisSalvo && (
                    <span style={{ fontSize: 12, color: "#1A5C38", fontWeight: 600 }}>✓ Salvo — dashboard atualizado</span>
                  )}
                  <span style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}>
                    Configuração salva localmente neste navegador
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* ——— ABA: Usuários ——— */}
          {aba === "usuarios" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>

              {/* ── Toggle Acesso Raccolto (LGPD) ── */}
              <div style={{
                margin: "16px 16px 0",
                borderRadius: 10,
                border: `1.5px solid ${raccoltoAcesso ? "#1A4870" : "#D4DCE8"}`,
                background: raccoltoAcesso ? "#EBF3FC" : "#F8FAFD",
                padding: "14px 18px",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: raccoltoAcesso ? "#0B2D50" : "#1a1a1a" }}>
                      Usuário Raccolto
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
                      background: raccoltoAcesso ? "#1A4870" : "#DEE5EE",
                      color: raccoltoAcesso ? "#fff" : "#666",
                    }}>
                      {raccoltoAcesso ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                    {raccoltoAcesso
                      ? "A Raccolto possui acesso de visualização aos dados desta fazenda para fins de consultoria e suporte. Você pode revogar este acesso a qualquer momento."
                      : "Ative para permitir que a equipe Raccolto visualize os dados desta fazenda no painel de gestão exclusivo. Acesso apenas de leitura, conforme LGPD."}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#888" }}>
                    Base legal LGPD: Art. 7º, I — consentimento do titular · Art. 18 — direito de revogação a qualquer tempo
                  </p>
                </div>

                <button
                  onClick={toggleRaccolto}
                  disabled={salvandoRaccolto}
                  style={{
                    flexShrink: 0,
                    padding: "9px 20px",
                    borderRadius: 8,
                    border: `1.5px solid ${raccoltoAcesso ? "#E24B4A" : "#1A4870"}`,
                    background: raccoltoAcesso ? "#FCEBEB" : "#1A4870",
                    color: raccoltoAcesso ? "#791F1F" : "#fff",
                    fontWeight: 700, fontSize: 13, cursor: salvandoRaccolto ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {salvandoRaccolto ? "Salvando…" : raccoltoAcesso ? "Desativar Acesso" : "Ativar Usuário Raccolto"}
                </button>
              </div>

              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#555" }}>
                  <strong style={{ color: "#1a1a1a" }}>{usuarios.filter(u => u.ativo).length}</strong> usuários ativos
                </div>
                <button onClick={() => setModalUsuario(true)} style={{ fontSize: 11, padding: "5px 14px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontWeight: 600 }}>
                  ◈ Convidar usuário
                </button>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Usuário", "E-mail", "Perfil", "Último acesso", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 16px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u, ui) => {
                    const cp = corPerfil(u.perfil);
                    return (
                      <tr key={u.id} style={{ borderBottom: ui < usuarios.length - 1 ? "0.5px solid #DEE5EE" : "none", background: !u.ativo ? "#F8FAFD" : "transparent" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.ativo ? "#1A4870" : "#666", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                              {u.nome.charAt(0)}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 12, color: u.ativo ? "#1a1a1a" : "#444" }}>{u.nome}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#1a1a1a" }}>{u.email}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: cp.bg, color: cp.color, padding: "2px 8px", borderRadius: 8 }}>{cp.label}</span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, color: "#1a1a1a" }}>
                          {u.ultimoAcesso ? formatarData(u.ultimoAcesso) : "—"}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: u.ativo ? "#D5E8F5" : "#DEE5EE", color: u.ativo ? "#0B2D50" : "#444", padding: "2px 8px", borderRadius: 8 }}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          {u.perfil !== "proprietario" && (
                            <button style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#555", cursor: "pointer" }}>
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ padding: "12px 16px", borderTop: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Perfis de acesso</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {([
                    { perfil: "proprietario", desc: "Acesso total — todos os módulos, configurações e dados financeiros" },
                    { perfil: "gestor",       desc: "Acesso operacional — lavoura, estoque, financeiro. Sem configurações." },
                    { perfil: "operador",     desc: "Lançamentos e consultas — sem acesso a financeiro completo" },
                    { perfil: "visualizador", desc: "Somente leitura — relatórios e dashboards. Ideal para contador." },
                  ] as { perfil: Usuario["perfil"]; desc: string }[]).map((p, i) => {
                    const cp = corPerfil(p.perfil);
                    return (
                      <div key={i} style={{ background: cp.bg, border: `0.5px solid ${cp.color}30`, borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: cp.color, marginBottom: 3 }}>{cp.label.toUpperCase()}</div>
                        <div style={{ fontSize: 10, color: "#666" }}>{p.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>Arato · menos cliques, mais campo</p>
        </div>
      </main>

      {/* ——— Modal Conta Contábil ——— */}
      {modalConta && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalConta(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 20 }}>
              {contaEditandoCodigo ? "Editar conta" : "Nova conta"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Código *</label>
                <input style={inputStyle} placeholder="Ex: 4.2.3" value={formConta.codigo}
                  onChange={e => setFormConta(p => ({ ...p, codigo: e.target.value }))}
                  disabled={contaEditandoCodigo !== null} />
              </div>
              <div>
                <label style={labelStyle}>Nome da conta *</label>
                <input style={inputStyle} placeholder="Ex: Calcário dolomítico" value={formConta.nome}
                  onChange={e => setFormConta(p => ({ ...p, nome: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Tipo *</label>
                <select style={inputStyle} value={formConta.tipo}
                  onChange={e => setFormConta(p => ({ ...p, tipo: e.target.value as ContaContabil["tipo"] }))}>
                  <option value="ativo">Ativo</option>
                  <option value="passivo">Passivo</option>
                  <option value="pl">Patrimônio Líquido</option>
                  <option value="receita">Receita</option>
                  <option value="custo">Custo de produção</option>
                  <option value="despesa">Despesa operacional</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nível *</label>
                <select style={inputStyle} value={formConta.nivel}
                  onChange={e => setFormConta(p => ({ ...p, nivel: Number(e.target.value) }))}>
                  <option value={0}>0 — Grupo</option>
                  <option value={1}>1 — Subgrupo</option>
                  <option value={2}>2 — Detalhe</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Conta pai</label>
                <input style={inputStyle} placeholder="Ex: 4.2" value={formConta.pai ?? ""}
                  onChange={e => setFormConta(p => ({ ...p, pai: e.target.value || undefined }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Natureza do saldo</label>
                  <select style={inputStyle} value={formConta.natureza ?? "devedora"}
                    onChange={e => setFormConta(p => ({ ...p, natureza: e.target.value as "devedora" | "credora" }))}>
                    <option value="devedora">Devedora (Ativo / Custo / Despesa)</option>
                    <option value="credora">Credora (Passivo / PL / Receita)</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" id="chk_operacional" checked={!!formConta.operacional}
                      onChange={e => setFormConta(p => ({ ...p, operacional: e.target.checked }))}
                      style={{ width: 14, height: 14, cursor: "pointer" }} />
                    <label htmlFor="chk_operacional" style={{ fontSize: 12, color: "#555", cursor: "pointer" }}>
                      Disponível para operadores
                      <span style={{ display: "block", fontSize: 10, color: "#888" }}>Aparece nos dropdowns do dia a dia</span>
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" id="chk_transitoria" checked={!!formConta.transitoria}
                      onChange={e => setFormConta(p => ({ ...p, transitoria: e.target.checked }))}
                      style={{ width: 14, height: 14, cursor: "pointer" }} />
                    <label htmlFor="chk_transitoria" style={{ fontSize: 12, color: "#555", cursor: "pointer" }}>
                      Conta transitória
                      <span style={{ display: "block", fontSize: 10, color: "#888" }}>Zera ao encerrar o ciclo</span>
                    </label>
                  </div>
                </div>
              </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Código LCDPR</label>
              <select style={inputStyle} value={formConta.lcdpr ?? ""}
                onChange={e => setFormConta(p => ({ ...p, lcdpr: e.target.value || null }))}>
                {LCDPR_OPCOES.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                Selecione o código para que esta conta seja incluída automaticamente no Livro Caixa Digital do Produtor Rural.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModalConta(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarConta} disabled={!formConta.codigo.trim() || !formConta.nome.trim()}
                style={{ padding: "8px 20px", background: formConta.codigo.trim() && formConta.nome.trim() ? "#1A5C38" : "#999", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {contaEditandoCodigo ? "Salvar alterações" : "Criar conta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Modal Certificado ——— */}
      {modalCert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModalCert(); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 460, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Carregar certificado A1</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Arquivo .pfx ou .p12 do e-CNPJ ou e-CPF</div>

            <div style={{ display: "grid", gap: 14 }}>
              {/* Seletor de produtor */}
              {produtores.length > 1 && (
                <div>
                  <label style={labelStyle}>Produtor / Titular do certificado *</label>
                  <select
                    value={certProdutorId}
                    onChange={e => setCertProdutorId(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }}
                  >
                    <option value="">Selecione o produtor...</option>
                    {produtores.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — {p.tipo === "pf" ? "CPF" : "CNPJ"}: {p.cpf_cnpj ?? "—"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {produtores.length === 1 && (
                <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#555" }}>
                  <span style={{ color: "#888", fontSize: 11 }}>Titular: </span>
                  <strong>{produtores[0].nome}</strong>
                  <span style={{ color: "#888", marginLeft: 8, fontSize: 12 }}>
                    {produtores[0].tipo === "pf" ? "CPF" : "CNPJ"}: {produtores[0].cpf_cnpj ?? "—"}
                  </span>
                </div>
              )}

              {/* Área de upload */}
              <div>
                <label style={labelStyle}>Arquivo do certificado (.pfx / .p12) *</label>

                {/* Input oculto */}
                <input
                  ref={certInputRef}
                  type="file"
                  accept=".pfx,.p12"
                  style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setCertFile(f);
                    e.target.value = "";
                  }}
                />

                {certFile ? (
                  /* Arquivo selecionado */
                  <div style={{
                    border: "0.5px solid #28a745", borderRadius: 8, padding: "14px 16px",
                    background: "#D4EDDA", display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#155724", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {certFile.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#155724" }}>
                        {(certFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => setCertFile(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#155724", fontSize: 16, padding: "2px 6px", flexShrink: 0 }}
                      title="Remover arquivo"
                    >×</button>
                  </div>
                ) : (
                  /* Área de drop */
                  <div
                    onClick={() => certInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setCertArrastando(true); }}
                    onDragLeave={() => setCertArrastando(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setCertArrastando(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f && (f.name.endsWith(".pfx") || f.name.endsWith(".p12"))) {
                        setCertFile(f);
                      } else if (f) {
                        alert("Selecione um arquivo .pfx ou .p12");
                      }
                    }}
                    style={{
                      border: `0.5px dashed ${certArrastando ? "#1A4870" : "#aab"}`,
                      borderRadius: 8, padding: "28px 20px", textAlign: "center",
                      background: certArrastando ? "#EEF4FF" : "#F7FDFA",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>
                      {certArrastando ? "Solte o arquivo aqui" : "Clique para selecionar"}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>ou arraste o arquivo .pfx / .p12 aqui</div>
                  </div>
                )}
              </div>

              {/* Senha */}
              <div>
                <label style={labelStyle}>Senha do certificado *</label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="Senha do arquivo .pfx"
                  value={certSenha}
                  onChange={e => setCertSenha(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && certFile && certSenha.trim()) carregarCertificado(); }}
                />
              </div>
            </div>

            {certSucesso && (
              <div style={{ marginTop: 14, background: "#D4EDDA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#155724", fontWeight: 600 }}>
                ✓ Certificado carregado com sucesso!
              </div>
            )}

            {!certSucesso && (
              <div style={{ marginTop: 14, background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
                🔒 O certificado é armazenado de forma segura e usado apenas para assinar NF-e automaticamente.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                onClick={fecharModalCert}
                style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                onClick={carregarCertificado}
                disabled={!certFile || !certSenha.trim() || certCarregando || certSucesso}
                style={{
                  padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none",
                  borderRadius: 8, fontWeight: 600, cursor: (!certFile || !certSenha.trim() || certCarregando) ? "not-allowed" : "pointer",
                  fontSize: 13, opacity: (!certFile || !certSenha.trim() || certCarregando) ? 0.5 : 1,
                }}
              >
                {certCarregando ? "Carregando..." : "🔒 Carregar certificado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Modal Novo Usuário ——— */}
      {modalUsuario && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalUsuario(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 400, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 20 }}>Convidar usuário</div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome completo *</label>
                <input style={inputStyle} placeholder="Ex: Maria Silva" value={novoUsuario.nome} onChange={e => setNovoUsuario(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>E-mail *</label>
                <input style={inputStyle} type="email" placeholder="Ex: maria@fazenda.com.br" value={novoUsuario.email} onChange={e => setNovoUsuario(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Perfil de acesso</label>
                <select style={inputStyle} value={novoUsuario.perfil} onChange={e => setNovoUsuario(p => ({ ...p, perfil: e.target.value as Usuario["perfil"] }))}>
                  <option value="gestor">Gestor — acesso operacional completo</option>
                  <option value="operador">Operador — lançamentos e consultas</option>
                  <option value="visualizador">Visualizador — somente leitura</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 14, background: "#FBF0D8", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ Um e-mail de convite será enviado. O usuário define sua própria senha no primeiro acesso.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setModalUsuario(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarUsuario} disabled={!novoUsuario.nome || !novoUsuario.email}
                style={{ padding: "8px 18px", background: novoUsuario.nome && novoUsuario.email ? "#C9921B" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                ◈ Enviar convite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
