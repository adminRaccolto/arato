"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { NotaFiscal } from "../../../../../lib/supabase";

// ── Tabelas auxiliares ─────────────────────────────────────────────────
const NCM: Record<string, string> = {
  "Soja": "12019000", "Soja em Grão": "12019000", "Soja Convencional": "12019000",
  "Soja Transgênica": "12019000",
  "Milho": "10051090", "Milho 1ª": "10051090", "Milho 2ª (Safrinha)": "10051090", "Milho em Grão": "10051090",
  "Algodão": "52010020", "Algodão em Caroço": "52010020", "Algodão em Pluma": "52010010",
  "Caroço de Algodão": "12072100",
  "Trigo": "10019900", "Sorgo": "10079010",
};

const fmtDoc = (v = "") => {
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "—";
};
const fmtData = (s?: string | null) => {
  if (!s) return "—";
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
};
const fmtR = (n: number, dec = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtNum = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtNFe = (n?: string | number | null) =>
  String(n ?? "").replace(/\D/g, "").padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");

type Item = {
  item: string; ncm: string; cst?: string; cfop: string; unidade: string;
  quantidade: number; valor_unitario: number; desconto?: number; valor_total: number;
};

// ── Barras do código de barras interleaved (decorativo) ───────────────
function Barcode({ value }: { value: string }) {
  const bars = value.replace(/\s/g, "").split("").map((c, i) => (
    <div key={i} style={{
      width: i % 3 === 0 ? 1.2 : i % 5 === 0 ? 0.8 : 0.6,
      background: "#000",
      height: "100%",
      flexShrink: 0,
    }} />
  ));
  const gaps = value.replace(/\s/g, "").split("").map((_, i) => (
    <div key={`g${i}`} style={{
      width: i % 7 === 0 ? 1.5 : i % 3 === 0 ? 0.4 : 0.8,
      flexShrink: 0,
    }} />
  ));
  const interleaved = bars.flatMap((b, i) => [b, gaps[i]]);
  return (
    <div style={{ height: 10, display: "flex", alignItems: "stretch", overflow: "hidden", background: "#fff" }}>
      {interleaved}
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────
const B = "0.3mm solid #000";
const lbl: React.CSSProperties = { display: "block", fontSize: 6, color: "#555", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 1 };
const val: React.CSSProperties = { fontSize: 8, fontWeight: 700, color: "#000" };
const sec: React.CSSProperties = { background: "#e8e8e8", padding: "1mm 2mm", fontSize: 6.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: B };
const cell = (flex: number | string, right = false, extra: React.CSSProperties = {}): React.CSSProperties => ({
  flex, padding: "1mm 1.5mm", borderRight: B, overflow: "hidden", textAlign: right ? "right" : "left", ...extra,
});
const cellLast = (flex: number | string, right = false, extra: React.CSSProperties = {}): React.CSSProperties => ({
  flex, padding: "1mm 1.5mm", overflow: "hidden", textAlign: right ? "right" : "left", ...extra,
});

export default function DanfePage() {
  const params = useParams<{ id: string }>();
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [emitCnpjFallback, setEmitCnpjFallback] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const { data: nf } = await supabase.from("notas_fiscais").select("*").eq("id", params.id).single();
      if (!nf) { setLoading(false); return; }
      setNota(nf as NotaFiscal);

      // Fallback emit_cnpj: se dados_nf_json não tiver, busca no módulo fiscal da fazenda
      const dj = nf.dados_nf_json as Record<string, string | number | undefined> | null;
      const emitCnpjSalvo = String(dj?.emit_cnpj ?? "").replace(/\D/g, "");
      if (!emitCnpjSalvo && nf.fazenda_id) {
        const { data: mods } = await supabase.from("configuracoes_modulo")
          .select("modulo, config")
          .eq("fazenda_id", nf.fazenda_id)
          .or("modulo.like.fiscal_%,modulo.like.certificado_a1_%");
        const found = (mods ?? []).find(m => {
          const cfg = m.config as Record<string, string>;
          return cfg?.cpf_cnpj_emitente;
        });
        if (found) {
          setEmitCnpjFallback(((found.config as Record<string, string>).cpf_cnpj_emitente ?? "").replace(/\D/g, ""));
        }
      }

      if (nf.itens_json && (nf.itens_json as Item[]).length > 0) {
        setItens(nf.itens_json as Item[]);
        setLoading(false);
        return;
      }

      // Fallback: reconstruir do romaneio
      const romId = (dj as Record<string, string> | null)?.romaneio_id;
      const { data: rom } = await (
        romId
          ? supabase.from("romaneios").select("*, contratos(produto,preco)").eq("id", romId).maybeSingle()
          : supabase.from("romaneios").select("*, contratos(produto,preco)").eq("fazenda_id", nf.fazenda_id).eq("nfe_numero", nf.numero).maybeSingle()
      );
      if (rom) {
        const c = (rom as { contratos?: { produto?: string; preco?: number } }).contratos;
        const produto = c?.produto ?? "Produto";
        const pesoKg: number = (rom as { peso_classificado_kg?: number; sacas?: number }).peso_classificado_kg ?? (((rom as { sacas?: number }).sacas ?? 0) * 60);
        const vUnit = pesoKg > 0 ? nf.valor_total / pesoKg : (c?.preco ?? 0);
        setItens([{ item: produto, ncm: NCM[produto] ?? "12019000", cst: "051", cfop: nf.cfop ?? "5101", unidade: "KG", quantidade: pesoKg, valor_unitario: vUnit, valor_total: nf.valor_total }]);
      }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", fontSize: 14 }}>Carregando DANFE…</div>;
  if (!nota)   return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial", fontSize: 14, color: "#E24B4A" }}>Nota não encontrada.</div>;

  const d = (nota.dados_nf_json ?? {}) as Record<string, string | number | undefined>;
  // Garante emit_cnpj mesmo para notas antigas que não salvaram o campo
  const emitCnpjResolvido = String(d.emit_cnpj ?? "").replace(/\D/g, "") || emitCnpjFallback;
  const isHom    = nota.status !== "autorizada";
  const totalProd = itens.reduce((s, i) => s + i.valor_total, 0) || nota.valor_total;
  const chaveFmt  = (nota.chave_acesso ?? "").replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim();
  const protocolo = String(d.protocolo_autorizacao ?? d.protocolo ?? (isHom ? "— aguardando SEFAZ —" : "—"));

  // Duplicatas
  const dups: { num: string; venc: string; valor: string }[] = [];
  if (d.dup_numero) dups.push({ num: String(d.dup_numero), venc: fmtData(String(d.dup_vencimento ?? "")), valor: fmtR(Number(d.dup_valor ?? nota.valor_total)) });

  // Emitente
  const emitNome    = String(d.emit_razao ?? "EMITENTE NÃO CONFIGURADO");
  const emitEnd     = [d.emit_endereco, d.emit_numero, d.emit_bairro].filter(Boolean).join(", ");
  const emitLocaliz = [d.emit_municipio, d.emit_uf, d.emit_cep ? `CEP: ${String(d.emit_cep).replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2")}` : ""].filter(Boolean).join(" — ");

  // Destinatário
  const destEnd     = [d.dest_endereco, d.dest_numero].filter(Boolean).join(", ") || "—";
  const destBairro  = String(d.dest_bairro ?? "") || "—";
  const destCEP     = String(d.dest_cep ?? "").replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") || "—";
  const destFone    = String(d.dest_fone ?? "") || "—";

  const pg: React.CSSProperties = {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 8,
    color: "#000",
    background: "#fff",
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "5mm 6mm",
    boxSizing: "border-box",
    position: "relative",
  };

  return (
    <>
      {/* Barra de ferramentas — não imprime */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: isHom ? "#FFF3CD" : "#1A4870",
        color: isHom ? "#856404" : "#fff",
        padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: "Arial", fontSize: 13, fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
      }}>
        <span>{isHom ? "⚠️ PREVIEW — Sem valor fiscal. Confira antes de transmitir." : `✓ NF-e Autorizada — Protocolo: ${protocolo}`}</span>
        <button onClick={() => window.print()} style={{ padding: "6px 18px", background: isHom ? "#856404" : "#fff", color: isHom ? "#fff" : "#1A4870", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          Imprimir / Salvar PDF
        </button>
      </div>
      <div className="no-print" style={{ height: 44 }} />

      <div style={pg}>
        {/* Marca d'água */}
        {isHom && (
          <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%,-50%) rotate(-35deg)", fontSize: 60, fontWeight: 900, color: "rgba(200,0,0,0.05)", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none", letterSpacing: "0.1em", zIndex: 0 }}>
            SEM VALOR FISCAL
          </div>
        )}

        {/* ── AVISO HOMOLOGAÇÃO ──────────────────────────────────────────── */}
        {isHom && (
          <div style={{ border: B, textAlign: "center", fontSize: 7, fontWeight: 700, padding: "1mm", marginBottom: "1mm", background: "#fffde7", letterSpacing: "0.1em" }}>
            ⚠ AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL ⚠
          </div>
        )}

        {/* ── CANHÃO ────────────────────────────────────────────────────── */}
        <div style={{ border: "0.3mm dashed #000", marginBottom: "2mm", padding: "1.5mm 2mm", display: "flex", gap: "3mm", alignItems: "flex-start" }}>
          {/* Texto recebimento */}
          <div style={{ flex: 3, fontSize: 7, lineHeight: 1.6 }}>
            <strong>RECEBEMOS DE {emitNome}</strong> OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO.
            <div style={{ marginTop: "0.8mm", fontSize: 6.5, color: "#333" }}>
              Emissão: {fmtData(nota.data_emissao)}
              {nota.destinatario && <span> &nbsp;·&nbsp; Dest/Reme: {nota.destinatario}</span>}
              {nota.valor_total > 0 && <span> &nbsp;·&nbsp; Valor Total: R$ {fmtR(nota.valor_total)}</span>}
            </div>
          </div>
          {/* Campos assinatura */}
          <div style={{ flex: 2, fontSize: 6, color: "#444", display: "flex", flexDirection: "column", gap: "0.5mm" }}>
            <span>DATA DO RECEBIMENTO</span>
            <div style={{ borderBottom: B, marginBottom: "2mm", marginTop: "2mm" }} />
            <span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
            <div style={{ borderBottom: B, marginTop: "2mm" }} />
          </div>
          {/* Nº NF-e */}
          <div style={{ textAlign: "right", minWidth: "22mm" }}>
            <div style={{ fontSize: 7.5, fontWeight: 700 }}>NF-e</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.02em" }}>Nº {fmtNFe(nota.numero)}</div>
            <div style={{ fontSize: 7 }}>Série {nota.serie}</div>
          </div>
        </div>

        {/* ── CABEÇALHO: EMITENTE | DANFE | CHAVE ──────────────────────── */}
        <div style={{ border: B, display: "flex", minHeight: "24mm", marginBottom: "0.5mm" }}>
          {/* Emitente */}
          <div style={{ flex: 3, borderRight: B, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, textAlign: "center", textTransform: "uppercase", lineHeight: 1.3 }}>
              {emitNome}
            </div>
            {emitEnd && <div style={{ fontSize: 6.5, textAlign: "center", marginTop: "0.5mm", color: "#333" }}>{emitEnd}</div>}
            {emitLocaliz && <div style={{ fontSize: 6.5, textAlign: "center", color: "#333" }}>{emitLocaliz}</div>}
            {d.emit_fone && <div style={{ fontSize: 6.5, textAlign: "center", color: "#333" }}>Fone: {d.emit_fone}</div>}
          </div>
          {/* Centro DANFE */}
          <div style={{ flex: 2, borderRight: B, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1mm" }}>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.12em" }}>DANFE</div>
            <div style={{ fontSize: 6, textAlign: "center", lineHeight: 1.4 }}>Documento Auxiliar da<br />Nota Fiscal Eletrônica</div>
            <div style={{ fontSize: 6.5, textAlign: "center" }}>0 - ENTRADA &nbsp;&nbsp;<strong>1 - SAÍDA</strong></div>
            <div style={{ border: B, padding: "0.8mm 4mm", textAlign: "center" }}>
              <div style={{ fontSize: 6 }}>Nº</div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em" }}>{fmtNFe(nota.numero)}</div>
              <div style={{ fontSize: 6.5, fontWeight: 600 }}>Série {nota.serie}</div>
            </div>
            <div style={{ fontSize: 6, color: "#555" }}>Folha 1/1</div>
          </div>
          {/* Chave de acesso + Protocolo */}
          <div style={{ flex: 4, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ ...lbl, marginBottom: "0.5mm" }}>Chave de Acesso</div>
              <Barcode value={chaveFmt || "00000000000000000000000000000000000000000000"} />
              <div style={{ fontFamily: "monospace", fontSize: 6.5, letterSpacing: "0.06em", padding: "0.5mm 0", wordBreak: "break-all" }}>
                {chaveFmt || (isHom ? "— aguardando transmissão SEFAZ —" : "—")}
              </div>
            </div>
            <div>
              <div style={lbl}>Protocolo de Autorização de Uso</div>
              <div style={{ fontSize: 7, fontWeight: 700 }}>{protocolo}</div>
            </div>
            {isHom && (
              <div style={{ background: "#FFF3CD", border: "0.3mm solid #D4A017", padding: "0.8mm", fontSize: 6.5, color: "#856404", fontWeight: 700, textAlign: "center" }}>
                SEM VALOR FISCAL — PREVIEW
              </div>
            )}
          </div>
        </div>

        {/* ── NATUREZA DA OPERAÇÃO ──────────────────────────────────────── */}
        {(() => {
          const emitDoc = emitCnpjResolvido;
          const emitDocLabel = emitDoc.length === 11 ? "CPF do Emitente" : "CNPJ do Emitente";
          return (
            <div style={{ border: B, display: "flex", marginBottom: "0.5mm" }}>
              <div style={cell(5)}>
                <span style={lbl}>Natureza da Operação</span>
                <div style={val}>{nota.natureza || "—"}</div>
              </div>
              <div style={cell(2)}>
                <span style={lbl}>IE do Emitente</span>
                <div style={val}>{String(d.emit_ie ?? "") || "—"}</div>
              </div>
              <div style={cell(2)}>
                <span style={lbl}>IE Subs. Tributário</span>
                <div style={val}>—</div>
              </div>
              <div style={cellLast(3)}>
                <span style={lbl}>{emitDocLabel}</span>
                <div style={val}>{fmtDoc(emitDoc) || "—"}</div>
              </div>
            </div>
          );
        })()}

        {/* ── DESTINATÁRIO / REMETENTE ──────────────────────────────────── */}
        <div style={{ border: B, marginBottom: "0.5mm" }}>
          <div style={sec}>Destinatário / Remetente</div>
          {/* Linha 1: Nome | CNPJ | Data Emissão */}
          <div style={{ display: "flex", borderBottom: B }}>
            <div style={cell(5)}>
              <span style={lbl}>Nome / Razão Social</span>
              <div style={{ ...val, fontSize: 8.5 }}>{nota.destinatario || "—"}</div>
            </div>
            <div style={cell(2.5)}>
              <span style={lbl}>CNPJ / CPF</span>
              <div style={val}>{fmtDoc(nota.cnpj_destinatario ?? "")}</div>
            </div>
            <div style={cellLast(2)}>
              <span style={lbl}>Data de Emissão</span>
              <div style={val}>{fmtData(nota.data_emissao)}</div>
            </div>
          </div>
          {/* Linha 2: Endereço | Bairro | CEP | Data Saída */}
          <div style={{ display: "flex", borderBottom: B }}>
            <div style={cell(4)}>
              <span style={lbl}>Endereço</span>
              <div style={val}>{destEnd}</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Bairro / Distrito</span>
              <div style={val}>{destBairro}</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>CEP</span>
              <div style={val}>{destCEP}</div>
            </div>
            <div style={cellLast(2)}>
              <span style={lbl}>Data Saída / Entrada</span>
              <div style={val}>{fmtData(String(d.data_saida ?? ""))}</div>
            </div>
          </div>
          {/* Linha 3: Município | UF | Fone | IE | Hora Saída */}
          <div style={{ display: "flex" }}>
            <div style={cell(3)}>
              <span style={lbl}>Município</span>
              <div style={val}>{String(d.dest_cidade ?? "") || "—"}</div>
            </div>
            <div style={cell(0.8)}>
              <span style={lbl}>UF</span>
              <div style={val}>{String(d.dest_uf ?? "") || "—"}</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Telefone / Fax</span>
              <div style={val}>{destFone}</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>IE do Destinatário</span>
              <div style={val}>{String(d.dest_ie ?? "") || "—"}</div>
            </div>
            <div style={cellLast(1.5)}>
              <span style={lbl}>Hora da Saída</span>
              <div style={val}>{String(d.hora_saida ?? "") || "—"}</div>
            </div>
          </div>
        </div>

        {/* ── DUPLICATAS / FATURA ───────────────────────────────────────── */}
        {dups.length > 0 && (
          <div style={{ border: B, marginBottom: "0.5mm" }}>
            <div style={sec}>Fatura / Duplicatas</div>
            <div style={{ display: "flex" }}>
              {dups.map((dup, i) => (
                <div key={i} style={cell(1)}>
                  <span style={lbl}>Número</span><div style={{ ...val, marginBottom: 2 }}>{dup.num}</div>
                  <span style={lbl}>Vencimento</span><div style={{ ...val, marginBottom: 2 }}>{dup.venc}</div>
                  <span style={lbl}>Valor R$</span><div style={val}>{dup.valor}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CÁLCULO DO IMPOSTO ────────────────────────────────────────── */}
        <div style={{ border: B, marginBottom: "0.5mm" }}>
          <div style={sec}>Cálculo do Imposto</div>
          {/* Linha 1 */}
          <div style={{ display: "flex", borderBottom: B }}>
            <div style={cell(2)}>
              <span style={lbl}>Base de Cálculo do ICMS</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Valor do ICMS</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Base de Cálculo do ICMS Subst.</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Valor do ICMS Substituição</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cellLast(2)}>
              <span style={lbl}>Valor Total dos Produtos</span>
              <div style={val}>{fmtR(totalProd)}</div>
            </div>
          </div>
          {/* Linha 2 */}
          <div style={{ display: "flex" }}>
            <div style={cell(1.5)}>
              <span style={lbl}>Valor do Frete</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Valor do Seguro</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Desconto</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Outras Despesas Acessórias</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Valor do IPI</span>
              <div style={val}>0,00</div>
            </div>
            <div style={cellLast(2)}>
              <span style={lbl}>Valor Total da Nota</span>
              <div style={{ fontSize: 11, fontWeight: 900 }}>R$ {fmtR(nota.valor_total)}</div>
            </div>
          </div>
        </div>

        {/* ── TRIBUTOS — REFORMA TRIBUTÁRIA (LC 214/2024) ──────────────── */}
        {(() => {
          const ibsValor = Number(d.ibs_valor ?? 0);
          const cbsValor = Number(d.cbs_valor ?? 0);
          const ibsAliq  = Number(d.ibs_aliquota ?? 0);
          const cbsAliq  = Number(d.cbs_aliquota ?? 0.9);
          const totTrib  = ibsValor + cbsValor;
          return (
            <div style={{ border: B, marginBottom: "0.5mm" }}>
              <div style={{ ...sec, background: "#f5f5f5" }}>Tributos — Reforma Tributária (LC 214/2024)</div>
              <div style={{ display: "flex" }}>
                <div style={cell(2)}>
                  <span style={lbl}>IBS — Imposto sobre Bens e Serviços</span>
                  <div style={val}>R$ {fmtR(ibsValor)}</div>
                  <div style={{ fontSize: 6, color: "#888", marginTop: 1 }}>Alíquota {fmtR(ibsAliq, 2)}% · Vigência 2029</div>
                </div>
                <div style={cell(2)}>
                  <span style={lbl}>CBS — Contribuição sobre Bens e Serviços</span>
                  <div style={val}>R$ {fmtR(cbsValor)}</div>
                  <div style={{ fontSize: 6, color: "#888", marginTop: 1 }}>Alíquota {fmtR(cbsAliq, 2)}% · Transitório 2026</div>
                </div>
                <div style={cell(2)}>
                  <span style={lbl}>Total Tributos Estimados (IBS + CBS)</span>
                  <div style={{ fontSize: 9, fontWeight: 900 }}>R$ {fmtR(totTrib)}</div>
                </div>
                <div style={cellLast(4)}>
                  <span style={lbl}>Base Legal</span>
                  <div style={{ fontSize: 6.5, lineHeight: 1.5, color: "#333" }}>
                    Tributo estimado conforme LC 214/2024 e NT 2025.001.<br />
                    Produtos agropecuários podem ter alíquota zero no período de transição (2026–2028).
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── TRANSPORTADOR ─────────────────────────────────────────────── */}
        <div style={{ border: B, marginBottom: "0.5mm" }}>
          <div style={sec}>Transportador / Volumes Transportados</div>
          <div style={{ display: "flex", borderBottom: B }}>
            <div style={cell(4)}>
              <span style={lbl}>Razão Social</span>
              <div style={val}>{String(d.transportadora ?? "") || "—"}</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Frete por Conta</span>
              <div style={val}>{d.frete_conta === "0" ? "0 — Emitente" : d.frete_conta === "1" ? "1 — Destinatário" : String(d.frete_conta ?? "9 — Sem Frete")}</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Código ANTT</span>
              <div style={val}>{String(d.codigo_antt ?? "") || "—"}</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Placa do Veículo</span>
              <div style={val}>{String(d.placa ?? "") || "—"}</div>
            </div>
            <div style={cell(0.8)}>
              <span style={lbl}>UF</span>
              <div style={val}>{String(d.uf_placa ?? "") || "—"}</div>
            </div>
            <div style={cellLast(2)}>
              <span style={lbl}>CNPJ / CPF</span>
              <div style={val}>{fmtDoc(String(d.transp_cnpj ?? ""))}</div>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={cell(3)}>
              <span style={lbl}>Endereço</span>
              <div style={val}>{String(d.transp_endereco ?? "") || "—"}</div>
            </div>
            <div style={cell(2)}>
              <span style={lbl}>Município</span>
              <div style={val}>{String(d.transp_municipio ?? "") || "—"}</div>
            </div>
            <div style={cell(0.8)}>
              <span style={lbl}>UF</span>
              <div style={val}>{String(d.transp_uf ?? "") || "—"}</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Inscrição Estadual</span>
              <div style={val}>{String(d.transp_ie ?? "") || "—"}</div>
            </div>
            <div style={cell(1.5)}>
              <span style={lbl}>Quantidade</span>
              <div style={val}>{String(d.qt_volumes ?? "") || "—"}</div>
            </div>
            <div style={cell(1.2)}>
              <span style={lbl}>Espécie</span>
              <div style={val}>{String(d.especie ?? "Granel") || "Granel"}</div>
            </div>
            <div style={cell(1)}>
              <span style={lbl}>Peso Bruto</span>
              <div style={val}>{d.peso_bruto ? fmtNum(Number(d.peso_bruto)) : "—"}</div>
            </div>
            <div style={cellLast(1)}>
              <span style={lbl}>Peso Líquido</span>
              <div style={val}>{d.peso_liquido ? fmtNum(Number(d.peso_liquido)) : "—"}</div>
            </div>
          </div>
        </div>

        {/* ── DADOS DOS PRODUTOS / SERVIÇOS ─────────────────────────────── */}
        <div style={{ border: B, marginBottom: "0.5mm" }}>
          <div style={sec}>Dados dos Produtos / Serviços</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7 }}>
              <thead>
                <tr style={{ background: "#f0f0f0", borderBottom: B }}>
                  {[
                    { h: "Cód.", w: "10mm", r: false },
                    { h: "Descrição do Produto / Serviço", w: null, r: false },
                    { h: "NCM/SH", w: "20mm", r: false },
                    { h: "CST", w: "10mm", r: false },
                    { h: "CFOP", w: "12mm", r: false },
                    { h: "Unid.", w: "10mm", r: false },
                    { h: "Quantidade", w: "24mm", r: true },
                    { h: "Valor Unit.", w: "26mm", r: true },
                    { h: "Desconto", w: "20mm", r: true },
                    { h: "Valor Total", w: "26mm", r: true },
                    { h: "BC ICMS", w: "20mm", r: true },
                    { h: "Vl. ICMS", w: "18mm", r: true },
                    { h: "Vl. IPI", w: "16mm", r: true },
                    { h: "% ICMS", w: "14mm", r: true },
                    { h: "% IPI", w: "12mm", r: true },
                  ].map(({ h, w, r }, idx, arr) => (
                    <th key={idx} style={{ padding: "0.8mm 1mm", textAlign: r ? "right" : "left", fontWeight: 700, whiteSpace: "nowrap", borderRight: idx < arr.length - 1 ? "0.2mm solid #ccc" : "none", width: w ?? undefined, fontSize: 6.5 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr><td colSpan={15} style={{ padding: "3mm", textAlign: "center", color: "#888", fontStyle: "italic" }}>Nenhum item registrado</td></tr>
                ) : itens.map((it, i) => (
                  <tr key={i} style={{ borderBottom: "0.15mm solid #ddd", background: i % 2 ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", fontFamily: "monospace" }}>{String(i + 1).padStart(4, "0")}</td>
                    <td style={{ padding: "0.8mm 1mm", fontWeight: 700, borderRight: "0.2mm solid #ddd" }}>{it.item}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", fontFamily: "monospace" }}>{it.ncm}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd", textAlign: "center" }}>{it.cst ?? "051"}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd" }}>{it.cfop}</td>
                    <td style={{ padding: "0.8mm 1mm", borderRight: "0.2mm solid #ddd" }}>{it.unidade}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>{fmtNum(it.quantidade)}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>{it.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", borderRight: "0.2mm solid #ddd" }}>{fmtR(it.desconto ?? 0)}</td>
                    <td style={{ padding: "0.8mm 1mm", textAlign: "right", fontWeight: 700, borderRight: "0.2mm solid #ddd" }}>{fmtR(it.valor_total)}</td>
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

        {/* ── DADOS ADICIONAIS ──────────────────────────────────────────── */}
        <div style={{ border: B, marginBottom: "0.5mm" }}>
          <div style={sec}>Dados Adicionais</div>
          <div style={{ display: "flex", minHeight: "20mm" }}>
            <div style={{ flex: 3, borderRight: B, padding: "1.5mm 2mm" }}>
              <span style={lbl}>Informações Complementares</span>
              <div style={{ fontSize: 7, lineHeight: 1.7, whiteSpace: "pre-line", marginTop: "0.5mm" }}>
                {nota.observacao || "—"}
              </div>
            </div>
            <div style={{ flex: 1, padding: "1.5mm 2mm" }}>
              <span style={lbl}>Reservado ao Fisco</span>
            </div>
          </div>
        </div>

        {/* ── RODAPÉ ───────────────────────────────────────────────────── */}
        <div style={{ fontSize: 6, color: "#666", textAlign: "right", marginTop: "1mm" }}>
          DATA E HORA DA IMPRESSÃO: {new Date().toLocaleString("pt-BR")} &nbsp;·&nbsp; RacTech ERP Agrícola
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          @page { size: A4 portrait; margin: 0; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </>
  );
}
