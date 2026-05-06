"use client";
import { useState, useRef, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────
type Aba = "pessoas" | "cp" | "cr" | "insumos" | "produtos";

type PessoaRow = {
  nome: string; tipo: string; cpf_cnpj: string; cliente: string; fornecedor: string;
  email: string; telefone: string; municipio: string; estado: string; cep: string;
  banco_nome: string; pix_chave: string; pix_tipo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type LancRow = {
  descricao: string; categoria: string; data_lancamento: string;
  data_vencimento: string; valor: string; pessoa_cpf_cnpj: string;
  moeda: string; num_parcela: string; total_parcelas: string;
  tipo_documento_lcdpr: string;
  _status?: "ok" | "erro"; _msg?: string;
};
type InsumoRow = {
  nome: string; categoria: string; unidade: string; estoque: string;
  estoque_minimo: string; valor_unitario: string; fabricante: string; subgrupo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type ProdutoRow = {
  nome: string; categoria: string; unidade: string; codigo_interno: string;
  ncm: string; estoque: string; estoque_minimo: string; valor_unitario: string;
  valor_venda: string; fabricante: string; marca: string; subgrupo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};

// ─── Templates ────────────────────────────────────────────────
const TEMPLATE_PESSOAS = [
  ["nome*", "tipo*", "cpf_cnpj", "cliente", "fornecedor", "email", "telefone", "municipio", "estado", "cep", "banco_nome", "pix_chave", "pix_tipo"],
  ["Bunge Brasil", "pj", "08.821.250/0001-60", "sim", "nao", "bunge@bunge.com", "(11)3305-0000", "São Paulo", "SP", "04710-070", "Caixa", "08821250000160", "cnpj"],
  ["João da Silva", "pf", "012.345.678-90", "nao", "sim", "joao@email.com", "(65)99999-0001", "Nova Mutum", "MT", "78450-000", "", "", ""],
];
const TEMPLATE_CP = [
  ["descricao*", "categoria*", "data_lancamento*", "data_vencimento*", "valor*", "pessoa_cpf_cnpj", "moeda", "num_parcela", "total_parcelas", "tipo_documento_lcdpr"],
  ["Compra de Soja (Bunge)", "Comercialização", "2026-01-10", "2026-02-10", "150000.00", "08.821.250/0001-60", "BRL", "1", "1", "NF"],
  ["Arrendamento Fazenda Sul", "Arrendamento", "2026-03-01", "2026-03-31", "45000.00", "012.345.678-90", "BRL", "1", "3", "RECIBO"],
];
const TEMPLATE_CR = [
  ["descricao*", "categoria*", "data_lancamento*", "data_vencimento*", "valor*", "pessoa_cpf_cnpj", "moeda", "num_parcela", "total_parcelas", "tipo_documento_lcdpr"],
  ["Venda Soja Safra 25/26", "Comercialização", "2026-01-15", "2026-02-15", "280000.00", "08.821.250/0001-60", "BRL", "1", "2", "NF"],
  ["Prestação de Serviço", "Outros", "2026-02-01", "2026-03-01", "8500.00", "", "BRL", "1", "1", "RECIBO"],
];
const TEMPLATE_INSUMOS = [
  ["nome*", "categoria*", "unidade*", "estoque", "estoque_minimo", "valor_unitario", "fabricante", "subgrupo"],
  ["Roundup WG", "defensivo", "kg", "500", "100", "42.50", "Monsanto", "Herbicida"],
  ["Uréia 45% N", "fertilizante", "sc", "200", "50", "185.00", "Yara", "Nitrogênio"],
  ["TMG 7062 IPRO", "semente", "sc", "80", "20", "335.00", "TMG Sementes", "Soja"],
];
const TEMPLATE_PRODUTOS = [
  ["nome*", "categoria*", "unidade*", "codigo_interno", "ncm", "estoque", "estoque_minimo", "valor_unitario", "valor_venda", "fabricante", "marca", "subgrupo"],
  ["Filtro de Óleo Motor", "peca", "un", "FLT-001", "84212300", "10", "2", "85.00", "120.00", "Fram", "Fram", "Filtros"],
  ["Fio Elétrico 2,5mm", "material", "m", "FIO-025", "85444929", "500", "100", "4.80", "7.50", "Prysmian", "Afumex", "Elétrico"],
  ["Papel A4 75g/m² (Resma)", "escritorio", "cx", "PAP-A4", "48025590", "20", "5", "22.00", "32.00", "Chamex", "Chamex", "Papelaria"],
  ["Óleo Hidráulico ISO 68", "uso_consumo", "L", "OLH-068", "27101980", "200", "50", "18.50", "0", "Ipiranga", "Lubrax", "Lubrificantes"],
  ["Correia Trapezoidal B-75", "peca", "un", "COR-B75", "40103900", "5", "2", "45.00", "68.00", "Gates", "Gates", "Transmissão"],
];

const INSTRUCOES_PRODUTOS = [
  ["INSTRUÇÕES — CADASTRO DE PRODUTOS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• categoria: peca, material, uso_consumo, escritorio, outros"],
  ["• unidade: kg, g, L, mL, sc, t, un, m, m2, cx, pc, par, outros"],
  ["• codigo_interno: código próprio da fazenda (opcional, ex: FLT-001)"],
  ["• ncm: 8 dígitos sem pontos (ex: 84212300) — obrigatório para NF-e"],
  ["• estoque / estoque_minimo: quantidade atual em estoque"],
  ["• valor_unitario: custo de compra (sem R$, ex: 85.00)"],
  ["• valor_venda: preço de venda ou repasse (0 se não se aplica)"],
  ["• fabricante: razão social ou nome do fabricante"],
  ["• marca: marca comercial do produto"],
  ["• subgrupo: classificação interna livre (ex: Filtros, Elétrico)"],
  [""],
  ["Categorias disponíveis:"],
  ["  peca        → peças de reposição para máquinas e implementos"],
  ["  material    → materiais de construção, fios, tubos, etc."],
  ["  uso_consumo → lubrificantes, combustível, itens consumíveis"],
  ["  escritorio  → papelaria, cartuchos, materiais de escritório"],
  ["  outros      → demais itens que não se enquadram acima"],
];

function downloadTemplate(aba: Aba) {
  import("xlsx").then(({ utils, writeFile }) => {
    const wb = utils.book_new();
    const templates: Record<Aba, (string | number)[][]> = {
      pessoas:  TEMPLATE_PESSOAS,
      cp:       TEMPLATE_CP,
      cr:       TEMPLATE_CR,
      insumos:  TEMPLATE_INSUMOS,
      produtos: TEMPLATE_PRODUTOS,
    };
    const ws = utils.aoa_to_sheet(templates[aba]);
    ws["!cols"] = templates[aba][0].map(() => ({ wch: 24 }));
    utils.book_append_sheet(wb, ws, "Dados");

    const instrBase = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [""],
      ["• Campos com * são obrigatórios"],
      ["• Não altere os nomes das colunas (linha 1)"],
      ["• Datas no formato AAAA-MM-DD (ex: 2026-03-15)"],
      ["• Valores numéricos sem símbolo R$ (ex: 15000.50)"],
      ["• tipo: pf ou pj"],
      ["• cliente / fornecedor: sim ou nao"],
      ["• moeda: BRL, USD ou barter"],
      ["• tipo_documento_lcdpr: RECIBO, NF, DUPLICATA, CHEQUE, PIX, TED ou OUTROS"],
      ["• pix_tipo: cpf, cnpj, email, telefone ou aleatoria"],
      ["• categoria insumo: semente, fertilizante, defensivo, inoculante, combustivel, peca, material, uso_consumo, escritorio, outros"],
      ["• unidade: kg, g, L, mL, sc, t, un, m, m2, cx, pc, par, outros"],
    ];
    const instrucoes = utils.aoa_to_sheet(aba === "produtos" ? INSTRUCOES_PRODUTOS : instrBase);
    utils.book_append_sheet(wb, instrucoes, "Instruções");

    const nomes: Record<Aba, string> = {
      pessoas:  "template_pessoas.xlsx",
      cp:       "template_contas_pagar.xlsx",
      cr:       "template_contas_receber.xlsx",
      insumos:  "template_insumos.xlsx",
      produtos: "template_produtos.xlsx",
    };
    writeFile(wb, nomes[aba]);
  });
}

// ─── Parse XLSX ───────────────────────────────────────────────
function parseXlsx(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      import("xlsx").then(({ read, utils }) => {
        try {
          const wb = read(e.target!.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          // Strip asterisks from header keys (templates use nome*, categoria* etc. to mark required fields)
          const rows = raw.map(row => {
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) {
              cleaned[k.replace(/\*/g, "").trim()] = String(v);
            }
            return cleaned;
          });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Validações ───────────────────────────────────────────────
function validarPessoa(r: Record<string, string>): PessoaRow {
  const row = r as unknown as PessoaRow;
  if (!row.nome?.trim())  return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.tipo || !["pf","pj"].includes(row.tipo.toLowerCase()))
    return { ...row, _status: "erro", _msg: "tipo deve ser pf ou pj" };
  return { ...row, tipo: row.tipo.toLowerCase(), _status: "ok", _msg: "" };
}

function validarLanc(r: Record<string, string>): LancRow {
  const row = r as unknown as LancRow;
  if (!row.descricao?.trim())       return { ...row, _status: "erro", _msg: "descricao obrigatória" };
  if (!row.categoria?.trim())       return { ...row, _status: "erro", _msg: "categoria obrigatória" };
  if (!row.data_lancamento?.trim()) return { ...row, _status: "erro", _msg: "data_lancamento obrigatória" };
  if (!row.data_vencimento?.trim()) return { ...row, _status: "erro", _msg: "data_vencimento obrigatória" };
  const v = parseFloat(String(row.valor).replace(",", "."));
  if (isNaN(v) || v <= 0)           return { ...row, _status: "erro", _msg: "valor inválido" };
  return { ...row, _status: "ok", _msg: "" };
}

function validarInsumo(r: Record<string, string>): InsumoRow {
  const row = r as unknown as InsumoRow;
  if (!row.nome?.trim())      return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.categoria?.trim()) return { ...row, _status: "erro", _msg: "categoria obrigatória" };
  if (!row.unidade?.trim())   return { ...row, _status: "erro", _msg: "unidade obrigatória" };
  return { ...row, _status: "ok", _msg: "" };
}

const CATS_PRODUTO = ["peca","material","uso_consumo","escritorio","outros"];
const UNITS_VALIDAS = ["kg","g","L","mL","sc","t","un","m","m2","cx","pc","par","outros"];

function validarProduto(r: Record<string, string>): ProdutoRow {
  const row = r as unknown as ProdutoRow;
  if (!row.nome?.trim())
    return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.categoria?.trim() || !CATS_PRODUTO.includes(row.categoria.trim().toLowerCase()))
    return { ...row, _status: "erro", _msg: `categoria inválida — use: ${CATS_PRODUTO.join(", ")}` };
  if (!row.unidade?.trim() || !UNITS_VALIDAS.includes(row.unidade.trim()))
    return { ...row, _status: "erro", _msg: `unidade inválida — use: ${UNITS_VALIDAS.join(", ")}` };
  if (row.ncm?.trim() && !/^\d{8}$/.test(row.ncm.trim()))
    return { ...row, _status: "erro", _msg: "NCM deve ter 8 dígitos numéricos (ex: 84212300)" };
  return { ...row, categoria: row.categoria.trim().toLowerCase(), unidade: row.unidade.trim(), _status: "ok", _msg: "" };
}

// ─── Componente UploadZone ────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => ref.current?.click()}
      style={{
        border: `2px dashed ${drag ? "#1A4870" : "#DDE2EE"}`,
        borderRadius: 10,
        padding: "40px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "#D5E8F5" : "#F4F6FA",
        transition: "all 0.15s",
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>
        Arraste o arquivo XLSX aqui
      </div>
      <div style={{ fontSize: 12, color: "#888" }}>ou clique para selecionar</div>
    </div>
  );
}

// ─── Preview Table ────────────────────────────────────────────
function PreviewTable({ rows, colunas }: { rows: Record<string, unknown>[]; colunas: string[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F4F6FA" }}>
            <th style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>#</th>
            {colunas.map(c => (
              <th key={c} style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>{c}</th>
            ))}
            <th style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const status = (row as Record<string, unknown>)._status as string;
            const msg    = (row as Record<string, unknown>)._msg as string;
            return (
              <tr key={i} style={{ background: status === "erro" ? "#FFF0F0" : status === "duplicado" ? "#FFFBE0" : "white" }}>
                <td style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", color: "#888" }}>{i + 1}</td>
                {colunas.map(c => (
                  <td key={c} style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String((row as Record<string, unknown>)[c] ?? "")}
                  </td>
                ))}
                <td style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE" }}>
                  {status === "ok"        && <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ ok</span>}
                  {status === "duplicado" && <span style={{ color: "#C9921B", fontWeight: 600 }}>⚠ duplicado</span>}
                  {status === "erro"      && <span style={{ color: "#E24B4A", fontWeight: 600 }}>✗ {msg}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Resultado resumo ─────────────────────────────────────────
function Resultado({ ok, erros, duplicados, total }: { ok: number; erros: number; duplicados: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
      {[
        { label: "Total lidas", valor: total,      cor: "#1A4870", bg: "#D5E8F5" },
        { label: "Importadas",  valor: ok,          cor: "#16A34A", bg: "#DCFCE7" },
        { label: "Duplicadas",  valor: duplicados,  cor: "#C9921B", bg: "#FBF3E0" },
        { label: "Com erro",    valor: erros,       cor: "#E24B4A", bg: "#FFF0F0" },
      ].map(({ label, valor, cor, bg }) => (
        <div key={label} style={{ padding: "10px 20px", borderRadius: 8, background: bg, border: `0.5px solid ${cor}40` }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{valor}</div>
          <div style={{ fontSize: 12, color: cor }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Referência de categorias (Produtos) ─────────────────────
function RefCategorias() {
  return (
    <div style={{ marginTop: 16, background: "#F4F6FA", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10 }}>
        Categorias de Produtos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {[
          { cat: "peca",        label: "Peça",          desc: "Reposição de máquinas e implementos" },
          { cat: "material",    label: "Material",      desc: "Construção, fios, tubos, chapas" },
          { cat: "uso_consumo", label: "Uso e Consumo", desc: "Lubrificantes, combustível, consumíveis" },
          { cat: "escritorio",  label: "Escritório",    desc: "Papelaria, cartuchos, informática" },
          { cat: "outros",      label: "Outros",        desc: "Demais itens não classificados" },
        ].map(({ cat, label, desc }) => (
          <div key={cat} style={{ padding: "8px 12px", background: "white", borderRadius: 8, border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{desc}</div>
            <code style={{ fontSize: 11, color: "#1A4870", background: "#D5E8F5", padding: "1px 5px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{cat}</code>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
        <strong>Unidades válidas:</strong> kg · g · L · mL · sc · t · un · m · m² · cx · pc · par · outros
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>NCM:</strong> 8 dígitos sem pontos (ex: 84212300) — consultar tabela TIPI
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────
export default function ImportacaoPage() {
  const { fazendaId, userRole } = useAuth();
  const [aba, setAba] = useState<Aba>("pessoas");

  // Estados por aba
  const [pessoasRows,  setPessoasRows]  = useState<PessoaRow[]>([]);
  const [cpRows,       setCpRows]       = useState<LancRow[]>([]);
  const [crRows,       setCrRows]       = useState<LancRow[]>([]);
  const [insumosRows,  setInsumosRows]  = useState<InsumoRow[]>([]);
  const [produtosRows, setProdutosRows] = useState<ProdutoRow[]>([]);

  const [loadingPessoas,  setLoadingPessoas]  = useState(false);
  const [loadingCp,       setLoadingCp]       = useState(false);
  const [loadingCr,       setLoadingCr]       = useState(false);
  const [loadingInsumos,  setLoadingInsumos]  = useState(false);
  const [loadingProdutos, setLoadingProdutos] = useState(false);

  const [resultPessoas,  setResultPessoas]  = useState<{ ok: number; erros: number; duplicados: number } | null>(null);
  const [resultCp,       setResultCp]       = useState<{ ok: number; erros: number; duplicados: number } | null>(null);
  const [resultCr,       setResultCr]       = useState<{ ok: number; erros: number; duplicados: number } | null>(null);
  const [resultInsumos,  setResultInsumos]  = useState<{ ok: number; erros: number; duplicados: number } | null>(null);
  const [resultProdutos, setResultProdutos] = useState<{ ok: number; erros: number; duplicados: number } | null>(null);

  // ─── Acesso restrito ──────────────────────────────────────
  if (userRole !== "raccotlo") {
    return (
      <>
        <TopNav />
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>Acesso restrito</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Esta área é exclusiva para a equipe Raccolto.</div>
        </div>
      </>
    );
  }

  // ─── Handlers de upload ───────────────────────────────────
  async function handleFilePessoas(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarPessoa(r));
    // Duplicados dentro do arquivo
    const cpfs = rows.map(r => r.cpf_cnpj?.replace(/\D/g, "")).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.cpf_cnpj) {
        const cpf = r.cpf_cnpj.replace(/\D/g, "");
        if (cpf && cpfs.indexOf(cpf) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("pessoas").select("cpf_cnpj").eq("fazenda_id", fazendaId);
      const cpfsExistentes = new Set((existentes ?? []).map((p: { cpf_cnpj: string | null }) => (p.cpf_cnpj ?? "").replace(/\D/g, "")).filter(Boolean));
      rows.forEach(r => {
        if (r._status === "ok" && r.cpf_cnpj) {
          if (cpfsExistentes.has(r.cpf_cnpj.replace(/\D/g, ""))) r._status = "duplicado";
        }
      });
    }
    setPessoasRows(rows); setResultPessoas(null);
  }

  async function handleFileCp(file: File) {
    const raw = await parseXlsx(file);
    setCpRows(raw.map(r => validarLanc(r))); setResultCp(null);
  }

  async function handleFileCr(file: File) {
    const raw = await parseXlsx(file);
    setCrRows(raw.map(r => validarLanc(r))); setResultCr(null);
  }

  async function handleFileInsumos(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarInsumo(r));
    // Duplicados dentro do arquivo
    const nomes = rows.map(r => r.nome?.toLowerCase().trim()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.nome) {
        const n = r.nome.toLowerCase().trim();
        if (n && nomes.indexOf(n) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("insumos").select("nome").eq("fazenda_id", fazendaId).eq("tipo", "insumo");
      const nomesExistentes = new Set((existentes ?? []).map((x: { nome: string }) => x.nome.toLowerCase().trim()));
      rows.forEach(r => {
        if (r._status === "ok" && r.nome) {
          if (nomesExistentes.has(r.nome.toLowerCase().trim())) r._status = "duplicado";
        }
      });
    }
    setInsumosRows(rows); setResultInsumos(null);
  }

  async function handleFileProdutos(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarProduto(r));
    // Duplicados dentro do arquivo
    const nomes = rows.map(r => r.nome?.toLowerCase().trim()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.nome) {
        const n = r.nome.toLowerCase().trim();
        if (n && nomes.indexOf(n) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("insumos").select("nome").eq("fazenda_id", fazendaId).eq("tipo", "produto");
      const nomesExistentes = new Set((existentes ?? []).map((x: { nome: string }) => x.nome.toLowerCase().trim()));
      rows.forEach(r => {
        if (r._status === "ok" && r.nome) {
          if (nomesExistentes.has(r.nome.toLowerCase().trim())) r._status = "duplicado";
        }
      });
    }
    setProdutosRows(rows); setResultProdutos(null);
  }

  // ─── Importar Pessoas ─────────────────────────────────────
  async function importarPessoas() {
    if (!fazendaId || !pessoasRows.length) return;
    setLoadingPessoas(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of pessoasRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const { error } = await supabase.from("pessoas").insert({
        fazenda_id: fazendaId,
        nome:       r.nome.trim(),
        tipo:       (r.tipo as "pf" | "pj") || "pj",
        cliente:    r.cliente?.toLowerCase() === "sim",
        fornecedor: r.fornecedor?.toLowerCase() === "sim",
        cpf_cnpj:   r.cpf_cnpj?.trim() || null,
        email:      r.email?.trim() || null,
        telefone:   r.telefone?.trim() || null,
        municipio:  r.municipio?.trim() || null,
        estado:     r.estado?.trim() || null,
        cep:        r.cep?.trim() || null,
        banco_nome: r.banco_nome?.trim() || null,
        pix_chave:  r.pix_chave?.trim() || null,
        pix_tipo:   r.pix_tipo?.trim() || null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setPessoasRows([...pessoasRows]);
    setResultPessoas({ ok, erros, duplicados });
    setLoadingPessoas(false);
  }

  // ─── Importar CP / CR ─────────────────────────────────────
  async function importarLancamentos(tipo: "pagar" | "receber", rows: LancRow[], setRows: (r: LancRow[]) => void, setResult: (r: { ok: number; erros: number; duplicados: number }) => void, setLoading: (v: boolean) => void) {
    if (!fazendaId || !rows.length) return;
    setLoading(true);
    let ok = 0, erros = 0, duplicados = 0;
    const { data: pessoas } = await supabase.from("pessoas").select("id, cpf_cnpj").eq("fazenda_id", fazendaId);
    const pessoaMap: Record<string, string> = {};
    (pessoas ?? []).forEach(p => { if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id; });
    for (const r of rows) {
      if (r._status === "erro") { erros++; continue; }
      const pessoaId = r.pessoa_cpf_cnpj ? pessoaMap[r.pessoa_cpf_cnpj.replace(/\D/g, "")] ?? null : null;
      const valor = parseFloat(String(r.valor).replace(",", "."));
      const { error } = await supabase.from("lancamentos").insert({
        fazenda_id:           fazendaId,
        tipo,
        descricao:            r.descricao.trim(),
        categoria:            r.categoria.trim(),
        data_lancamento:      r.data_lancamento.trim(),
        data_vencimento:      r.data_vencimento.trim(),
        valor,
        moeda:                (r.moeda?.toUpperCase() as "BRL"|"USD"|"barter") || "BRL",
        status:               "em_aberto",
        auto:                 false,
        num_parcela:          r.num_parcela   ? parseInt(r.num_parcela)   : null,
        total_parcelas:       r.total_parcelas ? parseInt(r.total_parcelas) : null,
        tipo_documento_lcdpr: r.tipo_documento_lcdpr?.trim() || null,
        pessoa_id:            pessoaId,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setRows([...rows]);
    setResult({ ok, erros, duplicados });
    setLoading(false);
  }

  // ─── Importar Insumos ─────────────────────────────────────
  async function importarInsumos() {
    if (!fazendaId || !insumosRows.length) return;
    setLoadingInsumos(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of insumosRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const { error } = await supabase.from("insumos").insert({
        fazenda_id:     fazendaId,
        tipo:           "insumo",
        nome:           r.nome.trim(),
        categoria:      r.categoria.trim(),
        unidade:        r.unidade.trim(),
        estoque:        parseFloat(r.estoque || "0"),
        estoque_minimo: parseFloat(r.estoque_minimo || "0"),
        valor_unitario: parseFloat(String(r.valor_unitario).replace(",", ".") || "0"),
        fabricante:     r.fabricante?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setInsumosRows([...insumosRows]);
    setResultInsumos({ ok, erros, duplicados });
    setLoadingInsumos(false);
  }

  // ─── Importar Produtos ────────────────────────────────────
  async function importarProdutos() {
    if (!fazendaId || !produtosRows.length) return;
    setLoadingProdutos(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of produtosRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const valorVenda = parseFloat(String(r.valor_venda).replace(",", ".") || "0");
      const { error } = await supabase.from("insumos").insert({
        fazenda_id:     fazendaId,
        tipo:           "produto",
        nome:           r.nome.trim(),
        categoria:      r.categoria,
        unidade:        r.unidade,
        estoque:        parseFloat(r.estoque || "0"),
        estoque_minimo: parseFloat(r.estoque_minimo || "0"),
        valor_unitario: parseFloat(String(r.valor_unitario).replace(",", ".") || "0"),
        // campos extras: armazenar em lote/subgrupo o que couber, NCM e código interno em colunas se existirem
        lote:           r.codigo_interno?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
        fabricante:     r.fabricante?.trim() || null,
        // valor_venda e ncm — salvar como custo_medio e lote se não tiver colunas dedicadas
        custo_medio:    valorVenda > 0 ? valorVenda : null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setProdutosRows([...produtosRows]);
    setResultProdutos({ ok, erros, duplicados });
    setLoadingProdutos(false);
  }

  // ─── Config por aba ───────────────────────────────────────
  const ABA_CONFIG: Record<Aba, {
    label: string; icon: string; desc: string;
    cols: string[]; rows: Record<string, unknown>[]; loading: boolean;
    result: { ok: number; erros: number; duplicados: number } | null;
    onFile: (f: File) => void; onImport: () => void;
  }> = {
    pessoas: {
      label: "Pessoas", icon: "👤",
      desc: "Importe fornecedores, clientes, arrendantes e demais pessoas de uma só vez.",
      cols: ["nome", "tipo", "cpf_cnpj", "cliente", "fornecedor", "email", "telefone", "municipio", "estado"],
      rows: pessoasRows as Record<string, unknown>[],
      loading: loadingPessoas,
      result: resultPessoas,
      onFile: handleFilePessoas,
      onImport: importarPessoas,
    },
    cp: {
      label: "Contas a Pagar", icon: "💸",
      desc: "Importe contas a pagar. A coluna pessoa_cpf_cnpj vincula automaticamente ao cadastro de Pessoas.",
      cols: ["descricao", "categoria", "data_lancamento", "data_vencimento", "valor", "pessoa_cpf_cnpj", "moeda"],
      rows: cpRows as Record<string, unknown>[],
      loading: loadingCp,
      result: resultCp,
      onFile: handleFileCp,
      onImport: () => importarLancamentos("pagar", cpRows, setCpRows, setResultCp, setLoadingCp),
    },
    cr: {
      label: "Contas a Receber", icon: "💰",
      desc: "Importe contas a receber. A coluna pessoa_cpf_cnpj vincula automaticamente ao cadastro de Pessoas.",
      cols: ["descricao", "categoria", "data_lancamento", "data_vencimento", "valor", "pessoa_cpf_cnpj", "moeda"],
      rows: crRows as Record<string, unknown>[],
      loading: loadingCr,
      result: resultCr,
      onFile: handleFileCr,
      onImport: () => importarLancamentos("receber", crRows, setCrRows, setResultCr, setLoadingCr),
    },
    insumos: {
      label: "Insumos", icon: "🌾",
      desc: "Importe insumos agrícolas: sementes, fertilizantes, defensivos e combustíveis.",
      cols: ["nome", "categoria", "unidade", "estoque", "estoque_minimo", "valor_unitario", "fabricante"],
      rows: insumosRows as Record<string, unknown>[],
      loading: loadingInsumos,
      result: resultInsumos,
      onFile: handleFileInsumos,
      onImport: importarInsumos,
    },
    produtos: {
      label: "Produtos", icon: "📦",
      desc: "Importe peças, materiais, itens de uso e consumo e produtos de escritório.",
      cols: ["nome", "categoria", "unidade", "codigo_interno", "ncm", "estoque", "valor_unitario", "fabricante", "marca"],
      rows: produtosRows as Record<string, unknown>[],
      loading: loadingProdutos,
      result: resultProdutos,
      onFile: handleFileProdutos,
      onImport: importarProdutos,
    },
  };

  const cfg      = ABA_CONFIG[aba];
  const totalRows = cfg.rows.length;
  const okRows    = cfg.rows.filter(r => (r as Record<string, unknown>)._status === "ok").length;
  const erroRows  = cfg.rows.filter(r => (r as Record<string, unknown>)._status === "erro").length;

  function limpar() {
    if (aba === "pessoas")  { setPessoasRows([]);  setResultPessoas(null); }
    if (aba === "cp")        { setCpRows([]);       setResultCp(null); }
    if (aba === "cr")        { setCrRows([]);       setResultCr(null); }
    if (aba === "insumos")  { setInsumosRows([]);  setResultInsumos(null); }
    if (aba === "produtos") { setProdutosRows([]); setResultProdutos(null); }
  }

  return (
    <>
    <TopNav />
    <div style={{ background: "#F4F6FA", minHeight: "100vh", padding: "24px 28px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
          Importações
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
          Importe dados em lote via planilha XLSX — exclusivo Raccolto
        </p>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* Sidebar de abas */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: "white", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            {(["pessoas", "cp", "cr", "insumos", "produtos"] as Aba[]).map(a => {
              const c = ABA_CONFIG[a];
              return (
                <button
                  key={a}
                  onClick={() => setAba(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "12px 16px",
                    border: "none", borderBottom: "0.5px solid #DDE2EE",
                    background: aba === a ? "#D5E8F5" : "transparent",
                    color: aba === a ? "#1A4870" : "#555",
                    fontWeight: aba === a ? 700 : 400,
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{c.icon}</span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Instrução geral */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#FBF3E0", borderRadius: 10, border: "0.5px solid #C9921B", fontSize: 12, color: "#7A5A12", lineHeight: 1.6 }}>
            <strong>Passo a passo:</strong><br />
            1. Baixe o template<br />
            2. Preencha os dados<br />
            3. Faça upload do XLSX<br />
            4. Revise a prévia<br />
            5. Clique em Importar
          </div>
        </div>

        {/* Área principal */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "white", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 24 }}>

            {/* Cabeçalho da aba */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{cfg.icon}</span>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{cfg.label}</h2>
                </div>
                <p style={{ margin: "4px 0 0 34px", fontSize: 13, color: "#666" }}>{cfg.desc}</p>
              </div>
              <button
                onClick={() => downloadTemplate(aba)}
                style={{
                  padding: "8px 16px", background: "white", border: "0.5px solid #1A4870",
                  borderRadius: 8, color: "#1A4870", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                ⬇ Baixar template
              </button>
            </div>

            {/* Upload */}
            <UploadZone onFile={cfg.onFile} />

            {/* Prévia */}
            {totalRows > 0 && (
              <>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    <strong>{totalRows}</strong> linha{totalRows !== 1 ? "s" : ""} lida{totalRows !== 1 ? "s" : ""}
                    {erroRows > 0 && <span style={{ marginLeft: 10, color: "#E24B4A", fontWeight: 600 }}>{erroRows} com erro</span>}
                    {okRows   > 0 && <span style={{ marginLeft: 10, color: "#16A34A", fontWeight: 600 }}>{okRows} prontas para importar</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={limpar}
                      style={{ padding: "7px 14px", background: "white", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, color: "#888", cursor: "pointer" }}
                    >
                      Limpar
                    </button>
                    <button
                      onClick={cfg.onImport}
                      disabled={cfg.loading || okRows === 0}
                      style={{
                        padding: "7px 20px",
                        background: okRows === 0 ? "#DDE2EE" : "#1A4870",
                        border: "none", borderRadius: 8, color: "white",
                        fontSize: 13, fontWeight: 600, cursor: okRows === 0 ? "default" : "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {cfg.loading ? "⏳ Importando..." : `⬆ Importar ${okRows} registro${okRows !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
                <PreviewTable rows={cfg.rows} colunas={cfg.cols} />
              </>
            )}

            {/* Resultado */}
            {cfg.result && (
              <Resultado
                ok={cfg.result.ok}
                erros={cfg.result.erros}
                duplicados={cfg.result.duplicados}
                total={cfg.result.ok + cfg.result.erros + cfg.result.duplicados}
              />
            )}

            {/* Empty state */}
            {totalRows === 0 && !cfg.result && (
              <div style={{ marginTop: 20, textAlign: "center", color: "#aaa", fontSize: 13, padding: "16px 0" }}>
                Faça o upload de um arquivo XLSX para visualizar os dados antes de importar.
              </div>
            )}
          </div>

          {/* Dicas contextuais */}
          {(aba === "cp" || aba === "cr") && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: "#D5E8F5", borderRadius: 10, border: "0.5px solid #1A4870", fontSize: 12, color: "#0B2D50" }}>
              <strong>💡 Dica:</strong> A coluna <code>pessoa_cpf_cnpj</code> faz o vínculo automático com o cadastro de Pessoas pelo CPF ou CNPJ.
              Importe Pessoas primeiro para garantir o vínculo correto.
            </div>
          )}
          {aba === "produtos" && <RefCategorias />}
        </div>
      </div>
    </div>
    </>
  );
}
