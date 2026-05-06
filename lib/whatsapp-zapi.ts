// Camada de comunicação com a Z-API
const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

export async function enviarTexto(telefone: string, mensagem: string) {
  const res = await fetch(`${ZAPI_BASE}/send-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "client-token": CLIENT_TOKEN },
    body: JSON.stringify({ phone: telefone, message: mensagem }),
  });
  if (!res.ok) console.error("[ZAPI] erro ao enviar texto", await res.text());
}

export async function enviarLista(
  telefone: string,
  titulo: string,
  descricao: string,
  botao: string,
  secoes: { title: string; rows: { title: string; description?: string; rowId: string }[] }[]
) {
  const res = await fetch(`${ZAPI_BASE}/send-list`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "client-token": CLIENT_TOKEN },
    body: JSON.stringify({ phone: telefone, message: descricao, title: titulo, buttonLabel: botao, sections: secoes }),
  });
  if (!res.ok) console.error("[ZAPI] erro ao enviar lista", await res.text());
}

export async function baixarMidia(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar mídia: " + res.status);
  return Buffer.from(await res.arrayBuffer());
}
