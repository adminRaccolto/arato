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
import { prepararDeclaracao } from "../../../../lib/antt/validacao";
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
  semImplemento?: boolean;    // caminhão simples (sem carreta)
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

      // A) Base: ETC sem subcontratação de TAC → contratado = a própria transportadora (CNPJ + RNTRC
      //    do emitente) e favorecido do Pix; contratante = tomador; destinatário = da carga.
      const base: DeclaracaoCIOT = {
        ...b.dados,
        InfPagamento: (b.dados.InfPagamento ?? []).map(p => ({ ...p, CpfCnpjCreditado: cnpj, ChavePix: cert.pagPix || p.ChavePix })),
      };

      // B) Coordenadas (ANTT não conhece todo CEP). Origem e destino DEVEM ter o mesmo tipo de
      //    localização (B111): ambos com coordenadas, ou ambos só com o município.
      const coordDe = async (cep?: string, ibge?: string): Promise<{ lat: string; lon: string } | null> => {
        const c = (cep ?? "").replace(/\D/g, "");
        try {
          if (c.length === 8) {
            const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${c}`, { signal: AbortSignal.timeout(8000) });
            if (r.ok) { const j = await r.json() as { location?: { coordinates?: { latitude?: string; longitude?: string } } }; const co = j.location?.coordinates; if (co?.latitude && co?.longitude) return { lat: Number(co.latitude).toFixed(6), lon: Number(co.longitude).toFixed(6) }; }
          }
          if (ibge) {
            const r = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${ibge}?formato=application/vnd.geo+json`, { signal: AbortSignal.timeout(10000) });
            if (r.ok) {
              const j = await r.json() as { features?: { geometry?: { coordinates?: unknown } }[] };
              const pts: number[][] = [];
              const walk = (x: unknown): void => { if (Array.isArray(x)) { if (typeof x[0] === "number") pts.push(x as number[]); else x.forEach(walk); } };
              walk(j.features?.[0]?.geometry?.coordinates);
              if (pts.length) { const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]); return { lat: ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(6), lon: ((Math.min(...lons) + Math.max(...lons)) / 2).toFixed(6) }; }
            }
          }
        } catch { /* sem coordenada */ }
        return null;
      };
      base.OrigemDestino = await Promise.all((base.OrigemDestino ?? []).map(async o => {
        const [co, cd] = await Promise.all([coordDe(o.Origem.CepOrigem, o.Origem.CodigoMunicipioOrigem), coordDe(o.Destino.CepDestino, o.Destino.CodigoMunicipioDestino)]);
        return co && cd
          ? { ...o, Origem: { CodigoMunicipioOrigem: o.Origem.CodigoMunicipioOrigem, LatitudeOrigem: co.lat, LongitudeOrigem: co.lon }, Destino: { CodigoMunicipioDestino: o.Destino.CodigoMunicipioDestino, LatitudeDestino: cd.lat, LongitudeDestino: cd.lon } }
          : { ...o, Origem: { CodigoMunicipioOrigem: o.Origem.CodigoMunicipioOrigem }, Destino: { CodigoMunicipioDestino: o.Destino.CodigoMunicipioDestino } };
      }));

      // C) Validação COMPLETA antes de reservar o número (regras B1–B120 do DCS PEF v1.1)
      const prep = prepararDeclaracao({ dados: base, cnpjEmitente: cnpj, rntrcEmitente: cert.rntrc, semImplemento: b.semImplemento, pagPix: cert.pagPix });
      if (prep.erros.length) {
        const msg = `Corrija antes de gerar o CIOT: ${prep.erros.join(" | ")}`;
        return NextResponse.json({ Sucesso: false, Mensagem: msg, Erros: prep.erros, error: msg }, { status: 422 });
      }
      const dados = prep.dados;

      // D) Pré-checagem da frota (B15/B20): as placas pertencem ao RNTRC da transportadora?
      try {
        const fr = await svc.consultarFrota(cnpj, cnpj, dados.RNTRCContratado, dados.Veiculos.map(v => v.Placa));
        const frota = (fr.Dados as { Frota?: { PlacaVeiculo: string; SituacaoVeiculoFrotaTransportador: boolean | number | string }[] } | undefined)?.Frota
          ?? (fr as unknown as { Frota?: { PlacaVeiculo: string; SituacaoVeiculoFrotaTransportador: boolean | number | string }[] }).Frota;
        const fora = (frota ?? []).filter(x => !(x.SituacaoVeiculoFrotaTransportador === true || x.SituacaoVeiculoFrotaTransportador === 1 || x.SituacaoVeiculoFrotaTransportador === "true")).map(x => x.PlacaVeiculo);
        if (fora.length) {
          const msg = `A(s) placa(s) ${fora.join(", ")} não pertence(m) à frota do RNTRC ${dados.RNTRCContratado} (transportador ${cnpj}) na ANTT — confira a placa, ou se a carreta é de outro RNTRC.`;
          return NextResponse.json({ Sucesso: false, Mensagem: msg, Erros: [msg], error: msg }, { status: 422 });
        }
      } catch { /* consulta indisponível: a própria declaração valida (B15) */ }

      // E) Número do CIOT: reaproveita um reservado e ainda não declarado do mesmo transportador/placa
      //    (evita queimar um número a cada tentativa), senão reserva novo.
      let id = (b.ciotReservado ?? "").replace(/\D/g, "");
      if (id.length !== 12) {
        const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
        const { data: sobras } = await db.from("ciots").select("id_operacao").eq("cpf_cnpj_contratante", cnpj).eq("placa", dados.Veiculos[0]?.Placa ?? "").eq("status", "reservado").gte("created_at", desde).order("created_at", { ascending: false }).limit(1);
        id = (sobras?.[0]?.id_operacao as string | undefined) ?? "";
      }
      if (id.length !== 12) {
        const g = await svc.gerar(cnpj);
        id = g.Dados?.CIOT ?? "";
        if (!g.Sucesso || !id) return NextResponse.json({ ...g, Mensagem: `Falha ao gerar o CIOT: ${g.Mensagem || g.Erros?.join(", ") || "sem detalhe"}` }, { status: 422 });
        await db.from("ciots").insert({ id_operacao: id, cpf_cnpj_contratante: cnpj, cpf_cnpj_contratado: cnpj, placa: dados.Veiculos[0]?.Placa, valor_frete: parseFloat(dados.ValorFrete), ambiente: b.ambiente ?? "homologacao", status: "reservado" });
      }

      // F) Declara (DataDeclaracao no horário de Brasília, na hora do envio)
      const d = await svc.declarar(id, dados);
      if (!d.Sucesso) return NextResponse.json({ ...d, Dados: { IdOperacaoTransporte: id }, Mensagem: `CIOT ${id} reservado, mas a declaração da operação falhou: ${d.Mensagem || d.Erros?.join(" | ") || "sem detalhe"}` }, { status: 422 });
      const dd = d.Dados;
      await db.from("ciots").update({ codigo_verificador: dd?.CodigoVerificador, protocolo: dd?.Protocolo, valor_frete: parseFloat(dados.ValorFrete), data_inicio: dados.DataInicioViagem, data_fim: dados.DataFimViagem, status: "declarado" }).eq("id_operacao", id);
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
