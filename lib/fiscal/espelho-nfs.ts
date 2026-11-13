// Impressão da NFS de fornecedor (Documentos Fiscais → Notas de Fornecedores). A NFS-e oficial é a da prefeitura (ou do
// Portal Nacional); o Arato não guarda o XML/PDF dela, então imprime um ESPELHO com o que foi lançado — prestador,
// tomador, serviço, valores, ISS e retenções — identificado como tal no topo da página.

export type RegistroNfs = {
  numero_nf?: string | null; serie?: string | null; chave_nfse?: string | null; data_prestacao?: string | null; competencia?: string | null;
  prestador_nome?: string | null; prestador_cnpj?: string | null; municipio_prestacao?: string | null;
  tomador_nome?: string | null; tomador_cnpj?: string | null;
  codigo_servico?: string | null; cnae?: string | null; discriminacao?: string | null;
  valor_servico?: number | null; valor_deducoes?: number | null; valor_base_iss?: number | null; aliquota_iss?: number | null;
  valor_iss?: number | null; iss_retido?: boolean | null; valor_inss?: number | null; valor_ir?: number | null;
  valor_outras_retencoes?: number | null; valor_liquido?: number | null; data_vencimento_cp?: string | null;
  status?: string | null; observacao?: string | null;
};
export type EnderecoPrestador = { logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; estado?: string | null; cep?: string | null; inscricao_municipal?: string | null } | null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const brl = (v: number | null | undefined) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (s: string | null | undefined) => (s ? new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const comp = (s: string | null | undefined) => {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : s;
};
const doc = (d: string | null | undefined) => {
  const x = String(d ?? "").replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d || "—";
};

/** Total das retenções federais e do ISS retido (o que o tomador desconta do pagamento). */
export function totalRetencoes(r: RegistroNfs): number {
  const iss = r.iss_retido ? Number(r.valor_iss) || 0 : 0;
  return Math.round((iss + (Number(r.valor_inss) || 0) + (Number(r.valor_ir) || 0) + (Number(r.valor_outras_retencoes) || 0)) * 100) / 100;
}

/** Corpo de uma NFS (sem <html>), para juntar várias numa só impressão. */
export function corpoEspelhoNfs(r: RegistroNfs, prest?: EnderecoPrestador): string {
  const end = prest ? [prest.logradouro, prest.numero, prest.bairro].filter(Boolean).join(", ") : "";
  const cidade = prest ? [prest.municipio, prest.estado].filter(Boolean).join(" - ") : "";
  const campo = (rot: string, val: string, flex = 1) => `<div class="c" style="flex:${flex}"><div class="l">${esc(rot)}</div><div class="v">${val}</div></div>`;
  const liquido = r.valor_liquido != null ? Number(r.valor_liquido) : (Number(r.valor_servico) || 0) - totalRetencoes(r);
  return `<div class="nfs">
  <div class="aviso">ESPELHO PARA CONFERÊNCIA — impresso a partir dos dados lançados no Arato. O documento fiscal é a NFS-e emitida pela prefeitura.</div>
  <div class="cab">
    <div><div class="t">NOTA FISCAL DE SERVIÇO</div><div class="s">Nº ${esc(r.numero_nf || "—")}${r.serie ? ` · Série ${esc(r.serie)}` : ""}</div></div>
    <div style="text-align:right"><div class="l">Data da prestação</div><div class="v">${data(r.data_prestacao)}</div><div class="l" style="margin-top:2mm">Competência</div><div class="v">${comp(r.competencia)}</div></div>
  </div>
  ${r.chave_nfse ? `<div class="linha">${campo("Chave / código de verificação", `<span style="font-family:monospace">${esc(r.chave_nfse)}</span>`)}</div>` : ""}
  <div class="sec">PRESTADOR DO SERVIÇO</div>
  <div class="linha">${campo("Nome / razão social", esc(r.prestador_nome || "—"), 3)}${campo("CPF/CNPJ", doc(r.prestador_cnpj), 1.4)}${prest?.inscricao_municipal ? campo("Inscrição municipal", esc(prest.inscricao_municipal)) : ""}</div>
  ${end || cidade ? `<div class="linha">${campo("Endereço", esc(end || "—"), 3)}${campo("Município", esc(cidade || r.municipio_prestacao || "—"), 1.4)}${prest?.cep ? campo("CEP", esc(prest.cep)) : ""}</div>` : ""}
  <div class="sec">TOMADOR DO SERVIÇO</div>
  <div class="linha">${campo("Nome / razão social", esc(r.tomador_nome || "—"), 3)}${campo("CPF/CNPJ", doc(r.tomador_cnpj), 1.4)}</div>
  <div class="sec">SERVIÇO</div>
  <div class="linha">${campo("Código do serviço (LC 116)", esc(r.codigo_servico || "—"))}${campo("CNAE", esc(r.cnae || "—"))}${campo("Município da prestação", esc(r.municipio_prestacao || "—"), 1.6)}</div>
  <div class="linha">${campo("Discriminação", `<div style="white-space:pre-wrap;font-weight:400">${esc(r.discriminacao || "—")}</div>`)}</div>
  <div class="sec">VALORES</div>
  <div class="linha">${campo("Valor do serviço", brl(r.valor_servico))}${campo("Deduções", brl(r.valor_deducoes))}${campo("Base de cálculo ISS", brl(r.valor_base_iss))}${campo("Alíquota ISS", `${(Number(r.aliquota_iss) || 0).toLocaleString("pt-BR")}%`)}${campo(r.iss_retido ? "ISS (retido)" : "ISS", brl(r.valor_iss))}</div>
  <div class="linha">${campo("INSS retido", brl(r.valor_inss))}${campo("IR retido", brl(r.valor_ir))}${campo("Outras retenções", brl(r.valor_outras_retencoes))}${campo("Total de retenções", brl(totalRetencoes(r)))}${campo("VALOR LÍQUIDO", `<span style="font-size:11pt">${brl(liquido)}</span>`)}</div>
  ${r.data_vencimento_cp || r.observacao ? `<div class="linha">${r.data_vencimento_cp ? campo("Vencimento (Contas a Pagar)", data(r.data_vencimento_cp)) : ""}${r.observacao ? campo("Observação", `<span style="font-weight:400">${esc(r.observacao)}</span>`, 4) : ""}</div>` : ""}
  ${r.status === "cancelada" ? `<div class="cancelada">CANCELADA</div>` : ""}
</div>`;
}

/** Página completa (uma ou várias NFS, cada uma numa folha A4). */
export function htmlEspelhosNfs(itens: { r: RegistroNfs; prest?: EnderecoPrestador }[]): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>NFS — espelho para conferência</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; margin: 0; }
.nfs { position: relative; page-break-after: always; }
.nfs:last-child { page-break-after: auto; }
.aviso { border: 1px solid #C9921B; background: #FBF3E0; color: #7A5A12; padding: 2mm 3mm; font-size: 8pt; margin-bottom: 3mm; }
.cab { display: flex; justify-content: space-between; border: 1px solid #111; padding: 3mm; }
.t { font-size: 13pt; font-weight: 700; } .s { font-size: 10pt; margin-top: 1mm; }
.sec { background: #E8E8E8; border: 1px solid #111; border-top: 0; font-size: 7.5pt; font-weight: 700; padding: 1mm 2mm; }
.linha { display: flex; border: 1px solid #111; border-top: 0; }
.c { padding: 1.2mm 2mm; border-left: 1px solid #111; min-width: 0; } .c:first-child { border-left: 0; }
.l { font-size: 6.5pt; color: #444; text-transform: uppercase; } .v { font-size: 9pt; font-weight: 700; margin-top: 0.5mm; overflow-wrap: anywhere; }
.cancelada { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 48pt; color: rgba(226,75,74,0.35); font-weight: 700; transform: rotate(-20deg); }
.rodape { font-size: 7pt; color: #555; margin-top: 2mm; }
</style></head><body>
${itens.map(i => corpoEspelhoNfs(i.r, i.prest)).join("\n")}
<div class="rodape">Impresso em ${new Date().toLocaleString("pt-BR")}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
</body></html>`;
}
