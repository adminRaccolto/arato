"use client";
// Quadro de Avisos da tela inicial: vencimento das certidões (CND) dos produtores e do certificado digital A1.
// Mostra vencidos e os que vencem em até 30 dias; o controle completo fica em Fiscal → Certidões (CND).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";
import { supabase } from "../../lib/supabase";
import { listarProdutoresDaConta } from "../../lib/db";
import { hojeLocal } from "../../lib/data-local";
import { montarAvisos, semCndFederal, textoDias, type Aviso, type Certidao, type CertificadoA1, type SituacaoVenc } from "../../lib/fiscal/certidoes";

const COR: Record<SituacaoVenc, string> = { vencida: "#E24B4A", vence_15: "#EF9F27", vence_30: "#C9921B", em_dia: "#16A34A" };
const fmtData = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

export default function QuadroAvisos() {
  const { contaId, fazendaIds } = useAuth();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [emDia, setEmDia] = useState(0);
  const [semFederal, setSemFederal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState(false);

  useEffect(() => {
    if (!contaId) return;
    let ativo = true;
    Promise.all([
      listarProdutoresDaConta(contaId).catch(() => []),
      supabase.from("produtor_certidoes").select("*").eq("conta_id", contaId).order("id").range(0, 4999),
      fazendaIds?.length
        ? fetch(`/api/cert-meta?fazenda_ids=${fazendaIds.join(",")}`).then(r => r.json()).then(j => (j.certs ?? []) as CertificadoA1[]).catch(() => [] as CertificadoA1[])
        : Promise.resolve([] as CertificadoA1[]),
    ]).then(([prods, cert, certs]) => {
      if (!ativo) return;
      const certidoes = cert.error ? [] : (cert.data ?? []) as Certidao[];
      setIndisponivel(!!cert.error);
      const nomes = new Map(prods.map(p => [p.id, p.nome]));
      const r = montarAvisos(certidoes, certs, id => nomes.get(id) ?? "", hojeLocal());
      setAvisos(r.avisos); setEmDia(r.emDia);
      setSemFederal(cert.error ? 0 : semCndFederal(prods.map(p => p.id), certidoes).length);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [contaId, fazendaIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="native-home-panel" style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
      <div className="native-home-section-heading" style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span role="heading" aria-level={2} style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>Quadro de Avisos · CND e Certificado Digital</span>
        <Link href="/fiscal/certidoes" style={{ fontSize: 11, color: "var(--text-3)", textDecoration: "none", whiteSpace: "nowrap" }}>Controle →</Link>
      </div>
      {carregando ? (
        <div style={{ padding: "14px 20px", fontSize: 12, color: "var(--text-3)" }}>Verificando vencimentos…</div>
      ) : (
        <>
          {avisos.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px" }}>
              <span style={{ color: "#16A34A", fontSize: 15 }}>✓</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
                {emDia > 0 ? `Nenhum vencimento nos próximos 30 dias · ${emDia} em dia` : "Nenhuma certidão ou certificado cadastrado"}
              </span>
            </div>
          ) : avisos.map(a => (
            <Link className="native-home-alert" data-urgency={a.situacao === "vencida" ? "critico" : a.situacao === "vence_15" ? "alto" : "medio"} key={a.id}
              href={a.tipo === "certificado" ? "/fiscal?aba=certificado" : `/fiscal/certidoes${a.produtorId ? "?produtor=" + a.produtorId : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px", borderBottom: "0.5px solid var(--border-table)", borderLeft: `3px solid ${COR[a.situacao]}`, textDecoration: "none", background: "var(--bg-card)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: COR[a.situacao], letterSpacing: ".05em", textTransform: "uppercase", flexShrink: 0, padding: "2px 7px", borderRadius: 5, background: COR[a.situacao] + "14", whiteSpace: "nowrap" }}>
                {a.tipo === "certificado" ? "Certificado" : "CND"}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-2)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b style={{ color: "var(--text-1)", fontWeight: 600 }}>{a.produtor}</b> · {a.titulo} · {textoDias(a.dias)} ({fmtData(a.validade)})
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{a.situacao === "vencida" ? "renovar →" : "ver →"}</span>
            </Link>
          ))}
          {(semFederal > 0 || indisponivel || (avisos.length > 0 && emDia > 0)) && (
            <div style={{ padding: "8px 20px", fontSize: 11, color: "var(--text-3)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              {avisos.length > 0 && emDia > 0 && <span>{emDia} em dia</span>}
              {semFederal > 0 && <Link href="/fiscal/certidoes" style={{ color: "#C9921B", textDecoration: "none", fontWeight: 600 }}>{semFederal} produtor{semFederal > 1 ? "es" : ""} sem CND Federal cadastrada</Link>}
              {indisponivel && <span>Certidões indisponíveis — cadastro ainda não ativado.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
