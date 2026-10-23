// Liga cada achado da Saúde dos dados ao Monitor de Auditoria: quais registros contam a história do problema
// (registros) e quem provavelmente o gerou (responsavel). É o "provável": quando várias ações mexem no mesmo
// registro, a tela mostra a linha do tempo inteira (historico) e a equipe decide.
import type { Achado, Base } from "./regras";

export type EventoBase = { id: string; tabela: string; registro_id: string | null; acao: string; usuario_app: string | null; created_at: string;
  campos_alterados: string[] | null; antes_status?: string | null; depois_status?: string | null; depois_origem?: string | null };
export type Responsavel = { quem: string; quando: string | null; acao: string };

const SISTEMA = "Sistema (rotina automática)";
const ehUuid = (s: string | null | undefined) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
const nome = (u: string | null | undefined) => (u && !ehUuid(u) && !/rotina do sistema/i.test(u) ? u : null);

/** Registros cuja auditoria explica o achado (ids de NF, NFS-e ou títulos). */
export function registrosDoAchado(a: Achado, b: Base): string[] {
  switch (a.regra) {
    case "nf_sem_titulo": case "nfse_sem_titulo": case "guia_como_nfse": case "titulo_em_nf_pendente":
      return a.regra === "titulo_em_nf_pendente" ? [a.chave, ...(b.titulos.filter(t => t.id === a.chave).map(t => t.nf_entrada_id ?? "").filter(Boolean))] : [a.chave];
    case "nf_processada_2x": case "nf_chave_repetida":
      return b.nfs.filter(n => n.chave_acesso === a.chave).map(n => n.id);
    case "titulo_duplicado_nf": {
      const [tabela, nf, valor, venc] = a.chave.split("|");
      return b.titulos.filter(t => t.tabela === tabela && t.nf_entrada_id === nf && Number(t.valor).toFixed(2) === valor && (t.data_vencimento ?? "") === venc).map(t => t.id);
    }
    case "baixa_acima_valor": case "status_inconsistente":
      return [a.chave];
    case "baixa_perdida": case "pago_sem_titulo": case "nf_pendente_ja_paga": case "liberacao_excluida": {
      const vivos = [a.detalhe.titulo_em_aberto_id].filter((x): x is string => typeof x === "string");
      return vivos;
    }
    default: return [];
  }
}

/** Quem provavelmente gerou o achado, a partir dos eventos de auditoria dos registros (já filtrados para ele). */
export function responsavelDoAchado(a: Achado, b: Base, eventos: EventoBase[]): Responsavel | null {
  const ord = [...eventos].sort((x, y) => x.created_at.localeCompare(y.created_at));
  const ultimo = (f: (e: EventoBase) => boolean) => [...ord].reverse().find(f);
  const det = a.detalhe as Record<string, unknown>;
  switch (a.regra) {
    case "nf_sem_titulo": {
      const exc = det.titulo_excluido as { quem?: string; quando?: string } | null;
      if (exc?.quando) return { quem: nome(exc.quem) ?? SISTEMA, quando: exc.quando, acao: "Excluiu o título da NF processada" };
      const p = ultimo(e => e.depois_status === "processada" && e.antes_status !== "processada");
      return { quem: nome(p?.usuario_app) ?? nome(det.processado_por as string) ?? SISTEMA, quando: p?.created_at ?? null, acao: "Processou a NF sem gerar título" };
    }
    case "nfse_sem_titulo": case "guia_como_nfse": {
      const p = ultimo(e => e.depois_status === "processada" && e.antes_status !== "processada");
      return { quem: nome(p?.usuario_app) ?? nome(det.processado_por as string) ?? SISTEMA, quando: p?.created_at ?? null,
        acao: a.regra === "guia_como_nfse" ? "Lançou guia como NFS-e" : "Processou a NFS-e sem título no CP" };
    }
    case "baixa_perdida": case "pago_sem_titulo": case "nf_pendente_ja_paga": case "liberacao_excluida":
      return { quem: nome(det.excluido_por as string) ?? SISTEMA, quando: (det.excluido_em as string) ?? null,
        acao: a.regra === "liberacao_excluida" ? "Excluiu liberação já recebida" : "Excluiu título já pago" };
    case "titulo_em_nf_pendente": {
      const e = ultimo(x => x.tabela === "nf_entradas" && x.antes_status === "processada" && x.depois_status === "pendente");
      return { quem: nome(e?.usuario_app) ?? SISTEMA, quando: e?.created_at ?? null, acao: "Estornou a NF e o título ficou" };
    }
    case "nf_processada_2x": {
      const procs = ord.filter(e => e.tabela === "nf_entradas" && e.depois_status === "processada" && e.antes_status !== "processada");
      const e = procs.at(-1);
      const proc = b.nfs.filter(n => n.chave_acesso === a.chave && n.status === "processada").map(n => n.processado_por).filter(Boolean);
      return { quem: nome(e?.usuario_app) ?? nome(proc.at(-1)) ?? SISTEMA, quando: e?.created_at ?? null, acao: "Processou a mesma NF de novo" };
    }
    case "nf_chave_repetida": {
      const manual = ord.find(e => e.acao === "INSERT" && e.depois_origem && e.depois_origem !== "sieg" && e.depois_origem !== "api");
      return manual ? { quem: nome(manual.usuario_app) ?? SISTEMA, quando: manual.created_at, acao: "Lançou NF que já existia" }
        : { quem: "Sistema (SIEG)", quando: ord[0]?.created_at ?? null, acao: "NF importada mais de uma vez" };
    }
    case "titulo_duplicado_nf": {
      const ins = ord.filter(e => e.acao === "INSERT");
      const e = ins.at(-1);
      return { quem: nome(e?.usuario_app) ?? SISTEMA, quando: e?.created_at ?? null, acao: "Gerou título em duplicidade" };
    }
    case "baixa_acima_valor": case "status_inconsistente": {
      const e = ultimo(x => (x.campos_alterados ?? []).some(c => c === "valor_pago" || c === "status"));
      return { quem: nome(e?.usuario_app) ?? SISTEMA, quando: e?.created_at ?? null, acao: a.regra === "baixa_acima_valor" ? "Baixou acima do valor" : "Baixa gravada com status errado" };
    }
    case "estoque_negativo": {
      const usuarios = (det.usuarios as string[] | undefined) ?? [];
      return usuarios.length ? { quem: usuarios[0], quando: (det.ultima_saida as string) ?? null, acao: "Lançou saída sem saldo nessa fazenda" } : { quem: "Não registrado", quando: null, acao: "Saída sem saldo nessa fazenda" };
    }
    default: return null;
  }
}
