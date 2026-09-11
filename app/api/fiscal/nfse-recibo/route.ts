/**
 * GET /api/fiscal/nfse-recibo?id=<nf_servicos.id>&fazenda_id=<opcional>
 *
 * NFS-e não tem layout nacional padronizado (cada prefeitura desenha o seu),
 * então — ao contrário da DANFE de NF-e — não existe uma biblioteca genérica
 * capaz de "desenhar o documento oficial" a partir dos dados. Esta rota gera
 * um comprovante interno (HTML, imprimível/"salvar como PDF" pelo navegador)
 * com os dados que o Arato já capturou — não substitui a NFS-e original
 * emitida pela prefeitura, só dá uma visão organizada e imprimível dela.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function fmtBRL(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtDoc(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v ?? "—";
}
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest) {
  const id         = req.nextUrl.searchParams.get("id") ?? "";
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id") ?? "";

  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
  if (!SERVICE_KEY || !SUPABASE_URL) return NextResponse.json({ erro: "Configuração do servidor incompleta" }, { status: 500 });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let q = db.from("nf_servicos").select("*").eq("id", id);
  if (fazenda_id) q = q.eq("fazenda_id", fazenda_id);
  const { data: nf, error } = await q.maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!nf) return NextResponse.json({ erro: "NFS-e não encontrada" }, { status: 404 });

  const { data: fazenda } = await db.from("fazendas").select("nome,cnpj").eq("id", nf.fazenda_id).maybeSingle();

  const STATUS_LABEL: Record<string, string> = {
    digitando: "Em digitação", pendente: "Pendente", processada: "Processada", cancelada: "Cancelada",
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Comprovante NFS-e ${esc(nf.numero_nf)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; background: #fff; font-size: 13px; }
  .wrap { max-width: 780px; margin: 0 auto; }
  .aviso { background: #FBF3E0; border: 1px solid #C9921B60; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #7A5A12; margin-bottom: 20px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1A4870; padding-bottom: 14px; margin-bottom: 20px; }
  header h1 { font-size: 18px; margin: 0 0 4px; color: #0B2D50; }
  header .sub { font-size: 11px; color: #666; }
  .status { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
  .status.processada { background: #E8F5E9; color: #1A6B3C; }
  .status.pendente { background: #FBF3E0; color: #C9921B; }
  .status.cancelada { background: #FCEBEB; color: #791F1F; }
  .status.digitando { background: #F3F4F6; color: #555; }
  section { margin-bottom: 18px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #888; margin-bottom: 8px; border-bottom: 0.5px solid #ddd; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
  .grid.cols3 { grid-template-columns: 1fr 1fr 1fr; }
  .field .k { font-size: 10px; color: #888; margin-bottom: 2px; }
  .field .v { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  .discriminacao { white-space: pre-wrap; font-size: 12.5px; line-height: 1.6; background: #F9FAFB; border: 0.5px solid #eee; border-radius: 8px; padding: 12px 14px; }
  table.valores { width: 100%; border-collapse: collapse; }
  table.valores td { padding: 6px 8px; font-size: 12.5px; border-bottom: 0.5px solid #eee; }
  table.valores td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  table.valores tr.total td { border-top: 2px solid #1A4870; border-bottom: none; font-weight: 700; font-size: 14px; padding-top: 10px; }
  footer { margin-top: 32px; padding-top: 14px; border-top: 0.5px solid #ddd; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 12px; } .aviso { display: none; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="aviso">Comprovante interno gerado pelo Arato a partir dos dados capturados — não é o documento oficial emitido pela prefeitura. Para a NFS-e original, consulte o portal da prefeitura ou o prestador do serviço.</div>

    <header>
      <div>
        <h1>Comprovante de NFS-e</h1>
        <div class="sub">${esc(fazenda?.nome ?? "")}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;color:#0B2D50">Nº ${esc(nf.numero_nf)}${nf.serie ? ` / ${esc(nf.serie)}` : ""}</div>
        <div class="status ${nf.status}">${STATUS_LABEL[nf.status as string] ?? nf.status}</div>
      </div>
    </header>

    <section>
      <div class="label">Prestador do Serviço</div>
      <div class="grid cols3">
        <div class="field"><div class="k">Nome / Razão Social</div><div class="v">${esc(nf.prestador_nome) || "—"}</div></div>
        <div class="field"><div class="k">CNPJ / CPF</div><div class="v">${fmtDoc(nf.prestador_cnpj)}</div></div>
        <div class="field"><div class="k">Município da Prestação</div><div class="v">${esc(nf.municipio_prestacao) || "—"}</div></div>
      </div>
    </section>

    <section>
      <div class="label">Tomador do Serviço</div>
      <div class="grid cols3">
        <div class="field"><div class="k">Nome / Razão Social</div><div class="v">${esc(nf.tomador_nome) || esc(fazenda?.nome) || "—"}</div></div>
        <div class="field"><div class="k">CNPJ / CPF</div><div class="v">${fmtDoc(nf.tomador_cnpj)}</div></div>
        <div class="field"><div class="k">Chave / Verificação NFS-e</div><div class="v">${esc(nf.chave_nfse) || "—"}</div></div>
      </div>
    </section>

    <section>
      <div class="label">Identificação e Classificação</div>
      <div class="grid cols3">
        <div class="field"><div class="k">Data da Prestação</div><div class="v">${fmtData(nf.data_prestacao)}</div></div>
        <div class="field"><div class="k">Competência</div><div class="v">${esc(nf.competencia) || "—"}</div></div>
        <div class="field"><div class="k">Código de Serviço (LC 116/2003)</div><div class="v">${esc(nf.codigo_servico) || "—"}</div></div>
        <div class="field"><div class="k">CNAE</div><div class="v">${esc(nf.cnae) || "—"}</div></div>
      </div>
    </section>

    <section>
      <div class="label">Discriminação do Serviço</div>
      <div class="discriminacao">${esc(nf.discriminacao) || "—"}</div>
    </section>

    <section>
      <div class="label">Valores e Tributação</div>
      <table class="valores">
        <tr><td>Valor do Serviço</td><td>${fmtBRL(nf.valor_servico)}</td></tr>
        ${nf.valor_deducoes ? `<tr><td>Deduções (materiais/subempreitadas)</td><td>− ${fmtBRL(nf.valor_deducoes)}</td></tr>` : ""}
        <tr><td>Base de Cálculo ISS</td><td>${fmtBRL(nf.valor_base_iss)}</td></tr>
        <tr><td>Alíquota ISS</td><td>${(nf.aliquota_iss ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</td></tr>
        <tr><td>Valor do ISS ${nf.iss_retido ? "(retido pelo tomador)" : "(recolhido pelo prestador)"}</td><td>${fmtBRL(nf.valor_iss)}</td></tr>
        ${nf.valor_inss ? `<tr><td>INSS Retido</td><td>− ${fmtBRL(nf.valor_inss)}</td></tr>` : ""}
        ${nf.valor_ir ? `<tr><td>IR Retido</td><td>− ${fmtBRL(nf.valor_ir)}</td></tr>` : ""}
        ${nf.valor_outras_retencoes ? `<tr><td>Outras Retenções (CSLL/PIS/COFINS)</td><td>− ${fmtBRL(nf.valor_outras_retencoes)}</td></tr>` : ""}
        <tr class="total"><td>Valor Líquido</td><td>${fmtBRL(nf.valor_liquido)}</td></tr>
      </table>
    </section>

    <footer>Gerado por Arato em ${new Date().toLocaleString("pt-BR")} — documento interno, não substitui a NFS-e oficial da prefeitura.</footer>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
