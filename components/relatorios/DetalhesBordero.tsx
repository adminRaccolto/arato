"use client";
import { pagoDeTituloRelatorio, type LinhaBorderoRelatorio } from "../../lib/financeiro/borderos-relatorio";

const moeda = (v: number) => v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export default function DetalhesBordero({ linha, cotacao }: { linha: LinhaBorderoRelatorio; cotacao: number }) {
  if (!linha.bordero) return null;
  return <details style={{whiteSpace:"normal",fontSize:11,marginTop:4}}>
    <summary style={{cursor:"pointer",color:"#1A4870"}}>Borderô · {linha.bordero.titulos.length} conta(s){linha.bordero.filtrado ? ` de ${linha.bordero.quantidade} (filtro aplicado)` : ""}</summary>
    {linha.bordero.divergente && <p role="alert">A composição diverge do total do borderô. Os totais abaixo correspondem aos títulos encontrados e precisam de conferência.</p>}
    {linha.bordero.titulos.map(t => <div key={`${t.empresa_id ? "empresa" : "produtor"}:${t.id}`} style={{padding:"6px 0",borderBottom:"1px solid #DDE2EE"}}>
      <div>{t.numero_documento || t.nfe_numero ? `NF ${t.numero_documento || t.nfe_numero} · ` : ""}{t.descricao}</div>
      <div>Valor desta parte: {moeda(t.valor*(t.moeda==="USD" ? t.cotacao_usd ?? cotacao : 1))} · Pago: {moeda(pagoDeTituloRelatorio(t,cotacao))}</div>
      {t.valor_titulo_origem != null && t.valor_titulo_origem !== t.valor && <div>Valor original da conta: {moeda(t.valor_titulo_origem * (t.moeda === "USD" ? t.cotacao_usd ?? cotacao : 1))}</div>}
    </div>)}
  </details>;
}
