"use client";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalGrid } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import InputData from "../../../components/InputData";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { agruparEventos, type Tipo } from "../../../lib/auditoria/descrever";
import { createBrowserClient } from "@supabase/ssr";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/components/AuthProvider";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AuditEntry = {
  id: string;
  fazenda_id: string | null;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE" | "LOGIN" | "CUSTOM";
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  campos_alterados: string[] | null;
  usuario_app: string | null;
  created_at: string;
};

const TABELA_LABEL: Record<string, string> = {
  lancamentos: "CP / CR",
  folha_pagamento: "Folha de Pagamento",
  folha_funcionarios: "Func. na Folha",
  contratos: "Contratos de Grãos",
  contratos_financeiros: "Contratos Financeiros",
  romaneios: "Romaneios",
  pedidos_compra: "Pedidos de Compra",
};

const STATUS_CANCELADO = ["cancelado", "cancelada"];
const TIPO_LABEL: Record<Tipo, string> = {
  criou: "Criou", alterou: "Alterou", excluiu: "Excluiu", cancelou: "Cancelou", baixou: "Baixou", estornou: "Estornou",
  conciliou: "Conciliou", aprovou: "Aprovou", fechou: "Fechou", reabriu: "Reabriu", vinculou: "Vinculou",
};
const TIPO_COR: Record<Tipo, { bg: string; color: string; border: string }> = {
  criou:     { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  aprovou:   { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  alterou:   { bg: "#FEF9C3", color: "#854D0E", border: "#FDE047" },
  excluiu:   { bg: "#FEE2E2", color: "#B91C1C", border: "#FCA5A5" },
  cancelou:  { bg: "#F3E8FF", color: "#6B21A8", border: "#C4B5FD" },
  baixou:    { bg: "#D5E8F5", color: "#0B2D50", border: "#93C5FD" },
  fechou:    { bg: "#D5E8F5", color: "#0B2D50", border: "#93C5FD" },
  conciliou: { bg: "#E0F2F1", color: "#115E59", border: "#99D5CF" },
  estornou:  { bg: "#FFEDD5", color: "#9A3412", border: "#FDBA74" },
  reabriu:   { bg: "#FFEDD5", color: "#9A3412", border: "#FDBA74" },
  vinculou:  { bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" },
};
/** Alteração que levou o registro para cancelado (o banco grava como UPDATE do status). */
function ehCancelamento(l: { acao: string; dados_antes: Record<string, unknown> | null; dados_depois: Record<string, unknown> | null }) {
  return l.acao === "UPDATE"
    && STATUS_CANCELADO.includes(String(l.dados_depois?.status ?? ""))
    && !STATUS_CANCELADO.includes(String(l.dados_antes?.status ?? ""));
}

const CAMPOS_SENSIVEIS = ["senha", "password", "token", "secret", "chave_pix"];

function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("pt-BR");
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T12:00:00").toLocaleDateString("pt-BR");
    if (v.length > 80) return v.slice(0, 80) + "…";
    return v;
  }
  if (typeof v === "object") return JSON.stringify(v).slice(0, 100);
  return String(v);
}

function campoLabel(campo: string): string {
  const mapa: Record<string, string> = {
    valor: "Valor", status: "Status", descricao: "Descrição",
    data_vencimento: "Vencimento", data_baixa: "Data Baixa", valor_pago: "Valor Pago",
    categoria: "Categoria", pessoa_id: "Fornecedor/Cliente", fazenda_id: "Fazenda",
    competencia: "Competência", valor_bruto: "Valor Bruto", valor_liquido: "Valor Líquido",
    produto: "Produto", quantidade_kg: "Quantidade (kg)", preco: "Preço",
    numero: "Número", obs: "Observação", moeda: "Moeda",
    nome: "Nome", salario_base: "Salário Base", salario_bruto: "Salário Bruto",
    inss_patronal: "INSS Patronal", fgts_total: "FGTS",
    natureza: "Natureza", origem_lancamento: "Origem",
    valor_financiado: "Valor Financiado", tipo: "Tipo",
  };
  return mapa[campo] ?? campo.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}


// ── Colunas e filtros próprios de cada tabela (aparecem quando a Tabela é escolhida) ──
type Dados = Record<string, unknown>;
type ColAud = { k: string; label: string; tipo?: "valor" | "data" | "texto"; filtro?: "texto" | "faixa"; get: (d: Dados, nomes: Record<string, string>) => unknown };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const COLS_TABELA: Record<string, ColAud[]> = {
  lancamentos: [
    { k: "tipo", label: "CP/CR", get: d => d.tipo === "receber" ? "CR" : d.tipo === "pagar" ? "CP" : "" },
    { k: "pessoa", label: "Fornecedor / Cliente", filtro: "texto", get: (d, n) => (d.pessoa_id ? n[String(d.pessoa_id)] : "") || "" },
    { k: "descricao", label: "Descrição", filtro: "texto", get: d => d.descricao },
    { k: "documento", label: "Documento", filtro: "texto", get: d => d.nfe_numero || d.numero_documento || "" },
    { k: "vencimento", label: "Vencimento", tipo: "data", get: d => d.data_vencimento },
    { k: "moeda", label: "Moeda", get: d => d.moeda },
    { k: "valor", label: "Valor", tipo: "valor", filtro: "faixa", get: d => num(d.valor) },
    { k: "status", label: "Status", get: d => d.status },
  ],
  contratos: [
    { k: "numero", label: "Nº Contrato", filtro: "texto", get: d => d.numero },
    { k: "comprador", label: "Comprador", filtro: "texto", get: (d, n) => (d.pessoa_id ? n[String(d.pessoa_id)] : "") || d.comprador || "" },
    { k: "produto", label: "Produto", filtro: "texto", get: d => d.produto },
    { k: "safra", label: "Safra", get: d => d.safra },
    { k: "quantidade", label: "Quantidade", tipo: "valor", filtro: "faixa", get: d => num(d.quantidade_sc ?? d.quantidade_kg) },
    { k: "preco", label: "Preço", tipo: "valor", get: d => num(d.preco) },
    { k: "status", label: "Status", get: d => d.status },
  ],
  pedidos_compra: [
    { k: "numero", label: "Nº Pedido", filtro: "texto", get: d => d.numero },
    { k: "fornecedor", label: "Fornecedor", filtro: "texto", get: (d, n) => (d.fornecedor_id ? n[String(d.fornecedor_id)] : "") || "" },
    { k: "nr_forn", label: "Pedido do fornecedor", filtro: "texto", get: d => d.nr_pedido_fornecedor },
    { k: "valor", label: "Valor total", tipo: "valor", filtro: "faixa", get: d => num(d.valor_total) },
    { k: "status", label: "Status", get: d => d.status },
  ],
  contratos_financeiros: [
    { k: "descricao", label: "Descrição", filtro: "texto", get: d => d.descricao },
    { k: "documento", label: "Nº documento", filtro: "texto", get: d => d.numero_documento },
    { k: "credor", label: "Credor", filtro: "texto", get: (d, n) => (d.pessoa_id ? n[String(d.pessoa_id)] : "") || "" },
    { k: "valor", label: "Valor financiado", tipo: "valor", filtro: "faixa", get: d => num(d.valor_financiado) },
    { k: "status", label: "Status", get: d => d.status },
  ],
  folha_pagamento: [
    { k: "competencia", label: "Competência", filtro: "texto", get: d => d.competencia },
    { k: "valor", label: "Valor bruto", tipo: "valor", filtro: "faixa", get: d => num(d.valor_bruto) },
    { k: "liquido", label: "Valor líquido", tipo: "valor", get: d => num(d.valor_liquido) },
    { k: "status", label: "Status", get: d => d.status },
  ],
  romaneios: [
    { k: "numero", label: "Nº Romaneio", filtro: "texto", get: d => d.numero_romaneio },
    { k: "produto", label: "Produto", filtro: "texto", get: d => d.produto },
    { k: "peso", label: "Peso líquido (kg)", tipo: "valor", filtro: "faixa", get: d => num(d.peso_liquido_kg) },
  ],
};
const IDS_PESSOA = ["pessoa_id", "fornecedor_id"];
const fmtCel = (c: ColAud, v: unknown) => {
  if (v == null || v === "") return "—";
  if (c.tipo === "valor" && typeof v === "number") return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c.tipo === "data") return fmtVal(v);
  return String(v);
};

// ── Componente DiffRow ──────────────────────────────────────────────────────
function DiffRow({ campo, antes, depois }: { campo: string; antes: unknown; depois: unknown }) {
  const isSens = CAMPOS_SENSIVEIS.some(s => campo.toLowerCase().includes(s));
  const aStr = isSens ? "••••••" : fmtVal(antes);
  const dStr = isSens ? "••••••" : fmtVal(depois);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 24px 1fr", gap: 6, alignItems: "start", padding: "4px 0", borderBottom: "0.5px solid #F0F0F0" }}>
      <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>{campoLabel(campo)}</div>
      <div style={{ fontSize: 11, color: "#B91C1C", background: "#FEF2F2", borderRadius: 4, padding: "2px 6px", wordBreak: "break-all" }}>{aStr}</div>
      <div style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>→</div>
      <div style={{ fontSize: 11, color: "#15803D", background: "#F0FDF4", borderRadius: 4, padding: "2px 6px", wordBreak: "break-all" }}>{dStr}</div>
    </div>
  );
}

// ── Contexto do evento: explica o que aconteceu, com os registros envolvidos (carregado ao abrir a linha) ──
const MARCA_SALDO_ZERADO = "[Saldo do pedido zerado pelas NFs vinculadas]";
const ORIGEM_LABEL: Record<string, string> = {
  nf_entrada: "NF de Entrada", nf_saida: "NF de Saída", pedido_compra: "Pedido de Compra", arrendamento: "Arrendamento",
  tesouraria: "Tesouraria", contrato_financeiro: "Contrato Financeiro", consorcio: "Consórcio", manual: "Lançamento manual",
  compra_terra: "Compra de Terra", nf_servico: "NF de Serviço", seguro: "Seguro", folha: "Folha de Pagamento",
  cartao_fatura: "Fatura de Cartão", cte: "CT-e", previsao: "Previsão de Gastos", apoio_financeiro: "Apoio Financeiro",
};
type Ctx = {
  pessoa?: string; nf?: { numero: string; emitente: string } | null;
  pedido?: { numero: string; fornecedor: string; total: number; moeda: string } | null;
  nfsPedido?: { numero: string; emitente: string; data: string | null; valor: number; status: string; processado_por: string | null }[];
};
const moedaFmt = (v: number, moeda?: unknown) => moeda === "USD"
  ? `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ContextoEvento({ entry, usuario }: { entry: AuditEntry; usuario: string | null }) {
  const d = (entry.dados_depois ?? entry.dados_antes ?? {}) as Dados;
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const ehLanc = entry.tabela === "lancamentos";
  const cancelPorSaldo = ehLanc && entry.acao === "UPDATE" && String(entry.dados_depois?.observacao ?? "").includes(MARCA_SALDO_ZERADO)
    && entry.dados_depois?.status === "cancelado" && entry.dados_antes?.status !== "cancelado";
  const reativadoPorEstorno = ehLanc && entry.acao === "UPDATE" && entry.dados_antes?.status === "cancelado"
    && String(entry.dados_antes?.observacao ?? "").includes(MARCA_SALDO_ZERADO) && entry.dados_depois?.status !== "cancelado";

  useEffect(() => {
    if (!ehLanc) return;
    let vivo = true;
    (async () => {
      const c: Ctx = {};
      if (d.pessoa_id) {
        const { data } = await sb.from("pessoas").select("nome").eq("id", String(d.pessoa_id)).maybeSingle();
        c.pessoa = data?.nome ?? undefined;
      }
      if (d.nf_entrada_id) {
        const { data } = await sb.from("nf_entradas").select("numero, emitente_nome").eq("id", String(d.nf_entrada_id)).maybeSingle();
        c.nf = data ? { numero: String(data.numero ?? ""), emitente: String(data.emitente_nome ?? "") } : null;
      }
      if (d.origem_lancamento === "pedido_compra" && entry.registro_id) {
        const { data: ped } = await sb.from("pedidos_compra").select("id, numero, nr_pedido_fornecedor, fornecedor_id, total_financeiro").eq("lancamento_id", entry.registro_id).maybeSingle();
        if (ped) {
          let forn = "";
          if (ped.fornecedor_id) { const { data: f } = await sb.from("pessoas").select("nome").eq("id", ped.fornecedor_id).maybeSingle(); forn = f?.nome ?? ""; }
          c.pedido = { numero: String(ped.numero ?? "") + (ped.nr_pedido_fornecedor ? ` (nº do fornecedor ${ped.nr_pedido_fornecedor})` : ""), fornecedor: forn, total: Number(ped.total_financeiro ?? 0), moeda: String(d.moeda ?? "BRL") };
          const { data: nfs } = await sb.from("nf_entradas").select("numero, emitente_nome, data_entrada, data_emissao, valor_total, status, processado_por")
            .eq("pedido_compra_id", ped.id).order("data_emissao");
          c.nfsPedido = (nfs ?? []).map(n => ({ numero: String(n.numero ?? ""), emitente: String(n.emitente_nome ?? ""), data: (n.data_entrada ?? n.data_emissao) as string | null, valor: Number(n.valor_total ?? 0), status: String(n.status ?? ""), processado_por: (n.processado_por as string | null) ?? null }));
        }
      }
      if (vivo) setCtx(c);
    })();
    return () => { vivo = false; };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ehLanc) return null;
  const valor = Number(d.valor ?? 0);
  const linha = (rot: string, val: React.ReactNode) => (
    <><div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>{rot}</div><div style={{ fontSize: 12, color: "#1a1a1a" }}>{val}</div></>
  );
  const somaNfs = (ctx?.nfsPedido ?? []).filter(n => n.status === "processada").reduce((t, n) => t + n.valor, 0);
  return (
    <div style={{ display: "grid", gap: 10, margin: "6px 0" }}>
      {cancelPorSaldo && (
        <div style={{ background: "#F3E8FF", border: "0.5px solid #C4B5FD", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#3B0764", lineHeight: 1.5 }}>
          <strong>Cancelamento automático feito pelo sistema</strong> — ninguém cancelou este título à mão. Ele era o título do
          {ctx?.pedido ? <> <strong>Pedido de Compra nº {ctx.pedido.numero}</strong></> : " Pedido de Compra"}, que representa no fluxo de caixa o saldo do pedido ainda sem nota.
          Quando as NFs vinculadas ao pedido foram processadas e cobriram o total, o sistema cancelou este título para o valor não contar em dobro
          (as NFs já geraram os próprios títulos no Contas a Pagar).{usuario ? <> O cancelamento foi disparado quando <strong>{usuario}</strong> processou a NF.</> : null}
          {" "}Se uma dessas NFs for estornada, o título volta sozinho com o saldo.
        </div>
      )}
      {reativadoPorEstorno && (
        <div style={{ background: "#D5E8F5", border: "0.5px solid #1A4870", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50", lineHeight: 1.5 }}>
          <strong>Reativado automaticamente pelo sistema</strong> — uma NF vinculada ao pedido foi estornada ou excluída e o saldo do pedido voltou a existir, então o título do pedido voltou para em aberto com esse saldo.
        </div>
      )}
      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 6 }}>Título</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 12px" }}>
          {linha("Tipo", d.tipo === "receber" ? "Conta a Receber" : "Conta a Pagar")}
          {linha("Descrição", String(d.descricao ?? "—"))}
          {linha(d.tipo === "receber" ? "Cliente" : "Fornecedor", ctx?.pessoa ?? (d.pessoa_id ? "…" : "—"))}
          {linha("Valor", moedaFmt(valor, d.moeda))}
          {linha("Vencimento", fmtVal(d.data_vencimento))}
          {linha("Origem", ORIGEM_LABEL[String(d.origem_lancamento ?? "")] ?? String(d.origem_lancamento ?? "—"))}
          {ctx?.nf && linha("NF", `${ctx.nf.numero} — ${ctx.nf.emitente}`)}
        </div>
      </div>
      {ctx?.pedido && (
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 6 }}>
            Pedido de Compra nº {ctx.pedido.numero}{ctx.pedido.fornecedor ? ` — ${ctx.pedido.fornecedor}` : ""} · total {moedaFmt(ctx.pedido.total, ctx.pedido.moeda)}
          </div>
          {(ctx.nfsPedido ?? []).length === 0 ? <div style={{ fontSize: 12, color: "#666" }}>Nenhuma NF vinculada a este pedido hoje.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{["NF", "Emitente", "Data", "Valor", "Situação", "Processada por"].map(h => <th key={h} style={{ textAlign: h === "Valor" ? "right" : "left", fontSize: 10, color: "#888", padding: "4px 6px", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>)}</tr></thead>
              <tbody>
                {(ctx.nfsPedido ?? []).map((n, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 6px" }}>{n.numero}</td>
                    <td style={{ padding: "4px 6px" }}>{n.emitente}</td>
                    <td style={{ padding: "4px 6px" }}>{fmtVal(n.data)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{moedaFmt(n.valor)}</td>
                    <td style={{ padding: "4px 6px" }}>{n.status}</td>
                    <td style={{ padding: "4px 6px" }}>{n.processado_por ?? "—"}</td>
                  </tr>
                ))}
                <tr><td colSpan={3} style={{ padding: "4px 6px", fontWeight: 600 }}>Total das NFs processadas</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>{moedaFmt(somaNfs)}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
          )}
          {ctx.pedido.moeda === "USD" && (ctx.nfsPedido ?? []).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#7A4300", background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 6, padding: "6px 10px" }}>
              Atenção: o pedido está em dólar e as NFs em reais. O saldo foi calculado comparando os dois valores sem converter a moeda.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente ExpandedDetail ───────────────────────────────────────────────
function ExpandedDetail({ entry, usuario }: { entry: AuditEntry; usuario: string | null }) {
  return (
    <>
      <ContextoEvento entry={entry} usuario={usuario} />
      <DetalheCampos entry={entry} />
    </>
  );
}

function DetalheCampos({ entry }: { entry: AuditEntry }) {
  const campos = entry.campos_alterados ?? [];

  if (entry.acao === "DELETE" && entry.dados_antes) {
    const chaves = ["id", "descricao", "nome", "competencia", "numero", "produto", "valor", "valor_bruto", "data_vencimento", "status", "categoria"];
    const exibir = chaves.filter(c => entry.dados_antes![c] != null);
    return (
      <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#B91C1C", marginBottom: 8 }}>📄 Snapshot do registro excluído</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 12px" }}>
          {exibir.map(c => (
            <><div key={c + "l"} style={{ fontSize: 11, color: "#7F1D1D", fontWeight: 600 }}>{campoLabel(c)}</div>
            <div key={c + "v"} style={{ fontSize: 11, color: "#B91C1C" }}>{fmtVal(entry.dados_antes![c])}</div></>
          ))}
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, color: "#9CA3AF", cursor: "pointer" }}>Ver registro completo</summary>
          <pre style={{ fontSize: 10, color: "#374151", background: "#F9FAFB", borderRadius: 4, padding: 8, marginTop: 4, overflowX: "auto", maxHeight: 200 }}>
            {JSON.stringify(entry.dados_antes, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  if (entry.acao === "UPDATE" && campos.length > 0) {
    return (
      <div style={{ background: "#FFFBEB", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#854D0E", marginBottom: 8 }}>
          ✏ {campos.length} campo{campos.length > 1 ? "s" : ""} alterado{campos.length > 1 ? "s" : ""}
        </div>
        {campos.map(c => (
          <DiffRow key={c} campo={c} antes={entry.dados_antes?.[c]} depois={entry.dados_depois?.[c]} />
        ))}
      </div>
    );
  }

  if (entry.acao === "INSERT" && entry.dados_depois) {
    const chaves = ["id", "descricao", "nome", "competencia", "numero", "produto", "valor", "valor_bruto", "data_vencimento", "status", "categoria"];
    const exibir = chaves.filter(c => entry.dados_depois![c] != null);
    return (
      <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", marginBottom: 8 }}>📄 Registro criado</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 12px" }}>
          {exibir.map(c => (
            <><div key={c + "l"} style={{ fontSize: 11, color: "#14532D", fontWeight: 600 }}>{campoLabel(c)}</div>
            <div key={c + "v"} style={{ fontSize: 11, color: "#15803D" }}>{fmtVal(entry.dados_depois![c])}</div></>
          ))}
        </div>
      </div>
    );
  }

  return <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 0" }}>Sem detalhes disponíveis.</div>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// ── Página principal ────────────────────────────────────────────────────────
export default function AuditoriaPage() {
  const { fazendaIds, fazendaId } = useAuth();
  const [logs, setLogs]         = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [pagina, setPagina]     = useState(0);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const PAGE = 500;

  // Carrega mapa UUID→nome para resolver registros já gravados como UUID
  useEffect(() => {
    if (!fazendaId) return;
    sb.from("perfis").select("user_id, nome").in("fazenda_id", fazendaIds).then(({ data }) => {
      if (!data) return;
      const m: Record<string, string> = {};
      data.forEach(p => { if (p.user_id && p.nome) m[p.user_id] = p.nome; });
      setUsersMap(m);
    });
  }, [fazendaId, fazendaIds]);

  const resolveUser = (uid: string | null) => {
    if (!uid) return null;
    if (UUID_RE.test(uid)) return usersMap[uid] ?? uid.slice(0, 8) + "…";
    return uid;
  };

  // Filtros
  const hoje = hojeLocal();
  const [fDe,     setFDe]     = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [fAte,    setFAte]    = useState(hoje);
  const [fTabela, setFTabela] = useState("");
  const [fAcao,   setFAcao]   = useState("");
  const [fBusca,        setFBusca]        = useState("");
  const [ocultarSistema, setOcultarSistema] = useState(true);
  // Filtros da tabela escolhida: texto por coluna e faixa (de/até) nas colunas de valor
  const [fCols, setFCols] = useState<Record<string, string>>({});
  const colsTabela = useMemo(() => (fTabela ? (COLS_TABELA[fTabela] ?? []) : []), [fTabela]);
  useEffect(() => { setFCols({}); }, [fTabela]);
  const [nomesPessoas, setNomesPessoas] = useState<Record<string, string>>({});

  // Fetch manual — não reage a mudança de filtro; só dispara via botão ou mount
  const carregar = useCallback(async (pag = 0) => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      let q = sb.from("audit_log")
        .select("*")
        .in("fazenda_id", fazendaIds)
        .gte("created_at", fDe + "T00:00:00")
        .lte("created_at", fAte + "T23:59:59")
        .order("created_at", { ascending: false })
        .range(pag * PAGE, (pag + 1) * PAGE - 1);

      if (fTabela) q = q.eq("tabela", fTabela);
      if (fAcao === "CANCEL") q = q.eq("acao", "UPDATE").in("dados_depois->>status", STATUS_CANCELADO);
      else if (fAcao) q = q.eq("acao", fAcao);

      const { data, error } = await q;
      if (error) throw error;
      const lidos = ((data ?? []) as AuditEntry[]).filter(l => fAcao !== "CANCEL" || ehCancelamento(l));
      // Nome do fornecedor/cliente/comprador dos registros (o log guarda só o id)
      const ids = [...new Set(lidos.flatMap(l => IDS_PESSOA.map(k => (l.dados_depois ?? l.dados_antes ?? {})[k]).filter(Boolean).map(String)))];
      if (ids.length) {
        const m: Record<string, string> = {};
        for (let i = 0; i < ids.length; i += 200) {
          const { data: ps } = await sb.from("pessoas").select("id, nome").in("id", ids.slice(i, i + 200));
          for (const p of ps ?? []) m[p.id as string] = p.nome as string;
        }
        setNomesPessoas(prev => ({ ...prev, ...m }));
      }
      setLogs(prev => pag === 0 ? lidos : [...prev, ...lidos]);
      setPagina(pag);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  // Filtros entram nas dependências: antes a função guardava os filtros da primeira carga e o Atualizar os ignorava
  }, [fazendaId, fazendaIds, fDe, fAte, fTabela, fAcao]);

  // Recarrega ao abrir e quando muda período, tabela ou ação (a busca filtra o que já foi carregado)
  useEffect(() => { if (fazendaId && fDe && fAte) carregar(0); }, [carregar, fazendaId, fDe, fAte]);

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      if (colsTabela.length) {
        const d = (l.dados_depois ?? l.dados_antes ?? {}) as Dados;
        for (const c of colsTabela) {
          if (c.filtro === "texto" && fCols[c.k]?.trim() && !String(c.get(d, nomesPessoas) ?? "").toLowerCase().includes(fCols[c.k].trim().toLowerCase())) return false;
          if (c.filtro === "faixa") {
            const v = num(c.get(d, nomesPessoas));
            const de = fCols[c.k + "_de"] ? Number(fCols[c.k + "_de"].replace(/\./g, "").replace(",", ".")) : null;
            const ate = fCols[c.k + "_ate"] ? Number(fCols[c.k + "_ate"].replace(/\./g, "").replace(",", ".")) : null;
            if ((de != null && !Number.isNaN(de) && (v == null || v < de)) || (ate != null && !Number.isNaN(ate) && (v == null || v > ate))) return false;
          }
        }
      }
      if (!fBusca) return true;
      const q = fBusca.toLowerCase();
      return (
        (l.tabela ?? "").includes(q) ||
        (l.acao ?? "").toLowerCase().includes(q) ||
        (l.registro_id ?? "").includes(q) ||
        (l.usuario_app ?? "").toLowerCase().includes(q) ||
        JSON.stringify(l.dados_depois ?? {}).toLowerCase().includes(q) ||
        JSON.stringify(l.dados_antes ?? {}).toLowerCase().includes(q)
      );
    });
  }, [logs, fBusca, colsTabela, fCols, nomesPessoas]);

  // Agrupado por ação: a ação do usuário com as consequências automáticas embaixo. "Ocultar Sistema" esconde só as
  // ações que o sistema fez sozinho (sem ninguém por trás), nunca as consequências de uma ação de usuário.
  const grupos = useMemo(() => agruparEventos(logsFiltrados).filter(g =>
    !(ocultarSistema && g.descricao.automatico && !g.principal.usuario_app && g.consequencias.every(c => !c.e.usuario_app))
  ), [logsFiltrados, ocultarSistema]);

  // Stat cards
  const hojeStr = hoje;
  const logsHoje = logs.filter(l => l.created_at.startsWith(hojeStr));
  const deletesHoje = logsHoje.filter(l => l.acao === "DELETE").length;
  const tabelaMaisAtiva = useMemo(() => {
    const cnt: Record<string, number> = {};
    logs.forEach(l => { cnt[l.tabela] = (cnt[l.tabela] ?? 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return top ? `${TABELA_LABEL[top[0]] ?? top[0]} (${top[1]})` : "—";
  }, [logs]);

  const toggleExpandido = (id: string) =>
    setExpandido(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const card = {
    background: "#fff", borderRadius: 12, padding: "14px 18px",
    border: "0.5px solid #DDE2EE", flex: 1, minWidth: 160,
  } as React.CSSProperties;

  return (
    <div data-arato-page="true" style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ width: "100%", boxSizing: "border-box", padding: "20px 16px" }}>

        {/* Cabeçalho */}
        <div data-arato-page-heading="true" style={{ marginBottom: 20 }}>
          <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Monitor de Auditoria</h1>
        </div>

        {/* Stat cards */}
        <div data-arato-kpis="true" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div data-arato-statistic="display" style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>EVENTOS HOJE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B2D50" }}>{logsHoje.length}</div>
          </div>
          <div data-arato-statistic="display" style={{ ...card, background: deletesHoje > 0 ? "#FEF2F2" : "#fff", border: `0.5px solid ${deletesHoje > 0 ? "#FCA5A5" : "#DDE2EE"}` }}>
            <div style={{ fontSize: 10, color: deletesHoje > 0 ? "#B91C1C" : "#888", marginBottom: 4, fontWeight: 600 }}>EXCLUSÕES HOJE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: deletesHoje > 0 ? "#B91C1C" : "#0B2D50" }}>{deletesHoje}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>TABELA MAIS ATIVA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0B2D50" }}>{tabelaMaisAtiva}</div>
          </div>
          <div data-arato-statistic="display" style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>TOTAL NO PERÍODO</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B2D50" }}>{logs.length}</div>
          </div>
        </div>

        {/* Filtros */}
        <OperationalFilters data-arato-panel="true" data-arato-filters="true" style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: "0.5px solid #DDE2EE", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>DE</div>
            <InputData type="date" value={fDe} onChange={e => setFDe(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>ATÉ</div>
            <InputData type="date" value={fAte} onChange={e => setFAte(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>TABELA</div>
            <SelectField value={fTabela} onChange={e => setFTabela(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", background: "#fff" }}>
              <option value="">Todas</option>
              {Object.entries(TABELA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>AÇÃO</div>
            <SelectField value={fAcao} onChange={e => setFAcao(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", background: "#fff" }}>
              <option value="">Todas</option>
              <option value="INSERT">Criação</option>
              <option value="UPDATE">Alteração</option>
              <option value="DELETE">Exclusão</option>
              <option value="CANCEL">Cancelamento</option>
            </SelectField>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>BUSCA</div>
            <input placeholder="Buscar em dados, ID, usuário…" value={fBusca} onChange={e => setFBusca(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", width: "100%", boxSizing: "border-box" }} />
          </div>
          <label data-arato-label="true" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
            <input type="checkbox" checked={ocultarSistema} onChange={e => setOcultarSistema(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#1A4870", cursor: "pointer" }} />
            <span style={{ fontSize: 12, color: "#555" }}>Ocultar Sistema</span>
          </label>
          <OperationalButton data-arato-button="secondary" onClick={() => { setFDe(new Date(Date.now() - 7*86400000).toISOString().slice(0,10)); setFAte(hoje); setFTabela(""); setFAcao(""); setFBusca(""); }}
            style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#666", background: "#F9FAFB", cursor: "pointer" }}>
            Limpar
          </OperationalButton>
          <OperationalButton data-arato-button="toggle" onClick={() => carregar(0)} disabled={loading}
            style={{ border: "none", borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: "#fff", background: loading ? "#93A8C6" : "#1A4870", cursor: loading ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {loading ? "Carregando…" : "↻ Atualizar"}
          </OperationalButton>
        </OperationalFilters>

        {colsTabela.some(c => c.filtro) && (
          <div style={{ background: "#fff", borderRadius: 12, padding: "12px 18px", border: "0.5px solid #DDE2EE", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ fontSize: 11, color: "#1A4870", fontWeight: 700, alignSelf: "center" }}>Filtros de {TABELA_LABEL[fTabela] ?? fTabela}</div>
            {colsTabela.filter(c => c.filtro).map(c => c.filtro === "faixa" ? (
              <div key={c.k}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>{c.label.toUpperCase()} DE / ATÉ</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input inputMode="decimal" placeholder="mín." value={fCols[c.k + "_de"] ?? ""} onChange={e => setFCols(f => ({ ...f, [c.k + "_de"]: e.target.value }))}
                    style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, width: 100, textAlign: "right" }} />
                  <input inputMode="decimal" placeholder="máx." value={fCols[c.k + "_ate"] ?? ""} onChange={e => setFCols(f => ({ ...f, [c.k + "_ate"]: e.target.value }))}
                    style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, width: 100, textAlign: "right" }} />
                </div>
              </div>
            ) : (
              <div key={c.k} style={{ minWidth: 150 }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>{c.label.toUpperCase()}</div>
                <input value={fCols[c.k] ?? ""} onChange={e => setFCols(f => ({ ...f, [c.k]: e.target.value }))}
                  style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, width: "100%", boxSizing: "border-box" }} />
              </div>
            ))}
            {Object.values(fCols).some(Boolean) && (
              <button onClick={() => setFCols({})} style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#666", background: "#F9FAFB", cursor: "pointer" }}>Limpar filtros da tabela</button>
            )}
          </div>
        )}

        {/* Tabela de logs */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
          {loading && pagina === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando…</div>
          ) : logsFiltrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhum evento encontrado no período.<br />
              <span style={{ fontSize: 11, color: "#aaa" }}>Os triggers começam a gravar a partir de agora — eventos anteriores não são retroativos.</span>
            </div>
          ) : (
            <div data-arato-grid-container="true" style={{ overflowX: "auto" }}>
              <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888", whiteSpace: "nowrap" }}>QUANDO</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>QUEM</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>O QUE ACONTECEU</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>ONDE</th>
                    {colsTabela.map(c => <th key={c.k} style={{ padding: "10px 8px", textAlign: c.tipo === "valor" ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#888", whiteSpace: "nowrap" }}>{c.label.toUpperCase()}</th>)}
                    <th style={{ padding: "10px 8px", width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g, i) => {
                    const l = g.principal;
                    const aberto = expandido.has(l.id);
                    const tc = TIPO_COR[g.descricao.tipo];
                    const quem = resolveUser(l.usuario_app);
                    const d = (l.dados_depois ?? l.dados_antes ?? {}) as Dados;
                    return (
                      <Fragment key={l.id}>
                        <tr onClick={() => toggleExpandido(l.id)}
                          style={{ borderBottom: "0.5px solid #F0F0F0", background: aberto ? "#FAFCFF" : i % 2 === 0 ? "#fff" : "#FAFAFA", cursor: "pointer", borderLeft: `3px solid ${tc.border}` }}>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#555", fontSize: 11, verticalAlign: "top" }}>{fmtTs(l.created_at)}</td>
                          <td style={{ padding: "9px 8px", whiteSpace: "nowrap", fontSize: 12, verticalAlign: "top" }}>
                            {quem ? <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{quem}</span>
                              : g.descricao.automatico ? <span style={{ color: "#888" }}>Sistema</span>
                              : <span style={{ color: "#888" }} title="Ação feita por uma rotina do servidor antes de 21/10/2026, quando o usuário ainda não era gravado">não registrado</span>}
                          </td>
                          <td style={{ padding: "9px 8px", verticalAlign: "top" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
                                background: g.descricao.automatico ? "#D5E8F5" : "#FBF3E0", color: g.descricao.automatico ? "#0B2D50" : "#7A4300" }}>
                                {g.descricao.automatico ? "Automático" : "Ação do usuário"}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color, border: `0.5px solid ${tc.border}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{TIPO_LABEL[g.descricao.tipo]}</span>
                              <span style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.4 }}>{g.descricao.texto}</span>
                            </div>
                            {g.consequencias.length > 0 && (
                              <div style={{ marginTop: 4, fontSize: 11, color: "#1A4870" }}>
                                ↳ e mais {g.consequencias.length} {g.consequencias.length === 1 ? "consequência" : "consequências"}: {g.consequencias.slice(0, 2).map(c => c.d.texto).join(" · ")}{g.consequencias.length > 2 ? " …" : ""}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#374151", fontWeight: 600, fontSize: 11, verticalAlign: "top" }}>{TABELA_LABEL[l.tabela] ?? l.tabela}</td>
                          {colsTabela.map(c => {
                            const v = c.get(d, nomesPessoas);
                            return <td key={c.k} style={{ padding: "9px 8px", verticalAlign: "top", whiteSpace: "nowrap", textAlign: c.tipo === "valor" ? "right" : "left", fontVariantNumeric: c.tipo === "valor" ? "tabular-nums" : undefined, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtCel(c, v)}</td>;
                          })}
                          <td style={{ padding: "9px 8px", textAlign: "center", verticalAlign: "top" }}><span style={{ fontSize: 12, color: "#9CA3AF" }}>{aberto ? "▲" : "▼"}</span></td>
                        </tr>
                        {aberto && (
                          <tr>
                            <td colSpan={5 + colsTabela.length} style={{ padding: "4px 16px 14px", background: "#FAFCFF" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A4300", margin: "6px 0 4px" }}>O que foi feito — {quem ?? "Sistema"}, {fmtTs(l.created_at)}</div>
                              <ExpandedDetail entry={l} usuario={quem} />
                              {g.consequencias.length > 0 && (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 4 }}>Consequências automáticas desta ação</div>
                                  {g.consequencias.slice().reverse().map(c => {
                                    const ab = expandido.has(c.e.id);
                                    return (
                                      <div key={c.e.id} style={{ borderLeft: "2px solid #D5E8F5", padding: "4px 10px", marginBottom: 4, background: "#fff", borderRadius: 4 }}>
                                        <div onClick={() => toggleExpandido(c.e.id)} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 12 }}>
                                          <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{fmtTs(c.e.created_at).slice(11)}</span>
                                          <span style={{ fontSize: 10, color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>{TABELA_LABEL[c.e.tabela] ?? c.e.tabela}</span>
                                          <span style={{ color: "#1a1a1a" }}>{c.d.texto}</span>
                                          <span style={{ marginLeft: "auto", color: "#9CA3AF", fontSize: 11 }}>{ab ? "▲" : "▼"}</span>
                                        </div>
                                        {ab && <ExpandedDetail entry={c.e} usuario={resolveUser(c.e.usuario_app)} />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </OperationalGrid>
            </div>
          )}

          {/* Rodapé */}
          <div style={{ padding: "10px 16px", borderTop: "0.5px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#888" }}>
            <span>{grupos.length} ações · {logsFiltrados.length} eventos</span>
            {logs.length === PAGE * (pagina + 1) && (
              <OperationalButton data-arato-button="secondary" onClick={() => carregar(pagina + 1)} disabled={loading}
                style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", fontSize: 11, color: "#1A4870", background: "#EFF6FF", cursor: "pointer", fontWeight: 600 }}>
                {loading ? "Carregando…" : "Carregar mais"}
              </OperationalButton>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
