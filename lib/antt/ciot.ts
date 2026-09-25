// ANTT CIOT — GeradorCIOTService_v3
// API REST/JSON pefServices da ANTT. AUTENTICAÇÃO: mTLS com o certificado e-CNPJ (ICP-Brasil) do
// emitente — o MESMO A1 usado na SEFAZ. NÃO existe chave de API (ANTT_API_KEY): a versão anterior
// desta integração (token via /v1/autenticacoes) estava errada — corrigido em 25/09/2026 com base
// na coleção pública stoix-dev/antt-webservices-postman e no guia flexdocs (Gera CIOT/Declara).
// Fluxo ETC sem subcontratação de TAC: POST /pefServices/gerar {CpfCnpj} → CIOT (12 dígitos);
// POST /pefServices/api/DeclaracaoOperacaoTransporte vincula os dados da viagem ao CIOT.

export const ANTT_ENDPOINTS = {
  homologacao: "https://appservices-hml.antt.gov.br/pefServices",
  producao:    "https://appservices.antt.gov.br/pefServices",
} as const;

export type AmbienteCiot = "homologacao" | "producao";

// ── Tipos de resposta (espelham a DLL: Sucesso/Dados/Mensagem/Erros) ─────────

export type ApiResponseANTT<T = unknown> = {
  Sucesso:  boolean;
  Dados:    T;
  Mensagem: string;
  Erros:    string[];
};

export type CiotGerado = {
  IdOperacaoTransporte: string; // 12 dígitos — vai no XML do MDF-e
  CodigoVerificador:    string; // 4 dígitos — necessário para encerrar/cancelar
  Protocolo:            string;
  Codigo:               string; // "110" = sucesso
  Mensagem:             string;
  AvisoTransportador:   string | null;
};

// ── Tipos de entrada ──────────────────────────────────────────────────────────

export type VeiculoCiot = {
  Placa:        string;
  RNTRC:        string;
  NumeroEixos:  string; // "2", "3", "4", etc.
};

export type OrigemDestinoCiot = {
  Origem:  { CodigoMunicipioOrigem:   string; CepOrigem:   string };
  Destino: { CodigoMunicipioDestino:  string; CepDestino:  string };
  DistanciaPercorrida: string; // km
  QtdViagens:          string; // "1"
};

export type DadosCargaCiot = {
  CodigoNaturezaCarga: string; // ver tabela ANTT — "2202" granel vegetal
  PesoCarga:           string; // toneladas
  CodigoTipoCarga:     string; // "5" = granel sólido
};

export type PagamentoCiot = {
  TipoPagamento:     string; // "6" = PIX, "1" = dinheiro, "3" = TED
  CpfCnpjCreditado?: string; // CPF/CNPJ de quem recebe
  ChavePix?:         string;
  IdentificadorPix?: string;
  IndPagamento:      string; // "0" = à vista
};

export type DeclaracaoCIOT = {
  CpfCnpjContratado:   string;    // CPF/CNPJ do TAC ou transportadora
  RNTRCContratado:     string;
  CpfCnpjContratante:  string;    // CPF/CNPJ da fazenda/embarcador
  CpfCnpjDestinatario?: string;   // comprador destino
  ValorFrete:          string;    // R$ com 2 casas: "4500.00"
  DataInicioViagem:    string;    // YYYY-MM-DD
  DataFimViagem:       string;    // YYYY-MM-DD
  Veiculos:            VeiculoCiot[];
  OrigemDestino:       OrigemDestinoCiot[];
  DadosCarga:          DadosCargaCiot;
  InfPagamento:        PagamentoCiot[];
  // opcionais com defaults
  TipoOperacao?:       number;    // 1 = normal
  IndContingencia?:    string;    // "false"
  DataDeclaracao?:     string;    // ISO datetime
  InfIndicadoresOperacionais?: {
    IndAltoDesempenho:  string;
    IndRetornoVazio:    string;
    ComposicaoVeicular: string;
  };
};

// ── Serviço CIOT (mTLS) ───────────────────────────────────────────────────────

import https from "node:https";

export type CertificadoPem = { cert: string; key: string };

export class CiotService {
  private host: string;
  private basePath: string;
  constructor(private pem: CertificadoPem, ambiente: AmbienteCiot = "homologacao") {
    const u = new URL(ANTT_ENDPOINTS[ambiente]);
    this.host = u.host;
    this.basePath = u.pathname; // /pefServices
  }

  private post<T = unknown>(path: string, body: unknown): Promise<ApiResponseANTT<T>> {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request({
        host: this.host, path: `${this.basePath}${path}`, method: "POST",
        cert: this.pem.cert, key: this.pem.key,
        headers: { "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 45000,
      }, res => {
        let buf = "";
        res.on("data", d => { buf += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(buf) as ApiResponseANTT<T>); }
          catch { resolve({ Sucesso: false, Dados: null as unknown as T, Mensagem: `Resposta inesperada da ANTT (HTTP ${res.statusCode}): ${buf.slice(0, 300)}`, Erros: [] }); }
        });
      });
      req.on("timeout", () => { req.destroy(new Error("Tempo esgotado ao falar com a ANTT.")); });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  /** Passo 1 — reserva o número do CIOT (12 dígitos) para o CPF/CNPJ do certificado. */
  gerar(cpfCnpj: string) {
    return this.post<{ CIOT: string; CpfCnpj?: string; DataGeracao?: string }>("/gerar", { CpfCnpj: cpfCnpj.replace(/\D/g, "") });
  }

  /** Passo 2 — vincula os dados da viagem ao CIOT gerado. */
  declarar(idOperacao: string, dados: DeclaracaoCIOT) {
    const payload: Record<string, unknown> = {
      IdOperacaoTransporte: idOperacao,
      TipoOperacao: 1,
      IndContingencia: "false",
      DataDeclaracao: new Date().toISOString().slice(0, 19),
      InfIndicadoresOperacionais: { IndAltoDesempenho: "false", IndRetornoVazio: "false", ComposicaoVeicular: "false" },
      ...dados,
    };
    return this.post<CiotGerado>("/api/DeclaracaoOperacaoTransporte", payload);
  }

  consultar(ciot: string, ano: string) {
    return this.post("/api/ConsultarCIOTGerado", { CodigoIdentificacaoOperacao: ciot, AnoDeclaracao: ano });
  }

  cancelar(ciotComVerificador: string, motivo: string) {
    return this.post("/api/CancelamentoOperacaoTransporte", { CodigoIdentificacaoOperacao: ciotComVerificador, MotivoCancelamento: motivo });
  }

  /** Encerra após a viagem: código = CIOT (12) + verificador (4) e peso total da carga. */
  encerrar(ciotComVerificador: string, pesoTotalCarga: string) {
    return this.post("/api/EncerramentoOperacaoTransporte", { CodigoIdentificacaoOperacao: ciotComVerificador, DadosCarga: { PesoTotalCarga: pesoTotalCarga } });
  }
}

export function criarCiotService(pem: CertificadoPem, ambiente: AmbienteCiot = "homologacao"): CiotService {
  return new CiotService(pem, ambiente);
}

// ── Tabelas auxiliares (para uso no frontend) ─────────────────────────────────

export const NATUREZA_CARGA: Record<string, string> = {
  "2101": "Grãos — Soja",
  "2102": "Grãos — Milho",
  "2103": "Grãos — Algodão (pluma)",
  "2104": "Grãos — Trigo",
  "2201": "Fertilizantes — Granel",
  "2202": "Granel vegetal (genérico)",
  "3101": "Defensivos agrícolas",
  "4101": "Carga geral — Embalada",
};

export const TIPO_CARGA: Record<string, string> = {
  "5": "Granel sólido",
  "1": "Carga geral",
  "2": "Granel líquido",
  "3": "Frigorificada/aquecida",
  "4": "Conteinerizada",
  "6": "Neogranel",
  "7": "Perigosa (granel sólido)",
  "9": "Outros",
};

export const TIPO_PAGAMENTO: Record<string, string> = {
  "1": "Dinheiro",
  "2": "Cheque",
  "3": "TED",
  "4": "DOC",
  "5": "Cartão",
  "6": "PIX",
};
