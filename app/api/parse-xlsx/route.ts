import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Node.js Buffer mode — mais robusto que browser binary/array para arquivos de ERP
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    return NextResponse.json({ rows, sheetName: wb.SheetNames[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
