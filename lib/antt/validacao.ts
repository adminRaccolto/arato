/**
 * Validação LOCAL da declaração de operação de transporte (CIOT) — feita ANTES de reservar o
 * número na ANTT, para não gastar CIOTs em tentativas que a própria ANTT rejeitaria. Baseada no
 * DCS PEF v1.1 (regras B1–B120): datas em horário de Brasília (B6/B11/B12/B13/B21/B22), RNTRC de 9
 * dígitos (B60), placas Mercosul/antigas e sem duplicidade (B1/B5), um único automotor e
 * implemento p/ cavalo-trator (B83/B84/B117), eixos (B101), distância compatível com origem/destino
 * (B82), mesmo tipo de localização em origem e destino (B111), campos por tipo de pagamento
 * (B92/B99), peso 0–99999.99 (B18), CPF/CNPJ com dígito verificador (B1).
 */
import type { DeclaracaoCIOT } from "./ciot";

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function cpfValido(c: string): boolean {
  c = so(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0; for (let i = 0; i < t; i++) s += parseInt(c[i]) * (t + 1 - i);
    const d = ((s * 10) % 11) % 10; if (d !== parseInt(c[t])) return false;
  }
  return true;
}
export function cnpjValido(c: string): boolean {
  c = so(c);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += parseInt(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === parseInt(c[12]) && calc(13) === parseInt(c[13]);
}
export const docValido = (d: string) => cpfValido(d) || cnpjValido(d);

export const placaValida = (p: string) => /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);

/** Data/hora e data atuais no horário oficial de Brasília (a ANTT compara com ele — não com MT/UTC). */
export function agoraBrasilia(d = new Date()): { dataHora: string; data: string } {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dataHora = f.format(d).replace(" ", "T");
  return { dataHora, data: dataHora.slice(0, 10) };
}

const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface EntradaValidacao {
  dados: DeclaracaoCIOT;
  cnpjEmitente: string;
  rntrcEmitente?: string;
  semImplemento?: boolean;
  pagPix?: string;
}

/** Normaliza (RNTRC 9 dígitos, datas, números com 2 casas) e devolve a lista COMPLETA de erros. */
export function prepararDeclaracao(e: EntradaValidacao): { dados: DeclaracaoCIOT; erros: string[] } {
  const erros: string[] = [];
  const d: DeclaracaoCIOT = JSON.parse(JSON.stringify(e.dados));
  const hoje = agoraBrasilia().data;

  // RNTRC (B60): 8 dígitos → zero à esquerda; 9 mantém
  const rn = (v: unknown) => { const x = so(v); return x.length === 8 ? "0" + x : x; };
  d.RNTRCContratado = rn(e.rntrcEmitente || d.RNTRCContratado);
  if (d.RNTRCContratado.length !== 9) erros.push("RNTRC da transportadora inválido (8 ou 9 dígitos) — confira em Parâmetros → MDF-e/CT-e.");

  // Documentos (B1)
  d.CpfCnpjContratado = so(e.cnpjEmitente);
  d.CpfCnpjContratante = so(d.CpfCnpjContratante);
  d.CpfCnpjDestinatario = so(d.CpfCnpjDestinatario) || undefined;
  if (!docValido(d.CpfCnpjContratado)) erros.push("CNPJ da transportadora (emitente) inválido.");
  if (!docValido(d.CpfCnpjContratante)) erros.push("CPF/CNPJ do contratante (tomador do frete) ausente ou inválido no CT-e.");
  if (!d.CpfCnpjDestinatario || !docValido(d.CpfCnpjDestinatario)) erros.push("CPF/CNPJ do destinatário da carga ausente ou inválido (obrigatório em carga lotação).");

  // Frete e peso (B18/B120)
  const frete = parseFloat(String(d.ValorFrete).replace(",", "."));
  if (!(frete > 0)) erros.push("Valor do frete deve ser maior que zero."); else d.ValorFrete = frete.toFixed(2);
  const peso = parseFloat(String(d.DadosCarga?.PesoCarga ?? "0").replace(",", "."));
  if (!(peso > 0 && peso < 99999.99)) erros.push("Peso da carga deve ser maior que 0 e menor que 99999.99 (toneladas)."); else d.DadosCarga.PesoCarga = peso.toFixed(2);
  d.DadosCarga.CodigoTipoCarga = so(d.DadosCarga.CodigoTipoCarga) || "1";
  if (!so(d.DadosCarga.CodigoNaturezaCarga)) erros.push("Natureza da carga obrigatória.");

  // Datas (B6/B11/B12/B13/B21/B22) — Brasília
  const ini = String(d.DataInicioViagem || hoje).slice(0, 10);
  d.DataInicioViagem = ini < hoje ? hoje : ini;            // B6: não pode ser inferior à data atual
  const fim = String(d.DataFimViagem || d.DataInicioViagem).slice(0, 10);
  d.DataFimViagem = fim < d.DataInicioViagem ? d.DataInicioViagem : fim; // B13
  if (d.DataInicioViagem > somaDias(hoje, 30)) erros.push("Data de início da viagem excede 30 dias à frente.");
  if (diasEntre(d.DataInicioViagem, d.DataFimViagem) > 90) erros.push("Intervalo entre início e fim da viagem não pode passar de 90 dias.");

  // Veículos (B1/B5/B83/B84/B101/B117)
  const vs = d.Veiculos ?? [];
  const placas = vs.map(v => String(v.Placa ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase());
  vs.forEach((v, i) => { v.Placa = placas[i]; v.RNTRC = rn(v.RNTRC || d.RNTRCContratado); });
  if (!vs.length) erros.push("Informe o veículo automotor.");
  placas.forEach(p => { if (!placaValida(p)) erros.push(`Placa inválida: ${p || "(vazia)"}.`); });
  if (new Set(placas).size !== placas.length) erros.push("Há placas duplicadas na lista de veículos.");
  if (vs[0]) { const n = parseInt(vs[0].NumeroEixos); if (!(n >= 2 && n <= 4)) erros.push("Veículo automotor deve ter de 2 a 4 eixos."); }
  vs.slice(1).forEach(v => { const n = parseInt(v.NumeroEixos); if (!(n >= 1 && n <= 4)) erros.push(`Implemento ${v.Placa}: de 1 a 4 eixos.`); });
  if (vs.length === 1 && !e.semImplemento) erros.push("Cavalo-trator exige ao menos um implemento (carreta): informe a(s) placa(s) do implemento — ou marque \"sem implemento\" se for caminhão simples.");

  // Origem/destino (B82/B109/B110/B111)
  for (const o of d.OrigemDestino ?? []) {
    const lo = o.Origem.LatitudeOrigem, gO = o.Origem.LongitudeOrigem, ld = o.Destino.LatitudeDestino, gD = o.Destino.LongitudeDestino;
    if ((!!lo) !== (!!gO) || (!!ld) !== (!!gD)) erros.push("Latitude e longitude devem ser informadas em conjunto.");
    const tipoO = lo ? "coord" : o.Origem.CepOrigem ? "cep" : o.Origem.CodigoMunicipioOrigem ? "cidade" : "";
    const tipoD = ld ? "coord" : o.Destino.CepDestino ? "cep" : o.Destino.CodigoMunicipioDestino ? "cidade" : "";
    if (!tipoO || !tipoD) erros.push("Informe origem e destino (município, CEP ou coordenadas).");
    else if (tipoO !== tipoD) erros.push("O tipo de localização de origem e destino deve ser o mesmo (ambos coordenadas, ambos CEP ou ambos município).");
    const km = parseFloat(String(o.DistanciaPercorrida).replace(",", "."));
    if (!(km > 0)) erros.push("Distância percorrida deve ser maior que zero.");
    else {
      o.DistanciaPercorrida = String(Math.round(km));
      if (lo && gO && ld && gD) {
        const reta = haversineKm(+lo, +gO, +ld, +gD);
        if (km < reta * 0.98) erros.push(`Distância informada (${Math.round(km)} km) é menor que a distância em linha reta entre origem e destino (~${Math.round(reta)} km) — a ANTT rejeita (B82). Informe a distância rodoviária real.`);
      }
    }
    o.QtdViagens = "1";
  }

  // Pagamento (B92/B99): PIX exige chave e nenhum campo bancário
  const pg = d.InfPagamento ?? [];
  if (!pg.length) erros.push("Informe o pagamento do frete.");
  pg.forEach(p => {
    if (String(p.TipoPagamento) === "6") { if (!(p.ChavePix ?? e.pagPix)) erros.push("Chave PIX do favorecido obrigatória (Parâmetros → MDF-e → Pagamento do frete)."); p.IndPagamento = "0"; }
  });
  return { dados: d, erros };
}
