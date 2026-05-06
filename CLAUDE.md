
# RacTech — Contexto Completo do Projeto

> Este arquivo é o cérebro do projeto. Leia-o inteiro antes de qualquer tarefa.
> Ele contém a análise real do sistema de referência (Agrosoft) e todas as
> decisões de produto tomadas até agora. O dono do projeto não programa —
> o Claude é o único desenvolvedor.

---

## 1. QUEM É O DONO DO PROJETO

Consultor do agronegócio em Nova Mutum — MT (maior polo de soja do Brasil).
Vai oferecer o RacTech como SaaS para seus clientes fazendeiros.
Não tem conhecimento de programação. Toda decisão técnica é responsabilidade do Claude.
Ambiente local: MacOS, VS Code, Docker instalado, Node.js funcionando.
Projeto rodando em `localhost:3000` com Next.js 16.

---

## 2. O SISTEMA DE REFERÊNCIA — AGROSOFT / AGROGESTÃO 4

### 2.1 O que é o Agrosoft

Sistema ERP agrícola desktop brasileiro, desenvolvido em **Delphi (Embarcadero XE2)**,
banco de dados **Firebird 2.5** (arquivo `.FDB`).
Distribuído como instalador Windows com múltiplos executáveis e DLLs.
É um sistema **local** — roda na máquina do cliente, não na nuvem.
Versão analisada: **AgroGestão 4 / versão 5.x** (baseado nos informativos de versão).

O pacote completo foi entregue em um arquivo RAR de **260MB (272.552.665 bytes)**
contendo 5.747 arquivos identificados via leitura do binário do RAR
(sem descompactação — analisado diretamente pelo Claude).

### 2.2 Executáveis identificados — os módulos do sistema

| Executável | Função |
|---|---|
| `AgroGestao4.exe` | ERP central — gestão geral, cadastros, financeiro |
| `AgroLavoura4.exe` | Gestão de lavoura — safras, talhões, operações, colheita |
| `AgroPecuario4.exe` | Gestão pecuária — rebanho, lotes, pesagens, reprodução |
| `AgroSementes4.exe` | Gestão de sementes — UBS, beneficiamento, qualidade |
| `AgroCerealista4.exe` | Trading de grãos — compra, venda, armazenagem, romaneio |
| `AgroGestaoNet.exe` | Versão em rede — acesso multi-estação local |
| `AgroRestServer.exe` | Servidor REST — já tinham API própria! |
| `AgroExpEDINeoGrid.exe` | Exportação EDI — integração com tradings |
| `ServicoEnvioAtualizacoes.exe` | Serviço de atualização automática |

**Conclusão crítica:** o Agrosoft já era modular. Cada executável é um módulo
independente. Nossa missão é unificar tudo em uma única aplicação web.

### 2.3 Arquitetura interna — pacotes BPL (Delphi)

O sistema usa arquitetura em camadas bem definida, revelada pelos nomes dos pacotes:

#### Camada de domínio
```
Agro1.TiposPrimitivos.bpl          tipos base (enums, constantes)
Agro1.Modelo.Agricola.Intf.bpl     interfaces do modelo agrícola
Agro1.Modelo.Geografico.Intf.bpl   interfaces do modelo geográfico
Agro1.Visual.Agricola.Intf.bpl     interfaces visuais agrícolas
Agro1.Visual.Geografico.Intf.bpl   interfaces visuais geográficas
```

#### Camada de regras de negócio
```
Agro1.Regra.Agricola.Impl.bpl      regras agrícolas
Agro1.Regra.Geografico.Impl.bpl    regras geográficas
Agro1.VCL.Agricola.Impl.bpl        UI agrícola
Agro1.VCL.Geografico.Impl.bpl      UI geográfica
```

#### Camada de banco de dados
```
Agro1.BD.Modelo.Agricola.Impl.bpl     acesso a dados agrícolas
Agro1.BD.Modelo.Geografico.Impl.bpl   acesso a dados geográficos
```

#### Pacotes funcionais (os módulos de negócio reais)
```
pkgImplementacoesAgro1.bpl               base agrícola
pkgImplementacoesERP.bpl                 ERP geral
pkgImplementacoesGestao.bpl              gestão
pkgImplementacoesContabil.bpl            contabilidade integrada
pkgImplementacoesPecuario.bpl            pecuária
pkgImplementacoesSementes.bpl            sementes
pkgImplementacoesVinculos.bpl            vínculos entre entidades
pkgImplementacoesNotaFiscal.bpl          nota fiscal
pkgImplementacoesItensEstoque.bpl        itens de estoque
pkgImplementacoesContasPagarReceber.bpl  contas a pagar e receber
pkgImplementacoesDePara.bpl              tabelas de conversão (De/Para)
pkgLegadoAgro1.bpl                       código legado módulo 1
pkgLegadoAgroGestao.bpl                  legado gestão
pkgLegadoAgroLavoura.bpl                 legado lavoura
pkgLegadoAgroPecuario.bpl                legado pecuária
pkgLegadoAgroSementes.bpl                legado sementes
```

**O que isso nos diz:**
- O módulo Geográfico é separado do Agrícola — talhões têm coordenadas GPS reais
- Existe "Vínculos" — entidades se relacionam de forma complexa (ex: talhão + safra + operação)
- Existe "De/Para" — conversão entre códigos, tabelas SEFAZ, tabelas externas
- Existe Contabilidade integrada — lançamentos contábeis automáticos das operações
- O módulo Pecuário é tão robusto quanto o Agrícola

### 2.4 Banco de dados — Firebird

- Engine: **Firebird 2.5.7**
- Arquivo banco demo: `STEN/AG2006PF.FDB`
- Ferramenta de administração: **IBExpert Personal** (inclusa no pacote)
- Acesso via: **FireDAC** (moderno) + **IBX** (legado)
- Drivers alternativos presentes: MySQL, PostgreSQL, MSSQL, Oracle, SQLite
- Porta padrão: 3050 (script de firewall incluso: `script_firewall_firebird.cmd`)

**Nossa decisão:** PostgreSQL via Supabase. A estrutura de tabelas será
construída inferindo da lógica de negócio do Agrosoft.

### 2.5 Módulo Fiscal — escopo completo identificado

Este é o ponto mais forte do Agrosoft. Suporta toda a cadeia fiscal brasileira.

#### Documentos eletrônicos com schemas XSD encontrados
```
NF-e   v3.10 e v4.00    Nota Fiscal Eletrônica
NFC-e  v4.00            Nota Fiscal ao Consumidor
NFSe   60+ provedores   Nota Fiscal de Serviços Eletrônica
CT-e   v2.00 e v3.00    Conhecimento de Transporte Eletrônico
MDF-e  v1.00 e v3.00    Manifesto de Documentos Fiscais
NF3e   v1.00            Nota Fiscal de Energia Elétrica
NFCom  v1.00            Nota Fiscal de Comunicação
BPe    v1.00            Bilhete de Passagem Eletrônico
GTVe   v3.00            Transporte de Valores
GNRE   v1.00 e v2.00    Guia Nacional de Recolhimento
GTIN                    Consulta produto por código de barras
```

#### Obrigações acessórias
```
eSocial  v2.04, v2.05, S-1.0   23 eventos trabalhistas rurais
Reinf    v1.01 até v1.05        retenções e contribuições previdenciárias
```

#### Provedores NFSe identificados (60+ municípios)
Abaco, Actcon, Adm, AEG, Agili, Asten, BHISS, Betha, CIGA, CTA, CTAConsult,
Centi, Citta, Conam, Coplan, DSF, DataSmart, DBSeller, DeISS, Desenvolve,
Digifred, EL, EloTech, Etherium, FGMaiss, FISSLex, Fiorilli, Fisco, Futurize,
GeisWeb, Giap, Ginfes, Giss, GovBR, GovDigital, Horus, IPM, ISSBarueri,
ISSCambe, ISSCuritiba, ISSDigital, ISSFortaleza, ISSGoiania, ISSIntel,
ISSJoinville, ISSLencois, ISSNatal, ISSNet, ISSPortoVelho, ISSRecife, ISSRio,
ISSSalvador, ISSSaoPaulo, ISSSJP, ISSVitoria, ISSe, Infisc, Lexsom, Link3,
MegaSoft, MetropolisWeb, Mitra, NEAInformatica, NFSeBrasil, NotaInteligente,
PadraoNacional, Prodata, Pronim, Publica, RLZ, SH3, Saatri, SafeWeb, SiapNet,
SiapSistemas, Siam, Siat, SigCorp, SigISS, Sigep, SilTecnologia, Simple,
SimplISS, Sintese, SisPMJP, SmarAPD, SoftPlan, SpeedGov, SSInformatica,
Sudoeste, SystemPro, TcheInfo, Tecnos, Thema, Tiplan, Tinus, Tributus,
VersaTecnologia, Virtual, WebFisco, WebISS, eGoverneISS, eReceita, fintelISS,
geNFe, iiBrasil

#### Relatórios fiscais encontrados (FastReport .fr3)
```
DANFe.fr3                                     DANFE padrão retrato
DANFePaisagem.fr3                             DANFE paisagem
DANFSe.fr3                                    DANFSE serviços
DACTE.fr3                                     DACTE transporte
DACTE_OS.fr3                                  DACTE Outros Serviços
DACTE_PAISAGEM.fr3                            DACTE paisagem
DACTE2Vias.fr3                                DACTE em 2 vias
DACTE2em1A4.fr3                               2 vias em 1 folha A4
DAMDFe.fr3                                    DAMDFe manifesto
DAMDFe_Retrato.fr3                            Retrato
DAMDFe_Paisagem.fr3                           Paisagem
EVENTOS.fr3                                   Relatório de eventos
EVENTOS_MDFE.fr3                              Eventos MDF-e
INUTILIZACAO.fr3                              Inutilização NF
INUTILIZACAONFCE.fr3                          Inutilização NFC-e
GNRE_GUIA.fr3                                 Guia GNRE
EventosNFCe.fr3                               Eventos NFC-e
DACTE_EVENTOS.fr3                             Eventos CT-e
DANFeNFCe5_00.fr3                             NFC-e v5
DANFE SIMPLIFICADO - ETIQUETA - NT2020.004    Etiqueta simplificada
```

#### Biblioteca fiscal usada
`AgrosACBr.bpl` — integração com **ACBr** (Automação Comercial Brasil),
biblioteca open source mais usada no Brasil para emissão de documentos fiscais.

**Nossa decisão:** usar biblioteca Node.js equivalente ao ACBr para emissão
de NF-e via SEFAZ.

### 2.6 Integrações identificadas

#### Arquivos .ini de integração
```
Fiorilli.ini      NFSe — prefeituras Fiorilli
Equiplano.ini     NFSe — prefeituras Equiplano
SystemPro.ini     NFSe — prefeituras SystemPro
GovDigital.ini    NFSe — prefeituras GovDigital
Pronimv2.ini      NFSe — prefeituras Pronim v2
Centi.ini         NFSe — prefeituras Centi
Elotech.ini       NFSe — prefeituras Elotech
Balanca.Ini       INTEGRAÇÃO COM BALANÇA FÍSICA de pesagem de caminhões
Cidades.ini       tabela de municípios com códigos IBGE
```

**`Balanca.Ini` é crítico:** revela integração com balanças de pesagem de
caminhões (romaneio de grãos). Essencial para o módulo Cerealista.

#### DLLs de integração
```
inpout32.dll      porta paralela/serial (balanças antigas)
capicom.dll       certificado digital (assinatura NF-e)
fbclient.dll      cliente Firebird
AgExcel.dll       exportação Excel
DllInscE32.dll    consulta inscrição estadual
GDS32.DLL         BDE/Paradox legado
libxml2.dll       processamento XML (NF-e)
libxslt.dll       transformações XSLT (NF-e)
libxmlsec.dll     assinatura XML (NF-e)
libeay32.dll      OpenSSL criptografia
ssleay32.dll      OpenSSL SSL
midas.dll         DataSnap/MIDAS distribuição de dados
```

### 2.7 Arquivos de configuração e dados relevantes

```
CFOPsDevolucao.txt       tabela de CFOPs para devolução fiscal
TabServicos.txt          tabela de serviços para NFSe
printResumoDividas.xls   template Excel de resumo de dívidas
AnaliseSensibilidade.ini SIMULADOR FINANCEIRO — análise de sensibilidade!
Exportacoes.ini          configurações de exportação de dados
Propriedades.ini         configurações de propriedades rurais
DevExpress_PT_BR.ini     tradução PT-BR da biblioteca de UI
agrogestaonet.ini        configurações da versão em rede
IBConfig.ini             configurações do banco Firebird
```

**`AnaliseSensibilidade.ini`** — prova que o Agrosoft tem um simulador
financeiro de análise de sensibilidade de preços e custos. Funcionalidade
valiosa a replicar no RacTech como diferencial.

### 2.8 Logs de acesso reais encontrados

```
AgroGestao4.Acesso.2023.06.02.14.11.27.392.log
AgroGestao4.Acesso.2023.08.11.14.40.49.334.log
AgroGestao4.Acesso.2023.08.11.15.12.39.754.log
AgroGestao4.Acesso.2026.04.09.08.35.33.411.log  ← do dia da análise!
```

O log de **09/04/2026 às 08h35** é do próprio dia que analisamos o sistema.
O Agrosoft estava em uso ativo enquanto o pacote era extraído.
Sistema real, em produção, com usuários reais.

### 2.9 Sistema de atualização automática

```
atualizador/
├── atualizador.bat              script de atualização
├── atualizador.md5              verificação de integridade
├── atualizador.zip              pacote de atualização
├── atualizador-desktop.jar      interface gráfica do atualizador (Java!)
├── java/                        JRE 1.8 embutido (não exige Java instalado)
└── lib/
    ├── gson-2.2.4.jar           JSON
    ├── httpclient-4.3.4.jar     HTTP
    ├── httpmime-4.3.4.jar       upload multipart
    ├── jaybird-full-2.2.5.jar   driver JDBC Firebird
    ├── commons-io-2.4.jar       utilitários IO
    └── zip4j_1.3.2.jar          manipulação ZIP
```

O atualizador é em **Java** com JRE embutido. Mostra maturidade do produto —
preocupação com distribuição e atualização de campo.

### 2.10 Utilitários inclusos

```
Util/
├── IBExpert/                    ferramenta DBA Firebird (admin do banco)
│   ├── IBExpert.exe
│   ├── IBEUDB/                  banco embutido do IBExpert
│   └── Reports/                 relatórios de metadados do banco
├── Firebird-2.5.7.27050_0_x64.exe   instalador Firebird 64-bit
├── ibexpert_personal_15.06.2009.exe  versão antiga IBExpert
└── script_firewall_firebird.cmd      script firewall porta 3050
```

### 2.11 Biblioteca de UI — DevExpress (premium)

```
cxGridRS26.bpl              grid avançado (tipo Excel, editável)
cxTreeListRS26.bpl          tree list hierárquico
cxPivotGridRS26.bpl         PIVOT TABLE — análise multidimensional
cxSchedulerRS26.bpl         agenda e calendário
cxVerticalGridRS26.bpl      grid vertical (formulário)
dxRibbonRS26.bpl            interface ribbon (estilo Office)
dxSpreadSheetRS26.bpl       planilha embutida no sistema
dxSpreadSheetCoreRS26.bpl   core da planilha
dxBarRS26.bpl               barras de ferramentas
dxBarExtItemsRS26.bpl       itens extras de toolbar
dxPSCoreRS26.bpl            preview de impressão
dxPScxGridLnkRS26.bpl       impressão de grids
dxSkinsCoreRS26.bpl         temas visuais
dxGDIPlusRS26.bpl           renderização GDI+
```

**O pivot table (cxPivotGridRS26)** é especialmente relevante — significa
análise multidimensional real: cruzamento de safras × custos × produtividade × tempo.
O RacTech deve ter dashboard analítico equivalente.

### 2.12 Biblioteca de relatórios — FastReport

```
frx26.bpl      FastReport core
frxDB26.bpl    FastReport com banco de dados
frxIBX26.bpl   FastReport com IBX (Firebird direto)
frxTee26.bpl   FastReport com gráficos TeeChart
fqb26.bpl      FastReport Query Builder visual
fs26.bpl       FastScript (scripts em relatórios)
fsDB26.bpl     FastScript com banco
```

FastReport é equivalente ao Crystal Reports. Relatórios complexos com múltiplas
fontes de dados, gráficos integrados, exportação PDF/XLS/Word.

### 2.13 Informativos de versão — maturidade do produto

Encontrados centenas de arquivos HTML de versões:
```
Versao50200.html → Versao502140.html   série 5.02 (140+ updates)
Versao50210.html → Versao502119.html   série 5.021 (119+ updates)
Versao52200.html → Versao522202.html   série 5.22 (202+ updates)
```

Isso confirma produto **muito maduro**, com anos de desenvolvimento e
centenas de melhorias incrementais aplicadas a partir de feedback de campo.
As regras de negócio são profundas, testadas e validadas por usuários reais.

---

## 3. O QUE O AGROSOFT FAZ MAL — NOSSAS OPORTUNIDADES

1. **100% manual** — cada NF-e, cada lançamento, cada relatório exige ação
   explícita. Zero automação proativa.

2. **Desktop/local** — não acessa de lugar nenhum além do PC instalado.
   Sem mobile, sem acesso remoto nativo.

3. **Interface datada** — ribbon Office 2010, grids pesados DevExpress,
   sem responsividade, sem UX moderna.

4. **Sem inteligência de mercado** — não puxa preços CBOT/B3, câmbio,
   clima automaticamente.

5. **Sem alertas proativos** — o usuário precisa ir checar; o sistema
   não avisa sobre nada.

6. **Sem análise preditiva** — tem pivot table, mas sem sugestões
   inteligentes ("seu custo por hectare tende a ser X").

7. **Multi-tenant inexistente** — a versão rede é para LAN local,
   não para múltiplos clientes em nuvem.

8. **Atualização complexa** — atualizador próprio em Java, exige
   instalação em cada máquina.

---

## 4. O RACTECH — NOSSA RESPOSTA

### Nome e identidade
- **Produto:** RacTech
- **Tagline:** "Menos cliques, mais campo"
- **Posicionamento:** o ERP agrícola que trabalha por você

### Filosofia central — NUNCA ABRIR MÃO
> Toda funcionalidade deve ser pensada com a pergunta:
> **"O sistema pode fazer isso automaticamente?"**
> Se sim → automatizar. Se precisar do usuário → 1 clique, nunca mais.

### Comparativo direto vs Agrosoft

| Situação | Agrosoft | RacTech |
|---|---|---|
| Venda de grão | Usuário emite NF-e manualmente | NF-e gerada e transmitida ao confirmar contrato |
| Vencimento de conta | Usuário verifica manualmente | Alerta 7, 3 e 1 dia antes |
| Preço de commodities | Usuário busca fora do sistema | Integrado, atualizado às 7h |
| Extrato bancário | Lançamento manual linha a linha | Importa OFX e concilia automaticamente |
| Nova safra | Usuário lança cada operação | Sistema gera cronograma completo |
| Certificado A1 | Usuário descobre quando vence | Alerta 30, 15, 7 e 1 dia antes |
| Relatório mensal | Gerado manualmente | Enviado por e-mail toda segunda |
| Acesso | Só no PC instalado | Web — qualquer lugar, qualquer device |

---

## 5. STACK TECNOLÓGICA

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript |
| Estilo | CSS inline (sem Tailwind, sem libs de UI) — TopNav horizontal no lugar de Sidebar |
| Banco | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Storage | Supabase Storage (XMLs NF-e, PDFs) |
| E-mail | Resend |
| Deploy | Vercel |
| Fiscal | biblioteca Node.js para NF-e (a definir) |
| Jobs/Cron | Vercel Cron Jobs |

---

## 6. MÓDULOS DO SISTEMA

### Fase 1 — Foco atual

| Módulo | Arquivo | Status |
|---|---|---|
| Dashboard com automações | `app/page.tsx` | ✅ Pronto |
| Propriedades e Talhões | `app/propriedades/page.tsx` | ✅ Pronto |
| AgroLavoura — Safras | `app/lavoura/page.tsx` | ✅ Pronto |
| Fiscal / NF-e | `app/fiscal/page.tsx` | ✅ Pronto |

### Fase 2

| Módulo | Arquivo | Status |
|---|---|---|
| Fluxo de Caixa | `app/financeiro/page.tsx` | ✅ Pronto |
| Contas a Receber | `app/financeiro/receber/page.tsx` | ✅ Pronto |
| Contas a Pagar | `app/financeiro/pagar/page.tsx` | ✅ Pronto |
| Contratos Financeiros | `app/financeiro/contratos/page.tsx` | ✅ Pronto |
| Comercialização de Grãos | `app/contratos/page.tsx` | ✅ Pronto |
| Lavoura — Plantio | `app/lavoura/plantio/page.tsx` | ✅ Pronto |
| Lavoura — Pulverização | `app/lavoura/pulverizacao/page.tsx` | ✅ Pronto |
| Lavoura — Colheita Própria | `app/lavoura/colheita/page.tsx` | ✅ Pronto |
| Estoque | `app/estoque/page.tsx` | ✅ Pronto |
| Análise de Sensibilidade | inclusa em `app/relatorios/page.tsx` | ✅ Pronto |
| Relatórios + Fluxo de Caixa | `app/relatorios/page.tsx` | ✅ Pronto |
| Configurações | `app/configuracoes/page.tsx` | ✅ Pronto |
| Cadastros (11 abas) | `app/cadastros/page.tsx` | ✅ Pronto |
| Pedidos de Compra | `app/compras/page.tsx` | ✅ Pronto |
| Regras de Rateio | `app/configuracoes/rateio/page.tsx` | ✅ Pronto |
| Rel. Aplicações por Ciclo | `app/lavoura/relatorios/aplicacoes/page.tsx` | ✅ Pronto |

---

## 7. GLOSSÁRIO DO AGRONEGÓCIO

```
Fazenda          propriedade rural. Tem CNPJ/CPF, CAR, ITR, NIRF
Gleba            área contígua registrada em cartório
Talhão           subdivisão operacional. Unidade de plantio. Tem ha, GPS, solo
Safra            ciclo produtivo: cultura + talhões + ano agrícola
Cultura          soja, milho 1ª, milho 2ª (safrinha), algodão, sorgo, trigo
Insumo           semente, fertilizante (N/P/K), defensivo, inoculante
Operação         plantio, adubação, pulverização, colheita, transporte
Produtividade    sacas por hectare (sc/ha). MT soja média: 60-65 sc/ha
Saca (sc)        60kg. Padrão para soja, milho, trigo
Arroba (@)       15kg. Padrão para algodão e boi
Romaneio         documento de pesagem de caminhão (entrada/saída de grãos)
Armazém          estocagem. Capacidade em sacas
Classificação    análise do grão: umidade, impureza, avariados, PH
CBOT             Chicago Board of Trade — referência global soja/milho USD
B3               bolsa brasileira — preço local R$
Basis            diferença entre preço local e CBOT
Fixação          contrato com preço travado (R$ ou USD)
Prêmio           valor adicional sobre o preço de referência
CP               Conta a Pagar
CR               Conta a Receber
CFOP             Código Fiscal de Operações (obrigatório NF-e)
CST              Código de Situação Tributária
NCM              Nomenclatura Comum do Mercosul (código de produto)
ICMS Diferido    diferimento do ICMS em operações internas com grãos (MT)
Funrural         contribuição previdenciária do produtor rural
ITR              Imposto Territorial Rural
CAR              Cadastro Ambiental Rural (obrigatório por lei)
NIRF             Número do Imóvel na Receita Federal
Certificado A1   certificado digital para assinar NF-e. Vence anualmente.
XML              arquivo eletrônico da NF-e (guardar por 5 anos)
DANFE            Documento Auxiliar da NF-e (versão impressa/PDF)
SEFAZ            Secretaria de Estado da Fazenda (valida NF-e)
Rejeição         NF-e recusada com código de erro (pode corrigir e reenviar)
Denegação        NF-e negada definitivamente (situação grave)
Inutilização     cancelamento de numeração não utilizada
```

---

## 8. AUTOMAÇÕES DO SISTEMA

1. **NF-e automática** — contrato confirmado → NF-e gerada, assinada,
   transmitida SEFAZ, XML baixado, DANFE gerado, receita lançada
2. **Conciliação bancária** — cron 8h, importa OFX, concilia CP/CR
3. **Cronograma de lavoura** — ao cadastrar safra, gera operações com datas
4. **Alertas vencimento** — cron 7h, notifica 7/3/1 dia antes
5. **Preços de mercado** — cron 7h, atualiza CBOT/B3/câmbio
6. **Relatório semanal** — cron segunda 7h, envia PDF por e-mail
7. **Alerta certificado A1** — avisa 30/15/7/1 dias antes do vencimento
8. **Download XML SEFAZ** — após autorização, baixa e arquiva automaticamente
9. **Alerta climático** — integra API météo, alerta janelas de plantio
10. **Backup automático** — exporta dados críticos diariamente

---

## 9. PALETA DE CORES

A logo do RacTech é inspirada em oliveira — azul, branco e detalhes mostarda.

```
Azul petróleo    #1A4870   cor principal — nav bar, botões, bordas ativas
Azul escuro      #0B2D50   texto sobre fundo azul claro
Azul claro       #D5E8F5   fundo de itens ativos, badges
Mostarda         #C9921B   ação manual do usuário, detalhes, accent
Mostarda claro   #FBF3E0   fundo de badges mostarda
Mostarda avatar  #FDE9BB   background do avatar de usuário
Fundo geral      #F4F6FA   background da página
Branco           #ffffff   cards, header, dropdowns
Borda sutil      #DDE2EE   divisores, bordas
Texto principal  #1a1a1a   títulos, valores de dados em tabelas
Texto secundário #555555   labels de campo, subtítulos
Texto terciário  #666666   metadados, datas sem destaque, hints
Texto fraco      #888888   apenas placeholders e separadores decorativos
Vermelho         #E24B4A   erros, urgência alta
Laranja          #EF9F27   atenção, urgência média
Azul info        #378ADD   informação, urgência baixa
Verde semântico  #16A34A   colheita, produtividade, positivo
```

**Regra de ouro:** azul = o sistema fez. mostarda = o usuário fez.

**Estrutura do cabeçalho (TopNav — 2 faixas):**
- Faixa 1 (52px, branco): logo + tagline à esquerda · fazenda ativa + usuário à direita
- Faixa 2 (40px, azul #1A5CB8): barra de navegação com dropdowns brancos

---

## 10. CONVENÇÕES DE CÓDIGO

```typescript
"use client";
import { useState } from "react";

// Estilos sempre inline — sem Tailwind, sem CSS modules
// Bordas: 0.5px solid
// Border-radius: 8px elementos, 12px cards
// FontWeight: 400 normal, 600 negrito
// FontSize: 13px base, 11px labels, 15-17px headings
// Verde = automático. Roxo = ação do usuário. Sempre.
// Gerar arquivos completos — sem placeholders, sem TODOs
```

---

## 11. ESTRUTURA DE PASTAS

```
arato/
├── app/
│   ├── page.tsx                    ✅ Dashboard
│   ├── layout.tsx                  ✅ Layout raiz
│   ├── globals.css
│   ├── propriedades/page.tsx       ✅ Fazendas e Talhões
│   ├── lavoura/page.tsx            🔲 Próximo
│   └── fiscal/page.tsx             🔲 A fazer
├── components/
│   └── Sidebar.tsx                 ✅ Sidebar reutilizável com roteamento real
├── lib/                            🔲 supabase.ts, fiscal.ts
├── CLAUDE.md                       ✅ Este arquivo
└── package.json
```

---

## 12. HISTÓRICO

### Sessão 1 — 9 de abril de 2026
- Analisado pacote Agrosoft RAR 260MB (5.747 arquivos via leitura binária)
- Identificados 9 executáveis, 30+ BPLs, esquema fiscal completo
- Log de acesso do próprio dia confirmado — sistema em produção ativa
- Definido nome RacTech e filosofia de automação máxima
- Dashboard v1 e v2 criados
- Next.js 16 rodando em localhost:3000 ✅
- app/page.tsx funcionando ✅
- CLAUDE.md criado ✅

### Sessão 2 — 9 de abril de 2026
- `components/Sidebar.tsx` criado — reutilizável, roteamento real via Next.js Link + usePathname
- `app/page.tsx` refatorado para usar o componente Sidebar
- `app/propriedades/page.tsx` criado — fazendas + talhões, modais de cadastro, stats, GPS
- `app/layout.tsx` atualizado — título RacTech, sem Tailwind no body

### Sessão 3 — 9 de abril de 2026
- `app/lavoura/page.tsx` criado — safras, operações, cronograma automático, filtros, modais
- Automação: ao criar safra, `gerarCronograma()` gera 7-8 operações com datas e insumos
- 4 safras reais de MT (Soja ×2 colhidas, Milho 2ª e Algodão em andamento)

### Sessão 4 — 9 de abril de 2026
- `app/fiscal/page.tsx` criado — NF-e completo com tabela, alertas, certificado A1, modal emissão
- `app/[modulo]/page.tsx` criado — catch-all para módulos em construção (financeiro, estoque, etc.)
- Corrigido bug de Fragment key na tabela de NF-e
- Dono autorizou autonomia total para edições — sem pedir permissão

### Sessão 5 — 9 de abril de 2026
- Sistema renomeado de AgroField para **RacTech**
- `app/financeiro/page.tsx` ✅ — CP/CR (14 lançamentos mock), fluxo de caixa 8 semanas, conciliação OFX
- `app/contratos/page.tsx` ✅ — 6 contratos (Bunge/Amaggi/Cargill/ADM/LDC), romaneio com peso bruto/tara/líquido→sacas, NF-e automática, posição de estoque soja+milho

### Sessão 6 — 9 de abril de 2026
- `app/financeiro/page.tsx` melhorado — data livre na simulação, colunas CR/CP separadas, coluna Status, labels "Débito (saída)"/"Crédito (entrada)", botão único de simulação
- `app/relatorios/page.tsx` — aba Fluxo de Caixa com filtros (empresa, conta, moeda, período), separação realizado/projetado, saldo acumulado por lançamento e por dia, exportação PDF retrato
- `lib/supabase.ts` — tipos adicionados: Produtor, MatriculaImovel, Pessoa, AnoSafra, Ciclo, Maquina, BombaCombustivel, Funcionario, GrupoUsuario, Usuario, Empresa, ContaBancaria
- `lib/db.ts` — CRUD completo para todas as novas entidades
- `components/Sidebar.tsx` — dropdown "Cadastros" com 8 sub-itens, navegação por URL ?tab=xxx
- `app/propriedades/page.tsx` — simplificado para leitura (cadastro movido para Cadastros)
- `app/cadastros/page.tsx` ✅ — módulo completo com 8 abas: Produtores, Fazendas, Pessoas, Safras & Ciclos, Máquinas, Combustíveis, Funcionários, Usuários
- Supabase: 12 novas tabelas criadas (produtores, matriculas_imoveis, pessoas, anos_safra, ciclos, maquinas, bombas_combustivel, funcionarios, grupos_usuarios, usuarios, empresas, contas_bancarias, perfis)

### Sessão 7 — 9 de abril de 2026
- Autenticação completa com Supabase Auth — `app/login/page.tsx`, `middleware.ts`, `components/AuthProvider.tsx`
- `fazenda_id` agora dinâmico via perfil do usuário logado (tabela `perfis`)
- Todos os módulos atualizados para usar `useAuth()` em vez de `FAZENDA_ID` hardcoded
- `components/Sidebar.tsx` — mostra fazenda e usuário reais, botão de logout
- `app/layout.tsx` — envolve toda a app com `AuthProvider`
- `lib/supabase.ts` — migrado para `createBrowserClient` (@supabase/ssr) para suporte a cookies
- `app/api/precos/route.ts` ✅ — API interna com cache 15 min: USD/BRL (AwesomeAPI) + CBOT Soja/Milho/Algodão (Yahoo Finance), conversão para R$/sc e R$/@
- Dashboard atualizado com preços reais de mercado ao vivo

### Sessão 8 — 9 de abril de 2026
- `lib/supabase.ts` — novos tipos: `Deposito`, `HistoricoManutencao`, `NfEntrada`, `NfEntradaItem`, `EstoqueTerceiro`
- `lib/db.ts` — CRUD para depositos, historico_manutencao, nf_entradas, nf_entrada_itens, estoque_terceiros + `processarNfEntrada` (custo médio ponderado, movimentação estoque, histórico máquina, estoque terceiro, lança CP)
- `app/cadastros/page.tsx` — aba Depósitos completa (armazéns, silos, tulhas, galpões)
- `app/estoque/page.tsx` ✅ redesenhado — 4 abas:
  - **Posição**: filtros por categoria + busca, badge mínimo, valor total em estoque
  - **NF Entrada**: lista com status, modal 2 passos (XML parser DOMParser ou manual), distribuição por item (estoque/maquinário/terceiro/direto), preview custo médio, alerta preço +10%
  - **Terceiros**: saldo por fornecedor com barra de progresso
  - **Movimentações**: histórico completo com filtro entrada/saída

### Sessão 9 — 10 de abril de 2026
- `app/lavoura/colheita/page.tsx` ✅ — romaneio completo com classificação ao vivo (umidade/impureza/avariados), finalização com entrada automática em estoque
- `app/financeiro/receber/page.tsx` ✅ — Contas a Receber dedicado (separado do financeiro principal)
- `app/financeiro/pagar/page.tsx` ✅ — Contas a Pagar dedicado com parcelamento
- `app/financeiro/page.tsx` — header renomeado para "Fluxo de Caixa"
- `components/Sidebar.tsx` — grupo Financeiro expandido com 4 sub-itens; Cadastros expandido com Tabelas Auxiliares, Insumos e Depósitos
- `lib/supabase.ts` — novos tipos: `GrupoInsumo`, `SubgrupoInsumo`, `TipoPessoa`, `CentroCusto`, `CategoriaLancamento`
- `lib/db.ts` — CRUD completo para os 5 tipos auxiliares; `atualizarInsumo` e `excluirInsumo` adicionados
- `app/cadastros/page.tsx` — 2 novas abas: **Tabelas Auxiliares** (grupos/subgrupos insumo, tipos pessoa, centros de custo hierárquico, categorias financeiras) e **Insumos** (7 categorias, badge mínimo, custo médio, tabela completa)
- `supabase_migrations.sql` ✅ — arquivo com todas as migrations pendentes para executar no Supabase SQL Editor

### Sessão 10 — 11 de abril de 2026
- Todos os modais de `app/cadastros/page.tsx` alargados (720–960px) com grids 3 colunas — sem rolagem vertical nem horizontal
- `app/contratos/page.tsx` ✅ reescrito — Módulo de Comercialização de Grãos fiel ao Agrosoft:
  - Aba **Principal**: Nº Lançamento, Nº Contrato, Safra, Autorização, Tipo, flags Confirmado/À Fixar/Venda a Ordem, Produtor, Cliente, Nr. Contrato Cliente, Contato Broker, Grupo Vendedor, Vendedor, Modalidade Preço, Natureza Operação, CFOP, Saldo Tipo, Frete, Valor Frete
  - Aba **Adicionais**: Propriedade, Empreendimento, Seguradora, Corretora, CT-e, Terceiro, Depósito Carregamento, Depósito Fiscal, Obs., Obs. Interna
  - Grid de itens editável com add/remove e cálculo automático de totais
  - Footer com Valor Financeiro + Valor Total
- `lib/supabase.ts` — tipo `Contrato` expandido com todos os campos + tipo `ContratoItem` adicionado
- `lib/db.ts` — `atualizarContrato`, `listarItensContrato`, `salvarItensContrato` adicionados
- `supabase_migrations.sql` — tabela `contrato_itens` + novos campos em `contratos` adicionados

### Sessão 11 — 11 de abril de 2026
- `app/contratos/page.tsx` — Safra sempre como select; Natureza da Operação com CFOP auto-fill (14 opções incluindo 6501 VFE); Depósito e Ciclo/Empreendimento dos cadastros; Classificação só no romaneio; Romaneio com classificação ABIOVE por commodity
- `app/fiscal/page.tsx` — CFOP auto-fill com textos legais obrigatórios (infCpl), campo Observações visível
- `app/cadastros/page.tsx` — Modal Produtor com CEP → ViaCEP; Modal Fazenda reescrito com 4 abas:
  - **Dados Gerais**: identificação + endereço + CEP → ViaCEP
  - **Matrículas**: gestão inline com comparativo de área (matriculado vs total, status verde/amarelo/vermelho)
  - **Certidões**: CAR, ITR, CCIR com vencimentos e badges de alerta
  - **Arrendamentos**: múltiplos por fazenda, cada um com proprietário (select Pessoas), área, forma de pagamento (sc_soja/sc_milho/sc_soja_milho/brl), valor, datas, e múltiplas matrículas vinculadas
- Business logic: sc* → "Gera contrato de grãos" (compromete volume, DRE); brl → "Impacta fluxo de caixa" (gera financeiro)
- `lib/supabase.ts` — `Fazenda` com endereço + certidões; tipos `Arrendamento` e `ArrendamentoMatricula`
- `lib/db.ts` — CRUD arrendamentos, arrendamento_matriculas, `salvarArrendamentos` (bulk)
- `supabase_migrations.sql` — seção 9: ALTER fazendas + CREATE arrendamentos + CREATE arrendamento_matriculas

### Sessão 12 — 16 de abril de 2026
- Todas as páginas de operações de lavoura refatoradas para usar `ciclo_id` (plantio, pulverização, colheita, correção de solo, adubação de base) — `safras` estava vazio, `ciclos` é a tabela real
- `app/compras/page.tsx` ✅ — Pedidos de Compra completo: rascunho→aprovado→entregue, modal 5 abas (Principal/Desconto/Entrega/Cobrança/Obs), grid de itens+serviços, controle de entrega por item com progress bar, histórico
- `app/configuracoes/rateio/page.tsx` ✅ — Regras de Rateio por Ano Safra: uma regra cobre múltiplos tipos de custo (checkboxes), proporção 50/50 com barra visual em tempo real, cria regra de exceção separada para tipos com proporção diferente
- `components/TopNav.tsx` — item Compras adicionado entre Estoque e Comercial; Regras de Rateio adicionado em Configurações
- `lib/supabase.ts` — tipos `PedidoCompra`, `PedidoCompraItem`, `PedidoCompraEntrega`, `RateioRegra` (com `ano_safra_id` e `tipos: string[]`)
- `lib/db.ts` — CRUD completo para pedidos de compra (com auto-update de status por entrega) e regras de rateio
- `supabase_migrations.sql` — seções 19 (correcoes_solo, adubacoes_base), 20 (ADD ciclo_id nas operações), 21 (pedidos_compra, regras_rateio), 22 (ano_safra_id + tipos array em regras_rateio)
- `proxy.ts` — função renomeada de `middleware` para `proxy` (Next.js 16)
- `next.config.ts` — revertido para config vazia (turbopack.root causava consumo de 87GB de RAM)
- `app/globals.css` — removido `@import "tailwindcss"` (resíduo do template)

### Arquitetura importante — ciclos vs safras
- `safras` está vazio — não usar
- `ciclos` é a tabela real, populada em Cadastros; tem `cultura` + `ano_safra_id`
- Todas as operações (plantio, pulv, colheita, etc.) usam `ciclo_id NOT NULL REFERENCES ciclos`
- Modal de operação: select de Ano Safra filtra o select de Ciclo

### Sessão 13 — 16 de abril de 2026
- `app/configuracoes/rateio/page.tsx` — `ano_safra_id` adicionado como campo obrigatório; filtro de lista por ano safra; ciclos filtrados por ano no modal
- `components/TopNav.tsx` — Lavoura virou painel duplo (`panel: true`) com dois grupos: **Lançamentos** e **Relatórios**
- `app/lavoura/relatorios/aplicacoes/page.tsx` ✅ — Relatório de Aplicações por Safra/Ciclo:
  - Fase 1: filtros (ano safra, ciclos, talhões, tipos de op, período, produto, agrupamento)
  - Fase 2: 4 stat cards + 5 agrupamentos (detalhado / por insumo / por grupo+subgrupo / por talhão / por tipo de op)
  - **PDF**: layout dedicado `@media print` com logo fazenda, cabeçalho estruturado, filtros aplicados, tabela zebrada, rodapé, orientação A4 paisagem
  - **XLSX**: `xlsx` (SheetJS) instalado; exporta 2 abas (Resumo + Aplicações com 15 colunas); nome de arquivo com fazenda + data
  - **WhatsApp**: gera XLSX → upload Supabase Storage → abre `wa.me` com mensagem pré-formatada incluindo link de download; modal com info sobre Z-API, Evolution API e Meta Business API para envio automático

### Padrão de exportação (aplicar em todos os relatórios)
- **PDF**: `@media print` com layout dedicado (logo fazenda, filtros, usuário, data, tabela, rodapé)
- **XLSX**: `import("xlsx")` dinâmico; aba Resumo + aba Dados; `XLSX.writeFile(wb, nome)`
- **WhatsApp**: upload Storage → link + wa.me; modal com opções de API para automação
- Bucket Supabase necessário: `arquivos` (público) — criar em Storage → New Bucket

### Sessão 14 — 17 de abril de 2026
- Bug fix: PIX auto-fill em `app/cadastros/page.tsx` — campo `pix_chave` agora usa `cpf_cnpj` unificado (não `p.cpf`/`p.cnpj` separados)
- `app/compras/nf/page.tsx` — separado completamente de NF de Serviços: removido tipo "consumo", CFOP sempre visível, campos consumo removidos
- `app/compras/nf-servico/page.tsx` ✅ — NFS-e completamente independente: wizard 3 passos (Prestador/Serviço/Tributação), 13 códigos LC 116/2003, cálculo ISS, retenções federais, valor líquido
- `components/TopNav.tsx` — "NF de Produtos" e "NF de Serviços" como itens separados em Compras & Estoque; "Padrões de Classificação" adicionado em Cadastros
- `lib/supabase.ts` — tipo `NfServico` adicionado; tipo `Romaneio` expandido com 14 campos de classificação detalhada + 5 campos de peso recebido; tipo `PadraoClassificacao` adicionado
- `app/contratos/page.tsx` — romaneio expandido: classificação detalhada por commodity (Soja: 7 sub-parâmetros ABIOVE; Milho: 6 sub-parâmetros IN MAPA 60/2011), peso balança vs peso faturado/recebido, divergência automática
- `app/cadastros/page.tsx` — aba **Padrões de Classificação** completa: tabelas configuráveis por commodity, agrupamento por commodity, botão "Carregar Padrões Oficiais" (ABIOVE Soja + IN MAPA 60/2011 Milho), modal com sub-parâmetros condicionais por commodity
- `supabase_migrations.sql` — Seção 30 (nf_servicos) + Seção 31 (padroes_classificacao + ALTER romaneios)

### Arquitetura — NF de Produtos vs NF de Serviços
- NF de Produtos: `app/compras/nf/page.tsx` — tem CFOP, NCM, itens, movimentação estoque, SEFAZ
- NF de Serviços: `app/compras/nf-servico/page.tsx` — tem LC 116, ISS, CNAE, discriminação, Prefeitura
- São documentos completamente diferentes — nunca misturar em um único componente

### Arquitetura — Classificação de Grãos
- `padroes_classificacao` (DB) = tabela auxiliar configurável por fazenda+commodity — carregada em Cadastros
- No romaneio: todos os sub-parâmetros são informados individualmente; `avariados_pct` é calculado automaticamente como soma
- Dois pesos: `peso_classificado_kg` (balança saída fazenda) vs `peso_liquido_destino` (balança comprador) — divergência em kg e %

### Sessão 15 — 17 de abril de 2026
- `app/lavoura/planejamento/page.tsx` ✅ — Planejamento de Safra reescrito com 4 abas:
  - **Orçamento**: por ciclo, itens agrupados por categoria (sementes/fertilizantes/defensivos/correcao_solo/operacoes/arrendamento/outros), totais, custo/ha, receita bruta esperada, margem estimada
  - **Comparativo Planejado×Realizado**: busca custos reais das tabelas de operações; desvio por categoria com barra de progresso
  - **Agenda**: cronograma de operações do ciclo selecionado
  - **Recomendações**: sugestões de produtividade e custo
- `app/contratos/arrendamento/page.tsx` ✅ — Contratos de Arrendamento com 3 abas:
  - **Lista**: cards expansíveis por arrendamento com tabela de pagamentos inline
  - **Pagamentos**: filtro por ano safra + status, baixa individual
  - **Próximos Vencimentos**: calendário 12 meses, urgente se ≤15 dias
  - Suporta sc_soja / sc_milho / sc_soja_milho / brl com colunas condicionais
  - `gerarParcelas()`: gera parcelas anuais automaticamente
  - `baixarPagamento()`: registro rápido via prompts
- `app/relatorios/dre/page.tsx` ✅ — DRE Agrícola completo:
  - Filtros: ano safra + seleção de ciclos por botões toggle + modo consolidado/por cultura
  - 6 KPI cards: Receita Total, Custo Total, Resultado Líquido, Margem, Produtividade, EBITDA
  - Tabela DRE com 5 blocos: Receita Bruta → Deduções → CPV → Desp. Operacionais → Desp. Financeiras
  - Colunas opcionais: % Receita Líquida + R$/ha
  - Análise visual: composição de custos (barras), ponto de equilíbrio (PE em sc/ha com barra), ROI da safra
  - Comparativo lado a lado quando múltiplos ciclos em modo individual
  - Ponto de equilíbrio: `PE = custo_total / preco_medio_sc`, folga acima do PE em sc/ha
  - Impressão: `@media print` A4 landscape
- `components/TopNav.tsx` — novos links: Contratos de Arrendamento (Comercial), Planejamento de Safra (Lavoura/Planejamento), Relatórios virou grupo com DRE Agrícola + Relatórios Gerais + Aplicações por Ciclo
- `supabase_migrations.sql` — Seção 32 (orcamentos + orcamento_itens) + Seção 33 (arrendamento_pagamentos)

### Arquitetura — DRE Agrícola
- Receitas: contratos confirmados/encerrados; fallback sacas × preço do orçamento
- CPV: plantios (sementes), adubações_base (fertilizantes), pulverizações (defensivos), correcoes_solo, + contas_pagar por categoria
- Deduções automáticas: Funrural 1,5% + SENAR 0,2%
- Ponto de equilíbrio calculado como `custo_total / preco_medio_sc`
- ROI = `resultado_liquido / custo_total × 100`
- Todas as métricas disponíveis por ha e por saca

### Sessão 16 — 18 de abril de 2026
- `app/api/cron/alertas-vencimento/route.ts` ✅ — Cron diário 7h BRT: verifica CP/CR/arrendamentos vencendo em ≤7 dias + certificado A1 vencendo em ≤30 dias; agrupa por fazenda; envia e-mail HTML via Resend com tabelas por nível de urgência (crítico/alto/médio)
- `app/api/cron/relatorio-semanal/route.ts` ✅ — Cron toda segunda 7h BRT: CP/CR a vencer na semana, vencidos em atraso, saldo projetado, preços de mercado (via `/api/precos`), contratos ativos e operações de lavoura; e-mail HTML completo via Resend
- `vercel.json` ✅ — Cron jobs configurados: alertas `0 10 * * *` + relatório `0 10 * * 1` (10h UTC = 7h BRT)
- `app/configuracoes/automacoes/page.tsx` ✅ — Painel de Automações: cards por categoria, botão "Executar" para testar manualmente, status em tempo real (running/ok/error), configuração de e-mail, tabela de variáveis de ambiente necessárias
- `resend` instalado (v6.12.0) — `npm install resend`
- `components/TopNav.tsx` — link Automações atualizado para `/configuracoes/automacoes`

### Arquitetura — Automações (Cron Jobs)
- Segurança: header `Authorization: Bearer <CRON_SECRET>` — Vercel injeta automaticamente; sem secret em local → permite
- Service Role Key: crons usam `SUPABASE_SERVICE_ROLE_KEY` (não anon key) para ignorar RLS e ler todas as fazendas
- Destinatários: lidos da tabela `perfis` (campo `email`) — um e-mail por fazenda com todos os usuários em cópia
- Horário: UTC+0 10h = BRT 7h — `0 10 * * *` (diário) e `0 10 * * 1` (segunda)
- Variáveis obrigatórias: `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_SERVICE_ROLE_KEY`
- Variáveis opcionais: `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`
- Painel em `/configuracoes/automacoes` para disparar manualmente e verificar status

### Próximos passos
- **Executar Seções 32 e 33** no Supabase SQL Editor (orcamentos + arrendamento_pagamentos)
- **Configurar variáveis de ambiente na Vercel**: `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- **Verificar domínio no Resend** para o remetente configurado (RESEND_FROM)
- Cadastrar usuários reais para clientes fazendeiros

### Sessão 17 — 18 de abril de 2026
- `components/TopNav.tsx` — "Expedição de Grãos" adicionado em Comercial; "Parâmetros do Sistema" adicionado em Configurações (remove "Nota Fiscal (NF-e)" individual); `grupoAtivo` comercial inclui `/expedicao`
- `app/configuracoes/modulos/page.tsx` ✅ — Central de Parâmetros do Sistema:
  - **Aba Fiscal**: 20 campos (ambiente, série, CNPJ emitente, IE, IM, UF, IBGE, CRT, CFOPs venda/remessa, CSTs, NCMs por commodity, caminho certificado A1)
  - **Aba MDF-e**: 7 campos (ambiente, série, RNTRC emitente, tipo emitente, UFs padrão)
  - **Aba Transportes**: CRUD completo de Transportadoras, Veículos (tipos de caminhão), Motoristas (com alerta vencimento CNH)
  - **Aba Integrações**: Resend API Key/From, WhatsApp URL/Token/Instância
  - **Aba Expedição**: peso aproximado padrão %, tolerância divergência, geração automática NF Remessa, bucket Supabase
  - Armazenamento: tabela `configuracoes_modulo` — chave `(fazenda_id, modulo)`, valor JSONB
- `app/expedicao/page.tsx` ✅ — Módulo de Expedição de Grãos:
  - **KPI cards**: Em Trânsito, Entregues, Correção de Peso, Total Embarcado (sc)
  - **Lista de cargas**: filtros por status/rota/busca, ações inline por card
  - **Rota visual**: 3 opções com ícones — Transbordo s/NF, Transbordo c/Remessa 5905, Direto Comprador 6101
  - **Pipeline de status**: rascunho → em_transito → entregue → corrigindo_peso → encerrada (visual com bolinhas)
  - **NF-e**: botão "Gerar NF-e" por rota (CFOP 5905 ou 6101), resultado inline
  - **MDF-e**: modal com UF início/fim, percurso, CIOT — emissão autoriza e muda status para em_transito
  - **Correção de Peso**: modal com peso destino, cálculo automático de divergência, alerta se >1% (NF Complementar)
  - **Modal Detalhe**: pipeline visual completo, documentos fiscais lado a lado
  - **Aba MDF-e emitidos**: lista de todos os manifestos emitidos
- `supabase_migrations.sql` — Migration 39: adiciona `mdfe_numero`, `mdfe_chave`, `mdfe_status`, `contrato_numero`, `destino_razao_social`, `peso_bruto_origem_kg`, `tara_origem_kg`, `peso_liquido_destino_kg`, `peso_aproximado_kg` em `cargas_expedicao`

### Arquitetura — Parâmetros do Sistema
- Todos os parâmetros externos (fiscal, MDF-e, integrações) ficam em `configuracoes_modulo` — JSONB por `(fazenda_id, modulo)`
- Nova implantação: entra no Supabase, abre Parâmetros do Sistema, preenche 1 vez, pronto
- Sem variáveis de ambiente hardcoded para dados de clientes
- Transportadoras/Veículos/Motoristas cadastrados aqui são selecionáveis na Expedição

### Arquitetura — Expedição de Grãos
- Três rotas são mutuamente exclusivas por carga: `transbordo_sem_nf` (sem doc fiscal), `transbordo_com_remessa` (CFOP 5905, NF Remessa), `direto_comprador` (CFOP 6101, NF Venda)
- Peso aproximado: campo `peso_aproximado_kg` preenchido → carga sinalizada → obrigatório informar peso destino antes de encerrar
- Divergência > 1%: observação marcada `[NF COMPLEMENTAR NECESSÁRIA]` para providenciar ajuste fiscal
- MDF-e simula autorização por ora — integração real com SEFAZ via biblioteca ACBr/Node é próximo passo
- Pipeline de status avança com botão "Avançar →" na tabela ou no modal detalhe

### Sessão 18 — 22 de abril de 2026
- `app/financeiro/tesouraria/page.tsx` ✅ — Mútuo entre Empresas + Taxas Bancárias
- `app/financeiro/seguros/page.tsx` ✅ — Apólices, Prêmios, Sinistros
- `app/financeiro/consorcios/page.tsx` ✅ — Consórcios com contemplação e migração para financiamento
- `app/compras/nf/page.tsx` — botão "Reclassificar" para NFs processadas (altera operação gerencial sem tocar lançamentos)
- `app/transporte/cte/page.tsx` ✅ — CT-e para frota própria (motoristas CLT, sem CIOT)
- `app/transporte/mdfe/page.tsx` ✅ — MDF-e com seleção de CT-e autorizados e NF-e avulsas
- `components/TopNav.tsx` — grupo Transporte adicionado; Tesouraria/Seguros/Consórcios no Financeiro
- `supabase_migrations.sql` — Migrations 51–56 (mutuos, taxas_bancarias, apolices_seguro, consorcios, ctes, mdfes)
- `lib/supabase.ts` — `vinculo_atividade` + `entidade_contabil` em `Lancamento` e `NfEntrada`; novo tipo `ConfigContabilidade`
- `app/configuracoes/contabilidade/page.tsx` ✅ — Parâmetros contábeis por entidade (PF/PJ): método G/R/B, dados do livro, responsável técnico, termos de abertura/encerramento
- `app/fiscal/sped-contabil/page.tsx` ✅ — Gerador SPED ECD Leiaute 10:
  - Lê `lancamentos` filtrados por `entidade_contabil` + `vinculo_atividade` + exercício
  - Deriva lançamentos contábeis via `lancamentos.operacao_id → operacoes_gerenciais.conta_debito/conta_credito`
  - Gera arquivo pipe-delimited `.txt` compatível com Domínio e PGE Receita Federal
  - Preview antes de baixar: quantos lançamentos incluídos + quais ignoraram (sem conta configurada)
- `app/compras/nf/page.tsx` — seletor "Vínculo de Atividade" (rural/PF/investimento/não tributável) + "Entidade Contábil" (PF/PJ) no cabeçalho do wizard
- `supabase_migrations.sql` — Migrations 57–58 (vinculo_atividade+entidade_contabil em lancamentos+nf_entradas; config_contabilidade)

### Arquitetura — LCDPR + SPED ECD
- `vinculo_atividade`: campo em `lancamentos` e `nf_entradas` — classifica se o lançamento é rural, PF, investimento ou não tributável
- `entidade_contabil`: `'pf'` (produtor, CPF) ou `'pj'` (empresa, CNPJ) — permite PF e PJ coexistir na mesma fazenda
- `config_contabilidade`: uma linha por entidade; armazena dados do livro, método, responsável técnico e termos
- Cadeia contábil: `lancamentos.operacao_id` → `operacoes_gerenciais.conta_debito/conta_credito` → SPED ECD
- Método de escrituração (G/R/B) é parâmetrizável — decisão do contador, não do sistema
- LCDPR filtra lançamentos com `vinculo_atividade = 'rural'`
- SPED ECD gera blocos 0, I e 9 (leiaute 10); transmissão via PGE da Receita Federal

### Sessão 19 — 28 de abril de 2026

**Refatoração de segurança (continuação) + Arquitetura Conta**

#### Fase 1 — Correção de segurança multi-tenant (sessão anterior)
- Bug crítico resolvido: fazendas de clientes diferentes apareciam umas para as outras
- Adicionado `owner_user_id` na tabela `fazendas` + RLS v4 com bypass raccotlo
- Removido fallback perigoso no `AuthProvider` que atribuía a primeira fazenda do banco a novos usuários
- `api/admin/novo-cliente` corrigido: `owner_user_id` agora é setado após criação do usuário (antes ficava NULL)

#### Fase 2 — Arquitetura Conta (multi-fazenda por produtor)
- **Problema motivador:** produtores reais têm múltiplas fazendas — o modelo `perfis.fazenda_id` como tenant não suportava isso
- **Solução:** nova entidade `contas` como raiz do tenant SaaS

**Tabelas alteradas:**
- `contas` (nova): `{ id, nome, tipo (pf/pj/grupo), created_at }`
- `fazendas.conta_id` FK → contas
- `produtores.conta_id` FK → contas
- `perfis.conta_id` FK → contas + `perfis.fazenda_id` agora é a "fazenda ativa" (farm switcher)

**RLS atualizado:**
- `fazendas`: `conta_id IN (SELECT conta_id FROM perfis WHERE user_id = auth.uid())` + raccotlo bypass
- `produtores`: mesmo padrão + `OR conta_id IS NULL` (dados legados)

**Código alterado:**
- `lib/supabase.ts` — tipo `Conta` adicionado; `Fazenda.conta_id` e `Produtor.conta_id` adicionados
- `lib/db.ts` — `listarFazendas()` busca por `conta_id` (via perfil do usuário); nova função `listarProdutoresDaConta(conta_id)`; `criarContaTenant()` e `listarContasTenant()`
- `components/AuthProvider.tsx` — expõe `contaId`; nova função `setFazendaAtiva(id, nome)` que atualiza `perfis.fazenda_id` no banco + localStorage
- `components/TopNav.tsx` — farm switcher: dropdown aparece quando conta tem >1 fazenda; clique chama `setFazendaAtiva()`
- `app/cadastros/page.tsx` — usa `listarProdutoresDaConta(contaId)` na aba Produtores; usa `conta_id` para listar fazendas no modo raccotlo; `salvarFaz` define `conta_id` nas novas fazendas; bootstrap cria conta automaticamente para novo usuário
- `app/api/admin/novo-cliente/route.ts` — passo 0: cria conta antes da fazenda; produtor e perfil recebem `conta_id`

**Backfill automático (Migration v5):**
- Para cada `owner_user_id` distinto em `fazendas`, cria uma `conta` usando o nome do `perfil` do usuário
- Vincula todas as fazendas, produtores e perfis desse usuário à conta criada

### Arquitetura — Conta (tenant raiz)
- `contas` é a raiz do SaaS: um produtor com 3 fazendas tem 1 conta + 3 fazendas
- `perfis.conta_id` = tenant do usuário. `perfis.fazenda_id` = fazenda ativa no momento
- Farm switcher: `TopNav` busca todas as fazendas da `conta_id` atual; >1 fazenda exibe dropdown
- Troca de fazenda: `setFazendaAtiva()` atualiza `perfis.fazenda_id` no banco e em memória
- Raccotlo admin: `conta_id = NULL` no perfil deles; bypass via `role = 'raccotlo'`
- Novos clientes via `novo-cliente`: conta criada automaticamente no onboarding

### Próximos passos
- **Configurar variáveis de ambiente na Vercel**: `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- Integração real com SEFAZ para NF-e e MDF-e
- Cadastrar usuários reais para clientes fazendeiros

---

## 13. INSTRUÇÃO FINAL

Você é o único desenvolvedor. O dono não programa.
Toda decisão técnica é sua responsabilidade.

Ao receber qualquer tarefa:
1. Releia as seções relevantes deste arquivo
2. Pergunte sempre: "posso automatizar isso?"
3. Mantenha paleta de cores e convenções
4. Gere arquivos completos — sem placeholders, sem TODOs
5. Atualize este CLAUDE.md quando módulos forem concluídos
6. Se algo conflitar com o que está aqui, questione antes de mudar
