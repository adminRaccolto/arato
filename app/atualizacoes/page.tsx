"use client";
import { useState } from "react";
import TopNav from "../../components/TopNav";

// ─── Histórico de atualizações do sistema ────────────────────────────────────
// Adicione novos releases no INÍCIO da lista (mais recente primeiro)
const RELEASES = [
  {
    versao: "2026.09.15",
    data: "15/09/2026",
    titulo: "Saldo por Lote, Sincronização SIEG e Conciliação Agrupada",
    modulos: ["Compras & Estoque", "Fiscal", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Saldo por Lote: o seletor de semente mostrava só as sementes cadastradas na fazenda selecionada no topo da tela — ficava vazio em fazendas sem semente própria (ex: um armazém). Agora lista sementes de todas as fazendas da conta, indicando de qual fazenda é cada uma." },
      { tipo: "correcao", texto: "Sincronizar SIEG (NF de Produtos e NF de Serviço): quando o CNPJ monitorado estava configurado numa fazenda diferente da fazenda selecionada no momento, a sincronização recusava com 'Nenhum CPF/CNPJ configurado' mesmo com tudo certo no cadastro. Agora busca o CNPJ em todas as fazendas da conta antes de recusar." },
      { tipo: "correcao", texto: "Conciliação — Borderô (vários CP/CR para um pagamento do extrato): em alguns casos a linha aparecia conciliada e, pouco depois, voltava sozinha para 'pendente' sem ninguém desvincular. A tela agora aguarda a confirmação de gravação antes de dar por concluída a conciliação, e nunca mais troca o extrato aberto por outro em segundo plano." },
      { tipo: "correcao", texto: "Conciliação: importar o mesmo extrato OFX duas vezes criava duas cópias separadas, conciliadas de forma independente — conciliar numa não refletia na outra, dando a impressão de que a conciliação 'sumia'. Agora, antes de importar, o sistema avisa se já existe um extrato da mesma conta cobrindo o mesmo período." },
    ],
    onde: "Compras & Estoque → Estoque → Relatórios → Saldo por Lote · Compras → NF de Produtos/Serviços → Sincronizar SIEG · Financeiro → Conciliação",
  },
  {
    versao: "2026.09.14-c",
    data: "14/09/2026",
    titulo: "Conciliação Avançada + Novos Relatórios de Estoque e Custos",
    modulos: ["Financeiro", "Compras & Estoque", "Fiscal"],
    itens: [
      { tipo: "novo",     texto: "Conciliação: campo 'Buscar por valor' — encontra a linha do extrato digitando o valor completo ou parcial (ex: '67' acha 'R$ 67,17')." },
      { tipo: "novo",     texto: "Conciliação: seleção múltipla de linhas do extrato (ex: vários pedágios do mesmo dia) para lançar um único CP/CR agrupado (soma dos valores) já conciliado contra todas." },
      { tipo: "novo",     texto: "Conciliação: sub-aba 'CP/CR em Aberto' — cruza lançamentos ainda não baixados com as linhas pendentes do extrato por valor; 'Conciliar e Baixar' faz tudo num clique, já com a conta bancária e a data certas." },
      { tipo: "correcao", texto: "Conciliação: a baixa de um lançamento pela tela de conciliação não estava gravando a conta bancária — corrigido em todos os fluxos (Vincular CP/CR, Tesouraria, lançamento agrupado)." },
      { tipo: "novo",     texto: "Estoque → Relatórios: novo relatório 'Saldo por Lote' — escolha uma semente (e opcionalmente um depósito) e veja cada lote com entradas, saídas, saldo atual e data da última movimentação." },
      { tipo: "correcao", texto: "Estoque: a coluna 'NF' em Resumo por Produto, Movimentações PA e no Kardex mostrava o UUID da nota em vez do número real — corrigido nas três telas." },
      { tipo: "melhoria", texto: "Resultados → Custos Totais: o seletor de Ciclos virou um dropdown com busca, mostrando a Fazenda de cada ciclo ao lado do nome — antes não dava pra saber de qual propriedade era cada ciclo selecionado." },
      { tipo: "correcao", texto: "Fiscal → Monitor de NF-e Emitidas: notas de Transferência entre Fazendas nunca apareciam nessa tela (ficavam só na tela de Transferências) — agora toda emissão e cancelamento de transferência aparece no Monitor normalmente." },
      { tipo: "correcao", texto: "NF de Serviço: erro 'violates foreign key constraint' ao salvar quando o Tomador do serviço era um Produtor ou Empresa (e não um cadastro de Pessoas) — corrigido." },
      { tipo: "correcao", texto: "NF de Produtos e NF de Serviço: filtro por Produtor não aparecia (ou não existia) em contas com múltiplos produtores. Agora tem seletor de Produtor/Tomador com CPF/CNPJ no rótulo, e a busca por texto também aceita CPF/CNPJ digitado. O filtro passa a casar pelo CPF/CNPJ do destinatário/tomador da nota (não só pelo vínculo interno de produtor), então pega todas as notas do produtor mesmo quando esse vínculo não foi preenchido em alguma delas." },
    ],
    onde: "Financeiro → Conciliação · Compras & Estoque → Relatórios · Resultados → Custos Totais · Fiscal → Monitor NF-e · Compras & Estoque → NF de Produtos/Serviços",
  },
  {
    versao: "2026.09.14-b",
    data: "14/09/2026",
    titulo: "Transferências — Emitente Editável e Cancelamento Oficial na SEFAZ",
    modulos: ["Compras & Estoque", "Fiscal"],
    itens: [
      { tipo: "novo",     texto: "Transferência entre Fazendas: campos 'CNPJ/CPF Emitente' e 'IE Emitente' na Origem — a fazenda é só o local do estoque, então agora dá pra emitir a NF em nome do produtor/IE responsável de verdade pela operação, mesmo que seja diferente do titular padrão cadastrado na fazenda." },
      { tipo: "melhoria", texto: "Cancelar uma transferência com NF já autorizada agora dispara o cancelamento oficial junto à SEFAZ (com justificativa obrigatória de 15+ caracteres) e só reverte o estoque depois da confirmação — antes só mudava o status aqui dentro, sem avisar a SEFAZ e sem devolver o saldo ao depósito de origem." },
      { tipo: "melhoria", texto: "Cancelamento de NF-e de transferência é bloqueado automaticamente depois de 24h da autorização (regra da SEFAZ) — a partir daí é preciso NF de devolução/estorno." },
      { tipo: "correcao", texto: "Transportadora e placa do veículo preenchidos na transferência agora aparecem de verdade na NF/DANFE — antes o campo existia na tela mas nunca ia pro XML." },
      { tipo: "correcao", texto: "Total da Base de Cálculo do ICMS na NF de transferência não incluía itens com ICMS diferido (CST 51) — causava rejeição 531 da SEFAZ. Corrigido." },
      { tipo: "correcao", texto: "Inscrição Estadual do emitente/destinatário podia ir com pontuação pro XML da NF, causando posicionamento errado no DANFE — agora sempre só dígitos." },
    ],
    onde: "Compras & Estoque → Estoque → Transferências",
  },
  {
    versao: "2026.09.14-a",
    data: "14/09/2026",
    titulo: "Correções de Ano Safra, Parâmetros Fiscais e Custo de Lavoura",
    modulos: ["Fiscal", "Compras & Estoque", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "App Campo: seletor de Ano Safra voltou a aparecer ao registrar uma operação (plantio, pulverização, adubação, correção)." },
      { tipo: "correcao", texto: "Cadastros: corrigida duplicação de Ano Safra causada por registros com pequenas diferenças de nome/prefixo." },
      { tipo: "correcao", texto: "Fiscal → Parâmetros Fiscais: configuração de emitentes sumindo da tela — o problema era o parâmetro ficar preso à fazenda ativa do momento. Corrigido." },
      { tipo: "correcao", texto: "Transferência entre Fazendas: a emissão podia escolher um certificado fiscal aleatório entre vários emitentes cadastrados na mesma fazenda — agora respeita o titular fiscal correto (ou o Emitente informado manualmente, ver release seguinte)." },
      { tipo: "correcao", texto: "Fiscal: emissão de NF passou a consultar de verdade as Inscrições Estaduais cadastradas do produtor, em vez de depender só de um campo de configuração antigo." },
      { tipo: "correcao", texto: "Fiscal: busca do código IBGE do destinatário agora também procura no cadastro de Produtores, não só no de Pessoas — evitava rejeição por 'Código IBGE do destinatário não informado' em transferências entre produtores." },
      { tipo: "correcao", texto: "Lavoura: custo de Adubação e Correção de Solo podia inflar até 1000× quando o insumo era medido em tonelada — corrigido erro de escala." },
      { tipo: "correcao", texto: "Lavoura: grid de lançamentos de operações de campo podia esconder registros de outras fazendas da mesma conta." },
      { tipo: "correcao", texto: "Financeiro: lançamento de operação de campo (pulverização, adubação, etc.) não gera mais Conta a Pagar 'fantasma' — o insumo já é pago na NF de compra." },
      { tipo: "melhoria", texto: "Conciliação: lançamentos sem correspondência no extrato OFX agora aparecem com fundo cinza, facilitando localizar o que falta bater." },
      { tipo: "melhoria", texto: "Relatório de Aplicações por Ciclo: botão 'Selecionar todos' no filtro de Talhões — antes era preciso marcar um por um." },
      { tipo: "melhoria", texto: "Compras: mensagens de erro genéricas ('Erro ao carregar') agora mostram a causa real do problema." },
    ],
    onde: "App Campo · Cadastros → Ano Safra · Fiscal → Parâmetros Fiscais · Lavoura → Adubação/Correção · Financeiro → Conciliação · Lavoura → Relatórios",
  },
  {
    versao: "2026.09.12",
    data: "12/09/2026",
    titulo: "Cadastro de Produtores e Inscrições Estaduais",
    modulos: ["Fiscal", "Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Cadastros → Produtores: tela parava de carregar em algumas contas por uma coluna ausente na consulta — corrigido." },
      { tipo: "novo",     texto: "Cadastro de Inscrição Estadual: busca automática de CEP/IBGE ao preencher o endereço." },
      { tipo: "correcao", texto: "Salvar uma Inscrição Estadual não descarta mais o endereço já preenchido nem esquece a fazenda vinculada." },
      { tipo: "correcao", texto: "Uma IE recém-cadastrada não sumia mais da lista ao reabrir o modal do produtor." },
      { tipo: "novo",     texto: "Consulta Sintegra por Inscrição Estadual preenche o cadastro automaticamente — cobre GO, MS, SP, BA e TO (outros estados sob demanda)." },
      { tipo: "novo",     texto: "Inscrição Estadual agora pode vincular a uma Empresa (PJ), além de a uma Fazenda — para produtores que operam via CNPJ próprio." },
      { tipo: "melhoria", texto: "Dá pra editar a Fazenda/Empresa vinculada de uma IE já cadastrada, sem precisar recriar." },
      { tipo: "melhoria", texto: "Transferência entre Fazendas: campos de CNPJ/CPF e IE do destinatário sugerem produtores e IEs já cadastrados enquanto você digita." },
    ],
    onde: "Cadastros → Produtores → Inscrições Estaduais · Compras & Estoque → Transferências",
  },
  {
    versao: "2026.09.11",
    data: "11/09/2026",
    titulo: "Lote de Semente, Parâmetros Fiscais por IE e Robustez de NF",
    modulos: ["Compras & Estoque", "Fiscal"],
    itens: [
      { tipo: "novo",     texto: "Entrada de NF: variedade por lote de semente — uma mesma nota pode trazer lotes de variedades diferentes." },
      { tipo: "novo",     texto: "Saldo de semente por lote passou a ser calculado e sugerido ao escolher de qual lote sair, na Transferência e no Plantio." },
      { tipo: "correcao", texto: "Cadastro rápido de insumo direto na NF gravava o tipo sempre como 'produto', mesmo para sementes/fertilizantes/defensivos — corrigido." },
      { tipo: "correcao", texto: "DANFE de uma transferência em rascunho não buscava o CNPJ/IE do destinatário — corrigido." },
      { tipo: "melhoria", texto: "Transferência entre Fazendas: CNPJ/CPF e IE do Destinatário passam a ser editáveis — a entrada pode ser numa IE diferente da do produtor responsável pelo depósito." },
      { tipo: "novo",     texto: "Parâmetros Fiscais por Inscrição Estadual (produtor PF): cada IE do produtor pode ter sua própria série/número de NF-e." },
      { tipo: "melhoria", texto: "Cadastro de Produtor: endereço completo pode ser vinculado à Inscrição Estadual, não só ao produtor." },
      { tipo: "correcao", texto: "'Erro ao processar NF' genérico passou a mostrar a mensagem real do erro." },
      { tipo: "correcao", texto: "Estornar uma NF processada não deixava mais um vínculo quebrado com o Pedido de Compra de origem." },
      { tipo: "correcao", texto: "Trava reforçada contra duplicação de estoque e financeiro ao reprocessar a mesma NF." },
      { tipo: "melhoria", texto: "Fiscal: aviso quando a Inscrição Estadual escolhida não tem endereço cadastrado (bloqueia a emissão antes do erro da SEFAZ)." },
      { tipo: "novo",     texto: "Estoque: saldo real por depósito, refletindo onde cada insumo fisicamente está." },
    ],
    onde: "Compras & Estoque → NF de Produtos · Estoque → Transferências/Plantio · Fiscal → Parâmetros Fiscais",
  },
  {
    versao: "2026.09.10",
    data: "10/09/2026",
    titulo: "LCDPR Reconstruído + Correções de Estoque, Fiscal e NFS-e",
    modulos: ["Fiscal", "Compras & Estoque", "Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "LCDPR reconstruído do zero seguindo o leiaute oficial da Receita Federal (registros 0000/0010/0030/0040/0050/Q100/Q200/9999) — a versão anterior usava uma estrutura de classificação que não correspondia ao arquivo exigido de verdade." },
      { tipo: "novo",     texto: "Cadastro LCDPR: CAEPF, tipo de exploração e % de participação por fazenda, e dados do contador responsável." },
      { tipo: "correcao", texto: "NF de entrada: seletor de produtor agora considera a conta inteira, não só a fazenda ativa — resolve produtor não aparecer na lista em contas com várias fazendas." },
      { tipo: "novo",     texto: "Auditoria de Estoque: correção automática de saldo inicial inconsistente ('fantasma')." },
      { tipo: "correcao", texto: "Kardex: exclusão de movimentação, consulta de movimentações e exibição de nome no menu superior — três correções pontuais." },
      { tipo: "correcao", texto: "Duplicidade de cadastro entre Insumos e Pessoas corrigida; casos de Conta a Pagar ausente após processar NF também corrigidos." },
      { tipo: "correcao", texto: "NFS-e (NF de Serviço): tela de visualização corrigida, valor do serviço/número no CP/centro de custo/forma de pagamento ajustados, e a origem da nota não é mais sobrescrita ao reprocessar." },
    ],
    onde: "Fiscal → LCDPR · Compras & Estoque → NF de Produtos/Serviços · Estoque → Kardex/Auditoria",
  },
  {
    versao: "2026.09.09-b",
    data: "09/09/2026",
    titulo: "Transportadoras em Transferências + Múltiplas IEs por UF",
    modulos: ["Compras & Estoque", "Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Transferência entre Fazendas: transportadoras, veículos e motoristas agora carregam de todas as fazendas da conta, não só da fazenda ativa." },
      { tipo: "melhoria", texto: "Empresas cadastradas como transportadora aparecem direto no seletor de transportadora da transferência, sem precisar duplicar cadastro." },
      { tipo: "melhoria", texto: "Ao escolher uma empresa como transportadora, ela é auto-cadastrada na tabela própria de Transportadoras." },
      { tipo: "novo",     texto: "Suporte a múltiplas Inscrições Estaduais por UF no emitente fiscal — para produtores/empresas que emitem NF-e de estados diferentes." },
    ],
    onde: "Compras & Estoque → Transferências → Transportadora · Fiscal → Parâmetros Fiscais",
  },
  {
    versao: "2026.09.09",
    data: "09/09/2026",
    titulo: "Transferências — Novo Fluxo + Correções Estoque",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "melhoria", texto: "Transferência entre Fazendas: novo fluxo em 2 etapas — salva como rascunho primeiro, emite a NF diretamente pelo grid após revisar. Botões 'Visualizar', 'Emitir NF' e 'Cancelar' ficam na linha da tabela." },
      { tipo: "melhoria", texto: "Transferência entre Fazendas: CFOP agora é selecionável (5 opções). Padrão alterado para 5152/6152 — Mercadoria adquirida de terceiros (sem ST), que é o correto para a maioria dos insumos comprados." },
      { tipo: "correcao", texto: "Detalhe de transferência: nome do insumo agora exibe corretamente em vez do UUID (ocorria quando a fazenda origem era diferente da fazenda ativa no formulário)." },
      { tipo: "melhoria", texto: "Kardex: coluna 'Origem' exibe ícone e link contextual por tipo de movimentação (NF, aplicação em campo, transferência, perda etc.). Coluna 'Usuário' indica operador ou 'Sistema'." },
      { tipo: "melhoria", texto: "Movimentação por Produto: colunas 'Motivo' e 'Obs.' substituídas por 'Origem' (link contextual) e 'Usuário'." },
      { tipo: "correcao", texto: "Kardex: corrigido bug que retornava sempre zero movimentos (fechamento de closure sobre fazendaIds + builder Supabase imutável)." },
      { tipo: "melhoria", texto: "App Campo: login dedicado em /campo/login com tema escuro mobile-first. Usuários do campo são redirecionados para esta tela ao tentar acessar o sistema." },
      { tipo: "correcao", texto: "NF de Produtos: corrigida duplicação de movimentações de estoque em NFs reprocessadas. A limpeza de movimentos agora ocorre antes da exclusão dos itens, evitando o registro múltiplo." },
      { tipo: "melhoria", texto: "Menu: 'Transferência entre Fazendas' movida de Estoque de Grãos para Estoque de Insumos, onde pertence." },
    ],
    onde: "Compras & Estoque → Estoque → Transferências · Kardex · Movimentação por Produto",
  },
  {
    versao: "2026.09.08-c",
    data: "08/09/2026",
    titulo: "Ticket em 2 vias + Romaneio na Pesagem Avulsa",
    modulos: ["Balança"],
    itens: [
      { tipo: "novo",     texto: "Ticket de pesagem agora imprime em 2 vias numa mesma folha A4 — 1ª via retida pelo estabelecimento, 2ª via entregue ao motorista, com linha de corte entre elas." },
      { tipo: "novo",     texto: "Botão 📋 Romaneio na tabela de pesagens finalizadas: gera documento A4 completo com tabela de pesagens, peso líquido em sacas e toneladas, e campos de assinatura para motorista e responsável pelo recebimento." },
    ],
    onde: "Balança → Pesagem Avulsa → aba Finalizadas",
  },
  {
    versao: "2026.09.08-b",
    data: "08/09/2026",
    titulo: "Cadastro de Cartões de Crédito",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo",     texto: "Aba '💳 Meus Cartões' na página de Cartões de Crédito: cadastre e gerencie seus cartões com titular, banco, bandeira, últimos 4 dígitos, limite, dia de fechamento e dia de vencimento." },
      { tipo: "melhoria", texto: "Menu reorganizado: Cartões de Crédito agora é a última seção independente no painel Financeiro, fora do grupo Empresa (CNPJ)." },
    ],
    onde: "Financeiro → Cartões de Crédito → aba Meus Cartões",
  },
  {
    versao: "2026.09.08-a",
    data: "08/09/2026",
    titulo: "Correções NF XML — Contas a Pagar e Lotes de Semente",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "NFs importadas via XML agora geram Conta a Pagar corretamente. O problema ocorria quando o JWT do usuário expirava durante o processamento — agora usa rota segura com chave de serviço." },
      { tipo: "correcao", texto: "Campos de Lote e Peso por Lote voltaram a aparecer para insumos do tipo Semente. O catálogo de insumos agora é carregado de todas as fazendas da conta, não apenas da fazenda ativa." },
      { tipo: "correcao", texto: "Data de vencimento do CP agora reflete o campo preenchido pelo usuário no wizard, e não o valor original salvo na NF." },
    ],
    onde: "Compras & Estoque → NF de Produtos → processar NF",
  },
  {
    versao: "2026.09.06",
    data: "06/09/2026",
    titulo: "App Campo — Ciclos, Insumos e Melhorias",
    modulos: ["App Campo"],
    itens: [
      { tipo: "correcao", texto: "MONITORAMENTO e REGISTRAR COLHEITA: campo Ciclo / Safra voltou a carregar corretamente." },
      { tipo: "correcao", texto: "PULVERIZAÇÃO: catálogo de insumos agora inclui biológicos, micronutrientes e inoculantes, além de defensivos e fertilizantes." },
      { tipo: "correcao", texto: "NF de Produtos: campo Produtor agora sempre visível ao processar NFs via XML." },
      { tipo: "novo",     texto: "Pesagem Avulsa: botão 🖨️ Ticket adicionado na aba Finalizadas." },
    ],
    onde: "App Campo (mobile) · Compras & Estoque → NF de Produtos · Balança → Pesagem Avulsa",
  },
  {
    versao: "2026.08.xx",
    data: "ago/2026",
    titulo: "Módulo Algodão + IA Cédula de Crédito",
    modulos: ["Algodão", "Financeiro"],
    itens: [
      { tipo: "novo",     texto: "Módulo Algodão (add-on): controle de safra, bicudo do algodoeiro, módulos/fardos, algodoeira/beneficiamento, HVI e posição de estoque integrada ao preço ICE/CBOT." },
      { tipo: "novo",     texto: "Add-on IA Cédula: extração automática de campos de PDFs de cédulas de crédito rural com Claude — credor, produtor, valor liberado, cronograma de reembolso." },
      { tipo: "melhoria", texto: "Contratos financeiros: campo Linha de Crédito agora aceita texto livre além das sugestões pré-definidas." },
      { tipo: "melhoria", texto: "Endividamento: contratos em USD agora aplicam PTAX para exibição em reais." },
    ],
    onde: "Algodão (menu superior) · Financeiro → Contratos Financeiros",
  },
  {
    versao: "2026.07.xx",
    data: "jul/2026",
    titulo: "Performance, Contabilidade por Fazenda e Compromissos em Grãos",
    modulos: ["Financeiro", "Fiscal", "Comercial"],
    itens: [
      { tipo: "melhoria", texto: "Entidade Contábil por Fazenda: cada fazenda pode ser PF ou PJ — lançamentos herdam a entidade automaticamente via trigger, separando LCDPR do SPED ECD." },
      { tipo: "melhoria", texto: "Performance geral: carregamentos em paralelo eliminam waterfalls de queries. TopNav busca fazenda+produtor em uma única query." },
      { tipo: "novo",     texto: "Compromissos em Grãos: relatório consolidado de sacas comprometidas (arrendamento, barter, compra de terra) com KPIs por commodity." },
      { tipo: "correcao", texto: "DRE: grupo DGA (Despesas Gerais e Administrativas) corrigido — RH Administrativo e Serviços de Terceiros são despesas operacionais, não financeiras." },
    ],
    onde: "Resultados → DRE Agrícola · Comercial → Compromissos em Grãos · Fiscal → SPED ECD",
  },
];

const TIPO_BADGE: Record<string, { label: string; bg: string; cor: string }> = {
  novo:     { label: "Novo",     bg: "#DCFCE7", cor: "#15803D" },
  melhoria: { label: "Melhoria", bg: "#EEF4FF", cor: "#1e40af" },
  correcao: { label: "Correção", bg: "#FEF3C7", cor: "#92400E" },
};

const MODULO_COR: Record<string, string> = {
  "Balança":          "#1A4870",
  "Financeiro":       "#7C3AED",
  "Compras & Estoque":"#C9921B",
  "App Campo":        "#15803D",
  "Algodão":          "#D97706",
  "Comercial":        "#0E7490",
  "Fiscal":           "#B91C1C",
};

export default function CentralAtualizacoes() {
  const [filtro, setFiltro] = useState<string>("todos");

  const modulos = Array.from(new Set(RELEASES.flatMap(r => r.modulos))).sort();
  const lista   = filtro === "todos" ? RELEASES : RELEASES.filter(r => r.modulos.includes(filtro));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, padding: "24px 28px", maxWidth: 900, width: "100%" }}>

        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Central de Atualizações</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-3)" }}>
            Histórico de melhorias, novidades e correções do sistema RacTech
          </p>
        </header>

        {/* Filtro de módulo */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          <button onClick={() => setFiltro("todos")}
            style={{ padding: "5px 14px", borderRadius: 20, border: "0.5px solid var(--border-table)", background: filtro === "todos" ? "#1A4870" : "var(--bg-card)", color: filtro === "todos" ? "#fff" : "var(--text-1)", fontSize: 12, fontWeight: filtro === "todos" ? 600 : 400, cursor: "pointer" }}>
            Todos os módulos
          </button>
          {modulos.map(m => (
            <button key={m} onClick={() => setFiltro(m)}
              style={{ padding: "5px 14px", borderRadius: 20, border: `0.5px solid ${filtro === m ? (MODULO_COR[m] ?? "#1A4870") : "var(--border-table)"}`, background: filtro === m ? (MODULO_COR[m] ?? "#1A4870") : "var(--bg-card)", color: filtro === m ? "#fff" : "var(--text-1)", fontSize: 12, fontWeight: filtro === m ? 600 : 400, cursor: "pointer" }}>
              {m}
            </button>
          ))}
        </div>

        {/* Lista de releases */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {lista.map((r, ri) => (
            <div key={r.versao} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
              {/* Cabeçalho */}
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--border-table)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {ri === 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#1A4870", color: "#fff", letterSpacing: 1 }}>MAIS RECENTE</span>
                    )}
                    {r.modulos.map(m => (
                      <span key={m} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: MODULO_COR[m] ?? "#888", color: "#fff" }}>{m}</span>
                    ))}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginTop: 6 }}>{r.titulo}</div>
                  {r.onde && (
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                      📍 {r.onde}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>{r.data}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>v{r.versao}</div>
                </div>
              </div>

              {/* Itens */}
              <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {r.itens.map((it, ii) => {
                  const badge = TIPO_BADGE[it.tipo] ?? TIPO_BADGE.melhoria;
                  return (
                    <div key={ii} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ flexShrink: 0, marginTop: 1, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: badge.bg, color: badge.cor, whiteSpace: "nowrap" }}>{badge.label}</span>
                      <span style={{ color: "var(--text-1)", lineHeight: 1.55 }}>{it.texto}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
