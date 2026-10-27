"use client";
import { hojeLocal } from "../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalGrid, OperationalHeading } from "../OperationalUI";
import SelectField from "../SelectField";
import InputData from "../InputData";
import { confirmarAcao } from "../ConfirmarAcao";
import { useState, useEffect } from "react";
import SelectBusca from "../SelectBusca";
import { useAuth } from "../AuthProvider";
import { supabase } from "../../lib/supabase";
import {
  listarTransferenciasMaquinas, criarTransferenciaMaquina, atualizarTransferenciaMaquina,
  listarMaquinas, listarPessoasDaConta, criarNotaFiscal,
} from "../../lib/db";
import type { TransferenciaMaquina, MotivoTransferenciaMaquina, Maquina, Pessoa } from "../../lib/supabase";

// Transporte da NF-e (modalidade do frete, transportadora, veículo e motorista) — mesmos dados da NF-e de produto
type Transp = { frete: "0" | "1" | "2" | "9"; transportadora_id: string; veiculo_id: string; placa: string; uf_placa: string; motorista_nome: string; motorista_cpf: string };
const TRANSP_VAZIO: Transp = { frete: "0", transportadora_id: "", veiculo_id: "", placa: "", uf_placa: "", motorista_nome: "", motorista_cpf: "" };
type TransportadoraOp = { id: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; cpf: string | null; ie: string | null; rntrc: string | null; logradouro: string | null; numero: string | null; municipio: string | null; uf: string | null };
type VeiculoOp = { id: string; placa: string; uf_placa: string | null; uf: string | null; rntrc: string | null; transportadora_id: string | null; motorista_habitual_id: string | null; modelo: string | null };

// Resposta de /api/fiscal/emitir-nfe (NFeResult): dados da NF e do emitente, gravados no Monitor para o DANFE
type ResultadoEmissao = {
  sucesso: boolean; chave?: string; numero?: string; serie?: string; protocolo?: string; xmlUrl?: string; cStat?: string; xMotivo?: string;
  emit_razao?: string; emit_cnpj?: string; emit_ie?: string; emit_endereco?: string; emit_numero?: string; emit_bairro?: string;
  emit_municipio?: string; emit_uf?: string; emit_cep?: string; emit_fone?: string;
};

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

// Motivo → configuração completa das duas etapas possíveis — confirmado com o dono 23/09/2026.
// direcao "saida"   = bem PRÓPRIO sai da fazenda (conserto, transferência, comodato dado).
// direcao "entrada" = bem de TERCEIRO chega pra uso/serviço na fazenda (add. 23/09/2026).
// emiteNfEtapaN = false → não passa pela SEFAZ nessa etapa (registro manual/controle interno);
// o CFOP ainda é guardado como metadado quando existe um documento de referência do terceiro.
type MotivoCfg = {
  label: string;
  direcao: "saida" | "entrada";
  emiteNfEtapa1: boolean; cfopEtapa1: string | null; naturezaEtapa1: string;
  temEtapa2: boolean; emiteNfEtapa2: boolean; cfopEtapa2: string | null; naturezaEtapa2: string;
};
const MOTIVOS: Record<MotivoTransferenciaMaquina, MotivoCfg> = {
  conserto: {
    label: "Conserto / Manutenção externa", direcao: "saida",
    emiteNfEtapa1: true, cfopEtapa1: "5915", naturezaEtapa1: "Remessa para conserto ou reparo",
    temEtapa2: true, emiteNfEtapa2: true, cfopEtapa2: "1915", naturezaEtapa2: "Retorno de mercadoria remetida para conserto ou reparo",
  },
  transferencia_fazenda: {
    label: "Transferência entre fazendas (mesma conta)", direcao: "saida",
    emiteNfEtapa1: true, cfopEtapa1: "5552", naturezaEtapa1: "Transferência de bem do ativo imobilizado",
    temEtapa2: false, emiteNfEtapa2: false, cfopEtapa2: null, naturezaEtapa2: "",
  },
  comodato: {
    label: "Comodato / Empréstimo dado a terceiro", direcao: "saida",
    emiteNfEtapa1: true, cfopEtapa1: "5554", naturezaEtapa1: "Remessa de bem do ativo imobilizado para uso fora do estabelecimento",
    temEtapa2: true, emiteNfEtapa2: true, cfopEtapa2: "1555", naturezaEtapa2: "Devolução de bem do ativo imobilizado",
  },
  comodato_recebido: {
    label: "Comodato / Empréstimo recebido de terceiro", direcao: "entrada",
    // Quem emite a NF de remessa do comodato é o PROPRIETÁRIO (terceiro), não nós — por isso
    // não chamamos a SEFAZ nessa etapa; se ele passar número/chave, registramos manualmente.
    // CFOP 1908/2908 é o de referência pra essa entrada (metadado, não emitido por nós).
    emiteNfEtapa1: false, cfopEtapa1: "1908", naturezaEtapa1: "Entrada de bem por conta de contrato de comodato",
    // Na devolução, nós é que emitimos de verdade — CFOP 5908/6908.
    temEtapa2: true, emiteNfEtapa2: true, cfopEtapa2: "5908", naturezaEtapa2: "Devolução de bem recebido por conta de contrato de comodato",
  },
  terceiro_servico: {
    label: "Equipamento de prestador de serviço (sem NF — só controle)", direcao: "entrada",
    // Máquina do próprio prestador, usada pra operar na fazenda sob contrato de serviço — não
    // é comodato nem compra, não gera NF-e em nenhuma das pontas. Só registro de acesso/controle.
    emiteNfEtapa1: false, cfopEtapa1: null, naturezaEtapa1: "",
    temEtapa2: true, emiteNfEtapa2: false, cfopEtapa2: null, naturezaEtapa2: "",
  },
};

const STATUS_BADGE: Record<string, { bg: string; cl: string; label: string }> = {
  rascunho:  { bg: "#F3F4F6", cl: "#444444", label: "Rascunho" },
  emitida:   { bg: "#D5E8F5", cl: "#0B2D50", label: "Emitida" },
  retornada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Retornada" },
  cancelada: { bg: "#FDECEA", cl: "#B91C1C", label: "Cancelada" },
};

// Remessa e retorno de máquinas e equipamentos (conserto, comodato, transferência de bem) — aba "Máquinas e equipamentos"
// da tela Remessas (diretriz 27/10/2026: um caminho só para remessa/retorno). Era a página Transferência de Máquinas.
export default function RemessasMaquinas({ retornoId }: { retornoId?: string | null }) {
  const { contaId, fazendaId, fazendaIds } = useAuth();

  const [itens,     setItens]     = useState<TransferenciaMaquina[]>([]);
  const [maquinas,  setMaquinas]  = useState<Maquina[]>([]);
  const [pessoas,   setPessoas]   = useState<Pessoa[]>([]);
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string; cpf?: string }[]>([]);
  const [transportadoras, setTransportadoras] = useState<TransportadoraOp[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoOp[]>([]);
  const [trNova, setTrNova] = useState<Transp>(TRANSP_VAZIO);
  const [trRet, setTrRet] = useState<Transp>(TRANSP_VAZIO);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [filtroSt,  setFiltroSt]  = useState("");

  // Modal Nova Transferência
  const [modalNova, setModalNova] = useState(false);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");
  const [f, setF] = useState({
    maquina_id: "", maquina_nome_livre: "", motivo: "conserto" as MotivoTransferenciaMaquina,
    destinatario_pessoa_id: "", dest_ie: "", valor_bem: "", ncm: "84329000",
    data_retorno_prevista: "", observacao: "",
    motorista_id: "", motorista_nome: "", motorista_cpf: "",
    // Etapa 1 quando NÃO emitimos NF-e nossa (comodato recebido) — dados opcionais
    // do documento que o proprietário/terceiro eventualmente passou.
    nf_terceiro_numero: "", nf_terceiro_chave: "", nf_terceiro_data: "",
  });

  // Emitentes fiscais da conta (módulos fiscal_pf_/fiscal_emp_) — seletor "Emitente da NF". Antes o
  // sistema usava sempre o primeiro módulo da fazenda, sem saber de quem era a máquina.
  type EmitenteFiscal = { modulo: string; fazenda_id: string; cpf: string; nome: string; ie: string };
  const [emitentes, setEmitentes] = useState<EmitenteFiscal[]>([]);
  const [emitenteSel, setEmitenteSel] = useState("");
  useEffect(() => {
    const ids = fazendaIds && fazendaIds.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) return;
    supabase.from("configuracoes_modulo").select("modulo, fazenda_id, config").in("fazenda_id", ids)
      .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%").then(({ data }) => {
        const lista = ((data ?? []) as { modulo: string; fazenda_id: string; config: Record<string, string> | null }[])
          .filter(r => r.config?.cpf_cnpj_emitente)
          .map(r => ({ modulo: r.modulo, fazenda_id: r.fazenda_id, cpf: r.config!.cpf_cnpj_emitente, nome: r.config!.razao_social || r.modulo, ie: r.config!.ie_emitente || "" }));
        // dedupe por CPF/CNPJ + IE
        const vistos = new Set<string>();
        setEmitentes(lista.filter(e => { const k = `${e.cpf.replace(/\D/g, "")}|${e.ie.replace(/\D/g, "")}`; if (vistos.has(k)) return false; vistos.add(k); return true; }));
      });
  }, [fazendaId, fazendaIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve o emitente: o escolhido; senão (retorno) o da remessa original pelo CPF/CNPJ; senão o único.
  function resolverEmitente(cpfHint?: string | null): EmitenteFiscal | { erro: string } {
    if (emitenteSel) { const e = emitentes.find(x => `${x.modulo}|${x.fazenda_id}` === emitenteSel); if (e) return e; }
    const dig = (cpfHint ?? "").replace(/\D/g, "");
    if (dig) { const e = emitentes.find(x => x.cpf.replace(/\D/g, "") === dig); if (e) return e; }
    if (emitentes.length === 1) return emitentes[0];
    return { erro: emitentes.length === 0 ? "Nenhum emitente fiscal configurado em Parâmetros → Fiscal." : "Escolha o Emitente da NF (de quem é a máquina)." };
  }

  // Modal Retorno
  const [modalRet, setModalRet] = useState<TransferenciaMaquina | null>(null);
  const [retSalvando, setRetSalvando] = useState(false);
  const [retErro, setRetErro] = useState("");

  useEffect(() => {
    if (!contaId || !fazendaId) return;
    (async () => {
      setLoading(true);
      const doCliente = [`conta_id.eq.${contaId}`, ...(fazendaIds?.length ? [`fazenda_id.in.(${fazendaIds.join(",")})`] : [])].join(",");
      const [t, m, p, { data: mot }, { data: trs }, { data: vcs }] = await Promise.all([
        listarTransferenciasMaquinas(contaId),
        listarMaquinas(fazendaId),
        listarPessoasDaConta(fazendaId),
        supabase.from("motoristas").select("id, nome, cpf").eq("ativo", true),
        supabase.from("transportadoras").select("id, razao_social, nome_fantasia, cnpj, cpf, ie, rntrc, logradouro, numero, municipio, uf").or(doCliente).neq("ativa", false).order("razao_social"),
        supabase.from("veiculos").select("id, placa, uf_placa, uf, rntrc, transportadora_id, motorista_habitual_id, modelo").or(doCliente).neq("ativo", false).order("placa"),
      ]);
      setTransportadoras((trs ?? []) as TransportadoraOp[]);
      setVeiculos((vcs ?? []) as VeiculoOp[]);
      setItens(t);
      setMaquinas(m);
      setPessoas(p);
      setMotoristas(mot ?? []);
      setLoading(false);
    })();
  }, [contaId, fazendaId]);

  // Vindo da tela Retornos ("Registrar retorno" de uma máquina): abre o retorno dela
  useEffect(() => {
    if (!retornoId || !itens.length) return;
    const t = itens.find(i => i.id === retornoId && i.status === "emitida");
    if (t) { setModalRet(t); setRetErro(""); setTrRet(TRANSP_VAZIO); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retornoId, itens.length]);

  function abrirNova() {
    setTrNova(TRANSP_VAZIO);
    setF({
      maquina_id: "", maquina_nome_livre: "", motivo: "conserto", destinatario_pessoa_id: "", dest_ie: "", valor_bem: "", ncm: "84329000",
      data_retorno_prevista: "", observacao: "", motorista_id: "", motorista_nome: "", motorista_cpf: "",
      nf_terceiro_numero: "", nf_terceiro_chave: "", nf_terceiro_data: "",
    });
    setErro("");
    setModalNova(true);
  }

  // Bloco <transp> da NF-e e o texto do motorista (a NF-e não tem campo próprio de motorista: vai nas informações complementares)
  function montarTransporte(t: Transp, motoristaNome: string, motoristaCpf: string) {
    const tr = transportadoras.find(x => x.id === t.transportadora_id);
    const veic = veiculos.find(x => x.id === t.veiculo_id);
    const placa = (veic?.placa ?? t.placa).trim();
    const transporte = tr || placa ? {
      nome: tr ? (tr.razao_social || tr.nome_fantasia || undefined) : undefined,
      cpf_cnpj: tr ? (tr.cnpj || tr.cpf || undefined) : undefined,
      ie: tr?.ie || undefined,
      endereco: tr ? [tr.logradouro, tr.numero].filter(Boolean).join(", ") || undefined : undefined,
      municipio: tr?.municipio || undefined, uf: tr?.uf || undefined,
      placa: placa || undefined, uf_veiculo: (veic?.uf_placa || veic?.uf || t.uf_placa) || undefined,
      rntrc: tr?.rntrc || veic?.rntrc || undefined,
    } : undefined;
    const motorista = motoristaNome.trim() ? `Motorista: ${motoristaNome.trim()}${motoristaCpf.trim() ? ` — CPF ${motoristaCpf.trim()}` : ""}` : "";
    return { transporte, motorista };
  }

  function blocoTransporte(t: Transp, set: (fn: (p: Transp) => Transp) => void, comMotorista: boolean) {
    const escolherVeiculo = (id: string) => {
      const v = veiculos.find(x => x.id === id);
      const mot = v?.motorista_habitual_id ? motoristas.find(m => m.id === v.motorista_habitual_id) : undefined;
      set(p => ({
        ...p, veiculo_id: id, placa: v?.placa ?? p.placa, uf_placa: v?.uf_placa ?? v?.uf ?? p.uf_placa,
        transportadora_id: v?.transportadora_id || p.transportadora_id,
        ...(comMotorista && mot && !p.motorista_nome ? { motorista_nome: mot.nome, motorista_cpf: mot.cpf ?? "" } : {}),
      }));
      if (!comMotorista && mot && !f.motorista_nome) setF(p => ({ ...p, motorista_nome: mot.nome, motorista_id: mot.id, motorista_cpf: mot.cpf ?? "" }));
    };
    return (
      <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1", border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Transporte</div>
        <div>
          <label data-arato-label="true" style={lbl}>Frete por conta</label>
          <select value={t.frete} onChange={e => set(p => ({ ...p, frete: e.target.value as Transp["frete"] }))} style={inp}>
            <option value="0">0 — Remetente (emitente)</option>
            <option value="1">1 — Destinatário</option>
            <option value="2">2 — Terceiros</option>
            <option value="9">9 — Sem transporte</option>
          </select>
        </div>
        <div>
          <label data-arato-label="true" style={lbl}>Transportadora (opcional)</label>
          <select value={t.transportadora_id} onChange={e => set(p => ({ ...p, transportadora_id: e.target.value }))} style={inp}>
            <option value="">— Própria / sem transportadora —</option>
            {transportadoras.map(x => <option key={x.id} value={x.id}>{x.razao_social || x.nome_fantasia}{x.cnpj || x.cpf ? ` · ${x.cnpj || x.cpf}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label data-arato-label="true" style={lbl}>Veículo</label>
          <select value={t.veiculo_id} onChange={e => escolherVeiculo(e.target.value)} style={inp}>
            <option value="">— Digitar a placa —</option>
            {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa}{v.modelo ? ` · ${v.modelo}` : ""}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8 }}>
          <div>
            <label data-arato-label="true" style={lbl}>Placa</label>
            <input value={t.placa} disabled={!!t.veiculo_id} onChange={e => set(p => ({ ...p, placa: e.target.value.toUpperCase() }))} style={inp} placeholder="ABC1D23" maxLength={8} />
          </div>
          <div>
            <label data-arato-label="true" style={lbl}>UF</label>
            <input value={t.uf_placa} disabled={!!t.veiculo_id} onChange={e => set(p => ({ ...p, uf_placa: e.target.value.toUpperCase() }))} style={inp} placeholder="MT" maxLength={2} />
          </div>
        </div>
        {comMotorista && (
          <>
            <div>
              <label data-arato-label="true" style={lbl}>Motorista</label>
              <input list="transf-maq-motoristas" value={t.motorista_nome}
                onChange={e => { const nome = e.target.value; const m = motoristas.find(x => x.nome === nome); set(p => ({ ...p, motorista_nome: nome, motorista_cpf: m?.cpf ?? p.motorista_cpf })); }}
                style={inp} placeholder="Nome do motorista" />
            </div>
            <div>
              <label data-arato-label="true" style={lbl}>CPF do motorista</label>
              <input value={t.motorista_cpf} onChange={e => set(p => ({ ...p, motorista_cpf: e.target.value }))} style={inp} />
            </div>
          </>
        )}
        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)" }}>Transportadora e veículo saem no XML e no DANFE; o motorista vai nas informações complementares da NF-e.</div>
      </div>
    );
  }

  // NF-e emitida aqui entra no Monitor de NF-e Emitidas (notas_fiscais) — sem isso não havia DANFE para imprimir nem
  // como cancelar/corrigir pelo Monitor (mesmo caso já corrigido na devolução de compra). Falha aqui não desfaz a NF.
  async function registrarNoMonitor(res: ResultadoEmissao, fazId: string | null | undefined, moduloKey: string | undefined, d: {
    natureza: string; tipo: "saida" | "entrada"; cfop: string; descricao: string; ncm: string; valor: number; destinatario: string;
    cnpj?: string | null; ie?: string | null; uf?: string | null; cidade?: string | null; endereco?: string | null; numero?: string | null; observacao?: string | null;
  }) {
    if (!fazId || !res.chave) return;
    const cfop = d.cfop.replace(/\D/g, "");
    try {
      await criarNotaFiscal({
        fazenda_id: fazId, numero: res.numero ?? "", serie: res.serie ?? "1", tipo: d.tipo,
        cfop: cfop.length === 4 ? `${cfop.slice(0, 1)}.${cfop.slice(1)}` : cfop, natureza: d.natureza,
        destinatario: d.destinatario, cnpj_destinatario: (d.cnpj ?? "").replace(/\D/g, "") || undefined,
        valor_total: d.valor, data_emissao: hojeLocal(), status: "autorizada", chave_acesso: res.chave, xml_url: res.xmlUrl,
        auto: false, tipo_emissao: 1, observacao: d.observacao || undefined,
        itens_json: [{ item: d.descricao, ncm: d.ncm, cfop, unidade: "UN", quantidade: 1, valor_unitario: d.valor, valor_total: d.valor }],
        dados_nf_json: {
          modulo_key: moduloKey, protocolo_autorizacao: res.protocolo || undefined,
          emit_razao: res.emit_razao, emit_cnpj: res.emit_cnpj, emit_ie: res.emit_ie, emit_endereco: res.emit_endereco, emit_numero: res.emit_numero,
          emit_bairro: res.emit_bairro, emit_municipio: res.emit_municipio, emit_uf: res.emit_uf, emit_cep: res.emit_cep, emit_fone: res.emit_fone,
          dest_ie: (d.ie ?? "").replace(/\D/g, "") || undefined, dest_uf: d.uf || undefined, dest_cidade: d.cidade || undefined,
          dest_endereco: d.endereco || undefined, dest_numero: d.numero || undefined,
        },
      } as never);
    } catch (e) {
      console.error("[transferencia-maquinas] não registrou no Monitor de NF-e:", e);
    }
  }

  // DANFE da NF-e da movimentação (o mesmo PDF do Monitor, gerado do XML autorizado)
  async function abrirDanfe(chave: string | null | undefined) {
    if (!chave) return;
    const { data } = await supabase.from("notas_fiscais").select("id, fazenda_id").eq("chave_acesso", chave).limit(1).maybeSingle();
    if (data?.id) window.open(`/api/fiscal/danfe?chave=${chave}&fazenda_id=${data.fazenda_id}`, "_blank");
    else alert("Esta NF-e ainda não está no Monitor de NF-e Emitidas. Fale com o suporte para registrá-la.");
  }

  async function emitirRemessa() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Emitir remessa)", perigo: false }))) return;
    if (!fazendaId) return;
    const motivoCfg = MOTIVOS[f.motivo];
    const ehEntrada = motivoCfg.direcao === "entrada";
    const maquina = ehEntrada ? null : maquinas.find(m => m.id === f.maquina_id);
    const nomeBem = ehEntrada ? f.maquina_nome_livre.trim() : (maquina?.nome ?? "");
    const dest = pessoas.find(p => p.id === f.destinatario_pessoa_id);
    if (ehEntrada && !nomeBem) { setErro("Descreva a máquina/equipamento."); return; }
    if (!ehEntrada && !maquina) { setErro("Selecione a máquina/equipamento."); return; }
    if (!dest) { setErro(ehEntrada ? "Selecione o proprietário/prestador." : "Selecione o destinatário."); return; }
    const valor = parseFloat(f.valor_bem.replace(/\./g, "").replace(",", ".")) || 0;
    if (valor <= 0) { setErro("Informe o valor estimado do bem."); return; }

    // Etapa 1 sem emissão de NF nossa (bem de terceiro entrando) — registro direto,
    // sem chamar a SEFAZ. Se o proprietário informou os dados da NF dele, gravamos
    // como referência (não é uma NF nossa, é só rastreabilidade do documento dele).
    if (!motivoCfg.emiteNfEtapa1) {
      setSalvando(true);
      setErro("");
      try {
        // Bem de terceiro entra na fazenda do titular escolhido como emitente (sem emitente: única opção, senão a do perfil).
        const emEntrada = resolverEmitente();
        const novo = await criarTransferenciaMaquina({
          fazenda_id: ("fazenda_id" in emEntrada ? emEntrada.fazenda_id : null) || fazendaId,
          maquina_nome: nomeBem,
          motivo: f.motivo,
          direcao: "entrada",
          cfop_saida: motivoCfg.cfopEtapa1 ?? "",
          cfop_retorno: motivoCfg.cfopEtapa2 ?? undefined,
          destinatario_pessoa_id: dest.id,
          destinatario_nome: dest.nome,
          destinatario_cnpj: dest.cpf_cnpj ?? undefined,
          destinatario_ie: dest.inscricao_est ?? undefined,
          destinatario_municipio: dest.municipio ?? undefined,
          destinatario_uf: dest.estado ?? undefined,
          ncm: f.ncm,
          valor_bem: valor,
          motorista_id: f.motorista_id || undefined,
          motorista_nome: f.motorista_nome || undefined,
          motorista_cpf: f.motorista_cpf || undefined,
          data_retorno_prevista: f.data_retorno_prevista || undefined,
          observacao: f.observacao || undefined,
          status: "emitida", // "emitida" aqui = "em posse, aguardando devolução"
          nf_saida_chave: f.nf_terceiro_chave || undefined,
          nf_saida_numero: f.nf_terceiro_numero || undefined,
          nf_saida_data: f.nf_terceiro_data || undefined,
        });
        setItens(prev => [novo, ...prev]);
        setModalNova(false);
      } catch (e) {
        setErro((e as Error).message ?? "Erro ao registrar entrada.");
      } finally {
        setSalvando(false);
      }
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      // Emitente: titular fiscal da fazenda (mesmo padrão de Devolução/Remessa — resolve pelo
      // certificado configurado, sem precisar escolher módulo manualmente).
      const em = resolverEmitente();
      if ("erro" in em) { setErro(em.erro); setSalvando(false); return; }
      const moduloKey = em.modulo;
      const cpfCnpjHint = em.cpf;
      const { transporte, motorista } = montarTransporte(trNova, f.motorista_nome, f.motorista_cpf);

      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: em.fazenda_id,
          modulo_key: moduloKey,
          cpf_cnpj_hint: cpfCnpjHint,
          destinatario: {
            nome: dest.nome,
            cpf_cnpj: (dest.cpf_cnpj ?? "").replace(/\D/g, "") || undefined,
            ie: f.dest_ie.replace(/\D/g, "") || undefined,
            logradouro: dest.logradouro || undefined,
            numero: dest.numero || undefined,
            bairro: dest.bairro || undefined,
            municipio_ibge: dest.municipio_ibge || undefined,
            municipio_nome: dest.municipio || undefined,
            uf: dest.estado || undefined,
            cep: (dest.cep ?? "").replace(/\D/g, "") || undefined,
          },
          itens: [{
            descricao: nomeBem, ncm: f.ncm, cfop: motivoCfg.cfopEtapa1,
            unidade: "UN", quantidade: 1, valor_unitario: valor,
          }],
          natureza: motivoCfg.naturezaEtapa1,
          inf_cpl: [f.observacao, motorista].filter(Boolean).join(" | ") || undefined,
          frete: trNova.frete,
          transporte,
          tipo: "1",
        }),
      });
      const res = await resp.json() as ResultadoEmissao;
      if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);
      if (!maquina) throw new Error("Máquina não selecionada."); // guarda pro TS — já validado acima
      await registrarNoMonitor(res, em.fazenda_id ?? fazendaId, moduloKey, {
        natureza: motivoCfg.naturezaEtapa1, tipo: "saida", cfop: motivoCfg.cfopEtapa1 ?? "", descricao: nomeBem, ncm: f.ncm, valor,
        destinatario: dest.nome, cnpj: dest.cpf_cnpj, ie: f.dest_ie, uf: dest.estado, cidade: dest.municipio, endereco: dest.logradouro, numero: dest.numero,
        observacao: f.observacao,
      });

      // A transferência é da fazenda onde a máquina está cadastrada — nunca da fazenda do perfil de quem lança.
      const novo = await criarTransferenciaMaquina({
        fazenda_id: maquina.fazenda_id || fazendaId,
        maquina_id: maquina.id,
        maquina_nome: maquina.nome,
        motivo: f.motivo,
        direcao: "saida",
        cfop_saida: motivoCfg.cfopEtapa1 ?? "",
        cfop_retorno: motivoCfg.cfopEtapa2 ?? undefined,
        destinatario_pessoa_id: dest.id,
        destinatario_nome: dest.nome,
        destinatario_cnpj: dest.cpf_cnpj ?? undefined,
        destinatario_ie: f.dest_ie.replace(/\D/g, "") || undefined,
        destinatario_municipio: dest.municipio ?? undefined,
        destinatario_uf: dest.estado ?? undefined,
        ncm: f.ncm,
        valor_bem: valor,
        motorista_id: f.motorista_id || undefined,
        motorista_nome: f.motorista_nome || undefined,
        motorista_cpf: f.motorista_cpf || undefined,
        data_retorno_prevista: f.data_retorno_prevista || undefined,
        observacao: f.observacao || undefined,
        status: "emitida",
        emitente_cpf_cnpj: cpfCnpjHint,
        nf_saida_chave: res.chave,
        nf_saida_numero: res.numero,
        nf_saida_protocolo: res.protocolo,
        nf_saida_data: hojeLocal(),
      });
      setItens(prev => [novo, ...prev]);
      setModalNova(false);
    } catch (e) {
      setErro((e as Error).message ?? "Erro ao emitir NF de remessa.");
    } finally {
      setSalvando(false);
    }
  }

  async function emitirRetorno() {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Emitir retorno)", perigo: false }))) return;
    if (!modalRet || !fazendaId) return;
    const motivoCfg = MOTIVOS[modalRet.motivo];
    if (!motivoCfg.temEtapa2) return;

    // Sem NF na devolução (equipamento de prestador de serviço) — só fecha o registro.
    if (!motivoCfg.emiteNfEtapa2) {
      setRetSalvando(true);
      setRetErro("");
      try {
        await atualizarTransferenciaMaquina(modalRet.id, { status: "retornada", nf_retorno_data: hojeLocal() });
        setItens(prev => prev.map(i => i.id === modalRet.id ? { ...i, status: "retornada" } : i));
        setModalRet(null);
      } catch (e) {
        setRetErro((e as Error).message ?? "Erro ao registrar saída.");
      } finally {
        setRetSalvando(false);
      }
      return;
    }

    // Direção da NF de devolução depende de quem estava com o bem: se o bem era NOSSO e
    // está voltando pra nós (conserto/comodato dado), é uma ENTRADA (tipo "0"). Se o bem
    // era de TERCEIRO e estamos devolvendo pro dono (comodato recebido), é uma SAÍDA nossa
    // (tipo "1") — mesma lógica inversa da etapa 1.
    const tipoNfRetorno = modalRet.direcao === "entrada" ? "1" : "0";

    setRetSalvando(true);
    setRetErro("");
    try {
      const emR = resolverEmitente(modalRet.emitente_cpf_cnpj);
      if ("erro" in emR) { setRetErro(emR.erro); setRetSalvando(false); return; }
      const moduloKey = emR.modulo;
      const { transporte, motorista } = montarTransporte(trRet, trRet.motorista_nome, trRet.motorista_cpf);

      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: emR.fazenda_id,
          modulo_key: moduloKey,
          cpf_cnpj_hint: modalRet.emitente_cpf_cnpj,
          // A contraparte do documento é sempre quem participou da remessa original —
          // devolução recebida (entra) ou devolvida por nós (sai), mesmo destinatário.
          destinatario: {
            nome: modalRet.destinatario_nome,
            cpf_cnpj: (modalRet.destinatario_cnpj ?? "").replace(/\D/g, "") || undefined,
            ie: modalRet.destinatario_ie || undefined,
            municipio_nome: modalRet.destinatario_municipio || undefined,
            uf: modalRet.destinatario_uf || undefined,
          },
          itens: [{
            descricao: modalRet.maquina_nome, ncm: modalRet.ncm, cfop: modalRet.cfop_retorno,
            unidade: "UN", quantidade: 1, valor_unitario: modalRet.valor_bem,
          }],
          natureza: motivoCfg.naturezaEtapa2,
          inf_cpl: [modalRet.nf_saida_numero
            ? `Retorno da remessa NF ${modalRet.nf_saida_numero} — chave ${modalRet.nf_saida_chave ?? ""}`
            : `Devolução — bem recebido de ${modalRet.destinatario_nome}`, motorista].filter(Boolean).join(" | "),
          frete: trRet.frete,
          transporte,
          nfe_ref: modalRet.nf_saida_chave || undefined,
          tipo: tipoNfRetorno,
        }),
      });
      const res = await resp.json() as ResultadoEmissao;
      if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);
      await registrarNoMonitor(res, emR.fazenda_id ?? fazendaId, moduloKey, {
        natureza: motivoCfg.naturezaEtapa2, tipo: tipoNfRetorno === "1" ? "saida" : "entrada", cfop: modalRet.cfop_retorno ?? "", descricao: modalRet.maquina_nome,
        ncm: modalRet.ncm, valor: modalRet.valor_bem, destinatario: modalRet.destinatario_nome, cnpj: modalRet.destinatario_cnpj, ie: modalRet.destinatario_ie,
        uf: modalRet.destinatario_uf, cidade: modalRet.destinatario_municipio,
        observacao: modalRet.nf_saida_numero ? `Retorno da remessa NF ${modalRet.nf_saida_numero}` : undefined,
      });

      await atualizarTransferenciaMaquina(modalRet.id, {
        status: "retornada",
        nf_retorno_chave: res.chave,
        nf_retorno_numero: res.numero,
        nf_retorno_protocolo: res.protocolo,
        nf_retorno_data: hojeLocal(),
      });
      setItens(prev => prev.map(i => i.id === modalRet.id ? { ...i, status: "retornada", nf_retorno_chave: res.chave, nf_retorno_numero: res.numero } : i));
      setModalRet(null);
    } catch (e) {
      setRetErro((e as Error).message ?? "Erro ao emitir NF de retorno.");
    } finally {
      setRetSalvando(false);
    }
  }

  const filtrados = itens.filter(i => {
    if (filtroSt && i.status !== filtroSt) return false;
    const q = busca.toLowerCase();
    if (!q) return true;
    return i.maquina_nome.toLowerCase().includes(q) || i.destinatario_nome.toLowerCase().includes(q) || (i.nf_saida_numero ?? "").includes(q);
  });

  const totalEmitidas   = itens.filter(i => i.status === "emitida").length;
  const totalRetornadas = itens.filter(i => i.status === "retornada").length;
  const valorTotal      = itens.reduce((s, i) => s + i.valor_bem, 0);

  return (
    <>
      <div>
        <OperationalHeading style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Máquina ou equipamento que sai para conserto, comodato, demonstração ou transferência entre fazendas — e o retorno dele. Não mexe no estoque de insumos.</div>
          <OperationalButton data-arato-button="primary" style={btnV} onClick={abrirNova}>+ Nova remessa de máquina</OperationalButton>
        </OperationalHeading>

        <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Aguard. Retorno", value: String(totalEmitidas), bg: "#FBF3E0", cl: "#7A5C00" },
            { label: "Retornadas",      value: String(totalRetornadas), bg: "#E8F5E9", cl: "#1A6B3C" },
            { label: "Valor Total",     value: fmtBRL(valorTotal), bg: "#F4F6FA", cl: "#1a1a1a" },
          ].map(k => (
            <div data-arato-statistic="display" key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: k.cl, fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.cl }}>{k.value}</div>
            </div>
          ))}
        </div>

        <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por máquina, destinatário, nº NF…" style={{ ...inp, maxWidth: 320 }} />
          <SelectField value={filtroSt} onChange={e => setFiltroSt(e.target.value)} style={{ ...inp, maxWidth: 180 }}>
            <option value="">Todos os status</option>
            <option value="emitida">Emitida</option>
            <option value="retornada">Retornada</option>
            <option value="cancelada">Cancelada</option>
          </SelectField>
        </OperationalFilters>

        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
          <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-page)" }}>
                {["Máquina/Equip.", "Direção", "Motivo", "Contraparte", "NF Remessa", "Valor", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Carregando…</td></tr>}
              {!loading && filtrados.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Nenhuma transferência encontrada.</td></tr>}
              {filtrados.map(i => {
                const sm = STATUS_BADGE[i.status];
                const motivoCfgLinha = MOTIVOS[i.motivo];
                const labelBotaoRetorno = !motivoCfgLinha.emiteNfEtapa2 ? "Registrar Saída" : (i.direcao === "entrada" ? "Registrar Devolução" : "Registrar Retorno");
                return (
                  <tr key={i.id} style={{ borderTop: "0.5px solid var(--border-table)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{i.maquina_nome}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: i.direcao === "entrada" ? "#FBF3E0" : "#D5E8F5", color: i.direcao === "entrada" ? "#7A5C00" : "#0B2D50" }}>
                        {i.direcao === "entrada" ? "↘ Entra" : "↗ Sai"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{motivoCfgLinha.label}</td>
                    <td style={{ padding: "10px 12px" }}>{i.destinatario_nome}</td>
                    <td style={{ padding: "10px 12px" }}>{i.nf_saida_numero ? `${i.nf_saida_numero}` : "—"}<div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtData(i.nf_saida_data)}</div></td>
                    <td style={{ padding: "10px 12px" }}>{fmtBRL(i.valor_bem)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: sm.bg, color: sm.cl }}>{sm.label}</span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {motivoCfgLinha.emiteNfEtapa1 && i.direcao === "saida" && i.nf_saida_chave && (
                        <OperationalButton data-arato-button="secondary" onClick={() => abrirDanfe(i.nf_saida_chave)} style={{ padding: "5px 10px", border: "0.5px solid var(--border)", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, marginRight: 6 }}>🖨 DANFE</OperationalButton>
                      )}
                      {i.nf_retorno_chave && (
                        <OperationalButton data-arato-button="secondary" onClick={() => abrirDanfe(i.nf_retorno_chave)} style={{ padding: "5px 10px", border: "0.5px solid var(--border)", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600, marginRight: 6 }}>🖨 DANFE retorno</OperationalButton>
                      )}
                      {i.status === "emitida" && motivoCfgLinha.temEtapa2 && (
                        <OperationalButton data-arato-button="primary" onClick={() => { setModalRet(i); setRetErro(""); setTrRet(TRANSP_VAZIO); }} style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                          {labelBotaoRetorno}
                        </OperationalButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </OperationalGrid>
        </div>
      </div>

      {/* ── Modal Nova Transferência ── */}
      {modalNova && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "24px 0" }}>
          <div data-arato-dialog="page" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 640, margin: "0 20px" }}>
            <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div data-arato-dialog-body="true" style={{ fontSize: 15, fontWeight: 700 }}>{MOTIVOS[f.motivo].direcao === "entrada" ? "Novo Registro — Bem de Terceiro" : "Nova Transferência de Máquina/Equipamento"}</div>
              <OperationalButton data-arato-button="icon" onClick={() => setModalNova(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</OperationalButton>
            </div>
            <div data-arato-dialog-body="true" data-arato-fields="true" style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {erro && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{erro}</div>}

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Máquina própria ou de terceiro?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["saida", "Própria (sai da fazenda)"], ["entrada", "De terceiro (entra na fazenda)"]] as const).map(([dir, label]) => (
                    <OperationalButton data-arato-button="toggle" key={dir} type="button"
                      onClick={() => setF(p => ({ ...p, motivo: (dir === "saida" ? "conserto" : "comodato_recebido") as MotivoTransferenciaMaquina, maquina_id: "", maquina_nome_livre: "" }))}
                      style={{
                        flex: 1, padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                        border: MOTIVOS[f.motivo].direcao === dir ? "1px solid #1A4870" : "0.5px solid var(--border-table)",
                        background: MOTIVOS[f.motivo].direcao === dir ? "#D5E8F5" : "transparent",
                        color: MOTIVOS[f.motivo].direcao === dir ? "#0B2D50" : "var(--text-2)",
                      }}>
                      {label}
                    </OperationalButton>
                  ))}
                </div>
              </div>

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Emitente da NF (de quem é a máquina)</label>
                <SelectField value={emitenteSel} onChange={e => setEmitenteSel(e.target.value)} style={inp}>
                  <option value="">{emitentes.length === 1 ? `${emitentes[0].nome} — ${emitentes[0].cpf}` : emitentes.length ? "— Selecione o emitente —" : "Nenhum emitente fiscal configurado"}</option>
                  {emitentes.length > 1 && emitentes.map(e => <option key={`${e.modulo}|${e.fazenda_id}`} value={`${e.modulo}|${e.fazenda_id}`}>{e.nome} — {e.cpf}{e.ie ? ` · IE ${e.ie}` : ""}</option>)}
                </SelectField>
              </div>

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Motivo</label>
                <SelectField value={f.motivo} onChange={e => setF(p => ({ ...p, motivo: e.target.value as MotivoTransferenciaMaquina }))} style={inp}>
                  {Object.entries(MOTIVOS).filter(([, v]) => v.direcao === MOTIVOS[f.motivo].direcao).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </SelectField>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  {MOTIVOS[f.motivo].cfopEtapa1
                    ? <>CFOP {MOTIVOS[f.motivo].direcao === "entrada" ? "de entrada (referência)" : "de saída"}: <strong>{MOTIVOS[f.motivo].cfopEtapa1}</strong></>
                    : <>Sem NF nesta etapa — só registro de controle</>}
                  {MOTIVOS[f.motivo].cfopEtapa2 ? <> · Devolução: <strong>{MOTIVOS[f.motivo].cfopEtapa2}</strong></> : (MOTIVOS[f.motivo].temEtapa2 ? <> · devolução sem NF</> : <> · sem devolução (movimento definitivo)</>)}
                </div>
              </div>

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Máquina / Equipamento</label>
                {MOTIVOS[f.motivo].direcao === "entrada" ? (
                  <input value={f.maquina_nome_livre} onChange={e => setF(p => ({ ...p, maquina_nome_livre: e.target.value }))}
                    style={inp} placeholder="Ex: Colhedora John Deere S780 — placa/patrimônio do proprietário" />
                ) : (
                  <SelectBusca value={f.maquina_id} onChange={v => setF(p => ({ ...p, maquina_id: v }))}
                    placeholder="— Selecionar do nosso cadastro —" style={inp}
                    options={maquinas.map(m => ({ value: m.id, label: `${m.nome}${m.patrimonio ? ` · Patrim. ${m.patrimonio}` : ""}` }))} />
                )}
              </div>

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>
                  {MOTIVOS[f.motivo].direcao === "entrada" ? "Proprietário / Prestador de serviço" : "Destinatário"}
                  {f.motivo === "transferencia_fazenda" ? " (empresa/produtor da fazenda de destino)" : ""}
                </label>
                <SelectBusca value={f.destinatario_pessoa_id} onChange={v => setF(p => ({ ...p, destinatario_pessoa_id: v, dest_ie: pessoas.find(ps => ps.id === v)?.inscricao_est ?? "" }))}
                  placeholder="— Selecionar —" style={inp}
                  options={pessoas.map(ps => ({ value: ps.id, label: `${ps.nome}${ps.cpf_cnpj ? " · " + ps.cpf_cnpj : ""}` }))} />
              </div>
              {MOTIVOS[f.motivo].emiteNfEtapa1 && (
                <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                  <label data-arato-label="true" style={lbl}>Inscrição Estadual do destinatário{f.motivo === "transferencia_fazenda" ? " (IE da fazenda de destino)" : ""}</label>
                  <input value={f.dest_ie} onChange={e => setF(p => ({ ...p, dest_ie: e.target.value }))} style={inp} placeholder="Somente números — vazio = destinatário não contribuinte" />
                  {f.destinatario_pessoa_id && !f.dest_ie.replace(/\D/g, "") && (
                    <span style={{ fontSize: 11, color: "#B45309" }}>Sem IE a NF-e sai com o destinatário como não contribuinte. Produtor rural e empresa com IE: informe a IE.</span>
                  )}
                </div>
              )}

              <div data-arato-dialog-body="true">
                <label data-arato-label="true" style={lbl}>Valor do Bem (R$)</label>
                <input value={f.valor_bem} onChange={e => setF(p => ({ ...p, valor_bem: e.target.value }))} style={inp} placeholder="0,00" />
              </div>
              <div data-arato-dialog-body="true">
                <label data-arato-label="true" style={lbl}>NCM</label>
                <input value={f.ncm} onChange={e => setF(p => ({ ...p, ncm: e.target.value.replace(/\D/g, "") }))} style={inp} maxLength={8} />
              </div>

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Motorista (opcional)</label>
                {/* Digite livre (sem precisar cadastrar) ou escolha uma sugestão do cadastro. */}
                <input list="transf-maq-motoristas" value={f.motorista_nome}
                  onChange={e => {
                    const nome = e.target.value;
                    const achado = motoristas.find(m => m.nome === nome);
                    setF(p => ({ ...p, motorista_nome: nome, motorista_id: achado?.id ?? "", motorista_cpf: achado?.cpf ?? p.motorista_cpf }));
                  }}
                  style={inp} placeholder="Nome do motorista que vai transportar" />
                <datalist id="transf-maq-motoristas">
                  {motoristas.map(m => <option key={m.id} value={m.nome} />)}
                </datalist>
              </div>
              {MOTIVOS[f.motivo].emiteNfEtapa1 && (
                <div data-arato-dialog-body="true">
                  <label data-arato-label="true" style={lbl}>CPF do motorista</label>
                  <input value={f.motorista_cpf} onChange={e => setF(p => ({ ...p, motorista_cpf: e.target.value }))} style={inp} />
                </div>
              )}
              {MOTIVOS[f.motivo].emiteNfEtapa1 && blocoTransporte(trNova, setTrNova, false)}

              {MOTIVOS[f.motivo].temEtapa2 && (
                <div>
                  <label data-arato-label="true" style={lbl}>{MOTIVOS[f.motivo].direcao === "entrada" ? "Devolução prevista" : "Retorno previsto"}</label>
                  <InputData type="date" value={f.data_retorno_prevista} onChange={e => setF(p => ({ ...p, data_retorno_prevista: e.target.value }))} style={inp} />
                </div>
              )}

              {f.motivo === "comodato_recebido" && (
                <>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                    Se o proprietário emitiu NF de remessa pra esse comodato, informe abaixo (opcional — só pra rastreabilidade, não somos nós quem emite essa nota).
                  </div>
                  <div>
                    <label data-arato-label="true" style={lbl}>Nº da NF do proprietário</label>
                    <input value={f.nf_terceiro_numero} onChange={e => setF(p => ({ ...p, nf_terceiro_numero: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label data-arato-label="true" style={lbl}>Data da NF</label>
                    <InputData type="date" value={f.nf_terceiro_data} onChange={e => setF(p => ({ ...p, nf_terceiro_data: e.target.value }))} style={inp} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label data-arato-label="true" style={lbl}>Chave de acesso (44 dígitos)</label>
                    <input value={f.nf_terceiro_chave} onChange={e => setF(p => ({ ...p, nf_terceiro_chave: e.target.value.replace(/\D/g, "") }))} style={inp} maxLength={44} />
                  </div>
                </>
              )}

              <div data-arato-dialog-body="true" style={{ gridColumn: "1 / -1" }}>
                <label data-arato-label="true" style={lbl}>Observação</label>
                <textarea value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} style={{ ...inp, minHeight: 60, resize: "vertical" }} />
              </div>
            </div>
            <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ padding: "14px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <OperationalButton data-arato-button="secondary" style={btnR} onClick={() => setModalNova(false)}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={emitirRemessa} disabled={salvando} style={{ ...btnV, cursor: salvando ? "default" : "pointer" }}>
                {salvando ? "Salvando…" : (MOTIVOS[f.motivo].emiteNfEtapa1 ? "Emitir NF de Remessa" : "Registrar Entrada")}
              </OperationalButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Registrar Retorno / Devolução / Saída ── */}
      {modalRet && (() => {
        const motivoCfgRet = MOTIVOS[modalRet.motivo];
        const titulo = !motivoCfgRet.emiteNfEtapa2 ? "Registrar Saída" : (modalRet.direcao === "entrada" ? "Registrar Devolução" : "Registrar Retorno");
        return (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div data-arato-dialog="confirmation" style={{ background: "var(--bg-card)", borderRadius: 14, width: motivoCfgRet.emiteNfEtapa2 ? 620 : 460, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div data-arato-dialog-body="true" style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
              <OperationalButton data-arato-button="icon" onClick={() => setModalRet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</OperationalButton>
            </div>
            <div data-arato-dialog-body="true" style={{ padding: "20px 24px" }}>
              {retErro && <div style={{ marginBottom: 14, background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{retErro}</div>}
              <div data-arato-dialog-body="true" style={{ fontSize: 13, marginBottom: 8 }}><strong>{modalRet.maquina_nome}</strong></div>
              <div data-arato-dialog-body="true" style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>{modalRet.direcao === "entrada" ? "Proprietário" : "Destinatário original"}: {modalRet.destinatario_nome}</div>
              {modalRet.nf_saida_numero && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>NF de remessa: {modalRet.nf_saida_numero} — {fmtData(modalRet.nf_saida_data)}</div>}
              {motivoCfgRet.emiteNfEtapa2
                ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>CFOP {modalRet.direcao === "entrada" ? "de devolução (nossa NF de saída)" : "de retorno"}: <strong>{modalRet.cfop_retorno}</strong></div>
                : <div style={{ fontSize: 12, color: "var(--text-3)" }}>Sem NF nesta etapa — só fecha o registro de controle.</div>}
              {motivoCfgRet.emiteNfEtapa2 && <div style={{ marginTop: 12, display: "grid" }}>{blocoTransporte(trRet, setTrRet, true)}</div>}
            </div>
            <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ padding: "14px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <OperationalButton data-arato-button="secondary" style={btnR} onClick={() => setModalRet(null)}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={emitirRetorno} disabled={retSalvando} style={{ ...btnV, background: "#1A6B3C", cursor: retSalvando ? "default" : "pointer" }}>
                {retSalvando ? "Salvando…" : (motivoCfgRet.emiteNfEtapa2 ? "Emitir NF" : "Confirmar Saída")}
              </OperationalButton>
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}
