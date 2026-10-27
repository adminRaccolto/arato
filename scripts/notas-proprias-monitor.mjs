// Notas próprias (Entrada de Nota Própria) lançadas antes de 27/10/2026 não entravam no Monitor de NF-e Emitidas, e a
// remessa ligada a elas não guardava os itens (o Retorno de Insumo precisa deles para emitir a NF de retorno).
// Registra cada nota própria com chave que ainda não está no Monitor (dados do XML, arquivo para o DANFE) e preenche os
// itens da remessa vinda dela. Só insere/preenche o que falta.
//
// Uso: node scripts/notas-proprias-monitor.mjs            (plano, só leitura)
//      node scripts/notas-proprias-monitor.mjs --aplicar
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = (src, t) => src.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
const bloco = (src, t) => src.match(new RegExp(`<${t}[ >][\\s\\S]*?</${t}>`))?.[0] ?? "";

const { data: notas, error } = await db.from("notas_proprias_externas").select("*").neq("status", "cancelada");
if (error) throw error;
for (const n of notas) {
  const chave = (n.chave_acesso ?? "").replace(/\D/g, "");
  const xml = n.xml_content ?? "";
  const dets = xml.match(/<det [\s\S]*?<\/det>/g) ?? [];
  const itens = dets.map(d => { const p = bloco(d, "prod"); return { descricao: tag(p, "xProd"), ncm: tag(p, "NCM"), cfop: tag(p, "CFOP"), unidade: tag(p, "uCom") || "UN",
    quantidade: Number(tag(p, "qCom") || 0), valor_unitario: Number(tag(p, "vUnCom") || 0), valor_total: Number(tag(p, "vProd") || 0) }; });

  // 1. Monitor
  if (chave.length === 44) {
    const { data: ja } = await db.from("notas_fiscais").select("id").eq("chave_acesso", chave).limit(1);
    if (ja?.length) console.log(`NF ${n.numero}: já no Monitor`);
    else {
      const emit = bloco(xml, "emit"), ender = bloco(emit, "enderEmit"), dest = bloco(xml, "dest"), enderDest = bloco(dest, "enderDest");
      const cfop = itens[0]?.cfop ?? "";
      console.log(`NF ${n.numero}/${n.serie ?? ""} → Monitor (${n.natureza ?? ""}, ${itens.length} item(ns), XML ${xml ? "sim" : "não"})`);
      if (aplicar) {
        let xmlUrl = null;
        if (xml) {
          const path = `${n.fazenda_id}/nfe_emitidas/${chave}.xml`;
          const up = await db.storage.from("arquivos").upload(path, new Blob([xml], { type: "application/xml" }), { upsert: true });
          if (!up.error) xmlUrl = db.storage.from("arquivos").getPublicUrl(path).data.publicUrl;
        }
        const { error: e } = await db.from("notas_fiscais").insert({
          fazenda_id: n.fazenda_id, numero: n.numero, serie: n.serie || "1", tipo: tag(bloco(xml, "ide"), "tpNF") === "0" ? "entrada" : "saida",
          cfop: cfop.length === 4 ? `${cfop[0]}.${cfop.slice(1)}` : cfop, natureza: n.natureza || "—",
          destinatario: n.nome_destinatario || tag(dest, "xNome") || "—", cnpj_destinatario: (n.cnpj_destinatario || tag(dest, "CNPJ") || tag(dest, "CPF") || "").replace(/\D/g, "") || null,
          valor_total: n.valor_total ?? 0, data_emissao: n.data_emissao, status: "autorizada", chave_acesso: chave, xml_url: xmlUrl, auto: false, tipo_emissao: 1,
          observacao: "Emitida fora do Arato (Entrada de Nota Própria)",
          itens_json: itens.map(i => ({ item: i.descricao, ncm: i.ncm, cfop: i.cfop, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total })),
          dados_nf_json: {
            emit_razao: tag(emit, "xNome"), emit_cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"), emit_ie: tag(emit, "IE"), emit_endereco: tag(ender, "xLgr"),
            emit_numero: tag(ender, "nro"), emit_bairro: tag(ender, "xBairro"), emit_municipio: tag(ender, "xMun"), emit_uf: tag(ender, "UF"), emit_cep: tag(ender, "CEP"),
            dest_ie: tag(dest, "IE") || undefined, dest_uf: tag(enderDest, "UF") || undefined, dest_cidade: tag(enderDest, "xMun") || undefined,
            dest_endereco: tag(enderDest, "xLgr") || undefined, dest_numero: tag(enderDest, "nro") || undefined,
            protocolo_autorizacao: tag(xml, "nProt") || undefined, origem_externa: true, nota_propria_id: n.id,
          },
        });
        console.log(e ? `   ERRO: ${e.message}` : "   registrada");
      }
    }
  }
  // 2. Itens da remessa ligada a esta nota própria
  const { data: rems } = await db.from("nf_remessas_logisticas").select("id, itens_json, nf_remessa_numero").ilike("observacao", `%${n.id}%`);
  for (const r of rems ?? []) {
    if (Array.isArray(r.itens_json) && r.itens_json.length) continue;
    let its = itens.map(i => ({ descricao_produto: i.descricao, ncm: i.ncm, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total }));
    if (!its.length) {
      const { data: ni } = await db.from("notas_proprias_externas_itens").select("descricao_produto, unidade, quantidade, valor_unitario, valor_total").eq("nota_id", n.id);
      its = (ni ?? []).map(i => ({ ...i, ncm: undefined }));
    }
    console.log(`   remessa NF ${r.nf_remessa_numero}: ${its.length} item(ns) a gravar`);
    if (aplicar && its.length) {
      const { error: e } = await db.from("nf_remessas_logisticas").update({ itens_json: its }).eq("id", r.id);
      console.log(e ? `   ERRO: ${e.message}` : "   itens gravados");
    }
  }
}
console.log(aplicar ? "\nAplicado." : "\nPlano (nada gravado).");
