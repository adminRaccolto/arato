// Remessa de mercadoria (Documentos Fiscais → Remessas) salva como NF-e pendente de transmissão (16/11/2026): em vez de
// transmitir na hora, a nota vai para o painel de NF-e como rascunho, com tudo que a transmissão e o registro da remessa
// precisam. Do painel: espelho para conferir, depois transmitir. Só depois de autorizada a remessa é registrada — o estoque
// passa para o depósito do armazém nesse momento, nunca antes (nota não transmitida não move estoque).
import type { SupabaseClient } from "@supabase/supabase-js";

export type RemessaPendente = {
  /** Corpo de /api/fiscal/emitir-nfe, exatamente como a tela de Remessas monta. */
  corpo: Record<string, unknown>;
  /** Corpo de /api/fiscal/remessas (acao "registrar") sem a NF — a NF entra depois de autorizada. */
  registro: Record<string, unknown>;
  /** Escolhas da tela de Remessas que não dá para deduzir do corpo (transporte, IE, operação), para reabrir o rascunho
   *  e editar (17/11/2026). Rascunhos anteriores não têm: a edição reconstrói pelo corpo e pelo registro. */
  tela?: RemessaTela;
};
export type RemessaTela = {
  tr?: { frete: "0" | "1" | "2" | "9"; transportadora_id: string; veiculo_id: string; placa: string; uf_placa: string; motorista_nome: string; motorista_cpf: string };
  emitente_sel?: string; ie_id?: string; tipo_rem?: string; cfop_manual?: string; cfop_outro?: string; cst?: string;
};

/** Operação de transmissão ainda viva para a nota: editar agora não mudaria o que vai (ou foi) para a SEFAZ. */
export const ESTADOS_OPERACAO_ATIVA = ["reservada", "enviada", "pendente", "autorizada", "sincronizada"] as const;
export async function remessaTemTransmissaoAtiva(db: SupabaseClient, notaId: string): Promise<boolean> {
  const { data, error } = await db.from("fiscal_operacoes").select("id").eq("modelo", 55).eq("registro_id", notaId).in("estado", [...ESTADOS_OPERACAO_ATIVA]).limit(1);
  if (error) throw new Error(`Não foi possível conferir a transmissão da NF-e: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Remessa no painel que ainda pode ser editada: pendente, sem chave (nunca autorizada). */
export function remessaEditavel(n: { status?: string | null; chave_acesso?: string | null; dados_nf_json?: unknown }): boolean {
  return n.status === "em_digitacao" && !n.chave_acesso && !!remessaPendenteDe(n.dados_nf_json);
}

/** Motorista gravado nas informações complementares ("Motorista: NOME — CPF 000"), para reabrir rascunho antigo. */
export function motoristaDoInfCpl(infCpl: unknown): { nome: string; cpf: string } {
  const m = /Motorista:\s*([^|]+?)(?:\s*—\s*CPF\s*([\d.\-\/]+))?\s*(?:\||$)/.exec(String(infCpl ?? ""));
  return { nome: m?.[1]?.trim() ?? "", cpf: m?.[2]?.trim() ?? "" };
}

type Dados = Record<string, unknown> | null | undefined;
export type NotaRemessa = {
  id: string; fazenda_id: string; numero?: string | null; serie?: string | null; status?: string | null; data_emissao?: string | null;
  chave_acesso?: string | null; xml_url?: string | null; dados_nf_json?: Dados;
};

export function remessaPendenteDe(dados: unknown): RemessaPendente | null {
  const r = (dados as Dados)?.remessa_pendente as RemessaPendente | undefined;
  return r && typeof r === "object" && r.corpo && typeof r.corpo === "object" && r.registro && typeof r.registro === "object" ? r : null;
}

/** NF-e autorizada vinda de remessa pendente cujo registro (transferência de estoque) ainda não aconteceu. */
export function remessaSemRegistro(n: NotaRemessa): boolean {
  return n.status === "autorizada" && !!remessaPendenteDe(n.dados_nf_json) && !(n.dados_nf_json as Dados)?.remessa_id;
}

const fmtCfop = (c: string) => (c.length === 4 ? `${c[0]}.${c.slice(1)}` : c);

/** Linha do painel de NF-e para a remessa pendente (status em digitação + rascunho, como os demais rascunhos). */
export function notaPendenteDaRemessa(p: {
  fazenda_id: string; numero: string; serie: string; cfop: string; natureza: string; destinatario: string; cnpj_destinatario?: string | null;
  data: string; observacao?: string | null; itens: { descricao: string; ncm?: string | null; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }[];
  pendente: RemessaPendente; destino?: { ie?: string | null; endereco?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null; ibge?: string | null };
}): Record<string, unknown> {
  const cf = p.cfop.replace(/\D/g, "");
  const valorTotal = Math.round(p.itens.reduce((s, i) => s + i.valor_total, 0) * 100) / 100;
  return {
    fazenda_id: p.fazenda_id, numero: p.numero, serie: p.serie, tipo: "saida", cfop: fmtCfop(cf), natureza: p.natureza,
    destinatario: p.destinatario, cnpj_destinatario: (p.cnpj_destinatario ?? "").replace(/\D/g, "") || null, valor_total: valorTotal,
    data_emissao: p.data, status: "em_digitacao", auto: false, observacao: p.observacao || "Remessa — pendente de transmissão",
    itens_json: p.itens.map(i => ({ item: i.descricao, ncm: i.ncm ?? "", cfop: cf, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total })),
    dados_nf_json: {
      rascunho: true, modulo_key: p.pendente.corpo.modulo_key ?? undefined, remessa_pendente: p.pendente,
      dest_ie: p.destino?.ie || undefined, dest_endereco: p.destino?.endereco || undefined, dest_numero: p.destino?.numero || undefined,
      dest_bairro: p.destino?.bairro || undefined, dest_cidade: p.destino?.cidade || undefined, dest_uf: p.destino?.uf || undefined,
      dest_cep: p.destino?.cep || undefined, dest_municipio_ibge: p.destino?.ibge || undefined,
    },
  };
}

type Resposta = { sucesso?: boolean; pendente?: boolean; sincronizacao_pendente?: boolean; chave?: string; numero?: string; serie?: string; protocolo?: string;
  xmlUrl?: string; cStat?: string; xMotivo?: string; erro?: string; ambiente?: string; operacao_id?: string; totais?: Record<string, number>; tributacao_itens?: unknown[] } & Record<string, unknown>;

const EMIT = ["emit_razao", "emit_cnpj", "emit_ie", "emit_endereco", "emit_numero", "emit_bairro", "emit_municipio", "emit_uf", "emit_cep", "emit_fone"] as const;

export type ResultadoRemessaPendente =
  | { ok: true; numero: string; aviso?: string }
  | { ok: false; erro: string; autorizada?: boolean; pendenteSefaz?: boolean };

/** Registra a remessa de uma NF-e já autorizada (transfere o estoque). Também serve para tentar de novo se falhou. */
export async function registrarRemessaAutorizada(db: SupabaseClient, n: NotaRemessa): Promise<ResultadoRemessaPendente> {
  const p = remessaPendenteDe(n.dados_nf_json);
  if (!p) return { ok: false, erro: "Esta NF não veio de uma remessa pendente." };
  const dados = (n.dados_nf_json ?? {}) as Record<string, unknown>;
  const emit = Object.fromEntries(EMIT.map(k => [k, dados[k] as string | undefined]));
  const r = await fetch("/api/fiscal/remessas", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p.registro, data: n.data_emissao || p.registro.data,
      nf: { numero: String(n.numero ?? ""), serie: n.serie ?? undefined, chave: n.chave_acesso ?? null, protocolo: (dados.protocolo_autorizacao as string) ?? null, xml_url: n.xml_url ?? null, emit } }),
  });
  const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; remessa_id?: string };
  if (!j.ok || !j.remessa_id) {
    const erro = j.error ?? `Erro HTTP ${r.status}`;
    await db.from("notas_fiscais").update({ dados_nf_json: { ...dados, remessa_registro_erro: erro } }).eq("id", n.id);
    return { ok: false, autorizada: true, erro: `A NF-e ${n.numero} foi autorizada, mas o registro da remessa (transferência de estoque) falhou: ${erro}. Use "Registrar remessa" na nota para tentar de novo; se persistir, avise o suporte. Não emita outra NF.` };
  }
  const { remessa_registro_erro: _e, ...resto } = dados; void _e;
  await db.from("notas_fiscais").update({ dados_nf_json: { ...resto, remessa_id: j.remessa_id } }).eq("id", n.id);
  return { ok: true, numero: String(n.numero ?? "") };
}

/**
 * Corpo da emissão com o destinatário (armazém) lido do cadastro ATUAL. A remessa pendente guarda uma cópia do cadastro
 * do momento em que foi para o painel; corrigido o cadastro depois (ex.: IE que faltava — LUFT no Cleber, 17/11/2026),
 * o espelho e a transmissão usavam a cópia antiga. Sem cadastro (excluído), vale a cópia guardada.
 */
export async function corpoComDestinatarioAtual(db: SupabaseClient, p: RemessaPendente): Promise<Record<string, unknown>> {
  const pessoaId = (p.registro.destinatario as { pessoa_id?: string } | undefined)?.pessoa_id;
  if (!pessoaId) return p.corpo;
  const { data: a } = await db.from("pessoas").select("nome, cpf_cnpj, inscricao_est, logradouro, numero, bairro, municipio_ibge, municipio, estado, cep").eq("id", pessoaId).maybeSingle();
  if (!a) return p.corpo;
  const t = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
  const d = (p.corpo.destinatario ?? {}) as Record<string, unknown>;
  return { ...p.corpo, destinatario: { ...d,
    nome: t(a.nome) ?? d.nome, cpf_cnpj: String(a.cpf_cnpj ?? "").replace(/\D/g, "") || d.cpf_cnpj, ie: t(a.inscricao_est),
    logradouro: t(a.logradouro) ?? d.logradouro, numero: t(a.numero) ?? d.numero, bairro: t(a.bairro) ?? d.bairro,
    municipio_ibge: t(a.municipio_ibge) ?? d.municipio_ibge, municipio_nome: t(a.municipio) ?? d.municipio_nome, uf: t(a.estado) ?? d.uf,
    cep: String(a.cep ?? "").replace(/\D/g, "") || d.cep,
  } };
}

/** Transmite a remessa pendente do painel: emite com o corpo guardado e, autorizada, atualiza a nota e registra a remessa. */
export async function transmitirRemessaPendente(db: SupabaseClient, n: NotaRemessa, hoje: string): Promise<ResultadoRemessaPendente> {
  const p = remessaPendenteDe(n.dados_nf_json);
  if (!p) return { ok: false, erro: "Esta NF não veio de uma remessa pendente." };
  const dados = (n.dados_nf_json ?? {}) as Record<string, unknown>;
  const corpo = await corpoComDestinatarioAtual(db, p);
  const resp = await fetch("/api/fiscal/emitir-nfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, nota_id: n.id }) });
  const res = await resp.json().catch(() => ({})) as Resposta;
  if (res.pendente || res.sincronizacao_pendente) {
    return { ok: false, pendenteSefaz: true, erro: "A SEFAZ ainda não confirmou o resultado. Consulte em Emissões em conferência antes de transmitir de novo — não emita outra NF.\n\n" + (res.xMotivo ?? "") };
  }
  if (!res.sucesso || !res.chave) {
    const motivo = res.cStat ? `cStat ${res.cStat}: ${res.xMotivo}` : (res.erro ?? res.xMotivo ?? `Erro HTTP ${resp.status}`);
    await db.from("notas_fiscais").update({ dados_nf_json: { ...dados, sefaz_erro: motivo } }).eq("id", n.id).eq("status", "em_digitacao");
    return { ok: false, erro: `NF-e não autorizada — continua pendente no painel.\n\n${motivo}` };
  }
  const { sefaz_erro: _s, rascunho: _r, ...resto } = dados; void _s; void _r;
  const dAtual = (corpo.destinatario ?? {}) as Record<string, string | undefined>;
  const novosDados = {
    ...resto, ...(res.totais ?? {}), ambiente: res.ambiente, protocolo_autorizacao: res.protocolo || undefined,
    // Painel mostra o destinatário como foi na nota (cadastro atual na transmissão)
    dest_ie: dAtual.ie || undefined, dest_endereco: dAtual.logradouro || resto.dest_endereco, dest_numero: dAtual.numero || resto.dest_numero,
    dest_bairro: dAtual.bairro || resto.dest_bairro, dest_cidade: dAtual.municipio_nome || resto.dest_cidade, dest_cep: dAtual.cep || resto.dest_cep,
    fiscal_operacao_id: res.operacao_id, tributacao_itens: res.tributacao_itens,
    ...Object.fromEntries(EMIT.map(k => [k, (res[k] as string | undefined) || undefined])),
  };
  const atual: NotaRemessa = { ...n, status: "autorizada", chave_acesso: res.chave, numero: res.numero ?? n.numero, serie: res.serie ?? n.serie,
    xml_url: res.xmlUrl ?? null, data_emissao: hoje, dados_nf_json: novosDados };
  const { error } = await db.from("notas_fiscais").update({ status: "autorizada", chave_acesso: res.chave, numero: atual.numero, serie: atual.serie,
    xml_url: atual.xml_url, data_emissao: hoje, dados_nf_json: novosDados }).eq("id", n.id);
  if (error) return { ok: false, autorizada: true, erro: `A NF-e ${atual.numero} foi autorizada (chave ${res.chave}), mas não foi possível atualizar o painel: ${error.message}. Avise o suporte antes de qualquer nova emissão.` };
  return await registrarRemessaAutorizada(db, atual);
}
