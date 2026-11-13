"use client";
// Avisos da Raccolto aos clientes (cadastrados em Gestão Arato → Avisos aos Clientes). Aparecem em popup, um de cada vez,
// para o usuário logado que ainda não deu ciência. "Li e estou ciente" grava a ciência (não aparece mais para ele, em
// nenhum computador). Aviso não obrigatório tem "Ver depois": some até o próximo login. A lista é conferida ao abrir o
// sistema e a cada 10 minutos, então aviso publicado com o cliente já logado aparece sem ele sair. Regras em lib/avisos.ts.
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import { blocosDoTexto, TIPOS_AVISO, type Trecho, type TipoAviso } from "../lib/avisos";

export type AvisoExibido = { id: string; titulo: string; mensagem: string; tipo: TipoAviso; obrigatorio: boolean; botao_texto: string | null; botao_link: string | null };

const ROTAS_PUBLICAS = ["/login", "/planos", "/cadastro", "/alterar-senha", "/seletor-cliente", "/pagamento", "/offline", "/comercial/faturamento/danfe", "/admin"];
const INTERVALO_MS = 10 * 60 * 1000;

const chaveDepois = (id: string, uid: string, login: string) => `aviso_depois_${id}_${uid}_${login}`;
function lerLS(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLS(k: string) { try { localStorage.setItem(k, "1"); } catch { /* sem armazenamento local */ } }

const linha = (ts: Trecho[], k: string | number) => (
  <span key={k}>{ts.map((t, i) => t.negrito ? <strong key={i} style={{ color: "#0B2D50" }}>{t.texto}</strong> : <span key={i}>{t.texto}</span>)}</span>
);

/** O cartão do aviso (usado no popup e na prévia do Gestão Arato). */
export function CartaoAviso({ aviso, ocupado, erro, onCiente, onDepois, onBotao }: {
  aviso: Pick<AvisoExibido, "titulo" | "mensagem" | "tipo" | "obrigatorio" | "botao_texto">;
  ocupado?: boolean; erro?: string;
  onCiente?: () => void; onDepois?: () => void; onBotao?: () => void;
}) {
  const tipo = TIPOS_AVISO[aviso.tipo] ?? TIPOS_AVISO.informativo;
  const blocos = blocosDoTexto(aviso.mensagem);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="aviso-sistema-titulo" style={{ background: "#fff", borderRadius: 14, width: 540, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(11,45,80,0.22)", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#1a1a1a", borderTop: `4px solid ${tipo.cor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px", borderBottom: "0.5px solid #DDE2EE" }}>
        <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", flexShrink: 0, border: "2px solid #D5E8F5" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#666" }}>Aviso da equipe Arato</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: tipo.cor, background: tipo.fundo, borderRadius: 4, padding: "1px 7px" }}>{tipo.icone} {tipo.rotulo}</span>
          </div>
          <div id="aviso-sistema-titulo" style={{ fontSize: 15, fontWeight: 600, color: "#0B2D50", marginTop: 2, overflowWrap: "anywhere" }}>{aviso.titulo || "Título do aviso"}</div>
        </div>
        <img src="/Logo_Arato.png" alt="Arato" style={{ height: 18, width: "auto", flexShrink: 0, opacity: 0.9 }} />
      </div>

      <div style={{ padding: "14px 20px 4px", lineHeight: 1.55, overflowWrap: "anywhere" }}>
        {blocos.length === 0 && <p style={{ margin: "0 0 10px", color: "#888" }}>A mensagem aparece aqui.</p>}
        {blocos.map((b, i) => b.tipo === "lista"
          ? <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 18 }}>{b.itens.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{linha(it, j)}</li>)}</ul>
          : <p key={i} style={{ margin: "0 0 10px" }}>{b.linhas.map((l, j) => <span key={j}>{j > 0 && <br />}{linha(l, j)}</span>)}</p>)}
      </div>

      {erro && <div style={{ margin: "0 20px 8px", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#791F1F" }}>{erro}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", padding: "12px 20px 16px", borderTop: "0.5px solid #F0F2F7" }}>
        {!aviso.obrigatorio && (
          <button type="button" disabled={ocupado} onClick={onDepois} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "none", color: "#555", fontSize: 13, cursor: ocupado ? "default" : "pointer", marginRight: "auto" }}>Ver depois</button>
        )}
        {aviso.botao_texto && (
          <button type="button" disabled={ocupado} onClick={onBotao} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid #1A4870", background: "#fff", color: "#1A4870", fontSize: 13, cursor: ocupado ? "default" : "pointer" }}>{aviso.botao_texto}</button>
        )}
        <button type="button" disabled={ocupado} onClick={onCiente} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: ocupado ? "#888" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: ocupado ? "default" : "pointer" }}>
          {ocupado ? "Registrando…" : "Li e estou ciente"}
        </button>
      </div>
    </div>
  );
}

export default function AvisosSistema() {
  const { fazendaId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [fila, setFila] = useState<AvisoExibido[]>([]);
  const [usuario, setUsuario] = useState<{ id: string; login: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const u = { id: session.user.id, login: session.user.last_sign_in_at ?? "" };
      setUsuario(u);
      const r = await fetch("/api/avisos", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json() as { avisos?: AvisoExibido[] };
      setFila((j.avisos ?? []).filter(a => a.obrigatorio || !lerLS(chaveDepois(a.id, u.id, u.login))));
    } catch { /* sem rede: tenta na próxima */ }
  }, []);

  useEffect(() => {
    if (!fazendaId) return;
    carregar();
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [fazendaId, carregar]);

  const aviso = fila[0];
  if (!aviso || !usuario || ROTAS_PUBLICAS.some(r => pathname.startsWith(r))) return null;

  const tirar = () => { setFila(f => f.slice(1)); setErro(""); };

  async function ciente(irPara?: string | null) {
    if (!aviso) return;
    setOcupado(true); setErro("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/avisos", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ aviso_id: aviso.id }) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      // Aviso que saiu do ar enquanto estava aberto: só some
      if (!r.ok && r.status !== 404) { setErro(j.error || "Não foi possível registrar a ciência. Tente de novo."); return; }
      tirar();
      if (irPara) router.push(irPara);
    } catch {
      setErro("Sem conexão: não foi possível registrar a ciência. Tente de novo.");
    } finally { setOcupado(false); }
  }

  function depois() {
    if (!aviso || !usuario) return;
    gravarLS(chaveDepois(aviso.id, usuario.id, usuario.login));
    tirar();
  }

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.35)", zIndex: 3001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <CartaoAviso aviso={aviso} ocupado={ocupado} erro={erro} onCiente={() => ciente()} onDepois={depois} onBotao={() => ciente(aviso.botao_link)} />
    </div>
  );
}
