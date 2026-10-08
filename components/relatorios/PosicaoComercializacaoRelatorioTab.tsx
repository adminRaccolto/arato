"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Aba "Posição de Comercialização" do espaço dedicado de Relatórios
// (Financeiro → Relatórios Financeiros → Posição de Comercialização).
//
// Mesmo padrão da aba Pedidos de Compra: RELATÓRIO (filtra, gera PDF/XLSX),
// nunca dentro da tela de lançamento (/contratos). Auto-contido, sem
// nenhuma ação de escrita.
//
// Fonte: rel_contratos (trigger-sync, Seção 319) — já vem com produtor
// (COALESCE produtores.nome quando o campo gravado está nulo), comprador
// (COALESCE pessoas.nome), ano safra e conta_id resolvidos, além de saldo_sc
// já calculado (quantidade_sc - entregue_sc).
// ═══════════════════════════════════════════════════════════════════════════
import InputData from "../../components/InputData";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../AuthProvider";

type RelContrato = {
  id: string;
  fazenda_id: string | null;
  numero: string | null;
  tipo: string | null;
  modalidade: string | null;
  status: string;
  moeda: string | null;
  produto: string | null;
  produtor_nome: string | null;
  comprador_nome: string | null;
  pessoa_id: string | null;
  ano_safra_id: string | null;
  ano_safra_descricao: string | null;
  ciclo_descricao: string | null;
  preco: number | null;
  quantidade_sc: number | null;
  entregue_sc: number | null;
  saldo_sc: number | null;
  data_contrato: string | null;
  data_entrega: string | null;
  is_arrendamento: boolean | null;
  is_compra_terra: boolean | null;
  is_barter: boolean | null;
};

const STATUS_MAP: Record<string, { label: string; cor: string }> = {
  aberto:    { label: "Aberto",    cor: "#0D0D0D" },
  parcial:   { label: "Parcial",   cor: "#7A5200" },
  encerrado: { label: "Encerrado", cor: "#166534" },
  cancelado: { label: "Cancelado", cor: "#791F1F" },
};
const STATUS_OPCOES = Object.keys(STATUS_MAP);

const fmtN = (v?: number | null, d = 2) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoedaUnit = (v: number | null | undefined, moeda: string | null) => `${moeda === "USD" ? "US$" : "R$"} ${fmtN(v, 4)}`;
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-2)" };

export default function PosicaoComercializacaoRelatorioTab() {
  const { fazendaId, fazendaIds, contaId, nomeUsuario, contaNome, logoCliente } = useAuth();

  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  const [opcoesProduto,   setOpcoesProduto]   = useState<string[]>([]);
  const [opcoesComprador, setOpcoesComprador] = useState<{ id: string; nome: string }[]>([]);
  const [opcoesAnoSafra,  setOpcoesAnoSafra]  = useState<{ id: string; descricao: string }[]>([]);
  const [opcoesCarregadas, setOpcoesCarregadas] = useState(false);

  const [fProduto,   setFProduto]   = useState("");
  const [fComprador, setFComprador] = useState("");
  const [fStatus,    setFStatus]    = useState<Set<string>>(new Set());
  const [fAnoSafra,  setFAnoSafra]  = useState("");
  const [fDataDe,    setFDataDe]    = useState("");
  const [fDataAte,   setFDataAte]   = useState("");
  const [fTipo,       setFTipo]      = useState<"sintetico" | "analitico">("analitico");
  const [fFormato,    setFFormato]   = useState<"pdf" | "xlsx">("pdf");

  const toggleStatus = (v: string) => setFStatus(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  async function abrirModal() {
    setErro("");
    setModalAberto(true);
    if (opcoesCarregadas) return;
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_contratos").select("produto, pessoa_id, comprador_nome, ano_safra_id, ano_safra_descricao");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      const { data } = await q;
      const prod = new Set<string>();
      const comp = new Map<string, string>();
      const safra = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.produto) prod.add(r.produto);
        if (r.pessoa_id && r.comprador_nome) comp.set(r.pessoa_id, r.comprador_nome);
        if (r.ano_safra_id && r.ano_safra_descricao) safra.set(r.ano_safra_id, r.ano_safra_descricao);
      }
      setOpcoesProduto(Array.from(prod).sort());
      setOpcoesComprador(Array.from(comp, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesAnoSafra(Array.from(safra, ([id, descricao]) => ({ id, descricao })).sort((a, b) => b.descricao.localeCompare(a.descricao)));
      setOpcoesCarregadas(true);
    } catch { /* silencioso — dropdowns ficam vazios, filtro continua funcionando com os demais campos */ }
  }

  async function buscarContratosFiltrados(): Promise<RelContrato[]> {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    let q = supabase.from("rel_contratos").select("*");
    q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
    if (fProduto) q = q.eq("produto", fProduto);
    if (fComprador) q = q.eq("pessoa_id", fComprador);
    if (fStatus.size > 0) q = q.in("status", Array.from(fStatus));
    if (fAnoSafra) q = q.eq("ano_safra_id", fAnoSafra);
    if (fDataDe) q = q.gte("data_contrato", fDataDe);
    if (fDataAte) q = q.lte("data_contrato", fDataAte);
    q = q.order("data_contrato", { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RelContrato[];
  }

  function buildHtml(contratos: RelContrato[], titulo: string): string {
    const porProduto = new Map<string, { qtd: number; entregue: number; saldo: number }>();
    for (const c of contratos) {
      const k = c.produto ?? "—";
      const cur = porProduto.get(k) ?? { qtd: 0, entregue: 0, saldo: 0 };
      cur.qtd += c.quantidade_sc ?? 0; cur.entregue += c.entregue_sc ?? 0; cur.saldo += c.saldo_sc ?? 0;
      porProduto.set(k, cur);
    }
    const totQtd = contratos.reduce((s, c) => s + (c.quantidade_sc ?? 0), 0);
    const totEnt = contratos.reduce((s, c) => s + (c.entregue_sc ?? 0), 0);
    const totSaldo = contratos.reduce((s, c) => s + (c.saldo_sc ?? 0), 0);

    const td = (v: string, right = false, bold = false) =>
      `<td style="padding:4px 7px;border:1px solid #E5E7EB;${right ? "text-align:right;" : ""}${bold ? "font-weight:700;" : ""}white-space:nowrap">${v}</td>`;

    const linhasDetalhe = fTipo === "analitico" ? contratos.map(c => `<tr>
      ${td(c.numero ?? "—")}${td(c.produto ?? "—")}${td(c.produtor_nome ?? "—")}${td(c.comprador_nome ?? "—")}${td(c.ano_safra_descricao ?? "—")}
      ${td(fmtMoedaUnit(c.preco, c.moeda), true)}${td(fmtN(c.quantidade_sc), true)}${td(fmtN(c.entregue_sc), true)}${td(fmtN(c.saldo_sc), true, true)}
      ${td(fmtData(c.data_contrato))}${td(fmtData(c.data_entrega))}
      <td style="padding:4px 7px;border:1px solid #E5E7EB;color:${STATUS_MAP[c.status]?.cor ?? "#555"};font-weight:600">${STATUS_MAP[c.status]?.label ?? c.status}</td>
    </tr>`).join("") : "";

    const linhasResumo = Array.from(porProduto, ([produto, v]) => `<tr>
      ${td(produto)}${td(fmtN(v.qtd), true)}${td(fmtN(v.entregue), true)}${td(fmtN(v.saldo), true, true)}
    </tr>`).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
<style>
  body{margin:0;font-family:Arial,sans-serif;font-size:9pt;color:#1a1a1a;background:#D1D5DB}
  .rt-toolbar{position:sticky;top:0;background:#111111;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .rt-toolbar span{color:#fff;font-size:13px;font-weight:700}
  .rt-btn{background:#fff;color:#111111;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .rt-page-wrapper{display:flex;flex-direction:column;align-items:center;padding:24px}
  .rt-page{background:#fff;width:297mm;min-height:190mm;padding:12mm;box-shadow:0 4px 24px rgba(0,0,0,.18);box-sizing:border-box}
  @page{size:A4 landscape;margin:12mm}
  @media print{body{background:#fff}.rt-toolbar{display:none!important}.rt-page-wrapper{padding:0}.rt-page{box-shadow:none;width:100%;min-height:0;padding:0}}
</style></head><body>
<div class="rt-toolbar"><span>${titulo}</span><button class="rt-btn" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button></div>
<div class="rt-page-wrapper"><div class="rt-page">
<div style="border-bottom:2px solid #111111;padding-bottom:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="display:flex;align-items:center;gap:12px">
    ${logoCliente ? `<img src="${logoCliente}" style="height:44px;object-fit:contain">` : ""}
    <div>
      <div style="font-size:15pt;font-weight:700;color:#111111;line-height:1.2">${contaNome ?? "—"}</div>
      <div style="font-size:7.5pt;color:#888;margin-top:3px">Emitido por ${nomeUsuario ?? "—"} em ${new Date().toLocaleString("pt-BR")}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#111111">POSIÇÃO DE COMERCIALIZAÇÃO DE GRÃOS</div>
    <div style="font-size:9pt;color:#555">${titulo}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">
  ${[
    { l: "Total Contratado (sc)", v: fmtN(totQtd), hl: false },
    { l: "Total Entregue (sc)", v: fmtN(totEnt), hl: true },
    { l: "Saldo a Entregar (sc)", v: fmtN(totSaldo), hl: false },
    { l: "% Entregue", v: totQtd > 0 ? `${Math.round((totEnt / totQtd) * 100)}%` : "—", hl: false },
  ].map(s => `<div style="border:1px solid #DDE2EE;border-radius:4px;padding:6px 9px;background:${s.hl ? "#111111" : "#fff"};color:${s.hl ? "#fff" : "#111111"}"><div style="font-size:7pt;color:${s.hl ? "rgba(255,255,255,0.8)" : "#888"};margin-bottom:2px">${s.l}</div><div style="font-size:11pt;font-weight:700">${s.v}</div></div>`).join("")}
</div>
<div style="font-size:10pt;font-weight:700;color:#111111;margin:10px 0 4px">Resumo por Produto</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:14px">
  <thead><tr>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">Produto</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Contratado (sc)</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Entregue (sc)</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Saldo (sc)</th>
  </tr></thead>
  <tbody>${linhasResumo}</tbody>
</table>
${fTipo === "analitico" ? `
<div style="font-size:10pt;font-weight:700;color:#111111;margin:10px 0 4px">Contratos (${contratos.length})</div>
<table style="width:100%;border-collapse:collapse;font-size:7.5pt">
  <thead><tr>
    ${["Nº Contrato", "Produto", "Produtor", "Comprador", "Ano Safra", "Preço", "Qtd (sc)", "Entregue (sc)", "Saldo (sc)", "Data Contrato", "Data Entrega", "Status"]
      .map(h => `<th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">${h}</th>`).join("")}
  </tr></thead>
  <tbody>${linhasDetalhe}</tbody>
</table>` : ""}
<div style="margin-top:14px;padding-top:6px;border-top:1px solid #DDE2EE;font-size:7pt;color:#aaa;text-align:center">
  Arato · Gestão Agrícola de Precisão
</div>
</div></div>
</body></html>`;
  }

  async function gerar() {
    setErro("");
    setGerando(true);
    try {
      const contratos = await buscarContratosFiltrados();
      if (contratos.length === 0) { setErro("Nenhum contrato encontrado para esse filtro."); return; }

      const partes: string[] = [];
      if (fProduto) partes.push(fProduto);
      if (fComprador) partes.push(opcoesComprador.find(c => c.id === fComprador)?.nome ?? "Comprador");
      if (fAnoSafra) partes.push(opcoesAnoSafra.find(a => a.id === fAnoSafra)?.descricao ?? "Safra");
      if (partes.length === 0) partes.push("Todos os produtos");
      const titulo = `${partes.join(" · ")} — ${contratos.length} contrato(s)`;

      if (fFormato === "pdf") {
        const win = window.open("", "_blank");
        if (!win) throw new Error("O navegador bloqueou a abertura da nova aba — permita pop-ups pra este site.");
        win.document.write(buildHtml(contratos, `${titulo} — Arato`));
        win.document.close();
        win.focus();
      } else {
        const XLSX = await import("xlsx");
        const porProduto = new Map<string, { qtd: number; entregue: number; saldo: number }>();
        for (const c of contratos) {
          const k = c.produto ?? "—";
          const cur = porProduto.get(k) ?? { qtd: 0, entregue: 0, saldo: 0 };
          cur.qtd += c.quantidade_sc ?? 0; cur.entregue += c.entregue_sc ?? 0; cur.saldo += c.saldo_sc ?? 0;
          porProduto.set(k, cur);
        }
        const linhasResumo = Array.from(porProduto, ([produto, v]) => ({
          "Produto": produto, "Contratado (sc)": v.qtd, "Entregue (sc)": v.entregue, "Saldo (sc)": v.saldo,
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasResumo), "Resumo");
        if (fTipo === "analitico") {
          const linhasDet = contratos.map(c => ({
            "Nº Contrato": c.numero ?? "", "Produto": c.produto ?? "", "Produtor": c.produtor_nome ?? "",
            "Comprador": c.comprador_nome ?? "", "Ano Safra": c.ano_safra_descricao ?? "", "Moeda": c.moeda ?? "",
            "Preço": c.preco ?? 0, "Qtd (sc)": c.quantidade_sc ?? 0, "Entregue (sc)": c.entregue_sc ?? 0,
            "Saldo (sc)": c.saldo_sc ?? 0, "Data Contrato": fmtData(c.data_contrato), "Data Entrega": fmtData(c.data_entrega),
            "Status": STATUS_MAP[c.status]?.label ?? c.status,
          }));
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasDet), "Contratos");
        }
        XLSX.writeFile(wb, `${titulo.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
      setModalAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar relatório");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div style={{ padding: "16px 22px" }}>
      <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🌾</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>Posição de Comercialização</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Filtre por produto, comprador, status, ano safra e período. Mostra contratado, entregue e saldo por commodity — gera direto em PDF (pra imprimir) ou XLSX (baixa), sintético ou analítico.
        </div>
        <button onClick={abrirModal} style={btnV}>🔍 Abrir Filtro e Gerar</button>
      </div>

      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalAberto(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 26, width: "min(94vw, 620px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}>🌾 Posição de Comercialização</h2>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Produto</label>
                <select value={fProduto} onChange={e => setFProduto(e.target.value)} style={inp}>
                  <option value="">Todos os produtos</option>
                  {opcoesProduto.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Comprador</label>
                <select value={fComprador} onChange={e => setFComprador(e.target.value)} style={inp}>
                  <option value="">Todos os compradores</option>
                  {opcoesComprador.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Status — marque quantos quiser (vazio = todos)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                {STATUS_OPCOES.map(st => (
                  <label key={st} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-1)", cursor: "pointer" }}>
                    <input type="checkbox" checked={fStatus.has(st)} onChange={() => toggleStatus(st)} />
                    {STATUS_MAP[st].label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={fAnoSafra} onChange={e => setFAnoSafra(e.target.value)} style={inp}>
                  <option value="">Todas as safras</option>
                  {opcoesAnoSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data contrato de</label>
                <InputData type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>até</label>
                <InputData type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={inp} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Tipo</label>
                <div style={{ display: "flex", gap: 14, border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                  {([["sintetico", "Sintético (só resumo)"], ["analitico", "Analítico (+ contratos)"]] as const).map(([v, label]) => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fTipo === v} onChange={() => setFTipo(v)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Emissão</label>
                <div style={{ display: "flex", gap: 14, border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                  {([["pdf", "PDF (imprimir)"], ["xlsx", "XLSX (baixar)"]] as const).map(([v, label]) => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fFormato === v} onChange={() => setFFormato(v)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {erro && (
              <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>
                {erro}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "0.5px solid var(--border-table)", paddingTop: 16 }}>
              <button onClick={() => setModalAberto(false)} style={btnR}>Cancelar</button>
              <button onClick={gerar} disabled={gerando} style={{ ...btnV, opacity: gerando ? 0.6 : 1 }}>
                {gerando ? "Gerando..." : "Gerar Relatório"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
