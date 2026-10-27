// NF-e de transferência de máquina emitidas antes de 27/10/2026 não entravam no Monitor de NF-e Emitidas (notas_fiscais):
// sem DANFE para imprimir e sem cancelar/corrigir pelo Monitor. Registra cada uma a partir do XML autorizado salvo no
// Storage (arquivos/<fazenda>/nfe_emitidas/<chave>.xml). Só insere o que falta; não mexe na NF nem na transferência.
//
// Uso: node scripts/nfe-transferencia-maquina-monitor.mjs            (plano, só leitura)
//      node scripts/nfe-transferencia-maquina-monitor.mjs --aplicar
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = (xml, t) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
const bloco = (xml, t) => xml.match(new RegExp(`<${t}[ >][\\s\\S]*?</${t}>`))?.[0] ?? "";

const { data: trs, error } = await db.from("transferencias_maquinas").select("*").or("nf_saida_chave.not.is.null,nf_retorno_chave.not.is.null");
if (error) throw error;
for (const t of trs) {
  for (const [chave, campo] of [[t.nf_saida_chave, "saida"], [t.nf_retorno_chave, "retorno"]]) {
    if (!chave) continue;
    const { data: ja } = await db.from("notas_fiscais").select("id").eq("chave_acesso", chave).maybeSingle();
    if (ja) { console.log(`${chave}: já no Monitor`); continue; }
    const { data: faz } = await db.from("fazendas").select("conta_id").eq("id", t.fazenda_id).single();
    const { data: fazs } = await db.from("fazendas").select("id").eq("conta_id", faz.conta_id);
    let xml = null, fazXml = null;
    for (const f of fazs) {
      const { data: b } = await db.storage.from("arquivos").download(`${f.id}/nfe_emitidas/${chave}.xml`);
      if (b) { xml = await b.text(); fazXml = f.id; break; }
    }
    if (!xml) { console.log(`${chave}: XML não encontrado — pular`); continue; }
    // Comodato recebido (entrada) não é NF nossa na etapa 1
    if (campo === "saida" && t.direcao === "entrada") { console.log(`${chave}: NF do terceiro — pular`); continue; }
    const emit = bloco(xml, "emit"), ender = bloco(emit, "enderEmit"), dest = bloco(xml, "dest"), prod = bloco(xml, "prod"), ide = bloco(xml, "ide");
    const cfop = tag(prod, "CFOP");
    const { data: pub } = db.storage.from("arquivos").getPublicUrl(`${fazXml}/nfe_emitidas/${chave}.xml`);
    const row = {
      fazenda_id: fazXml, numero: tag(ide, "nNF"), serie: tag(ide, "serie"), tipo: tag(ide, "tpNF") === "0" ? "entrada" : "saida",
      cfop: cfop.length === 4 ? `${cfop[0]}.${cfop.slice(1)}` : cfop, natureza: tag(ide, "natOp"),
      destinatario: tag(dest, "xNome"), cnpj_destinatario: tag(dest, "CNPJ") || tag(dest, "CPF") || null,
      valor_total: Number(tag(xml, "vNF")), data_emissao: tag(ide, "dhEmi").slice(0, 10), status: "autorizada",
      chave_acesso: chave, xml_url: pub.publicUrl, auto: false, tipo_emissao: 1, observacao: tag(xml, "infCpl") || null,
      itens_json: [{ item: tag(prod, "xProd"), ncm: tag(prod, "NCM"), cfop, unidade: tag(prod, "uCom"), quantidade: Number(tag(prod, "qCom")), valor_unitario: Number(tag(prod, "vUnCom")), valor_total: Number(tag(prod, "vProd")) }],
      dados_nf_json: {
        protocolo_autorizacao: tag(xml, "nProt") || undefined,
        emit_razao: tag(emit, "xNome"), emit_cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"), emit_ie: tag(emit, "IE"),
        emit_endereco: tag(ender, "xLgr"), emit_numero: tag(ender, "nro"), emit_bairro: tag(ender, "xBairro"), emit_municipio: tag(ender, "xMun"),
        emit_uf: tag(ender, "UF"), emit_cep: tag(ender, "CEP"), emit_fone: tag(ender, "fone") || undefined,
        dest_ie: tag(dest, "IE") || undefined, dest_uf: tag(dest, "UF") || undefined, dest_cidade: tag(dest, "xMun") || undefined,
        dest_endereco: tag(dest, "xLgr") || undefined, dest_numero: tag(dest, "nro") || undefined,
      },
    };
    console.log(`${chave}: NF ${row.numero} ${row.natureza} → ${row.destinatario} R$ ${row.valor_total} (IE dest: ${row.dados_nf_json.dest_ie ?? "sem"})`);
    if (aplicar) {
      const { error: e } = await db.from("notas_fiscais").insert(row);
      console.log(e ? `  ERRO: ${e.message}` : "  registrada no Monitor");
    }
  }
}
