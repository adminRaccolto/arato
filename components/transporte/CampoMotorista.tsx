"use client";
// Motorista dos documentos de transporte (CT-e, MDF-e): escolhe um motorista cadastrado (o CPF vem do cadastro) ou digita
// nome e CPF de quem não tem cadastro — os dois ficam gravados no documento (motorista_nome / motorista_cpf).
import type { CSSProperties } from "react";

export type MotoristaOpcao = { id: string; nome: string; cpf?: string | null };
export type MotoristaValor = { motorista_id: string; motorista_nome: string; motorista_cpf: string };

const fmtCpf = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d; };

export default function CampoMotorista({ id, motoristas, valor, onChange, style }: {
  id: string; motoristas: MotoristaOpcao[]; valor: MotoristaValor; onChange: (v: MotoristaValor) => void;
  style?: CSSProperties;
}) {
  const cadastrado = motoristas.find(m => m.id === valor.motorista_id);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 6 }}>
      <div>
        <input list={id} value={valor.motorista_nome} style={style} placeholder="Escolha da lista ou digite o nome"
          onChange={e => {
            const nome = e.target.value;
            const achado = motoristas.find(m => m.nome.trim().toUpperCase() === nome.trim().toUpperCase());
            onChange({ motorista_nome: nome, motorista_id: achado?.id ?? "", motorista_cpf: achado?.cpf ?? (valor.motorista_id ? "" : valor.motorista_cpf) });
          }} />
        <datalist id={id}>{motoristas.map(m => <option key={m.id} value={m.nome} />)}</datalist>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{cadastrado ? "Do cadastro de motoristas" : valor.motorista_nome.trim() ? "Sem cadastro — informe o CPF ao lado" : ""}</div>
      </div>
      <div>
        <input value={fmtCpf(valor.motorista_cpf ?? "")} readOnly={!!cadastrado} placeholder="CPF *"
          style={{ ...style, fontFamily: "monospace", ...(cadastrado ? { background: "var(--bg-page)", color: "var(--text-2)" } : {}), ...(!cadastrado && valor.motorista_nome.trim() && (valor.motorista_cpf ?? "").replace(/\D/g, "").length !== 11 ? { borderColor: "#C9921B" } : {}) }}
          onChange={e => onChange({ ...valor, motorista_cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
      </div>
    </div>
  );
}
