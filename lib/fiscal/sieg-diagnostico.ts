import { createHash } from "node:crypto";
import { consultarAcessoSieg, SiegHttpError, type SiegCredentials } from "../sieg";
import { apresentarDiagnosticoSieg, segundosRetryAfter } from "./sieg-diagnostico-modelo";

type Resultado = ReturnType<typeof apresentarDiagnosticoSieg> & { sieg_status: number; sieg_ok: boolean; etapa: string; retry_after: number };
type Entrada = { ate: number; resultado?: Resultado; pendente?: Promise<Resultado> };
// Proteção por credencial nesta instância; o navegador também conserva o prazo entre aberturas do modal.
const consultas = new Map<string, Entrada>();
export async function diagnosticarSieg(creds: SiegCredentials): Promise<Resultado> {
  const chave = createHash("sha256").update(JSON.stringify(creds)).digest("hex");
  const anterior = consultas.get(chave);
  if (anterior?.pendente) return anterior.pendente;
  if (anterior?.resultado && anterior.ate > Date.now()) return { ...anterior.resultado,
    retry_after: anterior.resultado.sieg_status === 429 ? Math.max(1, Math.ceil((anterior.ate - Date.now()) / 1000)) : 0 };
  const entrada: Entrada = { ate: 0 };
  consultas.set(chave, entrada);
  const executar = async (): Promise<Resultado> => {
    let status = 0, etapa = "baixar-xmls", retryAfter: string | null = null;
    try { ({ status, etapa, retryAfter } = await consultarAcessoSieg(creds)); }
    catch (e) { if (e instanceof SiegHttpError) { status = e.status; etapa = e.etapa; retryAfter = e.retryAfter; } }
    const segundos = status === 429 ? segundosRetryAfter(retryAfter) : 0;
    const resultado = { ...apresentarDiagnosticoSieg(status, etapa), sieg_status: status,
      sieg_ok: status >= 200 && status < 300, etapa, retry_after: segundos };
    entrada.resultado = resultado;
    entrada.ate = Date.now() + (segundos || 10) * 1000;
    return resultado;
  };
  entrada.pendente = executar();
  try { return await entrada.pendente; }
  finally {
    entrada.pendente = undefined;
    if (consultas.size > 64) for (const [k, v] of consultas) if (!v.pendente && v.ate <= Date.now()) consultas.delete(k);
  }
}
