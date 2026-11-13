// Avisos aos clientes (Gestão Arato → Avisos aos Clientes). Regras puras, testadas em avisos.test.ts.
//  - O aviso aparece em popup para os usuários dos clientes do público (todos ou os escolhidos), entre o início e o fim.
//  - Cada usuário dá ciência uma vez ("Li e estou ciente"); com ciência, não aparece mais para ele.
//  - Obrigatório: só fecha dando ciência. Não obrigatório: "Ver depois" esconde até o próximo login.
//  - O texto é simples: linha em branco separa parágrafos, linha começando com "- " vira item de lista, **texto** fica em negrito.

export type TipoAviso = "informativo" | "manutencao" | "importante";

export type Aviso = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: TipoAviso;
  publico: "todos" | "contas";
  conta_ids: string[] | null;
  inicio: string;           // ISO
  fim: string | null;       // ISO; sem fim = até desativar
  obrigatorio: boolean;
  botao_texto: string | null;
  botao_link: string | null; // caminho interno, ex. /fiscal
  ativo: boolean;
  created_at?: string;
};

export const TIPOS_AVISO: Record<TipoAviso, { rotulo: string; cor: string; fundo: string; icone: string }> = {
  informativo: { rotulo: "Informativo", cor: "#1A4870", fundo: "#D5E8F5", icone: "ℹ️" },
  manutencao:  { rotulo: "Manutenção / parada programada", cor: "#8A5A00", fundo: "#FEF3E2", icone: "🛠️" },
  importante:  { rotulo: "Importante", cor: "#A32D2D", fundo: "#FCEBEB", icone: "⚠️" },
};

export type StatusAviso = "no_ar" | "agendado" | "encerrado" | "desativado";
export const STATUS_AVISO: Record<StatusAviso, { rotulo: string; cor: string; fundo: string }> = {
  no_ar:      { rotulo: "No ar",      cor: "#166534", fundo: "#E8F5E9" },
  agendado:   { rotulo: "Agendado",   cor: "#0B2D50", fundo: "#D5E8F5" },
  encerrado:  { rotulo: "Encerrado",  cor: "#666666", fundo: "#F1EFE8" },
  desativado: { rotulo: "Desativado", cor: "#666666", fundo: "#F1EFE8" },
};

export function statusAviso(a: Pick<Aviso, "ativo" | "inicio" | "fim">, agora: Date = new Date()): StatusAviso {
  if (!a.ativo) return "desativado";
  const t = agora.getTime();
  if (new Date(a.inicio).getTime() > t) return "agendado";
  if (a.fim && new Date(a.fim).getTime() <= t) return "encerrado";
  return "no_ar";
}

/** O aviso é para algum dos clientes do usuário? */
export function avisoParaContas(a: Pick<Aviso, "publico" | "conta_ids">, contas: string[]): boolean {
  if (a.publico === "todos") return true;
  const alvo = new Set(a.conta_ids ?? []);
  return contas.some(c => alvo.has(c));
}

/** Ordem em que aparecem para o cliente: importante, manutenção, informativo; dentro do tipo, o mais antigo primeiro. */
const PESO: Record<TipoAviso, number> = { importante: 0, manutencao: 1, informativo: 2 };
export function ordenarParaExibir<T extends Pick<Aviso, "tipo" | "inicio">>(avisos: T[]): T[] {
  return [...avisos].sort((a, b) => PESO[a.tipo] - PESO[b.tipo] || a.inicio.localeCompare(b.inicio));
}

/** Avisos que o usuário ainda precisa ver: no ar, do público dele e sem ciência. */
export function avisosPendentes<T extends Aviso>(avisos: T[], contas: string[], cientes: Iterable<string>, agora: Date = new Date()): T[] {
  const ok = new Set(cientes);
  return ordenarParaExibir(avisos.filter(a => statusAviso(a, agora) === "no_ar" && avisoParaContas(a, contas) && !ok.has(a.id)));
}

// ── Texto ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Trecho = { texto: string; negrito: boolean };
export type Bloco = { tipo: "paragrafo"; linhas: Trecho[][] } | { tipo: "lista"; itens: Trecho[][] };

export function trechos(linha: string): Trecho[] {
  const out: Trecho[] = [];
  const partes = linha.split(/(\*\*[^*]+\*\*)/g);
  for (const p of partes) {
    if (!p) continue;
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    out.push(m ? { texto: m[1], negrito: true } : { texto: p, negrito: false });
  }
  return out;
}

export function blocosDoTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  for (const bruta of (texto ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const linha = bruta.trimEnd();
    if (!linha.trim()) { atual = null; continue; }
    const item = linha.match(/^\s*[-•*]\s+(.*)$/);
    if (item) {
      if (atual?.tipo !== "lista") { atual = { tipo: "lista", itens: [] }; blocos.push(atual); }
      atual.itens.push(trechos(item[1]));
    } else {
      if (atual?.tipo !== "paragrafo") { atual = { tipo: "paragrafo", linhas: [] }; blocos.push(atual); }
      atual.linhas.push(trechos(linha.trim()));
    }
  }
  return blocos;
}

/** Link do botão: só caminho interno do Arato (começa com "/"), sem "//" de outro site. */
export function linkInternoValido(link: string | null | undefined): boolean {
  const l = (link ?? "").trim();
  return /^\/(?!\/)[^\s]*$/.test(l);
}

/** Confere o aviso antes de salvar; devolve a mensagem de erro ou null. */
export function validarAviso(a: Partial<Aviso>): string | null {
  if (!a.titulo?.trim()) return "Informe o título do aviso.";
  if (a.titulo.trim().length > 120) return "Título muito longo (máximo 120 caracteres).";
  if (!a.mensagem?.trim()) return "Escreva a mensagem do aviso.";
  if (!a.tipo || !(a.tipo in TIPOS_AVISO)) return "Escolha o tipo do aviso.";
  if (!a.inicio || Number.isNaN(new Date(a.inicio).getTime())) return "Informe quando o aviso começa a aparecer.";
  if (a.fim && Number.isNaN(new Date(a.fim).getTime())) return "Data de fim inválida.";
  if (a.fim && new Date(a.fim).getTime() <= new Date(a.inicio).getTime()) return "O fim precisa ser depois do início.";
  if (a.publico === "contas" && !(a.conta_ids ?? []).length) return "Escolha ao menos um cliente, ou marque Todos os clientes.";
  if (a.botao_texto?.trim() && !linkInternoValido(a.botao_link)) return "O botão precisa de um endereço de tela do Arato começando com / (ex.: /fiscal).";
  if (a.botao_link?.trim() && !a.botao_texto?.trim()) return "Informe o texto do botão, ou deixe o endereço em branco.";
  return null;
}
