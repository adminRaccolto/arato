import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { emitirNFe, buscarConfEmitente } from "../../../../lib/nfe/index";

const adm = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const runtime = "nodejs"; // lib/nfe usa node-forge que precisa de Node

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  let acao = "unknown";
  try {
    const body = await request.json() as {
      acao: "emitir" | "cancelar" | "confirmar_entrada" | "salvar";
      transferencia_id?: string;
      modulo_key?: string;    // opcional — se não enviado, busca o primeiro disponível
      transferencia?: Record<string, unknown>;
      itens?: Array<Record<string, unknown>>;
    };

    acao = body.acao;

    // ── CANCELAR ─────────────────────────────────────────────────────────────
    if (body.acao === "cancelar") {
      const { error } = await adm
        .from("transferencias_estoque")
        .update({ status: "cancelada" })
        .eq("id", body.transferencia_id!);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── EMITIR NF-e ──────────────────────────────────────────────────────────
    if (body.acao === "emitir") {
      const tid = body.transferencia_id!;

      // 1. Busca transferência + itens
      const { data: t, error: tErr } = await adm
        .from("transferencias_estoque")
        .select("*, transferencias_estoque_itens(*)")
        .eq("id", tid)
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      const itensTransf = (t.transferencias_estoque_itens ?? []) as Array<Record<string, unknown>>;

      // 2. Resolve modulo_key fiscal da fazenda de origem
      const fazId = t.fazenda_origem_id as string;
      let moduloKey: string = body.modulo_key ?? "";
      if (!moduloKey) {
        const { data: cfgs } = await adm
          .from("configuracoes_modulo")
          .select("modulo, config")
          .eq("fazenda_id", fazId)
          .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%,modulo.eq.fiscal")
          .limit(1);
        if (cfgs && cfgs.length > 0) moduloKey = cfgs[0].modulo;
      }

      if (!moduloKey) {
        // Sem config fiscal → só atualiza status (sem NF-e real)
        await adm.from("transferencias_estoque")
          .update({ status: "emitida", data_emissao: new Date().toISOString() })
          .eq("id", tid);
        await _criarMovimentacoes(t, itensTransf);
        return NextResponse.json({ ok: true, aviso: "Configuração fiscal não encontrada — NF-e não emitida. Acesse Parâmetros → Fiscal." });
      }

      // 3. Busca dados dos insumos para montar os itens da NF-e
      const insumoIds = itensTransf.map(i => i.insumo_id as string).filter(Boolean);
      const { data: insumos } = insumoIds.length > 0
        ? await adm.from("insumos").select("id,nome,ncm,unidade,custo_medio,valor_unitario").in("id", insumoIds)
        : { data: [] };
      const insumoMap: Record<string, Record<string, unknown>> = {};
      for (const ins of (insumos ?? [])) insumoMap[ins.id] = ins;

      // 4. Busca configuração do emitente para usar como destinatário (mesma entidade)
      const confEmit = await buscarConfEmitente(fazId, moduloKey);
      if (!confEmit) {
        return NextResponse.json({ ok: false, error: `Configuração fiscal '${moduloKey}' não encontrada` }, { status: 422 });
      }

      // 5. Monta input da NF-e
      const cfop = String(t.cfop ?? "5151").replace(/\D/g, "");
      const itenNfe = itensTransf.map((it, idx) => {
        const ins = insumoMap[it.insumo_id as string] ?? {};
        const valorUnit = Number(ins.custo_medio ?? ins.valor_unitario ?? 1);
        return {
          codigo:         String(idx + 1).padStart(4, "0"),
          descricao:      String(ins.nome ?? "Produto"),
          ncm:            String(ins.ncm ?? "1201.90.00").replace(/\D/g, "") || "12019000",
          cfop,
          unidade:        String(ins.unidade ?? "SC"),
          quantidade:     Number(it.quantidade ?? 0),
          valor_unitario: valorUnit,
        };
      });

      const resultado = await emitirNFe(fazId, moduloKey, {
        destinatario: {
          nome:            confEmit.razao_social ?? "—",
          cpf_cnpj:        confEmit.cpf_cnpj_emitente,
          ie:              confEmit.ie_emitente,
          logradouro:      confEmit.logradouro,
          numero:          confEmit.numero,
          bairro:          confEmit.bairro,
          municipio_ibge:  confEmit.municipio_ibge,
          municipio_nome:  confEmit.municipio_nome,
          uf:              confEmit.uf_emitente ?? "MT",
          cep:             confEmit.cep,
        },
        itens: itenNfe,
        natureza: "Transferência de mercadoria de produção própria",
        infCpl:   `Transferência interna nº ${t.numero ?? tid} — CFOP ${cfop}`,
        frete:    "9",
        tipo:     "1",
      });

      if (!resultado.sucesso) {
        return NextResponse.json({
          ok: false,
          error: `SEFAZ ${resultado.cStat}: ${resultado.xMotivo}`,
          cStat: resultado.cStat,
          xMotivo: resultado.xMotivo,
        }, { status: 422 });
      }

      // 6. Atualiza transferência com dados da NF-e autorizada
      await adm.from("transferencias_estoque").update({
        status:       "emitida",
        data_emissao: new Date().toISOString(),
        nf_numero:    resultado.numero,
        nf_chave:     resultado.chave,
      }).eq("id", tid);

      // 7. Movimentações de estoque
      await _criarMovimentacoes(t, itensTransf);

      return NextResponse.json({
        ok: true,
        nf_numero: resultado.numero,
        nf_chave:  resultado.chave,
        protocolo: resultado.protocolo,
        xmlUrl:    resultado.xmlUrl,
      });
    }

    // ── CONFIRMAR ENTRADA ─────────────────────────────────────────────────────
    if (body.acao === "confirmar_entrada") {
      const tid = body.transferencia_id!;
      const { data: t, error: tErr } = await adm
        .from("transferencias_estoque")
        .select("*, transferencias_estoque_itens(*)")
        .eq("id", tid)
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      const itens = (t.transferencias_estoque_itens ?? []) as Array<Record<string, unknown>>;
      for (const it of itens) {
        await adm.from("movimentacoes_estoque").insert({
          fazenda_id:  t.fazenda_destino_id,
          insumo_id:   it.insumo_id,
          tipo:        "entrada",
          motivo:      `Transferência ${t.numero} ← origem`,
          quantidade:  it.quantidade,
          data:        t.data_transferencia,
          deposito_id: t.deposito_destino_id || null,
          auto:        true,
        });
      }
      await adm.from("transferencias_estoque").update({ status: "entrada_confirmada" }).eq("id", tid);
      return NextResponse.json({ ok: true });
    }

    // ── SALVAR (nova transferência pelo desktop) ───────────────────────────────
    if (body.acao === "salvar") {
      const { transferencia, itens } = body;
      if (!transferencia) return NextResponse.json({ ok: false, error: "Dados ausentes" }, { status: 400 });

      const status = transferencia.status as string;

      const { data: transf, error: tErr } = await adm
        .from("transferencias_estoque")
        .insert(transferencia)
        .select()
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      if (itens && itens.length > 0) {
        const itensCom = itens.map(it => ({ ...it, transferencia_id: transf.id }));
        await adm.from("transferencias_estoque_itens").insert(itensCom);
      }

      if (status === "emitida" && itens) {
        for (const it of itens) {
          await adm.from("movimentacoes_estoque").insert({
            fazenda_id:  transferencia.fazenda_origem_id,
            insumo_id:   it.insumo_id,
            tipo:        "saida",
            motivo:      `Transferência ${transf.numero}`,
            quantidade:  Number(it.quantidade),
            data:        transferencia.data_transferencia,
            deposito_id: transferencia.deposito_origem_id || null,
            auto:        true,
          });
          if (transferencia.entrada_automatica) {
            await adm.from("movimentacoes_estoque").insert({
              fazenda_id:  transferencia.fazenda_destino_id,
              insumo_id:   it.insumo_id,
              tipo:        "entrada",
              motivo:      `Transferência ${transf.numero}`,
              quantidade:  Number(it.quantidade),
              data:        transferencia.data_transferencia,
              deposito_id: transferencia.deposito_destino_id || null,
              auto:        true,
            });
          }
        }
      }

      return NextResponse.json({ ok: true, id: transf.id });
    }

    console.log(`[transferencia-acao] ${acao} ok ${Date.now() - t0}ms`);
    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    console.error(`[transferencia-acao] ${acao} erro ${Date.now() - t0}ms`, e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// ── Helper: movimentações de estoque ─────────────────────────────────────────
async function _criarMovimentacoes(
  t: Record<string, unknown>,
  itens: Array<Record<string, unknown>>,
) {
  for (const it of itens) {
    await adm.from("movimentacoes_estoque").insert({
      fazenda_id:  t.fazenda_origem_id,
      insumo_id:   it.insumo_id,
      tipo:        "saida",
      motivo:      `Transferência ${t.numero} → destino`,
      quantidade:  it.quantidade,
      data:        t.data_transferencia,
      deposito_id: t.deposito_origem_id || null,
      observacao:  `NF de Transferência — CFOP ${t.cfop}`,
      auto:        true,
    });
    if (t.entrada_automatica) {
      await adm.from("movimentacoes_estoque").insert({
        fazenda_id:  t.fazenda_destino_id,
        insumo_id:   it.insumo_id,
        tipo:        "entrada",
        motivo:      `Transferência ${t.numero} ← origem`,
        quantidade:  it.quantidade,
        data:        t.data_transferencia,
        deposito_id: t.deposito_destino_id || null,
        observacao:  `NF de Transferência — CFOP ${t.cfop}`,
        auto:        true,
      });
    }
  }
}
