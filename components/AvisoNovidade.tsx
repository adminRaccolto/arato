"use client";
// Aviso de novidade em popup, na voz da Olívia. Aparece para quem está logado (no próximo carregamento de tela) e a
// cada novo login. Fechar sem marcar a caixa = some até o próximo login; marcando "Não mostrar mais" = some de vez
// para aquele usuário, em qualquer computador (fica gravado no próprio usuário do login).
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";

// Para um aviso novo: troque o id, o prazo e o texto. O id antigo continua guardado em quem já ocultou.
const AVISO = {
  id: "menu-documentos-fiscais-2026-11",
  ate: "2026-12-31", // depois desta data o aviso não aparece mais
};

const ROTAS_PUBLICAS = ["/login", "/planos", "/cadastro", "/alterar-senha", "/seletor-cliente", "/pagamento", "/offline", "/comercial/faturamento/danfe"];

const chaveSessao = (uid: string, login: string) => `aviso_${AVISO.id}_${uid}_${login}`;
const chaveOculto = (uid: string) => `aviso_oculto_${AVISO.id}_${uid}`;

function lerLS(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLS(k: string) { try { localStorage.setItem(k, "1"); } catch { /* sem armazenamento local */ } }

export default function AvisoNovidade() {
  const { fazendaId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ id: string; login: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [naoMostrar, setNaoMostrar] = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    if (new Date().toISOString().slice(0, 10) > AVISO.ate) return;
    let ativo = true;
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!ativo || !u) return;
      const ocultos = (u.user_metadata?.avisos_ocultos ?? []) as string[];
      if (ocultos.includes(AVISO.id) || lerLS(chaveOculto(u.id))) return;
      const login = u.last_sign_in_at ?? "";
      if (lerLS(chaveSessao(u.id, login))) return;
      setUsuario({ id: u.id, login });
      setAberto(true);
    }).catch(() => {});
    return () => { ativo = false; };
  }, [fazendaId]);

  if (!aberto || !usuario || ROTAS_PUBLICAS.some(r => pathname.startsWith(r))) return null;

  async function fechar(irPara?: string) {
    if (!usuario) return;
    gravarLS(chaveSessao(usuario.id, usuario.login));
    if (naoMostrar) {
      gravarLS(chaveOculto(usuario.id));
      try {
        const { data } = await supabase.auth.getUser();
        const atuais = (data.user?.user_metadata?.avisos_ocultos ?? []) as string[];
        await supabase.auth.updateUser({ data: { avisos_ocultos: [...new Set([...atuais, AVISO.id])] } });
      } catch { /* fica ao menos neste computador */ }
    }
    setAberto(false);
    if (irPara) router.push(irPara);
  }

  const item = (titulo: string, texto: string) => (
    <li style={{ marginBottom: 6 }}><strong style={{ color: "#0B2D50" }}>{titulo}</strong> — {texto}</li>
  );

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.35)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="aviso-titulo" style={{ background: "#fff", borderRadius: 14, width: 520, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(11,45,80,0.22)", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#1a1a1a" }}>
        {/* Cabeçalho: Olívia + logo pequena do Arato */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px", borderBottom: "0.5px solid #DDE2EE" }}>
          <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", flexShrink: 0, border: "2px solid #D5E8F5" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#666" }}>Olívia · suporte do Arato</div>
            <div id="aviso-titulo" style={{ fontSize: 15, fontWeight: 600, color: "#0B2D50" }}>O menu Documentos Fiscais mudou</div>
          </div>
          <img src="/Logo_Arato.png" alt="Arato" style={{ height: 18, width: "auto", flexShrink: 0, opacity: 0.9 }} />
        </div>

        <div style={{ padding: "14px 20px 4px", lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 10px" }}>Oi! Passando para avisar que reorganizamos o menu <strong>Documentos Fiscais</strong>. Agora cada tipo de nota tem um lugar só:</p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
            {item("Painel de Notas", "todas as notas emitidas: acompanhar, cancelar, carta de correção, complemento e DANFE. Era o Monitor NF-e, no menu Fiscal.")}
            {item("Entradas", "Notas de Fornecedores (antigas Notas de Terceiro), Retornos Recebidos, Devoluções Recebidas e Notas Próprias.")}
            {item("Saídas", "Venda de Produção Agrícola, separada em Venda por Contrato e Venda Avulsa, e Remessas.")}
            {item("Transporte", "CT-e e MDF-e.")}
            {item("Classificação", "Regras de Classificação Automática e Pendências de Classificação, que estavam em Comercial e Configurações.")}
          </ul>
          <p style={{ margin: "0 0 4px" }}>Nada foi apagado: as telas são as mesmas, só mudaram de lugar. Se não achar alguma coisa, é só me chamar no canto da tela. 💬</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 20px 16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", cursor: "pointer" }}>
            <input type="checkbox" checked={naoMostrar} onChange={e => setNaoMostrar(e.target.checked)} />
            Não mostrar este aviso novamente
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => fechar("/fiscal")} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid #1A4870", background: "#fff", color: "#1A4870", fontSize: 13, cursor: "pointer" }}>Abrir o Painel de Notas</button>
            <button type="button" onClick={() => fechar()} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Entendi</button>
          </div>
        </div>
      </div>
    </div>
  );
}
