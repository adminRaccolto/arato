"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import SelectBusca from "../../../components/SelectBusca";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import {
  listarTransferenciasMaquinas, criarTransferenciaMaquina, atualizarTransferenciaMaquina,
  listarMaquinas, listarPessoasDaConta,
} from "../../../lib/db";
import type { TransferenciaMaquina, MotivoTransferenciaMaquina, Maquina, Pessoa } from "../../../lib/supabase";

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

// Motivo → CFOP de saída (remessa) e de retorno (entrada) — confirmado com o dono 23/09/2026.
// Transferência entre fazendas do mesmo cliente é definitiva: não tem retorno.
const MOTIVOS: Record<MotivoTransferenciaMaquina, { label: string; cfopSaida: string; cfopRetorno: string | null; natureza: string; naturezaRetorno: string }> = {
  conserto: {
    label: "Conserto / Manutenção externa", cfopSaida: "5915", cfopRetorno: "1915",
    natureza: "Remessa para conserto ou reparo",
    naturezaRetorno: "Retorno de mercadoria remetida para conserto ou reparo",
  },
  transferencia_fazenda: {
    label: "Transferência entre fazendas (mesma conta)", cfopSaida: "5552", cfopRetorno: null,
    natureza: "Transferência de bem do ativo imobilizado",
    naturezaRetorno: "",
  },
  comodato: {
    label: "Comodato / Empréstimo a terceiro", cfopSaida: "5554", cfopRetorno: "1555",
    natureza: "Remessa de bem do ativo imobilizado para uso fora do estabelecimento",
    naturezaRetorno: "Devolução de bem do ativo imobilizado",
  },
};

const STATUS_BADGE: Record<string, { bg: string; cl: string; label: string }> = {
  rascunho:  { bg: "#F3F4F6", cl: "#444444", label: "Rascunho" },
  emitida:   { bg: "#D5E8F5", cl: "#0B2D50", label: "Emitida" },
  retornada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Retornada" },
  cancelada: { bg: "#FDECEA", cl: "#B91C1C", label: "Cancelada" },
};

export default function TransferenciaMaquinasPage() {
  const { contaId, fazendaId } = useAuth();

  const [itens,     setItens]     = useState<TransferenciaMaquina[]>([]);
  const [maquinas,  setMaquinas]  = useState<Maquina[]>([]);
  const [pessoas,   setPessoas]   = useState<Pessoa[]>([]);
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string; cpf?: string }[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [filtroSt,  setFiltroSt]  = useState("");

  // Modal Nova Transferência
  const [modalNova, setModalNova] = useState(false);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");
  const [f, setF] = useState({
    maquina_id: "", motivo: "conserto" as MotivoTransferenciaMaquina,
    destinatario_pessoa_id: "", valor_bem: "", ncm: "84329000",
    data_retorno_prevista: "", observacao: "",
    motorista_id: "", motorista_nome: "", motorista_cpf: "",
  });

  // Modal Retorno
  const [modalRet, setModalRet] = useState<TransferenciaMaquina | null>(null);
  const [retSalvando, setRetSalvando] = useState(false);
  const [retErro, setRetErro] = useState("");

  useEffect(() => {
    if (!contaId || !fazendaId) return;
    (async () => {
      setLoading(true);
      const [t, m, p, { data: mot }] = await Promise.all([
        listarTransferenciasMaquinas(contaId),
        listarMaquinas(fazendaId),
        listarPessoasDaConta(fazendaId),
        supabase.from("motoristas").select("id, nome, cpf").eq("ativo", true),
      ]);
      setItens(t);
      setMaquinas(m);
      setPessoas(p);
      setMotoristas(mot ?? []);
      setLoading(false);
    })();
  }, [contaId, fazendaId]);

  function abrirNova() {
    setF({ maquina_id: "", motivo: "conserto", destinatario_pessoa_id: "", valor_bem: "", ncm: "84329000", data_retorno_prevista: "", observacao: "", motorista_id: "", motorista_nome: "", motorista_cpf: "" });
    setErro("");
    setModalNova(true);
  }

  async function emitirRemessa() {
    if (!fazendaId) return;
    const maquina = maquinas.find(m => m.id === f.maquina_id);
    const dest = pessoas.find(p => p.id === f.destinatario_pessoa_id);
    if (!maquina) { setErro("Selecione a máquina/equipamento."); return; }
    if (!dest) { setErro("Selecione o destinatário."); return; }
    const valor = parseFloat(f.valor_bem.replace(/\./g, "").replace(",", ".")) || 0;
    if (valor <= 0) { setErro("Informe o valor do bem."); return; }

    const motivoCfg = MOTIVOS[f.motivo];
    setSalvando(true);
    setErro("");
    try {
      // Emitente: titular fiscal da fazenda (mesmo padrão de Devolução/Remessa — resolve pelo
      // certificado configurado, sem precisar escolher módulo manualmente).
      const { data: fiscalMods } = await supabase
        .from("configuracoes_modulo")
        .select("modulo, config")
        .eq("fazenda_id", fazendaId)
        .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%");
      const moduloKey = fiscalMods?.[0]?.modulo ?? "";
      const cpfCnpjHint = (fiscalMods?.[0]?.config as Record<string, string> | undefined)?.cpf_cnpj_emitente;

      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: fazendaId,
          modulo_key: moduloKey,
          cpf_cnpj_hint: cpfCnpjHint,
          destinatario: {
            nome: dest.nome,
            cpf_cnpj: (dest.cpf_cnpj ?? "").replace(/\D/g, "") || undefined,
            ie: dest.inscricao_est || undefined,
            logradouro: dest.logradouro || undefined,
            numero: dest.numero || undefined,
            bairro: dest.bairro || undefined,
            municipio_ibge: dest.municipio_ibge || undefined,
            municipio_nome: dest.municipio || undefined,
            uf: dest.estado || undefined,
            cep: (dest.cep ?? "").replace(/\D/g, "") || undefined,
          },
          itens: [{
            descricao: maquina.nome, ncm: f.ncm, cfop: motivoCfg.cfopSaida,
            unidade: "UN", quantidade: 1, valor_unitario: valor,
          }],
          natureza: motivoCfg.natureza,
          inf_cpl: f.observacao || undefined,
          frete: "9",
          tipo: "1",
        }),
      });
      const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat?: string; xMotivo?: string };
      if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);

      const novo = await criarTransferenciaMaquina({
        fazenda_id: fazendaId,
        maquina_id: maquina.id,
        maquina_nome: maquina.nome,
        motivo: f.motivo,
        cfop_saida: motivoCfg.cfopSaida,
        cfop_retorno: motivoCfg.cfopRetorno ?? undefined,
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
        status: "emitida",
        emitente_cpf_cnpj: cpfCnpjHint,
        nf_saida_chave: res.chave,
        nf_saida_numero: res.numero,
        nf_saida_protocolo: res.protocolo,
        nf_saida_data: new Date().toISOString().split("T")[0],
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
    if (!modalRet || !fazendaId || !modalRet.cfop_retorno) return;
    const motivoCfg = MOTIVOS[modalRet.motivo];
    setRetSalvando(true);
    setRetErro("");
    try {
      const { data: fiscalMods } = await supabase
        .from("configuracoes_modulo")
        .select("modulo, config")
        .eq("fazenda_id", fazendaId)
        .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%");
      const moduloKey = fiscalMods?.[0]?.modulo ?? "";

      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: fazendaId,
          modulo_key: moduloKey,
          cpf_cnpj_hint: modalRet.emitente_cpf_cnpj,
          // Nota de entrada: emitida pela própria fazenda ao receber o bem de volta — o destinatário
          // do documento é a mesma contraparte da remessa original (quem devolveu o bem).
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
          natureza: motivoCfg.naturezaRetorno,
          inf_cpl: `Retorno da remessa NF ${modalRet.nf_saida_numero ?? ""} — chave ${modalRet.nf_saida_chave ?? ""}`,
          frete: "9",
          nfe_ref: modalRet.nf_saida_chave || undefined,
          tipo: "0",
        }),
      });
      const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat?: string; xMotivo?: string };
      if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);

      await atualizarTransferenciaMaquina(modalRet.id, {
        status: "retornada",
        nf_retorno_chave: res.chave,
        nf_retorno_numero: res.numero,
        nf_retorno_protocolo: res.protocolo,
        nf_retorno_data: new Date().toISOString().split("T")[0],
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
      <TopNav />
      <main style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Transferência de Máquinas e Equipamentos</h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: "4px 0 0" }}>Remessa e retorno de ativo imobilizado — conserto/manutenção externa, transferência entre fazendas, comodato/empréstimo</p>
          </div>
          <button style={btnV} onClick={abrirNova}>+ Nova Transferência</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Aguard. Retorno", value: String(totalEmitidas), bg: "#FBF3E0", cl: "#7A5C00" },
            { label: "Retornadas",      value: String(totalRetornadas), bg: "#E8F5E9", cl: "#1A6B3C" },
            { label: "Valor Total",     value: fmtBRL(valorTotal), bg: "#F4F6FA", cl: "#1a1a1a" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: k.cl, fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.cl }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por máquina, destinatário, nº NF…" style={{ ...inp, maxWidth: 320 }} />
          <select value={filtroSt} onChange={e => setFiltroSt(e.target.value)} style={{ ...inp, maxWidth: 180 }}>
            <option value="">Todos os status</option>
            <option value="emitida">Emitida</option>
            <option value="retornada">Retornada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-page)" }}>
                {["Máquina/Equip.", "Motivo", "Destinatário", "NF Remessa", "Valor", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Carregando…</td></tr>}
              {!loading && filtrados.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Nenhuma transferência encontrada.</td></tr>}
              {filtrados.map(i => {
                const sm = STATUS_BADGE[i.status];
                return (
                  <tr key={i.id} style={{ borderTop: "0.5px solid var(--border-table)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{i.maquina_nome}</td>
                    <td style={{ padding: "10px 12px" }}>{MOTIVOS[i.motivo].label}</td>
                    <td style={{ padding: "10px 12px" }}>{i.destinatario_nome}</td>
                    <td style={{ padding: "10px 12px" }}>{i.nf_saida_numero ? `${i.nf_saida_numero}` : "—"}<div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtData(i.nf_saida_data)}</div></td>
                    <td style={{ padding: "10px 12px" }}>{fmtBRL(i.valor_bem)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: sm.bg, color: sm.cl }}>{sm.label}</span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {i.status === "emitida" && i.cfop_retorno && (
                        <button onClick={() => { setModalRet(i); setRetErro(""); }} style={{ padding: "5px 12px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                          Registrar Retorno
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── Modal Nova Transferência ── */}
      {modalNova && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 640, margin: "0 20px" }}>
            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Nova Transferência de Máquina/Equipamento</div>
              <button onClick={() => setModalNova(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {erro && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{erro}</div>}

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Motivo</label>
                <select value={f.motivo} onChange={e => setF(p => ({ ...p, motivo: e.target.value as MotivoTransferenciaMaquina }))} style={inp}>
                  {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  CFOP de saída: <strong>{MOTIVOS[f.motivo].cfopSaida}</strong>
                  {MOTIVOS[f.motivo].cfopRetorno ? <> · Retorno: <strong>{MOTIVOS[f.motivo].cfopRetorno}</strong></> : <> · sem retorno (movimento definitivo)</>}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Máquina / Equipamento</label>
                <SelectBusca value={f.maquina_id} onChange={v => setF(p => ({ ...p, maquina_id: v }))}
                  placeholder="— Selecionar —" style={inp}
                  options={maquinas.map(m => ({ value: m.id, label: `${m.nome}${m.patrimonio ? ` · Patrim. ${m.patrimonio}` : ""}` }))} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Destinatário {f.motivo === "transferencia_fazenda" ? "(empresa/produtor da fazenda de destino)" : ""}</label>
                <SelectBusca value={f.destinatario_pessoa_id} onChange={v => setF(p => ({ ...p, destinatario_pessoa_id: v }))}
                  placeholder="— Selecionar —" style={inp}
                  options={pessoas.map(ps => ({ value: ps.id, label: `${ps.nome}${ps.cpf_cnpj ? " · " + ps.cpf_cnpj : ""}` }))} />
              </div>

              <div>
                <label style={lbl}>Valor do Bem (R$)</label>
                <input value={f.valor_bem} onChange={e => setF(p => ({ ...p, valor_bem: e.target.value }))} style={inp} placeholder="0,00" />
              </div>
              <div>
                <label style={lbl}>NCM</label>
                <input value={f.ncm} onChange={e => setF(p => ({ ...p, ncm: e.target.value.replace(/\D/g, "") }))} style={inp} maxLength={8} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Motorista (opcional)</label>
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

              {MOTIVOS[f.motivo].cfopRetorno && (
                <div>
                  <label style={lbl}>Retorno previsto</label>
                  <input type="date" value={f.data_retorno_prevista} onChange={e => setF(p => ({ ...p, data_retorno_prevista: e.target.value }))} style={inp} />
                </div>
              )}

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Observação</label>
                <textarea value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} style={{ ...inp, minHeight: 60, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ padding: "14px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalNova(false)}>Cancelar</button>
              <button onClick={emitirRemessa} disabled={salvando} style={{ ...btnV, cursor: salvando ? "default" : "pointer" }}>
                {salvando ? "Emitindo…" : "Emitir NF de Remessa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Registrar Retorno ── */}
      {modalRet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 460 }}>
            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Registrar Retorno</div>
              <button onClick={() => setModalRet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {retErro && <div style={{ marginBottom: 14, background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{retErro}</div>}
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>{modalRet.maquina_nome}</strong></div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>Destinatário original: {modalRet.destinatario_nome}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>NF de remessa: {modalRet.nf_saida_numero} — {fmtData(modalRet.nf_saida_data)}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>CFOP de retorno: <strong>{modalRet.cfop_retorno}</strong></div>
            </div>
            <div style={{ padding: "14px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalRet(null)}>Cancelar</button>
              <button onClick={emitirRetorno} disabled={retSalvando} style={{ ...btnV, background: "#1A6B3C", cursor: retSalvando ? "default" : "pointer" }}>
                {retSalvando ? "Emitindo…" : "Emitir NF de Retorno"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
