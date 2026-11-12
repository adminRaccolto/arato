/** Os valores exibidos e persistidos vêm dos mesmos totais serializados no XML. */
export function totaisDoXmlNFe(xml:string) {
  const grupo=(nome:string)=>xml.match(new RegExp("<"+nome+">([\\s\\S]*?)</"+nome+">"))?.[1] ?? "";
  const valor=(trecho:string,tag:string)=>Number(trecho.match(new RegExp("<"+tag+">([^<]+)"))?.[1] ?? 0);
  const icms=grupo("ICMSTot");const rtc=grupo("IBSCBSTot");
  return {valor_total:valor(icms,"vNF"),icms_base:valor(icms,"vBC"),icms_valor:valor(icms,"vICMS"),pis_valor:valor(icms,"vPIS"),cofins_valor:valor(icms,"vCOFINS"),ibs_valor:valor(rtc,"vIBS"),cbs_valor:valor(rtc,"vCBS")};
}
