/**
 * Regras de conciliação bancária (texto do extrato → O.G./centro de custo/pessoa/transferência).
 * GET    → lista as regras do cliente
 * POST   → cria (ou atualiza, se já existir a mesma regra)
 * PATCH  → altera campos de uma regra (?id=)
 * DELETE → remove (?id=)
 * Escrita só por aqui (service_role): o cliente do navegador falha com 42501 em JWT expirado.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSb, resolverTenant, tabelaAusente } from "../../../../lib/conciliacao-tenant";
import { normalizarTexto } from "../../../../lib/conciliacao-match";

type Body = {
  conta_id?: string;
  conta_bancaria_id?: string | null;
  texto?: string;
  tipo?: "debito" | "credito";
  acao?: "lancar" | "transferencia";
  operacao_classificacao?: string | null;
  operacao_descricao?: string | null;
  centro_custo_id?: string | null;
  pessoa_id?: string | null;
  conta_destino_id?: string | null;
  ativa?: boolean;
};

export async function GET(req: NextRequest) {
  const t = await resolverTenant(new URL(req.url).searchParams.get("conta_id"));
  if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: t.status });
  const { data, error } = await adminSb().from("conciliacao_regras").select("*").eq("conta_id", t.contaId).order("created_at", { ascending: false });
  if (tabelaAusente(error)) return NextResponse.json({ ok: true, regras: [], migracao: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, regras: data ?? [], migracao: true });
}

// Confere que conta bancária / CC / pessoa citados pertencem ao cliente
async function validarVinculos(b: Body, fazendaIds: string[]): Promise<string | null> {
  const sb = adminSb();
  for (const id of [b.conta_bancaria_id, b.conta_destino_id].filter(Boolean) as string[]) {
    const { data } = await sb.from("contas_bancarias").select("fazenda_id").eq("id", id).maybeSingle();
    if (!data || !fazendaIds.includes(data.fazenda_id as string)) return "Conta bancária inválida";
  }
  if (b.centro_custo_id) {
    const { data } = await sb.from("centros_custo").select("fazenda_id").eq("id", b.centro_custo_id).maybeSingle();
    if (!data || !fazendaIds.includes(data.fazenda_id as string)) return "Centro de custo inválido";
  }
  if (b.pessoa_id) {
    const { data } = await sb.from("pessoas").select("fazenda_id").eq("id", b.pessoa_id).maybeSingle();
    if (!data || !fazendaIds.includes(data.fazenda_id as string)) return "Pessoa inválida";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const t = await resolverTenant(b.conta_id);
  if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: t.status });

  const texto = (b.texto ?? "").trim();
  const norm = normalizarTexto(texto);
  if (norm.length < 3) return NextResponse.json({ ok: false, error: "O texto da regra precisa ter ao menos 3 letras." }, { status: 400 });
  if (b.tipo !== "debito" && b.tipo !== "credito") return NextResponse.json({ ok: false, error: "Informe se a regra é de débito ou crédito." }, { status: 400 });
  const acao = b.acao === "transferencia" ? "transferencia" : "lancar";
  if (acao === "lancar" && !b.operacao_classificacao) return NextResponse.json({ ok: false, error: "Selecione a Operação Gerencial da regra." }, { status: 400 });
  if (acao === "transferencia" && !b.conta_destino_id) return NextResponse.json({ ok: false, error: "Selecione a conta de destino da transferência." }, { status: 400 });
  const erroVinc = await validarVinculos(b, t.fazendaIds);
  if (erroVinc) return NextResponse.json({ ok: false, error: erroVinc }, { status: 400 });

  const row = {
    conta_id: t.contaId,
    conta_bancaria_id: b.conta_bancaria_id ?? null,
    texto, texto_norm: norm, tipo: b.tipo, acao,
    operacao_classificacao: acao === "lancar" ? b.operacao_classificacao ?? null : null,
    operacao_descricao: acao === "lancar" ? b.operacao_descricao ?? null : null,
    centro_custo_id: b.centro_custo_id ?? null,
    pessoa_id: b.pessoa_id ?? null,
    conta_destino_id: acao === "transferencia" ? b.conta_destino_id ?? null : null,
    ativa: b.ativa ?? true,
  };
  const sb = adminSb();
  // mesma regra (conta + escopo + tipo + texto) → atualiza em vez de duplicar
  let q = sb.from("conciliacao_regras").select("id").eq("conta_id", t.contaId).eq("tipo", b.tipo).eq("texto_norm", norm);
  q = row.conta_bancaria_id ? q.eq("conta_bancaria_id", row.conta_bancaria_id) : q.is("conta_bancaria_id", null);
  const { data: existente, error: eSel } = await q.maybeSingle();
  if (tabelaAusente(eSel)) return NextResponse.json({ ok: false, error: "Execute a migração Seção 277 no Supabase antes de criar regras." }, { status: 409 });
  const res = existente
    ? await sb.from("conciliacao_regras").update(row).eq("id", existente.id).select().single()
    : await sb.from("conciliacao_regras").insert(row).select().single();
  if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, regra: res.data, atualizada: !!existente });
}

async function regraDoTenant(id: string, contaId: string) {
  const { data } = await adminSb().from("conciliacao_regras").select("id").eq("id", id).eq("conta_id", contaId).maybeSingle();
  return !!data;
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const b = (await req.json().catch(() => ({}))) as Body;
  const t = await resolverTenant(b.conta_id);
  if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: t.status });
  if (!id || !(await regraDoTenant(id, t.contaId))) return NextResponse.json({ ok: false, error: "Regra não encontrada" }, { status: 404 });
  const erroVinc = await validarVinculos(b, t.fazendaIds);
  if (erroVinc) return NextResponse.json({ ok: false, error: erroVinc }, { status: 400 });
  const upd: Record<string, unknown> = {};
  if (b.ativa !== undefined) upd.ativa = b.ativa;
  if (b.texto !== undefined) {
    const norm = normalizarTexto(b.texto);
    if (norm.length < 3) return NextResponse.json({ ok: false, error: "O texto da regra precisa ter ao menos 3 letras." }, { status: 400 });
    upd.texto = b.texto.trim(); upd.texto_norm = norm;
  }
  for (const k of ["tipo", "acao", "operacao_classificacao", "operacao_descricao", "centro_custo_id", "pessoa_id", "conta_destino_id", "conta_bancaria_id"] as const) {
    if (b[k] !== undefined) upd[k] = b[k];
  }
  const { data, error } = await adminSb().from("conciliacao_regras").update(upd).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, regra: data });
}

export async function DELETE(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const t = await resolverTenant(sp.get("conta_id"));
  if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: t.status });
  if (!id || !(await regraDoTenant(id, t.contaId))) return NextResponse.json({ ok: false, error: "Regra não encontrada" }, { status: 404 });
  const { error } = await adminSb().from("conciliacao_regras").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
