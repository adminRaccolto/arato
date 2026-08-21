/**
 * POST /api/compras/nf-rascunho-itens
 *
 * Salva os itens brutos da NF-e no banco + faz upload do XML no Storage.
 * Usa service_role_key — imune a JWT expirado e RLS.
 *
 * Chamado em salvarRascunho() (step 2 → 3) para garantir que, ao reabrir
 * uma NF que foi importada via XML manual, os itens e o XML sempre existam.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

type ItemRaw = {
  descricao_nf: string;
  ncm?: string;
  cfop?: string;
  unidade_nf: string;
  quantidade: number;       // em unidade catálogo (após conversão)
  valor_unitario: number;
  valor_total: number;
  fator_conversao?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      nf_id: string;
      fazenda_id: string;
      chave_acesso?: string;
      xml_text?: string;
      itens: ItemRaw[];
    };

    const { nf_id, fazenda_id, chave_acesso, xml_text, itens } = body;

    if (!nf_id || !fazenda_id) {
      return NextResponse.json({ error: "nf_id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const db = admin();

    // 1. Salva itens: delete + insert (idempotente)
    if (itens && itens.length > 0) {
      await db.from("nf_entrada_itens").delete().eq("nf_entrada_id", nf_id);

      const rows = itens
        .filter(i => i.descricao_nf?.trim())
        .map(i => ({
          nf_entrada_id:   nf_id,
          fazenda_id,
          descricao_produto: i.descricao_nf,   // campo obrigatório no schema
          descricao_nf:    i.descricao_nf,
          ncm:             i.ncm  || null,
          cfop:            i.cfop || null,
          unidade:         i.unidade_nf,
          unidade_nf:      i.unidade_nf,
          quantidade:      i.quantidade,
          valor_unitario:  i.valor_unitario,
          valor_total:     i.valor_total,
          fator_conversao: i.fator_conversao ?? 1,
          tipo_apropiacao: "estoque" as const,
          alerta_preco:    false,
        }));

      if (rows.length > 0) {
        const { error: ie } = await db.from("nf_entrada_itens").insert(rows);
        if (ie) console.error("[nf-rascunho-itens] erro ao salvar itens:", ie.message);
      }
    }

    // 2. Upload XML no Storage (bucket "arquivos", path nfs-sieg/{fazenda_id}/{chave}.xml)
    if (xml_text && chave_acesso) {
      const chave = chave_acesso.replace(/\D/g, "");
      if (chave.length === 44) {
        const xmlPath = `nfs-sieg/${fazenda_id}/${chave}.xml`;
        const blob = new Blob([xml_text], { type: "application/xml" });
        const { error: se } = await db.storage
          .from("arquivos")
          .upload(xmlPath, blob, { upsert: true, contentType: "application/xml" });
        if (se) console.error("[nf-rascunho-itens] erro ao salvar XML:", se.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[nf-rascunho-itens]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
