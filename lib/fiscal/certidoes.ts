// Certidões (CND) dos produtores e certificado digital A1 — regras puras de vencimento usadas pela tela
// Fiscal → Certidões (CND) e pelo Quadro de Avisos da tela inicial.

export type TipoCertidao = "federal" | "estadual" | "municipal" | "trabalhista" | "fgts" | "ambiental" | "outra";

export const TIPOS_CERTIDAO: { id: TipoCertidao; label: string; orgao: string }[] = [
  { id: "federal",     label: "CND Federal",         orgao: "Receita Federal / PGFN" },
  { id: "estadual",    label: "CND Estadual",        orgao: "SEFAZ" },
  { id: "municipal",   label: "CND Municipal",       orgao: "Prefeitura" },
  { id: "trabalhista", label: "CNDT (Trabalhista)",  orgao: "TST" },
  { id: "fgts",        label: "CRF (FGTS)",          orgao: "Caixa" },
  { id: "ambiental",   label: "Certidão Ambiental",  orgao: "IBAMA / SEMA" },
  { id: "outra",       label: "Outra certidão",      orgao: "" },
];
export const rotuloTipoCertidao = (t: string) => TIPOS_CERTIDAO.find(x => x.id === t)?.label ?? t;

export type Certidao = {
  id: string; conta_id: string; produtor_id: string; tipo: TipoCertidao; orgao?: string | null; numero?: string | null;
  codigo_autenticacao?: string | null; data_emissao?: string | null; data_validade: string;
  positiva_efeito_negativa?: boolean | null; observacao?: string | null;
};

export type SituacaoVenc = "vencida" | "vence_15" | "vence_30" | "em_dia";
export const ANTECEDENCIA_AVISO = 30;

/** Dias de hoje até a data (datas ISO yyyy-mm-dd, sem fuso). Negativo = já venceu. */
export function diasAteData(data: string, hoje: string): number {
  const d = (s: string) => { const [y, m, dd] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.round((d(data) - d(hoje)) / 86400000);
}

export function situacaoVenc(data: string, hoje: string): SituacaoVenc {
  const dias = diasAteData(data, hoje);
  return dias < 0 ? "vencida" : dias <= 15 ? "vence_15" : dias <= ANTECEDENCIA_AVISO ? "vence_30" : "em_dia";
}

export const ROTULO_SITUACAO: Record<SituacaoVenc, string> = {
  vencida: "Vencida", vence_15: "Vence em até 15 dias", vence_30: "Vence em até 30 dias", em_dia: "Em dia",
};

/** Certidão vigente de cada produtor × tipo: a de validade mais longa (renovar = cadastrar a nova). */
export function certidoesVigentes(certidoes: Certidao[]): Certidao[] {
  const m = new Map<string, Certidao>();
  for (const c of certidoes) {
    const k = c.produtor_id + "|" + c.tipo;
    const atual = m.get(k);
    if (!atual || c.data_validade > atual.data_validade) m.set(k, c);
  }
  return [...m.values()];
}

/** Certidões antigas (substituídas por outra mais nova do mesmo produtor e tipo). */
export function ehSubstituida(c: Certidao, todas: Certidao[]): boolean {
  return todas.some(o => o.id !== c.id && o.produtor_id === c.produtor_id && o.tipo === c.tipo && o.data_validade > c.data_validade);
}

export type Aviso = {
  id: string; tipo: "cnd" | "certificado"; produtorId: string | null; produtor: string; titulo: string;
  validade: string; dias: number; situacao: SituacaoVenc;
};

export type CertificadoA1 = { produtor_id?: string | null; produtor_nome?: string | null; cpf_cnpj?: string | null; data_vencimento?: string | null };

/** Avisos de CND e certificado A1 vencidos ou vencendo em até 30 dias, do mais urgente para o menos. */
export function montarAvisos(
  certidoes: Certidao[], certificados: CertificadoA1[], nomeProdutor: (id: string) => string, hoje: string,
): { avisos: Aviso[]; emDia: number } {
  const avisos: Aviso[] = [];
  let emDia = 0;
  for (const c of certidoesVigentes(certidoes)) {
    const situacao = situacaoVenc(c.data_validade, hoje);
    if (situacao === "em_dia") { emDia++; continue; }
    avisos.push({ id: "cnd-" + c.id, tipo: "cnd", produtorId: c.produtor_id, produtor: nomeProdutor(c.produtor_id),
      titulo: rotuloTipoCertidao(c.tipo), validade: c.data_validade, dias: diasAteData(c.data_validade, hoje), situacao });
  }
  const vistos = new Set<string>();
  for (const a of certificados) {
    if (!a.data_vencimento) continue;
    const chave = a.produtor_id || (a.cpf_cnpj ?? "").replace(/\D/g, "");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const situacao = situacaoVenc(a.data_vencimento, hoje);
    if (situacao === "em_dia") { emDia++; continue; }
    avisos.push({ id: "cert-" + chave, tipo: "certificado", produtorId: a.produtor_id ?? null,
      produtor: (a.produtor_id ? nomeProdutor(a.produtor_id) : "") || a.produtor_nome || a.cpf_cnpj || "Certificado",
      titulo: "Certificado digital A1", validade: a.data_vencimento.slice(0, 10), dias: diasAteData(a.data_vencimento, hoje), situacao });
  }
  avisos.sort((a, b) => a.dias - b.dias || a.produtor.localeCompare(b.produtor));
  return { avisos, emDia };
}

/** Produtores que não têm nenhuma CND Federal cadastrada (a que vai na NF-e). */
export function semCndFederal(produtorIds: string[], certidoes: Certidao[]): string[] {
  const com = new Set(certidoes.filter(c => c.tipo === "federal").map(c => c.produtor_id));
  return produtorIds.filter(id => !com.has(id));
}

export function textoDias(dias: number): string {
  if (dias < 0) return `venceu há ${-dias} dia${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}
