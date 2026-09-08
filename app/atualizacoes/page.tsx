"use client";
import { useState } from "react";
import TopNav from "../../components/TopNav";

// ─── Histórico de atualizações do sistema ────────────────────────────────────
// Adicione novos releases no INÍCIO da lista (mais recente primeiro)
const RELEASES = [
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
