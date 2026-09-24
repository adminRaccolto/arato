# Cria o CP (lancamentos) de NFs de entrada processadas que ficaram sem financeiro,
# sem tocar no estoque. Uso: python3 vincular-cp-nf-processadas.py <ids.json> [--aplicar] [--n N]
import os,sys,json,ssl,urllib.request,datetime
ssl._create_default_https_context=ssl._create_unverified_context
U=os.environ["NEXT_PUBLIC_SUPABASE_URL"]+"/rest/v1/";K=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
def req(m,t,q="",body=None,prefer=None):
    h={"apikey":K,"Authorization":"Bearer "+K,"Content-Type":"application/json"}
    if prefer:h["Prefer"]=prefer
    r=urllib.request.Request(U+t+("?"+q if q else ""),data=json.dumps(body).encode() if body is not None else None,headers=h,method=m)
    b=urllib.request.urlopen(r).read()
    return json.loads(b) if b else None
ids=json.load(open(sys.argv[1]));aplicar="--aplicar" in sys.argv
if "--n" in sys.argv: ids=ids[:int(sys.argv[sys.argv.index("--n")+1])]
CAT={"vef":"Insumos — Sementes","custo_direto":"Serviços Agrícolas","combustivel":"Combustível","pecas":"Peças / Manutenção","insumos":"Insumos — Fertilizantes"}
nfs=req("GET","nf_entradas","id=in.(%s)&select=*"%",".join(ids))
snap=[];criados=[]
for n in nfs:
    if req("GET","lancamentos","nf_entrada_id=eq.%s&select=id"%n["id"]) or n["lancamento_id"] or n.get("emp_lancamento_id"):
        print("PULA (ja tem)",n["numero"]);continue
    dt=(n["data_entrada"] or n["data_emissao"])
    row={"fazenda_id":n["fazenda_id"],"tipo":"pagar","moeda":"BRL",
      "descricao":"NF %s — %s"%(n["numero"],n["emitente_nome"]),"categoria":CAT.get(n["tipo_entrada"],"Outros"),
      "data_lancamento":dt,"data_vencimento":n["data_vencimento_cp"] or dt,"status":"em_aberto","auto":True,
      "valor":n["valor_total"],"pessoa_id":n["pessoa_id"],"nfe_numero":n["numero"],"numero_documento":n["numero"],
      "tipo_documento_lcdpr":"NF","nf_entrada_id":n["id"],"origem_lancamento":"nf_entrada","produtor_id":n["produtor_id"],
      "ano_safra_id":n["ano_safra_id"],"ciclo_id":n["ciclo_id"],"operacao_gerencial_id":n["operacao_gerencial_id"],
      "centro_custo_id":n["centro_custo_id"],"forma_pagamento":n["forma_pagamento"],"vinculo_atividade":n["vinculo_atividade"],
      "entidade_contabil":n["entidade_contabil"]}
    row={k:v for k,v in row.items() if v is not None}
    print(("CRIA " if aplicar else "DRY  "),n["numero"],n["emitente_nome"][:24],row["valor"],row["data_vencimento"],row["categoria"])
    if aplicar:
        snap.append({"nf_id":n["id"],"lancamento_id_antes":n["lancamento_id"]})
        c=req("POST","lancamentos","",row,"return=representation")[0]
        req("PATCH","nf_entradas","id=eq.%s"%n["id"],{"lancamento_id":c["id"]})
        criados.append(c["id"])
if aplicar:
    f="backup/vincular_cp_nf_%s.json"%datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    json.dump({"snapshot_nf":snap,"lancamentos_criados":criados},open(f,"w"),indent=1);print("rollback em",f)
