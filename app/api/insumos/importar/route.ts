import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    console.log(`[insumos/importar] conta=${body.conta_id} rows=${body.rows.length}`);
    let ok = 0, erros = 0, duplicados = 0, atualizados = 0;
    const resultRows: Array<{ nome: string; _status: string; _msg: string }> = [];

    for (const r of body.rows) {
      // Pula erros vindos da validação client-side
      if (r._status === "erro") { erros++; resultRows.push({ nome: r.nome, _status: "erro", _msg: "erro de validação" }); continue; }
      if (r._status === "duplicado" && !body.modo_atualizacao) { duplicados++; resultRows.push({ nome: r.nome, _status: "duplicado", _msg: "já existe" }); continue; }

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
        estoque:        estoqueQtd,
        estoque_minimo: r.estoque_minimo ?? 0,
        valor_unitario: valorUnit,
        fabricante:     r.fabricante?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
        deposito_id:    depId,
      };

      if (r._status === "duplicado" && body.modo_atualizacao) {
        // Modo atualização: UPDATE
        const { error } = await sb.from("insumos")
          .update(payload)
          .eq("fazenda_id", fazLinha.id)
          .eq("tipo", "insumo")
          .eq("nome", r.nome.trim());
        if (error) { erros++; resultRows.push({ nome: r.nome, _status: "erro", _msg: error.message }); }
        else { atualizados++; resultRows.push({ nome: r.nome, _status: "ok", _msg: "atualizado" }); }
      } else {
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
        if (estoqueQtd > 0 && ins?.id) {
          await sb.from("movimentacoes_estoque").insert({
            insumo_id:      ins.id,
            fazenda_id:     fazLinha.id,
            tipo:           "entrada",
            motivo:         "inventario",
            quantidade:     estoqueQtd,
            valor_unitario: valorUnit > 0 ? valorUnit : null,
            data:           new Date().toISOString().split("T")[0],
            deposito_id:    depId,
            observacao:     "Saldo inicial — importação",
            auto:           true,
          });
        }
      }
    }

    return NextResponse.json({ ok, erros, duplicados, atualizados, resultRows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
