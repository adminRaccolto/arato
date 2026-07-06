"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";
import { PLANOS_DEFAULT, fmtPreco } from "../../lib/planos";
import type { PlanoId } from "../../lib/planos";

type Pagamento = {
  id: string;
  valor: number;
  status: string;
  data_vencimento: string;
  data_pagamento: string | null;
  metodo_pagamento: string | null;
  asaas_payment_id: string | null;
  asaas_invoice_url: string | null;
  asaas_pix_qrcode: string | null;
  descricao: string | null;
};

type Assinatura = {
  id: string;
  plano_id: string;
  status: string;
  preco: number;
  periodo: string;
  trial_fim: string | null;
  data_proximo_pagamento: string | null;
  asaas_customer_id: string | null;
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function PagamentoInner() {
  const { contaId, fazendaId, contaStatus, inadimplente } = useAuth();
  const params = useSearchParams();

  const [assinatura,    setAssinatura]    = useState<Assinatura | null>(null);
  const [pagamentos,    setPagamentos]    = useState<Pagamento[]>([]);
  const [carregando,    setCarregando]    = useState(true);
  const [metodoPag,     setMetodoPag]     = useState<"pix" | "boleto">("pix");
  const [gerandoPag,    setGerandoPag]    = useState(false);
  const [novoPag,       setNovoPag]       = useState<{ url?: string; pix?: string; valor?: number } | null>(null);
  const [pixCopiado,    setPixCopiado]    = useState(false);
  const [erro,          setErro]          = useState("");

  useEffect(() => {
    if (!contaId) return;
    (async () => {
      setCarregando(true);

      // Carrega assinatura ativa
      const { data: ass } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("conta_id", contaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setAssinatura(ass);

      // Carrega pagamentos pendentes / vencidos
      const { data: pags } = await supabase
        .from("pagamentos")
        .select("*")
        .eq("conta_id", contaId)
        .in("status", ["pendente", "vencido"])
        .order("data_vencimento", { ascending: true });

      setPagamentos(pags ?? []);
      setCarregando(false);
    })();
  }, [contaId]);

  async function gerarPagamento() {
    if (!assinatura?.asaas_customer_id) {
      setErro("Configure o método de pagamento entrando em contato com o suporte.");
      return;
    }
    setGerandoPag(true);
    setErro("");
    try {
      const res = await fetch("/api/asaas/cobrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conta_id: contaId,
          assinatura_id: assinatura.id,
          asaas_customer_id: assinatura.asaas_customer_id,
          billingType: metodoPag === "pix" ? "PIX" : "BOLETO",
          valor: assinatura.preco,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar cobrança");
      setNovoPag({ url: data.invoice_url, pix: data.pix_payload, valor: assinatura.preco });
    } catch (e) {
      setErro(String(e));
    } finally {
      setGerandoPag(false);
    }
  }

  async function copiarPix() {
    if (!novoPag?.pix) return;
    await navigator.clipboard.writeText(novoPag.pix);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2500);
  }

  const plano = assinatura ? PLANOS_DEFAULT[assinatura.plano_id as PlanoId] : null;
  const totalDevido = pagamentos.reduce((s, p) => s + p.valor, 0);

  return (
    <div style={{
      minHeight: "100vh", background: "#F4F6FA",
      fontFamily: "system-ui, sans-serif", fontSize: 13,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "#0B1E35", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo_Arato_Nova.png" alt="Arato" style={{ height: 28, filter: "brightness(0) invert(1)", objectFit: "contain" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
        <a href="/" style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, textDecoration: "none" }}>
          ← Voltar ao sistema
        </a>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px", gap: 24 }}>

        {/* Coluna principal */}
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* Status banner */}
          {inadimplente && (
            <div style={{
              background: "#FEF2F2", border: "0.5px solid #E24B4A",
              borderRadius: 12, padding: "16px 20px", marginBottom: 20,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: "#991B1B", marginBottom: 4 }}>Acesso suspenso por inadimplência</div>
                <div style={{ fontSize: 12, color: "#B91C1C", lineHeight: 1.6 }}>
                  Regularize o pagamento abaixo para restaurar o acesso completo ao Arato imediatamente.
                </div>
              </div>
            </div>
          )}

          {/* Assinatura atual */}
          {carregando ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando…</div>
          ) : assinatura && (
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Sua assinatura</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1E35" }}>
                    Arato {plano?.nome ?? assinatura.plano_id}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                    {assinatura.periodo === "anual" ? "Cobrança anual" : "Cobrança mensal"}
                    {assinatura.data_proximo_pagamento && ` · Próximo: ${fmtDate(assinatura.data_proximo_pagamento)}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#0B1E35" }}>
                    {fmtPreco(assinatura.preco)}
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>/mês</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: assinatura.status === "ativa" ? "#F0FDF4" : assinatura.status === "trial" ? "#FBF3E0" : "#FEF2F2",
                    color: assinatura.status === "ativa" ? "#16A34A" : assinatura.status === "trial" ? "#C9921B" : "#E24B4A",
                  }}>
                    {assinatura.status === "ativa" ? "Ativa" : assinatura.status === "trial" ? "Trial" : assinatura.status === "inadimplente" ? "Inadimplente" : "Suspensa"}
                  </span>
                </div>
              </div>

              {assinatura.trial_fim && assinatura.status === "trial" && (
                <div style={{ background: "#FBF3E0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12" }}>
                  Trial expira em <strong>{fmtDate(assinatura.trial_fim)}</strong> — após isso é necessário pagamento para continuar.
                </div>
              )}
            </div>
          )}

          {/* Cobranças em aberto */}
          {pagamentos.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Cobranças em aberto
              </div>
              {pagamentos.map(p => (
                <div key={p.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0", borderBottom: "0.5px solid #EEF1F6",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{p.descricao ?? "Mensalidade Arato"}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Vence: {fmtDate(p.data_vencimento)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#E24B4A" }}>{fmtPreco(p.valor)}</span>
                    {p.asaas_invoice_url && (
                      <a href={p.asaas_invoice_url} target="_blank" rel="noreferrer"
                        style={{ padding: "5px 12px", background: "#1A4870", color: "#fff", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                        Pagar →
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E24B4A" }}>
                  Total: {fmtPreco(totalDevido)}
                </div>
              </div>
            </div>
          )}

          {/* Gerar nova cobrança */}
          {assinatura && pagamentos.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1E35", marginBottom: 4 }}>Gerar cobrança</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
                Escolha o método de pagamento para gerar uma cobrança avulsa.
              </div>

              {/* Método */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {([["pix", "PIX", "Instantâneo"], ["boleto", "Boleto", "1-3 dias úteis"]] as const).map(([key, label, desc]) => (
                  <div
                    key={key}
                    onClick={() => setMetodoPag(key)}
                    style={{
                      flex: 1, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                      border: `1.5px solid ${metodoPag === key ? "#1A4870" : "#DDE2EE"}`,
                      background: metodoPag === key ? "#D5E8F5" : "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0B1E35" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{desc}</div>
                  </div>
                ))}
              </div>

              {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

              {novoPag ? (
                <div>
                  {novoPag.pix ? (
                    <>
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 12px", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
                        {novoPag.pix}
                      </div>
                      <button onClick={copiarPix} style={{
                        width: "100%", padding: "12px 0",
                        background: pixCopiado ? "#16A34A" : "#1A4870",
                        color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}>
                        {pixCopiado ? "✓ Copiado!" : "Copiar código PIX"}
                      </button>
                    </>
                  ) : novoPag.url ? (
                    <a href={novoPag.url} target="_blank" rel="noreferrer" style={{
                      display: "block", textAlign: "center", padding: "12px 0",
                      background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none",
                    }}>
                      Acessar link de pagamento →
                    </a>
                  ) : null}
                  <div style={{ fontSize: 11, color: "#16A34A", textAlign: "center", marginTop: 8 }}>
                    ✓ Acesso restaurado automaticamente após confirmação
                  </div>
                </div>
              ) : (
                <button onClick={gerarPagamento} disabled={gerandoPag} style={{
                  width: "100%", padding: "12px 0",
                  background: gerandoPag ? "#9BB5CC" : "#1A4870",
                  color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: gerandoPag ? "not-allowed" : "pointer",
                }}>
                  {gerandoPag ? "Gerando cobrança…" : `Gerar ${metodoPag === "pix" ? "PIX" : "Boleto"} — ${fmtPreco(assinatura.preco)}`}
                </button>
              )}
            </div>
          )}

          {/* Suporte */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1E35", marginBottom: 8 }}>Precisa de ajuda?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href="https://wa.me/5565981456825?text=Preciso+de+ajuda+com+pagamento+do+Arato"
                target="_blank" rel="noreferrer"
                style={{ flex: 1, padding: "10px 0", background: "#25D366", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>
                WhatsApp
              </a>
              <a href="mailto:financeiro@raccolto.com.br"
                style={{ flex: 1, padding: "10px 0", background: "#F4F6FA", color: "#555", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none", textAlign: "center", border: "0.5px solid #DDE2EE" }}>
                E-mail
              </a>
            </div>
          </div>
        </div>

        {/* Coluna lateral — histórico */}
        {pagamentos.length > 0 || assinatura ? (
          <div style={{ width: 260, flexShrink: 0 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Resumo da conta
              </div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 2 }}>
                <div>Status: <strong style={{ color: inadimplente ? "#E24B4A" : "#16A34A" }}>{inadimplente ? "Inadimplente" : contaStatus ?? "—"}</strong></div>
                <div>Plano: <strong>{plano?.nome ?? "—"}</strong></div>
                <div>Em aberto: <strong style={{ color: "#E24B4A" }}>{fmtPreco(totalDevido)}</strong></div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "0.5px solid #EEF1F6" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>CNPJ Faturamento</div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "#555", lineHeight: 1.6 }}>
                  Raccolto Consultoria e Treinamentos LTDA<br />
                  CNPJ: 49.578.526/0001-42
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PagamentoPage() {
  return <Suspense><PagamentoInner /></Suspense>;
}
