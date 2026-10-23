"use client";
// Seletor de veículo dos documentos de transporte (CT-e, MDF-e): escolhe o CONJUNTO (cavalo + implementos) ou um
// cavalo sem implemento. Devolve o que o documento grava — veiculo_id (o cavalo), conjunto_id e implemento_ids.
import { useEffect, useState } from "react";
import SelectField from "../SelectField";
import { supabase } from "../../lib/supabase";
import { opcoesVeiculoDocumento, resolverSelecao, valorSelecao, placasDoConjunto, type ConjuntoVeiculos, type SelecaoVeiculo, type VeiculoConjunto } from "../../lib/transporte/conjuntos";

type Props = {
  contaId: string | null;
  fazendaIds: string[];
  veiculos: VeiculoConjunto[];
  veiculoId: string;
  conjuntoId: string | null;
  implementoIds: string[];
  onChange: (sel: SelecaoVeiculo) => void;
  style?: React.CSSProperties;
};

export default function SeletorConjunto({ contaId, fazendaIds, veiculos, veiculoId, conjuntoId, implementoIds, onChange, style }: Props) {
  const [conjuntos, setConjuntos] = useState<ConjuntoVeiculos[]>([]);
  useEffect(() => {
    const q = supabase.from("conjuntos_veiculos").select("id, nome, cavalo_id, implemento_ids, ativo");
    (contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fazendaIds)).then(({ data }) =>
      setConjuntos(((data ?? []) as ConjuntoVeiculos[]).map(c => ({ ...c, implemento_ids: c.implemento_ids ?? [] }))));
  }, [contaId, fazendaIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = opcoesVeiculoDocumento(conjuntos, veiculos);
  const valor = valorSelecao(veiculoId, conjuntoId);
  // Documento salvo com um conjunto já desmontado (ou veículo inativo): mostra o que ele guarda, sem trocar sozinho.
  const atualForaDaLista = valor && !opcoes.some(o => o.valor === valor);
  const pecas = [veiculoId, ...implementoIds].map(id => veiculos.find(v => v.id === id)).filter((v): v is VeiculoConjunto => !!v);

  return (
    <div>
      <SelectField value={valor} style={style}
        onChange={e => onChange(resolverSelecao(e.target.value, conjuntos))}>
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
      </SelectField>
      {pecas.length > 1 && (
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
          {pecas.map((v, i) => (i === 0 ? `Cavalo ${v.placa}` : `${i}º ${v.placa}`)).join(" · ")}
        </div>
      )}
    </div>
  );
}
