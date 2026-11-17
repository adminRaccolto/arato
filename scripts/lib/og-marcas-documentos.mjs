// Sugestão de marcas por documento de entrada (NF de Produtos, NFS-e, CT-e) para cada Operação Gerencial — Seção 455.
// Regra pelo nome/grupo da OG + uso real: o documento em que a OG já foi usada NUNCA sai da sugestão.
// Só sugere; quem aplica é scripts/og-marcas-documentos.mjs --aplicar, depois da revisão do dono.

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Ordem importa: a primeira regra que casar decide (o uso real é somado depois)
const REGRAS = [
  // Grupo 4 (saídas econômicas): marcado para NF é movimento de mercadoria (remessa para armazenagem, saída de grãos de
  // terceiros) e fica só na NF de Produtos; sem a marca é movimento financeiro (pagamento, saque…) e sai das notas
  { motivo: 'Saída econômica (grupo 4)', docs: og => (og.permite_notas_fiscais ? ['nf_produtos'] : []), casa: (d, c) => c.startsWith('4.') },
  { motivo: 'Frete', docs: ['cte'], casa: (d, c) => c.startsWith('2.01.01.07') || /\bFRETE/.test(d) },
  { motivo: 'Despesa particular (pode vir em NF ou NFS)', docs: ['nf_produtos', 'nfs'], casa: d => /PARTICULAR/.test(d) },
  { motivo: 'Manutenção/obra (peças na NF, mão de obra na NFS)', docs: ['nf_produtos', 'nfs'],
    casa: d => /MANUTEN|CONSTRUCAO|REFORMA|INFRAESTRUTURA/.test(d) && !/PECAS PARA ESTOQUE|BAIXA ESTOQUE/.test(d) },
  { motivo: 'Serviço', docs: ['nfs'],
    casa: d => /SERVICO|ASSESSORIA|ASSISTENCIA|CONSULTORIA|ANALISE|TERCEIRIZAD|AVIACAO|LOCACAO|ALUGUE|CORRETAGEM|SECAGEM|ARMAZENAGEM|VIGILANCIA|MEDICINA E SEG|SUPORTE|HOSPEDAGEM|DOMINIO|CLOUD|SOFTWARE|LICENCA|SAAS|RASTREAMENTO|HONORARI|VETERINARI|INSEMINA|TOPOGRAF|GEORREF|TREINAMENTO|\bCURSOS?\b|MAO DE OBRA|DESPACHANTE/.test(d) },
  { motivo: 'Folha, imposto, taxa ou movimento financeiro (não vem em nota)', docs: [],
    casa: d => /SALARI|FERIAS|13. SALARIO|PREMIO|DIARISTA|COMPLEMENTO SALARIAL|PLANO DE SAUDE|RESCIS|SINDICAL|IRRF|FGTS|\bINSS\b|SAT\/RAT|SISTEMA S|PRO-LABORE|PROVISAO|FUNRURAL|SEGURO|JUROS|\bIOF\b|TARIFA|PAGAMENTO|FINANCIAMENTO|EMPRESTIMO|CUSTEIO|INVESTIMENTO|\bCPR\b|\bEGF\b|CONSORCIO|ARRENDAMENTO|ADIANTAMENTO|\bITR\b|IPTU|\bPIS\b|COFINS|CSLL|DIFAL|\bICMS\b|ALVARA|ITCD|IRPJ|IPVA|MULTA|PEDAGIO|DOACAO|TROCO|DEPRECIA|ENCERRAMENTO|FETHAB|IAGRO|SENAR|\bFESA\b|\bGTA\b|INPEC|ROYALT|TAXA|DESCONTO|DISTRIBUI|SAQUE|APLICACAO|IMPLANTACAO|TRANSF|AJUSTE|DESLOCAMENTO|VIAGEM/.test(d) },
];

/**
 * @param og linha de operacoes_gerenciais (com permite_* e tipo)
 * @param efetivo marcas efetivas hoje { nf_produtos, nfs, cte }
 * @param uso contagem de uso { nf_produtos, nfs, cte }
 * @returns { nf_produtos, nfs, cte, motivo }
 */
export function sugerirMarcas(og, efetivo, uso = {}) {
  if (og.tipo !== 'despesa') return { ...efetivo, motivo: 'Receita: sem mudança' };
  // Não aparece hoje em nenhuma nota e nunca foi usada (OG de grupo, só tesouraria…): continua fora das notas
  if (!efetivo.nf_produtos && !efetivo.nfs && !efetivo.cte && !uso.nf_produtos && !uso.nfs && !uso.cte)
    return { nf_produtos: false, nfs: false, cte: false, motivo: 'Hoje não aparece em nenhuma nota: sem mudança' };
  const d = norm(og.descricao), c = String(og.classificacao ?? '');
  const regra = REGRAS.find(r => r.casa(d, c));
  let docs, motivo;
  if (regra) { docs = typeof regra.docs === 'function' ? regra.docs(og) : regra.docs; motivo = regra.motivo; }
  else if (og.permite_notas_fiscais || og.permite_estoque || og.permite_combustivel || og.permite_energia_eletrica) { docs = ['nf_produtos']; motivo = 'Mercadoria (já marcada para Notas Fiscais)'; }
  else { docs = []; motivo = 'Só Contas a Pagar hoje (não vem em nota)'; }
  const out = { nf_produtos: docs.includes('nf_produtos'), nfs: docs.includes('nfs'), cte: docs.includes('cte') };
  const usados = [];
  for (const k of ['nf_produtos', 'nfs', 'cte']) if ((uso[k] ?? 0) > 0 && !out[k]) { out[k] = true; usados.push(k); }
  if (usados.length) motivo += ` + usada em ${usados.map(k => ({ nf_produtos: 'NF', nfs: 'NFS', cte: 'CT-e' })[k]).join(', ')}`;
  return { ...out, motivo };
}
