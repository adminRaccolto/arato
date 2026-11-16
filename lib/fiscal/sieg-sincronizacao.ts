export type ParametrosSync = {
  fazenda_id: string;
  data_inicio: string;
  data_fim: string;
  force_reimport: boolean;
};

/** Interpreta também respostas antigas: falha de download não é consulta vazia bem-sucedida. */
export function resumoRespostaSieg(d: Record<string, unknown>, tipo: "nfe" | "nfse" = "nfe") {
  const lista = (v: unknown) => Array.isArray(v) ? v.map(String) : [];
  const avisos = lista(d.avisos), erros = lista(d.erros);
  const diagnostico = lista(d.diagnostico).filter(m => /ERRO\s*\(|falh|HTTP\s*[45]\d\d|API Key inv[aá]lida/i.test(m));
  // A NFS-e tenta índices alternativos. Uma tentativa recusada seguida de consulta completa é aviso,
  // enquanto respostas antigas sem classificação explícita continuam sendo tratadas como falha.
  const falhaLegada = [...avisos, ...(d.consulta_completa === true ? [] : diagnostico)].some(m => /não consultad|incompleta|ERRO\s*\(|falh|HTTP\s*[45]\d\d|API Key inv[aá]lida/i.test(m));
  const falha = d.sucesso === false || d.consulta_completa === false || ["falha", "parcial"].includes(String(d.situacao)) || erros.length > 0 || falhaLegada;
  const imp = Number((tipo === "nfe" ? d.importados_nfe : d.importadas) ?? 0);
  const dup = Number((tipo === "nfe" ? d.duplicados_nfe : d.duplicadas) ?? 0);
  const canc = Number((tipo === "nfe" ? d.canceladas_nfe : d.canceladas) ?? 0);
  let texto = `${tipo === "nfe" ? "NF-e" : "NFS-e"}: ${imp} importada${imp !== 1 ? "s" : ""}`;
  if (dup) texto += ` · ${dup} já existia${dup !== 1 ? "m" : ""}`;
  if (canc) texto += ` · ${canc} cancelada${canc !== 1 ? "s" : ""} pelo emitente`;
  if (tipo === "nfe") {
    texto += ` · CT-e: ${Number(d.importados_cte ?? 0)} importados`;
    if (Number(d.canceladas_cte)) texto += ` · ${d.canceladas_cte} CT-e cancelados`;
  }
  if (d.situacao === "nao_encontrada") texto += " · Nenhuma NF-e localizada no SIEG para os dados informados. Confira fornecedor, emissão e destinatário.";
  else if (!falha && !imp && !dup && !canc && !Number(d.importados_cte)) texto += " · Nenhum documento encontrado no período.";
  const canceladas = lista(d.canceladas_processadas);
  if (canceladas.length) avisos.push(`NFS-e já processadas e canceladas pelo prestador: nº ${canceladas.join(", ")} (verifique o estorno)`);
  return { falha, aviso: avisos.length > 0 || canceladas.length > 0 || diagnostico.length > 0,
    texto: [texto, ...avisos, ...erros, ...(falha ? diagnostico : diagnostico.length ? ["Consulta concluída após uma tentativa alternativa."] : [])].join(" · ") };
}

/** NF-e/CT-e e NFS-e têm rotas distintas; uma falha não impede a consulta da outra. */
export async function sincronizarDocumentosSieg(parametros: ParametrosSync): Promise<string> {
  const mensagens: string[] = [];
  let houveFalha = false, houveAviso = false;
  for (const tipo of ["nfe", "nfse"] as const) {
    const nome = tipo === "nfe" ? "NF-e/CT-e" : "NFS-e";
    try {
      const res = await fetch(tipo === "nfe" ? "/api/integracoes/sieg-sync" : "/api/integracoes/sieg-sync-nfse", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parametros),
      });
      let d: Record<string, unknown>;
      try { d = await res.json() as Record<string, unknown>; }
      catch { throw new Error(`Resposta inválida (HTTP ${res.status}). Tente um período menor.`); }
      if (!res.ok || d.erro) throw new Error(String(d.erro || `Falha do servidor (HTTP ${res.status})`));
      const resumo = resumoRespostaSieg(d, tipo);
      houveFalha ||= resumo.falha; houveAviso ||= resumo.aviso;
      mensagens.push(resumo.texto);
    } catch (e) {
      houveFalha = true;
      mensagens.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return `${houveFalha ? "✗" : houveAviso ? "⚠" : "✓"} ${mensagens.join(" | ")}`;
}
