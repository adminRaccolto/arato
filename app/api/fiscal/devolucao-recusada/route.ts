/**
 * /api/fiscal/devolucao-recusada — NF-e de devolução de compra recusada pelo fornecedor (Painel de Notas → Nota de Devolução).
 *   GET  ?nota_id=          → prévia: prazo de cancelamento, CFOP sugerido, itens do XML, o que impede seguir
 *   POST { nota_id, motivo, cfop }
 *        → emite a NF-e de ENTRADA própria referenciando a chave da devolução (mesmos itens, valores, desconto e ICMS),
 *          desfaz a devolução no Arato (estoque, títulos, saldo a devolver) e grava a entrada no Monitor.
 * Retomável: o andamento fica em notas_fiscais.dados_nf_json.recusa da devolução. Emitida a entrada, um novo POST não
 * emite outra — só conclui o que faltou. Emissão pendente na SEFAZ usa a mesma identificação da operação fiscal.
 * Dentro de 24 h da autorização o caminho é cancelar a NF-e (a tela oferece); a entrada também é aceita, para quando a
 * mercadoria saiu e voltou nesse prazo. Regras: lib/fiscal/recusa-devolucao.ts; banco: lib/fiscal/recusa-devolucao-server.ts.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { emitirNFe, type ResultadoEmissao } from "../../../../lib/nfe/index";
import { resolverModuloKey } from "../../../../lib/nfe/resolver-emitente";
import {
  cfopRetornoSugerido, finalidadeRetorno, infCplRetorno, itensDoRetorno, lerXmlDevolucao, NATUREZA_RETORNO,
  prazoCancelamento, totalDosItens, validarRecusa, type DestinatarioRetorno,
} from "../../../../lib/fiscal/recusa-devolucao";
import { bloqueioRecusa, desfazerDevolucaoRecusada } from "../../../../lib/fiscal/recusa-devolucao-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const preferredRegion = ["gru1"];

type Db = ReturnType<typeof db>;
type Recusa = {
  status: "emitindo" | "emitida" | "rejeitada" | "registrada";
  requisicao?: string | null; motivo: string; cfop: string; iniciado_em?: string; ultimo_erro?: string;
  retorno?: { chave: string; numero: string; serie: string; protocolo?: string; xmlUrl?: string; ambiente?: string; operacao_id?: string;
    emit_razao?: string; emit_cnpj?: string; emit_ie?: string; emit_endereco?: string; emit_numero?: string; emit_bairro?: string;
    emit_municipio?: string; emit_uf?: string; emit_cep?: string; emit_fone?: string };
  retorno_nota_id?: string; registrada_em?: string;
};
type Nota = {
  id: string; fazenda_id: string; numero: string; serie: string; tipo: string; cfop: string; status: string; destinatario: string;
  cnpj_destinatario: string | null; valor_total: number; chave_acesso: string | null; xml_url: string | null; data_emissao: string;
  dados_nf_json: Record<string, unknown> | null;
};

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
const hojeMT = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" });
const fmtCfop = (c: string) => (c.length === 4 ? `${c[0]}.${c.slice(1)}` : c);

async function carregar(sb: Db, notaId: string): Promise<{ nota: Nota; devId: string } | { erro: string; status: number }> {
  const { data, error } = await sb.from("notas_fiscais").select("*").eq("id", notaId).maybeSingle();
  if (error) throw error;
  const nota = data as Nota | null;
  const devId = String(nota?.dados_nf_json?.devolucao_nf_entrada_id ?? "");
  if (!nota || nota.tipo !== "saida" || !devId) return { erro: "Esta nota não é uma NF-e de devolução de compra emitida pelo Arato.", status: 400 };
  if (!nota.chave_acesso) return { erro: "A devolução não tem chave de acesso.", status: 400 };
  const recusa = nota.dados_nf_json?.recusa as Recusa | undefined;
  if (nota.status !== "autorizada" && recusa?.status !== "registrada") return { erro: "Só uma NF-e de devolução autorizada pode ser registrada como recusada.", status: 409 };
  return { nota, devId };
}

async function xmlDaNota(sb: Db, nota: Nota): Promise<string | null> {
  const { data } = await sb.storage.from("arquivos").download(`${nota.fazenda_id}/nfe_emitidas/${nota.chave_acesso}.xml`);
  if (data) return await data.text();
  if (nota.xml_url) { try { const r = await fetch(nota.xml_url); if (r.ok) return await r.text(); } catch { /* sem XML */ } }
  return null;
}

/** Fornecedor: cadastro de Pessoas primeiro (endereço atualizado), completado pelo XML da devolução. */
async function destinatario(sb: Db, devId: string, doXml: DestinatarioRetorno | null, nota: Nota): Promise<DestinatarioRetorno> {
  const { data: dev } = await sb.from("nf_entradas").select("pessoa_id").eq("id", devId).maybeSingle();
  const { data: p } = dev?.pessoa_id
    ? await sb.from("pessoas").select("nome, cpf_cnpj, inscricao_est, logradouro, numero, bairro, municipio, estado, municipio_ibge, cep").eq("id", dev.pessoa_id).maybeSingle()
    : { data: null };
  const v = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : undefined);
  return {
    nome: doXml?.nome || v(p?.nome) || nota.destinatario,
    cpf_cnpj: (doXml?.cpf_cnpj || v(p?.cpf_cnpj) || nota.cnpj_destinatario || "").replace(/\D/g, "") || undefined,
    ie: v(p?.inscricao_est)?.replace(/\D/g, "") || doXml?.ie,
    logradouro: v(p?.logradouro) || doXml?.logradouro,
    numero: v(p?.numero) || doXml?.numero,
    bairro: v(p?.bairro) || doXml?.bairro,
    municipio_ibge: v(p?.municipio_ibge) || doXml?.municipio_ibge,
    municipio_nome: v(p?.municipio) || doXml?.municipio_nome,
    uf: v(p?.estado) || doXml?.uf,
    cep: (v(p?.cep) || doXml?.cep || "").replace(/\D/g, "") || undefined,
  };
}

async function gravarRecusa(sb: Db, nota: Nota, recusa: Recusa) {
  const dados = { ...(nota.dados_nf_json ?? {}), recusa };
  const { error } = await sb.from("notas_fiscais").update({ dados_nf_json: dados }).eq("id", nota.id);
  if (error) throw new Error(`Não foi possível gravar o andamento da recusa: ${error.message}`);
  nota.dados_nf_json = dados;
}

export async function GET(req: Request) {
  const notaId = new URL(req.url).searchParams.get("nota_id");
  const negado = await exigirAcessoRegistro(req, "notas_fiscais", notaId);
  if (negado) return negado;
  try {
    const sb = db();
    const c = await carregar(sb, notaId!);
    if ("erro" in c) return NextResponse.json({ ok: false, error: c.erro }, { status: c.status });
    const { nota, devId } = c;
    const recusa = (nota.dados_nf_json?.recusa as Recusa | undefined) ?? null;
    const xml = lerXmlDevolucao(await xmlDaNota(sb, nota));
    const cfopSugerido = cfopRetornoSugerido(nota.cfop);
    const montagem = xml.itens.length ? itensDoRetorno(xml.itens, cfopSugerido) : { erro: "O XML autorizado da devolução não foi encontrado no Arato." };
    const bloqueio = recusa?.status === "registrada" ? null : (await bloqueioRecusa(sb, devId)) ?? montagem.erro ?? null;
    const prazo = prazoCancelamento(xml.autorizadaEm);
    return NextResponse.json({
      ok: true,
      nota: { numero: nota.numero, serie: nota.serie, destinatario: nota.destinatario, cfop: nota.cfop, valor_total: nota.valor_total },
      autorizada_em: xml.autorizadaEm, prazo: { dentro: prazo.dentro, limite: prazo.limite?.toISOString() ?? null },
      cfop_sugerido: recusa?.cfop ?? cfopSugerido,
      itens: xml.itens.map(i => ({ descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valor_produto: i.valor_produto, valor_desconto: i.valor_desconto, cst: i.cst })),
      total: totalDosItens(xml.itens),
      bloqueio, recusa,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { nota_id?: string; motivo?: string; cfop?: string };
  const negado = await exigirAcessoRegistro(req, "notas_fiscais", body.nota_id);
  if (negado) return negado;
  const sb = db();
  try {
    const c = await carregar(sb, body.nota_id!);
    if ("erro" in c) return NextResponse.json({ ok: false, error: c.erro }, { status: c.status });
    const { nota, devId } = c;
    let recusa = (nota.dados_nf_json?.recusa as Recusa | undefined) ?? null;
    if (recusa?.status === "registrada") return NextResponse.json({ ok: true, recusa, repetido: true });

    // Itens, fornecedor e total da entrada (montados na emissão; numa retomada, lidos de novo do XML)
    let monitor: { itens: ReturnType<typeof itensDoRetorno>["itens"]; dest: DestinatarioRetorno; total: number } | null = null;

    // ── 1. Emissão (pula se a entrada já foi autorizada numa tentativa anterior) ──
    if (recusa?.status !== "emitida") {
      const motivo = String(body.motivo ?? "").trim();
      const cfop = String(body.cfop ?? "").replace(/\D/g, "");
      const invalido = validarRecusa({ motivo, cfop });
      if (invalido) return NextResponse.json({ ok: false, error: invalido }, { status: 400 });
      const bloqueio = await bloqueioRecusa(sb, devId);
      if (bloqueio) return NextResponse.json({ ok: false, error: bloqueio }, { status: 409 });
      const xml = lerXmlDevolucao(await xmlDaNota(sb, nota));
      if (!xml.itens.length) return NextResponse.json({ ok: false, error: "O XML autorizado da devolução não foi encontrado no Arato." }, { status: 409 });
      const montagem = itensDoRetorno(xml.itens, cfop);
      if (montagem.erro) return NextResponse.json({ ok: false, error: montagem.erro }, { status: 409 });
      const dest = await destinatario(sb, devId, xml.dest, nota);

      // Mesma identificação enquanto a SEFAZ não deu resposta final (reenvio não gera uma segunda NF-e)
      const requisicao = recusa?.status === "emitindo" && recusa.requisicao ? recusa.requisicao : randomUUID();
      recusa = { status: "emitindo", requisicao, motivo, cfop, iniciado_em: recusa?.iniciado_em ?? new Date().toISOString() };
      await gravarRecusa(sb, nota, recusa);

      const dj = nota.dados_nf_json ?? {};
      let moduloKey = String(dj.modulo_key ?? "").split("__ie_")[0];
      if (dj.emit_cnpj) { try { moduloKey = await resolverModuloKey(nota.fazenda_id, String(dj.emit_cnpj), sb); } catch { /* fica o da devolução */ } }
      if (!moduloKey) return NextResponse.json({ ok: false, error: "Não foi possível identificar o emitente da devolução." }, { status: 409 });

      const res: ResultadoEmissao = await emitirNFe(nota.fazenda_id, moduloKey, {
        destinatario: dest,
        itens: montagem.itens.map((i, n) => ({ ...i, codigo: String(n + 1).padStart(4, "0"), ncm: i.ncm.replace(/\D/g, "") })),
        natureza: NATUREZA_RETORNO,
        infCpl: infCplRetorno({ numero: nota.numero, serie: nota.serie, chave: nota.chave_acesso!, motivo, destinatario: dest.nome }),
        frete: "9",
        nfe_ref: nota.chave_acesso!,
        tipo: "0",
        finNFe: finalidadeRetorno(cfop),
      }, dj.emit_ie ? String(dj.emit_ie) : undefined, 0, requisicao);

      if (!res.sucesso || !res.chave) {
        if (res.pendente) {
          return NextResponse.json({ ok: false, pendente: true, error: "A SEFAZ ainda não deu resposta final da NF-e de entrada. Confira em Emissões em conferência e depois clique de novo em Registrar recusa (não será emitida outra nota)." }, { status: 202 });
        }
        const msg = `SEFAZ ${res.cStat}: ${res.xMotivo}`;
        await gravarRecusa(sb, nota, { ...recusa, status: "rejeitada", requisicao: null, ultimo_erro: msg });
        return NextResponse.json({ ok: false, error: msg, cStat: res.cStat }, { status: 422 });
      }
      recusa = {
        ...recusa, status: "emitida",
        retorno: {
          chave: res.chave, numero: String(res.numero ?? ""), serie: String(res.serie ?? res.chave.substring(22, 25).replace(/^0+(?=\d)/, "")),
          protocolo: res.protocolo, xmlUrl: res.xmlUrl, ambiente: res.ambiente, operacao_id: res.operacao_id,
          emit_razao: res.emit_razao, emit_cnpj: res.emit_cnpj, emit_ie: res.emit_ie, emit_endereco: res.emit_endereco, emit_numero: res.emit_numero,
          emit_bairro: res.emit_bairro, emit_municipio: res.emit_municipio, emit_uf: res.emit_uf, emit_cep: res.emit_cep, emit_fone: res.emit_fone,
        },
      };
      await gravarRecusa(sb, nota, recusa);
      monitor = { itens: montagem.itens, dest, total: totalDosItens(xml.itens) };
    }

    const ret = recusa!.retorno!;
    try {
      // ── 2. Desfaz a devolução no Arato ──
      await desfazerDevolucaoRecusada(sb, devId,
        `Recusada pelo fornecedor — retorno pela NF-e de entrada ${ret.numero}/${ret.serie} em ${hojeMT().split("-").reverse().join("/")}. Motivo: ${recusa!.motivo}`);

      // ── 3. NF-e de entrada no Monitor (idempotente pela chave) ──
      if (!monitor) {
        const xml = lerXmlDevolucao(await xmlDaNota(sb, nota));
        monitor = { itens: itensDoRetorno(xml.itens, recusa!.cfop).itens, dest: await destinatario(sb, devId, xml.dest, nota), total: totalDosItens(xml.itens) };
      }
      const { itens, dest, total } = monitor;
      const { data: gravada, error: eG } = await sb.rpc("fiscal_gravar_nota", { p_dados: {
        fazenda_id: nota.fazenda_id, numero: ret.numero, serie: ret.serie, tipo: "entrada",
        cfop: fmtCfop(recusa!.cfop), natureza: NATUREZA_RETORNO, destinatario: dest.nome, cnpj_destinatario: dest.cpf_cnpj ?? null,
        valor_total: total, data_emissao: hojeMT(), status: "autorizada", chave_acesso: ret.chave,
        xml_url: ret.xmlUrl ?? sb.storage.from("arquivos").getPublicUrl(`${nota.fazenda_id}/nfe_emitidas/${ret.chave}.xml`).data.publicUrl,
        auto: false, tipo_emissao: 1,
        observacao: `Retorno da devolução NF-e ${nota.numero}/${nota.serie}, recusada pelo fornecedor. Motivo: ${recusa!.motivo}`,
        itens_json: itens.map(i => ({ item: i.descricao, ncm: i.ncm, cfop: fmtCfop(i.cfop), unidade: i.unidade, quantidade: i.quantidade,
          valor_unitario: i.valor_unitario, valor_total: Math.round(i.quantidade * i.valor_unitario * 100) / 100, valor_desconto: i.valor_desconto ?? 0 })),
        dados_nf_json: {
          modulo_key: nota.dados_nf_json?.modulo_key ?? null, protocolo_autorizacao: ret.protocolo ?? null, ambiente: ret.ambiente ?? null,
          emit_razao: ret.emit_razao, emit_cnpj: ret.emit_cnpj, emit_ie: ret.emit_ie, emit_endereco: ret.emit_endereco, emit_numero: ret.emit_numero,
          emit_bairro: ret.emit_bairro, emit_municipio: ret.emit_municipio, emit_uf: ret.emit_uf, emit_cep: ret.emit_cep, emit_fone: ret.emit_fone,
          dest_ie: dest.ie ?? null, dest_endereco: dest.logradouro ?? null, dest_numero: dest.numero ?? null, dest_cidade: dest.municipio_nome ?? null, dest_uf: dest.uf ?? null,
          // NÃO usar devolucao_nf_entrada_id aqui: o cancelamento desta nota não deve mexer na devolução
          retorno_recusa_de: nota.id, retorno_recusa_chave: nota.chave_acesso,
        },
      } });
      if (eG) throw new Error(`NF-e de entrada não gravada no Monitor: ${eG.message}`);
      const retornoNotaId = (gravada as { id?: string } | null)?.id;
      if (retornoNotaId) await sb.rpc("fiscal_vincular_nota", { p_nota: retornoNotaId }).then(({ error }) => { if (error) console.warn("[recusa] vínculo fiscal pendente:", error.message); });

      const final: Recusa = { status: "registrada", requisicao: recusa!.requisicao ?? null, motivo: recusa!.motivo, cfop: recusa!.cfop, iniciado_em: recusa!.iniciado_em,
        retorno: ret, retorno_nota_id: retornoNotaId, registrada_em: new Date().toISOString() };
      await gravarRecusa(sb, nota, final);
      return NextResponse.json({ ok: true, recusa: final });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, emitida: true, retorno: ret,
        error: `A NF-e de entrada ${ret.numero} foi autorizada, mas o ajuste no Arato não terminou: ${msg}. Clique de novo em Registrar recusa para concluir — não será emitida outra nota.` }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
