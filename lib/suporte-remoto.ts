// Suporte remoto (RustDesk) com servidor próprio da Raccolto: suporte.arato.agr.br (Hetzner Helsinque).
// O executável do Windows fica no Storage do Arato e é baixado com a configuração do servidor no NOME do arquivo
// (o RustDesk lê host e key do nome: src/custom_server.rs). A vírgula final protege contra o "(1)" que o Windows
// acrescenta quando o arquivo é baixado duas vezes. No Mac não existe esse recurso: o cliente importa a configuração
// copiada (mesmo formato do botão Exportar do RustDesk: base64 do JSON, invertido).
export const RUSTDESK_VERSAO = "1.5.0";
export const SERVIDOR_SUPORTE = "suporte.arato.agr.br";
export const CHAVE_SUPORTE = "u6FuYoV6uHX2oWlWm7ZcNpcFQknuqbR18eeBKj7kXgw=";

export const NOME_EXE_CONFIGURADO = `rustdesk-host=${SERVIDOR_SUPORTE},key=${CHAVE_SUPORTE},.exe`;
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/arquivos/suporte-remoto`;
export const URL_WINDOWS = `${STORAGE}/rustdesk-${RUSTDESK_VERSAO}-x86_64.exe?download=${encodeURIComponent(NOME_EXE_CONFIGURADO)}`;
const GITHUB = `https://github.com/rustdesk/rustdesk/releases/download/${RUSTDESK_VERSAO}`;
export const URL_MAC_APPLE = `${GITHUB}/rustdesk-${RUSTDESK_VERSAO}-aarch64.dmg`;
export const URL_MAC_INTEL = `${GITHUB}/rustdesk-${RUSTDESK_VERSAO}-x86_64.dmg`;

/** Texto para o botão "Importar configuração do servidor" do RustDesk (Configurações → Rede). */
export function configuracaoParaImportar(): string {
  const json = JSON.stringify({ host: SERVIDOR_SUPORTE, relay: SERVIDOR_SUPORTE, api: "", key: CHAVE_SUPORTE });
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_");
  return b64.split("").reverse().join("");
}

export type SistemaCliente = "windows" | "mac" | "outro";
export function detectarSistema(ua: string, plataforma = ""): SistemaCliente {
  const t = `${ua} ${plataforma}`.toLowerCase();
  if (/iphone|ipad|android/.test(t)) return "outro";
  if (t.includes("win")) return "windows";
  if (t.includes("mac")) return "mac";
  return "outro";
}
