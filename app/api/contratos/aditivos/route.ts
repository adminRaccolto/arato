/**
 * GET  /api/contratos/aditivos?contrato_id=  histórico do contrato e quanto já foi faturado.
 * POST /api/contratos/aditivos               registra um aditivo e aplica no contrato, no item e no título a receber.
 *      { acao: "substituir", contrato_id, contrato_novo_id } passa o saldo para o contrato novo.
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { ajusteDoTitulo, planejarAditivo, planejarSubstituicao, type EntradaAditivo, type PlanoAditivo } from "../../../../lib/contratos/aditivos";
import { pesoDaNota } from "../../../../lib/contratos/romaneio-nf";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SEM_MIGRACAO = /contratos_aditivos|valor_ajuste_aditivo|contrato_origem_id/i;

function erro(e: unknown) {
  const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
  return SEM_MIGRACAO.test(msg)
    ? NextResponse.json({ ok: false, error: "Execute a Seção 418 no Supabase para usar os aditivos." }, { status: 503 })
    : NextResponse.json({ ok: false, error: msg }, { status: 500 });
}

const kgPorSaca = (produto: string | null | undefined, itemKg: number, quantidadeSc: number) => {
  if (itemKg > 0 && quantidadeSc > 0) return itemKg / quantidadeSc;
  return (produto ?? "").toLowerCase().startsWith("algod") ? 15 : 60;
};

/**
 * Sacas com NF autorizada: pelo romaneio do contrato (id ou chave da NF), pelo faturamento direto, pelo vínculo de
 * recebimento por carga e pelo número do contrato gravado nas notas mais antigas.
 */
async function sacasFaturadas(sb: SupabaseClient, contratoId: string, kgSaca: number): Promise<number> {
  const { data: contrato } = await sb.from("contratos").select("numero, fazenda_id").eq("id", contratoId).maybeSingle();
  const { data: roms } = await sb.from("romaneios").select("id, nfe_chave").eq("contrato_id", contratoId);
  const idsRom = (roms ?? []).map(r => r.id as string);
  const chaves = (roms ?? []).map(r => r.nfe_chave as string | null).filter((c): c is string => !!c);
  const { data: vinc } = await sb.from("contrato_faturamentos").select("nota_fiscal_id").eq("contrato_id", contratoId);
  const idsVinc = (vinc ?? []).map(v => v.nota_fiscal_id as string);
  const notas = new Map<string, { itens_json: unknown }>();
  const juntar = (lista: { id: string; itens_json: unknown }[] | null) => { for (const n of lista ?? []) notas.set(n.id, n); };
  const base = () => sb.from("notas_fiscais").select("id, itens_json").eq("tipo", "saida").eq("status", "autorizada");
  if (idsRom.length) juntar((await base().in("romaneio_id", idsRom)).data as { id: string; itens_json: unknown }[] | null);
  if (chaves.length) juntar((await base().in("chave_acesso", chaves)).data as { id: string; itens_json: unknown }[] | null);
  if (contrato?.numero) juntar((await base().eq("fazenda_id", contrato.fazenda_id).eq("dados_nf_json->>contrato_numero", contrato.numero)).data as { id: string; itens_json: unknown }[] | null);
  if (idsVinc.length) juntar((await base().in("id", idsVinc)).data as { id: string; itens_json: unknown }[] | null);
  juntar((await base().eq("dados_nf_json->>contrato_id", contratoId)).data as { id: string; itens_json: unknown }[] | null);
  let kg = 0;
  for (const n of notas.values()) kg += pesoDaNota(n.itens_json as { unidade?: string; quantidade?: number }[] | null, kgSaca);
  return Math.round((kg / kgSaca) * 1000) / 1000;
}

async function aplicar(sb: SupabaseClient, contrato: Record<string, unknown>, plano: PlanoAditivo, kgSaca: number, registro: Record<string, unknown>) {
  const contratoId = contrato.id as string;
  const { count } = await sb.from("contratos_aditivos").select("id", { count: "exact", head: true }).eq("contrato_id", contratoId);
  const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", contrato.fazenda_id as string).maybeSingle();
  const { data: aditivo, error: eAd } = await sb.from("contratos_aditivos").insert({
    contrato_id: contratoId, fazenda_id: contrato.fazenda_id, conta_id: fz?.conta_id ?? null, numero: (count ?? 0) + 1,
    antes: plano.antes, depois: plano.depois, descricao: plano.descricao, ...registro,
  }).select("*").single();
  if (eAd) throw eAd;

  if (Object.keys(plano.contrato).length) {
    const { error } = await sb.from("contratos").update(plano.contrato).eq("id", contratoId);
    if (error) { await sb.from("contratos_aditivos").delete().eq("id", aditivo.id); throw error; }
  }

  // O preço da próxima NF vem do item do contrato
  if (plano.item) {
    const { data: itens } = await sb.from("contrato_itens").select("id, quantidade, valor_unitario").eq("contrato_id", contratoId).order("created_at").limit(1);
    const item = itens?.[0];
    if (item) {
      const sc = plano.item.quantidade_sc ?? (Number(item.quantidade) / kgSaca);
      const preco = plano.item.preco ?? Number(item.valor_unitario);
      const { error } = await sb.from("contrato_itens").update({
        quantidade: Math.round(sc * kgSaca * 1000) / 1000, valor_unitario: preco, valor_total: Math.round(sc * preco * 100) / 100,
      }).eq("id", item.id);
      if (error) throw error;
    }
  }

  const avisos: string[] = [];
  const crId = contrato.lancamento_cr_id as string | null;
  if (crId && (plano.deltaCr !== 0 || plano.cr)) {
    const { data: titulo } = await sb.from("lancamentos").select("status, valor, valor_pago, lote_id, conciliado").eq("id", crId).maybeSingle();
    if (titulo) {
      const ajuste = ajusteDoTitulo(titulo, plano.deltaCr);
      if ("aviso" in ajuste) avisos.push(ajuste.aviso);
      else {
        const { error } = await sb.from("lancamentos").update({ ...(plano.deltaCr !== 0 ? ajuste : {}), ...(plano.cr ?? {}) }).eq("id", crId);
        if (error) avisos.push(`O título a receber não foi atualizado: ${error.message}`);
      }
    }
  }
  return { aditivo, avisos };
}

export async function GET(req: NextRequest) {
  const contratoId = req.nextUrl.searchParams.get("contrato_id");
  const negado = await exigirAcessoRegistro(req, "contratos", contratoId);
  if (negado) return negado;
  try {
    const sb = admin();
    const { data: c } = await sb.from("contratos").select("produto, quantidade_sc").eq("id", contratoId!).maybeSingle();
    const { data: itens } = await sb.from("contrato_itens").select("quantidade").eq("contrato_id", contratoId!).order("created_at").limit(1);
    const kgSaca = kgPorSaca(c?.produto, Number(itens?.[0]?.quantidade) || 0, Number(c?.quantidade_sc) || 0);
    const faturado_sc = await sacasFaturadas(sb, contratoId!, kgSaca);
    const { data, error } = await sb.from("contratos_aditivos").select("*").eq("contrato_id", contratoId!).order("numero");
    if (error) return SEM_MIGRACAO.test(error.message) ? NextResponse.json({ ok: true, aditivos: [], faturado_sc, sem_migracao: true }) : erro(error);
    return NextResponse.json({ ok: true, aditivos: data ?? [], faturado_sc });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao?: string; contrato_id: string; contrato_novo_id?: string; tipo?: EntradaAditivo["tipo"]; data_aditivo?: string; descricao?: string;
      quantidade_sc?: number; preco?: number; data?: string; pessoa_id?: string; pdf_url?: string; pdf_nome?: string; usuario_nome?: string;
    };
    const negado = await exigirAcessoRegistro(req, "contratos", body.contrato_id);
    if (negado) return negado;
    const sb = admin();
    const { data: contrato, error: eC } = await sb.from("contratos").select("*").eq("id", body.contrato_id).maybeSingle();
    if (eC || !contrato) return NextResponse.json({ ok: false, error: eC?.message ?? "Contrato não encontrado." }, { status: 404 });

    const { data: itens } = await sb.from("contrato_itens").select("quantidade").eq("contrato_id", contrato.id).order("created_at").limit(1);
    const kgSaca = kgPorSaca(contrato.produto, Number(itens?.[0]?.quantidade) || 0, Number(contrato.quantidade_sc) || 0);
    const faturado = await sacasFaturadas(sb, contrato.id, kgSaca);
    const hoje = new Date().toISOString().slice(0, 10);

    if (body.acao === "substituir") {
      const negadoNovo = await exigirAcessoRegistro(req, "contratos", body.contrato_novo_id);
      if (negadoNovo) return negadoNovo;
      const { data: novo } = await sb.from("contratos").select("id, numero, contrato_origem_id").eq("id", body.contrato_novo_id!).maybeSingle();
      if (!novo || novo.contrato_origem_id !== contrato.id) return NextResponse.json({ ok: false, error: "O contrato novo não veio deste contrato." }, { status: 400 });
      const { data: ja } = await sb.from("contratos_aditivos").select("id").eq("novo_contrato_id", novo.id).maybeSingle();
      if (ja) return NextResponse.json({ ok: true, avisos: [] });
      const plano = planejarSubstituicao(contrato, faturado, String(novo.numero));
      if ("erro" in plano) return NextResponse.json({ ok: false, error: plano.erro }, { status: 400 });
      const r = await aplicar(sb, contrato, plano, kgSaca, { tipo: "novo_contrato", data_aditivo: hoje, novo_contrato_id: novo.id, usuario_nome: body.usuario_nome ?? null });
      return NextResponse.json({ ok: true, ...r });
    }

    if (!body.tipo || !body.data_aditivo) return NextResponse.json({ ok: false, error: "Informe o tipo e a data do aditivo." }, { status: 400 });

    let pessoa: EntradaAditivo["pessoa"];
    let local: EntradaAditivo["local"];
    if (body.pessoa_id) {
      const { data: p } = await sb.from("pessoas").select("id, nome, cpf_cnpj, logradouro, municipio, estado, cep").eq("id", body.pessoa_id).maybeSingle();
      if (!p) return NextResponse.json({ ok: false, error: "Pessoa não encontrada." }, { status: 404 });
      pessoa = { id: p.id, nome: p.nome };
      local = { pessoa_id: p.id, nome: p.nome, cnpj: p.cpf_cnpj, logradouro: p.logradouro, municipio: p.municipio, uf: p.estado, cep: p.cep };
    }
    const { count: nRomaneios } = await sb.from("romaneios").select("id", { count: "exact", head: true }).eq("contrato_id", contrato.id);
    const plano = planejarAditivo(contrato, faturado, {
      tipo: body.tipo, descricao: body.descricao, quantidade_sc: body.quantidade_sc, preco: body.preco, data: body.data, pessoa, local, temEntrega: (nRomaneios ?? 0) > 0,
    });
    if ("erro" in plano) return NextResponse.json({ ok: false, error: plano.erro }, { status: 400 });

    const r = await aplicar(sb, contrato, plano, kgSaca, {
      tipo: body.tipo, data_aditivo: body.data_aditivo, pdf_url: body.pdf_url ?? null, pdf_nome: body.pdf_nome ?? null, usuario_nome: body.usuario_nome ?? null,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return erro(e); }
}
