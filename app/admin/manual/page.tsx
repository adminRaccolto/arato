"use client";
import { Suspense } from "react";
import TopNav from "../../../components/TopNav";

// ─── Componentes internos ────────────────────────────────────

function Secao({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="section" style={{ marginBottom: 44 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: "#1A4870", borderBottom: "2px solid #1A4870", paddingBottom: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ background: "#1A4870", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{n}</span>
        {titulo}
      </h2>
      {children}
    </div>
  );
}

function SubSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50", borderBottom: "0.5px solid #D5E8F5", paddingBottom: 6, marginBottom: 14 }}>{titulo}</h3>
      {children}
    </div>
  );
}

function Passo({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18, paddingLeft: 18, borderLeft: "3px solid #1A4870" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A4870", marginBottom: 6 }}>
        Passo {n} — {titulo}
      </div>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{ background: "#0B2D50", color: "#E2F0FF", padding: "14px 18px", borderRadius: 8, fontSize: 12, overflowX: "auto", margin: "10px 0", lineHeight: 1.7, fontFamily: "'Courier New', monospace" }}>
      {children}
    </pre>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 8, padding: "11px 15px", marginBottom: 12, fontSize: 12.5, color: "#1e40af", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FEF9EC", border: "0.5px solid #FCD34D", borderRadius: 8, padding: "11px 15px", marginBottom: 12, fontSize: 12.5, color: "#92400e", lineHeight: 1.6 }}>
      ⚠️ {children}
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "11px 15px", marginBottom: 12, fontSize: 12.5, color: "#991B1B", lineHeight: 1.6 }}>
      🚫 {children}
    </div>
  );
}

function Sucesso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "11px 15px", marginBottom: 12, fontSize: 12.5, color: "#166534", lineHeight: 1.6 }}>
      ✅ {children}
    </div>
  );
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 16 }}>
      <thead>
        <tr style={{ background: "#F4F6FA" }}>
          {colunas.map(c => (
            <th key={c} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#1A4870", border: "0.5px solid #DDE2EE" }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
            {linha.map((cel, j) => (
              <td key={j} style={{ padding: "8px 12px", border: "0.5px solid #DDE2EE", verticalAlign: "top" }}>{cel}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Página ──────────────────────────────────────────────────

function ManualContent() {
  return (
    <>
      <TopNav />

      <div className="no-print" style={{ background: "#F4F6FA", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "0.5px solid #DDE2EE" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Manual do Proprietário — Arato SaaS</span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 12 }}>Versão 2.0 · Abril 2026 · Uso interno Raccolto</span>
        </div>
        <button
          onClick={() => window.print()}
          style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          ⬇ Salvar como PDF
        </button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .manual-wrap { padding: 24px 40px !important; }
          h2, h3 { page-break-after: avoid; }
          .section { page-break-inside: avoid; }
          pre { white-space: pre-wrap; }
          @page { size: A4; margin: 18mm 16mm; }
        }
      `}</style>

      <main className="manual-wrap" style={{ maxWidth: 900, margin: "0 auto", padding: "36px 32px", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#1a1a1a", lineHeight: 1.7 }}>

        {/* ── Capa ── */}
        <div style={{ textAlign: "center", padding: "32px 0 44px", borderBottom: "2px solid #1A4870", marginBottom: 44 }}>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Raccolto Consultoria · Documento Interno</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#1A4870", margin: "0 0 6px" }}>Arato SaaS</h1>
          <div style={{ fontSize: 16, color: "#555", marginBottom: 28 }}>Manual Completo do Proprietário do Sistema</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            {["Versão 2.0", "Abril 2026", "Uso interno"].map(t => (
              <span key={t} style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", fontSize: 12, color: "#888" }}>{t}</span>
            ))}
          </div>
        </div>

        {/* ── Índice ── */}
        <div className="section" style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#1A4870", marginBottom: 16 }}>Índice</h2>
          {[
            ["1",  "Visão Geral — Como o SaaS Funciona"],
            ["2",  "Adicionando um Novo Cliente (Checklist Completo)"],
            ["3",  "Configuração da Empresa e Dados Fiscais"],
            ["4",  "Certificado Digital A1 — Instalação e Gestão"],
            ["5",  "Configuração SEFAZ — NF-e e MDF-e"],
            ["6",  "Parâmetros de NF-e — CFOPs, CSTs e NCMs Agrícolas"],
            ["7",  "Tributação Específica do MT — ICMS Diferido e Funrural"],
            ["8",  "Configuração de E-mail (Resend)"],
            ["9",  "Configurações Financeiras"],
            ["10", "Configuração de Lavoura e Classificação de Grãos"],
            ["11", "Fluxo de Testes — Homologação antes de Produção"],
            ["12", "Bloqueio e Desbloqueio por Inadimplência"],
            ["13", "Gestão de Clientes — Consultas e Exclusão"],
            ["14", "Troubleshooting — Problemas Comuns e Soluções"],
            ["15", "Resumo de Variáveis de Ambiente"],
          ].map(([n, t]) => (
            <div key={n} style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "0.5px dotted #EEF1F6" }}>
              <span style={{ color: "#1A4870", fontWeight: 700, minWidth: 28, flexShrink: 0 }}>{n}.</span>
              <span>{t}</span>
            </div>
          ))}
        </div>

        {/* ── 1. Visão Geral ── */}
        <Secao n="1" titulo="Visão Geral — Como o SaaS Funciona">
          <p style={{ marginBottom: 12 }}>
            O Arato é um sistema <strong>multi-tenant</strong>: um único servidor na Vercel, um único banco no Supabase, atendendo múltiplos clientes (fazendas) simultaneamente. Cada cliente é isolado pelo campo <code style={{ background: "#F0F2F8", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>fazenda_id</code> presente em todas as tabelas. O RLS (Row Level Security) do Supabase bloqueia automaticamente acesso cruzado entre clientes — mesmo que haja falha no código, o banco rejeita a consulta.
          </p>
          <Tabela
            colunas={["Camada", "Serviço", "Função"]}
            linhas={[
              ["Aplicação",      "Vercel (Next.js 16)", "Interface web, APIs, cron jobs"],
              ["Banco de dados", "Supabase (PostgreSQL)", "Dados, autenticação, storage, RLS"],
              ["E-mail",         "Resend", "Alertas, relatórios semanais, boas-vindas"],
              ["Fiscal",         "SEFAZ (MT)",  "Autorização de NF-e, CT-e, MDF-e"],
              ["Certificado",    "AC (Certisign, Serasa…)", "Assinatura digital dos documentos fiscais"],
            ]}
          />
          <Info>
            <strong>Custos fixos mensais estimados:</strong> Vercel Pro ~$20/mês · Supabase Pro ~$25/mês · Resend Free até 3.000 e-mails/mês. Adicionar clientes não aumenta o custo até você atingir os limites de cada plano.
          </Info>
        </Secao>

        {/* ── 2. Checklist novo cliente ── */}
        <Secao n="2" titulo="Adicionando um Novo Cliente — Checklist Completo">
          <Info>
            Um novo cliente = uma nova fazenda no banco + usuário no Supabase Auth + configurações fiscais. O processo completo leva cerca de <strong>20–30 minutos</strong> na primeira vez. Com prática, menos de 10.
          </Info>

          <SubSecao titulo="2.1 Dados que você precisa coletar do cliente antes de começar">
            <Tabela
              colunas={["Dado", "Obrigatório?", "Para que serve"]}
              linhas={[
                ["Razão Social / Nome",            "Sim", "Cadastro da fazenda"],
                ["CNPJ (PJ) ou CPF (PF)",          "Sim", "NF-e emitente, LCDPR"],
                ["Inscrição Estadual (IE)",         "Sim para PJ inscrita", "NF-e obrigatório"],
                ["Inscrição Municipal (IM)",        "Só se emite NFSe", "NFSe"],
                ["Endereço completo + CEP",         "Sim", "NF-e, DANFE"],
                ["Município + Código IBGE",         "Sim", "NF-e (cMun)"],
                ["CRT (Regime Tributário)",         "Sim", "NF-e (Simples=1, Presumido=2, Real=3)"],
                ["Certificado Digital A1 (.pfx)",  "Sim para NF-e", "Assinatura eletrônica"],
                ["Senha do Certificado",           "Sim", "Leitura do .pfx"],
                ["E-mail de acesso ao sistema",    "Sim", "Login Supabase Auth"],
                ["Nome do responsável",            "Sim", "Perfil, alertas"],
              ]}
            />
          </SubSecao>

          <SubSecao titulo="2.2 Criar usuário no Supabase Auth">
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Acesse <strong>supabase.com → Authentication → Users → Add user → Create new user</strong></li>
              <li>Informe o e-mail e senha inicial (ex: <code style={{ background: "#F0F2F8", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>Fazenda@2026</code>)</li>
              <li>Clique em <strong>Create user</strong> e copie o <strong>UUID gerado</strong></li>
            </ol>
          </SubSecao>

          <SubSecao titulo="2.3 Criar a fazenda e perfil no banco">
            <Code>{`-- 1. Criar a fazenda
INSERT INTO fazendas (
  nome, documento, tipo_pessoa, uf, estado, municipio,
  cep, endereco, numero, bairro, status
) VALUES (
  'Fazenda Boa Vista',          -- nome
  '12.345.678/0001-90',         -- CNPJ ou CPF
  'PJ',                         -- 'PF' ou 'PJ'
  'MT', 'Mato Grosso', 'Nova Mutum',
  '78450-000', 'Rodovia BR-163', 'km 850', 'Zona Rural',
  'ativo'
) RETURNING id;  -- guarde este UUID

-- 2. Vincular usuário à fazenda
INSERT INTO perfis (id, fazenda_id, nome, email, role)
VALUES (
  'UUID_DO_USUARIO',   -- do passo 2.2
  'UUID_DA_FAZENDA',   -- do INSERT acima
  'João da Silva',
  'joao@fazendaboavista.com.br',
  'admin'
);`}</Code>
          </SubSecao>

          <SubSecao titulo="2.4 Checklist pós-criação">
            {[
              "Usuário criado no Supabase Auth",
              "Fazenda criada na tabela fazendas",
              "Perfil criado na tabela perfis (vinculando usuário ↔ fazenda)",
              "Configuração fiscal preenchida (Seção 5 deste manual)",
              "Certificado Digital A1 configurado (Seção 4)",
              "E-mail de boas-vindas enviado ao cliente com URL + login + senha",
              "Teste de login realizado com a conta do cliente",
              "Emissão de NF-e em homologação testada (Seção 11)",
              "Ambiente trocado de homologação para produção após os testes",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", borderBottom: "0.5px dotted #EEF1F6" }}>
                <span style={{ color: "#16A34A", fontWeight: 700, flexShrink: 0 }}>☐</span>
                <span style={{ fontSize: 13 }}>{item}</span>
              </div>
            ))}
          </SubSecao>
        </Secao>

        {/* ── 3. Empresa e Dados Fiscais ── */}
        <Secao n="3" titulo="Configuração da Empresa e Dados Fiscais">
          <p style={{ marginBottom: 14 }}>
            Após o login do cliente, acesse <strong>Configurações → Empresa</strong> e preencha todos os campos. Esses dados aparecem no DANFE e são enviados ao SEFAZ em cada NF-e.
          </p>
          <SubSecao titulo="3.1 Dados obrigatórios para NF-e">
            <Tabela
              colunas={["Campo no Sistema", "O que preencher", "Exemplo"]}
              linhas={[
                ["Razão Social",          "Nome conforme Receita Federal",        "Fazenda Boa Vista LTDA"],
                ["CNPJ / CPF",            "Sem pontuação ou com — ambos funcionam","12345678000190"],
                ["Inscrição Estadual",    "IE do produtor / empresa no SEFAZ-MT",  "1234567890-1"],
                ["Endereço completo",     "Logradouro, número, bairro",            "BR-163, km 850, Zona Rural"],
                ["CEP",                   "8 dígitos",                             "78450000"],
                ["Município",             "Nome exato",                            "Nova Mutum"],
                ["Código IBGE",           "7 dígitos — consulte ibge.gov.br",      "5106224"],
                ["UF",                    "Sigla do estado",                       "MT"],
                ["CRT",                   "Código Regime Tributário (1/2/3)",      "1 = Simples Nacional"],
                ["Telefone / E-mail",     "Contato do emitente",                   "(65) 99999-0000"],
              ]}
            />
          </SubSecao>
          <SubSecao titulo="3.2 CRT — Código de Regime Tributário">
            <Tabela
              colunas={["CRT", "Regime", "Quem usa"]}
              linhas={[
                ["1", "Simples Nacional",                 "Maioria dos produtores PF e PJ pequenas"],
                ["2", "Simples Nacional — Excesso de Sublimite", "Pouco comum em agro"],
                ["3", "Regime Normal (Lucro Presumido ou Real)", "Empresas maiores, tradings"],
              ]}
            />
            <Aviso>
              Produtores rurais PF (CPF) geralmente usam CRT 1. Confirme com o contador do cliente — escolher errado rejeita as NF-es no SEFAZ.
            </Aviso>
          </SubSecao>
        </Secao>

        {/* ── 4. Certificado A1 ── */}
        <Secao n="4" titulo="Certificado Digital A1 — Instalação e Gestão">
          <SubSecao titulo="4.1 O que é o Certificado A1">
            <p style={{ marginBottom: 10 }}>
              O Certificado Digital A1 é um arquivo <strong>.pfx</strong> (ou .p12) protegido por senha. Ele funciona como a assinatura eletrônica do emitente — toda NF-e, CT-e e MDF-e precisa ser assinada com ele antes de ser enviada ao SEFAZ. Sem ele, o sistema não consegue emitir nenhum documento fiscal.
            </p>
            <Tabela
              colunas={["Característica", "Valor"]}
              linhas={[
                ["Formato",     "Arquivo .pfx ou .p12"],
                ["Validade",    "1 ano (a maioria) ou 3 anos"],
                ["Emissoras",   "Certisign, Serasa, Valid, Soluti, AC Safeweb"],
                ["Tipo",        "e-CNPJ A1 (para PJ) ou e-CPF A1 (para PF)"],
                ["Custo médio", "R$ 200–400 por certificado/ano"],
              ]}
            />
          </SubSecao>

          <SubSecao titulo="4.2 Como configurar no Arato">
            <Passo n="1" titulo="Obter o arquivo .pfx do cliente">
              <p style={{ margin: "6px 0" }}>O cliente baixa o certificado da emissora (Certisign, Serasa, etc.) e entrega o arquivo <strong>.pfx + a senha</strong>. Guarde com segurança — essa senha não pode ser recuperada.</p>
            </Passo>
            <Passo n="2" titulo="Acessar Parâmetros do Sistema">
              <p style={{ margin: "6px 0" }}>No sistema, logado como admin da fazenda, acesse <strong>Configurações → Parâmetros → Parâmetros do Sistema → aba Fiscal</strong>.</p>
            </Passo>
            <Passo n="3" titulo="Preencher os campos de certificado">
              <Tabela
                colunas={["Campo", "O que informar"]}
                linhas={[
                  ["Caminho / Upload do Certificado", "Faça upload do arquivo .pfx (armazenado no Supabase Storage)"],
                  ["Senha do Certificado",            "Senha definida na emissão — nunca compartilhe por e-mail"],
                  ["Data de Vencimento",              "Data impressa no certificado — o sistema enviará alertas 30/15/7/1 dia antes"],
                ]}
              />
            </Passo>
            <Sucesso>
              Após salvar, o sistema testa a leitura do certificado automaticamente. Se aparecer "Certificado válido" em verde, está correto.
            </Sucesso>
            <Alerta>
              NUNCA armazene a senha do certificado em e-mail ou WhatsApp. Use um gerenciador de senhas (Bitwarden, 1Password) ou anote em local seguro físico.
            </Alerta>
          </SubSecao>

          <SubSecao titulo="4.3 Renovação do Certificado">
            <p style={{ marginBottom: 10 }}>O sistema envia alertas automáticos 30, 15, 7 e 1 dia antes do vencimento. Quando o certificado novo chegar:</p>
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Acesse <strong>Configurações → Parâmetros do Sistema → Fiscal</strong></li>
              <li>Substitua o arquivo .pfx pelo novo</li>
              <li>Atualize a senha (se mudou) e a data de vencimento</li>
              <li>Salve e aguarde a confirmação "Certificado válido"</li>
            </ol>
            <Aviso>
              Não espere o certificado vencer para renovar. Com o certificado vencido, <strong>nenhuma NF-e pode ser emitida</strong> — o SEFAZ rejeita automaticamente.
            </Aviso>
          </SubSecao>
        </Secao>

        {/* ── 5. SEFAZ ── */}
        <Secao n="5" titulo="Configuração SEFAZ — NF-e e MDF-e">
          <SubSecao titulo="5.1 Ambientes: Homologação e Produção">
            <Tabela
              colunas={["Ambiente", "Quando usar", "NF-e tem validade fiscal?"]}
              linhas={[
                ["Homologação (tpAmb=2)", "Testes, configuração inicial, treinamento do cliente", "NÃO — são apenas para teste"],
                ["Produção (tpAmb=1)",    "Operação real da fazenda", "SIM — documentos com valor legal"],
              ]}
            />
            <Aviso>
              <strong>Todo cliente novo começa em Homologação.</strong> Só mude para Produção após emitir pelo menos 3–5 NF-es de teste e confirmar que os dados, tributação e layout do DANFE estão corretos.
            </Aviso>
          </SubSecao>

          <SubSecao titulo="5.2 Configuração em Parâmetros do Sistema → aba Fiscal">
            <Tabela
              colunas={["Parâmetro", "Homologação", "Produção", "Observação"]}
              linhas={[
                ["Ambiente",               "2 - Homologação", "1 - Produção",    "Alterar somente após testes OK"],
                ["Série NF-e",             "900",             "1",               "Série 900 é reservada para testes pelo SEFAZ"],
                ["Próx. Número NF-e",      "1",               "1 ou continuação", "SEFAZ controla a numeração — começa em 1 na produção"],
                ["CNPJ / CPF Emitente",    "CNPJ/CPF real",   "CNPJ/CPF real",   "Mesmo em homologação usa dados reais do emitente"],
                ["IE",                     "IE real",         "IE real",          ""],
                ["UF",                     "MT",              "MT",               "Estado do emitente"],
                ["Código IBGE Município",  "Código real",     "Código real",      "7 dígitos — ex: 5106224 para Nova Mutum"],
                ["CRT",                    "Conforme cliente", "Conforme cliente", "1, 2 ou 3"],
                ["URL Webservice",         "Automática",      "Automática",       "O sistema detecta pela UF e ambiente"],
              ]}
            />
          </SubSecao>

          <SubSecao titulo="5.3 Configuração de MDF-e (aba MDF-e)">
            <Tabela
              colunas={["Parâmetro", "O que informar"]}
              linhas={[
                ["Ambiente MDF-e",   "Mesma lógica da NF-e: 2 para testes, 1 para produção"],
                ["Série MDF-e",      "1 para produção, 900 para homologação"],
                ["RNTRC Emitente",   "Registro Nacional de Transportadores — exigido para MDF-e"],
                ["Tipo Emitente",    "ETC (transportador) ou TAC (conta própria) ou outros"],
                ["UF Início",        "MT (geralmente — estado de saída dos grãos)"],
                ["UF Fim",           "Estado de destino (ex: SP, PR, SC para portos e tradings)"],
              ]}
            />
            <Info>
              MDF-e só é necessário quando a fazenda tem <strong>frota própria</strong> e emite CT-e. Se usa transportadora terceirizada, quem emite o MDF-e é a transportadora.
            </Info>
          </SubSecao>

          <SubSecao titulo="5.4 Webservices SEFAZ-MT por Ambiente">
            <Tabela
              colunas={["Operação", "URL Homologação", "URL Produção"]}
              linhas={[
                ["Autorização NF-e",  "hom.nfe.fazenda.mt.gov.br",  "nfe.fazenda.mt.gov.br"],
                ["Consulta NF-e",     "hom.nfe.fazenda.mt.gov.br",  "nfe.fazenda.mt.gov.br"],
                ["Status Serviço",    "hom.nfe.fazenda.mt.gov.br",  "nfe.fazenda.mt.gov.br"],
                ["NF-e Nacional",     "hom.nfe.fazenda.gov.br",     "www.nfe.fazenda.gov.br"],
              ]}
            />
            <Info>O sistema detecta automaticamente a URL pelo estado (UF) configurado. Você não precisa preencher URLs manualmente.</Info>
          </SubSecao>
        </Secao>

        {/* ── 6. CFOPs, CSTs e NCMs ── */}
        <Secao n="6" titulo="Parâmetros de NF-e — CFOPs, CSTs e NCMs Agrícolas">
          <SubSecao titulo="6.1 CFOPs mais usados no agronegócio MT">
            <Tabela
              colunas={["CFOP", "Descrição", "Quando usar"]}
              linhas={[
                ["6.101", "Venda de Produção — Saída Interestadual PF", "Produtor PF vendendo para trading em outro estado"],
                ["5.101", "Venda de Produção — Saída Interna PF",        "Produtor PF vendendo dentro do MT"],
                ["6.501", "Remessa p/ Fim Específico de Exportação",     "Venda para exportação via trading (VFE)"],
                ["5.905", "Remessa para Armazém Geral",                  "Transferência de grãos entre depósitos"],
                ["6.905", "Remessa p/ Depósito Fechado — Interestadual", "Transferência interestadual para armazém"],
                ["5.102", "Venda de Mercadoria Adquirida",               "Revenda de insumos (distribuidoras)"],
              ]}
            />
            <Aviso>
              O CFOP correto depende de: (1) PF ou PJ; (2) operação interna ou interestadual; (3) tipo de operação (venda, remessa, devolução). Confirme sempre com o contador do cliente.
            </Aviso>
          </SubSecao>

          <SubSecao titulo="6.2 NCMs das principais commodities">
            <Tabela
              colunas={["Commodity", "NCM", "Descrição Resumida"]}
              linhas={[
                ["Soja em grão",       "1201.10.00", "Soja mesmo triturada"],
                ["Milho em grão",      "1005.90.10", "Milho para outros fins"],
                ["Algodão em caroço",  "5201.00.10", "Algodão não cardado nem penteado"],
                ["Algodão em pluma",   "5201.00.20", "Algodão não cardado nem penteado"],
                ["Sorgo em grão",      "1007.90.00", "Sorgo para outros fins"],
                ["Trigo",              "1001.99.00", "Trigo exceto durum"],
                ["Farelo de soja",     "2304.00.10", "Tortas de soja"],
                ["Óleo de soja",       "1507.90.11", "Óleo de soja refinado"],
              ]}
            />
          </SubSecao>

          <SubSecao titulo="6.3 CST — Código de Situação Tributária (ICMS)">
            <Tabela
              colunas={["CST", "Descrição", "Quando usar em MT"]}
              linhas={[
                ["090", "ICMS — Outras (regime diferido)", "Produtor rural PF — ICMS diferido"],
                ["041", "Não tributada",                   "Operações isentas"],
                ["060", "ICMS cobrado anteriormente por substituição", "ST"],
                ["010", "Tributada + cobrada por ST",      "Distribuição de insumos"],
              ]}
            />
          </SubSecao>
        </Secao>

        {/* ── 7. Tributação MT ── */}
        <Secao n="7" titulo="Tributação Específica do MT — ICMS Diferido e Funrural">
          <SubSecao titulo="7.1 ICMS Diferido">
            <p style={{ marginBottom: 10 }}>
              No Mato Grosso, a venda de produção agropecuária por <strong>produtor rural inscrito no CAR</strong> goza de diferimento do ICMS. Isso significa que o imposto não é recolhido no momento da venda — é diferido para a etapa seguinte da cadeia.
            </p>
            <Tabela
              colunas={["Situação", "Tratamento ICMS", "Observação NF-e"]}
              linhas={[
                ["Produtor PF vendendo soja em MT",         "ICMS diferido — CST 090",  "infCpl obrigatório: 'ICMS diferido nos termos do Decreto MT nº 4.540/2004'"],
                ["Produtor PF vendendo soja p/ exportação", "ICMS suspenso — CFOP 6501", "infCpl: 'ICMS suspenso art. 7º, VII do RICMS-MT'"],
                ["Produtor PJ (Simples Nacional)",          "ICMS diferido — CST 090",  "Pode ter variações conforme atividade"],
              ]}
            />
            <Info>
              O sistema já preenche automaticamente o texto do campo <strong>infCpl</strong> (informações complementares) com o texto legal correto ao selecionar o CFOP. Verifique sempre que o texto aparece no DANFE.
            </Info>
          </SubSecao>

          <SubSecao titulo="7.2 Funrural">
            <Tabela
              colunas={["Tipo", "Alíquota", "Quem retém", "Base de cálculo"]}
              linhas={[
                ["Produtor PF", "1,5% (SENAR incluso: 0,2%)", "Adquirente (trading, cooperativa)", "Valor bruto da NF-e"],
                ["Produtor PJ — Simples", "Geralmente isento", "—", "Confirmar com contador"],
                ["Produtor PJ — Lucro Real/Presumido", "2,5%", "Adquirente", "Valor bruto"],
              ]}
            />
            <Aviso>
              O Funrural é retido na fonte pelo <strong>comprador</strong>, não pelo vendedor. A NF-e deve mencionar isso no campo informações complementares: <em>"Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991."</em>
            </Aviso>
          </SubSecao>

          <SubSecao titulo="7.3 PIS / COFINS sobre venda de produção agropecuária">
            <Tabela
              colunas={["Situação", "Tratamento"]}
              linhas={[
                ["Produtor PF vendendo produção própria", "Isento — Lei 10.925/2004, art. 10, VI"],
                ["Produtor PJ Simples Nacional",          "Não destaca PIS/COFINS (incluído no Simples)"],
                ["Produtor PJ Lucro Presumido",           "Alíquota zero sobre produção rural própria"],
              ]}
            />
          </SubSecao>
        </Secao>

        {/* ── 8. E-mail Resend ── */}
        <Secao n="8" titulo="Configuração de E-mail (Resend)">
          <p style={{ marginBottom: 14 }}>
            O Resend é o serviço de envio de e-mail usado para alertas de vencimento, relatórios semanais e e-mails de boas-vindas. Configurado uma única vez para todo o sistema.
          </p>
          <SubSecao titulo="8.1 Configurar a conta Resend">
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Acesse <strong>resend.com</strong> e crie uma conta (gratuito até 3.000 e-mails/mês)</li>
              <li>Vá em <strong>API Keys → Create API Key</strong> → copie a chave (começa com <code style={{ background: "#F0F2F8", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>re_</code>)</li>
              <li>Acesse <strong>Domains → Add Domain</strong> e adicione o domínio do remetente (ex: <code style={{ background: "#F0F2F8", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>raccolto.com.br</code>)</li>
              <li>Configure os registros DNS (SPF, DKIM) conforme indicado pelo Resend no seu provedor de domínio</li>
              <li>Aguarde a verificação (pode levar até 48h)</li>
            </ol>
          </SubSecao>
          <SubSecao titulo="8.2 Variáveis de ambiente na Vercel">
            <Code>{`RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM=alertas@raccolto.com.br`}</Code>
            <p style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              Configure em: <strong>Vercel Dashboard → Project arato → Settings → Environment Variables</strong>. Aplique para os ambientes <em>Production</em> e <em>Preview</em>.
            </p>
          </SubSecao>
          <SubSecao titulo="8.3 Testar envio de e-mail">
            <p>Acesse <strong>Configurações → Automações</strong> e clique em <strong>▶ Executar</strong> na automação "Alertas de Vencimento". Se aparecer "✓ Concluído — 1 e-mail enviado", está funcionando.</p>
            <Aviso>Se retornar erro "Domain not verified", o DNS ainda não propagou. Aguarde e tente novamente.</Aviso>
          </SubSecao>
        </Secao>

        {/* ── 9. Configurações Financeiras ── */}
        <Secao n="9" titulo="Configurações Financeiras">
          <SubSecao titulo="9.1 Plano de Contas">
            <p style={{ marginBottom: 10 }}>
              Acesse <strong>Configurações → Financeiro → Plano de Contas</strong>. O sistema vem com um plano padrão para agronegócio. Personalize conforme o contador de cada cliente pede — especialmente as contas de receita e custo de produção, que alimentam o DRE.
            </p>
            <Info>Contas contábeis vinculadas a operações gerenciais são necessárias para gerar o SPED ECD. Confirme com o contador quais contas usar.</Info>
          </SubSecao>
          <SubSecao titulo="9.2 Centros de Custo e Regras de Rateio">
            <p>Acesse <strong>Configurações → Financeiro → Centros de Custo</strong>. Configure os centros de custo por talhão, cultura ou fazenda. Depois, em <strong>Configurações → Financeiro → Regras de Rateio</strong>, defina como os custos compartilhados (ex: maquinário, arrendamento global) são distribuídos entre os ciclos de produção.</p>
          </SubSecao>
          <SubSecao titulo="9.3 Contas Bancárias">
            <p>Cadastre as contas bancárias do cliente em <strong>Cadastros → Gerais → Empresas</strong> (aba Contas Bancárias). Essencial para a conciliação bancária e para o correto funcionamento do fluxo de caixa.</p>
          </SubSecao>
        </Secao>

        {/* ── 10. Lavoura ── */}
        <Secao n="10" titulo="Configuração de Lavoura e Classificação de Grãos">
          <SubSecao titulo="10.1 Estrutura obrigatória antes do primeiro plantio">
            <Tabela
              colunas={["O que cadastrar", "Onde", "Ordem"]}
              linhas={[
                ["Fazendas e Talhões",       "Cadastros → Técnicos → Fazendas & Talhões", "1º"],
                ["Depósitos / Armazéns",     "Cadastros → Técnicos → Depósitos & Armazéns", "2º"],
                ["Ano Safra",                "Cadastros → Técnicos → Safras → aba Ano Safra", "3º"],
                ["Ciclo de Produção",        "Cadastros → Técnicos → Safras → aba Ciclos", "4º"],
                ["Insumos",                  "Cadastros → Técnicos → Insumos", "5º"],
                ["Padrões de Classificação", "Cadastros → Técnicos → Padrões de Classificação", "6º (opcional)"],
              ]}
            />
            <Aviso>
              Sem Ano Safra e Ciclo cadastrados, nenhuma operação de lavoura (plantio, pulverização, colheita) pode ser registrada.
            </Aviso>
          </SubSecao>
          <SubSecao titulo="10.2 Padrões de Classificação de Grãos">
            <p style={{ marginBottom: 10 }}>
              Em <strong>Cadastros → Padrões de Classificação</strong>, carregue os padrões oficiais clicando em <strong>"Carregar Padrões Oficiais"</strong>. O sistema inclui:
            </p>
            <Tabela
              colunas={["Commodity", "Norma", "Parâmetros"]}
              linhas={[
                ["Soja",   "ABIOVE / IN MAPA 11/2007", "Umidade ≤14%, Impureza ≤1%, Avariados ≤8%, PH ≥700g/L"],
                ["Milho",  "IN MAPA 60/2011",           "Umidade ≤14%, Impureza ≤1%, Ardidos ≤3%"],
                ["Algodão","ABRAPA / ASTM",              "Mic, Uniformidade, Resistência, SFI"],
              ]}
            />
          </SubSecao>
        </Secao>

        {/* ── 11. Homologação ── */}
        <Secao n="11" titulo="Fluxo de Testes — Homologação antes de Produção">
          <Alerta>
            Nunca configure direto em Produção para um cliente novo. Uma NF-e emitida em produção com dados errados precisa ser cancelada no SEFAZ — processo burocrático e com prazo de 24h. Em homologação, os erros não têm consequência fiscal.
          </Alerta>

          <SubSecao titulo="11.1 Checklist de testes em homologação">
            {[
              "Configurar ambiente = 2 (Homologação) e série = 900",
              "Emitir NF-e de venda com CFOP 6.101 (ou 5.101)",
              "Verificar se o SEFAZ retornou 'Autorizado o Uso da NF-e' (cStat 100)",
              "Abrir o DANFE gerado e conferir: dados do emitente, do destinatário, produtos, valores, infCpl",
              "Verificar se o texto de ICMS diferido aparece corretamente",
              "Verificar se o texto de Funrural aparece corretamente",
              "Emitir NF-e com CFOP 6.501 (exportação / VFE) e conferir",
              "Testar cancelamento de NF-e",
              "Verificar se o e-mail com XML chegou ao destinatário de teste",
              "Após 3–5 testes sem erros → mudar para Produção",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", borderBottom: "0.5px dotted #EEF1F6" }}>
                <span style={{ color: "#1A4870", fontWeight: 700, flexShrink: 0 }}>☐</span>
                <span style={{ fontSize: 13 }}>{item}</span>
              </div>
            ))}
          </SubSecao>

          <SubSecao titulo="11.2 Mudar para Produção">
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Acesse <strong>Configurações → Parâmetros do Sistema → aba Fiscal</strong></li>
              <li>Mude <strong>Ambiente</strong> de "2 - Homologação" para "1 - Produção"</li>
              <li>Mude <strong>Série</strong> de 900 para 1</li>
              <li>Defina <strong>Próximo número</strong> como 1 (início em produção)</li>
              <li>Salve e emita uma NF-e real de baixo valor para confirmar</li>
            </ol>
            <Sucesso>Quando o SEFAZ retornar "Autorizado o Uso da NF-e" com chave de 44 dígitos válida, o cliente está em produção.</Sucesso>
          </SubSecao>
        </Secao>

        {/* ── 12. Bloqueio ── */}
        <Secao n="12" titulo="Bloqueio e Desbloqueio por Inadimplência">
          <SubSecao titulo="12.1 Bloqueio imediato (1 usuário)">
            <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Acesse <strong>Supabase → Authentication → Users</strong></li>
              <li>Encontre o usuário pelo e-mail</li>
              <li>Clique nos <strong>⋯ (três pontos)</strong> → <strong>"Ban user"</strong></li>
            </ol>
          </SubSecao>
          <SubSecao titulo="12.2 Bloqueio via SQL (todos os usuários da fazenda)">
            <Code>{`UPDATE fazendas SET status = 'bloqueado' WHERE id = 'UUID_DA_FAZENDA';`}</Code>
          </SubSecao>
          <SubSecao titulo="12.3 Desbloquear após pagamento">
            <Code>{`-- Via SQL:
UPDATE fazendas SET status = 'ativo' WHERE id = 'UUID_DA_FAZENDA';

-- Via Supabase Auth: clique em "Unban user"`}</Code>
          </SubSecao>
          <Aviso>
            Ao bloquear, avise o cliente com antecedência de pelo menos 48h. O bloqueio durante safra pode causar problemas graves — o produtor não consegue emitir NF-e para cargas que já saíram da fazenda.
          </Aviso>
        </Secao>

        {/* ── 13. Gestão de Clientes ── */}
        <Secao n="13" titulo="Gestão de Clientes — Consultas e Exclusão">
          <SubSecao titulo="13.1 Listar todos os clientes">
            <Code>{`SELECT
  f.nome        AS fazenda,
  f.documento,
  f.status,
  p.nome        AS responsavel,
  p.email,
  f.created_at  AS desde
FROM fazendas f
JOIN perfis p ON p.fazenda_id = f.id
ORDER BY f.nome;`}</Code>
          </SubSecao>
          <SubSecao titulo="13.2 Excluir cliente definitivamente">
            <Alerta>Irreversível. Faça backup antes (Configurações → Backup & Restauração).</Alerta>
            <Code>{`DELETE FROM perfis               WHERE fazenda_id = 'UUID';
DELETE FROM lancamentos          WHERE fazenda_id = 'UUID';
DELETE FROM contratos            WHERE fazenda_id = 'UUID';
DELETE FROM pedidos_compra       WHERE fazenda_id = 'UUID';
DELETE FROM estoque_itens        WHERE fazenda_id = 'UUID';
DELETE FROM ciclos               WHERE fazenda_id = 'UUID';
DELETE FROM talhoes              WHERE fazenda_id = 'UUID';
DELETE FROM arrendamentos        WHERE fazenda_id = 'UUID';
DELETE FROM configuracoes_modulo WHERE fazenda_id = 'UUID';
DELETE FROM fazendas             WHERE id          = 'UUID';
-- Depois: Supabase Auth → Delete user`}</Code>
          </SubSecao>
        </Secao>

        {/* ── 14. Troubleshooting ── */}
        <Secao n="14" titulo="Troubleshooting — Problemas Comuns e Soluções">
          <Tabela
            colunas={["Problema", "Causa provável", "Solução"]}
            linhas={[
              ["NF-e rejeitada cStat 204", "IE duplicada ou inválida", "Verificar IE no sefaz.mt.gov.br → Consulta de Contribuinte"],
              ["NF-e rejeitada cStat 228", "Data de emissão inválida (mais de 5 min no futuro)", "Verificar fuso horário do servidor (deve ser UTC)"],
              ["NF-e rejeitada cStat 539", "CNPJ do emitente não autorizado para NF-e", "Credenciar o CNPJ no SEFAZ-MT"],
              ["NF-e rejeitada cStat 136", "Certificado digital vencido ou inválido", "Substituir o certificado A1 (Seção 4)"],
              ["DANFE sem dados do emitente", "Empresa não configurada", "Preencher Configurações → Empresa"],
              ["E-mail de alerta não chega", "RESEND_FROM não verificado", "Verificar DNS no painel Resend → domínio"],
              ["Login retorna 'Invalid session'", "Cookie de sessão expirado", "Fazer logout e login novamente"],
              ["Backup falha com erro 403", "Bucket 'backups' não criado ou não privado", "Supabase → Storage → criar bucket 'backups' (Private)"],
              ["NF-e autorizada mas XML não baixou", "NEXT_PUBLIC_APP_URL não configurada", "Vercel → Settings → Env Vars → NEXT_PUBLIC_APP_URL"],
              ["Cron jobs não executam", "CRON_SECRET incorreto ou não configurado", "Vercel → Settings → Env Vars → CRON_SECRET"],
            ]}
          />
        </Secao>

        {/* ── 15. Variáveis de Ambiente ── */}
        <Secao n="15" titulo="Resumo de Variáveis de Ambiente">
          <p style={{ marginBottom: 14 }}>Configure todas em: <strong>Vercel Dashboard → Project arato → Settings → Environment Variables</strong>.</p>
          <Tabela
            colunas={["Variável", "Obrigatória?", "Descrição"]}
            linhas={[
              ["NEXT_PUBLIC_SUPABASE_URL",       "Sim", "URL do projeto Supabase (ex: https://xxx.supabase.co)"],
              ["NEXT_PUBLIC_SUPABASE_ANON_KEY",  "Sim", "Chave pública do Supabase (anon key)"],
              ["SUPABASE_SERVICE_ROLE_KEY",       "Sim", "Service Role Key — usada pelos crons para ignorar RLS"],
              ["RESEND_API_KEY",                  "Sim", "Chave da API Resend (começa com re_)"],
              ["RESEND_FROM",                     "Sim", "E-mail remetente verificado (ex: alertas@raccolto.com.br)"],
              ["NEXT_PUBLIC_APP_URL",             "Sim", "URL pública do app (ex: https://arato-raccolto.vercel.app)"],
              ["CRON_SECRET",                     "Recomendado", "Segredo para proteger endpoints /api/cron/* de chamadas externas"],
            ]}
          />
          <Info>
            Para ver as variáveis configuradas atualmente: <strong>Vercel Dashboard → arato → Settings → Environment Variables</strong>. Nunca compartilhe a <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>SUPABASE_SERVICE_ROLE_KEY</code> — ela bypassa todas as regras de segurança do banco.
          </Info>
        </Secao>

        {/* Rodapé */}
        <div style={{ borderTop: "0.5px solid #DDE2EE", paddingTop: 20, marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa" }}>
          <span>Arato SaaS — Manual do Proprietário v2.0 · Abril 2026</span>
          <span>Raccolto Consultoria · Documento Interno · Não distribuir</span>
        </div>

      </main>
    </>
  );
}

export default function ManualProprietario() {
  return (
    <Suspense fallback={null}>
      <ManualContent />
    </Suspense>
  );
}
