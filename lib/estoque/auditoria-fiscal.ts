// Auditor de estoque de insumos: estoque FISCAL (pelas NFs) × estoque FÍSICO (saldo do sistema, soma das movimentações),
// por fazenda (IE) e item, com a diferença explicada por categoria de movimento sem documento fiscal.
//
// Fiscal = NFs de entrada processadas (itens ligados ao cadastro) + NF de transferência entre fazendas emitida (entra no
//          destino, sai da origem) − devolução de compra. Remessa/retorno de armazém não muda o fiscal (o produto continua
//          do produtor) — NF de retorno/remessa recebida não entra.
// Físico = soma das movimentações de estoque (entrada +, saída −, ajuste com sinal).
// Diferença (físico − fiscal) = soma das categorias abaixo; o que sobra sem explicação é "não explicado" (alerta).

export const CFOP_FORA_DO_FISCAL = new Set([
  // retorno de armazenagem/depósito/industrialização e remessas recebidas para guarda — não são aquisição
  "5906", "6906", "5907", "6907", "5902", "6902", "5916", "6916", "5905", "6905", "5934", "6934",
  "1906", "2906", "1907", "2907", "1902", "2902", "1916", "2916", "1905", "2905", "1934", "2934",
]);

export type NfItemAud = {
  nf_entrada_id: string; fazenda_id: string; insumo_id: string; quantidade: number;
  tipo_apropiacao: string | null; cfop: string | null;
};
export type MovAud = {
  fazenda_id: string; insumo_id: string; tipo: string; quantidade: number; motivo: string | null;
  nf_entrada_id: string | null; nota_propria_externa_id?: string | null; romaneio_entrada_id?: string | null;
  operacao?: string | null; ciclo_id?: string | null;
};
export type TransfItemAud = { numero: string; status: string; com_nf: boolean; fazenda_origem_id: string; fazenda_destino_id: string; insumo_id: string; quantidade: number };

export const CATEGORIAS = {
  consumo: "Consumo em operações",
  ajuste: "Ajustes / inventário / saldo inicial",
  apropriacao_direta: "Apropriação direta (NF sem estoque)",
  nf_divergente: "NF × estoque não batem",
  entrada_sem_nf: "Entradas sem NF",
  perda: "Perdas / vencimento",
  transferencia_sem_nf: "Transferência sem NF",
  remessa: "Remessa / retorno de armazém",
} as const;
export type Categoria = keyof typeof CATEGORIAS;

export type LinhaAud = {
  fazenda_id: string; insumo_id: string;
  fiscal: number; fisico: number; diferenca: number;
  fiscal_nf: number; fiscal_transf: number; fiscal_devolucao: number;
  categorias: Record<Categoria, number>;
  nao_explicado: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const trfDoMotivo = (m: string | null) => m?.match(/\bTRF-\d+/)?.[0] ?? null;

/** Classifica uma movimentação (o que ela é, olhando do fiscal). */
export function classificarMov(m: MovAud, nfsForaDoFiscal: Set<string>): "nf" | "devolucao" | "nota_propria" | "transferencia" | Categoria {
  const motivo = (m.motivo ?? "").trim();
  if (m.nf_entrada_id) {
    if (nfsForaDoFiscal.has(m.nf_entrada_id)) return "remessa";
    return m.tipo === "saida" ? "devolucao" : "nf";
  }
  if (m.nota_propria_externa_id) return "nota_propria";
  if (trfDoMotivo(motivo)) return "transferencia";
  if (/^(remessa|retorno)\b/i.test(motivo)) return "remessa";
  if (m.tipo === "ajuste" || ["ajuste_saldo", "inventario", "acerto_migracao_saldo", "estoque_inicial", "estorno_exclusao"].includes(motivo)) return "ajuste";
  if (motivo === "baixa_perda") return "perda";
  if (motivo === "transferencia") return "transferencia_sem_nf";   // entre depósitos, sem NF
  if (m.tipo === "saida") return "consumo";
  return "entrada_sem_nf";
}

const sinal = (m: MovAud) => m.tipo === "saida" ? -Math.abs(m.quantidade) : m.tipo === "entrada" ? Math.abs(m.quantidade) : m.quantidade;

export function auditarFiscalFisico(nfItens: NfItemAud[], movs: MovAud[], transf: TransfItemAud[]): LinhaAud[] {
  const linhas = new Map<string, LinhaAud>();
  const linha = (fazenda_id: string, insumo_id: string) => {
    const k = `${fazenda_id}|${insumo_id}`;
    let l = linhas.get(k);
    if (!l) {
      l = { fazenda_id, insumo_id, fiscal: 0, fisico: 0, diferenca: 0, fiscal_nf: 0, fiscal_transf: 0, fiscal_devolucao: 0,
        categorias: Object.fromEntries(Object.keys(CATEGORIAS).map(c => [c, 0])) as Record<Categoria, number>, nao_explicado: 0 };
      linhas.set(k, l);
    }
    return l;
  };

  // NFs inteiras fora do fiscal (retorno/remessa recebida): pelo CFOP de algum item
  const nfsForaDoFiscal = new Set(nfItens.filter(i => CFOP_FORA_DO_FISCAL.has(String(i.cfop ?? "").replace(/\D/g, ""))).map(i => i.nf_entrada_id));

  // Fiscal: NFs de entrada. Item com apropriação que não é estoque entrou na NF e não no estoque.
  const nfNoEstoque = new Map<string, number>();     // fazenda|insumo → quantidade de NF que deveria estar no estoque
  for (const i of nfItens) {
    if (nfsForaDoFiscal.has(i.nf_entrada_id)) continue;
    const l = linha(i.fazenda_id, i.insumo_id);
    l.fiscal_nf += i.quantidade;
    if ((i.tipo_apropiacao ?? "estoque") === "estoque") {
      const k = `${i.fazenda_id}|${i.insumo_id}`; nfNoEstoque.set(k, (nfNoEstoque.get(k) ?? 0) + i.quantidade);
    } else l.categorias.apropriacao_direta -= i.quantidade;
  }
  // Fiscal: transferência entre fazendas com NF emitida
  const trfComNf = new Set<string>();
  for (const t of transf) {
    if (t.status !== "emitida" || !t.com_nf) continue;
    trfComNf.add(t.numero);
    linha(t.fazenda_origem_id, t.insumo_id).fiscal_transf -= t.quantidade;
    linha(t.fazenda_destino_id, t.insumo_id).fiscal_transf += t.quantidade;
  }

  // Físico e explicação da diferença
  const movNf = new Map<string, number>();
  const movTransfComNf = new Map<string, number>();
  for (const m of movs) {
    const l = linha(m.fazenda_id, m.insumo_id);
    const q = sinal(m);
    l.fisico += q;
    const c = classificarMov(m, nfsForaDoFiscal);
    const k = `${m.fazenda_id}|${m.insumo_id}`;
    if (c === "nf") movNf.set(k, (movNf.get(k) ?? 0) + q);
    else if (c === "devolucao" || c === "nota_propria") l.fiscal_devolucao += q;   // documento fiscal: entra no fiscal como está
    else if (c === "transferencia") {
      const trf = trfDoMotivo(m.motivo);
      if (trf && trfComNf.has(trf)) movTransfComNf.set(k, (movTransfComNf.get(k) ?? 0) + q);
      else l.categorias.transferencia_sem_nf += q;
    } else l.categorias[c] += q;
  }

  for (const [k, l] of linhas) {
    // NF processada que não gerou (ou gerou em dobro) o movimento de estoque
    l.categorias.nf_divergente += (movNf.get(k) ?? 0) - (nfNoEstoque.get(k) ?? 0);
    // transferência com NF: movimento do estoque × NF emitida (quantidade diferente aparece aqui)
    l.categorias.nf_divergente += (movTransfComNf.get(k) ?? 0) - l.fiscal_transf;
    l.fiscal = r3(l.fiscal_nf + l.fiscal_transf + l.fiscal_devolucao);
    l.fisico = r3(l.fisico);
    l.diferenca = r3(l.fisico - l.fiscal);
    for (const c of Object.keys(l.categorias) as Categoria[]) l.categorias[c] = r3(l.categorias[c]);
    const explicado = Object.values(l.categorias).reduce((a, b) => a + b, 0);
    l.nao_explicado = r3(l.diferenca - explicado);
  }
  return [...linhas.values()].filter(l => Math.abs(l.fiscal) > 0.0005 || Math.abs(l.fisico) > 0.0005 || Object.values(l.categorias).some(v => Math.abs(v) > 0.0005));
}

/** Situação da linha para o semáforo: ok (só consumo/ajustes explicam), atencao (entrada sem NF / transferência sem NF / perda), erro (NF × estoque não batem ou físico negativo). */
export function situacaoLinha(l: LinhaAud): "ok" | "atencao" | "erro" {
  if (Math.abs(l.categorias.nf_divergente) > 0.0005 || Math.abs(l.nao_explicado) > 0.0005 || l.fisico < -0.0005) return "erro";
  if (Math.abs(l.categorias.entrada_sem_nf) > 0.0005 || Math.abs(l.categorias.transferencia_sem_nf) > 0.0005 || l.fisico > l.fiscal + 0.0005) return "atencao";
  return "ok";
}
