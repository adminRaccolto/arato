type ConfigFiscal = Record<string, string>;

type RegistroFiscal = {
  modulo: string;
  fazenda_id: string;
  config: unknown;
  updated_at?: string | null;
};

// Configs por IE não são emitentes: elas contêm apenas os ajustes da inscrição.
// Cada titular deve ter uma única opção, mesmo cadastrado em várias fazendas.
export function indexarConfigsEmitentes(
  registros: RegistroFiscal[],
  fazendaId: string,
): Record<string, ConfigFiscal> {
  const escolhidos = new Map<string, RegistroFiscal>();
  const qualidade = (registro: RegistroFiscal): number => {
    const c = (registro.config ?? {}) as ConfigFiscal;
    const documento = (c.cpf_cnpj_emitente ?? "").replace(/\D/g, "");
    const titular = registro.modulo.match(/^fiscal_(?:pf|emp)_(\d{11}|\d{14})$/)?.[1];
    const documentoValido = [11, 14].includes(documento.length) && (!titular || titular === documento);
    const nomeValido = !!c.razao_social?.trim() && c.razao_social !== "EMITENTE NÃO CONFIGURADO";
    return (documentoValido ? 4 : 0) + (nomeValido ? 2 : 0) + (registro.fazenda_id === fazendaId ? 1 : 0);
  };
  for (const registro of registros) {
    if (registro.modulo.includes("__ie_")) continue;
    const anterior = escolhidos.get(registro.modulo);
    if (!anterior || qualidade(registro) > qualidade(anterior) || (
      qualidade(registro) === qualidade(anterior) &&
      (registro.updated_at ?? "") > (anterior.updated_at ?? "")
    )) escolhidos.set(registro.modulo, registro);
  }
  return Object.fromEntries(Array.from(escolhidos, ([modulo, registro]) => [modulo, (registro.config ?? {}) as ConfigFiscal]));
}
