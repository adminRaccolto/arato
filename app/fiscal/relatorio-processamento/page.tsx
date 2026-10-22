"use client";
// Relatório de Processamento de NF e NFS-e: o que foi processado, com qual Operação Gerencial e Centro de Custo,
// item a item (NF de Produtos) e nota a nota (NFS-e). Serve para conferir a classificação feita na entrada.
import { useEffect, useMemo, useState } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { useClienteRelatorio } from "../../../components/useClienteRelatorio";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import SelectBusca from "../../../components/SelectBusca";
import SelectField from "../../../components/SelectField";
import InputData from "../../../components/InputData";
import { supabase } from "../../../lib/supabase";
import type { CentroCusto, OperacaoGerencial } from "../../../lib/supabase";
import { listarCentrosCustoGeralDaConta, listarOperacoesGerenciais } from "../../../lib/db";
import { abrirPreviewImpressao, nomeRelatorio } from "../../../lib/print";
import { hojeLocal } from "../../../lib/data-local";

type Linha = {
  chave: string;
  tipo: "NF" | "NFS-e";
  numero: string;
  serie: string;
  fornecedor: string;
  cnpj: string;
  emissao: string;
  fazenda: string;
  produto: string;
  cfop: string;
  quantidade: number | null;
  unidade: string;
  valor: number;
  og_id: string | null;
  cc_id: string | null;
  processado_por: string;
};

const fmtData = (iso?: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v: number | null) => v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const texto = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inicioMes = () => { const h = hojeLocal(); return `${h.slice(0, 7)}-01`; };

async function todos<T>(monta: () => ReturnType<typeof supabase.from>["select"] extends (...a: never[]) => infer R ? R : never): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await (monta() as unknown as { order: (c: string) => { range: (a: number, b: number) => Promise<{ data: T[] | null; error: Error | null }> } }).order("id").range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function RelatorioProcessamentoNf() {
  const { fazendaId, fazendaIds } = useAuth();
  const cliente = useClienteRelatorio();
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(hojeLocal());
  const [tipo, setTipo] = useState<"" | "NF" | "NFS-e">("");
  const [ogId, setOgId] = useState("");
  const [ccId, setCcId] = useState("");
  const [produto, setProduto] = useState("");
  const [numero, setNumero] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [ogs, setOgs] = useState<OperacaoGerencial[]>([]);
  const [ccs, setCcs] = useState<CentroCusto[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [gerado, setGerado] = useState(false);
  const idsKey = fazendaIds.join(",");

  useEffect(() => {
    if (!fazendaIds.length) return;
    listarOperacoesGerenciais(fazendaIds).then(setOgs).catch(() => setOgs([]));
    listarCentrosCustoGeralDaConta(fazendaId).then(setCcs).catch(() => setCcs([]));
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ogPorId = useMemo(() => new Map(ogs.map(o => [o.id, o])), [ogs]);
  const ccPorId = useMemo(() => new Map(ccs.map(c => [c.id, c])), [ccs]);
  const nomeOg = (id: string | null) => { const o = id ? ogPorId.get(id) : null; return o ? `${o.classificacao ?? ""} ${o.descricao ?? ""}`.trim() : ""; };
  const nomeCc = (id: string | null) => { const c = id ? ccPorId.get(id) : null; return c ? `${c.codigo ? c.codigo + " " : ""}${c.nome}` : ""; };

  async function gerar() {
    if (!fazendaIds.length) return;
    setCarregando(true); setErro("");
    try {
      const { data: fz } = await supabase.from("fazendas").select("id, nome").in("id", fazendaIds);
      const nomeFaz = new Map((fz ?? []).map(f => [f.id as string, f.nome as string]));
      type Nf = { id: string; fazenda_id: string; numero: string; serie: string | null; emitente_nome: string | null; emitente_cnpj: string | null; data_emissao: string | null; operacao_gerencial_id: string | null; centro_custo_id: string | null; processado_por: string | null };
      type Item = { id: string; nf_entrada_id: string; descricao_produto: string | null; cfop: string | null; quantidade: number | null; unidade: string | null; valor_total: number | null; operacao_gerencial_id: string | null; centro_custo_id: string | null; insumos: { nome: string } | null };
      type Nfs = { id: string; fazenda_id: string; numero_nf: string; serie: string | null; prestador_nome: string | null; prestador_cnpj: string | null; data_prestacao: string | null; discriminacao: string | null; codigo_servico: string | null; valor_servico: number | null; operacao_gerencial_id: string | null; centro_custo_id: string | null; processado_por: string | null };
      const out: Linha[] = [];
      if (tipo !== "NFS-e") {
        const nfs = await todos<Nf>(() => supabase.from("nf_entradas")
          .select("id, fazenda_id, numero, serie, emitente_nome, emitente_cnpj, data_emissao, operacao_gerencial_id, centro_custo_id, processado_por")
          .in("fazenda_id", fazendaIds).eq("status", "processada").gte("data_emissao", de).lte("data_emissao", ate) as never);
        const porId = new Map(nfs.map(n => [n.id, n]));
        const ids = nfs.map(n => n.id);
        for (let i = 0; i < ids.length; i += 200) {
          const itens = await todos<Item>(() => supabase.from("nf_entrada_itens")
            .select("id, nf_entrada_id, descricao_produto, cfop, quantidade, unidade, valor_total, operacao_gerencial_id, centro_custo_id, insumos(nome)")
            .in("nf_entrada_id", ids.slice(i, i + 200)) as never);
          for (const it of itens) {
            const n = porId.get(it.nf_entrada_id)!;
            out.push({
              chave: `nf:${it.id}`, tipo: "NF", numero: n.numero, serie: n.serie ?? "", fornecedor: n.emitente_nome ?? "", cnpj: n.emitente_cnpj ?? "",
              emissao: n.data_emissao ?? "", fazenda: nomeFaz.get(n.fazenda_id) ?? "", produto: it.insumos?.nome ?? it.descricao_produto ?? "",
              cfop: it.cfop ?? "", quantidade: it.quantidade, unidade: it.unidade ?? "", valor: Number(it.valor_total ?? 0),
              og_id: it.operacao_gerencial_id ?? n.operacao_gerencial_id, cc_id: it.centro_custo_id ?? n.centro_custo_id, processado_por: n.processado_por ?? "",
            });
          }
        }
      }
      if (tipo !== "NF") {
        const servicos = await todos<Nfs>(() => supabase.from("nf_servicos")
          .select("id, fazenda_id, numero_nf, serie, prestador_nome, prestador_cnpj, data_prestacao, discriminacao, codigo_servico, valor_servico, operacao_gerencial_id, centro_custo_id, processado_por")
          .in("fazenda_id", fazendaIds).eq("status", "processada").gte("data_prestacao", de).lte("data_prestacao", ate) as never);
        for (const s of servicos) out.push({
          chave: `nfs:${s.id}`, tipo: "NFS-e", numero: s.numero_nf, serie: s.serie ?? "", fornecedor: s.prestador_nome ?? "", cnpj: s.prestador_cnpj ?? "",
          emissao: s.data_prestacao ?? "", fazenda: nomeFaz.get(s.fazenda_id) ?? "",
          produto: s.discriminacao?.trim() || (s.codigo_servico ? `Serviço ${s.codigo_servico}` : "Serviço"),
          cfop: "", quantidade: null, unidade: "", valor: Number(s.valor_servico ?? 0),
          og_id: s.operacao_gerencial_id, cc_id: s.centro_custo_id, processado_por: s.processado_por ?? "",
        });
      }
      out.sort((a, b) => b.emissao.localeCompare(a.emissao) || a.numero.localeCompare(b.numero));
      setLinhas(out); setGerado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }

  // OG escolhida como grupo também traz as filhas (mesma regra de prefixo da classificação)
  const ogFiltro = ogId ? ogPorId.get(ogId) : null;
  const filtradas = linhas.filter(l => {
    if (ogFiltro) {
      const o = l.og_id ? ogPorId.get(l.og_id) : null;
      if (!o || !(o.id === ogFiltro.id || (ogFiltro.classificacao && (o.classificacao ?? "").startsWith(ogFiltro.classificacao + ".")))) return false;
    }
    if (ccId === "__sem" ? !!l.cc_id : ccId && l.cc_id !== ccId) return false;
    if (produto.trim() && !texto(l.produto).includes(texto(produto.trim()))) return false;
    if (numero.trim() && !texto(l.numero).includes(texto(numero.trim()))) return false;
    if (fornecedor.trim() && !(texto(l.fornecedor).includes(texto(fornecedor.trim())) || l.cnpj.replace(/\D/g, "").includes(fornecedor.replace(/\D/g, "") || "§"))) return false;
    return true;
  });
  const total = filtradas.reduce((s, l) => s + l.valor, 0);
  const notas = new Set(filtradas.map(l => `${l.tipo}:${l.numero}:${l.cnpj}`)).size;
  const semOg = filtradas.filter(l => !l.og_id).length;
  const semCc = filtradas.filter(l => !l.cc_id).length;

  const filtrosTexto = [
    tipo && `Tipo: ${tipo}`, ogFiltro && `OG: ${nomeOg(ogFiltro.id)}`, ccId && `CC: ${ccId === "__sem" ? "sem centro de custo" : nomeCc(ccId)}`,
    produto && `Produto: ${produto}`, numero && `Nº: ${numero}`, fornecedor && `Fornecedor: ${fornecedor}`,
  ].filter(Boolean).join(" · ");

  function pdf() {
    const linhasHtml = filtradas.map((l, i) => `<tr style="background:${i % 2 ? "#F7F9FC" : "#fff"}">
      <td>${l.tipo}</td><td>${esc(l.numero)}</td><td>${fmtData(l.emissao)}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.produto)}</td>
      <td>${esc(l.cfop)}</td><td style="text-align:right">${fmtQtd(l.quantidade)} ${esc(l.unidade)}</td><td style="text-align:right">${fmtBRL(l.valor)}</td>
      <td>${esc(nomeOg(l.og_id) || "—")}</td><td>${esc(nomeCc(l.cc_id) || "—")}</td><td>${esc(l.processado_por || "—")}</td></tr>`).join("");
    const html = `<div style="font-size:10px;color:#555;margin-bottom:8px">Período (emissão): ${fmtData(de)} a ${fmtData(ate)}${filtrosTexto ? " · " + esc(filtrosTexto) : ""}</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5px;table-layout:fixed">
        <thead><tr style="background:#1A4870;color:#fff;text-align:left">
          <th style="width:5%">Tipo</th><th style="width:7%">Nº</th><th style="width:7%">Emissão</th><th style="width:14%">Fornecedor</th><th style="width:16%">Produto / Serviço</th>
          <th style="width:5%">CFOP</th><th style="width:8%;text-align:right">Qtd</th><th style="width:8%;text-align:right">Valor</th><th style="width:13%">OG</th><th style="width:10%">CC</th><th style="width:7%">Processado por</th>
        </tr></thead><tbody>${linhasHtml}</tbody>
        <tfoot><tr style="font-weight:700;border-top:1px solid #1A4870"><td colspan="7">${filtradas.length} linha(s) · ${notas} nota(s)</td><td style="text-align:right">${fmtBRL(total)}</td><td colspan="3"></td></tr></tfoot>
      </table><style>td,th{padding:3px 4px;word-wrap:break-word;vertical-align:top}</style>`;
    abrirPreviewImpressao("Processamento de NF e NFS-e", html, { orientation: "landscape", fazenda: cliente ?? undefined, nomeArquivo: nomeRelatorio("PROCESSAMENTO NF", cliente, de, ate) });
  }

  async function excel() {
    const XLSX = await import("xlsx");
    const resumo = [["Relatório", "Processamento de NF e NFS-e"], ["Cliente", cliente ?? ""], ["Período (emissão)", `${fmtData(de)} a ${fmtData(ate)}`],
      ["Filtros", filtrosTexto || "nenhum"], ["Linhas", filtradas.length], ["Notas", notas], ["Total", total], ["Linhas sem OG", semOg], ["Linhas sem CC", semCc]];
    const dados = filtradas.map(l => ({
      "Tipo": l.tipo, "Número": l.numero, "Série": l.serie, "Emissão": fmtData(l.emissao), "Fornecedor": l.fornecedor, "CNPJ/CPF": l.cnpj,
      "Fazenda": l.fazenda, "Produto / Serviço": l.produto, "CFOP": l.cfop, "Quantidade": l.quantidade ?? "", "Unidade": l.unidade,
      "Valor": l.valor, "Operação Gerencial": nomeOg(l.og_id), "Centro de Custo": nomeCc(l.cc_id), "Processado por": l.processado_por,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Processamento");
    XLSX.writeFile(wb, `${nomeRelatorio("PROCESSAMENTO NF", cliente, de, ate)}.xlsx`);
  }

  const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "#555", marginBottom: 4, fontWeight: 600 };
  const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13 };
  const th: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA", position: "sticky", top: 0 };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12, borderBottom: "0.5px solid #EEF1F6", verticalAlign: "top" };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ padding: "16px 24px", maxWidth: 1600, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111111" }}>Processamento de NF e NFS-e</h1>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Notas processadas com a Operação Gerencial e o Centro de Custo apontados na entrada, item a item</div>
          </div>
        </OperationalHeading>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "end", marginTop: 12 }}>
          <div><label style={lbl}>Emissão de</label><InputData type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Até</label><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Tipo</label>
            <SelectField style={inp} value={tipo} onChange={e => setTipo(e.target.value as "" | "NF" | "NFS-e")}>
              <option value="">NF e NFS-e</option><option value="NF">NF de Produtos</option><option value="NFS-e">NFS-e</option>
            </SelectField>
          </div>
          <div style={{ gridColumn: "span 2" }}><label style={lbl}>Operação Gerencial</label>
            <SelectBusca value={ogId} onChange={setOgId} placeholder="Todas"
              options={[{ value: "", label: "Todas" }, ...ogs.map(o => ({ value: o.id, label: `${o.classificacao ?? ""} ${o.descricao ?? ""}`.trim() }))]} />
          </div>
          <div style={{ gridColumn: "span 2" }}><label style={lbl}>Centro de Custo</label>
            <SelectBusca value={ccId} onChange={setCcId} placeholder="Todos"
              options={[{ value: "", label: "Todos" }, { value: "__sem", label: "Sem centro de custo" }, ...ccs.map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + " " : ""}${c.nome}` }))]} />
          </div>
          <div><label style={lbl}>Produto</label><input style={inp} value={produto} onChange={e => setProduto(e.target.value)} placeholder="nome do produto" /></div>
          <div><label style={lbl}>Nº da NF</label><input style={inp} value={numero} onChange={e => setNumero(e.target.value)} placeholder="número" /></div>
          <div><label style={lbl}>Fornecedor</label><input style={inp} value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="nome ou CNPJ" /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <OperationalButton data-arato-button="primary" onClick={gerar} disabled={carregando}
              style={{ padding: "8px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {carregando ? "Carregando..." : gerado ? "Atualizar" : "Gerar"}
            </OperationalButton>
          </div>
        </div>

        {erro && <div style={{ marginTop: 12, padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{erro}</div>}

        {gerado && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", margin: "14px 0 10px", fontSize: 13 }}>
              <span><strong>{filtradas.length}</strong> linha(s) · <strong>{notas}</strong> nota(s)</span>
              <span>Total: <strong>{fmtBRL(total)}</strong></span>
              {semOg > 0 && <span style={{ color: "#B45309" }}>{semOg} sem OG</span>}
              {semCc > 0 && <span style={{ color: "#B45309" }}>{semCc} sem centro de custo</span>}
              <span style={{ flex: 1 }} />
              <OperationalButton data-arato-button="secondary" onClick={pdf} disabled={!filtradas.length}
                style={{ padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Imprimir / PDF</OperationalButton>
              <OperationalButton data-arato-button="secondary" onClick={excel} disabled={!filtradas.length}
                style={{ padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Excel</OperationalButton>
            </div>
            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "calc(100vh - 330px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1300 }}>
                <thead><tr>
                  {["Tipo", "Nº", "Emissão", "Fornecedor", "Fazenda", "Produto / Serviço", "CFOP", "Qtd", "Valor", "Operação Gerencial", "Centro de Custo", "Processado por"].map(h =>
                    <th key={h} style={{ ...th, textAlign: h === "Qtd" || h === "Valor" ? "right" : "left" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtradas.length === 0 && <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: "#888", padding: 24 }}>Nenhuma nota processada para esse filtro/período.</td></tr>}
                  {filtradas.map(l => (
                    <tr key={l.chave}>
                      <td style={td}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: l.tipo === "NF" ? "#D5E8F5" : "#FBF3E0", color: l.tipo === "NF" ? "#0B2D50" : "#7A5A10" }}>{l.tipo}</span></td>
                      <td style={td}>{l.numero}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.emissao)}</td>
                      <td style={td}>{l.fornecedor}</td>
                      <td style={td}>{l.fazenda}</td>
                      <td style={{ ...td, maxWidth: 320 }}>{l.produto}</td>
                      <td style={td}>{l.cfop}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{fmtQtd(l.quantidade)} {l.unidade}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor)}</td>
                      <td style={td}>{nomeOg(l.og_id) || <span style={{ color: "#B45309" }}>sem OG</span>}</td>
                      <td style={td}>{nomeCc(l.cc_id) || <span style={{ color: "#888" }}>—</span>}</td>
                      <td style={td}>{l.processado_por || <span style={{ color: "#888" }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
