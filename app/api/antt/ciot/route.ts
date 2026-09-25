/**
 * POST /api/antt/ciot — CIOT pela API pefServices da ANTT, autenticada por mTLS com o certificado
 * A1 (e-CNPJ) do emitente — o mesmo da SEFAZ. Não usa chave de API.
 *
 * acao "declarar" (= gerar + declarar): reserva o CIOT (POST /gerar) e vincula os dados da viagem
 *   body: { fazenda_id, cnpjContratante (CNPJ do emitente/ETC), ambiente, dados }
 * acao "consultar" | "encerrar" | "cancelar": operam sobre um CIOT já gerado.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCiotService, type DeclaracaoCIOT, type AmbienteCiot } from "../../../../lib/antt/ciot";
import { carregarCertificadoEmitente } from "../../../../lib/antt/certificado";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  acao: "declarar" | "consultar" | "encerrar" | "cancelar";
  fazenda_id?: string;
  cnpjContratante?: string;   // emitente (ETC)
  ambiente?: AmbienteCiot;
  dados?: DeclaracaoCIOT;
  ciot?: string;              // 12 dígitos + verificador quando exigido
  ciotReservado?: string;     // CIOT já reservado (POST /gerar) cuja declaração falhou — reaproveita em vez de gerar outro
  ano?: string; peso?: string; motivo?: string;
};

const falha = (msg: string, status = 400) => NextResponse.json({ Sucesso: false, Mensagem: msg, Erros: [msg], error: msg }, { status });

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Body;
    if (!b.fazenda_id || !b.cnpjContratante) return falha("fazenda_id e cnpjContratante (CNPJ do emitente) são obrigatórios.");
    const acesso = await validateFazendaAccess(b.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return falha(acesso.error ?? "Sem acesso.", acesso.status);

    const cnpj = b.cnpjContratante.replace(/\D/g, "");
    const cert = await carregarCertificadoEmitente(b.fazenda_id, cnpj);
    if ("erro" in cert) return falha(cert.erro);
    const svc = criarCiotService(cert.pem, b.ambiente ?? "homologacao");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    if (b.acao === "declarar") {
      if (!b.dados) return falha("dados da operação obrigatórios.");
      // 1) reserva o número do CIOT
      let id = (b.ciotReservado ?? "").replace(/\D/g, "");
      if (id.length !== 12) {
        const g = await svc.gerar(cnpj);
        id = g.Dados?.CIOT ?? "";
        if (!g.Sucesso || !id) return NextResponse.json({ ...g, Mensagem: `Falha ao gerar o CIOT: ${g.Mensagem || g.Erros?.join(", ") || "sem detalhe"}` }, { status: 422 });
      }
      // 2) declara a operação. ETC sem subcontratação de TAC: contratado = a própria transportadora
      //    (CNPJ + RNTRC do emitente) e o favorecido do pagamento também.
      const pgto = (b.dados.InfPagamento ?? []).map(p => ({ ...p, CpfCnpjCreditado: cnpj, ChavePix: p.ChavePix && p.ChavePix.replace(/\D/g, "") !== (b.dados!.CpfCnpjContratado ?? "").replace(/\D/g, "") ? p.ChavePix : (cert.pagPix || p.ChavePix) }));
      const dados: DeclaracaoCIOT = {
        ...b.dados,
        CpfCnpjContratado: cnpj,
        RNTRCContratado: cert.rntrc || b.dados.RNTRCContratado,
        InfPagamento: pgto,
      };
      const d = await svc.declarar(id, dados);
      if (!d.Sucesso) return NextResponse.json({ ...d, Dados: { IdOperacaoTransporte: id }, Mensagem: `CIOT ${id} reservado, mas a declaração da operação falhou: ${d.Mensagem || d.Erros?.join(", ") || "sem detalhe"}` }, { status: 422 });
      const dd = d.Dados;
      await db.from("ciots").insert({
        id_operacao: dd?.IdOperacaoTransporte ?? id, codigo_verificador: dd?.CodigoVerificador, protocolo: dd?.Protocolo,
        cpf_cnpj_contratante: cnpj, cpf_cnpj_contratado: cnpj, valor_frete: parseFloat(b.dados.ValorFrete),
        data_inicio: b.dados.DataInicioViagem, data_fim: b.dados.DataFimViagem, placa: b.dados.Veiculos?.[0]?.Placa,
        ambiente: b.ambiente ?? "homologacao", status: "declarado",
      });
      return NextResponse.json({ ...d, Dados: { IdOperacaoTransporte: dd?.IdOperacaoTransporte ?? id, CodigoVerificador: dd?.CodigoVerificador ?? "", Protocolo: dd?.Protocolo ?? "" } });
    }

    if (b.acao === "consultar") return NextResponse.json(await svc.consultar(b.ciot ?? "", b.ano ?? String(new Date().getFullYear())));
    if (b.acao === "encerrar") {
      const r = await svc.encerrar(b.ciot ?? "", b.peso ?? "");
      if (r.Sucesso) await db.from("ciots").update({ status: "encerrado" }).eq("id_operacao", (b.ciot ?? "").slice(0, 12));
      return NextResponse.json(r);
    }
    if (b.acao === "cancelar") {
      const r = await svc.cancelar(b.ciot ?? "", b.motivo ?? "");
      if (r.Sucesso) await db.from("ciots").update({ status: "cancelado" }).eq("id_operacao", (b.ciot ?? "").slice(0, 12));
      return NextResponse.json(r);
    }
    return falha("Ação inválida.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, Sucesso: false, Mensagem: msg, Erros: [msg], error: msg }, { status: 500 });
  }
}
