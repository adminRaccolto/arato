"use client";
// CT-e recebido (frete contratado, cliente como tomador) — Seção 381. Mostra o CT-e importado do SIEG e processa:
// gera o Contas a Pagar para a transportadora (produtor ou empresa que paga o frete). Estornar apaga o título se
// ainda não foi pago e volta o CT-e a pendente.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import type { AnoSafra, Ciclo, CentroCusto, Empresa, Produtor } from "../../lib/supabase";
import { listarAnosSafra, listarCiclosDasFazendas, listarCentrosCustoGeralDaConta, listarEmpresasDaConta, listarOperacoesGerenciaisAtivasDaConta, listarProdutoresDaConta } from "../../lib/db";
import SelectBusca from "../SelectBusca";
import InputData from "../InputData";
import { OperationalButton } from "../OperationalUI";

type CteEntrada = {
  id: string; fazenda_id: string; conta_id: string | null; chave: string; numero: string | null; serie: string | null; data_emissao: string | null;
  cfop: string | null; natureza_operacao: string | null; emitente_nome: string | null; emitente_cnpj: string | null; emitente_uf: string | null;
  tomador_tipo: string | null; tomador_nome: string | null; tomador_cnpj: string | null; remetente_nome: string | null; destinatario_nome: string | null;
  municipio_origem: string | null; uf_origem: string | null; municipio_destino: string | null; uf_destino: string | null;
  produto_descricao: string | null; peso_kg: number | null; valor_mercadoria: number | null; valor_prestacao: number; valor_receber: number | null;
  valor_icms: number | null; nfe_chaves: string[] | null; xml_storage_path: string | null; origem: string | null; status: string; lancamento_id: string | null;
  produtor_id: string | null; empresa_id: string | null; operacao_gerencial_id: string | null; ano_safra_id: string | null; ciclo_id: string | null;
  centro_custo_id: string | null; data_vencimento: string | null; observacao: string | null; processado_em: string | null; processado_por: string | null;
};
type Og = { id: string; classificacao: string | null; descricao: string };

const inp: CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
const lbl: CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const fmtBRL = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const somaDias = (iso: string, dias: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
// Mesma regra do CT-e emitido (lib/cte/financeiro.ts): a operação de frete segue o produto transportado
function ogFretePorProduto(desc: string): string {
  const d = desc.toLowerCase();
  if (/(corretiv|calc|dolom)/.test(d)) return "FRETES CORRETIVOS";
  if (/sement/.test(d)) return "FRETES SEMENTES";
  if (/(soja|milho|algod|trigo|sorgo|gr[aã]o)/.test(d)) return "FRETES PRODUÇÃO";
  return "FRETES DIVERSOS";
}

export default function ModalCteEntrada({ id, fazendaIds, contaId, onClose, onSaved }: {
  id: string; fazendaIds: string[]; contaId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [c, setC] = useState<CteEntrada | null>(null);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [ogs, setOgs] = useState<Og[]>([]);
  const [anos, setAnos] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [pagador, setPagador] = useState("");          // "produtor:<id>" | "empresa:<id>"
  const [og, setOg] = useState("");
  const [ano, setAno] = useState("");
  const [ciclo, setCiclo] = useState("");
  const [centro, setCentro] = useState("");
  const [venc, setVenc] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("cte_entradas").select("*").eq("id", id).maybeSingle();
      if (error || !data) { setErro(error?.message ?? "CT-e não encontrado."); return; }
      const ct = data as CteEntrada;
      setC(ct);
      const faz = ct.fazenda_id;
      const [prods, emps, ops, as, cs, ccs] = await Promise.all([
        contaId ? listarProdutoresDaConta(contaId).catch(() => []) : Promise.resolve([] as Produtor[]),
        listarEmpresasDaConta(fazendaIds.length ? fazendaIds : [faz]).catch(() => []),
        listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, faz).catch(() => []),
        listarAnosSafra(faz).catch(() => []),
        listarCiclosDasFazendas(fazendaIds.length ? fazendaIds : [faz]).catch(() => []),
        listarCentrosCustoGeralDaConta(faz).catch(() => []),
      ]);
      setProdutores(prods); setEmpresas(emps); setOgs(ops as Og[]); setAnos(as); setCiclos(cs); setCentros(ccs);
      // Já processado: mostra o que foi escolhido; pendente: sugere pelo tomador, produto e data
      if (ct.status === "processada") {
        setPagador(ct.produtor_id ? `produtor:${ct.produtor_id}` : ct.empresa_id ? `empresa:${ct.empresa_id}` : "");
        setOg(ct.operacao_gerencial_id ?? ""); setAno(ct.ano_safra_id ?? ""); setCiclo(ct.ciclo_id ?? ""); setCentro(ct.centro_custo_id ?? "");
        setVenc(ct.data_vencimento ?? ""); setObs(ct.observacao ?? "");
      } else {
        const doc = dig(ct.tomador_cnpj);
        const p = prods.find(x => dig(x.cpf_cnpj) === doc);
        const e = emps.find(x => dig(x.cpf_cnpj) === doc);
        setPagador(p ? `produtor:${p.id}` : e ? `empresa:${e.id}` : "");
        const nomeOg = ogFretePorProduto(ct.produto_descricao ?? "");
        const sug = (ops as Og[]).find(o => o.descricao?.toUpperCase() === nomeOg) ?? (ops as Og[]).find(o => /FRETE/i.test(o.descricao ?? ""));
        setOg(sug?.id ?? "");
        const emi = ct.data_emissao ?? new Date().toISOString().slice(0, 10);
        setVenc(somaDias(emi, 30));
        const anoSug = as.find(a => a.data_inicio && a.data_fim && a.data_inicio <= emi && emi <= a.data_fim);
        if (anoSug) setAno(anoSug.id);
        setObs(ct.observacao ?? "");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ciclosDoAno = useMemo(() => ciclos.filter(x => !ano || x.ano_safra_id === ano), [ciclos, ano]);
  const processado = c?.status === "processada";
  const valorPagar = c ? (c.valor_receber ?? c.valor_prestacao) : 0;

  async function enviar(acao: "processar" | "estornar" | "excluir") {
    if (!c) return;
    setErro("");
    if (acao === "processar" && !pagador) { setErro("Escolha quem paga o frete."); return; }
    if (acao === "estornar" && !confirm(`Estornar o CT-e ${c.numero}? O Contas a Pagar dele é apagado e o CT-e volta a pendente.`)) return;
    if (acao === "excluir" && !confirm(`Excluir o CT-e ${c.numero}, lançado à mão?`)) return;
    setSalvando(true);
    try {
      const [tipo, pid] = pagador.split(":");
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/fiscal/cte-entrada", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(acao !== "processar" ? { acao, id: c.id } : {
          acao, id: c.id, pagador_tipo: tipo, pagador_id: pid, operacao_gerencial_id: og || null, ano_safra_id: ano || null,
          ciclo_id: ciclo || null, centro_custo_id: centro || null, data_vencimento: venc, observacao: obs || null,
        }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (!j.ok) { setErro(j.error ?? "Erro ao salvar."); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirXml() {
    if (!c?.xml_storage_path) return;
    const { data } = supabase.storage.from("arquivos").getPublicUrl(c.xml_storage_path);
    window.open(data.publicUrl, "_blank");
  }

  const campo = (rot: string, val: React.ReactNode) => (
    <div><div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 1 }}>{rot}</div><div style={{ fontSize: 12, color: "var(--text-1)" }}>{val || "—"}</div></div>
  );

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div data-arato-dialog="page" style={{ background: "var(--bg-card, #fff)", borderRadius: 12, width: "min(96vw, 860px)", maxHeight: "92vh", overflowY: "auto", padding: 22 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 data-arato-h2="true" style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>CT-e {c?.numero ?? ""}{c?.serie ? `/${c.serie}` : ""} — frete contratado</h2>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{c?.emitente_nome ?? ""}{c?.emitente_cnpj ? ` · ${c.emitente_cnpj}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {c && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: processado ? "#DCFCE7" : c.status === "cancelada" ? "#FEF2F2" : "#FBF3E0", color: processado ? "#166534" : c.status === "cancelada" ? "#B91C1C" : "#7A5200" }}>{processado ? "Processado" : c.status === "cancelada" ? "Cancelado pelo emitente" : "Pendente"}</span>}
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
          </div>
        </div>

        {!c ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>{erro || "Carregando…"}</div> : <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: 12, background: "#F4F6FA", borderRadius: 10, marginBottom: 14 }}>
            {campo("Emissão", fmtData(c.data_emissao))}
            {campo("CFOP", c.cfop)}
            {campo("Tomador (quem paga)", c.tomador_nome)}
            {campo("Valor a pagar", <strong>{fmtBRL(valorPagar)}</strong>)}
            {campo("Origem", c.municipio_origem ? `${c.municipio_origem}/${c.uf_origem}` : "")}
            {campo("Destino", c.municipio_destino ? `${c.municipio_destino}/${c.uf_destino}` : "")}
            {campo("Remetente", c.remetente_nome)}
            {campo("Destinatário", c.destinatario_nome)}
            {campo("Carga", c.produto_descricao)}
            {campo("Peso", c.peso_kg != null ? `${c.peso_kg.toLocaleString("pt-BR")} kg` : "")}
            {campo("Valor da mercadoria", c.valor_mercadoria != null ? fmtBRL(c.valor_mercadoria) : "")}
            {campo("ICMS", c.valor_icms != null ? fmtBRL(c.valor_icms) : "")}
            <div style={{ gridColumn: "1 / -1" }}>{campo("NF-e transportadas", (c.nfe_chaves ?? []).map(k => `NF ${k.slice(25, 34).replace(/^0+/, "")}`).join(", "))}</div>
          </div>

          {c.status !== "cancelada" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, pointerEvents: processado ? "none" : undefined, opacity: processado ? 0.85 : 1 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Quem paga o frete (produtor ou empresa) *</label>
                <SelectBusca value={pagador} onChange={setPagador} style={inp} placeholder="Escolha o produtor ou a empresa"
                  options={[...produtores.map(p => ({ value: `produtor:${p.id}`, label: `${p.nome}${p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ""}`, group: "Produtores" })),
                    ...empresas.map(e => ({ value: `empresa:${e.id}`, label: `${e.nome}${e.cpf_cnpj ? ` · ${e.cpf_cnpj}` : ""}`, group: "Empresas" }))]} />
              </div>
              <div>
                <label style={lbl}>Operação gerencial *</label>
                <SelectBusca value={og} onChange={setOg} style={inp} placeholder="Ex.: FRETES PRODUÇÃO"
                  options={ogs.map(o => ({ value: o.id, label: `${o.classificacao ? `${o.classificacao} — ` : ""}${o.descricao}` }))} />
              </div>
              <div>
                <label style={lbl}>Vencimento *</label>
                <InputData type="date" value={venc} onChange={e => setVenc(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Ano safra</label>
                <select value={ano} onChange={e => { setAno(e.target.value); setCiclo(""); }} style={inp}>
                  <option value="">—</option>
                  {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo</label>
                <select value={ciclo} onChange={e => setCiclo(e.target.value)} style={inp}>
                  <option value="">—</option>
                  {ciclosDoAno.map(x => <option key={x.id} value={x.id}>{x.descricao ?? x.cultura}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Centro de custo</label>
                <select value={centro} onChange={e => setCentro(e.target.value)} style={inp}>
                  <option value="">—</option>
                  {centros.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={obs} onChange={e => setObs(e.target.value)} style={inp} />
              </div>
            </div>
          )}

          {processado && <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)" }}>Processado em {fmtData(c.processado_em)}{c.processado_por ? ` por ${c.processado_por}` : ""}. O Contas a Pagar está no nome da transportadora.</div>}
          {erro && <div style={{ marginTop: 10, padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12 }}>{erro}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>{c.status === "pendente" && c.origem !== "sieg" && <OperationalButton data-arato-button="danger" disabled={salvando} onClick={() => enviar("excluir")} style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", fontSize: 13 }}>Excluir</OperationalButton>}{c.xml_storage_path && <OperationalButton data-arato-button="secondary" onClick={abrirXml} style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "transparent", cursor: "pointer", fontSize: 13 }}>Ver XML</OperationalButton>}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <OperationalButton data-arato-button="secondary" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "transparent", cursor: "pointer", fontSize: 13 }}>Fechar</OperationalButton>
              {c.status === "pendente" && <OperationalButton data-arato-button="primary" disabled={salvando} onClick={() => enviar("processar")} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{salvando ? "Processando…" : "Processar e lançar CP"}</OperationalButton>}
              {processado && <OperationalButton data-arato-button="danger" disabled={salvando} onClick={() => enviar("estornar")} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{salvando ? "Estornando…" : "Estornar"}</OperationalButton>}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
