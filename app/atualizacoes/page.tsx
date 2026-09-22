"use client";
import { useState } from "react";
import TopNav from "../../components/TopNav";

// ─── Histórico de atualizações do sistema ────────────────────────────────────
// Adicione novos releases no INÍCIO da lista (mais recente primeiro)
const RELEASES = [
  {
    versao: "2026.09.22-n",
    data: "22/09/2026",
    titulo: "Pessoas (fornecedores/clientes) agora é do cliente, comum a todas as fazendas",
    modulos: ["Cadastros", "Financeiro", "Compras", "Estoque"],
    itens: [
      { tipo: "correcao", texto: "Cadastrar um fornecedor ou cliente numa fazenda e depois usar outra fazenda do mesmo cliente criava um cadastro novo com o mesmo CPF/CNPJ, em vez de reaproveitar o existente — a checagem de duplicado olhava só a fazenda ativa. Agora olha a conta inteira, como já acontece com Produtor." },
      { tipo: "melhoria", texto: "5 telas passaram a listar Pessoas de todas as fazendas do cliente, em vez de só da fazenda ativa: NF de Serviços, Adiantamentos, Faturamento, Estoque e o seletor de frota em Parâmetros do Sistema." },
    ],
    onde: "Cadastros → Pessoas",
  },
  {
    versao: "2026.09.22-m",
    data: "22/09/2026",
    titulo: "Auditoria: mais telas usando a fazenda certa em vez da fazenda ativa",
    modulos: ["Fiscal", "Configurações", "Financeiro", "Lavoura", "Estoque"],
    itens: [
      { tipo: "correcao", texto: "Continuação da correção de hoje: mais pontos que buscavam Produtor, Pessoa ou Ano Safra só na fazenda ativa da sessão, em vez de em toda a conta do cliente. Corrigidos: Configurações → Importação (Máquinas, Arrendamentos, Funcionários e checagem de Pessoa duplicada), o dropdown de Produtor no upload do Certificado A1 (Fiscal e Configurações), e o carregamento de Ano Safra em Consórcios, Algodão, Operação Aérea e Estoque de Grãos." },
    ],
    onde: "Vários módulos",
  },
  {
    versao: "2026.09.22-l",
    data: "22/09/2026",
    titulo: "Cadastros: Código IBGE não era preenchido pelo \"Buscar\" e falhava com CEP inválido",
    modulos: ["Cadastros", "Fiscal"],
    itens: [
      { tipo: "correcao", texto: "O botão \"Buscar\" (consulta CNPJ na Receita Federal) em Pessoas nunca preenchia o Código IBGE do município — agora resolve pelo CEP encontrado e, se esse CEP não existir na base dos Correios (ViaCEP), pelo nome do município direto na API do IBGE. Mesma correção aplicada ao digitar o CEP à mão (Pessoas, Produtores e Inscrições Estaduais): antes, um CEP que a Receita reconhece mas os Correios não deixava o campo vazio sem aviso." },
      { tipo: "melhoria", texto: "A emissão de NF-e ganhou o mesmo fallback por nome do município (além do já existente por CEP), reduzindo o \"SEFAZ 505: Código IBGE do destinatário não informado\" quando o cadastro tem um CEP que a Receita aceita mas os Correios não." },
    ],
    onde: "Cadastros → Pessoas / Produtores · Fiscal",
  },
  {
    versao: "2026.09.22-k",
    data: "22/09/2026",
    titulo: "NF-e: IBGE do destinatário resolvido pelo CEP",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "A SEFAZ rejeitava a emissão (505, IBGE do destinatário não informado) quando o cadastro da Pessoa ou da Inscrição Estadual tinha o CEP preenchido mas nunca o código IBGE. Agora o sistema consulta o CEP no ViaCEP na hora da emissão e corrige o cadastro sozinho, sem precisar reabrir a tela de Pessoas para salvar de novo." },
      { tipo: "melhoria", texto: "Removido o aviso fixo sobre a devolução emitir NF-e real — informação já dada pelo botão \"Emitir Devolução\"." },
    ],
    onde: "Fiscal · Compras & Estoque → Compras → NF de Produtos",
  },
  {
    versao: "2026.09.22-j",
    data: "22/09/2026",
    titulo: "Importação: produtor/pessoa não encontrado em fazenda diferente da de origem",
    modulos: ["Configurações"],
    itens: [
      { tipo: "correcao", texto: "Em Configurações → Importação, os assistentes de Contratos Financeiros, Contratos de Venda e CP/CR buscavam o produtor e a pessoa (fornecedor/comprador) só na fazenda ativa. Num cliente com mais de uma fazenda, se o produtor foi cadastrado com a primeira fazenda dele (ex.: \"Fazenda Guasca\") e a importação era feita com outra fazenda ativa (ex.: \"Fazenda Herança J7\"), o produtor não era encontrado e a linha importava sem vínculo. Agora a busca cobre todas as fazendas do cliente." },
    ],
    onde: "Configurações → Importação",
  },
  {
    versao: "2026.09.22-i",
    data: "22/09/2026",
    titulo: "Devolução: Estornar remove o registro",
    modulos: ["Compras"],
    itens: [
      { tipo: "correcao", texto: "Estornar uma NF de devolução voltava o registro para \"pendente\", e ele ficava parado na lista principal como se fosse uma NF de entrada normal esperando \"Processar\" — o que nunca acontece, pois devolução só é criada pronta pelo botão Devolver. Agora Estornar remove o registro por completo." },
    ],
    onde: "Compras & Estoque → Compras → NF de Produtos",
  },
  {
    versao: "2026.09.22-h",
    data: "22/09/2026",
    titulo: "NF de Produtos: Devolução vira NF-e real",
    modulos: ["Fiscal", "Compras"],
    itens: [
      { tipo: "correcao", texto: "O botão \"Devolver\" em Compras → NF de Produtos criava só um registro interno (numeração \"DEV-...\", sem XML nem DANFE) — a mercadoria saía da fazenda sem NF-e válida acompanhando o transporte. Agora emite uma NF-e de devolução de compra de verdade, transmitida à SEFAZ (mesmo emissor usado nas Transferências e na Remessa Logística); se a SEFAZ rejeitar, nada é gravado no estoque ou no financeiro." },
      { tipo: "novo", texto: "Depois de autorizada, a devolução ganha o botão DANFE na lista, como as demais notas." },
    ],
    onde: "Compras & Estoque → Compras → NF de Produtos",
  },
  {
    versao: "2026.09.22-g",
    data: "22/09/2026",
    titulo: "NF-e: espaço sobrando no fim do endereço (SEFAZ 215)",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "A SEFAZ rejeitava a NF-e (215, falha no schema) quando algum texto de cadastro — como o endereço da transportadora — tinha espaço sobrando no início ou no fim (ex.: \"AVENIDA MUTUM \"). Agora todos os textos da NF-e são aparados antes de gerar o XML." },
    ],
    onde: "Fiscal · Estoque → Transferências → Emitir NF",
  },
  {
    versao: "2026.09.22-f",
    data: "22/09/2026",
    titulo: "NF-e: numeração repetida (SEFAZ 539)",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Corrigido o contador de número da NF-e quando o emitente tem configuração por Inscrição Estadual: o número era incrementado só na configuração base e a leitura pegava o da IE, então o mesmo número voltava a ser usado e a SEFAZ rejeitava com 539 (duplicidade de NF-e, com diferença na chave)." },
      { tipo: "melhoria", texto: "Se a SEFAZ responder 539 porque o número/série já foi usado por outra nota (por exemplo, emitida por outro sistema antes do Arato), o sistema agora avança sozinho para o próximo número livre, em vez de parar com o erro. Rejeição não consome numeração, então não gera buracos." },
    ],
    onde: "Estoque → Transferências → Emitir NF · Fiscal",
  },
  {
    versao: "2026.09.22-e",
    data: "22/09/2026",
    titulo: "Transferências: transportadora duplicada a cada salvamento",
    modulos: ["Estoque"],
    itens: [
      { tipo: "correcao", texto: "Cada vez que uma transferência de insumos com transportadora era salva, o sistema criava uma nova linha em Transporte → Cadastros → Transportadoras (a busca das transportadoras da tela falhava e tratava todas como \"empresas ainda não cadastradas\"). Corrigida a busca e, por segurança, o sistema agora reaproveita a transportadora que já existe pelo CNPJ antes de criar uma nova." },
    ],
    onde: "Estoque → Transferências",
  },
  {
    versao: "2026.09.22-d",
    data: "22/09/2026",
    titulo: "Fiscal: certificado A1 deixava de ser reconhecido",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Corrigida a causa do aviso \"SEFAZ 501: Certificado A1 não configurado\" que voltava mesmo com o certificado enviado: depois de enviar o certificado, a tela guardava o arquivo mas não a senha, e o próximo \"Salvar\" dos Parâmetros Fiscais apagava a senha do banco. Agora o salvamento preserva a senha e o arquivo já gravados, o envio do certificado atualiza a config do cliente em todas as fazendas onde ela existe (antes deixava uma cópia sem senha em outra fazenda) e o emissor procura a senha nas demais cópias antes de falhar." },
      { tipo: "melhoria", texto: "Em Parâmetros → Fiscal, o selo \"Certificado configurado\" só aparece verde quando arquivo E senha estão salvos; se faltar a senha, aparece um aviso amarelo. A mensagem da SEFAZ 501 agora diz o que falta (arquivo ou senha) e de qual emitente." },
    ],
    onde: "Configurações → Parâmetros do Sistema → Fiscal",
  },
  {
    versao: "2026.09.22-c",
    data: "22/09/2026",
    titulo: "Estoque: opção Todas as fazendas",
    modulos: ["Estoque"],
    itens: [
      { tipo: "novo", texto: "O seletor de fazenda do Estoque ganhou a opção \"Todas as fazendas\": a posição de estoque, as movimentações, as NFs de entrada, o estoque de terceiros e os relatórios passam a somar todas as fazendas do cliente (com o nome da fazenda ao lado do item). É um modo de consulta: para lançar movimentação, novo item ou NF, escolha uma fazenda específica, porque o estoque físico é por propriedade." },
    ],
    onde: "Estoque → seletor de fazenda (canto superior direito)",
  },
  {
    versao: "2026.09.22-b",
    data: "22/09/2026",
    titulo: "Abastecimento: todos os ciclos do cliente",
    modulos: ["Estoque"],
    itens: [
      { tipo: "correcao", texto: "No lançamento de abastecimento, o seletor de Safra / Ciclo listava só os ciclos da fazenda que estava ativa, escondendo ciclos das outras fazendas do cliente. Agora lista os ciclos de todas as fazendas do cliente (com o nome da fazenda ao lado quando há mais de uma)." },
      { tipo: "correcao", texto: "Na mesma tela, as bombas e tanques também passaram a ser as de todas as fazendas do cliente (antes só as da fazenda ativa, e o histórico de outras fazendas não conseguia devolver o estoque ao excluir). O abastecimento, a baixa do estoque e a conta a pagar são gravados na fazenda da bomba escolhida, e o combustível debitado é o da mesma fazenda da bomba." },
    ],
    onde: "Estoque → Abastecimento",
  },
  {
    versao: "2026.09.22-a",
    data: "22/09/2026",
    titulo: "BI Raccolto: Auditoria por Ano Safra e Ciclo",
    modulos: ["BI Raccolto"],
    itens: [
      { tipo: "novo", texto: "Nova aba \"Auditoria Safra / Ciclo\" no BI Raccolto: lista, num só lugar, tudo o que o cliente lançou — financeiro (CP/CR, tesouraria, consórcio, NFs, cédulas), operações agrícolas, abastecimentos, movimentações de estoque, pedidos de compra e contratos de grãos — com o ano safra e o ciclo de cada registro. Filtros por Ano Safra, Ciclo, tipo de lançamento e busca; opções \"sem ano safra\" e \"sem ciclo\" para achar o que ficou sem vínculo; resumo por origem e exportação em XLSX." },
    ],
    onde: "BI Raccolto → Auditoria Safra / Ciclo",
  },
  {
    versao: "2026.09.21-r",
    data: "21/09/2026",
    titulo: "Conciliação: OFX filtrado pelos pares",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "Nas abas Sugeridos e Inconsistências, a lista do OFX à direita mostra só as linhas que têm par na lista da esquerda, na mesma ordem. Passar o mouse num par destaca a linha correspondente do OFX. A busca do OFX continua valendo por cima. Ao sair das abas, o OFX volta a mostrar tudo." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-q",
    data: "21/09/2026",
    titulo: "Conciliação: filtro e destaque na aba Baixados",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "Na aba Baixados, o que já está conciliado (sinaleiro verde) passa a aparecer com a letra em cinza, deixando em destaque só o que ainda está pendente. Novo filtro Todos / Pendentes / Conciliados na barra da aba." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-p",
    data: "21/09/2026",
    titulo: "Conciliação: aba Inconsistências (baixa na conta errada)",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Nova aba \"Inconsistências\" na conciliação: para cada linha pendente do OFX, mostra o lançamento (ou borderô) de mesmo valor que foi baixado em OUTRA conta bancária. \"Corrigir\" move a baixa para a conta do extrato, acompanha o borderô inteiro, concilia a linha e registra no histórico de onde para onde. O saldo se acerta sozinho nas duas contas. Há também \"Corrigir todas\", sempre com confirmação." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-o",
    data: "21/09/2026",
    titulo: "Conciliação: aba Baixados",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "A aba \"Conciliados / baixados\" virou \"Baixados\": lista todos os lançamentos baixados no período (data de baixa), com o sinaleiro indicando se já foram conciliados. A aba \"CP/CR abertos\" mostra só o que ainda não foi baixado e a opção \"Incluir baixados\" foi retirada. Para conferir baixados com o OFX, use a aba Conferência." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-n",
    data: "21/09/2026",
    titulo: "Conciliação: aba Sugeridos",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Nova aba \"Sugeridos\" na lista de CP/CR da conciliação: mostra só os pares que o sistema encontrou (mesmo valor e data próxima), com a linha do OFX ao lado, incluindo borderôs inteiros. Um clique em Aceitar concilia (e baixa, se ainda estiver aberto); \"Aceitar todas\" resolve tudo de uma vez. Ao abrir um extrato com sugestões, a aba já vem na frente." },
      { tipo: "melhoria", texto: "As sugestões agora são calculadas na hora, com os dados atuais, em vez de ficarem gravadas na importação — por isso acompanham o que você baixa ou concilia durante o trabalho." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-m",
    data: "21/09/2026",
    titulo: "Conciliação: borderô conciliado como unidade",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "A conciliação listava os títulos de um borderô um a um. Agora o borderô é uma linha só (total, quantidade de títulos e \"ver títulos\"), na aba de abertos, na de conciliados e na Conferência. Conciliar o borderô confirma o pagamento com a data e a conta do banco e liga a linha do extrato a todos os títulos; conciliar só parte de um borderô é bloqueado." },
      { tipo: "novo", texto: "Opção \"Incluir baixados\" na aba de abertos: mostra lançamentos e borderôs já pagos no Contas a Pagar que ainda não foram conciliados." },
      { tipo: "melhoria", texto: "As chamadas da conciliação à API passaram a enviar o token do navegador, para não falhar com a aba ociosa por sessão expirada." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-l",
    data: "21/09/2026",
    titulo: "Conciliação: correção do erro ao importar OFX e ao conciliar",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Importar um OFX falhava com \"Não foi possível gravar as transações do extrato\": as transações eram gravadas antes do registro da importação, e elas apontam para esse registro por chave estrangeira. Agora o registro da importação é criado primeiro, e é desfeito se a gravação das transações falhar." },
      { tipo: "correcao", texto: "Conciliar linha a linha (vincular, tesouraria, agrupado, aceitar sugestão) também falhava ao gravar, porque a visão contínua usava um identificador de extrato que não existe no cadastro de importações. Agora o vínculo com o extrato só é gravado quando ele existe." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-k",
    data: "21/09/2026",
    titulo: "Conciliação Bancária: tela dividida ao meio e baixa parcial",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "Nova tela de conciliação dividida em 50% sistema e 50% OFX. Lado do sistema com Vencimento, Baixa, Fornecedor/Cliente, Produtor da baixa, Conta de baixa, Tipo e Valor, em três abas: Conciliados/baixados, CP/CR abertos (valores iguais aos do OFX destacados) e Conferência em largura total (pares sistema × OFX com alertas). Lado do OFX com Data de pagamento, Histórico, Valor, Situação e Ação." },
      { tipo: "melhoria", texto: "Período do lado do sistema: mês corrente por padrão; ao importar/abrir um extrato adota o intervalo do OFX. Baixados filtram por data de baixa e não baixados por data de vencimento; a busca ignora o período." },
      { tipo: "melhoria", texto: "Conciliação: painéis ocupam a largura e a altura inteiras da tela, sem os indicadores de total (créditos, débitos e saldo), e a interface usa poucas cores — neutros e um azul. Só números negativos ficam em vermelho queimado, e um sinaleiro marca a situação: verde = conciliado, mostarda = pendente." },
      { tipo: "novo", texto: "Baixa parcial pela conciliação: linha menor que o saldo do CP/CR gera baixa parcial acumulando o valor pago; a linha que completa o saldo quita. Antes a conciliação baixava o lançamento por inteiro." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-j",
    data: "21/09/2026",
    titulo: "NF de Produtos: valor unitário com 5 casas decimais",
    modulos: ["Compras"],
    itens: [
      { tipo: "melhoria", texto: "O campo Valor Unitário dos itens da NF de Produtos passou a ter 5 casas decimais (Associação de produtos, Apropriação Direta, VEF e Remessa), e a lista de itens também mostra 5 casas. O total do item segue em centavos." },
      { tipo: "correcao", texto: "Em Apropriação Direta, VEF e Remessa, alterar quantidade ou valor unitário à mão não atualizava o total nem chegava ao que era gravado. Agora atualiza e grava." },
    ],
    onde: "Compras → NF de Produtos → Itens",
  },
  {
    versao: "2026.09.21-g",
    data: "21/09/2026",
    titulo: "Conciliação: Operações Gerenciais não se repetem mais no seletor",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Nas telas de Regras e de Tesouraria da Conciliação, cada Operação Gerencial aparecia uma vez por fazenda (2.811 itens em vez de 382). Agora aparece uma só vez, e ao gravar o lançamento a operação é ligada à fazenda da conta bancária do extrato." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária",
  },
  {
    versao: "2026.09.21-f",
    data: "21/09/2026",
    titulo: "Conciliação Bancária: regras automáticas e confiança do vínculo",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Aba Regras na Conciliação: quando o histórico do extrato contém um texto (IOF, tarifa, juros, cota capital, pedágio…), o Arato cria o lançamento já classificado (Operação Gerencial, centro de custo, pessoa) ou a transferência entre contas e concilia sozinho. Dá para criar a regra direto da linha, em + Tesouraria." },
      { tipo: "novo", texto: "Confiança do casamento: alta (valor, conta, titular e data conferem, candidato único) concilia e baixa sozinha; média vira sugestão de um clique (\"Aceitar\" / \"Aceitar todas\"); lançamento já conciliado ou baixado em outra conta fica bloqueado. Cada linha mostra a origem: Regra, Exato, Sugestão aceita ou Manual." },
      { tipo: "novo", texto: "Resumo ao importar (por regra, exatas, sugestões, pendentes), indicador de fechamento da conta (extrato × sistema), soma conferida ao ligar vários lançamentos a uma linha (diferença exige motivo) e aviso ao mover a baixa de uma conta para outra." },
      { tipo: "melhoria", texto: "Baixa pela conciliação usa a data e o valor reais do banco. Requer a migração Seção 277; sem ela a tela continua funcionando como antes, sem regras nem sugestões." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária → Regras",
  },
  {
    versao: "2026.09.21-e",
    data: "21/09/2026",
    titulo: "NF de Serviços e NF de Produtos com as mesmas Operações Gerenciais",
    modulos: ["Compras"],
    itens: [
      { tipo: "correcao", texto: "A NF de Serviços listava só as operações marcadas como \"permite NF\" (87 classificações) e a NF de Produtos listava todas as despesas que permitem CP/CR (279). Serviços como Domínio/Hospedagem, Deslocamento/Viagem e Assessorias não apareciam na NFS-e. As duas notas (e o lote de NF) agora usam a mesma lista de Contas a Pagar, de todas as fazendas da conta, e o seletor da NF de Serviços ganhou busca por texto." },
      { tipo: "correcao", texto: "Financeiro → Apoio: o seletor de Operação Gerencial listava receitas e despesas misturadas, só com o nome (sem a classificação) e só da fazenda ativa. Agora usa a mesma lista de Contas a Pagar, filtrada pelo tipo (a pagar = despesa, a receber = receita), com a classificação e busca por texto." },
    ],
    onde: "Compras → NF de Produtos · NF de Serviços · Financeiro → Apoio",
  },
  {
    versao: "2026.09.21-d",
    data: "21/09/2026",
    titulo: "Conciliação Bancária: auditoria completa e correções + Abastecimento de Máquinas no menu",
    modulos: ["Financeiro", "Produção"],
    itens: [
      { tipo: "correcao", texto: "Menu Produção: \"Abastecimento de Máquinas\" (e Máquinas e Veículos, Manutenções, Custos por Máquina) não aparecia porque o painel descartava o submenu. Agora há a seção \"Máquinas\" no painel." },
      { tipo: "correcao", texto: "Conciliação: o casamento automático ligava o mesmo lançamento a várias linhas do extrato (64 casos, 29 entre contas diferentes) e ignorava a conta bancária — principal causa das contas desconciliadas. Agora é um lançamento por linha, respeitando a conta." },
      { tipo: "correcao", texto: "Conciliação: falhas ao gravar eram engolidas (a tela mostrava conciliado sem estar salvo e, ao recarregar, a conciliação sumia). Import e ações agora gravam primeiro as transações, avisam em caso de falha e revertem a tela. Extratos grandes não perdem mais conciliações nem transações (limite de 1.000 linhas)." },
      { tipo: "correcao", texto: "Conciliação: lançamentos baixados sumiam do painel esquerdo após importar; aba Inconsistências mostrava linhas já conciliadas; 167 linhas duplicadas de um extrato foram removidas." },
      { tipo: "correcao", texto: "Lançamentos criados pela conciliação (tarifa, IOF, juros, agrupado) agora exigem Operação Gerencial e nascem com conta bancária, fazenda e titular da conta do extrato. O seletor de O.G. passou a listar as operações do cliente." },
      { tipo: "correcao", texto: "Dashboard: o botão \"Lançar\" das inconsistências foi trocado por \"Conciliar\" (o atalho criava lançamento sem O.G. e duplicava despesa em linha já conciliada). A rota que grava a conciliação agora exige login e confere a conta do usuário." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária · Produção → Máquinas",
  },
  {
    versao: "2026.09.21-c",
    data: "21/09/2026",
    titulo: "Nova Operação Gerencial: Débito ref. a Cota Capital",
    modulos: ["Financeiro", "Cadastros"],
    itens: [
      { tipo: "novo", texto: "Nova Operação Gerencial 2.02.01.02.014 — DÉBITO REF. A COTA CAPITAL, para integralização de cotas de capital em cooperativas (ex.: Sicredi \"Plano Int Capital-Cota\"). Já foi criada em todos os planos de contas existentes e entra automaticamente nos novos." },
      { tipo: "correcao", texto: "Lançamentos sem Operação Gerencial que apareciam com \"—\" na coluna O.G. do LCDPR (IOF, tarifas, juros de cheque, pedágio Sem Parar, seguro Icatu e cota capital) foram classificados." },
    ],
    onde: "Cadastros → Operações Gerenciais · Fiscal → LCDPR",
  },
  {
    versao: "2026.09.21-b",
    data: "21/09/2026",
    titulo: "NF de Produtos: Centro de Custo nos Itens e frota opcional na manutenção",
    modulos: ["Compras"],
    itens: [
      { tipo: "melhoria", texto: "O seletor de Centro de Custo saiu do Cabeçalho (Passo 1) e agora fica no topo do Passo 2 — Itens, sempre visível, sem o checkbox \"Vincular a um centro de custo?\". Assim dá para decidir o CC vendo os itens da NF. O processo continua o mesmo." },
      { tipo: "melhoria", texto: "Apropriação Direta de manutenção: apontar a frota (rateio por máquina) no item deixou de ser obrigatório. Sem máquina, o custo entra normalmente no CC de Manutenção de Máquinas, mas não aparece no relatório de custo por frota. Se informar máquinas, o rateio ainda precisa somar 100%." },
    ],
    onde: "Compras → NF de Produtos → Passo 2 (Itens)",
  },
  {
    versao: "2026.09.21-a",
    data: "21/09/2026",
    titulo: "Coluna O.G. do LCDPR ficava em branco em várias linhas",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "No PDF/Excel do LCDPR, a coluna O.G. (Operação Gerencial) aparecia vazia em receitas e despesas que tinham operação vinculada. As operações gerenciais ficam gravadas por fazenda, mas o relatório só buscava as globais da conta (e sem paginar, limitado a 1.000 linhas). Agora busca as operações de todas as fazendas do relatório, com paginação. Lançamentos que realmente não têm operação gerencial (ex.: IOF e tarifas importados do extrato) continuam com \"—\": é preciso classificá-los no Financeiro." },
    ],
    onde: "Fiscal → LCDPR → Exportação → PDF/Excel",
  },
  {
    versao: "2026.09.18-v",
    data: "18/09/2026",
    titulo: "Correção de cadastro: fazenda Armazem Santa Rita marcada errado como Pessoa Jurídica",
    modulos: ["Fiscal", "Cadastros"],
    itens: [
      { tipo: "correcao", texto: "A fazenda \"Armazem Santa Rita\" (Grupo Ogliari) estava com o campo Entidade Contábil marcado como \"Pessoa Jurídica\", embora seja propriedade pessoal (sem CNPJ) — o CPF fiscal já cadastrado nela era o do produtor. Esse erro fez 165 lançamentos dessa fazenda herdarem PJ automaticamente e sumirem do LCDPR, incluindo 46 receitas e 73 despesas já baixadas/parciais (R$ 2,47M e R$ 1,82M respectivamente). Corrigido o cadastro da fazenda e os 165 lançamentos para Pessoa Física — retroativo, com snapshot de rollback salvo." },
    ],
    onde: "Cadastros → Fazendas · Fiscal → LCDPR",
  },
  {
    versao: "2026.09.18-u",
    data: "18/09/2026",
    titulo: "Receitas parciais e antigas desapareciam do LCDPR",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "LCDPR filtrava só lançamentos onde entidade_contabil = 'pf' explicitamente, excluindo NULL. Receitas parciais (status='parcial') e qualquer CR/NF criados antes da Seção 76 (que adicionou esse campo) desapareciam do Livro Caixa. Corrigido: NULL é tratado como PF padrão — só rejeita quando entidade_contabil = 'pj' mesmo (PJ). Receitas parciais agora entram no LCDPR pelo valor_pago na data_baixa." },
    ],
    onde: "Fiscal → LCDPR",
  },
  {
    versao: "2026.09.18-t",
    data: "18/09/2026",
    titulo: "Adiantamento de Cliente nunca aparecia em nenhuma tela (LCDPR, CR, etc.)",
    modulos: ["Comercial", "Fiscal", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Registrar um \"Adiantamento\" de um contrato de venda de grãos (Comercial → Contratos → Adiantamentos) gerava um CR com status \"liquidado\" — valor que não existe no sistema. Esse CR ficava invisível em toda tela que lê status baixado/parcial: Contas a Receber, Conciliação Bancária e o Livro Caixa do LCDPR. Corrigido para gravar como \"baixado\" (é dinheiro que já entrou de fato, só ainda não aplicado a nenhuma entrega) — agora conta como receita no LCDPR na data do recebimento, como deveria desde sempre." },
    ],
    onde: "Comercial → Contratos → Adiantamentos",
  },
  {
    versao: "2026.09.18-s",
    data: "18/09/2026",
    titulo: "PDF do LCDPR mostra Produtores e Participações no cabeçalho",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "novo", texto: "No PDF do LCDPR gerado com \"Todos os Produtores\" selecionado, o cabeçalho (que antes só dizia \"Todos os Produtores\" e CPF \"—\") agora traz uma tabela com nome, CPF e % de distribuição de cada produtor PF configurado em Produtores e Participações, mais a soma das participações. Com um produtor específico selecionado, o cabeçalho continua mostrando só o nome, CPF e a quota-parte dele, como já era." },
    ],
    onde: "Fiscal → LCDPR → Exportação → PDF",
  },
  {
    versao: "2026.09.18-r",
    data: "18/09/2026",
    titulo: "Contas a Pagar: grid mais limpo — sinalizador de 3 cores no lugar dos textos coloridos",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Removido da coluna Vencimento o texto colorido e em negrito de \"Xd atraso\"/\"Amanhã\"/\"7d\" — consumia espaço na linha e criava excesso de cor na tela. No lugar: um pequeno círculo sinalizador na primeira coluna do grid (verde = a vencer, amarelo = vence nos próximos 7 dias, vermelho = vencido) e uma nova coluna \"Dias\" com o número de dias até o vencimento (negativo se já venceu), sempre em preto e sem negrito." },
    ],
    onde: "Financeiro → Contas a Pagar",
  },
  {
    versao: "2026.09.18-q",
    data: "18/09/2026",
    titulo: "Correção grave: aba Histórico da Conciliação Bancária travava a página",
    modulos: ["Financeiro", "Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Ao abrir a aba \"Histórico\" da Conciliação Bancária, a página quebrava (\"This page couldn't load\") — o código chamava um hook do React de dentro de um bloco condicional, o que o React não permite; sempre que a aba fosse aberta pela primeira vez, a tela travava. Corrigido." },
      { tipo: "novo", texto: "Auditoria do LCDPR: nova coluna \"Produtor\" na tabela (mostra o titular de cada lançamento, direto ou herdado da fazenda) e novo filtro por mês de competência, ao lado dos filtros existentes." },
    ],
    onde: "Financeiro → Tesouraria → Conciliação Bancária → Histórico · Fiscal → LCDPR → Auditoria",
  },
  {
    versao: "2026.09.18-p",
    data: "18/09/2026",
    titulo: "5 correções: NF Apropriação Direta, Adiantamento no CP, Ciclos e Itens Gerais",
    modulos: ["Compras & Estoque", "Financeiro", "Cadastros"],
    itens: [
      { tipo: "correcao", texto: "NF de compra tipo Apropriação Direta estava exigindo vincular cada item a um produto do catálogo (insumo/princípio ativo) — bloqueava o processamento mesmo sendo justamente o tipo de NF criado para lançar despesas sem produto de estoque (combustível, manutenção, centro de custo). Corrigido: itens de Apropriação Direta nunca exigem produto." },
      { tipo: "correcao", texto: "Adiantamento a Fornecedor não aparecia no modal de \"Registrar pagamento\" em contas com mais de uma fazenda — a busca usava a fazenda ativa selecionada no topo, não a fazenda real do CP que estava sendo baixado. Corrigido pra usar a fazenda do próprio lançamento." },
      { tipo: "correcao", texto: "Ciclos cadastrados numa fazenda não apareciam ao consultar o Ano Safra estando em outra fazenda da mesma conta (aparecia só um aviso de \"N ciclo(s) em outras fazendas\"). Como o Ano Safra já é da conta como um todo, os ciclos agora aparecem independente de qual fazenda está ativa." },
      { tipo: "correcao", texto: "Cadastro de \"Itens Gerais\" (peças, materiais, escritório etc.) podia falhar ao salvar sem mostrar nenhum erro na tela — a mensagem de erro era escrita atrás do próprio modal aberto. Agora qualquer erro de salvamento aparece dentro do modal." },
      { tipo: "novo", texto: "Itens Gerais com subcategoria \"Peças e Manutenção\" agora têm campo de Número de Série e upload de foto do produto — aparecem na lista e no cadastro/edição do item." },
    ],
    onde: "Compras → NF de Produtos · Financeiro → Contas a Pagar · Cadastros → Anos Safra/Ciclos e Itens Gerais",
  },
  {
    versao: "2026.09.18-o",
    data: "18/09/2026",
    titulo: "Nova aba \"Auditoria\" no LCDPR — valida o que entra e o que fica de fora do Livro Caixa",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "novo", texto: "Nova aba \"Auditoria\" dentro do LCDPR: lista todo lançamento baixado/parcial de fazenda Pessoa Física no ano selecionado, comparado contra o que de fato entra no Livro Caixa — pra cada item excluído, mostra o motivo exato (entidade contábil = PJ, titular do lançamento = PJ, categoria interna de mútuo/transferência, descrição citando outro produtor/empresa da conta, ou vínculo de atividade diferente de rural). Cartões de resumo (total pago / no LCDPR / fora do LCDPR) e filtro por status. Serve pra validar se cada exclusão está certa ou é um dado de cadastro pra corrigir." },
    ],
    onde: "Fiscal → LCDPR → Auditoria",
  },
  {
    versao: "2026.09.18-n",
    data: "18/09/2026",
    titulo: "Conciliação Bancária — nunca mais casa CP de um titular com extrato de outro",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Em conta com vários titulares (cada um com contas bancárias próprias — ex: sócios, empresas do grupo), a conciliação automática (ao importar o OFX) não checava se o titular do CP era o mesmo titular da conta bancária — bastava o valor bater. Agora bloqueia: só concilia sozinho quando o titular do lançamento é o mesmo da conta (ou quando o lançamento não tem titular cadastrado)." },
      { tipo: "novo", texto: "Na conciliação manual (aba CP/CR em Aberto e na lista de lançamentos pra vincular), quando o titular do CP é diferente do titular da conta bancária ativa, a descrição aparece em cinza com o símbolo \"≠\" na frente — sem bloquear (é uma escolha manual), só sinalizando a divergência." },
    ],
    onde: "Financeiro → Conciliação Bancária",
  },
  {
    versao: "2026.09.18-m",
    data: "18/09/2026",
    titulo: "Correção grave: Conciliação Bancária escondia até 58% dos lançamentos",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "A tela de Conciliação carregava só os 600 lançamentos mais recentes (de todas as fazendas e produtores da conta somados) — numa conta grande, isso deixava a maioria dos lançamentos mais antigos completamente fora da memória da tela, tanto pra sugestão de correspondência quanto pra qualquer outra lista. Confirmado com dado real: conta com 1.438 lançamentos, só 600 chegavam a carregar (58% invisíveis). Corrigido pra buscar todos, paginado — deve explicar parte dos casos de \"conciliação com valor errado\" e de itens que pareciam \"desconciliar sozinhos\" ao recarregar a tela." },
    ],
    onde: "Financeiro → Conciliação Bancária",
  },
  {
    versao: "2026.09.18-l",
    data: "18/09/2026",
    titulo: "Contas a Pagar — usar Adiantamento a Fornecedor direto na baixa do CP",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Ao registrar pagamento de um CP, se o fornecedor tiver adiantamento em aberto, aparece um bloco \"💰 Adiantamento disponível deste fornecedor\" — informe quanto quer usar e clique em Aplicar. O valor abate o CP na hora (parcial ou total, sem precisar de conta bancária pra essa parte) e reduz o saldo do adiantamento. Se cobrir o CP inteiro, ele já fica baixado; se for parcial, o campo de pagamento se ajusta pro que ainda falta pagar via banco." },
    ],
    onde: "Financeiro → Contas a Pagar → Registrar pagamento",
  },
  {
    versao: "2026.09.18-k",
    data: "18/09/2026",
    titulo: "Correção: seletor de Safra/Ano vazio em conta com várias fazendas",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "correcao", texto: "Em NF-e Avulsa (Remessa/outras), o seletor \"Safra / Ano\" só listava as safras cadastradas na fazenda emitente escolhida — em conta com várias fazendas, se as safras foram cadastradas noutra fazenda da mesma conta, o seletor aparecia vazio mesmo a conta tendo safras cadastradas. Corrigido: passa a buscar em toda a conta, mesmo padrão já usado noutras telas." },
    ],
    onde: "Comercial & Logística → Faturamento → NF-e Avulsa",
  },
  {
    versao: "2026.09.18-j",
    data: "18/09/2026",
    titulo: "Conciliação Bancária — corrigido travamento e exclusão de extrato sem efeito",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "A aba \"CP/CR em Aberto\" recalculava a sugestão de correspondência escaneando todo o extrato pra cada lançamento em aberto, sem guardar o resultado — em contas com histórico grande (muitos lançamentos + extrato de vários bancos/anos), isso deixava a tela pesada e podia travar/travar o navegador ao recarregar. Agora indexa o extrato por valor antes de comparar, e guarda o resultado até os dados realmente mudarem." },
      { tipo: "correcao", texto: "Excluir um extrato importado (🗑 na lista de importações) podia falhar silenciosamente com a sessão mais antiga, sem aviso — a tela parecia \"sem efeito\" ao clicar em excluir. Corrigido: a exclusão agora passa por uma rota do servidor imune a esse tipo de falha, mesmo padrão já usado para vincular/baixar." },
    ],
    onde: "Financeiro → Conciliação Bancária",
  },
  {
    versao: "2026.09.18-i",
    data: "18/09/2026",
    titulo: "Correção: consulta Sintegra dizia \"nenhum certificado configurado\" mesmo tendo",
    modulos: ["Cadastros", "Fiscal"],
    itens: [
      { tipo: "correcao", texto: "O botão 🔎 (consultar Sintegra pela Inscrição Estadual, em Cadastros → Produtores) só procurava o certificado A1 na fazenda vinculada àquela IE específica — em conta com várias fazendas, se o certificado foi configurado em outra fazenda da mesma conta, a busca dizia \"nenhum certificado configurado\" mesmo o certificado existindo. Agora, se não encontra na fazenda da IE, procura em qualquer outra fazenda da mesma conta antes de desistir." },
    ],
    onde: "Cadastros → Produtores → Inscrições Estaduais",
  },
  {
    versao: "2026.09.18-h",
    data: "18/09/2026",
    titulo: "Combustível na Apropriação Direta alimenta o histórico de abastecimento do veículo",
    modulos: ["Compras & Estoque", "Configurações"],
    itens: [
      { tipo: "correcao", texto: "A OG \"GASTO COMBUSTÍVEL - CUSTO FAZENDA\" também é usada por clientes pra combustível comprado direto (posto), não só pra baixa de estoque — faltava marcar \"Combustível e Lubrificantes\" nela. Corrigido (também retroativo pras contas que já tinham essa OG)." },
      { tipo: "novo", texto: "Item de combustível na Apropriação Direta agora também pede o hodômetro/horímetro do veículo — data, tipo de combustível, valor por litro e valor total já vêm da NF, só faltava isso. Ao processar a NF, o abastecimento é lançado no histórico de abastecimento do veículo (mesmo registro que o abastecimento pela bomba em Estoque já usa) com a quantidade em litros e o valor, e o horímetro/hodômetro atual da máquina é atualizado." },
    ],
    onde: "Compras & Estoque → NF de Produtos → Apropriação Direta · Configurações → Operações Gerenciais",
  },
  {
    versao: "2026.09.18-g",
    data: "18/09/2026",
    titulo: "Correção: baixa automática na Conciliação Bancária não estava acontecendo",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Achado real em produção: quando o extrato OFX conciliava um lançamento automaticamente ao importar o arquivo, o sistema marcava a transação como conciliada mas nunca baixava o lançamento (ficava \"em aberto\" mesmo já vinculado a uma transação do banco) — em várias contas e bancos diferentes, não só um banco específico. O caminho manual (\"✓ Conciliar e Baixar\" na aba CP/CR em Aberto) já baixava certo; faltava esse mesmo passo no caminho automático, que é o que a maioria das transações segue. Corrigido: importar o OFX agora baixa também os lançamentos conciliados automaticamente." },
      { tipo: "correcao", texto: "A sugestão de correspondência na aba \"CP/CR em Aberto\" casava só por valor, sem considerar a data — se existisse mais de uma transação no extrato com o mesmo valor (comum em compras recorrentes de mesmo valor), podia sugerir a transação errada. Agora exige estar dentro de 15 dias do vencimento e prioriza a data mais próxima." },
      { tipo: "correcao", texto: "Bancos cujo FITID (identificador da transação) não é realmente único — repete \"data + sequência do dia\" em vez de um código do próprio banco — podiam, ao reimportar um período que se sobrepõe a uma importação anterior, herdar a conciliação de uma transação antiga pra uma transação nova e diferente que calhou de cair na mesma posição. Agora só preserva a conciliação anterior se o valor da transação realmente bater." },
    ],
    onde: "Financeiro → Conciliação Bancária",
  },
  {
    versao: "2026.09.18-f",
    data: "18/09/2026",
    titulo: "Apropriação Direta — a Operação Gerencial decide o que cada item pede; CC obrigatório",
    modulos: ["Compras & Estoque", "Configurações"],
    itens: [
      { tipo: "novo", texto: "Operação Gerencial agora é obrigatória antes de avançar para os itens numa NF de Apropriação Direta — não dá mais pra deixar pra escolher só no fim." },
      { tipo: "novo", texto: "Removido o checkbox \"É combustível?\" e a exigência de marcar o Centro de Custo como \"manutenção de máquinas\" pra liberar o rateio por frota — agora é a própria Operação Gerencial que decide: OG marcada como \"Combustível e Lubrificantes\" → item só pede o veículo que abasteceu; OG marcada como \"Manutenção e Reparos\" → item permite ratear entre várias frotas por percentual, sempre somando 100%; qualquer outra OG → item pede o Centro de Custo, agora obrigatório (antes era opcional)." },
      { tipo: "novo", texto: "Nova opção \"Combustível e Lubrificantes\" no cadastro de Operações Gerenciais (Configurações → Operações Gerenciais, aba Telas/Módulos) — marque nas suas OGs de combustível pra ativar o modo veículo na Apropriação Direta. As duas OGs padrão do catálogo global (Compra de Combustíveis e Compra de Aditivos e Lubrificantes) já saem marcadas." },
    ],
    onde: "Compras & Estoque → NF de Produtos → Apropriação Direta · Configurações → Operações Gerenciais",
  },
  {
    versao: "2026.09.18-e",
    data: "18/09/2026",
    titulo: "Correção: seletor de Veículo/Máquina vazio em conta com várias fazendas",
    modulos: ["Compras & Estoque", "Cadastros", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Máquinas são cadastradas numa fazenda só, mas o seletor de veículo/máquina (combustível e rateio por frota na Apropriação Direta, cadastro de manutenção, seguros, etc.) só listava as da fazenda ativa — em conta com várias fazendas, processar uma NF numa fazenda sem máquina cadastrada mostrava o seletor vazio, mesmo a conta tendo centenas cadastradas em outra fazenda. Corrigido: a lista agora busca em todas as fazendas da conta, mesmo padrão já aplicado em Operações Gerenciais, Plano de Contas e Usuários." },
    ],
    onde: "Compras & Estoque → NF de Produtos · Cadastros → Máquinas · Financeiro → Contratos/Seguros",
  },
  {
    versao: "2026.09.18-d",
    data: "18/09/2026",
    titulo: "Correção: atualizações do sistema não apareciam mesmo após publicadas",
    modulos: ["Configurações"],
    itens: [
      { tipo: "correcao", texto: "O Service Worker do App Campo (suporte offline em campo) estava registrado pra todo o site, não só pra /campo — fazendo o navegador guardar em cache páginas e arquivos de telas administrativas (ex: NF de Produtos) que nunca precisaram de suporte offline. Resultado: uma atualização publicada podia demorar bem mais que o esperado pra aparecer pro usuário, mesmo depois de aceitar o aviso do sino, porque o navegador continuava servindo versões antigas cacheadas em segundo plano. Corrigido: o Service Worker agora só é registrado dentro de /campo, e qualquer registro antigo de todo o site é removido automaticamente na próxima navegação em qualquer outra tela." },
    ],
    onde: "Toda a plataforma (bug de infraestrutura, sem tela específica)",
  },
  {
    versao: "2026.09.18-c",
    data: "18/09/2026",
    titulo: "Apropriação Direta — aplicar o mesmo Centro de Custo a todos os itens de uma vez",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "novo", texto: "Depois de escolher o Centro de Custo em \"Vincular a um centro de custo?\" (cabeçalho), aparece o botão \"↓ Aplicar este centro de custo a todos os itens\" — preenche o CC de todos os itens da NF de uma vez, em vez de selecionar item por item. Útil em NFs com muitos itens do mesmo CC (ex: NF de mercado). Item que precisa de um CC diferente continua podendo ser ajustado individualmente depois." },
    ],
    onde: "Compras & Estoque → NF de Produtos → Apropriação Direta / Peças / VEF / Remessa",
  },
  {
    versao: "2026.09.18-b",
    data: "18/09/2026",
    titulo: "Lista de NF de Produtos — grid mais compacto",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Fonte e espaçamento da lista de NFs reduzidos — colunas e botões (Ver, DANFE, ⋮, manifestação, excluir) ficam menos apertados, sem quebrar linha ou cortar texto." },
    ],
    onde: "Compras & Estoque → NF de Produtos",
  },
  {
    versao: "2026.09.18-a",
    data: "18/09/2026",
    titulo: "Correção: Usuários e Grupos de Acesso não apareciam em conta com várias fazendas",
    modulos: ["Configurações"],
    itens: [
      { tipo: "correcao", texto: "Configurações → Usuários & Permissões mostrava \"0 usuários\"/\"0 grupos\" pra contas com mais de uma fazenda, quando os usuários/grupos foram cadastrados numa fazenda diferente da que está ativa no momento — a leitura olhava só a fazenda ativa, não a conta toda. Corrigido: usuários e grupos de acesso agora aparecem pra toda a conta, de qualquer fazenda, igual já funciona em Operações Gerenciais e Plano de Contas." },
    ],
    onde: "Configurações → Usuários & Permissões",
  },
  {
    versao: "2026.09.17-z",
    data: "17/09/2026",
    titulo: "Apropriação Direta — combustível por veículo e rateio de peças entre frotas",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "novo", texto: "Item de NF do tipo Apropriação Direta agora pode ser marcado como \"⛽ É combustível?\" — ao marcar, aparece um seletor pra indicar qual veículo abasteceu (útil pra diesel comprado direto no posto, sem passar por bomba/estoque próprio de combustível — controle de custo por frota, não movimenta estoque)." },
      { tipo: "novo", texto: "Item de peça/serviço de manutenção (quando o Centro de Custo escolhido é de manutenção de máquinas) agora pode ratear o custo entre várias máquinas por percentual manual, em vez de indicar uma máquina só — cada máquina do rateio recebe seu custo proporcional no histórico de manutenção (mesmo relatório de custo por máquina que já existe em Relatórios → Manutenção). O rateio precisa somar 100% pra processar a NF." },
    ],
    onde: "Compras & Estoque → NF de Produtos → Apropriação Direta",
  },
  {
    versao: "2026.09.17-y",
    data: "17/09/2026",
    titulo: "Correção: Operação Gerencial criada pelo cliente só aparecia pra quem criou",
    modulos: ["Configurações"],
    itens: [
      { tipo: "correcao", texto: "Criar uma nova Operação Gerencial gravava com a fazenda ativa de quem criou, em vez de vincular à conta inteira. Numa conta com várias fazendas, isso fazia a operação só aparecer pra quem criou (e outros usuários Raccolto, que têm acesso irrestrito) — todo o resto da equipe do cliente, mesmo com permissão, não via. Corrigido: nova Operação Gerencial agora é vinculada à conta, visível pra todos os usuários e fazendas da conta, como já era o comportamento esperado. ⚠️ Requer executar a Seção 270 do arquivo de migrations no Supabase (corrige a leitura das operações já criadas com esse problema)." },
    ],
    onde: "Configurações → Operações Gerenciais",
  },
  {
    versao: "2026.09.17-x",
    data: "17/09/2026",
    titulo: "LCDPR ainda incluía título de titular PJ; Plano de Contas 'não cadastrado' em conta com várias fazendas",
    modulos: ["Fiscal", "Configurações"],
    itens: [
      { tipo: "correcao", texto: "Um lançamento cujo titular (campo Produtor do lançamento, ou o titular padrão da fazenda) é uma empresa (CNPJ) continuava entrando no LCDPR — o filtro checava só o campo Entidade Contábil, que reflete a entidade padrão da fazenda, não a do titular específico daquele lançamento. Agora qualquer lançamento cujo titular seja PJ é excluído do LCDPR, sempre — LCDPR é exclusivo de Pessoa Física." },
      { tipo: "correcao", texto: "Em conta com várias fazendas, se o Plano de Contas foi cadastrado com a conta ativa de uma fazenda e o usuário está com outra fazenda da mesma conta ativa, a tela de Operações Gerenciais avisava 'Plano de Contas não cadastrado' mesmo ele existindo — a leitura olhava só a fazenda ativa, não a conta toda. Corrigido pra resolver em todas as fazendas da conta, igual já funciona pra Operações Gerenciais." },
    ],
    onde: "Fiscal → LCDPR → Livro Caixa/Exportação · Configurações → Operações Gerenciais",
  },
  {
    versao: "2026.09.17-w",
    data: "17/09/2026",
    titulo: "Correção: Operações Gerenciais recém-criadas não apareciam pra ninguém em contas com muitas fazendas",
    modulos: ["Configurações", "Financeiro", "Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Em contas com várias fazendas (ex: 7 fazendas), a lista de Operações Gerenciais já passava de 1.000 linhas somando o catálogo global com o legado por fazenda — e o banco corta silenciosamente em 1.000 por página quando a busca não pede as páginas seguintes. Resultado: operações criadas depois desse corte (pela ordem de classificação) não apareciam pra nenhum usuário da conta, mesmo com permissão correta — parecia bug de permissão, mas era paginação. Corrigido nas 3 rotinas que carregam Operações Gerenciais para buscarem todas as páginas." },
    ],
    onde: "Configurações → Operações Gerenciais · qualquer seletor de Operação Gerencial (NF, CP/CR, Tesouraria, Estoque)",
  },
  {
    versao: "2026.09.17-v",
    data: "17/09/2026",
    titulo: "NF de Produtos e Entrada de NF (Estoque) — apropriação direta unificada, sem CC na entrada de estoque",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Existiam dois jeitos de marcar um item pra não entrar no estoque (custo direto): o tipo de entrada 'Apropriação Direta' pra NF inteira, e um toggle por item dentro do modo Insumos. O toggle por item foi removido — agora só existe um caminho, o tipo de entrada 'Apropriação Direta'. Isso vale pra NF de Produtos (Compras & Estoque) e pra Entrada de NF (Estoque → NF Entrada)." },
      { tipo: "correcao", texto: "Item que vai pro estoque não pede mais Centro de Custo, em nenhuma das duas telas — a apropriação de custo é no consumo (quando o insumo é usado numa operação de talhão/ciclo), não na compra. O CC continua disponível pros outros tipos de item (custo direto, peças, VEF, remessa) e como classificação financeira do pagamento (CP) gerado pela NF." },
    ],
    onde: "Compras & Estoque → NF de Produtos · Estoque → NF Entrada",
  },
  {
    versao: "2026.09.17-u",
    data: "17/09/2026",
    titulo: "Operações Gerenciais — botão Duplicar; LCDPR — removida a visão de Empresa (PJ)",
    modulos: ["Configurações", "Fiscal"],
    itens: [
      { tipo: "novo", texto: "Novo botão ⧉ Duplicar em Configurações → Operações Gerenciais — copia toda a configuração de uma operação existente pra criar uma nova rapidamente, só com o código em branco e '(cópia)' na descrição. Já existia esse botão em Admin → Padrões de OG (Raccolto); agora também disponível pro cliente na tela onde ele cria suas próprias operações." },
      { tipo: "correcao", texto: "Revertida a opção de selecionar uma Empresa (PJ) no Relatório PDF do LCDPR (adicionada mais cedo hoje) — com o campo Entidade Contábil agora editável direto no lançamento de CP/CR, não é mais necessário uma visão em separado pra conferir o PJ: o LCDPR já reflete corretamente a origem de cada título, seja qual for a conta usada pra pagar/receber." },
      { tipo: "correcao", texto: "Removido, junto com o item acima, o checkbox 'Excluir receitas de produtores PJ' — mesma razão: a origem PF/PJ agora é resolvida pelo campo Entidade Contábil do lançamento, não por uma heurística separada sobre o cadastro de Produtores." },
    ],
    onde: "Configurações → Sistema → Operações Gerenciais · Fiscal → LCDPR → Exportação",
  },
  {
    versao: "2026.09.17-t",
    data: "17/09/2026",
    titulo: "Correção: pagamento de arrendamento em dinheiro (BRL) lançado manualmente não gerava CP",
    modulos: ["Comercial & Logística", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "O gerador de parcelas em lote (por safra) já lançava o CP normalmente para arrendamentos em dinheiro. Mas adicionar ou editar uma parcela manualmente na aba Pagamentos só salvava o registro na tela do Arrendamento — nunca criava o lançamento em Contas a Pagar. Corrigido: salvar uma parcela BRL manual agora cria (ou atualiza, se já existir) o CP correspondente." },
    ],
    onde: "Comercial & Logística → Contratos de Arrendamento → aba Pagamentos",
  },
  {
    versao: "2026.09.17-s",
    data: "17/09/2026",
    titulo: "Correção: borderô 'vazio' (0 títulos) que não conseguia ser excluído",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Cancelar, estornar ou confirmar um borderô agora passa por uma rota do servidor, imune a sessão expirada — antes usava o navegador direto, e em sessões mais longas a exclusão podia falhar sem aviso, deixando um card de borderô 'vazio' (0 títulos, R$ 0,00) preso na lista. Os 2 casos já encontrados em produção foram limpos." },
      { tipo: "correcao", texto: "De passagem, corrigido também: confirmar pagamento de um borderô que inclua um título com baixa parcial anterior agora soma sobre o que já tinha sido pago, em vez de sobrescrever — mesmo ajuste feito hoje na baixa em lote direta." },
    ],
    onde: "Financeiro → Contas a Pagar / Contas a Receber → Borderôs",
  },
  {
    versao: "2026.09.17-r",
    data: "17/09/2026",
    titulo: "LCDPR — baixas parciais entram no Livro Caixa; Entidade Contábil editável no lançamento",
    modulos: ["Financeiro", "Fiscal"],
    itens: [
      { tipo: "correcao", texto: "O LCDPR só considerava lançamentos com status 'Baixado' — uma baixa parcial (que já é dinheiro real saindo/entrando no caixa) ficava completamente fora do Livro Caixa, mesmo o sistema já guardando o valor efetivamente pago e a data da baixa. Agora entram também os lançamentos 'Parcial', com o valor realmente pago na data da baixa." },
      { tipo: "novo", texto: "Novo campo 'Entidade Contábil (LCDPR/SPED)' no lançamento de Contas a Pagar e a Receber — deixa marcar manualmente se aquele título é de origem Pessoa Física ou Jurídica, independente de qual conta bancária foi usada pra pagar/receber. Por padrão continua herdando da fazenda, como sempre; o campo é só pra corrigir o caso específico de um título de uma entidade pago pela conta/fluxo da outra." },
    ],
    onde: "Fiscal → LCDPR · Financeiro → Contas a Pagar / Contas a Receber → Novo Lançamento",
  },
  {
    versao: "2026.09.17-p",
    data: "17/09/2026",
    titulo: "Correção: sincronização SIEG travando com erro 429 e AbortError em contas de volume alto",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Contas com muitas notas pendentes (NF de Produtos e NF de Serviço) podiam ter a sincronização SIEG interrompida por limite de requisições da API (erro 429) ou por timeout do navegador antes do servidor terminar (erro de rede 'AbortError'). Ajustado o espaçamento entre requisições, o número de tentativas e a margem de tempo do navegador — e o erro de timeout agora mostra uma mensagem orientativa em vez do erro técnico bruto." },
    ],
    onde: "Compras & Estoque → NF de Produtos / NF de Serviço → Sincronizar SIEG",
  },
  {
    versao: "2026.09.17-o",
    data: "17/09/2026",
    titulo: "Novo: registrar NF de remessa própria já emitida no sistema anterior",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "novo", texto: "Na implantação, o cliente pode já ter emitido uma NF de remessa (transferência entre depósitos/fazendas) no sistema anterior. O modal de Transferência de Estoque agora tem a opção 'NF já emitida no sistema anterior' — registra o número, série, chave de acesso (opcional) e data de emissão informados, cria a movimentação de estoque correspondente, e nunca transmite nada à SEFAZ." },
    ],
    onde: "Estoque → Transferências → Nova Transferência",
  },
  {
    versao: "2026.09.17-n",
    data: "17/09/2026",
    titulo: "Contas a Pagar e a Receber — aviso de título já lançado (mesmo emissor + nº de documento)",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Ao lançar manualmente um CP ou CR com o mesmo fornecedor/cliente e o mesmo número de documento de um título já existente, o sistema agora avisa 'Título já lançado' antes de salvar, com botão para ver o lançamento existente e conferir — evitando duplicar título por engano." },
    ],
    onde: "Financeiro → Contas a Pagar / Contas a Receber → Novo Lançamento",
  },
  {
    versao: "2026.09.17-m",
    data: "17/09/2026",
    titulo: "Contratos Financeiros — parcelas só vão para o CP ao salvar, com juros e amortização editáveis",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Calcular o cronograma de parcelas (SAC/PRICE/SACRE) ou usar o cronograma extraído de PDF já lançava as parcelas em Contas a Pagar na hora, sem chance de revisar antes. Agora calcular só monta a tabela — o lançamento em CP passou para um botão explícito 'Salvar Parcelas e Lançar no CP'." },
      { tipo: "novo", texto: "Novo checkbox 'Editar parcelas' libera edição manual das colunas Juros e Amortização da tabela calculada (Vencimento e Valor da Parcela já eram editáveis)." },
    ],
    onde: "Financeiro → Contratos Financeiros → editar contrato → aba Pagamento",
  },
  {
    versao: "2026.09.17-l",
    data: "17/09/2026",
    titulo: "Correção: NF de Remessa gerada de uma NF de compra com rateio Global de Centro de Custo vinha sem itens",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Uma NF de compra processada com rateio 'Global — um único CC para toda a NF' tinha todos os itens marcados internamente como custo direto, mesmo os que o usuário indicou como estoque — o item nunca entrava no estoque de verdade, e a NF de Remessa gerada a partir dessa compra vinha sem nenhum item (o filtro da tela de Remessa corretamente ignora custo direto, que não é mercadoria física). Corrigido para o rateio Global só decidir como o centro de custo é distribuído entre os itens, sem alterar se o item é estoque ou custo direto." },
    ],
    onde: "Compras & Estoque → NF de Produtos → rateio Global de Centro de Custo",
  },
  {
    versao: "2026.09.17-k",
    data: "17/09/2026",
    titulo: "Contas a Pagar e a Receber — multa, juros e desconto na baixa em lote",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "A baixa/recebimento em lote (múltiplos títulos de uma vez) agora tem colunas editáveis de Multa, Juros e Desconto por título, com o valor final recalculado na hora. Um título com pagamento parcial anterior não perde mais o que já tinha sido pago ao ser incluído num lote — o sistema soma sobre o saldo restante, igual à baixa individual." },
      { tipo: "correcao", texto: "Multa, juros e desconto aplicados numa baixa (individual ou em lote) agora ficam guardados no lançamento — antes só entravam no cálculo do valor final na hora e se perdiam depois, sem dar pra saber quanto foi cobrado de encargo no mês." },
    ],
    onde: "Financeiro → Contas a Pagar / Contas a Receber → selecionar títulos → Baixar em Lote",
  },
  {
    versao: "2026.09.17-j",
    data: "17/09/2026",
    titulo: "LCDPR — coluna de Operação Gerencial nas exportações PDF e Excel",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "novo", texto: "Os relatórios de conferência do Livro Caixa (PDF e Excel) agora mostram a Operação Gerencial de cada lançamento. Só nessas duas exportações — a tela do Livro Caixa e o arquivo oficial .txt de entrega continuam exatamente como eram." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação → Gerar PDF / Gerar Excel",
  },
  {
    versao: "2026.09.17-i",
    data: "17/09/2026",
    titulo: "Conciliação Bancária reconstruída — visão contínua por conta, sem mais fragmentação",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Quando o extrato era importado várias vezes por semana, cada importação virava um card isolado, e um período novo podia mostrar como 'não conciliado' algo que já tinha sido conciliado num import anterior. Agora existe uma única visão contínua por conta bancária + período, que junta tudo automaticamente — não importa quantos arquivos OFX foram importados." },
      { tipo: "novo", texto: "Reimportar um período que já tinha sido importado antes não é mais bloqueado — o sistema funde os dados com segurança e nunca desfaz uma conciliação já feita." },
    ],
    onde: "Financeiro → Conciliação Bancária",
  },
  {
    versao: "2026.09.17-h",
    data: "17/09/2026",
    titulo: "Pedido de Compra — mesmo produto em duas linhas não confunde mais a entrega",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Quando um pedido de compra tinha o mesmo produto em duas linhas (embalagens ou valor fiscal diferentes), o sistema calculava a entrega só pelo produto e aplicava o mesmo total nas duas linhas — uma aparecia com mais de 100% entregue enquanto a outra, sem receber nada de verdade, mostrava o mesmo número. Ao processar a NF, quando há ambiguidade o sistema agora pede pra indicar exatamente qual linha do pedido está sendo atendida." },
    ],
    onde: "Compras & Estoque → NF de Produtos / Pedidos de Compra",
  },
  {
    versao: "2026.09.17-g",
    data: "17/09/2026",
    titulo: "Novo: gerar/regenerar parcelas de prêmio ao editar uma apólice de Seguro",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Antes só era possível gerar o cronograma de parcelas/CP de uma apólice no cadastro inicial — apólice já existente sem parcelas (por qualquer motivo) ficava sem forma de corrigir isso pela tela. Agora, ao editar, mexer no toggle 'À Vista/Parcelado' ou clicar em 'Gerar' e salvar recalcula o cronograma. Parcelas já pagas nunca são tocadas; se já existir parcela lançada, o sistema pede confirmação antes de substituir." },
    ],
    onde: "Financeiro → Seguros / Apólices → editar apólice → aba Financeiro",
  },
  {
    versao: "2026.09.17-f",
    data: "17/09/2026",
    titulo: "NF de Produtos — conversão de unidade nunca mais altera a NF original",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Quando um item precisa de conversão de unidade pra entrar certo no estoque (ex: embalagem de vários litros), a quantidade e o preço como o fornecedor emitiu agora ficam guardados separadamente, sem nunca serem sobrescritos pela conversão. Antes, só a versão convertida era salva — uma NF de Devolução gerada depois ficava com números diferentes do documento original do fornecedor. A tela de Devolução agora mostra 'NF original: X un' como referência sempre que o item teve conversão." },
    ],
    onde: "Compras & Estoque → NF de Produtos",
  },
  {
    versao: "2026.09.17-e",
    data: "17/09/2026",
    titulo: "Correção: Centro de Custo sumindo no Pedido de Compra em clientes multi-fazenda",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "correcao", texto: "O select de Centro de Custo ao lançar item de Pedido de Compra buscava só os centros de custo da fazenda ativa no momento — em contas com mais de uma fazenda, se os centros de custo estavam cadastrados numa fazenda diferente da ativa, a lista aparecia vazia. Agora busca de todas as fazendas da conta, igual a outras listas do sistema." },
    ],
    onde: "Comercial & Logística → Pedidos de Compra",
  },
  {
    versao: "2026.09.17-d",
    data: "17/09/2026",
    titulo: "Correção: pagamento de parcela de Contrato Financeiro não baixava o CP real",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "'Registrar Pagamento' de uma parcela de Contrato Financeiro só marcava a parcela como paga na tela — o lançamento de Conta a Pagar real ficava 'Em Aberto'/'Vencido' pra sempre, mesmo com a parcela já quitada. Corrigido: agora localiza e baixa o(s) lançamento(s) de CP correspondentes (amortização/juros/encargos). 'Reabrir Parcela' corrigido da mesma forma." },
    ],
    onde: "Financeiro → Contratos Financeiros → aba Pagamento",
  },
  {
    versao: "2026.09.17-c",
    data: "17/09/2026",
    titulo: "Correção: CP de prêmio de Seguro não era gerado",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Cadastrar uma apólice com prêmio parcelado ou à vista salvava a apólice, mas nunca gerava o lançamento de Conta a Pagar do prêmio — um valor não permitido no banco travava a criação silenciosamente. Corrigido; as apólices já cadastradas sem CP tiveram as parcelas geradas retroativamente." },
    ],
    onde: "Financeiro → Seguros / Apólices",
  },
  {
    versao: "2026.09.17-b",
    data: "17/09/2026",
    titulo: "Abastecimento de Máquinas — Safra/Ciclo, busca por digitação e menu Máquinas",
    modulos: ["Produção"],
    itens: [
      { tipo: "novo", texto: "Novo campo 'Safra / Ciclo' no Abastecimento de Máquinas — permite separar o custo de combustível por safra/ciclo no Orçamento Planejado × Realizado e nos relatórios. Aparece também como coluna no histórico." },
      { tipo: "correcao", texto: "O campo de seleção de Máquina no Abastecimento não permitia buscar digitando o nome — era um select nativo, sem filtro. Trocado pelo componente de busca já usado em outras telas do sistema (Financeiro, NF de Produtos)." },
      { tipo: "melhoria", texto: "'Máquinas' não aparecia como uma entrada própria no menu Produção — só 'Máquinas e Veículos', dentro de uma seção sem cabeçalho clicável. Agora existe um submenu 'Máquinas' (com seta ▶) dentro de Produção, reunindo Máquinas e Veículos, Abastecimento de Máquinas, Manutenções e Custos por Máquina." },
    ],
    onde: "Produção → Máquinas",
  },
  {
    versao: "2026.09.17-a",
    data: "17/09/2026",
    titulo: "Novo: Encerrar Pedido de Compra com ajuste de divergência",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "novo", texto: "Pedidos 'Parcialmente Entregue' ganharam o botão '🔒 Encerrar Pedido' (dentro do modal Entregas/NFs Vinculadas) — abre uma tela de ajuste mostrando pedido x entregue x saldo por item, com campo para cancelar o saldo residual (pré-preenchido com a diferença) e motivo obrigatório. Ao confirmar, o pedido fecha como 'Entregue' e o motivo fica registrado na observação do pedido. Não existia nenhuma rotina para isso antes — pedidos com pequena divergência de peso/casas decimais ficavam travados para sempre." },
    ],
    onde: "Comercial & Logística → Pedidos de Compra → Entregas/NFs Vinculadas",
  },
  {
    versao: "2026.09.16-r",
    data: "16/09/2026",
    titulo: "Correção: Pedido de Compra vinculado a NF não avançava de status",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "correcao", texto: "Pedido de Compra com Notas Fiscais vinculadas (modo Fiscal) ficava travado em 'Aprovado' para sempre, mesmo depois de 100% recebido — a quantidade entregue só era calculada para exibição na tela 'NFs Vinculadas', mas nunca era salva para atualizar o status do pedido. Agora processar, estornar ou excluir uma NF vinculada a um pedido recalcula a entrega e o status ('Aprovado' → 'Parcialmente Entregue' → 'Entregue') na hora. Corrigidos também 23 pedidos que já estavam travados." },
    ],
    onde: "Comercial & Logística → Pedidos de Compra",
  },
  {
    versao: "2026.09.16-q",
    data: "16/09/2026",
    titulo: "Performance — índices de banco e cache de telas de cadastro",
    modulos: ["Compras & Estoque", "Lavoura", "Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "Adicionados índices de banco em 10 tabelas que crescem a cada nota, operação de lavoura ou romaneio (estoque/Kardex, itens de NF, manutenções, parcelas de contratos financeiros, plantio/pulverização/colheita/adubação/correção de solo, romaneios, conciliação bancária) — consultas que ficavam mais lentas conforme o histórico do cliente crescia." },
      { tipo: "melhoria", texto: "Telas de cadastro (fazendas, produtores, pessoas, empresas, contas bancárias, anos-safra, centros de custo, operações gerenciais, formas de pagamento, cartões) agora usam um cache rápido de 45 segundos no navegador — evita buscar os mesmos dados do zero a cada troca de tela. Nada que muda com frequência (lançamentos, notas, estoque, operações de lavoura) foi cacheado." },
    ],
    onde: "Sistema todo — mais perceptível em contas com histórico grande",
  },
  {
    versao: "2026.09.16-p",
    data: "16/09/2026",
    titulo: "Abastecimento de Máquinas — movido para o topo do menu Produção",
    modulos: ["Produção"],
    itens: [
      { tipo: "melhoria", texto: "Após o primeiro reposicionamento (dentro de Produção → Máquinas) ainda ficar pouco visível, 'Abastecimento de Máquinas' foi movido para o topo do menu Produção — primeiro item ao abrir o menu, antes de qualquer seção." },
    ],
    onde: "Produção → Abastecimento de Máquinas",
  },
  {
    versao: "2026.09.16-o",
    data: "16/09/2026",
    titulo: "Abastecimento de Máquinas — reposicionado no menu",
    modulos: ["Produção", "Compras & Estoque"],
    itens: [
      { tipo: "melhoria", texto: "'Abastecimento de Máquinas' estava em Suprimentos → Estoque de Grãos (sem relação com o resto da seção, difícil de achar). Movido para Produção → Máquinas, junto de 'Máquinas e Veículos', 'Manutenções' e 'Custos por Máquina'." },
    ],
    onde: "Produção → Máquinas → Abastecimento de Máquinas",
  },
  {
    versao: "2026.09.16-n",
    data: "16/09/2026",
    titulo: "Correção: contas bancárias duplicadas em cliente com múltiplas fazendas",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Uma conta com mais de uma fazenda tinha a mesma conta bancária cadastrada duas vezes (uma por fazenda), fazendo o mesmo banco aparecer repetido no select de 'Registrar pagamento' da baixa de CP. Identificadas e desativadas 6 contas bancárias duplicadas (sem lançamento, adiantamento ou contrato vinculado) — nada foi apagado." },
    ],
    onde: "Financeiro → Contas a Pagar → Registrar pagamento",
  },
  {
    versao: "2026.09.16-m",
    data: "16/09/2026",
    titulo: "NF de Produtos — produto obrigatório por item ao processar",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "melhoria", texto: "Ao clicar em 'Processar', a NF de Produtos agora bloqueia se algum item de estoque (ou VEF/remessa) não tiver um insumo ou princípio ativo associado — antes era só um aviso e o item ficava de fora silenciosamente, processando a NF com valor de itens maior do que o efetivamente lançado no estoque/financeiro. Item que não é produto (frete, taxa) continua liberado usando o toggle 'C. Custo'." },
    ],
    onde: "Compras & Estoque → NF de Produtos",
  },
  {
    versao: "2026.09.16-l",
    data: "16/09/2026",
    titulo: "Correção: erro ao processar NF de Produtos vinculada a Pedido de Compra",
    modulos: ["Compras & Estoque"],
    itens: [
      { tipo: "correcao", texto: "Processar uma NF de Produtos vinculada a um Pedido de Compra podia falhar com o erro interno 'violates foreign key constraint nf_entradas_lancamento_id_fkey'. Acontecia quando o pedido guardava uma referência a um lançamento financeiro que já tinha sido apagado (por exemplo, ao reprocessar a NF mais de uma vez ou processar duas NFs do mesmo pedido). Agora o sistema confere se o lançamento ainda existe antes de reaproveitá-lo — se não existir mais, cria um novo normalmente." },
    ],
    onde: "Compras & Estoque → NF de Produtos",
  },
  {
    versao: "2026.09.16-k",
    data: "16/09/2026",
    titulo: "Coluna de unidade no histórico de entregas do Pedido de Compra",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "melhoria", texto: "Modal 'Entregas' do Pedido de Compra: a tabela 'Histórico de Entregas' ganhou a coluna 'Un.' (kg, sc, L...), igual à tabela de cima — a quantidade entregue não tinha unidade, o que confundia em pedidos com itens de unidades diferentes." },
    ],
    onde: "Comercial & Logística → Pedidos de Compra → Entregas",
  },
  {
    versao: "2026.09.16-j",
    data: "16/09/2026",
    titulo: "LCDPR — filtro para excluir receitas com comprador PJ",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "novo", texto: "Novo checkbox na aba Exportação: 'Excluir receitas de produtores PJ'. Desligado por padrão. Remove do Livro Caixa (tela, KPIs, Resumo Mensal e todas as exportações) receitas atribuídas a um 'produtor' que no cadastro é na verdade uma empresa (CNPJ) — não tem relação com quem comprou/pagou (comprador ser empresa é normal). Ajustado após a primeira versão ter saído com a lógica trocada (excluía pelo comprador, não pelo produtor)." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16-i",
    data: "16/09/2026",
    titulo: "Botão Voltar em todas as telas",
    modulos: ["Geral"],
    itens: [
      { tipo: "novo", texto: "Novo botão '← Voltar' no canto superior esquerdo (ao lado da logo), em toda tela do sistema — leva direto pra tela anterior, sem precisar navegar pelo menu de novo. Não aparece no Dashboard." },
    ],
    onde: "Topo de qualquer tela",
  },
  {
    versao: "2026.09.16-h",
    data: "16/09/2026",
    titulo: "Pedidos de Compra — coluna Operação e identificação do pedido nos modais",
    modulos: ["Comercial & Logística"],
    itens: [
      { tipo: "correcao", texto: "Coluna 'Operação' na lista de Pedidos de Compra mostrava o código interno (UUID) em vez do nome da Operação Gerencial quando o pedido era de uma fazenda diferente da fazenda ativa no momento. Corrigido — a busca do nome agora resolve todas as fazendas da conta direto no servidor, não depende mais do que a tela tem carregado no momento." },
      { tipo: "correcao", texto: "Os modais 'NFs Vinculadas' / 'Entregas' e 'Relatório do Pedido' mostravam o número sequencial interno do pedido (o mesmo da coluna 'Nº') em vez do 'Nº Pedido' que identifica o pedido de verdade. Agora mostram o Nº Pedido, igual à tela de NF de Produtos ao vincular um pedido." },
    ],
    onde: "Comercial & Logística → Pedidos de Compra",
  },
  {
    versao: "2026.09.16-g",
    data: "16/09/2026",
    titulo: "LCDPR — transferência entre produtores continuava aparecendo no Livro Caixa",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Transferências entre produtores/empresas da mesma conta continuavam aparecendo como receita no Livro Caixa do LCDPR em alguns casos. Causa: PIX importados do extrato bancário entre contas de produtores diferentes ficam categorizados como 'Transferência entre Contas' — categoria que antes só era excluída quando era 'Mútuo entre Empresas'. Agora as duas categorias são excluídas, e como camada extra, qualquer lançamento cujo histórico mencione o nome de outro produtor/empresa da própria conta (comum em PIX sem cadastro vinculado) também é excluído." },
    ],
    onde: "Fiscal → LCDPR",
  },
  {
    versao: "2026.09.16-f",
    data: "16/09/2026",
    titulo: "LCDPR — nome do cliente e remoção dos quadros de KPI do relatório",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "A linha 'Cliente' recém-adicionada ao cabeçalho do relatório PDF do LCDPR não aparecia quando um usuário Raccolto (raccotlo) gerava o relatório navegando pela conta de um cliente. Corrigido." },
      { tipo: "melhoria", texto: "Removidos os quadros Saldo Inicial / Total Receitas / Total Despesas / Saldo Final do relatório PDF." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16-e",
    data: "16/09/2026",
    titulo: "LCDPR — identificação do cliente no cabeçalho do relatório",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "melhoria", texto: "Relatório PDF do LCDPR ganhou uma linha 'Cliente' no cabeçalho (nome da conta) — antes a única forma de identificar de qual cliente era o relatório era olhando os nomes das contas bancárias na tabela. Aparece sempre, independente do produtor/empresa selecionado." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16-d",
    data: "16/09/2026",
    titulo: "LCDPR — coluna Produtor no relatório com 'Todos' selecionado",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "melhoria", texto: "Relatório PDF do LCDPR com 'Todos os Produtores' selecionado: os lançamentos e o total já eram de todos os produtores combinados (conferido direto no banco), mas a tabela não mostrava de qual produtor era cada linha, dando a impressão de que vinha tudo de um só. Adicionada a coluna 'Produtor' nessa visão." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16-c",
    data: "16/09/2026",
    titulo: "LCDPR — relatório inclui Empresas (PJ) e exclui transferências internas",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "correcao", texto: "Relatório PDF do LCDPR com 'Todos os produtores' selecionado mostrava no cabeçalho o nome e CPF de apenas o primeiro produtor da lista, dando a impressão de que os dados eram só dele — as tabelas já traziam todos, só o cabeçalho estava errado. Corrigido: mostra 'Todos os Produtores' sem atribuir a um CPF específico." },
      { tipo: "novo", texto: "Exportação do LCDPR: o seletor 'Produtor' virou 'Produtor / Empresa' e passou a listar também as Empresas (PJ) da conta — só para o Relatório PDF de conferência (o .txt oficial e o Excel continuam exclusivos de Pessoa Física, como exige a lei). Ao escolher uma Empresa, não se aplica quota-parte." },
      { tipo: "correcao", texto: "Lançamentos de 'Mútuo entre Empresas' (Financeiro → Tesouraria) — transferência interna entre produtores/empresas da mesma conta — deixaram de entrar no Livro Caixa do LCDPR (tela e todas as exportações). Não é receita nem despesa real." },
      { tipo: "melhoria", texto: "Removido o quadro 'Resumo Mensal' do relatório PDF do LCDPR — o resumo mensal já aparece na própria tela de Exportação." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16-b",
    data: "16/09/2026",
    titulo: "LCDPR — PDF agora é um relatório de verdade",
    modulos: ["Fiscal"],
    itens: [
      { tipo: "melhoria", texto: "LCDPR → Exportação → 'Relatório PDF' deixou de ser um print cru da tela (com abas e botões) e virou um relatório estruturado: identificação do produtor, KPIs, tabela de Imóveis Rurais, Contas Bancárias, Livro Caixa completo com saldo corrente e total do período, Resumo Mensal e responsável técnico — no mesmo padrão A4 dos demais relatórios do sistema. O arquivo oficial de entrega continua sendo o .txt (leiaute 1.3); o PDF é para leitura e conferência." },
    ],
    onde: "Fiscal → LCDPR → aba Exportação",
  },
  {
    versao: "2026.09.16",
    data: "16/09/2026",
    titulo: "Seletor de produto em Adubação de Base e Correção de Solo",
    modulos: ["Lavoura"],
    itens: [
      { tipo: "correcao", texto: "Lançamento de Adubação de Base e de Correção de Solo (tela web, fora do App de Campo): o campo 'Produto/Insumo' mostrava todo o catálogo de insumos (defensivos, sementes, etc.) em vez de só os fertilizantes/corretivos aplicáveis. Adubação de Base agora filtra por Fertilizantes; Correção de Solo por Corretivos de Solo." },
    ],
    onde: "Lavoura → Operações de Campo → Adubação de Base · Correção de Solo",
  },
  {
    versao: "2026.09.15-h",
    data: "15/09/2026",
    titulo: "Custo Total Est. de Funcionários não somava o complemento salarial",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Cadastros → Funcionários: a coluna 'Custo Total Est.' da lista mostrava só salário base + encargos, esquecendo o complemento salarial (por fora). Agora soma os três, igual ao painel 'Custo mensal estimado' dentro do cadastro do funcionário. Os encargos (FGTS, INSS, provisões) continuam incidindo só sobre o salário base — isso já estava certo." },
    ],
    onde: "Cadastros → Funcionários",
  },
  {
    versao: "2026.09.15-g",
    data: "15/09/2026",
    titulo: "Busca por fornecedor não filtrava por nome",
    modulos: ["Compras & Estoque", "Fiscal", "Comercial"],
    itens: [
      { tipo: "correcao", texto: "Campo de busca de Emitente/Fornecedor no lançamento de NF de Produtos (e o mesmo campo em NF-e/Fiscal e no cadastro de Contratos de grãos): digitar um nome não filtrava a lista — só filtrava quando a busca tinha algum número (CNPJ/CPF). Corrigido nas 4 telas." },
    ],
    onde: "Compras & Estoque → NF de Produtos → lançamento · Fiscal → NF-e · Comercial → Contratos",
  },
  {
    versao: "2026.09.15-f",
    data: "15/09/2026",
    titulo: "Funcionários e Folha de Pagamento — correções e novos encargos",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Cadastro de Funcionários (e os seletores de funcionário em Seguros, Contas a Pagar e Abastecimento) mostravam só os funcionários da fazenda ativa no momento — trocar de fazenda no topo da tela fazia funcionários reais 'sumirem' da lista. Agora mostram todos os funcionários da conta, de qualquer fazenda." },
      { tipo: "correcao", texto: "Financeiro → Folha de Pagamento (Produtor Rural): folhas criadas/fechadas 'sumiam' da lista — a tela listava e salvava folhas só pela fazenda ativa no momento, então trocar de fazenda escondia folhas já lançadas (e podia até criar uma folha rascunho duplicada pra mesma competência). Corrigido: a lista e o fechamento/reabertura de folha agora usam a fazenda certa (a da própria folha), independente de qual está ativa no topo da tela." },
      { tipo: "correcao", texto: "Folha de Pagamento do Produtor Rural misturava funcionários de produtores diferentes numa única folha 'Sem empregador' — agora cada produtor rural tem sua própria folha, com o nome do produtor aparecendo na lista (antes só a folha de Empresa/PJ aparecia identificada)." },
      { tipo: "novo", texto: "Fechar uma folha agora também gera a Conta a Pagar do FGTS e, quando o empregador é uma Empresa (PJ), do INSS Patronal — antes só o salário líquido de cada funcionário virava CP. Folha de Produtor Rural (CPF) não gera INSS Patronal, porque o produtor rural recolhe Funrural em vez disso (calculado fora da folha)." },
    ],
    onde: "Cadastros → Funcionários · Financeiro → Folha de Pagamento",
  },
  {
    versao: "2026.09.15-e",
    data: "15/09/2026",
    titulo: "Adubação de Base e Correção de Solo não estavam baixando estoque",
    modulos: ["Compras & Estoque", "Lavoura"],
    itens: [
      { tipo: "correcao", texto: "Adubação de Base e Correção de Solo: a baixa de estoque desses lançamentos não estava sendo registrada no Kardex nem entrando no custo do DRE/Custos Totais desde 08/09 — um erro interno de gravação falhava silenciosamente. O saldo físico do insumo (Estoque → Posição) sempre esteve correto; só o histórico de movimentação e o custo nos relatórios ficaram incompletos. Corrigido e as 72 baixas que faltavam desde 08/09 foram lançadas retroativamente." },
      { tipo: "correcao", texto: "O mesmo tipo de erro também podia acontecer ao excluir um lançamento de Plantio, Pulverização, Adubação de Base ou Correção de Solo (o estorno da baixa de estoque não era gravado) — corrigido." },
    ],
    onde: "Lavoura → Adubação de Base · Lavoura → Correção de Solo · Compras & Estoque → Estoque → Relatórios",
  },
  {
    versao: "2026.09.15-d",
    data: "15/09/2026",
    titulo: "Borderôs mais claros, exclusão de extrato OFX duplicado",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "melhoria", texto: "Contas a Pagar → aba Baixados: borderô com vários títulos agora aparece em uma única linha (sem quebrar em blocos), sem o fundo verde chapado — só o selo 'BDR' — e mostra o nome do fornecedor/cliente dos títulos em vez do texto genérico 'Borderô DD/MM — N títulos', que não dizia do que se tratava." },
      { tipo: "correcao", texto: "Contas a Pagar → aba Baixados: o filtro 'Fornecedor / Cliente' não filtrava os borderôs pagos — agora filtra normalmente, junto com os demais lançamentos." },
      { tipo: "novo", texto: "Conciliação: novo botão de excluir (🗑) em cada extrato OFX importado — útil pra limpar cópias duplicadas de reimportação por engano." },
      { tipo: "melhoria", texto: "Conciliação: importar um OFX da mesma conta e período de um extrato já importado agora é bloqueado de verdade (antes era um aviso que dava pra clicar 'OK' e seguir, criando cópias duplicadas mesmo assim). A tela orienta a excluir o extrato antigo primeiro. Selecionar a conta bancária antes de importar passou a ser obrigatório." },
    ],
    onde: "Financeiro → Contas a Pagar → aba Baixados · Financeiro → Conciliação",
  },
  {
    versao: "2026.09.15-c",
    data: "15/09/2026",
    titulo: "Simulações do Fluxo de Caixa agora são do cliente, não do navegador",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Fluxo de Caixa → Simulador de Cenários: as simulações eram salvas só no navegador de quem lançou — nenhum outro usuário do mesmo cliente enxergava. Agora ficam salvas no banco, vinculadas ao cliente (conta): qualquer usuário autorizado do mesmo cliente vê, edita e desativa as mesmas simulações, de qualquer computador." },
    ],
    onde: "Financeiro → Relatórios Financeiros → Fluxo de Caixa → Simulador de Cenários",
  },
  {
    versao: "2026.09.15-b",
    data: "15/09/2026",
    titulo: "Endividamento — Nova Aba de Condições Contratuais",
    modulos: ["Financeiro"],
    itens: [
      { tipo: "novo", texto: "Relatório de Endividamento ganhou a aba 'Condições Contratuais' — uma linha por contrato com Entidade (credor), Operação, Valor, Tipo de Amortização, Taxa de Juros, Indexador, CET, Valor do Juros e Valor da Parcela. Complementa a aba 'Evolução por Ano' já existente." },
      { tipo: "novo", texto: "CET (Custo Efetivo Total) agora é calculado de verdade — não é a taxa de juros nominal do contrato. O sistema monta o fluxo de caixa real (valor líquido recebido, já descontando IOF/TAC/outros custos, contra cada parcela na data de vencimento) e resolve a taxa que zera esse fluxo (TIR/XIRR). Aparece '—' quando faltam parcelas cadastradas ou o cálculo não converge." },
      { tipo: "melhoria", texto: "Condições Contratuais: contratos sem taxa de juros cadastrada (comum em contratos importados de PDF/planilha) agora mostram uma taxa estimada (com '≈' e em itálico) calculada a partir do próprio cronograma de parcelas — em vez de ficar em branco. É só uma estimativa: vale a pena lançar a taxa real do contrato em Configurações → Contratos Financeiros quando disponível." },
    ],
    onde: "Financeiro → Endividamento → aba Condições Contratuais",
  },
  {
    versao: "2026.09.15",
    data: "15/09/2026",
    titulo: "Saldo por Lote, Sincronização SIEG e Conciliação Agrupada",
    modulos: ["Compras & Estoque", "Fiscal", "Financeiro"],
    itens: [
      { tipo: "correcao", texto: "Saldo por Lote: o seletor de semente mostrava só as sementes cadastradas na fazenda selecionada no topo da tela — ficava vazio em fazendas sem semente própria (ex: um armazém). Agora lista sementes de todas as fazendas da conta, indicando de qual fazenda é cada uma." },
      { tipo: "correcao", texto: "Sincronizar SIEG (NF de Produtos e NF de Serviço): quando o CNPJ monitorado estava configurado numa fazenda diferente da fazenda selecionada no momento, a sincronização recusava com 'Nenhum CPF/CNPJ configurado' mesmo com tudo certo no cadastro. Agora busca o CNPJ em todas as fazendas da conta antes de recusar." },
      { tipo: "correcao", texto: "Sincronizar SIEG — NF de Serviço: alguns CNPJs davam erro na busca por data de emissão ('Certifique-se de apenas passar dia/mês/ano em NFSe') mesmo com tudo certo — a SIEG exige data pura nesse filtro específico, sem horário. Corrigido." },
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
