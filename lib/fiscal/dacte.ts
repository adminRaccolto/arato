// DACTE (Documento Auxiliar do CT-e, modelo 57) — gerador único, usado pela tela de CT-e (CT-e emitido pela fazenda)
// e por Documentos Fiscais → Notas de Fornecedores (CT-e recebido, montado a partir do XML: lib/fiscal/dacte-xml.ts).
// Extraído de app/transporte/cte/page.tsx em 13/11/2026 sem mudar o layout.

export type TomadorTipo = "remetente" | "destinatario" | "expedidor" | "recebedor" | "outros";

/** Campos que o DACTE imprime. Expedidor/recebedor/tomador "outros" vêm das propriedades <pref>_nome, <pref>_cnpj etc. (particDeCte). */
export interface DadosDacte {
  numero_cte: string; serie: string; chave_acesso?: string | null; data_emissao: string; status: string; tipo_cte?: string | null;
  cfop: string; natureza_operacao: string; tomador_tipo: TomadorTipo;
  emitente_razao_social?: string | null; emitente_cnpj?: string | null;
  remetente_nome: string; remetente_cnpj?: string | null; destinatario_nome: string; destinatario_cnpj?: string | null;
  municipio_origem: string; uf_origem: string; municipio_destino: string; uf_destino: string;
  produto_descricao: string; ncm?: string | null; peso_bruto_kg: number; peso_liquido_kg: number; valor_mercadoria: number;
  valor_frete: number; base_calc_icms: number; aliquota_icms: number; cst_icms?: string | null; pred_bc_icms?: number | null; valor_icms: number;
  nfe_chave?: string | null; protocolo_autorizacao?: string | null; observacao?: string | null;
  remetente_ie?: string | null; destinatario_ie?: string | null;
}

// Expedidor / Recebedor — participantes opcionais do CT-e (grupos <exped>/<receb>; tomador 1/2).
export type ParticCte = { nome: string; cnpj: string; ie: string; logradouro: string; numero: string; bairro: string; cep: string; municipio: string; uf: string; ibge: string };
export const PARTIC_VAZIO = (): ParticCte => ({ nome: "", cnpj: "", ie: "", logradouro: "", numero: "", bairro: "", cep: "", municipio: "", uf: "MT", ibge: "" });
export const COLS_PARTIC: (keyof ParticCte)[] = ["nome", "cnpj", "ie", "logradouro", "numero", "bairro", "cep", "municipio", "uf", "ibge"];
export const particDeCte = (c: unknown, pref: "expedidor" | "recebedor" | "tomador"): ParticCte => {
  const r = c as Record<string, unknown>; const o = PARTIC_VAZIO();
  for (const k of COLS_PARTIC) { const v = r[`${pref}_${k}`]; if (v != null) o[k] = String(v); }
  return o;
};

// ─────────────────────────────────────────────────────────────
// DACTE — Documento Auxiliar do CT-e Modelo 57
// ─────────────────────────────────────────────────────────────
// DACTE — layout no padrão oficial do modelo 57 (o mesmo formato usado pela maioria dos emissores
// do mercado — ex.: fsist/ACBr), reproduzido a partir de um DACTE de referência trazido pelo dono
// em 23/09/2026 (o layout anterior era um resumo em caixas, bem diferente do documento oficial).
export function htmlDacte(c: DadosDacte, logoUrl?: string | null, rntrcEmpresa?: string | null): string {
  const chave44 = (c.chave_acesso ?? "").replace(/\D/g, "");
  const dataFmt = c.data_emissao ? new Date(c.data_emissao + "T12:00:00") : null;
  const dataHoraFmt = dataFmt ? `${dataFmt.toLocaleDateString("pt-BR")} ${dataFmt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "—";
  const numFmt = c.numero_cte;
  const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const emitNome = c.emitente_razao_social ?? "—";
  const emitCnpj = c.emitente_cnpj ?? "—";

  // Chave formatada em blocos de 4 — mesmo padrão do DANFE/DACTE oficial
  const chaveFmt = chave44 ? chave44.replace(/(\d{4})(?=\d)/g, "$1.").trim() : "";

  const TOMADOR_LABEL: Record<TomadorTipo, string> = {
    remetente: "Remetente", expedidor: "Expedidor", recebedor: "Recebedor", destinatario: "Destinatário", outros: "Outros",
  };

  // Situação tributária do ICMS — mesma regra do builder do CT-e (lib/cte/builder.ts):
  // c.cst_icms explícito (00/40/41/51); CT-e's antigos sem o campo caem na heurística por alíquota.
  const cstIcmsDacte = c.cst_icms || (c.aliquota_icms > 0 ? "00" : "40");
  const SITUACAO_TRIB_LABEL: Record<string, string> = {
    "00": "00 - Tributação normal ICMS", "20": "20 - ICMS com redução de base de cálculo", "40": "40 - ICMS isenção",
    "41": "41 - ICMS não tributado", "51": "51 - ICMS diferido",
  };
  const situacaoTrib = SITUACAO_TRIB_LABEL[cstIcmsDacte] ?? cstIcmsDacte;

  const exp = particDeCte(c, "expedidor");
  const rec = particDeCte(c, "recebedor");
  const tom = particDeCte(c, "tomador");
  const tomadorPessoa =
    c.tomador_tipo === "destinatario"
      ? { nome: c.destinatario_nome, cnpj: c.destinatario_cnpj, municipio: c.municipio_destino, uf: c.uf_destino }
      : c.tomador_tipo === "outros"
        ? { nome: tom.nome, cnpj: tom.cnpj, municipio: tom.municipio, uf: tom.uf }
      : c.tomador_tipo === "expedidor"
        ? { nome: exp.nome, cnpj: exp.cnpj, municipio: exp.municipio, uf: exp.uf }
        : c.tomador_tipo === "recebedor"
          ? { nome: rec.nome, cnpj: rec.cnpj, municipio: rec.municipio, uf: rec.uf }
          : { nome: c.remetente_nome, cnpj: c.remetente_cnpj, municipio: c.municipio_origem, uf: c.uf_origem };
  const blocoPartic = (titulo: string, p: ParticCte) => `<div class="cel" style="flex:1">
      <div class="lbl">${titulo}</div>${p.nome ? `<div class="val">${p.nome}</div>` : ""}
      <div class="lbl" style="margin-top:0.6mm">ENDEREÇO ${p.nome ? `<strong>${[p.logradouro, p.numero, p.bairro].filter(Boolean).join(", ")}</strong>` : ""}</div>
      <div class="lbl">MUNICÍPIO ${p.nome ? `<strong>${p.municipio} - ${p.uf}</strong>` : ""}</div>
      <div class="lbl">CNPJ/CPF ${p.nome ? `<strong>${p.cnpj}</strong> INSCRIÇÃO ESTADUAL <strong>${p.ie}</strong>` : ""}</div>
      <div class="lbl">PAÍS ${p.nome ? "<strong>BRASIL</strong>" : ""}</div>
    </div>`;

  // Célula de "campo": label pequeno em cima, valor em negrito embaixo — a unidade repetida do
  // documento oficial inteiro. `w` é a largura da coluna dentro da linha (flex-grow).
  const campo = (label: string, valor: string, w = 1) =>
    `<div class="cel" style="flex:${w}"><div class="lbl">${label}</div><div class="val">${valor}</div></div>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>DACTE CT-e ${numFmt} — Série ${c.serie}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:7.4pt;color:#000;background:#fff}
/* Achado real 23/09/2026: @page já reservava 6mm de margem E .page também tinha 210mm de
   largura fixa — margem duplicada. O motor de impressão/PDF, sem espaço pra encaixar
   210mm dentro de uma área útil de 198mm, reduzia a página inteira (texto, campos e logo
   junto) pra caber — daí o efeito "achatado"/desproporcional. Corrigido: @page sem margem
   própria, .page é o único responsável pela margem (padding), tamanho physical real. */
.page{width:210mm;min-height:297mm;margin:0 auto;padding:9mm 8mm}
.grid{display:flex;flex-wrap:wrap;border-left:0.3mm solid #000;border-top:0.3mm solid #000}
.grid .cel{border-right:0.3mm solid #000;border-bottom:0.3mm solid #000;padding:1mm 1.8mm;min-width:0}
.lbl{font-size:5.8pt;color:#000;white-space:nowrap}
.val{font-size:7.8pt;font-weight:700;word-break:break-word}
.section-title{flex:1;background:#eaeaea;font-size:7pt;font-weight:700;padding:0.8mm 1.8mm;border-right:0.3mm solid #000;border-bottom:0.3mm solid #000}
.center{text-align:center}
.big{font-size:11pt}
table.mini{width:100%;border-collapse:collapse}
table.mini td{padding:0}
@page{size:A4;margin:0}
@media print{body{margin:0}}
</style></head><body>
<div class="page">

  <!-- Canhoto de recebimento -->
  <div class="grid">
    <div class="cel" style="flex:5">
      <div class="lbl">DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE</div>
      <table class="mini" style="margin-top:5mm"><tr>
        <td style="width:50%;border-right:0.3mm solid #000;padding-top:2mm"><div class="lbl">NOME</div><div style="border-top:0.3mm solid #000;margin-top:6mm;padding-top:0.5mm" class="lbl center">ASSINATURA / CARIMBO</div></td>
        <td style="width:50%;padding-left:1.5mm"><div class="lbl">RG</div></td>
      </tr></table>
    </div>
    <div class="cel" style="flex:1.6">
      <div class="lbl">TÉRMINO DA PRESTAÇÃO - DATA/HORA</div><br/>
      <div class="lbl" style="margin-top:4mm">INÍCIO DA PRESTAÇÃO - DATA/HORA</div>
    </div>
    <div class="cel" style="flex:0.7;text-align:right">
      <div class="val">CT-E</div>
      <div class="lbl" style="margin-top:1mm">Nº. DOCUMENTO</div><div class="val">${numFmt}</div>
      <div class="lbl" style="margin-top:1mm">SÉRIE</div><div class="val">${c.serie}</div>
    </div>
  </div>

  <!-- Identificação do emitente / DACTE / modal -->
  <div class="grid" style="margin-top:1.5mm">
    <div class="cel" style="flex:2.3">
      ${logoUrl ? `<img src="${logoUrl}" style="max-height:20mm;max-width:100%;object-fit:contain;margin-bottom:1.5mm" />` : ""}
      <div class="val" style="font-size:8.5pt">${emitNome}</div>
      <div class="lbl">CNPJ/CPF: ${emitCnpj}</div>
    </div>
    <div class="cel center" style="flex:2.6">
      <div class="val big">DACTE</div>
      <div class="lbl">Documento Auxiliar do Conhecimento<br/>de Transporte Eletrônico</div>
    </div>
    <div class="cel center" style="flex:1">
      <div class="lbl">MODAL</div>
      <div class="val">Rodoviário</div>
    </div>
  </div>
  <div class="grid">
    ${campo("MODELO", "57")}
    ${campo("SÉRIE", c.serie)}
    ${campo("NÚMERO", numFmt)}
    ${campo("FL", "1/1")}
    ${campo("DATA E HORA DE EMISSÃO", dataHoraFmt, 2)}
    ${campo("INSC. SUFRAMA DO DESTINATÁRIO", "", 2)}
  </div>

  <!-- Código de barras da chave -->
  <div class="grid">
    <div class="cel center" style="flex:1;padding:1.5mm">
      ${chave44.length === 44 ? `<svg id="barcode"></svg>` : `<div class="lbl" style="color:#B91C1C;font-weight:700">CT-e ainda não autorizado pela SEFAZ</div>`}
    </div>
  </div>

  <!-- Tipo CT-e / Tipo serviço / Chave de acesso -->
  <div class="grid">
    ${campo("TIPO DO CTE", c.status === "cancelado" ? "Cancelamento" : c.tipo_cte === "substituto" ? "Substituto" : "Normal", 1)}
    ${campo("TIPO DO SERVIÇO", "Normal", 1)}
    <div class="cel" style="flex:3">
      <div class="lbl">CHAVE DE ACESSO</div>
      <div class="val center" style="font-family:monospace;letter-spacing:0.3px">${chaveFmt || "—"}</div>
      <div class="lbl center" style="margin-top:0.8mm">Consulta de autenticidade no portal nacional do CT-e, no site da Sefaz Autorizadora,<br/>ou em http://www.cte.fazenda.gov.br</div>
    </div>
  </div>

  <!-- Tomador do serviço -->
  <div class="grid">
    ${campo("TOMADOR DO SERVIÇO", TOMADOR_LABEL[c.tomador_tipo], 1)}
  </div>

  <!-- CFOP / Protocolo -->
  <div class="grid">
    ${campo("CFOP - NATUREZA DA PRESTAÇÃO", `${c.cfop} - ${c.natureza_operacao}`, 1)}
    ${campo("PROTOCOLO DE AUTORIZAÇÃO DE USO", c.protocolo_autorizacao ? `${c.protocolo_autorizacao} - ${dataHoraFmt}` : "—", 1)}
  </div>

  <!-- Início / Término da prestação -->
  <div class="grid">
    ${campo("INÍCIO DA PRESTAÇÃO", `${c.municipio_origem} - ${c.uf_origem}`, 1)}
    ${campo("TÉRMINO DA PRESTAÇÃO", `${c.municipio_destino} - ${c.uf_destino}`, 1)}
  </div>

  <!-- Remetente / Destinatário -->
  <div class="grid">
    <div class="cel" style="flex:1">
      <div class="lbl">REMETENTE</div><div class="val">${c.remetente_nome}</div>
      <div class="lbl" style="margin-top:0.6mm">ENDEREÇO</div>
      <div class="lbl">MUNICÍPIO <strong>${c.municipio_origem} - ${c.uf_origem}</strong></div>
      <div class="lbl">CNPJ/CPF <strong>${c.remetente_cnpj ?? "—"}</strong> INSCRIÇÃO ESTADUAL <strong>${c.remetente_ie ?? ""}</strong></div>
      <div class="lbl">PAÍS <strong>BRASIL</strong></div>
    </div>
    <div class="cel" style="flex:1">
      <div class="lbl">DESTINATÁRIO</div><div class="val">${c.destinatario_nome}</div>
      <div class="lbl" style="margin-top:0.6mm">ENDEREÇO</div>
      <div class="lbl">MUNICÍPIO <strong>${c.municipio_destino} - ${c.uf_destino}</strong></div>
      <div class="lbl">CNPJ/CPF <strong>${c.destinatario_cnpj ?? "—"}</strong> INSCRIÇÃO ESTADUAL <strong>${c.destinatario_ie ?? ""}</strong></div>
      <div class="lbl">PAÍS <strong>BRASIL</strong></div>
    </div>
  </div>

  <!-- Expedidor / Recebedor — preenchidos quando informados na emissão; em branco quando não se aplicam -->
  <div class="grid">
    ${blocoPartic("EXPEDIDOR", exp)}
    ${blocoPartic("RECEBEDOR", rec)}
  </div>

  <!-- Tomador do serviço (dados completos) -->
  <div class="grid">
    <div class="cel" style="flex:1">
      <div class="lbl">TOMADOR DO SERVIÇO <strong>${tomadorPessoa.nome}</strong> MUNICÍPIO <strong>${tomadorPessoa.municipio}</strong> UF <strong>${tomadorPessoa.uf}</strong></div>
      <div class="lbl">CNPJ/CPF <strong>${tomadorPessoa.cnpj ?? "—"}</strong> PAÍS <strong>BRASIL</strong></div>
    </div>
  </div>

  <!-- Carga -->
  <div class="grid">
    ${campo("PRODUTO PREDOMINANTE", c.produto_descricao, 2)}
    ${campo("OUTRAS CARACTERÍSTICAS DA CARGA", c.ncm ?? "", 1)}
    ${campo("VALOR TOTAL DA MERCADORIA", brl(c.valor_mercadoria), 1)}
  </div>
  <div class="grid">
    ${campo("PESO BRUTO (KG)", c.peso_bruto_kg.toLocaleString("pt-BR", { minimumFractionDigits: 3 }), 1)}
    ${campo("PESO LÍQUIDO (KG)", c.peso_liquido_kg.toLocaleString("pt-BR", { minimumFractionDigits: 3 }), 1)}
    ${campo("CUBAGEM (M3)", "", 1)}
    ${campo("QTDE (VOL)", "", 1)}
    ${campo("NOME DA SEGURADORA / RESPONSÁVEL / Nº APÓLICE / Nº AVERBAÇÃO", "", 2)}
  </div>

  <!-- Componentes do valor da prestação -->
  <div class="grid">
    <div class="section-title">COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO</div>
  </div>
  <div class="grid">
    <div class="cel" style="flex:2.4">
      <table class="mini">
        <tr><td class="lbl">NOME</td><td class="lbl" style="text-align:right">VALOR</td></tr>
        <tr><td class="val" style="font-size:6.6pt;font-weight:400">Frete Peso</td><td class="val" style="font-size:6.6pt;font-weight:400;text-align:right">${brl(c.valor_frete)}</td></tr>
      </table>
    </div>
    <div class="cel" style="flex:1">
      <div class="lbl">VALOR TOTAL DO SERVIÇO</div><div class="val">${brl(c.valor_frete)}</div>
      <div class="lbl" style="margin-top:1mm">VALOR A RECEBER</div><div class="val">${brl(c.valor_frete)}</div>
    </div>
  </div>

  <!-- Impostos -->
  <div class="grid">
    ${campo("SITUAÇÃO TRIBUTÁRIA", situacaoTrib, 2)}
    ${campo("BASE DE CALCULO", cstIcmsDacte === "00" || cstIcmsDacte === "20" ? brl(c.base_calc_icms) : "—", 1)}
    ${campo("ALÍQ ICMS", cstIcmsDacte === "00" || cstIcmsDacte === "20" ? c.aliquota_icms.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—", 1)}
    ${campo("VALOR ICMS", cstIcmsDacte === "00" || cstIcmsDacte === "20" ? brl(c.valor_icms) : "0,00", 1)}
    ${campo("% RED. BC ICMS", cstIcmsDacte === "20" && c.pred_bc_icms ? Number(c.pred_bc_icms).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", 1)}
    ${campo("ICMS ST", "", 1)}
  </div>

  <!-- Documentos originários -->
  <div class="grid">
    <div class="section-title">DOCUMENTOS ORIGINÁRIOS</div>
  </div>
  <div class="grid">
    ${c.nfe_chave
      ? `${campo("TIPO DOC", "NFE", 0.6)}${campo("CNPJ/CHAVE", c.nfe_chave, 3)}${campo("SÉRIE/NRO. DOCUMENTO", "", 1)}`
      : campo("", "", 1)}
  </div>

  <!-- Observações -->
  <div class="grid">
    <div class="cel" style="flex:1;min-height:14mm"><div class="lbl">OBSERVAÇÕES</div><div class="val" style="font-size:6.6pt;font-weight:400">${c.observacao ?? ""}</div></div>
  </div>

  <!-- Dados do modal rodoviário -->
  <div class="grid">
    <div class="section-title">DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO - CARGA FRACIONADA</div>
  </div>
  <div class="grid">
    ${campo("RNTRC DA EMPRESA", rntrcEmpresa || "ISENTO", 1)}
    ${campo("CIOT", "", 1)}
    ${campo("DATA PREVISTA DE ENTREGA", "", 1)}
    <div class="cel" style="flex:2"><div class="lbl">ESTE CONHECIMENTO DE TRANSPORTE ATENDE<br/>À LEGISLAÇÃO DE TRANSPORTE RODOVIÁRIO EM VIGOR</div></div>
  </div>

  <!-- Uso exclusivo / reservado ao fisco -->
  <div class="grid">
    <div class="cel" style="flex:1;min-height:8mm"><div class="lbl">USO EXCLUSIVO DO EMISSOR DO CT-E</div></div>
    <div class="cel" style="flex:1;min-height:8mm"><div class="lbl">RESERVADO AO FISCO</div></div>
  </div>

  <div style="font-size:5.3pt;color:#555;margin-top:1.5mm">Impresso em ${new Date().toLocaleString("pt-BR")}</div>
</div>

<script>
window.onload = function() {
  ${chave44.length === 44 ? `try { JsBarcode("#barcode","${chave44}",{format:"CODE128",width:1.1,height:28,displayValue:false,margin:0}); } catch(e){}` : ""}
  setTimeout(function(){ window.print(); }, 400);
};
<\/script>
</body></html>`;

  return html;
}

/** Abre o DACTE numa janela e imprime. */
export function imprimirDacte(c: DadosDacte, logoUrl?: string | null, rntrcEmpresa?: string | null) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(htmlDacte(c, logoUrl, rntrcEmpresa)); w.document.close(); }
}
