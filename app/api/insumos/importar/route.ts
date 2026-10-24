import { hojeLocal } from "../../../../lib/data-local";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoConta, exigirAcessoFazenda } from "../../../../lib/api-auth";
import { itemDoCliente } from "../../../../lib/estoque/duplicados";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

function norm(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// POST /api/insumos/importar
// Importa insumos com service_role_key — imune a JWT expirado e RLS.
// Body: { conta_id, fazenda_id_ativo, modo_atualizacao, rows: InsumoPayload[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conta_id: string;
      fazenda_id_ativo: string;
      modo_atualizacao: boolean;
      rows: Array<{
        fazenda_nome: string;
        deposito_nome?: string;
        nome: string;
        categoria: string;
        unidade: string;
        estoque?: number;
        estoque_minimo?: number;
        valor_unitario?: number;
        fabricante?: string;
        subgrupo?: string;
        _status: string; // "ok" | "duplicado" | "aviso"
      }>;
    };
    const negado = await exigirAcessoConta(req, body.conta_id) ?? await exigirAcessoFazenda(req, body.fazenda_id_ativo);
    if (negado) return negado;

    const sb = admin();

    // ── Carrega fazendas da conta (service_role) ──────────────────────────────
    const { data: fazendasDB } = await sb
      .from("fazendas")
      .select("id, nome")
      .eq("conta_id", body.conta_id);
    const fazendas: { id: string; nome: string }[] = fazendasDB ?? [];

    // ── Carrega todos os depósitos dessas fazendas (1 query) ─────────────────
    const fazIds = fazendas.map(f => f.id);
    const { data: depositosDB } = fazIds.length
      ? await sb.from("depositos").select("id, nome, fazenda_id").in("fazenda_id", fazIds)
      : { data: [] };
    const depositos: { id: string; nome: string; fazenda_id: string }[] = depositosDB ?? [];

    // Catálogo do CLIENTE: item que já existe em qualquer fazenda dele é reaproveitado (o saldo da planilha entra como
    // estoque inicial na fazenda da linha) — nunca vira outro cadastro.
    const catalogo: { id: string; nome: string; tipo: string | null; ativo: boolean | null; mesclado_em?: string | null }[] = [];
    for (let de = 0; fazIds.length; de += 1000) {
      const { data } = await sb.from("insumos").select("id, nome, tipo, ativo, mesclado_em").in("fazenda_id", fazIds).order("id").range(de, de + 999);
      catalogo.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const lancarSaldo = (insumoId: string, fazendaId: string, depositoId: string | null, qtd: number, valor: number, obs: string) =>
      sb.from("movimentacoes_estoque").insert({
        insumo_id: insumoId, fazenda_id: fazendaId, tipo: qtd >= 0 ? "entrada" : "saida", motivo: "inventario",
        quantidade: Math.abs(qtd), valor_unitario: valor > 0 ? valor : null, data: hojeLocal(), deposito_id: depositoId, observacao: obs, auto: true,
      });

    console.log(`[insumos/importar] conta=${body.conta_id} rows=${body.rows.length}`);
    let ok = 0, erros = 0, duplicados = 0, atualizados = 0;
    const resultRows: Array<{ nome: string; _status: string; _msg: string }> = [];

    for (const r of body.rows) {
      // Pula erros vindos da validação client-side
      if (r._status === "erro") { erros++; resultRows.push({ nome: r.nome, _status: "erro", _msg: "erro de validação" }); continue; }

      // Resolve fazenda pelo nome (case-insensitive, sem acento)
      const fazNormTarget = norm(r.fazenda_nome);
      const fazLinha = fazendas.find(f => norm(f.nome) === fazNormTarget);
      if (!fazLinha) {
        erros++;
        resultRows.push({ nome: r.nome, _status: "erro", _msg: `fazenda "${r.fazenda_nome}" não encontrada na conta` });
        continue;
      }

      // Resolve depósito pelo nome (case-insensitive)
      let depId: string | null = null;
      if (r.deposito_nome?.trim()) {
        const depNorm = norm(r.deposito_nome);
        const dep = depositos.find(d => d.fazenda_id === fazLinha.id && norm(d.nome) === depNorm);
        if (dep) depId = dep.id;
        // Depósito não encontrado = aviso, mas não bloqueia
      }

      const estoqueQtd = r.estoque ?? 0;
      const valorUnit = r.valor_unitario ?? 0;
      const payload = {
        fazenda_id:     fazLinha.id,
        tipo:           "insumo" as const,
        nome:           r.nome.trim(),
        categoria:      r.categoria.trim().toLowerCase(),
        unidade:        r.unidade.trim(),
        // Saldo nunca vai no cadastro (Seção 365: saldo = movimentações) — entra pela movimentação de inventário abaixo.
        estoque:        0,
        estoque_minimo: r.estoque_minimo ?? 0,
        valor_unitario: valorUnit,
        fabricante:     r.fabricante?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
        deposito_id:    depId,
      };

      const existente = itemDoCliente(catalogo, r.nome, "insumo");
      if (existente) {
        // Já existe no cliente. Atualização: dados do cadastro (sem saldo) + saldo da fazenda ajustado ao da planilha.
        // Sem atualização: só lança o saldo da planilha como estoque inicial nesta fazenda.
        if (body.modo_atualizacao) {
          const { estoque: _semSaldo, fazenda_id: _semFazenda, ...dados } = payload; void _semSaldo; void _semFazenda;
          const { error } = await sb.from("insumos").update(dados).eq("id", existente.id);
          if (error) { erros++; resultRows.push({ nome: r.nome, _status: "erro", _msg: error.message }); continue; }
          if (r.estoque != null) {
            const { data: sf } = await sb.from("saldo_insumo_fazenda").select("saldo").eq("insumo_id", existente.id).eq("fazenda_id", fazLinha.id).maybeSingle();
            const delta = estoqueQtd - Number(sf?.saldo ?? 0);
            if (Math.abs(delta) > 0.0001) await lancarSaldo(existente.id, fazLinha.id, depId, delta, valorUnit, "Ajuste de saldo — importação (atualização)");
          }
          atualizados++; resultRows.push({ nome: r.nome, _status: "ok", _msg: "atualizado" });
        } else if (estoqueQtd > 0) {
          await lancarSaldo(existente.id, fazLinha.id, depId, estoqueQtd, valorUnit, "Saldo inicial — importação (item já cadastrado no cliente)");
          ok++; resultRows.push({ nome: r.nome, _status: "ok", _msg: `já existia (${existente.nome}) — saldo lançado em ${fazLinha.nome}` });
        } else {
          duplicados++; resultRows.push({ nome: r.nome, _status: "duplicado", _msg: `já existe (${existente.nome})` });
        }
        continue;
      }
      {
        // INSERT novo
        const { data: ins, error } = await sb.from("insumos").insert(payload).select("id").single();
        if (error) {
          erros++;
          resultRows.push({ nome: r.nome, _status: "erro", _msg: error.message });
          continue;
        }
        ok++;
        resultRows.push({ nome: r.nome, _status: "ok", _msg: "" });

        // Movimentação de entrada (inventário) se há estoque inicial
        if (ins?.id) catalogo.push({ id: ins.id, nome: r.nome.trim(), tipo: "insumo", ativo: true });
        if (estoqueQtd > 0 && ins?.id) await lancarSaldo(ins.id, fazLinha.id, depId, estoqueQtd, valorUnit, "Saldo inicial — importação");
      }
    }

    return NextResponse.json({ ok, erros, duplicados, atualizados, resultRows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
