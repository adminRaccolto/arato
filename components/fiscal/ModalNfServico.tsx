"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Modal de NF de Serviço — extraído de app/compras/nf-servico/page.tsx
// (01/10/2026, Fase 2 da unificação de Documentos Fiscais) pra ser montado
// dentro da tela unificada /fiscal/documentos, sem sair da página.
//
// Toda a lógica de negócio (passo 1/2/3, cálculo de ISS/retenções, geração
// de CP — produtor ou empresa transportadora, parcelamento, estorno,
// exclusão) foi preservada EXATAMENTE como estava — só a casca (onde o
// componente mora, como abre/fecha) mudou. app/compras/nf-servico/page.tsx
// continua existindo e funcionando sozinho (não foi tocado).
//
// Uso: <ModalNfServico id={null | string} fazendaIdPadrao={...}
//        viewOnlyInicial={bool} onClose={...} onSaved={...} />
// Monte o componente só quando for abrir (id=null → nova; id=<uuid> → edita/
// visualiza) — ao desmontar, todo o estado interno se perde naturalmente.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../AuthProvider";
import { supabase } from "../../lib/supabase";
import type { Pessoa, CentroCusto, AnoSafra, Empresa, Produtor } from "../../lib/supabase";
import SelectBusca from "../SelectBusca";
import { listarPessoasDaConta, listarCentrosCustoGeralDaConta, listarAnosSafra, listarOperacoesGerenciaisAtivasDaConta, listarEmpresasDaConta, listarProdutoresDaConta } from "../../lib/db";
import InputMonetario from "../InputMonetario";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const toggleSt: React.CSSProperties = { width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LC116: { codigo: string; descricao: string }[] = [
  { codigo: "7.01",  descricao: "7.01 — Engenharia, agronomia, agrimensura e consultoria técnica" },
  { codigo: "7.16",  descricao: "7.16 — Florestamento, reflorestamento, semeadura, adubação e reparação de solo" },
  { codigo: "7.17",  descricao: "7.17 — Escoramento, contenção de encostas e serviços congêneres" },
  { codigo: "14.01", descricao: "14.01 — Lubrificação, manutenção e reparação de máquinas e equipamentos" },
  { codigo: "14.02", descricao: "14.02 — Assistência técnica" },
  { codigo: "14.06", descricao: "14.06 — Instalação e montagem de aparelhos, máquinas e equipamentos" },
  { codigo: "16.01", descricao: "16.01 — Serviços de transporte de natureza municipal" },
  { codigo: "17.01", descricao: "17.01 — Assessoria ou consultoria de qualquer natureza" },
  { codigo: "17.06", descricao: "17.06 — Suporte técnico em informática" },
  { codigo: "17.09", descricao: "17.09 — Planejamento, organização e administração" },
  { codigo: "20.01", descricao: "20.01 — Serviços de armazenamento, guarda e conservação de mercadorias" },
  { codigo: "22.01", descricao: "22.01 — Serviços de fisioterapia (saúde trabalhadores)" },
  { codigo: "31.01", descricao: "31.01 — Serviços técnicos em edificações, eletrônica, mecânica e telecomunicações" },
  { codigo: "outros", descricao: "Outro código (informar manualmente)" },
];

interface NfServico {
  id: string;
  fazenda_id: string;
  numero_nf: string;
  serie: string;
  chave_nfse?: string;
  prestador_id?: string;
  prestador_nome: string;
  prestador_cnpj?: string;
  tomador_id?: string;
  tomador_tipo?: "produtor" | "empresa" | "pessoa" | "";
  tomador_nome?: string;
  tomador_cnpj?: string;
  municipio_prestacao?: string;
  data_prestacao: string;
  competencia?: string;
  codigo_servico?: string;
  cnae?: string;
  discriminacao?: string;
  valor_servico: number;
  valor_deducoes: number;
  valor_base_iss: number;
  aliquota_iss: number;
  valor_iss: number;
  iss_retido: boolean;
  valor_inss: number;
  valor_ir: number;
  valor_outras_retencoes: number;
  valor_liquido: number;
  operacao_gerencial_id?: string;
  centro_custo_id?: string;
  ano_safra_id?: string;
  pedido_compra_id?: string;
  empresa_id?: string;
  data_vencimento_cp?: string;
  status: "digitando" | "pendente" | "processada" | "cancelada";
  origem: "manual" | "xml" | "api";
  observacao?: string;
  lancamento_id?: string;
  processado_por?: string;
  created_at?: string;
}

interface OpGerencial { id: string; classificacao: string; descricao: string; }
interface PedidoMin   { id: string; nr_pedido?: string; status: string; }

type Etapa = "prestador" | "servico" | "tributacao";

const CAB_VAZIO = () => ({
  fazenda_id: "",
  numero_nf: "", serie: "1", chave_nfse: "",
  prestador_id: "", prestador_nome: "", prestador_cnpj: "",
  tomador_id: "", tomador_tipo: "" as "produtor" | "empresa" | "pessoa" | "", tomador_nome: "", tomador_cnpj: "",
  municipio_prestacao: "",
  data_prestacao: new Date().toISOString().split("T")[0],
  competencia: new Date().toISOString().substring(0, 7),
  codigo_servico: "", cnae: "", discriminacao: "",
  valor_servico: "", valor_deducoes: "0",
  aliquota_iss: "3", iss_retido: false,
  valor_inss: "0", valor_ir: "0", valor_outras_retencoes: "0",
  operacao_gerencial_id: "", centro_custo_id: "",
  ano_safra_id: "", pedido_compra_id: "",
  empresa_id: "",
  data_vencimento_cp: "", observacao: "",
  forma_pagamento: "",
});

export default function ModalNfServico({
  id, fazendaIdPadrao, viewOnlyInicial, onClose, onSaved,
}: {
  id: string | null;
  fazendaIdPadrao: string;
  viewOnlyInicial?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();

  const [pessoas,  setPessoas]  = useState<Pessoa[]>([]);
  const [centros,  setCentros]  = useState<CentroCusto[]>([]);
  const [opsGer,   setOpsGer]   = useState<OpGerencial[]>([]);
  const [anos,     setAnos]     = useState<AnoSafra[]>([]);
  const [pedidos,  setPedidos]  = useState<PedidoMin[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [fazendas,   setFazendas]   = useState<Array<{id:string;nome:string}>>([]);

  const [viewOnly, setViewOnly] = useState(viewOnlyInicial ?? false);
  const [etapa,   setEtapa]   = useState<Etapa>("prestador");
  const [saving,  setSaving]  = useState(false);
  const [carregandoNf, setCarregandoNf] = useState(!!id);
  const [err,     setErr]     = useState("");
  const [nfEdit,  setNfEdit]  = useState<NfServico | null>(null);

  const [modalExcluir, setModalExcluir] = useState<{
    nf: NfServico;
    lancamento: { id: string; status: string } | null;
    verificando: boolean;
    excluindo: boolean;
    bloqueado: boolean;
  } | null>(null);

  const [cab, setCab] = useState(CAB_VAZIO());
  const [codigoLivre, setCodigoLivre] = useState("");

  const [nfCondicao,    setNfCondicao]    = useState<"avista" | "prazo">("avista");
  const [nfQtdParcelas, setNfQtdParcelas] = useState("2");
  const [nfFreq,        setNfFreq]        = useState("1");
  const [nfParcelas,    setNfParcelas]    = useState<{ data: string; valorMask: string }[]>([]);

  const vServico  = parseFloat(String(cab.valor_servico))  || 0;
  const vDed      = parseFloat(String(cab.valor_deducoes)) || 0;
  const vBase     = Math.max(0, vServico - vDed);
  const aliq      = parseFloat(String(cab.aliquota_iss))   || 0;
  const vISS      = Math.round(vBase * aliq / 100 * 100) / 100;
  const vINSS     = parseFloat(String(cab.valor_inss))               || 0;
  const vIR       = parseFloat(String(cab.valor_ir))                 || 0;
  const vOutras   = parseFloat(String(cab.valor_outras_retencoes))   || 0;
  const vRetencoes = vINSS + vIR + vOutras + (cab.iss_retido ? vISS : 0);
  const vLiquido   = Math.max(0, vServico - vRetencoes);

  // ── Carregar cadastros de apoio (uma vez, ao montar) ────────
  const carregarApoio = useCallback(async () => {
    if (!fazendaId) return;
    const pes = await listarPessoasDaConta(fazendaId).catch(() => []);
    setPessoas(pes);
    const cc = await listarCentrosCustoGeralDaConta(fazendaId).catch(() => []);
    setCentros(cc);
    const as = await listarAnosSafra(fazendaId).catch(() => []);
    setAnos(as);
    try {
      const ops = await listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, fazendaId);
      setOpsGer(ops as OpGerencial[]);
    } catch {}
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, nr_pedido, status")
        .in("fazenda_id", fazendaIds)
        .in("status", ["rascunho", "aprovado"])
        .order("created_at", { ascending: false });
      setPedidos((data ?? []) as PedidoMin[]);
    } catch {}
    if (fazendaIds.length > 1) {
      try {
        const { data } = await supabase.from("fazendas").select("id, nome").in("id", fazendaIds).order("nome");
        setFazendas((data ?? []) as Array<{id:string;nome:string}>);
      } catch {}
    }
    listarEmpresasDaConta(fazendaIds.length ? fazendaIds : fazendaId ? [fazendaId] : []).then(setEmpresas).catch(() => {});
    if (contaId) listarProdutoresDaConta(contaId).then(setProdutores).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId]);

  useEffect(() => { carregarApoio(); }, [carregarApoio]);

  function pessoaPorCnpjNFS(cnpj: string): Pessoa | undefined {
    if (!cnpj) return undefined;
    const norm = cnpj.replace(/\D/g, "");
    return pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm);
  }
  function tomadorPorCnpjNFS(cnpj: string): { item: Produtor | Empresa | Pessoa; tipo: "produtor" | "empresa" | "pessoa" } | undefined {
    if (!cnpj) return undefined;
    const norm = cnpj.replace(/\D/g, "");
    const prod = produtores.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm);
    if (prod) return { item: prod, tipo: "produtor" };
    const emp = empresas.find(e => (e.cpf_cnpj ?? "").replace(/\D/g, "") === norm);
    if (emp) return { item: emp, tipo: "empresa" };
    const pess = pessoaPorCnpjNFS(cnpj);
    if (pess) return { item: pess, tipo: "pessoa" };
    return undefined;
  }

  // Reforço: refaz o match por CNPJ assim que as listas (que carregam em
  // paralelo) chegarem, sem sobrescrever uma escolha manual já feita.
  useEffect(() => {
    if (!nfEdit || (pessoas.length === 0 && produtores.length === 0 && empresas.length === 0)) return;
    if (!cab.prestador_id && cab.prestador_cnpj) {
      const m = pessoaPorCnpjNFS(cab.prestador_cnpj);
      if (m) setCab(p => ({ ...p, prestador_id: m.id }));
    }
    if (!cab.tomador_id && cab.tomador_cnpj) {
      const m = tomadorPorCnpjNFS(cab.tomador_cnpj);
      if (m) setCab(p => ({ ...p, tomador_id: m.item.id, tomador_tipo: m.tipo, municipio_prestacao: p.municipio_prestacao || (m.item as Produtor).municipio || "" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, produtores, empresas, nfEdit]);

  function onPrestadorChange(idSel: string) {
    const p = pessoas.find(x => x.id === idSel);
    if (p) {
      setCab(prev => ({ ...prev, prestador_id: idSel, prestador_nome: p.nome ?? prev.prestador_nome, prestador_cnpj: p.cpf_cnpj ?? prev.prestador_cnpj }));
    } else {
      setCab(prev => ({ ...prev, prestador_id: idSel }));
    }
  }
  function onTomadorChange(idSel: string) {
    const prod = produtores.find(x => x.id === idSel);
    const emp  = empresas.find(x => x.id === idSel);
    const pess = pessoas.find(x => x.id === idSel);
    const p    = prod ?? emp ?? pess;
    const tipo: "produtor" | "empresa" | "pessoa" | "" = prod ? "produtor" : emp ? "empresa" : pess ? "pessoa" : "";
    if (p) {
      setCab(prev => ({ ...prev, tomador_id: idSel, tomador_tipo: tipo, tomador_nome: p.nome ?? prev.tomador_nome, tomador_cnpj: p.cpf_cnpj ?? prev.tomador_cnpj, municipio_prestacao: prev.municipio_prestacao || (prod?.municipio ?? "") }));
    } else {
      setCab(prev => ({ ...prev, tomador_id: idSel, tomador_tipo: "" }));
    }
  }

  // ── Carrega a NF (edição/visualização) ou abre em branco (nova) ──
  useEffect(() => {
    if (!id) {
      setNfEdit(null);
      setEtapa("prestador");
      setCab({ ...CAB_VAZIO(), fazenda_id: fazendaIdPadrao });
      setCodigoLivre("");
      setErr("");
      setNfCondicao("avista");
      setNfParcelas([]);
      setNfQtdParcelas("2");
      setNfFreq("1");
      setCarregandoNf(false);
      return;
    }
    (async () => {
      setCarregandoNf(true);
      const { data } = await supabase.from("nf_servicos").select("*").eq("id", id).maybeSingle();
      const nf = data as NfServico | null;
      if (!nf) { setErr("NF de Serviço não encontrada."); setCarregandoNf(false); return; }
      setNfEdit(nf);
      setEtapa("prestador");
      const prestadorMatch = nf.prestador_id ? undefined : pessoaPorCnpjNFS(nf.prestador_cnpj ?? "");
      const tomadorMatch   = nf.tomador_id   ? undefined : tomadorPorCnpjNFS(nf.tomador_cnpj ?? "");
      setCab({
        fazenda_id:           nf.fazenda_id ?? fazendaIdPadrao,
        numero_nf:            nf.numero_nf,
        serie:                nf.serie,
        chave_nfse:           nf.chave_nfse ?? "",
        prestador_id:         nf.prestador_id ?? prestadorMatch?.id ?? "",
        prestador_nome:       nf.prestador_nome,
        prestador_cnpj:       nf.prestador_cnpj ?? "",
        tomador_id:           nf.tomador_id ?? tomadorMatch?.item.id ?? "",
        tomador_tipo:         nf.tomador_tipo ?? tomadorMatch?.tipo ?? "",
        tomador_nome:         nf.tomador_nome ?? "",
        tomador_cnpj:         nf.tomador_cnpj ?? "",
        municipio_prestacao:  nf.municipio_prestacao || (tomadorMatch?.item as Produtor | undefined)?.municipio || "",
        data_prestacao:       nf.data_prestacao,
        competencia:          nf.competencia ?? nf.data_prestacao.substring(0, 7),
        codigo_servico:       nf.codigo_servico ?? "",
        cnae:                 nf.cnae ?? "",
        discriminacao:        nf.discriminacao ?? "",
        valor_servico:        String(nf.valor_servico),
        valor_deducoes:       String(nf.valor_deducoes),
        aliquota_iss:         String(nf.aliquota_iss),
        iss_retido:           nf.iss_retido,
        valor_inss:           String(nf.valor_inss),
        valor_ir:             String(nf.valor_ir),
        valor_outras_retencoes: String(nf.valor_outras_retencoes),
        operacao_gerencial_id:  nf.operacao_gerencial_id ?? "",
        centro_custo_id:        nf.centro_custo_id ?? "",
        ano_safra_id:           nf.ano_safra_id ?? "",
        pedido_compra_id:       nf.pedido_compra_id ?? "",
        empresa_id:             nf.empresa_id ?? "",
        data_vencimento_cp:     nf.data_vencimento_cp ?? "",
        observacao:             nf.observacao ?? "",
        forma_pagamento:        "",
      });
      const isLivre = !LC116.find(c => c.codigo === nf.codigo_servico);
      if (isLivre && nf.codigo_servico) {
        setCab(prev => ({ ...prev, codigo_servico: "outros" }));
        setCodigoLivre(nf.codigo_servico ?? "");
      }
      setErr("");
      setCarregandoNf(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function gerarParcelasServico() {
    const venc = cab.data_vencimento_cp;
    if (!venc) { setErr("Informe o 1º vencimento antes de gerar as parcelas."); return; }
    const qtd  = Math.max(2, parseInt(nfQtdParcelas) || 2);
    const freq = Math.max(1, parseInt(nfFreq) || 1);
    const valorParc = vLiquido > 0 ? vLiquido / qtd : 0;
    const novas = Array.from({ length: qtd }, (_, i) => {
      const d = new Date(venc + "T12:00");
      d.setMonth(d.getMonth() + i * freq);
      return { data: d.toISOString().split("T")[0], valorMask: valorParc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
    });
    setNfParcelas(novas);
    setErr("");
  }

  async function salvar(status: "digitando" | "pendente" | "processada") {
    if (!cab.fazenda_id && !fazendaId) return;
    setErr("");
    if (!cab.numero_nf.trim()) { setErr("Informe o número da NF."); return; }
    if (!cab.prestador_nome.trim()) { setErr("Informe o prestador."); return; }
    if (!cab.data_prestacao) { setErr("Informe a data da prestação."); return; }
    if (nfEdit?.status === "processada") { setErr("NFS-e já processada. Use Estornar para reprocessar."); return; }
    if (status === "processada" && vServico <= 0) { setErr("Valor do serviço deve ser maior que zero para processar."); return; }
    if (status === "processada" && !cab.operacao_gerencial_id) { setErr("Selecione a Operação Gerencial para processar."); return; }

    const codigoFinal = cab.codigo_servico === "outros" ? codigoLivre : cab.codigo_servico;

    const payload = {
      fazenda_id:            cab.fazenda_id || fazendaId,
      numero_nf:             cab.numero_nf,
      serie:                 cab.serie,
      chave_nfse:            cab.chave_nfse || undefined,
      prestador_id:          cab.prestador_id   || undefined,
      prestador_nome:        cab.prestador_nome,
      prestador_cnpj:        cab.prestador_cnpj || undefined,
      tomador_id:            cab.tomador_id     || undefined,
      tomador_tipo:          cab.tomador_tipo   || undefined,
      tomador_nome:          cab.tomador_nome   || undefined,
      tomador_cnpj:          cab.tomador_cnpj   || undefined,
      municipio_prestacao:   cab.municipio_prestacao || undefined,
      data_prestacao:        cab.data_prestacao,
      competencia:           cab.competencia || cab.data_prestacao.substring(0, 7),
      codigo_servico:        codigoFinal    || undefined,
      cnae:                  cab.cnae       || undefined,
      discriminacao:         cab.discriminacao || undefined,
      valor_servico:         vServico,
      valor_deducoes:        vDed,
      valor_base_iss:        vBase,
      aliquota_iss:          aliq,
      valor_iss:             vISS,
      iss_retido:            cab.iss_retido,
      valor_inss:            vINSS,
      valor_ir:              vIR,
      valor_outras_retencoes: vOutras,
      valor_liquido:         vLiquido,
      operacao_gerencial_id: cab.operacao_gerencial_id || undefined,
      centro_custo_id:       cab.centro_custo_id       || undefined,
      ano_safra_id:          cab.ano_safra_id           || undefined,
      pedido_compra_id:      cab.pedido_compra_id       || undefined,
      empresa_id:            cab.empresa_id || undefined,
      data_vencimento_cp:    cab.data_vencimento_cp     || undefined,
      status:                status === "processada" ? "pendente" : status,
      origem:                nfEdit?.origem ?? "manual",
      observacao:            cab.observacao || undefined,
      processado_por:        status === "processada" ? (nomeUsuario ?? undefined) : undefined,
    };

    setSaving(true);
    try {
      let nfId = nfEdit?.id ?? "";
      if (nfEdit) {
        await supabase.from("nf_servicos").update(payload).eq("id", nfEdit.id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("nf_servicos").insert(payload).select("id").single();
        if (insErr) throw new Error(insErr.message);
        nfId = inserted.id;
      }

      let empTranspNfs: { id: string; fazenda_id: string } | null = null;
      if (cab.empresa_id) {
        const { data: eRef } = await supabase.from("empresas").select("cpf_cnpj").eq("id", cab.empresa_id).maybeSingle();
        if (eRef?.cpf_cnpj) {
          const { data: mesmas } = await supabase.from("empresas").select("id, fazenda_id, finalidades").eq("cpf_cnpj", eRef.cpf_cnpj);
          if ((mesmas ?? []).some(e => Array.isArray(e.finalidades) && e.finalidades.includes("transportadora"))) {
            const m = (mesmas ?? []).find(e => e.id === cab.empresa_id) ?? (mesmas ?? [])[0];
            empTranspNfs = { id: m.id as string, fazenda_id: m.fazenda_id as string };
          }
        }
      }

      if (status === "processada" && empTranspNfs && !nfEdit?.lancamento_id) {
        const baseEmp = {
          fazenda_id:       empTranspNfs.fazenda_id,
          empresa_id:       empTranspNfs.id,
          tipo:             "pagar" as const,
          moeda:            "BRL",
          descricao:        `NFS-e ${cab.numero_nf} — ${cab.prestador_nome}`,
          categoria:        "Serviços de Terceiros",
          competencia:      String(cab.data_prestacao ?? "").slice(0, 7),
          status:           "pendente" as const,
          pessoa_id:        cab.prestador_id || undefined,
          numero_documento: cab.numero_nf,
          forma_pagamento:  cab.forma_pagamento || undefined,
          origem:           "nf_servico" as const,
        };
        const empRows = nfCondicao === "prazo" && nfParcelas.length > 1
          ? nfParcelas.map((parc, i) => ({ ...baseEmp, data_vencimento: parc.data, valor: parseFloat(parc.valorMask.replace(/\./g, "").replace(",", ".")) || 0, observacao: `Parcela ${i + 1}/${nfParcelas.length}` }))
          : [{ ...baseEmp, data_vencimento: cab.data_vencimento_cp || cab.data_prestacao, valor: vLiquido }];
        const { data: jaEmp } = await supabase.from("empresa_lancamentos").select("id").eq("empresa_id", empTranspNfs.id).eq("origem", "nf_servico").eq("numero_documento", cab.numero_nf).limit(1);
        if (jaEmp?.length) empRows.length = 0;
        const empRes = empRows.length === 0 ? { json: async () => ({ ok: true }) } : await fetch("/api/empresa-lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: empRows }) });
        const empJson = await empRes.json() as { ok: boolean; error?: string };
        if (!empJson.ok) throw new Error(`Erro ao criar CP da Empresa: ${empJson.error}`);
      }

      if (status === "processada" && !empTranspNfs && !nfEdit?.lancamento_id) {
        const baseCP = {
          fazenda_id:            cab.fazenda_id || fazendaId,
          tipo:                  "pagar",
          moeda:                 "BRL",
          descricao:             `NFS-e ${cab.numero_nf} — ${cab.prestador_nome}`,
          categoria:             "Serviços",
          data_lancamento:       cab.data_prestacao,
          status:                "em_aberto",
          auto:                  true,
          pessoa_id:             cab.prestador_id || undefined,
          numero_documento:      cab.numero_nf,
          nfe_numero:            cab.numero_nf,
          origem_lancamento:     "nf_servico" as const,
          operacao_gerencial_id: cab.operacao_gerencial_id || undefined,
          centro_custo_id:       cab.centro_custo_id       || undefined,
          ano_safra_id:          cab.ano_safra_id           || undefined,
          forma_pagamento:       cab.forma_pagamento        || undefined,
        };

        let primeiroLancId: string | null = null;
        let lancRows: Record<string, unknown>[];
        if (nfCondicao === "prazo" && nfParcelas.length > 1) {
          const agrupador = crypto.randomUUID();
          const total = nfParcelas.length;
          lancRows = nfParcelas.map((parc, i) => ({
            ...baseCP,
            data_vencimento: parc.data,
            valor:           parseFloat(parc.valorMask.replace(/\./g, "").replace(",", ".")) || 0,
            num_parcela:     i + 1,
            total_parcelas:  total,
            agrupador,
          }));
        } else {
          lancRows = [{ ...baseCP, data_vencimento: cab.data_vencimento_cp || cab.data_prestacao, valor: vLiquido }];
        }

        const lancRes = await fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: lancRows }) });
        const lancJson = await lancRes.json() as { ok: boolean; ids?: string[]; error?: string };
        if (!lancJson.ok) throw new Error(`Erro ao criar CP: ${lancJson.error}`);
        primeiroLancId = lancJson.ids?.[0] ?? null;

        if (primeiroLancId) {
          await supabase.from("nf_servicos").update({ lancamento_id: primeiroLancId }).eq("id", nfId);
        }
      }

      if (status === "processada") {
        const { error: errStatus } = await supabase.from("nf_servicos").update({ status: "processada" }).eq("id", nfId);
        if (errStatus) throw new Error(errStatus.message);
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function cancelarNf() {
    if (!nfEdit) return;
    if (!confirm(`Cancelar NF de Serviço ${nfEdit.numero_nf}?`)) return;
    await supabase.from("nf_servicos").update({ status: "cancelada" }).eq("id", nfEdit.id);
    onSaved();
    onClose();
  }

  async function estornarNf() {
    if (!nfEdit) return;
    if (!confirm(
      `Estornar NFS-e ${nfEdit.numero_nf}?\n\n` +
      `Isso irá:\n• Cancelar o lançamento financeiro (CP) associado\n• Retornar a NFS-e para "Pendente" para reprocessamento`
    )) return;
    try {
      const res = await fetch("/api/compras/estornar-nf-servico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nf_id: nfEdit.id }) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Erro HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao estornar NFS-e");
    }
  }

  async function iniciarExclusao() {
    if (!nfEdit) return;
    const nf = nfEdit;
    if (nf.status !== "processada") {
      if (!confirm(`Excluir NFS-e ${nf.numero_nf}?\n\nEsta NFS-e ainda não foi processada — nenhum lançamento financeiro será revertido.`)) return;
      try {
        const res = await fetch("/api/compras/excluir-nf-servico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nf_id: nf.id, fazenda_id: nf.fazenda_id ?? fazendaId }) });
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(json.error ?? `Erro HTTP ${res.status}`);
        }
        onSaved();
        onClose();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Erro ao excluir");
      }
      return;
    }
    setModalExcluir({ nf, lancamento: null, verificando: true, excluindo: false, bloqueado: false });
    try {
      const { data: lanc } = await supabase.from("lancamentos").select("id, status").eq("id", nf.lancamento_id ?? "").maybeSingle();
      const bloqueado = lanc?.status === "baixado";
      setModalExcluir({ nf, lancamento: lanc ?? null, verificando: false, excluindo: false, bloqueado });
    } catch {
      setModalExcluir(null);
    }
  }

  async function confirmarExclusao() {
    if (!modalExcluir || !fazendaId) return;
    setModalExcluir(p => p ? { ...p, excluindo: true } : null);
    try {
      const res = await fetch("/api/compras/excluir-nf-servico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nf_id: modalExcluir.nf.id, fazenda_id: modalExcluir.nf.fazenda_id ?? fazendaId }) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Erro HTTP ${res.status}`);
      }
      setModalExcluir(null);
      onSaved();
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir NFS-e");
      setModalExcluir(p => p ? { ...p, excluindo: false } : null);
    }
  }

  if (carregandoNf) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 40, color: "var(--text-2)", fontSize: 13 }}>Carregando NFS-e…</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 860, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

          <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
                {nfEdit ? `NF Serviço ${nfEdit.numero_nf}` : "Nova NF de Serviço"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {etapa === "prestador" ? "Passo 1 — Prestador & Data" : etapa === "servico" ? "Passo 2 — Serviço & Discriminação" : "Passo 3 — Tributação & Lançamento"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(["prestador", "servico", "tributacao"] as Etapa[]).map((e, i) => {
                const ordem = ["prestador", "servico", "tributacao"];
                const ativo = etapa === e;
                const passado = ordem.indexOf(etapa) > i;
                return (
                  <div key={e} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: ativo ? "#111111" : passado ? "#E8E8E8" : "var(--bg-page)", color: ativo ? "#fff" : passado ? "#111111" : "var(--text-muted)" }}>
                      {i + 1}
                    </div>
                    {i < 2 && <div style={{ width: 20, height: 1, background: "var(--border-table)" }} />}
                  </div>
                );
              })}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
          </div>

          <div style={{ padding: 24 }}>
            {viewOnly && (
              <div style={{ background: "#F4F6FA", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "var(--text-2)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🔒 Modo visualização — clique em <strong>Editar</strong> para fazer alterações</span>
                <button onClick={() => setViewOnly(false)} style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "#C9921B", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✏ Editar</button>
              </div>
            )}
            {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{err}</div>}

            {etapa === "prestador" && (
              <><div style={{ pointerEvents: viewOnly ? "none" : undefined, opacity: viewOnly ? 0.85 : undefined }}>
                {fazendas.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Esta NF pertence a *</label>
                    <select value={cab.fazenda_id} onChange={e => setCab(p => ({ ...p, fazenda_id: e.target.value }))} style={inp}>
                      <option value="">— Selecionar —</option>
                      {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prestador do Serviço</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Prestador — do cadastro</label>
                    <select value={cab.prestador_id} onChange={e => onPrestadorChange(e.target.value)} style={inp}>
                      <option value="">Selecionar do cadastro…</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Nome do Prestador *</label>
                    <input value={cab.prestador_nome} onChange={e => setCab(p=>({...p,prestador_nome:e.target.value}))} style={inp} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>CNPJ / CPF do Prestador</label>
                    <input value={cab.prestador_cnpj} onChange={e => setCab(p=>({...p,prestador_cnpj:e.target.value}))} placeholder="00.000.000/0001-00" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Município de Prestação</label>
                    <input value={cab.municipio_prestacao} onChange={e => setCab(p=>({...p,municipio_prestacao:e.target.value}))} placeholder="Ex: Nova Mutum - MT" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Chave NFS-e (opcional)</label>
                    <input value={cab.chave_nfse} onChange={e => setCab(p=>({...p,chave_nfse:e.target.value.replace(/\D/g,"")}))} maxLength={44} placeholder="44 dígitos" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--bg-tag)", margin: "18px 0" }} />

                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tomador do Serviço (Destinatário)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Tomador — do cadastro</label>
                    <select value={cab.tomador_id} onChange={e => onTomadorChange(e.target.value)} style={inp}>
                      <option value="">Selecionar do cadastro…</option>
                      {produtores.length > 0 && (
                        <optgroup label="Produtores">
                          {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </optgroup>
                      )}
                      {empresas.length > 0 && (
                        <optgroup label="Empresas">
                          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Pessoas (terceiros)">
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Nome do Tomador</label>
                    <input value={cab.tomador_nome} onChange={e => setCab(p=>({...p,tomador_nome:e.target.value}))} placeholder="Razão social ou nome" style={inp} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>CNPJ / CPF do Tomador</label>
                    <input value={cab.tomador_cnpj} onChange={e => setCab(p=>({...p,tomador_cnpj:e.target.value}))} placeholder="00.000.000/0001-00" style={inp} />
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--bg-tag)", margin: "18px 0" }} />

                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Identificação da Nota</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Número NF / RPS *</label>
                    <input value={cab.numero_nf} onChange={e => setCab(p=>({...p,numero_nf:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Série</label>
                    <input value={cab.serie} onChange={e => setCab(p=>({...p,serie:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Data da Prestação *</label>
                    <input type="date" value={cab.data_prestacao} onChange={e => {
                      const dt = e.target.value;
                      setCab(p => ({ ...p, data_prestacao: dt, competencia: dt.substring(0, 7) }));
                    }} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Competência (mês)</label>
                    <input type="month" value={cab.competencia} onChange={e => setCab(p=>({...p,competencia:e.target.value}))} style={inp} />
                  </div>
                </div>

              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button style={btnR} onClick={onClose}>Fechar</button>
                {!viewOnly && <button style={btnV} onClick={() => { setErr(""); setEtapa("servico"); }}>Próximo →</button>}
              </div>
              </>
            )}

            {etapa === "servico" && (
              <><div style={{ pointerEvents: viewOnly ? "none" : undefined, opacity: viewOnly ? 0.85 : undefined }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Classificação do Serviço</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Código de Serviço — Lei Complementar 116/2003</label>
                    <select value={cab.codigo_servico} onChange={e => setCab(p=>({...p,codigo_servico:e.target.value}))} style={inp}>
                      <option value="">Selecionar código…</option>
                      {LC116.map(c => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    {cab.codigo_servico === "outros" ? (
                      <>
                        <label style={lbl}>Código de Serviço (manual)</label>
                        <input value={codigoLivre} onChange={e => setCodigoLivre(e.target.value)} placeholder="Ex: 7.05" style={inp} />
                      </>
                    ) : (
                      <>
                        <label style={lbl}>Código CNAE (opcional)</label>
                        <input value={cab.cnae} onChange={e => setCab(p=>({...p,cnae:e.target.value}))} placeholder="Ex: 0111-3/01" style={inp} />
                      </>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Discriminação do Serviço *</label>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
                    Descreva detalhadamente o serviço prestado. Esse texto irá para a NFS-e e serve como prova fiscal.
                  </div>
                  <textarea
                    value={cab.discriminacao}
                    onChange={e => setCab(p=>({...p,discriminacao:e.target.value}))}
                    rows={8}
                    placeholder="Ex: Prestação de serviços de consultoria agronômica para manejo da lavoura de soja, incluindo visitas técnicas, análise de solo, recomendação de adubação e acompanhamento de aplicações. Safra 2025/2026 — Fazenda Santa Maria, Nova Mutum/MT."
                    style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, textAlign: "right" }}>
                    {cab.discriminacao.length} caracteres
                  </div>
                </div>

              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                <button style={btnR} onClick={() => { setErr(""); setEtapa("prestador"); }}>← Voltar</button>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={btnR} onClick={onClose}>Fechar</button>
                  {!viewOnly && <button style={btnV} onClick={() => { setErr(""); setEtapa("tributacao"); }}>Próximo →</button>}
                </div>
              </div>
              </>
            )}

            {etapa === "tributacao" && (
              <><div style={{ pointerEvents: viewOnly ? "none" : undefined, opacity: viewOnly ? 0.85 : undefined }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Valores e ISS</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Valor do Serviço (R$) *</label>
                    <InputMonetario value={cab.valor_servico} onChange={v => setCab(p => ({ ...p, valor_servico: String(v) }))} placeholder="0,00" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Deduções — materiais/subempreitadas (R$)</label>
                    <InputMonetario value={cab.valor_deducoes} onChange={v => setCab(p => ({ ...p, valor_deducoes: String(v) }))} placeholder="0,00" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Base de Cálculo ISS (R$)</label>
                    <input value={fmtBRL(vBase)} readOnly style={{ ...inp, background: "var(--bg-page)", color: "var(--text-3)" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Alíquota ISS (%)</label>
                    <InputMonetario min="0" max="5" value={cab.aliquota_iss} onChange={v => setCab(p => ({ ...p, aliquota_iss: String(v) }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Valor do ISS (R$)</label>
                    <input value={fmtBRL(vISS)} readOnly style={{ ...inp, background: "var(--bg-page)", color: "var(--text-3)" }} />
                  </div>
                  <div>
                    <label style={lbl}>ISS Retido pelo Tomador?</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <button
                        onClick={() => setCab(p=>({...p, iss_retido: !p.iss_retido}))}
                        style={{ ...toggleSt, background: cab.iss_retido ? "#E24B4A" : "var(--border-table)" }}
                      >
                        <div style={{ position: "absolute", top: 2, left: cab.iss_retido ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)", transition: "left 0.2s" }} />
                      </button>
                      <span style={{ fontSize: 13, color: cab.iss_retido ? "#791F1F" : "var(--text-2)", fontWeight: cab.iss_retido ? 600 : 400 }}>
                        {cab.iss_retido ? "Retido (desconta do líquido)" : "Não retido (prestador recolhe)"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10 }}>Retenções Federais (se houver)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>INSS Retido (R$)</label>
                      <InputMonetario value={cab.valor_inss} onChange={v => setCab(p => ({ ...p, valor_inss: String(v) }))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>IR Retido (R$)</label>
                      <InputMonetario value={cab.valor_ir} onChange={v => setCab(p => ({ ...p, valor_ir: String(v) }))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Outras Retenções — CSLL/PIS/COFINS (R$)</label>
                      <InputMonetario value={cab.valor_outras_retencoes} onChange={v => setCab(p => ({ ...p, valor_outras_retencoes: String(v) }))} placeholder="0,00" style={inp} />
                    </div>
                  </div>
                </div>

                <div style={{ background: "#E8F0FB", border: "0.5px solid #93BAF0", borderRadius: 10, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Valor do Serviço",   value: fmtBRL(vServico) },
                    { label: "Total de Retenções",  value: fmtBRL(vRetencoes), vermelho: vRetencoes > 0 },
                    { label: "ISS a Recolher",      value: cab.iss_retido ? "—" : fmtBRL(vISS) },
                    { label: "Valor Líquido",       value: fmtBRL(vLiquido), destaque: true },
                  ].map(({ label, value, vermelho, destaque }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "var(--text-2)", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: destaque ? "#111111" : vermelho ? "#E24B4A" : "var(--text-1)" }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ height: 1, background: "var(--bg-tag)", margin: "18px 0" }} />

                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Classificação Gerencial</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Operação Gerencial *</label>
                    <SelectBusca
                      value={cab.operacao_gerencial_id}
                      onChange={idSel => setCab(p => ({ ...p, operacao_gerencial_id: idSel }))}
                      options={opsGer.map(o => ({ value: o.id, label: `${o.classificacao ? `${o.classificacao} — ` : ""}${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))}
                      placeholder="Selecionar operação…"
                      style={inp}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Centro de Custo</label>
                    <select value={cab.centro_custo_id} onChange={e => setCab(p=>({...p,centro_custo_id:e.target.value}))} style={inp}>
                      <option value="">Sem centro de custo</option>
                      {centros.filter(c => !centros.some(x => x.parent_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Forma de Pagamento</label>
                    <select value={cab.forma_pagamento} onChange={e => setCab(p=>({...p,forma_pagamento:e.target.value}))} style={inp}>
                      <option value="">— selecionar —</option>
                      <option value="a_vista">À Vista</option>
                      <option value="prazo_boleto">A Prazo — Boleto</option>
                      <option value="prazo_pix">A Prazo — PIX</option>
                      <option value="prazo_debito">A Prazo — Débito em Conta</option>
                      <option value="prazo_cheque">A Prazo — Cheque</option>
                      <option value="financiamento">Financiamento</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Ano Safra (para rateio)</label>
                    <select value={cab.ano_safra_id} onChange={e => setCab(p=>({...p,ano_safra_id:e.target.value}))} style={inp}>
                      <option value="">Opcional</option>
                      {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Pedido de Compra vinculado</label>
                    <select value={cab.pedido_compra_id} onChange={e => setCab(p=>({...p,pedido_compra_id:e.target.value}))} style={inp}>
                      <option value="">Sem pedido</option>
                      {pedidos.map(p => <option key={p.id} value={p.id}>{p.nr_pedido ?? p.id.substring(0,8)} — {p.status}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Vencimento da CP {nfCondicao === "prazo" && <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(1º venc.)</span>}</label>
                    <input type="date" value={cab.data_vencimento_cp} onChange={e => { setCab(p=>({...p,data_vencimento_cp:e.target.value})); setNfParcelas([]); }} style={inp} />
                  </div>
                </div>

                {empresas.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Empresa Tomadora (para vínculo na CP)</label>
                    <select value={cab.empresa_id} onChange={e => setCab(p=>({...p,empresa_id:e.target.value}))} style={inp}>
                      <option value="">Sem vínculo de empresa</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.nome || e.razao_social}</option>)}
                    </select>
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>Define qual empresa contratou o serviço — aparece no CP em Financeiro → Empresas</div>
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...lbl, marginBottom: 6 }}>Condição de Pagamento</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: nfCondicao === "prazo" ? 10 : 0 }}>
                    {(["avista", "prazo"] as const).map(v => (
                      <button key={v} onClick={() => { setNfCondicao(v); setNfParcelas([]); }}
                        style={{ padding: "5px 14px", borderRadius: 8, border: `0.5px solid ${nfCondicao === v ? "#1A4870" : "var(--border-table)"}`, background: nfCondicao === v ? "#1A4870" : "var(--bg-card)", color: nfCondicao === v ? "#fff" : "var(--text-1)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        {v === "avista" ? "À Vista" : "Parcelado"}
                      </button>
                    ))}
                  </div>
                  {nfCondicao === "prazo" && (
                    <div style={{ background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: nfParcelas.length > 0 ? 12 : 0 }}>
                        <div>
                          <label style={lbl}>Nº de Parcelas</label>
                          <input type="number" min="2" max="120" value={nfQtdParcelas}
                            onChange={e => { setNfQtdParcelas(e.target.value); setNfParcelas([]); }}
                            style={{ ...inp, width: 80 }} />
                        </div>
                        <div>
                          <label style={lbl}>Intervalo (meses)</label>
                          <select value={nfFreq} onChange={e => { setNfFreq(e.target.value); setNfParcelas([]); }} style={{ ...inp, width: 120 }}>
                            <option value="1">Mensal</option>
                            <option value="2">Bimestral</option>
                            <option value="3">Trimestral</option>
                            <option value="6">Semestral</option>
                            <option value="12">Anual</option>
                          </select>
                        </div>
                        <button onClick={gerarParcelasServico}
                          style={{ padding: "7px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                          Gerar parcelas
                        </button>
                      </div>
                      {nfParcelas.length > 0 && (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: 4, marginBottom: 4, paddingBottom: 4, borderBottom: "0.5px solid #C5D9EE" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Vencimento</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Valor (R$)</span>
                            <span />
                          </div>
                          {nfParcelas.map((p, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: 4, marginBottom: 4, alignItems: "center" }}>
                              <input type="date" value={p.data}
                                onChange={e => setNfParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                                style={{ ...inp, fontSize: 12 }} />
                              <input type="text" value={p.valorMask}
                                onChange={e => setNfParcelas(prev => prev.map((x, j) => j === i ? { ...x, valorMask: e.target.value } : x))}
                                style={{ ...inp, fontSize: 12, textAlign: "right" }} />
                              <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>{i + 1}/{nfParcelas.length}</span>
                            </div>
                          ))}
                          {(() => {
                            const soma = nfParcelas.reduce((s, p) => s + (parseFloat(p.valorMask.replace(/\./g, "").replace(",", ".")) || 0), 0);
                            const diff = Math.abs(soma - vLiquido);
                            return diff > 0.01 ? (
                              <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 6 }}>
                                ⚠ Soma ({soma.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}) difere do valor líquido ({vLiquido.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})})
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: "#166534", marginTop: 6 }}>
                                ✓ Soma confere: {soma.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {nfParcelas.length === 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Clique em &quot;Gerar parcelas&quot; para criar o cronograma editável.</div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Observações</label>
                  <textarea value={cab.observacao} onChange={e => setCab(p=>({...p,observacao:e.target.value}))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>

              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <button style={btnR} onClick={() => { setErr(""); setEtapa("servico"); }}>← Voltar</button>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {/* Ações sobre a NF já existente — ficam aqui dentro do modal (não há mais botões de linha por tipo na grid unificada) */}
                  {nfEdit && nfEdit.status === "processada" && !viewOnly && (
                    <button onClick={estornarNf} style={{ ...btnR, borderColor: "#EF9F2750", background: "#FEF3E2", color: "#7A4800" }}>↺ Estornar</button>
                  )}
                  {nfEdit && (nfEdit.status === "pendente" || nfEdit.status === "digitando") && !viewOnly && (
                    <button onClick={cancelarNf} style={btnR}>✕ Cancelar NF</button>
                  )}
                  {nfEdit && nfEdit.status !== "cancelada" && !viewOnly && (
                    <button onClick={iniciarExclusao} style={{ ...btnR, borderColor: "#E24B4A30", background: "#FCEBEB", color: "#791F1F" }}>🗑 Excluir</button>
                  )}
                  <button style={btnR} onClick={onClose}>Fechar</button>
                  {!viewOnly && <>
                    <button style={btnR} onClick={() => salvar("pendente")} disabled={saving}>
                      {saving ? "Salvando…" : "Salvar como Pendente"}
                    </button>
                    <button style={{ ...btnV, background: saving ? "#ccc" : "#111111" }} onClick={() => salvar("processada")} disabled={saving}>
                      {saving ? "Processando…" : "✓ Processar NF"}
                    </button>
                  </>}
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {modalExcluir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>
            {modalExcluir.verificando ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-2)", fontSize: 13 }}>Verificando lançamentos…</div>
            ) : modalExcluir.bloqueado ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#791F1F", marginBottom: 8 }}>⛔ Exclusão bloqueada</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20, lineHeight: 1.6 }}>
                  A NFS-e <strong>{modalExcluir.nf.numero_nf}</strong> possui um lançamento financeiro que já foi <strong>baixado (pago)</strong>. Não é possível excluir — estorne o pagamento no Contas a Pagar primeiro.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>Excluir NF de Serviço</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 20 }}>NFS-e {modalExcluir.nf.numero_nf} — {modalExcluir.nf.prestador_nome}</div>

                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#791F1F", marginBottom: 8 }}>Esta ação irá remover:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.8 }}>
                    <li>O registro da NF de Serviço</li>
                    {modalExcluir.lancamento && (
                      <li>Lançamento financeiro (CP) de {modalExcluir.nf.prestador_nome}</li>
                    )}
                  </ul>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)} disabled={modalExcluir.excluindo}>Cancelar</button>
                  <button
                    onClick={confirmarExclusao}
                    disabled={modalExcluir.excluindo}
                    style={{ padding: "8px 18px", background: modalExcluir.excluindo ? "var(--text-muted)" : "#E24B4A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: modalExcluir.excluindo ? "default" : "pointer", fontSize: 13 }}
                  >
                    {modalExcluir.excluindo ? "Excluindo…" : "Confirmar Exclusão"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
