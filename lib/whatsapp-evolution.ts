// Camada de comunicação com a Evolution API
const EVO_BASE     = process.env.EVOLUTION_API_URL ?? "";
const EVO_KEY      = process.env.EVOLUTION_API_KEY ?? "";
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

function headers() {
  return { "Content-Type": "application/json", apikey: EVO_KEY };
}

export async function enviarTexto(telefone: string, mensagem: string) {
  const url = `${EVO_BASE}/message/sendText/${EVO_INSTANCE}`;
  console.log("[EVO] enviarTexto →", url, "para:", telefone);
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ number: telefone, text: mensagem }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[EVO] erro enviarTexto status:", res.status, "body:", body);
  } else {
    console.log("[EVO] enviarTexto OK status:", res.status);
  }
}

export async function enviarLista(
  telefone: string,
  titulo: string,
  descricao: string,
  botao: string,
  secoes: { title: string; rows: { title: string; description?: string; rowId: string }[] }[]
) {
  const url = `${EVO_BASE}/message/sendList/${EVO_INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      number: telefone,
      title: titulo,
      description: descricao,
      buttonText: botao,
      footerText: "Arato",
      sections: secoes.map(s => ({
        title: s.title,
        rows: s.rows.map(r => ({ rowId: r.rowId, title: r.title, description: r.description ?? "" })),
      })),
    }),
  });
  if (!res.ok) console.error("[EVO] erro enviarLista", await res.text());
}

// Baixa mídia via endpoint base64 da Evolution API
export async function baixarMidiaBase64(messageKey: unknown): Promise<{ base64: string; mimetype: string }> {
  const url = `${EVO_BASE}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ message: messageKey }),
  });
  if (!res.ok) throw new Error("Falha ao baixar mídia: " + res.status);
  const json = await res.json() as { base64: string; mimetype: string };
  return json;
}

// Baixar mídia por URL direta (fallback)
export async function baixarMidia(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { apikey: EVO_KEY } });
  if (!res.ok) throw new Error("Falha ao baixar mídia: " + res.status);
  return Buffer.from(await res.arrayBuffer());
}
