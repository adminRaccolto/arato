"use client";
import { useState, useEffect, useRef } from "react";
import TopNav from "../../components/TopNav";
import {
  listarInsumos, criarInsumo,
  listarMovimentacoes, criarMovimentacaoManual,
  listarDepositos,
  listarBombas,
  listarMaquinas,
  listarNfEntradas, criarNfEntrada,
  listarNfEntradaItens, criarNfEntradaItem,
  processarNfEntrada,
  listarEstoqueTerceiros,
  listarPessoas, criarPessoa,
} from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import type {
  Insumo, MovimentacaoEstoque,
  Deposito, BombaCombustivel, Maquina,
  NfEntrada, NfEntradaItem, EstoqueTerceiro, Pessoa,
} from "../../lib/supabase";

// ── Hook mobile ──────────────────────────────────────────

// ────────────────────────────────────────────────────────
// Estilos base
// ────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{texto}</span>;
}

function TH({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr style={{ background: "#F3F6F9" }}>
        {cols.map((c, i) => (
          <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function Modal({ titulo, subtitulo, width, onClose, children }: { titulo: string; subtitulo?: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: width ?? 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Cor / label por categoria
// ────────────────────────────────────────────────────────
const CAT_META: Record<Insumo["categoria"], { bg: string; cl: string; label: string }> = {
  semente:         { bg: "#D5E8F5", cl: "#0B2D50", label: "Semente"          },
  fertilizante:    { bg: "#FAEEDA", cl: "#633806", label: "Fertilizante"     },
  defensivo:       { bg: "#FCEBEB", cl: "#791F1F", label: "Defensivo"        },
  inoculante:      { bg: "#E6F1FB", cl: "#0C447C", label: "Inoculante"       },
  produto_agricola:{ bg: "#EDE9FC", cl: "#7A5A12", label: "Produto Agrícola" },
  combustivel:     { bg: "#FFF3E0", cl: "#7B4A00", label: "Combustível"      },
  peca:            { bg: "#F1EFE8", cl: "#374151", label: "Peça / Manutenção"},
  material:        { bg: "#E8F5E9", cl: "#1A6B3C", label: "Material"         },
  uso_consumo:     { bg: "#F3E8FF", cl: "#6B21A8", label: "Uso e Consumo"    },
  escritorio:      { bg: "#F0F9FF", cl: "#0369A1", label: "Escritório"       },
  outros:          { bg: "#F1EFE8", cl: "#555",    label: "Outros"           },
};

type Aba = "posicao" | "nf_entrada" | "terceiros" | "movimentacoes" | "relatorios";

// ────────────────────────────────────────────────────────
// Tipos locais para o modal de NF Entrada
// ────────────────────────────────────────────────────────
interface ItemRascunho {
  key: string;
  descricao_produto: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  // Apropriação:
  tipo_apropiacao: NfEntradaItem["tipo_apropiacao"];
  insumo_id: string;
  deposito_id: string;
  bomba_id: string;
  maquina_id: string;
  alerta_preco: boolean;
}

// ── Auto-match helpers ────────────────────────────────────
function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSimilaridade(descXml: string, nomeInsumo: string): number {
  const a = normalizar(descXml);
  const b = normalizar(nomeInsumo);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  // palavra a palavra: quantas palavras do insumo aparecem na descrição XML
  const palavras = b.split(" ").filter(p => p.length > 3);
  if (palavras.length === 0) return 0;
  const matches = palavras.filter(p => a.includes(p)).length;
  return matches / palavras.length;
}

function autoMatchInsumo(desc: string, insumos: Insumo[]): Insumo | null {
  let melhor: Insumo | null = null;
  let melhorScore = 0.5; // limiar mínimo
  for (const ins of insumos) {
    const score = scoreSimilaridade(desc, ins.nome);
    if (score > melhorScore) { melhorScore = score; melhor = ins; }
  }
  return melhor;
}

function parsearXmlNfe(xml: string): { numero: string; serie: string; chave: string; emitente: string; cnpj: string; data: string; valor: number; itens: Omit<ItemRascunho, "tipo_apropiacao"|"insumo_id"|"deposito_id"|"bomba_id"|"maquina_id"|"alerta_preco">[] } | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const get = (tag: string) => doc.querySelector(tag)?.textContent ?? "";
    const numero   = get("nNF");
    const serie    = get("serie");
    const chave    = get("chNFe");
    const emitente = get("emit xNome") || get("xNome");
    const cnpj     = get("emit CNPJ") || get("CNPJ");
    const data     = get("dhEmi").substring(0, 10) || get("dEmi");
    const valor    = parseFloat(get("vNF")) || 0;

    const dets = doc.querySelectorAll("det");
    const itens: ItemRascunho[] = [];
    dets.forEach(det => {
      const prod = det.querySelector("prod");
      if (!prod) return;
      const qtd   = parseFloat(prod.querySelector("qCom")?.textContent ?? "0");
      const vUni  = parseFloat(prod.querySelector("vUnCom")?.textContent ?? "0");
      const cfop  = prod.querySelector("CFOP")?.textContent ?? "";
      // Auto-detecta tipo de apropriação pelo CFOP
      let tipo_apropiacao: NfEntradaItem["tipo_apropiacao"] = "estoque";
      if (cfop === "1922" || cfop === "2922") tipo_apropiacao = "vef";
      else if (cfop === "1116" || cfop === "1117" || cfop === "2116" || cfop === "2117") tipo_apropiacao = "remessa";
      itens.push({
        key: crypto.randomUUID(),
        descricao_produto: prod.querySelector("xProd")?.textContent ?? "",
        ncm:    prod.querySelector("NCM")?.textContent  ?? "",
        cfop,
        unidade: prod.querySelector("uCom")?.textContent ?? "",
        quantidade:    qtd,
        valor_unitario: vUni,
        valor_total:    parseFloat(prod.querySelector("vProd")?.textContent ?? "0"),
        tipo_apropiacao,
        insumo_id: "", deposito_id: "", bomba_id: "", maquina_id: "", alerta_preco: false,
      });
    });

    return { numero, serie, chave, emitente, cnpj, data, valor, itens };
  } catch { return null; }
}

// ────────────────────────────────────────────────────────
// PÁGINA
// ────────────────────────────────────────────────────────
export default function Estoque() {
  const { fazendaId } = useAuth();

  const [aba, setAba] = useState<Aba>("posicao");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // dados
  const [insumos, setInsumos]       = useState<Insumo[]>([]);
  const [movs, setMovs]             = useState<MovimentacaoEstoque[]>([]);
  const [depositos, setDepositos]   = useState<Deposito[]>([]);
  const [_bombas, setBombas]        = useState<BombaCombustivel[]>([]);
  const [maquinas, setMaquinas]     = useState<Maquina[]>([]);
  const [nfEntradas, setNfEntradas] = useState<NfEntrada[]>([]);
  const [terceiros, setTerceiros]   = useState<EstoqueTerceiro[]>([]);

  // filtros posição
  const [filtroCat, setFiltroCat] = useState<"todos" | Insumo["categoria"] | "alertas" | "negativos" | "produtos">("todos");
  const [busca, setBusca]         = useState("");

  // filtro movimentações
  const [filtroMov, setFiltroMov] = useState<"todos"|"entrada"|"saida">("todos");

  // modal novo insumo/produto
  const [modalInsumo, setModalInsumo] = useState(false);
  const [fIns, setFIns] = useState({ nome: "", categoria: "defensivo" as Insumo["categoria"], unidade: "L" as string, fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", deposito_id: "", lote: "", validade: "" });

  // modal movimentação manual
  const [modalMov, setModalMov]   = useState(false);
  const [fMov, setFMov]           = useState({ insumo_id: "", tipo: "entrada" as "entrada"|"saida"|"ajuste", motivo: "compra" as MovimentacaoEstoque["motivo"], quantidade: "0", quantidade_nova: "0", deposito_id: "", data: new Date().toISOString().slice(0,10), observacao: "" });

  // relatórios
  const [relTipo, setRelTipo]     = useState<"historico"|"saldos"|"posicao"|"kardex">("saldos");
  const [relInsumoId, setRelInsumoId] = useState("");
  const [relDataInicio, setRelDataInicio] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10); });
  const [relMovs, setRelMovs]     = useState<MovimentacaoEstoque[]>([]);
  // kardex
  const [kardexInicio, setKardexInicio] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [kardexFim, setKardexFim]       = useState(() => new Date().toISOString().slice(0,10));
  const [kardexCat, setKardexCat]       = useState<"todos" | Insumo["categoria"]>("todos");
  const [kardexInsumoId, setKardexInsumoId] = useState("");
  const [kardexMovs, setKardexMovs]     = useState<MovimentacaoEstoque[]>([]);
  const [kardexBuscando, setKardexBuscando] = useState(false);

  // modal NF Entrada — passo 1: dados da NF / passo 2: itens
  const [modalNf, setModalNf] = useState<"off" | "passo1" | "passo2">("off");
  const [nfMode, setNfMode]   = useState<"xml" | "manual">("manual");
  const [fNf, setFNf] = useState({ numero: "", serie: "1", chave_acesso: "", emitente_nome: "", emitente_cnpj: "", data_emissao: "", valor_total: "0", natureza: "", observacao: "" });
  const [itensNf, setItensNf] = useState<ItemRascunho[]>([]);
  const [nfCriada, setNfCriada] = useState<NfEntrada | null>(null);

  // modal detalhes NF (ver itens de uma NF já salva)
  const [modalDetalheNf, setModalDetalheNf] = useState<NfEntrada | null>(null);
  const [itensDetalhe, setItensDetalhe]     = useState<NfEntradaItem[]>([]);

  // pessoas (para auto-link fornecedor no XML)
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [xmlFeedback, setXmlFeedback] = useState<{
    fornecedor: "encontrado" | "novo" | null;
    fornecedorNome: string;
    itensMatched: number;
    itensTotal: number;
  } | null>(null);

  const xmlRef = useRef<HTMLInputElement>(null);

  // ── Carregar dados ──
  useEffect(() => {
    if (!fazendaId) return;
    setErro(null);
    listarInsumos(fazendaId).then(setInsumos).catch(e => setErro(e.message));
    listarDepositos(fazendaId).then(setDepositos).catch(() => {});
    listarBombas(fazendaId).then(setBombas).catch(() => {});
    listarMaquinas(fazendaId).then(setMaquinas).catch(() => {});
    listarPessoas(fazendaId).then(setPessoas).catch(() => {});
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    if (aba === "movimentacoes") listarMovimentacoes(fazendaId).then(setMovs).catch(e => setErro(e.message));
    if (aba === "nf_entrada")    listarNfEntradas(fazendaId).then(setNfEntradas).catch(e => setErro(e.message));
    if (aba === "terceiros")     listarEstoqueTerceiros(fazendaId).then(setTerceiros).catch(e => setErro(e.message));
    if (aba === "relatorios" && relTipo === "historico" && relInsumoId) {
      listarMovimentacoes(fazendaId, relInsumoId, relDataInicio).then(setRelMovs).catch(() => {});
    }
  }, [aba, fazendaId]); // eslint-disable-line

  // ── Helpers ──
  async function salvar(fn: () => Promise<void>) {
    try { setSalvando(true); await fn(); } catch (e) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const msg = [err.message, err.details, err.hint].filter(Boolean).join("\n");
      alert(msg || JSON.stringify(e));
    } finally { setSalvando(false); }
  }

  // ── Movimentação manual ──
  const salvarMovimentacaoManual = () => salvar(async () => {
    if (!fMov.insumo_id || !fMov.data) { alert("Selecione o item e a data."); return; }
    const qtd = parseFloat(fMov.quantidade) || 0;
    const qtdNova = parseFloat(fMov.quantidade_nova) || 0;
    if (fMov.tipo !== "ajuste" && qtd <= 0) { alert("Quantidade deve ser maior que zero."); return; }
    await criarMovimentacaoManual(
      fazendaId!, fMov.insumo_id, fMov.tipo, fMov.motivo,
      qtd, fMov.deposito_id || undefined, fMov.data, fMov.observacao || undefined,
      fMov.tipo === "ajuste" ? qtdNova : undefined,
    );
    const [ins, movs] = await Promise.all([listarInsumos(fazendaId!), listarMovimentacoes(fazendaId!)]);
    setInsumos(ins); setMovs(movs);
    setModalMov(false);
    setFMov({ insumo_id: "", tipo: "entrada", motivo: "compra", quantidade: "0", quantidade_nova: "0", deposito_id: "", data: new Date().toISOString().slice(0,10), observacao: "" });
  });

  // ── Relatório histórico ──
  const buscarHistorico = () => {
    if (!fazendaId || !relInsumoId) return;
    listarMovimentacoes(fazendaId, relInsumoId, relDataInicio).then(setRelMovs).catch(() => {});
  };

  const buscarKardex = async () => {
    if (!fazendaId) return;
    setKardexBuscando(true);
    try {
      const movs = await listarMovimentacoes(fazendaId, kardexInsumoId || undefined, kardexInicio, kardexFim);
      setKardexMovs(movs);
    } catch { /* ignore */ }
    setKardexBuscando(false);
  };

  // ── Novo insumo ──
  const salvarInsumo = () => salvar(async () => {
    if (!fIns.nome.trim()) return;
    const cat = fIns.categoria as Insumo["categoria"];
    const tipoItem: Insumo["tipo"] = ["peca","material","uso_consumo","escritorio"].includes(cat) ? "produto" : "insumo";
    const payload: Omit<Insumo, "id"|"created_at"> = {
      fazenda_id: fazendaId!, tipo: tipoItem, nome: fIns.nome.trim(), categoria: cat, unidade: fIns.unidade as Insumo["unidade"],
      fabricante: fIns.fabricante || undefined, estoque: Number(fIns.estoque) || 0,
      estoque_minimo: Number(fIns.estoque_minimo) || 0, valor_unitario: Number(fIns.valor_unitario.replace(",",".")) || 0,
      deposito_id: fIns.deposito_id || undefined,
      lote: fIns.lote || undefined, validade: fIns.validade || undefined,
    };
    const novo = await criarInsumo(payload);
    setInsumos(p => [...p, novo]);
    setModalInsumo(false);
  });

  // ── NF Passo 1: criar NF ──
  const abrirNovaFf = () => {
    setFNf({ numero: "", serie: "1", chave_acesso: "", emitente_nome: "", emitente_cnpj: "", data_emissao: "", valor_total: "0", natureza: "", observacao: "" });
    setItensNf([]);
    setNfCriada(null);
    setNfMode("manual");
    setXmlFeedback(null);
    setModalNf("passo1");
  };

  const lerXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const xml = ev.target?.result as string;
      const parsed = parsearXmlNfe(xml);
      if (!parsed) { alert("Não foi possível ler o XML da NF-e. Verifique o arquivo."); return; }

      // ── Auto-link fornecedor por CNPJ ──────────────────
      const cnpjLimpo = parsed.cnpj.replace(/\D/g, "");
      const pessoaExistente = pessoas.find(p =>
        (p.cpf_cnpj ?? "").replace(/\D/g, "") === cnpjLimpo && cnpjLimpo.length > 0
      );

      // ── Auto-match itens por descrição ──────────────────
      let matched = 0;
      const itensComMatch: ItemRascunho[] = parsed.itens.map(item => {
        const insumoMatch = autoMatchInsumo(item.descricao_produto, insumos);
        if (insumoMatch) matched++;
        return {
          ...item,                           // preserva tipo_apropiacao detectado pelo CFOP
          insumo_id: insumoMatch?.id ?? "",
          deposito_id: "", bomba_id: "", maquina_id: "",
          alerta_preco: false,
        } as ItemRascunho;
      });

      setFNf({
        numero: parsed.numero, serie: parsed.serie, chave_acesso: parsed.chave,
        emitente_nome: parsed.emitente, emitente_cnpj: parsed.cnpj,
        data_emissao: parsed.data, valor_total: String(parsed.valor),
        natureza: "", observacao: "",
      });
      setItensNf(itensComMatch);
      setXmlFeedback({
        fornecedor: pessoaExistente ? "encontrado" : (parsed.cnpj ? "novo" : null),
        fornecedorNome: parsed.emitente,
        itensMatched: matched,
        itensTotal: parsed.itens.length,
      });
    };
    reader.readAsText(file, "UTF-8");
  };

  const avancarPasso2 = () => salvar(async () => {
    if (!fNf.numero.trim() || !fNf.emitente_nome.trim() || !fNf.data_emissao) { alert("Preencha número, emitente e data."); return; }

    // ── Auto-criar fornecedor se não existir ───────────────
    const cnpjLimpo = (fNf.emitente_cnpj ?? "").replace(/\D/g, "");
    const pessoaExistente = cnpjLimpo
      ? pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === cnpjLimpo)
      : null;
    if (!pessoaExistente && fNf.emitente_nome.trim() && cnpjLimpo) {
      try {
        const nova = await criarPessoa({
          fazenda_id: fazendaId!, nome: fNf.emitente_nome.trim(),
          tipo: cnpjLimpo.length === 14 ? "pj" : "pf",
          fornecedor: true, cliente: false,
          cpf_cnpj: fNf.emitente_cnpj || undefined,
        });
        setPessoas(p => [...p, nova]);
      } catch { /* não bloqueia */ }
    }

    const nf = await criarNfEntrada({
      fazenda_id: fazendaId!, numero: fNf.numero.trim(), serie: fNf.serie,
      chave_acesso: fNf.chave_acesso || undefined, emitente_nome: fNf.emitente_nome.trim(),
      emitente_cnpj: fNf.emitente_cnpj || undefined, data_emissao: fNf.data_emissao,
      data_entrada: new Date().toISOString().slice(0,10),
      valor_total: parseFloat(fNf.valor_total.replace(",",".")) || 0,
      natureza: fNf.natureza || undefined, observacao: fNf.observacao || undefined,
      status: "pendente",
    });
    setNfCriada(nf);
    if (itensNf.length === 0) {
      setItensNf([{ key: crypto.randomUUID(), descricao_produto: "", ncm: "", cfop: "1102", unidade: "UN", quantidade: 1, valor_unitario: 0, valor_total: 0, tipo_apropiacao: "estoque", insumo_id: "", deposito_id: "", bomba_id: "", maquina_id: "", alerta_preco: false }]);
    }
    setModalNf("passo2");
  });

  const adicionarItemNf = () => setItensNf(p => [...p, { key: crypto.randomUUID(), descricao_produto: "", ncm: "", cfop: "1102", unidade: "UN", quantidade: 1, valor_unitario: 0, valor_total: 0, tipo_apropiacao: "estoque", insumo_id: "", deposito_id: "", bomba_id: "", maquina_id: "", alerta_preco: false }]);

  const atualizarItem = (key: string, patch: Partial<ItemRascunho>) => {
    setItensNf(p => p.map(i => {
      if (i.key !== key) return i;
      const upd = { ...i, ...patch };
      if ("quantidade" in patch || "valor_unitario" in patch) {
        upd.valor_total = upd.quantidade * upd.valor_unitario;
      }
      // alerta de preço: novo preço difere >10% do custo médio atual
      if ("insumo_id" in patch || "valor_unitario" in patch) {
        const ins = insumos.find(x => x.id === upd.insumo_id);
        if (ins && ins.valor_unitario > 0 && upd.valor_unitario > 0) {
          const diff = Math.abs(upd.valor_unitario - ins.valor_unitario) / ins.valor_unitario;
          upd.alerta_preco = diff > 0.10;
        }
      }
      return upd;
    }));
  };

  const processarNf = () => salvar(async () => {
    if (!nfCriada) return;
    // Criar itens no banco
    for (const item of itensNf) {
      if (!item.descricao_produto.trim()) continue;
      await criarNfEntradaItem({
        nf_entrada_id: nfCriada.id, fazenda_id: fazendaId!,
        insumo_id: item.insumo_id || undefined, deposito_id: item.deposito_id || undefined,
        bomba_id: item.bomba_id || undefined, maquina_id: item.maquina_id || undefined,
        descricao_produto: item.descricao_produto, ncm: item.ncm || undefined,
        cfop: item.cfop || undefined, unidade: item.unidade, quantidade: item.quantidade,
        valor_unitario: item.valor_unitario, valor_total: item.valor_total,
        tipo_apropiacao: item.tipo_apropiacao, alerta_preco: item.alerta_preco,
      });
    }
    // Buscar itens salvos (com id completo) e processar
    const itensSalvos = await listarNfEntradaItens(nfCriada.id);
    await processarNfEntrada(
      nfCriada.id, fazendaId!,
      itensSalvos,
      parseFloat(fNf.valor_total.replace(",",".")) || 0,
      fNf.emitente_nome, fNf.data_emissao,
      fNf.emitente_cnpj || undefined,
    );
    // Recarregar
    const [nfs, ins] = await Promise.all([listarNfEntradas(fazendaId!), listarInsumos(fazendaId!)]);
    setNfEntradas(nfs);
    setInsumos(ins);
    setModalNf("off");
  });

  const verDetalheNf = async (nf: NfEntrada) => {
    setModalDetalheNf(nf);
    const itens = await listarNfEntradaItens(nf.id).catch(() => []);
    setItensDetalhe(itens);
  };

  // ── Dados filtrados ──
  const insumosFiltrados = insumos.filter(i => {
    if (busca && !i.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroCat === "alertas")  return i.estoque <= i.estoque_minimo;
    if (filtroCat === "negativos") return i.estoque < 0;
    if (filtroCat === "produtos")  return i.tipo === "produto";
    if (filtroCat !== "todos")    return i.categoria === filtroCat;
    return true;
  });

  const totalValorEstoque = insumos.reduce((s, i) => s + i.estoque * i.valor_unitario, 0);
  const alertas   = insumos.filter(i => i.estoque <= i.estoque_minimo);
  const negativos = insumos.filter(i => i.estoque < 0);

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexDirection: "row", gap: 0 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Estoque</h1>
              <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Insumos, produtos, NF de entrada e movimentações</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {negativos.length > 0 && <span style={{ fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "4px 10px", borderRadius: 8, fontWeight: 600 }}>⛔ {negativos.length} saldo negativo</span>}
              {alertas.length > 0 && <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "4px 10px", borderRadius: 8, fontWeight: 600 }}>⚠ {alertas.length} no mínimo</span>}
              <span style={{ fontSize: 12, color: "#555" }}>Valor: <strong style={{ color: "#1a1a1a" }}>{fmtBRL(totalValorEstoque)}</strong></span>
            </div>
          </div>
        </header>

        {/* Abas — scroll horizontal no mobile */}
        <div style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", display: "flex", padding: "0 22px", overflowX: "auto", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch" }}>
          {([ ["posicao","Posição"], ["nf_entrada","NF Entrada"], ["terceiros","Terceiros"], ["movimentacoes","Movimentações"], ["relatorios","Relatórios"] ] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ padding: "11px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: aba === k ? 600 : 400, color: aba === k ? "#1a1a1a" : "#555", borderBottom: aba === k ? "2px solid #1A4870" : "2px solid transparent", flexShrink: 0 }}>{l}</button>
          ))}
        </div>

        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto" }}>
          {erro && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>⚠ {erro}</div>}

          {/* ══ POSIÇÃO DE ESTOQUE ══ */}
          {aba === "posicao" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexDirection: "row", flexWrap: "wrap" }}>
                <input style={{ ...inp, width: 220 }} placeholder="Buscar…" value={busca} onChange={e => setBusca(e.target.value)} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {([
                    ["todos","Todos"],
                    ["semente","Semente"],["fertilizante","Fertilizante"],["defensivo","Defensivo"],["inoculante","Inoculante"],["combustivel","Combustível"],
                    ["produtos","Produtos Gerais"],
                    ["alertas","⚠ Mínimo"],["negativos","⛔ Negativos"],
                  ] as [string,string][]).map(([k,l]) => {
                    const isAlert = k === "alertas" || k === "negativos";
                    const ativo = filtroCat === k;
                    return <button key={k} onClick={() => setFiltroCat(k as typeof filtroCat)} style={{ padding: "6px 12px", border: "0.5px solid", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: ativo ? 600 : 400, background: ativo ? (isAlert ? "#FCEBEB" : "#D5E8F5") : "#fff", color: ativo ? (isAlert ? "#791F1F" : "#0B2D50") : "#666", borderColor: ativo ? (isAlert ? "#E24B4A50" : "#1A487040") : "#D4DCE8" }}>{l}</button>;
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button style={{ ...btnE, borderColor: "#C9921B50", color: "#C9921B", background: "#FBF3E0" }} onClick={() => { setModalMov(true); }}>± Movimentar</button>
                  <button style={{ ...btnV }} onClick={() => { setFIns({ nome: "", categoria: "defensivo", unidade: "L", fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", deposito_id: "", lote: "", validade: "" }); setModalInsumo(true); }}>+ Novo Item</button>
                </div>
              </div>

              <div style={{ overflowX: "auto", background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Item", "Tipo / Categoria", "Depósito", "Estoque atual", "Estoque mín.", "Custo médio", "Valor total", ""]} />
                  <tbody>
                    {insumosFiltrados.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum item encontrado</td></tr>}
                    {insumosFiltrados.map((ins, i) => {
                      const negativo = ins.estoque < 0;
                      const alerta   = !negativo && ins.estoque <= ins.estoque_minimo;
                      const cat      = CAT_META[ins.categoria] ?? { bg: "#F1EFE8", cl: "#555", label: ins.categoria };
                      const dep      = depositos.find(d => d.id === ins.deposito_id);
                      const valorTotal = ins.estoque * ins.valor_unitario;
                      return (
                        <tr key={ins.id} style={{ borderBottom: i < insumosFiltrados.length - 1 ? "0.5px solid #DEE5EE" : "none", background: negativo ? "#FFF5F5" : alerta ? "#FFFAF8" : "transparent" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{ins.nome}</div>
                            {ins.fabricante && <div style={{ fontSize: 11, color: "#444" }}>{ins.fabricante}</div>}
                            {(ins.lote || ins.validade) && <div style={{ fontSize: 10, color: "#888" }}>{ins.lote ? `Lote: ${ins.lote}` : ""}{ins.lote && ins.validade ? " · " : ""}{ins.validade ? `Val: ${ins.validade.split("-").reverse().join("/")}` : ""}</div>}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            {badge(ins.tipo === "produto" ? "Produto" : "Insumo", ins.tipo === "produto" ? "#F0F9FF" : "#E8F5E9", ins.tipo === "produto" ? "#0369A1" : "#1A6B3C")}
                            <div style={{ marginTop: 4 }}>{badge(cat.label, cat.bg, cat.cl)}</div>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{dep?.nome ?? "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                              <span style={{ fontWeight: 600, color: negativo ? "#E24B4A" : alerta ? "#EF9F27" : "#1a1a1a" }}>{fmtNum(ins.estoque)}</span>
                              <span style={{ fontSize: 11, color: "#555" }}>{ins.unidade}</span>
                              {negativo && <span style={{ fontSize: 10, background: "#FCEBEB", color: "#791F1F", padding: "1px 5px", borderRadius: 5, fontWeight: 600 }}>NEG</span>}
                              {alerta && <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 5, fontWeight: 600 }}>MIN</span>}
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtNum(ins.estoque_minimo)} {ins.unidade}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtBRL(ins.valor_unitario)}/{ins.unidade}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: negativo ? "#E24B4A" : "#1a1a1a", fontWeight: 600 }}>{fmtBRL(valorTotal)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <button style={btnE} onClick={() => { setFMov(p => ({ ...p, insumo_id: ins.id, deposito_id: ins.deposito_id ?? "" })); setModalMov(true); }}>± Mov.</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ NF ENTRADA ══ */}
          {aba === "nf_entrada" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button style={btnV} onClick={abrirNovaFf}>+ Lançar NF de Entrada</button>
              </div>
              <div style={{ overflowX: "auto", background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["NF / Série", "Emitente", "Data Emissão", "Valor Total", "Status", "Natureza", ""]} />
                  <tbody>
                    {nfEntradas.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma NF de entrada lançada</td></tr>}
                    {nfEntradas.map((nf, i) => {
                      const corStatus: Record<NfEntrada["status"], [string,string]> = {
                        digitando:  ["#FFF3E0","#7B4A00"],
                        pendente:   ["#FAEEDA","#633806"],
                        processada: ["#D5E8F5","#0B2D50"],
                        cancelada:  ["#FCEBEB","#791F1F"],
                      };
                      const [bg, cl] = corStatus[nf.status];
                      return (
                        <tr key={nf.id} style={{ borderBottom: i < nfEntradas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ color: "#1a1a1a", fontWeight: 600 }}>NF {nf.numero}</div>
                            <div style={{ fontSize: 11, color: "#444" }}>Série {nf.serie}</div>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 500 }}>{nf.emitente_nome}</div>
                            {nf.emitente_cnpj && <div style={{ fontSize: 11, color: "#444" }}>{nf.emitente_cnpj}</div>}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{nf.data_emissao.split("-").reverse().join("/")}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{fmtBRL(nf.valor_total)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(nf.status.charAt(0).toUpperCase()+nf.status.slice(1), bg, cl)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{nf.natureza || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <button style={btnE} onClick={() => verDetalheNf(nf)}>Ver itens</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ ESTOQUE TERCEIROS ══ */}
          {aba === "terceiros" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Estoque de Terceiros</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Insumos entregues por terceiros para uso futuro — controle de saldo e consumo</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Descrição", "Terceiro", "Qtd. Original", "Saldo atual", "Status", "Safra", ""]} />
                  <tbody>
                    {terceiros.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum estoque de terceiros registrado</td></tr>}
                    {terceiros.map((t, i) => {
                      const pct = t.quantidade_original > 0 ? (t.quantidade_saldo / t.quantidade_original) * 100 : 0;
                      const corStatus: Record<EstoqueTerceiro["status"], [string,string]> = {
                        aberto:    ["#D5E8F5","#0B2D50"],
                        parcial:   ["#FAEEDA","#633806"],
                        encerrado: ["#F1EFE8","#555"],
                      };
                      const [bg, cl] = corStatus[t.status];
                      const insumo = insumos.find(x => x.id === t.insumo_id);
                      return (
                        <tr key={t.id} style={{ borderBottom: i < terceiros.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{t.descricao}</div>
                            {insumo && <div style={{ fontSize: 11, color: "#444" }}>{insumo.nome} — {insumo.unidade}</div>}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 500 }}>{t.terceiro_nome}</div>
                            {t.terceiro_cnpj && <div style={{ fontSize: 11, color: "#444" }}>{t.terceiro_cnpj}</div>}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtNum(t.quantidade_original)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <div style={{ fontWeight: 600, color: pct < 20 ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(t.quantidade_saldo)}</div>
                            <div style={{ width: 60, height: 4, background: "#DEE5EE", borderRadius: 2, margin: "3px auto 0", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: pct < 20 ? "#E24B4A" : "#1A4870", borderRadius: 2 }} />
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(t.status.charAt(0).toUpperCase()+t.status.slice(1), bg, cl)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{t.safra || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <button style={btnE}>Detalhes</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ MOVIMENTAÇÕES ══ */}
          {aba === "movimentacoes" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {([["todos","Todas"],["entrada","Entradas"],["saida","Saídas"]] as const).map(([k,l]) => (
                    <button key={k} onClick={() => setFiltroMov(k)} style={{ padding: "6px 14px", border: "0.5px solid", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: filtroMov === k ? 600 : 400, background: filtroMov === k ? "#D5E8F5" : "#fff", color: filtroMov === k ? "#0B2D50" : "#666", borderColor: filtroMov === k ? "#1A487040" : "#D4DCE8" }}>{l}</button>
                  ))}
                </div>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>{movs.filter(m => filtroMov === "todos" || m.tipo === filtroMov).length} registros</span>
                <button style={{ ...btnE, borderColor: "#C9921B50", color: "#C9921B", background: "#FBF3E0" }} onClick={() => setModalMov(true)}>± Nova Movimentação</button>
              </div>
              <div style={{ overflowX: "auto", background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Data", "Item", "Tipo", "Motivo", "Qtd.", "Depósito", "Origem"]} />
                  <tbody>
                    {movs.filter(m => filtroMov === "todos" || m.tipo === filtroMov).length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma movimentação registrada</td></tr>
                    )}
                    {movs.filter(m => filtroMov === "todos" || m.tipo === filtroMov).map((m, i, arr) => {
                      const ins = insumos.find(x => x.id === m.insumo_id);
                      const dep = depositos.find(x => x.id === m.deposito_id);
                      const MOTIVO_LABEL: Record<string, string> = { compra: "Compra", ajuste_saldo: "Ajuste saldo", baixa_uso: "Baixa uso", baixa_perda: "Baixa perda", transferencia: "Transferência", inventario: "Inventário", outros: "Outros" };
                      const isAdj = m.tipo === "ajuste";
                      return (
                        <tr key={m.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid #DEE5EE" : "none", background: isAdj ? "#FFFDF5" : undefined }}>
                          <td style={{ padding: "10px 14px", color: "#1a1a1a", whiteSpace: "nowrap" }}>{m.data.split("-").reverse().join("/")}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{ins?.nome ?? "—"}</div>
                            {ins && <div style={{ fontSize: 11, color: "#444" }}>{CAT_META[ins.categoria]?.label ?? ins.categoria}</div>}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            {isAdj
                              ? badge("⚙ Ajuste","#FBF3E0","#7A5A12")
                              : m.tipo === "entrada" ? badge("▲ Entrada","#D5E8F5","#0B2D50") : badge("▼ Saída","#FCEBEB","#791F1F")}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{m.motivo ? MOTIVO_LABEL[m.motivo] ?? m.motivo : "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>
                            {isAdj
                              ? <span style={{ color: m.quantidade >= 0 ? "#1A4870" : "#E24B4A" }}>{m.quantidade >= 0 ? "+" : ""}{fmtNum(m.quantidade)} {ins?.unidade} <span style={{ fontSize: 10, color: "#C9921B", fontWeight: 400 }}>(ajuste)</span></span>
                              : <span style={{ color: m.tipo === "entrada" ? "#1A4870" : "#E24B4A" }}>{m.tipo === "entrada" ? "+" : "-"}{fmtNum(m.quantidade)} {ins?.unidade}</span>}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{dep?.nome ?? "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            {m.auto ? badge("Auto","#D5E8F5","#0B2D50") : badge("Manual","#FBF0D8","#7A5A12")}
                            {m.observacao && (
                              <div style={{ fontSize: 11, color: isAdj ? "#7A5A12" : "#888", marginTop: 3, maxWidth: 180, whiteSpace: "normal", textAlign: "left" }}>
                                {isAdj && <span style={{ fontWeight: 600 }}>Justificativa: </span>}
                                {m.observacao}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ RELATÓRIOS ══ */}
          {aba === "relatorios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Sub-abas — scroll horizontal no mobile */}
              <div style={{ display: "flex", gap: 0, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", overflowX: "auto", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch", width: "fit-content", maxWidth: "100%" }}>
                {([["kardex","Movimentação por Produto"],["historico","Histórico por Item"],["saldos","Saldos de Estoque"],["posicao","Posição Financeira"]] as [typeof relTipo, string][]).map(([k,l]) => (
                  <button key={k} onClick={() => setRelTipo(k)} style={{ padding: "8px 20px", border: "none", background: relTipo === k ? "#1A4870" : "transparent", color: relTipo === k ? "#fff" : "#666", fontWeight: relTipo === k ? 600 : 400, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>{l}</button>
                ))}
              </div>

              {/* ── Movimentação por Produto (Kardex) ── */}
              {relTipo === "kardex" && (() => {
                // Filtrar movs por categoria e produto selecionado
                const insumosFiltrados = insumos.filter(ins =>
                  (kardexCat === "todos" || ins.categoria === kardexCat) &&
                  (!kardexInsumoId || ins.id === kardexInsumoId)
                );
                const insIds = new Set(insumosFiltrados.map(i => i.id));
                const movsFiltr = kardexMovs.filter(m => insIds.has(m.insumo_id));

                // Agrupar por produto
                type KardexRow = { insumo: Insumo; movs: (MovimentacaoEstoque & { saldo: number })[]; totalE: number; totalS: number; saldoFinal: number; saldoInicial: number };
                const grupos: KardexRow[] = insumosFiltrados
                  .map(ins => {
                    const mIns = movsFiltr.filter(m => m.insumo_id === ins.id).slice().reverse(); // cronológico
                    let saldoFinalCalc = ins.estoque;
                    const totalE = movsFiltr.filter(m => m.insumo_id === ins.id && m.tipo === "entrada").reduce((s, m) => s + m.quantidade, 0);
                    const totalS = movsFiltr.filter(m => m.insumo_id === ins.id && m.tipo === "saida").reduce((s, m) => s + m.quantidade, 0);
                    // ajustes são registados como delta absoluto; precisamos do net para calcular saldo inicial
                    // ajuste armazena delta assinado (positivo=aumento, negativo=redução)
                    const totalAjNeto = movsFiltr.filter(m => m.insumo_id === ins.id && m.tipo === "ajuste").reduce((s, m) => s + m.quantidade, 0);
                    // saldo inicial = saldo atual - entradas - ajustes + saidas
                    const saldoInicialCalc = saldoFinalCalc - totalE - totalAjNeto + totalS;
                    let running = saldoInicialCalc;
                    const rows = mIns.map(m => {
                      if (m.tipo === "ajuste") {
                        running += m.quantidade; // delta assinado
                      } else {
                        running += m.tipo === "entrada" ? m.quantidade : -m.quantidade;
                      }
                      return { ...m, saldo: running };
                    });
                    saldoFinalCalc = running;
                    return { insumo: ins, movs: rows, totalE, totalS, saldoFinal: saldoFinalCalc, saldoInicial: saldoInicialCalc };
                  })
                  .filter(g => g.movs.length > 0); // só produtos com movimento no período

                const totalEntradas = grupos.reduce((s, g) => s + g.totalE, 0);
                const totalSaidas   = grupos.reduce((s, g) => s + g.totalS, 0);
                const MOTIVO_LABEL: Record<string, string> = { compra: "Compra", ajuste_saldo: "Ajuste", baixa_uso: "Uso", baixa_perda: "Perda", transferencia: "Transfer.", inventario: "Inventário", abastecimento: "Abastecimento", outros: "Outros" };

                return (
                  <div>
                    {/* Filtros */}
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                        <div>
                          <label style={lbl}>Data início *</label>
                          <input style={inp} type="date" value={kardexInicio} onChange={e => setKardexInicio(e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Data fim *</label>
                          <input style={inp} type="date" value={kardexFim} onChange={e => setKardexFim(e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Categoria</label>
                          <select style={inp} value={kardexCat} onChange={e => setKardexCat(e.target.value as typeof kardexCat)}>
                            <option value="todos">Todas</option>
                            {Object.entries(CAT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Produto (opcional)</label>
                          <select style={inp} value={kardexInsumoId} onChange={e => setKardexInsumoId(e.target.value)}>
                            <option value="">Todos</option>
                            {insumos.filter(i => kardexCat === "todos" || i.categoria === kardexCat).map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                          </select>
                        </div>
                        <div>
                          <button onClick={buscarKardex} disabled={kardexBuscando} style={{ ...btnV, whiteSpace: "nowrap", opacity: kardexBuscando ? 0.6 : 1 }}>
                            {kardexBuscando ? "Buscando…" : "Buscar"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {kardexMovs.length === 0 && !kardexBuscando && (
                      <div style={{ textAlign: "center", padding: "48px 0", color: "#888", background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8" }}>
                        Selecione o período e clique em Buscar para gerar o relatório.
                      </div>
                    )}

                    {grupos.length > 0 && (
                      <div>
                        {/* KPIs */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                          {[
                            ["Produtos com movimento", String(grupos.length), "#1A4870", "#D5E8F5"],
                            ["Total de movimentações", String(movsFiltr.length), "#1A6B3C", "#E8F5E9"],
                            ["Total de entradas", grupos.reduce((s,g) => s + g.totalE, 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }), "#1A6B3C", "#E8F5E9"],
                            ["Total de saídas", grupos.reduce((s,g) => s + g.totalS, 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }), "#791F1F", "#FCEBEB"],
                          ].map(([l, v, cl, bg]) => (
                            <div key={l} style={{ background: bg, border: `0.5px solid ${cl}30`, borderRadius: 10, padding: "12px 16px" }}>
                              <div style={{ fontSize: 11, color: cl, marginBottom: 2 }}>{l}</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: cl }}>{v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Cabeçalho da impressão */}
                        <div style={{ display: "none" }} className="print-area">
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>Relatório de Movimentação de Estoque por Produto</div>
                            <div style={{ fontSize: 12, color: "#555" }}>Período: {kardexInicio.split("-").reverse().join("/")} a {kardexFim.split("-").reverse().join("/")} · Gerado em {new Date().toLocaleDateString("pt-BR")}</div>
                          </div>
                        </div>

                        {/* Botão imprimir */}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }} className="no-print">
                          <button onClick={() => window.print()} style={{ padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#F4F6FA", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            🖨 Imprimir
                          </button>
                        </div>

                        {/* Tabela resumo */}
                        <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
                          <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE", fontWeight: 600, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>Resumo por Produto</span>
                            <span style={{ fontSize: 12, color: "#555", fontWeight: 400 }}>{kardexInicio.split("-").reverse().join("/")} → {kardexFim.split("-").reverse().join("/")}</span>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <TH cols={["Produto", "Categoria", "Unid.", "Saldo Inicial", "Entradas", "Saídas", "Saldo Final"]} />
                              <tbody>
                                {grupos.map((g, i) => {
                                  const cat = CAT_META[g.insumo.categoria] ?? { bg: "#F1EFE8", cl: "#555", label: g.insumo.categoria };
                                  return (
                                    <tr key={g.insumo.id} style={{ borderBottom: i < grupos.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                      <td style={{ padding: "9px 14px", fontWeight: 600, color: "#1a1a1a" }}>{g.insumo.nome}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "center" }}>{badge(cat.label, cat.bg, cat.cl)}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#555", fontSize: 12 }}>{g.insumo.unidade}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#555" }}>{fmtNum(g.saldoInicial)} {g.insumo.unidade}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "#1A4870" }}>+{fmtNum(g.totalE)} {g.insumo.unidade}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "#E24B4A" }}>-{fmtNum(g.totalS)} {g.insumo.unidade}</td>
                                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: g.saldoFinal < 0 ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(g.saldoFinal)} {g.insumo.unidade}</td>
                                    </tr>
                                  );
                                })}
                                <tr style={{ background: "#F8FAFD", borderTop: "1px solid #D4DCE8" }}>
                                  <td colSpan={3} style={{ padding: "9px 14px", fontWeight: 700, color: "#1a1a1a" }}>TOTAL</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "#555" }}>—</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>▲ {fmtNum(totalEntradas)}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, color: "#E24B4A" }}>▼ {fmtNum(totalSaidas)}</td>
                                  <td style={{ padding: "9px 14px" }} />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Detalhe por produto */}
                        {grupos.map(g => {
                          const cat = CAT_META[g.insumo.categoria] ?? { bg: "#F1EFE8", cl: "#555", label: g.insumo.categoria };
                          return (
                            <div key={g.insumo.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                              <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{g.insumo.nome}</span>
                                {badge(cat.label, cat.bg, cat.cl)}
                                <span style={{ fontSize: 12, color: "#555" }}>{g.movs.length} moviment.</span>
                                <span style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 12 }}>
                                  <span>Inicial: <strong>{fmtNum(g.saldoInicial)} {g.insumo.unidade}</strong></span>
                                  <span style={{ color: "#1A4870" }}>+{fmtNum(g.totalE)}</span>
                                  <span style={{ color: "#E24B4A" }}>-{fmtNum(g.totalS)}</span>
                                  <span>Final: <strong style={{ color: g.saldoFinal < 0 ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(g.saldoFinal)} {g.insumo.unidade}</strong></span>
                                </span>
                              </div>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <TH cols={["Data", "Tipo", "Motivo", "Quantidade", "Saldo Acum.", "Depósito", "Obs."]} />
                                  <tbody>
                                    {g.movs.map((m, mi) => {
                                      const dep = depositos.find(d => d.id === m.deposito_id);
                                      const isAdj2 = m.tipo === "ajuste";
                                      return (
                                        <tr key={m.id} style={{ borderBottom: mi < g.movs.length - 1 ? "0.5px solid #EEF1F6" : "none", background: isAdj2 ? "#FFFDF5" : undefined }}>
                                          <td style={{ padding: "8px 14px", whiteSpace: "nowrap", color: "#555" }}>{m.data.split("-").reverse().join("/")}</td>
                                          <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                            {isAdj2 ? badge("⚙ Ajuste","#FBF3E0","#7A5A12") : m.tipo === "entrada" ? badge("▲ Entrada","#D5E8F5","#0B2D50") : badge("▼ Saída","#FCEBEB","#791F1F")}
                                          </td>
                                          <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{MOTIVO_LABEL[m.motivo ?? ""] ?? m.motivo ?? "—"}</td>
                                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: isAdj2 ? (m.quantidade >= 0 ? "#1A4870" : "#E24B4A") : m.tipo === "entrada" ? "#1A4870" : "#E24B4A" }}>
                                            {isAdj2 ? `${m.quantidade >= 0 ? "+" : ""}${fmtNum(m.quantidade)}` : `${m.tipo === "entrada" ? "+" : "-"}${fmtNum(m.quantidade)}`} {g.insumo.unidade}
                                          </td>
                                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: m.saldo < 0 ? "#E24B4A" : "#1a1a1a" }}>
                                            {fmtNum(m.saldo)} {g.insumo.unidade}
                                          </td>
                                          <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{dep?.nome ?? "—"}</td>
                                          <td style={{ padding: "8px 14px", fontSize: 11, color: isAdj2 ? "#7A5A12" : "#888", maxWidth: 180, whiteSpace: "normal" }}>
                                            {m.observacao ? <><strong>{isAdj2 ? "Justificativa: " : ""}</strong><span title={m.observacao}>{m.observacao.slice(0, 60)}{m.observacao.length > 60 ? "…" : ""}</span></> : "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {kardexMovs.length > 0 && grupos.length === 0 && (
                      <div style={{ textAlign: "center", padding: "32px 0", color: "#888", background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8" }}>
                        Nenhum produto com movimentação no período com os filtros selecionados.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Histórico por item */}
              {relTipo === "historico" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
                    <div style={{ gridColumn: "1/3" }}>
                      <label style={lbl}>Item *</label>
                      <select style={inp} value={relInsumoId} onChange={e => setRelInsumoId(e.target.value)}>
                        <option value="">— Selecionar —</option>
                        {insumos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>A partir de</label>
                      <input style={inp} type="date" value={relDataInicio} onChange={e => setRelDataInicio(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button style={{ ...btnV, width: "100%" }} onClick={buscarHistorico}>Buscar</button>
                    </div>
                  </div>
                  {relInsumoId && (() => {
                    const ins = insumos.find(x => x.id === relInsumoId)!;
                    if (!ins) return null;
                    // saldo acumulado do mais antigo ao mais recente
                    const ordered = [...relMovs].reverse();
                    let saldo = 0;
                    const rows = ordered.map(m => {
                      const delta = m.tipo === "entrada" ? m.quantidade : -m.quantidade;
                      saldo += delta;
                      return { ...m, saldo };
                    });
                    return (
                      <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{ins.nome}</span>
                          <span style={{ fontSize: 12, color: "#555" }}>Saldo atual: <strong style={{ color: ins.estoque < 0 ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(ins.estoque)} {ins.unidade}</strong></span>
                          <span style={{ fontSize: 12, color: "#555" }}>{rows.length} movimentações</span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <TH cols={["Data","Tipo","Motivo","Quantidade","Saldo acum.","Depósito","Origem"]} />
                            <tbody>
                              {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#444" }}>Nenhuma movimentação no período</td></tr>}
                              {rows.map((m, i) => {
                                const dep = depositos.find(x => x.id === m.deposito_id);
                                return (
                                  <tr key={m.id} style={{ borderBottom: i < rows.length-1 ? "0.5px solid #DEE5EE" : "none" }}>
                                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>{m.data.split("-").reverse().join("/")}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center" }}>{m.tipo === "entrada" ? badge("▲ Entrada","#D5E8F5","#0B2D50") : badge("▼ Saída","#FCEBEB","#791F1F")}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{m.motivo ?? "—"}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 600, color: m.tipo === "entrada" ? "#1A4870" : "#E24B4A" }}>{m.tipo === "entrada" ? "+" : "-"}{fmtNum(m.quantidade)} {ins.unidade}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 600, color: m.saldo < 0 ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(m.saldo)} {ins.unidade}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{dep?.nome ?? "—"}</td>
                                    <td style={{ padding: "9px 14px", textAlign: "center" }}>{m.auto ? badge("Auto","#D5E8F5","#0B2D50") : badge("Manual","#FBF0D8","#7A5A12")}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Saldos de Estoque */}
              {relTipo === "saldos" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Saldos de Estoque</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{insumos.filter(i => i.estoque !== 0).length} itens com movimento</div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Item","Tipo","Categoria","Depósito","Saldo","Mínimo","Status"]} />
                      <tbody>
                        {insumos.sort((a,b) => a.nome.localeCompare(b.nome)).map((ins, i) => {
                          const negativo = ins.estoque < 0;
                          const alerta   = !negativo && ins.estoque <= ins.estoque_minimo;
                          const dep      = depositos.find(d => d.id === ins.deposito_id);
                          const cat      = CAT_META[ins.categoria] ?? { bg: "#F1EFE8", cl: "#555", label: ins.categoria };
                          return (
                            <tr key={ins.id} style={{ borderBottom: i < insumos.length-1 ? "0.5px solid #DEE5EE" : "none", background: negativo ? "#FFF5F5" : alerta ? "#FFFAF8" : "transparent" }}>
                              <td style={{ padding: "9px 14px", fontWeight: 600, color: "#1a1a1a" }}>{ins.nome}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center" }}>{badge(ins.tipo === "produto" ? "Produto" : "Insumo", ins.tipo === "produto" ? "#F0F9FF" : "#E8F5E9", ins.tipo === "produto" ? "#0369A1" : "#1A6B3C")}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center" }}>{badge(cat.label, cat.bg, cat.cl)}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>{dep?.nome ?? "—"}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 600, color: negativo ? "#E24B4A" : "#1a1a1a" }}>{fmtNum(ins.estoque)} {ins.unidade}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center", color: "#555" }}>{fmtNum(ins.estoque_minimo)} {ins.unidade}</td>
                              <td style={{ padding: "9px 14px", textAlign: "center" }}>
                                {negativo ? badge("Negativo","#FCEBEB","#791F1F") : alerta ? badge("Mínimo","#FAEEDA","#633806") : badge("OK","#D5E8F5","#0B2D50")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Posição Financeira */}
              {relTipo === "posicao" && (() => {
                const porCategoria = Object.entries(
                  insumos.reduce((acc, i) => {
                    const k = CAT_META[i.categoria]?.label ?? i.categoria;
                    acc[k] = (acc[k] ?? 0) + i.estoque * i.valor_unitario;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a,b) => b[1]-a[1]);
                const total = porCategoria.reduce((s,[,v]) => s+v, 0);
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                      {[["Total em Estoque", fmtBRL(total), "#1A4870", "#D5E8F5"],
                        ["Itens cadastrados", String(insumos.length), "#1A6B3C", "#E8F5E9"],
                        ["Alertas (mínimo/neg.)", String(alertas.length + negativos.length), "#791F1F", "#FCEBEB"]
                      ].map(([l,v,cl,bg]) => (
                        <div key={l} style={{ background: bg, border: `0.5px solid ${cl}30`, borderRadius: 10, padding: "14px 18px" }}>
                          <div style={{ fontSize: 11, color: cl, marginBottom: 4 }}>{l}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: cl }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", fontWeight: 600, fontSize: 14 }}>Valor por Categoria</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <TH cols={["Categoria","Qtd. itens","Valor total","% do estoque"]} />
                          <tbody>
                            {porCategoria.map(([cat, valor], i) => {
                              const qtd = insumos.filter(x => (CAT_META[x.categoria]?.label ?? x.categoria) === cat).length;
                              const pct = total > 0 ? (valor/total*100) : 0;
                              return (
                                <tr key={cat} style={{ borderBottom: i < porCategoria.length-1 ? "0.5px solid #DEE5EE" : "none" }}>
                                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a" }}>{cat}</td>
                                  <td style={{ padding: "10px 14px", textAlign: "center", color: "#555" }}>{qtd}</td>
                                  <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1a1a1a" }}>{fmtBRL(valor)}</td>
                                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                                      <div style={{ width: 80, height: 5, background: "#DEE5EE", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: `${pct}%`, background: "#1A4870", borderRadius: 3 }} />
                                      </div>
                                      <span style={{ fontSize: 12, color: "#555", minWidth: 36 }}>{pct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </main>

      {/* ══════ MODAIS ══════ */}

      {/* Modal Movimentação Manual */}
      {modalMov && (() => {
        const ins = insumos.find(x => x.id === fMov.insumo_id);
        const isAjuste = fMov.tipo === "ajuste";
        const obsObrig = isAjuste && !fMov.observacao.trim();
        const canSave = !salvando && !!fMov.insumo_id && !!fMov.data && !obsObrig;
        return (
          <Modal titulo={isAjuste ? "Ajuste de Estoque" : "Movimentação de Estoque"} width={600} onClose={() => setModalMov(false)}>
            {isAjuste && (
              <div style={{ marginBottom: 14, background: "#FBF3E0", border: "0.5px solid #E8C97A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12" }}>
                <strong>Ajuste de Estoque</strong> — use para corrigir inconsistências entre o sistema e a contagem física. O registro fica permanente no extrato para auditoria.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Item *</label>
                <select style={inp} value={fMov.insumo_id} onChange={e => { const i = insumos.find(x => x.id === e.target.value); setFMov(p => ({ ...p, insumo_id: e.target.value, deposito_id: i?.deposito_id ?? "" })); }}>
                  <option value="">— Selecionar —</option>
                  {insumos.map(x => <option key={x.id} value={x.id}>{x.nome} — saldo: {fmtNum(x.estoque)} {x.unidade}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo *</label>
                <select style={inp} value={fMov.tipo} onChange={e => {
                  const tipo = e.target.value as typeof fMov.tipo;
                  const motivo = tipo === "entrada" ? "compra" : tipo === "ajuste" ? "ajuste_saldo" : "baixa_uso";
                  setFMov(p => ({ ...p, tipo, motivo: motivo as typeof p.motivo, observacao: "" }));
                }}>
                  <option value="entrada">Entrada de estoque</option>
                  <option value="saida">Saída de estoque</option>
                  <option value="ajuste">Ajuste de saldo</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Motivo *</label>
                <select style={inp} value={fMov.motivo} onChange={e => setFMov(p => ({ ...p, motivo: e.target.value as typeof p.motivo }))}>
                  {fMov.tipo === "entrada" && <>
                    <option value="compra">Compra</option>
                    <option value="transferencia">Transferência recebida</option>
                    <option value="inventario">Inventário / contagem</option>
                    <option value="outros">Outros</option>
                  </>}
                  {fMov.tipo === "saida" && <>
                    <option value="baixa_uso">Baixa por uso e consumo</option>
                    <option value="baixa_perda">Baixa por perda / vencimento</option>
                    <option value="transferencia">Transferência enviada</option>
                    <option value="outros">Outros</option>
                  </>}
                  {fMov.tipo === "ajuste" && <>
                    <option value="ajuste_saldo">Ajuste de saldo</option>
                    <option value="inventario">Inventário físico</option>
                  </>}
                </select>
              </div>
              {isAjuste ? (
                <div>
                  <label style={lbl}>Novo saldo *{ins ? ` (atual: ${fmtNum(ins.estoque)} ${ins.unidade})` : ""}</label>
                  <input style={inp} type="number" step="0.001" value={fMov.quantidade_nova} onChange={e => setFMov(p => ({ ...p, quantidade_nova: e.target.value }))} />
                </div>
              ) : (
                <div>
                  <label style={lbl}>Quantidade *</label>
                  <input style={inp} type="number" step="0.001" min="0.001" value={fMov.quantidade} onChange={e => setFMov(p => ({ ...p, quantidade: e.target.value }))} />
                </div>
              )}
              <div>
                <label style={lbl}>Depósito</label>
                <select style={inp} value={fMov.deposito_id} onChange={e => setFMov(p => ({ ...p, deposito_id: e.target.value }))}>
                  <option value="">Nenhum</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data *</label>
                <input style={inp} type="date" value={fMov.data} onChange={e => setFMov(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ ...lbl, color: isAjuste ? "#C9921B" : undefined }}>
                  {isAjuste ? "Justificativa do ajuste *" : "Observação"}
                  {isAjuste && <span style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>(obrigatório — ficará no extrato de auditoria)</span>}
                </label>
                <input
                  style={{ ...inp, borderColor: isAjuste && obsObrig && fMov.observacao !== "" ? "#E24B4A" : isAjuste ? "#C9921B50" : undefined, background: isAjuste ? "#FFFDF5" : undefined }}
                  placeholder={isAjuste ? "Ex: Inventário físico realizado em 10/05. Contagem: 120L. Sistema: 135L. Diferença de 15L ajustada." : "Motivo, referência, responsável…"}
                  value={fMov.observacao}
                  onChange={e => setFMov(p => ({ ...p, observacao: e.target.value }))}
                />
              </div>
            </div>
            {ins && !isAjuste && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#555", background: "#F3F6F9", padding: "8px 12px", borderRadius: 7 }}>
                Saldo atual: <strong>{fmtNum(ins.estoque)} {ins.unidade}</strong>
                {" → "}
                <strong style={{ color: fMov.tipo === "entrada" ? "#1A4870" : "#E24B4A" }}>
                  {fmtNum(ins.estoque + (fMov.tipo === "entrada" ? 1 : -1) * (parseFloat(fMov.quantidade)||0))} {ins.unidade}
                </strong>
              </div>
            )}
            {ins && isAjuste && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#555", background: "#FBF3E0", border: "0.5px solid #E8C97A", padding: "10px 14px", borderRadius: 7 }}>
                Saldo atual: <strong>{fmtNum(ins.estoque)} {ins.unidade}</strong>
                {" → "}
                <strong style={{ color: "#C9921B" }}>{fmtNum(parseFloat(fMov.quantidade_nova)||0)} {ins.unidade}</strong>
                {" · delta: "}
                <strong style={{ color: (parseFloat(fMov.quantidade_nova)||0) >= ins.estoque ? "#1A4870" : "#E24B4A" }}>
                  {((parseFloat(fMov.quantidade_nova)||0) >= ins.estoque ? "+" : "")}{((parseFloat(fMov.quantidade_nova)||0) - ins.estoque).toFixed(3)} {ins.unidade}
                </strong>
              </div>
            )}
            {isAjuste && obsObrig && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#E24B4A" }}>A justificativa é obrigatória para ajustes de estoque.</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnR} onClick={() => setModalMov(false)}>Cancelar</button>
              <button
                style={{ ...btnV, background: isAjuste ? "#C9921B" : btnV.background, opacity: canSave ? 1 : 0.5 }}
                disabled={!canSave}
                onClick={salvarMovimentacaoManual}
              >{salvando ? "Salvando…" : isAjuste ? "Registrar Ajuste" : "Registrar Movimentação"}</button>
            </div>
          </Modal>
        );
      })()}

      {/* Modal Novo Insumo / Produto */}
      {modalInsumo && (() => {
        const isProduto = ["peca","material","uso_consumo","escritorio"].includes(fIns.categoria);
        return (
          <Modal titulo={isProduto ? "Novo Produto" : "Novo Insumo"} width={660} onClose={() => setModalInsumo(false)}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} value={fIns.nome} onChange={e => setFIns(p => ({ ...p, nome: e.target.value }))} /></div>
              <div style={{ gridColumn: "1/3" }}>
                <label style={lbl}>Categoria *</label>
                <select style={inp} value={fIns.categoria} onChange={e => setFIns(p => ({ ...p, categoria: e.target.value as Insumo["categoria"] }))}>
                  <optgroup label="── Insumos Agrícolas ──">
                    <option value="semente">Semente</option>
                    <option value="fertilizante">Fertilizante</option>
                    <option value="defensivo">Defensivo</option>
                    <option value="inoculante">Inoculante</option>
                    <option value="produto_agricola">Produto Agrícola</option>
                    <option value="combustivel">Combustível</option>
                  </optgroup>
                  <optgroup label="── Produtos Gerais ──">
                    <option value="peca">Peça / Manutenção</option>
                    <option value="material">Material</option>
                    <option value="uso_consumo">Uso e Consumo</option>
                    <option value="escritorio">Escritório</option>
                  </optgroup>
                  <option value="outros">Outros</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Unidade *</label>
                <select style={inp} value={fIns.unidade} onChange={e => setFIns(p => ({ ...p, unidade: e.target.value }))}>
                  <option value="kg">kg</option>
                  <option value="g">g (grama)</option>
                  <option value="L">L (litro)</option>
                  <option value="mL">mL (mililitro)</option>
                  <option value="sc">sc (saca 60 kg)</option>
                  <option value="t">t (tonelada)</option>
                  <option value="un">un (unidade)</option>
                  <option value="m">m (metro)</option>
                  <option value="m2">m²</option>
                  <option value="cx">cx (caixa)</option>
                  <option value="pc">pc (peça)</option>
                  <option value="par">par</option>
                  <option value="outros">outros</option>
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Depósito padrão</label>
                <select style={inp} value={fIns.deposito_id} onChange={e => setFIns(p => ({ ...p, deposito_id: e.target.value }))}>
                  <option value="">Nenhum</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/3" }}><label style={lbl}>Fabricante / Marca</label><input style={inp} value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} /></div>
              <div><label style={lbl}>Custo médio (R$/unid)</label><input style={inp} type="number" step="0.01" value={fIns.valor_unitario} onChange={e => setFIns(p => ({ ...p, valor_unitario: e.target.value }))} /></div>
              <div><label style={lbl}>Estoque inicial</label><input style={inp} type="number" step="0.001" value={fIns.estoque} onChange={e => setFIns(p => ({ ...p, estoque: e.target.value }))} /></div>
              <div><label style={lbl}>Estoque mínimo</label><input style={inp} type="number" step="0.001" value={fIns.estoque_minimo} onChange={e => setFIns(p => ({ ...p, estoque_minimo: e.target.value }))} /></div>
              <div />
              <div><label style={lbl}>Lote</label><input style={inp} value={fIns.lote} onChange={e => setFIns(p => ({ ...p, lote: e.target.value }))} /></div>
              <div><label style={lbl}>Validade</label><input style={inp} type="date" value={fIns.validade} onChange={e => setFIns(p => ({ ...p, validade: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button style={btnR} onClick={() => setModalInsumo(false)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando || !fIns.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fIns.nome.trim()} onClick={salvarInsumo}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </Modal>
        );
      })()}

      {/* Modal NF Entrada — Passo 1 */}
      {modalNf === "passo1" && (
        <Modal titulo="Lançar NF de Entrada" subtitulo="Passo 1 de 2 — Identificação da NF" width={620} onClose={() => setModalNf("off")}>
          {/* Toggle XML / Manual */}
          <div style={{ display: "flex", gap: 0, marginBottom: 18, background: "#F3F6F9", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
            {([["manual","Manual"] as const, ["xml","Importar XML"] as const]).map(([k,l]) => (
              <button key={k} onClick={() => setNfMode(k)} style={{ padding: "8px 18px", border: "none", background: nfMode === k ? "#1A4870" : "transparent", color: nfMode === k ? "#fff" : "#666", fontWeight: nfMode === k ? 600 : 400, cursor: "pointer", fontSize: 13 }}>{l}</button>
            ))}
          </div>

          {nfMode === "xml" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ background: "#F3F6F9", border: "0.5px dashed #ccc", borderRadius: 8, padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Selecione o arquivo XML da NF-e para preencher automaticamente</div>
                <input ref={xmlRef} type="file" accept=".xml" style={{ display: "none" }} onChange={lerXml} />
                <button style={btnV} onClick={() => { if (xmlRef.current) { xmlRef.current.value = ""; xmlRef.current.click(); } }}>
                  {fNf.numero ? "↺ Trocar XML" : "Selecionar XML"}
                </button>
              </div>

              {/* Feedback de auto-match */}
              {xmlFeedback && fNf.numero && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Fornecedor */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7,
                    background: xmlFeedback.fornecedor === "encontrado" ? "#D4EDDA" : xmlFeedback.fornecedor === "novo" ? "#FBF3E0" : "#F4F6FA",
                    border: `0.5px solid ${xmlFeedback.fornecedor === "encontrado" ? "#28a745" : xmlFeedback.fornecedor === "novo" ? "#C9921B" : "#DDE2EE"}`,
                    fontSize: 12,
                  }}>
                    <span>{xmlFeedback.fornecedor === "encontrado" ? "✓" : xmlFeedback.fornecedor === "novo" ? "＋" : "–"}</span>
                    <span style={{ fontWeight: 600 }}>{xmlFeedback.fornecedorNome}</span>
                    <span style={{ color: "#666" }}>
                      {xmlFeedback.fornecedor === "encontrado" ? "— já cadastrado em Pessoas" :
                       xmlFeedback.fornecedor === "novo"       ? "— será cadastrado automaticamente em Pessoas" :
                                                                 "— CNPJ não identificado"}
                    </span>
                  </div>
                  {/* Itens */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 7,
                    background: xmlFeedback.itensMatched === xmlFeedback.itensTotal ? "#D4EDDA" :
                                xmlFeedback.itensMatched > 0 ? "#FBF3E0" : "#F8D7DA",
                    border: `0.5px solid ${xmlFeedback.itensMatched === xmlFeedback.itensTotal ? "#28a745" :
                             xmlFeedback.itensMatched > 0 ? "#C9921B" : "#E24B4A"}`,
                    fontSize: 12,
                  }}>
                    <span>{xmlFeedback.itensMatched === xmlFeedback.itensTotal ? "✓" : "⚠"}</span>
                    <span>
                      <strong>{xmlFeedback.itensMatched}/{xmlFeedback.itensTotal}</strong> iten(s) vinculados automaticamente ao estoque
                      {xmlFeedback.itensMatched < xmlFeedback.itensTotal &&
                        <span style={{ color: "#856404" }}> — verifique os itens sem vínculo no próximo passo</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div><label style={lbl}>Número NF *</label><input style={inp} value={fNf.numero} onChange={e => setFNf(p => ({ ...p, numero: e.target.value }))} /></div>
            <div><label style={lbl}>Série</label><input style={inp} value={fNf.serie} onChange={e => setFNf(p => ({ ...p, serie: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Emitente (Fornecedor) *</label><input style={inp} value={fNf.emitente_nome} onChange={e => setFNf(p => ({ ...p, emitente_nome: e.target.value }))} /></div>
            <div><label style={lbl}>CNPJ do Emitente</label><input style={inp} value={fNf.emitente_cnpj} onChange={e => setFNf(p => ({ ...p, emitente_cnpj: e.target.value }))} /></div>
            <div><label style={lbl}>Data de Emissão *</label><input style={inp} type="date" value={fNf.data_emissao} onChange={e => setFNf(p => ({ ...p, data_emissao: e.target.value }))} /></div>
            <div><label style={lbl}>Valor Total (R$)</label><input style={inp} type="number" step="0.01" value={fNf.valor_total} onChange={e => setFNf(p => ({ ...p, valor_total: e.target.value }))} /></div>
            <div><label style={lbl}>Chave de Acesso</label><input style={inp} value={fNf.chave_acesso} onChange={e => setFNf(p => ({ ...p, chave_acesso: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Natureza da Operação</label><input style={inp} placeholder="Ex: Compra de defensivos" value={fNf.natureza} onChange={e => setFNf(p => ({ ...p, natureza: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Observação</label><input style={inp} value={fNf.observacao} onChange={e => setFNf(p => ({ ...p, observacao: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalNf("off")}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fNf.numero.trim() || !fNf.emitente_nome.trim() || !fNf.data_emissao ? 0.5 : 1 }} disabled={salvando || !fNf.numero.trim() || !fNf.emitente_nome.trim() || !fNf.data_emissao} onClick={avancarPasso2}>{salvando ? "Aguarde…" : "Avançar → Distribuir Itens"}</button>
          </div>
        </Modal>
      )}

      {/* Modal NF Entrada — Passo 2 */}
      {modalNf === "passo2" && (
        <Modal titulo={`NF ${fNf.numero} — Distribuição de Itens`} subtitulo={`Passo 2 de 2 — ${fNf.emitente_nome} · ${fmtBRL(parseFloat(fNf.valor_total) || 0)}`} width={780} onClose={() => setModalNf("off")}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
            <button style={{ ...btnE, borderColor: "#1A487040", color: "#0B2D50", background: "#D5E8F5" }} onClick={adicionarItemNf}>+ Adicionar item</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {itensNf.map((item, idx) => {
              const autoVinculado = nfMode === "xml" && !!item.insumo_id;
              const semVinculo    = nfMode === "xml" && item.tipo_apropiacao === "estoque" && !item.insumo_id;
              const borderColor   = item.alerta_preco ? "#EF9F27" : autoVinculado ? "#28a745" : semVinculo ? "#E24B4A" : "transparent";
              return (
              <div key={item.key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, padding: 14, background: item.alerta_preco ? "#FFFAF8" : "#F8FAFD", borderLeft: `3px solid ${borderColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Item {idx + 1}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {autoVinculado && <span style={{ fontSize: 11, background: "#D4EDDA", color: "#155724", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>✓ Auto-vinculado</span>}
                    {semVinculo    && <span style={{ fontSize: 11, background: "#F8D7DA", color: "#721C24", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>⚠ Sem vínculo — selecione o insumo</span>}
                    {item.alerta_preco && <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>⚠ Preço +10% vs. custo médio</span>}
                    <button style={btnX} onClick={() => setItensNf(p => p.filter(i => i.key !== item.key))}>✕</button>
                  </div>
                </div>

                {/* linha 1: descrição, cfop, qtd, valor uni */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 10 }}>
                  <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição *</label><input style={inp} value={item.descricao_produto} onChange={e => atualizarItem(item.key, { descricao_produto: e.target.value })} /></div>
                  <div><label style={lbl}>CFOP</label><input style={{ ...inp, textAlign: "center" }} placeholder="1102" value={item.cfop} onChange={e => atualizarItem(item.key, { cfop: e.target.value })} /></div>
                  <div><label style={lbl}>Unidade</label><input style={{ ...inp, textAlign: "center" }} value={item.unidade} onChange={e => atualizarItem(item.key, { unidade: e.target.value })} /></div>
                  <div><label style={lbl}>Quantidade</label><input style={{ ...inp, textAlign: "right" }} type="number" step="0.001" value={item.quantidade} onChange={e => atualizarItem(item.key, { quantidade: parseFloat(e.target.value) || 0 })} /></div>
                  <div><label style={lbl}>Vl. Unitário (R$)</label><input style={{ ...inp, textAlign: "right" }} type="number" step="0.01" value={item.valor_unitario} onChange={e => atualizarItem(item.key, { valor_unitario: parseFloat(e.target.value) || 0 })} /></div>
                </div>

                {/* linha 2: apropriação */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div>
                    <label style={lbl}>Apropriação *</label>
                    <select style={inp} value={item.tipo_apropiacao} onChange={e => {
                      const tipo = e.target.value as NfEntradaItem["tipo_apropiacao"];
                      // Auto-preenche CFOP sugerido ao trocar tipo
                      const cfopSugerido = tipo === "vef" ? "1922" : tipo === "remessa" ? "1116" : item.cfop;
                      atualizarItem(item.key, { tipo_apropiacao: tipo, cfop: cfopSugerido });
                    }}>
                      <option value="estoque">Estoque de insumo (compra normal)</option>
                      <option value="vef">VEF — Venda c/ Entrega Futura (CFOP 1922)</option>
                      <option value="remessa">Remessa — Entrega de VEF anterior (CFOP 1116)</option>
                      <option value="maquinario">Manutenção / máquina</option>
                      <option value="terceiro">Estoque de terceiros (manual)</option>
                      <option value="direto">Custo direto (sem estoque)</option>
                    </select>
                  </div>

                  {item.tipo_apropiacao === "estoque" && (
                    <>
                      <div>
                        <label style={lbl}>Insumo no estoque</label>
                        <select style={inp} value={item.insumo_id} onChange={e => atualizarItem(item.key, { insumo_id: e.target.value })}>
                          <option value="">Selecione…</option>
                          {insumos.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Depósito / Local</label>
                        <select style={inp} value={item.deposito_id} onChange={e => atualizarItem(item.key, { deposito_id: e.target.value })}>
                          <option value="">Nenhum</option>
                          {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  {item.tipo_apropiacao === "vef" && (
                    <>
                      <div>
                        <label style={lbl}>Insumo de referência *</label>
                        <select style={inp} value={item.insumo_id} onChange={e => atualizarItem(item.key, { insumo_id: e.target.value })}>
                          <option value="">Selecione…</option>
                          {insumos.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <div style={{ fontSize: 11, color: "#C9921B", background: "#FBF3E0", padding: "7px 10px", borderRadius: 7, lineHeight: 1.5, width: "100%" }}>
                          O produto ficará em poder do fornecedor.<br />
                          Depósito de terceiro vinculado ao CNPJ <strong>{fNf.emitente_cnpj || "não informado"}</strong> será creditado automaticamente.
                        </div>
                      </div>
                    </>
                  )}

                  {item.tipo_apropiacao === "remessa" && (
                    <>
                      <div>
                        <label style={lbl}>Insumo a receber *</label>
                        <select style={inp} value={item.insumo_id} onChange={e => atualizarItem(item.key, { insumo_id: e.target.value })}>
                          <option value="">Selecione…</option>
                          {insumos.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Depósito de destino (fazenda)</label>
                        <select style={inp} value={item.deposito_id} onChange={e => atualizarItem(item.key, { deposito_id: e.target.value })}>
                          <option value="">Nenhum</option>
                          {depositos.filter(d => ["insumo_fazenda","almoxarifado"].includes(d.tipo)).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  {item.tipo_apropiacao === "maquinario" && (
                    <div style={{ gridColumn: "2/-1" }}>
                      <label style={lbl}>Máquina / Equipamento</label>
                      <select style={inp} value={item.maquina_id} onChange={e => atualizarItem(item.key, { maquina_id: e.target.value })}>
                        <option value="">Selecione…</option>
                        {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome} {m.modelo ? `— ${m.modelo}` : ""}</option>)}
                      </select>
                    </div>
                  )}

                  {item.tipo_apropiacao === "terceiro" && (
                    <div style={{ gridColumn: "2/-1" }}>
                      <label style={lbl}>Insumo de referência</label>
                      <select style={inp} value={item.insumo_id} onChange={e => atualizarItem(item.key, { insumo_id: e.target.value })}>
                        <option value="">Selecione (opcional)…</option>
                        {insumos.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Custo médio preview */}
                {(item.tipo_apropiacao === "estoque" || item.tipo_apropiacao === "remessa") && item.insumo_id && (() => {
                  const ins = insumos.find(x => x.id === item.insumo_id);
                  if (!ins) return null;
                  const novoMed = ins.estoque > 0
                    ? (ins.estoque * ins.valor_unitario + item.quantidade * item.valor_unitario) / (ins.estoque + item.quantidade)
                    : item.valor_unitario;
                  return (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#666", background: "#F3F6F9", padding: "6px 10px", borderRadius: 6 }}>
                      Custo médio atual: <strong>{fmtBRL(ins.valor_unitario)}/{ins.unidade}</strong> · Após entrada: <strong style={{ color: "#1A4870" }}>{fmtBRL(novoMed)}/{ins.unidade}</strong>
                      {ins.estoque > 0 && <span style={{ marginLeft: 10, color: "#555" }}>Estoque atual: {fmtNum(ins.estoque)} {ins.unidade}</span>}
                      {item.tipo_apropiacao === "remessa" && <span style={{ marginLeft: 10, color: "#1A6B3C", fontWeight: 600 }}>← débita saldo de terceiro + credita fazenda</span>}
                    </div>
                  );
                })()}
              </div>
            );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#555" }}>
              {itensNf.length} iten(s) · Total: <strong>{fmtBRL(itensNf.reduce((s,i) => s + i.valor_total, 0))}</strong>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnR} onClick={() => setModalNf("off")}>Cancelar</button>
              <button style={{ ...btnV, background: "#C9921B", opacity: salvando || itensNf.every(i => !i.descricao_produto.trim()) ? 0.5 : 1 }} disabled={salvando || itensNf.every(i => !i.descricao_produto.trim())} onClick={processarNf}>{salvando ? "Processando…" : "Processar NF — Atualizar Estoque"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Detalhe NF */}
      {modalDetalheNf && (
        <Modal titulo={`NF ${modalDetalheNf.numero} — Itens`} subtitulo={`${modalDetalheNf.emitente_nome} · ${modalDetalheNf.data_emissao.split("-").reverse().join("/")} · ${fmtBRL(modalDetalheNf.valor_total)}`} width={700} onClose={() => setModalDetalheNf(null)}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <TH cols={["Descrição", "Qtd.", "Vl. Unit.", "Vl. Total", "Apropriação", "Destino"]} />
              <tbody>
                {itensDetalhe.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#444" }}>Nenhum item registrado</td></tr>}
                {itensDetalhe.map((it, i) => {
                  const ins = insumos.find(x => x.id === it.insumo_id);
                  const dep = depositos.find(x => x.id === it.deposito_id);
                  const maq = maquinas.find(x => x.id === it.maquina_id);
                  const destino = dep?.nome ?? maq?.nome ?? "—";
                  const corApr: Record<NfEntradaItem["tipo_apropiacao"], [string,string]> = {
                    estoque:    ["#D5E8F5","#0B2D50"],
                    maquinario: ["#E6F1FB","#0C447C"],
                    terceiro:   ["#FBF0D8","#7A5A12"],
                    direto:     ["#F1EFE8","#555"],
                    vef:        ["#FBF3E0","#C9921B"],
                    remessa:    ["#E8F5E9","#1A6B3C"],
                  };
                  const [bg, cl] = corApr[it.tipo_apropiacao];
                  const labelApr: Record<NfEntradaItem["tipo_apropiacao"], string> = {
                    estoque:    "Estoque",
                    maquinario: "Máquina",
                    terceiro:   "Terceiros",
                    direto:     "Direto",
                    vef:        "VEF",
                    remessa:    "Remessa",
                  };
                  return (
                    <tr key={it.id} style={{ borderBottom: i < itensDetalhe.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "9px 14px" }}>
                        <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{it.descricao_produto}</div>
                        {ins && <div style={{ fontSize: 11, color: "#444" }}>{ins.nome}</div>}
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtNum(it.quantidade)} {it.unidade}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtBRL(it.valor_unitario)}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{fmtBRL(it.valor_total)}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center" }}>{badge(labelApr[it.tipo_apropiacao], bg, cl)}</td>
                      <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12, color: "#1a1a1a" }}>{destino}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button style={btnR} onClick={() => setModalDetalheNf(null)}>Fechar</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
