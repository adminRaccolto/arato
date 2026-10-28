"use client";
// Seletor de veículo dos documentos de transporte (CT-e, MDF-e): escolhe o CONJUNTO (cavalo + implementos), um cavalo
// sem implemento, ou "digitar sem cadastro" (placas, UF, tara e capacidade lançadas no próprio documento). Devolve o que
// o documento grava — veiculo_id (o cavalo), conjunto_id e implemento_ids; no modo digitado, veiculo_manual.
import { useEffect, useState, type CSSProperties } from "react";
import SelectField from "../SelectField";
import { supabase } from "../../lib/supabase";
import {
  opcoesVeiculoDocumento, resolverSelecao, valorSelecao, placasDoConjunto, MAX_IMPLEMENTOS, VEICULO_MANUAL_VAZIO,
  type ConjuntoVeiculos, type SelecaoVeiculo, type VeiculoConjunto, type VeiculoManual, type PecaManual,
} from "../../lib/transporte/conjuntos";

type Props = {
  contaId: string | null;
  fazendaIds: string[];
  veiculos: VeiculoConjunto[];
  veiculoId: string;
  conjuntoId: string | null;
  implementoIds: string[];
  onChange: (sel: SelecaoVeiculo) => void;
  style?: CSSProperties;
  /** Veículo digitado sem cadastro: quando informado, o seletor mostra os campos de placa/UF/tara. */
  manual?: VeiculoManual | null;
  onManual?: (m: VeiculoManual | null) => void;
  /** MDF-e exige UF, tara e capacidade; o CT-e só as placas. */
  exigeMdfe?: boolean;
};

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export default function SeletorConjunto({ contaId, fazendaIds, veiculos, veiculoId, conjuntoId, implementoIds, onChange, style, manual, onManual, exigeMdfe }: Props) {
  const [conjuntos, setConjuntos] = useState<ConjuntoVeiculos[]>([]);
  useEffect(() => {
    const q = supabase.from("conjuntos_veiculos").select("id, nome, cavalo_id, implemento_ids, ativo");
    (contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fazendaIds)).then(({ data }) =>
      setConjuntos(((data ?? []) as ConjuntoVeiculos[]).map(c => ({ ...c, implemento_ids: c.implemento_ids ?? [] }))));
  }, [contaId, fazendaIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = opcoesVeiculoDocumento(conjuntos, veiculos);
  const valor = manual ? "manual" : valorSelecao(veiculoId, conjuntoId);
  // Documento salvo com um conjunto já desmontado (ou veículo inativo): mostra o que ele guarda, sem trocar sozinho.
  const atualForaDaLista = !manual && valor && !opcoes.some(o => o.valor === valor);
  const pecas = [veiculoId, ...implementoIds].map(id => veiculos.find(v => v.id === id)).filter((v): v is VeiculoConjunto => !!v);

  const escolher = (v: string) => {
    if (v === "manual") { onChange({ veiculo_id: "", conjunto_id: null, implemento_ids: [] }); onManual?.({ ...VEICULO_MANUAL_VAZIO, reboques: [] }); return; }
    onManual?.(null);
    onChange(resolverSelecao(v, conjuntos));
  };
  const setCavalo = (c: Partial<PecaManual>) => manual && onManual?.({ ...manual, cavalo: { ...manual.cavalo, ...c } });
  const setReboque = (i: number, r: Partial<PecaManual>) => manual && onManual?.({ ...manual, reboques: manual.reboques.map((x, j) => j === i ? { ...x, ...r } : x) });
  const inpP: CSSProperties = { ...style, padding: "6px 8px", fontSize: 12 };
  const lblP: CSSProperties = { fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 2 };

  return (
    <div>
      <SelectField value={valor} style={style} onChange={e => escolher(e.target.value)}>
        <option value="">— Selecionar conjunto ou veículo —</option>
        {atualForaDaLista && <option value={valor}>{placasDoConjunto({ cavalo_id: veiculoId, implemento_ids: implementoIds }, veiculos)} (salvo no documento)</option>}
        {opcoes.some(o => o.grupo === "conjunto") && (
          <optgroup label="Conjuntos (cavalo + implementos)">
            {opcoes.filter(o => o.grupo === "conjunto").map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </optgroup>
        )}
        <optgroup label="Veículo sem implemento">
          {opcoes.filter(o => o.grupo === "veiculo").map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </optgroup>
        {onManual && <optgroup label="Sem cadastro"><option value="manual">✎ Digitar placas (conjunto sem cadastro)</option></optgroup>}
      </SelectField>
      {!manual && pecas.length > 1 && (
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
          {pecas.map((v, i) => (i === 0 ? `Cavalo ${v.placa}` : `${i}º ${v.placa}`)).join(" · ")}
        </div>
      )}
      {manual && (
        <div style={{ marginTop: 6, padding: 8, border: "0.5px dashed var(--border-table)", borderRadius: 8, display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 1fr", gap: 6 }}>
            <div><label style={lblP}>Cavalo — placa *</label><input style={{ ...inpP, textTransform: "uppercase" }} value={manual.cavalo.placa} maxLength={8} onChange={e => setCavalo({ placa: e.target.value.toUpperCase() })} placeholder="ex.: ABC1D23" /></div>
            <div><label style={lblP}>UF{exigeMdfe ? " *" : ""}</label><select style={inpP} value={manual.cavalo.uf} onChange={e => setCavalo({ uf: e.target.value })}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
            <div><label style={lblP}>Tara (kg){exigeMdfe ? " *" : ""}</label><input style={inpP} inputMode="numeric" value={manual.cavalo.tara_kg} onChange={e => setCavalo({ tara_kg: e.target.value.replace(/\D/g, "") })} placeholder="ex.: 9000" /></div>
          </div>
          {manual.reboques.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
              <div><label style={lblP}>{i + 1}ª carreta — placa *</label><input style={{ ...inpP, textTransform: "uppercase" }} value={r.placa} maxLength={8} onChange={e => setReboque(i, { placa: e.target.value.toUpperCase() })} placeholder="ex.: BEV3H24" /></div>
              <div><label style={lblP}>UF</label><select style={inpP} value={r.uf} onChange={e => setReboque(i, { uf: e.target.value })}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
              <div><label style={lblP}>Tara (kg){exigeMdfe ? " *" : ""}</label><input style={inpP} inputMode="numeric" value={r.tara_kg} onChange={e => setReboque(i, { tara_kg: e.target.value.replace(/\D/g, "") })} /></div>
              <div><label style={lblP}>Capacidade (kg){exigeMdfe ? " *" : ""}</label><input style={inpP} inputMode="numeric" value={r.cap_kg ?? ""} onChange={e => setReboque(i, { cap_kg: e.target.value.replace(/\D/g, "") })} /></div>
              <button type="button" onClick={() => onManual?.({ ...manual, reboques: manual.reboques.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: "#B91C1C", cursor: "pointer", fontSize: 16 }} title="Tirar carreta">×</button>
            </div>
          ))}
          {manual.reboques.length < MAX_IMPLEMENTOS && (
            <button type="button" onClick={() => onManual?.({ ...manual, reboques: [...manual.reboques, { placa: "", uf: manual.cavalo.uf, tara_kg: "", cap_kg: "" }] })}
              style={{ justifySelf: "start", border: "0.5px solid var(--border-table)", background: "transparent", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>+ carreta</button>
          )}
        </div>
      )}
    </div>
  );
}
