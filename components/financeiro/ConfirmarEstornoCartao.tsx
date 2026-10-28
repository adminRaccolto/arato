"use client";
// Confirmação do estorno de pagamento no cartão de crédito — chamada de qualquer tela:
//   const escolha = await confirmarEstornoCartao({ titulos, permitirRetirar })
// Fatura aberta: a operadora ainda não cobrou → o título pode sair da fatura. Fatura fechada/paga: já foi cobrado →
// o estorno chega como crédito numa fatura seguinte ou como reembolso em dinheiro (Contas a Receber).
// Montado uma vez no layout (ConfirmarEstornoCartaoHost). Devolve null se o usuário cancelar.
import { useEffect, useState, type CSSProperties } from "react";
import InputData from "../InputData";

export type TituloCartaoEstorno = { id: string; descricao: string | null; valor: number; fatura: { status: string; mes: number; ano: number } | null };
export type EscolhaEstornoCartao = { modo: "retirar" | "credito" | "reembolso"; mes?: number; ano?: number; data_reembolso?: string; valor?: number };
type Pedido = { titulos: TituloCartaoEstorno[]; permitirRetirar: boolean; permitirValorParcial?: boolean; apenasRetirarSeAberta?: boolean; contexto: string; resolver: (e: EscolhaEstornoCartao | null) => void };

let ouvinte: ((p: Pedido) => void) | null = null;

/** apenasRetirarSeAberta: estorno de NF — título em fatura aberta sai junto com a NF, não há outra escolha. */
export function confirmarEstornoCartao(opts: { titulos: TituloCartaoEstorno[]; permitirRetirar?: boolean; permitirValorParcial?: boolean; apenasRetirarSeAberta?: boolean; contexto?: string }): Promise<EscolhaEstornoCartao | null> {
  return new Promise(resolve => {
    if (!ouvinte) { resolve(null); return; }
    ouvinte({ titulos: opts.titulos, permitirRetirar: opts.permitirRetirar ?? true, permitirValorParcial: opts.permitirValorParcial, apenasRetirarSeAberta: opts.apenasRetirarSeAberta, contexto: opts.contexto ?? "", resolver: resolve });
  });
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const comp = (f: { mes: number; ano: number }) => `${String(f.mes).padStart(2, "0")}/${f.ano}`;
const prox = (m: number, a: number) => (m === 12 ? { mes: 1, ano: a + 1 } : { mes: m + 1, ano: a });
const STATUS = { aberta: "aberta — ainda não cobrada", fechada: "fechada — já cobrada", paga: "paga" } as Record<string, string>;
const inp: CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)" };

export default function ConfirmarEstornoCartaoHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [modo, setModo] = useState<EscolhaEstornoCartao["modo"]>("credito");
  const [credito, setCredito] = useState("");          // "MM/AAAA"
  const [dataReemb, setDataReemb] = useState("");
  const [valor, setValor] = useState("");

  useEffect(() => {
    ouvinte = p => {
      const cobrados = p.titulos.filter(t => t.fatura?.status !== "aberta");
      setModo(p.permitirRetirar && !cobrados.length ? "retirar" : "credito");
      // Crédito, por padrão, na fatura seguinte à mais recente dos títulos cobrados
      const base = [...p.titulos].map(t => t.fatura).filter(Boolean).sort((a, b) => (b!.ano - a!.ano) || (b!.mes - a!.mes))[0];
      const n = base ? prox(base.mes, base.ano) : prox(new Date().getMonth() + 1, new Date().getFullYear());
      setCredito(`${String(n.mes).padStart(2, "0")}/${n.ano}`);
      setDataReemb(new Date().toISOString().slice(0, 10));
      setValor("");
      setPedido(p);
    };
    return () => { ouvinte = null; };
  }, []);

  if (!pedido) return null;
  const responder = (e: EscolhaEstornoCartao | null) => { pedido.resolver(e); setPedido(null); };
  const abertos = pedido.titulos.filter(t => t.fatura?.status === "aberta");
  const cobrados = pedido.titulos.filter(t => t.fatura?.status !== "aberta");
  const total = pedido.titulos.reduce((s, t) => s + Number(t.valor), 0);
  const opcoes: [EscolhaEstornoCartao["modo"], string, string][] = [
    ...(pedido.permitirRetirar && !cobrados.length ? [["retirar", "Retirar da fatura", "A operadora ainda não cobrou: a compra sai da fatura aberta."] as [EscolhaEstornoCartao["modo"], string, string]] : []),
    ...(pedido.apenasRetirarSeAberta && !cobrados.length ? [] : [
      ["credito", "Crédito em fatura seguinte", "A operadora devolve o valor como crédito numa próxima fatura, que fica menor."],
      ["reembolso", "Reembolso em dinheiro", "O valor volta em dinheiro (PIX, depósito): entra no Contas a Receber para baixar quando chegar."],
    ] as [EscolhaEstornoCartao["modo"], string, string][]),
  ];
  const confirmar = () => {
    const [m, a] = credito.split("/").map(Number);
    const v = parseFloat(valor.replace(/\./g, "").replace(",", "."));
    responder({ modo, ...(modo === "credito" && m && a ? { mes: m, ano: a } : {}), ...(modo === "reembolso" ? { data_reembolso: dataReemb } : {}), ...(v > 0 ? { valor: v } : {}) });
  };

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "var(--overlay, rgba(0,0,0,.45))", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div data-arato-dialog="confirmation" role="dialog" aria-modal="true" style={{ background: "var(--bg-card, #fff)", borderRadius: 14, width: "100%", maxWidth: 560, padding: "20px 22px", boxShadow: "var(--shadow-modal)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Estorno de pagamento no cartão de crédito</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>{pedido.contexto || "Confirme como o estorno aconteceu no cartão."}</div>

        <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, marginBottom: 12 }}>
          {pedido.titulos.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 12px", borderBottom: "0.5px solid var(--border-table)", fontSize: 12 }}>
              <span style={{ color: "var(--text-1)" }}>{t.descricao}<div style={{ fontSize: 11, color: t.fatura?.status === "aberta" ? "var(--text-3)" : "#7A5200" }}>Fatura {t.fatura ? `${comp(t.fatura)} ${STATUS[t.fatura.status] ?? t.fatura.status}` : "—"}</div></span>
              <strong style={{ whiteSpace: "nowrap" }}>{fmtBRL(Number(t.valor))}</strong>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", fontSize: 12, fontWeight: 600 }}><span>Total</span><span>{fmtBRL(total)}</span></div>
        </div>

        {abertos.length > 0 && cobrados.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-2)", background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
            {abertos.length} título(s) em fatura aberta saem da fatura. Para os {cobrados.length} já cobrados, escolha abaixo como o estorno chegou.
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {opcoes.map(([v, rot, dica]) => (
            <label key={v} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderRadius: 10, cursor: "pointer", border: `0.5px solid ${modo === v ? "#1A4870" : "var(--border-table)"}`, background: modo === v ? "#D5E8F5" : "transparent" }}>
              <input type="radio" checked={modo === v} onChange={() => setModo(v)} style={{ marginTop: 3, accentColor: "#1A4870" }} />
              <span><span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{rot}</span><div style={{ fontSize: 11, color: "var(--text-2)" }}>{dica}</div></span>
            </label>
          ))}
        </div>

        {modo === "credito" && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 3 }}>Fatura que recebe o crédito (mês/ano)</label>
            <input value={credito} onChange={e => setCredito(e.target.value)} placeholder="MM/AAAA" style={{ ...inp, width: 120 }} />
          </div>
        )}
        {modo === "reembolso" && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 3 }}>Previsão do reembolso</label>
            <InputData type="date" value={dataReemb} onChange={e => setDataReemb(e.target.value)} style={inp} />
          </div>
        )}
        {pedido.permitirValorParcial && modo !== "retirar" && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 3 }}>Valor estornado (vazio = total)</label>
            <input value={valor} onChange={e => setValor(e.target.value)} placeholder={fmtBRL(total)} inputMode="decimal" style={{ ...inp, width: 160 }} />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button data-arato-button="secondary" onClick={() => responder(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-control)", background: "var(--bg-card)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button data-arato-button="primary" onClick={confirmar} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Confirmar estorno</button>
        </div>
      </div>
    </div>
  );
}
