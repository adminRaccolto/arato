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

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

interface PedidoMin { id: string; nr_pedido?: string; numero?: string; fornecedor_id?: string; contato_fornecedor?: string; status: string; ano_safra_id?: string; ciclo_id?: string; data_vencimento?: string; }

export default function ModalProcessarLote({
  nfs, onClose, onSaved,
}: {
  nfs: Array<{ id: string; fazenda_id: string | null; numero: string | null }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { fazendaId, fazendaIds, contaId } = useAuth();
  const batchFazendaId = nfs[0]?.fazenda_id ?? fazendaId ?? "";

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
        listarPessoasDaConta(contaId ?? batchFazendaId).then(setPessoas).catch(() => setPessoas([])),
      ]);
      setCentros(ccData);
      setDepositos(depData);
      setOps(opsData);
      setAnosSafra(anosData);
      try {
        const { data } = await supabase
          .from("pedidos_compra")
          .select("id, numero, nr_pedido, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
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

  async function processarEmLote() {
    if (!nfs.length) return;
    setSaving(true);
    const erros: string[] = [];
    const tipoDest = settings.tipo_destino;

    for (const nfRef of nfs) {
      try {
        const { data: nf } = await supabase.from("nf_entradas").select("*").eq("id", nfRef.id).single();
        if (!nf) { erros.push(`NF ${nfRef.numero}: não encontrada`); continue; }
        const nfTyped = nf as NfEntrada;

        const ccId  = settings.centro_custo_id || nfTyped.centro_custo_id;
        const ogId  = settings.operacao_gerencial_id || nfTyped.operacao_gerencial_id;
        const cicId = settings.ciclo_id || nfTyped.ciclo_id;

        // 1. Persistir campos de cabeçalho na NF
        const upd: Partial<NfEntrada> = {};
        if (settings.data_vencimento_cp)    upd.data_vencimento_cp    = settings.data_vencimento_cp;
        if (settings.pedido_compra_id)       upd.pedido_compra_id      = settings.pedido_compra_id;
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

        // 2. Decidir se processa agora ou deixa pendente para entrada individual
        const tipoEfetivo = tipoDest === "direto" ? "custo_direto"
          : tipoDest === "estoque" ? settings.tipo_estoque
          : (nfTyped.tipo_entrada ?? "custo_direto");

        if (tipoEfetivo === "custo_direto" && ccId) {
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
          await processarNfEntrada(
            nfTyped.id,
            nfTyped.fazenda_id ?? batchFazendaId,
            itensDireto,
            nfTyped.valor_total,
            nfTyped.emitente_nome,
            // Bug real 02/10/2026: ordem invertida (data_emissao primeiro) descartava a
            // "Data de Entrada" digitada no cabeçalho — ver mesmo fix em ModalNf.tsx.
            nfTyped.data_entrada ?? nfTyped.data_emissao ?? new Date().toISOString().slice(0, 10),
            nfTyped.emitente_cnpj ?? undefined,
            {
              nfeNumero:             nfTyped.numero,
              dataVencimentoCp:      settings.data_vencimento_cp || nfTyped.data_vencimento_cp || undefined,
              tipoEntrada:           "custo_direto",
              anoSafraId:            settings.ano_safra_id || nfTyped.ano_safra_id || undefined,
              cicloId:               cicId || undefined,
              operacaoGerencialId:   ogId  || undefined,
              centroCustoId:         ccId,
              pedidoCompraId:        settings.pedido_compra_id || nfTyped.pedido_compra_id || undefined,
            },
          );
        }
        // Estoque: campos salvos, NF permanece pendente para mapeamento de itens
      } catch (e) {
        erros.push(`NF ${nfRef.numero}: ${e instanceof Error ? e.message : "Erro"}`);
      }
    }
    setSaving(false);
    onSaved();
    onClose();
    if (erros.length) alert("Erros no lote:\n" + erros.join("\n"));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 620, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>
          ⚡ Processar em Lote
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18 }}>
          {nfs.length} NF(s) pendente(s) selecionada(s). Deixe em branco para manter o valor individual de cada NF.
        </div>

        {/* ── Tipo de Destino ── */}
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Tipo de Processamento</label>
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--border-ui)" }}>
            {([
              { v: "" as const,        label: "— não alterar —",     desc: "Mantém o tipo de cada NF" },
              { v: "estoque" as const,  label: "Estoque / Insumos",   desc: "Salva depósito; itens mapeados individualmente" },
              { v: "direto" as const,   label: "Apropriação Direta",  desc: "Processa sem entrada em estoque" },
            ] as const).map(opt => (
              <button key={opt.v} onClick={() => setSettings(p => ({ ...p, tipo_destino: opt.v }))}
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
            <label style={lbl}>Subcategoria do Estoque</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([ ["insumos", "Insumos Agrícolas"], ["pecas", "Peças / Manutenção"], ["combustivel", "Combustível"] ] as const).map(([v, label]) => (
                <button key={v} onClick={() => setSettings(p => ({ ...p, tipo_estoque: v }))}
                  style={{ flex: 1, padding: "7px 8px", border: `0.5px solid ${settings.tipo_estoque === v ? "#1A4870" : "var(--border-ui)"}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, background: settings.tipo_estoque === v ? "#D5E8F5" : "var(--bg-input)", color: settings.tipo_estoque === v ? "#1A4870" : "var(--text-2)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Vencimento da CP</label>
            <InputData type="date" value={settings.data_vencimento_cp} onChange={e => setSettings(p => ({ ...p, data_vencimento_cp: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Ano Safra</label>
            <select value={settings.ano_safra_id} onChange={e => setSettings(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))} style={inp}>
              <option value="">— manter individual —</option>
              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
            </select>
          </div>

          {settings.ano_safra_id && (
            <div>
              <label style={lbl}>Ciclo</label>
              <select value={settings.ciclo_id} onChange={e => setSettings(p => ({ ...p, ciclo_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
            </div>
          )}

          {(settings.tipo_destino === "direto" || settings.tipo_destino === "") && (
            <>
              <div>
                <label style={lbl}>Centro de Custo</label>
                <select value={settings.centro_custo_id} onChange={e => setSettings(p => ({ ...p, centro_custo_id: e.target.value }))} style={inp}>
                  <option value="">— manter individual —</option>
                  {centros.filter(c => !centros.some(x => x.parent_id === c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>OG — Operação Gerencial</label>
                <select value={settings.operacao_gerencial_id} onChange={e => setSettings(p => ({ ...p, operacao_gerencial_id: e.target.value }))} style={inp}>
                  <option value="">— manter individual —</option>
                  {ops.map(o => <option key={o.id} value={o.id}>{o.classificacao ? `${o.classificacao} — ` : ""}{o.descricao}</option>)}
                </select>
              </div>
            </>
          )}

          {(settings.tipo_destino === "estoque" || settings.tipo_destino === "") && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Depósito de Entrada</label>
                <div style={{ display: "flex", gap: 3, background: "var(--bg-input)", borderRadius: 6, padding: 2, border: "0.5px solid var(--border-ui)" }}>
                  {(["proprio", "terceiro"] as const).map(t => (
                    <button key={t} onClick={() => setDepFiltro(t)}
                      style={{ fontSize: 9, fontWeight: 600, padding: "1px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                        background: depFiltro === t ? "#111111" : "transparent",
                        color: depFiltro === t ? "#fff" : "var(--text-3)" }}>
                      {t === "proprio" ? "Próprio" : "Terceiro"}
                    </button>
                  ))}
                </div>
              </div>
              <select value={settings.deposito_destino_id} onChange={e => setSettings(p => ({ ...p, deposito_destino_id: e.target.value }))} style={inp}>
                <option value="">— manter individual —</option>
                {depositos
                  .filter(d => depFiltro === "terceiro"
                    ? ["terceiro", "armazem_terceiro"].includes(d.tipo)
                    : !["terceiro", "armazem_terceiro"].includes(d.tipo))
                  .map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Vincular a Pedido de Compra</label>
            <SelectBusca value={settings.pedido_compra_id} onChange={v => setSettings(p => ({ ...p, pedido_compra_id: v }))}
              placeholder="— sem pedido —" style={inp}
              options={pedidos.map(p => {
                const forn = pessoas.find(x => x.id === p.fornecedor_id)?.nome ?? p.contato_fornecedor ?? "—";
                const nr = p.nr_pedido ?? p.numero ?? p.id.substring(0, 8);
                return { value: p.id, label: `${forn} — PC ${nr} (${p.status})` };
              })}
            />
          </div>
        </div>

        {/* ── Avisos contextuais ── */}
        {settings.tipo_destino === "direto" && settings.centro_custo_id && (
          <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
            ✓ <strong>Apropriação Direta</strong>: todas as NFs serão processadas agora — os itens saem sem dar entrada em estoque. CC e OG serão aplicados.
          </div>
        )}
        {settings.tipo_destino === "direto" && !settings.centro_custo_id && (
          <div style={{ background: "#FFF8E1", border: "0.5px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
            ⚠ Informe o Centro de Custo para processar as NFs como Apropriação Direta.
          </div>
        )}
        {settings.tipo_destino === "estoque" && (
          <div style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1D4ED8", marginBottom: 16 }}>
            ℹ <strong>Estoque / Insumos</strong>: o depósito e as configurações serão salvas. As NFs permanecem <em>Pendentes</em> — abra cada uma para mapear os itens ao catálogo e processar.
          </div>
        )}
        {settings.tipo_destino === "" && settings.centro_custo_id && (
          <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
            ✓ NFs já marcadas como <strong>Custo Direto</strong> serão processadas automaticamente com o CC selecionado.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={btnR} onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            onClick={processarEmLote}
            disabled={saving || (settings.tipo_destino === "direto" && !settings.centro_custo_id)}
            style={{ ...btnV, opacity: (saving || (settings.tipo_destino === "direto" && !settings.centro_custo_id)) ? 0.5 : 1, cursor: saving ? "default" : "pointer" }}
          >
            {saving ? "Processando…" : "Aplicar e Processar"}
          </button>
        </div>
      </div>
    </div>
  );
}
