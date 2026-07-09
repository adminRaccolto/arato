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

    // Detecta formato real pelos magic bytes
    const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];
    const isZip  = b0 === 0x50 && b1 === 0x4B; // PK — XLSX/ZIP real
    const isOle  = b0 === 0xD0 && b1 === 0xCF; // OLE2 — .xls antigo
    const hasBom = b0 === 0xEF && b1 === 0xBB && b2 === 0xBF; // UTF-8 BOM
    const isXml  = b0 === 0x3C || (hasBom && b3 === 0x3C);   // < = XML/HTML

    const erros: string[] = [];
    let wb: XLSX.WorkBook | null = null;

    if (isXml) {
      // SpreadsheetML (XML) ou HTML disfarçado de .xlsx — comum em ERPs brasileiros
      const text = buffer.toString("utf8");
      try { wb = XLSX.read(text, { type: "string", cellDates: true }); }
      catch (e) { erros.push(`XML/string: ${e}`); }
    }

    if (!wb && (isZip || isOle)) {
      // Tenta buffer direto (modo normal)
      try { wb = XLSX.read(buffer, { type: "buffer", cellDates: true }); }
      catch (e) { erros.push(`buffer: ${e}`); }
    }

    if (!wb) {
      // Fallback: tenta binary string (às vezes resolve ZIP com compressão não-padrão)
      try { wb = XLSX.read(buffer.toString("binary"), { type: "binary", cellDates: true }); }
      catch (e) { erros.push(`binary: ${e}`); }
    }

    if (!wb) {
      // Fallback final: base64
      try { wb = XLSX.read(buffer.toString("base64"), { type: "base64", cellDates: true }); }
      catch (e) { erros.push(`base64: ${e}`); }
    }

    if (!wb) {
      return NextResponse.json({
        error: `Formato de arquivo não suportado. Abra o arquivo no Excel, salve como "Pasta de Trabalho do Excel (.xlsx)" e tente novamente.\n\nDetalhes: ${erros.join(" | ")}`,
        magic: [b0, b1, b2, b3].map(b => b?.toString(16).padStart(2,"0")).join(" "),
      }, { status: 422 });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    // Converte objetos Date (gerados por cellDates:true) para AAAA-MM-DD
    const normalizedRows = rows.map(row => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v instanceof Date && !isNaN(v.getTime())) {
          const y = v.getFullYear();
          const m = String(v.getMonth() + 1).padStart(2, "0");
          const d = String(v.getDate()).padStart(2, "0");
          out[k] = `${y}-${m}-${d}`;
        } else {
          out[k] = v;
        }
      }
      return out;
    });

    return NextResponse.json({ rows: normalizedRows, sheetName: wb.SheetNames[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
