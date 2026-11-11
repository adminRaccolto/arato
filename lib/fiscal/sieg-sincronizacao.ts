type ParametrosSync = {
  fazenda_id: string;
  data_inicio: string;
  data_fim: string;
  force_reimport: boolean;
};

/** Sincronização da tela unificada: NF-e/CT-e e NFS-e têm rotas distintas. */
export async function sincronizarDocumentosSieg(parametros: ParametrosSync): Promise<string> {
  const mensagens: string[] = [];
  let houveFalha = false;
  // Sequencial para não disputar o limite de requisições do SIEG entre as rotinas.
  // Uma falha em NF-e/CT-e não impede a busca das notas de serviço.
  for (const tipo of ["nfe", "nfse"] as const) {
    const nome = tipo === "nfe" ? "NF-e/CT-e" : "NFS-e";
    try {
      const res = await fetch(tipo === "nfe" ? "/api/integracoes/sieg-sync" : "/api/integracoes/sieg-sync-nfse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parametros),
      });
      let d: Record<string, unknown>;
      try { d = await res.json() as Record<string, unknown>; }
      catch { throw new Error(`Resposta inválida (HTTP ${res.status}). Tente um período menor.`); }
      if (!res.ok || d.erro) throw new Error(String(d.erro || `Falha do servidor (HTTP ${res.status})`));

      const imp = Number((tipo === "nfe" ? d.importados_nfe : d.importadas) ?? 0);
      const dup = Number((tipo === "nfe" ? d.duplicados_nfe : d.duplicadas) ?? 0);
      const canc = Number((tipo === "nfe" ? d.canceladas_nfe : d.canceladas) ?? 0);
      let resumo = `${tipo === "nfe" ? "NF-e" : nome}: ${imp} importada${imp !== 1 ? "s" : ""}`;
      if (dup > 0) resumo += ` · ${dup} já existia${dup !== 1 ? "m" : ""}`;
      if (canc > 0) resumo += ` · ${canc} cancelada${canc !== 1 ? "s" : ""} pelo emitente`;
      if (tipo === "nfe") {
        resumo += ` · CT-e: ${Number(d.importados_cte ?? 0)} importados`;
        const cteCanc = Number(d.canceladas_cte ?? 0);
        if (cteCanc > 0) resumo += ` · ${cteCanc} CT-e cancelado${cteCanc !== 1 ? "s" : ""}`;
      }
      const avisos = Array.isArray(d.avisos) ? d.avisos.map(String) : [];
      const erros = Array.isArray(d.erros) ? d.erros.map(String) : [];
      if (erros.length) houveFalha = true;
      const canceladasProcessadas = Array.isArray(d.canceladas_processadas) ? d.canceladas_processadas.map(String) : [];
      if (canceladasProcessadas.length) avisos.push(`NFS-e já processadas e canceladas pelo prestador: nº ${canceladasProcessadas.join(", ")} (verifique o estorno)`);
      mensagens.push([resumo, ...avisos, ...erros].join(" · "));
    } catch (e) {
      houveFalha = true;
      mensagens.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return `${houveFalha ? "✗" : "✓"} ${mensagens.join(" | ")}`;
}
