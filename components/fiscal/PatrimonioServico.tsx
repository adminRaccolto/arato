"use client";
import { useEffect, useState } from "react";
import { listarMaquinas } from "../../lib/db";
import type { Maquina } from "../../lib/supabase";
import { rotuloPatrimonioServico } from "../../lib/fiscal/servico-maquina";
import SelectBusca from "../SelectBusca";

export default function PatrimonioServico({ fazendaId, value, onChange, disabled }: {
  fazendaId: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [consulta, setConsulta] = useState<{ fazenda: string; maquinas: Maquina[]; erro: string } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    void listarMaquinas(fazendaId).then(maquinas => {
      if (ativo) setConsulta({ fazenda: fazendaId, maquinas, erro: "" });
    }).catch(() => { if (ativo) setConsulta({ fazenda: fazendaId, maquinas: [], erro: "Não foi possível carregar os patrimônios." }); });
    return () => { ativo = false; };
  }, [fazendaId, tentativa]);
  const atual = consulta?.fazenda === fazendaId ? consulta : null;
  const opcoes = (atual?.maquinas ?? []).map(m => ({ value: m.id, label: rotuloPatrimonioServico(m) }));
  if (value && !opcoes.some(o => o.value === value)) opcoes.push({ value, label: "Patrimônio vinculado (fora do cadastro disponível)" });
  return <div data-servico-patrimonio="true" style={{ gridColumn: "1 / -1" }}>
    <div style={{ fontSize: 11, marginBottom: 4 }}>Patrimônio (máquina)</div>
    <SelectBusca value={value} onChange={onChange} options={opcoes} disabled={disabled || !atual || !!atual.erro}
      placeholder={atual ? "Selecionar patrimônio para apropriação…" : "Carregando patrimônios…"}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border-table)", borderRadius: 8, background: "var(--bg-input)", fontSize: 13 }} />
    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 5 }}>Ao processar, o custo do serviço será registrado nesta máquina, no mesmo histórico de apropriação da NF de produtos.</div>
    {atual?.erro && <div role="alert">{atual.erro} <button type="button" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button></div>}
  </div>;
}
