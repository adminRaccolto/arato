"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { NotaFiscal } from "../../../../../lib/supabase";

const NCM_PRODUTO: Record<string, string> = {
  "Soja": "1201.10.00", "Milho": "1005.10.90", "Milho 1ª": "1005.10.90",
  "Milho 2ª (Safrinha)": "1005.10.90", "Algodão": "5201.00.20",
  "Trigo": "1001.99.00", "Sorgo": "1007.90.10", "Feijão": "0713.39.90",
};

const fmtCNPJ = (v?: string) => {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
};
const fmtData = (s?: string) => {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
const fmtVal = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPeso = (n?: number) =>
  n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "";

type DanfeItem = {
  item: string; ncm: string; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; valor_total: number;
};

// Estilos inline para o DANFE
const S = {
  page: {
    fontFamily: "Arial, sans-serif",
    fontSize: 8,
    color: "#000",
    background: "#fff",
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "6mm 8mm",
    boxSizing: "border-box" as const,
    position: "relative" as const,
  },
  block: {
    border: "0.3mm solid #000",
    marginBottom: "0.8mm",
  },
  blockRow: {
    display: "flex" as const,
    borderBottom: "0.3mm solid #000",
  },
  cell: (flex = 1, extra: React.CSSProperties = {}) => ({
    flex,
    borderRight: "0.3mm solid #000",
    padding: "1mm 1.5mm",
    ...extra,
  }),
  cellLast: (flex = 1, extra: React.CSSProperties = {}) => ({
    flex,
    padding: "1mm 1.5mm",
  }),
  label: {
    fontSize: 6,
    color: "#444",
    textTransform: "uppercase" as const,
    letterSpacing: "0.02em",
    display: "block" as const,
    marginBottom: "0.5mm",
  },
  val: {
    fontSize: 8.5,
    fontWeight: "bold" as const,
    color: "#000",
  },
  secTitle: {
    background: "#e8e8e8",
    padding: "1mm 2mm",
    fontSize: 7,
    fontWeight: "bold" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "0.3mm solid #000",
  },
};

export default function DanfePage() {
  const params = useParams<{ id: string }>();
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [itens, setItens] = useState<DanfeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const { data: nf } = await supabase
        .from("notas_fiscais").select("*").eq("id", params.id).single();
      if (!nf) { setLoading(false); return; }
      setNota(nf as NotaFiscal);

      // Se já tem itens salvos, usa diretamente
      if (nf.itens_json && (nf.itens_json as DanfeItem[]).length > 0) {
        setItens(nf.itens_json as DanfeItem[]);
        setLoading(false);
        return;
      }

      // Fallback: busca romaneio via romaneio_id (preferencial) ou nfe_numero
      const dadosJson = nf.dados_nf_json as { romaneio_id?: string } | null;
      const romId = dadosJson?.romaneio_id;
      const { data: rom } = await (
        romId
          ? supabase.from("romaneios").select("*, contratos(produto, preco)").eq("id", romId).maybeSingle()
          : supabase.from("romaneios").select("*, contratos(produto, preco)").eq("fazenda_id", nf.fazenda_id).eq("nfe_numero", nf.numero).maybeSingle()
      );

      if (rom) {
        const contrato = (rom as { contratos?: { produto?: string; preco?: number } }).contratos;
        const produto = contrato?.produto ?? "Produto";
        const precoKg = contrato?.preco ?? 0;
        const pesoKg: number = (rom as { peso_classificado_kg?: number; sacas?: number }).peso_classificado_kg
          ?? (((rom as { sacas?: number }).sacas ?? 0) * 60);
        const valorUnit = pesoKg > 0 ? nf.valor_total / pesoKg : precoKg;
        setItens([{
          item:           produto,
          ncm:            NCM_PRODUTO[produto] ?? "",
          cfop:           nf.cfop ?? "",
          unidade:        "KG",
          quantidade:     pesoKg,
          valor_unitario: valorUnit,
          valor_total:    nf.valor_total,
        }]);
      }

      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", fontSize: 14 }}>
      Carregando...
    </div>
  );
  if (!nota) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", fontSize: 14, color: "#E24B4A" }}>
      Nota não encontrada.
    </div>
  );

  const d = nota.dados_nf_json ?? {};
  const isPreview = nota.status !== "autorizada";
  const totalProdutos = itens.reduce((s, i) => s + i.valor_total, 0) || nota.valor_total;

  return (
    <>
      {/* Barra de ferramentas — não imprime */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: isPreview ? "#FFF3CD" : "#1A4870",
        color: isPreview ? "#856404" : "#fff",
        padding: "8px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: "Arial", fontSize: 13, fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }} className="no-print">
        <span>
          {isPreview
            ? "⚠️ PREVIEW — Sem valor fiscal. Confira os dados antes de transmitir."
            : `✓ NF-e Autorizada — Chave: ${nota.chave_acesso ?? "—"}`}
        </span>
        <button
          onClick={() => window.print()}
          style={{ padding: "6px 18px", background: isPreview ? "#856404" : "#fff", color: isPreview ? "#fff" : "#1A4870", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Espaço para a barra fixa */}
      <div style={{ height: 42 }} className="no-print" />

      {/* ══ DANFE ══════════════════════════════════════════════════════════════ */}
      <div style={S.page}>

        {/* Marca d'água PREVIEW */}
        {isPreview && (
          <div style={{
            position: "absolute", top: "40%", left: "50%",
            transform: "translate(-50%, -50%) rotate(-35deg)",
            fontSize: 72, fontWeight: 900, color: "rgba(200,0,0,0.06)",
            whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none",
            letterSpacing: "0.1em", zIndex: 0,
          }}>
            SEM VALOR FISCAL
          </div>
        )}

        {/* ── CABEÇALHO ─────────────────────────────────────────────────────── */}
        <div style={{ ...S.block, display: "flex" }}>
          {/* Emitente */}
          <div style={{ flex: 3, borderRight: "0.3mm solid #000", padding: "2mm 3mm" }}>
            <div style={{ fontSize: 11, fontWeight: "bold", textAlign: "center", textTransform: "uppercase" }}>
              {d.emit_razao || "EMITENTE NÃO CONFIGURADO"}
            </div>
            <div style={{ fontSize: 7, textAlign: "center", marginTop: "0.5mm", color: "#222" }}>
              {[d.emit_endereco, d.emit_municipio, d.emit_uf].filter(Boolean).join(" · ")}
            </div>
            <div style={{ fontSize: 7, textAlign: "center", marginTop: "0.5mm" }}>
              CNPJ: {fmtCNPJ(d.emit_cnpj)}
              {d.emit_ie ? ` · IE: ${d.emit_ie}` : ""}
            </div>
          </div>

          {/* Centro — DANFE */}
          <div style={{ flex: 2, borderRight: "0.3mm solid #000", padding: "2mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.1em" }}>DANFE</div>
            <div style={{ fontSize: 6.5, textAlign: "center", marginTop: "1mm", lineHeight: 1.4 }}>
              Documento Auxiliar da<br />Nota Fiscal Eletrônica
            </div>
            <div style={{ marginTop: "2mm", fontSize: 7, textAlign: "center" }}>
              <div>0 - ENTRADA &nbsp; <strong>1 - SAÍDA ◀</strong></div>
            </div>
            <div style={{ marginTop: "2mm", border: "0.3mm solid #000", padding: "1mm 3mm", textAlign: "center" }}>
              <div style={{ fontSize: 6 }}>Nº</div>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.05em" }}>{nota.numero}</div>
              <div style={{ fontSize: 6 }}>SÉRIE {nota.serie}</div>
            </div>
          </div>

          {/* Chave de acesso */}
          <div style={{ flex: 4, padding: "2mm", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <span style={S.label}>Chave de Acesso</span>
              <div style={{
                fontFamily: "monospace", fontSize: 7, letterSpacing: "0.05em",
                border: "0.3mm solid #888", padding: "1mm", background: "#f9f9f9",
                wordBreak: "break-all", lineHeight: 1.6,
              }}>
                {nota.chave_acesso
                  ? nota.chave_acesso.replace(/(\d{4})/g, "$1 ").trim()
                  : isPreview ? "— aguardando transmissão SEFAZ —" : "—"}
              </div>
            </div>
            <div style={{ marginTop: "1mm" }}>
              <span style={S.label}>Protocolo de Autorização</span>
              <div style={{ fontSize: 8 }}>{isPreview ? "— não transmitida —" : "—"}</div>
            </div>
            {isPreview && (
              <div style={{ marginTop: "1mm", background: "#FFF3CD", border: "0.3mm solid #D4A017", padding: "1mm 2mm", fontSize: 6.5, color: "#856404", fontWeight: "bold", textAlign: "center" }}>
                SEM VALOR FISCAL — PREVIEW
              </div>
            )}
          </div>
        </div>

        {/* ── NATUREZA DA OPERAÇÃO ──────────────────────────────────────────── */}
        <div style={{ ...S.block, display: "flex" }}>
          <div style={{ ...S.cell(4), borderRight: "0.3mm solid #000" }}>
            <span style={S.label}>Natureza da Operação</span>
            <div style={S.val}>{nota.natureza}</div>
          </div>
          <div style={{ ...S.cell(2), borderRight: "0.3mm solid #000" }}>
            <span style={S.label}>CFOP</span>
            <div style={S.val}>{nota.cfop}</div>
          </div>
          <div style={{ ...S.cell(2), borderRight: "0.3mm solid #000" }}>
            <span style={S.label}>Data de Emissão</span>
            <div style={S.val}>{fmtData(nota.data_emissao)}</div>
          </div>
          <div style={{ ...S.cell(2), borderRight: "0.3mm solid #000" }}>
            <span style={S.label}>Data de Saída</span>
            <div style={S.val}>{fmtData(d.data_saida)}</div>
          </div>
          <div style={S.cellLast(1)}>
            <span style={S.label}>Hora Saída</span>
            <div style={S.val}>{d.hora_saida}</div>
          </div>
        </div>

        {/* ── DESTINATÁRIO ────────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Destinatário / Remetente</div>
          <div style={{ ...S.blockRow }}>
            <div style={S.cell(4)}>
              <span style={S.label}>Nome / Razão Social</span>
              <div style={S.val}>{nota.destinatario}</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>CNPJ / CPF</span>
              <div style={S.val}>{fmtCNPJ(nota.cnpj_destinatario)}</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Inscrição Estadual</span>
              <div style={S.val}>{d.dest_ie || "—"}</div>
            </div>
            <div style={S.cellLast(1)}>
              <span style={S.label}>UF</span>
              <div style={S.val}>{d.dest_uf || "—"}</div>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(5)}>
              <span style={S.label}>Endereço</span>
              <div style={S.val}>{[d.dest_endereco, d.dest_numero].filter(Boolean).join(", ") || "—"}</div>
            </div>
            <div style={S.cellLast(2)}>
              <span style={S.label}>Município</span>
              <div style={S.val}>{d.dest_cidade || "—"}</div>
            </div>
          </div>
        </div>

        {/* ── DADOS DOS PRODUTOS ──────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Dados dos Produtos / Serviços</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", borderBottom: "0.3mm solid #000" }}>
                {(["Cód.", "Descrição do Produto", "NCM", "CFOP", "Unid.", "Quantidade", "Valor Unit.", "Valor Total"] as string[]).map((h: string, idx: number) => (
                  <th key={idx} style={{ padding: "1mm 1.5mm", textAlign: idx >= 5 ? "right" : "left", fontWeight: "bold", whiteSpace: "nowrap", borderRight: idx < 7 ? "0.3mm solid #ccc" : "none" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "3mm", textAlign: "center", color: "#888", fontStyle: "italic" }}>
                    Nenhum item registrado
                  </td>
                </tr>
              ) : itens.map((it, i) => (
                <tr key={i} style={{ borderBottom: "0.2mm solid #ddd", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "1mm 1.5mm", borderRight: "0.3mm solid #ddd" }}>{String(i + 1).padStart(3, "0")}</td>
                  <td style={{ padding: "1mm 1.5mm", fontWeight: "bold", borderRight: "0.3mm solid #ddd" }}>{it.item}</td>
                  <td style={{ padding: "1mm 1.5mm", borderRight: "0.3mm solid #ddd", fontFamily: "monospace" }}>{it.ncm}</td>
                  <td style={{ padding: "1mm 1.5mm", borderRight: "0.3mm solid #ddd" }}>{it.cfop}</td>
                  <td style={{ padding: "1mm 1.5mm", borderRight: "0.3mm solid #ddd" }}>{it.unidade}</td>
                  <td style={{ padding: "1mm 1.5mm", textAlign: "right", borderRight: "0.3mm solid #ddd" }}>
                    {it.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td style={{ padding: "1mm 1.5mm", textAlign: "right", borderRight: "0.3mm solid #ddd" }}>
                    {it.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                  </td>
                  <td style={{ padding: "1mm 1.5mm", textAlign: "right", fontWeight: "bold" }}>
                    {fmtVal(it.valor_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── CÁLCULO DO IMPOSTO ──────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Cálculo do Imposto</div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(2)}>
              <span style={S.label}>Base de Cálculo ICMS</span>
              <div style={S.val}>R$ 0,00</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Valor do ICMS</span>
              <div style={S.val}>R$ 0,00</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>BC ICMS Substituição</span>
              <div style={S.val}>R$ 0,00</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Valor ICMS Substituição</span>
              <div style={S.val}>R$ 0,00</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Valor Total Produtos</span>
              <div style={S.val}>R$ {fmtVal(totalProdutos)}</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Valor do Frete</span>
              <div style={S.val}>R$ 0,00</div>
            </div>
            <div style={S.cellLast(2)}>
              <span style={S.label}>Valor Total da NF-e</span>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#000" }}>R$ {fmtVal(nota.valor_total)}</div>
            </div>
          </div>
        </div>

        {/* ── TRANSPORTADOR ───────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Transportador / Volumes Transportados</div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(4)}>
              <span style={S.label}>Razão Social</span>
              <div style={S.val}>{d.transportadora || "—"}</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Frete por Conta</span>
              <div style={S.val}>{d.frete_conta === "0" ? "0 – Emitente" : d.frete_conta === "1" ? "1 – Destinatário" : d.frete_conta || "—"}</div>
            </div>
            <div style={S.cell(1)}>
              <span style={S.label}>Placa Veículo</span>
              <div style={S.val}>{d.placa || "—"}</div>
            </div>
            <div style={S.cellLast(1)}>
              <span style={S.label}>UF</span>
              <div style={S.val}>{d.uf_placa || "—"}</div>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(2)}>
              <span style={S.label}>Espécie</span>
              <div style={S.val}>{d.especie || "Granel"}</div>
            </div>
            <div style={S.cell(2)}>
              <span style={S.label}>Peso Bruto (kg)</span>
              <div style={S.val}>{fmtPeso(d.peso_bruto)}</div>
            </div>
            <div style={S.cellLast(2)}>
              <span style={S.label}>Peso Líquido (kg)</span>
              <div style={S.val}>{fmtPeso(d.peso_liquido)}</div>
            </div>
          </div>
        </div>

        {/* ── DADOS ADICIONAIS ────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Informações Complementares</div>
          <div style={{ padding: "2mm 3mm", minHeight: "14mm" }}>
            <div style={{ fontSize: 7.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {nota.observacao || "—"}
              {d.contrato_numero && `\n\nContrato: ${d.contrato_numero}`}
              {d.romaneio_numero && ` | Romaneio: ${d.romaneio_numero}`}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ marginTop: "2mm", fontSize: 6.5, color: "#555", textAlign: "center" }}>
          {isPreview
            ? "PREVIEW GERADO PELO SISTEMA ARATO — SEM VALOR FISCAL — Documento para conferência interna"
            : `NF-e emitida em ${fmtData(nota.data_emissao)} — Chave: ${nota.chave_acesso ?? "—"}`}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}
