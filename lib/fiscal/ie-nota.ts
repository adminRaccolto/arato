// IE do emitente de cada nota no Painel de Notas (17/11/2026). Fontes seguras, nesta ordem: a IE gravada na nota na
// autorização (dados_nf_json.emit_ie); a da configuração do emitente usada na emissão (modulo_key — rascunho e
// remessa pendente). Série NÃO serve: a mesma série é usada por IEs de produtores diferentes. Sem fonte, null.
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function ieEmitenteDaNota(dados: Record<string, unknown> | null | undefined, iePorModulo: Record<string, string>): string | null {
  const d = dados ?? {};
  return dig(d.emit_ie) || dig(iePorModulo[String(d.modulo_key ?? "")]) || null;
}

/** "136859909" → "13.685.990-9" (9 dígitos); outros tamanhos ficam como estão. */
export function formatarIe(ie: string | null | undefined): string {
  const d = dig(ie);
  return d.length === 9 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d)$/, "$1.$2.$3-$4") : d;
}

/** Id da IE do produtor embutido na chave do módulo fiscal ("fiscal_pf_<cpf>__ie_<uuid>"). */
export function idIeDoModulo(modulo: string): string | null {
  return /__ie_([0-9a-f-]{36})$/i.exec(modulo)?.[1] ?? null;
}
