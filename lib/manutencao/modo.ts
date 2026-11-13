// Modo manutenção — usado na janela da mudança de servidor (e em qualquer parada programada).
// Liga com a variável ARATO_MANUTENCAO=1 na Vercel (+ novo deploy). Funciona sem banco e sem login:
// o proxy responde direto, antes de qualquer consulta ao Supabase.
// A equipe Raccolto entra mesmo assim abrindo qualquer endereço com ?acesso_manutencao=<ARATO_MANUTENCAO_CHAVE>
// (grava um cookie por 12 h) — é assim que se confere o sistema antes de liberar aos clientes.

export const COOKIE_ACESSO_MANUTENCAO = "arato_manutencao_acesso";
export const PARAM_ACESSO_MANUTENCAO = "acesso_manutencao";

export type DecisaoManutencao =
  | { tipo: "seguir" }
  | { tipo: "estatico" }         // imagem pública: entrega direto, sem passar pela checagem de login
  | { tipo: "liberar_acesso" }   // chave certa na URL: grava cookie e limpa o parâmetro
  | { tipo: "bloquear_api" }
  | { tipo: "bloquear_pagina" };

/** Chave só vale com 16+ caracteres — chave curta ou vazia nunca libera ninguém. */
export function chaveValida(chave: string | undefined): chave is string {
  return typeof chave === "string" && chave.trim().length >= 16;
}

export function decidirManutencao(p: {
  ativo: string | undefined;
  chave: string | undefined;
  pathname: string;
  chaveNaUrl: string | null;
  cookie: string | undefined;
}): DecisaoManutencao {
  if (p.ativo !== "1") return { tipo: "seguir" };
  // imagens públicas (logo da própria página de manutenção)
  if (/\.(png|jpe?g|svg|ico|webp)$/i.test(p.pathname)) return { tipo: "estatico" };
  if (chaveValida(p.chave)) {
    if (p.chaveNaUrl === p.chave) return { tipo: "liberar_acesso" };
    if (p.cookie === p.chave) return { tipo: "seguir" };
  }
  return p.pathname.startsWith("/api/") ? { tipo: "bloquear_api" } : { tipo: "bloquear_pagina" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function paginaManutencao(previsao: string | undefined): string {
  const quando = previsao?.trim() ? `<p class="prev">Previsão de retorno: <b>${esc(previsao.trim())}</b></p>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60">
<title>Arato — manutenção programada</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F6FA;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a}
.card{background:#fff;border:0.5px solid #DDE2EE;border-radius:12px;padding:32px 28px;max-width:440px;margin:16px;text-align:center}
img{height:40px;margin-bottom:18px}h1{font-size:17px;font-weight:600;color:#1A4870;margin:0 0 12px}
p{font-size:13px;line-height:1.6;color:#555;margin:0 0 10px}.prev{background:#D5E8F5;color:#0B2D50;border-radius:8px;padding:10px;margin-top:16px}
small{display:block;font-size:11px;color:#888;margin-top:16px}
</style></head><body><div class="card">
<img src="/logo_Arato_Nova.png" alt="Arato">
<h1>O Arato está em manutenção programada</h1>
<p>Estamos levando o sistema para um servidor no Brasil, mais rápido. Nenhum dado será perdido.</p>
<p>Quando voltar, entre de novo com o mesmo e-mail e senha de sempre.</p>
${quando}
<small>Esta página se atualiza sozinha a cada minuto.</small>
</div></body></html>`;
}
