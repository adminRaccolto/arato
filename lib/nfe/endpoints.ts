// Catálogo oficial: https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos (conferido em 11/11/2026).
export interface UFEndpoints {autorizacao:string;retAutorizacao:string;statusServico:string;recepcaoEvento:string;consulta:string}
type Servico=keyof UFEndpoints;
const nomes:Record<Servico,string>={autorizacao:"NFeAutorizacao4",retAutorizacao:"NFeRetAutorizacao4",statusServico:"NfeStatusServico4",recepcaoEvento:"NFeRecepcaoEvento4",consulta:"NFeConsultaProtocolo4"};
function montar(raiz:string,tipo:string):UFEndpoints {
 const url=(servico:Servico)=>{
  let nome=nomes[servico];
  if(tipo==="rs"){
   const paths:Record<Servico,string>={autorizacao:"NfeAutorizacao/NFeAutorizacao4.asmx",retAutorizacao:"NfeRetAutorizacao/NFeRetAutorizacao4.asmx",statusServico:"NfeStatusServico/NfeStatusServico4.asmx",recepcaoEvento:"recepcaoevento/recepcaoevento4.asmx",consulta:"NfeConsulta/NfeConsulta4.asmx"};return "https://"+raiz+paths[servico];
  }
  if(tipo==="sp"){const path=servico==="consulta"?"nfeconsultaprotocolo4":nome.toLowerCase();return "https://"+raiz+path+".asmx";}
  if(tipo==="mt"||tipo==="am"){
   nome=servico==="consulta"?"NfeConsulta4":servico==="recepcaoEvento"?"RecepcaoEvento4":nome.replace(/^NFe/,"Nfe");
  }
  return "https://"+raiz+(tipo==="asmx"?nome+"/"+nome+".asmx":nome);
 };
 return Object.fromEntries((Object.keys(nomes) as Servico[]).map(k=>[k,url(k)])) as unknown as UFEndpoints;
}
const catalogo:Record<string,{prod:UFEndpoints;hom:UFEndpoints}>={
 AM:{prod:montar("nfe.sefaz.am.gov.br/services2/services/","am"),hom:montar("homnfe.sefaz.am.gov.br/services2/services/","am")},
 BA:{prod:montar("nfe.sefaz.ba.gov.br/webservices/","asmx"),hom:montar("hnfe.sefaz.ba.gov.br/webservices/","asmx")},
 GO:{prod:montar("nfe.sefaz.go.gov.br/nfe/services/","axis"),hom:montar("homolog.sefaz.go.gov.br/nfe/services/","axis")},
 MG:{prod:montar("nfe.fazenda.mg.gov.br/nfe2/services/","axis"),hom:montar("hnfe.fazenda.mg.gov.br/nfe2/services/","axis")},
 MS:{prod:montar("nfe.sefaz.ms.gov.br/ws/","axis"),hom:montar("hom.nfe.sefaz.ms.gov.br/ws/","axis")},
 MT:{prod:montar("nfe.sefaz.mt.gov.br/nfews/v2/services/","mt"),hom:montar("homologacao.sefaz.mt.gov.br/nfews/v2/services/","mt")},
 PE:{prod:montar("nfe.sefaz.pe.gov.br/nfe-service/services/","axis"),hom:montar("nfehomolog.sefaz.pe.gov.br/nfe-service/services/","axis")},
 PR:{prod:montar("nfe.sefa.pr.gov.br/nfe/","axis"),hom:montar("homologacao.nfe.sefa.pr.gov.br/nfe/","axis")},
 RS:{prod:montar("nfe.sefazrs.rs.gov.br/ws/","rs"),hom:montar("nfe-homologacao.sefazrs.rs.gov.br/ws/","rs")},
 SP:{prod:montar("nfe.fazenda.sp.gov.br/ws/","sp"),hom:montar("homologacao.nfe.fazenda.sp.gov.br/ws/","sp")},
 MA:{prod:montar("www.sefazvirtual.fazenda.gov.br/","asmx"),hom:montar("hom.sefazvirtual.fazenda.gov.br/","asmx")},
};
const svrs={prod:montar("nfe.svrs.rs.gov.br/ws/","rs"),hom:montar("nfe-homologacao.svrs.rs.gov.br/ws/","rs")};
const ufs=new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
export function endpoints(uf:string,ambiente:"producao"|"homologacao"):UFEndpoints {
 if(!ufs.has(uf))throw new Error("UF do autorizador NF-e inválida.");
 const linha=catalogo[uf] ?? svrs;return ambiente==="producao"?linha.prod:linha.hom;
}
export const ufPorCodigo:Record<string,string>={"12":"AC","27":"AL","13":"AM","16":"AP","29":"BA","23":"CE","53":"DF","32":"ES","52":"GO","21":"MA","31":"MG","50":"MS","51":"MT","15":"PA","25":"PB","26":"PE","22":"PI","41":"PR","33":"RJ","24":"RN","11":"RO","14":"RR","43":"RS","42":"SC","28":"SE","35":"SP","17":"TO"};
