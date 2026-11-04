import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { faturarCarga } from "../../../../lib/contratos/recebimento-carga-server";
import { kgSacaDoProduto } from "../../../../lib/contratos/recebimento-carga";
import { conferirNfComRomaneio, pesoDaNota, pesoRealDoRomaneio } from "../../../../lib/contratos/romaneio-nf";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// POST /api/contratos/vincular-romaneio-nf { romaneio_id, nota_id } — liga o romaneio do recebedor à NF aproximada do contrato.
// Grava a conferência de peso na NF e marca o romaneio como faturado. No contrato com recebimento por carga, gera aqui o CR
// (a NF aproximada não gera), limitado ao peso real; o que passar da NF entra quando a complementar for autorizada.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { romaneio_id: string; nota_id: string };
    const negado = await exigirAcessoRegistro(req, "romaneios", b.romaneio_id) ?? await exigirAcessoRegistro(req, "notas_fiscais", b.nota_id);
    if (negado) return negado;
    const sb = admin();
    const { data: r, error: eR } = await sb.from("romaneios").select("*").eq("id", b.romaneio_id).maybeSingle();
    const { data: n, error: eN } = await sb.from("notas_fiscais").select("*").eq("id", b.nota_id).maybeSingle();
    if (eR || eN || !r || !n) return NextResponse.json({ ok: false, error: eR?.message ?? eN?.message ?? "Romaneio ou NF não encontrados." }, { status: 404 });
    const dj = (n.dados_nf_json ?? {}) as Record<string, unknown>;
    if (dj.contrato_id !== r.contrato_id) return NextResponse.json({ ok: false, error: "A NF é de outro contrato." }, { status: 422 });
    if (n.status !== "autorizada" || dj.faturamento_direto !== true) return NextResponse.json({ ok: false, error: "Só NF direta autorizada recebe romaneio." }, { status: 422 });
    if (dj.romaneio_id && dj.romaneio_id !== r.id) return NextResponse.json({ ok: false, error: `Esta NF já está ligada ao romaneio ${dj.romaneio_numero ?? ""}.` }, { status: 422 });
    if (r.nfe_chave && r.nfe_chave !== n.chave_acesso) return NextResponse.json({ ok: false, error: `Este romaneio já está faturado na NF ${r.nfe_numero ?? ""}.` }, { status: 422 });

    const { data: c } = await sb.from("contratos").select("id, produto, preco, recebimento_por_carga").eq("id", r.contrato_id).maybeSingle();
    const kgSaca = kgSacaDoProduto(c?.produto);
    const conf = conferirNfComRomaneio(pesoDaNota(n.itens_json, kgSaca), pesoRealDoRomaneio(r), Number(n.valor_total) || 0);

    let aviso: string | undefined;
    if (c?.recebimento_por_carga) {
      const menor = conf.situacao === "a_menor";
      const carga = await faturarCarga(sb, c.id, n.id,
        menor && Number(c.preco) > 0 ? Math.round(conf.peso_real_kg / kgSaca * Number(c.preco) * 100) / 100 : null,
        menor ? conf.valor_real : null);
      if (!carga.ok) return NextResponse.json({ ok: false, error: carga.error }, { status: 422 });
      aviso = carga.aviso;
    }

    const { error: eNota } = await sb.from("notas_fiscais").update({ dados_nf_json: {
      ...dj, romaneio_id: r.id, romaneio_numero: r.numero,
      peso_real_kg: conf.peso_real_kg, diferenca_kg: conf.diferenca_kg, valor_diferenca: conf.valor_diferenca,
    } }).eq("id", n.id);
    if (eNota) return NextResponse.json({ ok: false, error: eNota.message }, { status: 500 });
    const { error: eRom } = await sb.from("romaneios").update({ nfe_chave: n.chave_acesso, nfe_numero: n.numero, nfe_serie: n.serie, nfe_status: "autorizada" }).eq("id", r.id);
    if (eRom) return NextResponse.json({ ok: false, error: eRom.message }, { status: 500 });
    return NextResponse.json({ ok: true, conferencia: conf, nota_numero: n.numero, aviso });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
