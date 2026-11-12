import { numeroContaLCDPR, textoLCDPR, validarParticipantes, type ImovelLCDPR, type MovimentoLCDPR } from "./modelo";
import { cpfValido, docValido } from "../antt/validacao";

type Endereco={logradouro?:string|null;numero_end?:string|null;complemento?:string|null;bairro?:string|null;estado?:string|null;municipio_ibge?:string|null;cep?:string|null};
type Imovel=ImovelLCDPR&Endereco&{nome:string;itr?:string|null;nirf?:string|null;caepf?:string|null;lcdpr_responsavel?:boolean;arrendada?:boolean|null};
type Produtor=Endereco&{id:string;cpf:string;nome:string};
type Conta={id:string;nome:string;banco?:string|null;codigo_bacen?:string|null;agencia?:string|null;conta?:string|null;conta_dv?:string|null;tipo_conta:string;produtor_id?:string|null;cotitulares?:{cpf:string}[]|null;fazenda_id:string};
type Movimento=MovimentoLCDPR&{numDoc:string;tipoDoc:string;tipoLanc:string;cpfCnpj:string;historico:string;contaBancariaRef:string};
const dig=(s?:string|null)=>(s ?? "").replace(/\D/g,"");
const valor=(v:number)=>String(Math.round(v*100));
const data=(iso:string)=>iso.slice(8,10)+iso.slice(5,7)+iso.slice(0,4);
function validarEndereco(e:Endereco,nome:string) {
  if(!e.logradouro||!e.bairro||!e.estado||!/^\d{7}$/.test(e.municipio_ibge ?? "")||dig(e.cep).length!==8)
    throw new Error("Complete o endereço de "+nome+" no cadastro antes de gerar o TXT.");
}

/** Serialização anual do leiaute 1.3. A seleção e a apropriação por CPF ocorrem antes desta função. */
export function gerarArquivoLCDPR(p:{cpf:string;nome:string;ano:number;declarante:Endereco;imoveis:Imovel[];contas:Conta[];produtores:Produtor[];movimentos:Movimento[];
  contador:{nome:string;cpf_cnpj:string;crc:string;email:string;telefone:string};codigoBanco:(nome:string|null)=>string}):string {
  if(!cpfValido(p.cpf))throw new Error("Escolha um CPF válido para o TXT oficial. Todos é uma visão gerencial.");
  validarEndereco(p.declarante,"declarante");
  if(!p.imoveis.length)throw new Error("Nenhum imóvel cadastrado para o declarante.");
  const linhas:string[]=[];
  const L=(...campos:(string|number|undefined|null)[])=>linhas.push(campos.map(c=>textoLCDPR(String(c ?? ""))).join("|"));
  const imoveis=new Map(p.imoveis.map((f,i)=>[f.id,String(i+1).padStart(3,"0")]));
  const idsTitular=new Set(p.produtores.filter(v=>v.cpf===p.cpf).map(v=>v.id));
  const contas=p.contas.filter(c=>{
    if(["caixa","transitoria"].includes(c.tipo_conta))return false;
    if(c.cotitulares?.some(t=>dig(t.cpf)===p.cpf))return true;
    if(c.produtor_id)return idsTitular.has(c.produtor_id);
    const f=p.imoveis.find(f=>f.id===c.fazenda_id);
    return !!f&&(dig(f.cpf_cnpj_fiscal) || p.produtores.find(t=>t.id===f.produtor_id)?.cpf)===p.cpf;
  });
  const codConta=new Map(contas.map((c,i)=>[c.id,String(i+1).padStart(3,"0")]));
  L("0000","LCDPR","0013",p.cpf,p.nome.toUpperCase(),"0","0","","0101"+p.ano,"3112"+p.ano);
  L("0010","1");
  const d=p.declarante;
  L("0030",d.logradouro,d.numero_end,d.complemento,d.bairro,d.estado?.toUpperCase(),d.municipio_ibge,dig(d.cep),"","");
  for(const f of p.imoveis) {
    validarEndereco(f,f.nome);
    const erros=validarParticipantes(f);if(erros.length)throw new Error(f.nome+": "+erros.join(" "));
    const cafir=dig(f.itr || f.nirf);if(cafir.length!==8)throw new Error(f.nome+": informe o CAFIR/ITR com dígito verificador.");
    if(f.lcdpr_responsavel!==false&&dig(f.caepf).length!==14)throw new Error(f.nome+": informe o CAEPF do responsável pela exploração.");
    const cpfPrincipal=dig(f.cpf_cnpj_fiscal)||p.produtores.find(v=>v.id===f.produtor_id)?.cpf;
    const tipo=f.tipo_exploracao ?? (f.arrendada?3:1);
    const quota=cpfPrincipal===p.cpf?Number(f.participacao_lcdpr ?? 100):Number(f.lcdpr_participantes?.find(v=>dig(v.cpf)===p.cpf)?.participacao ?? 0);
    if(!Number.isFinite(quota)||quota<0||quota>100)throw new Error(f.nome+": participação inválida.");
    if(quota<=0&&p.movimentos.some(m=>m.fazendaId===f.id))throw new Error(f.nome+": cadastre a participação deste declarante na exploração do imóvel.");
    L("0040",imoveis.get(f.id),"BR","BRL",cafir,dig(f.caepf),"",f.nome.toUpperCase().slice(0,50),f.logradouro?.slice(0,150),f.numero_end,f.complemento?.slice(0,50),f.bairro?.slice(0,50),f.estado?.toUpperCase(),f.municipio_ibge,dig(f.cep),tipo,valor(quota).padStart(5,"0"));
    const terceiros=[...(f.lcdpr_participantes ?? [])].filter(v=>dig(v.cpf)!==p.cpf);
    if(cpfPrincipal&&cpfPrincipal!==p.cpf){
      const principal=p.produtores.find(v=>v.cpf===cpfPrincipal);if(!principal)throw new Error("Identifique o titular principal de "+f.nome+".");
      terceiros.push({cpf:cpfPrincipal,nome:principal.nome,tipo:({2:1,3:2,4:3,5:4,6:5} as Record<number,number>)[tipo] ?? 5,participacao:Number(f.participacao_lcdpr ?? 100)});
    }
    for(const v of terceiros){if(!docValido(v.cpf))throw new Error("Documento do terceiro inválido em "+f.nome+".");L("0045",imoveis.get(f.id),v.tipo,dig(v.cpf),v.nome.slice(0,50),valor(v.participacao).padStart(5,"0"));}
  }
  for(const c of contas){
    const banco=c.codigo_bacen||p.codigoBanco(c.banco ?? null);const agencia=dig((c.agencia ?? "").split("-")[0]);const numero=numeroContaLCDPR(c.conta,c.conta_dv);
    if(!/^\d{3}$/.test(banco)||!/^\d{1,4}$/.test(agencia)||!/^\d{1,16}$/.test(numero))throw new Error("Confira banco, agência e conta de "+c.nome+".");
    L("0050",codConta.get(c.id),"BR",banco,(c.banco ?? c.nome).slice(0,30),agencia,numero);
  }
  let saldo=0;const meses=new Map<string,{receita:number;despesa:number}>();
  for(const m of [...p.movimentos].sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id))){
    const imovel=imoveis.get(m.fazendaId);if(!imovel)throw new Error("Movimento sem imóvel do declarante: "+m.id);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(m.data)||new Date(m.data+"T12:00:00Z").toISOString().slice(0,10)!==m.data||m.data.slice(0,4)!==String(p.ano))throw new Error("Confira a data efetiva do movimento "+m.id+".");
    if(!["1","2","3","4","5","6"].includes(m.tipoDoc)||!["1","2","3"].includes(m.tipoLanc)||!docValido(m.cpfCnpj))throw new Error("Confira documento e CPF/CNPJ da contraparte no movimento "+m.id+".");
    if(!Number.isFinite(m.receita)||!Number.isFinite(m.despesa)||Math.min(m.receita,m.despesa)<0||Math.min(m.receita,m.despesa)>0||Math.max(m.receita,m.despesa)<=0)throw new Error("Valor inválido no movimento "+m.id+".");
    const conta=p.contas.find(c=>c.id===m.contaBancariaRef);
    if(m.contaBancariaRef && !conta)throw new Error("Conta bancária não localizada no movimento "+m.id+". Confira o vínculo histórico.");
    const codigo=conta?.tipo_conta==="caixa"?"000":codConta.get(m.contaBancariaRef)||"999";
    saldo+=Math.round(m.receita*100)-Math.round(m.despesa*100);
    L("Q100",data(m.data),imovel,codigo,m.numDoc,m.tipoDoc,m.historico,dig(m.cpfCnpj),m.tipoLanc,valor(m.receita),valor(m.despesa),Math.abs(saldo),saldo>=0?"P":"N");
    const mes=m.data.slice(0,7);const acc=meses.get(mes) ?? {receita:0,despesa:0};acc.receita+=Math.round(m.receita*100);acc.despesa+=Math.round(m.despesa*100);meses.set(mes,acc);
  }
  saldo=0;
  for(const [mes,v]of [...meses.entries()].sort(([a],[b])=>a.localeCompare(b))){saldo+=v.receita-v.despesa;L("Q200",mes.slice(5,7)+mes.slice(0,4),v.receita,v.despesa,Math.abs(saldo),saldo>=0?"P":"N");}
  const c=p.contador;L("9999",c.nome,dig(c.cpf_cnpj),c.crc,c.email,dig(c.telefone),linhas.length+1);
  return linhas.join("\r\n")+"\r\n";
}
