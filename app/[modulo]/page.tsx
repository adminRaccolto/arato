"use client";
import { use } from "react";
import TopNav from "../../components/TopNav";

const modulos: Record<string, {
  titulo: string;
  descricao: string;
  icone: string;
  funcionalidades: { nome: string; descricao: string; auto: boolean }[];
}> = {
  financeiro: {
    titulo: "Financeiro",
    descricao: "Contas a pagar e receber, fluxo de caixa e conciliação bancária automática",
    icone: "◈",
    funcionalidades: [
      { nome: "Contas a Pagar / Receber",        descricao: "Lançamentos, vencimentos e histórico completo",                     auto: false },
      { nome: "Conciliação bancária automática",  descricao: "Importa OFX às 8h e concilia com os lançamentos do sistema",        auto: true  },
      { nome: "Fluxo de caixa",                  descricao: "Projeção de 30/60/90 dias com base em CP/CR cadastrados",            auto: true  },
      { nome: "Alertas de vencimento",           descricao: "Notificações 7, 3 e 1 dia antes de cada vencimento",                auto: true  },
      { nome: "Lançamento automático por NF-e",  descricao: "Toda NF-e autorizada já lança a receita no financeiro",             auto: true  },
      { nome: "Relatório semanal por e-mail",    descricao: "Resumo financeiro toda segunda às 7h",                              auto: true  },
    ],
  },
  estoque: {
    titulo: "Estoque",
    descricao: "Controle de insumos, sementes, fertilizantes e defensivos por talhão e safra",
    icone: "▣",
    funcionalidades: [
      { nome: "Cadastro de insumos",             descricao: "Sementes, fertilizantes (N/P/K), defensivos, inoculantes",          auto: false },
      { nome: "Movimentações por operação",      descricao: "Saída automática ao registrar operação na lavoura",                 auto: true  },
      { nome: "Alerta de estoque mínimo",        descricao: "Sistema avisa quando produto atinge o estoque de segurança",        auto: true  },
      { nome: "Custo por talhão",                descricao: "Custo real de insumos aplicados por talhão e por safra",            auto: true  },
      { nome: "Validade de defensivos",          descricao: "Alerta antes do vencimento dos produtos em estoque",                auto: true  },
    ],
  },
  contratos: {
    titulo: "Contratos",
    descricao: "Contratos de venda de grãos, fixações de preço e controle de entregas",
    icone: "◆",
    funcionalidades: [
      { nome: "Contratos de venda",              descricao: "Bunge, Cargill, Amaggi, ADM, Louis Dreyfus e outros",               auto: false },
      { nome: "Fixações de preço",               descricao: "R$ fixo, USD, basis, prêmio sobre CBOT/B3",                        auto: false },
      { nome: "NF-e automática na entrega",      descricao: "Ao confirmar entrega, NF-e é gerada e transmitida à SEFAZ",        auto: true  },
      { nome: "Controle de saldo a entregar",    descricao: "Painel de contratos abertos × entregues × pendentes",              auto: true  },
      { nome: "Alerta de entrega próxima",       descricao: "Sistema avisa 7 dias antes do prazo de entrega",                   auto: true  },
    ],
  },
  relatorios: {
    titulo: "Relatórios",
    descricao: "Análises gerenciais, pivot de produtividade, custos e exportação PDF/Excel",
    icone: "▤",
    funcionalidades: [
      { nome: "DRE Agrícola",                    descricao: "Receitas, custos e resultado por safra, cultura e fazenda",         auto: true  },
      { nome: "Custo por hectare",               descricao: "Breakdown de custos: insumos, operações, frete, impostos",         auto: true  },
      { nome: "Produtividade por talhão",        descricao: "Histórico de sc/ha por talhão e comparação entre safras",          auto: true  },
      { nome: "Análise de sensibilidade",        descricao: "Simulador: o que acontece se o preço da soja cair 10%?",           auto: false },
      { nome: "Relatório semanal automático",    descricao: "PDF enviado por e-mail toda segunda-feira às 7h",                  auto: true  },
      { nome: "Exportação Excel / PDF",          descricao: "Qualquer relatório exportável com 1 clique",                       auto: false },
    ],
  },
  automacoes: {
    titulo: "Automações",
    descricao: "Central de automações ativas — o que o sistema faz sozinho por você",
    icone: "⟳",
    funcionalidades: [
      { nome: "NF-e automática ao fechar venda", descricao: "Contrato confirmado → NF-e gerada, transmitida e arquivada",       auto: true  },
      { nome: "Conciliação bancária diária",     descricao: "OFX importado às 8h e conciliado automaticamente",                 auto: true  },
      { nome: "Cronograma de lavoura",           descricao: "Safra cadastrada → cronograma completo gerado",                    auto: true  },
      { nome: "Alertas de vencimento CP/CR",     descricao: "Notifica 7, 3 e 1 dia antes de cada vencimento",                  auto: true  },
      { nome: "Atualização de preços",           descricao: "CBOT, B3, câmbio e clima às 7h de cada dia útil",                  auto: true  },
      { nome: "Relatório semanal",               descricao: "PDF por e-mail toda segunda às 7h",                                auto: true  },
      { nome: "Alerta certificado A1",           descricao: "Avisa 30, 15, 7 e 1 dia antes do vencimento",                     auto: true  },
      { nome: "Alerta climático",                descricao: "Janelas de plantio e riscos de chuva por região",                  auto: true  },
      { nome: "Backup automático",               descricao: "Exportação dos dados críticos diariamente",                        auto: true  },
    ],
  },
  configuracoes: {
    titulo: "Configurações",
    descricao: "Empresa, usuários, certificado digital, integrações e preferências do sistema",
    icone: "◎",
    funcionalidades: [
      { nome: "Dados da empresa",                descricao: "CNPJ, endereço, regime tributário, inscrição estadual",             auto: false },
      { nome: "Certificado Digital A1",          descricao: "Upload e renovação do .pfx para assinatura de NF-e",               auto: false },
      { nome: "Série e numeração NF-e",          descricao: "Configuração da série e próximo número de NF-e",                   auto: false },
      { nome: "Usuários e permissões",           descricao: "Acesso por módulo: admin, operador, visualizador",                 auto: false },
      { nome: "Integração bancária OFX",         descricao: "Configurar bancos para conciliação automática",                    auto: false },
      { nome: "Preferências de alertas",         descricao: "Canais: e-mail, push, WhatsApp. Horários e antecedência",          auto: false },
      { nome: "Multi-empresa",                   descricao: "Gerenciar múltiplos CNPJs / produtores na mesma conta",             auto: false },
    ],
  },
};

export default function ModuloEmConstrucao({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = use(params);
  const info = modulos[modulo];

  if (!info) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
        <TopNav />
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "#444" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#555", marginBottom: 6 }}>Página não encontrada</div>
            <div style={{ fontSize: 12 }}>Este módulo não existe.</div>
          </div>
        </main>
      </div>
    );
  }

  const autoCount = info.funcionalidades.filter(f => f.auto).length;
  const totalCount = info.funcionalidades.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      <TopNav />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>{info.titulo}</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>{info.descricao}</p>
          </div>
          <span style={{ background: "#FBF0D8", color: "#7A5A12", fontSize: 11, padding: "5px 12px", borderRadius: 20, border: "0.5px solid #C9921B50" }}>
            Em desenvolvimento
          </span>
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {/* Banner */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "28px 32px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 64, height: 64, background: "#D5E8F5", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
              {info.icone}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 6 }}>
                Módulo {info.titulo} em construção
              </div>
              <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 10 }}>
                Este módulo está sendo desenvolvido. Quando estiver pronto, ele terá
                <strong style={{ color: "#1A4870" }}> {autoCount} de {totalCount} funcionalidades totalmente automáticas</strong> —
                sem precisar de ação sua.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 11, background: "#D5E8F5", color: "#0B2D50", padding: "3px 10px", borderRadius: 8 }}>
                  ⟳ {autoCount} automáticas
                </span>
                <span style={{ fontSize: 11, background: "#FBF0D8", color: "#7A5A12", padding: "3px 10px", borderRadius: 8 }}>
                  ◈ {totalCount - autoCount} manuais
                </span>
              </div>
            </div>
          </div>

          {/* Lista de funcionalidades */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "0.5px solid #DEE5EE" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>O que este módulo vai ter</span>
            </div>
            {info.funcionalidades.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px",
                  borderBottom: i < info.funcionalidades.length - 1 ? "0.5px solid #DEE5EE" : "none",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: f.auto ? "#D5E8F5" : "#FBF0D8",
                  border: `1px solid ${f.auto ? "#1A487040" : "#C9921B40"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: f.auto ? "#1A4870" : "#C9921B",
                }}>
                  {f.auto ? "⟳" : "◈"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 2 }}>{f.nome}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{f.descricao}</div>
                </div>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 8, flexShrink: 0,
                  background: f.auto ? "#D5E8F5" : "#FBF0D8",
                  color: f.auto ? "#0B2D50" : "#7A5A12",
                }}>
                  {f.auto ? "automático" : "manual"}
                </span>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>
            Arato · menos cliques, mais campo
          </p>
        </div>
      </main>
    </div>
  );
}
