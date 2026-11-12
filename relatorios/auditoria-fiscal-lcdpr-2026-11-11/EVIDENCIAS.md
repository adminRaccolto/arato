# Evidências e reprodução

11/11/2026. Consulte o [relatório](RELATORIO.md) para impacto, limites e conferência histórica. Esta matriz separa testes isolados, leitura da base e rastreamento estático.

**Referência histórica da versão auditada.** As correções posteriores à aprovação e os testes atuais estão em [CORRECOES.md](CORRECOES.md). A reprodução abaixo não deve ser usada como aceite da versão corrigida.

## Como executar

Na raiz do projeto:

```sh
node --import ./scripts/test-loader.mjs --test relatorios/auditoria-fiscal-lcdpr-2026-11-11/ferramentas/reproducoes.test.mjs
npm test
npx tsc --noEmit --incremental false
```

**A suíte de reprodução afirma o comportamento defeituoso observado.** Não é uma suíte de aceite das futuras correções e não está incluída automaticamente em `npm test`. Ao corrigir cada comportamento, criar/inverter os asserts para a invariante desejada nos testes regulares. O teste da auditoria então deverá deixar de reproduzir o defeito ou ser arquivado como evidência da versão auditada.

As funções reais são extraídas usando `scripts/teste-funcoes.mjs` ou importadas diretamente, como `buildNFe`. As dependências de banco, autenticação, certificado, armazenamento e rede são substituídas por dados sintéticos. As rotas não são chamadas por HTTP real nesses testes. Os testes demonstram o controle da aplicação; não executam constraints, triggers e RLS de um PostgreSQL real nem validam assinatura digital/XML por XSD.

Severidade: **P0** = titularidade/isolamento ou identificação fiscal incorreta; **P1** = integridade fiscal/financeira, perda de informação, falso sucesso ou recuperação; **P2** = inconsistência de contrato/interface e manutenção, sem impacto ativo demonstrado. Severidade não é contagem de incidentes em produção.

## Cenários reproduzidos: LCDPR

| ID | Prioridade | Função/local | Resultado observado |
|---|---|---|---|
| LC-01 | P0 | `app/lcdpr/page.tsx:513`, `entradasExport` | Selecionar CPF A mantém os movimentos de A e B: R$ 100 + R$ 900. |
| LC-02 | P0 | `app/lcdpr/page.tsx:727`, `gerarLCDPR` | Imóvel de B que não está no cadastro exportado vira `001`, o imóvel de A. |
| LC-03 | P1 | `app/lcdpr/page.tsx:513` | Fator 50% alcança os movimentos dos dois produtores. |
| LC-04 | P1 | `app/lcdpr/page.tsx:356`, filtro | Venda real sintética é excluída por mencionar nome de empresa da conta. |
| LC-05 | P1 | Mesmo filtro | Compensação e previsão paga entram sem tratamento da origem/natureza. Incidência correta depende do evento; não excluir tudo automaticamente. |
| LC-06 | P1 | `app/lcdpr/page.tsx:364` | Sem `data_baixa`, vencimento escolhe o exercício. |
| LC-07 | P1 | `app/lcdpr/page.tsx:695`, geração de imóveis | Exploração coletiva pode ser exportada sem `0045`. A tela avisa, mas não bloqueia. |
| LC-08 | P1 | `app/lcdpr/page.tsx:723` | Saldo inicial de R$ 500 + receita de R$ 100 gera Q100 com saldo R$ 600. |
| LC-09 | P1 | `app/lcdpr/page.tsx:732` | `|` no documento aumenta campos; quebra de linha no histórico permanece. |
| LC-10 | P1 | `app/lcdpr/page.tsx:552`, `adicionarManual` | Inclusão apenas em estado React; não há escrita de persistência na função. |
| LC-11 | P1 | `app/lcdpr/page.tsx:714` | `0050.NUM_CONTA` recebe `123456-7`, com hífen em campo numérico. |

## Cenários reproduzidos: parâmetros e cálculo

| ID | Prioridade | Função/local | Resultado observado |
|---|---|---|---|
| CFG-01 | P1 | `app/configuracoes/modulos/page.tsx:879`, `salvarNcm` | Banco recusa; modal fecha; registro não foi salvo. |
| CFG-02 | P1 | Mesmo salvamento | Edição do NCM da fazenda original grava `fazenda_id` da ativa. |
| CFG-03 | P1 | `app/configuracoes/modulos/page.tsx:628`, efeito de carga | `prev` prevalece sobre resultado novo; mantém ambiente/módulo de contexto anterior. |
| CFG-04 | P1 | `app/lcdpr/page.tsx:445`, `salvarConfig` | Quota exibida muda apesar de erro de gravação. |
| TRI-01 | P1 | `lib/nfe/builder.ts:276`, `icmsRule` | Item interestadual com alíquota informada 7 emite 12.00. |
| TRI-02 | P1 | `lib/nfe/builder.ts:511` | PIS e COFINS fixos em CST 07. |
| TRI-03 | P1 | `lib/nfe/builder.ts:484` | CRT 1 com CNPJ emite ICMS00 sem CSOSN. |
| TRI-04 | P1 | `lib/nfe/builder.ts:403`, `buildNFe` | Quantidade negativa chega ao XML com `vProd` negativo. |
| TRI-05 | P1 | `lib/nfe/builder.ts:499` | Soma de ICMS dos itens R$ 0,03; total XML R$ 0,02. |
| TRI-06 | P1 | `lib/nfe/builder.ts:527` | IBS UF: soma dos itens zero; total R$ 0,01. |
| TRI-07 | P1 | `lib/nfe/index.ts:592`, emissão | Erro de consulta NCM escolhe fallback CST 410 e segue até autorização simulada. |

## Cenários reproduzidos: OG e contabilidade

| ID | Prioridade | Função/local | Resultado observado |
|---|---|---|---|
| OG-01 | P1 | `lib/db.ts:6451`, `atualizarOperacaoGerencial` | Zero linhas afetadas não gera erro. |
| OG-02 | P1 | `app/configuracoes/operacoes-gerenciais/page.tsx:266` e helper acima | `undefined` desaparece no payload; limpar conta contábil conserva o valor anterior. |
| OG-03 | P1 | `lib/db.ts:6216`, `listarOperacoesGerenciais` | Cópia da conta substitui ID legado nas opções; equivalência existe como metadado e exige tratamento do consumidor. |
| OG-04 | P1 | `app/api/fiscal/reclassificar-nf/route.ts:49` | Falha no update de CP deixa NF alterada e CP antigo, mesmo com HTTP 500. |
| OG-05 | P1 | `lib/db.ts:6271`, `listarOperacoesGerenciaisAtivas` | Cópia da conta inativa é filtrada antes da escolha; global ativo reaparece. Helper mais novo tem outro comportamento. |
| ECD-01 | P1 | `app/fiscal/sped-contabil/page.tsx:50`, `gerarSpedEcd` | Arquivo declara 10, usa I150/I155 para movimentos, não I200/I250, e formata monetário com ponto. |

## Cenários reproduzidos: SEFAZ e identidade

| ID | Prioridade | Função/local | Resultado observado |
|---|---|---|---|
| SEF-01 | P1 | `lib/nfe/index.ts:196`, `proximoNumero` | Duas chamadas simultâneas com mesma leitura recebem 10. |
| SEF-02 | P1 | `lib/cte/index.ts:38`, `proximoNumero` | Update recusado do contador ainda retorna 10. |
| SEF-03 | P1 | `lib/mdfe/index.ts:43`, `numeroParaTentativa` | Dois rascunhos usam mesmo contador antes da autorização. |
| SEF-04 | P1 | `lib/cte/index.ts:460`, emissão | Autorização externa simulada + banco recusando: retorno sucesso e CT-e local rascunho. |
| SEF-05 | P0 | `app/api/fiscal/emitir-nfe/route.ts`, `POST` | Erro de resolução de titular explícito conserva módulo/emitente anterior. |
| SEF-06 | P1 | `lib/nfe/transmitter.ts:383`, `transmitirNFe` | 103 seguido de 105 encerra após uma consulta e sem recibo no resultado final. |
| SEF-07 | P1 | `lib/sefaz-consulta.ts:87`, `soapRequest` | Captura dos parâmetros reais: TLS sem validação e nenhum timeout/signal. |
| SEF-08 | P1 | `lib/sefaz-consulta.ts:186`, `consultarNfePorChave` | Dois certificados disponíveis; falha de rede/autenticação com o primeiro não tenta o segundo. |
| SEF-09 | P1 | `app/api/cte/distribuicao/route.ts:130` | Documento não salvo, `ok=true`, total 1 e cursor NSU avançado. |
| SEF-10 | P1 | `lib/cte/distribuicao.ts:104`, `parseResponse` | ZIP ilegível descartado sem erro estruturado; resposta conserva NSU posterior. Com outros docs legíveis, pode ser ultrapassado pela rota. |
| SEG-01 | P0 | `app/api/fiscal/emitir-cte/route.ts` + `lib/cte/index.ts:460` | Acesso sintético à fazenda A permite atualizar CT-e por ID da fazenda B. Autorizador inteiramente simulado. |
| SEG-02 | P0 | `app/api/fiscal/emitir-mdfe/route.ts` | Handler valida documento A, mas aceita fazenda B como contexto. Não executou emissão externa completa. |
| SEG-03 | P0 | `app/api/fiscal/reclassificar-nf/route.ts` | NF autorizada de A aceita OG sintética de B sem validação de referência. |

Os 41 testes estão em [reproducoes.test.mjs](ferramentas/reproducoes.test.mjs). As saídas estruturadas ficam em [reproducoes.json](dados/reproducoes.json).

## Rastreamento adicional de código

| ID | Prioridade/estado | Evidência e alcance |
|---|---|---|
| EST-01 | P2, helper sem chamadores localizados | `lib/operacoes-fiscais.ts:34`: `.order('grupo')`; coluna inexistente, GET 42703. A tela ativa usa nome. Não atribuir indisponibilidade atual da tela a esse helper. |
| EST-02 | P1 | `app/configuracoes/modulos/page.tsx:768` e `lib/nfe/index.ts:206`: configuração completa e contador no mesmo JSON, sem controle de versão do salvamento. Há risco de regressão por tela antiga. |
| EST-03 | P1 | `app/fiscal/sped-contabil/page.tsx:301`: OG por fazenda, sem conta/global; consulta financeira por data de lançamento e apenas `neq(em_aberto)`. |
| EST-04 | P1 | `app/api/fiscal/eventos/route.ts:15`: reversão de devolução com várias escritas sem checagem de erro; cancelamento externo e efeitos locais sem recuperação durável uniforme. |
| EST-05 | P1 | `app/api/fiscal/status-sefaz/route.ts:21`: diagnóstico limitado a CT-e/MT; `lib/sefaz-consulta.ts:24`: ambiente de homologação não MT aponta a URL de produção SVRS. |
| EST-06 | P1 | `app/lcdpr/page.tsx:249`: cargas auxiliares não asseguram paginação e erros; bancos somente ativos; a importação também é local ao estado. |
| EST-07 | P1 | `lib/nfe/builder.ts:406`: data de geração usada no XML, sem transporte da data editada no contrato auditado; `lib/nfe/index.ts:566`: Funrural acrescenta texto, não prova retenção executada. |
| EST-08 | P1 | Listas locais em `app/fiscal/page.tsx:28`, `app/comercial/faturamento/page.tsx:32`, `app/contratos/page.tsx:48`; `buscarCstPorCfop` sem chamadores; parâmetros e emissão não têm uma única regra consumida. |
| EST-09 | Necessita homologação por cenário | Regras IBS/CBS e defaults por ano/CRT diferentes entre NF-e e CT-e. Conferir versão vigente da NT, XSD e enquadramento, sem aplicar alíquota universal. |

As contagens automáticas de consultas sem limite, retornos de escrita não checados e sinais de autenticação são triagem. Não representam, individualmente, falhas confirmadas ou garantia de segurança. `lib/db.ts` contém helpers usados também fora do escopo fiscal.

## Base consultada: observações sanitizadas

| Conferência | Quantidade | Interpretação |
|---|---:|---|
| Lançamentos lidos | 20.023 | Conjunto da coleta, não apenas LCDPR. |
| Elegíveis pelo filtro LCDPR de 2026 | 5.282 | Reprodução do filtro atual, não validação fiscal de elegibilidade. |
| Contas com mais de um titular elegível | 5 | Podem alcançar o defeito de mistura por CPF. |
| Elegíveis sem data de baixa | 146 | Usam outra data no filtro. |
| Sem titular resolvido | 14 | Necessitam saneamento orientado por origem. |
| Compensações elegíveis | 6 | Revisar evento e eventual duplicidade, não excluir por forma de pagamento apenas. |
| Exclusões exclusivamente por nomes internos | 20 | Não foi demonstrado que todos/algum desses 20 representem venda rural. |
| Banco não resolvido nos elegíveis | 759 | `999` pode ser legítimo; classificar origem antes de corrigir. |
| Imóveis sem CAEPF e sem campos locais CAFIR/ITR/NIRF | 25 | Conferir aplicabilidade cadastral e fontes de cadastro de cada imóvel. |
| Configurações duplicadas por conta/módulo | 9 grupos | Dois grupos com diferenças nos campos operacionais comparados. |
| NCM divergentes por conta/código | 2 grupos | Regras atuais, sem evidência de aplicação histórica. |
| OG referenciadas sem débito/crédito completo | 413 de 547 | Lacuna para exportação contábil, não erro obrigatório de toda OG gerencial. |
| Movimentos selecionáveis pelo ECD em 2026 | 60 | Todos usam OG fora da busca por fazenda; 54 sem par contábil completo. |
| NF-e locais autorizadas sem URL | 39 de 142 | Não comprova ausência do arquivo no Storage. |
| NF-e locais autorizadas sem protocolo no campo lido | 37 de 142 | Não comprova ausência de autorização. |
| NF-e locais autorizadas sem chave | 5 de 142 | Não reemitir automaticamente; recuperar evidência fiscal. |
| Versões canônicas de A1 | 0 | Cadastros legados continuam possíveis; não equivale a zero certificados válidos. |

As regras exatas da coleta agregada constam em `backup/.../analisar.mjs` e os resultados públicos em [conferencia-resumo.json](dados/conferencia-resumo.json). A coleta não foi uma transação com snapshot único: alterações concorrentes na operação podem modificar contagens posteriores.

## Fontes e rastreabilidade

O [manifesto de fontes oficiais](dados/fontes-oficiais.json) registra os documentos consultados e hashes dos arquivos normativos baixados. O [manifesto de validação](dados/validacao.json) registra os comandos, contagens e limites. Os [hashes dos fontes auditados](dados/fontes-codigo.json) permitem conferir a versão dos arquivos analisados.

Foram preservadas as diferenças entre: regra fiscal documentada; comportamento de código reproduzido; dado atual de produção; risco potencial; e efeito histórico ainda não comprovado. A existência de uma falha não autoriza corrigir valores/status históricos sem a evidência da operação de origem.
