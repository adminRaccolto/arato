// ANTT CIOT — GeradorCIOTService_v3
// API REST/JSON com autenticação JWT (Bearer token ~59 min)
// Baseado na análise da DLL GeradorCIOTShared fornecida pela ANTT

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

// ── Cache de token por CNPJ (reutiliza em invocações quentes do Vercel) ──────

type TokenCacheEntry = { token: string; expires: Date };
const _tokenCache = new Map<string, TokenCacheEntry>();

// ── Serviço CIOT ──────────────────────────────────────────────────────────────

export class CiotService {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, ambiente: AmbienteCiot = "homologacao") {
    this.apiKey  = apiKey;
    this.baseUrl = ANTT_ENDPOINTS[ambiente];
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async autenticar(cnpj: string): Promise<string> {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const res = await fetch(`${this.baseUrl}/v1/autenticacoes`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ cnpj: cnpjLimpo, apiKey: this.apiKey }),
    });

    const data = await res.json() as ApiResponseANTT<{ token: string }>;
    if (!data.Sucesso || !data.Dados?.token) {
      throw new Error(`ANTT auth falhou: ${data.Mensagem || data.Erros?.join(", ")}`);
    }

    const expires = new Date(Date.now() + 58 * 60 * 1000); // 58 min (margem de 1 min)
    _tokenCache.set(cnpjLimpo, { token: data.Dados.token, expires });
    return data.Dados.token;
  }

  private async getToken(cnpj: string): Promise<string> {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const cached = _tokenCache.get(cnpjLimpo);
    if (cached && cached.expires > new Date()) return cached.token;
    return this.autenticar(cnpjLimpo);
  }

  // ── Operações ────────────────────────────────────────────────────────────────

  async declarar(cnpjContratante: string, dados: DeclaracaoCIOT): Promise<ApiResponseANTT<CiotGerado>> {
    const token = await this.getToken(cnpjContratante);

    const payload: DeclaracaoCIOT = {
      TipoOperacao:   1,
      IndContingencia: "false",
      DataDeclaracao: new Date().toISOString(),
      InfIndicadoresOperacionais: {
        IndAltoDesempenho:  "false",
        IndRetornoVazio:    "false",
        ComposicaoVeicular: "false",
      },
      ...dados,
    };

    const res = await fetch(`${this.baseUrl}/api/DeclaracaoOperacaoTransporte`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    });
    return res.json();
  }

  async consultar(cnpj: string, idOperacao: string): Promise<ApiResponseANTT> {
    const token = await this.getToken(cnpj);
    const res = await fetch(`${this.baseUrl}/api/ConsultarCIOTGerado?IdOperacaoTransporte=${idOperacao}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  async encerrar(cnpj: string, idOperacao: string, codigoVerificador: string): Promise<ApiResponseANTT> {
    const token = await this.getToken(cnpj);
    const res = await fetch(`${this.baseUrl}/api/EncerramentoOperacaoTransporte`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ IdOperacaoTransporte: idOperacao, CodigoVerificador: codigoVerificador }),
    });
    return res.json();
  }

  async cancelar(cnpj: string, idOperacao: string, codigoVerificador: string): Promise<ApiResponseANTT> {
    const token = await this.getToken(cnpj);
    const res = await fetch(`${this.baseUrl}/api/CancelamentoOperacaoTransporte`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ IdOperacaoTransporte: idOperacao, CodigoVerificador: codigoVerificador }),
    });
    return res.json();
  }

  async consultarFrota(cnpj: string, cnpjTransportador: string): Promise<ApiResponseANTT> {
    const token = await this.getToken(cnpj);
    const res = await fetch(
      `${this.baseUrl}/api/ConsultarFrotaTransportador?CpfCnpjTransportador=${cnpjTransportador.replace(/\D/g,"")}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.json();
  }
}

// ── Factory (usa ANTT_API_KEY do env) ────────────────────────────────────────

export function criarCiotService(ambiente: AmbienteCiot = "homologacao"): CiotService {
  const apiKey = process.env.ANTT_API_KEY;
  if (!apiKey) throw new Error("ANTT_API_KEY não configurada — adicionar nas variáveis de ambiente do Vercel");
  return new CiotService(apiKey, ambiente);
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
