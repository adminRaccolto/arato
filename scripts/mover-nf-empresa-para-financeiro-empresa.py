# Move NFs de entrada destinadas a CNPJ de EMPRESA que caíram no CP do produtor (lancamentos) para o
# financeiro da Empresa (empresa_lancamentos). Uso: python3 ... <ids.json> [--aplicar]
import os,sys,json,ssl,urllib.request,datetime,collections
ssl._create_default_https_context=ssl._create_unverified_context
U=os.environ["NEXT_PUBLIC_SUPABASE_URL"]+"/rest/v1/";K=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
def rq(m,t,q="",body=None,prefer="return=representation"):
    r=urllib.request.Request(U+t+("?"+q if q else ""),data=json.dumps(body).encode() if body is not None else None,method=m,headers={"apikey":K,"Authorization":"Bearer "+K,"Content-Type":"application/json","Prefer":prefer})
    b=urllib.request.urlopen(r).read();return json.loads(b) if b else None
dig=lambda x:"".join(c for c in str(x or "") if c.isdigit())
CAT={"combustivel":"Combustível e Lubrificantes","pecas":"Manutenção de Veículos","custo_direto":"Serviços de Terceiros"}
ids=json.load(open(sys.argv[1]));aplicar="--aplicar" in sys.argv
contas={f["id"]:f["conta_id"] for f in rq("GET","fazendas","select=id,conta_id")}
emp=rq("GET","empresas","select=id,fazenda_id,cpf_cnpj")
snap=[];mov=[];pula=[]
for i in range(0,len(ids),30):
    ch=",".join(ids[i:i+30])
    nfs=rq("GET","nf_entradas","id=in.(%s)&select=*"%ch)
    lan=rq("GET","lancamentos","nf_entrada_id=in.(%s)&select=*"%ch)
    porNf=collections.defaultdict(list)
    for l in lan: porNf[l["nf_entrada_id"]].append(l)
    for n in nfs:
        c=contas[n["fazenda_id"]]
        cand=[e for e in emp if contas[e["fazenda_id"]]==c and dig(e["cpf_cnpj"])==dig(n["cnpj_destino"])]
        e=next((x for x in cand if x["fazenda_id"]==n["fazenda_id"]),cand[0] if cand else None)
        ls=porNf.get(n["id"],[])
        if not e or not ls: pula.append((n["numero"],"sem empresa/lancamento"));continue
        if any(l["status"] not in ("em_aberto","vencido","vencendo","previsto") or l.get("conciliado") or l.get("lote_id") for l in ls):
            pula.append((n["numero"],"já baixado/conciliado/em lote: "+",".join(sorted({l["status"] for l in ls}))));continue
        mov.append((n,e,ls))
print("a mover:",len(mov),"| pulados:",pula)
if not aplicar: sys.exit()
f="backup/mover_nf_empresa_%s.json"%datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
json.dump({"nfs":[n for n,_,_ in mov],"lancamentos":[l for _,_,ls in mov for l in ls]},open(f,"w"),indent=1,default=str);print("snapshot",f)
novos=[]
for n,e,ls in mov:
    rows=[{"fazenda_id":e["fazenda_id"],"empresa_id":e["id"],"tipo":"pagar","moeda":"BRL",
      "descricao":(l["descricao"] or "NF %s — %s"%(n["numero"],n["emitente_nome"]))[:200],"categoria":CAT.get(n["tipo_entrada"],"Outros"),
      "competencia":str(l["data_vencimento"] or n["data_emissao"])[:7],"status":"pendente","data_vencimento":l["data_vencimento"],"valor":l["valor"],
      "pessoa_id":l.get("pessoa_id"),"numero_documento":l.get("numero_documento") or n["numero"],"forma_pagamento":l.get("forma_pagamento"),
      "origem":"nf_entrada","nf_entrada_id":n["id"],"observacao":"Movido do CP do produtor em 25/09/2026 (NF destinada a CNPJ de empresa)"} for l in ls]
    rows=[{k:v for k,v in r.items() if v is not None} for r in rows]
    ins=rq("POST","empresa_lancamentos","",rows)
    novos+= [x["id"] for x in ins]
    for l in ls: rq("PATCH","lancamentos","id=eq.%s"%l["id"],{"status":"cancelado"})
    rq("PATCH","nf_entradas","id=eq.%s"%n["id"],{"emp_lancamento_id":ins[0]["id"],"lancamento_id":None})
json.dump({"empresa_lancamentos_criados":novos},open(f.replace(".json","_criados.json"),"w"))
print("movidas:",len(mov),"| lançamentos de empresa criados:",len(novos))
