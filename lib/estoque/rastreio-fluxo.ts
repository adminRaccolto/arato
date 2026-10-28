// Rastreabilidade de um item: monta o caminho do produto (origens → depósitos → destinos) a partir das movimentações
// de estoque, para desenhar como fluxo (Sankey) e consolidar o saldo por depósito.
//
// - Transferência/remessa entre depósitos: a saída de um depósito é pareada com a entrada no outro (mesmo item,
//   quantidade e data; mesma referência TRF/Remessa ou gravadas juntas) e vira um elo depósito → depósito.
// - Entradas sem par: origem (fornecedor da NF, saldo anterior, ajustes, produção própria, entrada sem NF).
// - Saídas sem par: destino (consumo por ciclo/operação, abastecimento, perdas, devolução, outras saídas).
// - O que sobra em cada depósito vai para o nó "Saldo final" daquele depósito — o fluxo fecha.

export type MovRastreio = {
  id: string; tipo: string; quantidade: number; data: string; created_at: string;
  motivo: string | null; observacao?: string | null;
  deposito_id: string | null; deposito_nome?: string | null;
  nf_entrada_id?: string | null; emitente_nome?: string | null; nf_numero?: string | null;
  ciclo_descricao?: string | null; operacao?: string | null; romaneio_entrada_id?: string | null;
};
export type NoFluxo = { id: string; rotulo: string; tipo: "origem" | "deposito" | "destino" | "saldo" };
export type EloFluxo = { de: string; para: string; quantidade: number };
export type SaldoDeposito = { deposito_id: string; nome: string; anterior: number; entradas: number; saidas: number; final: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sinal = (m: MovRastreio) => m.tipo === "saida" ? -Math.abs(m.quantidade) : m.tipo === "entrada" ? Math.abs(m.quantidade) : m.quantidade;
const SEM_DEP = "__sem_deposito";
const refTransf = (m: MovRastreio) => {
  const t = `${m.motivo ?? ""} ${m.observacao ?? ""}`;
  return t.match(/\bTRF-\d+/)?.[0] ?? t.match(/\bRemessa NF \S+/i)?.[0] ?? t.match(/\bRetorno NF \S+/i)?.[0] ?? null;
};
const pareceTransferencia = (m: MovRastreio) => /transfer|remessa|retorno/i.test(`${m.motivo ?? ""} ${m.observacao ?? ""}`);

/** Pareia saídas e entradas de transferência entre depósitos. Devolve os pares e os ids usados. */
export function parearTransferencias(movs: MovRastreio[]): { pares: [MovRastreio, MovRastreio][]; usados: Set<string> } {
  const usados = new Set<string>();
  const pares: [MovRastreio, MovRastreio][] = [];
  const saidas = movs.filter(m => m.tipo === "saida" && pareceTransferencia(m) && !/^cancelamento/i.test(m.motivo ?? ""));
  const entradas = movs.filter(m => m.tipo === "entrada" && pareceTransferencia(m) && !/^cancelamento/i.test(m.motivo ?? ""));
  for (const s of saidas) {
    const ref = refTransf(s);
    const cand = entradas.filter(e => !usados.has(e.id) && Math.abs(Math.abs(e.quantidade) - Math.abs(s.quantidade)) < 0.0005 && e.data === s.data
      && (ref ? refTransf(e) === ref : Math.abs(new Date(e.created_at).getTime() - new Date(s.created_at).getTime()) < 10_000));
    const e = cand.sort((a, b) => Math.abs(new Date(a.created_at).getTime() - new Date(s.created_at).getTime()) - Math.abs(new Date(b.created_at).getTime() - new Date(s.created_at).getTime()))[0];
    if (!e) continue;
    usados.add(s.id); usados.add(e.id);
    pares.push([s, e]);
  }
  // Cancelamento de transferência: a saída e a entrada do estorno se anulam com o par original — trata como par também
  const canc = movs.filter(m => /^cancelamento/i.test(m.motivo ?? ""));
  for (const s of canc.filter(m => m.tipo === "saida")) {
    const e = canc.find(x => x.tipo === "entrada" && !usados.has(x.id) && refTransf(x) === refTransf(s) && Math.abs(Math.abs(x.quantidade) - Math.abs(s.quantidade)) < 0.0005);
    if (e) { usados.add(s.id); usados.add(e.id); pares.push([s, e]); }
  }
  return { pares, usados };
}

function origemDe(m: MovRastreio): { id: string; rotulo: string } {
  if (m.nf_entrada_id) return { id: `o:forn:${m.emitente_nome ?? "?"}`, rotulo: m.emitente_nome ? `NF — ${m.emitente_nome}` : "NF de entrada" };
  const mot = m.motivo ?? "";
  if (m.tipo === "ajuste" || ["ajuste_saldo", "inventario", "acerto_migracao_saldo", "estoque_inicial", "estorno_exclusao"].includes(mot)) return { id: "o:ajuste", rotulo: "Ajustes / saldo inicial" };
  if (m.romaneio_entrada_id) return { id: "o:producao", rotulo: "Produção própria (romaneio)" };
  if (pareceTransferencia(m)) return { id: "o:transf", rotulo: "Transferência recebida (sem par)" };
  return { id: "o:sem_nf", rotulo: "Entrada sem NF" };
}
function destinoDe(m: MovRastreio): { id: string; rotulo: string } {
  const mot = m.motivo ?? "";
  if (m.nf_entrada_id) return { id: `d:dev:${m.emitente_nome ?? "?"}`, rotulo: `Devolução — ${m.emitente_nome ?? "fornecedor"}` };
  if (m.tipo === "ajuste" || ["ajuste_saldo", "inventario", "acerto_migracao_saldo", "estoque_inicial", "estorno_exclusao"].includes(mot)) return { id: "d:ajuste", rotulo: "Ajustes (−)" };
  if (mot === "baixa_perda") return { id: "d:perda", rotulo: "Perdas / vencimento" };
  if (mot === "abastecimento") return { id: "d:abast", rotulo: "Abastecimento de máquinas" };
  if (m.ciclo_descricao) return { id: `d:ciclo:${m.ciclo_descricao}`, rotulo: `Consumo — ${m.ciclo_descricao}` };
  if (m.operacao || ["adubacao_base", "correcao_solo", "baixa_uso"].includes(mot)) return { id: `d:op:${m.operacao ?? mot}`, rotulo: `Consumo — ${(m.operacao ?? mot).replace(/_/g, " ")}` };
  if (pareceTransferencia(m)) return { id: "d:transf", rotulo: "Transferência enviada (sem par)" };
  return { id: "d:outras", rotulo: "Outras saídas" };
}

/**
 * Monta o fluxo do item no período. `anteriores` são as movimentações antes do início (viram "Saldo anterior" por
 * depósito); `movs` as do período.
 */
export function montarFluxo(movs: MovRastreio[], anteriores: MovRastreio[], nomeDeposito: (id: string | null) => string) {
  const nos = new Map<string, NoFluxo>();
  const elos = new Map<string, EloFluxo>();
  const saldos = new Map<string, SaldoDeposito>();
  const dep = (id: string | null) => {
    const k = id ?? SEM_DEP;
    if (!saldos.has(k)) saldos.set(k, { deposito_id: k, nome: id ? nomeDeposito(id) : "Sem depósito", anterior: 0, entradas: 0, saidas: 0, final: 0 });
    if (!nos.has(`dep:${k}`)) nos.set(`dep:${k}`, { id: `dep:${k}`, rotulo: saldos.get(k)!.nome, tipo: "deposito" });
    return k;
  };
  const no = (id: string, rotulo: string, tipo: NoFluxo["tipo"]) => { if (!nos.has(id)) nos.set(id, { id, rotulo, tipo }); return id; };
  const elo = (de: string, para: string, q: number) => {
    if (q <= 0.0005 || de === para) return;
    const k = `${de}→${para}`; const e = elos.get(k);
    if (e) e.quantidade += q; else elos.set(k, { de, para, quantidade: q });
  };

  for (const m of anteriores) { const k = dep(m.deposito_id); saldos.get(k)!.anterior += sinal(m); }
  for (const s of saldos.values()) if (s.anterior > 0.0005) elo(no(`o:anterior`, "Saldo anterior", "origem"), `dep:${s.deposito_id}`, s.anterior);

  const { pares, usados } = parearTransferencias(movs);
  for (const [s, e] of pares) {
    const a = dep(s.deposito_id), b = dep(e.deposito_id);
    saldos.get(a)!.saidas += Math.abs(s.quantidade); saldos.get(b)!.entradas += Math.abs(e.quantidade);
    elo(`dep:${a}`, `dep:${b}`, Math.abs(s.quantidade));   // o estorno faz o caminho de volta e o líquido zera abaixo
  }
  for (const m of movs) {
    if (usados.has(m.id)) continue;
    const k = dep(m.deposito_id);
    const q = sinal(m);
    if (q > 0) { saldos.get(k)!.entradas += q; const o = origemDe(m); elo(no(o.id, o.rotulo, "origem"), `dep:${k}`, q); }
    else if (q < 0) { saldos.get(k)!.saidas += -q; const d = destinoDe(m); elo(`dep:${k}`, no(d.id, d.rotulo, "destino"), -q); }
  }
  for (const s of saldos.values()) {
    s.anterior = r3(s.anterior); s.entradas = r3(s.entradas); s.saidas = r3(s.saidas);
    s.final = r3(s.anterior + s.entradas - s.saidas);
    if (s.final > 0.0005) elo(`dep:${s.deposito_id}`, no(`s:${s.deposito_id}`, `Saldo — ${s.nome}`, "saldo"), s.final);
  }
  // Transferência cancelada deixa ida e volta entre os mesmos depósitos: mostra só o líquido
  for (const e of [...elos.values()]) {
    const volta = elos.get(`${e.para}→${e.de}`);
    if (!volta || !e.de.startsWith("dep:") || !e.para.startsWith("dep:")) continue;
    const liq = e.quantidade - volta.quantidade;
    if (liq >= 0) { e.quantidade = liq; volta.quantidade = 0; } else { volta.quantidade = -liq; e.quantidade = 0; }
  }
  const elosFinais = [...elos.values()].filter(e => e.quantidade > 0.0005).map(e => ({ ...e, quantidade: r3(e.quantidade) }));
  const usadosNos = new Set(elosFinais.flatMap(e => [e.de, e.para]));
  return {
    nos: [...nos.values()].filter(n => usadosNos.has(n.id)),
    elos: elosFinais,
    saldos: [...saldos.values()].filter(s => Math.abs(s.anterior) + s.entradas + s.saidas > 0.0005),
  };
}
