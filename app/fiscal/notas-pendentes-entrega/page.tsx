"use client";
// Notas enviadas para aprovação ao dar entrada: já estão no Contas a Pagar, mas o estoque só entra quando
// alguém confirma aqui que a mercadoria chegou na fazenda. Só nas contas com o módulo nf_confirmacao_entrega.
import { useCallback, useEffect, useState } from "react";
import TopNav from "../../../components/TopNav";
import InputData from "../../../components/InputData";
import { useAuth } from "../../../components/AuthProvider";
import { OperationalButton, OperationalGrid, OperationalHeading } from "../../../components/OperationalUI";
import { supabase } from "../../../lib/supabase";
import type { NfEntrada, NfEntradaItem } from "../../../lib/supabase";
import { confirmarEntregaNf, listarFazendasDaConta, listarNfEntradaItens } from "../../../lib/db";
import { hojeLocal } from "../../../lib/data-local";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const diasDesde = (s?: string | null) => s ? Math.max(0, Math.floor((new Date(`${hojeLocal()}T12:00:00`).getTime() - new Date(`${s.slice(0, 10)}T12:00:00`).getTime()) / 86400000)) : 0;

const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "var(--text-1)", borderBottom: "0.5px solid var(--border-row)" };

export default function NotasPendentesEntrega() {
  const { fazendaIds, contaId, nomeUsuario, contaModulosOverrides } = useAuth();
  const ativo = contaModulosOverrides["nf_confirmacao_entrega"] === true;
  const [notas, setNotas] = useState<NfEntrada[]>([]);
  const [fazendas, setFazendas] = useState<Map<string, string>>(new Map());
  const [depositos, setDepositos] = useState<Map<string, string>>(new Map());
  const [itens, setItens] = useState<Record<string, NfEntradaItem[]>>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState<NfEntrada | null>(null);
  const [dataEntrega, setDataEntrega] = useState(hojeLocal());
  const [gravando, setGravando] = useState(false);
  const idsChave = (fazendaIds ?? []).join(",");

  const carregar = useCallback(async () => {
    const ids = idsChave ? idsChave.split(",") : [];
    if (!ids.length) { setNotas([]); setCarregando(false); return; }
    setCarregando(true); setErro("");
    const { data, error } = await supabase.from("nf_entradas").select("*")
      .in("fazenda_id", ids).eq("status", "processada").eq("entrega_status", "pendente")
      .order("data_emissao").order("id");
    if (error) setErro(error.code === "42703" ? "Rode a Seção 409 do supabase_migrations.sql para usar este painel." : error.message);
    setNotas((data ?? []) as NfEntrada[]);
    const [fzs, deps] = await Promise.all([
      listarFazendasDaConta(contaId, ids[0]),
      supabase.from("depositos").select("id, nome").in("fazenda_id", ids),
    ]);
    setFazendas(new Map(fzs.map(f => [f.id, f.nome])));
    setDepositos(new Map(((deps.data ?? []) as { id: string; nome: string }[]).map(d => [d.id, d.nome])));
    setCarregando(false);
  }, [idsChave, contaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function alternarItens(nf: NfEntrada) {
    if (aberta === nf.id) { setAberta(null); return; }
    setAberta(nf.id);
    if (!itens[nf.id]) {
      const lista = await listarNfEntradaItens(nf.id);
      setItens(p => ({ ...p, [nf.id]: lista }));
    }
  }

  async function confirmar() {
    if (!confirmando) return;
    setGravando(true); setErro("");
    try {
      await confirmarEntregaNf(confirmando.id, dataEntrega, nomeUsuario);
      setNotas(p => p.filter(n => n.id !== confirmando.id));
      setConfirmando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
      setConfirmando(null);
    } finally { setGravando(false); }
  }

  const total = notas.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <OperationalHeading style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Notas Pendentes de Confirmação</h1>
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>
            {notas.length} {notas.length === 1 ? "nota" : "notas"} · {fmtBRL(total)} já no Contas a Pagar, fora do estoque
          </span>
        </OperationalHeading>

        {!ativo && !carregando && notas.length === 0 && (
          <div style={{ padding: "10px 14px", background: "#FBF3E0", borderRadius: 8, fontSize: 12, color: "#7A5200" }}>
            A opção Enviar para Aprovação não está ativa nesta conta. A ativação fica em Admin Raccolto → Módulos.
          </div>
        )}
        {erro && <div style={{ padding: "10px 14px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, fontSize: 12, color: "#791F1F" }}>{erro}</div>}

        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "auto" }}>
          <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["NF / Série", "Fornecedor", "Fazenda", "Emissão", "Aguardando", "Valor", ""].map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)" }}>Carregando…</td></tr>
              ) : notas.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 36 }}>Nenhuma nota aguardando confirmação de entrega.</td></tr>
              ) : notas.map(nf => {
                const dias = diasDesde(nf.data_entrada ?? nf.data_emissao);
                return (
                  <NotaLinha key={nf.id} nf={nf} dias={dias} fazenda={fazendas.get(nf.fazenda_id) ?? "—"} aberta={aberta === nf.id}
                    itens={itens[nf.id]} depositos={depositos}
                    onItens={() => alternarItens(nf)} onConfirmar={() => { setDataEntrega(hojeLocal()); setConfirmando(nf); }} />
                );
              })}
            </tbody>
          </OperationalGrid>
        </div>
      </div>

      {confirmando && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 22, width: 440, maxWidth: "calc(100vw - 32px)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>Confirmar entrega — NF {confirmando.numero}</div>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>
              {confirmando.emitente_nome} · {fmtBRL(Number(confirmando.valor_total ?? 0))}. Os itens entram no estoque nesta data. O Contas a Pagar não muda.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label data-arato-label="true" style={{ fontSize: 11, color: "var(--text-2)" }}>Data da entrega na fazenda</label>
              <InputData type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} style={{ padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <OperationalButton data-arato-button="secondary" disabled={gravando} onClick={() => setConfirmando(null)}
                style={{ padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" disabled={gravando || !dataEntrega} onClick={confirmar}
                style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#C9921B", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {gravando ? "Lançando estoque…" : "Confirmar entrega"}
              </OperationalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotaLinha({ nf, dias, fazenda, aberta, itens, depositos, onItens, onConfirmar }: {
  nf: NfEntrada; dias: number; fazenda: string; aberta: boolean; itens?: NfEntradaItem[]; depositos: Map<string, string>;
  onItens: () => void; onConfirmar: () => void;
}) {
  return (
    <>
      <tr>
        <td style={{ ...td, fontWeight: 600 }}>{nf.numero} <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>Série {nf.serie}</span></td>
        <td style={td}>{nf.emitente_nome}</td>
        <td style={td}>{fazenda}</td>
        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(nf.data_emissao)}</td>
        <td style={td}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 10, whiteSpace: "nowrap", background: dias > 15 ? "#FCEBEB" : "#FBF3E0", color: dias > 15 ? "#791F1F" : "#7A5200" }}>
            {dias === 0 ? "hoje" : dias === 1 ? "1 dia" : `${dias} dias`}
          </span>
        </td>
        <td style={{ ...td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBRL(Number(nf.valor_total ?? 0))}</td>
        <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
          <OperationalButton data-arato-button="secondary" onClick={onItens}
            style={{ padding: "4px 10px", fontSize: 11, marginRight: 6, border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer" }}>{aberta ? "▲ Itens" : "▼ Itens"}</OperationalButton>
          <OperationalButton data-arato-button="primary" onClick={onConfirmar}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 6, background: "#C9921B", color: "#fff", cursor: "pointer" }}>✓ Confirmar entrega</OperationalButton>
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={7} style={{ ...td, background: "var(--bg-page)", padding: "10px 18px" }}>
            {!itens ? "Carregando…" : itens.length === 0 ? "NF sem itens." : itens.map(i => (
              <div key={i.id} style={{ display: "flex", gap: 14, fontSize: 12, padding: "3px 0", color: "var(--text-2)" }}>
                <span style={{ flex: 1, color: "var(--text-1)" }}>{i.descricao_produto}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade}</span>
                <span style={{ width: 200 }}>{i.deposito_id ? depositos.get(i.deposito_id) ?? "Depósito" : "Sem depósito"}</span>
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
