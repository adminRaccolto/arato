// Cliente Asaas — plataforma de pagamentos brasileira
// Docs: https://docs.asaas.com
// Env: ASAAS_API_KEY, ASAAS_ENV (sandbox | production)

const BASE_URL =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

function headers() {
  return {
    "Content-Type": "application/json",
    access_token: process.env.ASAAS_API_KEY ?? "",
  };
}

async function req<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas ${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
  value: number;
  dueDate: string;
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "RECEIVED_IN_CASH" | "REFUND_REQUESTED" | "CHARGEBACK_REQUESTED" | "CHARGEBACK_DISPUTE" | "AWAITING_CHARGEBACK_REVERSAL" | "DUNNING_REQUESTED" | "DUNNING_RECEIVED" | "AWAITING_RISK_ANALYSIS";
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: "MONTHLY" | "YEARLY";
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
}

export interface AsaasPixQrCode {
  encodedImage: string; // base64 PNG
  payload: string;      // copia-e-cola
  expirationDate: string;
}

// ── API ────────────────────────────────────────────────────────────────────

export async function criarCliente(data: {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  city?: string;
  state?: string;
}): Promise<AsaasCustomer> {
  return req<AsaasCustomer>("POST", "/customers", data);
}

export async function criarCobranca(data: {
  customer: string;
  billingType: "BOLETO" | "PIX" | "UNDEFINED";
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string; // nosso ID
  postalService?: boolean;
}): Promise<AsaasPayment> {
  return req<AsaasPayment>("POST", "/payments", data);
}

export async function buscarPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return req<AsaasPixQrCode>("GET", `/payments/${paymentId}/pixQrCode`);
}

export async function criarAssinatura(data: {
  customer: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: "MONTHLY" | "YEARLY";
  description?: string;
  externalReference?: string;
}): Promise<AsaasSubscription> {
  return req<AsaasSubscription>("POST", "/subscriptions", data);
}

export async function cancelarAssinatura(subscriptionId: string): Promise<void> {
  await req("DELETE", `/subscriptions/${subscriptionId}`);
}

export async function buscarPagamento(paymentId: string): Promise<AsaasPayment> {
  return req<AsaasPayment>("GET", `/payments/${paymentId}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function proximoVencimento(periodo: "mensal" | "anual"): string {
  const d = new Date();
  d.setDate(d.getDate() + 3); // 3 dias para pagar
  return d.toISOString().split("T")[0];
}

export function statusAsaasParaLocal(status: AsaasPayment["status"]): "pago" | "pendente" | "vencido" | "cancelado" {
  if (["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(status)) return "pago";
  if (["OVERDUE"].includes(status)) return "vencido";
  if (["REFUNDED","REFUND_REQUESTED","CHARGEBACK_REQUESTED"].includes(status)) return "cancelado";
  return "pendente";
}
