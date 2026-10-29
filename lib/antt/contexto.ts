import type { AmbienteCiot } from "./ciot";

export function emitenteCiot(selecionado?: string | null, cte?: string | null, padrao?: string | null): string {
  return [selecionado, cte, padrao].map(doc => (doc ?? "").replace(/\D/g, "")).find(Boolean) ?? "";
}

function ambienteValido(valor: unknown): AmbienteCiot | null {
  return valor === "producao" || valor === "homologacao" ? valor : null;
}

/** MDF-e usa a configuração do emitente no servidor, inclusive para abas antigas. */
export function ambienteCiotDaOperacao(config: {
  origem?: "mdfe" | "cte";
  ambienteMdfe?: unknown;
  ambienteSolicitado?: unknown;
}): AmbienteCiot | null {
  // A tela de CT-e consulta os parâmetros próprios do CT-e; não herda os do MDF-e.
  if (config.origem === "cte") return ambienteValido(config.ambienteSolicitado);
  return ambienteValido(config.ambienteMdfe);
}
