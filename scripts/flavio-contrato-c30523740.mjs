// Flávio, contrato C30523740-0: deixa os títulos do CP iguais ao cronograma de parcelas.
// Remove os títulos criados em 21/10/2026 com o valor ×100 (salvamentos antes da correção 990fa022), ajusta os juros da
// parcela 2 e inclui os juros da parcela 1. Só altera se encontrar o que era esperado, e pode rodar de novo: o que já foi
// feito não é repetido.
// Opcionais: --remover-1-milhao (título "Parcela 2" de R$ 1.000.000,00)
//            --parcela3-data=AAAA-MM-DD --parcela3-conta=<id> (registra o pagamento da parcela 3)
// Uso: node --env-file=.env.local scripts/flavio-contrato-c30523740.mjs [opções] [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const CONTRATO = "0202a33c-fd66-44b3-969c-6de3b996534e";
const VENC_P2 = "2025-09-20";
const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const remover1mi = args.includes("--remover-1-milhao");
const opcao = nome => args.find(a => a.startsWith(`--${nome}=`))?.split("=")[1];
const dataP3 = opcao("parcela3-data"), contaP3 = opcao("parcela3-conta");
if (!!dataP3 !== !!contaP3) throw new Error("Informe --parcela3-data e --parcela3-conta juntos.");

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: titulos, error } = await s.from("lancamentos").select("*").eq("contrato_financeiro_id", CONTRATO).eq("tipo", "pagar").neq("status", "cancelado");
if (error) throw error;
const criado = (t, dia) => t.created_at.startsWith(dia);
const valor = (t, v) => Math.abs(Number(t.valor) - v) < 0.005;
const fim = (t, txt) => (t.descricao ?? "").endsWith(txt);

const amortErradas = titulos.filter(t => t.data_vencimento === VENC_P2 && valor(t, 142452795.85) && criado(t, "2026-10-21"));
const jurosCopias = titulos.filter(t => t.data_vencimento === VENC_P2 && valor(t, 625978.15) && criado(t, "2026-10-21"));
const jurosP2 = titulos.filter(t => t.data_vencimento === VENC_P2 && (valor(t, 625978.15) || valor(t, 630787.74)) && criado(t, "2026-08-18"));
const umMilhao = titulos.filter(t => t.data_vencimento === VENC_P2 && valor(t, 1000000));
const amortP1 = titulos.filter(t => fim(t, "Parcela 1 — Amortização"));
const jurosP1 = titulos.filter(t => fim(t, "Parcela 1 — Juros"));
const p3 = titulos.filter(t => (t.descricao ?? "").includes("Parcela 3 —"));

const esperado = [[amortErradas, [0, 5], "amortização ×100"], [jurosCopias, [0, 5], "juros repetidos"], [jurosP2, [1], "juros da parcela 2"], [umMilhao, [0, 1], "título de R$ 1.000.000,00"], [amortP1, [1], "amortização da parcela 1"], [jurosP1, [0, 1], "juros da parcela 1"], [p3, [2], "títulos da parcela 3"]];
for (const [lista, n, nome] of esperado) if (!n.includes(lista.length)) throw new Error(`Esperava ${n.join(" ou ")} em "${nome}" e encontrei ${lista.length}. Nada foi alterado.`);
const remover = [...amortErradas, ...jurosCopias, ...(remover1mi ? umMilhao : [])];
const presos = remover.filter(t => t.conciliado || t.lote_id);
if (presos.length) throw new Error(`${presos.length} título(s) conciliados ou em borderô. Nada foi alterado.`);

const soma = l => l.reduce((t, x) => t + Number(x.valor), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
console.log(`Remover ${amortErradas.length} amortizações ×100: R$ ${soma(amortErradas)}`);
console.log(`Remover ${jurosCopias.length} juros repetidos: R$ ${soma(jurosCopias)}`);
console.log(remover1mi ? "Remover o título de R$ 1.000.000,00" : "Manter o título de R$ 1.000.000,00 (use --remover-1-milhao para remover)");
console.log("Ajustar juros da parcela 2: R$ 625.978,15 -> R$ 630.787,74");
console.log(jurosP1.length ? "Juros da parcela 1: já incluídos" : "Incluir juros da parcela 1: R$ 528.169,32, baixado em 20/09/2024 na mesma conta da amortização");
console.log(dataP3 ? `Parcela 3: registrar pagamento em ${dataP3}` : "Parcela 3: sem alteração (faltam data e conta)");
if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }

const arquivo = `backup/flavio_contrato_c30523740_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify(titulos, null, 1));
if (remover.length) {
  const { error: eDel } = await s.from("lancamentos").delete().in("id", remover.map(t => t.id));
  if (eDel) throw eDel;
}
const { error: eUp } = await s.from("lancamentos").update({ valor: 630787.74, valor_pago: 630787.74 }).eq("id", jurosP2[0].id);
if (eUp) throw eUp;
if (!jurosP1.length) {
  const b = amortP1[0];
  const { error: eIns } = await s.from("lancamentos").insert({
    fazenda_id: b.fazenda_id, contrato_financeiro_id: b.contrato_financeiro_id, tipo: "pagar", natureza: b.natureza, moeda: b.moeda,
    pessoa_id: b.pessoa_id, produtor_id: b.produtor_id, ano_safra_id: b.ano_safra_id, numero_documento: b.numero_documento,
    data_lancamento: b.data_lancamento, data_vencimento: b.data_vencimento, data_baixa: b.data_baixa, conta_bancaria: b.conta_bancaria,
    status: "baixado", auto: true, origem_lancamento: b.origem_lancamento, descricao: b.descricao.replace("— Amortização", "— Juros"),
    categoria: jurosP2[0].categoria, operacao_gerencial_id: jurosP2[0].operacao_gerencial_id, valor: 528169.32, valor_pago: 528169.32,
  });
  if (eIns) throw eIns;
}
if (dataP3) {
  for (const t of p3) {
    const { error: e } = await s.from("lancamentos").update({ valor_pago: t.valor, data_baixa: dataP3, conta_bancaria: contaP3 }).eq("id", t.id);
    if (e) throw e;
  }
}
console.log(`\nFeito. Cópia de todos os títulos antes da alteração: ${arquivo}`);
