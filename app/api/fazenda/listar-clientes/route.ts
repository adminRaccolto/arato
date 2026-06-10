import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Retorna clientes agrupados por conta — uma entrada por cliente,
// com todas as fazendas de cada conta listadas internamente.
export async function GET(req: Request) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Valida raccotlo
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const isRaccoltoEmail = (user.email ?? "").toLowerCase().endsWith("@raccolto.com.br");
  if (!isRaccoltoEmail) {
    const { data: perfil } = await sb.from("perfis").select("role").eq("user_id", user.id).single();
    if (perfil?.role !== "raccotlo") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Busca fazendas com raccolto_acesso=true, já com conta e produtor
  const { data: faz, error } = await sb
    .from("fazendas")
    .select("id, nome, municipio, estado, area_total_ha, conta_id, produtor_id")
    .eq("raccolto_acesso", true)
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enriquece com nome do produtor
  const produtorIds = [...new Set((faz ?? []).filter(f => f.produtor_id).map(f => f.produtor_id as string))];
  let produtorMap: Record<string, string> = {};
  if (produtorIds.length > 0) {
    const { data: prods } = await sb.from("produtores").select("id, nome").in("id", produtorIds);
    produtorMap = Object.fromEntries((prods ?? []).map(p => [p.id, p.nome]));
  }

  // Enriquece com nome da conta
  const contaIds = [...new Set((faz ?? []).filter(f => f.conta_id).map(f => f.conta_id as string))];
  let contaMap: Record<string, string> = {};
  if (contaIds.length > 0) {
    const { data: contas } = await sb.from("contas").select("id, nome").in("id", contaIds);
    contaMap = Object.fromEntries((contas ?? []).map(c => [c.id, c.nome]));
  }

  // Agrupa por conta_id — uma entrada por cliente
  const contaIndex: Record<string, {
    conta_id: string;
    conta_nome: string;
    produtor_nome: string | null;
    fazendas: { id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number }[];
    area_total: number;
  }> = {};

  for (const f of (faz ?? [])) {
    const cid = f.conta_id ?? `sem_conta_${f.id}`;
    const prodNome = f.produtor_id ? (produtorMap[f.produtor_id] ?? null) : null;
    const contaNome = f.conta_id ? (contaMap[f.conta_id] ?? f.nome) : f.nome;

    if (!contaIndex[cid]) {
      contaIndex[cid] = {
        conta_id:     cid,
        conta_nome:   contaNome,
        produtor_nome: prodNome,
        fazendas:     [],
        area_total:   0,
      };
    }
    // Usa o primeiro produtor encontrado para representar a conta
    if (!contaIndex[cid].produtor_nome && prodNome) {
      contaIndex[cid].produtor_nome = prodNome;
    }
    contaIndex[cid].fazendas.push({
      id:            f.id,
      nome:          f.nome,
      municipio:     f.municipio,
      estado:        f.estado,
      area_total_ha: f.area_total_ha,
    });
    contaIndex[cid].area_total += f.area_total_ha ?? 0;
  }

  // Ordena por nome do produtor ou conta
  const clientes = Object.values(contaIndex).sort((a, b) => {
    const na = (a.produtor_nome ?? a.conta_nome).toLowerCase();
    const nb = (b.produtor_nome ?? b.conta_nome).toLowerCase();
    return na.localeCompare(nb, "pt-BR");
  });

  return NextResponse.json({ clientes });
}
