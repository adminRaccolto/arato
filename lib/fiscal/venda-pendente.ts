import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaFiscal } from "../supabase";
import { remessaTemTransmissaoAtiva } from "./remessa-pendente";

type Registro = Record<string, unknown>;
export type VendaPendente = { corpo: Registro; formulario: Registro; itens: Registro[] };
const objeto = (v: unknown): v is Registro => !!v && typeof v === "object" && !Array.isArray(v);
export function vendaPendenteDe(dados: unknown): VendaPendente | null {
  const p = objeto(dados) ? dados.venda_pendente : null;
  return objeto(p) && objeto(p.corpo) && objeto(p.formulario) && Array.isArray(p.itens) && p.itens.every(objeto) ? p as VendaPendente : null;
}
export function vendaPendenteEditavel(n: Pick<NotaFiscal, "status" | "chave_acesso" | "dados_nf_json">) {
  return n.status === "em_digitacao" && !n.chave_acesso && !!vendaPendenteDe(n.dados_nf_json);
}
/** Reabre os campos conhecidos, com os mesmos tipos; não transforma números ou caixas de seleção em texto. */
export function camposDoRascunho<T extends Record<string, string | boolean>>(padrao: T, guardado: Registro): Partial<T> {
  return Object.fromEntries(Object.keys(padrao).filter(k => typeof guardado[k] === typeof padrao[k]).map(k => [k, guardado[k]])) as Partial<T>;
}
export function corpoDaVendaPendente(n: Pick<NotaFiscal, "id" | "fazenda_id" | "dados_nf_json">): Registro {
  const p = vendaPendenteDe(n.dados_nf_json);
  if (!p || p.corpo.fazenda_id !== n.fazenda_id) throw new Error("Os dados de emissão da nota não correspondem ao rascunho. Reabra a nota para conferir.");
  return { ...p.corpo, nota_id: n.id };
}
export async function salvarRascunhoVenda(db: SupabaseClient, id: string, dados: Omit<NotaFiscal, "id" | "created_at">): Promise<NotaFiscal> {
  const { data, error } = await db.rpc("fiscal_rascunho_nfe", { p_id: id, p_acao: "salvar", p_dados: dados });
  if (error) throw error;
  if (!data?.id) throw new Error("O rascunho não foi confirmado no banco.");
  return data as NotaFiscal;
}
export async function excluirRascunhoVenda(db: SupabaseClient, id: string) {
  const { data, error } = await db.rpc("fiscal_rascunho_nfe", { p_id: id, p_acao: "excluir", p_dados: null });
  if (error) throw error;
  if (!data?.excluida) throw new Error("A exclusão do rascunho não foi confirmada.");
}

type Resultado = { ok: true; numero: string; aviso?: string } | { ok: false; erro: string; pendente?: boolean; autorizada?: boolean };
/** Salvar não chama esta função. Transmissão e vínculos só acontecem pelo comando explícito do usuário. */
export async function transmitirVendaPendente(db: SupabaseClient, n: NotaFiscal): Promise<Resultado> {
  if (!vendaPendenteEditavel(n)) return { ok: false, erro: "A nota não está disponível como rascunho. Atualize o painel e consulte sua situação." };
  if (await remessaTemTransmissaoAtiva(db, n.id)) return { ok: false, pendente: true, erro: "Esta NF-e já tem uma transmissão em andamento ou concluída. Consulte Emissões em conferência antes de transmitir novamente." };
  const corpo = corpoDaVendaPendente(n);
  let resp: Response;
  try { resp = await fetch("/api/fiscal/emitir-nfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); }
  catch { return { ok: false, pendente: true, erro: "A resposta da emissão não foi confirmada. Consulte Emissões em conferência antes de tentar novamente." }; }
  const r = await resp.json().catch(() => null) as Registro | null;
  if (!objeto(r) || (r.sucesso === undefined && !r.erro && !r.xMotivo) || (r.sucesso && !r.chave) || r.pendente || r.sincronizacao_pendente || resp.status >= 500) return { ok: false, pendente: true, erro: "O resultado da emissão ainda não foi confirmado. Consulte Emissões em conferência antes de transmitir novamente." };
  const dados = (n.dados_nf_json ?? {}) as Registro;
  if (!resp.ok || !r.sucesso || !r.chave) {
    const motivo = String(r.xMotivo || r.erro || `Erro HTTP ${resp.status}`);
    const { data: gravada, error } = await db.from("notas_fiscais").update({ dados_nf_json: { ...dados, sefaz_erro: motivo } }).eq("id", n.id).in("status", ["em_digitacao", "rejeitada"]).select("id").maybeSingle();
    return { ok: false, erro: error || !gravada ? `${motivo}. Não foi possível confirmar o motivo no painel: ${error?.message ?? "registro indisponível"}` : `NF-e não autorizada. O rascunho continua no painel para correção: ${motivo}` };
  }
  const { rascunho: _r, sefaz_erro: _e, ...resto } = dados; void _r; void _e;
  const numero = String(r.numero ?? n.numero);
  const metadados: Registro = { ...resto, ...(objeto(r.totais) ? r.totais : {}), ambiente: r.ambiente,
    protocolo_autorizacao: r.protocolo, fiscal_operacao_id: r.operacao_id, tributacao_itens: r.tributacao_itens };
  for (const [k, v] of Object.entries(r)) if (k.startsWith("emit_") && v != null) metadados[k] = v;
  const { data: gravada, error } = await db.from("notas_fiscais").update({ status: "autorizada", chave_acesso: String(r.chave), numero,
    serie: String(r.serie ?? n.serie ?? "1"), xml_url: r.xmlUrl ?? null, dados_nf_json: metadados }).eq("id", n.id).select("id").maybeSingle();
  if (error || !gravada) return { ok: false, autorizada: true, erro: `NF-e ${numero} autorizada, mas a gravação no painel ficou pendente: ${error?.message ?? "registro não confirmado"}. Consulte Emissões em conferência; não emita outra nota.` };
  const avisos: string[] = [];
  const post = async (url: string, body: Registro, rotulo: string) => {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null) as Registro | null;
      if (!res.ok || j?.ok !== true) avisos.push(`${rotulo}: ${j?.error ?? j?.erro ?? `HTTP ${res.status}`}`);
      else if (j?.aviso) avisos.push(String(j.aviso));
    } catch { avisos.push(`${rotulo}: resposta não confirmada.`); }
  };
  await post("/api/fiscal/vincular-nota", { nota_id: n.id }, "Vínculo fiscal");
  if (dados.contrato_id && dados.recebimento_por_carga && !dados.peso_aproximado)
    await post("/api/contratos/faturar-carga", { acao: "vincular", contrato_id: dados.contrato_id, nota_fiscal_id: n.id }, "Vínculo da carga/CR");
  if (dados.romaneio_id) {
    const { error: e } = await db.from("romaneios").update({ nfe_chave: r.chave, nfe_numero: numero, nfe_serie: r.serie ?? n.serie, nfe_status: "autorizada" }).eq("id", String(dados.romaneio_id));
    if (e) avisos.push(`Romaneio: ${e.message}`);
  }
  // Complemento e retorno preservam o vínculo da nota original, como na emissão imediata.
  for (const [campo, patch] of [
    ["retorno_origem_id", { retornada: true, retorno_numero: numero, retorno_chave: r.chave }],
    ["complementar_de", { complemento_numero: numero, complemento_chave: r.chave }],
  ] as const) {
    if (!dados[campo]) continue;
    const id = String(dados[campo]);
    const { data: origem, error: leitura } = await db.from("notas_fiscais").select("dados_nf_json").eq("id", id).maybeSingle();
    if (leitura || !origem) { avisos.push("Vínculo da nota original: leitura não confirmada."); continue; }
    const { error: e } = await db.from("notas_fiscais").update({ dados_nf_json: { ...origem.dados_nf_json, ...patch } }).eq("id", id);
    if (e) avisos.push(`Vínculo da nota original: ${e.message}`);
  }
  if (avisos.length) {
    await db.from("notas_fiscais").update({ dados_nf_json: { ...metadados, pendencias_pos_emissao: avisos } }).eq("id", n.id);
    return { ok: true, numero, aviso: `NF-e autorizada. Confira os vínculos pendentes; não emita outra nota. ${avisos.join(" | ")}` };
  }
  return { ok: true, numero };
}
