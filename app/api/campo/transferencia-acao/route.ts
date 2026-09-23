import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { emitirNFe, buscarConfEmitente, cancelarNFeEmitida } from "../../../../lib/nfe/index";
import { resolverModuloKeyPorCpfCnpj, resolverModuloKeyFiscal } from "../../../../lib/nfe/resolver-emitente";

export const runtime = "nodejs"; // lib/nfe usa node-forge que precisa de Node
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const t0 = Date.now();
  let acao = "unknown";
  try {
    const body = await request.json() as {
      acao: "emitir" | "cancelar" | "confirmar_entrada" | "salvar" | "atualizar";
      transferencia_id?: string;
      modulo_key?: string;    // opcional — se não enviado, busca o primeiro disponível
      transferencia?: Record<string, unknown>;
      itens?: Array<Record<string, unknown>>;
    };

    acao = body.acao;

    // ── CANCELAR ─────────────────────────────────────────────────────────────
    if (body.acao === "cancelar") {
      const tidCancel = body.transferencia_id!;
      const justificativa = (body.transferencia?.justificativa as string | undefined) ?? "";

      const { data: t, error: tErr } = await adm
        .from("transferencias_estoque")
        .select("*")
        .eq("id", tidCancel)
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      if (t.status === "cancelada") {
        return NextResponse.json({ ok: false, error: "Esta transferência já está cancelada." }, { status: 400 });
      }

      // Se a NF já foi de fato AUTORIZADA pela SEFAZ (tem chave real), o
      // cancelamento aqui dentro precisa ser acompanhado do evento oficial —
      // senão a nota continua valendo do lado de fora mesmo cancelada aqui.
      if (t.nf_chave) {
        if (!justificativa || justificativa.trim().length < 15) {
          return NextResponse.json({
            ok: false,
            error: "Informe uma justificativa com pelo menos 15 caracteres — exigência da SEFAZ para cancelar uma NF-e já autorizada.",
          }, { status: 422 });
        }
        const refEmissao = t.data_emissao ? new Date(t.data_emissao as string).getTime() : NaN;
        const horasDesdeEmissao = isNaN(refEmissao) ? Infinity : (Date.now() - refEmissao) / 3_600_000;
        if (horasDesdeEmissao > 24) {
          return NextResponse.json({
            ok: false,
            error: "Esta NF-e foi autorizada há mais de 24h e não pode mais ser cancelada pela SEFAZ. Emita uma NF de devolução/estorno para reverter a operação, ou uma Carta de Correção para erros de dados cadastrais.",
          }, { status: 422 });
        }
        if (!t.nf_protocolo) {
          return NextResponse.json({
            ok: false,
            error: "Protocolo de autorização não encontrado nesta transferência — não é possível montar o evento de cancelamento.",
          }, { status: 422 });
        }

        const fazIdCancel = t.fazenda_origem_id as string;
        let moduloKeyCancel = (t.nf_modulo_key as string | null) ?? "";
        if (!moduloKeyCancel && t.cpf_cnpj_origem) {
          moduloKeyCancel = (await resolverModuloKeyPorCpfCnpj(fazIdCancel, t.cpf_cnpj_origem as string, adm)) ?? "";
        }
        if (!moduloKeyCancel) moduloKeyCancel = await resolverModuloKeyFiscal(fazIdCancel, adm);
        if (!moduloKeyCancel) {
          return NextResponse.json({ ok: false, error: "Configuração fiscal do emitente não encontrada para cancelar esta NF-e." }, { status: 422 });
        }

        const resultadoEvento = await cancelarNFeEmitida(
          fazIdCancel,
          moduloKeyCancel,
          t.nf_chave as string,
          t.nf_protocolo as string,
          justificativa.trim(),
        );
        if (!resultadoEvento.sucesso) {
          return NextResponse.json({
            ok: false,
            error: `SEFAZ recusou o cancelamento (${resultadoEvento.cStat}): ${resultadoEvento.xMotivo}`,
            cStat: resultadoEvento.cStat,
          }, { status: 422 });
        }
      }

      // Reverte as movimentações de estoque geradas por esta transferência —
      // antes disso, cancelar só mudava o status e nunca desfazia a saída na
      // origem (nem a entrada no destino, quando entrada_automatica), deixando
      // um saldo "fantasma" reduzido no depósito de origem.
      await _reverterMovimentacoes(t, adm);

      const observacaoFinal = [
        t.observacao as string | null,
        justificativa.trim() ? `Cancelada — ${justificativa.trim()}` : "Cancelada",
      ].filter(Boolean).join(" | ");

      const { error } = await adm
        .from("transferencias_estoque")
        .update({ status: "cancelada", observacao: observacaoFinal })
        .eq("id", tidCancel);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      // Espelha o cancelamento em notas_fiscais — mesma lógica do 6b na
      // emissão: sem isso, o Monitor de NF-e Emitidas continuaria mostrando
      // "autorizada" numa nota que já foi cancelada de verdade na SEFAZ.
      if (t.nf_chave) {
        await adm.from("notas_fiscais").update({ status: "cancelada" }).eq("chave_acesso", t.nf_chave);
      }

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

      // Retry: se já passou por aqui antes (status emitida/entrada_confirmada —
      // inclusive pelo caminho "sem config fiscal" abaixo, que também marca
      // "emitida"), as movimentações de estoque já foram lançadas. Sem essa
      // guarda, tentar emitir de novo (ex: depois de configurar o fiscal que
      // faltava) duplicava a saída/entrada no estoque.
      const jaProcessado = t.status === "emitida" || t.status === "entrada_confirmada";

      // 2. Resolve modulo_key fiscal da fazenda de origem — o CNPJ/CPF Emitente
      // informado manualmente na transferência (cpf_cnpj_origem) tem prioridade
      // sobre o titular padrão da fazenda: a fazenda é só o local do estoque,
      // não necessariamente o responsável fiscal desta operação específica.
      const fazId = t.fazenda_origem_id as string;
      let moduloKey: string = body.modulo_key ?? "";
      if (!moduloKey && t.cpf_cnpj_origem) {
        moduloKey = (await resolverModuloKeyPorCpfCnpj(fazId, t.cpf_cnpj_origem as string, adm)) ?? "";
      }
      if (!moduloKey) moduloKey = await resolverModuloKeyFiscal(fazId, adm);

      if (!moduloKey) {
        // Sem config fiscal → só atualiza status (sem NF-e real)
        await adm.from("transferencias_estoque")
          .update({ status: "emitida", data_emissao: new Date().toISOString() })
          .eq("id", tid);
        if (!jaProcessado) await _criarMovimentacoes(t, itensTransf, adm);
        return NextResponse.json({ ok: true, aviso: "Configuração fiscal não encontrada — NF-e não emitida. Acesse Parâmetros → Fiscal e tente novamente." });
      }

      // 3. Busca dados dos insumos para montar os itens da NF-e
      const insumoIds = itensTransf.map(i => i.insumo_id as string).filter(Boolean);
      const { data: insumos } = insumoIds.length > 0
        ? await adm.from("insumos").select("id,nome,ncm,unidade,custo_medio,valor_unitario").in("id", insumoIds)
        : { data: [] };
      const insumoMap: Record<string, Record<string, unknown>> = {};
      for (const ins of (insumos ?? [])) insumoMap[ins.id] = ins;

      // 4. Configuração fiscal do emitente (origem)
      const confEmit = await buscarConfEmitente(fazId, moduloKey);
      if (!confEmit) {
        return NextResponse.json({ ok: false, error: `Configuração fiscal '${moduloKey}' não encontrada` }, { status: 422 });
      }

      // 4b. Configuração fiscal do DESTINATÁRIO — a fazenda de destino pode ter
      // titular (CPF/CNPJ) diferente da origem, então busca a config própria dela
      // em vez de reaproveitar a do emitente. moduloKey pode ser diferente
      // (ex: origem é fiscal_pf_X, destino é fiscal_emp_Y).
      const fazDestId = t.fazenda_destino_id as string;
      const moduloKeyDest = await resolverModuloKeyFiscal(fazDestId, adm);
      const confDest = moduloKeyDest ? await buscarConfEmitente(fazDestId, moduloKeyDest) : null;
      const { data: fazDestRow } = await adm.from("fazendas").select("nome").eq("id", fazDestId).single();
      if (!confDest && !(t.cpf_cnpj_destino || t.ie_destino)) {
        return NextResponse.json({
          ok: false,
          error: "Configuração fiscal da fazenda de destino não encontrada, e a transferência não tem CNPJ/CPF ou IE do destinatário informados manualmente. Configure Parâmetros → Fiscal na fazenda de destino, ou informe o CNPJ/CPF e IE do destinatário na transferência.",
        }, { status: 422 });
      }
      // CNPJ/CPF e IE gravados na transferência (editáveis, podem ser diferentes do
      // titular cadastrado — ex: IE própria do imóvel/depósito) sempre têm prioridade
      // sobre a config fiscal padrão da fazenda de destino.
      const cpfCnpjDestFinal = (t.cpf_cnpj_destino as string | null) || confDest?.cpf_cnpj_emitente;
      const ieDestFinal      = (t.ie_destino as string | null)       || confDest?.ie_emitente;

      // Endereço da IE EXATA escolhida pro destino — não do "confDest" genérico, que resolve
      // pela IE PADRÃO da fazenda de destino (heurística própria em buscarConfEmitente) e pode
      // ser uma IE diferente da que foi escolhida/gravada nesta transferência específica. Mesma
      // classe de bug já corrigida pro CT-e/NF-e manual (produtor com mais de uma IE, cada uma
      // com endereço próprio) — achado real 23/09/2026, num DANFE de transferência.
      let enderecoIeDest: { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; municipio?: string; municipio_ibge?: string } | null = null;
      if (ieDestFinal && cpfCnpjDestFinal) {
        const digitsDest = cpfCnpjDestFinal.replace(/\D/g, "");
        const { data: prodDestRows } = await adm.from("produtores").select("id")
          .or(`cpf_cnpj.eq.${digitsDest},cpf_cnpj.eq.${cpfCnpjDestFinal}`);
        const prodDestIds = (prodDestRows ?? []).map((p: { id: string }) => p.id);
        if (prodDestIds.length > 0) {
          const ieDestDigits = ieDestFinal.replace(/\D/g, "");
          const { data: iesDestRows } = await adm.from("produtor_inscricoes_estaduais")
            .select("cep, logradouro, numero, complemento, bairro, municipio, municipio_ibge, inscricao_estadual")
            .in("produtor_id", prodDestIds).eq("ativa", true);
          enderecoIeDest = (iesDestRows ?? []).find((i: { inscricao_estadual: string }) => i.inscricao_estadual.replace(/\D/g, "") === ieDestDigits) ?? null;
        }
      }

      const destinatarioDados = {
        nome:           confDest?.razao_social ?? fazDestRow?.nome ?? "—",
        cpf_cnpj:       cpfCnpjDestFinal,
        ie:             ieDestFinal,
        logradouro:     enderecoIeDest?.logradouro     ?? confDest?.logradouro,
        numero:         enderecoIeDest?.numero         ?? confDest?.numero,
        bairro:         enderecoIeDest?.bairro         ?? confDest?.bairro,
        municipio_ibge: enderecoIeDest?.municipio_ibge ?? confDest?.municipio_ibge,
        municipio_nome: enderecoIeDest?.municipio      ?? confDest?.municipio_nome,
        uf:             confDest?.uf_emitente ?? "MT",
        cep:            enderecoIeDest?.cep            ?? confDest?.cep,
      };

      // 5. Monta input da NF-e
      const cfop = String(t.cfop ?? "5151").replace(/\D/g, "");
      // CFOP terminado em 151 = produção do próprio estabelecimento; terminado
      // em 152 = mercadoria adquirida/recebida de terceiros — a natureza da
      // operação e o texto legal do diferimento precisam bater com o CFOP
      // escolhido (antes disso, o texto vinha sempre fixo como "produção
      // própria" mesmo quando o CFOP selecionado era 5152/6152 — o mesmo tipo
      // de inconsistência achada numa NF real emitida fora deste módulo).
      const ehProducaoPropria = cfop.endsWith("151");
      const naturezaTransf = ehProducaoPropria
        ? "Transferência de mercadoria de produção própria"
        : "Transferência de mercadoria adquirida de terceiros";
      // Correção 23/09/2026, achado real do dono (especialista fiscal): CST 51/ICMS diferido é
      // tratamento de VENDA interna em MT (Decreto 4.540/2004) — transferência não é venda, não
      // tem base de cálculo nem imposto a diferir. Transferência é CST 41 (não tributado); ver
      // icmsRule() em lib/nfe/builder.ts, corrigido junto.
      const textoLegalDiferido = "ICMS não tributado (CST 41) — transferência entre estabelecimentos do mesmo titular, operação não configura venda, sem base de cálculo nem imposto a diferir. Não incide PIS/COFINS nem Funrural.";
      // NCM ausente no cadastro do insumo NÃO pode virar "1201.90.00" (soja) — achado real
      // 23/09/2026: uma transferência de "SAPEK MAX" (defensivo) saiu com NCM de soja na NF-e de
      // verdade, transmitida e autorizada pela SEFAZ. Auditoria no banco mostrou 1.929 de 1.959
      // insumos (98%) sem NCM cadastrado — ou seja, praticamente TODA transferência de insumo sem
      // ser grão vinha saindo com essa classificação fiscal errada, silenciosamente, em documento
      // fiscal real. Bloqueia a emissão em vez de adivinhar: listar o item errado é reversível,
      // uma NF-e transmitida com NCM errado não é.
      const semNcm = itensTransf
        .map(it => insumoMap[it.insumo_id as string])
        .filter(ins => !(ins?.ncm as string | undefined)?.replace(/\D/g, ""))
        .map(ins => String(ins?.nome ?? "item sem nome"));
      if (semNcm.length > 0) {
        return NextResponse.json({
          ok: false,
          error: `NCM não cadastrado para: ${[...new Set(semNcm)].join(", ")}. Preencha o NCM em Cadastros → Insumos antes de emitir — a NF-e não pode sair com classificação fiscal genérica ou incorreta.`,
        }, { status: 422 });
      }

      const itenNfe = itensTransf.map((it, idx) => {
        const ins = insumoMap[it.insumo_id as string] ?? {};
        // Prioriza o Custo Unit. digitado pelo usuário NA TRANSFERÊNCIA (it.custo_unitario) —
        // antes o valor da NF sempre vinha do cadastro do insumo (custo_medio/valor_unitario),
        // ignorando por completo o que foi preenchido no item. Sem isso, um insumo sem custo_medio
        // cadastrado (comum em defensivos não rastreados por custo) saía com valor_unitario 0 na
        // NF real, mesmo o usuário tendo digitado um valor — achado real 23/09/2026. `?? 1` sozinho
        // não pegava esse caso porque valor_unitario=0 é um valor real (não null/undefined), então
        // o fallback nunca disparava.
        const custoItem = Number(it.custo_unitario ?? 0);
        const valorUnit = custoItem > 0 ? custoItem : Number(ins.custo_medio || ins.valor_unitario || 1);
        return {
          codigo:         String(idx + 1).padStart(4, "0"),
          descricao:      String(ins.nome ?? "Produto"),
          ncm:            String(ins.ncm ?? "").replace(/\D/g, ""),
          cfop,
          unidade:        String(ins.unidade ?? "SC"),
          quantidade:     Number(it.quantidade ?? 0),
          valor_unitario: valorUnit,
        };
      });

      // 5b. Transportadora e veículo informados na transferência — antes o
      // XML só gravava <modFrete>, nunca <transporta>/<veicTransp>, então a
      // transportadora/placa preenchidas na tela nunca apareciam na NF/DANFE.
      let transportadoraNfe: import("../../../../lib/nfe/builder").TransportadoraCfg | undefined;
      if (t.transportadora_id) {
        const { data: transp } = await adm
          .from("transportadoras")
          .select("cnpj, cpf, razao_social, nome_fantasia, ie, rntrc, logradouro, municipio, uf")
          .eq("id", t.transportadora_id)
          .maybeSingle();
        if (transp) {
          transportadoraNfe = {
            cnpj_cpf:   transp.cnpj || transp.cpf || undefined,
            nome:       transp.razao_social || transp.nome_fantasia || undefined,
            ie:         transp.ie || undefined,
            logradouro: transp.logradouro || undefined,
            municipio:  transp.municipio || undefined,
            uf:         transp.uf || undefined,
            rntrc:      transp.rntrc || undefined,
          };
        }
      }
      if (t.veiculo_id) {
        const { data: veic } = await adm
          .from("veiculos")
          .select("placa, uf_placa, rntrc")
          .eq("id", t.veiculo_id)
          .maybeSingle();
        if (veic) {
          transportadoraNfe = {
            ...transportadoraNfe,
            placa:    veic.placa || (t.veiculo_placa as string | undefined) || undefined,
            uf_placa: veic.uf_placa || (t.veiculo_uf_placa as string | undefined) || undefined,
            rntrc:    transportadoraNfe?.rntrc || veic.rntrc || undefined,
          };
        }
      } else if (t.veiculo_placa) {
        // Placa digitada livre, sem cadastro em Veículos — mesmo padrão já
        // usado pro motorista (CT-e/MDF-e/Expedição/Transferência de Máquinas).
        transportadoraNfe = {
          ...transportadoraNfe,
          placa:    t.veiculo_placa as string,
          uf_placa: (t.veiculo_uf_placa as string | undefined) || undefined,
        };
      }

      const resultado = await emitirNFe(fazId, moduloKey, {
        destinatario: destinatarioDados,
        itens: itenNfe,
        natureza: naturezaTransf,
        infCpl:   `${textoLegalDiferido} | Transferência interna nº ${t.numero ?? tid} — CFOP ${cfop}`,
        frete:    (t.frete_conta as "0"|"1"|"2"|"9" | null) ?? "9",
        tipo:     "1",
        transportadora: transportadoraNfe,
      }, (t.ie_origem as string | null) || undefined);

      if (!resultado.sucesso) {
        return NextResponse.json({
          ok: false,
          error: `SEFAZ ${resultado.cStat}: ${resultado.xMotivo}`,
          cStat: resultado.cStat,
          xMotivo: resultado.xMotivo,
        }, { status: 422 });
      }

      // 6. Atualiza transferência com dados da NF-e autorizada
      // nf_protocolo e nf_modulo_key ficam gravados pra permitir o cancelamento
      // oficial depois — o evento de cancelamento exige o protocolo original, e
      // precisa reusar a MESMA config/certificado usados aqui na emissão.
      await adm.from("transferencias_estoque").update({
        status:        "emitida",
        data_emissao:  new Date().toISOString(),
        nf_numero:     resultado.numero,
        nf_chave:      resultado.chave,
        nf_protocolo:  resultado.protocolo,
        nf_modulo_key: moduloKey,
      }).eq("id", tid);

      // 6b. Espelha em notas_fiscais — sem isso a NF de transferência nunca
      // aparecia em Fiscal → Monitor de NF-e Emitidas, que só lê dessa tabela
      // (transferencias_estoque é uma tabela totalmente separada).
      const valorTotalItens = itenNfe.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
      const cfopFmt = cfop.length === 4 ? `${cfop.slice(0, 1)}.${cfop.slice(1)}` : cfop;
      await adm.from("notas_fiscais").insert({
        fazenda_id:        fazId,
        numero:            resultado.numero,
        serie:             confEmit?.serie_nfe ?? "1",
        tipo:              "saida",
        cfop:              cfopFmt,
        natureza:          "Transferência de mercadoria de produção própria",
        destinatario:      destinatarioDados.nome,
        cnpj_destinatario: (destinatarioDados.cpf_cnpj ?? "").replace(/\D/g, "") || undefined,
        valor_total:       valorTotalItens,
        data_emissao:      new Date().toISOString().slice(0, 10),
        status:            "autorizada",
        chave_acesso:      resultado.chave,
        xml_url:           resultado.xmlUrl,
        auto:              true,
        tipo_emissao:      1,
        observacao:        `Transferência interna nº ${t.numero ?? tid} — CFOP ${cfop}`,
        itens_json: itenNfe.map(it => ({
          item: it.descricao, ncm: it.ncm, cfop: it.cfop, unidade: it.unidade,
          quantidade: it.quantidade, valor_unitario: it.valor_unitario,
          valor_total: it.quantidade * it.valor_unitario,
        })),
        dados_nf_json: {
          protocolo_autorizacao: resultado.protocolo,
          emit_razao:     resultado.emit_razao,
          emit_cnpj:      resultado.emit_cnpj,
          emit_ie:        resultado.emit_ie,
          emit_endereco:  resultado.emit_endereco,
          emit_numero:    resultado.emit_numero,
          emit_bairro:    resultado.emit_bairro,
          emit_municipio: resultado.emit_municipio,
          emit_uf:        resultado.emit_uf,
          emit_cep:       resultado.emit_cep,
          emit_fone:      resultado.emit_fone,
        },
      });

      // 7. Movimentações de estoque
      if (!jaProcessado) await _criarMovimentacoes(t, itensTransf, adm);

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
          fazenda_id:      t.fazenda_destino_id,
          insumo_id:       it.insumo_id,
          tipo:            "entrada",
          motivo:          `Transferência ${t.numero} ← origem`,
          quantidade:      it.quantidade,
          valor_unitario:  it.custo_unitario ?? null,
          data:            t.data_transferencia,
          deposito_id:     t.deposito_destino_id || null,
          lote_semente:    it.lote_semente ?? null,
          auto:            true,
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
            fazenda_id:      transferencia.fazenda_origem_id,
            insumo_id:       it.insumo_id,
            tipo:            "saida",
            motivo:          `Transferência ${transf.numero}`,
            quantidade:      Number(it.quantidade),
            valor_unitario:  it.custo_unitario ?? null,
            data:            transferencia.data_transferencia,
            deposito_id:     transferencia.deposito_origem_id || null,
            lote_semente:    it.lote_semente ?? null,
            auto:            true,
          });
          if (transferencia.entrada_automatica) {
            const insumoDestinoId = await _resolverInsumoDestino(
              it.insumo_id as string,
              transferencia.fazenda_destino_id as string,
              adm,
            );
            await adm.from("movimentacoes_estoque").insert({
              fazenda_id:      transferencia.fazenda_destino_id,
              insumo_id:       insumoDestinoId,
              tipo:            "entrada",
              motivo:          `Transferência ${transf.numero}`,
              quantidade:      Number(it.quantidade),
              valor_unitario:  it.custo_unitario ?? null,
              data:            transferencia.data_transferencia,
              deposito_id:     transferencia.deposito_destino_id || null,
              lote_semente:    it.lote_semente ?? null,
              auto:            true,
            });
          }
        }
      }

      return NextResponse.json({ ok: true, id: transf.id });
    }

    if (body.acao === "atualizar") {
      const { transferencia_id: tid, transferencia, itens } = body;
      if (!tid || !transferencia) return NextResponse.json({ ok: false, error: "Dados ausentes" }, { status: 400 });

      const { error: updErr } = await adm
        .from("transferencias_estoque")
        .update({
          fazenda_origem_id:   transferencia.fazenda_origem_id,
          deposito_origem_id:  transferencia.deposito_origem_id ?? null,
          fazenda_destino_id:  transferencia.fazenda_destino_id,
          deposito_destino_id: transferencia.deposito_destino_id ?? null,
          cfop:                transferencia.cfop,
          ie_diferentes:       transferencia.ie_diferentes,
          cpf_cnpj_destino:    transferencia.cpf_cnpj_destino ?? null,
          ie_destino:          transferencia.ie_destino ?? null,
          entrada_automatica:  transferencia.entrada_automatica,
          data_transferencia:  transferencia.data_transferencia,
          observacao:          transferencia.observacao ?? null,
          transportadora_id:   transferencia.transportadora_id ?? null,
          veiculo_id:          transferencia.veiculo_id ?? null,
          veiculo_placa:       transferencia.veiculo_placa ?? null,
          veiculo_uf_placa:    transferencia.veiculo_uf_placa ?? null,
          motorista_id:        transferencia.motorista_id ?? null,
          motorista_nome:      transferencia.motorista_nome ?? null,
          motorista_cpf:       transferencia.motorista_cpf ?? null,
          frete_conta:         transferencia.frete_conta ?? "9",
        })
        .eq("id", tid)
        .eq("status", "rascunho"); // só edita rascunho
      if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

      // Substitui itens
      await adm.from("transferencias_estoque_itens").delete().eq("transferencia_id", tid);
      if (itens && itens.length > 0) {
        const itensCom = itens.map(it => ({ ...it, transferencia_id: tid }));
        await adm.from("transferencias_estoque_itens").insert(itensCom);
      }

      return NextResponse.json({ ok: true, id: tid });
    }

    console.log(`[transferencia-acao] ${acao} ok ${Date.now() - t0}ms`);
    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    console.error(`[transferencia-acao] ${acao} erro ${Date.now() - t0}ms`, e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// ── Helper: resolve o insumo correto pra lançar a entrada no DESTINO ────────
// O cadastro de insumo é por conta (o mesmo produto vale pra qualquer fazenda
// do cliente — lib/db.ts listarInsumos já busca o catálogo inteiro da conta,
// não só da fazenda ativa); só o ESTOQUE (via movimentacoes_estoque.fazenda_id)
// é por fazenda. Então quando origem e destino são fazendas do MESMO cliente
// (o caso normal), a entrada usa o mesmo insumo_id da saída — ele já aparece
// no Estoque/Kardex do destino porque a listagem é conta-wide, e criar um
// cadastro novo só duplicaria o catálogo (o problema que já existia antes
// desta correção: "SEM SOJA CG 7681" / "SEMENTE SOJA CG 7681" / "SEM: SOJA
// 7681" como 3 registros separados pro mesmo produto). Só clona o cadastro no
// caso raríssimo de transferência pra uma fazenda de OUTRA conta (comodato
// pra terceiro que também é cliente Arato, por exemplo).
const _insumoDestinoCache = new Map<string, string>();
async function _resolverInsumoDestino(
  insumoOrigemId: string,
  fazendaDestinoId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adm: any,
): Promise<string> {
  const cacheKey = `${insumoOrigemId}::${fazendaDestinoId}`;
  const cacheado = _insumoDestinoCache.get(cacheKey);
  if (cacheado) return cacheado;

  const { data: origem } = await adm
    .from("insumos")
    .select("*")
    .eq("id", insumoOrigemId)
    .single();
  if (!origem) return insumoOrigemId; // não deveria acontecer — fallback

  if (origem.fazenda_id === fazendaDestinoId) {
    _insumoDestinoCache.set(cacheKey, insumoOrigemId);
    return insumoOrigemId;
  }

  const [{ data: fazOrigem }, { data: fazDestino }] = await Promise.all([
    adm.from("fazendas").select("conta_id").eq("id", origem.fazenda_id).maybeSingle(),
    adm.from("fazendas").select("conta_id").eq("id", fazendaDestinoId).maybeSingle(),
  ]);

  if (fazOrigem?.conta_id && fazOrigem.conta_id === fazDestino?.conta_id) {
    // Mesma conta — catálogo já é compartilhado, reaproveita o cadastro.
    _insumoDestinoCache.set(cacheKey, insumoOrigemId);
    return insumoOrigemId;
  }

  // Contas diferentes — já existe um insumo com o mesmo nome cadastrado
  // numa fazenda da conta destino?
  const { data: fzsContaDestino } = await adm.from("fazendas").select("id").eq("conta_id", fazDestino?.conta_id ?? "");
  const idsContaDestino = (fzsContaDestino ?? []).map((f: { id: string }) => f.id);
  if (idsContaDestino.length > 0) {
    const { data: existente } = await adm
      .from("insumos")
      .select("id")
      .in("fazenda_id", idsContaDestino)
      .ilike("nome", origem.nome)
      .maybeSingle();
    if (existente) {
      _insumoDestinoCache.set(cacheKey, existente.id);
      return existente.id;
    }
  }

  // Não existe — clona o cadastro (mesmo nome/categoria/unidade/NCM/etc.)
  // para a fazenda destino, com estoque zerado (quem move o saldo dali em
  // diante são as movimentacoes_estoque, não o campo fixo).
  const { id: _id, estoque: _estoque, deposito_id: _dep, created_at: _ca, ...resto } = origem;
  const { data: novo, error } = await adm
    .from("insumos")
    .insert({ ...resto, fazenda_id: fazendaDestinoId, estoque: 0, deposito_id: null })
    .select("id")
    .single();
  if (error || !novo) return insumoOrigemId; // fallback extremo — nunca deve cair aqui

  _insumoDestinoCache.set(cacheKey, novo.id);
  return novo.id;
}

// ── Helper: movimentações de estoque ─────────────────────────────────────────
async function _criarMovimentacoes(
  t: Record<string, unknown>,
  itens: Array<Record<string, unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adm: any,
) {
  for (const it of itens) {
    await adm.from("movimentacoes_estoque").insert({
      fazenda_id:      t.fazenda_origem_id,
      insumo_id:       it.insumo_id,
      tipo:            "saida",
      motivo:          `Transferência ${t.numero} → destino`,
      quantidade:      it.quantidade,
      valor_unitario:  it.custo_unitario ?? null,
      data:            t.data_transferencia,
      deposito_id:     t.deposito_origem_id || null,
      observacao:      `NF de Transferência — CFOP ${t.cfop}`,
      lote_semente:    it.lote_semente ?? null,
      auto:            true,
    });
    if (t.entrada_automatica) {
      const insumoDestinoId = await _resolverInsumoDestino(
        it.insumo_id as string,
        t.fazenda_destino_id as string,
        adm,
      );
      await adm.from("movimentacoes_estoque").insert({
        fazenda_id:      t.fazenda_destino_id,
        insumo_id:       insumoDestinoId,
        tipo:            "entrada",
        motivo:          `Transferência ${t.numero} ← origem`,
        quantidade:      it.quantidade,
        valor_unitario:  it.custo_unitario ?? null,
        data:            t.data_transferencia,
        deposito_id:     t.deposito_destino_id || null,
        observacao:      `NF de Transferência — CFOP ${t.cfop}`,
        lote_semente:    it.lote_semente ?? null,
        auto:            true,
      });
    }
  }
}

// ── Helper: reverte as movimentações de estoque de uma transferência ────────
// Busca todas as movimentações "auto" cujo motivo começa com "Transferência
// {numero}" (padrão usado por _criarMovimentacoes, pela ação "salvar" e por
// "confirmar_entrada") e lança o inverso de cada uma — saída volta a entrar,
// entrada volta a saír — em vez de tentar deduzir de novo qual fluxo gerou
// qual movimentação (entrada_automatica, confirmação manual, etc.). Reverte
// exatamente o que foi lançado de verdade, então funciona pra qualquer
// combinação de status em que a transferência estava antes de cancelar.
async function _reverterMovimentacoes(
  t: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adm: any,
) {
  const numero = t.numero as string | null;
  if (!numero) return;
  const { data: movs } = await adm
    .from("movimentacoes_estoque")
    .select("*")
    .ilike("motivo", `Transferência ${numero}%`)
    .eq("auto", true);
  for (const m of (movs ?? []) as Array<Record<string, unknown>>) {
    await adm.from("movimentacoes_estoque").insert({
      fazenda_id:      m.fazenda_id,
      insumo_id:       m.insumo_id,
      tipo:            m.tipo === "saida" ? "entrada" : "saida",
      motivo:          `Cancelamento — Transferência ${numero}`,
      quantidade:      m.quantidade,
      valor_unitario:  m.valor_unitario ?? null,
      data:            new Date().toISOString().slice(0, 10),
      deposito_id:     m.deposito_id ?? null,
      observacao:      `Reversão de estoque — transferência cancelada`,
      lote_semente:    m.lote_semente ?? null,
      auto:            true,
    });
  }
}
