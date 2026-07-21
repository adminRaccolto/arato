"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { BombaCombustivel, Maquina, Funcionario } from "../../../lib/supabase";

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none",
};

const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6,
};

const TIPOS_MAQUINA = [
  { v: "trator",        label: "Trator" },
  { v: "colheitadeira", label: "Colheitadeira" },
  { v: "pulverizador",  label: "Pulverizador" },
  { v: "plantadeira",   label: "Plantadeira" },
  { v: "caminhao",      label: "Caminhão" },
  { v: "carro",         label: "Carro / Pickup" },
  { v: "outro",         label: "Outro" },
];

export default function CampoAbastecimentoPage() {
  const { fazendaId } = useAuth();
  const [etapa, setEtapa]      = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]        = useState("");

  const [bombas,       setBombas]       = useState<BombaCombustivel[]>([]);
  const [todasMaq,     setTodasMaq]     = useState<Maquina[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [insumosBomba, setInsumosBomba] = useState<Record<string, string>>({});

  // Form fields
  const [fBomba,      setFBomba]      = useState("");
  const [fDestTipo,   setFDestTipo]   = useState<"maquina" | "funcionario" | "livre">("maquina");
  const [fTipoMaq,    setFTipoMaq]    = useState("trator");
  const [fMaquina,    setFMaquina]    = useState("");
  const [fFuncionario,setFFuncionario]= useState("");
  const [fDestLivre,  setFDestLivre]  = useState("");
  const [fQtd,        setFQtd]        = useState("");
  const [fValorL,     setFValorL]     = useState("");
  const [fHorimetro,  setFHorimetro]  = useState("");
  const [fData,       setFData]       = useState(() => new Date().toISOString().split("T")[0]);
  const [fObs,        setFObs]        = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: bomb }, { data: maq }, { data: func }] = await Promise.all([
      supabase.from("bombas_combustivel").select("*, insumos(id,nome)").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("maquinas").select("id, nome, tipo, horimetro_atual, patrimonio, consome_combustivel").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("funcionarios").select("id, nome").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    setBombas((bomb ?? []) as BombaCombustivel[]);

    // Monta mapa bomba_id → nome do insumo vinculado
    const insMap: Record<string, string> = {};
    ((bomb ?? []) as (BombaCombustivel & { insumos?: { nome: string } | null })[]).forEach(b => {
      if (b.insumo_id && b.insumos?.nome) insMap[b.id] = b.insumos.nome;
    });
    setInsumosBomba(insMap);

    // Filtra apenas máquinas que consomem combustível (flag true ou null = legado)
    const maqFiltradas = ((maq ?? []) as Maquina[]).filter(m => m.consome_combustivel !== false);
    setTodasMaq(maqFiltradas);
    setFuncionarios((func ?? []) as Funcionario[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Máquinas do tipo selecionado
  const maquinasTipo = todasMaq.filter(m => m.tipo === fTipoMaq);

  function handleTipoMaq(tipo: string) {
    setFTipoMaq(tipo);
    setFMaquina("");
    setFHorimetro("");
  }

  function handleMaquina(id: string) {
    setFMaquina(id);
    const m = todasMaq.find(m => m.id === id);
    if (m?.horimetro_atual) setFHorimetro(String(m.horimetro_atual));
    else setFHorimetro("");
  }

  const bombasel   = bombas.find(b => b.id === fBomba);
  const maquinaSel = todasMaq.find(m => m.id === fMaquina);
  const qtd        = parseFloat(fQtd) || 0;
  const valorL     = parseFloat(fValorL) || 0;
  const valorTotal = qtd * valorL;

  // Patrimônio da máquina selecionada
  const temPatrimonio = !!maquinaSel?.patrimonio;

  async function salvar() {
    if (!fazendaId || !fBomba || !fQtd) {
      setErro("Preencha a bomba e a quantidade em litros."); return;
    }
    if (fDestTipo === "maquina") {
      if (!fMaquina) { setErro("Selecione a máquina."); return; }
      if (!fHorimetro) { setErro("Horímetro é obrigatório ao abastecer uma máquina."); return; }
      if (!temPatrimonio) { setErro("A máquina selecionada não tem número de patrimônio cadastrado. Cadastre em Configurações → Máquinas antes de abastecer."); return; }
    }

    setErro(""); setSalvando(true);
    try {
      const destMaquinaId = fDestTipo === "maquina"      ? (fMaquina || null)    : null;
      const destFuncId    = fDestTipo === "funcionario"   ? (fFuncionario || null): null;
      const destLivre     = fDestTipo === "livre"         ? (fDestLivre.trim() || null) : null;
      const horimetro     = fHorimetro ? parseFloat(fHorimetro) : null;
      const patrimonioSnap = maquinaSel?.patrimonio ?? null;

      const { error: e1 } = await supabase.from("abastecimentos").insert({
        fazenda_id:           fazendaId,
        bomba_id:             fBomba,
        maquina_id:           destMaquinaId,
        funcionario_id:       destFuncId,
        destino_livre:        destLivre,
        quantidade_l:         qtd,
        valor_unitario:       valorL,
        valor_total:          valorTotal,
        horimetro,
        patrimonio:           patrimonioSnap,
        data:                 fData,
        observacao:           fObs.trim() || null,
        insumo_movimentado_id: bombasel?.insumo_id ?? null,
      });
      if (e1) throw new Error(e1.message);

      // Atualiza horímetro da máquina
      if (destMaquinaId && horimetro) {
        await supabase.from("maquinas").update({ horimetro_atual: horimetro }).eq("id", destMaquinaId);
      }

      // Baixa estoque da bomba
      if (bombasel?.consume_estoque) {
        const novoEstoque = (bombasel.estoque_atual_l ?? 0) - qtd;
        await supabase.from("bombas_combustivel")
          .update({ estoque_atual_l: Math.max(0, novoEstoque) })
          .eq("id", fBomba);
      }

      // Baixa estoque do insumo vinculado à bomba
      if (bombasel?.insumo_id) {
        const { data: ins } = await supabase
          .from("insumos").select("estoque").eq("id", bombasel.insumo_id).single();
        if (ins) {
          const novoEst = Math.max(0, (ins.estoque ?? 0) - qtd);
          await supabase.from("insumos").update({ estoque: novoEst }).eq("id", bombasel.insumo_id);

          // Registra movimentação
          await supabase.from("movimentacoes_estoque").insert({
            fazenda_id:    fazendaId,
            insumo_id:     bombasel.insumo_id,
            tipo:          "saida",
            quantidade:    qtd,
            motivo:        "abastecimento",
            observacao:    `Abastecimento — ${maquinaSel?.nome ?? fDestLivre ?? "destino livre"} — Patrimônio: ${patrimonioSnap ?? "—"}`,
          });
        }
      }

      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFBomba(""); setFDestTipo("maquina"); setFTipoMaq("trator"); setFMaquina("");
    setFFuncionario(""); setFDestLivre(""); setFQtd(""); setFValorL("");
    setFHorimetro(""); setFObs("");
    setFData(new Date().toISOString().split("T")[0]);
    setErro(""); setSalvando(false); setEtapa("form");
  }

  // ── Tela de sucesso ──
  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Abastecimento registrado!</div>
      <div style={{ background: "#FEFCE8", border: "0.5px solid #FDE047", borderRadius: 12, padding: "16px 18px", width: "100%", fontSize: 13, color: "#4B3B0F", lineHeight: 1.8 }}>
        <strong>⛽ {bombasel?.nome ?? "Bomba"}</strong>
        {insumosBomba[fBomba] && <> — {insumosBomba[fBomba]}</>}
        <br />
        {fData.split("-").reverse().join("/")} · {qtd.toLocaleString("pt-BR")} L<br />
        {maquinaSel && <><strong>🚜 {maquinaSel.nome}</strong> — Pat. {maquinaSel.patrimonio}<br /></>}
        {fHorimetro && <>Horímetro: <strong>{parseFloat(fHorimetro).toLocaleString("pt-BR")} h</strong><br /></>}
        {valorTotal > 0 && <><strong>R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Novo Abastecimento
        </button>
        <a href="/estoque/abastecimento" style={{ padding: "14px", background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver histórico
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>⛽ Registrar Abastecimento</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Combustível para máquinas e frota</div>
      </div>

      {/* ── Bomba ── */}
      <div>
        <label style={lbl}>Bomba / Tanque *</label>
        {bombas.length === 0 ? (
          <div style={{ padding: "14px", background: "#FEF3C7", border: "0.5px solid #FDE68A", borderRadius: 10, fontSize: 13, color: "#92400E" }}>
            Nenhuma bomba cadastrada. Cadastre em Configurações → Combustíveis &amp; Bombas.
          </div>
        ) : (
          <select value={fBomba} onChange={e => setFBomba(e.target.value)} style={inp}>
            <option value="">Selecione a bomba...</option>
            {bombas.map(b => (
              <option key={b.id} value={b.id}>
                {b.nome} — {b.combustivel?.replace("_", " ")} {b.estoque_atual_l != null ? `(${b.estoque_atual_l.toLocaleString("pt-BR")} L)` : ""}
              </option>
            ))}
          </select>
        )}
        {fBomba && insumosBomba[fBomba] && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#166534", background: "#F0FFF4", padding: "6px 10px", borderRadius: 7, border: "0.5px solid #BBF7D0" }}>
            ✅ Vinculada ao insumo: <strong>{insumosBomba[fBomba]}</strong> — estoque será debitado automaticamente
          </div>
        )}
        {fBomba && !insumosBomba[fBomba] && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#92400E", background: "#FEF3C7", padding: "6px 10px", borderRadius: 7, border: "0.5px solid #FDE68A" }}>
            ⚠️ Bomba sem insumo vinculado — estoque do almoxarifado não será debitado
          </div>
        )}
      </div>

      {/* ── Destino ── */}
      <div>
        <label style={lbl}>Destino</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
          {([
            { v: "maquina",     label: "Máquina",    icon: "🚜" },
            { v: "funcionario", label: "Funcionário", icon: "👷" },
            { v: "livre",       label: "Outro",       icon: "📝" },
          ] as const).map(d => (
            <button key={d.v} type="button" onClick={() => setFDestTipo(d.v)}
              style={{ padding: "10px 6px", borderRadius: 10, border: `2px solid ${fDestTipo === d.v ? "#1A4870" : "var(--border)"}`, background: fDestTipo === d.v ? "#EFF4FA" : "var(--bg-card)", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 22 }}>{d.icon}</div>
              <div style={{ fontSize: 10, fontWeight: fDestTipo === d.v ? 700 : 400, color: fDestTipo === d.v ? "#1A4870" : "var(--text-2)", marginTop: 4 }}>{d.label}</div>
            </button>
          ))}
        </div>

        {fDestTipo === "maquina" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Pré-filtro por tipo */}
            <div>
              <label style={lbl}>Tipo de equipamento</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {TIPOS_MAQUINA.map(t => {
                  const count = todasMaq.filter(m => m.tipo === t.v).length;
                  if (count === 0) return null;
                  return (
                    <button key={t.v} type="button" onClick={() => handleTipoMaq(t.v)}
                      style={{ padding: "8px 4px", borderRadius: 8, border: `2px solid ${fTipoMaq === t.v ? "#1A4870" : "var(--border)"}`, background: fTipoMaq === t.v ? "#EFF4FA" : "var(--bg-card)", cursor: "pointer", textAlign: "center", fontSize: 10, fontWeight: fTipoMaq === t.v ? 700 : 400, color: fTipoMaq === t.v ? "#1A4870" : "var(--text-2)" }}>
                      {t.label}<br /><span style={{ fontWeight: 400, color: "var(--text-3)" }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Select de máquinas filtradas por tipo */}
            {maquinasTipo.length === 0 ? (
              <div style={{ padding: "12px", background: "#FEF3C7", borderRadius: 10, fontSize: 13, color: "#92400E", border: "0.5px solid #FDE68A" }}>
                Nenhum(a) {TIPOS_MAQUINA.find(t => t.v === fTipoMaq)?.label.toLowerCase()} cadastrado(a) que consuma combustível.
              </div>
            ) : (
              <div>
                <label style={lbl}>Patrimônio / Equipamento *</label>
                <select value={fMaquina} onChange={e => handleMaquina(e.target.value)} style={inp}>
                  <option value="">Selecione...</option>
                  {maquinasTipo.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.patrimonio ? `[${m.patrimonio}]` : "[s/patrimônio]"} {m.nome}
                      {m.horimetro_atual ? ` — ${m.horimetro_atual.toLocaleString("pt-BR")} h` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Patrimônio da máquina selecionada */}
            {fMaquina && (
              <div style={{ padding: "10px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--bg-page)", display: "flex", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Patrimônio</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: temPatrimonio ? "#1A4870" : "#DC2626" }}>
                    {maquinaSel?.patrimonio ?? "— Não cadastrado —"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Equipamento</div>
                  <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{maquinaSel?.nome}</div>
                </div>
              </div>
            )}
            {fMaquina && !temPatrimonio && (
              <div style={{ padding: "10px 14px", background: "#FEE2E2", borderRadius: 8, fontSize: 12, color: "#991B1B", border: "0.5px solid #FECACA" }}>
                ⚠️ Esta máquina não tem número de patrimônio. Cadastre em Configurações → Máquinas para poder abastecer.
              </div>
            )}
          </div>
        )}

        {fDestTipo === "funcionario" && (
          <select value={fFuncionario} onChange={e => setFFuncionario(e.target.value)} style={inp}>
            <option value="">Selecione o funcionário...</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        )}

        {fDestTipo === "livre" && (
          <input placeholder="Ex: Gerador, bomba d'água..." value={fDestLivre} onChange={e => setFDestLivre(e.target.value)} style={inp} />
        )}
      </div>

      {/* ── Data ── */}
      <div>
        <label style={lbl}>Data *</label>
        <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
      </div>

      {/* ── Quantidade + Horímetro ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>Quantidade (L) *</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 150" value={fQtd} onChange={e => setFQtd(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ ...lbl, color: fDestTipo === "maquina" ? "#DC2626" : "var(--text-2)" }}>
            Horímetro (h) {fDestTipo === "maquina" ? "*" : ""}
          </label>
          <input type="number" inputMode="decimal" placeholder="Ex: 1245" value={fHorimetro} onChange={e => setFHorimetro(e.target.value)}
            style={{ ...inp, border: `0.5px solid ${fDestTipo === "maquina" && !fHorimetro ? "#FCA5A5" : "var(--border-table)"}` }} />
          {fDestTipo === "maquina" && !fHorimetro && (
            <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>Obrigatório para máquinas</div>
          )}
        </div>
      </div>

      {/* ── Valor ── */}
      <div>
        <label style={lbl}>Valor por litro (R$) — opcional</label>
        <input type="number" inputMode="decimal" placeholder="Ex: 6,50" value={fValorL} onChange={e => setFValorL(e.target.value)} style={inp} />
      </div>

      {/* ── Resumo ── */}
      {qtd > 0 && valorL > 0 && (
        <div style={{ background: "#FEFCE8", border: "0.5px solid #FDE68A", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4B3B0F" }}>{qtd} L</div>
              <div style={{ fontSize: 10, color: "var(--text-3)" }}>quantidade</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4B3B0F" }}>R$ {valorL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)" }}>por litro</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#4B3B0F" }}>R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)" }}>total</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Observações ── */}
      <div>
        <label style={lbl}>Observações</label>
        <textarea rows={2} placeholder="Ex: abastecimento noturno, operador..." value={fObs} onChange={e => setFObs(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {erro && <div style={{ padding: "12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>{erro}</div>}

      <button onClick={salvar} disabled={salvando || bombas.length === 0}
        style={{ padding: "16px", background: salvando || bombas.length === 0 ? "#9CA3AF" : "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
        {salvando ? "Salvando..." : "✓ Registrar Abastecimento"}
      </button>
    </div>
  );
}
