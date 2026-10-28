"use client";
// Retornos — tela própria para a NF de RETORNO de mercadoria remetida (armazém geral, depósito, condomínio logístico:
// ex. LUFT devolvendo o que foi remetido para armazenagem). Diretriz do dono 27/10/2026: processamento de compra,
// remessa e retorno em telas separadas, cada uma com as suas variáveis (a NF de retorno era tratada como compra: pedido
// de compra, CP). Aqui: liga à remessa, associa os itens ao cadastro, escolhe o depósito e processa — os itens voltam ao
// estoque, sem Contas a Pagar (CFOP de retorno não gera título, lib/cfop-imobilizado CFOPS_RETORNO_ARMAZENAGEM).
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import SelectBusca from "../../../components/SelectBusca";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { supabase } from "../../../lib/supabase";
import type { Deposito, Insumo, NfEntrada, NfEntradaItem, NfRemessaLogistica, Pessoa } from "../../../lib/supabase";
import { BlocoTransporte, TRANSP_VAZIO, montarTransporte, resolverEmitente, useDadosEmissao, type Transp } from "../../../components/fiscal/EmissaoNfe";
import {
  listarInsumosParaConta, listarDepositosMulti, listarNfRemessasLogisticas, listarNfEntradaItens,
  atualizarNfEntrada, atualizarNfRemessaLogistica, processarNfEntrada, insumoAtivo, listarPessoasDaConta,
} from "../../../lib/db";
import { CFOPS_RETORNO_ARMAZENAGEM, CFOPS_RETORNO_DE_REMESSA } from "../../../lib/cfop-imobilizado";
import type { TransferenciaMaquina } from "../../../lib/supabase";
import { listarTransferenciasMaquinas, atualizarTransferenciaMaquina } from "../../../lib/db";
import Link from "next/link";
import { fatorUnidade } from "../../../lib/estoque/unidades";
import { hojeLocal } from "../../../lib/data-local";
import { chavesReferenciadas, problemasRateio, quantidadesPorRemessa, ratearRetorno } from "../../../lib/fiscal/retorno-rateio";

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const fmtQtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dig = (s?: string | null) => String(s ?? "").replace(/\D/g, "");
const ehRetorno = (cfop?: string | null) => CFOPS_RETORNO_ARMAZENAGEM.has(dig(cfop));
// Retorno de máquina/equipamento (comodato, conserto, bem que saiu): baixa a remessa da máquina, sem CP nem estoque
const ehRetornoMaquina = (cfop?: string | null) => CFOPS_RETORNO_DE_REMESSA.has(dig(cfop));

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600 };
const th: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12, borderBottom: "0.5px solid var(--border-row)", verticalAlign: "top" };

type ItemEdit = { item: NfEntradaItem; insumo_id: string; qtd: string };

// Valor remetido: soma dos itens da remessa (o cabeçalho pode ter sido digitado errado); sem itens, o total da remessa
const valorRemetido = (r: NfRemessaLogistica) => {
  const its = Array.isArray(r.itens_json) ? (r.itens_json as { valor_total?: number }[]) : [];
  const soma = its.reduce((s, i) => s + Number(i.valor_total ?? 0), 0);
  return soma > 0 ? soma : Number(r.valor_total ?? 0);
};
const saldoRemessa = (r: NfRemessaLogistica) => Math.max(0, Math.round((valorRemetido(r) - Number(r.valor_retornado ?? 0)) * 100) / 100);

function RetornosConteudo() {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();
  const params = useSearchParams();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);

  const [nfs, setNfs] = useState<NfEntrada[]>([]);
  const [nfsMaq, setNfsMaq] = useState<NfEntrada[]>([]);
  const [maquinas, setMaquinas] = useState<TransferenciaMaquina[]>([]);
  const [maqVinc, setMaqVinc] = useState<Record<string, string>>({});
  const [remessas, setRemessas] = useState<NfRemessaLogistica[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const dados = useDadosEmissao(ids, contaId);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // NF em processamento
  const [nfSel, setNfSel] = useState<NfEntrada | null>(null);
  const [itens, setItens] = useState<ItemEdit[]>([]);
  // Remessas que a NF de retorno devolve (uma ou várias) e o valor rateado para cada uma
  const [remessaIds, setRemessaIds] = useState<string[]>([]);
  const [alocs, setAlocs] = useState<Record<string, string>>({});
  const [depositoId, setDepositoId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!ids.length || !contaId) return;
    setLoading(true);
    listarPessoasDaConta(fazendaId ?? ids[0]).then(setPessoas).catch(() => setPessoas([]));
    const [{ data: n }, rem, ins, dep] = await Promise.all([
      supabase.from("nf_entradas").select("*").in("fazenda_id", ids).in("status", ["pendente", "digitando"]).order("data_emissao", { ascending: false }).limit(2000),
      listarNfRemessasLogisticas(contaId),
      listarInsumosParaConta(contaId, fazendaId ?? undefined),
      listarDepositosMulti(ids),
    ]);
    setNfs(((n ?? []) as NfEntrada[]).filter(x => ehRetorno(x.cfop)));
    const pendMaq = ((n ?? []) as NfEntrada[]).filter(x => ehRetornoMaquina(x.cfop));
    setNfsMaq(pendMaq);
    try {
      const tms = (await listarTransferenciasMaquinas(contaId)).filter(t => t.status === "emitida" && t.motivo !== "transferencia_fazenda");
      setMaquinas(tms);
      // sugestão: a remessa referenciada no XML; senão a única do mesmo CPF/CNPJ
      const sug: Record<string, string> = {};
      for (const nf of pendMaq) {
        const ref = (nf as unknown as { xml_content?: string }).xml_content?.match(/<refNFe>(\d{44})<\/refNFe>/)?.[1];
        const porChave = ref ? tms.find(t => t.nf_saida_chave === ref) : undefined;
        const porDoc = tms.filter(t => dig(t.destinatario_cnpj) && dig(t.destinatario_cnpj) === dig(nf.emitente_cnpj));
        sug[nf.id] = porChave?.id ?? (porDoc.length === 1 ? porDoc[0].id : "");
      }
      setMaqVinc(sug);
    } catch { setMaquinas([]); }
    setRemessas(rem);
    setInsumos(ins.filter(insumoAtivo));
    setDepositos(dep);
    setLoading(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ids.join(","), contaId]);

  const abertas = remessas.filter(r => r.status === "emitida");
  // Busca da tela: número, chave, emitente/destinatário, item ou máquina — vale para todas as listas
  const [busca, setBusca] = useState("");
  const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const casa = (...campos: unknown[]) => { const q = norm(busca.trim()); return !q || campos.some(c => norm(c).includes(q)); };
  const nfsF = nfs.filter(n => casa(n.numero, n.chave_acesso, n.emitente_nome, n.emitente_cnpj, n.cfop));
  const abertasF = abertas.filter(r => casa(r.nf_remessa_numero, r.nf_remessa_chave, r.destinatario_nome, r.cfop_remessa,
    ...((r.itens_json ?? []) as { descricao?: string; nome?: string }[]).map(i => i.descricao ?? i.nome)));
  const nfsMaqF = nfsMaq.filter(n => casa(n.numero, n.chave_acesso, n.emitente_nome, n.emitente_cnpj, n.cfop));
  const maquinasF = maquinas.filter(t => casa(t.maquina_nome, t.destinatario_nome, t.nf_saida_numero));
  const insumoPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);

  async function abrir(nf: NfEntrada) {
    setErro(""); setMsg(""); setNfSel(nf);
    const its = await listarNfEntradaItens(nf.id);
    setItens(its.map(it => ({ item: it, insumo_id: it.insumo_id ?? "", qtd: String(it.qtd_nf ?? it.quantidade ?? 0) })));
    // remessas sugeridas: TODAS as referenciadas no XML (o retorno pode devolver mais de uma); senão a única aberta do armazém
    const refs = chavesReferenciadas((nf as unknown as { xml_content?: string }).xml_content);
    const nome = (nf.emitente_nome ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
    const porNome = abertas.filter(r => nome && r.destinatario_nome.toUpperCase().includes(nome));
    const porRef = abertas.filter(r => r.nf_remessa_chave && refs.includes(r.nf_remessa_chave));
    escolherRemessas(porRef.length ? porRef.map(r => r.id) : porNome.length === 1 ? [porNome[0].id] : [], Number(nf.valor_total ?? 0));
    setDepositoId(depositos.find(d => d.fazenda_id === nf.fazenda_id && !["terceiro", "armazem_terceiro"].includes(d.tipo))?.id ?? "");
  }
  // Marca/desmarca remessas e refaz o rateio sugerido (mais antiga primeiro, até o saldo de cada uma)
  function escolherRemessas(idsSel: string[], valorNf = Number(nfSel?.valor_total ?? 0)) {
    setRemessaIds(idsSel);
    const sel = abertas.filter(r => idsSel.includes(r.id)).map(r => ({ id: r.id, saldo: saldoRemessa(r), data: r.nf_remessa_data ?? r.created_at }));
    setAlocs(Object.fromEntries(ratearRetorno(valorNf, sel).map(a => [a.id, a.valor.toFixed(2).replace(".", ",")])));
  }
  const numBR = (v: string) => parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const alocacoes = remessaIds.map(id => ({ id, valor: numBR(alocs[id] ?? "") }));
  const remsSel = abertas.filter(r => remessaIds.includes(r.id));
  const problemas = nfSel && remessaIds.length ? problemasRateio(Number(nfSel.valor_total ?? 0), remsSel.map(r => ({ id: r.id, saldo: saldoRemessa(r) })), alocacoes) : [];

  useEffect(() => {
    const id = params.get("nf");
    if (id && !nfSel && nfs.length) { const nf = nfs.find(x => x.id === id); if (nf) abrir(nf); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfs]);

  // Quantidade no cadastro: conversão segura (t→kg, lt→L); sem ela, o usuário informa a quantidade na unidade do cadastro
  function sugerirQtd(e: ItemEdit, insumoId: string): string {
    const ins = insumoPorId.get(insumoId);
    const qNf = Number(e.item.qtd_nf ?? e.item.quantidade ?? 0);
    const f = ins ? fatorUnidade(e.item.unidade_nf ?? e.item.unidade, ins.unidade) : 1;
    return f == null ? "" : String(Math.round(qNf * f * 10000) / 10000);
  }

  async function processar() {
    if (!nfSel) return;
    const semInsumo = itens.filter(e => !e.insumo_id);
    if (semInsumo.length) { setErro("Associe todos os itens a um produto do cadastro."); return; }
    if (!depositoId) { setErro("Escolha o depósito para onde a mercadoria volta."); return; }
    const semQtd = itens.find(e => !(parseFloat(e.qtd.replace(",", ".")) > 0));
    if (semQtd) { setErro(`Informe a quantidade, na unidade do cadastro, de "${semQtd.item.descricao_nf ?? semQtd.item.descricao_produto}".`); return; }
    // Retorno sempre referencia a(s) remessa(s) de origem: sem ela não há o que baixar no armazém nem como controlar o saldo
    if (!remsSel.length) { setErro("Marque a(s) remessa(s) que estão retornando. Se não aparecem na lista, registre-as antes em Remessas (inclusive NF emitida em outro sistema)."); return; }
    if (remsSel.some(r => !("valor_retornado" in r))) { setErro("Para ligar o retorno à remessa, rode antes a Seção 377 do supabase_migrations.sql (retorno parcial)."); return; }
    if (problemas.length) { setErro(`Rateio entre as remessas: ${problemas.join("; ")}.`); return; }
    const valorNf = Number(nfSel.valor_total ?? 0);
    const resumo = remsSel.map(r => {
      const v = alocacoes.find(a => a.id === r.id)!.valor;
      return `NF ${r.nf_remessa_numero}: ${fmtBRL(v)}${v >= saldoRemessa(r) - 0.01 ? " (retornada)" : ` (parcial — ainda falta ${fmtBRL(saldoRemessa(r) - v)})`}`;
    }).join("\n");
    if (!(await confirmarAcao({ titulo: "Processar retorno?", perigo: false,
      mensagem: `A NF ${nfSel.numero} de ${nfSel.emitente_nome} volta ao estoque (${depositos.find(d => d.id === depositoId)?.nome ?? ""}), sem Contas a Pagar.\n\n${remsSel.length > 1 ? "Remessas devolvidas por esta NF" : "Remessa"}:\n${resumo}` }))) return;
    setSalvando(true); setErro("");
    try {
      // itens: cadastro, depósito e quantidade na unidade do cadastro (estoque)
      for (const e of itens) {
        const ins = insumoPorId.get(e.insumo_id)!;
        const qtd = parseFloat(e.qtd.replace(",", "."));
        const qNf = Number(e.item.qtd_nf ?? e.item.quantidade ?? 0);
        const { error } = await supabase.from("nf_entrada_itens").update({
          insumo_id: e.insumo_id, deposito_id: depositoId, tipo_apropiacao: "estoque",
          descricao_produto: ins.nome, unidade: ins.unidade, quantidade: qtd,
          qtd_nf: qNf, unidade_nf: e.item.unidade_nf ?? e.item.unidade, fator_conversao: qNf > 0 ? qtd / qNf : 1,
        }).eq("id", e.item.id);
        if (error) throw error;
      }
      const itensDB = await listarNfEntradaItens(nfSel.id);
      await processarNfEntrada(nfSel.id, nfSel.fazenda_id, itensDB, Number(nfSel.valor_total ?? 0), nfSel.emitente_nome,
        nfSel.data_entrada ?? nfSel.data_emissao, nfSel.emitente_cnpj, { nfeNumero: nfSel.numero, tipoEntrada: "insumos", anoSafraId: nfSel.ano_safra_id, cicloId: nfSel.ciclo_id });
      await atualizarNfEntrada(nfSel.id, { status: "processada", processado_por: nomeUsuario ?? undefined });
      // Cada remessa recebe a sua parte do retorno; quando volta tudo, passa a Retornada (Seção 377)
      const qtdPorRem = quantidadesPorRemessa(itens.map(e => ({ insumo_id: e.insumo_id, quantidade: parseFloat(e.qtd.replace(",", ".")) })), valorNf, alocacoes);
      const outras = remsSel.length > 1 ? ` (NF ${nfSel.numero} também devolve ${remsSel.length - 1} outra(s) remessa(s))` : "";
      for (const rem of remsSel) {
        const v = alocacoes.find(a => a.id === rem.id)!.valor;
        const fecha = v >= saldoRemessa(rem) - 0.01;
        const retornos = [...(rem.retornos ?? []), { numero: nfSel.numero, chave: nfSel.chave_acesso ?? null, data: nfSel.data_emissao ?? null, valor: v, emitente: nfSel.emitente_nome }];
        await atualizarNfRemessaLogistica(rem.id, {
          ...(fecha ? { status: "retornada" as const } : {}),
          valor_retornado: Math.round((Number(rem.valor_retornado ?? 0) + v) * 100) / 100, retornos,
          nf_retorno_chave: nfSel.chave_acesso || undefined, nf_retorno_numero: nfSel.numero,
          nf_retorno_data: nfSel.data_emissao || hojeLocal(),
          observacao: [rem.observacao, `Retorno${fecha ? "" : " parcial"}: NF ${nfSel.numero} recebida de ${nfSel.emitente_nome} (${fmtBRL(v)})${outras}`].filter(Boolean).join(" | "),
        });
        // Remessa que transferiu o estoque para o armazém: o que voltou (a parte desta remessa) sai do depósito do armazém
        if (rem.estoque_transferido) {
          const r = await fetch("/api/fiscal/remessas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            acao: "retorno_estoque", fazenda_id: nfSel.fazenda_id, remessa_id: rem.id, nf_numero: nfSel.numero, data: nfSel.data_emissao || hojeLocal(),
            itens: qtdPorRem.find(q => q.id === rem.id)?.itens ?? [],
          }) });
          const j = await r.json() as { ok: boolean; error?: string };
          if (!j.ok) throw new Error(`NF processada, mas a saída do depósito do armazém (remessa NF ${rem.nf_remessa_numero}) falhou: ${j.error}`);
        }
      }
      setMsg(`✓ NF ${nfSel.numero} processada: mercadoria de volta ao estoque — ${remsSel.map(r => `remessa NF ${r.nf_remessa_numero}${alocacoes.find(a => a.id === r.id)!.valor >= saldoRemessa(r) - 0.01 ? " retornada" : " parcial"}`).join(", ")}.`);
      setNfSel(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao processar o retorno.");
    } finally {
      setSalvando(false);
    }
  }

  const depositosProprios = depositos.filter(d => !nfSel || d.fazenda_id === nfSel.fazenda_id);

  // NF de retorno de máquina recebida: dá baixa na remessa da máquina e marca a NF como processada (sem CP, sem estoque)
  async function processarRetornoMaquina(nf: NfEntrada) {
    const t = maquinas.find(m => m.id === maqVinc[nf.id]);
    if (!t) { setMsg(""); alert("Escolha a remessa da máquina que está voltando."); return; }
    if (!(await confirmarAcao({ titulo: "Registrar retorno da máquina?", perigo: false,
      mensagem: `${t.maquina_nome}: a remessa NF ${t.nf_saida_numero ?? "s/nº"} passa a Retornada com a NF ${nf.numero} de ${nf.emitente_nome}. Sem Contas a Pagar e sem estoque.` }))) return;
    try {
      await atualizarTransferenciaMaquina(t.id, { status: "retornada", nf_retorno_chave: nf.chave_acesso || undefined, nf_retorno_numero: nf.numero, nf_retorno_data: nf.data_emissao || hojeLocal() });
      await atualizarNfEntrada(nf.id, { status: "processada", processado_por: nomeUsuario ?? undefined });
      setMsg(`✓ Retorno de ${t.maquina_nome} registrado (NF ${nf.numero}).`);
      await carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao registrar o retorno da máquina.");
    }
  }

  // ── Retorno emitido pelo Arato ou emitido fora (sem NF de entrada para processar) ─────────────────────────────
  const [retRem, setRetRem] = useState<NfRemessaLogistica | null>(null);
  const [retModo, setRetModo] = useState<"arato" | "externa">("arato");
  const [retValor, setRetValor] = useState("");
  // Outras remessas do mesmo armazém devolvidas na mesma NF de retorno: id → valor (texto)
  const [retExtras, setRetExtras] = useState<Record<string, string>>({});
  const [retVolta, setRetVolta] = useState("");
  const [retNatureza, setRetNatureza] = useState("Retorno de mercadoria depositada em armazém geral");
  const [retData, setRetData] = useState(hojeLocal());
  const [retEmitente, setRetEmitente] = useState("");
  const [retTr, setRetTr] = useState<Transp>(TRANSP_VAZIO);
  const [retExt, setRetExt] = useState({ numero: "", serie: "", chave: "" });
  const [retErro, setRetErro] = useState("");
  const [retSalvando, setRetSalvando] = useState(false);

  function abrirRetorno(r: NfRemessaLogistica, modo: "arato" | "externa") {
    setRetRem(r); setRetModo(modo); setRetValor(saldoRemessa(r).toFixed(2).replace(".", ",")); setRetVolta(r.deposito_origem_id ?? ""); setRetExtras({});
    setRetNatureza("Retorno de mercadoria depositada em armazém geral"); setRetData(hojeLocal()); setRetEmitente("");
    setRetTr(TRANSP_VAZIO); setRetExt({ numero: "", serie: "", chave: "" }); setRetErro("");
  }

  async function confirmarRetorno() {
    if (!retRem) return;
    const valorDe = (v: string) => parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
    // A remessa da linha + as outras do mesmo armazém marcadas: cada uma com o seu valor (até o saldo dela)
    const lote = [{ rem: retRem, valor: valorDe(retValor) },
      ...Object.entries(retExtras).map(([id, v]) => ({ rem: abertas.find(x => x.id === id)!, valor: valorDe(v) })).filter(x => x.rem)];
    for (const { rem, valor: v } of lote) {
      const sal = saldoRemessa(rem);
      if (!(v > 0) || v > sal + 0.01) { setRetErro(`Informe o valor do retorno da remessa NF ${rem.nf_remessa_numero} (até ${fmtBRL(sal)}).`); return; }
    }
    const valor = lote.reduce((t, x) => t + x.valor, 0);
    if (!retVolta) { setRetErro("Escolha o depósito para onde a mercadoria volta."); return; }
    if (retModo === "externa" && !retExt.numero.trim()) { setRetErro("Informe o número da NF de retorno."); return; }
    if (!(await confirmarAcao({ titulo: retModo === "arato" ? "Emitir NF-e de retorno?" : "Registrar retorno?", perigo: false,
      mensagem: `Retorno de ${fmtBRL(valor)}: ${lote.map(x => `remessa NF ${x.rem.nf_remessa_numero} ${fmtBRL(x.valor)}${x.valor < saldoRemessa(x.rem) - 0.01 ? " (parcial)" : ""}`).join("; ")}. A mercadoria volta para "${depositos.find(d => d.id === retVolta)?.nome}".` }))) return;
    setRetSalvando(true); setRetErro("");
    try {
      type ItemRem = { descricao?: string; descricao_produto?: string; ncm?: string; unidade?: string; unidade_nf?: string; quantidade: number; valor_unitario?: number; valor_total?: number };
      // Itens da NF: os de cada remessa, na proporção do valor que volta dela
      const itensLote = lote.flatMap(({ rem, valor: v }) => {
        const its = (Array.isArray(rem.itens_json) ? rem.itens_json : []) as ItemRem[];
        const remetido = its.reduce((t, i) => t + Number(i.valor_total ?? 0), 0) || Number(rem.valor_total ?? 0);
        const f = remetido > 0 ? Math.min(1, v / remetido) : 1;
        return its.map(it => ({ it, f, cfop: rem.cfop_retorno }));
      });
      let nf: { numero: string; serie?: string; chave?: string | null; protocolo?: string | null; xml_url?: string | null; emit?: Record<string, string | undefined> };
      let fazEmissao = retRem.fazenda_id;
      if (retModo === "arato") {
        if (!itensLote.length) throw new Error("A remessa não tem itens registrados para emitir o retorno.");
        let cpfHint: string | undefined;
        if (retRem.nf_entrada_id) {
          const { data: nfo } = await supabase.from("nf_entradas").select("produtor_id").eq("id", retRem.nf_entrada_id).maybeSingle();
          if (nfo?.produtor_id) { const { data: pr } = await supabase.from("produtores").select("cpf_cnpj").eq("id", nfo.produtor_id).maybeSingle(); cpfHint = pr?.cpf_cnpj ?? undefined; }
        }
        const em = resolverEmitente(dados.emitentes, retEmitente, cpfHint);
        if ("erro" in em) { setRetErro(em.erro); setRetSalvando(false); return; }
        fazEmissao = em.fazenda_id;
        const dest = pessoas.find(p => p.id === retRem.destinatario_pessoa_id);
        const { transporte, motorista } = montarTransporte(dados, retTr);
        const resp = await fetch("/api/fiscal/emitir-nfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          fazenda_id: em.fazenda_id, modulo_key: em.modulo, cpf_cnpj_hint: em.cpf,
          destinatario: {
            nome: retRem.destinatario_nome, cpf_cnpj: dest ? (dest.cpf_cnpj ?? "").replace(/\D/g, "") || undefined : undefined, ie: dest?.inscricao_est || undefined,
            logradouro: dest?.logradouro || undefined, numero: dest?.numero || undefined, bairro: dest?.bairro || undefined, municipio_ibge: dest?.municipio_ibge || undefined,
            municipio_nome: dest?.municipio || undefined, uf: retRem.destinatario_uf || dest?.estado || undefined, cep: dest ? (dest.cep ?? "").replace(/\D/g, "") || undefined : undefined,
          },
          itens: itensLote.map(({ it, f, cfop }) => ({ descricao: it.descricao ?? it.descricao_produto ?? "", ncm: it.ncm || "00000000", cfop, unidade: (it.unidade_nf ?? it.unidade ?? "UN").toUpperCase(),
            quantidade: Math.round(Number(it.quantidade) * f * 10000) / 10000, valor_unitario: Number(it.valor_unitario ?? 0) })),
          // Uma NF de retorno pode referenciar várias remessas (um <NFref> por chave)
          natureza: retNatureza, nfe_ref: lote.map(x => x.rem.nf_remessa_chave).filter((k): k is string => !!k), frete: retTr.frete, transporte, tipo: "1",
          inf_cpl: [`Retorno de remessa — NF ref: ${lote.map(x => x.rem.nf_remessa_chave ?? x.rem.nf_remessa_numero ?? "").join(", ")}`, motorista].filter(Boolean).join(" | "),
        }) });
        const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; serie?: string; protocolo?: string; xmlUrl?: string; cStat?: string; xMotivo?: string } & Record<string, string | undefined>;
        if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);
        nf = { numero: res.numero ?? "", serie: res.serie, chave: res.chave, protocolo: res.protocolo, xml_url: res.xmlUrl,
          emit: { emit_razao: res.emit_razao, emit_cnpj: res.emit_cnpj, emit_ie: res.emit_ie, emit_endereco: res.emit_endereco, emit_numero: res.emit_numero, emit_bairro: res.emit_bairro, emit_municipio: res.emit_municipio, emit_uf: res.emit_uf, emit_cep: res.emit_cep, emit_fone: res.emit_fone } };
      } else {
        nf = { numero: retExt.numero.trim(), serie: retExt.serie.trim() || undefined, chave: retExt.chave.replace(/\D/g, "") || null };
      }
      // Registra o retorno em cada remessa, com o valor dela (estoque e saldo por remessa)
      const situacao: string[] = [];
      for (const { rem, valor: v } of lote) {
        const r = await fetch("/api/fiscal/remessas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          acao: "registrar_retorno", fazenda_id: fazEmissao, remessa_id: rem.id, emissao: retModo, data: retData, natureza: retNatureza,
          volta_para_deposito_id: retVolta, nf, valor: v, descricao: retModo === "externa" ? "emitida fora do Arato" : undefined,
        }) });
        const j = await r.json() as { ok: boolean; error?: string; retornada?: boolean };
        if (!j.ok) throw new Error(retModo === "arato" ? `A NF-e ${nf.numero} foi autorizada, mas o registro do retorno da remessa NF ${rem.nf_remessa_numero} falhou: ${j.error}. Avise o suporte antes de emitir de novo.` : `Remessa NF ${rem.nf_remessa_numero}: ${j.error}`);
        situacao.push(`remessa NF ${rem.nf_remessa_numero} ${j.retornada ? "retornada" : "parcial"}`);
      }
      setMsg(`✓ Retorno NF ${nf.numero} ${retModo === "arato" ? "emitido" : "registrado"}: ${situacao.join(", ")}.`);
      setRetRem(null);
      await carregar();
    } catch (e) {
      setRetErro(e instanceof Error ? e.message : "Erro ao registrar o retorno.");
    } finally {
      setRetSalvando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <main style={{ padding: "16px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Retornos</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>NF de retorno de mercadoria remetida (armazém geral, depósito, condomínio logístico). Volta ao estoque, ligada à remessa, sem Contas a Pagar.</div>
          </div>
        </OperationalHeading>

        {msg && <div style={{ marginTop: 12, padding: 10, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 13 }}>{msg}</div>}

        <div style={{ marginTop: 14 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nº, chave, armazém/emitente, produto ou máquina…" style={{ ...inp, maxWidth: 420 }} />
        </div>

        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>NF de retorno recebidas, a processar <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· CFOP 5906/6906/5907/6907/1906/2906… chegadas pelo SIEG, XML ou digitadas</span></h2>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["Nº", "Emissão", "Emitente", "CFOP", "Natureza", "Valor", ""].map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 20 }}>Carregando…</td></tr>}
                {!loading && nfsF.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 20 }}>{busca ? "Nenhuma NF encontrada." : "Nenhuma NF de retorno pendente."}</td></tr>}
                {nfsF.map(n => (
                  <tr key={n.id} style={{ background: nfSel?.id === n.id ? "#D5E8F5" : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>{n.numero}{n.serie ? `/${n.serie}` : ""}</td>
                    <td style={td}>{fmtData(n.data_emissao)}</td>
                    <td style={td}>{n.emitente_nome}<div style={{ fontSize: 11, color: "var(--text-3)" }}>{n.emitente_cnpj}</div></td>
                    <td style={td}>{n.cfop}</td>
                    <td style={td}>{n.natureza ?? "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(n.valor_total)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <OperationalButton data-arato-button="primary" onClick={() => abrir(n)} style={{ padding: "5px 12px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Processar retorno</OperationalButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {nfSel && (
          <section style={{ marginTop: 16, background: "var(--bg-card)", border: "1px solid #1A4870", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Retorno — NF {nfSel.numero} · {nfSel.emitente_nome} · {fmtBRL(nfSel.valor_total)}</h2>
              <button type="button" onClick={() => setNfSel(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Remessa(s) que esta NF devolve <span style={{ fontWeight: 400, color: "var(--text-3)" }}>· marque todas as que ela referencia</span></label>
                {abertas.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>Nenhuma remessa aguardando retorno. Registre a remessa de origem em <Link href="/fiscal/remessas" style={{ color: "#1A4870" }}>Remessas</Link> antes de processar.</div>
                ) : (() => {
                  const refs = chavesReferenciadas((nfSel as unknown as { xml_content?: string }).xml_content);
                  const nome = (nfSel.emitente_nome ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
                  // Referenciadas no XML primeiro, depois as do mesmo armazém, depois as demais
                  const peso = (r: NfRemessaLogistica) => (r.nf_remessa_chave && refs.includes(r.nf_remessa_chave) ? 0 : nome && r.destinatario_nome.toUpperCase().includes(nome) ? 1 : 2);
                  const lista = [...abertas].sort((a, b) => peso(a) - peso(b) || (a.nf_remessa_data ?? "").localeCompare(b.nf_remessa_data ?? ""));
                  const soma = alocacoes.reduce((t, a) => t + a.valor, 0);
                  return (
                    <div style={{ border: `0.5px solid ${remessaIds.length ? "var(--border-table)" : "#C9921B"}`, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                      {lista.map(r => {
                        const marcada = remessaIds.includes(r.id);
                        return (
                          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "0.5px solid var(--border-row)", background: marcada ? "#D5E8F5" : undefined }}>
                            <input type="checkbox" checked={marcada} onChange={() => escolherRemessas(marcada ? remessaIds.filter(x => x !== r.id) : [...remessaIds, r.id])} style={{ accentColor: "#1A4870" }} />
                            <div style={{ flex: 1, fontSize: 12 }}>
                              NF {r.nf_remessa_numero ?? "s/nº"}{r.nf_remessa_data ? ` de ${fmtData(r.nf_remessa_data)}` : ""} · {r.destinatario_nome} · CFOP {r.cfop_remessa}
                              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Falta voltar {fmtBRL(saldoRemessa(r))}{peso(r) === 0 ? " · referenciada no XML" : ""}</div>
                            </div>
                            {marcada && <input value={alocs[r.id] ?? ""} onChange={e => setAlocs(p => ({ ...p, [r.id]: e.target.value }))} title="Valor do retorno que cabe a esta remessa" style={{ ...inp, width: 120, textAlign: "right" }} />}
                          </div>
                        );
                      })}
                      {remessaIds.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 12, fontWeight: 600, background: "var(--bg-page)" }}>
                          <span>{remessaIds.length} remessa(s) · total da NF {fmtBRL(nfSel.valor_total)}</span>
                          <span style={{ color: problemas.length ? "#B91C1C" : "#166534" }}>Rateado {fmtBRL(soma)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: problemas.length ? "#B91C1C" : "var(--text-3)", marginTop: 3 }}>{problemas.length
                  ? `Ajuste o rateio: ${problemas.join("; ")}.`
                  : "Obrigatório. O valor é rateado da remessa mais antiga para a mais nova (até o saldo de cada uma) e pode ser ajustado; a remessa que zera passa a Retornada."}</div>
              </div>
              <div>
                <label style={lbl}>Depósito para onde a mercadoria volta</label>
                <select value={depositoId} onChange={e => setDepositoId(e.target.value)} style={inp}>
                  <option value="">Selecionar…</option>
                  {depositosProprios.map(d => <option key={d.id} value={d.id}>{d.nome}{["terceiro", "armazem_terceiro"].includes(d.tipo) ? " (terceiro)" : ""}</option>)}
                </select>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Item da NF", "Qtd na NF", "Produto do cadastro", "Qtd no cadastro", "Valor"].map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {itens.map((e, i) => {
                  const ins = insumoPorId.get(e.insumo_id);
                  return (
                    <tr key={e.item.id}>
                      <td style={td}>{e.item.descricao_nf ?? e.item.descricao_produto}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtQtd(Number(e.item.qtd_nf ?? e.item.quantidade ?? 0))} {e.item.unidade_nf ?? e.item.unidade}</td>
                      <td style={{ ...td, minWidth: 280 }}>
                        <SelectBusca value={e.insumo_id} placeholder="Associar ao cadastro…"
                          onChange={v => setItens(p => p.map((x, j) => j === i ? { ...x, insumo_id: v, qtd: sugerirQtd(x, v) } : x))}
                          options={insumos.map(s => ({ value: s.id, label: `${s.nome} (${s.unidade})` }))} />
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <input value={e.qtd} onChange={ev => setItens(p => p.map((x, j) => j === i ? { ...x, qtd: ev.target.value } : x))} style={{ ...inp, width: 110, display: "inline-block" }} />
                        <span style={{ marginLeft: 6, fontSize: 12, color: "var(--text-3)" }}>{ins?.unidade ?? ""}</span>
                        {ins && !e.qtd && <div style={{ fontSize: 10, color: "#B45309" }}>Sem conversão de {e.item.unidade_nf ?? e.item.unidade} para {ins.unidade}: informe</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(e.item.valor_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {erro && <div style={{ marginTop: 12, padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{erro}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <OperationalButton data-arato-button="secondary" onClick={() => setNfSel(null)} style={{ padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, cursor: "pointer" }}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={processar} disabled={salvando} style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{salvando ? "Processando…" : "Processar retorno"}</OperationalButton>
            </div>
          </section>
        )}

        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>Remessas aguardando retorno <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· retorno recebido do armazém: processe a NF acima; retorno emitido por você: use os botões</span></h2>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr>{["NF remessa", "Data", "Destinatário", "CFOP", "Remetido", "Já voltou", "Falta voltar", ""].map(h => <th key={h} style={{ ...th, textAlign: ["Remetido", "Já voltou", "Falta voltar"].includes(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {abertasF.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 16 }}>{busca ? "Nenhuma remessa encontrada." : "Nenhuma remessa aguardando retorno."}</td></tr>}
                {abertasF.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.nf_remessa_numero ?? "—"}</td>
                    <td style={td}>{fmtData(r.nf_remessa_data)}</td>
                    <td style={td}>{r.destinatario_nome}</td>
                    <td style={td}>{r.cfop_remessa}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(valorRemetido(r))}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(r.valor_retornado ?? 0)}{(r.retornos?.length ?? 0) > 0 && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.retornos!.map(x => `NF ${x.numero}`).join(", ")}</div>}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBRL(saldoRemessa(r))}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => abrirRetorno(r, "arato")} style={{ background: "none", border: "none", color: "#1A4870", cursor: "pointer", fontSize: 11, fontWeight: 600, marginRight: 10 }}>Emitir retorno</button>
                      <button type="button" onClick={() => abrirRetorno(r, "externa")} style={{ background: "none", border: "none", color: "#1A6B3C", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Retorno emitido fora</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>Máquinas e equipamentos <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)" }}>· retorno de conserto, comodato ou bem que saiu (CFOP 1554/2554/1555/2555)</span></h2>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["NF recebida", "Emissão", "Emitente", "CFOP", "Remessa da máquina", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {nfsMaqF.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 16 }}>{busca ? "Nenhuma NF encontrada." : "Nenhuma NF de retorno de máquina pendente."}</td></tr>}
                {nfsMaqF.map(n => (
                  <tr key={n.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{n.numero}{n.serie ? `/${n.serie}` : ""}</td>
                    <td style={td}>{fmtData(n.data_emissao)}</td>
                    <td style={td}>{n.emitente_nome}</td>
                    <td style={td}>{n.cfop}</td>
                    <td style={{ ...td, minWidth: 280 }}>
                      <select value={maqVinc[n.id] ?? ""} onChange={e => setMaqVinc(p => ({ ...p, [n.id]: e.target.value }))} style={inp}>
                        <option value="">— escolher a remessa —</option>
                        {maquinas.map(t => <option key={t.id} value={t.id}>{t.maquina_nome} · {t.destinatario_nome} · NF {t.nf_saida_numero ?? "s/nº"}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <OperationalButton data-arato-button="primary" onClick={() => processarRetornoMaquina(n)} style={{ padding: "5px 12px", background: "#1A6B3C", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Registrar retorno</OperationalButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr>{["Máquina / equipamento", "Direção", "Contraparte", "NF de saída", "Retorno previsto", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {maquinasF.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 16 }}>{busca ? "Nenhuma máquina encontrada." : "Nenhuma máquina aguardando retorno."}</td></tr>}
                {maquinasF.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{t.maquina_nome}</td>
                    <td style={td}>{t.direcao === "entrada" ? "↘ Entrou (de terceiro)" : "↗ Saiu"}</td>
                    <td style={td}>{t.destinatario_nome}</td>
                    <td style={td}>{t.nf_saida_numero ?? "—"} <span style={{ color: "var(--text-3)" }}>{fmtData(t.nf_saida_data)}</span></td>
                    <td style={td}>{fmtData(t.data_retorno_prevista)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link href={`/fiscal/remessas?aba=maquinas&retorno_maquina=${t.id}`} style={{ fontSize: 11, color: "#1A4870", fontWeight: 600 }}>{t.direcao === "entrada" ? "Registrar devolução" : "Emitir / registrar retorno"} →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {retRem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "min(96vw, 760px)", maxHeight: "92vh", overflowY: "auto", padding: "18px 22px", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{retModo === "arato" ? "Emitir NF-e de retorno" : "Retorno emitido em outro sistema"} — remessa NF {retRem.nf_remessa_numero} · {retRem.destinatario_nome}</div>
                <button type="button" onClick={() => setRetRem(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>Falta voltar {fmtBRL(saldoRemessa(retRem))} · CFOP de retorno {retRem.cfop_retorno}</div>
              {retModo === "externa" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 2fr", gap: 10 }}>
                  <div><label style={lbl}>Número *</label><input value={retExt.numero} onChange={e => setRetExt(p => ({ ...p, numero: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Série</label><input value={retExt.serie} onChange={e => setRetExt(p => ({ ...p, serie: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Chave de acesso</label><input value={retExt.chave} onChange={e => setRetExt(p => ({ ...p, chave: e.target.value }))} style={inp} /></div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><label style={lbl}>Valor do retorno{Object.keys(retExtras).length ? ` — NF ${retRem.nf_remessa_numero}` : ""}</label><input value={retValor} onChange={e => setRetValor(e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Data</label><input type="date" value={retData} onChange={e => setRetData(e.target.value)} style={inp} /></div>
                <div>
                  <label style={lbl}>Volta para o depósito</label>
                  <select value={retVolta} onChange={e => setRetVolta(e.target.value)} style={inp}>
                    <option value="">Selecionar…</option>
                    {depositos.filter(d => !["terceiro", "armazem_terceiro"].includes(d.tipo)).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              </div>
              {(() => {
                // Outras remessas abertas para o mesmo armazém (mesma fazenda e CFOP de retorno): podem voltar na mesma NF
                const mesmas = abertas.filter(x => x.id !== retRem.id && x.fazenda_id === retRem.fazenda_id && x.cfop_retorno === retRem.cfop_retorno
                  && (retRem.destinatario_pessoa_id ? x.destinatario_pessoa_id === retRem.destinatario_pessoa_id : x.destinatario_nome === retRem.destinatario_nome));
                if (!mesmas.length) return null;
                return (
                  <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>Devolver na mesma NF outras remessas deste armazém</div>
                    {mesmas.map(x => {
                      const marcada = x.id in retExtras;
                      return (
                        <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                          <input type="checkbox" checked={marcada} style={{ accentColor: "#1A4870" }}
                            onChange={() => setRetExtras(p => { const n = { ...p }; if (marcada) delete n[x.id]; else n[x.id] = saldoRemessa(x).toFixed(2).replace(".", ","); return n; })} />
                          <span style={{ flex: 1 }}>NF {x.nf_remessa_numero}{x.nf_remessa_data ? ` de ${fmtData(x.nf_remessa_data)}` : ""} · falta voltar {fmtBRL(saldoRemessa(x))}</span>
                          {marcada && <input value={retExtras[x.id]} onChange={e => setRetExtras(p => ({ ...p, [x.id]: e.target.value }))} style={{ ...inp, width: 120, textAlign: "right" }} />}
                        </div>
                      );
                    })}
                    {Object.keys(retExtras).length > 0 && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{retModo === "arato" ? "A NF-e sai com os itens de todas as remessas marcadas e referencia todas as chaves." : "O retorno é registrado em todas as remessas marcadas, cada uma com o seu valor."}</div>}
                  </div>
                );
              })()}
              {retModo === "arato" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                    <div><label style={lbl}>Natureza da operação</label><input value={retNatureza} onChange={e => setRetNatureza(e.target.value)} style={inp} /></div>
                    <div>
                      <label style={lbl}>Emitente</label>
                      <select value={retEmitente} onChange={e => setRetEmitente(e.target.value)} style={inp}>
                        <option value="">{dados.emitentes.length === 1 ? dados.emitentes[0].nome : "Automático"}</option>
                        {dados.emitentes.length > 1 && dados.emitentes.map(e => <option key={`${e.modulo}|${e.fazenda_id}`} value={`${e.modulo}|${e.fazenda_id}`}>{e.nome} — {e.cpf}</option>)}
                      </select>
                    </div>
                  </div>
                  <BlocoTransporte d={dados} t={retTr} set={setRetTr} inp={inp} lbl={lbl} />
                </>
              )}
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Valor menor que o que falta = retorno parcial (os itens voltam na mesma proporção). {retRem.estoque_transferido ? "O estoque sai do depósito do armazém e entra no depósito escolhido." : "Remessa antiga (baixou o estoque): o retorno dá entrada no depósito escolhido."}</div>
              {retErro && <div style={{ padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{retErro}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <OperationalButton data-arato-button="secondary" onClick={() => setRetRem(null)} style={{ padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, cursor: "pointer" }}>Cancelar</OperationalButton>
                <OperationalButton data-arato-button="primary" onClick={confirmarRetorno} disabled={retSalvando} style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{retSalvando ? "Salvando…" : retModo === "arato" ? "Emitir NF-e de retorno" : "Registrar retorno"}</OperationalButton>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function RetornosPage() {
  return <Suspense fallback={null}><RetornosConteudo /></Suspense>;
}
