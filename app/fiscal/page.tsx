"use client";
import { useState, useEffect, useRef, Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../components/TopNav";
import { listarNotasFiscais, criarNotaFiscal, atualizarStatusNFe, listarProdutores } from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import type { NotaFiscal, Produtor } from "../../lib/supabase";

// ── Naturezas fiscais ────────────────────────────────────────────────────────
const NATUREZAS_VENDA = [
  { codigo: "6.101",    descricao: "Venda de Produção — Produtor Rural PF (ICMS Diferido)",          obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação isenta de PIS/COFINS conforme art. 10, inciso VI da Lei 10.925/2004. Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991." },
  { codigo: "6.101.PJ", descricao: "Venda de Produção — Produtor Rural PJ (ICMS Diferido)",          obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação isenta de PIS/COFINS conforme art. 10, inciso VI da Lei 10.925/2004. Contribuinte do Simples Nacional / Lucro Presumido." },
  { codigo: "6.501",    descricao: "Venda com Fim Específico de Exportação — PF (CFOP 6.501)",        obs: "Venda com fim específico de exportação. ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88. Funrural retido pelo adquirente nos termos do art. 25 da Lei 8.212/1991." },
  { codigo: "6.501.PJ", descricao: "Venda com Fim Específico de Exportação — PJ (CFOP 6.501)",        obs: "Venda com fim específico de exportação. ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88." },
  { codigo: "5.101",    descricao: "Venda de Produção — Operação Interna (CFOP 5.101)",               obs: "ICMS diferido nos termos do Decreto MT nº 4.540/2004. Operação interna no Estado de Mato Grosso. Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991." },
  { codigo: "5.501",    descricao: "Venda com Fim Específico de Exportação — Interna (CFOP 5.501)",   obs: "Venda com fim específico de exportação. Operação interna — ICMS suspenso conforme art. 7º, inciso VII do RICMS-MT. PIS/COFINS imunes conforme art. 149-A da CF/88." },
  { codigo: "7.101",    descricao: "Exportação Direta pelo Produtor (CFOP 7.101)",                    obs: "Exportação direta. Operação imune de ICMS, PIS, COFINS e Funrural conforme art. 149-A da CF/88 e art. 14 da Lei 11.945/2009." },
  { codigo: "6.905",    descricao: "Remessa para Armazém Geral / Depósito (CFOP 6.905)",              obs: "Remessa para depósito em armazém geral de terceiros. Operação não configura venda. Não incide ICMS, PIS, COFINS nem Funrural." },
  { codigo: "6.117",    descricao: "Remessa Simbólica — Entrega Futura (CFOP 6.117)",                 obs: "Faturamento antecipado. NF simbólica sem movimentação física de mercadoria. ICMS diferido nos termos do Decreto MT nº 4.540/2004." },
  { codigo: "6.119",    descricao: "Remessa para Venda à Ordem (CFOP 6.119)",                         obs: "Venda à ordem — operação triangular. ICMS diferido conforme Decreto MT nº 4.540/2004." },
];

const NATUREZAS_DEVOLUCAO = [
  { codigo: "2.201", descricao: "Devolução de venda de produção — interestadual (CFOP 2.201)",  obs: "Devolução de mercadoria originada em venda interestadual. ICMS diferido estornado conforme emissão original. Funrural não incide sobre devolução." },
  { codigo: "1.201", descricao: "Devolução de venda de produção — intraestadual (CFOP 1.201)",  obs: "Devolução de mercadoria originada em venda intraestadual. ICMS diferido estornado conforme emissão original." },
  { codigo: "2.202", descricao: "Devolução de venda de mercadoria adquirida — interestadual",   obs: "Devolução de mercadoria adquirida para comercialização. Operação interestadual." },
  { codigo: "1.202", descricao: "Devolução de venda de mercadoria adquirida — intraestadual",   obs: "Devolução de mercadoria adquirida para comercialização. Operação intraestadual." },
];

const NCM_OPTIONS = [
  { codigo: "1201.10.00", descricao: "Soja em grão, mesmo triturada" },
  { codigo: "1005.10.90", descricao: "Milho em grão" },
  { codigo: "5201.00.20", descricao: "Algodão em caroço" },
  { codigo: "1001.99.00", descricao: "Trigo em grão" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number => Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

const corStatus = (s: string) => ({
  autorizada:   { bg: "#D5E8F5", color: "#0B2D50", label: "Autorizada",    icone: "✓" },
  rejeitada:    { bg: "#FCEBEB", color: "#791F1F", label: "Rejeitada",      icone: "✗" },
  em_digitacao: { bg: "#FAEEDA", color: "#633806", label: "Processando…",  icone: "⟳" },
  cancelada:    { bg: "#F1EFE8", color: "#666",    label: "Cancelada",      icone: "○" },
  denegada:     { bg: "#FCEBEB", color: "#791F1F", label: "Denegada",       icone: "✗" },
} as Record<string, { bg: string; color: string; label: string; icone: string }>)[s] || { bg: "#F1EFE8", color: "#666", label: s, icone: "·" };

type Aba = "venda" | "devolucao" | "cancelamento" | "complemento" | "certificado";

const inputSt: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const labelSt: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

// ── Impressão DANFE — Modelo 55 ───────────────────────────────────────────────
interface DanfeCfg {
  razao_social?: string; cpf_cnpj_emitente?: string; ie_emitente?: string;
  logradouro?: string; numero_end?: string; bairro?: string;
  municipio?: string; uf?: string; cep?: string; fone?: string;
  ambiente?: string;
}
function imprimirDanfe(nota: NotaFiscal, cfg: DanfeCfg = {}) {
  const dataFmt  = new Date(nota.data_emissao + "T12:00:00").toLocaleDateString("pt-BR");
  const valorFmt = nota.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chave44  = (nota.chave_acesso ?? "").replace(/\D/g, "");
  const chaveBlocks = chave44
    ? chave44.replace(/(.{4})/g, "$1 ").trim()
    : "— aguardando autorização SEFAZ —";
  const isHomolog = (cfg.ambiente ?? "homologacao") !== "producao";
  const emiNome   = cfg.razao_social        ?? "—";
  const emiCnpj   = cfg.cpf_cnpj_emitente  ?? "—";
  const emiIe     = cfg.ie_emitente         ?? "—";
  const emiEnd    = [cfg.logradouro, cfg.numero_end].filter(Boolean).join(", ") || "—";
  const emiBairro = cfg.bairro   ?? "";
  const emiMun    = cfg.municipio ?? "—";
  const emiUf     = cfg.uf       ?? "—";
  const emiCep    = cfg.cep      ?? "—";
  const emiFone   = cfg.fone     ?? "—";
  const tipoStr   = nota.tipo === "saida" ? "1" : "0";
  const tipoDesc  = nota.tipo === "saida" ? "SAÍDA" : "ENTRADA";
  // Parse numero "001.001" → "000.000.001" style
  const numFmt = String(nota.numero).padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>DANFE NF-e ${numFmt} — Série ${nota.serie}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#000;background:#fff}
.page{width:200mm;margin:0 auto;padding:4mm}
.b{border:0.4px solid #000}
.bt{border-top:0.4px solid #000}
.bb{border-bottom:0.4px solid #000}
.bl{border-left:0.4px solid #000}
.br{border-right:0.4px solid #000}
.lbl{font-size:5.5pt;color:#444;display:block;line-height:1.2}
.val{font-size:8pt;font-weight:bold;line-height:1.4}
.val-sm{font-size:7pt;font-weight:bold;line-height:1.4}
.c{text-align:center}.r{text-align:right}
.row{display:flex}
.p{padding:2px 3px}
table.prod{width:100%;border-collapse:collapse}
table.prod th{background:#e8e8e8;font-size:5.5pt;padding:2px 3px;border:0.4px solid #000;text-align:center;font-weight:bold}
table.prod td{font-size:6.5pt;padding:2px 3px;border:0.4px solid #000;vertical-align:top}
.homolog{background:#ffd700;color:#000;font-weight:bold;font-size:8pt;text-align:center;padding:3px;margin-bottom:2px;border:1px solid #b8860b}
@media print{body{padding:0}@page{margin:6mm;size:A4 portrait}.homolog{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#ffd700!important}}
</style></head><body>
<div class="page">

${isHomolog ? '<div class="homolog">⚠ AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL ⚠</div>' : ""}

<!-- RECIBO -->
<div class="b p" style="margin-bottom:2px;font-size:6.5pt;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="flex:1">
    <strong>RECEBEMOS DE ${emiNome} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO.</strong><br>
    EMISSÃO: ${dataFmt} &nbsp;&nbsp; VALOR TOTAL: R$ ${valorFmt} &nbsp;&nbsp; DESTINATÁRIO: ${nota.destinatario}
  </div>
  <div style="text-align:right;min-width:40mm;padding-left:6px">
    <div style="font-size:9pt;font-weight:900">NF-e</div>
    <div style="font-size:8pt;font-weight:bold">Nº. ${numFmt}</div>
    <div style="font-size:7pt">Série ${nota.serie}</div>
  </div>
</div>

<!-- HEADER: EMITENTE | DANFE | CHAVE -->
<div class="row b" style="margin-bottom:0">
  <!-- Emitente -->
  <div class="p br" style="flex:0 0 55mm">
    <span class="lbl" style="font-size:5pt;font-style:italic">IDENTIFICAÇÃO DO EMITENTE</span>
    <div style="font-size:9pt;font-weight:900;margin:2px 0">${emiNome}</div>
    <div style="font-size:6pt">${emiEnd}</div>
    <div style="font-size:6pt">${emiBairro ? emiBairro + " — " : ""}${emiCep}</div>
    <div style="font-size:6pt">${emiMun} - ${emiUf} &nbsp; Fone: ${emiFone}</div>
  </div>
  <!-- DANFE título -->
  <div class="p br c" style="flex:0 0 46mm;display:flex;flex-direction:column;justify-content:center;align-items:center">
    <div style="font-size:12pt;font-weight:900;letter-spacing:0.05em">DANFE</div>
    <div style="font-size:6.5pt;margin:1px 0">Documento Auxiliar da Nota</div>
    <div style="font-size:6.5pt;margin-bottom:4px">Fiscal Eletrônica</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <span style="font-size:6.5pt">0 - ENTRADA</span>
      <span style="border:1px solid #000;padding:1px 6px;font-size:9pt;font-weight:900">${tipoStr}</span>
      <span style="font-size:6.5pt">1 - SAÍDA</span>
    </div>
    <div style="border-top:0.4px solid #000;padding-top:4px;width:100%;text-align:center">
      <div style="font-size:7.5pt;font-weight:bold">Nº. ${numFmt}</div>
      <div style="font-size:7pt">Série ${nota.serie}</div>
      <div style="font-size:6.5pt;color:#444">Folha 1/1</div>
    </div>
  </div>
  <!-- Chave + Barcode -->
  <div class="p" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:3px">
    <span class="lbl">CHAVE DE ACESSO</span>
    <div style="font-family:monospace;font-size:6.5pt;font-weight:bold;word-break:break-all;letter-spacing:0.08em">${chaveBlocks}</div>
    ${chave44 ? '<svg id="bc" style="width:100%;height:30px"></svg>' : '<div style="height:30px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:6pt;color:#888">Barcode disponível após autorização SEFAZ</div>'}
    <div style="font-size:5.5pt;color:#444;margin-top:2px">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</div>
  </div>
</div>

<!-- Natureza + Protocolo -->
<div class="row bb bl br" style="margin-bottom:0">
  <div class="p br" style="flex:1"><span class="lbl">NATUREZA DA OPERAÇÃO</span><span class="val">${nota.natureza.toUpperCase()}</span></div>
  <div class="p" style="flex:0 0 70mm"><span class="lbl">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
    <span class="val">${nota.chave_acesso ? "Aguardando autorização SEFAZ" : "— pendente —"}</span>
  </div>
</div>

<!-- IE / IE Subst / CNPJ -->
<div class="row bb bl br">
  <div class="p br" style="flex:1"><span class="lbl">INSCRIÇÃO ESTADUAL</span><span class="val">${emiIe}</span></div>
  <div class="p br" style="flex:1"><span class="lbl">INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</span><span class="val">&nbsp;</span></div>
  <div class="p" style="flex:1"><span class="lbl">CNPJ / CPF</span><span class="val">${emiCnpj}</span></div>
</div>

<!-- DESTINATÁRIO header -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">DESTINATÁRIO / REMETENTE</div>

<!-- Nome + CNPJ + Data Emissão -->
<div class="row bl br bb">
  <div class="p br" style="flex:1"><span class="lbl">NOME / RAZÃO SOCIAL</span><span class="val">${nota.destinatario.toUpperCase()}</span></div>
  <div class="p br" style="flex:0 0 44mm"><span class="lbl">CNPJ / CPF</span><span class="val">${nota.cnpj_destinatario ?? "—"}</span></div>
  <div class="p" style="flex:0 0 28mm"><span class="lbl">DATA DA EMISSÃO</span><span class="val">${dataFmt}</span></div>
</div>

<!-- Endereço + Bairro + CEP + Data Saída -->
<div class="row bl br bb">
  <div class="p br" style="flex:1"><span class="lbl">ENDEREÇO</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 34mm"><span class="lbl">BAIRRO / DISTRITO</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 22mm"><span class="lbl">CEP</span><span class="val-sm">&nbsp;</span></div>
  <div class="p" style="flex:0 0 28mm"><span class="lbl">DATA DA SAÍDA/ENTRADA</span><span class="val">${dataFmt}</span></div>
</div>

<!-- Município + UF + Fone + IE + Hora -->
<div class="row bl br bb">
  <div class="p br" style="flex:1"><span class="lbl">MUNICÍPIO</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 10mm c"><span class="lbl">UF</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 28mm"><span class="lbl">FONE / FAX</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 28mm"><span class="lbl">INSCRIÇÃO ESTADUAL</span><span class="val-sm">&nbsp;</span></div>
  <div class="p" style="flex:0 0 24mm"><span class="lbl">HORA DA SAÍDA/ENTRADA</span><span class="val-sm">&nbsp;</span></div>
</div>

<!-- FATURA -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">FATURA / DUPLICATA</div>
<div class="row bl br bb p" style="min-height:10mm;font-size:7pt">
  <div><strong>Num.</strong> 001 &nbsp;&nbsp; <strong>Venc.</strong> ${dataFmt} &nbsp;&nbsp; <strong>Valor</strong> R$ ${valorFmt}</div>
</div>

<!-- CÁLCULO DO IMPOSTO -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">CÁLCULO DO IMPOSTO</div>
<div class="row bl br bb" style="font-size:6pt">
  ${[
    ["BASE DE CÁLC. DO ICMS","0,00"],["VALOR DO ICMS","0,00"],["BASE DE CÁLC. ICMS S.T.","0,00"],
    ["VALOR DO ICMS SUBST.","0,00"],["V. IMP. IMPORTAÇÃO","0,00"],["V. ICMS UF REMET.","0,00"],
    ["V. FCP UF DEST.","0,00"],["VALOR DO PIS","0,00"],["V. TOTAL PRODUTOS",valorFmt]
  ].map(([l,v])=>`<div class="p br" style="flex:1"><span class="lbl">${l}</span><span class="val r">${v}</span></div>`).join("")}
</div>
<div class="row bl br bb" style="font-size:6pt">
  ${[
    ["VALOR DO FRETE","0,00"],["VALOR DO SEGURO","0,00"],["DESCONTO","0,00"],
    ["OUTRAS DESPESAS","0,00"],["VALOR TOTAL IPI","0,00"],["V. ICMS UF DEST.","0,00"],
    ["V. TOT. TRIB.","0,00"],["VALOR DA COFINS","0,00"],["V. TOTAL DA NOTA",valorFmt]
  ].map(([l,v],i)=>`<div class="p br${i===8?' bl':''}" style="flex:1${i===8?';font-weight:bold;background:#f5f5f5':''}"><span class="lbl">${l}</span><span class="val r">${v}</span></div>`).join("")}
</div>

<!-- TRANSPORTADOR -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
<div class="row bl br bb">
  <div class="p br" style="flex:1"><span class="lbl">NOME / RAZÃO SOCIAL</span><span class="val-sm">9-Sem Transporte</span></div>
  <div class="p br" style="flex:0 0 18mm"><span class="lbl">FRETE</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 24mm"><span class="lbl">CÓDIGO ANTT</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 22mm"><span class="lbl">PLACA DO VEÍCULO</span><span class="val-sm">&nbsp;</span></div>
  <div class="p br" style="flex:0 0 8mm"><span class="lbl">UF</span><span class="val-sm">&nbsp;</span></div>
  <div class="p" style="flex:0 0 34mm"><span class="lbl">CNPJ / CPF</span><span class="val-sm">&nbsp;</span></div>
</div>
<div class="row bl br bb" style="min-height:8mm">
  <div class="p br" style="flex:1"><span class="lbl">ENDEREÇO</span></div>
  <div class="p br" style="flex:0 0 40mm"><span class="lbl">MUNICÍPIO</span></div>
  <div class="p br" style="flex:0 0 8mm"><span class="lbl">UF</span></div>
  <div class="p" style="flex:0 0 34mm"><span class="lbl">INSCRIÇÃO ESTADUAL</span></div>
</div>
<div class="row bl br bb" style="min-height:7mm">
  <div class="p br" style="flex:0 0 18mm"><span class="lbl">QUANTIDADE</span></div>
  <div class="p br" style="flex:0 0 18mm"><span class="lbl">ESPÉCIE</span></div>
  <div class="p br" style="flex:0 0 28mm"><span class="lbl">MARCA</span></div>
  <div class="p br" style="flex:0 0 28mm"><span class="lbl">NUMERAÇÃO</span></div>
  <div class="p br" style="flex:1"><span class="lbl">PESO BRUTO</span></div>
  <div class="p" style="flex:1"><span class="lbl">PESO LÍQUIDO</span></div>
</div>

<!-- DADOS DOS PRODUTOS -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">DADOS DOS PRODUTOS / SERVIÇOS</div>
<table class="prod bl br bb">
  <thead><tr>
    <th style="width:10%">CÓDIGO<br>PRODUTO</th>
    <th style="width:28%">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
    <th style="width:8%">NCM/SH</th>
    <th style="width:5%">O/CST</th>
    <th style="width:5%">CFOP</th>
    <th style="width:5%">UN</th>
    <th style="width:7%">QUANT</th>
    <th style="width:8%">VALOR<br>UNIT</th>
    <th style="width:8%">VALOR<br>TOTAL</th>
    <th style="width:6%">B.CÁLC<br>ICMS</th>
    <th style="width:5%">VALOR<br>ICMS</th>
    <th style="width:5%">VALOR<br>IPI</th>
    <th style="width:5%">ALÍQ.<br>ICMS</th>
    <th style="width:5%">ALÍQ.<br>IPI</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="c">1</td>
      <td>${nota.natureza}</td>
      <td class="c">—</td>
      <td class="c">041</td>
      <td class="c">${nota.cfop.replace(".", "")}</td>
      <td class="c">sc</td>
      <td class="r">—</td>
      <td class="r">—</td>
      <td class="r" style="font-weight:bold">${valorFmt}</td>
      <td class="r">0,00</td>
      <td class="r">0,00</td>
      <td class="r">0,00</td>
      <td class="r">0,00</td>
      <td class="r">—</td>
    </tr>
    ${Array(8).fill('<tr style="height:8px"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join("")}
  </tbody>
</table>

<!-- DADOS ADICIONAIS -->
<div class="p bt bb bl br" style="background:#e8e8e8;font-size:6pt;font-weight:bold;letter-spacing:0.06em">DADOS ADICIONAIS</div>
<div class="row bl br bb" style="min-height:22mm">
  <div class="p br" style="flex:1">
    <span class="lbl">INFORMAÇÕES COMPLEMENTARES</span>
    <div style="font-size:6.5pt;margin-top:2px;line-height:1.5">${nota.observacao ?? "&nbsp;"}</div>
  </div>
  <div class="p" style="flex:0 0 55mm">
    <span class="lbl">RESERVADO AO FISCO</span>
  </div>
</div>

<div style="text-align:right;font-size:5.5pt;color:#666;margin-top:3px">
  Impresso em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} &nbsp;·&nbsp; RacTech ERP Agrícola &nbsp;·&nbsp; Modelo 55
</div>

</div>
<script>
window.onload = function() {
  ${chave44 ? `try { JsBarcode("#bc", "${chave44}", { format:"CODE128", displayValue:false, height:28, margin:0, lineColor:"#000" }); } catch(e) {}` : ""}
  setTimeout(function(){ window.print(); }, 400);
};
<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Tabela de NF-e reutilizável ───────────────────────────────────────────────
function TabelaNFe({ notas, onCancelar, onComplementar, onConsultarSefaz, onImprimirDanfe }: {
  notas: NotaFiscal[];
  onCancelar?: (n: NotaFiscal) => void;
  onComplementar?: (n: NotaFiscal) => void;
  onConsultarSefaz?: (n: NotaFiscal) => void;
  onImprimirDanfe?: (n: NotaFiscal) => void;
}) {
  const [expandida, setExpandida] = useState<string | null>(null);

  if (notas.length === 0) return (
    <div style={{ padding: 40, textAlign: "center", color: "#666", fontSize: 13 }}>Nenhuma NF-e encontrada.</div>
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#F3F6F9" }}>
          {["Número", "Data", "Destinatário / Remetente", "Natureza / CFOP", "Valor Total", "Status", "Origem", ""].map((h, i) => (
            <th key={i} style={{ padding: "8px 14px", textAlign: i >= 4 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {notas.map(nota => {
          const cs = corStatus(nota.status);
          const exp = expandida === nota.id;
          return (
            <Fragment key={nota.id}>
              <tr
                style={{ borderBottom: "0.5px solid #DEE5EE", background: exp ? "#F8FAFD" : "transparent", cursor: "pointer" }}
                onClick={() => setExpandida(exp ? null : nota.id)}
              >
                <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                  NF-e {nota.numero}
                  <div style={{ fontSize: 10, color: "#444", fontWeight: 400 }}>Série {nota.serie}</div>
                </td>
                <td style={{ padding: "10px 14px", color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmtData(nota.data_emissao)}</td>
                <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{nota.destinatario}</div>
                  {nota.cnpj_destinatario && <div style={{ fontSize: 10, color: "#444" }}>{nota.cnpj_destinatario}</div>}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nota.natureza}</div>
                  <div style={{ fontSize: 10, color: "#444" }}>CFOP {nota.cfop}</div>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmtMoeda(nota.valor_total)}</td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <span style={{ fontSize: 10, background: cs.bg, color: cs.color, padding: "3px 8px", borderRadius: 8, whiteSpace: "nowrap" }}>{cs.icone} {cs.label}</span>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <span style={{ fontSize: 10, background: nota.auto ? "#D5E8F5" : "#FBF0D8", color: nota.auto ? "#0B2D50" : "#7A5A12", padding: "2px 7px", borderRadius: 8 }}>
                    {nota.auto ? "⟳ auto" : "◈ manual"}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <span style={{ color: "#444", fontSize: 10, display: "inline-block", transform: exp ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>▶</span>
                </td>
              </tr>
              {exp && (
                <tr key={`${nota.id}-exp`}>
                  <td colSpan={8} style={{ background: "#F3F6F9", padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE" }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 11 }}>
                      {nota.chave_acesso && (
                        <div>
                          <span style={{ color: "#444" }}>Chave de acesso</span>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#1a1a1a", marginTop: 2, letterSpacing: "0.03em" }}>
                            {nota.chave_acesso.replace(/(.{4})/g, "$1 ").trim()}
                          </div>
                        </div>
                      )}
                      {nota.xml_url && (
                        <div>
                          <span style={{ color: "#444" }}>XML arquivado</span>
                          <div style={{ fontSize: 11, color: "#1A4870", marginTop: 2 }}>✓ Disponível</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      {nota.status === "autorizada" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onImprimirDanfe?.(nota); }}
                            style={{ padding: "5px 12px", border: "0.5px solid #1A4870", borderRadius: 6, background: "#D5E8F5", color: "#0B2D50", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                            🖨 Imprimir DANFE
                          </button>
                          {nota.xml_url && (
                            <button style={{ padding: "5px 12px", border: "0.5px solid #378ADD", borderRadius: 6, background: "#E6F1FB", color: "#0C447C", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>↓ XML</button>
                          )}
                          {onCancelar && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onCancelar(nota); }}
                              style={{ padding: "5px 12px", border: "0.5px solid #E24B4A", borderRadius: 6, background: "#FCEBEB", color: "#791F1F", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                            >
                              Cancelar NF-e
                            </button>
                          )}
                          {onComplementar && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onComplementar(nota); }}
                              style={{ padding: "5px 12px", border: "0.5px solid #C9921B", borderRadius: 6, background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                            >
                              Emitir Complementar
                            </button>
                          )}
                        </>
                      )}
                      {(nota.status === "rejeitada" || nota.status === "denegada") && (
                        <>
                          <button style={{ padding: "5px 12px", border: "0.5px solid #C9921B", borderRadius: 6, background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Corrigir e retransmitir</button>
                          <button style={{ padding: "5px 12px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#555", cursor: "pointer", fontSize: 11 }}>Ver XML de retorno</button>
                        </>
                      )}
                      {nota.status === "em_digitacao" && onConsultarSefaz && (
                        <button onClick={(e) => { e.stopPropagation(); onConsultarSefaz(nota); }} style={{ padding: "5px 12px", border: "0.5px solid #EF9F27", borderRadius: 6, background: "#FAEEDA", color: "#633806", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>⟳ Consultar SEFAZ</button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
function FiscalInner() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();
  const abaParam = searchParams.get("aba") as Aba | null;
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [danfeCfg, setDanfeCfg] = useState<DanfeCfg>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<Aba>(abaParam ?? "venda");

  // Sync aba when URL query param changes
  useEffect(() => {
    if (abaParam) setAba(abaParam);
  }, [abaParam]);

  // Filtro de status — aba Notas de Venda
  const [filtroStatusVenda, setFiltroStatusVenda] = useState<string | null>(null);

  // Modais
  const [modalVenda, setModalVenda] = useState(false);
  const [modalDevolucao, setModalDevolucao] = useState(false);
  const [modalCancelamento, setModalCancelamento] = useState<NotaFiscal | null>(null);
  const [modalComplemento, setModalComplemento] = useState<NotaFiscal | null>(null);

  // Formulário Venda
  const [fVenda, setFVenda] = useState({
    destinatario: "", cnpj: "", ncm: "1201.10.00",
    cfop: "6.101", quantidade: "", unidade: "sc", valorUnitario: "",
    observacao: NATUREZAS_VENDA[0].obs,
  });

  // Formulário Devolução
  const [fDev, setFDev] = useState({
    remetente: "", cnpj: "", ncm: "1201.10.00",
    cfop: "2.201", quantidade: "", unidade: "sc", valorUnitario: "",
    nfe_ref: "", chave_ref: "",
    observacao: NATUREZAS_DEVOLUCAO[0].obs,
  });

  // Formulário Cancelamento
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  // Formulário Complemento
  const [fComp, setFComp] = useState({
    valorComplemento: "", quantidade: "", unidade: "sc",
    motivo: "diferenca_peso",
    observacao: "",
  });

  const TODAY = new Date().toISOString().slice(0, 10);

  // ── Certificado A1 — carregado de configuracoes_modulo ──────────
  type CertInfo = { modulo: string; arquivo_nome: string; storage_path: string; produtor_id: string; produtor_nome: string; cpf_cnpj: string; data_vencimento: string | null };
  const [certs, setCerts] = useState<CertInfo[]>([]);

  const calcDias = (d?: string | null): number | null => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  };
  const certDiasMin: number | null = (() => {
    const dias = certs.map(c => calcDias(c.data_vencimento)).filter((d): d is number => d !== null);
    return dias.length > 0 ? Math.min(...dias) : null;
  })();

  // ── Modal upload certificado ─────────────────────────────────────
  const [modalCert,     setModalCert]     = useState(false);
  const [produtores,    setProdutores]    = useState<Produtor[]>([]);
  const [certProdId,    setCertProdId]    = useState("");
  const [certFile,      setCertFile]      = useState<File | null>(null);
  const [certSenha,     setCertSenha]     = useState("");
  const [certDataVenc,  setCertDataVenc]  = useState("");
  const [certDrag,      setCertDrag]      = useState(false);
  const [certLoading,   setCertLoading]   = useState(false);
  const [certOk,        setCertOk]        = useState(false);
  const certFileRef = useRef<HTMLInputElement>(null);

  function fecharCert() {
    setModalCert(false); setCertFile(null); setCertSenha(""); setCertDataVenc("");
    setCertDrag(false); setCertLoading(false); setCertOk(false);
  }

  async function salvarCertificado() {
    if (!certFile || !certSenha.trim()) return;
    if (produtores.length > 1 && !certProdId) { alert("Selecione o produtor titular."); return; }
    setCertLoading(true);
    try {
      const prod = produtores.find(p => p.id === certProdId) ?? produtores[0];

      // Upload + extração de data + salvamento via API (service role)
      const form = new FormData();
      form.append("file",          certFile);
      form.append("senha",         certSenha);
      form.append("fazenda_id",    fazendaId!);
      form.append("produtor_id",   prod?.id        ?? "");
      form.append("produtor_nome", prod?.nome      ?? "");
      form.append("cpf_cnpj",      prod?.cpf_cnpj  ?? "");

      const res = await fetch("/api/cert-upload", { method: "POST", body: form });
      const json = await res.json() as {
        ok?: boolean; error?: string;
        arquivo_nome?: string; storage_path?: string;
        produtor_nome?: string; cpf_cnpj?: string; data_vencimento?: string | null;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro no upload");

      const nova: CertInfo = { modulo: `certificado_a1_${prod?.id ?? ""}`, arquivo_nome: json.arquivo_nome ?? "", storage_path: json.storage_path ?? "", produtor_id: prod?.id ?? "", produtor_nome: json.produtor_nome ?? "", cpf_cnpj: json.cpf_cnpj ?? "", data_vencimento: json.data_vencimento ?? null };
      setCerts(prev => { const idx = prev.findIndex(c => c.produtor_id === nova.produtor_id); return idx >= 0 ? prev.map((c, i) => i === idx ? nova : c) : [...prev, nova]; });
      setCertOk(true);
      setTimeout(fecharCert, 1800);
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally { setCertLoading(false); }
  }

  useEffect(() => {
    if (!fazendaId) return;
    carregar();
    listarProdutores(fazendaId).then(d => { setProdutores(d); if (d.length === 1) setCertProdId(d[0].id); }).catch(() => {});
    // Carrega metadados de todos os certificados A1 via API (service role — sem RLS)
    void fetch(`/api/cert-meta?fazenda_id=${fazendaId}`)
      .then(r => r.json())
      .then((d: { certs?: CertInfo[] }) => { setCerts(d.certs ?? []); })
      .catch(() => {});
  }, [fazendaId]);

  const carregar = async () => {
    if (!fazendaId) return;
    setCarregando(true); setErro(null);
    try {
      const data = await listarNotasFiscais(fazendaId);
      setNotas(data);
      // Carregar config do primeiro emitente fiscal disponível para o DANFE
      const { data: cfgs } = await supabase.from("configuracoes_modulo")
        .select("modulo, config").eq("fazenda_id", fazendaId)
        .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%,modulo.eq.fiscal");
      if (cfgs && cfgs.length > 0) {
        const c = cfgs[0].config as Record<string, string> ?? {};
        setDanfeCfg({
          razao_social: c.razao_social, cpf_cnpj_emitente: c.cpf_cnpj_emitente,
          ie_emitente: c.ie_emitente, logradouro: c.logradouro,
          numero_end: c.numero_end, bairro: c.bairro,
          municipio: c.municipio, uf: c.uf, cep: c.cep, fone: c.fone,
          ambiente: c.ambiente,
        });
      }
    }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : "Erro ao carregar"); }
    finally { setCarregando(false); }
  };

  // Classificação das notas
  const notasVenda      = notas.filter(n => n.tipo === "saida");
  const notasDevolucao  = notas.filter(n => n.tipo === "entrada" && (n.cfop?.startsWith("1.2") || n.cfop?.startsWith("2.2")));
  const notasCanceladas = notas.filter(n => n.status === "cancelada");
  const notasAutorizadas = notas.filter(n => n.status === "autorizada" && n.tipo === "saida");

  const totalAutorizadas  = notasVenda.filter(n => n.status === "autorizada").length;
  const totalRejeitadas   = notasVenda.filter(n => n.status === "rejeitada" || n.status === "denegada").length;
  const totalProcessando  = notasVenda.filter(n => n.status === "em_digitacao").length;
  const faturamentoMes    = notasVenda.filter(n => n.status === "autorizada" && n.data_emissao >= "2026-03-01").reduce((a, n) => a + n.valor_total, 0);

  const proximoNumero = () => {
    const n = notas.length > 0 ? Math.max(...notas.map(n => parseInt(n.numero.replace(/\D/g, "") || "0"))) + 1 : 1001;
    return `${String(Math.floor(n / 1000)).padStart(3, "0")}.${String(n % 1000).padStart(3, "0")}`;
  };

  // Emitir NF-e de Venda
  const emitirVenda = async () => {
    if (!fVenda.destinatario || !fVenda.quantidade || !fVenda.valorUnitario) return;
    const valor = Math.round(Number(fVenda.quantidade) * desmascarar(fVenda.valorUnitario) * 100) / 100;
    const nat = NATUREZAS_VENDA.find(n => n.codigo === fVenda.cfop);
    setSalvando(true);
    try {
      await criarNotaFiscal({
        fazenda_id: fazendaId!, numero: proximoNumero(), serie: "1", tipo: "saida",
        cfop: fVenda.cfop, natureza: nat?.descricao ?? fVenda.cfop,
        destinatario: fVenda.destinatario, cnpj_destinatario: fVenda.cnpj || undefined,
        valor_total: valor, data_emissao: TODAY, status: "em_digitacao",
        observacao: fVenda.observacao || undefined, auto: false,
      });
      setFVenda({ destinatario: "", cnpj: "", ncm: "1201.10.00", cfop: "6.101", quantidade: "", unidade: "sc", valorUnitario: "", observacao: NATUREZAS_VENDA[0].obs });
      setModalVenda(false);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)); }
    finally { setSalvando(false); }
  };

  // Emitir NF-e de Devolução
  const emitirDevolucao = async () => {
    if (!fDev.remetente || !fDev.quantidade || !fDev.valorUnitario) return;
    const valor = Math.round(Number(fDev.quantidade) * desmascarar(fDev.valorUnitario) * 100) / 100;
    const nat = NATUREZAS_DEVOLUCAO.find(n => n.codigo === fDev.cfop);
    const obs = [
      fDev.nfe_ref ? `Ref. NF-e ${fDev.nfe_ref}.` : "",
      fDev.chave_ref ? `Chave: ${fDev.chave_ref}.` : "",
      nat?.obs ?? "",
    ].filter(Boolean).join(" ");
    setSalvando(true);
    try {
      await criarNotaFiscal({
        fazenda_id: fazendaId!, numero: proximoNumero(), serie: "1", tipo: "entrada",
        cfop: fDev.cfop, natureza: nat?.descricao ?? fDev.cfop,
        destinatario: fDev.remetente, cnpj_destinatario: fDev.cnpj || undefined,
        valor_total: valor, data_emissao: TODAY, status: "em_digitacao",
        observacao: obs, auto: false,
      });
      setFDev({ remetente: "", cnpj: "", ncm: "1201.10.00", cfop: "2.201", quantidade: "", unidade: "sc", valorUnitario: "", nfe_ref: "", chave_ref: "", observacao: NATUREZAS_DEVOLUCAO[0].obs });
      setModalDevolucao(false);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)); }
    finally { setSalvando(false); }
  };

  // Solicitar cancelamento
  const solicitarCancelamento = async () => {
    if (!modalCancelamento || !motivoCancelamento.trim()) return;
    setSalvando(true);
    try {
      // Atualiza status para cancelada (simulação — integração SEFAZ futura)
      alert(`Cancelamento solicitado para NF-e ${modalCancelamento.numero}.\nProtocolo será gerado após autorização SEFAZ.`);
      setMotivoCancelamento("");
      setModalCancelamento(null);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)); }
    finally { setSalvando(false); }
  };

  // Emitir NF-e Complementar
  const emitirComplemento = async () => {
    if (!modalComplemento || !fComp.valorComplemento) return;
    const valor = desmascarar(fComp.valorComplemento);
    const motivoTexto = {
      diferenca_peso: "Complemento por diferença de peso apurada na pesagem do comprador.",
      diferenca_preco: "Complemento por ajuste de preço conforme contrato.",
      diferenca_qualidade: "Complemento por desconto de classificação reconhecido.",
      outros: "Complemento de valor — conforme justificativa.",
    }[fComp.motivo] ?? "";
    const obs = `NF-e complementar à NF-e ${modalComplemento.numero} (${modalComplemento.cfop}). ${motivoTexto} ${fComp.observacao}`.trim();
    setSalvando(true);
    try {
      await criarNotaFiscal({
        fazenda_id: fazendaId!, numero: proximoNumero(), serie: "1", tipo: "saida",
        cfop: modalComplemento.cfop,
        natureza: `Complemento à NF-e ${modalComplemento.numero} — ${NATUREZAS_VENDA.find(n => n.codigo === modalComplemento.cfop)?.descricao ?? modalComplemento.cfop}`,
        destinatario: modalComplemento.destinatario, cnpj_destinatario: modalComplemento.cnpj_destinatario ?? undefined,
        valor_total: valor, data_emissao: TODAY, status: "em_digitacao",
        observacao: obs, auto: false,
      });
      setFComp({ valorComplemento: "", quantidade: "", unidade: "sc", motivo: "diferenca_peso", observacao: "" });
      setModalComplemento(null);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)); }
    finally { setSalvando(false); }
  };

  const consultarSefaz = async (nota: NotaFiscal) => {
    // Simulação: em homologação autoriza automaticamente.
    // Com integração real, chamaria a API SEFAZ aqui.
    try {
      await atualizarStatusNFe(nota.id, "autorizada");
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)); }
  };

  const ABAS: { key: Aba; label: string; count?: number }[] = [
    { key: "venda",        label: "Notas de Venda",      count: notasVenda.length },
    { key: "devolucao",    label: "Nota de Devolução",    count: notasDevolucao.length },
    { key: "cancelamento", label: "Cancelamento de Nota", count: notasCanceladas.length },
    { key: "complemento",  label: "Nota de Complemento"  },
    { key: "certificado",  label: "Certificado Digital"   },
  ];

  const botaoNovo: Record<Aba, { label: string; onClick: () => void } | null> = {
    venda:        { label: "◈ Nova NF-e de Venda",     onClick: () => setModalVenda(true) },
    devolucao:    { label: "◈ Nova NF-e de Devolução", onClick: () => setModalDevolucao(true) },
    cancelamento: null,
    complemento:  null,
    certificado:  null,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Fiscal — Documentos Eletrônicos</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>NF-e, devolução, cancelamento, complemento · certificado A1 · SEFAZ</p>
          </div>
          {botaoNovo[aba] && (
            <button
              onClick={botaoNovo[aba]!.onClick}
              style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {botaoNovo[aba]!.label}
            </button>
          )}
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>
          {carregando && <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando…</div>}
          {erro && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 16px", marginBottom: 14, color: "#791F1F" }}>⚠ {erro}</div>}

          {!carregando && !erro && (
            <>
              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
                {[
                  { label: "NF-e autorizadas",   valor: String(totalAutorizadas),  cor: "#1A4870", sub: `${notas.filter(n => n.auto).length} emitidas automaticamente` },
                  { label: "Faturamento (mês)",   valor: fmtMoeda(faturamentoMes), cor: "#1A4870", sub: "notas autorizadas" },
                  { label: "Certificado A1",       valor: certDiasMin !== null ? `${certDiasMin}d` : "—",  cor: certDiasMin !== null && certDiasMin <= 15 ? "#E24B4A" : "#EF9F27", sub: certs.length === 0 ? "Nenhum certificado" : `${certs.length} certificado(s)` },
                  { label: "Pendências",           valor: String(totalRejeitadas + totalProcessando), cor: totalRejeitadas > 0 ? "#E24B4A" : "#EF9F27", sub: `${totalRejeitadas} rejeitada(s) · ${totalProcessando} processando` },
                ].map((s, i) => (
                  <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: s.cor, marginBottom: 4 }}>{s.valor}</div>
                    <div style={{ fontSize: 10, color: "#444" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Alertas */}
              {certDiasMin !== null && certDiasMin <= 30 && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#791F1F", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>⚠</span>
                  <span style={{ flex: 1 }}><strong>Certificado A1 vencendo em {certDiasMin} dias</strong> — sem ele, nenhuma NF-e pode ser transmitida à SEFAZ.</span>
                  <button onClick={() => setAba("certificado")} style={{ padding: "5px 12px", border: "0.5px solid #E24B4A", borderRadius: 6, background: "#fff", color: "#791F1F", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>Ver certificado</button>
                </div>
              )}

              {/* Abas */}
              <div style={{ display: "flex", borderBottom: "0.5px solid #D4DCE8", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                {ABAS.map(a => (
                  <button key={a.key} onClick={() => setAba(a.key)} style={{
                    padding: "11px 18px", border: "none", background: "transparent", cursor: "pointer",
                    fontWeight: aba === a.key ? 600 : 400, fontSize: 13,
                    color: aba === a.key ? "#1a1a1a" : "#555",
                    borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                  }}>
                    {a.label}
                    {a.count !== undefined && (
                      <span style={{ fontSize: 10, background: aba === a.key ? "#D5E8F5" : "#DEE5EE", color: aba === a.key ? "#0B2D50" : "#555", padding: "1px 6px", borderRadius: 8 }}>{a.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── ABA: NOTAS DE VENDA ── */}
              {aba === "venda" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 6 }}>
                    {[
                      { label: "Todas", count: notasVenda.length, filter: null },
                      { label: "Autorizadas", count: totalAutorizadas, filter: "autorizada" },
                      { label: "Rejeitadas", count: totalRejeitadas, filter: "rejeitada" },
                      { label: "Processando", count: totalProcessando, filter: "em_digitacao" },
                    ].map(f => {
                      const ativo = filtroStatusVenda === f.filter;
                      return (
                        <button key={f.label} onClick={() => setFiltroStatusVenda(ativo ? null : f.filter)}
                          style={{ padding: "5px 12px", borderRadius: 20, border: `0.5px solid ${ativo ? "#1A4870" : "#D4DCE8"}`, fontSize: 12, color: ativo ? "#fff" : "#666", background: ativo ? "#1A4870" : "transparent", cursor: "pointer", fontWeight: ativo ? 600 : 400 }}>
                          {f.label} {(f.count ?? 0) > 0 && <span style={{ fontSize: 10, background: ativo ? "rgba(255,255,255,0.25)" : "#DEE5EE", color: ativo ? "#fff" : "#555", padding: "1px 5px", borderRadius: 8 }}>{f.count}</span>}
                        </button>
                      );
                    })}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>{notas.filter(n => n.auto).length}/{notasVenda.length} emitidas automaticamente</span>
                  </div>
                  <TabelaNFe
                    notas={filtroStatusVenda ? notasVenda.filter(n => n.status === filtroStatusVenda || (filtroStatusVenda === "rejeitada" && n.status === "denegada")) : notasVenda}
                    onCancelar={n => setModalCancelamento(n)}
                    onComplementar={n => { setModalComplemento(n); setAba("complemento"); }}
                    onConsultarSefaz={consultarSefaz}
                    onImprimirDanfe={n => imprimirDanfe(n, danfeCfg)}
                  />
                  <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#444" }}>
                      Faturamento total: <strong style={{ color: "#1a1a1a" }}>{fmtMoeda(notasVenda.filter(n => n.status === "autorizada").reduce((a, n) => a + n.valor_total, 0))}</strong>
                    </span>
                    <span style={{ fontSize: 11, color: "#444" }}>XMLs arquivados por 5 anos conforme legislação</span>
                  </div>
                </div>
              )}

              {/* ── ABA: NOTA DE DEVOLUÇÃO ── */}
              {aba === "devolucao" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", background: "#F3F6F9" }}>
                    <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                      A <strong>Nota de Devolução</strong> é emitida quando o comprador devolve mercadoria anteriormente vendida.
                      CFOPs utilizados: <strong>1.201</strong> (intraestadual) e <strong>2.201</strong> (interestadual).
                      Deve referenciar a chave da NF-e original.
                    </div>
                  </div>
                  {notasDevolucao.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>↩</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A4870", marginBottom: 6 }}>Nenhuma devolução registrada</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>Clique em "Nova NF-e de Devolução" para registrar uma devolução de mercadoria.</div>
                      <button onClick={() => setModalDevolucao(true)} style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        ◈ Nova NF-e de Devolução
                      </button>
                    </div>
                  ) : (
                    <TabelaNFe notas={notasDevolucao} />
                  )}
                </div>
              )}

              {/* ── ABA: CANCELAMENTO ── */}
              {aba === "cancelamento" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", background: "#FFF7ED" }}>
                    <div style={{ fontSize: 12, color: "#633806", lineHeight: 1.6 }}>
                      <strong>⚠ Regras para cancelamento:</strong> NF-e pode ser cancelada em até <strong>24 horas</strong> após autorização sem justificativa especial.
                      Após 24h e até 30 dias, exige protocolo de Carta de Correção ou autorização prévia da SEFAZ.
                      NF-e com circulação de mercadoria não pode ser cancelada.
                    </div>
                  </div>

                  {/* NF-e autorizadas (candidatas a cancelamento) */}
                  {notasAutorizadas.length > 0 && (
                    <div>
                      <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#555", background: "#F3F6F9", borderBottom: "0.5px solid #DEE5EE" }}>
                        NF-E AUTORIZADAS — clique para solicitar cancelamento
                      </div>
                      {notasAutorizadas.map(n => {
                        const dataEmissao = new Date(n.data_emissao + "T12:00:00");
                        const horasDesde = (Date.now() - dataEmissao.getTime()) / 3600000;
                        const dentroJanela = horasDesde <= 24;
                        return (
                          <div key={n.id} style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>NF-e {n.numero} — {n.destinatario}</div>
                              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                {fmtData(n.data_emissao)} · CFOP {n.cfop} · {fmtMoeda(n.valor_total)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, color: dentroJanela ? "#16A34A" : "#EF9F27", fontWeight: 600, marginBottom: 4 }}>
                                {dentroJanela ? "✓ Dentro da janela de 24h" : "⚠ Fora da janela de 24h"}
                              </div>
                              <button
                                onClick={() => setModalCancelamento(n)}
                                style={{ padding: "5px 12px", border: "0.5px solid #E24B4A", borderRadius: 6, background: "#FCEBEB", color: "#791F1F", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                              >
                                Solicitar Cancelamento
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* NF-e já canceladas */}
                  {notasCanceladas.length > 0 && (
                    <div>
                      <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#555", background: "#F3F6F9", borderBottom: "0.5px solid #DEE5EE", borderTop: "0.5px solid #DEE5EE" }}>
                        NOTAS CANCELADAS
                      </div>
                      <TabelaNFe notas={notasCanceladas} />
                    </div>
                  )}

                  {notasAutorizadas.length === 0 && notasCanceladas.length === 0 && (
                    <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>○</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A4870", marginBottom: 6 }}>Nenhuma nota para cancelar</div>
                      <div style={{ fontSize: 12, color: "#888" }}>Só aparecem aqui as NF-e autorizadas que ainda podem ser canceladas.</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── ABA: NOTA DE COMPLEMENTO ── */}
              {aba === "complemento" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", background: "#F3F6F9" }}>
                    <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                      A <strong>Nota Complementar</strong> ajusta valor ou quantidade de uma NF-e já autorizada.
                      Casos comuns: diferença de peso na balança do comprador (&gt;1%), ajuste de preço por renegociação, desconto de classificação.
                      Deve usar o mesmo CFOP da nota original.
                    </div>
                  </div>

                  {/* Selecionar NF-e de referência */}
                  <div style={{ padding: 20 }}>
                    {!modalComplemento ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>
                          Selecione a NF-e que receberá o complemento:
                        </div>
                        {notasAutorizadas.length === 0 ? (
                          <div style={{ padding: 30, textAlign: "center", color: "#888", background: "#F3F6F9", borderRadius: 8 }}>
                            Nenhuma NF-e autorizada disponível para complemento.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {notasAutorizadas.map(n => (
                              <div key={n.id} style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#fff" }}
                                onClick={() => setModalComplemento(n)}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>NF-e {n.numero} — {n.destinatario}</div>
                                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                    {fmtData(n.data_emissao)} · CFOP {n.cfop} · {fmtMoeda(n.valor_total)}
                                  </div>
                                </div>
                                <button style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                  Complementar →
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Formulário de complemento */
                      <div>
                        <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
                          <strong>Complementando:</strong> NF-e {modalComplemento.numero} — {modalComplemento.destinatario} · {fmtMoeda(modalComplemento.valor_total)} · CFOP {modalComplemento.cfop}
                          <button onClick={() => setModalComplemento(null)} style={{ marginLeft: 12, fontSize: 11, color: "#555", background: "none", border: "0.5px solid #ccc", borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>Trocar</button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                          <div>
                            <label style={labelSt}>Motivo do complemento *</label>
                            <select style={inputSt} value={fComp.motivo} onChange={e => setFComp(p => ({ ...p, motivo: e.target.value }))}>
                              <option value="diferenca_peso">Diferença de peso (balança destino)</option>
                              <option value="diferenca_preco">Ajuste de preço por renegociação</option>
                              <option value="diferenca_qualidade">Desconto de classificação</option>
                              <option value="outros">Outros</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelSt}>Valor do complemento (R$) *</label>
                            <input style={{ ...inputSt, textAlign: "right" }} type="text" inputMode="numeric" placeholder="0,00"
                              value={fComp.valorComplemento}
                              onChange={e => setFComp(p => ({ ...p, valorComplemento: aplicarMascara(e.target.value) }))} />
                            <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Apenas o valor da diferença</div>
                          </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={labelSt}>Observações adicionais</label>
                          <textarea style={{ ...inputSt, height: 60, resize: "vertical", fontSize: 12 }}
                            value={fComp.observacao}
                            onChange={e => setFComp(p => ({ ...p, observacao: e.target.value }))}
                            placeholder="Ex: Peso origem 69.320 kg / Peso destino 68.950 kg / Diferença -370 kg" />
                        </div>

                        <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50", marginBottom: 14 }}>
                          ⟳ A NF-e complementar usará o mesmo CFOP ({modalComplemento.cfop}) e destinatário da nota original. Será transmitida à SEFAZ automaticamente.
                        </div>

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setModalComplemento(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                          <button
                            onClick={emitirComplemento}
                            disabled={!fComp.valorComplemento || salvando}
                            style={{ padding: "8px 18px", background: !fComp.valorComplemento || salvando ? "#666" : "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                          >
                            {salvando ? "Emitindo…" : "◈ Emitir NF-e Complementar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── ABA: CERTIFICADO ── */}
              {aba === "certificado" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>Certificados Digitais A1</div>
                      <button onClick={() => { setCertProdId(produtores.length === 1 ? produtores[0].id : ""); setModalCert(true); }}
                        style={{ padding: "6px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                        + Adicionar certificado
                      </button>
                    </div>

                    {certs.length === 0 ? (
                      <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "28px 20px", textAlign: "center", color: "#888", fontSize: 13 }}>
                        Nenhum certificado configurado.<br />
                        <span style={{ fontSize: 11, color: "#aaa" }}>Clique em "Adicionar certificado" para carregar o arquivo .pfx ou .p12.</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {certs.map(cert => {
                          const dias = calcDias(cert.data_vencimento);
                          const borderColor = dias !== null && dias <= 15 ? "#E24B4A50" : dias !== null && dias <= 30 ? "#EF9F2750" : "#D4DCE8";
                          const badgeBg = dias !== null && dias <= 15 ? "#FCEBEB" : dias !== null && dias <= 30 ? "#FEF3E2" : "#D5E8F5";
                          const badgeColor = dias !== null && dias <= 15 ? "#791F1F" : dias !== null && dias <= 30 ? "#7A4800" : "#0B2D50";
                          return (
                            <div key={cert.modulo} style={{ background: "#fff", border: `0.5px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{cert.produtor_nome || "—"}</div>
                                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{cert.cpf_cnpj || "—"}</div>
                                </div>
                                {dias !== null && (
                                  <span style={{ fontSize: 10, fontWeight: 600, background: badgeBg, color: badgeColor, padding: "3px 8px", borderRadius: 6 }}>
                                    {dias <= 0 ? "VENCIDO" : `${dias}d`}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {[
                                  { label: "Arquivo",  valor: cert.arquivo_nome || "—" },
                                  { label: "Tipo",     valor: "A1 — .pfx / .p12" },
                                  { label: "Validade", valor: cert.data_vencimento ? fmtData(cert.data_vencimento) : "—" },
                                ].map((r, i) => (
                                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid #F0F2F7" }}>
                                    <span style={{ fontSize: 11, color: "#555" }}>{r.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>{r.valor}</span>
                                  </div>
                                ))}
                              </div>
                              {dias !== null && (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ height: 5, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, dias / 365 * 100))}%`, background: dias <= 15 ? "#E24B4A" : dias <= 30 ? "#EF9F27" : "#1A4870", borderRadius: 4 }} />
                                  </div>
                                </div>
                              )}
                              {dias !== null && dias <= 30 && (
                                <div style={{ marginTop: 8, background: "#FCEBEB", border: "0.5px solid #E24B4A30", borderRadius: 6, padding: "7px 10px", fontSize: 11, color: "#791F1F" }}>
                                  ⚠ Renove antes de {cert.data_vencimento ? fmtData(cert.data_vencimento) : "—"}. Após o vencimento todas as transmissões serão bloqueadas.
                                </div>
                              )}
                              <button onClick={() => { setCertProdId(cert.produtor_id); setModalCert(true); }}
                                style={{ marginTop: 10, width: "100%", padding: "7px 0", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                Atualizar certificado
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 14 }}>Como renovar</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        { n: "1", titulo: "Acesse a certificadora", desc: "Serasa, Certisign, Valid ou outra ICP-Brasil. Use o mesmo CNPJ." },
                        { n: "2", titulo: "Solicite um novo A1", desc: "Tipo A1 (arquivo de software). Não precisa de token ou cartão." },
                        { n: "3", titulo: "Faça o download do .pfx / .p12", desc: "O arquivo .pfx ou .p12 contém o certificado + chave privada." },
                        { n: "4", titulo: "Atualize no Arato", desc: 'Clique em "Atualizar certificado" no card do produtor correspondente.' },
                      ].map(s => (
                        <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 24, height: 24, background: "#D5E8F5", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#0B2D50", flexShrink: 0 }}>{s.n}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: "#1a1a1a", marginBottom: 2 }}>{s.titulo}</div>
                            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{s.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── MODAL: Certificado A1 ── */}
      {modalCert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) fecharCert(); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 460, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Carregar certificado A1</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>Arquivo .pfx ou .p12 do e-CNPJ ou e-CPF</div>
            <div style={{ display: "grid", gap: 14 }}>
              {produtores.length > 1 && (
                <div>
                  <label style={labelSt}>Produtor / Titular *</label>
                  <select value={certProdId} onChange={e => setCertProdId(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }}>
                    <option value="">Selecione...</option>
                    {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.cpf_cnpj ?? "—"}</option>)}
                  </select>
                </div>
              )}
              {produtores.length === 1 && (
                <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#555" }}>
                  <span style={{ color: "#888", fontSize: 11 }}>Titular: </span><strong>{produtores[0].nome}</strong>
                </div>
              )}
              {/* Área de arquivo */}
              <div>
                <label style={labelSt}>Arquivo .pfx / .p12 *</label>
                <input ref={certFileRef} type="file" accept=".pfx,.p12" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setCertFile(f); e.target.value = ""; }} />
                {certFile ? (
                  <div style={{ border: "0.5px solid #28a745", borderRadius: 8, padding: "14px 16px", background: "#D4EDDA", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#155724", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{certFile.name}</div>
                      <div style={{ fontSize: 11, color: "#155724" }}>{(certFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onClick={() => setCertFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#155724", fontSize: 16, padding: "2px 6px" }}>×</button>
                  </div>
                ) : (
                  <div onClick={() => certFileRef.current?.click()} onDragOver={e => { e.preventDefault(); setCertDrag(true); }} onDragLeave={() => setCertDrag(false)}
                    onDrop={e => { e.preventDefault(); setCertDrag(false); const f = e.dataTransfer.files?.[0]; if (f && (f.name.endsWith(".pfx") || f.name.endsWith(".p12"))) setCertFile(f); else if (f) alert("Selecione .pfx ou .p12"); }}
                    style={{ border: `0.5px dashed ${certDrag ? "#1A4870" : "#aab"}`, borderRadius: 8, padding: "28px 20px", textAlign: "center", background: certDrag ? "#EEF4FF" : "#F7FDFA", cursor: "pointer" }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>{certDrag ? "Solte aqui" : "Clique ou arraste"}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>arquivo .pfx ou .p12</div>
                  </div>
                )}
              </div>
              {/* Senha */}
              <div>
                <label style={labelSt}>Senha do certificado *</label>
                <input style={inputSt} type="password" placeholder="Senha do .pfx / .p12" value={certSenha} onChange={e => setCertSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && certFile && certSenha.trim()) salvarCertificado(); }} />
              </div>
            </div>
            {certOk && <div style={{ marginTop: 14, background: "#D4EDDA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#155724", fontWeight: 600 }}>✓ Certificado carregado com sucesso!</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={fecharCert} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarCertificado} disabled={!certFile || !certSenha.trim() || certLoading || certOk}
                style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: !certFile || !certSenha.trim() || certLoading ? "not-allowed" : "pointer", opacity: !certFile || !certSenha.trim() || certLoading ? 0.5 : 1 }}>
                {certLoading ? "Carregando..." : "🔒 Carregar certificado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Nova NF-e de Venda ── */}
      {modalVenda && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalVenda(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 780, maxWidth: "97vw", maxHeight: "95vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Nova NF-e de Venda</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Emissão avulsa. NF-e vinculadas a contratos são emitidas automaticamente.</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 14, marginBottom: 14 }}>
              <div><label style={labelSt}>Destinatário *</label><input style={inputSt} placeholder="Bunge Alimentos S.A." value={fVenda.destinatario} onChange={e => setFVenda(p => ({ ...p, destinatario: e.target.value }))} /></div>
              <div><label style={labelSt}>CNPJ / CPF</label><input style={inputSt} placeholder="00.000.000/0001-00" value={fVenda.cnpj} onChange={e => setFVenda(p => ({ ...p, cnpj: e.target.value }))} /></div>
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={labelSt}>Natureza da Operação / CFOP *</label>
              <select style={inputSt} value={fVenda.cfop} onChange={e => { const nat = NATUREZAS_VENDA.find(n => n.codigo === e.target.value); setFVenda(p => ({ ...p, cfop: e.target.value, observacao: nat?.obs ?? p.observacao })); }}>
                {NATUREZAS_VENDA.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>)}
              </select>
            </div>
            {(() => { const nat = NATUREZAS_VENDA.find(n => n.codigo === fVenda.cfop); if (!nat) return null; return <div style={{ background: "#EBF4FB", border: "0.5px solid #93C5E8", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "#0B2D50" }}><strong>Obrigações:</strong> {nat.obs}</div>; })()}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 160px", gap: 14, marginBottom: 14 }}>
              <div><label style={labelSt}>NCM *</label><select style={inputSt} value={fVenda.ncm} onChange={e => setFVenda(p => ({ ...p, ncm: e.target.value }))}>{NCM_OPTIONS.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>)}</select></div>
              <div><label style={labelSt}>Quantidade *</label><input style={{ ...inputSt, textAlign: "right" }} type="text" inputMode="numeric" placeholder="0" value={fVenda.quantidade} onChange={e => setFVenda(p => ({ ...p, quantidade: e.target.value.replace(/\D/g, "") }))} /></div>
              <div><label style={labelSt}>Unidade</label><select style={inputSt} value={fVenda.unidade} onChange={e => setFVenda(p => ({ ...p, unidade: e.target.value }))}><option value="sc">sc</option><option value="kg">kg</option><option value="ton">ton</option><option value="@">@</option></select></div>
              <div><label style={labelSt}>Valor unit. (R$) *</label><input style={{ ...inputSt, textAlign: "right" }} type="text" inputMode="numeric" placeholder="0,00" value={fVenda.valorUnitario} onChange={e => setFVenda(p => ({ ...p, valorUnitario: aplicarMascara(e.target.value) }))} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...labelSt, display: "flex", alignItems: "center", gap: 8 }}>
                Informações Complementares (infCpl)
                <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "1px 7px", borderRadius: 6, fontWeight: 600 }}>Obrigatório · consta no DANFE</span>
              </label>
              <textarea style={{ ...inputSt, height: 70, resize: "vertical", fontSize: 12 }} value={fVenda.observacao} onChange={e => setFVenda(p => ({ ...p, observacao: e.target.value }))} />
            </div>
            {(() => { const v = fVenda.quantidade && fVenda.valorUnitario ? Math.round(Number(fVenda.quantidade) * desmascarar(fVenda.valorUnitario) * 100) / 100 : 0; if (!v) return null; return <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50", marginBottom: 12 }}>Valor total: <strong style={{ fontSize: 15 }}>{fmtMoeda(v)}</strong></div>; })()}
            <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50", marginBottom: 16 }}>⟳ Após salvar, a NF-e será assinada e transmitida à SEFAZ automaticamente.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModalVenda(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={emitirVenda} disabled={!fVenda.destinatario || !fVenda.quantidade || !fVenda.valorUnitario || salvando} style={{ padding: "8px 18px", background: fVenda.destinatario && fVenda.quantidade && fVenda.valorUnitario && !salvando ? "#1A4870" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Emitindo…" : "⟳ Emitir NF-e"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Nova NF-e de Devolução ── */}
      {modalDevolucao && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalDevolucao(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 780, maxWidth: "97vw", maxHeight: "95vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Nova NF-e de Devolução</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Emitida quando o comprador devolve mercadoria. Deve referenciar a NF-e original.</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 14, marginBottom: 14 }}>
              <div><label style={labelSt}>Remetente (quem devolve) *</label><input style={inputSt} placeholder="Bunge Alimentos S.A." value={fDev.remetente} onChange={e => setFDev(p => ({ ...p, remetente: e.target.value }))} /></div>
              <div><label style={labelSt}>CNPJ / CPF</label><input style={inputSt} placeholder="00.000.000/0001-00" value={fDev.cnpj} onChange={e => setFDev(p => ({ ...p, cnpj: e.target.value }))} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div><label style={labelSt}>NF-e de referência (número)</label><input style={inputSt} placeholder="Ex: 001.001" value={fDev.nfe_ref} onChange={e => setFDev(p => ({ ...p, nfe_ref: e.target.value }))} /></div>
              <div><label style={labelSt}>Chave de acesso (44 dígitos)</label><input style={inputSt} placeholder="00000000000000000000000000000000000000000000" value={fDev.chave_ref} onChange={e => setFDev(p => ({ ...p, chave_ref: e.target.value.replace(/\D/g, "").slice(0, 44) }))} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>CFOP da devolução *</label>
              <select style={inputSt} value={fDev.cfop} onChange={e => { const nat = NATUREZAS_DEVOLUCAO.find(n => n.codigo === e.target.value); setFDev(p => ({ ...p, cfop: e.target.value, observacao: nat?.obs ?? p.observacao })); }}>
                {NATUREZAS_DEVOLUCAO.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 160px", gap: 14, marginBottom: 14 }}>
              <div><label style={labelSt}>NCM *</label><select style={inputSt} value={fDev.ncm} onChange={e => setFDev(p => ({ ...p, ncm: e.target.value }))}>{NCM_OPTIONS.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>)}</select></div>
              <div><label style={labelSt}>Quantidade *</label><input style={{ ...inputSt, textAlign: "right" }} type="text" inputMode="numeric" placeholder="0" value={fDev.quantidade} onChange={e => setFDev(p => ({ ...p, quantidade: e.target.value.replace(/\D/g, "") }))} /></div>
              <div><label style={labelSt}>Unidade</label><select style={inputSt} value={fDev.unidade} onChange={e => setFDev(p => ({ ...p, unidade: e.target.value }))}><option value="sc">sc</option><option value="kg">kg</option><option value="ton">ton</option></select></div>
              <div><label style={labelSt}>Valor unit. (R$) *</label><input style={{ ...inputSt, textAlign: "right" }} type="text" inputMode="numeric" placeholder="0,00" value={fDev.valorUnitario} onChange={e => setFDev(p => ({ ...p, valorUnitario: aplicarMascara(e.target.value) }))} /></div>
            </div>
            {(() => { const v = fDev.quantidade && fDev.valorUnitario ? Math.round(Number(fDev.quantidade) * desmascarar(fDev.valorUnitario) * 100) / 100 : 0; if (!v) return null; return <div style={{ background: "#FAEEDA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#633806", marginBottom: 12 }}>Valor total da devolução: <strong style={{ fontSize: 15 }}>{fmtMoeda(v)}</strong></div>; })()}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModalDevolucao(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={emitirDevolucao} disabled={!fDev.remetente || !fDev.quantidade || !fDev.valorUnitario || salvando} style={{ padding: "8px 18px", background: fDev.remetente && fDev.quantidade && fDev.valorUnitario && !salvando ? "#1A4870" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Emitindo…" : "⟳ Emitir NF-e de Devolução"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Cancelamento ── */}
      {modalCancelamento && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalCancelamento(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 520, maxWidth: "97vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>Cancelar NF-e</div>
            <div style={{ background: "#F3F6F9", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#555" }}>
              <strong>NF-e {modalCancelamento.numero}</strong> — {modalCancelamento.destinatario}<br />
              {fmtData(modalCancelamento.data_emissao)} · {fmtMoeda(modalCancelamento.valor_total)}
            </div>
            <div style={{ background: "#FFF7ED", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#633806", marginBottom: 16 }}>
              ⚠ O cancelamento só é permitido dentro de 24h da autorização (sem circulação de mercadoria). Após isso, exige processo especial na SEFAZ.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Justificativa do cancelamento * <span style={{ color: "#888" }}>(mín. 15 caracteres)</span></label>
              <textarea
                style={{ ...inputSt, height: 80, resize: "vertical", fontSize: 12 }}
                placeholder="Ex: Erro no valor unitário — contrato revisado com o comprador."
                value={motivoCancelamento}
                onChange={e => setMotivoCancelamento(e.target.value)}
              />
              <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>{motivoCancelamento.length} caracteres</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setModalCancelamento(null); setMotivoCancelamento(""); }} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Fechar</button>
              <button
                onClick={solicitarCancelamento}
                disabled={motivoCancelamento.length < 15 || salvando}
                style={{ padding: "8px 18px", background: motivoCancelamento.length >= 15 && !salvando ? "#E24B4A" : "#ccc", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              >
                {salvando ? "Enviando…" : "Solicitar Cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Fiscal() {
  return (
    <Suspense fallback={null}>
      <FiscalInner />
    </Suspense>
  );
}
