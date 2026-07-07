import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

// GET ?talhao_id=xxx  → { matricula_ids, car_ids } vinculados ao talhão
// GET ?fazenda_id=xxx → { matriculas, cars } disponíveis para seleção
export async function GET(req: NextRequest) {
  const sb = svc();
  const talhao_id  = req.nextUrl.searchParams.get("talhao_id");
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id");

  if (talhao_id) {
    const [matsRes, carsRes] = await Promise.all([
      sb.from("talhao_matriculas").select("matricula_id").eq("talhao_id", talhao_id),
      sb.from("talhao_cars").select("car_id").eq("talhao_id", talhao_id),
    ]);
    return NextResponse.json({
      matricula_ids: (matsRes.data ?? []).map((r: { matricula_id: string }) => r.matricula_id),
      car_ids:       (carsRes.data ?? []).map((r: { car_id: string }) => r.car_id),
    });
  }

  if (fazenda_id) {
    const [matsRes, carsRes] = await Promise.all([
      sb.from("matriculas_imoveis").select("id, numero, cartorio, area_ha").eq("fazenda_id", fazenda_id).order("numero"),
      sb.from("fazenda_cars").select("id, numero, status, area_ha").eq("fazenda_id", fazenda_id).order("numero"),
    ]);
    return NextResponse.json({
      matriculas: matsRes.data ?? [],
      cars:       carsRes.data ?? [],
    });
  }

  return NextResponse.json({ error: "talhao_id or fazenda_id required" }, { status: 400 });
}

// POST { talhao_id, matricula_ids, car_ids } → salva vínculos
export async function POST(req: NextRequest) {
  const { talhao_id, matricula_ids = [], car_ids = [] } = await req.json() as {
    talhao_id: string;
    matricula_ids: string[];
    car_ids: string[];
  };
  if (!talhao_id) return NextResponse.json({ error: "talhao_id required" }, { status: 400 });
  const sb = svc();

  await Promise.all([
    // Matrículas
    sb.from("talhao_matriculas").delete().eq("talhao_id", talhao_id),
    // CARs
    sb.from("talhao_cars").delete().eq("talhao_id", talhao_id),
  ]);

  await Promise.all([
    matricula_ids.length > 0
      ? sb.from("talhao_matriculas").insert(matricula_ids.map(mid => ({ talhao_id, matricula_id: mid })))
      : Promise.resolve(),
    car_ids.length > 0
      ? sb.from("talhao_cars").insert(car_ids.map(cid => ({ talhao_id, car_id: cid })))
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
