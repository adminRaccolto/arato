"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { NotaFiscal } from "../../../../../lib/supabase";

// ── Tabelas fiscais ────────────────────────────────────────────────────
const NCM_PRODUTO: Record<string, string> = {
  "Soja": "1201.10.00", "Milho": "1005.10.90", "Milho 1ª": "1005.10.90",
  "Milho 2ª (Safrinha)": "1005.10.90", "Algodão": "5201.00.20",
  "Trigo": "1001.99.00", "Sorgo": "1007.90.10", "Feijão": "0713.39.90",
};

// ── Formatadores ───────────────────────────────────────────────────────
const fmtCNPJ = (v?: string) => {
  if (!v) return "—";
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
const fmtQtd = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

type DanfeItem = {
  item: string; ncm: string; cst?: string; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; desconto?: number; valor_total: number;
};

// ── Gera texto jurídico automático para informações complementares ─────
function gerarTextoComplementar(params: {
  valorTotal: number;
  motorista?: string;
  contratoNumero?: string;
  senarBase?: number;
  funruralRetido?: boolean;
  uf?: string;
  observacaoManual?: string;
}): string {
  const linhas: string[] = [];

  if (params.motorista) {
    linhas.push(`MOTORISTA: ${params.motorista.toUpperCase()}`);
  }

  const senarBase = params.senarBase ?? params.valorTotal;
  const senarValor = senarBase * 0.002;
  if (senarBase > 0) {
    linhas.push(`SENAR: ${fmtVal(senarValor)} BASE: R$ ${fmtVal(senarBase)}`);
  }

  if (params.contratoNumero) {
    linhas.push(`REF. CONTRATO Nº ${params.contratoNumero}`);
  }

  // Funrural retido na fonte pelo adquirente (art. 25 Lei 8.212/91)
  if (params.funruralRetido !== false) {
    linhas.push(
      "FUNRURAL RETIDO NA FONTE PELO ADQUIRENTE CONFORME ART. 25 DA LEI 8.212/1991."
    );
  }

  // ICMS Diferido — específico MT
  if (!params.uf || params.uf === "MT") {
    linhas.push(
      "ICMS DIFERIDO NOS TERMOS DO DECRETO MT Nº 4.540/2004, CFE. ART. 6, ANEXO VII DO DECRETO Nº 2.212/2014 — RICMS/MT."
    );
  }

  // PIS/COFINS isento — produção rural
  linhas.push(
    "OPERAÇÃO ISENTA DE PIS/COFINS CONFORME ART. 10, INCISO VI DA LEI 10.925/2004."
  );

  if (params.observacaoManual) {
    linhas.push(params.observacaoManual);
  }

  return linhas.join("\n");
}

// ── Estilos base ───────────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 8,
    color: "#000",
    background: "#fff",
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "5mm 7mm",
    boxSizing: "border-box" as const,
    position: "relative" as const,
  },
  border: "0.3mm solid #000",
  block: { border: "0.3mm solid #000", marginBottom: "0.7mm" },
  row: { display: "flex" as const },
  cell: (flex = 1, extra: React.CSSProperties = {}) => ({
    flex,
    borderRight: "0.3mm solid #000",
    padding: "0.8mm 1.5mm",
    ...extra,
  }),
  cellLast: (flex = 1, extra: React.CSSProperties = {}) => ({
    flex,
    padding: "0.8mm 1.5mm",
    ...extra,
  }),
  lbl: {
    fontSize: 6,
    color: "#333",
    textTransform: "uppercase" as const,
    letterSpacing: "0.02em",
    display: "block" as const,
    marginBottom: "0.4mm",
  },
  val: { fontSize: 8, fontWeight: "bold" as const, color: "#000" },
  secTitle: {
    background: "#e0e0e0",
    padding: "0.8mm 2mm",
    fontSize: 6.5,
    fontWeight: "bold" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "0.3mm solid #000",
  },
};

// ── Componentes auxiliares ─────────────────────────────────────────────
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <span style={S.lbl}>{children}</span>
);
const Val = ({ children, size = 8 }: { children: React.ReactNode; size?: number }) => (
  <div style={{ ...S.val, fontSize: size }}>{children || "—"}</div>
);

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

      if (nf.itens_json && (nf.itens_json as DanfeItem[]).length > 0) {
        setItens(nf.itens_json as DanfeItem[]);
        setLoading(false);
        return;
      }

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
        const pesoKg: number = (rom as { peso_classificado_kg?: number; sacas?: number }).peso_classificado_kg
          ?? (((rom as { sacas?: number }).sacas ?? 0) * 60);
        const valorUnit = pesoKg > 0 ? nf.valor_total / pesoKg : (contrato?.preco ?? 0);
        setItens([{
          item: produto, ncm: NCM_PRODUTO[produto] ?? "", cst: "051",
          cfop: nf.cfop ?? "", unidade: "KG",
          quantidade: pesoKg, valor_unitario: valorUnit, valor_total: nf.valor_total,
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

  const d = (nota.dados_nf_json ?? {}) as Record<string, string | number | undefined>;
  const isPreview = nota.status !== "autorizada";
  const totalProdutos = itens.reduce((s, i) => s + i.valor_total, 0) || nota.valor_total;
  const emitUF = String(d.emit_uf ?? "MT");

  // Chave formatada em grupos de 4
  const chaveFmt = nota.chave_acesso
    ? nota.chave_acesso.replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim()
    : null;

  // Texto legal automático
  const textoComplementar = gerarTextoComplementar({
    valorTotal: nota.valor_total,
    motorista: String(d.motorista ?? ""),
    contratoNumero: String(d.contrato_numero ?? ""),
    senarBase: nota.valor_total,
    funruralRetido: true,
    uf: emitUF,
    observacaoManual: nota.observacao ?? undefined,
  });

  // Duplicatas (vencimentos)
  const duplicatas: { num: string; venc: string; valor: string }[] = [];
  if ((d.dup_numero as string)) {
    duplicatas.push({
      num: String(d.dup_numero ?? "001"),
      venc: fmtData(String(d.dup_vencimento ?? "")),
      valor: fmtVal(Number(d.dup_valor ?? nota.valor_total)),
    });
  }

  return (
    <>
      {/* ── Barra de ferramentas — não imprime ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: isPreview ? "#FFF3CD" : "#1A4870",
        color: isPreview ? "#856404" : "#fff",
        padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: "Arial", fontSize: 13, fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
      }} className="no-print">
        <span>
          {isPreview
            ? "⚠️ PREVIEW — Sem valor fiscal. Confira os dados antes de transmitir."
            : `✓ NF-e Autorizada — Chave: ${nota.chave_acesso ?? "—"}`}
        </span>
        <button onClick={() => window.print()}
          style={{ padding: "6px 18px", background: isPreview ? "#856404" : "#fff", color: isPreview ? "#fff" : "#1A4870", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          Imprimir / Salvar PDF
        </button>
      </div>
      <div style={{ height: 42 }} className="no-print" />

      {/* ══ DANFE ═══════════════════════════════════════════════════════════ */}
      <div style={S.page}>

        {/* Marca d'água PREVIEW */}
        {isPreview && (
          <div style={{
            position: "absolute", top: "40%", left: "50%",
            transform: "translate(-50%,-50%) rotate(-35deg)",
            fontSize: 72, fontWeight: 900, color: "rgba(200,0,0,0.055)",
            whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none",
            letterSpacing: "0.1em", zIndex: 0,
          }}>SEM VALOR FISCAL</div>
        )}

        {/* ── CANHÃO (tira de recebimento) ─────────────────────────────────── */}
        <div style={{ border: S.border, marginBottom: "2mm", padding: "1.5mm 2mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 3, fontSize: 7, lineHeight: 1.5 }}>
              <strong>Recebemos de {d.emit_razao || "EMITENTE"}</strong> os produtos e/ou serviços
              constantes da Nota Fiscal Eletrônica indicada ao lado.
              {d.dest_razao && (
                <><br />Destinatário: {d.dest_razao}{d.dest_endereco ? ` — ${d.dest_endereco}` : ""}{d.dest_cidade ? ` — ${d.dest_cidade} — ${d.dest_uf}` : ""}.</>
              )}
              <div style={{ marginTop: "1mm", fontSize: 6.5 }}>
                Emissão: {fmtData(nota.data_emissao)} &nbsp; Valor Total: R$ {fmtVal(nota.valor_total)}
              </div>
            </div>
            <div style={{ flex: 2, paddingLeft: "4mm", textAlign: "right" }}>
              <div style={{ fontSize: 6.5, color: "#555" }}>DATA DO RECEBIMENTO</div>
              <div style={{ borderBottom: "0.3mm solid #000", marginTop: "4mm", marginBottom: "1mm" }} />
              <div style={{ fontSize: 6.5, color: "#555" }}>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div>
              <div style={{ borderBottom: "0.3mm solid #000", marginTop: "4mm" }} />
            </div>
            <div style={{ paddingLeft: "4mm", textAlign: "right" }}>
              <div style={{ fontSize: 7.5, fontWeight: "bold", color: "#000" }}>NF-e</div>
              <div style={{ fontSize: 9, fontWeight: 900 }}>Nº {nota.numero?.toString().padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3")}</div>
              <div style={{ fontSize: 7 }}>Série {nota.serie}</div>
            </div>
          </div>
        </div>

        {/* ── CABEÇALHO PRINCIPAL ──────────────────────────────────────────── */}
        <div style={{ ...S.block, display: "flex", minHeight: "22mm" }}>
          {/* Emitente */}
          <div style={{ flex: 3, borderRight: S.border, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 900, textAlign: "center", textTransform: "uppercase", lineHeight: 1.3 }}>
              {d.emit_razao || <span style={{ color: "#c00" }}>EMITENTE NÃO CONFIGURADO</span>}
            </div>
            {(d.emit_endereco || d.emit_municipio) && (
              <div style={{ fontSize: 6.5, textAlign: "center", marginTop: "0.5mm", color: "#333" }}>
                {[d.emit_endereco, d.emit_numero, d.emit_bairro, d.emit_municipio, d.emit_uf].filter(Boolean).join(", ")}
              </div>
            )}
            {d.emit_fone && (
              <div style={{ fontSize: 6.5, textAlign: "center", color: "#333" }}>Fone: {d.emit_fone}</div>
            )}
            {d.emit_cep && (
              <div style={{ fontSize: 6.5, textAlign: "center", color: "#333" }}>CEP: {d.emit_cep}</div>
            )}
            {d.emit_email && (
              <div style={{ fontSize: 6.5, textAlign: "center", color: "#333" }}>{d.emit_email}</div>
            )}
          </div>

          {/* Centro — DANFE */}
          <div style={{ flex: 2, borderRight: S.border, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1mm" }}>
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: "0.12em" }}>DANFE</div>
            <div style={{ fontSize: 6, textAlign: "center", lineHeight: 1.4 }}>
              Documento Auxiliar da<br />Nota Fiscal Eletrônica
            </div>
            <div style={{ fontSize: 6.5, textAlign: "center" }}>
              0 - ENTRADA &nbsp;&nbsp; <strong>1 - SAÍDA ◀</strong>
            </div>
            <div style={{ border: S.border, padding: "0.8mm 4mm", textAlign: "center", marginTop: "1mm" }}>
              <div style={{ fontSize: 6 }}>Nº</div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.05em" }}>
                {nota.numero?.toString().padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3")}
              </div>
              <div style={{ fontSize: 6.5, fontWeight: 600 }}>Série {nota.serie}</div>
            </div>
            <div style={{ fontSize: 6, color: "#555" }}>Folha 1/1</div>
          </div>

          {/* Chave de acesso */}
          <div style={{ flex: 4, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <Lbl>Chave de Acesso</Lbl>
              {/* Código de barras simulado (linhas verticais finas) */}
              <div style={{ height: "8mm", display: "flex", alignItems: "stretch", gap: "0.2mm", marginBottom: "0.5mm", overflow: "hidden" }}>
                {Array.from({ length: 80 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: i % 3 === 0 ? "#000" : i % 7 === 0 ? "#000" : "transparent", minWidth: "0.3mm", maxWidth: "0.8mm" }} />
                ))}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 6.5, letterSpacing: "0.06em", border: "0.3mm solid #888", padding: "0.8mm 1mm", background: "#fafafa", wordBreak: "break-all", lineHeight: 1.8 }}>
                {chaveFmt ?? (isPreview ? "— aguardando transmissão SEFAZ —" : "—")}
              </div>
            </div>
            <div style={{ marginTop: "1mm" }}>
              <Lbl>Protocolo de Autorização de Uso</Lbl>
              <div style={{ fontSize: 7, fontWeight: 600 }}>
                {isPreview
                  ? "— não transmitida —"
                  : (d.protocolo_autorizacao || d.protocolo || "—")}
              </div>
            </div>
            {isPreview && (
              <div style={{ marginTop: "1mm", background: "#FFF3CD", border: "0.3mm solid #D4A017", padding: "0.8mm 1.5mm", fontSize: 6.5, color: "#856404", fontWeight: "bold", textAlign: "center" }}>
                SEM VALOR FISCAL — PREVIEW
              </div>
            )}
          </div>
        </div>

        {/* ── NATUREZA DA OPERAÇÃO ──────────────────────────────────────────── */}
        <div style={{ ...S.block, display: "flex" }}>
          <div style={{ ...S.cell(5) }}>
            <Lbl>Natureza da Operação</Lbl>
            <Val>{nota.natureza}
              {d.emit_tipo_doc ? <span style={{ fontSize: 6.5, fontWeight: 400, color: "#555" }}> ({d.emit_tipo_doc})</span> : null}
            </Val>
          </div>
          <div style={{ ...S.cell(2) }}>
            <Lbl>Inscrição Estadual</Lbl>
            <Val>{d.emit_ie || "—"}</Val>
          </div>
          <div style={{ ...S.cell(2) }}>
            <Lbl>Inscrição Estadual Subs. Trib.</Lbl>
            <Val>—</Val>
          </div>
          <div style={{ ...S.cellLast(3) }}>
            <Lbl>CNPJ</Lbl>
            <Val>{fmtCNPJ(String(d.emit_cnpj ?? ""))}</Val>
          </div>
        </div>

        {/* ── DESTINATÁRIO + DUPLICATAS ────────────────────────────────────── */}
        <div style={{ ...S.block }}>
          <div style={S.secTitle}>Destinatário / Remetente</div>
          {/* Linha 1 */}
          <div style={{ display: "flex", borderBottom: S.border }}>
            <div style={{ ...S.cell(5) }}>
              <Lbl>Nome / Razão Social</Lbl>
              <Val size={8.5}>{nota.destinatario}</Val>
            </div>
            <div style={{ ...S.cell(2.5) }}>
              <Lbl>CNPJ / CPF</Lbl>
              <Val>{fmtCNPJ(nota.cnpj_destinatario)}</Val>
            </div>
            <div style={{ ...S.cell(1.5) }}>
              <Lbl>Data de Emissão</Lbl>
              <Val>{fmtData(nota.data_emissao)}</Val>
            </div>
            <div style={{ ...S.cellLast(1.5) }}>
              <Lbl>Data de Saída / Entrada</Lbl>
              <Val>{fmtData(String(d.data_saida ?? ""))}</Val>
            </div>
          </div>
          {/* Linha 2 */}
          <div style={{ display: "flex", borderBottom: S.border }}>
            <div style={{ ...S.cell(5) }}>
              <Lbl>Endereço</Lbl>
              <Val>{[d.dest_endereco, d.dest_numero].filter(Boolean).join(", ") || "—"}</Val>
            </div>
            <div style={{ ...S.cell(2) }}>
              <Lbl>Município</Lbl>
              <Val>{d.dest_cidade || "—"}</Val>
            </div>
            <div style={{ ...S.cell(1) }}>
              <Lbl>UF</Lbl>
              <Val>{d.dest_uf || "—"}</Val>
            </div>
            <div style={{ ...S.cell(2) }}>
              <Lbl>Inscrição Estadual</Lbl>
              <Val>{d.dest_ie || "—"}</Val>
            </div>
            <div style={{ ...S.cellLast(1.5) }}>
              <Lbl>Hora de Saída</Lbl>
              <Val>{String(d.hora_saida ?? "")}</Val>
            </div>
          </div>
        </div>

        {/* ── DUPLICATAS ───────────────────────────────────────────────────── */}
        {duplicatas.length > 0 && (
          <div style={S.block}>
            <div style={S.secTitle}>Duplicatas</div>
            <div style={{ display: "flex" }}>
              {duplicatas.map((dup, i) => (
                <div key={i} style={{ ...S.cell(1) }}>
                  <Lbl>Número</Lbl>
                  <Val>{dup.num}</Val>
                  <Lbl>Vencimento</Lbl>
                  <Val>{dup.venc}</Val>
                  <Lbl>Valor R$</Lbl>
                  <Val>{dup.valor}</Val>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DADOS DOS PRODUTOS ───────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Dados dos Produtos / Serviços</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7 }}>
              <thead>
                <tr style={{ background: "#f0f0f0", borderBottom: S.border }}>
                  {[
                    { h: "Cód.", w: 16, right: false },
                    { h: "Descrição do Produto / Serviço", w: null, right: false },
                    { h: "NCM/SH", w: 24, right: false },
                    { h: "CST", w: 14, right: false },
                    { h: "CFOP", w: 16, right: false },
                    { h: "Unid.", w: 14, right: false },
                    { h: "Quantidade", w: 30, right: true },
                    { h: "Valor Unit.", w: 30, right: true },
                    { h: "Desconto", w: 24, right: true },
                    { h: "Valor Total", w: 30, right: true },
                    { h: "BC ICMS", w: 26, right: true },
                    { h: "ICMS", w: 22, right: true },
                    { h: "IPI", w: 22, right: true },
                    { h: "ICMS %", w: 18, right: true },
                    { h: "IPI %", w: 16, right: true },
                  ].map(({ h, w, right }, idx, arr) => (
                    <th key={idx} style={{
                      padding: "0.8mm 1mm", textAlign: right ? "right" : "left",
                      fontWeight: "bold", whiteSpace: "nowrap",
                      borderRight: idx < arr.length - 1 ? "0.2mm solid #ccc" : "none",
                      width: w ? `${w}mm` : undefined,
                      fontSize: 6.5,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: "3mm", textAlign: "center", color: "#888", fontStyle: "italic" }}>
                      Nenhum item registrado
                    </td>
                  </tr>
                ) : itens.map((it, i) => (
                  <tr key={i} style={{ borderBottom: "0.15mm solid #ddd", background: i % 2 ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", fontFamily: "monospace" }}>{String(i + 1).padStart(3, "0")}</td>
                    <td style={{ padding: "0.8mm 1mm", fontWeight: "bold", borderRight: "0.2mm solid #ddd" }}>{it.item}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", fontFamily: "monospace", fontSize: 7 }}>{it.ncm}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", textAlign: "center" }}>{it.cst || "051"}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd" }}>{it.cfop}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd" }}>{it.unidade}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>{fmtQtd(it.quantidade)}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>
                      {it.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                    </td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>{fmtVal(it.desconto ?? 0)}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", fontWeight: "bold", borderRight: "0.2mm solid #ddd" }}>{fmtVal(it.valor_total)}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>0,00</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>0,00</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>0,00</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>0,00</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right" }}>0,00</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── CÁLCULO DO IMPOSTO ────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Cálculo do Imposto</div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(2)}>
              <Lbl>Base de Cálculo do ICMS</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Valor do ICMS</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Base de Cálculo do ICMS Substituição</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Valor do ICMS Substituição</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Valor Total dos Produtos</Lbl>
              <Val>R$ {fmtVal(totalProdutos)}</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Valor do IPI</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Outras Desp. Acessórias</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Desconto</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Valor do Seguro</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Valor do Frete</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cellLast(2)}>
              <Lbl>Valor Total da Nota</Lbl>
              <div style={{ fontSize: 10, fontWeight: 900 }}>R$ {fmtVal(nota.valor_total)}</div>
            </div>
          </div>
        </div>

        {/* ── TRANSPORTADOR ─────────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Transportador / Volumes Transportados</div>
          <div style={{ display: "flex", borderBottom: S.border }}>
            <div style={S.cell(4)}>
              <Lbl>Razão Social</Lbl>
              <Val>{d.transportadora || "—"}</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Frete por Conta</Lbl>
              <Val>{d.frete_conta === "0" ? "0 – Emitente" : d.frete_conta === "1" ? "1 – Destinatário" : (d.frete_conta || "—")}</Val>
            </div>
            <div style={S.cell(1)}>
              <Lbl>Código ANTT</Lbl>
              <Val>{d.codigo_antt || "—"}</Val>
            </div>
            <div style={S.cell(1)}>
              <Lbl>Placa Veículo</Lbl>
              <Val>{d.placa || "—"}</Val>
            </div>
            <div style={S.cell(0.8)}>
              <Lbl>UF</Lbl>
              <Val>{d.uf_placa || "—"}</Val>
            </div>
            <div style={S.cellLast(2)}>
              <Lbl>CNPJ / CPF</Lbl>
              <Val>{fmtCNPJ(String(d.transp_cnpj ?? ""))}</Val>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(4)}>
              <Lbl>Endereço</Lbl>
              <Val>{d.transp_endereco || "—"}</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Município</Lbl>
              <Val>{d.transp_municipio || "—"}</Val>
            </div>
            <div style={S.cell(0.8)}>
              <Lbl>UF</Lbl>
              <Val>{d.transp_uf || "—"}</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Inscrição Estadual</Lbl>
              <Val>{d.transp_ie || "—"}</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Espécie</Lbl>
              <Val>{d.especie || "Granel"}</Val>
            </div>
            <div style={S.cell(1.5)}>
              <Lbl>Peso Bruto (kg)</Lbl>
              <Val>{d.peso_bruto ? Number(d.peso_bruto).toLocaleString("pt-BR", { minimumFractionDigits: 3 }) : "—"}</Val>
            </div>
            <div style={S.cellLast(1.5)}>
              <Lbl>Peso Líquido (kg)</Lbl>
              <Val>{d.peso_liquido ? Number(d.peso_liquido).toLocaleString("pt-BR", { minimumFractionDigits: 3 }) : "—"}</Val>
            </div>
          </div>
        </div>

        {/* ── CÁLCULO DO ISSQN ──────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Cálculo do ISSQN</div>
          <div style={{ display: "flex" }}>
            <div style={S.cell(2)}>
              <Lbl>Inscrição Municipal</Lbl>
              <Val>—</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Valor Total dos Serviços</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cell(2)}>
              <Lbl>Base de Cálculo do ISSQN</Lbl>
              <Val>R$ 0,00</Val>
            </div>
            <div style={S.cellLast(2)}>
              <Lbl>Valor Total do ISSQN</Lbl>
              <Val>R$ 0,00</Val>
            </div>
          </div>
        </div>

        {/* ── DADOS ADICIONAIS ─────────────────────────────────────────────── */}
        <div style={S.block}>
          <div style={S.secTitle}>Dados Adicionais</div>
          <div style={{ display: "flex", minHeight: "22mm" }}>
            <div style={{ flex: 3, borderRight: S.border, padding: "1.5mm 2mm" }}>
              <Lbl>Informações Complementares</Lbl>
              <div style={{ fontSize: 7, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: "0.5mm" }}>
                {textoComplementar}
              </div>
            </div>
            <div style={{ flex: 1, padding: "1.5mm 2mm" }}>
              <Lbl>Reservado ao Fisco</Lbl>
            </div>
          </div>
        </div>

        {/* ── RODAPÉ ──────────────────────────────────────────────────────── */}
        <div style={{ marginTop: "1.5mm", fontSize: 6, color: "#666", textAlign: "center" }}>
          {isPreview
            ? "PREVIEW GERADO PELO SISTEMA ARATO — SEM VALOR FISCAL — Documento para conferência interna"
            : `NF-e emitida em ${fmtData(nota.data_emissao)} · Protocolo: ${d.protocolo_autorizacao ?? "—"} · Chave: ${nota.chave_acesso ?? "—"}`}
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
