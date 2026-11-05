/**
 * Lote de completar cadastros de pessoas: primeiro o IBGE (pelo CEP, depois pelo nome da cidade), depois a Receita para
 * os CNPJs. Sem a rotina ligada, trata só cadastros novos; com ela ligada, também os antigos. Cada pessoa é marcada ao
 * ser tratada, para o próximo lote seguir de onde este parou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarCnpj } from "../cadastros/consultar-cnpj";
import { camposDaReceita, camposPeloCep, digitos, mesmoMunicipio, situacaoInativa, type PessoaCompletar, type RespostaCep } from "./completar";

type Pessoa = PessoaCompletar & { created_at?: string | null; ibge_consultado_em?: string | null; receita_consultada_em?: string | null; receita_erro?: string | null };

const COLUNAS = "id,nome,cpf_cnpj,cep,municipio,estado,municipio_ibge,logradouro,numero,complemento,bairro,email,telefone,inscricao_est,inscricao_mun,cnae,regime_tributario,situacao_cadastral,created_at,ibge_consultado_em,receita_consultada_em,receita_erro";
const DIAS_CADASTRO_NOVO = 3;
const PAUSA_RECEITA_MS = 1200;
const PAUSA_CEP_MS = 100;
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function carregarPessoas(sb: SupabaseClient): Promise<Pessoa[]> {
  const out: Pessoa[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("pessoas").select(COLUNAS).order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []) as unknown as Pessoa[]);
    if (!data || data.length < 1000) break;
  }
  return out;
}

const semIbge = (p: Pessoa) => !(p.municipio_ibge ?? "").trim();
const pendenteIbge = (p: Pessoa) => semIbge(p) && !p.ibge_consultado_em && (digitos(p.cep).length === 8 || (!!(p.municipio ?? "").trim() && !!(p.estado ?? "").trim()));
const pendenteReceita = (p: Pessoa) => digitos(p.cpf_cnpj).length === 14 && !p.receita_consultada_em;

export function resumoPessoas(pessoas: Pessoa[]) {
  return {
    total: pessoas.length,
    sem_ibge: pessoas.filter(semIbge).length,
    pendente_ibge: pessoas.filter(pendenteIbge).length,
    pendente_receita: new Set(pessoas.filter(pendenteReceita).map(p => digitos(p.cpf_cnpj))).size,
    sem_como_resolver: pessoas.filter(p => semIbge(p) && !pendenteIbge(p) && !pendenteReceita(p)).length,
    nao_ativas: pessoas.filter(p => situacaoInativa(p.situacao_cadastral)).map(p => ({ nome: p.nome ?? "", cpf_cnpj: p.cpf_cnpj ?? "", situacao: p.situacao_cadastral ?? "" })).slice(0, 200),
    divergentes: pessoas.filter(p => semIbge(p) && p.ibge_consultado_em && (p.receita_erro ?? "").startsWith("CEP é de")).map(p => ({ nome: p.nome ?? "", cpf_cnpj: p.cpf_cnpj ?? "", motivo: p.receita_erro ?? "" })).slice(0, 200),
  };
}

export type ExemploLote = { nome: string; origem: "cep" | "cidade" | "receita"; campos: Record<string, unknown> };
export type ResultadoLote = { ibge: number; receita: number; receita_sem_mudanca: number; nao_encontrados: number; divergentes: number; fonte_indisponivel: boolean; erros: string[]; exemplos: ExemploLote[] };

export async function rodarLote(sb: SupabaseClient, op: { aplicar: boolean; incluirAntigos: boolean; prazoMs: number; limiteCep: number; limiteCnpj: number }): Promise<ResultadoLote> {
  const inicio = Date.now();
  const noPrazo = () => Date.now() - inicio < op.prazoMs;
  const r: ResultadoLote = { ibge: 0, receita: 0, receita_sem_mudanca: 0, nao_encontrados: 0, divergentes: 0, fonte_indisponivel: false, erros: [], exemplos: [] };
  const corte = new Date(Date.now() - DIAS_CADASTRO_NOVO * 86400000).toISOString();
  const pessoas = (await carregarPessoas(sb)).filter(p => op.incluirAntigos || (p.created_at ?? "") >= corte);
  const agora = new Date().toISOString();

  const gravar = async (p: Pessoa, campos: Record<string, unknown>) => {
    if (!op.aplicar) return true;
    const { error } = await sb.from("pessoas").update(campos).eq("id", p.id);
    if (error) { r.erros.push(`${p.nome}: ${error.message}`); return false; }
    return true;
  };
  const exemplo = (e: ExemploLote) => { if (r.exemplos.length < 40) r.exemplos.push(e); };

  // ── Respostas guardadas: o mesmo CEP ou estado não é consultado duas vezes no lote ──
  const ceps = new Map<string, RespostaCep | null>();
  const buscarCep = async (cep: string): Promise<RespostaCep | null | "falha"> => {
    if (ceps.has(cep)) return ceps.get(cep)!;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
      if (!resp.ok && resp.status !== 400) return "falha";
      const d = resp.status === 400 ? { erro: true } : await resp.json() as RespostaCep & { erro?: boolean | string };
      const achado = (d as { erro?: unknown }).erro ? null : d as RespostaCep;
      ceps.set(cep, achado);
      return achado;
    } catch { return "falha"; }
  };
  const estados = new Map<string, { id: number; nome: string }[]>();
  const ibgePorCidade = async (cidade: string, uf: string): Promise<string | null> => {
    const sigla = uf.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(sigla)) return null;
    if (!estados.has(sigla)) {
      try {
        const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`, { signal: AbortSignal.timeout(8000) });
        estados.set(sigla, resp.ok ? await resp.json() as { id: number; nome: string }[] : []);
      } catch { return null; }
    }
    const achado = estados.get(sigla)!.find(m => mesmoMunicipio(m.nome, cidade));
    return achado ? String(achado.id) : null;
  };

  // ── 1. IBGE pelo CEP; sem CEP válido, pelo nome da cidade ──
  let tratados = 0;
  for (const p of pessoas.filter(pendenteIbge)) {
    if (!noPrazo() || tratados >= op.limiteCep) break;
    const cep = digitos(p.cep);
    const resposta = cep.length === 8 ? await buscarCep(cep) : null;
    if (resposta === "falha") break; // ViaCEP fora do ar: tenta no próximo lote, sem marcar ninguém
    tratados++;
    let campos: Record<string, unknown> = { ibge_consultado_em: agora };
    const pelo = resposta ? camposPeloCep(p, resposta) : null;
    if (pelo && "divergente" in pelo) {
      r.divergentes++;
      campos.receita_erro = pelo.divergente;
      p.receita_erro = pelo.divergente;
    } else if (pelo) {
      campos = { ...campos, ...pelo.campos };
      exemplo({ nome: p.nome ?? "", origem: "cep", campos: pelo.campos });
    } else if ((p.municipio ?? "").trim() && (p.estado ?? "").trim()) {
      const ibge = await ibgePorCidade(p.municipio!, p.estado!);
      if (ibge) { campos.municipio_ibge = ibge; exemplo({ nome: p.nome ?? "", origem: "cidade", campos: { municipio_ibge: ibge } }); }
    }
    if (await gravar(p, campos) && campos.municipio_ibge) { r.ibge++; Object.assign(p, campos); }
    if (op.aplicar) p.ibge_consultado_em = agora;
    await espera(PAUSA_CEP_MS);
  }

  // ── 2. Receita, um CNPJ por vez; quem tem o mesmo CNPJ em outro cliente aproveita a mesma resposta ──
  const porCnpj = new Map<string, Pessoa[]>();
  for (const p of pessoas.filter(pendenteReceita)) {
    const k = digitos(p.cpf_cnpj);
    porCnpj.set(k, [...(porCnpj.get(k) ?? []), p]);
  }
  let consultados = 0;
  for (const [cnpj, grupo] of porCnpj) {
    if (!noPrazo() || consultados >= op.limiteCnpj) break;
    if (consultados > 0) await espera(PAUSA_RECEITA_MS);
    consultados++;
    const consulta = await consultarCnpj(cnpj);
    if (consulta.situacao === "indisponivel") { r.fonte_indisponivel = true; break; } // limite de uso: retoma no próximo lote
    if (consulta.situacao !== "ok") {
      r.nao_encontrados += grupo.length;
      for (const p of grupo) await gravar(p, { receita_consultada_em: agora, receita_erro: consulta.erro });
      continue;
    }
    const d = consulta.dados;
    let ibgeReceita: string | null = null;
    if (grupo.some(semIbge)) {
      const cepR = digitos(String(d.cep ?? ""));
      const viaCep = cepR.length === 8 ? await buscarCep(cepR) : null;
      if (viaCep && viaCep !== "falha" && viaCep.ibge) ibgeReceita = String(viaCep.ibge);
      else if (d.municipio && d.uf) ibgeReceita = await ibgePorCidade(String(d.municipio), String(d.uf));
    }
    for (const p of grupo) {
      const campos = camposDaReceita(p, d, ibgeReceita);
      const mudou = Object.keys(campos).length > 0;
      if (mudou) exemplo({ nome: p.nome ?? "", origem: "receita", campos });
      if (await gravar(p, { ...campos, receita_consultada_em: agora })) {
        if (mudou) r.receita++; else r.receita_sem_mudanca++;
      }
    }
  }
  return r;
}
