"use client";
// Ajuda → Suporte → Suporte Remoto: o cliente baixa o RustDesk já ligado ao servidor da Raccolto
// (suporte.arato.agr.br) e informa ID e senha ao atendente. Ver lib/suporte-remoto.ts.
import { useEffect, useState } from "react";
import TopNav from "../../../components/TopNav";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import {
  RUSTDESK_VERSAO, SERVIDOR_SUPORTE, CHAVE_SUPORTE, URL_WINDOWS, URL_MAC_APPLE, URL_MAC_INTEL,
  configuracaoParaImportar, detectarSistema, type SistemaCliente,
} from "../../../lib/suporte-remoto";

const AZUL = "#1A4870";
const card: React.CSSProperties = { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 20 };
const botaoPrincipal: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", background: AZUL, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none" };
const botaoSecundario: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "#fff", color: AZUL, border: `0.5px solid ${AZUL}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none" };

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <div style={{ flex: "0 0 28px", height: 28, borderRadius: 14, background: "#D5E8F5", color: "#0B2D50", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: "#555", lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

export default function SuporteRemotoPage() {
  const [sistema, setSistema] = useState<SistemaCliente>("windows");
  const [copiado, setCopiado] = useState("");
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setSistema(detectarSistema(navigator.userAgent, nav.userAgentData?.platform ?? ""));
  }, []);

  async function copiar(texto: string, rotulo: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(rotulo); setTimeout(() => setCopiado(""), 2500); }
    catch { window.prompt("Copie o texto abaixo:", texto); }
  }

  const abas: { id: SistemaCliente; rotulo: string }[] = [{ id: "windows", rotulo: "Windows" }, { id: "mac", rotulo: "Mac" }];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ padding: "20px 24px 40px", maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111111" }}>Suporte Remoto</h1>
            <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>Permita que a equipe Arato veja e opere o seu computador para resolver um problema junto com você.</div>
          </div>
        </OperationalHeading>

        <div style={{ display: "flex", gap: 8 }}>
          {abas.map(a => (
            <OperationalButton key={a.id} data-arato-button="secondary" onClick={() => setSistema(a.id)}
              style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `0.5px solid ${sistema === a.id ? AZUL : "#DDE2EE"}`, background: sistema === a.id ? "#D5E8F5" : "#fff", color: sistema === a.id ? "#0B2D50" : "#555" }}>
              {a.rotulo}
            </OperationalButton>
          ))}
        </div>

        {sistema === "outro" && (
          <div style={{ ...card, background: "#FBF3E0", borderColor: "#E8D3A0", fontSize: 13, color: "#7A5A10" }}>
            O suporte remoto funciona em computador com Windows ou Mac. Abra esta página no computador que precisa de ajuda.
          </div>
        )}

        {sistema !== "mac" && (
          <section style={{ ...card, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Windows</div>
                <div style={{ fontSize: 12, color: "#666" }}>Já vem ligado ao servidor de suporte da Arato. Não precisa configurar nada.</div>
              </div>
              <a href={URL_WINDOWS} style={botaoPrincipal} download>⬇ Baixar suporte remoto</a>
            </div>
            <Passo n={1} titulo="Abra o arquivo baixado">
              Ele aparece na pasta Downloads com um nome longo começando por <em>rustdesk-host=</em>. <strong>Não renomeie o arquivo</strong>: é o nome que liga o programa ao servidor da Arato.
              Se o Windows perguntar se deseja executar, clique em <strong>Executar</strong> (ou em <em>Mais informações → Executar assim mesmo</em>).
            </Passo>
            <Passo n={2} titulo="Informe o seu ID e a senha ao atendente">
              Na tela do programa aparecem <strong>Seu ID</strong> (9 ou 10 números) e uma <strong>senha</strong>. Passe os dois para o atendente da Arato por telefone ou WhatsApp.
            </Passo>
            <Passo n={3} titulo="Aceite a conexão">
              Quando o atendente conectar, clique em <strong>Aceitar</strong>. Você acompanha tudo na tela e pode encerrar a qualquer momento clicando em <strong>Desconectar</strong>.
            </Passo>
          </section>
        )}

        {sistema === "mac" && (
          <section style={{ ...card, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Mac</div>
              <div style={{ fontSize: 12, color: "#666" }}>No Mac a ligação com o servidor da Arato é feita uma vez, colando a configuração (passo 3).</div>
            </div>
            <Passo n={1} titulo="Baixe o programa">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <a href={URL_MAC_APPLE} style={botaoPrincipal}>⬇ Mac com chip Apple (M1 a M4)</a>
                <a href={URL_MAC_INTEL} style={botaoSecundario}>⬇ Mac com processador Intel</a>
              </div>
              <div style={{ marginTop: 6 }}>Não sabe qual é o seu? Menu  → <em>Sobre Este Mac</em>: se aparecer &quot;Chip Apple&quot;, use o primeiro botão.</div>
            </Passo>
            <Passo n={2} titulo="Instale e abra">
              Abra o arquivo baixado, arraste o RustDesk para a pasta <strong>Aplicativos</strong> e abra. O Mac vai pedir as permissões de <strong>Gravação de Tela</strong> e <strong>Acessibilidade</strong>: autorize as duas em Ajustes do Sistema → Privacidade e Segurança.
            </Passo>
            <Passo n={3} titulo="Ligue ao servidor da Arato">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
                <OperationalButton data-arato-button="primary" onClick={() => copiar(configuracaoParaImportar(), "config")} style={botaoPrincipal}>
                  {copiado === "config" ? "✓ Configuração copiada" : "Copiar configuração"}
                </OperationalButton>
              </div>
              No RustDesk, abra <strong>Configurações → Rede</strong>, clique em <em>Desbloquear configurações de rede</em> e depois no ícone <strong>Importar configuração do servidor</strong> (prancheta). Confira se aparece <strong>Pronto</strong> no rodapé.
            </Passo>
            <Passo n={4} titulo="Informe o seu ID e a senha ao atendente">
              Passe o <strong>ID</strong> e a <strong>senha</strong> mostrados no programa para o atendente da Arato e clique em <strong>Aceitar</strong> quando ele conectar.
            </Passo>
          </section>
        )}

        <section style={{ ...card, fontSize: 12, color: "#555", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Segurança</div>
          <div>O acesso só acontece com o ID e a senha que você informar, e a senha muda a cada vez que o programa é aberto. A conexão é criptografada e passa pelo servidor próprio da Arato.</div>
          <div>Configuração manual (se o atendente pedir):
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginLeft: 6 }}>
              <button type="button" onClick={() => copiar(SERVIDOR_SUPORTE, "host")} style={{ ...botaoSecundario, padding: "3px 10px", fontSize: 11 }}>{copiado === "host" ? "✓ copiado" : `Servidor: ${SERVIDOR_SUPORTE}`}</button>
              <button type="button" onClick={() => copiar(CHAVE_SUPORTE, "key")} style={{ ...botaoSecundario, padding: "3px 10px", fontSize: 11 }}>{copiado === "key" ? "✓ copiado" : "Copiar chave"}</button>
            </span>
          </div>
          <div style={{ color: "#888" }}>Programa: RustDesk {RUSTDESK_VERSAO} (código aberto, licença AGPL-3.0 — código-fonte em github.com/rustdesk/rustdesk).</div>
        </section>
      </main>
    </div>
  );
}
