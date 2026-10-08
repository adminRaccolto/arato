"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Documentos Fiscais — NF de Produtos + NF de Serviços + CT-e unificados
// numa tela só, ordenados por data, filtro por tipo (Seções 321/322 da
// migration, trigger-sync de nf_entradas + nf_servicos + ctes em
// rel_documentos_fiscais). Promovida de piloto em 01/10/2026.
//
// IMPORTANTE — o que esta tela É e o que NÃO é (02/10/2026, esclarecido
// pelo dono depois de uma mensagem que sugeria o contrário): esta tela é
// "Notas de Terceiro" — documentos emitidos CONTRA o produtor/empresa
// (NF/NFS recebidas de fornecedores, CT-e de frete contratado). NÃO é
// onde o produtor/empresa EMITE seus próprios documentos — isso continua
// nas telas de origem de cada tipo (Faturamento/NF-e de Saída, Fretes e
// Transporte → CT-e para emissão própria). O CT-e que aparece aqui é
// sempre VISUALIZAÇÃO (somente leitura) do que já foi emitido/recebido —
// editar ou emitir CT-e continua exclusivamente em Fretes e Transporte.
//
// Processamento de NF/NFS acontece via MODAL dentro desta mesma tela, sem
// redirecionar: "+ Nova NF de Produtos"/"+ Nova NF de Serviço" ou clicar
// numa linha abre um POPUP de detalhe + ações (mesmo padrão do popover de
// Contas a Pagar/Receber) — um dos botões do popup é que abre o modal de
// edição de verdade (ModalNf / ModalNfServico). CT-e nunca abre modal de
// edição — o popup já É a visualização completa.
//
// As 4 lacunas da Fase 2 (devolução, reclassificação, remessa logística e
// ações em lote) foram todas fechadas entre 01/10 e 02/10/2026 — ver
// histórico no CLAUDE.md.
//
// Ações em lote (seleção por checkbox, restrita a linhas de tipo NF): Ver
// condições de habilitação iguais à tela antiga — só NFs pendentes entram
// no "Processar em Lote"; qualquer seleção permite Imprimir.
// ═══════════════════════════════════════════════════════════════════════════
import InputData from "../../../components/InputData";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";
import ModalNfServico from "../../../components/fiscal/ModalNfServico";
import ModalNf from "../../../components/fiscal/ModalNf";
import ModalProcessarLote from "../../../components/fiscal/ModalProcessarLote";
import SelectBusca from "../../../components/SelectBusca";
import { listarOperacoesGerenciaisAtivasDaConta, listarCentrosCustoGeralDaConta } from "../../../lib/db";
import type { OperacaoGerencial, CentroCusto } from "../../../lib/supabase";

type RelDocFiscal = {
  id: string;
  origem_tabela: string;
  tipo_doc: "NF" | "NFS" | "CTE";
  fazenda_id: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  data_doc: string | null;
  participante_nome: string | null;
  participante_cnpj: string | null;
  valor_total: number | null;
  status_origem: string | null;
  status_normalizado: string | null;
  cfop: string | null;
  natureza_operacao: string | null;
  observacao: string | null;
  // Seção 322 — só populado pra NF de Produtos (nf_entradas); NFS/CT-e ficam null
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  data_entrada: string | null;
  tipo_entrada: string | null;
  origem_doc: string | null;
  duplicatas_xml: { numero: string; data_vencimento: string; valor: number }[] | null;
  processado_por: string | null;
};

const TIPO_ENTRADA_META: Record<string, { bg: string; cl: string; label: string }> = {
  consumo:          { bg: "#F3E8FF", cl: "#6B21A8", label: "Consumo"       },
  insumos:          { bg: "#E8E8E8", cl: "#0D0D0D", label: "Insumos"       },
  combustivel:      { bg: "#FFF0E0", cl: "#7C3A00", label: "Combustível"   },
  pecas:            { bg: "#E0F0FF", cl: "#0A4B8C", label: "Peças / Manut." },
  custo_direto:     { bg: "#E8F5E9", cl: "#1A6B3C", label: "Aprop. Direta" },
  vef:              { bg: "#FAEEDA", cl: "#633806", label: "VEF"            },
  remessa:          { bg: "#E6F1FB", cl: "#0C447C", label: "Remessa"        },
  devolucao_compra: { bg: "#FCEBEB", cl: "#791F1F", label: "Devolução"      },
};
const ORIGEM_DOC_META: Record<string, string> = { manual: "Manual", xml: "XML", sieg: "Sieg", leitor: "Leitor" };

// Detalhe real da NF — buscado sob demanda (lazy, só ao abrir o popover de
// uma linha), porque rel_documentos_fiscais não carrega esses campos
// específicos de nf_entradas (seriam só pra 1/3 dos tipos de documento).
type NfDetalhe = {
  id: string;
  status: string;
  tipo_entrada: string | null;
  origem: string | null;
  cnpj_destino: string | null;
  chave_acesso: string | null;
  manifestacao_tipo: number | null;
  operacao_gerencial_id: string | null;
  centro_custo_id: string | null;
};

// Detalhe do CT-e — mesmo princípio: lazy, só ao abrir o popover. CT-e
// aqui é sempre visualização; a tela não tem (nem terá) edição própria.
type CteDetalhe = {
  id: string;
  remetente_nome: string | null;
  destinatario_nome: string | null;
  municipio_origem: string | null;
  uf_origem: string | null;
  municipio_destino: string | null;
  uf_destino: string | null;
  veiculo_placa: string | null;
  motorista_nome: string | null;
  peso_bruto_kg: number | null;
  valor_frete: number | null;
};

const MAN_CFG = [
  { tipo: 0, label: "Ciência",       cor: "#444444", bg: "#F2F2F2", status: "ciencia",        justObrig: false },
  { tipo: 1, label: "Confirmar",     cor: "#16A34A", bg: "#DCFCE7", status: "confirmada",      justObrig: false },
  { tipo: 2, label: "Desconhecer",   cor: "#C9921B", bg: "#FBF3E0", status: "desconhecimento", justObrig: true  },
  { tipo: 3, label: "Não Realizada", cor: "#E24B4A", bg: "#FFF0F0", status: "nao_realizada",   justObrig: true  },
] as const;
type ManStatus = "pendente" | "ciencia" | "confirmada" | "desconhecimento" | "nao_realizada";
const MAN_ST: Record<ManStatus, { label: string; short: string; cor: string; bg: string }> = {
  pendente:        { label: "Pendente",        short: "Pend.", cor: "#888",    bg: "#F3F4F6" },
  ciencia:         { label: "Ciência",         short: "Ci.",   cor: "#444444", bg: "#F2F2F2" },
  confirmada:      { label: "Confirmada",      short: "Conf.", cor: "#16A34A", bg: "#DCFCE7" },
  desconhecimento: { label: "Desconhecimento", short: "Desc.", cor: "#C9921B", bg: "#FBF3E0" },
  nao_realizada:   { label: "Não Realizada",   short: "N.R.",  cor: "#E24B4A", bg: "#FFF0F0" },
};

const TIPO_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "NF",  label: "NF de Produtos",  bg: "#E6F1FB", color: "#0C447C" },
  { v: "NFS", label: "NF de Serviços",  bg: "#F5F3FF", color: "#5B21B6" },
  { v: "CTE", label: "CT-e",            bg: "#FBF3E0", color: "#7A5200" },
];
// Rótulo curto pra coluna Tipo do grid — o nome completo (TIPO_OPCOES.label)
// fica só nos filtros/cards, onde há espaço de sobra.
const TIPO_GRID_LABEL: Record<string, string> = { NF: "NF", NFS: "NFS", CTE: "CTe" };
const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "pendente",   label: "Pendente",   bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "processada", label: "Processada", bg: "#DCFCE7", color: "#166534" },
  { v: "cancelada",  label: "Cancelada",  bg: "#FCEBEB", color: "#791F1F" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lblMini: React.CSSProperties = { fontSize: 10, color: "#888", fontWeight: 600, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" };
const chip = (ativo: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: ativo ? "1.5px solid #2A2A2A" : "0.5px solid #DDE2EE", background: ativo ? "#2A2A2A" : "#fff", color: ativo ? "#fff" : "#555",
});

export default function DocumentosFiscaisPage() {
  const router = useRouter();
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelDocFiscal[] | null>(null);
  // Ordenação da lista: pela data da nota (padrão) ou pela data de cadastro no sistema
  const [ordenarPor, setOrdenarPor] = useState<"data_doc" | "created_at">("data_doc");

  const [fTipo,    setFTipo]    = useState<Set<string>>(new Set());
  const [fStatus,  setFStatus]  = useState<Set<string>>(new Set());
  const [fBusca,   setFBusca]   = useState("");
  const [fDataDe,  setFDataDe]  = useState("");
  const [fDataAte, setFDataAte] = useState("");

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setFn(next);
  };

  async function carregar() {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    setCarregando(true);
    setErro("");
    try {
      // Paginação explícita: o PostgREST devolve no máximo 1.000 linhas por consulta — sem
      // isso, notas mais antigas (por data) sumiam da tela quando a conta passava de 1.000.
      const PAGE = 1000;
      const todas: RelDocFiscal[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from("rel_documentos_fiscais").select("*");
        q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
        if (fTipo.size > 0) q = q.in("tipo_doc", Array.from(fTipo));
        if (fStatus.size > 0) q = q.in("status_normalizado", Array.from(fStatus));
        if (fDataDe) q = q.gte("data_doc", fDataDe);
        if (fDataAte) q = q.lte("data_doc", fDataAte);
        if (fBusca.trim()) {
          const t = fBusca.trim();
          q = q.or(`numero.ilike.%${t}%,participante_nome.ilike.%${t}%,chave.ilike.%${t}%`);
        }
        q = q.order(ordenarPor, { ascending: false }).order("id", { ascending: true }).range(from, from + PAGE - 1);
        const { data, error } = await q;
        if (error) throw error;
        todas.push(...((data ?? []) as RelDocFiscal[]));
        if (!data || data.length < PAGE) break;
      }
      setResultado(todas);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar documentos fiscais.");
    } finally {
      setCarregando(false);
    }
  }

  async function sincronizarSieg() {
    const fazAlvo = fazendaId;
    if (!fazAlvo) return;
    // Mesmo período do filtro de datas da tela; sem datas, últimos 30 dias
    const siegDtIni = fDataDe || hoje30(30);
    const siegDtFim = fDataAte || hoje30(0);
    setSiegSyncing(true); setSiegMsg("");
    try {
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazAlvo, data_inicio: siegDtIni, data_fim: siegDtFim, force_reimport: siegForce }),
      });
      // Período grande + "forçar" pode estourar o tempo da função e voltar HTML; mostra o motivo, não o erro bruto
      let d: Record<string, unknown>;
      try { d = await res.json() as Record<string, unknown>; }
      catch {
        setSiegMsg(res.ok
          ? "✗ A sincronização demorou demais. Tente um período menor, ou sem \"Forçar re-importação\"."
          : `✗ Falha do servidor (HTTP ${res.status}). Tente com um período menor.`);
        return;
      }
      if (d.erro) setSiegMsg(`✗ ${d.erro}`);
      else {
        const imp = Number(d.importados_nfe ?? 0);
        const dup = Number(d.duplicados_nfe ?? 0);
        setSiegMsg(`✓ ${imp} importada${imp !== 1 ? "s" : ""}${dup > 0 ? ` · ${dup} já existia${dup !== 1 ? "m" : ""}` : ""}`);
        await carregar();
      }
    } catch (e) { setSiegMsg(`✗ Erro de rede: ${e}`); }
    finally { setSiegSyncing(false); }
  }

  async function reimportarNfSieg(d: RelDocFiscal) {
    if (!(await confirmarAcao({ titulo: "Re-importar NF do SIEG?", mensagem: `A NF ${d.numero ?? ""} será buscada de novo no SIEG e atualizada.`, perigo: false }))) return;
    if (!d.fazenda_id || !d.chave) return;
    setSiegReimp(p => ({ ...p, [d.id]: true }));
    try {
      const base = d.data_doc ?? new Date().toISOString().slice(0, 10);
      const dtIni = new Date(new Date(base).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const dtFim = new Date(new Date(base).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: d.fazenda_id, data_inicio: dtIni, data_fim: dtFim, force_reimport: true, chaves_acesso: [d.chave] }),
      });
      const txt = await res.text();
      let j: Record<string, unknown>;
      try { j = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 200)); }
      if (j.erro) alert(`Erro: ${j.erro}`);
      else await carregar();
    } catch (e) { alert(`Erro ao re-importar: ${e}`); }
    finally { setSiegReimp(p => ({ ...p, [d.id]: false })); }
  }

  useEffect(() => { carregar(); }, [fazendaId, fazendaIds?.join(","), contaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modais por tipo ligados nesta fase ──
  const [modalNfs, setModalNfs] = useState<{ id: string | null; viewOnly?: boolean } | null>(null);
  const [modalNf,  setModalNf]  = useState<{ id: string | null; acaoInicial?: "devolver" | "estornar" } | null>(null);

  // ── Ações em lote — seleção restrita a linhas de tipo NF (a única com
  // processamento em lote implementado; NFS/CT-e nunca tiveram essa ação) ──
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote, setModalLote] = useState(false);

  // ── Popover de detalhe + ações, aberto ao clicar na linha — mesmo padrão
  // do popover de Contas a Pagar/Receber. O detalhe fino (NF/CT-e) é
  // buscado sob demanda, só quando o popover abre, pra não disparar 1
  // query por linha renderizada à toa. NFS não precisa de detalhe extra —
  // tudo que o popup mostra já vem em rel_documentos_fiscais. ──
  const [popover, setPopover] = useState<{ d: RelDocFiscal; x: number; y: number } | null>(null);
  // ── SIEG: sincronização por período e re-importação de uma NF (tela unificada) ──
  const hoje30 = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const [siegForce, setSiegForce] = useState(false);
  const [siegSyncing, setSiegSyncing] = useState(false);
  const [siegMsg, setSiegMsg] = useState("");
  const [siegReimp, setSiegReimp] = useState<Record<string, boolean>>({});
  const [nfDetalhe,  setNfDetalhe]  = useState<Record<string, NfDetalhe>>({});
  const [nfDetalheCarregando, setNfDetalheCarregando] = useState<string | null>(null);
  const [cteDetalhe, setCteDetalhe] = useState<Record<string, CteDetalhe>>({});
  const [cteDetalheCarregando, setCteDetalheCarregando] = useState<string | null>(null);

  // ── Reclassificar NF processada (volta do ModalNf antigo) — troca OG/CC da NF e dos
  // lançamentos de CP gerados por ela. Feito pela rota /api/fiscal/reclassificar-nf.
  const [reclass, setReclass] = useState<{ d: RelDocFiscal; op: string; cc: string; err: string; salvando: boolean; ops: OperacaoGerencial[]; ccs: CentroCusto[] } | null>(null);

  async function abrirReclassificarGrid(d: RelDocFiscal) {
    setPopover(null);
    const nf = nfDetalhe[d.id];
    const [ops, ccs] = await Promise.all([
      listarOperacoesGerenciaisAtivasDaConta({ permite: "notas_fiscais" }, d.fazenda_id),
      listarCentrosCustoGeralDaConta(d.fazenda_id),
    ]);
    setReclass({ d, op: nf?.operacao_gerencial_id ?? "", cc: nf?.centro_custo_id ?? "", err: "", salvando: false, ops, ccs });
  }

  async function salvarReclassificarGrid() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar reclassificar grid)", perigo: false }))) return;
    if (!reclass) return;
    setReclass({ ...reclass, salvando: true, err: "" });
    try {
      const res = await fetch("/api/fiscal/reclassificar-nf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: reclass.d.id, fazenda_id: reclass.d.fazenda_id, operacao_gerencial_id: reclass.op || null, centro_custo_id: reclass.cc || null }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Erro ao reclassificar");
      setNfDetalhe(prev => { const n = { ...prev }; delete n[reclass.d.id]; return n; });
      setReclass(null);
      await carregar();
    } catch (e: unknown) {
      setReclass(r => r ? { ...r, salvando: false, err: e instanceof Error ? e.message : "Erro ao reclassificar" } : r);
    }
  }

  function abrirPopover(d: RelDocFiscal, x: number, y: number) {
    setPopover(p => p?.d.id === d.id ? null : { d, x, y });
    if (d.tipo_doc === "NF" && !nfDetalhe[d.id]) {
      setNfDetalheCarregando(d.id);
      supabase.from("nf_entradas")
        .select("id, status, tipo_entrada, origem, cnpj_destino, chave_acesso, manifestacao_tipo, operacao_gerencial_id, centro_custo_id")
        .eq("id", d.id).maybeSingle()
        .then(({ data }) => {
          if (data) setNfDetalhe(prev => ({ ...prev, [d.id]: data as NfDetalhe }));
          setNfDetalheCarregando(null);
        });
    }
    if (d.tipo_doc === "CTE" && !cteDetalhe[d.id]) {
      setCteDetalheCarregando(d.id);
      supabase.from("ctes")
        .select("id, remetente_nome, destinatario_nome, municipio_origem, uf_origem, municipio_destino, uf_destino, veiculo_placa, motorista_nome, peso_bruto_kg, valor_frete")
        .eq("id", d.id).maybeSingle()
        .then(({ data }) => {
          if (data) setCteDetalhe(prev => ({ ...prev, [d.id]: data as CteDetalhe }));
          setCteDetalheCarregando(null);
        });
    }
  }

  async function estornarNfGrid(d: RelDocFiscal) {
    const ok = confirm(
      `Estornar NF ${d.numero}?\n\n` +
      `Isso irá:\n• Reverter todo o estoque creditado por esta NF\n• Cancelar o lançamento financeiro (CP) associado\n• Retornar a NF para "Rascunho" para reprocessamento\n\n` +
      `Use isto se o estoque ficou duplicado ou incorreto.`
    );
    if (!ok) return;
    try {
      const res = await fetch("/api/compras/estornar-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: d.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erro HTTP ${res.status}`);
      }
      alert(`NF ${d.numero} estornada. O estoque foi revertido. Reabra a NF para corrigir os itens e reprocessar.`);
      setPopover(null);
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao estornar NF");
    }
  }

  // ── Manifestação SIEG — dentro do popover (nunca foi parte do wizard na
  // tela antiga; é um controle só de grid/lista, não do modal de edição) ──
  const [manDropdown, setManDropdown] = useState<string | null>(null);
  const [siegBusy,  setSiegBusy]  = useState<Record<string, boolean>>({});
  const [siegErros, setSiegErros] = useState<Record<string, string>>({});
  const [siegJustModal, setSiegJustModal] = useState<{ d: RelDocFiscal; tipo: number } | null>(null);
  const [siegJustText,  setSiegJustText]  = useState("");

  async function executarManifestacao(d: RelDocFiscal, nf: NfDetalhe, tipo: number, justificativa?: string) {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Executar manifestacao)", perigo: false }))) return;
    setSiegBusy(p => ({ ...p, [d.id]: true }));
    setSiegErros(p => { const n = { ...p }; delete n[d.id]; return n; });
    try {
      const res = await fetch("/api/integracoes/sieg-manifestar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: d.fazenda_id, nf_id: d.id, chave_acesso: nf.chave_acesso, cnpj_destinatario: nf.cnpj_destino, tipo, justificativa }),
      });
      const j = await res.json() as Record<string, unknown>;
      if (j.erro) {
        setSiegErros(p => ({ ...p, [d.id]: String(j.erro) }));
      } else {
        setNfDetalhe(prev => ({ ...prev, [d.id]: { ...nf, manifestacao_tipo: tipo } }));
      }
    } catch (e) { setSiegErros(p => ({ ...p, [d.id]: String(e) })); }
    finally { setSiegBusy(p => ({ ...p, [d.id]: false })); }
  }

  function manifestar(d: RelDocFiscal, nf: NfDetalhe, tipo: number) {
    if (!nf.cnpj_destino) { setSiegErros(p => ({ ...p, [d.id]: "NF sem CNPJ de destinatário — manifeste pela tela antiga (/compras/nf)." })); return; }
    const m = MAN_CFG.find(x => x.tipo === tipo)!;
    if (m.justObrig) { setSiegJustModal({ d, tipo }); setSiegJustText(""); return; }
    executarManifestacao(d, nf, tipo);
  }

  const linhas = (resultado ?? []).filter(d => {
    if (fTipo.size > 0 && !fTipo.has(d.tipo_doc)) return false;
    if (fStatus.size > 0 && !fStatus.has(d.status_normalizado ?? "")) return false;
    return true;
  });

  const porTipo = TIPO_OPCOES.map(t => ({ ...t, qtd: linhas.filter(l => l.tipo_doc === t.v).length, total: linhas.filter(l => l.tipo_doc === t.v).reduce((s, l) => s + (l.valor_total ?? 0), 0) }));

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "14px 20px" }}>

        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B60", borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 11, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>ℹ</span>
          <div style={{ color: "#7A5200" }}>
            Esta tela mostra documentos emitidos <strong>contra</strong> o produtor/empresa (NF, NFS e CT-e recebidos) — não é onde você emite os seus. CT-e aqui é só visualização; emissão/edição continua em <strong>Fretes e Transporte → CT-e</strong>.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Documentos Fiscais</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>NF de Produtos, NF de Serviços e CT-e recebidos, ordenados por data</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModalNf({ id: null })} style={{ ...inp, background: "#0C447C", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              + Nova NF de Produtos
            </button>
            <button onClick={() => setModalNfs({ id: null })} style={{ ...inp, background: "#5B21B6", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              + Nova NF de Serviço
            </button>
          </div>
        </div>

        {/* ── Barra de filtros sempre visível ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label style={lblMini}>Buscar (número, participante, chave)</label>
            <input value={fBusca} onChange={e => setFBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && carregar()} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={lblMini}>Tipo</label>
            <div style={{ display: "flex", gap: 6 }}>
              {TIPO_OPCOES.map(t => <button key={t.v} onClick={() => toggle(fTipo, setFTipo, t.v)} style={chip(fTipo.has(t.v))}>{t.label}</button>)}
            </div>
          </div>
          <div>
            <label style={lblMini}>Status</label>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS_OPCOES.map(s => <button key={s.v} onClick={() => toggle(fStatus, setFStatus, s.v)} style={chip(fStatus.has(s.v))}>{s.label}</button>)}
            </div>
          </div>
          <div>
            <label style={lblMini}>Data de</label>
            <InputData type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lblMini}>até</label>
            <InputData type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={inp} />
          </div>
          <select value={ordenarPor} onChange={e => { setOrdenarPor(e.target.value as "data_doc" | "created_at"); }} style={{ ...inp, cursor: "pointer" }} title="Ordenar por">
            <option value="data_doc">Ordenar: data da nota</option>
            <option value="created_at">Ordenar: data de cadastro</option>
          </select>
          <button onClick={carregar} disabled={carregando} style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            {carregando ? "Atualizando..." : "↻ Atualizar"}
          </button>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 10, color: "#791F1F" }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          {porTipo.map(t => (
            <div key={t.v} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "8px 14px", flex: "1 1 160px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: t.bg, color: t.color, padding: "2px 8px", borderRadius: 6 }}>{t.label}</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{t.qtd}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{fmtBRL(t.total)}</div>
            </div>
          ))}
        </div>

        {/* ── Barra de ações em lote — só quando há seleção ── */}
        {selecionados.size > 0 && (() => {
          const sel = linhas.filter(l => selecionados.has(l.id));
          const selPendentesNf = sel.filter(l => l.tipo_doc === "NF" && l.status_normalizado === "pendente");
          return (
            <div style={{ background: "#111111", borderRadius: 10, padding: "10px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {sel.length} selecionada{sel.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => {
                  if (!selPendentesNf.length) { alert("Nenhuma NF pendente selecionada para processar."); return; }
                  setModalLote(true);
                }}
                style={{ padding: "6px 16px", background: "#fff", color: "#111111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                ⚡ Processar em lote
              </button>
              <button
                onClick={async () => {
                  // Imprime os DANFEs das NFs selecionadas (um PDF único, um diálogo de impressão).
                  // A janela é aberta já no clique, senão o navegador bloqueia o pop-up.
                  const comDanfe = sel.filter(n => n.tipo_doc === "NF" && n.chave);
                  if (comDanfe.length === 0) { alert("Nenhuma NF selecionada tem DANFE (NFS e CT-e não têm DANFE)."); return; }
                  const semDanfe = sel.length - comDanfe.length;
                  const win = window.open("", "_blank");
                  if (!win) { alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site."); return; }
                  win.document.write("<p style=\"font-family:Arial;font-size:13px;margin:24px\">Gerando DANFEs…</p>");
                  try {
                    const res = await fetch("/api/fiscal/danfe-lote", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ itens: comDanfe.map(n => ({ chave: n.chave as string, fazenda_id: n.fazenda_id })) }),
                    });
                    if (!res.ok) {
                      const j = await res.json().catch(() => ({})) as { error?: string };
                      throw new Error(j.error ?? "Erro ao gerar DANFEs");
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    win.location.href = url;
                    win.addEventListener?.("load", () => win.print());
                    if (semDanfe > 0) alert(`${semDanfe} documento(s) da seleção não têm DANFE e ficaram de fora.`);
                  } catch (e) {
                    win.close();
                    alert(e instanceof Error ? e.message : "Erro ao gerar DANFEs");
                  }
                }}
                style={{ padding: "6px 16px", background: "transparent", color: "#fff", border: "0.5px solid rgba(255,255,255,0.5)", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
              >
                🖨 Imprimir
              </button>
              <button
                onClick={() => setSelecionados(new Set())}
                style={{ padding: "6px 12px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
              >
                Limpar seleção
              </button>
            </div>
          );
        })()}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "#555" }}>
          <span style={{ fontWeight: 600 }}>SIEG</span>
          <span style={{ color: "#888" }}>usa o período do filtro acima{!fDataDe && !fDataAte ? " (sem datas: últimos 30 dias)" : ""}</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={siegForce} onChange={e => setSiegForce(e.target.checked)} style={{ cursor: "pointer" }} />
            Forçar re-importação
          </label>
          <button onClick={sincronizarSieg} disabled={siegSyncing} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#111111", color: "#fff", fontWeight: 600, fontSize: 12, cursor: siegSyncing ? "default" : "pointer" }}>
            {siegSyncing ? "Sincronizando…" : "⟳ Sincronizar SIEG"}
          </button>
          {siegMsg && <span style={{ color: siegMsg.startsWith("✗") ? "#B91C1C" : "#1A6B3C" }}>{siegMsg}</span>}
        </div>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "calc(100vh - 290px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 32 }} />    {/* checkbox */}
              <col style={{ width: 54 }} />    {/* Tipo — abreviado */}
              <col style={{ width: 76 }} />    {/* Emissão */}
              <col style={{ width: 78 }} />    {/* Número */}
              <col style={{ width: 46 }} />    {/* Série */}
              <col style={{ width: "16%" }} /> {/* Emitente — flex */}
              <col style={{ width: "16%" }} /> {/* Destinatário — flex */}
              <col style={{ width: 56 }} />    {/* CFOP */}
              <col style={{ width: 76 }} />    {/* Entrada */}
              <col style={{ width: 100 }} />   {/* Tipo (entrada) */}
              <col style={{ width: 64 }} />    {/* Origem */}
              <col style={{ width: "14%" }} /> {/* Operação NF — flex */}
              <col style={{ width: 96 }} />    {/* Parcelamento */}
              <col style={{ width: 110 }} />   {/* Valor */}
              <col style={{ width: 90 }} />    {/* Status */}
            </colgroup>
            <thead>
              <tr style={{ background: "#F4F6FA", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "7px 10px", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA" }}>
                  <input
                    type="checkbox"
                    checked={linhas.some(l => l.tipo_doc === "NF") && linhas.filter(l => l.tipo_doc === "NF").every(l => selecionados.has(l.id))}
                    onChange={e => {
                      const idsNf = linhas.filter(l => l.tipo_doc === "NF").map(l => l.id);
                      setSelecionados(e.target.checked ? new Set(idsNf) : new Set());
                    }}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                {["Tipo", "Emissão", "Número", "Série", "Emitente", "Destinatário", "CFOP", "Entrada", "Tipo", "Origem", "Operação NF", "Parcelamento", "Valor", "Status"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={15} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
              )}
              {!carregando && linhas.map(d => {
                const tm = TIPO_OPCOES.find(t => t.v === d.tipo_doc);
                const sm = STATUS_OPCOES.find(s => s.v === d.status_normalizado);
                return (
                  <tr key={d.id}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest("button,input,select,a")) return;
                      abrirPopover(d, e.clientX, e.clientY);
                    }}
                    style={{ borderBottom: "0.5px solid #F0F2F7", background: selecionados.has(d.id) ? "#F2F2F2" : undefined, cursor: "pointer" }}>
                    <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
                      {d.tipo_doc === "NF" && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(d.id)}
                          onChange={e => {
                            setSelecionados(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(d.id) : next.delete(d.id);
                              return next;
                            });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: tm?.bg ?? "#eee", color: tm?.color ?? "#555", padding: "2px 7px", borderRadius: 6 }}>{TIPO_GRID_LABEL[d.tipo_doc] ?? d.tipo_doc}</span>
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtData(d.data_doc)}</td>
                    <td style={{ padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{d.serie ?? "—"}</td>
                    <td style={{ padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={[d.participante_nome, d.participante_cnpj].filter(Boolean).join(" — ") || undefined}>
                      {d.participante_nome ?? "—"}
                      {d.participante_cnpj && <span style={{ color: "#888", fontFamily: "monospace", fontSize: 10, marginLeft: 6 }}>{d.participante_cnpj}</span>}
                    </td>
                    <td style={{ padding: "7px 10px", fontSize: 11, overflow: "hidden" }}>
                      {d.destinatario_nome
                        ? <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.destinatario_nome}</div>
                        : <span style={{ color: "#888" }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888" }}>{d.cfop ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontSize: 11 }}>{fmtData(d.data_entrada)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      {d.tipo_entrada
                        ? (() => { const tem = TIPO_ENTRADA_META[d.tipo_entrada]; return <span style={{ fontSize: 10, fontWeight: 700, background: tem?.bg ?? "#eee", color: tem?.cl ?? "#555", padding: "2px 7px", borderRadius: 6 }}>{tem?.label ?? d.tipo_entrada}</span>; })()
                        : <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      {d.origem_doc
                        ? <span style={{ fontSize: 10, fontWeight: 700, background: "#F4F6FA", color: "#555", padding: "2px 7px", borderRadius: 6, border: "0.5px solid #DDE2EE" }}>{ORIGEM_DOC_META[d.origem_doc] ?? d.origem_doc}</span>
                        : <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.natureza_operacao ?? undefined}>{d.natureza_operacao ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      {(() => {
                        const dups = d.duplicatas_xml ?? [];
                        if (dups.length === 0) return <span style={{ fontSize: 11, color: "#888" }}>à vista</span>;
                        if (dups.length === 1) return <span style={{ fontSize: 11, color: "#7B4A00" }}>à prazo</span>;
                        return (
                          <div title={dups.map(dp => `${dp.numero || "—"}: ${fmtBRL(dp.valor)} em ${fmtData(dp.data_vencimento)}`).join("\n")}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#EDF4FB", color: "#0B3A6B", padding: "2px 7px", borderRadius: 6 }}>{dups.length}x</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(d.valor_total)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? d.status_normalizado}</span>
                    </td>
                  </tr>
                );
              })}
              {!carregando && linhas.length === 0 && (
                <tr><td colSpan={15} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum documento encontrado para esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Popover de detalhe + ações — mesmo padrão do popover de Contas a
          Pagar/Receber. Campos que antes eram coluna do grid (CNPJ do
          emitente, Processado por, Observação) ficam só aqui agora. ── */}
      {popover && (() => {
        const d = popover.d;
        const tm = TIPO_OPCOES.find(t => t.v === d.tipo_doc);
        const sm = STATUS_OPCOES.find(s => s.v === d.status_normalizado);
        const nf = nfDetalhe[d.id];
        const nfCarregando = nfDetalheCarregando === d.id;
        const cte = cteDetalhe[d.id];
        const cteCarregando = cteDetalheCarregando === d.id;
        const pendente = d.status_normalizado === "pendente";
        const processada = d.status_normalizado === "processada";
        const W = 640, H = 480;
        const top  = Math.min(popover.y + 10, (typeof window !== "undefined" ? window.innerHeight : 800) - H);
        const left = Math.max(8, Math.min(popover.x - 20, (typeof window !== "undefined" ? window.innerWidth : 1200) - W - 8));
        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 1490 }} onClick={() => setPopover(null)} />
            <div style={{ position: "fixed", top, left, zIndex: 1491, width: W, maxHeight: "85vh", display: "flex", background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(11,45,80,0.22)", border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              {/* Conteúdo (rola sozinho; ações ficam na coluna da direita) */}
              <div style={{ flex: 1, minWidth: 0, maxHeight: "85vh", overflowY: "auto" }}>
              {/* Header */}
              <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA", position: "sticky", top: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.participante_nome ?? "—"}</div>
                    {d.participante_cnpj && <div style={{ fontSize: 11, color: "#888", marginTop: 2, fontFamily: "monospace" }}>{d.participante_cnpj}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: tm?.bg ?? "#eee", color: tm?.color ?? "#555", padding: "2px 7px", borderRadius: 6 }}>{tm?.label ?? d.tipo_doc}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555" }}>{sm?.label ?? d.status_normalizado}</span>
                    <button onClick={() => setPopover(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Valor</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#1A4870", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(d.valor_total)}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 11 }}>
                  <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>{d.tipo_doc === "CTE" ? "Emissão" : "Nº / Série"}</div>
                    <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{d.tipo_doc === "CTE" ? fmtData(d.data_doc) : `${d.numero ?? "—"} / ${d.serie ?? "—"}`}</div>
                  </div>
                  {d.cfop && <div>
                    <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>CFOP</div>
                    <div style={{ color: "#1a1a1a" }}>{d.cfop}</div>
                  </div>}

                  {d.tipo_doc === "NF" && (
                    <>
                      {d.destinatario_nome && <div style={{ gridColumn: "1/-1" }}>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Destinatário</div>
                        <div style={{ color: "#1a1a1a" }}>{d.destinatario_nome}{d.destinatario_cnpj && <span style={{ color: "#888", fontFamily: "monospace", marginLeft: 6 }}>{d.destinatario_cnpj}</span>}</div>
                      </div>}
                      {d.data_entrada && <div>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Entrada</div>
                        <div style={{ color: "#1a1a1a" }}>{fmtData(d.data_entrada)}</div>
                      </div>}
                      {d.tipo_entrada && <div>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Tipo</div>
                        <div style={{ color: "#1a1a1a" }}>{TIPO_ENTRADA_META[d.tipo_entrada]?.label ?? d.tipo_entrada}</div>
                      </div>}
                      {d.origem_doc && <div>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Origem</div>
                        <div style={{ color: "#1a1a1a" }}>{ORIGEM_DOC_META[d.origem_doc] ?? d.origem_doc}</div>
                      </div>}
                      {d.natureza_operacao && <div style={{ gridColumn: "1/-1" }}>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Operação NF</div>
                        <div style={{ color: "#1a1a1a" }}>{d.natureza_operacao}</div>
                      </div>}
                      {(d.duplicatas_xml?.length ?? 0) > 0 && (
                        <div style={{ gridColumn: "1/-1" }}>
                          <div style={{ color: "#888", marginBottom: 2, fontSize: 10 }}>Parcelamento</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {d.duplicatas_xml!.map((dp, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "#1a1a1a" }}>
                                <span>{dp.numero || `#${i + 1}`} — {fmtData(dp.data_vencimento)}</span>
                                <span style={{ fontWeight: 600 }}>{fmtBRL(dp.valor)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {d.processado_por && <div>
                        <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Processado por</div>
                        <div style={{ color: "#1a1a1a" }}>{d.processado_por}</div>
                      </div>}
                    </>
                  )}

                  {d.tipo_doc === "CTE" && (
                    cteCarregando ? (
                      <div style={{ gridColumn: "1/-1", color: "#888" }}>Carregando detalhe…</div>
                    ) : cte ? (
                      <>
                        {cte.remetente_nome && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Remetente</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.remetente_nome}</div>
                        </div>}
                        {cte.destinatario_nome && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Destinatário</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.destinatario_nome}</div>
                        </div>}
                        {cte.municipio_origem && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Origem</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.municipio_origem}/{cte.uf_origem}</div>
                        </div>}
                        {cte.municipio_destino && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Destino</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.municipio_destino}/{cte.uf_destino}</div>
                        </div>}
                        {cte.veiculo_placa && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Veículo</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.veiculo_placa}</div>
                        </div>}
                        {cte.motorista_nome && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Motorista</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.motorista_nome}</div>
                        </div>}
                        {cte.peso_bruto_kg != null && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Peso Bruto</div>
                          <div style={{ color: "#1a1a1a" }}>{cte.peso_bruto_kg.toLocaleString("pt-BR")} kg</div>
                        </div>}
                        {cte.valor_frete != null && <div>
                          <div style={{ color: "#888", marginBottom: 1, fontSize: 10 }}>Valor do Frete</div>
                          <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{fmtBRL(cte.valor_frete)}</div>
                        </div>}
                      </>
                    ) : null
                  )}
                </div>

                {d.observacao && (
                  <div style={{ background: "#F4F6FA", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#555", borderLeft: "3px solid #DDE2EE" }}>
                    {d.observacao}
                  </div>
                )}

                {/* Manifestação SIEG — só pra NF de origem SIEG, depois do detalhe carregado */}
                {d.tipo_doc === "NF" && nf?.origem === "sieg" && (() => {
                  const isBusy = siegBusy[d.id];
                  const manTipo = nf.manifestacao_tipo ?? null;
                  const manSt = manTipo !== null ? (MAN_CFG.find(m => m.tipo === manTipo)?.status ?? "pendente") : "pendente";
                  const stCfg = MAN_ST[manSt as ManStatus] ?? MAN_ST.pendente;
                  const manAberto = manDropdown === d.id;
                  return (
                    <div>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Manifestação (SIEG)</div>
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          disabled={isBusy}
                          onClick={() => setManDropdown(manAberto ? null : d.id)}
                          style={{ padding: "4px 10px", border: `0.5px solid ${stCfg.cor}60`, borderRadius: 6, background: stCfg.bg, color: stCfg.cor, fontWeight: 700, fontSize: 11, cursor: isBusy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          {isBusy ? "⏳" : stCfg.label} {!isBusy && "▾"}
                        </button>
                        {manAberto && (
                          <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 1495, minWidth: 160, overflow: "hidden" }}>
                            {MAN_CFG.map(m => (
                              <button key={m.tipo}
                                onClick={() => { setManDropdown(null); manifestar(d, nf, m.tipo); }}
                                style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: m.tipo === manTipo ? m.bg : "transparent", color: m.cor, fontWeight: m.tipo === manTipo ? 700 : 600, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                                {m.tipo === manTipo ? "✓ " : ""}{m.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {siegErros[d.id] && <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 4 }}>{siegErros[d.id]}</div>}
                      </div>
                    </div>
                  );
                })()}
              </div>

              </div>
              {/* Ações — coluna vertical na margem direita */}
              <div style={{ width: 170, flexShrink: 0, padding: "12px 10px", borderLeft: "0.5px solid #DDE2EE", background: "#FAFBFD", display: "flex", flexDirection: "column", gap: 6, maxHeight: "85vh", overflowY: "auto" }}>
                {d.tipo_doc === "NF" && pendente && (
                  <button onClick={() => { setPopover(null); setModalNf({ id: d.id }); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#1A5C38", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
                    ▶ Processar
                  </button>
                )}
                {d.tipo_doc === "NF" && processada && (
                  <button onClick={() => { setPopover(null); setModalNf({ id: d.id }); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#F4F6FA", color: "#1A4870", border: "0.5px solid #DDE2EE", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    Abrir NF
                  </button>
                )}
                {/* DANFE — só NF de Produtos: /api/fiscal/danfe só busca XML em
                    nf_importadas_sieg/nf_entradas, não em nf_servicos/ctes. */}
                {d.tipo_doc === "NF" && d.chave && (
                  <a href={`/api/fiscal/danfe?chave=${d.chave}&fazenda_id=${d.fazenda_id ?? ""}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#F0FDF4", color: "#15803D", border: "0.5px solid #86EFAC", cursor: "pointer", fontWeight: 700, fontSize: 11, textDecoration: "none", textAlign: "center" }}>
                    ↗ DANFE
                  </a>
                )}
                {d.tipo_doc === "NF" && processada && (nf?.tipo_entrada === "insumos" || nf?.tipo_entrada === "pecas") && (
                  <button onClick={() => { setPopover(null); setModalNf({ id: d.id, acaoInicial: "devolver" }); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #E24B4A50", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    ↩ Devolver
                  </button>
                )}
                {d.tipo_doc === "NF" && processada && nf?.tipo_entrada === "insumos" && (
                  <button onClick={() => { setPopover(null); router.push(`/fiscal?aba=venda&modo=remessa&nf_entrada_id=${d.id}`); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#E6F1FB", color: "#1A4870", border: "0.5px solid #1A487050", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    🚚 Emitir NF Remessa
                  </button>
                )}
                {d.tipo_doc === "NF" && processada && (
                  <button onClick={() => estornarNfGrid(d)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#FEF3E2", color: "#8A4A00", border: "0.5px solid #F6C87A", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    ↺ Estornar
                  </button>
                )}
                {d.tipo_doc === "NF" && processada && (
                  <button onClick={() => abrirReclassificarGrid(d)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#FBF3E0", color: "#7A5200", border: "0.5px solid #C9921B50", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    🏷 Reclassificar
                  </button>
                )}
                {d.tipo_doc === "NFS" && (
                  <button onClick={() => { setPopover(null); setModalNfs({ id: d.id, viewOnly: processada }); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#F4F6FA", color: "#5B21B6", border: "0.5px solid #DDE2EE", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                    Abrir NFS
                  </button>
                )}
                {d.tipo_doc === "NF" && pendente && d.origem_doc === "sieg" && (
                  <button onClick={() => { setPopover(null); reimportarNfSieg(d); }} disabled={!!siegReimp[d.id]}
                    style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, background: "#F4F6FA", color: "#1A4870", border: "0.5px solid #DDE2EE", cursor: siegReimp[d.id] ? "default" : "pointer", fontWeight: 600, fontSize: 11 }}>
                    {siegReimp[d.id] ? "Re-importando…" : "↻ Re-importar SIEG"}
                  </button>
                )}
                {d.tipo_doc === "NF" && nfCarregando && (
                  <div style={{ fontSize: 11, color: "#888", padding: "7px 0" }}>Carregando ações…</div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {reclass && (
        <div onClick={() => !reclass.salvando && setReclass(null)} style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "0 4px 20px rgba(11,45,80,0.18)" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50" }}>Reclassificar NF</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>NF {reclass.d.numero}/{reclass.d.serie} — {reclass.d.participante_nome}</div>
              <div style={{ fontSize: 11, color: "#7A5200", marginTop: 6, background: "#FBF3E0", padding: "4px 8px", borderRadius: 6 }}>
                Troca a Operação Gerencial e o Centro de Custo da NF <strong>e também dos lançamentos de CP gerados por ela</strong> (inclusive os já baixados). Estoque, valores e datas não mudam.
              </div>
            </div>
            <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
              {reclass.err && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#791F1F" }}>{reclass.err}</div>}
              <div>
                <label style={{ fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4 }}>Operação Gerencial</label>
                <SelectBusca value={reclass.op} onChange={v => setReclass({ ...reclass, op: v })}
                  options={reclass.ops.map(o => ({ value: o.id, label: `${o.classificacao} — ${o.descricao}` }))}
                  placeholder="— Selecionar —" style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4 }}>Centro de Custo</label>
                <SelectBusca value={reclass.cc} onChange={v => setReclass({ ...reclass, cc: v })}
                  options={reclass.ccs.map(c => ({ value: c.id, label: c.codigo ? `${c.codigo} — ${c.nome}` : c.nome }))}
                  placeholder="— Nenhum —" style={{ width: "100%" }} />
              </div>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setReclass(null)} disabled={reclass.salvando} style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", color: "#555", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Cancelar</button>
              <button onClick={salvarReclassificarGrid} disabled={reclass.salvando || !reclass.op} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: reclass.op ? "#C9921B" : "#D9C9A3", color: "#fff", cursor: reclass.op ? "pointer" : "default", fontWeight: 700, fontSize: 12 }}>
                {reclass.salvando ? "Salvando…" : "Salvar Reclassificação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalLote && (
        <ModalProcessarLote
          nfs={linhas.filter(l => l.tipo_doc === "NF" && l.status_normalizado === "pendente" && selecionados.has(l.id)).map(l => ({ id: l.id, fazenda_id: l.fazenda_id, numero: l.numero }))}
          onClose={() => setModalLote(false)}
          onSaved={() => { carregar(); setSelecionados(new Set()); }}
        />
      )}

      {modalNfs && fazendaId && (
        <ModalNfServico
          id={modalNfs.id}
          fazendaIdPadrao={fazendaId}
          viewOnlyInicial={modalNfs.viewOnly}
          onClose={() => setModalNfs(null)}
          onSaved={carregar}
        />
      )}

      {modalNf && fazendaId && (
        <ModalNf
          id={modalNf.id}
          acaoInicial={modalNf.acaoInicial}
          onClose={() => setModalNf(null)}
          onSaved={carregar}
        />
      )}

      {/* ── Justificativa obrigatória pra Desconhecer/Não Realizada (manifestação SIEG) ── */}
      {siegJustModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, margin: "0 20px", padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", marginBottom: 4 }}>
              {MAN_CFG.find(m => m.tipo === siegJustModal.tipo)?.label} — Justificativa
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
              NF {siegJustModal.d.numero}/{siegJustModal.d.serie} — mínimo 15 caracteres, exigido pela SEFAZ.
            </div>
            <textarea value={siegJustText} onChange={e => setSiegJustText(e.target.value)} rows={3}
              style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button onClick={() => setSiegJustModal(null)} style={{ ...inp, cursor: "pointer" }}>Cancelar</button>
              <button
                disabled={siegJustText.trim().length < 15}
                onClick={async () => {
                  const { d, tipo } = siegJustModal;
                  const nf = nfDetalhe[d.id];
                  setSiegJustModal(null);
                  if (nf) await executarManifestacao(d, nf, tipo, siegJustText);
                }}
                style={{ ...inp, background: siegJustText.trim().length < 15 ? "#ccc" : "#2A2A2A", color: "#fff", fontWeight: 600, cursor: siegJustText.trim().length < 15 ? "default" : "pointer" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
