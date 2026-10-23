// Conjunto de transporte = um cavalo (tração) + até 3 implementos (carretas/reboques), em ordem.
// Regras puras usadas pelo cadastro (Fretes e Transporte → Transportadoras e Veículos → Conjuntos), pela escolha
// do veículo no CT-e/MDF-e e pela montagem do MDF-e (veicReboque).

export type CategoriaVeiculo = "cavalo" | "implemento";

export interface VeiculoConjunto {
  id: string;
  placa: string;
  categoria?: CategoriaVeiculo | null;
  tipo?: string | null;
  tipo_carroceria?: string | null;
  num_eixos?: number | null;
  ativo?: boolean | null;
}

export interface ConjuntoVeiculos {
  id: string;
  nome?: string | null;
  cavalo_id: string;
  implemento_ids: string[];
  ativo: boolean;
}

export const MAX_IMPLEMENTOS = 3; // limite de veicReboque no MDF-e

export const categoriaDe = (v: Pick<VeiculoConjunto, "categoria"> | undefined | null): CategoriaVeiculo =>
  v?.categoria === "implemento" ? "implemento" : "cavalo";

/** "ABC1D23 + DEF4G56 + GHI7J89" — placas na ordem do engate. */
export function placasDoConjunto(c: Pick<ConjuntoVeiculos, "cavalo_id" | "implemento_ids">, veiculos: VeiculoConjunto[]): string {
  const placa = (id: string) => veiculos.find(v => v.id === id)?.placa ?? "?";
  return [c.cavalo_id, ...c.implemento_ids].map(placa).join(" + ");
}

/** Motivo para não salvar o conjunto, ou null se estiver certo. */
export function validarConjunto(c: Omit<ConjuntoVeiculos, "id"> & { id?: string }, outros: ConjuntoVeiculos[], veiculos: VeiculoConjunto[]): string | null {
  const cavalo = veiculos.find(v => v.id === c.cavalo_id);
  if (!cavalo) return "Escolha o cavalo do conjunto.";
  if (categoriaDe(cavalo) !== "cavalo") return `${cavalo.placa} está cadastrado como implemento — o conjunto precisa de um cavalo.`;
  if (c.implemento_ids.length > MAX_IMPLEMENTOS) return `No máximo ${MAX_IMPLEMENTOS} implementos por conjunto (limite do MDF-e).`;
  if (new Set(c.implemento_ids).size !== c.implemento_ids.length) return "O mesmo implemento aparece duas vezes no conjunto.";
  for (const id of c.implemento_ids) {
    const imp = veiculos.find(v => v.id === id);
    if (!imp) return "Implemento não encontrado no cadastro.";
    if (categoriaDe(imp) !== "implemento") return `${imp.placa} está cadastrado como cavalo — só implementos podem ser engatados.`;
  }
  if (!c.ativo) return null;
  for (const o of outros) {
    if (!o.ativo || o.id === c.id) continue;
    if (o.cavalo_id === c.cavalo_id) return `O cavalo ${cavalo.placa} já está em outro conjunto ativo (${placasDoConjunto(o, veiculos)}). Desmonte-o primeiro.`;
    const repetido = c.implemento_ids.find(id => o.implemento_ids.includes(id));
    if (repetido) return `O implemento ${veiculos.find(v => v.id === repetido)?.placa} já está engatado em outro conjunto ativo (${placasDoConjunto(o, veiculos)}). Desmonte-o primeiro.`;
  }
  return null;
}

export type SelecaoVeiculo = { veiculo_id: string; conjunto_id: string | null; implemento_ids: string[] };
export type OpcaoVeiculo = { valor: string; rotulo: string; grupo: "conjunto" | "veiculo" };

/**
 * Opções do seletor de veículo dos documentos de transporte: conjuntos ativos e, à parte, os cavalos ativos que
 * não estão em conjunto nenhum (caminhão simples, toco, truck). Implemento solto nunca aparece — não roda sozinho.
 */
export function opcoesVeiculoDocumento(conjuntos: ConjuntoVeiculos[], veiculos: VeiculoConjunto[]): OpcaoVeiculo[] {
  const ativos = conjuntos.filter(c => c.ativo && veiculos.some(v => v.id === c.cavalo_id));
  const emConjunto = new Set(ativos.map(c => c.cavalo_id));
  return [
    ...ativos.map(c => ({ valor: `c:${c.id}`, rotulo: (c.nome ? `${c.nome} — ` : "") + placasDoConjunto(c, veiculos), grupo: "conjunto" as const })),
    ...veiculos.filter(v => v.ativo !== false && categoriaDe(v) === "cavalo" && !emConjunto.has(v.id))
      .map(v => ({ valor: `v:${v.id}`, rotulo: `${v.placa} — ${v.tipo || "caminhão"} (sem implemento)`, grupo: "veiculo" as const })),
  ];
}

/** Valor do seletor a partir do que o documento já guarda (reabrir CT-e/MDF-e). */
export function valorSelecao(veiculoId?: string | null, conjuntoId?: string | null): string {
  return conjuntoId ? `c:${conjuntoId}` : veiculoId ? `v:${veiculoId}` : "";
}

/** O que o documento grava a partir do valor escolhido no seletor. */
export function resolverSelecao(valor: string, conjuntos: ConjuntoVeiculos[]): SelecaoVeiculo {
  if (valor.startsWith("c:")) {
    const c = conjuntos.find(x => x.id === valor.slice(2));
    if (c) return { veiculo_id: c.cavalo_id, conjunto_id: c.id, implemento_ids: [...c.implemento_ids] };
  }
  if (valor.startsWith("v:")) return { veiculo_id: valor.slice(2), conjunto_id: null, implemento_ids: [] };
  return { veiculo_id: "", conjunto_id: null, implemento_ids: [] };
}

/** tpCar do MDF-e (00 não aplicável, 01 aberta, 02 fechada/baú, 03 granelera, 04 porta-container, 05 sider). */
export function tpCarPorCarroceria(carroceria?: string | null): string {
  const c = (carroceria ?? "").toLowerCase();
  if (c.startsWith("graneleir")) return "03";
  if (c.startsWith("baú") || c.startsWith("bau") || c.startsWith("frigor")) return "02";
  if (c.startsWith("sider")) return "05";
  if (c.startsWith("plataforma") || c.startsWith("basculante")) return "01";
  return "00";
}

/** tpRod do MDF-e (01 truck, 02 toco, 03 cavalo mecânico, 05 utilitário, 06 outros). Com carreta engatada é sempre 03. */
export function tpRodDoVeiculo(tipo: string | null | undefined, comImplemento: boolean): string {
  if (comImplemento) return "03";
  const t = (tipo ?? "").toLowerCase();
  if (t.startsWith("toco")) return "02";
  if (t.startsWith("truck") || t.startsWith("bitruck")) return "01";
  if (t.startsWith("utilit")) return "05";
  if (t.startsWith("outro")) return "06";
  return "01";
}
