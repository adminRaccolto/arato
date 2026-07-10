"use client";
import { useEffect, useRef } from "react";

export interface DadosTicket {
  tipo: "entrada" | "saida";
  numero?: string | null;
  data: string;              // YYYY-MM-DD
  hora?: string;             // HH:MM
  // Fazenda
  fazendaNome?: string;
  fazendaCnpj?: string;
  fazendaMunicipio?: string;
  fazendaUf?: string;
  // Produto
  produto?: string;
  variedade?: string;
  safra?: string;
  talhao?: string;
  // Transporte
  placa?: string;
  motorista?: string;
  transportadora?: string;
  // Pesagem
  pesoBrutoKg: number;
  taraKg: number;
  pesoLiquidoKg: number;
  // Classificação
  umidadePct?: number;
  umidadePadraoPct?: number;
  descontoUmidadeKg?: number;
  impurezaPct?: number;
  impurezaPadraoPct?: number;
  descontoImpurezaKg?: number;
  avar?: number;
  descontoAvarKg?: number;
  phHl?: number;
  pesoClassificadoKg?: number;
  sacas?: number;
  kgSaca?: number;
  // Operador
  operador?: string;
  obs?: string;
}

const fmt  = (n: number, d = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (s: string) => s.split("-").reverse().join("/");

interface Props {
  dados: DadosTicket;
  onFechar: () => void;
}

export default function TicketBalanca({ dados, onFechar }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  // Inject print styles once
  useEffect(() => {
    const id = "ticket-print-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @media print {
        body > *:not(#ticket-print-root) { display: none !important; }
        #ticket-print-root { display: block !important; position: static !important; }
        #ticket-print-root .ticket-modal-overlay,
        #ticket-print-root .ticket-btn-row { display: none !important; }
        #ticket-print-root .ticket-body { box-shadow: none !important; max-width: 100% !important; margin: 0 !important; border: none !important; }
        @page { size: A5 portrait; margin: 8mm; }
      }
    `;
    document.head.appendChild(s);
  }, []);

  const temClassif = (dados.umidadePct ?? 0) > 0 || (dados.impurezaPct ?? 0) > 0 || (dados.avar ?? 0) > 0;
  const horaStr = dados.hora ?? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tipoLabel = dados.tipo === "entrada" ? "ENTRADA" : "SAÍDA";
  const tipoColor = dados.tipo === "entrada" ? "#1A4870" : "#7C3AED";

  const line = () => <div style={{ borderTop: "1px dashed #bbb", margin: "8px 0" }} />;

  return (
    <div id="ticket-print-root" style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}>
      <div className="ticket-modal-overlay" style={{ position: "absolute", inset: 0 }} onClick={onFechar} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Botões */}
        <div className="ticket-btn-row" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={() => window.print()}
            style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🖨 Imprimir Ticket
          </button>
          <button onClick={onFechar}
            style={{ background: "#F0F4FA", color: "#444", border: "0.5px solid #CDD5E0", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
            Fechar
          </button>
        </div>

        {/* Ticket */}
        <div ref={printRef} className="ticket-body" style={{
          background: "#fff", width: 320, padding: "20px 20px 24px",
          fontFamily: "'Courier New', monospace",
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          borderRadius: 4, border: "0.5px solid #DDE2EE",
          fontSize: 11, color: "#111", lineHeight: "1.6",
        }}>

          {/* Cabeçalho fazenda */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            {dados.fazendaNome && <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>{dados.fazendaNome.toUpperCase()}</div>}
            {dados.fazendaCnpj && <div style={{ fontSize: 10, color: "#555" }}>CNPJ: {dados.fazendaCnpj}</div>}
            {(dados.fazendaMunicipio || dados.fazendaUf) && (
              <div style={{ fontSize: 10, color: "#555" }}>{dados.fazendaMunicipio}{dados.fazendaUf ? ` - ${dados.fazendaUf}` : ""}</div>
            )}
          </div>

          {line()}

          {/* Ticket nº e tipo */}
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: tipoColor, letterSpacing: 2 }}>
              TICKET DE BALANÇA
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 2 }}>
              {dados.numero && <span style={{ fontWeight: 600, fontSize: 12 }}>Nº {dados.numero.padStart(4, "0")}</span>}
              <span style={{ background: tipoColor, color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                {tipoLabel}
              </span>
            </div>
          </div>

          {/* Data / Hora */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 6 }}>
            <span>Data: <strong>{fmtD(dados.data)}</strong></span>
            <span>Hora: <strong>{horaStr}</strong></span>
          </div>

          {line()}

          {/* Produto */}
          {(dados.produto || dados.safra || dados.talhao) && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Produto</div>
              {dados.produto && <div><strong>{dados.produto.toUpperCase()}</strong>{dados.variedade ? ` · ${dados.variedade}` : ""}</div>}
              {dados.safra   && <div style={{ color: "#444" }}>Safra: {dados.safra}</div>}
              {dados.talhao  && <div style={{ color: "#444" }}>Talhão: {dados.talhao}</div>}
              {line()}
            </>
          )}

          {/* Transporte */}
          {(dados.placa || dados.motorista || dados.transportadora) && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Transporte</div>
              {dados.placa          && <div>Placa: <strong style={{ fontFamily: "monospace" }}>{dados.placa}</strong></div>}
              {dados.motorista      && <div>Motorista: {dados.motorista}</div>}
              {dados.transportadora && <div>Transp.: {dados.transportadora}</div>}
              {line()}
            </>
          )}

          {/* Pesagem */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Pesagem</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              <tr>
                <td style={{ paddingBottom: 2 }}>Peso Bruto</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(dados.pesoBrutoKg)} kg</td>
              </tr>
              <tr>
                <td style={{ paddingBottom: 2 }}>Tara</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>- {fmt(dados.taraKg)} kg</td>
              </tr>
              <tr style={{ borderTop: "1px solid #bbb" }}>
                <td style={{ paddingTop: 3, fontWeight: 700 }}>Peso Líquido</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmt(dados.pesoLiquidoKg)} kg</td>
              </tr>
            </tbody>
          </table>

          {/* Classificação */}
          {temClassif && (
            <>
              {line()}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Classificação</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ color: "#666" }}>
                    <th style={{ textAlign: "left", paddingBottom: 2, fontWeight: 600 }}>Parâmetro</th>
                    <th style={{ textAlign: "right", fontWeight: 600 }}>%</th>
                    <th style={{ textAlign: "right", fontWeight: 600 }}>Padrão</th>
                    <th style={{ textAlign: "right", fontWeight: 600 }}>Desc. (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {(dados.umidadePct ?? 0) > 0 && (
                    <tr>
                      <td>Umidade</td>
                      <td style={{ textAlign: "right" }}>{fmt(dados.umidadePct!, 1)}%</td>
                      <td style={{ textAlign: "right" }}>{dados.umidadePadraoPct ?? 14}%</td>
                      <td style={{ textAlign: "right", color: (dados.descontoUmidadeKg ?? 0) > 0 ? "#E24B4A" : "#16A34A" }}>
                        {(dados.descontoUmidadeKg ?? 0) > 0 ? `-${fmt(dados.descontoUmidadeKg!)}` : "—"}
                      </td>
                    </tr>
                  )}
                  {(dados.impurezaPct ?? 0) > 0 && (
                    <tr>
                      <td>Impureza</td>
                      <td style={{ textAlign: "right" }}>{fmt(dados.impurezaPct!, 1)}%</td>
                      <td style={{ textAlign: "right" }}>{dados.impurezaPadraoPct ?? 1}%</td>
                      <td style={{ textAlign: "right", color: (dados.descontoImpurezaKg ?? 0) > 0 ? "#E24B4A" : "#16A34A" }}>
                        {(dados.descontoImpurezaKg ?? 0) > 0 ? `-${fmt(dados.descontoImpurezaKg!)}` : "—"}
                      </td>
                    </tr>
                  )}
                  {(dados.avar ?? 0) > 0 && (
                    <tr>
                      <td>Avariados</td>
                      <td style={{ textAlign: "right" }}>{fmt(dados.avar!, 1)}%</td>
                      <td style={{ textAlign: "right" }}>—</td>
                      <td style={{ textAlign: "right", color: (dados.descontoAvarKg ?? 0) > 0 ? "#E24B4A" : "#16A34A" }}>
                        {(dados.descontoAvarKg ?? 0) > 0 ? `-${fmt(dados.descontoAvarKg!)}` : "—"}
                      </td>
                    </tr>
                  )}
                  {(dados.phHl ?? 0) > 0 && (
                    <tr>
                      <td>PH (kg/hl)</td>
                      <td style={{ textAlign: "right" }}>{fmt(dados.phHl!, 1)}</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </tbody>
              </table>

              {line()}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Peso Classificado</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(dados.pesoClassificadoKg ?? dados.pesoLiquidoKg)} kg</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Sacas */}
          {(dados.sacas ?? 0) > 0 && (
            <>
              {line()}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>TOTAL EM SACAS ({dados.kgSaca ?? 60} kg/sc)</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "#1A4870" }}>
                  {fmt(dados.sacas!, 3)} sc
                </div>
              </div>
            </>
          )}

          {/* Obs */}
          {dados.obs && (
            <>
              {line()}
              <div style={{ fontSize: 10, color: "#555" }}>Obs: {dados.obs}</div>
            </>
          )}

          {/* Assinatura */}
          {line()}
          <div style={{ fontSize: 10, color: "#555", marginBottom: 16 }}>
            {dados.operador && <div>Operador: {dados.operador}</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 8 }}>
            <div style={{ flex: 1, borderTop: "1px solid #888", paddingTop: 3, fontSize: 9, color: "#888", textAlign: "center" }}>Operador</div>
            <div style={{ flex: 1, borderTop: "1px solid #888", paddingTop: 3, fontSize: 9, color: "#888", textAlign: "center" }}>Motorista</div>
          </div>
        </div>
      </div>
    </div>
  );
}
