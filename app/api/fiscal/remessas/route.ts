/**
 * POST /api/fiscal/remessas
 * Remessa de mercadoria para armazém geral / depósito / condomínio logístico (tela Remessas) e a volta do estoque no
 * retorno (tela Retornos). A mercadoria continua sendo do cliente: a remessa TRANSFERE o estoque do depósito próprio
 * para o depósito do armazém (par saída + entrada pelo custo médio); o retorno faz o caminho inverso. Diretriz do dono
 * 27/10/2026 (Seção 378). Nunca gera CP/CR.
 *
 * acao "registrar": grava a remessa (emitida pelo Arato ou fora), transfere o estoque e registra a NF no Monitor.
 * acao "retorno_estoque": tira do depósito do armazém o que voltou — usada depois de processar a NF de retorno recebida
 *   (a entrada no depósito próprio vem da própria NF).
 * acao "registrar_retorno": retorno emitido pelo Arato ou emitido fora (sem NF de entrada): volta o estoque (do depósito
 *   do armazém para o próprio; remessa antiga, que baixou, vira entrada), acumula o retorno na remessa (parcial) e
 *   registra a NF no Monitor.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

export const runtime = "nodejs";

type Item = { insumo_id?: string | null; descricao: string; ncm?: string; unidade?: string; quantidade: number; valor_unitario?: number; valor_total?: number };

const adm = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fazendaDoDeposito(db: any, depositoId: string | null | undefined, padrao: string): Promise<string> {
  if (!depositoId) return padrao;
  const { data } = await db.from("depositos").select("fazenda_id").eq("id", depositoId).maybeSingle();
  return (data?.fazenda_id as string | undefined) ?? padrao;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function custoMedio(db: any, insumoIds: string[]): Promise<Map<string, number>> {
  if (!insumoIds.length) return new Map();
  const { data } = await db.from("insumos").select("id, custo_medio").in("id", insumoIds);
  return new Map(((data ?? []) as { id: string; custo_medio: number | null }[]).map(i => [i.id, Number(i.custo_medio ?? 0)]));
}

// Estoque do retorno: com a remessa transferida, sai do depósito do armazém (e entra no próprio, se informado);
// remessa antiga (baixou o estoque) só tem entrada no depósito próprio.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function moverRetorno(db: any, rem: Record<string, any>, nfNumero: string, data: string, itens: { insumo_id: string; quantidade: number }[], voltaDepositoId: string | null | undefined) {
  const validos = itens.filter(i => i.insumo_id && Number(i.quantidade) > 0);
  if (!validos.length) return null;
  const custos = await custoMedio(db, validos.map(i => i.insumo_id));
  const motivo = `Retorno NF ${nfNumero} ← ${rem.destinatario_nome}`.slice(0, 200);
  const movs: Record<string, unknown>[] = [];
  if (rem.estoque_transferido && rem.deposito_terceiro_id) {
    const fazTerc = await fazendaDoDeposito(db, rem.deposito_terceiro_id, rem.fazenda_id);
    for (const i of validos) movs.push({ fazenda_id: fazTerc, insumo_id: i.insumo_id, tipo: "saida", motivo, quantidade: Number(i.quantidade), valor_unitario: custos.get(i.insumo_id) ?? null, data, deposito_id: rem.deposito_terceiro_id, observacao: "Retorno de armazém", auto: true });
  }
  if (voltaDepositoId) {
    const fazVolta = await fazendaDoDeposito(db, voltaDepositoId, rem.fazenda_id);
    for (const i of validos) movs.push({ fazenda_id: fazVolta, insumo_id: i.insumo_id, tipo: "entrada", motivo, quantidade: Number(i.quantidade), valor_unitario: custos.get(i.insumo_id) ?? null, data, deposito_id: voltaDepositoId, observacao: "Retorno de armazém", auto: true });
  }
  if (!movs.length) return null;
  const { error } = await db.from("movimentacoes_estoque").insert(movs);
  return error ? error.message : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown> & { acao: string; fazenda_id: string };
    const negado = await exigirAcessoFazenda(req, body.fazenda_id);
    if (negado) return negado;
    const db = adm();

    if (body.acao === "registrar") {
      const b = body as unknown as {
        fazenda_id: string; nf_entrada_id?: string | null; emissao: "arato" | "externa"; cfop: string; cfop_retorno: string; natureza: string;
        destinatario: { pessoa_id?: string | null; nome: string; uf?: string | null };
        deposito_origem_id: string; deposito_terceiro_id: string; data: string; observacao?: string;
        nf: { numero: string; serie?: string; chave?: string | null; protocolo?: string | null; xml?: string | null; xml_url?: string | null; emit?: Record<string, string | undefined> };
        itens: Item[];
      };
      if (!b.nf?.numero?.trim()) return NextResponse.json({ ok: false, error: "Informe o número da NF de remessa." }, { status: 400 });
      if (!b.deposito_origem_id || !b.deposito_terceiro_id) return NextResponse.json({ ok: false, error: "Escolha o depósito de origem e o depósito do armazém." }, { status: 400 });
      if (b.deposito_origem_id === b.deposito_terceiro_id) return NextResponse.json({ ok: false, error: "O depósito do armazém precisa ser diferente do depósito de origem." }, { status: 400 });
      if (!b.itens?.length || b.itens.some(i => !i.insumo_id || !(Number(i.quantidade) > 0))) {
        return NextResponse.json({ ok: false, error: "Todo item precisa estar ligado a um produto do cadastro e ter quantidade." }, { status: 400 });
      }
      const chave = (b.nf.chave ?? "").replace(/\D/g, "") || null;
      if (chave) {
        const { data: dup } = await db.from("nf_remessas_logisticas").select("id").eq("nf_remessa_chave", chave).neq("status", "cancelada").limit(1);
        if (dup?.length) return NextResponse.json({ ok: false, error: "Esta NF de remessa já está registrada." }, { status: 409 });
      }
      const valorTotal = Math.round(b.itens.reduce((s, i) => s + Number(i.valor_total ?? Number(i.quantidade) * Number(i.valor_unitario ?? 0)), 0) * 100) / 100;

      const { data: fzRem } = await db.from("fazendas").select("conta_id").eq("id", b.fazenda_id).maybeSingle();
      const { data: rem, error: eRem } = await db.from("nf_remessas_logisticas").insert({
        fazenda_id: b.fazenda_id, conta_id: fzRem?.conta_id ?? null, nf_entrada_id: b.nf_entrada_id || null,
        nf_remessa_chave: chave, nf_remessa_numero: b.nf.numero.trim(), nf_remessa_protocolo: b.nf.protocolo || null, nf_remessa_data: b.data,
        cfop_remessa: b.cfop.replace(/\D/g, ""), cfop_retorno: b.cfop_retorno.replace(/\D/g, ""),
        destinatario_pessoa_id: b.destinatario.pessoa_id || null, destinatario_nome: b.destinatario.nome, destinatario_uf: b.destinatario.uf || null,
        itens_json: b.itens, valor_total: valorTotal, natureza_remessa: b.natureza, observacao: b.observacao || null, status: "emitida",
        deposito_origem_id: b.deposito_origem_id, deposito_terceiro_id: b.deposito_terceiro_id, emissao: b.emissao, estoque_transferido: false,
      }).select("id").single();
      if (eRem) {
        const faltaSecao = eRem.code === "42703" || eRem.code === "PGRST204";
        return NextResponse.json({ ok: false, error: faltaSecao ? "Rode antes as Seções 377 e 378 do supabase_migrations.sql." : eRem.message }, { status: 400 });
      }

      // Transferência: sai do depósito próprio, entra no depósito do armazém, pelo custo médio (o total não muda)
      const custos = await custoMedio(db, b.itens.map(i => i.insumo_id!));
      const fazOrigem = await fazendaDoDeposito(db, b.deposito_origem_id, b.fazenda_id);
      const fazTerc = await fazendaDoDeposito(db, b.deposito_terceiro_id, b.fazenda_id);
      const motivo = `Remessa NF ${b.nf.numero.trim()} → ${b.destinatario.nome}`.slice(0, 200);
      const movs = b.itens.flatMap(i => [
        { fazenda_id: fazOrigem, insumo_id: i.insumo_id, tipo: "saida", motivo, quantidade: Number(i.quantidade), valor_unitario: custos.get(i.insumo_id!) ?? null, data: b.data, deposito_id: b.deposito_origem_id, observacao: `Remessa para armazém — CFOP ${b.cfop}`, auto: true },
        { fazenda_id: fazTerc, insumo_id: i.insumo_id, tipo: "entrada", motivo, quantidade: Number(i.quantidade), valor_unitario: custos.get(i.insumo_id!) ?? null, data: b.data, deposito_id: b.deposito_terceiro_id, observacao: `Remessa para armazém — CFOP ${b.cfop}`, auto: true },
      ]);
      const { error: eMov } = await db.from("movimentacoes_estoque").insert(movs);
      if (eMov) return NextResponse.json({ ok: false, error: `Remessa gravada, mas o estoque não foi transferido: ${eMov.message}`, remessa_id: rem.id }, { status: 500 });
      await db.from("nf_remessas_logisticas").update({ estoque_transferido: true }).eq("id", rem.id);

      // Monitor de NF-e Emitidas (DANFE, cancelamento): a emitida pelo Arato e a emitida fora, quando tem chave
      if (chave) {
        const { data: noMonitor } = await db.from("notas_fiscais").select("id").eq("chave_acesso", chave).limit(1);
        if (!noMonitor?.length) {
          let xmlUrl = b.nf.xml_url ?? null;
          if (!xmlUrl && b.nf.xml) {
            const path = `${b.fazenda_id}/nfe_emitidas/${chave}.xml`;
            const up = await db.storage.from("arquivos").upload(path, new Blob([b.nf.xml], { type: "application/xml" }), { upsert: true });
            if (!up.error) xmlUrl = db.storage.from("arquivos").getPublicUrl(path).data.publicUrl;
          }
          const c = b.cfop.replace(/\D/g, "");
          const { data: pes } = b.destinatario.pessoa_id ? await db.from("pessoas").select("cpf_cnpj").eq("id", b.destinatario.pessoa_id).maybeSingle() : { data: null };
          await db.from("notas_fiscais").insert({
            fazenda_id: b.fazenda_id, numero: b.nf.numero.trim(), serie: b.nf.serie || "1", tipo: "saida",
            cfop: c.length === 4 ? `${c[0]}.${c.slice(1)}` : c, natureza: b.natureza, destinatario: b.destinatario.nome,
            cnpj_destinatario: String(pes?.cpf_cnpj ?? "").replace(/\D/g, "") || null, valor_total: valorTotal, data_emissao: b.data,
            status: "autorizada", chave_acesso: chave, xml_url: xmlUrl, auto: false, tipo_emissao: 1,
            observacao: b.emissao === "externa" ? "Remessa emitida fora do Arato" : "Remessa para armazém",
            itens_json: b.itens.map(i => ({ item: i.descricao, ncm: i.ncm ?? "", cfop: c, unidade: i.unidade ?? "UN", quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario ?? 0), valor_total: Number(i.valor_total ?? 0) })),
            dados_nf_json: { ...(b.nf.emit ?? {}), protocolo_autorizacao: b.nf.protocolo || undefined, remessa_id: rem.id, origem_externa: b.emissao === "externa" || undefined },
          });
        }
      }
      return NextResponse.json({ ok: true, remessa_id: rem.id });
    }

    if (body.acao === "retorno_estoque") {
      const b = body as unknown as { fazenda_id: string; remessa_id: string; nf_numero: string; data: string; itens: { insumo_id: string; quantidade: number }[] };
      const { data: rem } = await db.from("nf_remessas_logisticas").select("*").eq("id", b.remessa_id).maybeSingle();
      if (!rem) return NextResponse.json({ ok: false, error: "Remessa não encontrada." }, { status: 404 });
      if (!rem.estoque_transferido) return NextResponse.json({ ok: true, ignorado: "remessa antiga, sem estoque no armazém" });
      const erroMov = await moverRetorno(db, rem, b.nf_numero, b.data, b.itens, null);
      if (erroMov) return NextResponse.json({ ok: false, error: erroMov }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "registrar_retorno") {
      const b = body as unknown as {
        fazenda_id: string; remessa_id: string; emissao: "arato" | "externa"; data: string; natureza?: string; volta_para_deposito_id?: string | null;
        nf: { numero: string; serie?: string; chave?: string | null; protocolo?: string | null; xml_url?: string | null; emit?: Record<string, string | undefined> };
        valor?: number; descricao?: string;
      };
      if (!b.nf?.numero?.trim()) return NextResponse.json({ ok: false, error: "Informe o número da NF de retorno." }, { status: 400 });
      const { data: rem } = await db.from("nf_remessas_logisticas").select("*").eq("id", b.remessa_id).maybeSingle();
      if (!rem) return NextResponse.json({ ok: false, error: "Remessa não encontrada." }, { status: 404 });
      // A mesma NF de retorno não entra duas vezes na remessa (achado real 29/10/2026: remessa 1323 com a NF 15723 duas
      // vezes — "já voltou" em dobro)
      {
        const chaveNova = (b.nf.chave ?? "").replace(/\D/g, "");
        const ja = ((rem.retornos as { numero?: string; chave?: string | null }[] | null) ?? [])
          .some(x => (chaveNova && x.chave === chaveNova) || (!chaveNova && !x.chave && String(x.numero ?? "") === b.nf.numero.trim()));
        if (ja) return NextResponse.json({ ok: false, error: `O retorno da NF ${b.nf.numero.trim()} já está registrado nesta remessa.` }, { status: 409 });
      }
      const itensRem = (Array.isArray(rem.itens_json) ? rem.itens_json : []) as Item[];
      const remetido = itensRem.reduce((s, i) => s + Number(i.valor_total ?? 0), 0) || Number(rem.valor_total ?? 0);
      const saldo = Math.max(0, remetido - Number(rem.valor_retornado ?? 0));
      const valor = Math.round(Number(b.valor ?? saldo) * 100) / 100;
      const fator = remetido > 0 ? Math.min(1, valor / remetido) : 1;   // retorno parcial: devolve a proporção dos itens
      const itensVolta = itensRem.filter(i => i.insumo_id).map(i => ({ insumo_id: i.insumo_id!, quantidade: Math.round(Number(i.quantidade) * fator * 10000) / 10000 }));
      const voltaDep = b.volta_para_deposito_id || rem.deposito_origem_id || null;
      if (!voltaDep && itensVolta.length) return NextResponse.json({ ok: false, error: "Escolha o depósito para onde a mercadoria volta." }, { status: 400 });
      const erroMov = await moverRetorno(db, rem, b.nf.numero.trim(), b.data, itensVolta, voltaDep);
      if (erroMov) return NextResponse.json({ ok: false, error: `Estoque do retorno não lançado: ${erroMov}` }, { status: 500 });
      const chave = (b.nf.chave ?? "").replace(/\D/g, "") || null;
      const retornado = Math.round((Number(rem.valor_retornado ?? 0) + valor) * 100) / 100;
      const { error: eUp } = await db.from("nf_remessas_logisticas").update({
        valor_retornado: retornado, status: retornado >= remetido - 0.01 ? "retornada" : rem.status,
        retornos: [...((rem.retornos as unknown[]) ?? []), { numero: b.nf.numero.trim(), chave, data: b.data, valor, emitente: b.emissao === "arato" ? "Arato" : (b.descricao ?? "emitida fora") }],
        nf_retorno_chave: chave, nf_retorno_numero: b.nf.numero.trim(), nf_retorno_protocolo: b.nf.protocolo || null, nf_retorno_data: b.data,
        observacao: [rem.observacao, `Retorno NF ${b.nf.numero.trim()}${b.emissao === "arato" ? " (emitida pelo Arato)" : b.descricao ? ` (${b.descricao})` : ""}`].filter(Boolean).join(" | "),
      }).eq("id", rem.id);
      if (eUp) return NextResponse.json({ ok: false, error: eUp.message }, { status: 500 });
      if (chave && b.emissao === "arato") {
        const { data: noMonitor } = await db.from("notas_fiscais").select("id").eq("chave_acesso", chave).limit(1);
        if (!noMonitor?.length) {
          const c = String(rem.cfop_retorno ?? "").replace(/\D/g, "");
          await db.from("notas_fiscais").insert({
            fazenda_id: b.fazenda_id, numero: b.nf.numero.trim(), serie: b.nf.serie || "1", tipo: "saida", cfop: c.length === 4 ? `${c[0]}.${c.slice(1)}` : c,
            natureza: b.natureza || "Retorno de remessa", destinatario: rem.destinatario_nome, valor_total: valor, data_emissao: b.data, status: "autorizada",
            chave_acesso: chave, xml_url: b.nf.xml_url ?? null, auto: false, tipo_emissao: 1, observacao: `Retorno da remessa NF ${rem.nf_remessa_numero ?? ""}`,
            itens_json: itensRem.map(i => ({ item: i.descricao, ncm: i.ncm ?? "", cfop: c, unidade: i.unidade ?? "UN", quantidade: Math.round(Number(i.quantidade) * fator * 10000) / 10000, valor_unitario: Number(i.valor_unitario ?? 0), valor_total: Math.round(Number(i.valor_total ?? 0) * fator * 100) / 100 })),
            dados_nf_json: { ...(b.nf.emit ?? {}), protocolo_autorizacao: b.nf.protocolo || undefined, remessa_id: rem.id },
          });
        }
      }
      return NextResponse.json({ ok: true, retornada: retornado >= remetido - 0.01 });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
