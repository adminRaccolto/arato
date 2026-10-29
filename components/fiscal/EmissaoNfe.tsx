"use client";
// Peças comuns da emissão de NF-e fora da tela de Notas de Venda (Remessas, Retornos, máquinas): emitentes fiscais da
// conta, transportadoras/veículos/motoristas e o bloco Transporte (frete, transportadora, veículo/placa, motorista).
// O bloco nasceu na Transferência de Máquinas (27/10/2026) e passou a ser compartilhado para não repetir código.
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";

export type EmitenteFiscal = { modulo: string; fazenda_id: string; cpf: string; nome: string; ie: string };
export type Transp = { frete: "0" | "1" | "2" | "9"; transportadora_id: string; veiculo_id: string; placa: string; uf_placa: string; motorista_nome: string; motorista_cpf: string };
export const TRANSP_VAZIO: Transp = { frete: "0", transportadora_id: "", veiculo_id: "", placa: "", uf_placa: "", motorista_nome: "", motorista_cpf: "" };
type TransportadoraOp = { id: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; cpf: string | null; ie: string | null; rntrc: string | null; logradouro: string | null; numero: string | null; municipio: string | null; uf: string | null };
type VeiculoOp = { id: string; placa: string; uf_placa: string | null; uf: string | null; rntrc: string | null; transportadora_id: string | null; motorista_habitual_id: string | null; modelo: string | null };
type MotoristaOp = { id: string; nome: string; cpf?: string };
/** Inscrição estadual (estabelecimento) de um emitente PF/PJ, com a série NF-e configurada para ela em Parâmetros → Fiscal. */
export type InscricaoEmissao = { id: string; cpf: string; ie: string; municipio: string; fazenda_id: string | null; serie: string };
export type DadosEmissao = { emitentes: EmitenteFiscal[]; transportadoras: TransportadoraOp[]; veiculos: VeiculoOp[]; motoristas: MotoristaOp[]; inscricoes: InscricaoEmissao[] };

/** Emitentes fiscais (módulos fiscal_pf_/fiscal_emp_, sem repetir CPF/CNPJ+IE) e cadastros de transporte do cliente. */
export function useDadosEmissao(fazendaIds: string[], contaId: string | null | undefined): DadosEmissao {
  const [d, setD] = useState<DadosEmissao>({ emitentes: [], transportadoras: [], veiculos: [], motoristas: [], inscricoes: [] });
  const chave = fazendaIds.join(",");
  useEffect(() => {
    if (!fazendaIds.length) return;
    const doCliente = [...(contaId ? [`conta_id.eq.${contaId}`] : []), `fazenda_id.in.(${fazendaIds.join(",")})`].join(",");
    Promise.all([
      supabase.from("configuracoes_modulo").select("modulo, fazenda_id, config").in("fazenda_id", fazendaIds).or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%"),
      supabase.from("transportadoras").select("id, razao_social, nome_fantasia, cnpj, cpf, ie, rntrc, logradouro, numero, municipio, uf").or(doCliente).neq("ativa", false).order("razao_social"),
      supabase.from("veiculos").select("id, placa, uf_placa, uf, rntrc, transportadora_id, motorista_habitual_id, modelo").or(doCliente).neq("ativo", false).order("placa"),
      supabase.from("motoristas").select("id, nome, cpf").or(doCliente).eq("ativo", true).order("nome"),
      supabase.from("produtor_inscricoes_estaduais").select("id, inscricao_estadual, fazenda_id, municipio, produtores!inner(cpf_cnpj, fazenda_id)").eq("ativa", true),
    ]).then(([em, tr, ve, mo, ins]) => {
      // Série por IE: módulos "<emitente>__ie_<id>" (config por estabelecimento)
      const seriePorIe = new Map<string, string>();
      for (const r of (em.data ?? []) as { modulo: string; config: Record<string, string> | null }[]) {
        const ieId = r.modulo.split("__ie_")[1];
        if (ieId && r.config?.serie_nfe && !seriePorIe.has(ieId)) seriePorIe.set(ieId, String(r.config.serie_nfe));
      }
      type InsRow = { id: string; inscricao_estadual: string; fazenda_id: string | null; municipio: string | null; produtores: { cpf_cnpj: string | null; fazenda_id: string | null } | { cpf_cnpj: string | null; fazenda_id: string | null }[] | null };
      const vistosIe = new Set<string>();
      const inscricoes: InscricaoEmissao[] = [];
      for (const r of (ins.data ?? []) as InsRow[]) {
        const pr = Array.isArray(r.produtores) ? r.produtores[0] : r.produtores;
        if (!pr || (pr.fazenda_id && !fazendaIds.includes(pr.fazenda_id))) continue;
        const k = `${(pr.cpf_cnpj ?? "").replace(/\D/g, "")}|${r.inscricao_estadual.replace(/\D/g, "")}`;
        if (vistosIe.has(k)) continue;
        vistosIe.add(k);
        inscricoes.push({ id: r.id, cpf: (pr.cpf_cnpj ?? "").replace(/\D/g, ""), ie: r.inscricao_estadual, municipio: r.municipio ?? "", fazenda_id: r.fazenda_id, serie: seriePorIe.get(r.id) ?? "" });
      }
      const lista = ((em.data ?? []) as { modulo: string; fazenda_id: string; config: Record<string, string> | null }[])
        .filter(r => r.config?.cpf_cnpj_emitente)
        .map(r => ({ modulo: r.modulo, fazenda_id: r.fazenda_id, cpf: r.config!.cpf_cnpj_emitente, nome: r.config!.razao_social || r.modulo, ie: r.config!.ie_emitente || "" }));
      const vistos = new Set<string>();
      setD({
        emitentes: lista.filter(e => { const k = `${e.cpf.replace(/\D/g, "")}|${e.ie.replace(/\D/g, "")}`; if (vistos.has(k)) return false; vistos.add(k); return true; }),
        transportadoras: (tr.data ?? []) as TransportadoraOp[], veiculos: (ve.data ?? []) as VeiculoOp[], motoristas: (mo.data ?? []) as MotoristaOp[],
        inscricoes,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, contaId]);
  return d;
}

/** Emitente: o escolhido; senão o do CPF/CNPJ indicado (ex.: dono da NF de origem); senão o único configurado. */
export function resolverEmitente(emitentes: EmitenteFiscal[], escolhido: string, cpfHint?: string | null): EmitenteFiscal | { erro: string } {
  if (escolhido) { const e = emitentes.find(x => `${x.modulo}|${x.fazenda_id}` === escolhido); if (e) return e; }
  const dig = (cpfHint ?? "").replace(/\D/g, "");
  if (dig) { const e = emitentes.find(x => x.cpf.replace(/\D/g, "") === dig); if (e) return e; }
  if (emitentes.length === 1) return emitentes[0];
  return { erro: emitentes.length === 0 ? "Nenhum emitente fiscal configurado em Parâmetros → Fiscal." : "Escolha o Emitente da NF." };
}

/**
 * IE sugerida para emitir pela fazenda da operação (ex.: fazenda do depósito de origem): a IE dessa fazenda com série
 * configurada; senão a única IE com série. Sem isso o servidor escolhia pela fazenda do emitente e podia cair numa IE sem
 * série (achado real 29/10/2026: remessa do Dirceu Ogliari saiu pela IE da Fazenda Frei Galvão, sem série → erro "Série """).
 */
export function ieSugerida(ies: InscricaoEmissao[], fazendaId?: string | null, cpf?: string | null): InscricaoEmissao | null {
  const dig = (cpf ?? "").replace(/\D/g, "");
  const cand = dig ? ies.filter(i => i.cpf === dig) : ies;
  const comSerie = cand.filter(i => i.serie);
  return comSerie.find(i => i.fazenda_id === fazendaId) ?? cand.find(i => i.fazenda_id === fazendaId)
    ?? (comSerie.length === 1 ? comSerie[0] : null) ?? (cand.length === 1 ? cand[0] : null);
}

/** Seletor da IE (estabelecimento) emitente — mostra a série configurada de cada uma. */
export function SeletorIE({ ies, value, onChange, inp, lbl }: { ies: InscricaoEmissao[]; value: string; onChange: (id: string) => void; inp: CSSProperties; lbl: CSSProperties }) {
  if (ies.length <= 1 && !ies.some(i => !i.serie)) return null;
  const sel = ies.find(i => i.id === value);
  return (
    <div>
      <label style={lbl}>IE emitente (estabelecimento)</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
        <option value="">— escolher a IE —</option>
        {ies.map(i => <option key={i.id} value={i.id}>IE {i.ie}{i.municipio ? ` · ${i.municipio}` : ""} · {i.serie ? `série ${i.serie}` : "sem série"}</option>)}
      </select>
      {sel && !sel.serie && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 3 }}>Esta IE não tem série NF-e configurada (Parâmetros → Fiscal → Inscrições Estaduais).</div>}
    </div>
  );
}

/** Bloco <transp> da NF-e e o texto do motorista (a NF-e não tem campo de motorista: vai nas informações complementares). */
export function montarTransporte(d: DadosEmissao, t: Transp) {
  const tr = d.transportadoras.find(x => x.id === t.transportadora_id);
  const veic = d.veiculos.find(x => x.id === t.veiculo_id);
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
  const motorista = t.motorista_nome.trim() ? `Motorista: ${t.motorista_nome.trim()}${t.motorista_cpf.trim() ? ` — CPF ${t.motorista_cpf.trim()}` : ""}` : "";
  return { transporte, motorista };
}

export function BlocoTransporte({ d, t, set, inp, lbl }: {
  d: DadosEmissao; t: Transp; set: (fn: (p: Transp) => Transp) => void; inp: CSSProperties; lbl: CSSProperties;
}) {
  const escolherVeiculo = (id: string) => {
    const v = d.veiculos.find(x => x.id === id);
    const mot = v?.motorista_habitual_id ? d.motoristas.find(m => m.id === v.motorista_habitual_id) : undefined;
    set(p => ({
      ...p, veiculo_id: id, placa: v?.placa ?? p.placa, uf_placa: v?.uf_placa ?? v?.uf ?? p.uf_placa,
      transportadora_id: v?.transportadora_id || p.transportadora_id,
      ...(mot && !p.motorista_nome ? { motorista_nome: mot.nome, motorista_cpf: mot.cpf ?? "" } : {}),
    }));
  };
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Transporte</div>
      <div>
        <label style={lbl}>Frete por conta</label>
        <select value={t.frete} onChange={e => set(p => ({ ...p, frete: e.target.value as Transp["frete"] }))} style={inp}>
          <option value="0">0 — Remetente (emitente)</option>
          <option value="1">1 — Destinatário</option>
          <option value="2">2 — Terceiros</option>
          <option value="9">9 — Sem transporte</option>
        </select>
      </div>
      <div>
        <label style={lbl}>Transportadora (opcional)</label>
        <select value={t.transportadora_id} onChange={e => set(p => ({ ...p, transportadora_id: e.target.value }))} style={inp}>
          <option value="">— Própria / sem transportadora —</option>
          {d.transportadoras.map(x => <option key={x.id} value={x.id}>{x.razao_social || x.nome_fantasia}{x.cnpj || x.cpf ? ` · ${x.cnpj || x.cpf}` : ""}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Veículo</label>
        <select value={t.veiculo_id} onChange={e => escolherVeiculo(e.target.value)} style={inp}>
          <option value="">— Digitar a placa —</option>
          {d.veiculos.map(v => <option key={v.id} value={v.id}>{v.placa}{v.modelo ? ` · ${v.modelo}` : ""}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8 }}>
        <div>
          <label style={lbl}>Placa</label>
          <input value={t.placa} disabled={!!t.veiculo_id} onChange={e => set(p => ({ ...p, placa: e.target.value.toUpperCase() }))} style={inp} placeholder="ABC1D23" maxLength={8} />
        </div>
        <div>
          <label style={lbl}>UF</label>
          <input value={t.uf_placa} disabled={!!t.veiculo_id} onChange={e => set(p => ({ ...p, uf_placa: e.target.value.toUpperCase() }))} style={inp} placeholder="MT" maxLength={2} />
        </div>
      </div>
      <div>
        <label style={lbl}>Motorista</label>
        <input list="emissao-nfe-motoristas" value={t.motorista_nome}
          onChange={e => { const nome = e.target.value; const m = d.motoristas.find(x => x.nome === nome); set(p => ({ ...p, motorista_nome: nome, motorista_cpf: m?.cpf ?? p.motorista_cpf })); }}
          style={inp} placeholder="Nome do motorista" />
        <datalist id="emissao-nfe-motoristas">{d.motoristas.map(m => <option key={m.id} value={m.nome} />)}</datalist>
      </div>
      <div>
        <label style={lbl}>CPF do motorista</label>
        <input value={t.motorista_cpf} onChange={e => set(p => ({ ...p, motorista_cpf: e.target.value }))} style={inp} />
      </div>
      <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)" }}>Transportadora e veículo saem no XML e no DANFE; o motorista vai nas informações complementares da NF-e.</div>
    </div>
  );
}
