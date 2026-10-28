"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Modal de Processamento em Lote de NF de Produtos — extraído de
// app/compras/nf/page.tsx (02/10/2026, última das 4 lacunas da Fase 2 de
// unificação de Documentos Fiscais). Lógica de processarEmLote() preservada
// exatamente como estava — só a casca mudou (recebe a lista de NFs
// selecionadas via props em vez de ler um Set da página inteira).
//
// Diferença de arquitetura em relação a ModalNf/ModalNfServico: este modal
// não representa UMA NF — ele aplica uma configuração comum (Centro de
// Custo, Operação Gerencial, Depósito, Ano Safra/Ciclo, Pedido de Compra)
// a VÁRIAS NFs pendentes de uma vez, processando-as quando o tipo de
// destino é "Apropriação Direta" (sem entrada em estoque).
// ═══════════════════════════════════════════════════════════════════════════
import { hojeLocal } from "../../lib/data-local";
import SelectField from "../SelectField";
import InputData from "../../components/InputData";
import { useState, useEffect } from "react";
import {
  atualizarNfEntrada,
  listarNfEntradaItens,
  processarNfEntrada, verificarMovimentoEmpresaNf, registrarAutorizacaoMovimentoEmpresa,
  listarCentrosCustoGeralDaConta,
  listarDepositosMulti,
  listarOperacoesGerenciaisAtivasDaConta,
  listarAnosSafra,
  listarCiclos,
  listarPessoasDaConta,
} from "../../lib/db";
import { useAuth } from "../AuthProvider";
import type { NfEntrada, NfEntradaItem, Deposito, CentroCusto, OperacaoGerencial, AnoSafra, Ciclo, Pessoa } from "../../lib/supabase";
import { supabase } from "../../lib/supabase";
import SelectBusca from "../SelectBusca";
import { CFOPS_RETORNO_ARMAZENAGEM, CFOPS_RETORNO_DE_REMESSA } from "../../lib/cfop-imobilizado";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

interface PedidoMin { id: string; nr_pedido?: string; numero?: string; nr_pedido_fornecedor?: string; fornecedor_id?: string; contato_fornecedor?: string; status: string; ano_safra_id?: string; ciclo_id?: string; data_vencimento?: string; }

const STATUS_PEDIDO: Record<string, string> = { rascunho: "rascunho", aprovado: "aprovado", parcialmente_entregue: "parcialmente entregue", entregue: "entregue" };
const dig = (v?: string | null) => (v ?? "").replace(/\D/g, "");
// Mesma empresa = mesma raiz de CNPJ (matriz e filiais); CPF compara inteiro
const raiz = (v?: string | null) => { const d = dig(v); return d.length === 14 ? d.slice(0, 8) : d; };

export default function ModalProcessarLote({
  nfs, onClose, onSaved,
}: {
  nfs: Array<{ id: string; fazenda_id: string | null; numero: string | null; emitente_nome?: string | null; emitente_cnpj?: string | null; valor?: number | null }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { fazendaId, fazendaIds } = useAuth();
  const batchFazendaId = nfs[0]?.fazenda_id ?? fazendaId ?? "";
  // Lote é de UM fornecedor (o mesmo CPF/CNPJ emitente): a OG, o centro de custo e o pedido valem para todas
  const fornecedores = [...new Map(nfs.map(n => [dig(n.emitente_cnpj) || `nome:${(n.emitente_nome ?? "").trim().toUpperCase()}`, n.emitente_nome ?? "sem emitente"])).values()];
  const fornecedorUnico = fornecedores.length === 1;
  const cnpjLote = dig(nfs[0]?.emitente_cnpj);
  const nomeLote = nfs[0]?.emitente_nome ?? "";
  const totalLote = nfs.reduce((t, n) => t + Number(n.valor ?? 0), 0);

  const [centros, setCentros]   = useState<CentroCusto[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [ops, setOps]           = useState<OperacaoGerencial[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]     = useState<Ciclo[]>([]);
  const [pedidos, setPedidos]   = useState<PedidoMin[]>([]);
  const [pessoas, setPessoas]   = useState<Pessoa[]>([]);
  const [depFiltro, setDepFiltro] = useState<"proprio" | "terceiro">("proprio");

  const [settings, setSettings] = useState({
    pedido_compra_id: "", data_vencimento_cp: "",
    deposito_destino_id: "", centro_custo_id: "",
    ano_safra_id: "", ciclo_id: "",
    operacao_gerencial_id: "",
    tipo_destino: "" as "" | "estoque" | "direto",
    tipo_estoque: "insumos" as "insumos" | "pecas" | "combustivel",
  });
  const [saving, setSaving] = useState(false);

  // Apoio — carregado uma vez, na fazenda da primeira NF selecionada
  useEffect(() => {
    if (!batchFazendaId) return;
    const allFazIds = fazendaIds.length > 1 ? fazendaIds : [batchFazendaId];
    (async () => {
      const [ccData, depData, opsData, anosData] = await Promise.all([
        listarCentrosCustoGeralDaConta(batchFazendaId).catch(() => [] as CentroCusto[]),
        listarDepositosMulti(allFazIds).catch(() => [] as Deposito[]),
        listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, batchFazendaId).catch(() => [] as OperacaoGerencial[]),
        listarAnosSafra(batchFazendaId).catch(() => [] as AnoSafra[]),
        // A função recebe a FAZENDA (resolve a conta por ela); passar o contaId deixava a lista vazia e o pedido sem fornecedor
        listarPessoasDaConta(batchFazendaId).then(setPessoas).catch(() => setPessoas([])),
      ]);
      setCentros(ccData);
      setDepositos(depData);
      setOps(opsData);
      setAnosSafra(anosData);
      try {
        const { data } = await supabase
          .from("pedidos_compra")
          .select("id, numero, nr_pedido, nr_pedido_fornecedor, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
          .in("fazenda_id", allFazIds)
          .in("status", ["rascunho", "aprovado", "parcialmente_entregue", "entregue"])
          .order("created_at", { ascending: false });
        setPedidos((data ?? []) as PedidoMin[]);
      } catch { setPedidos([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFazendaId]);

  // Ciclos do ano safra escolhido
  useEffect(() => {
    if (!settings.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(settings.ano_safra_id, batchFazendaId).then(setCiclos).catch(() => setCiclos([]));
  }, [settings.ano_safra_id, batchFazendaId]);

  // Pedido escolhido: preenche ano safra, ciclo e vencimento vazios (como no processamento individual) e confirma
  // quando o pedido é de outra empresa (compra por conta e ordem)
  function escolherPedido(pedidoId: string) {
    if (!pedidoId) { setSettings(p => ({ ...p, pedido_compra_id: "" })); return; }
    const ped = pedidos.find(x => x.id === pedidoId);
    const forn = pessoas.find(x => x.id === ped?.fornecedor_id);
    if (ped && forn?.cpf_cnpj && cnpjLote && raiz(forn.cpf_cnpj) !== raiz(cnpjLote)) {
      const ok = confirm(`O pedido ${ped.nr_pedido ?? ped.numero ?? ""} é de "${forn.nome}" (${forn.cpf_cnpj}), mas as NFs foram emitidas por "${nomeLote}".\n\nVincule só se for compra por conta e ordem. O título a pagar fica com "${forn.nome}".\n\nVincular mesmo assim?`);
      if (!ok) return;
    }
    setSettings(p => ({
      ...p, pedido_compra_id: pedidoId,
      ano_safra_id: p.ano_safra_id || ped?.ano_safra_id || "",
      ciclo_id: p.ciclo_id || (p.ano_safra_id ? "" : ped?.ciclo_id ?? ""),
      data_vencimento_cp: p.data_vencimento_cp || ped?.data_vencimento || "",
    }));
  }

  async function processarEmLote() {
    if (!nfs.length || !fornecedorUnico) return;
    setSaving(true);
    const erros: string[] = [];
    let processadas = 0, salvas = 0;
    const tipoDest = settings.tipo_destino;
    const ped = settings.pedido_compra_id ? pedidos.find(x => x.id === settings.pedido_compra_id) : undefined;

    for (const nfRef of nfs) {
      try {
        const { data: nf } = await supabase.from("nf_entradas").select("*").eq("id", nfRef.id).single();
        if (!nf) { erros.push(`NF ${nfRef.numero}: não encontrada`); continue; }
        const nfTyped = nf as NfEntrada;
        if (nfTyped.status !== "pendente") { erros.push(`NF ${nfRef.numero}: já está ${nfTyped.status}`); continue; }
        // Retorno de armazém ou de máquina não é compra: vai para Documentos Fiscais → Retornos
        const cfopDig = dig(nfTyped.cfop);
        if (CFOPS_RETORNO_ARMAZENAGEM.has(cfopDig) || CFOPS_RETORNO_DE_REMESSA.has(cfopDig)) { erros.push(`NF ${nfRef.numero}: é retorno (CFOP ${nfTyped.cfop}) — processe em Documentos Fiscais → Retornos`); continue; }
        // Ano Safra é obrigatório: vale o do lote ou o que a NF já tem
        if (!settings.ano_safra_id && !nfTyped.ano_safra_id) { erros.push(`NF ${nfRef.numero}: sem Ano Safra — escolha um no lote ou indique na NF`); continue; }

        const ccId  = settings.centro_custo_id || nfTyped.centro_custo_id;
        const ogId  = settings.operacao_gerencial_id || nfTyped.operacao_gerencial_id;
        const cicId = settings.ciclo_id || nfTyped.ciclo_id;

        // 1. Persistir campos de cabeçalho na NF
        const upd: Partial<NfEntrada> = {};
        if (settings.data_vencimento_cp)    upd.data_vencimento_cp    = settings.data_vencimento_cp;
        if (settings.pedido_compra_id)       upd.pedido_compra_id      = settings.pedido_compra_id;
        if (ped?.fornecedor_id)              upd.pessoa_id             = ped.fornecedor_id;   // fornecedor do título = o do pedido
        if (settings.centro_custo_id)        upd.centro_custo_id       = settings.centro_custo_id;
        if (settings.operacao_gerencial_id)  upd.operacao_gerencial_id = settings.operacao_gerencial_id;
        if (settings.ano_safra_id)           upd.ano_safra_id          = settings.ano_safra_id;
        if (settings.ciclo_id)               upd.ciclo_id              = settings.ciclo_id;
        if (tipoDest === "direto") {
          upd.tipo_entrada = "custo_direto";
        } else if (tipoDest === "estoque") {
          if (settings.deposito_destino_id) (upd as Record<string, unknown>).deposito_destino_id = settings.deposito_destino_id;
          upd.tipo_entrada = settings.tipo_estoque;
        } else {
          if (settings.deposito_destino_id) (upd as Record<string, unknown>).deposito_destino_id = settings.deposito_destino_id;
        }
        if (Object.keys(upd).length) await atualizarNfEntrada(nfTyped.id, upd);

        // 2. Apropriação direta processa agora; estoque fica pendente para associar os itens ao catálogo
        const tipoEfetivo = tipoDest === "direto" ? "custo_direto"
          : tipoDest === "estoque" ? settings.tipo_estoque
          : (nfTyped.tipo_entrada ?? "custo_direto");

        if (tipoEfetivo !== "custo_direto") { salvas++; continue; }
        // Mesmas exigências do processamento individual: OG, centro de custo e ano safra
        if (!ogId) { erros.push(`NF ${nfRef.numero}: sem Operação Gerencial — escolha no lote ou na NF`); continue; }
        if (!ccId) { erros.push(`NF ${nfRef.numero}: sem Centro de Custo — escolha no lote ou na NF`); continue; }

        const itensNf = await listarNfEntradaItens(nfTyped.id);
        const itensDireto = itensNf.map(it => ({
          ...it,
          tipo_apropiacao: "direto" as NfEntradaItem["tipo_apropiacao"],
          centro_custo_id: ccId,
        }));
        const movEmp = await verificarMovimentoEmpresaNf(nfTyped.id);
        if (movEmp) {
          const ok = window.confirm(`NF ${nfTyped.numero}: destinada à empresa ${movEmp.empresa} (CNPJ ${movEmp.cnpj}). O financeiro vai para o CP da EMPRESA e os CPs do produtor desta NF serão cancelados.\n\nAutoriza? Fica registrado no log.`);
          if (!ok) { erros.push(`NF ${nfTyped.numero}: não processada (movimentação para empresa não autorizada)`); continue; }
          registrarAutorizacaoMovimentoEmpresa(batchFazendaId, nfTyped.id, String(nfTyped.numero ?? ""), movEmp.empresa, movEmp.cps_produtor.map(c => c.id));
        }
        // Parcelas: vencimento único do lote, se informado; senão as duplicatas do XML (como no individual)
        const dups = (nfTyped.duplicatas_xml ?? []).filter(d => d.data_vencimento && Number(d.valor) > 0);
        const parcelas = !settings.data_vencimento_cp && dups.length > 1
          ? dups.map(d => ({ data: String(d.data_vencimento).slice(0, 10), valor: Number(d.valor) })) : undefined;
        await processarNfEntrada(
          nfTyped.id,
          nfTyped.fazenda_id ?? batchFazendaId,
          itensDireto,
          nfTyped.valor_total,
          nfTyped.emitente_nome,
          // Bug real 02/10/2026: ordem invertida (data_emissao primeiro) descartava a
          // "Data de Entrada" digitada no cabeçalho — ver mesmo fix em ModalNf.tsx.
          nfTyped.data_entrada ?? nfTyped.data_emissao ?? hojeLocal(),
          nfTyped.emitente_cnpj ?? undefined,
          {
            nfeNumero:             nfTyped.numero,
            dataVencimentoCp:      settings.data_vencimento_cp || nfTyped.data_vencimento_cp || dups[0]?.data_vencimento || undefined,
            formaPagamento:        nfTyped.forma_pagamento || undefined,
            tipoEntrada:           "custo_direto",
            anoSafraId:            settings.ano_safra_id || nfTyped.ano_safra_id || undefined,
            cicloId:               cicId || undefined,
            operacaoGerencialId:   ogId,
            centroCustoId:         ccId,
            pedidoCompraId:        settings.pedido_compra_id || nfTyped.pedido_compra_id || undefined,
            produtorId:            nfTyped.produtor_id || undefined,
            parcelas,
          },
        );
        processadas++;
      } catch (e) {
        erros.push(`NF ${nfRef.numero}: ${e instanceof Error ? e.message : "Erro"}`);
      }
    }
    setSaving(false);
    onSaved();
    onClose();
    const resumo = [processadas ? `${processadas} processada(s)` : "", salvas ? `${salvas} salva(s) pendente(s) para associar os itens` : ""].filter(Boolean).join(" · ");
    if (erros.length) alert(`${resumo ? resumo + "\n\n" : ""}Não processadas:\n${erros.join("\n")}`);
    else if (resumo) alert(resumo);
  }

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}>
      <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 620, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div data-arato-dialog-body="true" style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>
          ⚡ Processar em Lote
        </div>
        <div data-arato-dialog-body="true" style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14 }}>
          {nfs.length} NF(s) pendente(s) selecionada(s){totalLote ? ` · ${totalLote.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}. Campos em branco mantêm o valor de cada NF.
        </div>
        {fornecedorUnico ? (
          <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 18 }}>
            Fornecedor: <strong>{nomeLote || "—"}</strong>{cnpjLote ? <span style={{ color: "var(--text-3)" }}> · {nfs[0]?.emitente_cnpj}</span> : null}
          </div>
        ) : (
          <div style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#B91C1C", marginBottom: 18 }}>
            O processamento em lote é de um fornecedor só, e a seleção tem {fornecedores.length}: {fornecedores.slice(0, 4).join(", ")}{fornecedores.length > 4 ? "…" : ""}. Selecione as NFs de um fornecedor por vez.
          </div>
        )}

        {/* ── Tipo de Destino ── */}
        <div data-arato-dialog-body="true" style={{ marginBottom: 18 }}>
          <label data-arato-label="true" style={lbl}>Tipo de Processamento</label>
          <div data-arato-dialog-body="true" style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--border-ui)" }}>
            {([
              { v: "" as const,        label: "— não alterar —",     desc: "Mantém o tipo de cada NF" },
              { v: "estoque" as const,  label: "Estoque / Insumos",   desc: "Salva depósito; itens mapeados individualmente" },
              { v: "direto" as const,   label: "Apropriação Direta",  desc: "Processa sem entrada em estoque" },
            ] as const).map(opt => (
              <button data-arato-button="toggle" key={opt.v} onClick={() => setSettings(p => ({ ...p, tipo_destino: opt.v }))}
                title={opt.desc}
                style={{
                  flex: 1, padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: settings.tipo_destino === opt.v
                    ? (opt.v === "direto" ? "#166534" : opt.v === "estoque" ? "#1A4870" : "#374151")
                    : "var(--bg-input)",
                  color: settings.tipo_destino === opt.v ? "#fff" : "var(--text-2)",
                  borderRight: opt.v !== "direto" ? "0.5px solid var(--border-ui)" : "none",
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-tipo de estoque — só quando "estoque" está selecionado */}
        {settings.tipo_destino === "estoque" && (
          <div style={{ marginBottom: 14 }}>
            <label data-arato-label="true" style={lbl}>Subcategoria do Estoque</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([ ["insumos", "Insumos Agrícolas"], ["pecas", "Peças / Manutenção"], ["combustivel", "Combustível"] ] as const).map(([v, label]) => (
                <button data-arato-button="toggle" key={v} onClick={() => setSettings(p => ({ ...p, tipo_estoque: v }))}
                  style={{ flex: 1, padding: "7px 8px", border: `0.5px solid ${settings.tipo_estoque === v ? "#1A4870" : "var(--border-ui)"}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, background: settings.tipo_estoque === v ? "#D5E8F5" : "var(--bg-input)", color: settings.tipo_estoque === v ? "#1A4870" : "var(--text-2)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div data-arato-dialog-body="true">
            <label data-arato-label="true" style={lbl}>Vencimento da CP</label>
            <InputData type="date" value={settings.data_vencimento_cp} onChange={e => setSettings(p => ({ ...p, data_vencimento_cp: e.target.value }))} style={inp} />
          </div>
          <div data-arato-dialog-body="true">
            <label data-arato-label="true" style={lbl}>Ano Safra (obrigatório — vale para as NFs que ainda não têm)</label>
            <SelectField value={settings.ano_safra_id} onChange={e => setSettings(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))} style={inp}>
              <option value="">— manter individual —</option>
              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
            </SelectField>
          </div>

          {settings.ano_safra_id && (
            <div>
              <label data-arato-label="true" style={lbl}>Ciclo</label>
              <SelectField value={settings.ciclo_id} onChange={e => setSettings(p => ({ ...p, ciclo_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </SelectField>
            </div>
          )}

          <div>
            <label data-arato-label="true" style={lbl}>OG — Operação Gerencial</label>
            <SelectBusca value={settings.operacao_gerencial_id} onChange={v => setSettings(p => ({ ...p, operacao_gerencial_id: v }))} style={inp}
              placeholder="— manter individual —"
              options={ops.map(o => ({ value: o.id, label: `${o.classificacao ? `${o.classificacao} — ` : ""}${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))} />
          </div>
          <div>
            <label data-arato-label="true" style={lbl}>Centro de Custo</label>
            <SelectBusca value={settings.centro_custo_id} onChange={v => setSettings(p => ({ ...p, centro_custo_id: v }))} style={inp}
              placeholder="— manter individual —"
              options={centros.filter(c => !centros.some(x => x.parent_id === c.id)).map(c => ({ value: c.id, label: `${c.codigo ? `${c.codigo} — ` : ""}${c.nome}` }))} />
          </div>

          {(settings.tipo_destino === "estoque" || settings.tipo_destino === "") && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <label data-arato-label="true" style={{ ...lbl, marginBottom: 0 }}>Depósito de Entrada</label>
                <div style={{ display: "flex", gap: 3, background: "var(--bg-input)", borderRadius: 6, padding: 2, border: "0.5px solid var(--border-ui)" }}>
                  {(["proprio", "terceiro"] as const).map(t => (
                    <button data-arato-button="toggle" key={t} onClick={() => setDepFiltro(t)}
                      style={{ fontSize: 9, fontWeight: 600, padding: "1px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                        background: depFiltro === t ? "#111111" : "transparent",
                        color: depFiltro === t ? "#fff" : "var(--text-3)" }}>
                      {t === "proprio" ? "Próprio" : "Terceiro"}
                    </button>
                  ))}
                </div>
              </div>
              <SelectField value={settings.deposito_destino_id} onChange={e => setSettings(p => ({ ...p, deposito_destino_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {depositos
                  .filter(d => depFiltro === "terceiro"
                    ? ["terceiro", "armazem_terceiro"].includes(d.tipo)
                    : !["terceiro", "armazem_terceiro"].includes(d.tipo))
                  .map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </SelectField>
            </div>
          )}

          <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
            <label data-arato-label="true" style={lbl}>Vincular a Pedido de Compra</label>
            <SelectBusca value={settings.pedido_compra_id} onChange={escolherPedido}
              placeholder="— sem pedido —" style={inp}
              options={pedidos
                .map(p => {
                  const pf = pessoas.find(x => x.id === p.fornecedor_id);
                  const doFornecedor = !!cnpjLote && !!pf?.cpf_cnpj && raiz(pf.cpf_cnpj) === raiz(cnpjLote);
                  const nr = p.nr_pedido ?? (p.numero != null ? String(p.numero) : p.id.substring(0, 8));
                  const nrForn = p.nr_pedido_fornecedor && p.nr_pedido_fornecedor !== nr ? ` · ped. fornecedor ${p.nr_pedido_fornecedor}` : "";
                  return { doFornecedor, opt: { value: p.id,
                    label: `${doFornecedor ? "★ " : ""}${pf?.nome ?? p.contato_fornecedor ?? "fornecedor não informado"} — PC ${nr}${nrForn} (${STATUS_PEDIDO[p.status] ?? p.status})`,
                    group: doFornecedor ? "Pedidos deste fornecedor" : "Outros fornecedores (conta e ordem)" } };
                })
                .sort((a, b) => Number(b.doFornecedor) - Number(a.doFornecedor))
                .map(x => x.opt)}
            />
          </div>
        </div>

        {/* ── Avisos contextuais ── */}
        {settings.tipo_destino === "direto" && (
          <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
            ✓ <strong>Apropriação Direta</strong>: as NFs são processadas agora, sem entrada em estoque, e geram o Contas a Pagar (vencimento do lote ou as parcelas do XML de cada NF). Cada NF precisa de Operação Gerencial, Centro de Custo e Ano Safra — os do lote ou os que ela já tem; a que faltar fica pendente e aparece no resumo.
          </div>
        )}
        {settings.tipo_destino === "estoque" && (
          <div style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1D4ED8", marginBottom: 16 }}>
            ℹ <strong>Estoque / Insumos</strong>: os campos acima são gravados em todas as NFs, que continuam <em>Pendentes</em> — abra cada uma para associar os itens ao catálogo e processar.
          </div>
        )}
        {settings.tipo_destino === "" && (
          <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>
            NFs já marcadas como <strong>Apropriação Direta</strong> são processadas; as de estoque só recebem os campos acima e continuam pendentes.
          </div>
        )}

        <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button data-arato-button="secondary" style={btnR} onClick={onClose} disabled={saving}>Cancelar</button>
          <button data-arato-button="primary"
            onClick={processarEmLote}
            disabled={saving || !fornecedorUnico}
            style={{ ...btnV, opacity: (saving || !fornecedorUnico) ? 0.5 : 1, cursor: saving || !fornecedorUnico ? "default" : "pointer" }}
          >
            {saving ? "Processando…" : settings.tipo_destino === "estoque" ? "Aplicar às NFs" : "Aplicar e Processar"}
          </button>
        </div>
      </div>
    </div>
  );
}
